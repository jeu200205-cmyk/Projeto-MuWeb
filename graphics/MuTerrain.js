/**
 * MuTerrain.js — Terreno REAL do cliente MU (Main 5.2) para WebGL.
 *
 * Porte fiel de:
 *   ZzzLodTerrain.cpp:333-380 (OpenTerrainMapping):
 *     MapFileDecrypt(arquivo INTEIRO) → Version(1) + MapNumber(1) +
 *     Layer1[256×256] + Layer2[256×256] + Alpha[256×256] (= 196610 bytes)
 *   ZzzLodTerrain.cpp:655+ (OpenTerrainHeight):
 *     TerrainHeight.OZB: fseek(4) + header BMP + 256×256 alturas;
 *     altura mundo = byte × 1.5. Nesta branch o header BMP varia por mundo,
 *     então a regra robusta validada é: alturas = últimos 65536 bytes.
 *   MapManager.cpp:1441-1539 (tabela de tiles):
 *     slots 0..29; 14..29 = ExtTile01..16; cenas login/char desta branch
 *     usam AlphaTileGround01 no slot 2 e AlphaTile01 no slot 10.
 *   ZzzLodTerrain.cpp:1656-1719 + 1723-1783 (FaceTexture/RenderTerrainFace):
 *     cada célula mapeia o tile inteiro (GL_REPEAT, GL_NEAREST), com a camada
 *     L2 aplicada por alpha de mapeamento — NÃO é uma imagem raster de baixa
 *     resolução por célula.
 */

import { mapFileDecrypt } from './BmdParser.js';

const G = 256;             // células por lado
const CELL = 100;          // TERRAIN_SCALE
const HEIGHT_SCALE = 1.5;  // OpenTerrainHeight
const MAX_TILE_SLOT = 30;  // 0..13 base + 1..16 ExtTile
const ATLAS_COLS = 8;
const ATLAS_ROWS = 4;

// Slots de tile (MapManager.cpp:1441-1539). Nas cenas login/char desta branch
// (World95/World78 ou PJH), os slots com alpha são 2 e 10.
export const TILE_SLOTS_LOGIN = [
    'TileGrass01.OZJ', 'TileGrass02.OZJ', 'AlphaTileGround01.OZT',
    'TileGround02.OZJ', 'TileGround03.OZJ', 'TileWater01.OZJ', 'TileWood01.OZJ',
    'TileRock01.OZJ', 'TileRock02.OZJ', 'TileRock03.OZJ', 'AlphaTile01.OZT',
    'TileRock05.OZJ', 'TileRock06.OZJ', 'TileRock07.OZJ',
];
export const TILE_SLOTS_NORMAL = [
    'TileGrass01.OZJ', 'TileGrass02.OZJ', 'TileGround01.OZJ',
    'TileGround02.OZJ', 'TileGround03.OZJ', 'TileWater01.OZJ', 'TileWood01.OZJ',
    'TileRock01.OZJ', 'TileRock02.OZJ', 'TileRock03.OZJ', 'TileRock04.OZJ',
    'TileRock05.OZJ', 'TileRock06.OZJ', 'TileRock07.OZJ',
];

/** Caminho(s) do arquivo real para um slot de tile (PC: BITMAP_MAPTILE+slot).
 *
 * R81 keeps filename aliases evidence-scoped. A missing source-owned file never
 * falls through to a visually similar tile from another world.
 */
export function tileFileCandidates(slot, loginScenes = false, worldIndex = null) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_TILE_SLOT) return [];
    const world = Number.isInteger(Number(worldIndex)) ? Number(worldIndex) : null;
    if (slot < 14) {
        const primary = (loginScenes ? TILE_SLOTS_LOGIN : TILE_SLOTS_NORMAL)[slot];
        const alternates = [];
        if (loginScenes) {
            // Alguns assets desta branch têm um layout híbrido. A escolha aqui
            // é por arquivo real disponível, não por conteúdo inventado.
            if (slot === 2) alternates.push('TileGround01.OZJ');
            if (slot === 10) alternates.push('TileRock04.OZJ');
        }

        // Evidence from the user's own current-client/Main-5.2 lineage:
        // World4 physically resolves the two absent canonical files this way.
        // Keep this *World4-only*; no generic/other-world substitution is legal.
        if (world === 4) {
            if (slot === 1) alternates.push('TileGrass03.OZT', 'TileGrass03.OZJ');
            if (slot === 3) alternates.push('TileGround03.OZJ');
        }

        // R83: MapManager.cpp has world-specific *owners*, not visual aliases.
        // Asset WorldN == WorldActive+1.  Put the exact PC-owned file first so
        // those maps do not silently use the normal slot filename when the
        // desktop overwrites the slot with an AlphaTile owner.
        const exact = [];
        // FIX50: the PC source calls LoadBitmap with the physical .jpg/.tga
        // filenames (MapManager.cpp:1441-1539). The official Data root may
        // expose either those source extensions or their encrypted OZJ/OZT
        // counterparts. These are same-stem representations of the SAME owner,
        // not cross-world/visually-similar fallbacks. Put the exact physical
        // spelling next to the encrypted spelling so Icarus/other maps do not
        // render white just because only the .jpg/.tga form exists.
        if (primary) {
            if (/\.OZJ$/i.test(primary)) exact.push(primary.replace(/\.OZJ$/i, '.jpg'));
            else if (/\.OZT$/i.test(primary)) exact.push(primary.replace(/\.OZT$/i, '.tga'));
        }
        // FIX84 / current-client physical authority: Icarus terrain data lives
        // in World11, but this exact MuPromax 1.0.1 Data stores the five Icarus
        // MAPTILE owners absent from World11 under World10 with identical PC
        // slot filenames. The live manifest proves World11 has only Grass01
        // while World10 contains Grass02 + Rock01..04. This is an explicit
        // current-client ownership mapping, not a visual-similarity fallback.
        if (world === 11 && [1,7,8,9,10].includes(slot) && primary) {
            exact.push(`@/World10/${primary}`);
            if (/\.OZJ$/i.test(primary)) exact.push(`@/World10/${primary.replace(/\.OZJ$/i,'.jpg')}`);
        }
        if (world === 52 && slot === 2) exact.push('AlphaTileGround01.OZT', 'AlphaTileGround01.OZJ');
        if (world === 40 && slot === 3) exact.push('AlphaTileGround02.OZT', 'AlphaTileGround02.OZJ');
        if (world >= 46 && world <= 51 && slot === 4) exact.push('AlphaTileGround03.OZT', 'AlphaTileGround03.OZJ');
        // Empire Guardian 1..4 reload BITMAP_MAPTILE+10 from AlphaTile01.
        if (world >= 70 && world <= 73 && slot === 10) exact.push('AlphaTile01.OZT', 'AlphaTile01.OZJ');
        // PJH_NEW_SERVER_SELECT_MAP: WorldActive 73/74 => asset World74/75.
        if ((world === 74 || world === 75) && slot === 10) exact.push('AlphaTile01.OZT', 'AlphaTile01.OZJ');
        // Karutan WorldActive 80/81 => asset World81/82 uses AlphaTile01 in slot12.
        if ((world === 81 || world === 82) && slot === 12) exact.push('AlphaTile01.OZT', 'AlphaTile01.OZJ');
        // IsPKField(WorldActive63=>World64) and IsDoppelGanger2
        // (WorldActive66=>World67) replace BITMAP_MAPTILE+11 with this exact
        // Object64 texture instead of WorldN/TileRock05. `@/` means Data-root.
        if ((world === 64 || world === 67) && slot === 11) exact.push('@/Object64/song_lava1.OZJ', '@/Object64/song_lava1.jpg');

        return [...new Set([...exact, primary, ...alternates].filter(Boolean))];
    }

    const ext = slot - 13; // PC slot14 => ExtTile01 ... slot29 => ExtTile16
    return [`ExtTile${ext < 10 ? '0' + ext : String(ext)}.OZJ`];
}


/**
 * Main 5.2 grass billboard owner (ZzzLodTerrain.cpp / MapManager.cpp).
 * Web asset WorldN maps to PC WorldActive=N-1.
 */
export function pcTerrainGrassEnabled(worldIndex) {
    const world = Number(worldIndex) | 0;
    const active = world - 1;
    // RenderTerrain: Atlans and DoppelGanger3 skip the complete grass pass.
    if (active === 7 || active === 67) return false;
    // OpenTerrainMapping: TerrainGrassEnable=false in Chaos Castle/Battle Castle.
    if ((active >= 18 && active <= 23) || active === 53 || active === 30) return false;
    // RenderTerrainFace grass branch additionally rejects every Blood Castle.
    if ((active >= 11 && active <= 17) || active === 52) return false;
    return world > 0;
}

/** Exact BITMAP_MAPGRASS slot filename family from MapManager.cpp.
 * slot0 is the red owner only in PK Field / DoppelGanger2. OZT/OZJ are the
 * encrypted current-client counterparts actually present in the user's Data.
 */
export function terrainGrassFileCandidates(slot, worldIndex) {
    const s = Number(slot) | 0;
    const world = Number(worldIndex) | 0;
    if (s < 0 || s > 2 || world <= 0) return [];
    const active = world - 1;
    if (s === 0 && (active === 63 || active === 66)) {
        return ['TileGrass01_R.OZJ', 'TileGrass01_R.jpg'];
    }
    const n = String(s + 1).padStart(2, '0');
    // PC normal grass is TGA/OZT, independently from the same-stem JPEG/OZJ
    // ground tile. Never substitute ground or grass from a different WorldN.
    return [`TileGrass${n}.OZT`, `TileGrass${n}.tga`];
}

/** InitTerrainLight exact default wind law. `eventEnabled` preserves the
 * alternate source branch without guessing whether an event is active.
 */
export function pcTerrainGrassWind(worldIndex, worldTimeMs, xf, eventEnabled = false) {
    const active = (Number(worldIndex) | 0) - 1;
    const x = Number(xf) || 0;
    const time = Number(worldTimeMs) || 0;
    if (active === 80 || active === 81) { // Karutan uses g_fTerrainGrassWind1
        const speed = (Math.trunc(time) % 36000) * 0.008;
        return Math.sin(speed + x * 50) * 15;
    }
    const speed = eventEnabled
        ? (Math.trunc(time) % 36000) * 0.01
        : (Math.trunc(time) % 720000) * 0.002;
    let scale = 10;
    let xMul = 5;
    if (active === 8) xMul = 50; // Tarkan
    if (active === 57 || active === 58) { xMul = 50; scale = 60; } // Raklion
    return Math.sin(speed + x * xMul) * scale;
}

/** TerrainGrassTexture[yi]=(rand()%4)/4. Runtime keeps the same four legal
 * quarter offsets; tests may inject a deterministic RNG without changing the owner.
 */
export function createTerrainGrassQuarterOffsets(randomFn = Math.random) {
    const out = new Float32Array(G);
    for (let y = 0; y < G; y++) {
        const r = Number(randomFn());
        const q = Number.isFinite(r) ? Math.max(0, Math.min(3, Math.floor(r * 4))) : 0;
        out[y] = q * 0.25;
    }
    return out;
}

function grassCornerIndex(x, y) {
    return ((y & (G - 1)) * G) + (x & (G - 1));
}

// Preserve every authored quad and attribute; cull 32x32-cell regions independently.
// PC RenderTerrain iterates only the frustum region, not the entire 256x256 map.
export function splitPcGrassGeometry(geo, THREE) {
    const p=geo.getAttribute('position'),bins=new Map();
    for(let cell=0;cell<p.count/4;cell++) {
        const v=cell*4;
        const key=Math.floor((p.getX(v)+12850)/3200)+8*Math.floor((12800-p.getZ(v))/3200);
        if(!bins.has(key))bins.set(key,[]);bins.get(key).push(cell);
    }
    return [...bins.values()].map(cells=>{
        const g=new THREE.BufferGeometry();
        for(const [name,a] of Object.entries(geo.attributes)) {
            const values=new a.array.constructor(cells.length*4*a.itemSize);
            cells.forEach((c,i)=>values.set(a.array.subarray(c*4*a.itemSize,(c+1)*4*a.itemSize),i*4*a.itemSize));
            g.setAttribute(name,new THREE.BufferAttribute(values,a.itemSize,a.normalized));
        }
        const index=new Uint32Array(cells.length*6);
        cells.forEach((c,i)=>{for(let j=0;j<6;j++)index[i*6+j]=geo.index.array[c*6+j]-c*4+i*4;});
        g.setIndex(new THREE.BufferAttribute(index,1));g.computeBoundingSphere();
        g.boundingSphere.radius+=60; // greatest authored wind amplitude (world57/58).
        return g;
    });
}

export function pcTerrainGrassQuad(xi, yi, heights, grassHeight) {
    const i1 = grassCornerIndex(xi, yi);
    const i3 = grassCornerIndex(xi + 1, yi + 1);
    const x0 = xi * CELL - G * CELL / 2;
    const x1 = (xi + 1) * CELL - G * CELL / 2;
    const z0 = G * CELL / 2 - yi * CELL;
    const z1 = G * CELL / 2 - (yi + 1) * CELL;
    return [
        [x0 - 50, heights[i1] + grassHeight, z0],
        [x1 - 50, heights[i3] + grassHeight, z1],
        [x1, heights[i3], z1],
        [x0, heights[i1], z0],
    ];
}

// ZzzLodTerrain.cpp only enables blending for PKField/Doppelganger2.
// Other maps use EnableAlphaTest (GREATER .25), not SRC_ALPHA blending.
export function pcTerrainGrassUsesAlphaBlend(worldIndex) {
    return worldIndex === 64 || worldIndex === 67;
}

async function buildPcTerrainGrassGroup(fetchImageURL, THREE, worldIndex, mapData, heights, lightTex, onStatus = () => {}, walls = null) {
    if (!pcTerrainGrassEnabled(worldIndex)) {
        return { group: null, meshes: [], textures: [], sources: [], cells: 0, enabled: false };
    }
    const base = `World${worldIndex}`;
    const loaded = await Promise.all(Array.from({ length: 3 }, async (_, slot) => {
        const candidates = terrainGrassFileCandidates(slot, worldIndex);
        const hit = await fetchFirstImage(fetchImageURL, base, candidates, `World${worldIndex} BITMAP_MAPGRASS+${slot}`, { optional: true, exactOnly: true });
        return hit;
    }));
    if (!loaded.some((x) => x.image)) {
        return { group: null, meshes: [], textures: [], sources: [], cells: 0, enabled: true };
    }

    const quarterByRow = createTerrainGrassQuarterOffsets();
    const group = new THREE.Group();
    group.name = `MU_TERRAIN_GRASS_WORLD_${worldIndex}`;
    const meshes = [];
    const textures = [];
    const sources = [];
    let totalCells = 0;
    const alpha = mapData.alpha;
    const layer1 = mapData.layer1;
    const size = G * CELL;
    const worldActive = worldIndex - 1;

    for (let slot = 0; slot < 3; slot++) {
        const hit = loaded[slot];
        if (!hit?.image) continue; // PC LoadBitmap failure => FindTexture null => no quad.
        const positions = [];
        const uvs = [];
        const lightUvs = [];
        const tops = [];
        const windXs = [];
        let cellCount = 0;
        const grassHeight = Math.max(0, Number(hit.image.height) || 0) * 2;
        if (!(grassHeight > 0)) continue;

        // RenderTerrainFace grass owner. All four mapping-alpha corners must be 0;
        // CurrentLayer==0 is the single Web terrain owner. Texture is selected
        // solely by L1 at TerrainIndex1 (BITMAP_MAPGRASS + slot).
        for (let yi = 0; yi < G; yi++) {
            for (let xi = 0; xi < G; xi++) {
                const i1 = grassCornerIndex(xi, yi);
                if (walls && (walls[i1] & 0x0008)) continue;
                if ((layer1[i1] | 0) !== slot) continue;
                const i2 = grassCornerIndex(xi + 1, yi);
                const i3 = grassCornerIndex(xi + 1, yi + 1);
                const i4 = grassCornerIndex(xi, yi + 1);
                if (Number(alpha[i1]) > 0 || Number(alpha[i2]) > 0 || Number(alpha[i3]) > 0 || Number(alpha[i4]) > 0) continue;

                // ZzzLodTerrain.cpp:1594-1599 copies ORIGINAL v0 into v3
                // and ORIGINAL v2 into v1. The blade spans the CELL DIAGONAL,
                // not the southern edge (old Web used Index4 for both lefts).
                const verts = pcTerrainGrassQuad(xi, yi, heights, grassHeight);
                for (const v of verts) positions.push(v[0], v[1], v[2]);

                const su = xi * 0.25 + quarterByRow[yi & (G - 1)];
                uvs.push(su, 0, su + 0.25, 0, su + 0.25, 1, su, 1);
                // Source colors deliberately do NOT follow copied positions:
                // v0->Index1, v1->Index2, v2->Index3, v3->Index4.
                const luv = (idx) => [((idx % G) + 0.5) / G, (Math.floor(idx / G) + 0.5) / G];
                for (const idx of [i1, i2, i3, i4]) lightUvs.push(...luv(idx));
                tops.push(1, 1, 0, 0);
                windXs.push(xi, xi + 1, xi + 1, xi);
                cellCount++;
            }
        }
        if (!cellCount) continue;

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setAttribute('aLightUV', new THREE.Float32BufferAttribute(lightUvs, 2));
        geo.setAttribute('aTop', new THREE.Float32BufferAttribute(tops, 1));
        geo.setAttribute('aWindX', new THREE.Float32BufferAttribute(windXs, 1));
        const indices = new Uint32Array(cellCount * 6);
        for (let c = 0; c < cellCount; c++) {
            const v = c * 4, o = c * 6;
            indices[o] = v; indices[o + 1] = v + 2; indices[o + 2] = v + 1;
            indices[o + 3] = v; indices[o + 4] = v + 3; indices[o + 5] = v + 2;
        }
        geo.setIndex(new THREE.BufferAttribute(indices, 1));
        geo.computeBoundingSphere();

        const tex = new THREE.Texture(hit.image);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        const linear = (worldActive === 63 || worldActive === 66) && slot === 0;
        tex.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
        tex.minFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.colorSpace = THREE.NoColorSpace;
        tex.flipY = false; // grass UVs and OZT/JPEG rows follow the PC directly.
        tex.needsUpdate = true;

        const uniforms = THREE.UniformsUtils.merge([
            THREE.UniformsLib.fog,
            {
                uMap: { value: tex },
                uLight: { value: lightTex },
                uWorldTime: { value: 0 },
                uWorldActive: { value: worldActive },
            },
        ]);
        const mat = new THREE.ShaderMaterial({
            uniforms,
            fog: true,
            transparent: pcTerrainGrassUsesAlphaBlend(worldIndex),
            depthTest: true,
            depthWrite: true,
            side: THREE.DoubleSide, // PC EnableAlphaTest -> DisableCullFace.
            vertexShader: /* glsl */`
                attribute vec2 aLightUV;
                attribute float aTop;
                attribute float aWindX;
                varying vec2 vUvGrass;
                varying vec2 vLightUV;
                uniform float uWorldTime;
                uniform float uWorldActive;
                #include <fog_pars_vertex>
                float pcGrassWind(float activeWorld, float t, float xf) {
                    if (abs(activeWorld - 80.0) < 0.5 || abs(activeWorld - 81.0) < 0.5) {
                        return sin(mod(t, 36000.0) * 0.008 + xf * 50.0) * 15.0;
                    }
                    float scale = 10.0;
                    float mul = 5.0;
                    if (abs(activeWorld - 8.0) < 0.5) mul = 50.0;
                    if (abs(activeWorld - 57.0) < 0.5 || abs(activeWorld - 58.0) < 0.5) { mul = 50.0; scale = 60.0; }
                    return sin(mod(t, 720000.0) * 0.002 + xf * mul) * scale;
                }
                void main() {
                    vec3 p = position;
                    if (aTop > 0.5) p.z -= pcGrassWind(uWorldActive, uWorldTime, aWindX);
                    vUvGrass = uv;
                    vLightUV = aLightUV;
                    vec4 wp = modelMatrix * vec4(p, 1.0);
                    vec4 mvPosition = viewMatrix * wp;
                    gl_Position = projectionMatrix * mvPosition;
                    #include <fog_vertex>
                }
            `,
            fragmentShader: /* glsl */`
                precision highp float;
                uniform sampler2D uMap;
                uniform sampler2D uLight;
                varying vec2 vUvGrass;
                varying vec2 vLightUV;
                #include <fog_pars_fragment>
                void main() {
                    vec4 texel = texture2D(uMap, vUvGrass);
                    // ZzzOpenglUtil::EnableAlphaTest -> GL_GREATER, 0.25.
                    if (texel.a <= 0.25) discard;
                    vec3 light = texture2D(uLight, vLightUV).rgb;
                    gl_FragColor = vec4(texel.rgb * light, texel.a);
                    // PC byte-space modulation: no output gamma transfer.
                    #include <fog_fragment>
                }
            `,
        });
        const chunks=splitPcGrassGeometry(geo,THREE);geo.dispose();
        for(const [chunkIndex,chunkGeo] of chunks.entries()) {
        const grass = new THREE.Mesh(chunkGeo, mat);
        grass.name = `MU_TERRAIN_GRASS_SLOT_${slot}_CHUNK_${chunkIndex}`;
        grass.frustumCulled = true;
        grass.onBeforeRender = () => {
            mat.uniforms.uWorldTime.value = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        };
        group.add(grass);
        meshes.push(grass);
        }
        textures.push(tex);
        sources.push(hit.path);
        totalCells += cellCount;
    }

    if (!meshes.length) {
        for (const t of textures) t.dispose?.();
        return { group: null, meshes: [], textures: [], sources, cells: 0, enabled: true };
    }
    onStatus(`World${worldIndex}: grass PC separado ativo (${totalCells} face(s), ${sources.length} textura(s)).`);
    return { group, meshes, textures, sources, cells: totalCells, enabled: true };
}

/**
 * Parse do EncTerrain{N}.map (2 camadas + alpha).
 * @returns {{version, mapNumber, layer1:Uint8Array, layer2:Uint8Array, alpha:Uint8Array}}
 */
export function parseTerrainMap(fileBuf) {
    const data = mapFileDecrypt(fileBuf instanceof Uint8Array ? fileBuf : new Uint8Array(fileBuf));
    if (data.length !== 2 + G * G * 3) {
        throw new Error(`EncTerrain.map tamanho inesperado: ${data.length}`);
    }
    return {
        version: data[0],
        mapNumber: data[1],
        layer1: data.subarray(2, 2 + G * G),
        layer2: data.subarray(2 + G * G, 2 + G * G * 2),
        alpha: data.subarray(2 + G * G * 2, 2 + G * G * 3),
    };
}

/**
 * Alturas do TerrainHeight.OZB.
 * O PC documenta fseek(4) + header 1080, mas os assets reais desta branch
 * variam (World95=1078, World78=1080); as alturas são sempre os últimos
 * 65536 bytes — mesma regra já validada em TerrainWorld.js.
 * @returns {Float32Array} 256×256 alturas em unidades de mundo (×1.5)
 */
export function parseTerrainHeights(ozbBuf) {
    const u8 = ozbBuf instanceof Uint8Array ? ozbBuf : new Uint8Array(ozbBuf);
    if (u8.length < G * G) {
        throw new Error(`TerrainHeight.OZB truncado: ${u8.length}`);
    }
    const off = u8.length - G * G;
    const out = new Float32Array(G * G);
    for (let i = 0; i < G * G; i++) {
        out[i] = u8[off + i] * HEIGHT_SCALE;
    }
    return out;
}

/**
 * Main 5.2 RequestTerrainHeight over raw MU world coordinates.
 * ZzzLodTerrain.cpp interpolates BackTerrainHeight bilinearly across the four
 * periodic grid points; it does not snap to one cell. `walls` is optional so
 * callers that only need the height field can still use the exact interpolation.
 */
export function heightAt(heights, muX, muY, walls = null, specialHeight = 1200) {
    if (!heights || muX < 0 || muY < 0) return 0;
    const xf = muX / CELL;
    const yf = muY / CELL;
    const xi = Math.floor(xf);
    const yi = Math.floor(yf);
    // TERRAIN_INDEX(x,y), before the repeating neighbor lookups, is bounded.
    if (xi < 0 || yi < 0 || xi >= G || yi >= G) return specialHeight;
    const index = yi * G + xi;
    if (walls && (Number(walls[index]) & 0x0040)) return specialHeight;
    const xd = xf - xi;
    const yd = yf - yi;
    const rep = (x, y) => ((y & (G - 1)) * G) + (x & (G - 1));
    const h1 = Number(heights[rep(xi, yi)]) || 0;
    const h2 = Number(heights[rep(xi, yi + 1)]) || 0;
    const h3 = Number(heights[rep(xi + 1, yi)]) || 0;
    const h4 = Number(heights[rep(xi + 1, yi + 1)]) || 0;
    const left = h1 + (h2 - h1) * yd;
    const right = h3 + (h4 - h3) * yd;
    return left + (right - left) * xd;
}


/**
 * Main 5.2 CreateTerrainNormal + CreateTerrainLight.
 *
 * `lightRgbaTopDown` is the decoded JPEG RGBA byte stream in normal browser
 * top-down row order. OpenJpegBuffer stores the same JPEG bottom-up in
 * TerrainLight[], so source grid row y reads browser row (255-y).
 *
 * Returns PrimaryTerrainLight-compatible RGB floats (3 per grid point).
 */
export function buildPrimaryTerrainLight(heights, lightRgbaTopDown, width = G, height = G, battleCastle = false) {
    if (!heights || heights.length !== G * G) throw new Error('terrain heights 256×256 required');
    if (!lightRgbaTopDown || width !== G || height !== G || lightRgbaTopDown.length < G * G * 4) {
        throw new Error(`TerrainLight RGBA must be ${G}×${G}`);
    }
    const primary = new Float32Array(G * G * 3);
    const rep = (x, y) => ((y & (G - 1)) * G) + (x & (G - 1));
    const lightDir = battleCastle ? [0.5, -1.0, 1.0] : [0.5, -0.5, 0.5];

    for (let y = 0; y < G; y++) {
        const imageY = G - 1 - y; // OpenJpegBuffer bottom-up contract.
        for (let x = 0; x < G; x++) {
            // PC CreateTerrainNormal uses v1=(x+1,y), v2=(x+1,y+1),
            // v3=(x,y+1), then FaceNormalize(v1,v2,v3).
            const h1 = Number(heights[rep(x + 1, y)]) || 0;
            const h2 = Number(heights[rep(x + 1, y + 1)]) || 0;
            const h3 = Number(heights[rep(x, y + 1)]) || 0;

            // (v2-v1) x (v3-v1), expanded with TERRAIN_SCALE=CELL.
            const ax = 0;
            const ay = CELL;
            const az = h2 - h1;
            const bx = -CELL;
            const by = CELL;
            const bz = h3 - h1;
            let nx = ay * bz - by * az;
            let ny = az * bx - bz * ax;
            let nz = ax * by - bx * ay;
            const len = Math.hypot(nx, ny, nz);
            if (len > 0) { nx /= len; ny /= len; nz /= len; }

            let luminosity = nx * lightDir[0] + ny * lightDir[1] + nz * lightDir[2] + 0.5;
            luminosity = Math.max(0, Math.min(1, luminosity));

            const src = (imageY * G + x) * 4;
            const dst = (y * G + x) * 3;
            // Browser canvas supplies RGBA; PC OpenJpegBuffer stores RGB/255.
            primary[dst + 0] = (Number(lightRgbaTopDown[src + 0]) / 255) * luminosity;
            primary[dst + 1] = (Number(lightRgbaTopDown[src + 1]) / 255) * luminosity;
            primary[dst + 2] = (Number(lightRgbaTopDown[src + 2]) / 255) * luminosity;
        }
    }
    return primary;
}

/** Main 5.2 RequestTerrainLight over PrimaryTerrainLight. */
export function samplePrimaryTerrainLight(primary, muX, muY, out = null) {
    const result = out || [0, 0, 0];
    if (!primary || primary.length !== G * G * 3) {
        result[0] = result[1] = result[2] = 0;
        return result;
    }
    const xf = Number(muX) / CELL;
    const yf = Number(muY) / CELL;
    const xi = Math.trunc(xf);
    const yi = Math.trunc(yf);
    // PC bounds: xi/yi must be <= TERRAIN_SIZE_MASK-1 (254), because +1 is read.
    if (!Number.isFinite(xf) || !Number.isFinite(yf) || xi < 0 || yi < 0 || xi > G - 2 || yi > G - 2) {
        result[0] = result[1] = result[2] = 0;
        return result;
    }
    const xd = xf - xi;
    const yd = yf - yi;
    const i1 = (xi + yi * G) * 3;
    const i2 = (xi + 1 + yi * G) * 3;
    const i3 = (xi + 1 + (yi + 1) * G) * 3;
    const i4 = (xi + (yi + 1) * G) * 3;
    for (let c = 0; c < 3; c++) {
        const left = primary[i1 + c] + (primary[i4 + c] - primary[i1 + c]) * yd;
        const right = primary[i2 + c] + (primary[i3 + c] - primary[i2 + c]) * yd;
        result[c] = left + (right - left) * xd;
    }
    return result;
}


/** Main 5.2 AddTerrainLight over a mutable PrimaryTerrainLight float grid.
 *  This is the source radial law, not a Three.js point-light approximation.
 *  `touched` may be a Set and receives cell indices changed by this call.
 */
export function addPrimaryTerrainLight(primary, muX, muY, light, range, touched = null) {
    if (!primary || primary.length !== G * G * 3) return 0;
    const rf = Number(range) || 0;
    if (!(rf > 0)) return 0;
    const xf = Number(muX) / CELL;
    const yf = Number(muY) / CELL;
    if (!Number.isFinite(xf) || !Number.isFinite(yf)) return 0;
    const xi = Math.trunc(xf);
    const yi = Math.trunc(yf);
    const li = [Number(light?.[0]) || 0, Number(light?.[1]) || 0, Number(light?.[2]) || 0];
    let changed = 0;
    for (let syi = yi - rf, syf = yi - rf; syi <= yi + rf; syi++, syf += 1) {
        for (let sxi = xi - rf, sxf = xi - rf; sxi <= xi + rf; sxi++, sxf += 1) {
            const xd = xf - sxf;
            const yd = yf - syf;
            const lf = (rf - Math.hypot(xd, yd)) / rf;
            if (!(lf > 0)) continue;
            const cell = ((syi & (G - 1)) * G) + (sxi & (G - 1));
            const d = cell * 3;
            for (let c = 0; c < 3; c++) {
                primary[d + c] += li[c] * lf;
                if (primary[d + c] < 0) primary[d + c] = 0;
            }
            touched?.add?.(cell);
            changed++;
        }
    }
    return changed;
}

function toR8(array) {
    if (array instanceof Uint8Array || array instanceof Uint8ClampedArray) return Uint8Array.from(array);
    if (!array || array.length !== G * G) throw new Error('mapa de terreno inválido (256×256 esperado)');
    const out = new Uint8Array(G * G);
    for (let i = 0; i < out.length; i++) {
        const v = Number(array[i]) || 0;
        out[i] = Math.max(0, Math.min(255, Math.round(v <= 1 ? v * 255 : v)));
    }
    return out;
}


/**
 * Resolve the texture slots that the clean Main 5.2 terrain pass can actually
 * sample. `TerrainMappingLayer2[index]` is rendered only when at least one of
 * the four `TerrainMappingAlpha` corners of that face is > 0. R80 required every
 * byte ever present in Layer2, which made Arena demand stale ExtTile slots that
 * the PC renderer never sampled.
 */
export function collectTerrainTileSlots(mapData) {
    const layer1 = toR8(mapData?.layer1);
    const layer2 = toR8(mapData?.layer2);
    const alpha = toR8(mapData?.alpha);
    const layer1Slots = new Set();
    const layer2VisibleSlots = new Set();
    const ignoredInactiveLayer2Slots = new Set();
    const rep = (x, y) => ((y & (G - 1)) * G) + (x & (G - 1));

    for (let y = 0; y < G; y++) {
        for (let x = 0; x < G; x++) {
            const i = y * G + x;
            const l1 = layer1[i];
            if (l1 !== 255) layer1Slots.add(l1);

            const l2 = layer2[i];
            if (l2 === 255) continue;
            const visible = alpha[rep(x, y)] > 0
                || alpha[rep(x + 1, y)] > 0
                || alpha[rep(x + 1, y + 1)] > 0
                || alpha[rep(x, y + 1)] > 0;
            if (visible) layer2VisibleSlots.add(l2);
            else ignoredInactiveLayer2Slots.add(l2);
        }
    }
    // A slot can occur in both inactive and active cells. Only report truly
    // inactive-only IDs as ignored diagnostics.
    for (const slot of layer2VisibleSlots) ignoredInactiveLayer2Slots.delete(slot);
    const usedSlots = new Set([...layer1Slots, ...layer2VisibleSlots]);
    return { layer1, layer2, alpha, usedSlots, layer1Slots, layer2VisibleSlots, ignoredInactiveLayer2Slots };
}

function loadImage(url, label) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`falha ao decodificar ${label}`));
        img.src = url;
    });
}

function terrainCandidatePath(base, rel) {
    const s=String(rel||'');
    return s.startsWith('@/') ? s.slice(2) : `${base}/${s}`;
}

async function fetchFirstImage(fetchImageURL, base, candidates, label, { optional = false, exactOnly = false } = {}) {
    const errors = [];
    for (const rel of candidates) {
        const path=terrainCandidatePath(base,rel);
        try {
            const url = await fetchImageURL(path, { exactOnly });
            if (!url) continue;
            return { rel, path, image: await loadImage(url, path), errors };
        } catch (e) {
            errors.push(`${path}: ${e.message || e}`);
        }
    }
    if (optional) return { rel: null, path:null, image: null, errors, missing: true };
    throw new Error(`${label}: tile real ausente/indisponível (${errors.join(' | ') || candidates.join(' | ')})`);
}

async function buildAtlansWaterAtlas(fetchImageURL, THREE, onStatus = () => {}) {
    // Main 5.2 MapManager::Load(WD_7ATLANSE) owns BITMAP_WATER+i from
    // Object8/wt00..wt31; ZzzLodTerrain::RenderTerrainFace substitutes this
    // animation when Layer2 == slot 5.  Do not redirect it to World8/TileWater01.
    // Browser/local asset server can decode the 32 source-owned frames in
    // parallel.  The previous sequential await multiplied request/decode
    // latency by 32 and made /move Atlans visibly stall even on localhost.
    const frames = await Promise.all(Array.from({ length: 32 }, async (_, i) => {
        const n = String(i).padStart(2, '0');
        const loaded = await fetchFirstImage(fetchImageURL, 'Object8', [`wt${n}.OZJ`, `wt${n}.jpg`], `Atlans wt${n}`, { optional: true });
        return loaded.image || null;
    }));
    const complete = frames.every(Boolean);
    if (!complete) {
        const missing = frames.map((v, i) => v ? null : i).filter((v) => v != null);
        console.warn(`[Terrain R83] Atlans water owner incompleto Object8/wtXX: missing=${missing.join(',')}`);
        onStatus(`World8: água Atlans incompleta (${32-missing.length}/32 frames reais); sem substituto fake.`);
        return { texture: null, complete: false, frames: 32 - missing.length };
    }
    const cellSize = Math.max(32, ...frames.map((img) => Math.max(img.width || 0, img.height || 0)));
    const canvas = document.createElement('canvas');
    canvas.width = cellSize * 8;
    canvas.height = cellSize * 4;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 32; i++) {
        const cx = (i % 8) * cellSize;
        const cy = (3 - Math.floor(i / 8)) * cellSize; // Texture flipY parity.
        ctx.drawImage(frames[i], cx, cy, cellSize, cellSize);
    }
    const texture = new THREE.Texture(canvas);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
    onStatus('World8: água Atlans PC Object8/wt00..wt31 carregada (32/32).');
    return { texture, complete: true, frames: 32 };
}

/**
 * Constrói somente o mesh visual do terreno REAL a partir de mapping/heights
 * já decodificados. Cada célula amostra o tile inteiro no shader (GL_REPEAT),
 * preservando o detalhe das texturas — corrige o raster 8px/célula que ficava
 * “manchado”.
 *
 * @param {object} io { fetchImageURL, THREE }
 * @param {number} worldIndex índice do world (ex.: 1)
 * @param {object} mapData { layer1, layer2, alpha, mapNumber }
 * @param {Float32Array} heights 256×256 alturas reais
 * @param {object} opts { loginScenes?: boolean, onStatus?: fn }
 */
// RenderTerrainTile: skip TW_NOGROUND at Index1, override each TW_HEIGHT
// vertex, and preserve the PC triangle fan diagonal Index1 -> Index3.
// PlaneGeometry's default diagonal differs on non-planar cells.
export function applyPcTerrainGeometry(geometry, heights, walls = null, specialHeight = 1200) {
    const pos = geometry.attributes.position;
    const size = G * CELL;
    for (let i = 0; i < pos.count; i++) {
        const x = Math.round((pos.getX(i) + size / 2) / CELL) & (G - 1);
        const y = Math.round((size / 2 - pos.getZ(i)) / CELL) & (G - 1);
        const index = y * G + x;
        pos.setY(i, walls && (walls[index] & 0x0040) ? specialHeight : heights[index]);
    }
    const indices = [];
    let hiddenCells = 0;
    for (let y = 0; y < G; y++) {
        for (let x = 0; x < G; x++) {
            if (walls && (walls[y * G + x] & 0x0008)) { hiddenCells++; continue; }
            const a = (G - y) * (G + 1) + x;
            const east = a + 1, north = a - (G + 1), northeast = north + 1;
            indices.push(a, east, northeast, a, northeast, north);
        }
    }
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return { hiddenCells, renderedCells: G * G - hiddenCells };
}

export async function createMuTerrainMesh(io, worldIndex, mapData, heights, opts = {}) {
    const { fetchImageURL, THREE } = io;
    const onStatus = opts.onStatus || (() => {});
    const loginScenes = !!opts.loginScenes;
    const base = `World${worldIndex}`;

    if (!mapData || !heights || heights.length !== G * G) {
        throw new Error(`World${worldIndex}: dados de terreno inválidos`);
    }
    if (mapData.mapNumber != null && mapData.mapNumber !== worldIndex) {
        throw new Error(`EncTerrain.map mapNumber=${mapData.mapNumber}, esperado ${worldIndex}`);
    }

    const slotUse = collectTerrainTileSlots(mapData);
    const { layer1, layer2, alpha, usedSlots, layer1Slots, layer2VisibleSlots, ignoredInactiveLayer2Slots } = slotUse;
    if (ignoredInactiveLayer2Slots.size) {
        console.info(`[Terrain R83] World${worldIndex}: Layer2 inativo ignorado (alpha=0, PC não amostra): ${[...ignoredInactiveLayer2Slots].sort((a,b)=>a-b).join(',')}`);
    }
    console.info(`[Terrain R83] World${worldIndex}: slots L1=${[...layer1Slots].sort((a,b)=>a-b).join(',')} L2-vis=${[...layer2VisibleSlots].sort((a,b)=>a-b).join(',') || 'none'}`);

    // Só slots que o PC pode realmente amostrar são exigidos.
    for (const slot of usedSlots) {
        if (slot >= MAX_TILE_SLOT) {
            throw new Error(`World${worldIndex}: tile slot inválido fora do range PC 0..29: ${slot}`);
        }
    }

    onStatus(`Terreno: carregando ${usedSlots.size} tile(s) referenciados de ${base}...`);
    const tileImgs = new Array(MAX_TILE_SLOT).fill(null);
    const tileSources = new Array(MAX_TILE_SLOT).fill(null);
    const missingTileSlots = [];
    // PC MapManager::LoadBitmap does not abort LoadWorld when one map-tile file
    // is absent.  R81 used Promise.all+throw and therefore rejected complete
    // worlds (physical World7 slot15 / World8 slot5).  R82 keeps the failure
    // local to that texture slot and never invents a visually-similar alias.
    await Promise.all([...usedSlots].map(async (slot) => {
        const candidates = tileFileCandidates(slot, loginScenes, worldIndex);
        const loaded = await fetchFirstImage(fetchImageURL, base, candidates, `World${worldIndex} slot ${slot}`, { optional: true });
        if (loaded.image) {
            tileImgs[slot] = loaded.image;
            tileSources[slot] = loaded.path;
        } else {
            missingTileSlots.push(slot);
            console.warn(`[Terrain R83] World${worldIndex} slot ${slot} ausente; LoadWorld continua como no PC. candidates=${candidates.join('|')}`);
        }
    }));
    missingTileSlots.sort((a,b)=>a-b);
    if (missingTileSlots.length) {
        onStatus(`World${worldIndex}: tile(s) ausente(s) ${missingTileSlots.join(',')} — falha local, mapa NÃO abortado (PC LoadBitmap).`);
    }

    // Atlans (server map 7 => asset World8) has an additional exact dynamic
    // water owner. It is independent from the ordinary World8 map-tile atlas.
    const needsAtlansWater = worldIndex === 8 && layer2VisibleSlots.has(5);
    const atlansWater = needsAtlansWater
        ? await buildAtlansWaterAtlas(fetchImageURL, THREE, onStatus)
        : { texture: null, complete: false, frames: 0 };

    // Atlas 8×4 (slots 0..29). Cada slot ocupa uma célula de tamanho uniforme;
    // o shader amostra dentro da célula como o GL_REPEAT do PC.
    const loadedSizes = [...usedSlots].map((slot) => tileImgs[slot]).filter(Boolean)
        .map((img) => Math.max(img.width || 0, img.height || 0));
    const cellSize = Math.max(32, ...(loadedSizes.length ? loadedSizes : [32]));
    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = cellSize * ATLAS_COLS;
    atlasCanvas.height = cellSize * ATLAS_ROWS;
    const actx = atlasCanvas.getContext('2d');
    actx.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);
    // O WebGL inverte o canvas no upload (THREE.Texture flipY=true, padrão):
    // a linha 0 do canvas (topo) vira a faixa v∈[0.75,1.0] e a última linha
    // vira v∈[0,0.25]. O shader amostra o slot s em v=(floor(s/COLS)+local.y)
    // /ROWS — para essa faixa cair na linha pintada, o slot PRECISA ser
    // desenhado na linha ESPELHADA do canvas. Sem isso, slots da linha 0 do
    // shader (0..7) amostram a última linha do atlas (vazia) e o terreno sai
    // 100% preto com o draw call vivo (bug real do black screen World95).
    for (const slot of usedSlots) {
        const img = tileImgs[slot];
        if (!img) continue;
        const cx = (slot % ATLAS_COLS) * cellSize;
        const cy = (ATLAS_ROWS - 1 - Math.floor(slot / ATLAS_COLS)) * cellSize;
        actx.drawImage(img, cx, cy, cellSize, cellSize);
    }
    const atlasTex = new THREE.Texture(atlasCanvas);
    atlasTex.magFilter = THREE.NearestFilter;   // PC: GL_NEAREST
    atlasTex.minFilter = THREE.NearestFilter;   // sem mipmap: evita bleeding entre slots
    atlasTex.wrapS = atlasTex.wrapT = THREE.ClampToEdgeWrapping;
    atlasTex.generateMipmaps = false;
    atlasTex.colorSpace = THREE.NoColorSpace;
    atlasTex.needsUpdate = true;

    // Lightmap real (OpenTerrainLight). É asset obrigatório no PC; ausência/falha
    // deve ser evidenciada em vez de trocada por um padrão falso.
    onStatus('Terreno: carregando lightmap real TerrainLight.OZJ...');
    const lightUrl = await fetchImageURL(`${base}/TerrainLight.OZJ`);
    if (!lightUrl) throw new Error(`${base}/TerrainLight.OZJ ausente`);
    const lightImg = await loadImage(lightUrl, `${base}/TerrainLight.OZJ`);
    if ((lightImg.width | 0) !== G || (lightImg.height | 0) !== G) {
        throw new Error(`${base}/TerrainLight.OZJ dimensão inesperada ${lightImg.width}×${lightImg.height}, PC requer ${G}×${G}`);
    }

    // PC OpenJpegBuffer decodifica o JPEG para RGB/255 e guarda scanlines
    // bottom-up. Reproduzimos esses bytes primeiro; em seguida
    // CreateTerrainNormal/CreateTerrainLight geram Back/PrimaryTerrainLight.
    const lightCanvas = document.createElement('canvas');
    lightCanvas.width = G;
    lightCanvas.height = G;
    const lightCtx = lightCanvas.getContext('2d', { willReadFrequently: true });
    lightCtx.drawImage(lightImg, 0, 0, G, G);
    const lightRgbaTopDown = lightCtx.getImageData(0, 0, G, G).data;
    const backPrimaryLight = buildPrimaryTerrainLight(heights, lightRgbaTopDown, G, G, worldIndex === 31);
    // PC keeps BackTerrainLight immutable and rebuilds PrimaryTerrainLight from it
    // every frame before dynamic AddTerrainLight contributors run.
    const primaryLight = backPrimaryLight.slice();

    // GPU lightmap: fixed-function GL ultimately consumes normalized color
    // channels. Keep the CPU PrimaryTerrainLight as float for exact BodyLight,
    // but publish an RGBA8 texture for broad WebGL compatibility (no
    // OES_texture_float_linear dependency that could turn whole maps black).
    const primaryRgba = new Uint8Array(G * G * 4);
    for (let i = 0, p = 0; i < G * G; i++, p += 3) {
        const d = i * 4;
        primaryRgba[d + 0] = Math.max(0, Math.min(255, Math.round(primaryLight[p + 0] * 255)));
        primaryRgba[d + 1] = Math.max(0, Math.min(255, Math.round(primaryLight[p + 1] * 255)));
        primaryRgba[d + 2] = Math.max(0, Math.min(255, Math.round(primaryLight[p + 2] * 255)));
        primaryRgba[d + 3] = 255;
    }
    const lightTex = new THREE.DataTexture(primaryRgba, G, G, THREE.RGBAFormat, THREE.UnsignedByteType);
    lightTex.colorSpace = THREE.NoColorSpace;
    lightTex.magFilter = THREE.LinearFilter;
    lightTex.minFilter = THREE.LinearFilter;
    lightTex.generateMipmaps = false;
    lightTex.wrapS = lightTex.wrapT = THREE.ClampToEdgeWrapping;
    lightTex.needsUpdate = true;

    // Main 5.2 renders BITMAP_MAPGRASS as a second, alpha-tested billboard pass.
    // It is not TileGrass01 used by the ground atlas. Build it from the exact
    // WorldN grass textures and keep it attached to the terrain owner.
    const visualHeights = opts.walls ? Float32Array.from(heights, (h, i) => (opts.walls[i] & 0x0040) ? (opts.specialHeight ?? 1200) : h) : heights;
    const terrainGrass = await buildPcTerrainGrassGroup(fetchImageURL, THREE, worldIndex, mapData, visualHeights, lightTex, onStatus, opts.walls);

    // Dynamic PrimaryTerrainLight frame owner. PC InitTerrainLight restores
    // BackTerrainLight then RenderObjectVisual/MoveObject calls AddTerrainLight.
    // We restore only cells touched last frame; GPU upload is one 256x256 RGBA8
    // refresh when at least one dynamic source exists, while CPU sampling keeps
    // the unclamped float PrimaryTerrainLight just like RequestTerrainLight.
    const activeDynamicCells = new Set();
    const uploadDynamicCells = new Set();
    const beginDynamicLightFrame = () => {
        if (!activeDynamicCells.size) return 0;
        for (const cell of activeDynamicCells) {
            const d = cell * 3;
            primaryLight[d] = backPrimaryLight[d];
            primaryLight[d + 1] = backPrimaryLight[d + 1];
            primaryLight[d + 2] = backPrimaryLight[d + 2];
            uploadDynamicCells.add(cell);
        }
        const n = activeDynamicCells.size;
        activeDynamicCells.clear();
        return n;
    };
    const addDynamicTerrainLight = (muX, muY, light, range) =>
        addPrimaryTerrainLight(primaryLight, muX, muY, light, range, activeDynamicCells);
    const commitDynamicLightFrame = () => {
        for (const cell of activeDynamicCells) uploadDynamicCells.add(cell);
        if (!uploadDynamicCells.size) return 0;
        for (const cell of uploadDynamicCells) {
            const s = cell * 3, d = cell * 4;
            primaryRgba[d] = Math.max(0, Math.min(255, Math.round(primaryLight[s] * 255)));
            primaryRgba[d + 1] = Math.max(0, Math.min(255, Math.round(primaryLight[s + 1] * 255)));
            primaryRgba[d + 2] = Math.max(0, Math.min(255, Math.round(primaryLight[s + 2] * 255)));
            primaryRgba[d + 3] = 255;
        }
        const n = uploadDynamicCells.size;
        uploadDynamicCells.clear();
        lightTex.needsUpdate = true;
        return n;
    };

    // Layers como DataTexture (R8). L1/L2 são IDs por célula → nearest; alpha é
    // interpolado como nos 4 vértices da face no PC (VertexAlpha0..3).
    const mkData = (arr, filter) => {
        const t = new THREE.DataTexture(arr, G, G, THREE.RedFormat, THREE.UnsignedByteType);
        t.magFilter = filter;
        t.minFilter = filter;
        t.generateMipmaps = false;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.needsUpdate = true;
        return t;
    };
    const l1Tex = mkData(layer1, THREE.NearestFilter);
    const l2Tex = mkData(layer2, THREE.NearestFilter);
    const alphaTex = mkData(alpha, THREE.LinearFilter);
    const tileAvailability = new Uint8Array(MAX_TILE_SLOT);
    for (let slot = 0; slot < MAX_TILE_SLOT; slot++) tileAvailability[slot] = tileImgs[slot] ? 255 : 0;
    const availTex = new THREE.DataTexture(tileAvailability, MAX_TILE_SLOT, 1, THREE.RedFormat, THREE.UnsignedByteType);
    availTex.magFilter = THREE.NearestFilter;
    availTex.minFilter = THREE.NearestFilter;
    availTex.generateMipmaps = false;
    availTex.wrapS = availTex.wrapT = THREE.ClampToEdgeWrapping;
    availTex.needsUpdate = true;

    // ---- geometria: PlaneGeometry no plano XZ, MU(x,y,z↑) → three(x, z→y) ----
    // Convenção usada pelo mundo atual do web-port (Scene.js loadRealMap):
    //   plane rotation.x=-π/2; MU y+ = three -z.
    const size = G * CELL;
    // PC terrain has 256 *cells* of 100 units, with the last edge sampling
    // TERRAIN_INDEX_REPEAT(256,*) -> 0. G-1 segments stretched 255 cells over
    // 25600 units (~100.39 each), desynchronizing visual ground from
    // RequestTerrainHeight and making characters sink/float on slopes.
    const geometry = new THREE.PlaneGeometry(size, size, G, G);
    geometry.rotateX(-Math.PI / 2);
    const terrainTopology = applyPcTerrainGeometry(geometry, heights, opts.walls, opts.specialHeight ?? 1200);
    console.info(`[Terrain FIX27] World${worldIndex}: hidden TW_NOGROUND=${terrainTopology.hiddenCells}, rendered=${terrainTopology.renderedCells}`);

    // PC: RenderTerrainFace aplica fog linear (glFog GL_LINEAR). Para
    // ShaderMaterial com fog:true, THREE.WebGLRenderer.refreshFogUniforms
    // escreve uniforms.fogColor/fogNear/fogFar a CADA frame — o material
    // PRECISA declará-los (UniformsUtils.merge com UniformsLib.fog é o
    // contrato oficial three.js; sem isso refreshFogUniforms lança
    // "Cannot read properties of undefined (reading 'value')" e o render
    // do terreno morre silenciosamente no catch do loop — viewport chapado).
    const uniforms = THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
            uAtlas: { value: atlasTex },
            uTileAvailable: { value: availTex },
            uL1: { value: l1Tex },
            uL2: { value: l2Tex },
            uAlpha: { value: alphaTex },
            uLight: { value: lightTex },
            uSize: { value: size },
            // ZzzLodTerrain.cpp::WaterMove — ordinary map slot 5.
            uWaterMove: { value: 0 },
            // WD_7ATLANSE Layer2 slot5 -> BITMAP_WATER+WaterTextureNumber.
            uAtlansWater: { value: atlansWater.texture || atlasTex },
            uHasAtlansWater: { value: atlansWater.complete ? 1 : 0 },
            uWaterFrame: { value: 0 },
            uWorldIndex: { value: worldIndex },
        },
    ]);
    const material = new THREE.ShaderMaterial({
        uniforms,
        // PC: RenderTerrainFace aplica fog linear (glFog GL_LINEAR) — o
        // terreno PARTICIPA do fog da cena (login/world). ShaderMaterial
        // default fog:false; true + chunks below = renderer injeta
        // fogColor/fogNear/fogFar (THREE.WebGLRenderer.refreshFogUniforms).
        fog: true,
        vertexShader: /* glsl */`
            varying vec3 vWorld;
            #include <fog_pars_vertex>
            void main() {
                vec4 wp = modelMatrix * vec4(position, 1.0);
                vWorld = wp.xyz;
                // fog chunk: usa mvPosition (view-space) p/ vFogDepth
                vec4 mvPosition = viewMatrix * wp;
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }
        `,
        fragmentShader: /* glsl */`
            precision highp float;
            uniform sampler2D uAtlas, uTileAvailable, uL1, uL2, uAlpha, uLight, uAtlansWater;
            uniform float uSize, uWaterMove, uHasAtlansWater, uWaterFrame, uWorldIndex;
            varying vec3 vWorld;
            #include <fog_pars_fragment>

            float tileAvailable(float slot) {
                if (slot < -0.5 || slot > ${MAX_TILE_SLOT - 1}.5) return 0.0;
                return step(0.5, texture2D(uTileAvailable, vec2((slot + 0.5) / ${MAX_TILE_SLOT}.0, 0.5)).r);
            }

            vec4 sampleTile(float slot, vec2 inCell) {
                if (tileAvailable(slot) < 0.5) return vec4(0.0);
                vec2 cell = vec2(mod(slot, ${ATLAS_COLS}.0), floor(slot / ${ATLAS_COLS}.0));
                vec2 local = vec2(inCell.x, 1.0 - inCell.y);
                // PC FaceTexture(... Water=true): desloca somente U por WaterMove.
                if (abs(slot - 5.0) < 0.5) local.x = fract(local.x + uWaterMove);
                return texture2D(uAtlas, (cell + local) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0));
            }

            vec3 sampleAtlansWater(vec2 inCell) {
                float frame = floor(mod(uWaterFrame, 32.0));
                vec2 cell = vec2(mod(frame, 8.0), floor(frame / 8.0));
                vec2 local = vec2(inCell.x, 1.0 - inCell.y);
                return texture2D(uAtlansWater, (cell + local) / vec2(8.0, 4.0)).rgb;
            }

            void main() {
                // Célula MU: x = worldX, y = -worldZ (norte MU = -z three).
                vec2 mu = vec2(vWorld.x + uSize * 0.5, uSize * 0.5 - vWorld.z);
                vec2 cellf = floor(mu / ${CELL}.0);
                vec2 inCell = fract(mu / ${CELL}.0);
                vec2 cellUV = (cellf + 0.5) / ${G}.0;

                float l1 = floor(texture2D(uL1, cellUV).r * 255.0 + 0.5);
                float l2 = floor(texture2D(uL2, cellUV).r * 255.0 + 0.5);

                // Alpha/light são valores por vértice no PC (VertexAlpha0..3 e
                // PrimaryTerrainLight). Amostrar no centro da célula cria
                // faixas duras; gridUV passa pelos centros dos texels nos
                // vértices e interpola dentro da face.
                vec2 gridUV = (mu / ${CELL}.0 + 0.5) / ${G}.0;
                float a  = texture2D(uAlpha, gridUV).r;

                float has1 = tileAvailable(l1);
                float has2 = tileAvailable(l2);
                vec4 t1 = sampleTile(l1, inCell);
                vec4 t2 = sampleTile(l2, inCell);
                bool atlansWaterLayer = abs(uWorldIndex - 8.0) < 0.5 && abs(l2 - 5.0) < 0.5 && uHasAtlansWater > 0.5;

                // LoadBitmap failure is local on PC.  Never abort WorldN because
                // one indexed texture is absent.  Keep only real available
                // layers: missing L2 exposes authored L1; missing L1 may use L2.
                vec3 base = vec3(0.0);
                if (a >= 0.999 && has2 > 0.5) base = t2.rgb;
                else if (has1 > 0.5) base = t1.rgb;
                else if (has2 > 0.5) base = t2.rgb;

                if (!atlansWaterLayer && l2 <= ${MAX_TILE_SLOT - 1}.5 && has2 > 0.5 && has1 > 0.5 && a < 0.999) {
                    base = mix(t1.rgb, t2.rgb, a);
                }

                vec3 light = texture2D(uLight, gridUV).rgb;
                vec3 col = base * light;

                // Main 5.2 RenderFaceBlend on Atlans is GL_ONE,GL_ONE and the
                // vertex RGB is TerrainMappingAlpha.  This dynamic water is an
                // additive pass, not World8/TileWater01 and not a generic scroll.
                if (atlansWaterLayer) {
                    // Pure L2 with a missing static slot has no valid static base
                    // on the current Data; do not invent one underneath it.
                    if (a >= 0.999 && has2 < 0.5) col = vec3(0.0);
                    col += sampleAtlansWater(inCell) * a;
                }
                gl_FragColor = vec4(col, 1.0);
                // PC byte-space modulation: no output gamma transfer.
                #include <fog_fragment>
            }
        `,
        side: THREE.FrontSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    if (terrainGrass.group) mesh.add(terrainGrass.group);
    // ZzzLodTerrain.cpp::RenderTerrain: mundo normal usa período 20s.
    // Atualização por draw evita timer/loop paralelo e mantém a água viva nas
    // cenas de login/servidor/personagem e no mundo.
    mesh.onBeforeRender = () => {
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        material.uniforms.uWaterMove.value = (now % 20000) * 0.00005;
        // B101 ZzzScene.cpp: WaterTextureNumber advances at REFERENCE_FPS=25.
        material.uniforms.uWaterFrame.value = Math.floor(now / 40) % 32;
    };
    mesh.receiveShadow = false; // shader de terreno fiel ao PC usa lightmap, não shadow map
    mesh.userData.terrainTiles = tileSources.filter(Boolean);
    mesh.userData.missingTerrainTileSlots = missingTileSlots.slice();
    mesh.userData.atlansWaterFrames = atlansWater.frames;
    mesh.userData.terrainGrassEnabled = terrainGrass.enabled;
    mesh.userData.terrainGrassCells = terrainGrass.cells;
    mesh.userData.terrainGrassSources = terrainGrass.sources.slice();
    mesh.userData.backPrimaryTerrainLight = backPrimaryLight;
    mesh.userData.primaryTerrainLight = primaryLight;
    mesh.userData.sampleTerrainLight = (muX, muY, out = null) => samplePrimaryTerrainLight(primaryLight, muX, muY, out);
    mesh.userData.beginDynamicLightFrame = beginDynamicLightFrame;
    mesh.userData.addDynamicTerrainLight = addDynamicTerrainLight;
    mesh.userData.commitDynamicLightFrame = commitDynamicLightFrame;
    mesh.userData.dispose = () => {
        atlasTex.dispose();
        l1Tex.dispose();
        l2Tex.dispose();
        alphaTex.dispose();
        availTex.dispose();
        lightTex.dispose();
        if (atlansWater.texture) atlansWater.texture.dispose();
        for (const grass of terrainGrass.meshes) {
            try { grass.geometry?.dispose?.(); } catch (_) {}
            try { grass.material?.dispose?.(); } catch (_) {}
        }
        for (const texture of terrainGrass.textures) {
            try { texture?.dispose?.(); } catch (_) {}
        }
    };
    onStatus(`Terreno World${worldIndex} aplicado (slots usados=${usedSlots.size}, carregados=${tileSources.filter(Boolean).length}, ausentes=${missingTileSlots.length}, atlas ${atlasCanvas.width}×${atlasCanvas.height})`);
    return { mesh, heights, mapData, tileSources, primaryTerrainLight: primaryLight };
}

/**
 * Carrega e constrói o mesh do terreno REAL com leitura dos arquivos.
 *
 * @param {object} io { fetchBinary, fetchImageURL, THREE }
 * @param {number} worldIndex índice do world (ex.: 78)
 * @param {object} opts { loginScenes?: boolean, onStatus?: fn }
 * @returns {Promise<{mesh, heights, mapData, tileSources}>}
 */
export async function buildMuTerrain(io, worldIndex, opts = {}) {
    const { fetchBinary, fetchImageURL, THREE } = io;
    const onStatus = opts.onStatus || (() => {});
    const base = `World${worldIndex}`;

    onStatus(`Terreno: decodificando EncTerrain${worldIndex}.map...`);
    const mapCandidates = [
        `${base}/EncTerrain${worldIndex}.map`,
        `${base}/Encterrain${worldIndex}.map`,
    ];
    let mapBuf = null;
    for (const rel of mapCandidates) {
        const buf = await fetchBinary(rel).catch(() => null);
        if (buf) { mapBuf = new Uint8Array(buf); break; }
    }
    if (!mapBuf) throw new Error(`${mapCandidates.join(' | ')}: asset ausente`);
    const mapData = parseTerrainMap(mapBuf);

    onStatus('Terreno: alturas TerrainHeight.OZB...');
    const ozbBuf = new Uint8Array(await fetchBinary(`${base}/TerrainHeight.OZB`));
    const heights = parseTerrainHeights(ozbBuf);

    return createMuTerrainMesh({ fetchImageURL, THREE }, worldIndex, mapData, heights, opts);
}
