// PcVitalitySpirit2.js — pure Main 5.2 JOINT_SPIRIT subtype-2 authoring math.
// Evidence owner: ZzzCharacter + ZzzEffectJoint, retained by the audited Android
// port. This module is deterministic and display-FPS independent.

export const VITALITY_SPIRIT_COUNT = 36;
export const VITALITY_LIFE_TICKS = 20;
export const VITALITY_SCALE = 60;
export const VITALITY_HALF_WIDTH = VITALITY_SCALE * 0.5;
export const VITALITY_MAX_TAILS = 3;
export const VITALITY_PITCH_DEG = -10;
export const VITALITY_LIGHT = Object.freeze([0.5, 0.5, 0.5]);

// Retained MoveJoint distance: first authored step travels 50; velocity grows
// by +5 every following authored tick. Fractional ticks interpolate only the
// presentation sample and never advance the authored 25-Hz logic clock.
export function vitalitySpiritDistance(ticks) {
  if (!Number.isFinite(ticks) || ticks <= 0) return 0;
  const t = Math.min(VITALITY_LIFE_TICKS, ticks);
  const whole = Math.floor(t);
  const frac = t - whole;
  return 50 * whole
    + 2.5 * whole * (whole - 1)
    + (50 + 5 * whole) * frac;
}

// PC angle = { pitch, 0, yaw }. MU coords map to Web as X->X, Z->Y, Y->-Z.
export function vitalitySpiritPointWeb(origin, yawDeg, ticks, out = [0, 0, 0], pitchDeg = VITALITY_PITCH_DEG) {
  const d = vitalitySpiritDistance(ticks);
  const yaw = yawDeg * Math.PI / 180;
  const pitch = pitchDeg * Math.PI / 180;
  const horizontal = Math.cos(pitch);
  const dx = Math.sin(yaw) * horizontal;
  const dy = -Math.sin(pitch);              // MU Z -> Web Y
  const dz = Math.cos(yaw) * horizontal;    // -MU Y -> Web +Z
  out[0] = origin[0] + dx * d;
  out[1] = origin[1] + dy * d;
  out[2] = origin[2] + dz * d;
  return out;
}

// Retained renderer keeps MaxTails=3 at the authored 25-Hz clock. Returned
// points are oldest -> newest. Higher display Hz interpolates between these
// samples but never changes their authored temporal span.
export function vitalitySpiritTrailWeb(origin, yawDeg, ticks, out = []) {
  out.length = 0;
  const t = Math.max(0, Math.min(VITALITY_LIFE_TICKS, Number.isFinite(ticks) ? ticks : 0));
  const history = Math.min(Math.floor(t), VITALITY_MAX_TAILS - 1);
  const oldest = Math.max(0, t - history);
  for (let i = 0; i <= history; i++) out.push(vitalitySpiritPointWeb(origin, yawDeg, oldest + i));
  return out;
}

// MoveJoint dims SPIRIT/2 only during its final ten authored ticks by /1.2 per
// tick. RenderJoints does not add a second lifetime alpha fade.
export function vitalitySpiritFadeForRemainingTicks(remainingTicks) {
  const r = Math.max(0, Math.min(VITALITY_LIFE_TICKS, Number.isFinite(remainingTicks) ? remainingTicks : 0));
  return r < 10 ? Math.pow(1 / 1.2, 10 - r) : 1;
}

export function vitalitySpiritSideWeb(yawDeg, out = [0, 0, 0]) {
  const yaw = yawDeg * Math.PI / 180;
  // Retained local-X ribbon face: PC (cos(yaw), sin(yaw), 0) * Scale/2.
  // MU Y maps to -Web Z.
  out[0] = Math.cos(yaw) * VITALITY_HALF_WIDTH;
  out[1] = 0;
  out[2] = -Math.sin(yaw) * VITALITY_HALF_WIDTH;
  return out;
}
