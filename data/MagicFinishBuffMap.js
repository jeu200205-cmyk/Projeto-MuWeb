// MagicFinishBuffMap.js — porte semântico de WSclient.cpp::ReceiveMagicFinish.
// Input: PHEADER_DEFAULT_VALUE_KEY.Value (ActionSkillType)
// Output: eBuffState removido pelo PC via UnRegisterBuff.
// Números conferidos em SkillManager.h (ActionSkillType) e _enum.h (eBuffState).

export const PC_BUFF_STATE = Object.freeze({
  ATTACK: 1,
  DEFENSE: 2,
  PHYS_DEFENSE: 4,
  ADD_CRITICAL_DAMAGE: 5,
  ADD_AG: 7,
  HP_RECOVERY: 8,
  ADD_MANA: 9,
  CLOAKING: 18,
  ADD_SKILL: 19,
  DEBUFF_POISON: 55,
  DEBUFF_FREEZE: 56,
  DEBUFF_HARDEN: 57,
  DEBUFF_DEFENSE: 58,
  DEBUFF_STUN: 61,
  DEBUFF_BLOW_OF_DESTRUCTION: 86,
  ATT_UP_OURFORCES: 129,
  HP_UP_OURFORCES: 130,
  DEF_UP_OURFORCES: 131,
});

// ActionSkillType values used specifically by ReceiveMagicFinish.
const S = Object.freeze({
  POISON: 1,
  SLOW: 7,
  WIZARDDEFENSE: 16,
  DEFENSE: 27,
  ATTACK: 28,
  BLAST_POISON: 38,
  BLAST_FREEZE: 39,
  VITALITY: 48,
  PARALYZE: 51,
  IMPROVE_AG: 53,
  REDUCEDEFENSE: 55,
  ADD_CRITICAL: 64,
  STUN: 67,
  MANA: 69,
  INVISIBLE: 70,
  BRAND_OF_SKILL: 75,
  MONSTER_MAGIC_DEF: 201,
  MONSTER_PHY_DEF: 202,
  BLOW_OF_DESTRUCTION: 232,
  ATT_UP_OURFORCES: 266,
  HP_UP_OURFORCES: 267,
  DEF_UP_OURFORCES: 268,
  SOUL_UP: 435,
  ICE_UP: 450,
  LIFE_UP: 470,
  DEF_POWER_UP: 480,
  ATT_POWER_UP: 485,
  BLOOD_ATT_UP: 500,
});

const in5 = (v, start) => v >= start && v <= start + 4;

/** @returns {number|null} eBuffState exato removido pelo PC, ou null sem case. */
export function magicFinishBuffState(skillType) {
  const v = Number(skillType);
  if (!Number.isInteger(v)) return null;
  if (v === S.POISON || v === S.BLAST_POISON) return PC_BUFF_STATE.DEBUFF_POISON;
  if (v === S.SLOW || v === S.BLAST_FREEZE || in5(v, S.ICE_UP)) return PC_BUFF_STATE.DEBUFF_FREEZE;
  if (v === S.BLOW_OF_DESTRUCTION) return PC_BUFF_STATE.DEBUFF_BLOW_OF_DESTRUCTION;
  if (v === S.ATTACK || in5(v, S.ATT_POWER_UP)) return PC_BUFF_STATE.ATTACK;
  if (v === S.DEFENSE || in5(v, S.DEF_POWER_UP) || v === S.MONSTER_MAGIC_DEF) return PC_BUFF_STATE.DEFENSE;
  if (v === S.STUN) return PC_BUFF_STATE.DEBUFF_STUN;
  if (v === S.INVISIBLE) return PC_BUFF_STATE.CLOAKING;
  if (v === S.MANA) return PC_BUFF_STATE.ADD_MANA;
  if (v === S.BRAND_OF_SKILL) return PC_BUFF_STATE.ADD_SKILL;
  if (v === S.IMPROVE_AG) return PC_BUFF_STATE.ADD_AG;
  if (v === S.ADD_CRITICAL) return PC_BUFF_STATE.ADD_CRITICAL_DAMAGE;
  if (v === S.VITALITY || in5(v, S.LIFE_UP)) return PC_BUFF_STATE.HP_RECOVERY;
  if (v === S.PARALYZE) return PC_BUFF_STATE.DEBUFF_HARDEN;
  if (v === S.REDUCEDEFENSE || in5(v, S.BLOOD_ATT_UP)) return PC_BUFF_STATE.DEBUFF_DEFENSE;
  if (v === S.WIZARDDEFENSE || in5(v, S.SOUL_UP) || v === S.MONSTER_PHY_DEF) return PC_BUFF_STATE.PHYS_DEFENSE;
  if (v === S.ATT_UP_OURFORCES) return PC_BUFF_STATE.ATT_UP_OURFORCES;
  if (v === S.HP_UP_OURFORCES) return PC_BUFF_STATE.HP_UP_OURFORCES;
  if (v === S.DEF_UP_OURFORCES) return PC_BUFF_STATE.DEF_UP_OURFORCES;
  return null;
}
