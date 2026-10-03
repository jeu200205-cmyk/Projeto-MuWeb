import * as THREE from 'three';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { tryAcquirePcParticle, releasePcParticle } from './PcParticleBudget.js';

// Exact B101/Main 5.2 bitmap ownership used by
// GMEmpireGuardian4::RenderObjectVisual + ZzzEffectParticle.cpp.
export const PC_WORLD75_BITMAP_PATHS = Object.freeze({
  BITMAP_FIRE_HIK1: 'Effect/firehik01.OZJ',
  BITMAP_FIRE_CURSEDLICH: 'Effect/firehik02.OZJ',
  BITMAP_FIRE_HIK3: 'Effect/firehik03.OZJ',
  BITMAP_FLAME: 'Effect/Flame01.OZJ',
  BITMAP_CLOUD: 'Effect/clouds.OZJ',
  BITMAP_SMOKE: 'Effect/smoke01.OZJ',
  BITMAP_WATERFALL_2: 'Effect/waterFall2.OZJ',
  BITMAP_WATERFALL_3: 'Effect/waterFall3.OZJ',
  BITMAP_WATERFALL_5: 'Effect/waterFall5.OZJ',
});

export const PC_WORLD75_PARTICLE_SERIALS = Object.freeze([79, 82, 83, 84, 85, 86, 129, 130, 131, 132]);
const textureCache = new Map();

const ri = (n) => Math.floor(Math.random() * Math.max(1, n));
const rad = (deg) => deg * Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const powTick = (base, f) => Math.pow(base, f);

function rotatePc(v, angle) {
  const ax = rad(Number(angle?.[0]) || 0);
  const ay = rad(Number(angle?.[1]) || 0);
  const az = rad(Number(angle?.[2]) || 0);
  const sr = Math.sin(ax), cr = Math.cos(ax);
  const sp = Math.sin(ay), cp = Math.cos(ay);
  const sy = Math.sin(az), cy = Math.cos(az);
  // ZzzMathLib::AngleMatrix, then VectorRotate.
  const m00 = cp * cy, m10 = cp * sy, m20 = -sp;
  const m01 = sr * sp * cy + cr * -sy;
  const m11 = sr * sp * sy + cr * cy;
  const m21 = sr * cp;
  const m02 = cr * sp * cy + -sr * -sy;
  const m12 = cr * sp * sy + -sr * cy;
  const m22 = cr * cp;
  return [
    v[0] * m00 + v[1] * m01 + v[2] * m02,
    v[0] * m10 + v[1] * m11 + v[2] * m12,
    v[0] * m20 + v[1] * m21 + v[2] * m22,
  ];
}

async function loadBitmap(path) {
  if (textureCache.has(path)) return textureCache.get(path);
  const promise = (async () => {
    const decoded = await RemoteAssets.fetchDecodedImage(path);
    if (!decoded?.image || !(decoded.w > 0) || !(decoded.h > 0)) return null;
    const texture = new THREE.Texture(decoded.image);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.userData.muPcBitmapPath = path;
    return Object.freeze({ texture, width: decoded.w, height: decoded.h, path });
  })().catch(() => null);
  textureCache.set(path, promise);
  return promise;
}

function requiredBitmaps(serial) {
  switch (serial | 0) {
    case 79: return ['BITMAP_FIRE_HIK1', 'BITMAP_FIRE_CURSEDLICH', 'BITMAP_FIRE_HIK3'];
    case 82: return ['BITMAP_WATERFALL_5'];
    case 83: return ['BITMAP_WATERFALL_3'];
    case 84: return ['BITMAP_WATERFALL_2'];
    case 85: return ['BITMAP_FLAME'];
    case 86:
    case 129:
    case 130: return ['BITMAP_CLOUD'];
    case 131:
    case 132: return ['BITMAP_SMOKE'];
    default: return [];
  }
}

export function pcWorld75EmitterContract(serial) {
  switch (serial | 0) {
    case 79: return Object.freeze({ cadence: 1, particles: ['BITMAP_FIRE_HIK1:0', 'BITMAP_FIRE_CURSEDLICH:4', 'BITMAP_FIRE_HIK3:0'] });
    case 82: return Object.freeze({ cadence: 1, particles: ['BITMAP_WATERFALL_5:9'] });
    case 83: return Object.freeze({ cadence: 1, particles: ['BITMAP_WATERFALL_3:14'] });
    case 84: return Object.freeze({ cadence: 8, particles: ['BITMAP_WATERFALL_2:4'] });
    case 85: return Object.freeze({ periodMs: 200, effect: 'BITMAP_FLAME:6', burstMin: 4, burstMax: 7, child: 'BITMAP_FLAME:12' });
    case 86: return Object.freeze({ cadence: 6, particles: ['BITMAP_CLOUD:21'], light: [0.05, 0.02, 0.01] });
    case 129: return Object.freeze({ cadence: 6, particles: ['BITMAP_CLOUD:21'], light: [0.01, 0.02, 0.05] });
    case 130: return Object.freeze({ cadence: 6, particles: ['BITMAP_CLOUD:21'], light: [0.01, 0.05, 0.02] });
    case 131: return Object.freeze({ cadence: 3, particles: ['BITMAP_SMOKE:22', 'BITMAP_SMOKE:21x2'] });
    case 132: return Object.freeze({ cadence: 3, particles: ['BITMAP_SMOKE:60', 'BITMAP_SMOKE:60', 'BITMAP_SMOKE:21x2'] });
    default: return null;
  }
}

function materialFor(loaded, subtractive = false) {
  const opts = {
    map: loaded.texture,
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    depthTest: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  };
  if (subtractive) {
    opts.blending = THREE.CustomBlending;
    opts.blendEquation = THREE.AddEquation;
    opts.blendSrc = THREE.ZeroFactor;
    opts.blendDst = THREE.OneMinusSrcColorFactor;
  } else {
    // ZzzOpenglUtil::EnableAlphaBlend => GL_ONE, GL_ONE for RGB bitmap particles.
    opts.blending = THREE.AdditiveBlending;
  }
  return new THREE.SpriteMaterial(opts);
}

function setThreePosition(sprite, origin, p) {
  // PC is Z-up. Web is Y-up with PC +Y mapped to Three -Z.
  sprite.position.set(origin.x + p[0], origin.y + p[2], origin.z - p[1]);
}

function makeState(type, subtype, inputScale, inputLight, angle) {
  const p = {
    type, subtype, life: 2, scale: Number(inputScale) || 1,
    rotation: 0, gravity: 0, alpha: 1,
    light: [...(inputLight || [0, 0, 0])], turning: [...(inputLight || [0, 0, 0])],
    angle: [...(angle || [0, 0, 0])], velocity: [0, 0, 0], pos: [0, 0, 0], live: true,
  };
  switch (`${type}:${subtype}`) {
    case 'BITMAP_FIRE_HIK1:0':
      p.life = ri(5) + 27; p.scale = (ri(72) + 72) * 0.01 * inputScale;
      p.rotation = ri(360); p.gravity = (ri(24) + 64) * 0.1; p.alpha = 0; p.light = [0, 0, 0]; break;
    case 'BITMAP_FIRE_HIK3:0':
      p.life = ri(5) + 17; p.scale = (ri(72) + 72) * 0.01 * inputScale;
      p.rotation = ri(360); p.gravity = (ri(24) + 64) * 0.1; p.alpha = 0; p.light = [0, 0, 0]; break;
    case 'BITMAP_FIRE_CURSEDLICH:4':
      p.life = ri(5) + 12; p.scale = (ri(72) + 72) * 0.01 * inputScale;
      p.rotation = ri(360); p.gravity = (ri(24) + 64) * 0.1; p.alpha = 0; p.light = [0, 0, 0]; break;
    case 'BITMAP_WATERFALL_5:9':
      p.life = 30; p.rotation = ri(360); p.scale = 0.6 + inputScale; p.velocity[2] = -(ri(5) + 7); p.light = [0.2, 0.2, 0.2]; break;
    case 'BITMAP_WATERFALL_3:14':
      p.life = 30; p.velocity[2] = ri(5) + 5; p.scale = (ri(10) + 10) * 0.05 * inputScale;
      p.rotation = ri(360); p.pos[0] += ri(40) - 20; p.pos[1] += ri(40) - 20; p.pos[2] += ri(20) - 10; break;
    case 'BITMAP_WATERFALL_2:4':
      p.life = 70; p.rotation = ri(360); p.scale = (ri(6) + 6) * 0.1 + inputScale;
      p.velocity[2] = -(ri(3) + 3); p.light = [0.25, 0.25, 0.25];
      p.pos[0] += ri(20) - 10; p.pos[1] += ri(20) - 10; p.pos[2] += ri(40) - 20; break;
    case 'BITMAP_CLOUD:21':
      p.life = 100; p.gravity = ri(1000); p.alpha = 0.6;
      p.pos[0] += ri(200) - 100; p.pos[1] += ri(200) - 100; p.pos[2] += ri(20) - 20;
      p.scale = (ri(20) + 180) * 0.01 * inputScale; p.rotation = 0; break;
    case 'BITMAP_SMOKE:21':
      p.life = 80; p.scale *= (ri(64) + 64) * 0.005; p.rotation = ri(360); p.gravity = (ri(32) + 60) * 0.1; break;
    case 'BITMAP_SMOKE:22':
      p.life = 60; p.scale *= (ri(64) + 64) * 0.005; p.rotation = ri(360); p.gravity = (ri(32) + 60) * 0.1; break;
    case 'BITMAP_SMOKE:60':
      p.light = [0.4, 0.4, 0.4]; p.life = 60; p.scale *= (ri(64) + 64) * 0.005;
      p.rotation = ri(360); p.gravity = (ri(32) + 60) * 0.1; break;
    case 'BITMAP_FLAME:12':
      p.life = 10; p.velocity[2] = (ri(128) + 128) * 0.15; p.scale = inputScale * (ri(64) + 64) * 0.01; break;
    default: break;
  }
  return p;
}

function moveState(p, factor, worldMs) {
  p.life -= factor;
  if (p.life <= 0) p.live = false;

  // MoveParticles() calls MovePosition before the per-type switch.
  const rv = rotatePc(p.velocity, p.angle);
  p.pos[0] += rv[0] * factor; p.pos[1] += rv[1] * factor; p.pos[2] += rv[2] * factor;

  switch (`${p.type}:${p.subtype}`) {
    case 'BITMAP_FIRE_HIK1:0': {
      if (p.life < 15) p.alpha -= factor * 0.2;
      else if (p.alpha < 1) p.alpha += factor * (ri(2) + 2) * 0.1;
      else p.alpha = 1;
      if (p.alpha < 0.1) p.live = false;
      p.light = p.turning.map((x) => x * p.alpha);
      if (p.scale > 0) p.scale -= factor * (ri(3) + 5) * 0.01; else p.live = false;
      p.pos[2] += p.gravity * factor; p.rotation += 3 * factor; break;
    }
    case 'BITMAP_FIRE_HIK3:0': {
      if (p.life < 10) p.alpha -= factor * 0.2;
      else if (p.alpha < 1) p.alpha += factor * (ri(2) + 2) * 0.1;
      else p.alpha = 1;
      if (p.alpha < 0.1) p.live = false;
      p.light = p.turning.map((x) => x * p.alpha);
      if (p.scale > 0) p.scale -= factor * (ri(3) + 7) * 0.01; else p.live = false;
      p.pos[2] += p.gravity * factor; p.rotation += 3 * factor; break;
    }
    case 'BITMAP_FIRE_CURSEDLICH:4': {
      if (p.life < 10) p.alpha -= factor * 0.2;
      else if (p.alpha < 1) p.alpha += factor * (ri(2) + 2) * 0.1;
      else p.alpha = 1;
      if (p.alpha < 0.1) p.live = false;
      p.light = p.turning.map((x) => x * p.alpha);
      if (p.scale > 0) p.scale -= (ri(3) + 6) * 0.01 * factor; else p.live = false;
      p.pos[2] += p.gravity * factor; p.rotation += 3 * factor; break;
    }
    case 'BITMAP_WATERFALL_5:9':
      p.scale -= factor * 0.005; p.velocity[2] += 0.1 * factor;
      if (p.life < 8) p.light = p.light.map((x) => x * powTick(1 / 1.2, factor));
      else if (p.life > 20) p.light = p.light.map((x) => x * powTick(1.1, factor));
      break;
    case 'BITMAP_WATERFALL_2:4':
      p.scale += factor * 0.03; p.velocity[0] = (ri(20) - 10) * 0.1; p.velocity[1] = (ri(20) - 10) * 0.1;
      p.velocity[2] += 0.1 * factor;
      if (p.life < 10) p.light = p.light.map((x) => x * powTick(1 / 1.1, factor));
      p.rotation -= 1.1 * factor; break;
    case 'BITMAP_WATERFALL_3:14':
      p.scale += factor * 0.05; p.velocity[2] -= 0.6 * factor;
      p.light = p.light.map((x) => x * powTick(1 / 1.1, factor)); break;
    case 'BITMAP_CLOUD:21':
      if (p.life > 50) { if (p.alpha < 1) p.alpha += factor * 0.04; p.pos[2] += 2 * factor; }
      else { if (p.alpha > 0.1) p.alpha -= factor * 0.005; p.pos[2] -= 1 * factor; }
      break;
    case 'BITMAP_SMOKE:21': {
      const lum = p.life / 50; p.light = [lum, lum, lum]; p.gravity -= 0.1 * factor;
      p.pos[0] -= p.gravity * 0.2 * factor; p.pos[2] += p.gravity * factor; p.scale -= 0.01 * factor; break;
    }
    case 'BITMAP_SMOKE:22': {
      const lum = p.life / 50; p.light = [lum * 0.9, lum * 0.5, lum * 0.5]; p.gravity -= 0.1 * factor;
      p.pos[0] += p.gravity * Math.sin(worldMs) * 0.05 * factor; p.pos[2] += p.gravity * factor; p.scale += 0.04 * factor; break;
    }
    case 'BITMAP_SMOKE:60': {
      const lum = p.life / 50; p.light = [lum * 0.4, lum * 0.4, lum * 0.4]; p.gravity -= 0.1 * factor;
      p.pos[0] += p.gravity * Math.sin(worldMs) * 0.05 * factor; p.pos[2] += p.gravity * factor; p.scale += 0.04 * factor; break;
    }
    case 'BITMAP_FLAME:12':
      // No subtype-12 override in MoveParticles: authored movement is exactly
      // the generic MovePosition above plus LifeTime decrement.
      break;
    default: break;
  }
  return p.live && p.scale > 0;
}

function effectiveLight(p) {
  if (p.type === 'BITMAP_CLOUD' && p.subtype === 21) return p.light.map((x) => x * p.alpha);
  return p.light;
}

export async function createPcWorld75ParticleOwner(serial, obj, origin) {
  serial |= 0;
  const contract = pcWorld75EmitterContract(serial);
  if (!contract) return null;
  const names = requiredBitmaps(serial);
  const loadedEntries = await Promise.all(names.map(async (name) => [name, await loadBitmap(PC_WORLD75_BITMAP_PATHS[name])]));
  const loaded = new Map(loadedEntries.filter(([, value]) => value));
  if (loaded.size !== names.length) return null; // exact asset missing => fail closed

  const group = new THREE.Group();
  group.name = `PC_World75_Particles_Type${serial}`;
  group.userData.muPcVisualOwner = 'GMEmpireGuardian4::RenderObjectVisual/ZzzEffectParticle.cpp';
  group.userData.muPcParticleContract = contract;
  const particles = [];
  const flameEffects = [];
  const originWorld = origin.clone();
  const angle = [Number(obj?.angleX) || 0, Number(obj?.angleY) || 0, Number(obj?.angleZ) || 0];
  const objectScale = Number.isFinite(Number(obj?.scale)) ? Number(obj.scale) : 1;
  let worldMs = 0;
  let flameBurstCarryMs = 0;

  const addParticle = (type, subtype, scale = objectScale, light = [1, 1, 1]) => {
    const tex = loaded.get(type); if (!tex) return false;
    if (!tryAcquirePcParticle()) return false;
    const state = makeState(type, subtype, scale, light, angle);
    const subtractive = type === 'BITMAP_SMOKE' && subtype === 21;
    const material = materialFor(tex, subtractive);
    const sprite = new THREE.Sprite(material);
    sprite.frustumCulled = true;
    sprite.userData.muPcParticle = `${type}:${subtype}`;
    sprite.userData.muPcBitmapPath = tex.path;
    group.add(sprite);
    const rec = { state, sprite, tex };
    particles.push(rec);
    return true;
  };

  const emitReferenceGate = (dt, referenceFrames, cb) => {
    // B101 rand_fps_check_ratio uses legacy 25Hz event density independent of
    // presentation FPS: chance = min(1, dt*25/referenceFrames).
    const chance = clamp(Math.max(0, dt) * 25 / Math.max(1, referenceFrames), 0, 1);
    if (Math.random() < chance) cb();
  };

  const emitBySerial = (dt) => {
    if (serial === 79) {
      emitReferenceGate(dt, 1, () => {
        const which = ri(3);
        if (which === 0) addParticle('BITMAP_FIRE_HIK1', 0, objectScale, [1, 1, 1]);
        else if (which === 1) addParticle('BITMAP_FIRE_CURSEDLICH', 4, objectScale, [1, 1, 1]);
        else addParticle('BITMAP_FIRE_HIK3', 0, objectScale, [1, 1, 1]);
      });
    } else if (serial === 82) emitReferenceGate(dt, 1, () => addParticle('BITMAP_WATERFALL_5', 9, objectScale, [0, 0, 0]));
    else if (serial === 83) emitReferenceGate(dt, 1, () => addParticle('BITMAP_WATERFALL_3', 14, objectScale, [1, 1, 1]));
    else if (serial === 84) emitReferenceGate(dt, 8, () => emitReferenceGate(dt, 1, () => addParticle('BITMAP_WATERFALL_2', 4, objectScale, [1, 1, 1])));
    else if (serial === 86) emitReferenceGate(dt, 6, () => addParticle('BITMAP_CLOUD', 21, objectScale, [0.05, 0.02, 0.01]));
    else if (serial === 129) emitReferenceGate(dt, 6, () => addParticle('BITMAP_CLOUD', 21, objectScale, [0.01, 0.02, 0.05]));
    else if (serial === 130) emitReferenceGate(dt, 6, () => addParticle('BITMAP_CLOUD', 21, objectScale, [0.01, 0.05, 0.02]));
    else if (serial === 131) emitReferenceGate(dt, 3, () => {
      addParticle('BITMAP_SMOKE', 22, objectScale, [1, 1, 1]);
      addParticle('BITMAP_SMOKE', 21, objectScale * 2, [1, 1, 1]);
    });
    else if (serial === 132) emitReferenceGate(dt, 3, () => {
      addParticle('BITMAP_SMOKE', 60, objectScale, [1, 1, 1]);
      addParticle('BITMAP_SMOKE', 60, objectScale, [1, 1, 1]);
      addParticle('BITMAP_SMOKE', 21, objectScale * 2, [1, 1, 1]);
    });
    else if (serial === 85) {
      flameBurstCarryMs += Math.max(0, dt) * 1000;
      while (flameBurstCarryMs >= 200) {
        flameBurstCarryMs -= 200;
        const count = ri(4) + 4; // source rand()%4 + 4
        for (let i = 0; i < count; i++) flameEffects.push({ life: 40 });
      }
      // Each BITMAP_FLAME subtype-6 effect lives 40 PC ticks and calls
      // CreateParticleFpsChecked(BITMAP_FLAME,...,12,scale) every effect update.
      const f = Math.min(2.5, Math.max(0, dt) * 25);
      for (let i = flameEffects.length - 1; i >= 0; i--) {
        const eff = flameEffects[i]; eff.life -= f;
        if (eff.life <= 0) { flameEffects.splice(i, 1); continue; }
        emitReferenceGate(dt, 1, () => {
          const ok = addParticle('BITMAP_FLAME', 12, objectScale, [0.5, 0.5, 0.5]);
          if (ok) {
            const rec = particles[particles.length - 1];
            rec.state.pos[0] += ri(32) - 16; rec.state.pos[1] += ri(32) - 16;
          }
        });
      }
    }
  };

  group.userData.update = (dt) => {
    const safeDt = Math.max(0, Math.min(0.1, Number(dt) || 0));
    worldMs += safeDt * 1000;
    emitBySerial(safeDt);
    const factor = Math.min(2.5, safeDt * 25);
    for (let i = particles.length - 1; i >= 0; i--) {
      const rec = particles[i];
      const live = moveState(rec.state, factor, worldMs);
      if (!live) {
        group.remove(rec.sprite); rec.sprite.material?.dispose?.(); particles.splice(i, 1); releasePcParticle(); continue;
      }
      const l = effectiveLight(rec.state);
      rec.sprite.material.color.setRGB(Math.max(0, l[0]), Math.max(0, l[1]), Math.max(0, l[2]));
      rec.sprite.material.rotation = rad(rec.state.rotation);
      setThreePosition(rec.sprite, originWorld, rec.state.pos);
      rec.sprite.scale.set(rec.tex.width * rec.state.scale, rec.tex.height * rec.state.scale, 1);
    }
  };

  return {
    group,
    serial,
    dispose() {
      group.userData.update = null;
      for (const rec of particles) { try { rec.sprite.material?.dispose?.(); } catch (_) {} }
      if (particles.length) releasePcParticle(particles.length);
      particles.length = 0; flameEffects.length = 0;
      if (group.parent) group.parent.remove(group);
    },
  };
}
