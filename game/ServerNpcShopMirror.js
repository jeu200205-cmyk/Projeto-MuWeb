/**
 * ServerNpcShopMirror.js — authoritative C1:31 NPC shop inventory owner.
 *
 * PC Main 5.2:
 *   COLUMN_SHOP_INVENTORY=8, ROW_SHOP_INVENTORY=15 (120 slots)
 *   ReceiveTradeInventory inserts PRECEIVE_INVENTORY {Index, ItemInfo[12]}
 *   into CNewUINPCShop when INTERFACE_NPCSHOP is visible.
 * No Zen, stock or item mutation is fabricated client-side: buy/sell results
 * remain owned by C1:32/C1:33 from the GameServer.
 */
import { decodeServerItemInfo, serverItemView } from './ServerInventoryMirror.js';

export const NPC_SHOP_WIDTH = 8;
export const NPC_SHOP_HEIGHT = 15;
export const NPC_SHOP_CAPACITY = NPC_SHOP_WIDTH * NPC_SHOP_HEIGHT;

export class ServerNpcShopMirror {
  constructor() {
    this.slots = new Array(NPC_SHOP_CAPACITY).fill(null);
    this.open = false;
    this.revision = 0;
    this.itemAttributes = null;
    this._listeners = new Set();
  }
  onChange(fn) { if (typeof fn !== 'function') return () => {}; this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit(detail={}) { this.revision++; for (const fn of [...this._listeners]) { try { fn({revision:this.revision,...detail}); } catch {} } }
  beginSession() { this.open = true; this._emit({type:'open'}); }
  endSession() { this.open = false; this.slots.fill(null); this._emit({type:'close'}); }
  setItemAttributes(attributes) { if (!(attributes instanceof Map)) return false; this.itemAttributes = new Map(attributes); this._emit({type:'item-attributes'}); return true; }
  _valid(index) { return Number.isInteger(index) && index >= 0 && index < NPC_SHOP_CAPACITY; }
  get(index) { return this._valid(index) ? this.slots[index] : null; }
  getDisplayItem(index) {
    const view = serverItemView(this.get(index), index);
    const attr = view && this.itemAttributes?.get?.(view.itemType);
    if (view && attr) Object.assign(view, attr, {slot:index, type:view.type, itemType:view.itemType, durability:view.durability});
    return view;
  }
  applySnapshot({items,count}={}) {
    if (!Array.isArray(items) || (count !== undefined && count !== items.length)) return false;
    const next = new Array(NPC_SHOP_CAPACITY).fill(null), seen = new Set();
    for (const entry of items) {
      if (!this._valid(entry?.index) || seen.has(entry.index)) return false;
      const decoded = decodeServerItemInfo(entry.item);
      if (!decoded) return false;
      seen.add(entry.index); next[entry.index] = decoded;
    }
    this.slots = next; this.open = true;
    this._emit({type:'snapshot',count:items.length,source:'0x31'});
    return true;
  }
}
export default ServerNpcShopMirror;
