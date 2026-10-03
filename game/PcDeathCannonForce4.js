// PcDeathCannonForce4.js — pure Main 5.2 JOINT_FORCE subtype-4 authoring math.
// Evidence owner: ZzzEffectJoint FORCE/4, retained in AndroidPcDeathCannonV79/V517.
// No renderer guesses live here; this module is deterministic and display-FPS independent.

export const DEATH_CANNON_LIFE_TICKS = 20;
export const DEATH_CANNON_MAX_TAILS = 13;
export const DEATH_CANNON_SCALE = 40;
export const DEATH_CANNON_HALF_WIDTH = DEATH_CANNON_SCALE * 0.5;
export const DEATH_CANNON_MULTI_USE = 10;
export const DEATH_CANNON_LIGHT = Object.freeze([0.1, 0.6, 1.0]);

function buildDistances() {
  const out = new Float64Array(DEATH_CANNON_LIFE_TICKS + 1);
  let velocity = 8.0;
  let acceleration = 3.0;
  for (let tick = 0; tick < DEATH_CANNON_LIFE_TICKS; tick++) {
    out[tick + 1] = out[tick] + velocity;
    velocity += acceleration;
    // Retained PC order: test the pre-decrement LifeTime for the authored tick.
    acceleration += (DEATH_CANNON_LIFE_TICKS - tick < 15) ? 0.5 : 15.5;
  }
  return out;
}

export const DEATH_CANNON_DISTANCES = buildDistances();

export function deathCannonDistance(ticks) {
  if (!Number.isFinite(ticks) || ticks <= 0) return 0;
  if (ticks >= DEATH_CANNON_LIFE_TICKS) return DEATH_CANNON_DISTANCES[DEATH_CANNON_LIFE_TICKS];
  const whole = Math.floor(ticks);
  const frac = ticks - whole;
  return DEATH_CANNON_DISTANCES[whole]
    + (DEATH_CANNON_DISTANCES[whole + 1] - DEATH_CANNON_DISTANCES[whole]) * frac;
}

// The Web port stores model yaw as threeYaw = PI - pcAngle and maps MU Y to -Three Z.
// Applying the retained PC Position() under that mapping yields:
//   +X = sin(threeYaw) * d
//   +Z = -cos(threeYaw) * d
export function deathCannonPointWeb(origin, threeYaw, ticks, out = [0, 0, 0]) {
  const d = deathCannonDistance(ticks);
  out[0] = origin[0] + Math.sin(threeYaw) * d;
  out[1] = origin[1];
  out[2] = origin[2] - Math.cos(threeYaw) * d;
  return out;
}

export function deathCannonFadeForTick(authoredTick) {
  const tick = Math.max(1, Math.min(DEATH_CANNON_LIFE_TICKS, Math.floor(authoredTick || 1)));
  const lifeBefore = DEATH_CANNON_LIFE_TICKS - tick + 1;
  const fades = lifeBefore < DEATH_CANNON_MULTI_USE ? DEATH_CANNON_MULTI_USE - lifeBefore : 0;
  return Math.pow(1 / 1.3, fades);
}

// Reconstruct the retained 13-tail history at the PC 25-Hz authoring cadence.
// Points are returned oldest -> newest so UV/brightness can progress monotonically.
export function deathCannonTrailWeb(origin, threeYaw, ticks, out = []) {
  out.length = 0;
  const t = Math.max(0, Math.min(DEATH_CANNON_LIFE_TICKS, Number.isFinite(ticks) ? ticks : 0));
  const history = Math.min(Math.floor(t), DEATH_CANNON_MAX_TAILS - 1);
  const oldest = Math.max(0, t - history);
  for (let i = 0; i <= history; i++) {
    out.push(deathCannonPointWeb(origin, threeYaw, oldest + i));
  }
  return out;
}
