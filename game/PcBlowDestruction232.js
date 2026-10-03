// PcBlowDestruction232.js — pure Main 5.2 Blow of Destruction impact-owner math.
// Evidence retained by AndroidPcBlowDestructionParallelA/B and the audited
// Main-derived mobile lane. This module intentionally excludes terrain sprites,
// waterfall particles and quake presentation until their Web renderer owners are
// accepted separately.

export const BLOW_ROOT_LIFE_TICKS = 40;
export const BLOW_IMPACT_TICK = 17;
export const BLOW_IMPACT_SECONDS = BLOW_IMPACT_TICK / 25;
export const BLOW_PC_HZ = 25;
export const BLOW_BLUE_LIGHT = Object.freeze([0.3, 0.3, 1.0]);
export const BLOW_ROOT_LOCAL = Object.freeze([-20, -100, 0]);
export const BLOW_SUBTYPE1_MU_Z = 150;

export function blowHash32(x) {
  x = x >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7FEB352D) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846CA68B) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

// PC local XY is rotated by Angle.z. Web keeps X, maps MU Z->Web Y and MU Y->-Web Z.
// threeYaw = PI - pcAngle for player/world owners in the current Web lineage.
export function blowRootWeb(source, threeYaw, out = [0, 0, 0]) {
  const pcYaw = Math.PI - threeYaw;
  const c = Math.cos(pcYaw), s = Math.sin(pcYaw);
  const x = BLOW_ROOT_LOCAL[0], y = BLOW_ROOT_LOCAL[1];
  const muX = x * c - y * s;
  const muY = x * s + y * c;
  out[0] = source[0] + muX;
  out[1] = source[1];
  out[2] = source[2] - muY;
  return out;
}

export function blowSubtype1Web(target, out = [0, 0, 0]) {
  out[0] = target[0];
  out[1] = BLOW_SUBTYPE1_MU_Z;
  out[2] = target[2];
  return out;
}

export function blowCrackCount(length) {
  const len = Number.isFinite(length) ? Math.max(0, length) : 0;
  return Math.floor(len / 100) + 1;
}

export function blowCrackDistance(index) {
  return 55 * Math.max(0, index | 0);
}

export function blowCrackYawDeltaDeg(serial, index) {
  const h = blowHash32((Math.imul(serial >>> 0, 2654435761) + Math.imul((index + 1) >>> 0, 2246822519)) >>> 0);
  const magnitude = 10 + (h % 20);
  return (index & 1) ? -magnitude : magnitude;
}

export function blowPlanCrackAScale(serial) {
  const h = blowHash32((serial >>> 0) ^ 0x0B10FDE5);
  return 1.2 + (h % 10) * 0.05;
}

export function blowStoneCount(serial) {
  const seed = blowHash32((Math.imul(serial >>> 0, 8191) + 0x0B10D17) >>> 0);
  return 5 + (seed % 3);
}

export function blowImpactOwnersWeb(source, target, threeYaw, serial = 1) {
  const root = blowRootWeb(source, threeYaw, [0, 0, 0]);
  const sub1 = blowSubtype1Web(target, [0, 0, 0]);
  const dx = target[0] - root[0], dy = target[1] - root[1], dz = target[2] - root[2];
  const len = Math.hypot(dx, dy, dz);
  const inv = len > 1e-6 ? 1 / len : 0;
  const dir = [dx * inv, dy * inv, dz * inv];
  const owners = [];
  const push = (path, position, yaw, scale, life, tag) => owners.push({ path, position: [...position], yaw, scale, life, tag });

  // Subtype-0 LifeTime 23 impact graph.
  push('Effect/nightwater01.bmd', root, threeYaw, 1, 1.0, 'root-nightwater-a');
  push('Effect/nightwater01.bmd', root, threeYaw, 1, 1.0, 'root-nightwater-b');
  push('Effect/knight_plancrack_a.bmd', root, threeYaw, blowPlanCrackAScale(serial), 1.0, 'root-plancrack-a');

  const n = blowCrackCount(len);
  for (let i = 0; i < n; i++) {
    const d = blowCrackDistance(i);
    const p = [root[0] + dir[0] * d, root[1] + dir[1] * d, root[2] + dir[2] * d];
    // PC yaw adds delta; Web yaw is PI-pcYaw, therefore subtract the PC delta.
    const yaw = threeYaw - blowCrackYawDeltaDeg(serial, i) * Math.PI / 180;
    push('Effect/knight_plancrack_b.bmd', p, yaw, 1, 1.0, `root-plancrack-b-${i}`);
  }

  // Subtype-1 LifeTime 23 BMD graph.
  push('Effect/nightwater01.bmd', sub1, threeYaw, 2, 1.0, 'sub1-nightwater-large');
  push('Effect/nightwater01.bmd', sub1, threeYaw, 1, 1.0, 'sub1-nightwater-small');
  push('Effect/knight_plancrack_grand.bmd', sub1, threeYaw, 1.2, 1.6, 'sub1-plancrack-grand');

  return {
    root,
    sub1,
    length: len,
    owners,
    zeroScaleStoneCount: blowStoneCount(serial),
  };
}
