// Exact, source-owned personal-inventory move rules shared by UI preview and
// 0x24 packet construction. Authority: B101 NewUIInventoryCtrl.cpp
// CNewUIInventoryCtrl::IsOverlayItem. Special jewel/use flows intentionally
// stay out of this module because the PC routes them through SendRequestUse,
// not SendRequestEquipmentItem.

import { isJewelStackType } from '../data/ItemUiLuaConfig.js';

export const PC_MAX_ITEM_INDEX = 512;
export const PC_ITEM_BOW = 4 * PC_MAX_ITEM_INDEX;
export const PC_ITEM_HELPER = 13 * PC_MAX_ITEM_INDEX;
export const PC_ITEM_POTION = 14 * PC_MAX_ITEM_INDEX;

export function pcInventoryOverlayMoveAllowed(source, target) {
  if (!source || !target) return false;
  const s = Number(source.itemType ?? source.type);
  const t = Number(target.itemType ?? target.type);
  if (!Number.isInteger(s) || !Number.isInteger(t) || s !== t) return false;

  const sl = Number.isInteger(source.rawLevel) ? source.rawLevel : ((Number(source.level) || 0) << 3);
  const tl = Number.isInteger(target.rawLevel) ? target.rawLevel : ((Number(target.level) || 0) << 3);
  const sd = Number(source.durability ?? 0);
  const td = Number(target.durability ?? 0);
  const off = s - PC_ITEM_POTION;

  if (s === PC_ITEM_POTION + 7 && sd < 250 && td < 250) return true;
  if (s >= PC_ITEM_POTION && s <= PC_ITEM_POTION + 8 && s !== PC_ITEM_POTION + 7 && sd < 3 && td < 3) return true;
  if (s >= PC_ITEM_POTION + 38 && s <= PC_ITEM_POTION + 40 && sd < 3 && td < 3) return true;
  if ((s === PC_ITEM_BOW + 7 || s === PC_ITEM_BOW + 15) && sl === tl) return true;
  if (s === PC_ITEM_POTION + 29) return true;
  if (s >= PC_ITEM_HELPER + 32 && s <= PC_ITEM_HELPER + 34) return true;
  if (s >= PC_ITEM_POTION + 46 && s <= PC_ITEM_POTION + 50 && sd < 3 && td < 3) return true;
  if ((off === 70 || off === 71 || off === 94 || off === 90 || off === 133) && sd < 50 && td < 50) return true;
  if ([78, 79, 80, 81, 82, 85, 86, 87].includes(off) && sd < 3 && td < 3) return true;
  if (off === 88 && sd < 10 && td < 10) return true;
  if (off === 89 && sd < 30 && td < 30) return true;
  if (off === 100 && sd < 255 && td < 255) return true;
  if (off === 110) return true;
  if (off === 101 && sd < 5 && td < 5) return true;
  if (isJewelStackType(s)) return true;
  return false;
}
