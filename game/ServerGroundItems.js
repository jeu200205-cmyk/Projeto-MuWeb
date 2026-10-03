import { PACKET_ITEM_LENGTH, copyPacketItem, decodePacketItemType } from '../data/PacketItemCodec.js';

export const WORLD_ITEM_CAPACITY = 1000;
export const PICKUP_PENDING_TIMEOUT_MS = 2200;

/**
 * Retained server-authoritative world-item state.
 * No RNG, no local loot creation and no generic mesh fallback live here.
 */
export class ServerGroundItems {
  constructor(capacity = WORLD_ITEM_CAPACITY) {
    this.capacity = capacity;
    this.items = new Array(capacity).fill(null);
    this.count = 0;
    this._serial = 0;
    this.pendingPickup = null; // { key, runtimeSerial, startedAt }
  }

  reset() {
    this.items.fill(null);
    this.count = 0;
    this.pendingPickup = null;
  }

  _slotForWireKey(wireKey) {
    let key = wireKey & 0x7FFF;
    // Desktop guard retained by the audited mobile port: invalid key aliases 0.
    if (key < 0 || key >= this.capacity) key = 0;
    return key;
  }

  applyCreate({ items = [] } = {}, now = Date.now()) {
    let accepted = 0;
    for (const entry of items) {
      const wireKey = entry.wireKey & 0xFFFF;
      const key = this._slotForWireKey(wireKey);
      const raw = copyPacketItem(entry.item);
      if (!raw) continue;
      const itemType = decodePacketItemType(raw);
      const wasActive = !!this.items[key];
      const runtimeSerial = (++this._serial) || (++this._serial);
      // 0x1FFF is the retained invalid sentinel in the audited implementation.
      if (itemType < 0 || itemType === 0x1FFF) {
        if (wasActive) { this.items[key] = null; this.count = Math.max(0, this.count - 1); }
        continue;
      }
      this.items[key] = {
        key,
        wireKey,
        createFlag: (wireKey & 0x8000) !== 0,
        x: entry.x & 0xFF,
        y: entry.y & 0xFF,
        item: raw,
        itemType,
        runtimeSerial,
        createdAt: now,
      };
      if (!wasActive) this.count++;
      accepted++;
    }
    return accepted;
  }

  applyDelete({ keys = [] } = {}) {
    let removed = 0;
    for (const wireKey of keys) {
      const key = this._slotForWireKey(wireKey);
      if (this.items[key]) {
        this.items[key] = null;
        this.count = Math.max(0, this.count - 1);
        removed++;
      }
      if (this.pendingPickup?.key === key) this.pendingPickup = null;
    }
    return removed;
  }

  get(key) {
    return Number.isInteger(key) && key >= 0 && key < this.capacity ? this.items[key] : null;
  }

  beginPickup(key, now = Date.now()) {
    if (!Number.isInteger(key) || key < 0 || key >= this.capacity) return null;
    const item = this.items[key];
    if (!item) return null;
    if (this.pendingPickup) {
      if (now - this.pendingPickup.startedAt <= PICKUP_PENDING_TIMEOUT_MS) return null;
      this.pendingPickup = null;
    }
    this.pendingPickup = { key, runtimeSerial: item.runtimeSerial, startedAt: now };
    return item;
  }

  cancelPickup(key = null) {
    if (!this.pendingPickup) return false;
    if (key != null && this.pendingPickup.key !== key) return false;
    this.pendingPickup = null;
    return true;
  }

  /**
   * Reconcile 0x22 only against the item epoch that generated the request.
   * result=0xFF means rejection; every other result is a server success class.
   */
  reconcileGet({ result } = {}) {
    const pending = this.pendingPickup;
    if (!pending) return { matched: false, removed: false, key: -1 };
    this.pendingPickup = null;
    const live = this.items[pending.key];
    const sameEpoch = !!live && live.runtimeSerial === pending.runtimeSerial;
    let removed = false;
    if ((result & 0xFF) !== 0xFF && sameEpoch) {
      this.items[pending.key] = null;
      this.count = Math.max(0, this.count - 1);
      removed = true;
    }
    return { matched: true, removed, sameEpoch, key: pending.key };
  }
}

export default ServerGroundItems;
