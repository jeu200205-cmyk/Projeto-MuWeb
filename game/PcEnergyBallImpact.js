// PcEnergyBallImpact.js — verified Main 5.2 AT_SKILL_ENERGYBALL call-site owner.
// Evidence retained by the Web R12.5 PC-parity gate:
// ZzzCharacter.cpp:5060 -> CreateEffect(BITMAP_ENERGY, ...)
// ZzzOpenData.cpp:5208 -> BITMAP_ENERGY = Effect/Thunder01.jpg (.OZJ in real client).
// The constructor/update subtype, blend, lifetime and cleanup are not yet proven here;
// therefore this module authors identity only and the visible renderer stays fail-closed.

export function energyBallImpactAuthor() {
  return Object.freeze({
    skill: 'AT_SKILL_ENERGYBALL',
    effect: Object.freeze({
      model: 'BITMAP_ENERGY',
      texture: 'Effect/Thunder01.OZJ',
      owner: null,
    }),
    renderer: 'fail-closed-until-bitmap-energy-update-contract',
  });
}
