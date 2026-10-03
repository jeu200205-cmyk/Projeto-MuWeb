import { projectInventoryGrid, canPlaceInventoryItem } from './InventoryGrid.js';
import { pcInventoryOverlayMoveAllowed } from './PcInventoryMoveRules.js';
/**
 * ServerInventoryMirror.js — retained authoritative F3:10/F3:14/0x22/0x24/0x28 inventory.
 *
 * PC Main 5.2 layout:
 *   equipment 0..11, grid 12..75 (12 + 8*8).
 * A slot is movable only when its complete ItemInfo[12] came from the server.
 * F3:13 CharSet is presentation-only and is deliberately NOT reconstructed here.
 */
import { PACKET_ITEM_LENGTH, copyPacketItem, decodePacketItemType } from '../data/PacketItemCodec.js';

export const EQUIPMENT_SLOT_COUNT = 12;
export const INVENTORY_GRID_WIDTH = 8;
export const INVENTORY_GRID_HEIGHT = 8;
export const INVENTORY_GRID_COUNT = INVENTORY_GRID_WIDTH * INVENTORY_GRID_HEIGHT;
export const MY_INVENTORY_SLOT_COUNT = EQUIPMENT_SLOT_COUNT + INVENTORY_GRID_COUNT; // 76
export const SERVER_INVENTORY_CAPACITY = 256;

export const EQUIPMENT_SLOT_NAMES = Object.freeze([
  'weaponRight', 'weaponLeft', 'helm', 'armor', 'pants', 'gloves',
  'boots', 'wing', 'helper', 'amulet', 'ringRight', 'ringLeft',
]);

export function decodeServerItemInfo(bytes) {
  if (!isCompleteItemInfo(bytes)) return null;
  const raw = copyPacketItem(bytes);
  if (!raw) return null;
  const itemType = decodePacketItemType(raw);
  if (itemType < 0 || itemType === 0x1FFF) return null;
  const rawLevel = raw[1] & 0xFF;
  return {
    raw,
    itemType,
    rawLevel,
    level: (rawLevel >> 3) & 0x0F,
    durability: raw[2] & 0xFF,
    option1: raw[3] & 0xFF,
    extOption: raw[4] & 0xFF,
    // CNewUIItemMng::CreateItem semantic split used by SendRequestEquipmentItem.
    splitType: (((itemType >> 5) & 0xF0) | (raw[5] & 0x0E)) & 0xFF,
    // CNewUIItemMng::CreateItem exact fields. raw[5] also carries high Type bits,
    // therefore only the documented low option bits are interpreted below.
    option380Byte: raw[5] & 0xFF,
    option380: (raw[5] & 0x08) !== 0,
    periodItem: (raw[5] & 0x02) !== 0,
    expiredPeriod: (raw[5] & 0x04) !== 0,
    harmonyByte: raw[6] & 0xFF,
    harmonyOption: (raw[6] & 0xF0) >> 4,
    harmonyLevel: raw[6] & 0x0F,
    spareBits: raw[6] & 0xFF, // compatibility alias for older callers
    sockets: Uint8Array.from(raw.subarray(7, 12)),
    // Populated only by the exact D2:12 period-item packet. ItemInfo[12]
    // carries period/expired bits but NOT lExpireDate.
    expireTime: 0,
  };
}

function isCompleteItemInfo(bytes) {
  if (!bytes || bytes.length !== PACKET_ITEM_LENGTH) return false;
  for (let i = 0; i < PACKET_ITEM_LENGTH; i++) {
    if (!Number.isInteger(bytes[i]) || bytes[i] < 0 || bytes[i] > 255) return false;
  }
  return true;
}

export function serverItemView(item, slot) {
  if (!item) return null;
  return {
    authoritative: true,
    slot,
    type: item.itemType,       // InventoryWindow real BMD owner expects numeric MU Type
    itemType: item.itemType,
    rawLevel: item.rawLevel,
    level: item.level,
    durability: item.durability,
    name: '',                  // item-name table is not fabricated here
    excellent: [],             // tooltip stage remains separate; raw option bytes retained below
    stackSize: 1,
    quantity: 1,
    price: 0,
    option1: item.option1,
    extOption: item.extOption,
    splitType: item.splitType,
    option380Byte:item.option380Byte, option380:item.option380, periodItem:item.periodItem, expiredPeriod:item.expiredPeriod,
    harmonyByte:item.harmonyByte, harmonyOption:item.harmonyOption, harmonyLevel:item.harmonyLevel,
    spareBits: item.spareBits,
    sockets: Uint8Array.from(item.sockets),
    expireTime: Number(item.expireTime || 0),
    raw: Uint8Array.from(item.raw),
  };
}

export class ServerInventoryMirror {
  constructor(capacity = SERVER_INVENTORY_CAPACITY) {
    this.capacity = capacity;
    this.slots = new Array(capacity).fill(null);
    this.hasSnapshot = false;
    this.zen = 0;
    this.revision = 0;
    this._listeners = new Set();
  }

  onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(detail) {
    this.revision++;
    for (const fn of Array.from(this._listeners)) {
      try { fn({ revision: this.revision, ...detail }); } catch { /* UI listener cannot break protocol */ }
    }
  }

  reset() {
    this.slots.fill(null);
    this.hasSnapshot = false;
    this.zen = 0;
    this._emit({ type: 'reset' });
  }

  setZen(value, { emit = true, source = 'server' } = {}) {
    if (!Number.isFinite(Number(value))) return false;
    const next = Number(value) >>> 0;
    const changed = this.zen !== next;
    this.zen = next;
    if (emit && changed) this._emit({ type: 'zen', zen: next, source });
    return true;
  }

  _validSlot(index) {
    return Number.isInteger(index) && index >= 0 && index < this.capacity;
  }

  get(index) {
    return this._validSlot(index) ? this.slots[index] : null;
  }

  getDisplayItem(index) {
    const view=serverItemView(this.get(index), index);
    const attr=view && this.itemAttributes?.get(view.itemType);
    if(attr) {
      // ITEM_ATTRIBUTE is static presentation/stat metadata. It must never
      // overwrite authoritative wire state such as the inventory slot or the
      // item's current durability. Keep the desktop equip-slot field under a
      // distinct name while preserving packet-owned values.
      const wireSlot=view.slot, currentDurability=view.durability;
      Object.assign(view,attr,{
        type:view.type,itemType:view.itemType,slot:wireSlot,durability:currentDurability,
        equipSlot:Number.isInteger(attr.slot)?attr.slot:-1,
      });
    }
    return view;
  }

  setItem(index, bytes, { emit = true, source = 'server' } = {}) {
    if (!this._validSlot(index) || !isCompleteItemInfo(bytes)) return false;
    const previous=this.slots[index];
    const decoded = decodeServerItemInfo(bytes);
    // ReceiveModifyItem updates ItemInfo but the period timestamp is delivered
    // independently by D2:12. Preserve the already-authoritative timestamp for
    // the same occupied slot until a new period list entry replaces it.
    if(decoded?.periodItem && previous?.periodItem && Number(previous.expireTime)>0)
      decoded.expireTime=Number(previous.expireTime);
    this.slots[index] = decoded;
    if (emit) this._emit({ type: decoded ? 'set' : 'clear', index, source });
    return !!decoded;
  }

  applyPeriodExpire({slot, expireTime} = {}) {
    if(!this._validSlot(slot)) return false;
    const item=this.slots[slot];
    if(!item || !item.periodItem) return false; // PC FindItem/null path is fail-closed
    const t=Number(expireTime);
    if(!Number.isInteger(t) || t<=0) return false;
    item.expireTime=t;
    this._emit({type:'period-expire',index:slot,expireTime:t,source:'D2:12'});
    return true;
  }

  clearItem(index, { emit = true, source = 'server' } = {}) {
    if (!this._validSlot(index)) return false;
    const existed = !!this.slots[index];
    this.slots[index] = null;
    if (emit && existed) this._emit({ type: 'clear', index, source });
    return existed;
  }

  applySnapshot({ items, count } = {}) {
    if (!Array.isArray(items) || items.length > this.capacity) return false;
    if (count !== undefined && (!Number.isInteger(count) || count !== items.length)) return false;
    const next = new Array(this.capacity).fill(null);
    const seen = new Set();
    let accepted = 0;
    for (const entry of items) {
      if (!this._validSlot(entry?.index) || seen.has(entry.index)) return false;
      const decoded = decodeServerItemInfo(entry.item);
      if (!decoded) return false;
      seen.add(entry.index);
      next[entry.index] = decoded;
      accepted++;
    }
    // Publish only after every slot/item has been validated. A failed snapshot
    // must not look like a successful inventory clear to NewUI listeners.
    this.slots = next;
    this.hasSnapshot = true;
    this._emit({ type: 'snapshot', accepted, count: items.length, source: 'F3:10' });
    return accepted;
  }

  applyModify({ index, item } = {}) {
    return this.setItem(index, item, { source: 'F3:14' });
  }

  applyDelete({ index } = {}) {
    return this.clearItem(index, { source: '0x28' });
  }

  applyPickupResult({ failed, slot, item } = {}) {
    if (failed || !Number.isInteger(slot) || !item) return false;
    return this.setItem(slot, item, { source: '0x22' });
  }

  applyDropResult({ result, slot } = {}) {
    if (result !== 1) return false;
    return this.clearItem(slot, { source: '0x23' });
  }

  /**
   * 0x24 success: desktop deletes the picked source and installs the returned
   * complete ItemInfo at response Index. No source mutation occurs on cancel.
   */
  applyMoveResult({ subCode, index, item } = {}, pending = null) {
    if (subCode !== 0 || !this._validSlot(index)) return false;
    const decoded = decodeServerItemInfo(item);
    if (!decoded) return false;
    const matchesPending = pending?.srcType === 0 && pending?.dstType === 0
      && pending.dstIndex === index && this._validSlot(pending.srcIndex);
    if (matchesPending) {
      const old=this.slots[pending.srcIndex];
      if(decoded.periodItem && old?.periodItem && Number(old.expireTime)>0) decoded.expireTime=Number(old.expireTime);
      if (pending.srcIndex !== index) this.clearItem(pending.srcIndex, { emit: false, source: '0x24' });
    }
    this.slots[index] = decoded;
    this._emit({ type: 'move', srcIndex: matchesPending ? pending.srcIndex : null, dstIndex: index, source: '0x24' });
    return true;
  }

  setItemAttributes(attributes) {
    if (!(attributes instanceof Map)) return false;
    this.itemAttributes = new Map(Array.from(attributes, ([type, value]) => [type, Object.freeze({...value})]));
    this._emit({type:'item-attributes'});
    return true;
  }

  getGridProjection() {
    return this.itemAttributes ? projectInventoryGrid(this.slots, this.itemAttributes) : null;
  }

  resolveGridAnchor(index) {
    if (!Number.isInteger(index) || index < 12 || index >= 76) return -1;
    const grid=this.getGridProjection();
    if (!grid?.valid) return index;
    return grid.cells[index-12] >= 0 ? grid.cells[index-12] : index;
  }

  getItemDimensions(itemType = null) {
    const dim = this.itemAttributes?.get?.(itemType);
    if (!dim || !Number.isInteger(dim.width) || !Number.isInteger(dim.height)) return null;
    if (dim.width < 1 || dim.height < 1 || dim.width > 8 || dim.height > 8) return null;
    return { width: dim.width, height: dim.height };
  }

  canPlaceGridItem(itemType, destination, source = -1) {
    if (!this.itemAttributes) return false;
    return canPlaceInventoryItem(this.getGridProjection(), this.itemAttributes, itemType, destination, source);
  }

  findFreeGridSlot(itemType = null) {
    if (this.itemAttributes) {
      const grid=this.getGridProjection();
      for(let i=12;i<76;i++) if(canPlaceInventoryItem(grid,this.itemAttributes,itemType,i)) return i;
      return -1;
    }
    // Legacy anchor-only path retained for callers without a table.
    for (let i=12;i<76;i++) if (!this.slots[i]) return i;
    return -1;
  }

  gridSlotToWire(gridIndex) {
    if (!Number.isInteger(gridIndex) || gridIndex < 0 || gridIndex >= INVENTORY_GRID_COUNT) return -1;
    return EQUIPMENT_SLOT_COUNT + gridIndex;
  }

  wireSlotToGrid(index) {
    if (!Number.isInteger(index) || index < EQUIPMENT_SLOT_COUNT || index >= MY_INVENTORY_SLOT_COUNT) return -1;
    return index - EQUIPMENT_SLOT_COUNT;
  }

  buildMoveData(srcIndex, dstIndex) {
    if (!this._validSlot(srcIndex) || !this._validSlot(dstIndex)) return null;
    // Retained capacity includes other server slots, but this UI ports only
    // equipment 0..11 and the proven personal 8x8 grid 12..75.
    if (srcIndex >= MY_INVENTORY_SLOT_COUNT || dstIndex >= MY_INVENTORY_SLOT_COUNT || srcIndex === dstIndex) return null;
    const item = this.slots[srcIndex];
    if (!item) return null;
    if (this.itemAttributes && dstIndex >= 12) {
      const grid=this.getGridProjection();
      const free=canPlaceInventoryItem(grid,this.itemAttributes,item.itemType,dstIndex,srcIndex);
      if(!free) {
        // Exact PC overlay move: destination is GetTargetLinealPos() (the
        // picked top-left cell), while FindItem(iTargetIndex) resolves a covered
        // cell to its owning ITEM before IsOverlayItem. Keep dstIndex unchanged
        // on the wire; use the coverage anchor only to find the target item.
        // Jewel/Use flows are not 0x24 and remain fail-closed in this lane.
        const targetAnchor=this.resolveGridAnchor(dstIndex);
        const target=this.slots[targetAnchor];
        if(!target || !pcInventoryOverlayMoveAllowed(item,target)) return null;
      }
    }
    return {
      srcType: 0,
      srcIndex,
      itemType: item.raw[0] & 0xFF, // type low byte serialized by desktop
      level: item.rawLevel,
      durability: item.durability,
      option1: item.option1,
      extOption: item.extOption,
      splitType: item.splitType,
      spareBits: item.spareBits,
      socketOptions: Uint8Array.from(item.sockets),
      dstType: 0,
      dstIndex,
    };
  }
}

export default ServerInventoryMirror;
