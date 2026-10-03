// PcWizardBasicImpact.js — verified Main 5.2 wizard impact/travel call-site graphs.
// Evidence source: clean-PC-derived ZzzCharacter recipe preserved by the mobile parity lane.
// This module deliberately authors only proven calls; particle/model update internals remain
// fail-closed until their exact MoveEffect/MoveParticle contracts are recovered.

export function poisonImpactAuthor({ casterIsPlayer = false } = {}) {
  return Object.freeze({
    skill: 'AT_SKILL_POISON',
    model: casterIsPlayer ? Object.freeze({ model: 'MODEL_POISON', bmd: 'Skill/Poison01.bmd', subtype: 0, owner: null }) : null,
    smoke: Object.freeze({ bitmap: 'BITMAP_SMOKE', subtype: 1, count: 10, light: Object.freeze([0.4, 0.6, 1.0]), scale: 1.0 }),
    sound: Object.freeze({ symbol: 'SOUND_HEART', wav: 'pHeartBeat.wav' }),
  });
}

export function meteorImpactAuthor() {
  return Object.freeze({
    skill: 'AT_SKILL_METEO',
    model: Object.freeze({ model: 'MODEL_FIRE', bmd: 'Skill/Fire01.bmd', subtype: 0, owner: null, angleOwner: 'target' }),
    sound: Object.freeze({ symbol: 'SOUND_METEORITE01', wav: 'eMeteorite.wav' }),
  });
}

export function powerWaveTravelAuthor({ iceQueen = false } = {}) {
  const yawOffsetsDeg = iceQueen ? Object.freeze([10, -10, 0]) : Object.freeze([0]);
  return Object.freeze({
    skill: 'AT_SKILL_POWERWAVE',
    model: 'MODEL_MAGIC2', bmd: 'Skill/Magic02.bmd', subtype: 0, owner: null,
    angleOwner: 'caster_to_target', yawOffsetsDeg,
    sound: Object.freeze({ symbol: 'SOUND_MAGIC', wav: 'sMagic.wav' }),
  });
}
