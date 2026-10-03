// Inventory.js — Inventário 8x8 (grid[64]) + equipamento + zen, estilo MU Online
import { Item } from './Item.js';
import { ITEM_TYPES, EQUIP_SLOTS } from './ItemTypes.js';

export const GRID_WIDTH = 8;
export const GRID_HEIGHT = 8;
export const GRID_SIZE = GRID_WIDTH * GRID_HEIGHT; // 64

// Mapeia tipo de item -> slot(s) de equipamento aceitos
const SLOT_FOR_TYPE = {
  [ITEM_TYPES.HELM]:   ['helm'],
  [ITEM_TYPES.ARMOR]:  ['armor'],
  [ITEM_TYPES.PANTS]:  ['pants'],
  [ITEM_TYPES.GLOVES]: ['gloves'],
  [ITEM_TYPES.BOOTS]:  ['boots'],
  [ITEM_TYPES.WINGS]:  ['wings'],
  [ITEM_TYPES.WEAPON]: ['weapon1'],
  [ITEM_TYPES.SHIELD]: ['weapon2'],
  [ITEM_TYPES.RING]:   ['ring1', 'ring2'],
};

export class Inventory {
  constructor() {
    this.grid = new Array(GRID_SIZE).fill(null); // Item | null
    this.equipment = {
      helm: null, armor: null, pants: null, gloves: null, boots: null,
      weapon1: null, weapon2: null, wings: null, ring1: null, ring2: null,
    };
    this.zen = 0;
    this._listeners = {};
  }

  // ---------- EventEmitter simples ----------
  on(event, fn) {
    (this._listeners[event] = this._listeners[event] || []).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const list = this._listeners[event];
    if (list) this._listeners[event] = list.filter((f) => f !== fn);
  }

  emit(event, data) {
    const list = this._listeners[event] || [];
    for (const fn of list.slice()) fn(data);
  }

  _changed(what) { this.emit('change', what); }

  // ---------- Zen ----------
  addZen(amount) {
    this.zen = Math.max(0, this.zen + Math.floor(amount));
    this._changed({ type: 'zen', zen: this.zen });
    return this.zen;
  }

  spendZen(amount) {
    if (amount > this.zen) return false;
    this.zen -= Math.floor(amount);
    this._changed({ type: 'zen', zen: this.zen });
    return true;
  }

  // ---------- Grid ----------
  /** Primeira posição livre no grid 8x8, ou -1 */
  findFreeSlot() {
    return this.grid.findIndex((cell) => cell === null);
  }

  get freeSlots() { return this.grid.filter((c) => c === null).length; }

  /**
   * Adiciona item; empilha quando possível.
   * Retorna o índice do grid onde ficou, ou -1 se não coube.
   */
  addItem(item) {
    if (!(item instanceof Item)) return -1;

    // Empilhamento (poções, joias)
    if (item.isStackable) {
      for (let i = 0; i < GRID_SIZE && item.quantity > 0; i++) {
        const cell = this.grid[i];
        if (cell && cell.isStackable && cell.typeId === item.typeId && cell.level === item.level
            && cell.quantity < cell.stackSize) {
          const move = Math.min(cell.stackSize - cell.quantity, item.quantity);
          cell.quantity += move;
          item.quantity -= move;
        }
      }
      if (item.quantity <= 0) {
        this._changed({ type: 'add' });
        return 0; // totalmente empilhado
      }
    }

    const idx = this.findFreeSlot();
    if (idx === -1) return -1;
    this.grid[idx] = item;
    this._changed({ type: 'add', index: idx, item });
    return idx;
  }

  removeItem(index) {
    if (index < 0 || index >= GRID_SIZE || !this.grid[index]) return null;
    const item = this.grid[index];
    this.grid[index] = null;
    this._changed({ type: 'remove', index });
    return item;
  }

  moveItem(from, to) {
    if (from === to || from < 0 || to < 0 || from >= GRID_SIZE || to >= GRID_SIZE) return false;
    const a = this.grid[from];
    if (!a) return false;
    const b = this.grid[to];
    this.grid[from] = b;
    this.grid[to] = a;
    this._changed({ type: 'move', from, to });
    return true;
  }

  // ---------- Equipamento ----------
  /** O item pode ser equipado num slot? (ou slot omitido = algum slot válido) */
  canEquip(item, slot) {
    if (!(item instanceof Item)) return false;
    const valid = SLOT_FOR_TYPE[item.type];
    if (!valid) return false;
    if (slot == null) return true;
    if (!EQUIP_SLOTS.includes(slot)) return false;
    // weapon2 aceita arma de 1 mão OU escudo
    if (slot === 'weapon2') {
      return item.type === ITEM_TYPES.SHIELD
        || (item.type === ITEM_TYPES.WEAPON && !item.twoHanded);
    }
    return valid.includes(slot);
  }

  /**
   * Equipa um item. `item` pode ser um Item (novo) ou índice do grid.
   * Retorna o item anteriormente no slot (se houver), ou null se falhou.
   */
  equip(itemOrIndex, slot) {
    let item = itemOrIndex;
    let fromIndex = -1;
    if (typeof itemOrIndex === 'number') {
      fromIndex = itemOrIndex;
      item = this.grid[fromIndex];
      if (!item) return null;
    }
    if (!(item instanceof Item)) return null;

    // Slot automático: primeiro válido livre (ou o primeiro válido)
    if (!slot) {
      if (item.type === ITEM_TYPES.SHIELD) slot = 'weapon2';
      else if (item.type === ITEM_TYPES.WEAPON) slot = 'weapon1';
      else if (item.type === ITEM_TYPES.RING) slot = this.equipment.ring1 ? 'ring2' : 'ring1';
      else slot = (SLOT_FOR_TYPE[item.type] || [null])[0];
    }
    if (!this.canEquip(item, slot)) return null;

    // Arma de duas mãos: ocupa weapon1 e impede weapon2
    if (item.twoHanded && slot === 'weapon1' && this.equipment.weapon2) {
      if (this.addItem(this.equipment.weapon2) === -1) return null;
      this.equipment.weapon2 = null;
    }

    if (fromIndex >= 0) this.grid[fromIndex] = null;
    const previous = this.equipment[slot];
    this.equipment[slot] = item;
    if (previous) this.addItem(previous);
    this._changed({ type: 'equip', slot, item });
    return previous;
  }

  /** Desequipa um slot; item volta ao grid. Retorna o item ou null. */
  unequip(slot) {
    if (!EQUIP_SLOTS.includes(slot)) return null;
    const item = this.equipment[slot];
    if (!item) return null;
    if (this.findFreeSlot() === -1) return null; // inventário cheio
    this.equipment[slot] = null;
    this.addItem(item);
    this._changed({ type: 'unequip', slot, item });
    return item;
  }

  // ---------- Stats derivados ----------
  getTotalDefense() {
    let total = 0;
    for (const slot of EQUIP_SLOTS) {
      const item = this.equipment[slot];
      if (item) total += item.getDefense();
    }
    return total;
  }

  /** [min, max] somando armas equipadas */
  getTotalDamage() {
    let min = 0; let max = 0;
    for (const slot of ['weapon1', 'weapon2']) {
      const item = this.equipment[slot];
      if (item) {
        const d = item.getDamage();
        if (d) { min += d[0]; max += d[1]; }
      }
    }
    return [min, max];
  }

  // ---------- Serialização ----------
  serialize() {
    return {
      zen: this.zen,
      grid: this.grid.map((i) => (i ? i.serialize() : null)),
      equipment: Object.fromEntries(
        EQUIP_SLOTS.map((s) => [s, this.equipment[s] ? this.equipment[s].serialize() : null]),
      ),
    };
  }

  static deserialize(data) {
    const inv = new Inventory();
    if (!data) return inv;
    inv.zen = data.zen || 0;
    if (Array.isArray(data.grid)) {
      for (let i = 0; i < Math.min(GRID_SIZE, data.grid.length); i++) {
        inv.grid[i] = Item.deserialize(data.grid[i]);
      }
    }
    if (data.equipment) {
      for (const slot of EQUIP_SLOTS) {
        inv.equipment[slot] = Item.deserialize(data.equipment[slot]);
      }
    }
    return inv;
  }
}

export default Inventory;
