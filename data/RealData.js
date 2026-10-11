/**
 * RealData.js — bridge for tables physically generated from the ONLY permitted
 * client asset authority: C:\clientepromax\Nova pasta\MuPromax 1.0.1\Data.
 *
 * No guessed, remembered, or alternate-client Data is accepted. The startup
 * verify-only manifest gate owns provenance and hashes; this bridge refuses
 * missing/empty generated tables instead of falling back to unrelated content.
 * Monster combat statistics are a separate GameServer authority, never an
 * alternate source for client BMD names, map entries, or item indices.
 */

import { ITEM_TYPES } from './ItemTypes.js';
import { REAL_ITEMS } from './generated/RealItems.js';
import { REAL_MONSTERS } from './generated/RealMonsters.js';
import { REAL_MAPS } from './generated/RealMaps.js';
import { STATS_BY_CLASS } from './generated/RealMonsterStats.js';

const KIND_TO_ITEM_TYPE = {
  sword: ITEM_TYPES.WEAPON,
  axe: ITEM_TYPES.WEAPON,
  mace: ITEM_TYPES.WEAPON,
  spear: ITEM_TYPES.WEAPON,
  bow: ITEM_TYPES.WEAPON,
  crossbow: ITEM_TYPES.WEAPON,
  staff: ITEM_TYPES.WEAPON,
  shield: ITEM_TYPES.SHIELD,
  helm: ITEM_TYPES.HELM,
  armor: ITEM_TYPES.ARMOR,
  pants: ITEM_TYPES.PANTS,
  gloves: ITEM_TYPES.GLOVES,
  boots: ITEM_TYPES.BOOTS,
  wings_accessory: ITEM_TYPES.WINGS,
  misc: ITEM_TYPES.OTHER,
  jewel_scroll: ITEM_TYPES.OTHER,
};

function requireOfficialRows(rows, table) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`[DATA AUTHORITY] ${table} absent or empty; physical regeneration from official 1.0.1 required`);
  }
  return rows;
}

/** Compatibility entrypoint. Never imports local MonsterTypes as a fallback. */
export async function preloadRealData() {
  return getRealMonsterList().length;
}

/** Names, slots and item indices are exclusively from the generated BMD. */
export function getRealItemList() {
  return requireOfficialRows(REAL_ITEMS, 'RealItems').map((it) => ({
    realIndex: it.index,
    typeId: it.index,
    category: it.category,
    slot: it.slot,
    kind: it.kind,
    name: it.name,
    type: KIND_TO_ITEM_TYPE[it.kind] || ITEM_TYPES.OTHER,
    isRealData: true,
  }));
}

/** Client NPC names/classes; GameServer stats may augment, never replace them. */
export function getRealMonsterList() {
  return requireOfficialRows(REAL_MONSTERS, 'RealMonsters').map((m) => {
    const stats = STATS_BY_CLASS.get(m.monsterClass);
    return {
      ...(stats || {}),
      id: m.monsterClass,
      name: m.name,
      isRealData: true,
    };
  });
}

/** Exact move-request table; no invented MAPS fallback on missing official BMD. */
export function getRealMapList() {
  return requireOfficialRows(REAL_MAPS, 'RealMaps').map((m) => ({
    mapNumber: m.mapNumber,
    name: m.name,
    nameAlt: m.nameAlt,
    minZen: m.minZen,
    moveZen: m.moveZen,
    isRealData: true,
  }));
}

export default { getRealItemList, getRealMonsterList, getRealMapList, preloadRealData };
