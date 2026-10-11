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
import { createPcIcarusBoidsOwner } from './PcIcarusBoids.js';
import { createPcLorenciaFaunaOwner } from './PcLorenciaFauna.js';
import { createPcLorenciaEnvironmentOwner } from './PcLorenciaEnvironment.js';
import { createPcLorenciaFishOwner } from './PcLorenciaFish.js';

const ENTRY_SIZE = 30;
const HEADER_SIZE = 4;
// MAPS_ENGINE M110: MAP_SIZE is immutable for the loaded engine. Hoist its half-map
// basis once so the measured static placement/terrain-light paths do not repeat the
// same division for every instance. IEEE-754 result is identical to MAP_SIZE / 2.
const HALF_MAP_SIZE = MAP_SIZE / 2;
const BASIS = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
const BASIS_INV = BASIS.clone().invert();

// MAPS_ENGINE M68: model-authority staging has the same device-width problem as
// placement construction. Keep conservative caps so BMD parse/texture work can
// overlap on modern CPUs without flooding memory/GPU upload queues.
export function pcMapModelStageConcurrency(logicalCores = Number(globalThis?.navigator?.hardwareConcurrency) || 4) {
  const cores = Math.max(1, Number(logicalCores) || 4);
  return cores >= 12 ? 6 : cores >= 8 ? 5 : 4;
}


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
const LORENCIA_ARCHITECTURE_AUDIT_SERIALS = new Set([65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,115,116,117,118,119,120,121,122,123,124,125,126,127,128,129]);

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
  return out.set(obj.x - HALF_MAP_SIZE, obj.z, HALF_MAP_SIZE - obj.y);
}

/**
 * Converte a rotação local MU Z-up para Three Y-up por mudança de base.
 * MAPS_ENGINE M126: optional per-load scratch reuses exactly the five matrices
 * from the original Rz*Ry*Rx / BASIS conjugation. The exported two-argument
 * behavior remains unchanged; no shared global mutable scratch is introduced.
 * Placement workers never yield inside this synchronous math block.
 */
export function muObjectQuaternion(obj, out = new THREE.Quaternion(), scratch = null) {
  const rx = scratch?.rx || new THREE.Matrix4();
  const ry = scratch?.ry || new THREE.Matrix4();
  const rz = scratch?.rz || new THREE.Matrix4();
  const rMu = scratch?.rMu || new THREE.Matrix4();
  const rThree = scratch?.rThree || new THREE.Matrix4();
  rx.makeRotationX(THREE.MathUtils.degToRad(obj.angleX));
  ry.makeRotationY(THREE.MathUtils.degToRad(obj.angleY));
  rz.makeRotationZ(THREE.MathUtils.degToRad(obj.angleZ));
  // Same multiply order as legacy: rz.clone().multiply(ry).multiply(rx).
  rMu.copy(rz).multiply(ry).multiply(rx);
  // Same BASIS clone/multiply order; preserve authored angles and handedness.
  rThree.copy(BASIS).multiply(rMu).multiply(BASIS_INV);
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
  // M137: caller cannot register this geometry for disposal until the bake
  // returns. A malformed BMD bone/normal stream must release the partial clone.
  try {
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
  } catch (e) {
    try { geo.dispose?.(); } catch (_) { /* preserve original BMD failure */ }
    throw e;
  }
}

/** Matriz que substitui outer(position/rotation/scale) -> inner(MU Z-up) -> child. */
export function createStaticPlacementScratch() {
  return {
    pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scl: new THREE.Vector3(),
    rx: new THREE.Matrix4(), ry: new THREE.Matrix4(), rz: new THREE.Matrix4(),
    rMu: new THREE.Matrix4(), rThree: new THREE.Matrix4(), outer: new THREE.Matrix4(),
    // M94: one-entry MRU avoids nested Map traversal for consecutive authored rotations.
    lastAngleX: 0, lastAngleY: 0, lastAngleZ: 0, lastRotationValid: false,
    lastQuat: new THREE.Quaternion(), rotationMruHits: 0, rotationMapHits: 0, rotationMisses: 0,
    // M114: uniform scale MRU; Object.is preserves authored -0/NaN semantics exactly.
    lastUniformScale: 0, lastUniformScaleValid: false, scaleMruHits: 0, scaleWrites: 0,
  };
}

/**
 * MAPS_ENGINE M82: allocation-free hot path for static placement batching.
 * M75/M81 physical profiling isolates staticBatch as a dominant World1 phase.
 * The previous helper allocated 3 vectors/quaternions plus 6+ Matrix4 objects
 * for EVERY placement (muObjectQuaternion clones included). Reuse one scratch
 * set per synchronous static-batch build. Matrix order and numeric operations
 * remain identical; no placement/material/terrain-light/mesh content changes.
 */
export function staticPlacementMatrix(obj, child = null, out = new THREE.Matrix4(), scratch = null, rotationCache = null, positionX = undefined, positionY = undefined, positionZ = undefined) {
  const sc = scratch || createStaticPlacementScratch();
  // MAPS_ENGINE M108: staticPlacementMatrix is the measured staticBatch hot path.
  // Avoid the helper call/property rereads for position while preserving the exact
  // MU->Three mapping used by muObjectPositionToThree(): x-half, z, half-y.
  // Keep the exported helper unchanged for all non-batch callers.
  // MAPS_ENGINE M111: the instanceFill caller already snapshots x/y for region
  // attribution and terrain BodyLight. Accept that snapshot so staticPlacementMatrix
  // does not resolve x/y from the placement object a second time. z is included in
  // the same immutable snapshot. Non-batch callers keep the exact legacy reads.
  // MAPS_ENGINE M112: M111 proved that instanceFill already owns the exact x/y/z
  // snapshot. Pass those primitive values directly instead of mutating/reading a
  // scratch snapshot object for every placement. Undefined is only the sentinel
  // used by legacy/non-batch callers; authored numeric values (including 0) pass
  // through unchanged. This removes three scratch writes + three scratch reads
  // from the dominant fill without changing mapping, placement order or content.
  const px = positionX === undefined ? obj.x : positionX;
  const py = positionY === undefined ? obj.y : positionY;
  const pz = positionZ === undefined ? obj.z : positionZ;
  sc.pos.set(px - HALF_MAP_SIZE, pz, HALF_MAP_SIZE - py);
  // MAPS_ENGINE M92: map placements overwhelmingly reuse authored angle triples
  // inside one ObjectXX family. Cache the exact quaternion produced by the old
  // Rz*Ry*Rx -> MU/Three basis conversion per serial, so repeated placements do
  // not rebuild six rotation matrices. The first occurrence uses the unchanged
  // numeric path below; later occurrences only copy that exact quaternion.
  // MAPS_ENGINE M93: keep M92 reuse but remove the per-placement template-string
  // allocation/hash from the hot loop. Numeric nested Maps preserve the exact
  // authored angle triple identity while allocating only on first-seen triples.
  let cachedRotation = null;
  let rotationZMap = null;
  // MAPS_ENGINE M107: angleX/Y/Z feed the MRU test, nested rotation cache,
  // miss-path matrix construction and MRU refresh. Snapshot each authored value
  // once per placement so the dominant staticBatch fill does not repeatedly
  // resolve the same object properties. Numeric identity and cache keys are
  // unchanged; this is only hot-path property-access reduction.
  const angleX = obj.angleX;
  const angleY = obj.angleY;
  const angleZ = obj.angleZ;
  // MAPS_ENGINE M94: spatial/object data commonly contains runs with the same
  // authored rotation. Before traversing the three-level M93 cache, test one
  // scratch-local MRU entry. This removes Map hashing/lookups on the common run
  // path while preserving exact angle identity and the cached quaternion bytes.
  // It is local to the synchronous static-batch scratch and cannot leak maps.
  const m94MruHit = sc.lastRotationValid &&
    sc.lastAngleX === angleX && sc.lastAngleY === angleY && sc.lastAngleZ === angleZ;
  if (m94MruHit) {
    cachedRotation = sc.lastQuat;
    sc.rotationMruHits++;
  } else if (rotationCache) {
    let rotationYMap = rotationCache.get(angleX);
    if (rotationYMap) rotationZMap = rotationYMap.get(angleY) || null;
    cachedRotation = rotationZMap?.get(angleZ) || null;
    if (cachedRotation) sc.rotationMapHits++;
  }
  if (cachedRotation) {
    sc.quat.copy(cachedRotation);
  } else {
    sc.rotationMisses++;
    sc.rx.makeRotationX(THREE.MathUtils.degToRad(angleX));
    sc.ry.makeRotationY(THREE.MathUtils.degToRad(angleY));
    sc.rz.makeRotationZ(THREE.MathUtils.degToRad(angleZ));
    sc.rMu.copy(sc.rz).multiply(sc.ry).multiply(sc.rx);
    sc.rThree.copy(BASIS).multiply(sc.rMu).multiply(BASIS_INV);
    sc.quat.setFromRotationMatrix(sc.rThree).normalize();
    if (rotationCache) {
      let rotationYMap = rotationCache.get(angleX);
      if (!rotationYMap) rotationCache.set(angleX, rotationYMap = new Map());
      rotationZMap = rotationYMap.get(angleY);
      if (!rotationZMap) rotationYMap.set(angleY, rotationZMap = new Map());
      rotationZMap.set(angleZ, sc.quat.clone());
    }
  }
  // Refresh MRU from the exact quaternion selected/generated above.
  // MAPS_ENGINE M113: on an M94 MRU hit these fields already contain this exact
  // angle triple/quaternion, so rewriting three scalars plus copying the same
  // quaternion back into lastQuat is redundant. Refresh only after map-hit/miss.
  if (!m94MruHit) {
    sc.lastAngleX = angleX; sc.lastAngleY = angleY; sc.lastAngleZ = angleZ;
    sc.lastQuat.copy(sc.quat); sc.lastRotationValid = true;
  }
  // MAPS_ENGINE M109: scale is uniform and authored once per placement. Snapshot
  // it once instead of resolving the authored scale three times while filling the measured
  // staticBatch instance path. The resulting Vector3 is numerically identical.
  const uniformScale = obj.scale;
  // MAPS_ENGINE M114: static object families commonly contain runs of the same
  // authored uniform scale. Avoid rewriting the scratch Vector3 when the exact
  // scalar is unchanged. Object.is (rather than ===) keeps -0 distinct and NaN
  // stable, so the resulting compose input is byte/semantic-equivalent.
  if (sc.lastUniformScaleValid && Object.is(sc.lastUniformScale, uniformScale)) {
    sc.scaleMruHits++;
  } else {
    sc.scl.set(uniformScale, uniformScale, uniformScale);
    sc.lastUniformScale = uniformScale;
    sc.lastUniformScaleValid = true;
    sc.scaleWrites++;
  }
  sc.outer.compose(sc.pos, sc.quat, sc.scl);
  out.copy(sc.outer).multiply(BASIS);
  if (child) out.multiply(child.matrix);
  return out;
}

// R15.4: vários ObjectXX.bmd dividem a mesma textura/material entre submeshes.
// Instanciar cada submesh separadamente multiplica draw calls por cluster. Para
// props ESTÁTICOS podemos fundir apenas geometrias com material efetivamente
// equivalente, preservando exatamente triângulos/UV/normais e producer visual.
// O merge é fail-closed: qualquer diferença de atributos/material mantém o path
// antigo. Nenhum placement, triângulo ou material é descartado.
// M134: the previous coarse key compared material.map and a few render flags,
// but not ShaderMaterial's ACTUAL GPU inputs. Two different BMD shaders could
// therefore be fused into one draw while using only the first material's map,
// hasMap, chrome flags, BodyLight, alpha, lighting or UV scroll. This is a
// correctness issue, not an optimization opportunity. Keep the cheap legacy
// key for ordinary materials, but fail closed on unknown ShaderMaterial state.
// Shader sources are compared as exact strings and assigned collision-free IDs;
// this avoids inserting multi-KB shader programs into every cluster key.
const m134ShaderProgramIds = new Map();
const m134OpaqueMaterialIds = new WeakMap();
let m134NextMaterialId = 1;
function m134ObjectIdentity(value) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return 'invalid';
  let id = m134OpaqueMaterialIds.get(value);
  if (!id) { id = m134NextMaterialId++; m134OpaqueMaterialIds.set(value, id); }
  return id;
}
function m134ShaderProgramId(mat) {
  if (typeof mat.vertexShader !== 'string' || typeof mat.fragmentShader !== 'string') return null;
  // Nested maps compare both sources exactly, without hash collisions.
  let fragments = m134ShaderProgramIds.get(mat.vertexShader);
  if (!fragments) { fragments = new Map(); m134ShaderProgramIds.set(mat.vertexShader, fragments); }
  let id = fragments.get(mat.fragmentShader);
  if (!id) { id = m134NextMaterialId++; fragments.set(mat.fragmentShader, id); }
  return id;
}
function m134UniformValueKey(value, depth = 0) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return `n:${Object.is(value, -0) ? '-0' : String(value)}`;
  if (typeof value === 'string') return `s:${JSON.stringify(value)}`;
  if (depth > 3) return null; // unexpected nested owner: do not fuse
  if (value.isTexture) {
    // A texture UUID identifies one mutable sampler/upload owner. Comparing
    // only texture.source.uuid would incorrectly merge distinct wrap/filter
    // states sharing the same pixels.
    return typeof value.uuid === 'string' ? `texture:${value.uuid}` : null;
  }
  if (value.isColor) return `color:${value.r},${value.g},${value.b}`;
  if (value.isVector2) return `v2:${value.x},${value.y}`;
  if (value.isVector3) return `v3:${value.x},${value.y},${value.z}`;
  if (value.isVector4) return `v4:${value.x},${value.y},${value.z},${value.w}`;
  if (value.isEuler) return `euler:${value.x},${value.y},${value.z},${value.order}`;
  if (value.isMatrix3 || value.isMatrix4) {
    const arr = value.elements;
    return arr && arr.length === (value.isMatrix3 ? 9 : 16) ? `mat:${Array.from(arr).join(',')}` : null;
  }
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const values = [];
    for (const item of value) {
      const key = m134UniformValueKey(item, depth + 1);
      if (key === null) return null;
      values.push(key);
    }
    return `[${values.join(',')}]`;
  }
  return null; // arbitrary object/function uniform: material identity only
}
function m134ShaderStateKey(mat) {
  // User hooks can mutate the final WebGL program independently of uniforms.
  // Do not assume two separately owned hook-bearing materials are equivalent.
  if (Object.hasOwn(mat, 'onBeforeCompile') || Object.hasOwn(mat, 'customProgramCacheKey')) return null;
  if (mat.uniformsGroups?.length || mat.clippingPlanes?.length) return null;
  const program = m134ShaderProgramId(mat);
  if (program === null || !mat.uniforms || typeof mat.uniforms !== 'object') return null;
  const uniforms = [];
  for (const name of Object.keys(mat.uniforms).sort()) {
    const uniform = mat.uniforms[name];
    if (!uniform || !Object.hasOwn(uniform, 'value')) return null;
    const value = m134UniformValueKey(uniform.value);
    if (value === null) return null;
    uniforms.push(`${JSON.stringify(name)}=${value}`);
  }
  const defines = [];
  for (const name of Object.keys(mat.defines || {}).sort()) {
    const value = m134UniformValueKey(mat.defines[name]);
    if (value === null) return null;
    defines.push(`${JSON.stringify(name)}=${value}`);
  }
  // Include every state that can change shader compilation, depth, blending,
  // stencil or rasterization, not only the original staticMaterialKey fields.
  const stateFields = [
    'glslVersion','precision','lights','fog','clipping','toneMapped','premultipliedAlpha',
    'dithering','alphaToCoverage','colorWrite','depthFunc','stencilWrite',
    'stencilWriteMask','stencilFunc','stencilRef','stencilFuncMask',
    'stencilFail','stencilZFail','stencilZPass','polygonOffset',
    'polygonOffsetFactor','polygonOffsetUnits','blendSrc','blendDst',
    'blendEquation','blendSrcAlpha','blendDstAlpha','blendEquationAlpha',
    'forceSinglePass','wireframe','wireframeLinewidth','visible',
    'clipIntersection','clipShadows','shadowSide','alphaHash','blendAlpha',
    'blendColor','blendDstAlpha','blendEquationAlpha'
  ];
  const states = [];
  for (const name of stateFields) {
    const key = m134UniformValueKey(mat[name]);
    if (key === null) return null;
    states.push(key);
  }
  // ShaderMaterial.extensions are plain feature toggles; any unknown nested
  // value falls back to unique owner rather than assuming shader equivalence.
  const extensions = [];
  for (const name of Object.keys(mat.extensions || {}).sort()) {
    const key = m134UniformValueKey(mat.extensions[name]);
    if (key === null) return null;
    extensions.push(`${JSON.stringify(name)}=${key}`);
  }
  // M135: shader defaults are injected when an attribute is absent from the
  // BMD geometry. Equal uniforms do NOT imply equal pixels if one shader uses
  // a different fallback color/UV or binds a different index-0 attribute.
  const defaults = [];
  for (const name of Object.keys(mat.defaultAttributeValues || {}).sort()) {
    const key = m134UniformValueKey(mat.defaultAttributeValues[name]);
    if (key === null) return null;
    defaults.push(`${JSON.stringify(name)}=${key}`);
  }
  const index0 = m134UniformValueKey(mat.index0AttributeName);
  if (index0 === null) return null;
  return `${program}|${states.join('|')}|${defines.join(';')}|${extensions.join(';')}|${defaults.join(';')}|${index0}|${uniforms.join(';')}`;
}
// M135: the former legacy key for non-shader materials ignored secondary
// texture samplers, light maps, environment maps, stencil and other GPU state.
// Preserve the fast structural grouping for ordinary MeshBasicMaterial only,
// with its complete supported input set. Other material classes or custom
// program hooks stay on their exact authored owner (fail closed). BMD
// ShaderMaterial grouping above is unchanged except for attribute defaults.
function m135BasicMaterialStateKey(mat) {
  if (mat.type !== 'MeshBasicMaterial' ||
      Object.hasOwn(mat, 'onBeforeCompile') || Object.hasOwn(mat, 'customProgramCacheKey') ||
      mat.clippingPlanes?.length || mat.uniformsGroups?.length) return null;
  const fields = [
    'map','alphaMap','aoMap','lightMap','envMap','specularMap',
    'normalMap','bumpMap','displacementMap','emissiveMap','metalnessMap',
    'roughnessMap','matcap','gradientMap','color','lightMapIntensity',
    'aoMapIntensity','envMapIntensity','envMapRotation','reflectivity','refractionRatio',
    'combine','fog','toneMapped','colorWrite','depthFunc','polygonOffset',
    'polygonOffsetFactor','polygonOffsetUnits','premultipliedAlpha',
    'alphaToCoverage','dithering','stencilWrite','stencilWriteMask',
    'stencilFunc','stencilRef','stencilFuncMask','stencilFail',
    'stencilZFail','stencilZPass','blendSrc','blendDst','blendEquation',
    'blendSrcAlpha','blendDstAlpha','blendEquationAlpha','wireframe',
    'wireframeLinewidth','wireframeLinecap','wireframeLinejoin',
    'visible','side','shadowSide','vertexColors','alphaTest',
    'transparent','opacity','depthWrite','depthTest','blending',
    'clipIntersection','clipShadows','forceSinglePass','alphaHash',
    'blendAlpha','blendColor',
  ];
  const keys = [];
  for (const field of fields) {
    const key = m134UniformValueKey(mat[field]);
    if (key === null) return null;
    keys.push(key);
  }
  return keys.join('|');
}
export function staticMaterialKey(mat) {
  if (!mat) return 'null';
  const map = mat.map?.uuid || 'nomap';
  const color = mat.color?.getHexString?.() || '';
  const base = [mat.type, map, color, mat.transparent ? 1 : 0, Number(mat.alphaTest || 0),
    mat.depthWrite ? 1 : 0, mat.depthTest ? 1 : 0, mat.side, mat.blending,
    Number(mat.opacity ?? 1), Number(mat.metalness ?? 0), Number(mat.roughness ?? 1), mat.vertexColors ? 1 : 0].join('|');
  if (!mat.isShaderMaterial) {
    const basicState = m135BasicMaterialStateKey(mat);
    return basicState === null
      ? `${base}|material-owner:${m134ObjectIdentity(mat)}`
      : `${base}|basic-state:${basicState}`;
  }
  const shaderState = m134ShaderStateKey(mat);
  return shaderState === null
    ? `${base}|shader-owner:${m134ObjectIdentity(mat)}`
    : `${base}|shader-state:${shaderState}`;
}

export function mergeStaticGeometries(parts) {
  if (!parts?.length) return null;
  const geos = [];
  let out = null;
  try {
    for (const part of parts) {
      let g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      // M137: own the temporary clone BEFORE transforms/vertex-color writes.
      // A corrupt BMD attribute or failing transform must not strand its CPU/GPU
      // geometry lease outside the transport transaction's rollback path.
      geos.push(g);
      g.applyMatrix4(part.matrix);
      // R73 visual parity: CPU transport merges must not erase the per-object
      // BodyLight that existed as InstancedMesh.instanceColor.  When a part
      // carries an authored placement color, expand it to a normal vertex-color
      // attribute before concatenation; the BMD shader consumes this as a
      // second BodyLight multiplier only on the merged material clone.
      // M138: CPU transport carries sampled BodyLight as three primitive
      // values on the existing part object. Avoid a THREE.Color allocation
      // per placement while retaining exact Float32 RGB writes.
      // Legacy callers with part.color remain supported.
      if (part.color || part.hasInstanceBodyLight) {
        const count = g.getAttribute('position')?.count || 0;
        const r = part.color ? part.color.r : part.colorR;
        const green = part.color ? part.color.g : part.colorG;
        const b = part.color ? part.color.b : part.colorB;
        const arr = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          arr[i*3] = r; arr[i*3+1] = green; arr[i*3+2] = b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      }
    }
    const names = Object.keys(geos[0].attributes).sort();
    if (!names.includes('position')) return null;
    const sig = names.map(n => { const a=geos[0].getAttribute(n); return `${n}:${a.itemSize}:${a.normalized?1:0}:${a.array.constructor.name}`; }).join(',');
    for (const g of geos) {
      const ns = Object.keys(g.attributes).sort();
      const gs = ns.map(n => { const a=g.getAttribute(n); return `${n}:${a.itemSize}:${a.normalized?1:0}:${a.array.constructor.name}`; }).join(',');
      if (gs !== sig) return null;
    }
    out = new THREE.BufferGeometry();
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
  } catch (e) {
    // M137: a partially assembled merged BufferGeometry has no caller owner
    // until return. Release it even if attribute/bounds creation throws.
    try { out?.dispose?.(); } catch (_) { /* preserve original error */ }
    throw e;
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
  return partitionSpatialPlacementsProfiled(placements, chunkTiles).groups;
}

// MAPS_ENGINE M85: build the baseline spatial grid and exact placement bounds
// in the SAME traversal. M83 removed a duplicate grid build for non-compact
// serials, but partitionAdaptiveSpatialPlacements still rescanned every placement
// solely to recover min/max bounds. World1 staticBatch is a measured dominant
// entry phase, so keep those bounds beside the grid and reuse them below.
// This is bookkeeping only: group keys, members and insertion order are unchanged.
export function partitionSpatialPlacementsProfiled(placements, chunkTiles = DEFAULT_STATIC_BATCH_TILES) {
  const groups = new Map();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let count = 0;
  for (const item of placements || []) {
    const o = item.obj || item;
    const x = Number(o?.x || 0), y = Number(o?.y || 0);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    const key = spatialBatchKey(o, chunkTiles);
    let arr = groups.get(key);
    if (!arr) groups.set(key, arr = []);
    arr.push(item);
    count++;
  }
  return { groups, bounds: { minX, maxX, minY, maxY, count } };
}

// R15.7 PERF: serials estáticos espacialmente compactos não precisam pagar
// múltiplos draws só porque atravessam uma borda artificial do grid de 128
// tiles. Se TODO o conjunto cabe em uma caixa <=64x64 tiles, mantemos um único
// cluster. O boundingSphere/Box do InstancedMesh continua sendo calculado sobre
// todas as instâncias reais, então o frustum segue fail-closed: nada é removido,
// nenhuma distância/LOD é alterada e serials espalhados continuam no grid R15.5.
const COMPACT_SERIAL_SPAN_TILES = 64;
export function partitionAdaptiveSpatialPlacements(placements, chunkTiles = DEFAULT_STATIC_BATCH_TILES, compactSpanTiles = COMPACT_SERIAL_SPAN_TILES, baselineGroups = null, baselineBounds = null) {
  const items = placements || [];
  if (items.length <= 1) return new Map(items.length ? [['compact', items]] : []);
  let minX, maxX, minY, maxY;
  if (baselineBounds && baselineBounds.count === items.length) {
    ({ minX, maxX, minY, maxY } = baselineBounds);
  } else {
    minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
    for (const item of items) {
      const o = item.obj || item;
      const x = Number(o?.x || 0), y = Number(o?.y || 0);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const limit = Math.max(1, compactSpanTiles) * TERRAIN_SCALE;
  if ((maxX - minX) <= limit && (maxY - minY) <= limit) return new Map([['compact', items]]);
  // MAPS_ENGINE M83: callers that already built the baseline grid for metrics
  // can reuse it here. This avoids a second full placement->grid pass for every
  // non-compact serial while preserving the exact same cluster keys/members.
  return baselineGroups || partitionSpatialPlacements(items, chunkTiles);
}

// R15.8 PERF: second-stage transport compaction. R15.4/R15.7 already
// produce exact static InstancedMesh batches, but each geometry still costs one
// renderer submission. THREE.BatchedMesh can submit DIFFERENT static geometries
// sharing the exact material state in one multi-draw batch while retaining
// per-object frustum culling. This pass is deliberately fail-closed: opaque only,
// identical attribute layout/index mode, positive transforms, and runtime feature
// detection. Any unsupported/failed group remains on the proven InstancedMesh path.
// M136: a transport may only replace a source draw when its geometry is
// rendered in full, as one primitive stream, and no source-local callback or
// shadow override owns its presentation. CPU merge expands every vertex and
// discards BufferGeometry.groups/drawRange; BatchedMesh uses one material and
// one per-object geometry ID. Combining partial/multi-group/morph geometries
// would silently add triangles or erase per-draw semantics. Keep those original
// InstancedMesh owners instead (no content deletion). The ordinary baked BMD
// geometry path (one complete stream, no custom hooks) remains eligible.
export function pcMapStaticGeometryTransportSafe(geo) {
  const pos = geo?.getAttribute?.('position') || geo?.attributes?.position;
  if (!pos || geo.isInstancedBufferGeometry || geo.groups?.length) return false;
  const total = geo.index?.count ?? pos.count;
  const range = geo.drawRange;
  if (range && (range.start !== 0 ||
      (range.count !== Infinity && !(Number.isFinite(range.count) && range.count >= total)))) return false;
  if (Object.values(geo.morphAttributes || {}).some(attrs => attrs?.length)) return false;
  if (geo.index?.isInterleavedBufferAttribute ||
      Object.values(geo.attributes || {}).some(attr => attr?.isInterleavedBufferAttribute || attr?.isInstancedBufferAttribute)) return false;
  // M137: mergeStaticGeometries constructs ordinary BufferAttributes. Custom
  // integer GPU attribute types or incomplete vertex streams would silently
  // change shader inputs if repacked; retain the original BMD geometry.
  if (Object.values(geo.attributes || {}).some(attr =>
    (attr?.gpuType !== undefined && attr.gpuType !== THREE.FloatType) ||
    (attr?.count !== undefined && attr.count !== pos.count))) return false;
  return true;
}


// MAPS_ENGINE M137: template submesh fusion happens BEFORE the M136 static
// transport gate.  The same full-draw safety rules must apply here: merging
// partial/grouped geometry can add hidden triangles or erase material groups.
// A fused render part has no single child transform, but it must retain a
// common presentation owner (visibility, shadows, order, layers).  If authored
// children disagree, keep their separate InstancedMesh render parts.
// Blended/depth-independent BMD passes depend on per-mesh submission order.
// Geometry fusion and cross-serial transport are only provably order-neutral
// for ordinary opaque depth-tested, depth-writing passes. Preserve every
// authored glow/chrome/additive source on its existing render owner.
export function pcMapStaticOpaqueTransportSafe(mat) {
  return !!mat && !mat.transparent && !mat.wireframe && mat.depthWrite !== false && mat.depthTest !== false &&
    (mat.blending === undefined || mat.blending === (THREE.NormalBlending ?? 1));
}

export function pcMapStaticTemplateFusionSafe(parts) {
  if (!Array.isArray(parts) || parts.length < 2) return false;
  const first = parts[0]?.child;
  if (!first) return false;
  const hooks = ['onBeforeRender', 'onAfterRender', 'onBeforeShadow', 'onAfterShadow'];
  const safeChild = (child) => {
    if (!child || Array.isArray(child.material) || !pcMapStaticOpaqueTransportSafe(child.material) ||
        child.customDepthMaterial || child.customDistanceMaterial) return false;
    for (const name of hooks) {
      const hook = child[name];
      if (typeof hook === 'function' &&
          (Object.hasOwn(child, name) || hook !== THREE.Object3D?.prototype?.[name])) return false;
    }
    return true;
  };
  if (!safeChild(first)) return false;
  const flags = (child) => [child.visible !== false, !!child.castShadow, !!child.receiveShadow,
    child.renderOrder ?? 0, child.layers?.mask ?? 1];
  const reference = flags(first);
  for (const part of parts) {
    if (!pcMapStaticGeometryTransportSafe(part?.baked) || !safeChild(part?.child)) return false;
    const actual = flags(part.child);
    for (let i = 0; i < reference.length; i++) if (!Object.is(reference[i], actual[i])) return false;
  }
  return true;
}

export function staticGeometryLayoutKey(geometry) {
  if (!pcMapStaticGeometryTransportSafe(geometry)) return null;
  const names = Object.keys(geometry.attributes).sort();
  const attrs = names.map((n) => {
    const a = geometry.getAttribute(n);
    return `${n}:${a.itemSize}:${a.normalized ? 1 : 0}:${a.array?.constructor?.name || ''}`;
  }).join(',');
  return `${geometry.index ? 'idx' : 'nonidx'}|${attrs}`;
}

export function compactStaticInstancedTransport(root, meshes, options = {}) {
  const result = { multiDrawSupported: options.multiDrawSupported !== false, attemptedGroups: 0, batchedGroups: 0, sourceDraws: 0, batchedDraws: 0, sourceInstances: 0, expandedVertices: 0, expandedIndices: 0, skippedBudget: 0, skippedUnsafeGeometry: 0, skippedCustomRenderOwner: 0, skippedAuthoredVertexColor: 0, skippedOrderDependentMaterial: 0, packingCandidates: 0, packingSelected: 0, packingSavedDraws: 0, mode: 'none' };
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
  // M133: all spatial clusters of a serial share the same immutable baked
  // BufferGeometry. Resolve its attribute/index signature once per transport
  // invocation, not once per cluster. WeakMap is load-local and cannot retain
  // BMD geometries across map transitions.
  const m133LayoutByGeometry = new WeakMap();
  // M134: one immutable material-state snapshot per transport invocation.
  // No cross-map/global cache: runtime uniforms may change after the build.
  const m134MaterialKeys = new WeakMap();
  // M136: allocate hook names once per transport, not per spatial cluster.
  const m136RenderHooks = ['onBeforeRender','onAfterRender','onBeforeShadow','onAfterShadow'];
  for (const mesh of meshes) {
    // Per-mesh callbacks/shadow overrides cannot be replayed by a merged
    // transport. Keep their exact authored InstancedMesh draw owner.
    let m136CustomHook = false;
    for (const name of m136RenderHooks) {
      const hook = mesh?.[name];
      // Object3D's built-in no-op is safe; own OR inherited custom hooks
      // are not replayed by a transport that replaces the source mesh.
      if (typeof hook === 'function' &&
          (Object.hasOwn(mesh, name) || hook !== THREE.Object3D?.prototype?.[name])) {
        m136CustomHook = true;
        break;
      }
    }
    if (Array.isArray(mesh?.material) || mesh?.customDepthMaterial || mesh?.customDistanceMaterial || m136CustomHook) {
      result.skippedCustomRenderOwner++;
      continue;
    }
    const mat = mesh?.material;
    const geometry = mesh?.geometry;
    // M137: r160's per-geometry BodyLight expansion overwrites an authored
    // vertex-color attribute.  Preserve the original InstancedMesh instead of
    // replacing its PC BMD color stream (modern addInstance keeps the source).
    if (!modernInstances && geometry?.getAttribute?.('color')) {
      result.skippedAuthoredVertexColor++;
      continue;
    }
    let layout = null;
    if (geometry) {
      if (m133LayoutByGeometry.has(geometry)) layout = m133LayoutByGeometry.get(geometry);
      else { layout = staticGeometryLayoutKey(geometry); m133LayoutByGeometry.set(geometry, layout); }
    }
    if (geometry && !layout) result.skippedUnsafeGeometry++;
    if (!mat) continue;
    if (mat.transparent || mat.wireframe || mat.depthWrite === false || mat.depthTest === false ||
        (mat.blending !== undefined && mat.blending !== (THREE.NormalBlending ?? 1))) {
      result.skippedOrderDependentMaterial++;
      continue;
    }
    if (!layout || !mesh.count) continue;
    let materialKey = m134MaterialKeys.get(mat);
    if (materialKey === undefined) { materialKey = staticMaterialKey(mat); m134MaterialKeys.set(mat, materialKey); }
    // M134: BatchedMesh has one visible/shadow/render-order/layer owner.
    // Do not combine authored sources with different presentation flags.
    const flags = `${mesh.visible ? 1 : 0}|${mesh.castShadow ? 1 : 0}|${mesh.receiveShadow ? 1 : 0}|${mesh.renderOrder ?? 0}|${mesh.layers?.mask ?? 1}`;
    const key = `${materialKey}||${layout}||${flags}`;
    let arr = groups.get(key); if (!arr) groups.set(key, arr = []);
    arr.push(mesh);
  }
  for (const rawSource of groups.values()) {
    if (rawSource.length < 2) continue; // one InstancedMesh is already one draw
    result.attemptedGroups++;
    // M133: batch construction is a transaction. If the WebGL transport owner
    // rejects geometry, upload allocation or scene publication, release its
    // private GPU/material resources and keep every source InstancedMesh alive.
    // Only a successfully committed batch transfers ownership to dispose().
    let m133Batch = null, m133Material = null, m133OwnMaterial = false;
    const m133RemovedSources = [];
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
      m133Material = batchMaterial;
      m133OwnMaterial = batchMaterial !== source[0].material;
      if (m133OwnMaterial) {
        batchMaterial.vertexColors = true;
        batchMaterial.needsUpdate = true;
      }
      const batch = new THREE.BatchedMesh(maxGeometryCount, maxVertices, maxIndices, batchMaterial);
      m133Batch = batch;
      batch.userData.__muOwnedMaterial = m133OwnMaterial;
      batch.name = `MU_STATIC_MULTIDRAW_${result.batchedGroups}`;
      batch.visible = source[0].visible;
      batch.castShadow = source[0].castShadow;
      batch.receiveShadow = source[0].receiveShadow;
      batch.renderOrder = source[0].renderOrder ?? 0;
      if (batch.layers && source[0].layers) batch.layers.mask = source[0].layers.mask;
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
            // M133: clone/color allocation AND addGeometry/setMatrixAt can
            // throw. Dispose temporary expanded vertex-color geometry even if
            // the failure occurs before WebGL receives the geometry ID.
            try {
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
            } finally {
              if (geometryForBatch !== m.geometry) geometryForBatch.dispose?.();
            }
          }
        }
      }
      batch.computeBoundingBox?.(); batch.computeBoundingSphere?.();
      for (const m of source) { root.remove(m); m133RemovedSources.push(m); }
      root.add(batch);
      for (const m of source) m.userData.__muTransportCompacted = true;
      result.batchedGroups++; result.sourceDraws += source.length; result.batchedDraws += 1; result.sourceInstances += maxInstances; result.packingSavedDraws += Math.max(0, source.length - 1);
      if (!modernInstances) { result.expandedVertices += maxVertices; result.expandedIndices += indexed ? maxIndices : 0; }
      result.batches ||= []; result.batches.push(batch);
      // Batch + cloned material are now owned by the returned committed list.
      m133Batch = null; m133Material = null; m133RemovedSources.length = 0;
    } catch (e) {
      // Restore the exact source nodes; never dispose source geometry/material.
      if (m133Batch) {
        try { if (m133Batch.parent === root) root.remove(m133Batch); } catch (_) { /* best effort */ }
      }
      for (const m of m133RemovedSources) {
        try { if (m.parent !== root) root.add(m); m.userData.__muTransportCompacted = false; } catch (_) { /* best effort */ }
      }
      try { m133Batch?.dispose?.(); } catch (_) { /* best effort */ }
      if (m133OwnMaterial) { try { m133Material?.dispose?.(); } catch (_) { /* best effort */ } }
      console.warn(`[WorldObjects] R15.11 BatchedMesh fallback: ${e.message}`);
    }
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
  const result = { attemptedGroups: 0, mergedGroups: 0, sourceDraws: 0, mergedDraws: 0, sourceInstances: 0, expandedVertices: 0, skippedBudget: 0, skippedUnsafeGeometry: 0, skippedCustomRenderOwner: 0, skippedAuthoredVertexColor: 0, skippedOrderDependentMaterial: 0, packingCandidates: 0, packingSelected: 0, packingSavedDraws: 0, packingBins: 0, singletonRemainder: 0, uncoloredMergedBins: 0, coloredMergedBins: 0, avoidedColorUploadBytes: 0, avoidedColorObjects: 0, mode: 'cpu-merged-regional', meshes: [] };
  if (!Array.isArray(meshes) || meshes.length < 2) return result;
  const maxVertices = Number(options.maxExpandedVertices) || 180000;
  const groups = new Map();
  // M133: the CPU regional fallback sees the same shared baked geometry across
  // clusters. Cache the exact layout signature only within this one invocation;
  // never cache a mutable renderer or shader/material decision.
  const m133LayoutByGeometry = new WeakMap();
  // M134: one immutable material-state snapshot per transport invocation.
  // No cross-map/global cache: runtime uniforms may change after the build.
  const m134MaterialKeys = new WeakMap();
  // M136: allocate hook names once per transport, not per spatial cluster.
  const m136RenderHooks = ['onBeforeRender','onAfterRender','onBeforeShadow','onAfterShadow'];
  for (const mesh of meshes) {
    // Per-mesh callbacks/shadow overrides cannot be replayed by a merged
    // transport. Keep their exact authored InstancedMesh draw owner.
    let m136CustomHook = false;
    for (const name of m136RenderHooks) {
      const hook = mesh?.[name];
      // Object3D's built-in no-op is safe; own OR inherited custom hooks
      // are not replayed by a transport that replaces the source mesh.
      if (typeof hook === 'function' &&
          (Object.hasOwn(mesh, name) || hook !== THREE.Object3D?.prototype?.[name])) {
        m136CustomHook = true;
        break;
      }
    }
    if (Array.isArray(mesh?.material) || mesh?.customDepthMaterial || mesh?.customDistanceMaterial || m136CustomHook) {
      result.skippedCustomRenderOwner++;
      continue;
    }
    const mat = mesh?.material, geometry = mesh?.geometry, region = mesh?.userData?.__muTransportRegion;
    // M137: mergeStaticGeometries(part.color) creates a new per-placement
    // color attribute.  Do not overwrite an existing authored BMD color lane.
    if (geometry?.getAttribute?.('color')) {
      result.skippedAuthoredVertexColor++;
      continue;
    }
    let layout = null;
    if (geometry) {
      if (m133LayoutByGeometry.has(geometry)) layout = m133LayoutByGeometry.get(geometry);
      else { layout = staticGeometryLayoutKey(geometry); m133LayoutByGeometry.set(geometry, layout); }
    }
    if (geometry && !layout) result.skippedUnsafeGeometry++;
    if (!mat) continue;
    if (mat.transparent || mat.wireframe || mat.depthWrite === false || mat.depthTest === false ||
        (mat.blending !== undefined && mat.blending !== (THREE.NormalBlending ?? 1))) {
      result.skippedOrderDependentMaterial++;
      continue;
    }
    if (!layout || !mesh.count || !region) continue;
    const flags = `${mesh.visible ? 1 : 0}|${mesh.castShadow ? 1 : 0}|${mesh.receiveShadow ? 1 : 0}|${mesh.renderOrder ?? 0}|${mesh.layers?.mask ?? 1}`;
    let materialKey = m134MaterialKeys.get(mat);
    if (materialKey === undefined) { materialKey = staticMaterialKey(mat); m134MaterialKeys.set(mat, materialKey); }
    const key = `${region}||${materialKey}||${layout}||${flags}`;
    let arr = groups.get(key); if (!arr) groups.set(key, arr = []); arr.push(mesh);
  }
  for (const raw of groups.values()) {
    if (raw.length < 2) continue; result.attemptedGroups++;
    // M133: CPU fallback merge also transfers geometry/material ownership only
    // after scene commit. A failed merge must not strand GPU allocations or
    // detach any of the authored source instances.
    let m133Geometry = null, m133MergedMaterial = null, m133MergedMesh = null;
    const m133RemovedCpuSources = [];
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
        // MAPS_ENGINE M138: a CPU regional bin without ANY instanceColor must
        // not manufacture white per-vertex colors. The former unconditional
        // expansion allocated 12 bytes per vertex and compiled a vertexColors
        // material variant even when the source BMD had no BodyLight lane.
        // Mixed bins retain the exact old white fallback for colorless sources.
        const hasInstanceBodyLight = chosen.some(c => !!c.m.instanceColor);
        // One temporary Color per colored BIN, not per placement. getColorAt
        // copies synchronously; primitive RGB values are snapshotted on each
        // part so later iterations cannot overwrite an earlier BodyLight.
        const sampledBodyLight = hasInstanceBodyLight ? new THREE.Color(1, 1, 1) : null;
        const local=new THREE.Matrix4(), parts=[]; let safe=true, instances=0;
        for (const c of chosen) {
          for (let i=0;i<c.m.count;i++) {
            c.m.getMatrixAt(i,local);
            if (!(local.determinant()>0)) { safe=false; break; }
            if (hasInstanceBodyLight) {
              if (c.m.instanceColor) c.m.getColorAt(i, sampledBodyLight);
              else sampledBodyLight.setRGB(1, 1, 1);
              parts.push({geometry:c.m.geometry,matrix:local.clone(),hasInstanceBodyLight:true,
                colorR:sampledBodyLight.r,colorG:sampledBodyLight.g,colorB:sampledBodyLight.b});
            } else parts.push({geometry:c.m.geometry,matrix:local.clone()});
            instances++;
          }
          if(!safe) break;
        }
        if (!safe) continue;
        const geometry=mergeStaticGeometries(parts); if(!geometry) continue;
        m133Geometry = geometry;
        const first=chosen[0].m;
        // A shared immutable source material is safe when no vertex color
        // attribute is introduced; only colored bins own a cloned material.
        const mergedMaterial=hasInstanceBodyLight ? first.material.clone() : first.material;
        m133MergedMaterial = hasInstanceBodyLight ? mergedMaterial : null;
        if (hasInstanceBodyLight) { mergedMaterial.vertexColors=true; mergedMaterial.needsUpdate=true; }
        const merged=new THREE.Mesh(geometry,mergedMaterial);
        m133MergedMesh = merged;
        merged.userData.__muOwnedMaterial=hasInstanceBodyLight;
        merged.name=`MU_STATIC_CPU_MERGE_${result.mergedGroups}`; merged.castShadow=first.castShadow; merged.receiveShadow=first.receiveShadow; merged.visible=first.visible; merged.frustumCulled=true;
        merged.renderOrder=first.renderOrder ?? 0;
        if (merged.layers && first.layers) merged.layers.mask=first.layers.mask;
        merged.updateMatrix(); merged.matrixAutoUpdate=false; merged.updateMatrixWorld(true); merged.matrixWorldAutoUpdate=false;
        geometry.computeBoundingBox?.(); geometry.computeBoundingSphere?.();
        for(const c of chosen) { root.remove(c.m); m133RemovedCpuSources.push(c.m); }
        root.add(merged); for(const c of chosen) c.m.userData.__muTransportCompacted=true;
        result.mergedGroups++; result.packingBins++; result.sourceDraws+=chosen.length; result.mergedDraws++; result.sourceInstances+=instances; result.expandedVertices+=bin.vertices; result.packingSelected+=chosen.length; result.packingSavedDraws+=chosen.length-1; result.meshes.push(merged);
        // Diagnostic count only after successful scene publication. These are
        // avoided CPU color arrays / prospective WebGL attribute bytes, NOT
        // measured GPU upload time or FPS gains.
        if (hasInstanceBodyLight) result.coloredMergedBins++;
        else { result.uncoloredMergedBins++; result.avoidedColorUploadBytes += bin.vertices * 3 * Float32Array.BYTES_PER_ELEMENT; }
        result.avoidedColorObjects += instances - (hasInstanceBodyLight ? 1 : 0);
        // Ownership transferred; next bin starts a fresh transaction.
        m133Geometry = null; m133MergedMaterial = null; m133MergedMesh = null;
        m133RemovedCpuSources.length = 0;
      }
    } catch(e) {
      if (m133MergedMesh) {
        try { if (m133MergedMesh.parent === root) root.remove(m133MergedMesh); } catch (_) { /* best effort */ }
      }
      for (const m of m133RemovedCpuSources) {
        try { if (m.parent !== root) root.add(m); m.userData.__muTransportCompacted = false; } catch (_) { /* best effort */ }
      }
      try { m133Geometry?.dispose?.(); } catch (_) { /* best effort */ }
      try { m133MergedMaterial?.dispose?.(); } catch (_) { /* best effort */ }
      console.warn(`[WorldObjects] R15.14 CPU-merge fallback: ${e.message}`);
    }
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
  // MAPS_ENGINE M128: Promise.all rejects on the FIRST failed worker while
  // other in-flight BMD/renderer awaits continue running. During a superseded
  // world load, the caller can then dispose the layer before those workers
  // resume and attach stale objects. Drain all workers before propagating the
  // first rejection; successful jobs, order and concurrency are unchanged.
  const settled = await Promise.allSettled(jobs);
  const firstFailure = settled.find((entry) => entry.status === 'rejected');
  if (firstFailure) throw firstFailure.reason;
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
export function placementCullSphere(localBounds, worldMatrix, scratchBox = null) {
  if (!localBounds || localBounds.isEmpty()) return null;
  // M126: per-load scratch copies the authored AABB before the identical
  // eight-corner world transform. The returned Sphere is still unique per
  // placement; cached localBounds are never mutated or exposed as scratch.
  const transformedBounds = scratchBox && scratchBox !== localBounds ? scratchBox.copy(localBounds) : localBounds.clone();
  const sphere = transformedBounds.applyMatrix4(worldMatrix).getBoundingSphere(new THREE.Sphere());
  sphere.radius = Math.max(220, sphere.radius + 120);
  return sphere;
}

/**
 * MAPS_ENGINE M127: retire all map-owned update references in ONE stable pass.
 * The previous disposal first filtered registered owners, then ran indexOf +
 * splice for every placement visual and environment group. In a crowded scene
 * those repeated linear scans delayed World1/World11 transitions even when
 * every search missed. Preserve the original array identity and survivor order;
 * do not dispose, hide, detach, or otherwise mutate any owner here.
 */
export function retireMapSceneObjectReferences(owners, registered, slots, extras = []) {
  const retiring = new Set(registered);
  for (const s of slots) {
    if (!s) continue;
    if (s.outer) retiring.add(s.outer);
    if (s.pcVisualSprite) retiring.add(s.pcVisualSprite);
    if (s.pcParticleOwner?.group) retiring.add(s.pcParticleOwner.group);
    if (s.pcLorenciaVisualOwner?.group) retiring.add(s.pcLorenciaVisualOwner.group);
    if (s.pcMapParticleOwner?.group) retiring.add(s.pcMapParticleOwner.group);
  }
  for (const owner of extras) if (owner) retiring.add(owner);
  const before = owners.length;
  let write = 0;
  for (let read = 0; read < before; read++) {
    const owner = owners[read];
    if (!retiring.has(owner)) owners[write++] = owner;
  }
  owners.length = write;
  return { removed: before - write, retained: write };
}

/**
 * MAPS_ENGINE M130: a map's authored cull spheres are immutable after placement.
 * A stationary camera therefore yields the same frustum decision on every frame.
 * Compare all three 4x4 camera matrices, not just position: rotation, zoom, near/far,
 * aspect and projection changes must all invalidate the cached result. The
 * 48-number cache is allocated once per layer and never shares scene state.
 */
export function pcMapFrustumPoseUnchanged(camera, cache, placementCount) {
  if (!cache?.valid || cache.count !== placementCount) return false;
  const view = camera?.matrixWorld?.elements;
  const projection = camera?.projectionMatrix?.elements;
  const inverse = camera?.matrixWorldInverse?.elements;
  if (!view || !projection || !inverse || view.length !== 16 || projection.length !== 16 || inverse.length !== 16) return false;
  // M131: most moving-camera frames change translation first. Reject them
  // before scanning the full 48-value pose; the saved pose was finite-checked
  // at publication, so a new NaN/Infinity necessarily differs from its cache.
  if (cache.elements[12] !== view[12] || cache.elements[13] !== view[13] || cache.elements[14] !== view[14] ||
      cache.elements[28] !== projection[12] || cache.elements[16] !== projection[0]) return false;
  for (let i = 0; i < 16; i++) {
    if (cache.elements[i] !== view[i] || cache.elements[i + 16] !== projection[i] || cache.elements[i + 32] !== inverse[i]) return false;
  }
  return true;
}

export function pcMapRememberFrustumPose(camera, cache, placementCount) {
  cache.valid = false; // Fail closed on invalid/incomplete camera matrices.
  const view = camera?.matrixWorld?.elements;
  const projection = camera?.projectionMatrix?.elements;
  const inverse = camera?.matrixWorldInverse?.elements;
  if (!view || !projection || !inverse || view.length !== 16 || projection.length !== 16 || inverse.length !== 16) return false;
  // M131: moving camera position/zoom is the common case in World1/World11.
  // Do not copy/check 48 floats every moving frame; keep a five-value quick
  // signature and publish the full finite pose only once motion settles.
  const quick = cache.quick;
  const x = view[12], y = view[13], z = view[14], p0 = projection[0], p5 = projection[5];
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(p0) || !Number.isFinite(p5)) { cache.quickValid = false; return false; }
  const changed = cache.quickValid && (quick[0] !== x || quick[1] !== y || quick[2] !== z || quick[3] !== p0 || quick[4] !== p5);
  quick[0] = x; quick[1] = y; quick[2] = z; quick[3] = p0; quick[4] = p5;
  cache.quickValid = true;
  if (changed) return false; // scan happened; NEVER skip on incomplete pose.
  for (let i = 0; i < 16; i++) {
    if (!Number.isFinite(view[i]) || !Number.isFinite(projection[i]) || !Number.isFinite(inverse[i])) return false;
    cache.elements[i] = view[i];
    cache.elements[i + 16] = projection[i];
    cache.elements[i + 32] = inverse[i];
  }
  cache.count = placementCount;
  cache.valid = true;
  return true;
}

// M135: map-transition release is independent per resource. A failing scene
// detach or WebGL buffer disposal must not suppress material/geometry cleanup.
// Successful paths retain exactly the previous release order and ownership.
function m135ReleaseTransportResources(root, mesh, { batched = false, geometry = false } = {}) {
  if (!mesh) return;
  try { root?.remove?.(mesh); } catch (_) { /* continue releasing */ }
  if (batched) { try { mesh.dispose?.(); } catch (_) { /* continue releasing */ } }
  if (geometry) { try { mesh.geometry?.dispose?.(); } catch (_) { /* continue releasing */ } }
  if (mesh.userData?.__muOwnedMaterial) {
    try { mesh.material?.dispose?.(); } catch (_) { /* best effort */ }
  }
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
    // M130: no per-frame array allocations; invalidated by camera pose,
    // projection or the count of committed/partially built placements.
    this._viewCullPose = { valid: false, count: -1, elements: new Float64Array(48), quick: new Float64Array(5), quickValid: false };
    this._viewCullProfile = { version: 'M130', scans: 0, skippedUnchanged: 0, testedSlots: 0, visible: 0, total: 0, lastScanMs: 0 };
    this.root.userData.muMapFrustumCullProfile = this._viewCullProfile;
    this._visibleAnimated = 0;
    this._totalAnimated = 0;
    this._dynamicTerrainLightOwner = null;
    this._mapWorldVisualOwner = null;
    this._icarusEnvironmentOwner = null;
    this._icarusBoidsOwner = null;
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
    const muX = Number(x) + HALF_MAP_SIZE;
    const muY = HALF_MAP_SIZE - Number(z);
    if (!Number.isFinite(muX) || !Number.isFinite(muY)) return null;
    const rgb = sample(muX, muY);
    const color = target || new THREE.Color();
    color.setRGB(Number(rgb?.[0]) || 0, Number(rgb?.[1]) || 0, Number(rgb?.[2]) || 0);
    return color;
  }

  activate() {
    if (this._disposed) return false;
    // Staged map publication forces a first live visibility pass even when
    // the camera has not moved since the final loading frame.
    if (this._viewCullPose) this._viewCullPose.valid = false;
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
    if (this._viewCullPose) this._viewCullPose.valid = false;
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
      if (this._disposed || (typeof shouldContinue === 'function' && shouldContinue() !== true)) {
        const e = new Error(`World${worldNum} staging superseded`);
        e.code = 'MUWEB_STALE_WORLD_LOAD';
        throw e;
      }
    };
    const _profileT0 = performance.now();
    const _profile = { version: 'M75', world: worldNum|0, phases: {} };
    let _profileMark = _profileT0;
    const _markProfile = (name) => { const now=performance.now(); _profile.phases[name]=now-_profileMark; _profileMark=now; };
    assertContinue();
    const fetched = await fetchObjectFile(worldNum);
    assertContinue();
    const parsed = parseTerrainObjects(fetched.bytes);
    _markProfile('fetchParse');
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
    try { assertContinue(); }
    catch (e) {
      try { this._mapWorldVisualOwner?.dispose?.(); } catch (_) { /* best effort */ }
      this._mapWorldVisualOwner = null;
      throw e;
    }
    if (this._mapWorldVisualOwner?.group) {
      this.root.add(this._mapWorldVisualOwner.group);
      if (typeof this._mapWorldVisualOwner.group.userData.update === 'function') this._registerUpdateOwner(this._mapWorldVisualOwner.group);
    }
    if (worldNum === 11) {
      this._icarusEnvironmentOwner = await createPcIcarusEnvironmentOwner(this.gameScene);
      try { assertContinue(); }
      catch (e) {
        try { this._icarusEnvironmentOwner?.dispose?.(); } catch (_) { /* best effort */ }
        this._icarusEnvironmentOwner = null;
        throw e;
      }
      if (this._icarusEnvironmentOwner?.group) {
        this.root.add(this._icarusEnvironmentOwner.group);
        if (typeof this._icarusEnvironmentOwner.group.userData.update === 'function') this._registerUpdateOwner(this._icarusEnvironmentOwner.group);
        if (!this._staged) this._icarusEnvironmentOwner.activate?.();
        console.info('[WorldObjects FIX43] World11 Icarus: terrain mesh suppressed by Scene owner; rain01 + aHeaven environment owner installed (ambient activates only on publication).');
      }
      this._icarusBoidsOwner = createPcIcarusBoidsOwner(this.gameScene);
      if (this._icarusBoidsOwner?.group) {
        this.root.add(this._icarusBoidsOwner.group);
        if (typeof this._icarusBoidsOwner.group.userData.update === 'function') this._registerUpdateOwner(this._icarusBoidsOwner.group);
        console.info('[WorldObjects FIX72] World11 Icarus: GOBoid CreateDragon owner installed (3 Monster32 sky dragons; 10 MODEL_SPEARSKILL joint boids remain fail-closed).');
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
    const modelStageConcurrency = pcMapModelStageConcurrency();
    this.root.userData.muMapModelStageConcurrency = modelStageConcurrency;
    await mapLimit(unique, modelStageConcurrency, async (serial) => {
      assertContinue();
      await cooperate();
      assertContinue();
      if (sourceHiddenNoRendererSerials.has(serial)) return;
      const path = modelPath(worldNum, serial);
      try {
        const loadedModel = await MUAssets.loadBMD(path);
        assertContinue(); // M128: do not publish a stale model after an await.
        modelCache.set(serial, loadedModel);
      } catch (e) {
        if (e?.code === 'MUWEB_STALE_WORLD_LOAD') throw e;
        console.warn(`[WorldObjects] modelo ausente/inválido ${path}: ${e.message}`);
        modelCache.set(serial, null);
      }
    });
    _markProfile('modelStage');

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
    // M129: dispose() must own every successful static probe immediately.
    // Before this, a stale transition during templateProbe could reject before
    // the final _templateRenderers assignment and strand GPU/BMD leases.
    this._templateRenderers = [];
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
        assertContinue(); // M128: do not publish a probe after a superseded await.
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
            // MAPS_ENGINE M67: Lorencia Bridge01/BridgeStone01 are structural,
            // visually sensitive skinned BMDs.  Keeping them as a detached
            // shallow clone of one frozen template shares skeleton state across
            // placements and can deform/offset the bridge even though instancing
            // is disabled below.  Match the PC CreateObject ownership instead:
            // one renderer/skeleton per structural placement.  No mesh/material
            // is hidden or replaced; only these two source BMD families bypass
            // static template sharing.
            (worldNum === 1 && STRUCTURAL_FULL_FIDELITY_SERIALS.has(serial)) ||
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
          // Workers are drained by M128 before load rejection; this register
          // happens synchronously after the post-await generation check.
          this._templateRenderers.push(probe);
        }
      } catch (e) {
        console.warn(`[WorldObjects] template Object${serial + 1} falhou: ${e.message}`);
        modelCache.set(serial, null);
        try { probe.dispose?.(); } catch (_) { /* noop */ }
        if (e?.code === 'MUWEB_STALE_WORLD_LOAD') throw e;
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
    let m137UnsafeTemplateFusionGroups = 0;
    const m137UnsafeFusionBySerial = new Map();
    let m137TemplateMaterialKeyHits = 0, m137TemplateMaterialKeyMisses = 0;
    let boundReusePlacements = 0;
    let boundFallbackPlacements = 0;
    const instancedSerials = new Set();
    // M81 diagnostic-only: attribute static batching CPU time to ObjectXX.
    const staticBatchCostBySerial = new Map();
    // M91 diagnostic: attribute the M88 owners to ObjectXX, including partition.
    // This makes a physical World1/World11 capture identify whether a hot serial is
    // expensive because of spatial partitioning, template bake, instance fill or finalize.
    const staticBatchPhaseBySerial = new Map();
    // MAPS_ENGINE M99: attribute immutable instance-upload volume to ObjectXX so
    // World1/World11 captures can correlate M91 CPU owners with M98 GPU bytes.
    // Profiling only: no buffer, upload, placement or rendering policy changes.
    const staticUploadBySerial = new Map();
    // MAPS_ENGINE M116: retain M115 scale-MRU counters per ObjectXX so physical
    // World1/World11 captures can identify families with poor locality before any
    // batching/order policy is changed. Profiling only; placement order is untouched.
    const staticScaleBySerial = new Map();
    // MAPS_ENGINE M88 diagnostic: split the measured M81 staticBatch cost into
    // coarse CPU owners without timing every placement. This keeps profiler
    // overhead cluster-level while making the next World1/World11 capture actionable.
    const staticBatchBreakdown = { partitionMs: 0, templateBakeMs: 0, instanceFillMs: 0, cooperativeWaitMs: 0, finalizeMs: 0, clusters: 0, instances: 0, rotationCacheEntries: 0, rotationMruHits: 0, rotationMapHits: 0, rotationMisses: 0, scaleMruHits: 0, scaleWrites: 0, directTerrainColorWrites: 0, fallbackTerrainColorWrites: 0, matrixUploadBytes: 0, colorUploadBytes: 0, gpuUploadBytes: 0, maxClusterUploadBytes: 0 };

    // Agrupa placements para batching real. O caminho antigo compartilhava
    // geometry/material, mas ainda criava ~2985 Object3D/SkinnedMesh e milhares
    // de draw calls. R13 usa 1 InstancedMesh por submesh/material de cada serial
    // ESTÁTICO. AnimatedSerials continuam 1 renderer/placement, sem regressão.
    _markProfile('templateProbe');
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
        // M83 regression contract: partitionAdaptiveSpatialPlacements(placements, chunkTiles, COMPACT_SERIAL_SPAN_TILES, baselineClusters)
        const m88PartitionT0 = performance.now();
        const baselinePartition = partitionSpatialPlacementsProfiled(placements, chunkTiles);
        const baselineClusters = baselinePartition.groups;
        const clusters = partitionAdaptiveSpatialPlacements(placements, chunkTiles, COMPACT_SERIAL_SPAN_TILES, baselineClusters, baselinePartition.bounds);
        const m91PartitionMs = performance.now() - m88PartitionT0;
        staticBatchBreakdown.partitionMs += m91PartitionMs;
        baselineSpatialClusters += baselineClusters.size;
        if (clusters.size < baselineClusters.size) compactSerials++;
        // M132: keep ownership of static geometries/instances visible to the
        // failure path, including cooperative cancellation before publication.
        // Previously a rejected checkpoint could strand baked geometries and
        // swallowed stale-world errors as an ordinary fallback-clone warning.
        const staged = [];
        const bakedGeometries = [];
        const m132OwnedStaticGeometries = new Set();
        try {
          template.group.updateMatrixWorld(true);
          template.skeleton?.update?.();
          let createdForSerial = 0;
          const staticSerialProfileT0 = performance.now();
          let m91SerialBakeMs = 0, m91SerialFillCpuMs = 0, m91SerialFinalizeMs = 0;
          let m99SerialMatrixUploadBytes = 0, m99SerialColorUploadBytes = 0, m99SerialMaxClusterUploadBytes = 0;
          // M90: keep serial attribution CPU-only; cooperative waits are scheduler time.
          let m90SerialCooperativeWaitMs = 0;
          // R15.4 exact-material fusion: bake primeiro, depois funde apenas
          // submeshes estáticos material-equivalentes. Isso reduz draw calls
          // por cluster sem tocar nos placements nem na aparência.
          const m88BakeT0 = performance.now();
          const materialGroups = new Map();
          // M137: material key serialization includes ShaderMaterial programs,
          // uniforms and GPU state. Children of one immutable template often
          // share the same material. Cache only for this synchronous serial
          // bake (never across cooperative yields or different map serials).
          const m137MaterialKeys = new WeakMap();
          for (const child of template.group.children) {
            if (!(child.isSkinnedMesh || child.isMesh)) continue;
            child.updateMatrix();
            const baked = bakeStaticSkinnedGeometry(child);
            m132OwnedStaticGeometries.add(baked);
            const material = child.material;
            const canCache = material !== null && (typeof material === 'object' || typeof material === 'function');
            let key;
            if (canCache && m137MaterialKeys.has(material)) {
              key = m137MaterialKeys.get(material);
              m137TemplateMaterialKeyHits++;
            } else {
              key = staticMaterialKey(material);
              if (canCache) m137MaterialKeys.set(material, key);
              m137TemplateMaterialKeyMisses++;
            }
            let arr = materialGroups.get(key);
            if (!arr) materialGroups.set(key, arr = []);
            arr.push({ child, baked });
          }
          const renderParts = [];
          for (const parts of materialGroups.values()) {
            const m137CanFuse = parts.length > 1 && pcMapStaticTemplateFusionSafe(parts);
            if (parts.length > 1 && !m137CanFuse) {
              m137UnsafeTemplateFusionGroups++;
              m137UnsafeFusionBySerial.set(serial, (m137UnsafeFusionBySerial.get(serial) || 0) + 1);
            }
            if (m137CanFuse) {
              const merged = mergeStaticGeometries(parts.map(p => ({ geometry: p.baked, matrix: p.child.matrix })));
              if (merged) {
                m132OwnedStaticGeometries.add(merged);
                // Geometry already embeds every child.matrix; presentation
                // flags still come from the equivalent authored first child.
                renderParts.push({ geometry: merged, material: parts[0].child.material, child: null, presentationChild: parts[0].child, owned: true });
                for (const p of parts) {
                  p.baked.dispose?.();
                  m132OwnedStaticGeometries.delete(p.baked);
                }
                continue;
              }
            }
            for (const p of parts) renderParts.push({ geometry: p.baked, material: p.child.material, child: p.child, owned: true });
          }
          staticSubmeshesBeforeFusion += [...materialGroups.values()].reduce((n, parts) => n + parts.length, 0);
          staticSubmeshesAfterFusion += renderParts.length;
          m91SerialBakeMs = performance.now() - m88BakeT0;
          staticBatchBreakdown.templateBakeMs += m91SerialBakeMs;
          // MAPS_ENGINE M86: the cluster loop is strictly serial, including across
          // cooperative yields, so matrix/scratch/light temporaries can be reused
          // for every cluster of this ObjectXX render part. M82 removed per-placement
          // allocation; M86 removes the remaining per-cluster temporary allocation
          // pressure without changing matrices, terrain samples, bounds or content.
          // M92 serial-local authored rotation cache shared by every fused/submesh render part.
          const placementRotationCache = new Map();
          let placementRotationCacheEntries = 0;
          let m94SerialRotationMruHits = 0, m94SerialRotationMapHits = 0, m94SerialRotationMisses = 0;
          let m115SerialScaleMruHits = 0, m115SerialScaleWrites = 0;
          for (const part of renderParts) {
            const child = part.child;
            const baked = part.geometry;
            bakedGeometries.push(baked);
            let childClusterIndex = 0;
            // MAPS_ENGINE M87: static placements already carry native MU terrain
            // coordinates. Resolve the terrain sampler once per render part and feed
            // the exact original placement.x/y directly, avoiding MU->Three->MU
            // round-trips and repeated dynamic sampler lookup per instance.
            const staticTerrainLightSample = this._terrainLightMesh?.userData?.sampleTerrainLight;
            const hasStaticTerrainLightSample = typeof staticTerrainLightSample === 'function';
            const m = new THREE.Matrix4();
            const placementMatrixScratch = createStaticPlacementScratch();
            // MAPS_ENGINE M111: reusable position snapshot; no per-placement allocation.
                    const instanceLight = new THREE.Color(1, 1, 1);
            for (const [clusterKey, clusterPlacements] of clusters) {
              const m88FillT0 = performance.now();
              let m89ClusterCooperativeWaitMs = 0;
              // MAPS_ENGINE M105: this cluster membership is immutable for the
              // complete instance-build/finalize path. Snapshot its count once so
              // the measured fill loop and its accounting do not repeatedly resolve
              // Array.length. This does not alter membership, order or chunk32 cadence.
              const placementCount = clusterPlacements.length;
              const inst = new THREE.InstancedMesh(baked, part.material, placementCount);
              // staticPlacementMatrix already embeds the MU->Three basis.
              // There is no converted ancestor in this transport hierarchy.
              if (part.material?.uniforms?.pcChromeUpAxis) part.material.uniforms.pcChromeUpAxis.value = 1;
              inst.name = `World${worldNum}_Object${serial + 1}_INST_${createdForSerial}_${clusterKey}`;
              const presentationChild = part.presentationChild || child;
              inst.castShadow = presentationChild?.castShadow ?? false;
              inst.receiveShadow = presentationChild?.receiveShadow ?? false;
              inst.visible = presentationChild?.visible ?? true;
              inst.renderOrder = presentationChild?.renderOrder ?? 0;
              if (presentationChild?.layers) inst.layers.mask = presentationChild.layers.mask;
              inst.frustumCulled = true;
              inst.instanceMatrix.setUsage(THREE.StaticDrawUsage);
              // MAPS_ENGINE M84: region tagging used to rescan every placement
              // after the matrix/BodyLight fill solely to compute the centroid.
              // Accumulate the exact same x/y values in the existing hot loop,
              // removing one full O(clusterPlacements) pass with zero visual change.
              // MAPS_ENGINE M95: non-compact clusters come directly from the M85
              // baseline grid, so clusterKey already IS the exact transport region
              // that spatialBatchKey(centroid) resolves to for every member. Avoid
              // two numeric conversions/additions per placement in that common hot
              // path. Compact serials can cross a grid boundary, so they retain the
              // previous exact centroid calculation and region derivation.
              const m95NeedsRegionCentroid = clusterKey === 'compact';
              let regionSumX = 0, regionSumY = 0;
              // MAPS_ENGINE M96: setColorAt() lazily allocates instanceColor and
              // calls Color.toArray() for every placement. staticBatch already owns
              // the exact RGB values, so allocate the identical float attribute once
              // per cluster and fill its backing array directly. This removes one
              // method dispatch + Color serialization per instance without changing
              // terrain sampling, RGB precision, material, placement or GPU layout.
              const instanceColorArray = new Float32Array(placementCount * 3);
              inst.instanceColor = new THREE.InstancedBufferAttribute(instanceColorArray, 3);
              // MAPS_ENGINE M97: setMatrixAt() is only a thin wrapper around
              // Matrix4.toArray(instanceMatrix.array, index * 16). The static batch
              // already owns the destination attribute and the exact Matrix4, so
              // write through Matrix4.toArray directly. This preserves the same
              // Float32 serialization/GPU layout while removing one InstancedMesh
              // method dispatch per placement in the measured instanceFill owner.
              const instanceMatrixArray = inst.instanceMatrix.array;
              // MAPS_ENGINE M101: both instance attributes are tightly packed and
              // traversed linearly. Keep running write offsets instead of rebuilding
              // i*16 / i*3 for every placement. Also aggregate the M100 diagnostic
              // counter once per cluster below; profiling must not add a hot-loop
              // increment to the phase it is measuring.
              let instanceMatrixOffset = 0;
              let instanceColorOffset = 0;
              // MAPS_ENGINE M106: keep M103's exact chunk32 cooperative cadence, but
              // resolve the chunk boundary with one integer add/compare instead of
              // Math.min() for every chunk. This is intentionally a narrow hot-path
              // change: same placement order and checkpoints before 32,64,96...
              // MAPS_ENGINE M103: preserve M80/M102's exact cooperative cadence
              // (checkpoint before placement 32,64,96...) but process placements in
              // 32-wide chunks. The measured per-placement fill loop now has no
              // countdown decrement/branch at all; scheduler work stays between
              // chunks and content/order are unchanged.
              for (let chunkStart = 0; chunkStart < placementCount; chunkStart += 32) {
                if (chunkStart !== 0) {
                  assertContinue();
                  // M89 profiler correction: M80's cooperative yield is frame-pacing
                  // wait, not instance-fill CPU. Measure it separately so physical
                  // World1/World11 captures identify the actual dominant CPU owner.
                  const m89YieldT0 = performance.now();
                  await cooperate();
                  const m90YieldWaitMs = performance.now() - m89YieldT0;
                  m89ClusterCooperativeWaitMs += m90YieldWaitMs;
                  m90SerialCooperativeWaitMs += m90YieldWaitMs;
                  assertContinue();
                }
                const nextChunkEnd = chunkStart + 32;
                const chunkEnd = nextChunkEnd < placementCount ? nextChunkEnd : placementCount;
                for (let i = chunkStart; i < chunkEnd; i++, instanceMatrixOffset += 16, instanceColorOffset += 3) {
                const placement = clusterPlacements[i].obj;
                // MAPS_ENGINE M104: x/y are consumed by centroid attribution and
                // terrain BodyLight sampling after the matrix build. Snapshot the
                // exact placement values once per instance instead of repeatedly
                // resolving object properties across the measured fill hot path.
                // Keep M95's Number(value || 0) centroid semantics unchanged and
                // pass the original values unchanged to the terrain sampler.
                const placementX = placement.x;
                const placementY = placement.y;
                const placementZ = placement.z;
                if (m95NeedsRegionCentroid) {
                  regionSumX += Number(placementX || 0);
                  regionSumY += Number(placementY || 0);
                }
                staticPlacementMatrix(placement, child, m, placementMatrixScratch, placementRotationCache, placementX, placementY, placementZ);
                m.toArray(instanceMatrixArray, instanceMatrixOffset);
                // PC Calc_RenderObject -> BodyLight samples the terrain at EACH
                // OBJECT placement. Preserve that per-instance value instead of
                // one white/shared material for a whole spatial batch.
                const colorOffset = instanceColorOffset;
                // MAPS_ENGINE M100: when the terrain owner exposes the native
                // sampleTerrainLight RGB tuple, write those exact numeric channels
                // straight into the instance-color backing attribute. M96 already
                // removed Color.toArray(); keeping a THREE.Color round-trip here was
                // redundant work in every static placement. The fallback path stays
                // byte-for-byte equivalent for worlds without the native sampler.
                if (hasStaticTerrainLightSample) {
                  const rgb = staticTerrainLightSample(placementX, placementY);
                  instanceColorArray[colorOffset] = Number(rgb?.[0]) || 0;
                  instanceColorArray[colorOffset + 1] = Number(rgb?.[1]) || 0;
                  instanceColorArray[colorOffset + 2] = Number(rgb?.[2]) || 0;
                } else {
                  const sampled = this._terrainLightAt(
                    placementX - HALF_MAP_SIZE, HALF_MAP_SIZE - placementY, instanceLight);
                  if (!sampled) instanceLight.setRGB(1, 1, 1);
                  const finalColor = sampled || instanceLight;
                  instanceColorArray[colorOffset] = finalColor.r;
                  instanceColorArray[colorOffset + 1] = finalColor.g;
                  instanceColorArray[colorOffset + 2] = finalColor.b;
                }
                }
              }
              // M101: preserve M100 totals exactly while keeping instrumentation
              // outside the measured per-placement instanceFill hot loop.
              if (hasStaticTerrainLightSample) staticBatchBreakdown.directTerrainColorWrites += placementCount;
              else staticBatchBreakdown.fallbackTerrainColorWrites += placementCount;
              inst.instanceMatrix.needsUpdate = true;
              // MAPS_ENGINE M98: quantify the immutable static-instance GPU upload
              // owned by this cluster. These are the exact backing attributes that
              // WebGL uploads after needsUpdate; profiling only, with no new upload,
              // allocation, draw, placement or material change. This lets physical
              // World1/World11 captures distinguish CPU instanceFill from transport
              // volume before changing renderer/BMD/GPU policy.
              const m98MatrixUploadBytes = inst.instanceMatrix?.array?.byteLength || 0;
              const m98ColorUploadBytes = inst.instanceColor?.array?.byteLength || 0;
              const m98ClusterUploadBytes = m98MatrixUploadBytes + m98ColorUploadBytes;
              staticBatchBreakdown.matrixUploadBytes += m98MatrixUploadBytes;
              staticBatchBreakdown.colorUploadBytes += m98ColorUploadBytes;
              staticBatchBreakdown.gpuUploadBytes += m98ClusterUploadBytes;
              staticBatchBreakdown.maxClusterUploadBytes = Math.max(staticBatchBreakdown.maxClusterUploadBytes, m98ClusterUploadBytes);
              m99SerialMatrixUploadBytes += m98MatrixUploadBytes;
              m99SerialColorUploadBytes += m98ColorUploadBytes;
              m99SerialMaxClusterUploadBytes = Math.max(m99SerialMaxClusterUploadBytes, m98ClusterUploadBytes);
              const m89FillElapsedMs = performance.now() - m88FillT0;
              staticBatchBreakdown.cooperativeWaitMs += m89ClusterCooperativeWaitMs;
              const m91ClusterFillCpuMs = Math.max(0, m89FillElapsedMs - m89ClusterCooperativeWaitMs);
              staticBatchBreakdown.instanceFillMs += m91ClusterFillCpuMs;
              m91SerialFillCpuMs += m91ClusterFillCpuMs;
              staticBatchBreakdown.clusters++;
              staticBatchBreakdown.instances += placementCount;
              const m88FinalizeT0 = performance.now();
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
              inst.userData.__muTransportRegion = m95NeedsRegionCentroid
                ? spatialBatchKey({ x: regionSumX / placementCount, y: regionSumY / placementCount }, chunkTiles)
                : clusterKey;
              staged.push(inst);
              const m91ClusterFinalizeMs = performance.now() - m88FinalizeT0;
              staticBatchBreakdown.finalizeMs += m91ClusterFinalizeMs;
              m91SerialFinalizeMs += m91ClusterFinalizeMs;
              childClusterIndex++;
            }
            m94SerialRotationMruHits += placementMatrixScratch.rotationMruHits;
            m94SerialRotationMapHits += placementMatrixScratch.rotationMapHits;
            m94SerialRotationMisses += placementMatrixScratch.rotationMisses;
            // MAPS_ENGINE M115: expose M114 scale-MRU effectiveness in the same
            // physical World1/World11 staticBatch capture without changing work.
            m115SerialScaleMruHits += placementMatrixScratch.scaleMruHits;
            m115SerialScaleWrites += placementMatrixScratch.scaleWrites;
            createdForSerial += childClusterIndex;
          }
          for (const rotationYMap of placementRotationCache.values())
            for (const rotationZMap of rotationYMap.values()) placementRotationCacheEntries += rotationZMap.size;
          staticBatchBreakdown.rotationCacheEntries += placementRotationCacheEntries;
          staticBatchBreakdown.rotationMruHits += m94SerialRotationMruHits;
          staticBatchBreakdown.rotationMapHits += m94SerialRotationMapHits;
          staticBatchBreakdown.rotationMisses += m94SerialRotationMisses;
          staticBatchBreakdown.scaleMruHits += m115SerialScaleMruHits;
          staticBatchBreakdown.scaleWrites += m115SerialScaleWrites;
          staticScaleBySerial.set(serial, Object.freeze({ serial, scaleMruHits: m115SerialScaleMruHits, scaleWrites: m115SerialScaleWrites }));
          const staticSerialWallMs = performance.now() - staticSerialProfileT0;
          const staticSerialMs = Math.max(0, staticSerialWallMs - m90SerialCooperativeWaitMs);
          const prevStaticCost = staticBatchCostBySerial.get(serial) || { serial, count: 0, totalMs: 0, maxMs: 0 };
          prevStaticCost.count++; prevStaticCost.totalMs += staticSerialMs;
          if (staticSerialMs > prevStaticCost.maxMs) prevStaticCost.maxMs = staticSerialMs;
          staticBatchCostBySerial.set(serial, prevStaticCost);
          staticBatchPhaseBySerial.set(serial, Object.freeze({ serial, partitionMs: m91PartitionMs, bakeMs: m91SerialBakeMs, fillCpuMs: m91SerialFillCpuMs, cooperativeWaitMs: m90SerialCooperativeWaitMs, finalizeMs: m91SerialFinalizeMs, cpuMs: m91PartitionMs + m91SerialBakeMs + m91SerialFillCpuMs + m91SerialFinalizeMs }));
          staticUploadBySerial.set(serial, Object.freeze({ serial, matrixUploadBytes: m99SerialMatrixUploadBytes, colorUploadBytes: m99SerialColorUploadBytes, gpuUploadBytes: m99SerialMatrixUploadBytes + m99SerialColorUploadBytes, maxClusterUploadBytes: m99SerialMaxClusterUploadBytes }));
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
            for (const g of m132OwnedStaticGeometries) g.dispose?.();
          }
        } catch (e) {
          // M132: only committed batches may outlive this serial. On a failed
          // static build, remove partial scene references and release every
          // baked/merged geometry exactly once; shared template materials are
          // NOT owned here and must remain untouched. Stale loads must unwind
          // to the M128 generation fence, never resume fallback clones.
          for (const inst of staged) {
            try { this.root.remove(inst); } catch (_) { /* best effort */ }
            const at = this._instancedMeshes.indexOf(inst);
            if (at >= 0) this._instancedMeshes.splice(at, 1);
          }
          for (const g of m132OwnedStaticGeometries) {
            this._instancedGeometries.delete(g);
            try { g.dispose?.(); } catch (_) { /* best effort */ }
          }
          if (e?.code === 'MUWEB_STALE_WORLD_LOAD') throw e;
          console.warn(`[WorldObjects] InstancedMesh Object${serial + 1} falhou; fallback clones: ${e.message}`);
        }
      }
      this._lastSpatialBatchStats = { chunkTiles, spatialClusters, baselineSpatialClusters, compactSerials, instancedDraws, staticSubmeshesBeforeFusion, staticSubmeshesAfterFusion };
    }

    // R23 recovery: preserve R22 cooperative loading, but restore the verified
    // R15.11-R15.15 physical transport chain lost in an earlier integration.
    const webglMultiDraw = !!this.gameScene?.renderer?.extensions?.has?.('WEBGL_multi_draw');
    // M136: M75 staticBatch wall time includes transport construction, while
    // M88/M91 measure its earlier partition/bake/instance-fill owners. Isolate
    // multi-draw packing versus CPU regional merge to identify the dominant
    // staticBatch subowner in physical World1/World11 captures. No scheduling,
    // renderer, upload, placement or transport decision is changed.
    const m136TransportT0 = performance.now();
    const transportStats = compactStaticInstancedTransport(this.root, this._instancedMeshes, { multiDrawSupported: webglMultiDraw });
    const m136BatchMs = performance.now() - m136TransportT0;
    this._batchedMeshes = transportStats.batches || [];
    const m136FallbackT0 = performance.now();
    const fallbackMergeStats = webglMultiDraw ? null : compactStaticInstancedFallbackMerge(this.root, this._instancedMeshes);
    const m136FallbackMs = webglMultiDraw ? 0 : performance.now() - m136FallbackT0;
    this._mergedTransportMeshes = fallbackMergeStats?.meshes || [];
    if (fallbackMergeStats) {
      transportStats.skippedUnsafeGeometry = fallbackMergeStats.skippedUnsafeGeometry;
      transportStats.skippedCustomRenderOwner = fallbackMergeStats.skippedCustomRenderOwner;
      transportStats.skippedAuthoredVertexColor = fallbackMergeStats.skippedAuthoredVertexColor;
      transportStats.skippedOrderDependentMaterial = fallbackMergeStats.skippedOrderDependentMaterial;
    }
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
      transportStats.uncoloredMergedBins = fallbackMergeStats.uncoloredMergedBins;
      transportStats.coloredMergedBins = fallbackMergeStats.coloredMergedBins;
      transportStats.avoidedColorUploadBytes = fallbackMergeStats.avoidedColorUploadBytes;
      transportStats.avoidedColorObjects = fallbackMergeStats.avoidedColorObjects;
      transportStats.attemptedGroups = fallbackMergeStats.attemptedGroups;
      transportStats.mergedGroups = fallbackMergeStats.mergedGroups;
      transportStats.remainingEligibleDraws = Math.max(0, fallbackMergeStats.packingCandidates - fallbackMergeStats.packingSelected);
      transportStats.mergeEfficiencyPct = fallbackMergeStats.sourceDraws > 0
        ? ((fallbackMergeStats.sourceDraws - fallbackMergeStats.mergedDraws) * 100 / fallbackMergeStats.sourceDraws) : 0;
    }
    if (this._lastSpatialBatchStats) {
      this._lastSpatialBatchStats.transport = transportStats;
      this._lastSpatialBatchStats.skippedUnsafeTemplateFusionGroups = m137UnsafeTemplateFusionGroups;
      this._lastSpatialBatchStats.effectiveStaticDraws =
        instancedDraws - transportStats.sourceDraws + transportStats.batchedDraws;
    }

    _markProfile('staticBatch');
    // Somente animados + static serials cujo batching falhou/foi desativado.
    // MAPS_ENGINE M66: the old fixed concurrency=4 under-used modern 8/12/16-core
    // browsers during the remaining per-placement renderer/material setup. Keep
    // the established 4-worker floor for low-core/mobile devices, but permit at
    // most 6 workers on >=12 logical cores. This changes only staging throughput:
    // object count, BMD/material/FX ownership and publication remain identical.
    const logicalCores = Math.max(1, Number(globalThis?.navigator?.hardwareConcurrency) || 4);
    const placementBuildConcurrency = logicalCores >= 12 ? 6 : logicalCores >= 8 ? 5 : 4;
    this.root.userData.muMapPlacementBuildConcurrency = placementBuildConcurrency;
    // M77: M75 proved placementBuild dominates World11 and is material in World1,
    // but phase totals alone cannot identify which exact PC ObjectXX owners cause
    // the long work. Profile per-serial placement cost without changing scheduling,
    // renderer ownership, assets, visibility or quality. Start timing only AFTER the
    // cooperative checkpoint so scheduler/yield wait is not charged to an object.
    const placementCostBySerial = new Map();
    // MAPS_ENGINE M121: retain M120 per-owner split, but also account every
    // measured placement. M120's top-12 hotspot reduction was intentionally
    // useful for ranking, yet it could not tell whether those owners represented
    // most of placementBuild. These totals are diagnostic only.
    let m121PlacementMeasuredMs = 0;
    let m121ModelSetupMeasuredMs = 0;
    let m121PlacementMeasuredCount = 0;
    // MAPS_ENGINE M122: attribute modelSetup to template-clone versus fresh
    // MUModelRenderer/BMD init. Diagnostic only; no renderer policy changes.
    let m122TemplateSetupMs = 0, m122RendererSetupMs = 0;
    let m122TemplateSetupCount = 0, m122RendererSetupCount = 0;
    // MAPS_ENGINE M123: retain per-ObjectXX setup-kind cost so physical World1/World11
    // captures identify the exact BMD/template owners behind modelSetup. Diagnostic only.
    const m123ModelSetupBySerial = new Map();
    // MAPS_ENGINE M126: five Matrix4 scratch values are private to THIS load.
    // JS worker callbacks run synchronously between awaits, so they cannot
    // overwrite one another mid-quaternion. Avoid per-placement matrix and
    // temporary Quaternion allocation without changing rotation math.
    const m126QuaternionScratch = {
      rx: new THREE.Matrix4(), ry: new THREE.Matrix4(), rz: new THREE.Matrix4(),
      rMu: new THREE.Matrix4(), rThree: new THREE.Matrix4(),
    };
    let m126ScratchQuaternionWrites = 0;
    // MUModelRenderer.setBodyLight copies its input into renderer-owned color and
    // material values synchronously. Reuse one per-load sampling Color, never
    // exposing this mutable scratch to a renderer or asynchronous visual owner.
    const m126BodyLightScratch = new THREE.Color();
    let m126BodyLightScratchSamples = 0;
    // The local per-serial AABB is immutable. Reuse the temporary world-space
    // Box3, but keep each placement's returned culling Sphere independently.
    const m126BoundsScratch = new THREE.Box3();
    let m126BoundsScratchWrites = 0;
    // MAPS_ENGINE M124: separate cooperative browser-yield wall time from active
    // placement work. M75 boundaries remain untouched; diagnostic only.
    let m124PlacementCooperateMs = 0, m124PlacementCooperateCount = 0;
    // MAPS_ENGINE M125/M126: placement elapsed time includes awaited renderer/
    // visual-owner work, so these buckets are await-inclusive WALL times, NOT
    // proof of a single synchronous 4/8/16/32ms long task. Preserve counters
    // and expose this measurement limitation explicitly in the profile.
    let m125Over4 = 0, m125Over8 = 0, m125Over16 = 0, m125Over32 = 0;
    let m125MaxPlacementMs = 0, m125MaxPlacementObject = 0, m125MaxPlacementIndex = -1;
    await mapLimit(parsed.objects, placementBuildConcurrency, async (obj, index) => {
      assertContinue();
      if (this._disposed || instancedSerials.has(obj.serial) || sourceHiddenNoRendererSerials.has(obj.serial)) return;
      // M76 physical World1/World11 profile: placementBuild is the dominant
      // active-transition phase (World11 370/435ms; World1 232/617ms), while
      // the same captures show one-frame stalls in the hundreds of ms.  The
      // cooperative budget above was only consulted once per 8 placements,
      // so expensive MUModelRenderer/BMD setup could overrun its 8ms slice by
      // several placements before the next checkpoint.  During active map
      // transitions (sliceMs > 0), consult the shared budget before EVERY
      // placement; checkpoint() only yields when the elapsed budget expires.
      // Keep the historical idle-callback cadence for sliceMs==0 scenes.
      if (cooperativeSliceMs > 0 || (index & 7) === 0) {
        const m124CooperateT0 = performance.now();
        await cooperate();
        m124PlacementCooperateMs += performance.now() - m124CooperateT0;
        m124PlacementCooperateCount++;
      }
      assertContinue();
      if (this._disposed) return;
      const placementProfileT0 = performance.now();
      const data = modelCache.get(obj.serial);
      if (!data) { missing++; bumpMissingSerial(obj.serial); return; }
      let renderer = null;
      // M128: keep uncommitted owners in scope for deterministic rollback if
      // any awaited asset/FX operation fails or the map is superseded.
      let outer = null, pcVisualSprite = null, pcParticleOwner = null;
      let pcLorenciaVisualOwner = null, pcLorenciaBoneVisualOwner = null;
      let pcMapBoneVisualOwner = null, pcMapParticleOwner = null;
      let m120ModelSetupMs = 0;
      let m122ModelSetupKind = null;
      try {
        const m120ModelSetupT0 = performance.now();
        const template = templates.get(obj.serial);
        let inner;
        if (template) {
          m122ModelSetupKind = 'templateClone';
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
          m122ModelSetupKind = 'rendererInit';
          renderer = new MUModelRenderer({
            scene: this.gameScene.scene,
            camera: this.gameScene.camera?.threeCamera,
          });
          await renderer.initFromBMD(data);
          assertContinue(); // M128: renderer is still local, before any scene attachment.
          if (worldNum === 75) applyPcWorld75ObjectMaterialPresentation(renderer, obj.serial);
          inner = renderer.group;
        }
        m120ModelSetupMs = performance.now() - m120ModelSetupT0;
        if (m122ModelSetupKind === 'templateClone') { m122TemplateSetupMs += m120ModelSetupMs; m122TemplateSetupCount++; }
        else if (m122ModelSetupKind === 'rendererInit') { m122RendererSetupMs += m120ModelSetupMs; m122RendererSetupCount++; }
        if (m122ModelSetupKind) {
          const m123Setup = m123ModelSetupBySerial.get(obj.serial) || { serial: obj.serial, templateCloneCount: 0, templateCloneMs: 0, rendererInitCount: 0, rendererInitMs: 0 };
          if (m122ModelSetupKind === 'templateClone') { m123Setup.templateCloneCount++; m123Setup.templateCloneMs += m120ModelSetupMs; }
          else { m123Setup.rendererInitCount++; m123Setup.rendererInitMs += m120ModelSetupMs; }
          m123ModelSetupBySerial.set(obj.serial, m123Setup);
        }
        applyMuUpAxis(inner);
        outer = new THREE.Group();
        outer.name = `World${worldNum}_Object${obj.serial + 1}_i${index}`;
        outer.add(inner);
        muObjectPositionToThree(obj, outer.position);
        muObjectQuaternion(obj, outer.quaternion, m126QuaternionScratch);
        m126ScratchQuaternionWrites++;
        outer.scale.setScalar(obj.scale);
        // World75 emitter objects 79/80 own an exact BITMAP_LIGHT sprite at
        // OBJECT::Position.  Keep it outside `outer` so object scale/rotation is
        // not applied twice: CreateSprite receives the already-scaled scalar.
        if (worldNum === 75 && (obj.serial === 79 || obj.serial === 80)) {
          pcVisualSprite = await createPcWorld75VisualSprite(obj.serial, obj, outer.position);
          assertContinue();
          if (pcVisualSprite) {
            this.root.add(pcVisualSprite);
            if (typeof pcVisualSprite.userData.update === 'function') this._registerUpdateOwner(pcVisualSprite);
          }
        }
        // R74: source-faithful World75 emitter children. The emitter BMD stays
        // hidden exactly as RenderObjectVisual intends; real bitmap particles
        // are separate world-space billboards using ZzzEffectParticle laws.
        if (worldNum === 75 && PC_WORLD75_PARTICLE_SERIALS.includes(obj.serial)) {
          pcParticleOwner = await createPcWorld75ParticleOwner(obj.serial, obj, outer.position);
          assertContinue();
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
        if (worldNum === 1 && PC_LORENCIA_RUNTIME_VISUAL_SERIALS.includes(obj.serial)) {
          pcLorenciaVisualOwner = await createPcLorenciaVisualOwner(obj.serial, obj, outer.position, {
            addTerrainLightMu: (muX, muY, light, range) => this.gameScene.addDynamicTerrainLightMu?.(muX, muY, light, range),
          });
          assertContinue();
          if (pcLorenciaVisualOwner?.group) {
            this.root.add(pcLorenciaVisualOwner.group);
            if (typeof pcLorenciaVisualOwner.group.userData.update === 'function') this._registerUpdateOwner(pcLorenciaVisualOwner.group);
          }
        }
        if (worldNum === 1 && renderer && (obj.serial === 56 || obj.serial === 105)) {
          pcLorenciaBoneVisualOwner = await createPcLorenciaBoneVisualOwner(obj.serial, renderer, obj);
          assertContinue();
          if (pcLorenciaBoneVisualOwner?.group) this.root.add(pcLorenciaBoneVisualOwner.group);
        }
        if (renderer && hasPcMapBoneVisual(worldNum, obj.serial)) {
          pcMapBoneVisualOwner = await createPcMapBoneVisualOwner(worldNum, obj.serial, renderer, obj);
          assertContinue();
          if (pcMapBoneVisualOwner?.group) this.root.add(pcMapBoneVisualOwner.group);
        }
        if (renderer && hasPcMapParticleVisual(worldNum, obj.serial)) {
          pcMapParticleOwner = await createPcMapParticleOwner(worldNum, obj.serial, renderer, obj);
          assertContinue();
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
          const objectBodyLight = this._terrainLightAt(outer.position.x, outer.position.z, m126BodyLightScratch);
          m126BodyLightScratchSamples++;
          if (objectBodyLight) renderer.setBodyLight(objectBodyLight);
        }
        if (renderer && hasPcLoginObjectPresentation(worldNum,obj.serial)) {
          await installPcLoginObjectPresentation(worldNum,obj.serial,renderer);
          assertContinue();
        }
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
            if (localBounds) { cullSphere = placementCullSphere(localBounds, inner.matrixWorld, m126BoundsScratch); boundReusePlacements++; m126BoundsScratchWrites++; }
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
        // M128: async visual owners may have been attached before a later await
        // was cancelled. Roll back ONLY this uncommitted placement, including
        // scene callbacks; never touch previously committed map placements.
        // M129: bone-space presentation groups are attached directly to root
        // before the placement is committed. Their dispose() releases sprite
        // resources but does NOT detach the group from the scene graph. Retire
        // them with the other partial owners on stale-world or setup failure.
        const partialOwners = [outer, pcVisualSprite, pcParticleOwner?.group,
          pcLorenciaVisualOwner?.group, pcLorenciaBoneVisualOwner?.group,
          pcMapBoneVisualOwner?.group, pcMapParticleOwner?.group].filter(Boolean);
        if (partialOwners.length) {
          const partialSet = new Set(partialOwners);
          retireMapSceneObjectReferences(this.gameScene.objects, partialSet, [], []);
          for (const owner of partialSet) {
            this._ownedUpdateOwners.delete(owner);
            this._pendingUpdateOwnerSet.delete(owner);
            try { this.root.remove(owner); } catch (_) { /* best effort */ }
          }
          this._pendingUpdateOwners = this._pendingUpdateOwners.filter((owner) => !partialSet.has(owner));
        }
        try { pcVisualSprite?.material?.dispose?.(); } catch (_) { /* best effort */ }
        for (const owner of [pcParticleOwner, pcLorenciaVisualOwner,
          pcLorenciaBoneVisualOwner, pcMapBoneVisualOwner, pcMapParticleOwner]) {
          try { owner?.dispose?.(); } catch (_) { /* best effort */ }
        }
        try { renderer?.dispose?.(); } catch (_) { /* release partial geometry leases */ }
        if (e?.code === 'MUWEB_STALE_WORLD_LOAD') throw e;
        missing++; bumpMissingSerial(obj.serial);
        console.warn(`[WorldObjects] placement ${index} Object${obj.serial + 1}: ${e.message}`);
      }
      const placementMs = performance.now() - placementProfileT0;
      m121PlacementMeasuredMs += placementMs;
      m121ModelSetupMeasuredMs += m120ModelSetupMs;
      m121PlacementMeasuredCount++;
      if (placementMs >= 4) m125Over4++;
      if (placementMs >= 8) m125Over8++;
      if (placementMs >= 16) m125Over16++;
      if (placementMs >= 32) m125Over32++;
      if (placementMs > m125MaxPlacementMs) { m125MaxPlacementMs = placementMs; m125MaxPlacementObject = obj.serial + 1; m125MaxPlacementIndex = index; }
      const prevCost = placementCostBySerial.get(obj.serial) || { serial: obj.serial, count: 0, totalMs: 0, maxMs: 0, modelSetupMs: 0 };
      prevCost.count++;
      prevCost.totalMs += placementMs;
      prevCost.modelSetupMs += m120ModelSetupMs;
      if (placementMs > prevCost.maxMs) prevCost.maxMs = placementMs;
      placementCostBySerial.set(obj.serial, prevCost);
    });
    assertContinue(); // M128: never finalize a superseded placement generation.
    _markProfile('placementBuild');
    const placementHotspots = [...placementCostBySerial.values()]
      .map(x => Object.freeze({ object: x.serial + 1, count: x.count, totalMs: x.totalMs, maxMs: x.maxMs, avgMs: x.count ? x.totalMs / x.count : 0, modelSetupMs: x.modelSetupMs || 0, postSetupMs: Math.max(0, x.totalMs - (x.modelSetupMs || 0)) }))
      .sort((a, b) => b.totalMs - a.totalMs || b.maxMs - a.maxMs)
      .slice(0, 12);
    const staticBatchPhaseHotspots = [...staticBatchPhaseBySerial.values()]
      .map(x => Object.freeze({ object: x.serial + 1, partitionMs: x.partitionMs, bakeMs: x.bakeMs, fillCpuMs: x.fillCpuMs, cooperativeWaitMs: x.cooperativeWaitMs, finalizeMs: x.finalizeMs, cpuMs: x.cpuMs }))
      .sort((a, b) => b.cpuMs - a.cpuMs)
      .slice(0, 12);
    const staticBatchHotspots = [...staticBatchCostBySerial.values()]
      .map(x => Object.freeze({ object: x.serial + 1, count: x.count, totalMs: x.totalMs, maxMs: x.maxMs, avgMs: x.count ? x.totalMs / x.count : 0 }))
      .sort((a, b) => b.totalMs - a.totalMs || b.maxMs - a.maxMs)
      .slice(0, 12);
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
    // FIX69 physical Lorencia architecture probe. This is diagnostic only:
    // no placement/model is hidden or replaced. It lets a physical screenshot/log
    // identify whether a bad bridge/wall/house came through the exact-renderer,
    // instanced or clone lane before the next correction is applied.
    if(worldNum===1){
      const rows=[];
      for(const serial of [...LORENCIA_ARCHITECTURE_AUDIT_SERIALS].sort((a,b)=>a-b)){
        const ss=slots.filter(x=>(x.obj?.serial|0)===serial);
        const authored=parsed.objects.filter(x=>(x.serial|0)===serial).length;
        if(!authored)continue;
        rows.push(Object.freeze({serial,object:serial+1,authored,renderer:ss.filter(x=>!!x.renderer).length,instanced:instancedSerials.has(serial),structuralExact:STRUCTURAL_FULL_FIDELITY_SERIALS.has(serial)}));
      }
      this.root.userData.muLorenciaArchitectureProfile=Object.freeze(rows);
      this.gameScene.scene.userData.muLorenciaArchitectureProfile=this.root.userData.muLorenciaArchitectureProfile;
    }

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
    _markProfile('finalize');
    _profile.totalMs = performance.now() - _profileT0;
    _profile.placements = parsed.count|0; _profile.rendered = rendered|0; _profile.missing = missing|0;
    _profile.modelStageConcurrency = modelStageConcurrency; _profile.placementBuildConcurrency = placementBuildConcurrency;
    _profile.placementHotspots = Object.freeze(placementHotspots);
    // MAPS_ENGINE M120: split placementBuild hotspots into model/template setup
    // versus post-setup world/material/visual-owner work. Diagnostic only.
    const m121HotspotMeasuredMs = placementHotspots.reduce((sum, x) => sum + x.totalMs, 0);
    const placementBreakdown = Object.freeze({
      // M121 authoritative all-placement measured totals.
      measuredCount: m121PlacementMeasuredCount,
      measuredMs: m121PlacementMeasuredMs,
      modelSetupMs: m121ModelSetupMeasuredMs,
      postSetupMs: Math.max(0, m121PlacementMeasuredMs - m121ModelSetupMeasuredMs),
      modelSetupSharePct: m121PlacementMeasuredMs > 0 ? m121ModelSetupMeasuredMs * 100 / m121PlacementMeasuredMs : 0,
      hotspotCoveragePct: m121PlacementMeasuredMs > 0 ? m121HotspotMeasuredMs * 100 / m121PlacementMeasuredMs : 0,
      modelSetupKind: Object.freeze({ templateClone: Object.freeze({ count:m122TemplateSetupCount, ms:m122TemplateSetupMs }), rendererInit: Object.freeze({ count:m122RendererSetupCount, ms:m122RendererSetupMs }) }),
      hotspots: Object.freeze(placementHotspots.map(x => Object.freeze({ object:x.object, modelSetupMs:x.modelSetupMs, postSetupMs:x.postSetupMs, totalMs:x.totalMs }))),
    });
    const m123ModelSetupHotspots = Object.freeze([...m123ModelSetupBySerial.values()]
      .map(x => Object.freeze({ object:x.serial+1, totalMs:x.templateCloneMs+x.rendererInitMs, templateClone:Object.freeze({count:x.templateCloneCount, ms:x.templateCloneMs}), rendererInit:Object.freeze({count:x.rendererInitCount, ms:x.rendererInitMs}) }))
      .sort((a,b)=>b.totalMs-a.totalMs || a.object-b.object).slice(0,12));
    _profile.modelSetupHotspots = m123ModelSetupHotspots;
    const m124PlacementWallMs = Number(_profile.phases.placementBuild) || 0;
    const m124AverageCooperateMs = m124PlacementCooperateCount > 0 ? m124PlacementCooperateMs / m124PlacementCooperateCount : 0;
    _profile.placementScheduling = Object.freeze({ wallMs:m124PlacementWallMs, cooperativeWorkerWaitSumMs:m124PlacementCooperateMs, cooperativeChecks:m124PlacementCooperateCount, averageCooperateMs:m124AverageCooperateMs });
    _profile.placementFramePacing = Object.freeze({ measurementType:'awaitInclusiveWall', measuredCount:m121PlacementMeasuredCount, over4ms:m125Over4, over8ms:m125Over8, over16ms:m125Over16, over32ms:m125Over32, maxMs:m125MaxPlacementMs, maxObject:m125MaxPlacementObject, maxIndex:m125MaxPlacementIndex });
    _profile.placementQuaternionScratch = Object.freeze({ writes:m126ScratchQuaternionWrites, matrixScratchObjects:5, perPlacementMatrixAllocations:0, perPlacementQuaternionAllocations:0, bodyLightSamples:m126BodyLightScratchSamples, perSampleColorAllocations:0, boundsWrites:m126BoundsScratchWrites, perBoundsTemporaryBoxAllocations:0 });
    _profile.placementBreakdown = placementBreakdown;
    _profile.staticBatchHotspots = Object.freeze(staticBatchHotspots);
    _profile.staticBatchPhaseHotspots = Object.freeze(staticBatchPhaseHotspots);
    _profile.staticBatchBreakdown = Object.freeze({ ...staticBatchBreakdown });
    const staticUploadHotspots = Object.freeze([...staticUploadBySerial.values()]
      .sort((a,b)=>b.gpuUploadBytes-a.gpuUploadBytes || a.serial-b.serial).slice(0, 12)
      .map(x=>Object.freeze({ object:x.serial+1, matrixUploadBytes:x.matrixUploadBytes, colorUploadBytes:x.colorUploadBytes, gpuUploadBytes:x.gpuUploadBytes, maxClusterUploadBytes:x.maxClusterUploadBytes })));
    _profile.staticUploadHotspots = staticUploadHotspots;
    // M116: sort by avoidable scale writes first. This is diagnostic only and does
    // not reorder authored placements or static batches.
    const staticScaleHotspots = Object.freeze([...staticScaleBySerial.values()]
      .map(x => {
        const total = x.scaleMruHits + x.scaleWrites;
        return Object.freeze({ object: x.serial + 1, scaleMruHits: x.scaleMruHits, scaleWrites: x.scaleWrites, hitPct: total > 0 ? x.scaleMruHits * 100 / total : 0 });
      })
      .sort((a,b) => b.scaleWrites - a.scaleWrites || a.object - b.object).slice(0, 12));
    _profile.staticScaleHotspots = staticScaleHotspots;
    // MAPS_ENGINE M117: correlate the already-measured CPU owner, scale locality,
    // and immutable GPU upload bytes by ObjectXX in one physical-capture table.
    // Diagnostic only: no placement, batching, material, terrain or upload policy changes.
    const staticOwnerCorrelation = Object.freeze([...staticBatchPhaseBySerial.values()]
      .map(phase => {
        const scale = staticScaleBySerial.get(phase.serial);
        const upload = staticUploadBySerial.get(phase.serial);
        const scaleTotal = (scale?.scaleMruHits || 0) + (scale?.scaleWrites || 0);
        return Object.freeze({
          object: phase.serial + 1, cpuMs: phase.cpuMs, fillCpuMs: phase.fillCpuMs,
          scaleWrites: scale?.scaleWrites || 0, scaleHitPct: scaleTotal > 0 ? (scale.scaleMruHits * 100 / scaleTotal) : 0,
          gpuUploadBytes: upload?.gpuUploadBytes || 0, maxClusterUploadBytes: upload?.maxClusterUploadBytes || 0,
        });
      })
      .sort((a,b) => b.fillCpuMs - a.fillCpuMs || b.cpuMs - a.cpuMs || a.object - b.object).slice(0, 12));
    _profile.staticOwnerCorrelation = staticOwnerCorrelation;
    // MAPS_ENGINE M119: turn the existing M75 physical stage timings into an
    // explicit dominant-phase signal. Diagnostic only; M75 measurement points
    // and all render/build behavior remain unchanged.
    const m119PhaseEntries = Object.entries(_profile.phases).filter(([, ms]) => Number.isFinite(ms));
    const m119DominantPhase = m119PhaseEntries.reduce((best, cur) => (!best || cur[1] > best[1]) ? cur : best, null);
    const m119MeasuredPhaseMs = m119PhaseEntries.reduce((sum, [, ms]) => sum + ms, 0);
    const dominantStage = Object.freeze({
      phase: m119DominantPhase?.[0] || 'none',
      ms: m119DominantPhase?.[1] || 0,
      measuredPhaseMs: m119MeasuredPhaseMs,
      sharePct: m119DominantPhase && m119MeasuredPhaseMs > 0 ? (m119DominantPhase[1] * 100 / m119MeasuredPhaseMs) : 0,
      staticFillSharePct: staticBatchBreakdown.instanceFillMs > 0 && (_profile.phases.staticBatch || 0) > 0
        ? (staticBatchBreakdown.instanceFillMs * 100 / _profile.phases.staticBatch) : 0,
    });
    _profile.dominantStage = dominantStage;
    // M78: expose the already-computed static transport result in the physical
    // M75 snapshot. No batching/merge decision changes here.
    const transportProfile = Object.freeze({
      mode: transportStats.mode || 'none',
      multiDrawSupported: !!transportStats.multiDrawSupported,
      // M136: separate transport CPU wall from M88 instance-fill CPU and M75
      // aggregate staticBatch. These are load-time JS wall timings, not GPU timers.
      transportBuildMs: m136BatchMs + m136FallbackMs,
      multiDrawBuildMs: m136BatchMs,
      cpuFallbackBuildMs: m136FallbackMs,
      sourceDraws: transportStats.sourceDraws|0,
      outputDraws: transportStats.batchedDraws|0,
      savedDraws: Math.max(0, (transportStats.sourceDraws|0) - (transportStats.batchedDraws|0)),
      sourceInstances: transportStats.sourceInstances|0,
      expandedVertices: transportStats.expandedVertices|0,
      expandedIndices: transportStats.expandedIndices|0,
      skippedBudget: transportStats.skippedBudget|0,
      // M136: count exact source owners kept because expansion would change
      // geometry drawRange/groups/morphs or suppress a render/shadow hook.
      skippedUnsafeGeometry: transportStats.skippedUnsafeGeometry|0,
      skippedCustomRenderOwner: transportStats.skippedCustomRenderOwner|0,
      // M137: actual content owners retained by the pre-transport fusion gate
      // and the CPU/r160 authored vertex-color safety gate.
      skippedUnsafeTemplateFusionGroups: m137UnsafeTemplateFusionGroups|0,
      skippedTemplateFusionByObject: Object.freeze([...m137UnsafeFusionBySerial]
        .map(([serial, groups]) => Object.freeze({ object: serial + 1, groups }))
        .sort((a, b) => b.groups - a.groups || a.object - b.object).slice(0, 12)),
      templateMaterialKeyHits: m137TemplateMaterialKeyHits|0,
      templateMaterialKeyMisses: m137TemplateMaterialKeyMisses|0,
      skippedAuthoredVertexColor: transportStats.skippedAuthoredVertexColor|0,
      skippedOrderDependentMaterial: transportStats.skippedOrderDependentMaterial|0,
      packingCandidates: transportStats.packingCandidates|0,
      packingSelected: transportStats.packingSelected|0,
      packingBins: transportStats.packingBins|0,
      singletonRemainder: transportStats.singletonRemainder|0,
      // M138: expected savings relative to old unconditional white-color
      // expansion, not WebGL instrumentation. Source/placement counts intact.
      uncoloredMergedBins: transportStats.uncoloredMergedBins|0,
      coloredMergedBins: transportStats.coloredMergedBins|0,
      avoidedColorUploadBytes: transportStats.avoidedColorUploadBytes || 0,
      avoidedColorObjects: transportStats.avoidedColorObjects || 0,
      remainingEligibleDraws: transportStats.remainingEligibleDraws|0,
      effectiveStaticDraws: this._lastSpatialBatchStats?.effectiveStaticDraws|0,
      instancedDraws: instancedDraws|0,
      spatialClusters: spatialClusters|0,
    });
    _profile.staticTransport = transportProfile;
    const frozenProfile = Object.freeze({ ..._profile, phases: Object.freeze({ ..._profile.phases }) });
    this.root.userData.muMapObjectStageProfile = frozenProfile;
    this.gameScene.scene.userData.muMapObjectStageProfile = frozenProfile;
    globalThis.__MUWEB_MAP_OBJECT_STAGE_PROFILE__ = frozenProfile;
    console.info(`[PERF M75] World${worldNum} object-stage total=${Math.round(frozenProfile.totalMs)}ms | ` + Object.entries(frozenProfile.phases).map(([k,v])=>`${k}=${Math.round(v)}`).join(' | '));
    if (placementHotspots.length) console.info(`[PERF M77] World${worldNum} placement hotspots ` + placementHotspots.map(x=>`Object${x.object}:${x.totalMs.toFixed(1)}ms/${x.count} max=${x.maxMs.toFixed(1)}`).join(' | '));
    console.info(`[PERF M88] World${worldNum} staticBatch breakdown partition=${staticBatchBreakdown.partitionMs.toFixed(1)}ms bake=${staticBatchBreakdown.templateBakeMs.toFixed(1)}ms fillCpu=${staticBatchBreakdown.instanceFillMs.toFixed(1)}ms coopWait=${staticBatchBreakdown.cooperativeWaitMs.toFixed(1)}ms finalize=${staticBatchBreakdown.finalizeMs.toFixed(1)}ms clusters=${staticBatchBreakdown.clusters} instances=${staticBatchBreakdown.instances}`);
    console.info(`[PERF M89] World${worldNum} staticBatch cpu/wait fillCpu=${staticBatchBreakdown.instanceFillMs.toFixed(1)}ms cooperativeWait=${staticBatchBreakdown.cooperativeWaitMs.toFixed(1)}ms`);
    if (staticBatchHotspots.length) console.info(`[PERF M81] World${worldNum} staticBatch CPU hotspots ` + staticBatchHotspots.map(x=>`Object${x.object}:${x.totalMs.toFixed(1)}ms/${x.count} max=${x.maxMs.toFixed(1)}`).join(' | '));
    console.info(`[PERF M90] World${worldNum} staticBatch hotspot attribution excludes cooperative scheduler wait`);
    if (staticBatchPhaseHotspots.length) console.info(`[PERF M92] World${worldNum} static rotation cache entries=${staticBatchBreakdown.rotationCacheEntries} instances=${staticBatchBreakdown.instances}`);
    console.info(`[PERF M94] World${worldNum} rotation MRU hits=${staticBatchBreakdown.rotationMruHits} mapHits=${staticBatchBreakdown.rotationMapHits} misses=${staticBatchBreakdown.rotationMisses}`);
    // MAPS_ENGINE M115: physical evidence for the M114 uniform-scale MRU.
    // hits+writes equals transformed static placements; hit ratio shows whether
    // scale Vector3 writes are materially removed in World1/World11 captures.
    const m115ScaleTotal = staticBatchBreakdown.scaleMruHits + staticBatchBreakdown.scaleWrites;
    const m115ScaleHitPct = m115ScaleTotal > 0 ? (staticBatchBreakdown.scaleMruHits * 100 / m115ScaleTotal) : 0;
    console.info(`[PERF M115] World${worldNum} scale MRU hits=${staticBatchBreakdown.scaleMruHits} writes=${staticBatchBreakdown.scaleWrites} hitPct=${m115ScaleHitPct.toFixed(1)}%`);
    if (staticScaleHotspots.length) console.info(`[PERF M116] World${worldNum} scale write hotspots ` + staticScaleHotspots.map(x=>`Object${x.object}:writes=${x.scaleWrites},hits=${x.scaleMruHits},hitPct=${x.hitPct.toFixed(1)}%`).join(' | '));
    if (staticOwnerCorrelation.length) console.info(`[PERF M117] World${worldNum} static owner correlation ` + staticOwnerCorrelation.map(x=>`Object${x.object}:fill=${x.fillCpuMs.toFixed(1)}ms,cpu=${x.cpuMs.toFixed(1)}ms,scaleWrites=${x.scaleWrites},scaleHit=${x.scaleHitPct.toFixed(1)}%,upload=${x.gpuUploadBytes}B,maxCluster=${x.maxClusterUploadBytes}B`).join(' | '));
    if (placementHotspots.length) console.info(`[PERF M120] World${worldNum} placement owner split ` + placementHotspots.map(x=>`Object${x.object}:modelSetup=${x.modelSetupMs.toFixed(1)}ms,postSetup=${x.postSetupMs.toFixed(1)}ms,total=${x.totalMs.toFixed(1)}ms`).join(' | '));
    console.info(`[PERF M121] World${worldNum} placement measured=${placementBreakdown.measuredMs.toFixed(1)}ms/${placementBreakdown.measuredCount} modelSetup=${placementBreakdown.modelSetupMs.toFixed(1)}ms (${placementBreakdown.modelSetupSharePct.toFixed(1)}%) postSetup=${placementBreakdown.postSetupMs.toFixed(1)}ms top12Coverage=${placementBreakdown.hotspotCoveragePct.toFixed(1)}%`);
    console.info(`[PERF M122] World${worldNum} modelSetup templateClone=${m122TemplateSetupMs.toFixed(1)}ms/${m122TemplateSetupCount} rendererInit=${m122RendererSetupMs.toFixed(1)}ms/${m122RendererSetupCount}`);
    console.info(`[PERF M123] World${worldNum} modelSetupHotspots ` + m123ModelSetupHotspots.map(x=>`Object${x.object}:total=${x.totalMs.toFixed(1)}ms clone=${x.templateClone.ms.toFixed(1)}ms/${x.templateClone.count} init=${x.rendererInit.ms.toFixed(1)}ms/${x.rendererInit.count}`).join(' | '));
    console.info(`[PERF M124] World${worldNum} placement wall=${m124PlacementWallMs.toFixed(1)}ms cooperativeWorkerWaitSum=${m124PlacementCooperateMs.toFixed(1)}ms checks=${m124PlacementCooperateCount} avg=${m124AverageCooperateMs.toFixed(3)}ms`);
    console.info(`[PERF M125] World${worldNum} placement await-inclusive wall measured=${m121PlacementMeasuredCount} >=4ms=${m125Over4} >=8ms=${m125Over8} >=16ms=${m125Over16} >=32ms=${m125Over32} max=${m125MaxPlacementMs.toFixed(1)}ms Object${m125MaxPlacementObject} index=${m125MaxPlacementIndex}`);
    console.info(`[PERF M126] World${worldNum} placement scratch rotations=${m126ScratchQuaternionWrites} bodyLightSamples=${m126BodyLightScratchSamples} boundsWrites=${m126BoundsScratchWrites} matrixAllocPerRotation=0 tempQuaternionAllocPerRotation=0 colorAllocPerSample=0 tempBoxAllocPerBounds=0`);
    console.info(`[PERF M119] World${worldNum} dominant=${dominantStage.phase} ${dominantStage.ms.toFixed(1)}ms share=${dominantStage.sharePct.toFixed(1)}% staticFillShare=${dominantStage.staticFillSharePct.toFixed(1)}%`);
    console.info(`[PERF M98] World${worldNum} static GPU upload matrix=${staticBatchBreakdown.matrixUploadBytes}B color=${staticBatchBreakdown.colorUploadBytes}B total=${staticBatchBreakdown.gpuUploadBytes}B maxCluster=${staticBatchBreakdown.maxClusterUploadBytes}B`);
    console.info(`[PERF M100] World${worldNum} terrain color direct=${staticBatchBreakdown.directTerrainColorWrites} fallback=${staticBatchBreakdown.fallbackTerrainColorWrites}`);
    console.info(`[PERF M103] World${worldNum} static fill cooperative cadence=chunk32 branchless-inner instances=${staticBatchBreakdown.instances}`);
    console.info(`[PERF M106] World${worldNum} static fill chunk boundary=add-compare instances=${staticBatchBreakdown.instances}`);
    console.info(`[PERF M107] World${worldNum} static placement rotation angles=single-read instances=${staticBatchBreakdown.instances}`);
    console.info(`[PERF M104] World${worldNum} static fill placementXY snapshot=single-read instances=${staticBatchBreakdown.instances}`);
    if (staticUploadHotspots.length) console.info(`[PERF M99] World${worldNum} static GPU upload hotspots ` + staticUploadHotspots.map(x=>`Object${x.object}:${x.gpuUploadBytes}B(matrix=${x.matrixUploadBytes},color=${x.colorUploadBytes},maxCluster=${x.maxClusterUploadBytes})`).join(' | '));
    console.info(`[PERF M91] World${worldNum} staticBatch owner hotspots ` + staticBatchPhaseHotspots.map(x=>`Object${x.object}:cpu=${x.cpuMs.toFixed(1)} partition=${x.partitionMs.toFixed(1)} bake=${x.bakeMs.toFixed(1)} fill=${x.fillCpuMs.toFixed(1)} finalize=${x.finalizeMs.toFixed(1)} wait=${x.cooperativeWaitMs.toFixed(1)}`).join(' | '));
    console.info(`[PERF M78] World${worldNum} static transport mode=${transportProfile.mode} draws=${transportProfile.sourceDraws}->${transportProfile.outputDraws} saved=${transportProfile.savedDraws} effective=${transportProfile.effectiveStaticDraws} expandedV=${transportProfile.expandedVertices} skipped=${transportProfile.skippedBudget}`);
    console.info(`[PERF M136] World${worldNum} static transport build=${transportProfile.transportBuildMs.toFixed(1)}ms multiDraw=${transportProfile.multiDrawBuildMs.toFixed(1)}ms cpuFallback=${transportProfile.cpuFallbackBuildMs.toFixed(1)}ms keptGeometry=${transportProfile.skippedUnsafeGeometry} keptRenderHooks=${transportProfile.skippedCustomRenderOwner}`);
    console.info(`[PERF M137] World${worldNum} templateFusionKept=${m137UnsafeTemplateFusionGroups} authoredVertexColorsKept=${transportStats.skippedAuthoredVertexColor || 0} templateMaterialKeyHits=${m137TemplateMaterialKeyHits} misses=${m137TemplateMaterialKeyMisses} orderDependentKept=${transportStats.skippedOrderDependentMaterial || 0}`);
    console.info(`[PERF M138] World${worldNum} CPU-merge uncoloredBins=${transportProfile.uncoloredMergedBins} coloredBins=${transportProfile.coloredMergedBins} avoidedSyntheticColorBytes=${transportProfile.avoidedColorUploadBytes} avoidedColorObjects=${transportProfile.avoidedColorObjects} (estimates; not measured GPU upload)`);
    console.info(`[WorldObjects] World${worldNum}: rendered=${rendered} missing=${missing}` +
      (missingSerials.length ? ` missingModels=${missingSerials.join(',')}` : ''));
    return { ...parsed, rendered, missing, histogram: Object.fromEntries(histogram), missingSerials, serialAudit, stageProfile: frozenProfile };
  }

  updateVisibility(camera) {
    if (this._disposed || !camera) return;
    camera.updateMatrixWorld?.();
    // M130: camera matrices and authored placement count are the complete inputs
    // to this static-sphere frustum pass. The 48-value comparison is cheaper
    // than rebuilding the frustum and visiting every animated ObjectXX while
    // the camera is still. Moving/rotating/zooming cameras retain the original
    // per-frame behavior, and load/activate invalidate explicitly.
    if (pcMapFrustumPoseUnchanged(camera, this._viewCullPose, this.instances.length)) {
      this._viewCullProfile.skippedUnchanged++;
      return;
    }
    // M131: sampling the CPU scan every 64 real scans avoids two high-res
    // timer reads on every moving-camera frame. Counters remain exact.
    const m131TimeScan = (this._viewCullProfile.scans & 63) === 0;
    const m130ScanStart = m131TimeScan ? performance.now() : 0;
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
    // Only a completed scan can be cached. Non-finite camera matrices remain
    // fail-closed and will be rescanned on the next frame.
    pcMapRememberFrustumPose(camera, this._viewCullPose, this.instances.length);
    this._viewCullProfile.scans++;
    this._viewCullProfile.testedSlots += total;
    this._viewCullProfile.visible = visible;
    this._viewCullProfile.total = total;
    if (m131TimeScan) this._viewCullProfile.lastScanMs = performance.now() - m130ScanStart;
  }

  dispose() {
    if (this._viewCullPose) this._viewCullPose.valid = false;
    // M127: physical transition measurement, separate owner-array sweep from
    // renderer/material/BMD/visual resource teardown (which can dominate).
    const m127DisposeStart = performance.now();
    const m127SlotCount = this.instances.length;
    const m127RegisteredCount = this._ownedUpdateOwners.size;
    this._disposed = true;
    this._pendingUpdateOwners.length = 0;
    this._pendingUpdateOwnerSet.clear();
    // M127: remove registered callbacks AND the historical slot/environment
    // fallbacks in a single stable compaction. All subsequent resource dispose
    // and scene-root removal calls remain in their original order.
    const m127SceneRetirement = retireMapSceneObjectReferences(this.gameScene.objects, this._ownedUpdateOwners, this.instances, [
      this._lorenciaEnvironmentOwner?.group, this._lorenciaFishOwner?.group,
      this._lorenciaFaunaOwner?.group, this._icarusEnvironmentOwner?.group,
      this._icarusBoidsOwner?.group, this._mapWorldVisualOwner?.group,
      this._dynamicTerrainLightOwner,
    ]);
    const m127ReferenceSweepMs = performance.now() - m127DisposeStart;
    this._ownedUpdateOwners.clear();
    for (const s of this.instances) {
      s.outer.userData.update = null;
      if (s.pcVisualSprite) {
        try { this.root.remove(s.pcVisualSprite); s.pcVisualSprite.material?.dispose?.(); } catch (_) { /* best effort */ }
      }
      if (s.pcParticleOwner?.group) {
        try { s.pcParticleOwner.dispose?.(); } catch (_) { /* best effort */ }
      }
      if (s.pcLorenciaVisualOwner?.group) {
        try { this.root.remove(s.pcLorenciaVisualOwner.group); s.pcLorenciaVisualOwner.dispose?.(); } catch (_) { /* best effort */ }
      }
      if (s.pcLorenciaBoneVisualOwner?.group) {
        try { this.root.remove(s.pcLorenciaBoneVisualOwner.group); s.pcLorenciaBoneVisualOwner.dispose?.(); } catch (_) { /* best effort */ }
      }
      if (s.pcMapBoneVisualOwner?.group) {
        try { this.root.remove(s.pcMapBoneVisualOwner.group); s.pcMapBoneVisualOwner.dispose?.(); } catch (_) { /* best effort */ }
      }
      if (s.pcMapParticleOwner?.group) {
        try { this.root.remove(s.pcMapParticleOwner.group); s.pcMapParticleOwner.dispose?.(); } catch (_) { /* best effort */ }
      }
      // slot.renderer é null nos placements estáticos (compartilham o
      // template); apenas os animados têm renderer próprio.
      if (s.renderer) { try { s.renderer.dispose(); } catch (_) { /* best effort */ } }
    }
    if (this._lorenciaEnvironmentOwner?.group) {
      try { this.root.remove(this._lorenciaEnvironmentOwner.group); this._lorenciaEnvironmentOwner.dispose?.(); } catch (_) { /* best effort */ }
      this._lorenciaEnvironmentOwner = null;
    }
    if (this._lorenciaFishOwner?.group) {
      try { this.root.remove(this._lorenciaFishOwner.group); this._lorenciaFishOwner.dispose?.(); } catch (_) { /* best effort */ }
      this._lorenciaFishOwner = null;
    }
    if (this._lorenciaFaunaOwner?.group) {
      try { this.root.remove(this._lorenciaFaunaOwner.group); this._lorenciaFaunaOwner.dispose?.(); } catch (_) { /* best effort */ }
      this._lorenciaFaunaOwner = null;
    }
    if (this._icarusEnvironmentOwner?.group) {
      try { this.root.remove(this._icarusEnvironmentOwner.group); this._icarusEnvironmentOwner.dispose?.(); } catch (_) { /* best effort */ }
      this._icarusEnvironmentOwner = null;
    }
    if (this._icarusBoidsOwner?.group) {
      try { this.root.remove(this._icarusBoidsOwner.group); this._icarusBoidsOwner.dispose?.(); } catch (_) { /* best effort */ }
      this._icarusBoidsOwner = null;
    }
    if (this._mapWorldVisualOwner?.group) {
      try { this.root.remove(this._mapWorldVisualOwner.group); this._mapWorldVisualOwner.dispose?.(); } catch (_) { /* best effort */ }
      this._mapWorldVisualOwner = null;
    }
    if (this._dynamicTerrainLightOwner) {
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
      m135ReleaseTransportResources(this.root, batch, { batched: true });
    }
    this._batchedMeshes = [];
    for (const mesh of this._mergedTransportMeshes || []) {
      m135ReleaseTransportResources(this.root, mesh, { geometry: true });
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
    const m127TotalDisposeMs = performance.now() - m127DisposeStart;
    const m127DisposeProfile = Object.freeze({
      version: 'M127', world: this.worldNum, slots: m127SlotCount,
      registeredOwners: m127RegisteredCount,
      sceneOwnersRemoved: m127SceneRetirement.removed,
      sceneOwnersRetained: m127SceneRetirement.retained,
      referenceSweepMs: m127ReferenceSweepMs,
      resourceReleaseMs: m127TotalDisposeMs - m127ReferenceSweepMs,
      totalMs: m127TotalDisposeMs,
    });
    globalThis.__MUWEB_MAP_DISPOSE_PROFILE__ = m127DisposeProfile;
    console.info(`[PERF M127] World${this.worldNum} map dispose total=${m127TotalDisposeMs.toFixed(1)}ms referenceSweep=${m127ReferenceSweepMs.toFixed(1)}ms resourceRelease=${m127DisposeProfile.resourceReleaseMs.toFixed(1)}ms slots=${m127SlotCount} sceneRemoved=${m127SceneRetirement.removed} retained=${m127SceneRetirement.retained}`);
  }
}
