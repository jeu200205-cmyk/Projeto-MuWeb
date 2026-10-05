import { createCooperativeLoadBudget } from './CooperativeLoadBudget.js';
/**
 * TerrainObjectWorld.js — EncTerrain*.obj -> ObjectXX/ObjectNN.bmd.
 *
 * Formato legado documentado e compatível com o layout observado:
 *   header 4 bytes, count = uint16 LE em offset 2
 *   N entradas de 30 bytes = uint16 serial + 7 floats LE
 *   serial 0 -> Object01.bmd, 1 -> Object02.bmd ...
 *   floats: x,y,z, angleX,angleY,angleZ, scale
 *
 * O arquivo EncTerrain*.obj usa a mesma família MapFileDecrypt dos mapas.
 */
import * as THREE from 'three';
import {WORLD75_LIGHT_SPRITE_PATH,loadWorld75LightTexture} from './PcWorld75LightTexture.js';
import {hasPcLoginObjectPresentation,installPcLoginObjectPresentation} from './PcLoginObjectPresentation.js';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { MUAssets } from '../assets/MUAssetLoader.js';
import { MUModelRenderer, RenderFlags } from '../assets/MUModelRenderer.js';
import { applyMuUpAxis } from '../graphics/BmdAdapter.js';
import { mapFileDecrypt, MAP_SIZE, TERRAIN_SCALE } from './TerrainWorld.js';
import { createPcWorld75ParticleOwner, PC_WORLD75_PARTICLE_SERIALS } from './PcWorld75Particles.js';
import { createPcLorenciaVisualOwner, createPcLorenciaBoneVisualOwner, PC_LORENCIA_RUNTIME_VISUAL_SERIALS, PC_LORENCIA_HIDDEN_EMITTER_SERIALS } from './PcLorenciaVisuals.js';
import { createPcMapBoneVisualOwner, createPcMapDynamicTerrainLightOwner, createPcMapWorldVisualOwner, hasPcMapBoneVisual, hasPcMapRuntimePresentation, installPcMapRuntimePresentation, pcMapHideBaseBmd, pcMapObjectPlaySpeed } from './PcMapObjectVisuals.js';
import {pcIndoorObject,pcIndoorAlphaTarget,pcTerrainTileAt,stepPcIndoorAlpha} from './PcIndoorVisibility.js';
import { createPcMapParticleOwner, hasPcMapParticleVisual } from './PcMapParticles.js';
import { createPcIcarusEnvironmentOwner } from './PcIcarusEnvironment.js';
import { createPcLorenciaFaunaOwner } from './PcLorenciaFauna.js';
import { createPcLorenciaEnvironmentOwner } from './PcLorenciaEnvironment.js';
import { createPcLorenciaFishOwner } from './PcLorenciaFish.js';

const ENTRY_SIZE = 30;
const HEADER_SIZE = 4;
const BASIS = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
const BASIS_INV = BASIS.clone().invert();


const LORENCIA_STATIC_DYNAMIC_LIGHT_SERIALS = new Set([90, 150]);
function createLorenciaStaticDynamicLightOwner(gameScene, placements) {
  const sources = (placements || []).filter((o) => LORENCIA_STATIC_DYNAMIC_LIGHT_SERIALS.has(o.serial | 0));
  if (!sources.length) return null;
  const owner = new THREE.Object3D();
  owner.name = 'Lorencia_DynamicPrimaryTerrainLight';
  owner.userData.muPcOwner = 'ZzzObject.cpp/AddTerrainLight';
  owner.userData.update = () => {
    for (const o of sources) {
      const serial = o.serial | 0;
      if (serial === 90) {
        // MODEL_STREET_LIGHT: rand()%2+6, range 3.
        const lum = (Math.floor(Math.random() * 2) + 6) * 0.1;
        gameScene.addDynamicTerrainLightMu?.(o.x, o.y, [lum, lum * 0.8, lum * 0.6], 3);
      } else if (serial === 150) {
        // MODEL_CANDLE: rand()%4+3, range 3.
        const lum = (Math.floor(Math.random() * 4) + 3) * 0.1;
        gameScene.addDynamicTerrainLightMu?.(o.x, o.y, [lum, lum * 0.6, lum * 0.2], 3);
      }
    }
  };
  return owner;
}
// Structural bridge models are visually sensitive to the static skin-bake /
// transport merge path.  Preserve their real BMD meshes/materials/placements via
// the normal shared-template clone lane; no geometry or replacement asset is added.
const STRUCTURAL_FULL_FIDELITY_SERIALS = new Set([80, 85]); // Object81 Bridge01, Object86 BridgeStone01

// World75 source-owned one-frame sprite visuals.  GMEmpireGuardian4::
// RenderObjectVisual calls CreateSprite(BITMAP_LIGHT, ...) every frame for
// OBJECT::Type 79/80.  The desktop sprite is a camera-facing flare01.jpg quad,
// GL_ONE/GL_ONE, no depth write and no fog.  Keep a persistent Three Sprite per
// placement (same rendered result as the PC's create->render->retire cycle) and
// update only the authored time-varying light for type 80. R74 also wires the
// exact B101 World75 particle/effect-child owners from PcWorld75Particles.js.

export function pcWorld75VisualSpriteSpec(serial, scale = 1, worldMs = 0) {
  const type = Number(serial) | 0;
  const objectScale = Number.isFinite(Number(scale)) ? Number(scale) : 1;
  if (type === 79) {
    return Object.freeze({
      bitmap: 'BITMAP_LIGHT', path: WORLD75_LIGHT_SPRITE_PATH,
      scale: 2.0 * objectScale, light: Object.freeze([1.0, 0.2, 0.0]), subtype: 0,
      particlesFailClosed: false,
    });
  }
  if (type === 80) {
    const fLumi = (Math.sin((Number(worldMs) || 0) * 0.04) + 1.0) * 0.3 + 0.4;
    return Object.freeze({
      bitmap: 'BITMAP_LIGHT', path: WORLD75_LIGHT_SPRITE_PATH,
      scale: 8.0 * objectScale,
      light: Object.freeze([fLumi * 0.1, fLumi * 0.1, fLumi * 0.5]), subtype: 0,
      particlesFailClosed: false,
    });
  }
  return null;
}

async function createPcWorld75VisualSprite(serial, obj, worldPosition) {
  const initial = pcWorld75VisualSpriteSpec(serial, obj?.scale, 0);
  if (!initial) return null;
  const loaded = await loadWorld75LightTexture();
  if (!loaded) return null;
  const material = new THREE.SpriteMaterial({
    map: loaded.texture,
    color: new THREE.Color().setRGB(...initial.light),
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  material.name = `PC_World75_${initial.bitmap}_Type${Number(serial)|0}`;
  const sprite = new THREE.Sprite(material);
  sprite.name = `World75_Type${Number(serial)|0}_${initial.bitmap}`;
  sprite.position.copy(worldPosition);
  sprite.scale.set(loaded.width * initial.scale, loaded.height * initial.scale, 1);
  sprite.frustumCulled = true;
  sprite.userData.muPcVisualOwner = 'GMEmpireGuardian4::RenderObjectVisual';
  sprite.userData.muPcBitmap = initial.bitmap;
  sprite.userData.muPcBitmapPath = initial.path;
  sprite.userData.muPcSpriteSubtype = initial.subtype;
  sprite.userData.muPcParticlesFailClosed = initial.particlesFailClosed;
  if ((Number(serial) | 0) === 80) {
    sprite.userData.update = (_dt, _self, elapsedSeconds) => {
      // Scene passes only dt/obj, so keep source WorldTime locally in ms.
      const prev = Number(sprite.userData.muWorldMs) || 0;
      const next = Number.isFinite(Number(elapsedSeconds)) ? Number(elapsedSeconds) * 1000 : prev + Math.max(0, Number(_dt) || 0) * 1000;
      sprite.userData.muWorldMs = next;
      const spec = pcWorld75VisualSpriteSpec(80, obj?.scale, next);
      material.color.setRGB(...spec.light);
    };
  }
  return sprite;
}

export function parseTerrainObjects(raw) {
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  if (bytes.length < HEADER_SIZE) throw new Error('EncTerrain.obj curto demais');
  const dec = mapFileDecrypt(bytes);
  const dv = new DataView(dec.buffer, dec.byteOffset, dec.byteLength);
  const count = dv.getUint16(2, true);
  const need = HEADER_SIZE + count * ENTRY_SIZE;
  if (count > 10000 || need > dec.length) {
    throw new Error(`EncTerrain.obj header inválido: count=${count} bytes=${dec.length} need=${need}`);
  }
  const objects = [];
  let off = HEADER_SIZE;
  let skippedNull = 0, skippedCorrupt = 0;
  for (let i = 0; i < count; i++, off += ENTRY_SIZE) {
    const serial = dv.getUint16(off, true);
    const x = dv.getFloat32(off + 2, true);
    const y = dv.getFloat32(off + 6, true);
    const z = dv.getFloat32(off + 10, true);
    const angleX = dv.getFloat32(off + 14, true);
    const angleY = dv.getFloat32(off + 18, true);
    const angleZ = dv.getFloat32(off + 22, true);
    const scale = dv.getFloat32(off + 26, true);
    const nums = [x, y, z, angleX, angleY, angleZ, scale];
    // PC autoridade (ZzzObject.cpp:5144-5152 OpenObjectsEnc): NÃO valida —
    // chama CreateObject() até para entries nulos (scale=0 = invisível na origem).
    // Na web: throw aqui descartava o mapa INTEIRO (Lorencia vazia R12.4 físico).
    // Equivalente-fiel: pula slots nulos/invisíveis e entradas não-finitas (que o PC
    // também não renderizaria), mas nunca aborta a carga do restante.
    if (!nums.every(Number.isFinite)) { skippedCorrupt++; continue; }
    if (scale <= 0 && x === 0 && y === 0 && serial === 0) { skippedNull++; continue; }
    objects.push({ serial, x, y, z, angleX, angleY, angleZ, scale });
  }
  if (skippedNull || skippedCorrupt) {
    console.info(`[WorldObjects] EncTerrain entries nulos/corruptos pulados (paridade PC): null=${skippedNull} corrupt=${skippedCorrupt} ok=${objects.length}`);
  }
  return { count, objects, trailingBytes: dec.length - need };
}

export function muObjectPositionToThree(obj, out = new THREE.Vector3()) {
  return out.set(obj.x - MAP_SIZE / 2, obj.z, MAP_SIZE / 2 - obj.y);
}

/** Converte a rotação local MU Z-up para Three Y-up por mudança de base. */
export function muObjectQuaternion(obj, out = new THREE.Quaternion()) {
  const rx = new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(obj.angleX));
  const ry = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(obj.angleY));
  const rz = new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(obj.angleZ));
  // AngleMatrix legado: composição local XYZ representada por Rz*Ry*Rx.
  const rMu = rz.clone().multiply(ry).multiply(rx);
  const rThree = BASIS.clone().multiply(rMu).multiply(BASIS_INV);
  return out.setFromRotationMatrix(rThree).normalize();
}

/**
 * R13 Stage WEB-PERF: congela a pose bind de um SkinnedMesh estático em uma
 * BufferGeometry normal. Isto permite THREE.InstancedMesh SEM perder o
 * skinning bind-pose do BMD. Modelos com action/animation NÃO usam este path.
 * Nenhum placement/mesh é removido; só muda a forma de envio à GPU.
 */
export function bakeStaticSkinnedGeometry(mesh) {
  const src = mesh?.geometry;
  if (!src?.getAttribute?.('position')) throw new Error('mesh sem position');
  const geo = src.clone();
  const pos = src.getAttribute('position');
  const out = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();

  if (mesh.isSkinnedMesh && src.getAttribute('skinIndex') && src.getAttribute('skinWeight')) {
    mesh.skeleton?.update?.();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      mesh.applyBoneTransform(i, v);
      out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
    geo.deleteAttribute('skinIndex');
    geo.deleteAttribute('skinWeight');
    // Keep PC-authored smoothing and Normal_t.Node. Rebuilding triangle
    // normals changes illumination at UV seams and across static props.
    const normals = src.getAttribute('normal');
    if (normals) {
      const normalNodes = src.getAttribute('normalSkinIndex');
      const skinNodes = src.getAttribute('skinIndex');
      const weights = src.getAttribute('skinWeight');
      const transformed = new Float32Array(normals.count * 3);
      const boneMatrix = new THREE.Matrix4();
      const skinMatrix = new THREE.Matrix4();
      const rotation = new THREE.Matrix3();
      for (let i = 0; i < normals.count; i++) {
        if (normalNodes) {
          boneMatrix.fromArray(mesh.skeleton.boneMatrices, normalNodes.getX(i) * 16);
        } else {
          // Retain Three's weighted normal skinning for non-BMD geometry.
          boneMatrix.elements.fill(0);
          for (let lane = 0; lane < 4; lane++) {
            const node = skinNodes.array[i * 4 + lane];
            const weight = weights.array[i * 4 + lane];
            if (!weight) continue;
            for (let k = 0; k < 16; k++) boneMatrix.elements[k] += mesh.skeleton.boneMatrices[node * 16 + k] * weight;
          }
        }
        skinMatrix.multiplyMatrices(mesh.bindMatrixInverse, boneMatrix).multiply(mesh.bindMatrix);
        rotation.setFromMatrix4(skinMatrix);
        v.fromBufferAttribute(normals, i).applyMatrix3(rotation);
        transformed[i * 3] = v.x; transformed[i * 3 + 1] = v.y; transformed[i * 3 + 2] = v.z;
      }
      geo.setAttribute('normal', new THREE.BufferAttribute(transformed, 3));
    } else geo.computeVertexNormals();
    geo.deleteAttribute('normalSkinIndex');
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/** Matriz que substitui outer(position/rotation/scale) -> inner(MU Z-up) -> child. */
export function staticPlacementMatrix(obj, child = null, out = new THREE.Matrix4()) {
  const pos = muObjectPositionToThree(obj, new THREE.Vector3());
  const quat = muObjectQuaternion(obj, new THREE.Quaternion());
  const scl = new THREE.Vector3(obj.scale, obj.scale, obj.scale);
  const outer = new THREE.Matrix4().compose(pos, quat, scl);
  const childLocal = child ? child.matrix.clone() : new THREE.Matrix4();
  return out.copy(outer).multiply(BASIS).multiply(childLocal);
}

// R15.4: vários ObjectXX.bmd dividem a mesma textura/material entre submeshes.
// Instanciar cada submesh separadamente multiplica draw calls por cluster. Para
// props ESTÁTICOS podemos fundir apenas geometrias com material efetivamente
// equivalente, preservando exatamente triângulos/UV/normais e producer visual.
// O merge é fail-closed: qualquer diferença de atributos/material mantém o path
// antigo. Nenhum placement, triângulo ou material é descartado.
export function staticMaterialKey(mat) {
  if (!mat) return 'null';
  const map = mat.map?.source?.uuid || mat.map?.uuid || 'nomap';
  const color = mat.color?.getHexString?.() || '';
  return [mat.type, map, color, mat.transparent ? 1 : 0, Number(mat.alphaTest || 0),
    mat.depthWrite ? 1 : 0, mat.depthTest ? 1 : 0, mat.side, mat.blending,
    Number(mat.opacity ?? 1), Number(mat.metalness ?? 0), Number(mat.roughness ?? 1), mat.vertexColors ? 1 : 0].join('|');
}

export function mergeStaticGeometries(parts) {
  if (!parts?.length) return null;
  const geos = [];
  try {
    for (const part of parts) {
      let g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      g.applyMatrix4(part.matrix);
      // R73 visual parity: CPU transport merges must not erase the per-object
      // BodyLight that existed as InstancedMesh.instanceColor.  When a part
      // carries an authored placement color, expand it to a normal vertex-color
      // attribute before concatenation; the BMD shader consumes this as a
      // second BodyLight multiplier only on the merged material clone.
      if (part.color) {
        const count = g.getAttribute('position')?.count || 0;
        const c = part.color;
        const arr = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          arr[i*3] = c.r; arr[i*3+1] = c.g; arr[i*3+2] = c.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      }
      geos.push(g);
    }
    const names = Object.keys(geos[0].attributes).sort();
    if (!names.includes('position')) return null;
    const sig = names.map(n => { const a=geos[0].getAttribute(n); return `${n}:${a.itemSize}:${a.normalized?1:0}:${a.array.constructor.name}`; }).join(',');
    for (const g of geos) {
      const ns = Object.keys(g.attributes).sort();
      const gs = ns.map(n => { const a=g.getAttribute(n); return `${n}:${a.itemSize}:${a.normalized?1:0}:${a.array.constructor.name}`; }).join(',');
      if (gs !== sig) return null;
    }
    const out = new THREE.BufferGeometry();
    for (const name of names) {
      const first = geos[0].getAttribute(name);
      const Ctor = first.array.constructor;
      let total = 0; for (const g of geos) total += g.getAttribute(name).array.length;
      const arr = new Ctor(total);
      let off = 0;
      for (const g of geos) { const src=g.getAttribute(name).array; arr.set(src, off); off += src.length; }
      out.setAttribute(name, new THREE.BufferAttribute(arr, first.itemSize, first.normalized));
    }
    out.computeBoundingBox(); out.computeBoundingSphere();
    return out;
  } finally {
    for (const g of geos) try { g.dispose?.(); } catch (_) {}
  }
}

function staticInstancingEnabled() {
  // Escape hatch apenas para diagnóstico visual. Default = ON.
  return !(typeof window !== 'undefined' && window.__MU_DISABLE_STATIC_INSTANCING === true);
}

// R15.2: o PC NÃO envia todos os objetos estáticos do mapa em um batch global.
// ZzzObject.cpp::RenderObjects testa frustum por bloco/objeto. O R13 reduziu
// draw calls, mas um InstancedMesh por serial juntava placements espalhados
// pelo mapa inteiro: o boundingSphere agregado quase sempre ficava visível e
// a GPU desenhava milhares de instâncias fora da câmera. Mantemos instancing,
// porém em clusters espaciais; nenhum placement é removido e o frustum do
// Three volta a descartar regiões inteiras, equivalente à intenção do PC.
// R15.5 physical-frame budget: o teste real mostrou ~1697 calls e renderSubmit
// ~131-152 ms mesmo após o mapa entrar. 64 tiles ainda pode criar até 16
// clusters/serial em um mapa 256x256. 128 tiles limita a no máximo 4 regiões
// por serial e preserva frustum regional (ao contrário do antigo batch global).
// Nenhum placement/triângulo/material é removido. Override diagnóstico continua.
const DEFAULT_STATIC_BATCH_TILES = 128;
function staticBatchTiles() {
  if (typeof window !== 'undefined') {
    const n = Number(window.__MU_STATIC_BATCH_TILES);
    if (Number.isFinite(n) && n >= 4 && n <= 256) return Math.floor(n);
  }
  return DEFAULT_STATIC_BATCH_TILES;
}

export function spatialBatchKey(obj, chunkTiles = DEFAULT_STATIC_BATCH_TILES) {
  const worldSize = Math.max(TERRAIN_SCALE, TERRAIN_SCALE * Math.max(1, chunkTiles | 0));
  const cx = Math.floor(Number(obj?.x || 0) / worldSize);
  const cy = Math.floor(Number(obj?.y || 0) / worldSize);
  return `${cx},${cy}`;
}

export function partitionSpatialPlacements(placements, chunkTiles = DEFAULT_STATIC_BATCH_TILES) {
  const groups = new Map();
  for (const item of placements || []) {
    const key = spatialBatchKey(item.obj || item, chunkTiles);
    let arr = groups.get(key);
    if (!arr) groups.set(key, arr = []);
    arr.push(item);
  }
  return groups;
}

// R15.7 PERF: serials estáticos espacialmente compactos não precisam pagar
// múltiplos draws só porque atravessam uma borda artificial do grid de 128
// tiles. Se TODO o conjunto cabe em uma caixa <=64x64 tiles, mantemos um único
// cluster. O boundingSphere/Box do InstancedMesh continua sendo calculado sobre
// todas as instâncias reais, então o frustum segue fail-closed: nada é removido,
// nenhuma distância/LOD é alterada e serials espalhados continuam no grid R15.5.
const COMPACT_SERIAL_SPAN_TILES = 64;
export function partitionAdaptiveSpatialPlacements(placements, chunkTiles = DEFAULT_STATIC_BATCH_TILES, compactSpanTiles = COMPACT_SERIAL_SPAN_TILES) {
  const items = placements || [];
  if (items.length <= 1) return new Map(items.length ? [['compact', items]] : []);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const item of items) {
    const o = item.obj || item;
    const x = Number(o?.x || 0), y = Number(o?.y || 0);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const limit = Math.max(1, compactSpanTiles) * TERRAIN_SCALE;
  if ((maxX - minX) <= limit && (maxY - minY) <= limit) return new Map([['compact', items]]);
  return partitionSpatialPlacements(items, chunkTiles);
}

// R15.8 PERF: second-stage transport compaction. R15.4/R15.7 already
// produce exact static InstancedMesh batches, but each geometry still costs one
// renderer submission. THREE.BatchedMesh can submit DIFFERENT static geometries
// sharing the exact material state in one multi-draw batch while retaining
// per-object frustum culling. This pass is deliberately fail-closed: opaque only,
// identical attribute layout/index mode, positive transforms, and runtime feature
// detection. Any unsupported/failed group remains on the proven InstancedMesh path.
export function staticGeometryLayoutKey(geometry) {
  if (!geometry?.attributes?.position) return null;
  const names = Object.keys(geometry.attributes).sort();
  const attrs = names.map((n) => {
    const a = geometry.getAttribute(n);
    return `${n}:${a.itemSize}:${a.normalized ? 1 : 0}:${a.array?.constructor?.name || ''}`;
  }).join(',');
  return `${geometry.index ? 'idx' : 'nonidx'}|${attrs}`;
}

export function compactStaticInstancedTransport(root, meshes, options = {}) {
  const result = { multiDrawSupported: options.multiDrawSupported !== false, attemptedGroups: 0, batchedGroups: 0, sourceDraws: 0, batchedDraws: 0, sourceInstances: 0, expandedVertices: 0, expandedIndices: 0, skippedBudget: 0, packingCandidates: 0, packingSelected: 0, packingSavedDraws: 0, mode: 'none' };
  if (!THREE.BatchedMesh || !Array.isArray(meshes) || meshes.length < 2) return result;
  // R15.11 PERF: BatchedMesh only reduces physical GPU submissions on r160
  // when WEBGL_multi_draw exists. Without it Three's WebGL backend explicitly
  // loops render() once per internal geometry ID; the old path would therefore
  // duplicate geometry memory and culling work without reducing real draws.
  // Production passes the renderer capability here and fails closed to the
  // proven InstancedMesh transport when the extension is unavailable.
  if (options.multiDrawSupported === false) {
    result.mode = 'unsupported-no-webgl-multi-draw';
    return result;
  }
  // three r160 (project-pinned) has BatchedMesh geometryId->matrix but no
  // addInstance(). R15.9 extends R15.8 safely: repeated r160 geometry IDs are
  // allowed only inside a strict upload budget. This duplicates vertex/index
  // bytes inside BatchedMesh (not visual content) so multi-instance clusters can
  // join cross-serial multi-draw without an unbounded World1 memory explosion.
  // Newer Three keeps the zero-duplication addInstance path automatically.
  const modernInstances = typeof THREE.BatchedMesh.prototype?.addInstance === 'function';
  result.mode = modernInstances ? 'instances' : 'r160-budgeted-repeat';
  const R160_MAX_EXPANDED_VERTICES = 180000;
  const R160_MAX_EXPANDED_INDICES = 360000;
  const R160_MAX_GEOMETRY_IDS = 256;
  const groups = new Map();
  for (const mesh of meshes) {
    const mat = mesh?.material;
    const layout = staticGeometryLayoutKey(mesh?.geometry);
    if (!mat || mat.transparent || !layout || !mesh.count) continue;
    const key = `${staticMaterialKey(mat)}||${layout}`;
    let arr = groups.get(key); if (!arr) groups.set(key, arr = []);
    arr.push(mesh);
  }
  for (const rawSource of groups.values()) {
    if (rawSource.length < 2) continue; // one InstancedMesh is already one draw
    result.attemptedGroups++;
    try {
      // r160: choose a deterministic bounded prefix of source meshes. A source
      // is indivisible: either all of its instances move to BatchedMesh or none,
      // preserving placement count and atomic fallback semantics.
      let source = rawSource;
      if (!modernInstances) {
        // R15.10 PERF: draw-save packing. Source order in the OBJ/model table is
        // not a useful packing heuristic for opaque exact-state geometry. The old
        // deterministic prefix could let one very expensive mesh consume the
        // whole upload budget and leave many cheap source draws unbatched. Rank
        // indivisible sources by upload cost, then greedily admit the cheapest.
        // This changes transport only: matrices, geometry, material and placement
        // count remain byte-for-byte sourced from the same meshes. Ties retain
        // original order for deterministic builds.
        const candidates = rawSource.map((m, order) => ({
          m, order,
          vertices: m.geometry.getAttribute('position').count * m.count,
          indices: (m.geometry.index?.count || 0) * m.count,
          ids: m.count,
        }));
        result.packingCandidates += candidates.length;
        candidates.sort((a, b) =>
          (a.vertices - b.vertices) || (a.indices - b.indices) || (a.ids - b.ids) || (a.order - b.order));
        const chosen = [];
        let vertices = 0, indices = 0, ids = 0;
        for (const c of candidates) {
          if (ids + c.ids > R160_MAX_GEOMETRY_IDS || vertices + c.vertices > R160_MAX_EXPANDED_VERTICES || indices + c.indices > R160_MAX_EXPANDED_INDICES) {
            result.skippedBudget++;
            continue;
          }
          chosen.push(c); vertices += c.vertices; indices += c.indices; ids += c.ids;
        }
        // Restore original source order inside the batch. Opaque exact-state
        // rendering does not require it, but preserving it makes the transport
        // diff easier to audit and avoids accidental ordering assumptions.
        chosen.sort((a, b) => a.order - b.order);
        source = chosen.map((c) => c.m);
        result.packingSelected += source.length;
        if (source.length < 2) continue;
      }

      const geometryList = modernInstances ? [...new Set(source.map((m) => m.geometry))] : source.map((m) => m.geometry);
      const maxInstances = source.reduce((n, m) => n + m.count, 0);
      const maxVertices = modernInstances
        ? geometryList.reduce((n, g) => n + g.getAttribute('position').count, 0)
        : source.reduce((n, m) => n + m.geometry.getAttribute('position').count * m.count, 0);
      const indexed = !!geometryList[0].index;
      const maxIndices = indexed
        ? (modernInstances
          ? geometryList.reduce((n, g) => n + g.index.count, 0)
          : source.reduce((n, m) => n + m.geometry.index.count * m.count, 0))
        : Math.max(maxVertices * 2, 1);
      if (!maxInstances || !maxVertices) continue;
      const local = new THREE.Matrix4();
      let safe = true;
      for (const m of source) {
        for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, local); if (!(local.determinant() > 0)) { safe = false; break; } }
        if (!safe) break;
      }
      if (!safe) continue;

      const maxGeometryCount = modernInstances ? maxInstances : maxInstances;
      const sourceHasBodyLight = source.some((m) => !!m.instanceColor);
      // Current project is Three r160: BatchedMesh has geometryId->matrix but no
      // per-geometry color API. Clone the shared shader material and enable the
      // ordinary vertex-color lane; each repeated geometry below gets the exact
      // instance BodyLight expanded into that attribute. Newer BatchedMesh can
      // keep its native instance path only when it can preserve color too.
      if (modernInstances && sourceHasBodyLight && typeof THREE.BatchedMesh.prototype?.setColorAt !== 'function') continue;
      const batchMaterial = (!modernInstances && sourceHasBodyLight)
        ? source[0].material.clone()
        : source[0].material;
      if (batchMaterial !== source[0].material) {
        batchMaterial.vertexColors = true;
        batchMaterial.needsUpdate = true;
      }
      const batch = new THREE.BatchedMesh(maxGeometryCount, maxVertices, maxIndices, batchMaterial);
      batch.userData.__muOwnedMaterial = batchMaterial !== source[0].material;
      batch.name = `MU_STATIC_MULTIDRAW_${result.batchedGroups}`;
      batch.perObjectFrustumCulled = true;
      batch.sortObjects = false;
      batch.matrixAutoUpdate = false;
      batch.matrixWorldAutoUpdate = false;
      batch.updateMatrix(); batch.updateMatrixWorld(true);

      if (modernInstances) {
        const geoIds = new Map();
        for (const g of geometryList) geoIds.set(g, batch.addGeometry(g));
        const batchColor = new THREE.Color(1, 1, 1);
        for (const m of source) {
          const gid = geoIds.get(m.geometry);
          for (let i = 0; i < m.count; i++) {
            m.getMatrixAt(i, local);
            const iid = batch.addInstance(gid);
            batch.setMatrixAt(iid, local);
            if (m.instanceColor && typeof batch.setColorAt === 'function') {
              m.getColorAt(i, batchColor); batch.setColorAt(iid, batchColor);
            }
          }
        }
      } else {
        // r160 has one transform per geometryId. Repeating addGeometry copies the
        // same source geometry into the bounded BatchedMesh buffer for each real
        // placement, then assigns that placement's exact matrix to its ID.
        const batchColor = new THREE.Color(1, 1, 1);
        for (const m of source) {
          for (let i = 0; i < m.count; i++) {
            m.getMatrixAt(i, local);
            let geometryForBatch = m.geometry;
            if (sourceHasBodyLight) {
              if (m.instanceColor) m.getColorAt(i, batchColor); else batchColor.setRGB(1, 1, 1);
              geometryForBatch = m.geometry.clone();
              const count = geometryForBatch.getAttribute('position')?.count || 0;
              const colors = new Float32Array(count * 3);
              for (let v = 0; v < count; v++) {
                colors[v*3] = batchColor.r; colors[v*3+1] = batchColor.g; colors[v*3+2] = batchColor.b;
              }
              geometryForBatch.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            }
            const gid = batch.addGeometry(geometryForBatch);
            batch.setMatrixAt(gid, local);
            if (geometryForBatch !== m.geometry) geometryForBatch.dispose?.();
          }
        }
        result.expandedVertices += maxVertices;
        result.expandedIndices += indexed ? maxIndices : 0;
      }
      batch.computeBoundingBox?.(); batch.computeBoundingSphere?.();
      for (const m of source) root.remove(m);
      root.add(batch);
      for (const m of source) m.userData.__muTransportCompacted = true;
      result.batchedGroups++; result.sourceDraws += source.length; result.batchedDraws += 1; result.sourceInstances += maxInstances; result.packingSavedDraws += Math.max(0, source.length - 1);
      result.batches ||= []; result.batches.push(batch);
    } catch (e) { console.warn(`[WorldObjects] R15.11 BatchedMesh fallback: ${e.message}`); }
  }
  return result;
}


// R15.12 PERF: extension-free physical draw reduction for Three r160.
// Exact-state InstancedMesh sources in the SAME spatial region are expanded
// once into one immutable BufferGeometry/Mesh. This preserves every placement
// and triangle while reducing ordinary WebGL submissions when WEBGL_multi_draw
// is unavailable. Opaque-only, positive-transform-only, bounded and fail-closed.
export function compactStaticInstancedFallbackMerge(root, meshes, options = {}) {
  // R15.13 PERF: multi-bin regional packing. R15.12 produced at most one
  // merged Mesh per exact-state region/material group; candidates that did not
  // fit that first 180k-vertex budget stayed as individual draws. We now pack
  // as many independent bounded bins as useful. Each bin keeps the exact same
  // regional culling key and material/layout state, so this only reduces CPU /
  // WebGL submissions; it does not remove placements, triangles or quality.
  const result = { attemptedGroups: 0, mergedGroups: 0, sourceDraws: 0, mergedDraws: 0, sourceInstances: 0, expandedVertices: 0, skippedBudget: 0, packingCandidates: 0, packingSelected: 0, packingSavedDraws: 0, packingBins: 0, singletonRemainder: 0, mode: 'cpu-merged-regional', meshes: [] };
  if (!Array.isArray(meshes) || meshes.length < 2) return result;
  const maxVertices = Number(options.maxExpandedVertices) || 180000;
  const groups = new Map();
  for (const mesh of meshes) {
    const mat = mesh?.material, layout = staticGeometryLayoutKey(mesh?.geometry), region = mesh?.userData?.__muTransportRegion;
    if (!mat || mat.transparent || !layout || !mesh.count || !region) continue;
    const flags = `${mesh.visible ? 1 : 0}|${mesh.castShadow ? 1 : 0}|${mesh.receiveShadow ? 1 : 0}`;
    const key = `${region}||${staticMaterialKey(mat)}||${layout}||${flags}`;
    let arr = groups.get(key); if (!arr) groups.set(key, arr = []); arr.push(mesh);
  }
  for (const raw of groups.values()) {
    if (raw.length < 2) continue; result.attemptedGroups++;
    try {
      // Budget by expanded POSITION vertices, not index count. mergeStaticGeometries
      // converts indexed sources to non-indexed before concatenation, therefore
      // index.count is the exact expanded vertex cost for indexed geometry.
      const candidates = raw.map((m, order) => ({ m, order, vertices: (m.geometry.index?.count || m.geometry.getAttribute('position').count) * m.count }));
      result.packingCandidates += candidates.length;
      // R15.14 PERF: true first-fit decreasing. Ascending order can strand large
      // candidates as singleton draws even when exact complementary packing exists
      // (e.g. 60,60,40,40 under cap=100). Descending reduces bins/singletons
      // without changing geometry, placements, region or material equivalence.
      candidates.sort((a,b) => (b.vertices-a.vertices)||(a.order-b.order));

      // First-fit-decreasing-ish bounded bins. A source larger than one bin is
      // intentionally left untouched (fail closed). Singleton bins are also
      // left untouched because replacing one draw by one draw only adds memory.
      const bins=[];
      for (const c of candidates) {
        if (c.vertices > maxVertices) { result.skippedBudget++; continue; }
        let bin = bins.find(b => b.vertices + c.vertices <= maxVertices);
        if (!bin) { bin={ vertices:0, chosen:[] }; bins.push(bin); }
        bin.chosen.push(c); bin.vertices += c.vertices;
      }
      for (const bin of bins) {
        if (bin.chosen.length < 2) { result.singletonRemainder += bin.chosen.length; continue; }
        const chosen=[...bin.chosen].sort((a,b)=>a.order-b.order);
        const local=new THREE.Matrix4(), parts=[]; let safe=true, instances=0;
        for (const c of chosen) {
          for (let i=0;i<c.m.count;i++) {
            c.m.getMatrixAt(i,local);
            if (!(local.determinant()>0)) { safe=false; break; }
            const bodyLight = new THREE.Color(1, 1, 1);
            if (c.m.instanceColor) c.m.getColorAt(i, bodyLight);
            parts.push({geometry:c.m.geometry,matrix:local.clone(),color:bodyLight}); instances++;
          }
          if(!safe) break;
        }
        if (!safe) continue;
        const geometry=mergeStaticGeometries(parts); if(!geometry) continue;
        const first=chosen[0].m;
        const mergedMaterial=first.material.clone();
        mergedMaterial.vertexColors=true; mergedMaterial.needsUpdate=true;
        const merged=new THREE.Mesh(geometry,mergedMaterial);
        merged.userData.__muOwnedMaterial=true;
        merged.name=`MU_STATIC_CPU_MERGE_${result.mergedGroups}`; merged.castShadow=first.castShadow; merged.receiveShadow=first.receiveShadow; merged.visible=first.visible; merged.frustumCulled=true;
        merged.updateMatrix(); merged.matrixAutoUpdate=false; merged.updateMatrixWorld(true); merged.matrixWorldAutoUpdate=false;
        geometry.computeBoundingBox?.(); geometry.computeBoundingSphere?.();
        for(const c of chosen) root.remove(c.m); root.add(merged); for(const c of chosen) c.m.userData.__muTransportCompacted=true;
        result.mergedGroups++; result.packingBins++; result.sourceDraws+=chosen.length; result.mergedDraws++; result.sourceInstances+=instances; result.expandedVertices+=bin.vertices; result.packingSelected+=chosen.length; result.packingSavedDraws+=chosen.length-1; result.meshes.push(merged);
      }
    } catch(e) { console.warn(`[WorldObjects] R15.14 CPU-merge fallback: ${e.message}`); }
  }
  return result;
}

function yieldToBrowserIdle(timeout = 50) {
  if (typeof requestIdleCallback === 'function') {
    return new Promise((resolve) => requestIdleCallback(() => resolve(), { timeout }));
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function fetchObjectFile(worldNum) {
  const candidates = [
    `World${worldNum}/EncTerrain${worldNum}.obj`,
    `World${worldNum}/Encterrain${worldNum}.obj`,
    `World${worldNum}/encterrain${worldNum}.obj`,
  ];
  for (const path of candidates) {
    const buf = await RemoteAssets.fetchBinary(path);
    if (buf) return { path, bytes: new Uint8Array(buf) };
  }
  throw new Error(candidates.join(' | ') + ': asset ausente');
}

/**
 * Mapa serial→arquivo para Object1 (Lorencia). Autoridade:
 *  - _enum.h:330-460 (ordem literal dos MODEL_* MODEL_WORLD_OBJECT=0 …-156).
 *  - MapManager.cpp:53+ primeiro loop deworld (AccessModel(MODEL_…, "Data\Object1\", "Tree", i+1)
 *    e assim por diante (`add`).
 *
 * Obs: modelos do enum que NÃO existem no Data/root-archivo (Wizard / HERO_… etc)
 * caem no fallback numérico ObjectNN.bmd (fail-closed, log explícito).
 *
 * Exceções de extratificação reais descobertas no disco real (server físico):
 *  - serial 13 tem ficheiro "Tree0_6.bmd" (sem zero pad idos) — caso especial.
 *  - serial 55 (DUNGEON_GATE) salta para um ficheiro chamado "DoungeonGate" (grafia
 *    do disco, não da naming convencional).
 */
const WORLD1_TYPE_NAMES = (() => {
  const m = {};
  const add = (serial, name, count = 1, start = 1) => {
    for (let i = 0; i < count; i++) m[serial + i] = `${name}${String(start + i).padStart(2, '0')}`;
  };
  //  faixas completas enumeradas no PC (em faij com a leitura do estado)
  add(0,   'Tree', 13);        // MODEL_TREE01     0-12  → Tree01..Tree13
  m[13]    = 'Tree0_6';        // exceção do disco (não existe Tree14)
  add(20,  'Grass', 8);        // MODEL_GRASS01    20-27 → Grass01..Grass08
  add(30,  'Stone', 5);        // MODEL_STONE01    30-34 → Stone01..Stone05
  add(40,  'StoneStatue', 3);  // MODEL_STONE_STATUE01 .. .03 → StoneStatue01..03
  m[43]    = 'SteelStatue01';
  add(44,  'Tomb', 3);         // MODEL_TOMB01     44-46 → Tomb01..Tomb03
  add(50,  'FireLight', 2);    // MODEL_FIRE_LIGHT01 50-51 → FireLight01/02
  m[52]    = 'Bonfire01';      // MODEL_BONFIRE
  m[55]    = 'DoungeonGate01'; // MODEL_DUNGEON_GATE (grafia do disco real)
  add(56,  'MerchantAnimal', 2);
  m[58]    = 'TreasureDrum01';
  m[59]    = 'TreasureChest01';
  m[60]    = 'Ship01';
  add(65,  'SteelWall', 3);
  m[68]    = 'SteelDoor01';
  add(69,  'StoneWall', 6);
  add(75,  'StoneMuWall', 4);  // disco: "StoneMuWall01..04"
  m[80]    = 'Bridge01';
  add(81,  'Fence', 4);
  m[85]    = 'BridgeStone01';
  m[90]    = 'StreetLight01';
  add(91,  'Cannon', 3);
  m[95]    = 'Curtain01';
  add(96,  'Sign', 2);
  add(98,  'Carriage', 4);
  add(102, 'Straw', 2);
  m[105]   = 'Waterspout01';
  add(106, 'Well', 4);
  m[110]   = 'Hanging01';
  m[111]   = 'Stair01';
  add(115, 'House', 5);
  m[120]   = 'Tent01';
  add(121, 'HouseWall', 6);
  add(127, 'HouseEtc', 3);
  add(130, 'Light', 3);
  m[133]   = 'PoseBox01';
  add(140, 'Furniture', 7);    // MODEL_FURNITURE01..07 = seriais 140-146
  m[150]   = 'Candle01';
  add(151, 'Beer', 3);         // MODEL_BEER01..03 = seriais 151-153
  return m;
})();

function modelPath(worldNum, serial) {
  const worldDir = `Object${worldNum}`;
  // World1 (Lorencia): o disco tem 167 BMDs com NOME-padrão (Tree01, Bonfire01,
  // StoneWall05, ...) e não "ObjectNN.bmd" (apenas 38 numerados p/ os plugins
  // modelsie which manager some havè); a memória completa do serial mapping asegue.
  // Qualquer serial não mapeado cai no fallback numérico ObjectNN (fail-closed
  // Bool modulável nunca throw — o placement inteira invocado sem travar o mundo).
  if (worldNum === 1) {
    const name = WORLD1_TYPE_NAMES[serial];
    if (name) return `${worldDir}/${name}.bmd`;
    return `${worldDir}/Object${String(serial + 1).padStart(2, '0')}.bmd`;
  }
  return `${worldDir}/Object${String(serial + 1).padStart(2, '0')}.bmd`;
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const results = new Array(items.length);
  const jobs = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(jobs);
  return results;
}

/**
 * R12.5 P2 — Prefetch de baixa prioridade: aquece os caches (IDB v3 +
 * memória) da camada de objetos do World indicado ENQUANTO o usuário está
 * no char-select olhando os personagens. MUAssets.loadBMD e loadModelTexture
 * já são idempotentes e cacheados por path canônico → a entrada real no
 * mundo reutiliza tudo (zero re-fetch/re-parse; só monta a cena).
 *
 * Fail-closed total: asset ausente/erro é ignorado em silêncio — a carga
 * real (TerrainObjectLayer.load) continua sendo a autoridade e loga seus
 * próprios warns. Retorna { warmed, total, placements } para o log do
 * chamador. Nunca throw.
 */
export async function prefetchWorldTerrainObjects(worldNum, {
  concurrency = 1,
  signal = null,
  yieldBetween = true,
  idleTimeout = 50,
  warmTextures = true,
} = {}) {
  const fetched = await fetchObjectFile(worldNum).catch(() => null);
  if (!fetched || signal?.aborted) return { warmed: 0, total: 0, placements: 0, aborted: !!signal?.aborted };
  let parsed;
  try { parsed = parseTerrainObjects(fetched.bytes); } catch { return { warmed: 0, total: 0, placements: 0, aborted: false }; }
  const unique = [...new Set(parsed.objects.map((o) => o.serial))];
  let warmed = 0;
  await mapLimit(unique, Math.max(1, concurrency | 0), async (serial) => {
    if (signal?.aborted) return;
    if (yieldBetween) await yieldToBrowserIdle(idleTimeout);
    if (signal?.aborted) return;
    const path = modelPath(worldNum, serial);
    try {
      const data = await MUAssets.loadBMD(path);
      if (data) warmed++;
      // R15: textura também é aquecida somente em fatias ociosas. O R13
      // disparava dezenas de decode/upload jobs concorrentes durante o
      // char-select e a UI caía para 5–15 fps antes mesmo de entrar no mapa.
      if (warmTextures) {
        for (const tex of data?.textures || []) {
          if (signal?.aborted) break;
          if (tex?.FileName) {
            if (yieldBetween) await yieldToBrowserIdle(idleTimeout);
            if (signal?.aborted) break;
            await MUAssets.loadModelTexture(tex.FileName, tex.Dir || `Object${worldNum}`)
              .catch(() => null);
          }
        }
      }
    } catch { /* ausente: silêncio aqui; a carga real loga se precisar */ }
  });
  return { warmed, total: unique.length, placements: parsed.objects.length, aborted: !!signal?.aborted };
}


function clipIsConstantPose(clip, eps = 1e-6) {
  if (!clip?.tracks?.length) return true;
  const constant = (arr, stride) => {
    if (!arr || arr.length <= stride) return true;
    for (let i = stride; i < arr.length; i++) {
      if (Math.abs(Number(arr[i]) - Number(arr[i % stride])) > eps) return false;
    }
    return true;
  };
  for (const track of clip.tracks) {
    if (!constant(track.positions, 3) || !constant(track.rotations, 4) || !constant(track.scales, 3)) return false;
  }
  return true;
}


// Main 5.2 GMNewTown + GMEmpireGuardian4 owners for logical WorldActive=74
// (asset World75 / Object75 used by Character Select). `serial` is the exact
// OBJECT::Type read from EncTerrain*.obj; model filename remains serial+1.
const WORLD75_HIDDEN_MESH_TYPES = new Set([79, 80, 82, 83, 84, 85, 86, 129, 130, 131, 132]);
export function pcWorld75ObjectRule(serial) {
  const type = Number(serial) | 0;
  let speed = 0.16;
  if (type === 20) speed *= 2;
  else if (type === 122 || type === 123 || type === 124) speed *= 3;
  else if (type === 128) speed *= 6;
  else if (type === 64) speed = 0.64;
  else if (type === 36) speed = 0.02;
  return Object.freeze({
    type,
    hiddenMesh: WORLD75_HIDDEN_MESH_TYPES.has(type),
    playSpeed: speed,
    delayedStart: type === 10,
    uvScrollVPerPcTick: type === 81 ? 0.015 : 0,
    // These types are mutated by GMEmpireGuardian4::MoveObject and must not be
    // collapsed into a static InstancedMesh even when their BMD clip is flat.
    // R78 physical World75 trace: the entire Character Select authored scene
    // currently contains exactly one Object07 placement (serial/type 6). Static
    // fusion/instancing gives zero placement savings for that object while it can
    // collapse its many authored mesh/material passes. Keep Object07 on the exact
    // MUModelRenderer mesh/material owner, preserving the complete scene BMD.
    forcePerPlacement: type === 0 || type === 1 || type === 3 || type === 6 || type === 44 ||
      type === 10 || type === 20 || type === 36 || type === 64 || type === 81 ||
      type === 122 || type === 123 || type === 124 || type === 128 || WORLD75_HIDDEN_MESH_TYPES.has(type),
  });
}

export function applyPcWorld75ObjectMaterialPresentation(renderer, serial) {
  if (!renderer) return false;
  const type = Number(serial) | 0;
  const meshIndex = (mesh) => Number(mesh?.userData?.muMeshIndex);
  const meshAt = (idx) => (renderer.meshes || []).find((m) => meshIndex(m) === idx) || null;
  const showOnlyBase = (indices) => {
    const wanted = new Set(indices);
    for (const mesh of renderer.meshes || []) mesh.visible = wanted.has(meshIndex(mesh)) && mesh.userData?.textureReady !== false;
  };
  const setBaseLight = (idx, rgb) => {
    const mesh = meshAt(idx);
    if (!mesh?.material) return false;
    const c = rgb?.isColor ? rgb : new THREE.Color(rgb[0], rgb[1], rgb[2]);
    if (mesh.material.color?.copy) mesh.material.color.copy(c);
    if (mesh.material.uniforms?.diffuse?.value?.copy) mesh.material.uniforms.diffuse.value.copy(c);
    return true;
  };
  const bright = (idx, color = new THREE.Color(1,1,1), flags = RenderFlags.TEXTURE | RenderFlags.BRIGHT) => {
    return renderer.createOverlayPass?.(flags, {
      color, alpha: 1,
      meshFilter: (mesh) => meshIndex(mesh) === idx,
    }) || null;
  };
  const scrollBase = (idx, getV) => {
    const mesh = meshAt(idx);
    const uv = mesh?.material?.uniforms?.uvOffset?.value;
    if (!uv?.set) return false;
    const update = (worldMs = 0) => uv.set(0, Number(getV(Number(worldMs)||0)) || 0);
    renderer.addPresentationUpdate?.(update);
    update(0);
    return true;
  };

  // World75 is logical WD_74NEW_CHARACTER_SCENE. GMNewTown delegates its
  // object mesh owner to GMEmpireGuardian4, which FIRST calls the inherited
  // GMEmpireGuardian1::RenderObjectMesh. Port those mesh/material branches
  // literally instead of drawing every BMD mesh with one generic material.
  // This is the missing source owner behind several over-bright/wrong props in
  // the Character Select scene.
  if (type === 37) {
    showOnlyBase([0]);
    bright(1);
    return true;
  }
  if (type === 41) {
    showOnlyBase([0,2]);
    const pass = bright(1);
    if (pass) {
      const base = renderer.bodyLight?.clone?.() || new THREE.Color(1,1,1);
      const update = (worldMs = 0) => {
        const lumi = Math.sin((Number(worldMs)||0) * 0.002) * 0.5 + 0.6;
        pass.setColor?.(base.clone().multiplyScalar(lumi));
      };
      renderer.addPresentationUpdate?.(update); update(0);
    }
    return true;
  }
  if (type === 47) {
    showOnlyBase([0,1,2,3]);
    setBaseLight(3, [1.2,1.2,1.2]);
    return true;
  }
  if (type === 48) {
    showOnlyBase([0,1,2]);
    setBaseLight(0, [1.1,1.1,1.1]);
    return true;
  }
  if (type === 49 || type === 70) {
    showOnlyBase([1,2]);
    bright(0);
    return true;
  }
  if (type === 55) {
    return true; // RenderBody(RENDER_TEXTURE): ordinary base pass is exact.
  }
  if (type === 64) {
    showOnlyBase([0,2,3]);
    // Source calls the same red BRIGHT|CHROME mesh-1 pass twice.
    const red = new THREE.Color(1,0,0);
    bright(1, red, RenderFlags.BRIGHT | RenderFlags.CHROME);
    bright(1, red, RenderFlags.BRIGHT | RenderFlags.CHROME);
    return true;
  }
  if (type === 115) {
    showOnlyBase([0,1,2,3]);
    scrollBase(1, (ms) => (Math.trunc(ms) % 25000) * 0.0004);
    scrollBase(3, (ms) => (Math.trunc(ms) % 25000) * -0.0004);
    return true;
  }
  if (type === 117) {
    showOnlyBase([0,1,2,3,4]);
    scrollBase(1, (ms) => (Math.trunc(ms) % 25000) * 0.0004);
    scrollBase(4, (ms) => (Math.trunc(ms) % 25000) * -0.0004);
    return true;
  }

  // GMEmpireGuardian4::RenderObjectMesh additions.
  if (type === 96 || type === 97 || type === 100) {
    const light = new THREE.Color(0.170382, 0.170382, 0.170382);
    renderer.setBodyLight?.(light);
    renderer.userData = renderer.userData || {};
    renderer.userData.muPcWorld75BodyLight = [0.170382, 0.170382, 0.170382];
    return true;
  }

  // GMEmpireGuardian1/4 RenderAfterObjectMesh: only meshes 0/1 are ordinary;
  // mesh 2 is a single TEXTURE|BRIGHT pass (not a normal pass + glow).
  if (type === 0 || type === 1 || type === 3 || type === 44) {
    showOnlyBase([0,1]);
    const pass = bright(2);
    if (pass) {
      const update = (worldMs = 0) => {
        const fLumi = (Math.sin((Number(worldMs)||0) * 0.0015) + 1) * 0.4 + 0.2;
        pass.setColor?.(new THREE.Color(fLumi, fLumi, fLumi));
        pass.setOpacity?.(1);
      };
      renderer.addPresentationUpdate?.(update);
      update(0);
      renderer.userData = renderer.userData || {};
      renderer.userData.muPcWorld75BrightMesh2 = true;
    }
    return Boolean(pass);
  }
  return false;
}

function applyWorld75UvScroll(renderer, v) {
  // GMEmpireGuardian4 type 81 passes BlendMeshTexCoordV to RenderBody. The
  // legacy default BlendMesh is -1, therefore only texture-script stream meshes
  // consume it. Web does not yet expose m_csTScript streamMesh as a first-class
  // index, so do NOT offset every diffuse texture (that would be visually wrong).
  // Preserve the authored value for the renderer/material owner that can consume
  // it now or in the next pass.
  renderer.userData = renderer.userData || {};
  renderer.userData.muBlendMeshTexCoordV = v;
}

export function rendererNeedsPerPlacementAnimation(renderer) {
  // A constant bone clip does not make a pulse/scroll material static.
  // World75 types41/115/117 install those owners during the model probe.
  if (renderer?.hasPresentationUpdates) return true;
  const clips = renderer?.mixer?.clips;
  if (!clips?.size) return false;
  // Conservative R57 fast path: only a single constant-pose action is frozen.
  // Multiple actions remain per-instance because the map/client may switch them.
  if (clips.size !== 1) return true;
  const clip = clips.values().next().value;
  return !clipIsConstantPose(clip);
}

// A single authored local AABB per serial encloses every placement's initial
// pose. Transforming its eight corners is conservative under rotation/scale;
// unlike Box3.setFromObject per placement it never sweeps skinned vertices.
export function placementCullSphere(localBounds, worldMatrix) {
  if (!localBounds || localBounds.isEmpty()) return null;
  const sphere = localBounds.clone().applyMatrix4(worldMatrix).getBoundingSphere(new THREE.Sphere());
  sphere.radius = Math.max(220, sphere.radius + 120);
  return sphere;
}

export class TerrainObjectLayer {
  constructor(gameScene) {
    this.gameScene = gameScene;
    this.root = new THREE.Group();
    this.root.name = 'MU_TERRAIN_OBJECTS';
    this.instances = [];
    this._instancedMeshes = [];
    this._instancedGeometries = new Set();
    this._batchedMeshes = [];
    this.worldNum = null;
    this._disposed = false;
    // R63 explicit animated-prop frustum owner. SkinnedMesh bounds from the
    // detached-skeleton fallback were not reliably culled by Three, leaving
    // hundreds of off-screen animated Object1 placements in render.calls.
    this._viewFrustum = new THREE.Frustum();
    this._viewProjection = new THREE.Matrix4();
    this._visibleAnimated = 0;
    this._totalAnimated = 0;
    this._dynamicTerrainLightOwner = null;
    this._mapWorldVisualOwner = null;
    this._icarusEnvironmentOwner = null;
    this._lorenciaEnvironmentOwner = null;
    this._lorenciaFishOwner = null;
    this._lorenciaFaunaOwner = null;
    this._staged = false;
    this._pendingUpdateOwners = [];
    this._pendingUpdateOwnerSet = new Set();
    this._ownedUpdateOwners = new Set();
    this._terrainLightMesh = null;
  }

  _registerUpdateOwner(owner) {
    if (!owner || this._disposed) return;
    if (this._ownedUpdateOwners.has(owner)) return;
    this._ownedUpdateOwners.add(owner);
    if (this._staged) {
      this._pendingUpdateOwnerSet.add(owner);
      this._pendingUpdateOwners.push(owner);
      return;
    }
    if (!this.gameScene.objects.includes(owner)) this.gameScene.objects.push(owner);
  }

  _terrainLightAt(x, z, target = null) {
    const sample = this._terrainLightMesh?.userData?.sampleTerrainLight;
    if (typeof sample !== 'function') return this.gameScene?.terrainLightAt?.(x, z, target) || null;
    const muX = Number(x) + MAP_SIZE / 2;
    const muY = MAP_SIZE / 2 - Number(z);
    if (!Number.isFinite(muX) || !Number.isFinite(muY)) return null;
    const rgb = sample(muX, muY);
    const color = target || new THREE.Color();
    color.setRGB(Number(rgb?.[0]) || 0, Number(rgb?.[1]) || 0, Number(rgb?.[2]) || 0);
    return color;
  }

  activate() {
    if (this._disposed) return false;
    this._staged = false;
    this.root.visible = true;
    const liveOwners = new Set(this.gameScene.objects);
    for (const owner of this._pendingUpdateOwners.splice(0)) {
      if (owner && !liveOwners.has(owner)) { this.gameScene.objects.push(owner); liveOwners.add(owner); }
    }
    this._pendingUpdateOwnerSet.clear();
    // Staged World11 must not publish ambient audio until the atomic world
    // commit activates this layer. The environment owner uses a private
    // playback id, so disposal of the previous Icarus generation is harmless.
    this._icarusEnvironmentOwner?.activate?.();
    return true;
  }

  async load(worldNum, { cooperative = true, idleMs = 16, sliceMs = 0, staged = false, terrainLightMesh = null, shouldContinue = null } = {}) {
    this.worldNum = worldNum;
    this._staged = Boolean(staged);
    this._terrainLightMesh = terrainLightMesh || null;
    this.root.visible = !this._staged;
    const cooperativeSliceMs = Math.max(0, Number(sliceMs) || 0);
    const checkpoint = createCooperativeLoadBudget({ budgetMs: cooperativeSliceMs || 8 });
    const cooperate = async () => {
      if (!cooperative) return;
      // Active game loading shares one elapsed budget between workers, then
      // yields a browser task without waiting for an idle deadline. Preserve
      // the historical Login/CharacterScene cadence when sliceMs is zero.
      if (cooperativeSliceMs > 0) await checkpoint();
      else await yieldToBrowserIdle(idleMs === 16 ? 16 : idleMs);
    };
    const assertContinue = () => {
      if (typeof shouldContinue === 'function' && shouldContinue() !== true) {
        const e = new Error(`World${worldNum} staging superseded`);
        e.code = 'MUWEB_STALE_WORLD_LOAD';
        throw e;
      }
    };
    assertContinue();
    const fetched = await fetchObjectFile(worldNum);
    assertContinue();
    const parsed = parseTerrainObjects(fetched.bytes);
    console.info(`[WorldObjects] World${worldNum}: ${parsed.count} placement(s) de ${fetched.path}`);
    const histogram = new Map();
    for (const o of parsed.objects) histogram.set(o.serial, (histogram.get(o.serial) || 0) + 1);
    console.info(`[WorldObjects] World${worldNum}: authored types`,
      [...histogram.entries()].sort((a, b) => a[0] - b[0])
        .map(([serial, count]) => `Object${String(serial + 1).padStart(2, '0')}=${count}`).join(' '));

    this.gameScene.scene.add(this.root);
    if (worldNum === 1) {
      this._dynamicTerrainLightOwner = createLorenciaStaticDynamicLightOwner(this.gameScene, parsed.objects);
      this._lorenciaEnvironmentOwner = createPcLorenciaEnvironmentOwner(this.gameScene);
      if (this._lorenciaEnvironmentOwner?.group) {
        this.root.add(this._lorenciaEnvironmentOwner.group);
        if (typeof this._lorenciaEnvironmentOwner.group.userData.update === 'function') this._registerUpdateOwner(this._lorenciaEnvironmentOwner.group);
        console.info('[WorldObjects FIX43] World1 Lorencia: source BITMAP_LEAF1 owner installed (80 leaves, World1/leaf01.OZJ).');
      }
      this._lorenciaFishOwner = createPcLorenciaFishOwner(this.gameScene);
      if (this._lorenciaFishOwner?.group) {
        this.root.add(this._lorenciaFishOwner.group);
        if (typeof this._lorenciaFishOwner.group.userData.update === 'function') this._registerUpdateOwner(this._lorenciaFishOwner.group);
        console.info('[WorldObjects FIX43] World1 Lorencia: source Fish01 owner installed (3 slots, TerrainMappingLayer1==5).');
      }
      this._lorenciaFaunaOwner = createPcLorenciaFaunaOwner(this.gameScene);
      if (this._lorenciaFaunaOwner?.group) {
        this.root.add(this._lorenciaFaunaOwner.group);
        if (typeof this._lorenciaFaunaOwner.group.userData.update === 'function') this._registerUpdateOwner(this._lorenciaFaunaOwner.group);
        console.info('[WorldObjects FIX43] World1 Lorencia: source GOBoid Bird01 owner installed (5 birds, real Object1/Bird01.bmd).');
      }
    }
    else this._dynamicTerrainLightOwner = createPcMapDynamicTerrainLightOwner(this.gameScene, worldNum, parsed.objects);
    if (this._dynamicTerrainLightOwner) this._registerUpdateOwner(this._dynamicTerrainLightOwner);
    this._mapWorldVisualOwner = await createPcMapWorldVisualOwner(worldNum, parsed.objects);
    if (this._mapWorldVisualOwner?.group) {
      this.root.add(this._mapWorldVisualOwner.group);
      if (typeof this._mapWorldVisualOwner.group.userData.update === 'function') this._registerUpdateOwner(this._mapWorldVisualOwner.group);
    }
    if (worldNum === 11) {
      this._icarusEnvironmentOwner = await createPcIcarusEnvironmentOwner(this.gameScene);
      if (this._icarusEnvironmentOwner?.group) {
        this.root.add(this._icarusEnvironmentOwner.group);
        if (typeof this._icarusEnvironmentOwner.group.userData.update === 'function') this._registerUpdateOwner(this._icarusEnvironmentOwner.group);
        if (!this._staged) this._icarusEnvironmentOwner.activate?.();
        console.info('[WorldObjects FIX43] World11 Icarus: terrain mesh suppressed by Scene owner; rain01 + aHeaven environment owner installed (ambient activates only on publication).');
      }
    }
    const unique = [...new Set(parsed.objects.map((o) => o.serial))];
    // Main 5.2 creates several ObjectN entries only as invisible controllers /
    // effect emitters (HiddenMesh=-2). FIX8 rendered those raw BMDs, producing
    // the giant black/ice/tree slabs visible in the physical screenshots.
    // Keep a renderer only when a ported bone/runtime/particle owner requires
    // the controller skeleton; otherwise the desktop never draws the base BMD.
    const sourceHiddenNoRendererSerials = new Set(unique.filter((serial) =>
      pcMapHideBaseBmd(worldNum, serial) &&
      !(worldNum === 1 && PC_LORENCIA_RUNTIME_VISUAL_SERIALS.includes(serial)) &&
      !hasPcMapBoneVisual(worldNum, serial) &&
      !hasPcMapRuntimePresentation(worldNum, serial) &&
      !hasPcMapParticleVisual(worldNum, serial)
    ));
    const modelCache = new Map();
    await mapLimit(unique, 4, async (serial) => {
      assertContinue();
      await cooperate();
      assertContinue();
      if (sourceHiddenNoRendererSerials.has(serial)) return;
      const path = modelPath(worldNum, serial);
      try {
        modelCache.set(serial, await MUAssets.loadBMD(path));
      } catch (e) {
        console.warn(`[WorldObjects] modelo ausente/inválido ${path}: ${e.message}`);
        modelCache.set(serial, null);
      }
    });

    // Perf P4 (t-muhg6wvo-t): paridade com o PC — MapManager.cpp carrega cada
    // modelo UMA vez (AccessModel) e cada CreateObject referencia a instância
    // compartilhada. Antes daqui o web criava um MUModelRenderer por placement
    // (2985 skeleton+mixer+boneTexture+geometria+material+upload de textura
    // duplicados) — era a causa da "demora de entrar no mundo" e dos 13-26
    // ticks/s no físico do usuário com 2987 placements de World1.
    // Regra: serial com actions (navios etc) segue renderer por instância;
    // serial estático usa 1 template e clones que compartilham
    // geometry/material/skeleton — visualmente idêntico, sem upload duplicado.
    const templates = new Map();   // serial -> renderer (somente estáticos)
    const localBoundsBySerial = new Map();
    const animatedSerials = new Set();
    const constantPoseSerials = new Set();
    await mapLimit(unique, 3, async (serial) => {
      assertContinue();
      await cooperate();
      assertContinue();
      const data = modelCache.get(serial);
      if (!data) return;
      const probe = new MUModelRenderer({
        scene: this.gameScene.scene,
        camera: this.gameScene.camera?.threeCamera,
      });
      try {
        await probe.initFromBMD(data);
        if (worldNum === 75) applyPcWorld75ObjectMaterialPresentation(probe, serial);
        // Same initial pose as each placement, before the MU-up conversion.
        // Cache only within this load: never reuse bounds across Data authorities.
        probe.group.updateMatrixWorld(true);
        probe.skeleton?.update?.();
        try {
          const localBounds = new THREE.Box3().setFromObject(probe.group);
          if (!localBounds.isEmpty()) localBoundsBySerial.set(serial, localBounds);
        } catch (_) { /* use exact per-placement fallback if no model bound */ }
        const world75Rule = worldNum === 75 ? pcWorld75ObjectRule(serial) : null;
        if (rendererNeedsPerPlacementAnimation(probe) || world75Rule?.forcePerPlacement || hasPcLoginObjectPresentation(worldNum,serial) || pcIndoorObject(worldNum,serial) ||
            (worldNum === 1 && PC_LORENCIA_RUNTIME_VISUAL_SERIALS.includes(serial)) ||
            hasPcMapBoneVisual(worldNum, serial) || hasPcMapRuntimePresentation(worldNum, serial) || hasPcMapParticleVisual(worldNum, serial)) {
          animatedSerials.add(serial);
          probe.dispose?.();
        } else {
          // Some map BMDs contain a single action whose every key is identical.
          // Treating clip-count>0 as dynamic forced one renderer/draw sequence per
          // placement despite zero visual motion. Apply that constant pose once
          // and use the exact static/instanced path without dropping any object.
          if (probe.mixer?.clips?.size === 1) {
            const clip = probe.mixer.clips.values().next().value;
            if (clipIsConstantPose(clip)) {
              try { probe._applyAnimation?.(clip, 0, 1); } catch (_) { /* bind pose remains safe */ }
              constantPoseSerials.add(serial);
            }
          }
          // Cross-review vertex-parity (test-r12_6-instancing-vertex-parity.mjs,
          // prova numérica com Tree01.bmd real): os bones do template ficam
          // FORA da scene para sempre; sem este congelamento o skeleton.update()
          // lê matrixWorld=identity e o clone renderiza stackado na origem
          // (divergência medida: 7008u vs referência). Com updateMatrixWorld
          // + skeleton.update UMA vez, boneMatrices=bindLocal (paridade 0.0003u).
          probe.group.updateMatrixWorld(true);
          probe.skeleton.update();
          // Bounds pós-skinning UMA VEZ POR TEMPLATE (110×) — SkinnedMesh.clone
          // copia boundingSphere da fonte (three SkinnedMesh.js copy()):
          // cada clone estático herda os bounds da pose congelada sem
          // recomputar (2985× menos sweeps de vértices no world-entry;
          // t-muhijwa0-6 follow-up de custo).
          for (const child of probe.group.children) {
            if (child.isSkinnedMesh && child.computeBoundingSphere) {
              try { child.computeBoundingSphere(); } catch (_) { /* geometry fallback */ }
            }
          }
          templates.set(serial, probe);
        }
      } catch (e) {
        console.warn(`[WorldObjects] template Object${serial + 1} falhou: ${e.message}`);
        modelCache.set(serial, null);
        try { probe.dispose?.(); } catch (_) { /* noop */ }
      }
    });

    let rendered = 0;
    let missing = 0;
    const missingBySerial = new Map();
    const bumpMissingSerial = (serial) => missingBySerial.set(serial, (missingBySerial.get(serial) || 0) + 1);
    let shared = 0;
    let instancedDraws = 0;
    let staticSubmeshesBeforeFusion = 0;
    let staticSubmeshesAfterFusion = 0;
    let boundReusePlacements = 0;
    let boundFallbackPlacements = 0;
    const instancedSerials = new Set();

    // Agrupa placements para batching real. O caminho antigo compartilhava
    // geometry/material, mas ainda criava ~2985 Object3D/SkinnedMesh e milhares
    // de draw calls. R13 usa 1 InstancedMesh por submesh/material de cada serial
    // ESTÁTICO. AnimatedSerials continuam 1 renderer/placement, sem regressão.
    const placementsBySerial = new Map();
    parsed.objects.forEach((obj, index) => {
      let arr = placementsBySerial.get(obj.serial);
      if (!arr) placementsBySerial.set(obj.serial, arr = []);
      arr.push({ obj, index });
    });
    let sourceHiddenPlacements = 0;
    for (const serial of sourceHiddenNoRendererSerials) {
      const n = placementsBySerial.get(serial)?.length || 0;
      sourceHiddenPlacements += n;
      rendered += n; // faithfully handled: PC intentionally renders no base mesh
    }

    if (staticInstancingEnabled()) {
      const chunkTiles = staticBatchTiles();
      let spatialClusters = 0;
      let baselineSpatialClusters = 0;
      let compactSerials = 0;
      for (const [serial, template] of templates) {
        assertContinue();
        await cooperate();
        assertContinue();
        const placements = placementsBySerial.get(serial) || [];
        if (STRUCTURAL_FULL_FIDELITY_SERIALS.has(serial)) continue;
        if (!placements.length) continue;
        const baselineClusters = partitionSpatialPlacements(placements, chunkTiles);
        const clusters = partitionAdaptiveSpatialPlacements(placements, chunkTiles);
        baselineSpatialClusters += baselineClusters.size;
        if (clusters.size < baselineClusters.size) compactSerials++;
        try {
          template.group.updateMatrixWorld(true);
          template.skeleton?.update?.();
          const staged = [];
          const bakedGeometries = [];
          let createdForSerial = 0;
          // R15.4 exact-material fusion: bake primeiro, depois funde apenas
          // submeshes estáticos material-equivalentes. Isso reduz draw calls
          // por cluster sem tocar nos placements nem na aparência.
          const materialGroups = new Map();
          for (const child of template.group.children) {
            if (!(child.isSkinnedMesh || child.isMesh)) continue;
            child.updateMatrix();
            const baked = bakeStaticSkinnedGeometry(child);
            const key = staticMaterialKey(child.material);
            let arr = materialGroups.get(key);
            if (!arr) materialGroups.set(key, arr = []);
            arr.push({ child, baked });
          }
          const renderParts = [];
          for (const parts of materialGroups.values()) {
            if (parts.length > 1) {
              const merged = mergeStaticGeometries(parts.map(p => ({ geometry: p.baked, matrix: p.child.matrix })));
              if (merged) {
                renderParts.push({ geometry: merged, material: parts[0].child.material, child: null, owned: true });
                for (const p of parts) p.baked.dispose?.();
                continue;
              }
            }
            for (const p of parts) renderParts.push({ geometry: p.baked, material: p.child.material, child: p.child, owned: true });
          }
          staticSubmeshesBeforeFusion += [...materialGroups.values()].reduce((n, parts) => n + parts.length, 0);
          staticSubmeshesAfterFusion += renderParts.length;
          for (const part of renderParts) {
            const child = part.child;
            const baked = part.geometry;
            bakedGeometries.push(baked);
            let childClusterIndex = 0;
            for (const [clusterKey, clusterPlacements] of clusters) {
              const inst = new THREE.InstancedMesh(baked, part.material, clusterPlacements.length);
              // staticPlacementMatrix already embeds the MU->Three basis.
              // There is no converted ancestor in this transport hierarchy.
              if (part.material?.uniforms?.pcChromeUpAxis) part.material.uniforms.pcChromeUpAxis.value = 1;
              inst.name = `World${worldNum}_Object${serial + 1}_INST_${createdForSerial}_${clusterKey}`;
              inst.castShadow = child?.castShadow ?? false;
              inst.receiveShadow = child?.receiveShadow ?? false;
              inst.visible = child?.visible ?? true;
              inst.frustumCulled = true;
              inst.instanceMatrix.setUsage(THREE.StaticDrawUsage);
              const m = new THREE.Matrix4();
              const instanceLight = new THREE.Color(1, 1, 1);
              for (let i = 0; i < clusterPlacements.length; i++) {
                const placement = clusterPlacements[i].obj;
                staticPlacementMatrix(placement, child, m);
                inst.setMatrixAt(i, m);
                // PC Calc_RenderObject -> BodyLight samples the terrain at EACH
                // OBJECT placement. Preserve that per-instance value instead of
                // one white/shared material for a whole spatial batch.
                const sampled = this._terrainLightAt(
                  placement.x - MAP_SIZE / 2, MAP_SIZE / 2 - placement.y, instanceLight);
                if (sampled) inst.setColorAt(i, sampled);
                else inst.setColorAt(i, instanceLight.setRGB(1, 1, 1));
              }
              inst.instanceMatrix.needsUpdate = true;
              if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
              // R15.3: batch estático é realmente imutável. InstancedMesh herda
              // matrixAutoUpdate=true de Object3D; com centenas de clusters isso
              // fazia Three recompor matrizes locais/world a cada render apesar
              // de estes nodes nunca moverem. Congela depois de construir as
              // instance matrices. Não altera placement, material ou culling.
              inst.updateMatrix();
              inst.matrixAutoUpdate = false;
              inst.updateMatrixWorld(true);
              inst.matrixWorldAutoUpdate = false;
              // Bounds do CLUSTER, não do mapa inteiro. Esse detalhe restaura o
              // descarte espacial do PC sem remover nenhuma instância.
              try { inst.computeBoundingBox?.(); } catch (_) {}
              try { inst.computeBoundingSphere?.(); } catch (_) {}
              let sx = 0, sy = 0;
              for (const cp of clusterPlacements) { sx += Number(cp.obj?.x || 0); sy += Number(cp.obj?.y || 0); }
              inst.userData.__muTransportRegion = spatialBatchKey({ x: sx / clusterPlacements.length, y: sy / clusterPlacements.length }, chunkTiles);
              staged.push(inst);
              childClusterIndex++;
            }
            createdForSerial += childClusterIndex;
          }
          if (createdForSerial > 0) {
            for (const inst of staged) {
              this.root.add(inst);
              this._instancedMeshes.push(inst);
            }
            for (const g of bakedGeometries) this._instancedGeometries.add(g);
            instancedDraws += createdForSerial;
            spatialClusters += clusters.size;
            instancedSerials.add(serial);
            rendered += placements.length;
            shared += placements.length;
          } else {
            for (const g of bakedGeometries) g.dispose?.();
          }
        } catch (e) {
          console.warn(`[WorldObjects] InstancedMesh Object${serial + 1} falhou; fallback clones: ${e.message}`);
        }
      }
      this._lastSpatialBatchStats = { chunkTiles, spatialClusters, baselineSpatialClusters, compactSerials, instancedDraws, staticSubmeshesBeforeFusion, staticSubmeshesAfterFusion };
    }

    // R23 recovery: preserve R22 cooperative loading, but restore the verified
    // R15.11-R15.15 physical transport chain lost in an earlier integration.
    const webglMultiDraw = !!this.gameScene?.renderer?.extensions?.has?.('WEBGL_multi_draw');
    const transportStats = compactStaticInstancedTransport(this.root, this._instancedMeshes, { multiDrawSupported: webglMultiDraw });
    this._batchedMeshes = transportStats.batches || [];
    const fallbackMergeStats = webglMultiDraw ? null : compactStaticInstancedFallbackMerge(this.root, this._instancedMeshes);
    this._mergedTransportMeshes = fallbackMergeStats?.meshes || [];
    if (fallbackMergeStats?.sourceDraws) {
      transportStats.mode = 'cpu-merged-regional';
      transportStats.sourceDraws = fallbackMergeStats.sourceDraws;
      transportStats.batchedDraws = fallbackMergeStats.mergedDraws;
      transportStats.sourceInstances = fallbackMergeStats.sourceInstances;
      transportStats.expandedVertices = fallbackMergeStats.expandedVertices;
      transportStats.skippedBudget = fallbackMergeStats.skippedBudget;
      transportStats.packingCandidates = fallbackMergeStats.packingCandidates;
      transportStats.packingSelected = fallbackMergeStats.packingSelected;
      transportStats.packingSavedDraws = fallbackMergeStats.packingSavedDraws;
      transportStats.packingBins = fallbackMergeStats.packingBins;
      transportStats.singletonRemainder = fallbackMergeStats.singletonRemainder;
      transportStats.attemptedGroups = fallbackMergeStats.attemptedGroups;
      transportStats.mergedGroups = fallbackMergeStats.mergedGroups;
      transportStats.remainingEligibleDraws = Math.max(0, fallbackMergeStats.packingCandidates - fallbackMergeStats.packingSelected);
      transportStats.mergeEfficiencyPct = fallbackMergeStats.sourceDraws > 0
        ? ((fallbackMergeStats.sourceDraws - fallbackMergeStats.mergedDraws) * 100 / fallbackMergeStats.sourceDraws) : 0;
    }
    if (this._lastSpatialBatchStats) {
      this._lastSpatialBatchStats.transport = transportStats;
      this._lastSpatialBatchStats.effectiveStaticDraws =
        instancedDraws - transportStats.sourceDraws + transportStats.batchedDraws;
    }

    // Somente animados + static serials cujo batching falhou/foi desativado.
    await mapLimit(parsed.objects, 4, async (obj, index) => {
      assertContinue();
      if (this._disposed || instancedSerials.has(obj.serial) || sourceHiddenNoRendererSerials.has(obj.serial)) return;
      if ((index & 7) === 0) await cooperate();
      assertContinue();
      if (this._disposed) return;
      const data = modelCache.get(obj.serial);
      if (!data) { missing++; bumpMissingSerial(obj.serial); return; }
      let renderer = null;
      try {
        const template = templates.get(obj.serial);
        let inner;
        if (template) {
          // Fallback diagnóstico: clone raso com skeleton compartilhado.
          inner = new THREE.Group();
          for (const child of template.group.children) {
            if (child.isSkinnedMesh || child.isMesh) {
              const clone = child.clone();
              clone.bindMode = 'detached';
              clone.frustumCulled = true;
              if (clone.isSkinnedMesh && !clone.boundingSphere && clone.computeBoundingSphere) {
                try { clone.computeBoundingSphere(); } catch (_) {}
              }
              inner.add(clone);
            }
          }
          shared++;
        } else {
          renderer = new MUModelRenderer({
            scene: this.gameScene.scene,
            camera: this.gameScene.camera?.threeCamera,
          });
          await renderer.initFromBMD(data);
          if (worldNum === 75) applyPcWorld75ObjectMaterialPresentation(renderer, obj.serial);
          inner = renderer.group;
        }
        applyMuUpAxis(inner);
        const outer = new THREE.Group();
        outer.name = `World${worldNum}_Object${obj.serial + 1}_i${index}`;
        outer.add(inner);
        muObjectPositionToThree(obj, outer.position);
        outer.quaternion.copy(muObjectQuaternion(obj));
        outer.scale.setScalar(obj.scale);
        // World75 emitter objects 79/80 own an exact BITMAP_LIGHT sprite at
        // OBJECT::Position.  Keep it outside `outer` so object scale/rotation is
        // not applied twice: CreateSprite receives the already-scaled scalar.
        let pcVisualSprite = null;
        if (worldNum === 75 && (obj.serial === 79 || obj.serial === 80)) {
          pcVisualSprite = await createPcWorld75VisualSprite(obj.serial, obj, outer.position);
          if (pcVisualSprite) {
            this.root.add(pcVisualSprite);
            if (typeof pcVisualSprite.userData.update === 'function') this._registerUpdateOwner(pcVisualSprite);
          }
        }
        // R74: source-faithful World75 emitter children. The emitter BMD stays
        // hidden exactly as RenderObjectVisual intends; real bitmap particles
        // are separate world-space billboards using ZzzEffectParticle laws.
        let pcParticleOwner = null;
        if (worldNum === 75 && PC_WORLD75_PARTICLE_SERIALS.includes(obj.serial)) {
          pcParticleOwner = await createPcWorld75ParticleOwner(obj.serial, obj, outer.position);
          if (pcParticleOwner?.group) {
            this.root.add(pcParticleOwner.group);
            if (typeof pcParticleOwner.group.userData.update === 'function') this._registerUpdateOwner(pcParticleOwner.group);
          }
        }
        // R74 normal-world recovery: Lorencia's Light01/02/03 are invisible
        // emitter OBJECTs in ZzzObject.cpp, not decorative BMD props. Bridge,
        // DungeonGate, FireLight and Bonfire also call the same exact CreateFire
        // owner at authored offsets. Keep particle owner outside `outer` so
        // OBJECT scale never multiplies CreateFire's world-space offset.
        let pcLorenciaVisualOwner = null;
        if (worldNum === 1 && PC_LORENCIA_RUNTIME_VISUAL_SERIALS.includes(obj.serial)) {
          pcLorenciaVisualOwner = await createPcLorenciaVisualOwner(obj.serial, obj, outer.position, {
            addTerrainLightMu: (muX, muY, light, range) => this.gameScene.addDynamicTerrainLightMu?.(muX, muY, light, range),
          });
          if (pcLorenciaVisualOwner?.group) {
            this.root.add(pcLorenciaVisualOwner.group);
            if (typeof pcLorenciaVisualOwner.group.userData.update === 'function') this._registerUpdateOwner(pcLorenciaVisualOwner.group);
          }
        }
        let pcLorenciaBoneVisualOwner = null;
        if (worldNum === 1 && renderer && (obj.serial === 56 || obj.serial === 105)) {
          pcLorenciaBoneVisualOwner = await createPcLorenciaBoneVisualOwner(obj.serial, renderer, obj);
          if (pcLorenciaBoneVisualOwner?.group) this.root.add(pcLorenciaBoneVisualOwner.group);
        }
        let pcMapBoneVisualOwner = null;
        if (renderer && hasPcMapBoneVisual(worldNum, obj.serial)) {
          pcMapBoneVisualOwner = await createPcMapBoneVisualOwner(worldNum, obj.serial, renderer, obj);
          if (pcMapBoneVisualOwner?.group) this.root.add(pcMapBoneVisualOwner.group);
        }
        let pcMapParticleOwner = null;
        if (renderer && hasPcMapParticleVisual(worldNum, obj.serial)) {
          pcMapParticleOwner = await createPcMapParticleOwner(worldNum, obj.serial, renderer, obj);
          if (pcMapParticleOwner?.group) {
            this.root.add(pcMapParticleOwner.group);
            if (typeof pcMapParticleOwner.group.userData.update === 'function') this._registerUpdateOwner(pcMapParticleOwner.group);
          }
        }
        // Main RenderMesh derives BlendMesh color from the object's already-resolved
        // BodyLight.  Resolve terrain BodyLight first, then let the runtime
        // presentation owner snapshot that exact base color.  R75 installed the
        // owner before setBodyLight(), which could make animated BlendMeshLight
        // multiply stale white instead of the object's terrain light.
        if (renderer) {
          const objectBodyLight = this._terrainLightAt(outer.position.x, outer.position.z, new THREE.Color());
          if (objectBodyLight) renderer.setBodyLight(objectBodyLight);
        }
        if (renderer && hasPcLoginObjectPresentation(worldNum,obj.serial)) await installPcLoginObjectPresentation(worldNum,obj.serial,renderer);
        const pcMapRuntimePresentation = renderer ? installPcMapRuntimePresentation(worldNum, obj.serial, renderer, obj) : false;
        if (!renderer) {
          outer.updateMatrix();
          outer.matrixAutoUpdate = false;
        }
        this.root.add(outer);

        const world75Rule = worldNum === 75 ? pcWorld75ObjectRule(obj.serial) : null;
        let cullSphere = null;
        if (renderer) {
          // Conservative world-space bound computed once from the authored BMD.
          // Inflate it so animation/wind never pops at the screen edge.
          try {
            outer.updateMatrixWorld(true);
            const localBounds = localBoundsBySerial.get(obj.serial);
            if (localBounds) { cullSphere = placementCullSphere(localBounds, inner.matrixWorld); boundReusePlacements++; }
            else {
              boundFallbackPlacements++;
              const box = new THREE.Box3().setFromObject(outer);
              if (!box.isEmpty()) { cullSphere = box.getBoundingSphere(new THREE.Sphere()); cullSphere.radius = Math.max(220, cullSphere.radius + 120); }
            }
          } catch (_) { cullSphere = null; }
        }
        const slot = { obj, outer, renderer, pcVisualSprite, pcParticleOwner, pcLorenciaVisualOwner, pcLorenciaBoneVisualOwner, pcMapBoneVisualOwner, pcMapParticleOwner, pcMapRuntimePresentation, cullSphere, elapsed: 0, deferredDt: 0,
          // R89 physical perf: animated placement containers outside the view
          // are detached from the Three scene graph, not merely visible=false.
          // With 6k+ animated ObjectN placements, Three otherwise still walks
          // every hidden child while building the render list each frame.
          // The renderer object/skeleton remains alive and is reattached when
          // the authored cull sphere re-enters the frustum; no object is deleted.
          sceneAttached: true,
          pcDelayTicks: world75Rule?.delayedStart ? Math.floor(Math.random() * 50) : 0,
          blendMeshTexCoordV: 0 };
        if (world75Rule?.hiddenMesh) {
          // Source mesh is intentionally invisible: these OBJECTs are emitters
          // for RenderObjectVisual particles/sprites. Keeping the BMD visible in
          // Web was one cause of the bogus blocks/props in World75.
          outer.visible = false;
          outer.userData.muPcHiddenMeshMinus2 = true;
        }
        if (worldNum === 1 && PC_LORENCIA_HIDDEN_EMITTER_SERIALS.includes(obj.serial)) {
          // ZzzObject.cpp: MODEL_LIGHT01..+2 => CreateFire + HiddenMesh=-2.
          outer.visible = false;
          outer.userData.muPcHiddenMeshMinus2 = true;
          outer.userData.muPcLorenciaEmitter = true;
        }
        if (pcMapHideBaseBmd(worldNum, obj.serial)) {
          // HiddenMesh=-2 hides the BMD body, NOT the visual-owner lifecycle.
          // Controllers retained here are exactly those whose renderer/bones are
          // consumed by a ported owner (e.g. Devias100/Tarkan63/64).
          for (const mesh of renderer?.meshes || []) {
            mesh.visible = false;
            mesh.userData ??= {};
            mesh.userData.muPcSourceHiddenMesh = true;
          }
          outer.userData.muPcHiddenMeshMinus2 = true;
          outer.userData.muPcMapVisualReplacement = true;
        }
        if (renderer && (renderer.hasPresentationUpdates || renderer.mixer?.clips?.size > 0 || hasPcLoginObjectPresentation(worldNum,obj.serial) || pcIndoorObject(worldNum,obj.serial) || pcLorenciaBoneVisualOwner || pcMapBoneVisualOwner || pcMapParticleOwner?.usesRendererTick || pcMapRuntimePresentation)) {
          // Bone-space visual owners also need one presentation update per frame
          // even when the BMD itself has no animated clip. Animated models retain
          // the exact CreateObject OBJECT::Velocity rather than a Web-global 0.16.
          renderer.playSpeed = world75Rule?.playSpeed ?? pcMapObjectPlaySpeed(worldNum,obj.serial,obj.scale);
          if (renderer.mixer?.clips?.has?.('action_0')) renderer.playAction('action_0');
          if(pcIndoorObject(worldNum,obj.serial)){
            // Preserve each mesh's authored/source visibility (texture readiness,
            // HiddenMesh, bitmap-hide, etc). Indoor alpha may hide the whole BMD,
            // but leaving the indoor tile must restore this exact base state.
            slot.indoorBaseVisibility=(renderer.meshes||[]).map(m=>m.visible!==false);
          }
          outer.userData.update = (dt) => {
            if(pcIndoorObject(worldNum,obj.serial)) {
              const hero=this.gameScene.mainObject?.position;
              const tile=hero?pcTerrainTileAt(this.gameScene.terrainMapping,hero.x,hero.z):null;
              slot.indoorTime=(slot.indoorTime||0)+Math.max(0,dt)*25;
              const ticks=Math.floor(slot.indoorTime+1e-9);slot.indoorTime-=ticks;
              slot.indoorAlpha=stepPcIndoorAlpha(slot.indoorAlpha??1,pcIndoorAlphaTarget(worldNum,obj.serial,tile),ticks);
              renderer.setRenderFlags(renderer.renderFlags??2,{alpha:slot.indoorAlpha});
              const indoorVisible=slot.indoorAlpha>=.01;
              for(let i=0;i<(renderer.meshes||[]).length;i++){
                const m=renderer.meshes[i];
                m.visible=indoorVisible && (slot.indoorBaseVisibility?.[i]!==false);
              }
            }
            slot.elapsed += dt;
            slot.deferredDt += dt;
            if (world75Rule?.delayedStart && slot.pcDelayTicks > 0) {
              slot.pcDelayTicks -= Math.max(1, Math.round(Math.max(0, dt) * 25));
              slot.deferredDt = 0;
              return;
            }
            if (world75Rule?.uvScrollVPerPcTick) {
              slot.blendMeshTexCoordV += world75Rule.uvScrollVPerPcTick * Math.max(0, dt) * 25;
              applyWorld75UvScroll(renderer, slot.blendMeshTexCoordV);
            }
            // R63 explicit frustum owner may hide this static-position animated
            // prop. Bone-space sprite/particle children live outside `outer` to
            // avoid inheriting object scale, so mirror the same cull decision.
            if (pcLorenciaBoneVisualOwner?.group) pcLorenciaBoneVisualOwner.group.visible = outer.visible;
            if (pcMapBoneVisualOwner?.group) pcMapBoneVisualOwner.group.visible = outer.visible;
            if (pcMapParticleOwner?.group && !pcMapParticleOwner.group.userData.update) pcMapParticleOwner.group.visible = outer.visible;
            if (!outer.visible) return;
            // R15.3: não faz skinning/material update de props animados que
            // estão além do far-plane. Three já não os desenha; atualizar seus
            // bones todo frame era CPU sem efeito visual. O tempo NÃO é perdido:
            // deferredDt é aplicado integralmente quando o objeto volta ao raio
            // renderizável, mantendo a fase da animação sem remover qualidade.
            const cam = this.gameScene.camera?.threeCamera;
            if (cam) {
              const far = Number(cam.far) || 10000;
              const dx = outer.position.x - cam.position.x;
              const dy = outer.position.y - cam.position.y;
              const dz = outer.position.z - cam.position.z;
              if ((dx * dx + dy * dy + dz * dz) > far * far) return;
            }
            renderer.update(slot.deferredDt, slot.elapsed);
            slot.deferredDt = 0;
          };
          this._registerUpdateOwner(outer);
        }
        this.instances.push(slot);
        rendered++;
      } catch (e) {
        try { renderer?.dispose?.(); } catch (_) { /* release partial geometry leases */ }
        missing++; bumpMissingSerial(obj.serial);
        console.warn(`[WorldObjects] placement ${index} Object${obj.serial + 1}: ${e.message}`);
      }
    });
    this._templateRenderers = [...templates.values()];
    if (shared > 0) {
      const sb = this._lastSpatialBatchStats || { chunkTiles: 0, spatialClusters: 0 };
      console.info(`[WorldObjects] Perf R15: rev=15.5 perfPatch=15.5 timingPatch=15.6 compactPatch=15.7 templates estáticos=${templates.size} animados=${animatedSerials.size} constantPoseStatic=${constantPoseSerials.size} ` +
        `placements-batched=${[...instancedSerials].reduce((n, s) => n + (placementsBySerial.get(s)?.length || 0), 0)} ` +
        `spatialClusters=${sb.spatialClusters}/${sb.baselineSpatialClusters ?? sb.spatialClusters} compactSerials=${sb.compactSerials || 0} chunkTiles=${sb.chunkTiles} instancedDraws=${instancedDraws} ` +
        `materialFusion=${sb.staticSubmeshesBeforeFusion || 0}->${sb.staticSubmeshesAfterFusion || 0} ` +
        `transportPatch=15.8 transportPatchCurrent=15.15 multiDrawCap=${sb.transport?.multiDrawSupported ? 1 : 0} multiDraw=${sb.transport?.sourceDraws || 0}->${sb.transport?.batchedDraws || 0} effectiveStaticDraws=${sb.effectiveStaticDraws ?? instancedDraws} ` +
        `transportMode=${sb.transport?.mode || 'none'} transportGroups=${sb.transport?.mergedGroups || 0}/${sb.transport?.attemptedGroups || 0} mergeEff=${Number(sb.transport?.mergeEfficiencyPct || 0).toFixed(1)}% remainingEligible=${sb.transport?.remainingEligibleDraws || 0} packingBins=${sb.transport?.packingBins || 0} singletonRemainder=${sb.transport?.singletonRemainder || 0} expandedVerts=${sb.transport?.expandedVertices || 0} expandedIdx=${sb.transport?.expandedIndices || 0} budgetSkips=${sb.transport?.skippedBudget || 0} packing=${sb.transport?.packingSelected || 0}/${sb.transport?.packingCandidates || 0} savedDraws=${sb.transport?.packingSavedDraws || 0} ` +
        `fallbackClones=${shared - [...instancedSerials].reduce((n, s) => n + (placementsBySerial.get(s)?.length || 0), 0)} ` +
        `sourceHidden=${sourceHiddenPlacements}`);
    }

    const missingSerials = [...modelCache.entries()].filter(([, v]) => !v).map(([serial]) => serial + 1);
    const geometryOwners=[...templates.values(),...this.instances.map(slot=>slot.renderer).filter(Boolean)];
    this._loadGeometryStats=geometryOwners.reduce((stats,owner)=>({builds:stats.builds+(owner.userData.muBmdGeometryBuilds||0),reuses:stats.reuses+(owner.userData.muBmdGeometryReuses||0)}),{builds:0,reuses:0});
    console.info(`[WorldObjects FIX23] geometry World${worldNum}: builds=${this._loadGeometryStats.builds} reused=${this._loadGeometryStats.reuses}`);
    this._loadBoundStats = { models: localBoundsBySerial.size, reusedPlacements: boundReusePlacements, fallbackPlacements: boundFallbackPlacements };
    console.info(`[WorldObjects FIX21] bounds World${worldNum}: modelSweeps=${localBoundsBySerial.size} transformedPlacements=${boundReusePlacements} fallbackSweeps=${boundFallbackPlacements}; updateOwners=${this._ownedUpdateOwners.size}`);
    // FIX42 physical map audit: one stable line per ObjectXX in Lorencia/Icarus.
    // This distinguishes "model absent" from "source-hidden controller" and
    // "owner installed but visually wrong", which the old aggregate PASS could not.
    const serialAudit={};
    if (worldNum===1 || worldNum===11) {
      for (const [serial, placements] of [...placementsBySerial.entries()].sort((a,b)=>a[0]-b[0])) {
        const slots=this.instances.filter(slot=>slot?.obj?.serial===serial);
        const counts={
          renderer:slots.filter(x=>!!x.renderer).length,
          lorenciaVisual:slots.filter(x=>!!x.pcLorenciaVisualOwner).length,
          lorenciaBone:slots.filter(x=>!!x.pcLorenciaBoneVisualOwner).length,
          mapBone:slots.filter(x=>!!x.pcMapBoneVisualOwner).length,
          mapParticle:slots.filter(x=>!!x.pcMapParticleOwner).length,
          runtime:slots.filter(x=>!!x.pcMapRuntimePresentation).length,
        };
        const path=sourceHiddenNoRendererSerials.has(serial)?'source-hidden-no-renderer':instancedSerials.has(serial)?'instanced':animatedSerials.has(serial)?'animated':'clone/static';
        const rec={object:serial+1,placements:placements.length,model:modelCache.get(serial)?'ok':'missing',path,sourceHidden:pcMapHideBaseBmd(worldNum,serial),missing:missingBySerial.get(serial)||0,owners:counts};
        serialAudit[serial+1]=rec;
        console.info(`[WorldObjects AUDIT FIX42] W${worldNum} Object${serial+1} placements=${rec.placements} model=${rec.model} path=${path} hidden=${rec.sourceHidden?1:0} missing=${rec.missing} owners=renderer:${counts.renderer},lorencia:${counts.lorenciaVisual},lorenciaBone:${counts.lorenciaBone},mapBone:${counts.mapBone},particle:${counts.mapParticle},runtime:${counts.runtime}`);
      }
    }
    console.info(`[WorldObjects] World${worldNum}: rendered=${rendered} missing=${missing}` +
      (missingSerials.length ? ` missingModels=${missingSerials.join(',')}` : ''));
    return { ...parsed, rendered, missing, histogram: Object.fromEntries(histogram), missingSerials, serialAudit };
  }

  updateVisibility(camera) {
    if (this._disposed || !camera) return;
    camera.updateMatrixWorld?.();
    this._viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._viewFrustum.setFromProjectionMatrix(this._viewProjection);
    let visible = 0, total = 0;
    for (const slot of this.instances) {
      if (!slot?.renderer || slot.outer?.userData?.muPcHiddenMeshMinus2) continue;
      total++;
      let on = true;
      if (slot.cullSphere) on = this._viewFrustum.intersectsSphere(slot.cullSphere);
      slot.outer.visible = on;
      // `visible=false` still leaves thousands of Object3D children under the
      // root and WebGLRenderer traverses them to reject each frame. Detaching
      // a culled animated container is presentation-equivalent because its
      // world transform is static and animation time is already deferred by
      // the owner callback. Reattach the exact same container on visibility.
      if (on) {
        if (!slot.sceneAttached || slot.outer.parent !== this.root) {
          this.root.add(slot.outer);
          slot.sceneAttached = true;
        }
        visible++;
      } else if (slot.sceneAttached && slot.outer.parent === this.root) {
        this.root.remove(slot.outer);
        slot.sceneAttached = false;
      }
    }
    this._visibleAnimated = visible;
    this._totalAnimated = total;
  }

  dispose() {
    this._disposed = true;
    this._pendingUpdateOwners.length = 0;
    this._pendingUpdateOwnerSet.clear();
    // Retire thousands of map callbacks in one pass, preserving the shared
    // array identity and every non-map owner (hero, pets, UI, effects).
    const owners = this.gameScene.objects;
    let write = 0;
    for (let read = 0; read < owners.length; read++) {
      if (!this._ownedUpdateOwners.has(owners[read])) owners[write++] = owners[read];
    }
    owners.length = write;
    this._ownedUpdateOwners.clear();
    for (const s of this.instances) {
      const i = this.gameScene.objects.indexOf(s.outer);
      if (i >= 0) this.gameScene.objects.splice(i, 1);
      s.outer.userData.update = null;
      if (s.pcVisualSprite) {
        const vi = this.gameScene.objects.indexOf(s.pcVisualSprite);
        if (vi >= 0) this.gameScene.objects.splice(vi, 1);
        try { this.root.remove(s.pcVisualSprite); s.pcVisualSprite.material?.dispose?.(); } catch (_) { /* best effort */ }
      }
      if (s.pcParticleOwner?.group) {
        const pi = this.gameScene.objects.indexOf(s.pcParticleOwner.group);
        if (pi >= 0) this.gameScene.objects.splice(pi, 1);
        try { s.pcParticleOwner.dispose?.(); } catch (_) { /* best effort */ }
      }
      if (s.pcLorenciaVisualOwner?.group) {
        const li = this.gameScene.objects.indexOf(s.pcLorenciaVisualOwner.group);
        if (li >= 0) this.gameScene.objects.splice(li, 1);
        try { this.root.remove(s.pcLorenciaVisualOwner.group); s.pcLorenciaVisualOwner.dispose?.(); } catch (_) { /* best effort */ }
      }
      if (s.pcLorenciaBoneVisualOwner?.group) {
        try { this.root.remove(s.pcLorenciaBoneVisualOwner.group); s.pcLorenciaBoneVisualOwner.dispose?.(); } catch (_) { /* best effort */ }
      }
      if (s.pcMapBoneVisualOwner?.group) {
        try { this.root.remove(s.pcMapBoneVisualOwner.group); s.pcMapBoneVisualOwner.dispose?.(); } catch (_) { /* best effort */ }
      }
      if (s.pcMapParticleOwner?.group) {
        const pi = this.gameScene.objects.indexOf(s.pcMapParticleOwner.group);
        if (pi >= 0) this.gameScene.objects.splice(pi, 1);
        try { this.root.remove(s.pcMapParticleOwner.group); s.pcMapParticleOwner.dispose?.(); } catch (_) { /* best effort */ }
      }
      // slot.renderer é null nos placements estáticos (compartilham o
      // template); apenas os animados têm renderer próprio.
      if (s.renderer) { try { s.renderer.dispose(); } catch (_) { /* best effort */ } }
    }
    if (this._lorenciaEnvironmentOwner?.group) {
      const lei = this.gameScene.objects.indexOf(this._lorenciaEnvironmentOwner.group);
      if (lei >= 0) this.gameScene.objects.splice(lei, 1);
      try { this.root.remove(this._lorenciaEnvironmentOwner.group); this._lorenciaEnvironmentOwner.dispose?.(); } catch (_) { /* best effort */ }
      this._lorenciaEnvironmentOwner = null;
    }
    if (this._lorenciaFishOwner?.group) {
      const fi = this.gameScene.objects.indexOf(this._lorenciaFishOwner.group);
      if (fi >= 0) this.gameScene.objects.splice(fi, 1);
      try { this.root.remove(this._lorenciaFishOwner.group); this._lorenciaFishOwner.dispose?.(); } catch (_) { /* best effort */ }
      this._lorenciaFishOwner = null;
    }
    if (this._lorenciaFaunaOwner?.group) {
      const li = this.gameScene.objects.indexOf(this._lorenciaFaunaOwner.group);
      if (li >= 0) this.gameScene.objects.splice(li, 1);
      try { this.root.remove(this._lorenciaFaunaOwner.group); this._lorenciaFaunaOwner.dispose?.(); } catch (_) { /* best effort */ }
      this._lorenciaFaunaOwner = null;
    }
    if (this._icarusEnvironmentOwner?.group) {
      const ii = this.gameScene.objects.indexOf(this._icarusEnvironmentOwner.group);
      if (ii >= 0) this.gameScene.objects.splice(ii, 1);
      try { this.root.remove(this._icarusEnvironmentOwner.group); this._icarusEnvironmentOwner.dispose?.(); } catch (_) { /* best effort */ }
      this._icarusEnvironmentOwner = null;
    }
    if (this._mapWorldVisualOwner?.group) {
      const wi = this.gameScene.objects.indexOf(this._mapWorldVisualOwner.group);
      if (wi >= 0) this.gameScene.objects.splice(wi, 1);
      try { this.root.remove(this._mapWorldVisualOwner.group); this._mapWorldVisualOwner.dispose?.(); } catch (_) { /* best effort */ }
      this._mapWorldVisualOwner = null;
    }
    if (this._dynamicTerrainLightOwner) {
      const di = this.gameScene.objects.indexOf(this._dynamicTerrainLightOwner);
      if (di >= 0) this.gameScene.objects.splice(di, 1);
      this._dynamicTerrainLightOwner.userData.update = null;
      this._dynamicTerrainLightOwner = null;
    }
    // R15: vários clusters compartilham a MESMA geometria baked por submesh.
    // Não chamar dispose por InstancedMesh (double-dispose); libera uma vez por
    // geometria única depois de remover os batches.
    this._instancedMeshes = [];
    // BatchedMesh possui buffers GPU próprios; materiais/geometrias fonte
    // continuam pertencendo aos templates/_instancedGeometries e são liberados
    // pelos owners existentes abaixo.
    for (const batch of this._batchedMeshes || []) {
      try { this.root.remove(batch); batch.dispose?.(); if (batch.userData?.__muOwnedMaterial) batch.material?.dispose?.(); } catch (_) { /* best effort */ }
    }
    this._batchedMeshes = [];
    for (const mesh of this._mergedTransportMeshes || []) {
      try { this.root.remove(mesh); mesh.geometry?.dispose?.(); if (mesh.userData?.__muOwnedMaterial) mesh.material?.dispose?.(); } catch (_) { /* best effort */ }
    }
    this._mergedTransportMeshes = [];
    for (const geo of this._instancedGeometries || []) {
      try { geo?.dispose?.(); } catch (_) { /* best effort */ }
    }
    this._instancedGeometries?.clear?.();
    // Templates estáticos: descartar UMA vez (material/skeleton compartilhado).
    for (const tpl of this._templateRenderers || []) {
      try { tpl.dispose(); } catch (_) { /* best effort */ }
    }
    this._templateRenderers = [];
    this.instances = [];
    this.gameScene.scene.remove(this.root);
    this.root.clear();
  }
}
