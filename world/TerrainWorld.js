/**
 * TerrainWorld.js — Pipeline de terreno REAL do cliente MU (port 1:1).
 *
 * Contratos (validados contra a source C++ e o port mobile iOS da própria
 * equipe — MUiOS/Engine/Terrain/TerrainData.swift):
 *
 *   ZzzLodTerrain.h:150  MapFileDecrypt — XOR 16 bytes + chave rolling
 *   ZzzLodTerrain.cpp:297 OpenTerrainMapping — [ver, mapNum, L1, L2, alpha]
 *   ZzzLodTerrain.cpp:121 OpenTerrainAttribute — decrypt → Bux(XOR3) →
 *                        [ver, mapNum, 255, 255] + walls BYTE (65540) ou
 *                        WORD (131076); sonda Lorencia wall[123*256+135]==5 ✓
 *   ZzzLodTerrain.cpp:619 OpenTerrainHeight — OZB: skip 4 + 1080 header +
 *                        256×256 bytes, altura = byte × 1.5
 *   MapManager.cpp:1441+  mapeamento base de tiles: 0=TileGrass01 1=TileGrass02
 *                        2=TileGround01/AlphaTileGround01 (login/char desta branch)
 *                        3-4=TileGround02-03 5=TileWater01 6=TileWood01
 *                        7-9=TileRock01-03 10=TileRock04/AlphaTile01 (login/char PJH)
 *                        11-13=Rock05-07, 14+=ExtTile01-16
 *   Widescreen.cpp:116    SceneLogin — câmera do login (World95)
 *   MuCamera.swift (mobile) — V = Ry(ay)·Rx(ax)·Rz(az)·T(-pos); Z-up;
 *                        main scene pitch -48.5 yaw -45
 *
 * TERRAIN_INDEX(x,y) = y*256+x; célula = 100 unidades; mapa = 25600×25600.
 */

import * as THREE from 'three';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { createMuTerrainMesh, tileFileCandidates } from '../graphics/MuTerrain.js';

export const TERRAIN_SIZE = 256;
export const TERRAIN_SCALE = 100;
export const CELL_COUNT = TERRAIN_SIZE * TERRAIN_SIZE;
export const MAP_SIZE = TERRAIN_SIZE * TERRAIN_SCALE; // 25600

// ---- TW flags (_define.h, via TerrainData.swift) ----
export const TW = {
  SAFE_ZONE: 0x0001,
  CHARACTER: 0x0002,
  NO_MOVE: 0x0004,
  NO_GROUND: 0x0008,
  WATER: 0x0010,
  ACTION: 0x0020,
  HEIGHT: 0x0040,
  CAMERA_UP: 0x0080,
  NO_ATTACK: 0x0100,
};

// ---- Crypto (ZzzLodTerrain.h, port validado: sonda Lorencia = 5) ----
const MAP_XOR_KEY = [0xD1, 0x73, 0x52, 0xF6, 0xD2, 0x9A, 0xCB, 0x27,
                     0x3E, 0xAF, 0x59, 0x31, 0x37, 0xB3, 0xE7, 0xA2];
const BUX_CODE = [0xFC, 0xCF, 0xAB];

export function mapFileDecrypt(src) {
  const dst = new Uint8Array(src.length);
  let w = 0x5E;
  for (let i = 0; i < src.length; i++) {
    dst[i] = ((src[i] ^ MAP_XOR_KEY[i % 16]) - w) & 0xFF;
    w = (src[i] + 0x3D) & 0xFF;
  }
  return dst;
}

export function buxConvert(buf) {
  const out = new Uint8Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ BUX_CODE[i % 3];
  return out;
}

// ---- Fetch helpers (RemoteAssets.fetchBinary → ArrayBuffer | null) ----
async function fetchBinary(path) {
  const buf = await RemoteAssets.fetchBinary(path);
  if (!buf) throw new Error(path + ': asset ausente');
  return new Uint8Array(buf);
}

/** Primeiro caminho existente entre variants (o cliente mistura casos:
 *  World1/EncTerrain1.map vs World95/Encterrain95.map — manifesto confirma). */
async function fetchFirstBinary(paths) {
  for (const p of paths) {
    const buf = await RemoteAssets.fetchBinary(p);
    if (buf) return new Uint8Array(buf);
  }
  throw new Error(paths.join(' | ') + ': todos ausentes');
}

// ---- Loaders (OpenTerrain*) ----

/** OpenTerrainAttribute: walls (colisão real). Legacy BYTE (65540) ou ext WORD (131076). */
export function parseAtt(raw) {
  const dec = buxConvert(mapFileDecrypt(raw));
  const isExt = dec.length === 4 + CELL_COUNT * 2; // 131076
  const isLegacy = dec.length === 4 + CELL_COUNT;  // 65540
  if (!isExt && !isLegacy) return null;
  const walls = new Uint16Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i++) {
    walls[i] = isExt
      ? ((dec[4 + i * 2] | (dec[4 + i * 2 + 1] << 8)) & 0xFF)
      : (dec[4 + i] & 0xFF);
  }
  return { mapNumber: dec[1], walls };
}

/** OpenTerrainMapping: L1/L2/alpha (tiles). */
export function parseMapping(raw) {
  if (raw.length < 2 + CELL_COUNT * 3) return null;
  const dec = mapFileDecrypt(raw);
  const o1 = 2, o2 = o1 + CELL_COUNT, o3 = o2 + CELL_COUNT;
  const layer1 = dec.slice(o1, o1 + CELL_COUNT);
  const layer2 = dec.slice(o2, o2 + CELL_COUNT);
  const alpha = new Float32Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i++) alpha[i] = dec[o3 + i] / 255;
  return { mapNumber: dec[1], layer1, layer2, alpha };
}

/** OpenTerrainHeight (ZzzLodTerrain.cpp:647: fseek(4) + header BMP + 256×256 alturas ×1.5).
 *  Regra robusta validada fisicamente: as alturas são os ÚLTIMOS 65536 bytes do
 *  arquivo — o header BMP varia por mundo (World95=1078B/66618 total, World78=1080B/66620). */
export function parseHeightsOld(ozb) {
  const off = ozb.length - CELL_COUNT;
  const heights = new Float32Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i++) {
    heights[i] = (ozb[off + i] || 0) * 1.5;
  }
  return heights;
}

/** Tiles do mundo (MapManager.cpp:1441+) — índice → arquivo real. */
export function tileFiles(worldNum, loginScene = false) {
  const w = `World${worldNum}`;
  const files = [];
  for (let slot = 0; slot < 30; slot++) {
    const [primary] = tileFileCandidates(slot, loginScene, worldNum);
    if (primary) files.push(String(primary).startsWith('@/') ? String(primary).slice(2) : `${w}/${primary}`);
  }
  return files;
}

/** Warm only the authoritative terrain bytes for a target WorldN.
 * RemoteAssets owns the memory/browser cache; no parsing/GPU work is done here.
 * This is safe to run from Character Select and removes map/ATT/height network
 * latency from world entry without dropping objects, effects or texture quality. */
export async function prefetchWorldTerrainCore(worldNum, { signal = null, attVariant = '' } = {}) {
  const w=Number(worldNum)|0;
  if (!(w > 0)) return { worldNum:w, warmed:0, total:3, aborted:false };
  const groups=[
    [`World${w}/EncTerrain${w}.map`,`World${w}/Encterrain${w}.map`],
    [`World${w}/EncTerrain${w}.att${attVariant}`,`World${w}/Encterrain${w}.att${attVariant}`,`World${w}/encterrain${w}.att${attVariant}`],
    [`World${w}/TerrainHeight.OZB`],
  ];
  let warmed=0;
  for (const candidates of groups) {
    if (signal?.aborted) return { worldNum:w,warmed,total:groups.length,aborted:true };
    let ok=false;
    for (const path of candidates) {
      if (signal?.aborted) return { worldNum:w,warmed,total:groups.length,aborted:true };
      try { if (await RemoteAssets.fetchBinary(path)) { ok=true; break; } } catch { /* next exact case variant */ }
    }
    if (ok) warmed++;
  }
  return { worldNum:w,warmed,total:groups.length,aborted:Boolean(signal?.aborted) };
}

/**
 * Constrói a malha de terreno REAL de um mundo.
 * Retorna { mesh, heights, walls, group } — mesh com textura de tiles L1+L2.
 * Convenção MU→Three: MU(x, y, z↑) → Three(x, z, y↑) = (mu.x, mu.z, mu.y).
 * O mapa MU cobre x∈[0,25600], y∈[0,25600]; a malha é centrada na origem
 * (célula MU (0,0) → Three (-12800, +12800)).
 */
export async function buildWorldTerrain(worldNum, { loginScene = false, attVariant = '' } = {}) {
  // Variants de caso reais do cliente: World1/EncTerrain1.* vs World95/Encterrain95.*
  const mapVariants = [
    `World${worldNum}/EncTerrain${worldNum}.map`,
    `World${worldNum}/Encterrain${worldNum}.map`,
  ];
  const attVariants = [
    `World${worldNum}/EncTerrain${worldNum}.att${attVariant}`,
    `World${worldNum}/Encterrain${worldNum}.att${attVariant}`,
    `World${worldNum}/encterrain${worldNum}.att${attVariant}`,
  ];
  const [mapRaw, attRaw, ozbRaw] = await Promise.all([
    fetchFirstBinary(mapVariants),
    fetchFirstBinary(attVariants).catch(() => null),
    fetchBinary(`World${worldNum}/TerrainHeight.OZB`),
  ]);

  const mapping = parseMapping(mapRaw);
  if (!mapping) throw new Error(`EncTerrain${worldNum}.map inválido`);
  const att = attRaw ? parseAtt(attRaw) : null;
  const heights = parseHeightsOld(ozbRaw);

  // ---- visual REAL: atlas + shader (cada célula mostra o tile inteiro) ----
  // Substitui o raster 8px/célula que perdia o detalhe das texturas e deixava
  // o mundo “manchado”. O mesh é fiel ao pipeline do PC (OpenTerrainMapping +
  // OpenTerrainHeight + FaceTexture com GL_NEAREST/GL_REPEAT) e vem pronto de
  // MuTerrain.js; walls/heights abaixo continuam no contrato antigo.
  // R83 source correction. Under PJH_NEW_SERVER_SELECT_MAP the PC does NOT
  // apply one generic "login tile table" to Character Select. WorldActive 74
  // (asset World75) keeps normal TileGround01 in slot2 and overwrites only
  // BITMAP_MAPTILE+10 with AlphaTile01. WorldActive 51 (asset World52) owns
  // AlphaTileGround01 in slot2 separately. The retained custom World95 login
  // scene is the only caller that still uses the legacy two-alpha layout.
  const legacyLoginTileLayout = loginScene && worldNum === 95;
  const visual = await createMuTerrainMesh(
    { fetchImageURL: (p) => RemoteAssets.fetchImageURL(p), THREE },
    worldNum,
    mapping,
    heights,
    { loginScenes: legacyLoginTileLayout },
  );
  const mesh = visual.mesh;

  return {
    mesh,
    heights,
    walls: att ? att.walls : null,
    mapping,
    mapNumber: mapping.mapNumber,
  };
}

/**
 * Aplica câmera MU em Three preservando a MATRIZ DE VIEW do cliente.
 *
 * Main/mobile: Vrot = Ry(ay) · Rx(ax) · Rz(az), sistema MU Z-up.
 * A orientação world da câmera é inverse(Vrot). A base do MUNDO MU vira
 * Three com C = Rx(-90°), enquanto o espaço local da câmera já é o espaço
 * OpenGL convencional; portanto Rthree = C · inverse(Vrot).
 *
 * A versão anterior atribuía ax/az diretamente em Euler YXZ do Three; isso
 * não é equivalente e fazia login/char olhar para direção errada.
 */
export function applyMuCamera(camera, { position, angles, fov, far }) {
  const [px, py, pz] = position;
  const [ax, ay, az] = angles;
  camera.position.set(px - MAP_SIZE / 2, pz, MAP_SIZE / 2 - py);

  const rx = new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(ax));
  const ry = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(ay));
  const rz = new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(az));
  const viewRotMu = ry.clone().multiply(rx).multiply(rz);
  const cameraRotMu = viewRotMu.clone().invert();

  const basis = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  const threeRot = basis.clone().multiply(cameraRotMu);
  camera.quaternion.setFromRotationMatrix(threeRot);

  if (fov) camera.fov = fov;
  // BeginOpengl: near=CameraViewNear(20), far=CameraViewFar*1.4.
  camera.near = 20;
  if (far) camera.far = far * 1.4;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

// Câmeras oficiais (Widescreen.cpp:116 SceneLogin / SceneFlag == CHARACTER_SCENE)
export const LOGIN_CAMERA = {
  position: [24475.79687, 7581.581055, 1834.539917],
  angles: [-84.0, 0.0, -45.0],
  fov: 35, far: 33000,
};
export const CHAR_CAMERA = {
  // Final camera that actually reaches the Character Scene render in the PC
  // branch after GWidescreen.SceneLogin() overwrites the intermediate values.
  // Android PC-parity work reproduced these exact values and specifically
  // removed the giant-grass / wrong-horizon composition produced by the
  // intermediate 675.5/-84.5/-75 camera.
  position: [9758.9297, 18913.109, 500.0],
  angles: [-82.0, 0.0, -90.0],
  fov: 35, far: 3500,
};
