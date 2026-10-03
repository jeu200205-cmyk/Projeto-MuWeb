// PcIceImpact.js — verified Main 5.2 AT_SKILL_ICE owner/call-site authoring.
// ZzzEffect.cpp MODEL_ICE SubType 1/2 constructor contract retained here.
// Particle rendering stays fail-closed until BITMAP_SMOKE MoveParticle is ported.
export const ICE_MODEL_PATH = 'Skill/Ice01.bmd';
export const ICE_SMOKE_TEXTURE = 'Effect/smoke01.OZJ';
export const ICE_LIFETIME_TICKS = 20;
export const ICE_SCALE = 0.8;
export const ICE_PITCH_DEG = -20;
export const ICE_GRAVITY = 5;
export const ICE_BLEND_MESH_LIGHT = 0.5;
export const ICE_SMOKE_COUNT = 3;

export function iceImpactAuthor({ headAngleResidue, smokeResidues }) {
  if (!Number.isInteger(headAngleResidue)) return null;
  if (!Array.isArray(smokeResidues) || smokeResidues.length !== ICE_SMOKE_COUNT) return null;
  const smoke = [];
  for (let i = 0; i < ICE_SMOKE_COUNT; i++) {
    const r = smokeResidues[i];
    if (!r || !Number.isInteger(r.x) || !Number.isInteger(r.y) || !Number.isInteger(r.z)) return null;
    smoke.push(Object.freeze({
      owner: 'BITMAP_SMOKE', subtype: 0, texturePath: ICE_SMOKE_TEXTURE,
      offsetMu: Object.freeze({ x: (r.x % 128) - 64, y: (r.y % 128) - 64, z: (r.z % 128) + 32 }),
    }));
  }
  return Object.freeze({
    owner: 'MODEL_ICE', subtype: 1, modelPath: ICE_MODEL_PATH,
    lifetimeTicks: ICE_LIFETIME_TICKS, scale: ICE_SCALE, pitchDeg: ICE_PITCH_DEG,
    gravity: ICE_GRAVITY, blendMeshLight: ICE_BLEND_MESH_LIGHT,
    headAngleDeg: headAngleResidue % 360,
    smoke: Object.freeze(smoke),
  });
}
