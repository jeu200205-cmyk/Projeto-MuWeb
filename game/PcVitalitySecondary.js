// PcVitalitySecondary.js — retained Main 5.2 Vitality secondary owner contract.
// This module authors the exact temporal/owner rules without inventing a Web
// renderer or RNG sequence. Callers must provide the legacy rand() residues.

export const VITALITY_MAGIC_PULSE_INDICES = Object.freeze([0, 20]);
export const VITALITY_MAGIC_SUBTYPE = 4;
export const VITALITY_MAGIC_LIFE_TICKS = 40;
export const VITALITY_MAGIC_LIGHT = Object.freeze([1.0, 0.5, 0.1]);
export const VITALITY_FLARE_SUBTYPE = 2;
export const VITALITY_FLARE_LIFE_TICKS = 100;
export const VITALITY_FLARE_STATIONARY_TICKS = 75;
export const VITALITY_FLARE_MOVE_TICKS = 25;
export const VITALITY_FLARE_MAX_TAILS = 20;
export const VITALITY_FLARE_SCALE = 10;

export function vitalityMagicScaleFromRand50(rand50) {
  if (!Number.isInteger(rand50) || rand50 < 0 || rand50 >= 50) throw new RangeError('rand50 must be legacy rand()%50 in [0,49]');
  return (50 + rand50) / 100 * 4;
}

export function vitalityMagicPulseDescriptor(index, root, yawDeg, rand50) {
  if (!VITALITY_MAGIC_PULSE_INDICES.includes(index)) return null;
  return Object.freeze({
    owner: 'BITMAP_MAGIC+1', subtype: VITALITY_MAGIC_SUBTYPE,
    index, position: Object.freeze([root[0], root[1], root[2]]),
    yawDeg, scale: vitalityMagicScaleFromRand50(rand50),
    lifeTicks: VITALITY_MAGIC_LIFE_TICKS,
    light: VITALITY_MAGIC_LIGHT,
    renderer: 'terrain-alpha-bitmap',
  });
}

export function vitalityFlareDescriptor(spiritOrigin, randX200, randY200, randYaw360) {
  for (const [n, max] of [[randX200,200],[randY200,200],[randYaw360,360]]) {
    if (!Number.isInteger(n) || n < 0 || n >= max) throw new RangeError('legacy rand residue out of range');
  }
  return Object.freeze({
    owner: 'BITMAP_FLARE', subtype: VITALITY_FLARE_SUBTYPE,
    position: Object.freeze([spiritOrigin[0] + randX200 - 100, spiritOrigin[1] - 200, spiritOrigin[2] - (randY200 - 100)]),
    yawDeg: randYaw360, scale: VITALITY_FLARE_SCALE,
    lifeTicks: VITALITY_FLARE_LIFE_TICKS, maxTails: VITALITY_FLARE_MAX_TAILS,
    stationaryTicks: VITALITY_FLARE_STATIONARY_TICKS, moveTicks: VITALITY_FLARE_MOVE_TICKS,
    renderer: 'joint-ribbon',
  });
}

// Final 25 PC ticks: Direction.z += 5, then Position += Direction.
export function vitalityFlareVerticalDistance(authoredAgeTicks) {
  if (!Number.isFinite(authoredAgeTicks)) return 0;
  const moving = Math.max(0, Math.min(VITALITY_FLARE_MOVE_TICKS, authoredAgeTicks - VITALITY_FLARE_STATIONARY_TICKS));
  const whole = Math.floor(moving), frac = moving - whole;
  return 5 * whole * (whole + 1) / 2 + 5 * (whole + 1) * frac;
}
