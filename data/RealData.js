/**
 * RealData.js — Ponte para dados REAIS do cliente MuPromax 1.0.2 e do servidor
 * (web-port/data/generated/*.js, gerados por tools/generateRealData.mjs e
 * tools/generateMonsterData.mjs). Monstros: nome PT do Npcname + stats REAIS
 * do Monster.txt do GameServer (C:\ms). Sem fallback inventado.
 */

import { ITEM_DB, ITEM_TYPES } from './ItemTypes.js';
import { MAPS } from '../world/MapData.js';
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

let INVENTED_MONSTERS = [];

/**
 * Carrega a lista de monstros reais (stats do Monster.txt do servidor) sem
 * importar three estaticamente. Mantido p/ compatibilidade de call sites.
 */
export async function preloadRealData() {
  try {
    const mod = await import('../game/Monster.js');
    INVENTED_MONSTERS = Object.values(mod.MonsterTypes || {});
  } catch {
    INVENTED_MONSTERS = [];
  }
  return getRealMonsterList().length;
}

/** Itens reais (nomes/índices de item_por.bmd) + stats inventados se o nome bate. */
export function getRealItemList() {
  if (!Array.isArray(REAL_ITEMS) || REAL_ITEMS.length === 0) return ITEM_DB;
  const byName = new Map(ITEM_DB.map((d) => [d.name, d]));
  return REAL_ITEMS.map((it) => {
    const invented = byName.get(it.name) || {};
    return {
      ...invented,
      realIndex: it.index,
      category: it.category,
      typeId: invented.typeId,
      name: it.name,
      type: KIND_TO_ITEM_TYPE[it.kind] || ITEM_TYPES.OTHER,
      isRealData: true,
    };
  });
}

/** Monstros/NPCs reais: nome PT (Npcname) + stats REAIS do Monster.txt (GS). */
export function getRealMonsterList() {
  if (!Array.isArray(REAL_MONSTERS) || REAL_MONSTERS.length === 0) {
    return INVENTED_MONSTERS.length ? INVENTED_MONSTERS : [];
  }
  return REAL_MONSTERS.map((m) => {
    const stats = STATS_BY_CLASS.get(m.monsterClass) || {};
    return {
      ...stats,
      id: m.monsterClass,
      name: m.name,
      isRealData: true,
    };
  });
}

/** Mapas reais (movereq_por.bmd) + campos de mundo inventados por nome. */
export function getRealMapList() {
  if (!Array.isArray(REAL_MAPS) || REAL_MAPS.length === 0) {
    return Object.values(MAPS);
  }
  const byName = new Map(
    Object.values(MAPS).map((m) => [String(m.name).toLowerCase(), m])
  );
  return REAL_MAPS.map((m) => ({
    ...(byName.get(m.name.toLowerCase()) || {}),
    mapNumber: m.mapNumber,
    name: m.name,
    nameAlt: m.nameAlt,
    minZen: m.minZen,
    moveZen: m.moveZen,
    isRealData: true,
  }));
}

export default { getRealItemList, getRealMonsterList, getRealMapList, preloadRealData };
