/**
 * AttMapLoader.js — Parser de arquivos .att (terrain attribute) do MU Online
 *
 * Formatos suportados (verificados contra o cliente real, asset server :9100):
 *
 *  A) Padrão clássico com header:
 *       u32 version/flags, u32 width, u32 height, depois width*height bytes (1/cell)
 *     ou apenas u32 header + width*height bytes (grid quadrado derivado do tamanho).
 *  B) MuPromax "Terrain{N}.att": 3 bytes de junk + 256*256 bytes XOR3 (FC CF AB).
 *  C) Raw: exatamente width*height bytes sem header (ex.: 256x256 = 65536).
 *
 * Bitmask por cell (Main 5.2 _define.h authority):
 *   0x01 TW_SAFEZONE  — safezone
 *   0x02 TW_CHARACTER — occupied/character terrain bit
 *   0x04 TW_NOMOVE    — blocked movement
 *   0x08 TW_NOGROUND  — no terrain surface
 *   0x10 TW_WATER     — water
 *   0x20 TW_ACTION    — action/trigger
 *   0x40 TW_HEIGHT    — authored height behavior
 *   0x80 TW_CAMERA_UP — camera raise/indoor contract
 *
 * Grid do MU: 256x256 células; cada célula = 100 unidades do mundo no cliente
 * original (TERRAIN_SCALE = 100). No web-port o tileSize vem do PathGrid.
 */

import * as THREE from 'three';
import { PathGrid } from './Pathfinding.js';

// Main 5.2 _define.h exact terrain bits.  Keep SAFEZONE as first-class
// authority; NOATTACKZONE remains an alias only for older Web callers.
export const ATT_FLAG = Object.freeze({
    SAFEZONE:      0x01,
    NOATTACKZONE:  0x01,
    CHARACTER:     0x02,
    NOMOVE:        0x04,
    NOGROUND:      0x08,
    WATER:         0x10,
    ACTION:        0x20,
    HEIGHT:        0x40,
    CAMERA_UP:     0x80,
});

const XOR3_KEY = [0xFC, 0xCF, 0xAB];
const MU_CELL_SIZE = 100;    // unidades do mundo por célula no cliente original
const MU_GRID = 256;

const BASE_URL = () =>
    (typeof window !== 'undefined' && window.__MU_ASSET_BASE__) || 'http://localhost:9100/';

/** XOR3 in-place em um Uint8Array */
function xor3(bytes, offset = 0, length = -1) {
    const len = (length < 0 ? bytes.length : offset + length);
    const out = new Uint8Array(len - offset);
    for (let i = offset; i < len; i++) out[i - offset] = bytes[i] ^ XOR3_KEY[(i - offset) % 3];
    return out;
}

/**
 * Valida se um buffer de células parece um .att plausível:
 * valores devem ser bitmask (predominantemente < 0x100, sem distribuição uniforme
 * de alta entropia). Retorna score (maior = melhor) ou -1 se inválido.
 */
function scoreCells(cells) {
    if (!cells || cells.length === 0) return -1;
    const freq = new Map();
    let walkable = 0;
    for (let i = 0; i < cells.length; i++) {
        const v = cells[i];
        freq.set(v, (freq.get(v) || 0) + 1);
    }
    // Attribute real tem poucos valores distintos (MU usa combinações de 8 bits,
    // mas na prática 2-12 combinações dominam). Dados encriptados → 256 valores.
    if (freq.size > 64) return -1;
    // A maioria das células deve ser 0 (caminhável) nos mapas reais de MU
    const zeros = freq.get(0) || 0;
    if (zeros < cells.length * 0.2) return -1;
    walkable = zeros;
    let score = 0;
    score += freq.size <= 16 ? 50 : 20;
    score += Math.min(100, (zeros / cells.length) * 200);
    return score;
}

/**
 * Tenta interpretar `bytes` como .att. Retorna {width,height,cells,format} ou null.
 */
export function parseAtt(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const candidates = [];

    // --- A1) header u32 + w u32 + h u32 + data ---
    if (u8.length >= 12) {
        const w = view.getUint32(4, true);
        const h = view.getUint32(8, true);
        if (w > 0 && h > 0 && w <= 1024 && h <= 1024 && u8.length === 12 + w * h) {
            candidates.push({ width: w, height: h, cells: u8.slice(12), format: 'header12-plain' });
            candidates.push({ width: w, height: h, cells: xor3(u8, 12), format: 'header12-xor3' });
        }
    }
    // --- A2) header u32 + w*h plain ---
    if (u8.length >= 4) {
        const n = u8.length - 4;
        const side = Math.sqrt(n);
        if (Number.isInteger(side) && side >= 16 && side <= 1024) {
            candidates.push({ width: side, height: side, cells: u8.slice(4), format: 'header4-plain' });
            candidates.push({ width: side, height: side, cells: xor3(u8, 4), format: 'header4-xor3' });
        }
    }
    // --- B) MuPromax: 3 bytes junk + 256*256 (plain OU XOR3) ---
    if (u8.length === 3 + MU_GRID * MU_GRID) {
        candidates.push({ width: MU_GRID, height: MU_GRID, cells: u8.slice(3), format: 'mupromax-3j-plain' });
        candidates.push({ width: MU_GRID, height: MU_GRID, cells: xor3(u8, 3), format: 'mupromax-3j-xor3' });
    }
    // --- C) raw sem header ---
    {
        const side = Math.sqrt(u8.length);
        if (Number.isInteger(side) && side >= 16 && side <= 1024) {
            candidates.push({ width: side, height: side, cells: u8.slice(), format: 'raw-plain' });
            candidates.push({ width: side, height: side, cells: xor3(u8, 0), format: 'raw-xor3' });
        }
    }

    let best = null, bestScore = 0;
    for (const c of candidates) {
        const s = scoreCells(c.cells);
        if (s > bestScore) { best = c; bestScore = s; }
    }
    return best;
}

/**
 * Missing/corrupt ATT must never fabricate traversable world geometry.
 * Main 5.2 movement authority comes from the real Terrain*.att bytes; an
 * all-walkable substitute lets click-to-move cross walls, bridge voids and
 * other NOMOVE/NOGROUND cells. Keep the world evidence-gated instead: the
 * conservative grid is fully blocked until an authoritative ATT is loaded.
 */
function unavailableAtt(size = MU_GRID) {
    const cells = new Uint8Array(size * size);
    cells.fill(ATT_FLAG.NOMOVE | ATT_FLAG.NOGROUND);
    return {
        width: size,
        height: size,
        cells,
        format: 'unavailable-authority-blocked',
        fallback: true,
        authorityMissing: true
    };
}

/**
 * Baixa e parseia o .att de um mundo.
 * @param {number} mapNumber - índice do mundo (1 = World1, etc)
 * @param {object} [opts]
 * @param {string} [opts.baseUrl] - base do asset server (default http://localhost:9100/)
 * @param {boolean} [opts.asPathGrid] - se true retorna {att, pathGrid}
 * @returns {Promise<{width,height,cells,format,pathGrid,zones}>}
 */
export async function loadAttMap(mapNumber, opts = {}) {
    const base = (opts.baseUrl || BASE_URL()).replace(/\/?$/, '/');
    const n = mapNumber;
    const paths = [
        `World${n}/Terrain${n}.att`,      // texto com XOR3 (MuPromax)
        `World${n}/EncTerrain${n}.att`,   // variante "Enc"
        `World${n}/terrain${n}.att`       // case alternativo
    ];

    let att = null;
    for (const p of paths) {
        try {
            const r = await fetch(base + p);
            if (!r.ok) continue;
            const buf = new Uint8Array(await r.arrayBuffer());
            att = parseAtt(buf);
            if (att) {
                att.source = p;
                break;
            }
        } catch (e) {
            // tenta próximo
        }
    }

    if (!att) {
        console.error(`AttMapLoader: nenhum .att autoritativo reconhecido para World${n} — movimento bloqueado até carregar Terrain*.att real`);
        att = unavailableAtt();
    }

    att.grid = attToPathGrid(att);
    att.zones = detectZones(att);
    return att;
}

/**
 * Converte um att em PathGrid (0 = livre, 1 = bloqueado).
 * Bloqueia NOMOVE, NOGROUND e (opcionalmente) WATER.
 */
export function attToPathGrid(att, { blockWater = true } = {}) {
    const grid = new PathGrid(att.width, att.height, MU_CELL_SIZE);
    const block = ATT_FLAG.NOMOVE | ATT_FLAG.NOGROUND | (blockWater ? ATT_FLAG.WATER : 0);
    for (let y = 0; y < att.height; y++) {
        for (let x = 0; x < att.width; x++) {
            const v = att.cells[y * att.width + x];
            if (v & block) grid.setBlocked(x, y, true);
        }
    }
    return grid;
}

/**
 * Detecta zonas retangulares de células com flag (ex.: safezone TW_NOATTACKZONE).
 * Retorna lista de {flag, minX, minY, maxX, maxY} por bounding box de grupos
 * conectados (flood fill 4-dir, só para contagens moderadas).
 */
export function detectZones(att, flags = ATT_FLAG.SAFEZONE) {
    const { width, height, cells } = att;
    const visited = new Uint8Array(width * height);
    const zones = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            if (visited[i] || !(cells[i] & flags)) continue;
            // BFS
            let minX = x, maxX = x, minY = y, maxY = y, count = 0;
            const stack = [[x, y]];
            visited[i] = 1;
            while (stack.length) {
                const [cx, cy] = stack.pop();
                minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
                minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
                count++;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nx = cx + dx, ny = cy + dy;
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                    const ni = ny * width + nx;
                    if (!visited[ni] && (cells[ni] & flags)) {
                        visited[ni] = 1;
                        stack.push([nx, ny]);
                    }
                }
            }
            zones.push({ flag: flags, minX, minY, maxX, maxY, cellCount: count,
                         center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } });
        }
    }
    return zones;
}

/**
 * Altura em um ponto do mundo.
 * Arquivos .att não carregam heightmap (no MU a altura vem de TerrainHeight.ozb);
 * se `att.heights` (Float32Array width*height) foi preenchido por outro loader,
 * faz interpolação bilinear; senão retorna 0.
 *
 * @param att   objeto retornado por loadAttMap
 * @param x,z   posição do mundo (célula = world / MU_CELL_SIZE por padrão)
 * @param cellSize  opcional (default 100)
 */
export function getHeightAt(att, x, z, cellSize = MU_CELL_SIZE) {
    if (!att || !att.heights) return 0;
    const fx = x / cellSize, fz = z / cellSize;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    const tx = fx - x0, tz = fz - z0;
    const w = att.width, h = att.height, H = att.heights;
    const c = (ix, iz) =>
        (ix < 0 || iz < 0 || ix >= w || iz >= h) ? 0 : H[iz * w + ix];
    const h00 = c(x0, z0), h10 = c(x0 + 1, z0), h01 = c(x0, z0 + 1), h11 = c(x0 + 1, z0 + 1);
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
}

/**
 * Aplica um mapa real ao mundo em runtime.
 *
 * - Baixa e parseia o .att de World{mapNumber}
 * - Instala pathGrid e zonas no mapManager (mapManager.pathGrid, .realAtt, .realZones)
 * - Posições de spawn existentes são "snapadas" para células caminháveis;
 *   se o mapa não tiver spawn points, gera a partir das células livres fora de safezone
 * - Spawna monstros via monsterMgr (respawn automático já é feito pelo
 *   MonsterManager.updateAll → monster.respawn, então o respawn fica pre-seeded
 *   pelos spawn points calculados aqui)
 *
 * @param {number} mapNumber  índice do mundo (1 = World1 ...)
 * @param {import('./MapManager.js').MapManager} mapManager
 * @param {import('../game/MonsterManager.js').MonsterManager} monsterMgr
 * @returns att aplicado (com .grid e .zones)
 */
export async function applyRealMap(mapNumber, mapManager, monsterMgr) {
    const att = await loadAttMap(mapNumber);
    const grid = att.grid;
    const mapData = mapManager.currentMap;

    // 1) Aplica ao manager
    mapManager.realAtt = att;
    mapManager.pathGrid = grid;
    mapManager.realZones = att.zones;

    // Origem do grid no mundo: centrado no mapa atual
    const originX = (mapData ? mapData.center.x : 0) - (att.width * MU_CELL_SIZE) / 2;
    const originZ = (mapData ? mapData.center.z : 0) - (att.height * MU_CELL_SIZE) / 2;
    mapManager.realGridOrigin = { x: originX, z: originZ };

    console.log(`applyRealMap: World${mapNumber} ${att.width}x${att.height} ` +
        `format=${att.format}${att.fallback ? ' (FALLBACK)' : ''}, ` +
        `zones=${att.zones.length}`);

    // 2) Snap dos spawn points existentes para células caminháveis
    const worldOf = (tx, tz) => ({
        x: originX + (tx + 0.5) * MU_CELL_SIZE,
        z: originZ + (tz + 0.5) * MU_CELL_SIZE
    });
    const tileOf = (wx, wz) => ({
        x: Math.floor((wx - originX) / MU_CELL_SIZE),
        y: Math.floor((wz - originZ) / MU_CELL_SIZE)
    });

    const nearestWalkable = (tx, tz, maxR = 30) => {
        if (grid.isValid(tx, tz) && !grid.isBlocked(tx, tz)) return { x: tx, y: tz };
        for (let r = 1; r <= maxR; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                    const nx = tx + dx, ny = tz + dy;
                    if (grid.isValid(nx, ny) && !grid.isBlocked(nx, ny)) return { x: nx, y: ny };
                }
            }
        }
        return null;
    };

    const inSafezoneCell = (tx, tz) =>
        (att.cells[tz * att.width + tx] & ATT_FLAG.SAFEZONE) !== 0;

    if (mapManager.spawnPoints && mapManager.spawnPoints.length) {
        for (const sp of mapManager.spawnPoints) {
            const t = tileOf(sp.x, sp.z);
            const w = nearestWalkable(t.x, t.y);
            if (w) {
                const p = worldOf(w.x, w.y);
                sp.x = p.x; sp.z = p.z;
                sp.realMap = mapNumber;
            }
        }
    } else {
        // Gera spawn points: amostra células livres fora de safezone
        const free = [];
        for (let y = 0; y < att.height; y++) {
            for (let x = 0; x < att.width; x++) {
                const v = att.cells[y * att.width + x];
                if ((v & (ATT_FLAG.NOMOVE | ATT_FLAG.NOGROUND | ATT_FLAG.WATER |
                          ATT_FLAG.SAFEZONE)) === 0) free.push([x, y]);
            }
        }
        const target = Math.min(64, free.length);
        for (let i = 0; i < target; i++) {
            const [tx, tz] = free[Math.floor(Math.random() * free.length)];
            const p = worldOf(tx, tz);
            mapManager.spawnPoints.push({ x: p.x, z: p.z, typeId: null, realMap: mapNumber });
        }
        // Atribui tipos ciclicamente se o mapa define monstros
        const types = mapData && mapData.monsters ? mapData.monsters : [];
        types.forEach((typeId, i) => {
            for (let j = i; j < mapManager.spawnPoints.length; j += types.length) {
                mapManager.spawnPoints[j].typeId = typeId;
            }
        });
    }

    // 3) Spawna monstros nos pontos (se houver manager)
    if (monsterMgr && typeof monsterMgr.spawn === 'function') {
        for (const sp of mapManager.spawnPoints) {
            if (sp.typeId == null) continue;
            const pos = new THREE.Vector3(
                sp.x, getHeightAt(att, sp.x - originX, sp.z - originZ), sp.z);
            const m = monsterMgr.spawn(sp.typeId, pos);
            if (m) {
                // Pre-seed do respawn: quando morrer, volta ao spawn point real
                m.homeSpawn = sp;
                const oldRespawn = m.respawn ? m.respawn.bind(m) : null;
                if (oldRespawn) {
                    m.respawn = () => {
                        oldRespawn();
                        if (m.mesh) m.mesh.position.set(sp.x, m.mesh.position.y, sp.z);
                    };
                }
            }
        }
    }

    return att;
}

export default { loadAttMap, parseAtt, attToPathGrid, detectZones, getHeightAt, applyRealMap, ATT_FLAG };
