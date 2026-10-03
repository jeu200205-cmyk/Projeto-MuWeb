// Item.js — Instância de item (shape plano compatível com ITEM_DB)
import { getItemDef, getItemDefByName, ITEM_TYPES } from './ItemTypes.js';

export const EXCELLENT_OPTIONS = [
  'Increase Damage +2%',
  'Increase Damage +Level/20',
  'Excellent Damage Rate +10%',
  'Increase Defense +2%',
  'Increase Max HP +4%',
  'Increase Max Mana +4%',
];

let _uid = 1;

/**
 * Shape plano:
 * { uid, typeId, name, type, level, damageMin, damageMax, defense,
 *   excellent: [], luck, skill, icon, price, stackSize, quantity, durability }
 */
export class Item {
  /**
   * @param {number} typeId — referência a ITEM_DB
   * @param {number} level — 0..13
   * @param {object} opts — { excellent: [], luck, skill, quantity }
   */
  constructor(typeId, level = 0, opts = {}) {
    const defn = getItemDef(typeId);
    if (!defn) throw new Error(`Item inválido: typeId ${typeId}`);

    this.uid = _uid++;
    this.typeId = defn.typeId;
    this.name = defn.name;
    this.type = defn.type;
    this.level = Math.max(0, Math.min(13, level | 0));
    this.damageMin = defn.damageMin;
    this.damageMax = defn.damageMax;
    this.defense = defn.defense;
    this.icon = defn.icon;
    this.price = defn.price;
    this.stackSize = defn.stackSize;
    this.twoHanded = defn.twoHanded || false;
    this.excellent = Array.isArray(opts.excellent) ? opts.excellent.slice(0, 6) : [];
    this.luck = !!opts.luck;
    this.skill = !!opts.skill;
    this.quantity = Math.max(1, Math.min(this.stackSize, (opts.quantity || 1) | 0));
    this.durability = this.maxDurability;
  }

  static fromName(name, level = 0, opts = {}) {
    const defn = getItemDefByName(name);
    if (!defn) return null;
    return new Item(defn.typeId, level, opts);
  }

  get isExcellent() { return this.excellent.length > 0; }
  get isStackable() { return this.stackSize > 1; }
  get maxDurability() { return 40 + this.level * 5; }
  get reqLevel() { return getItemDef(this.typeId).level; }

  getName() {
    const prefix = this.isExcellent ? 'Excellent ' : '';
    const suffix = this.level > 0 ? ` +${this.level}` : '';
    return `${prefix}${this.name}${suffix}`;
  }

  _levelBonus() {
    return this.level * (2 + Math.floor(this.reqLevel / 20));
  }

  /** [min, max] ou null quando não é arma */
  getDamage() {
    if (this.type !== ITEM_TYPES.WEAPON || !this.damageMax) return null;
    const exc = this.excellent.includes('Increase Damage +2%') ? 1.02 : 1;
    const b = this._levelBonus();
    return [
      Math.floor((this.damageMin + b) * exc),
      Math.floor((this.damageMax + b) * exc),
    ];
  }

  getDefense() {
    if (!this.defense) return 0;
    const exc = this.excellent.includes('Increase Defense +2%') ? 1.02 : 1;
    return Math.floor((this.defense + this._levelBonus()) * exc);
  }

  getPrice() {
    let p = this.price * (1 + this.level * 0.5);
    if (this.isExcellent) p *= 10;
    if (this.luck) p *= 1.5;
    return Math.floor(p) * (this.isStackable ? this.quantity : 1);
  }

  getTooltipHTML() {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const lines = [];
    const color = this.isExcellent ? '#33ff66' : (this.level >= 7 ? '#55aaff' : '#ffffff');
    lines.push(`<div style="color:${color};font-weight:bold">${esc(this.getName())}</div>`);
    lines.push(`<div style="color:#888;font-size:11px">${this.type} · req. nível ${this.reqLevel}</div>`);
    const dmg = this.getDamage();
    if (dmg) lines.push(`<div>Dano: <b>${dmg[0]} ~ ${dmg[1]}</b>${this.twoHanded ? ' (2 mãos)' : ''}</div>`);
    const def = this.getDefense();
    if (def) lines.push(`<div>Defesa: <b>${def}</b></div>`);
    if (this.luck) lines.push('<div style="color:#ffd700">☘ Luck (crítico +5%)</div>');
    if (this.skill) lines.push('<div style="color:#66ccff">⚡ Skill habilitada</div>');
    for (const ex of this.excellent) lines.push(`<div style="color:#33ff66">★ ${esc(ex)}</div>`);
    if (this.isStackable) lines.push(`<div>Quantidade: <b>${this.quantity}</b></div>`);
    lines.push(`<div style="color:#888">Durabilidade: ${this.durability}/${this.maxDurability}</div>`);
    lines.push(`<div style="color:#c0a040">${this.getPrice().toLocaleString()} Zen</div>`);
    return `<div class="item-tooltip" style="min-width:180px">${lines.join('')}</div>`;
  }

  clone() {
    const c = new Item(this.typeId, this.level, {
      excellent: this.excellent, luck: this.luck, skill: this.skill, quantity: this.quantity,
    });
    c.durability = this.durability;
    return c;
  }

  serialize() {
    return {
      typeId: this.typeId, level: this.level,
      excellent: [...this.excellent], luck: this.luck, skill: this.skill,
      quantity: this.quantity, durability: this.durability,
    };
  }

  static deserialize(data) {
    if (!data || typeof data.typeId !== 'number' || !getItemDef(data.typeId)) return null;
    const item = new Item(data.typeId, data.level || 0, data);
    if (typeof data.durability === 'number') {
      item.durability = Math.max(0, Math.min(item.maxDurability, data.durability));
    }
    return item;
  }
}

export default Item;
