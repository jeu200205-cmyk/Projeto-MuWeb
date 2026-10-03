// PcFireballImpact.js — verified Main 5.2 FIREBALL impact authoring only.
// ZzzEffect MoveEffect MODEL_FIRE/SubType 1 impact call-site:
//   6x CreateEffect(MODEL_STONE1 + rand()%2)
//   1x CreateParticle(BITMAP_EXPLOTION)
// This module deliberately does NOT invent stone ballistics, particle count,
// particle speed, gravity, lifetime, billboard size, blend or cleanup rules.

export const FIREBALL_STONE_COUNT = 6;
export const FIREBALL_STONE_MODELS = Object.freeze(['Skill/Stone01.bmd', 'Skill/Stone02.bmd']);
export const FIREBALL_EXPLOSION_BITMAP = 'Effect/Explotion01.OZJ';

export function fireballImpactAuthor(stoneRandBits) {
  if (!Array.isArray(stoneRandBits) || stoneRandBits.length !== FIREBALL_STONE_COUNT) return null;
  const stones = stoneRandBits.map((v, index) => ({
    owner: 'MODEL_STONE',
    index,
    subtype: 0,
    modelPath: FIREBALL_STONE_MODELS[(Math.trunc(v) & 1)],
  }));
  return Object.freeze({
    stones: Object.freeze(stones),
    particle: Object.freeze({ owner: 'BITMAP_EXPLOTION', subtype: 0, texturePath: FIREBALL_EXPLOSION_BITMAP }),
  });
}
