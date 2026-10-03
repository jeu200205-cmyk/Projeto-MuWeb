// Shared Main 5.2 map/visual particle budget.
// Desktop source owns one global `Particles[MAX_PARTICLES]` pool (3000), not one
// budget per map-effect module.  All Web map particle owners must reserve/release
// from this single authority so combined World75/Lorencia/map visuals cannot
// exceed the source capacity.
export const PC_MAX_PARTICLES = 3000;
let active = 0;

export function tryAcquirePcParticle(count = 1) {
  const n = Math.max(1, count | 0);
  if (active + n > PC_MAX_PARTICLES) return false;
  active += n;
  return true;
}

export function releasePcParticle(count = 1) {
  const n = Math.max(0, count | 0);
  if (n === 0) return active;
  active = Math.max(0, active - n);
  return active;
}


export function getPcParticleBudgetState() {
  return Object.freeze({ active, max: PC_MAX_PARTICLES, free: Math.max(0, PC_MAX_PARTICLES - active) });
}
