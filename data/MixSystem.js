// MixSystem.js — Chaos Machine (MixMgr) estilo MU Online
import { Item } from './Item.js';
import { ITEM_TYPES, getItemDefByName } from './ItemTypes.js';

const JEWEL = (name) => getItemDefByName(name).typeId;

// ------------------------------------------------------------------
// Receitas da Chaos Machine.
// requires: [{ typeId, count, match: (item)=>bool }]
// chance: 0..1 (ou função (items) => chance)
// result: (items) => Item | 'upgrade' | null
// zen: custo em zen
// ------------------------------------------------------------------
export const MIX_RECIPES = [
  {
    id: 'chaos_legendary',
    name: 'Mix: Item +10 (Chaos + Bless + Soul)',
    zen: 1000000,
    requires: [
      { typeId: JEWEL('Jewel of Chaos'), count: 1 },
      { typeId: JEWEL('Jewel of Bless'), count: 1 },
      { typeId: JEWEL('Jewel of Soul'), count: 1 },
      { match: (i) => [ITEM_TYPES.WEAPON, ITEM_TYPES.ARMOR, ITEM_TYPES.HELM,
                       ITEM_TYPES.PANTS, ITEM_TYPES.GLOVES, ITEM_TYPES.BOOTS,
                       ITEM_TYPES.SHIELD].includes(i.type) && i.level <= 9,
        count: 1, target: true },
    ],
    chance: (items) => Math.min(0.85, 0.5 + items.find((i) => !isJewel(i)).level * 0.04),
    result: (items) => {
      const t = items.find((i) => !isJewel(i)).clone();
      t.level = Math.min(13, t.level + 1);
      return t;
    },
  },
  {
    id: 'bless_upgrade',
    name: 'Jewel of Bless (upgrade 100%)',
    zen: 0,
    requires: [
      { typeId: JEWEL('Jewel of Bless'), count: 1 },
      { match: (i) => i.level < 6 && !isJewel(i) && i.type !== ITEM_TYPES.POTION, count: 1, target: true },
    ],
    chance: 1.0,
    result: (items) => {
      const t = items.find((i) => !isJewel(i)).clone();
      t.level = Math.min(6, t.level + 1);
      return t;
    },
  },
  {
    id: 'soul_upgrade',
    name: 'Jewel of Soul (upgrade com risco)',
    zen: 0,
    requires: [
      { typeId: JEWEL('Jewel of Soul'), count: 1 },
      { match: (i) => !isJewel(i) && i.type !== ITEM_TYPES.POTION && i.level < 13, count: 1, target: true },
    ],
    // level <7: 70% sobe; >=7: 50% sobe, falha zera level (MU clássico)
    chance: (items) => { const t = items.find((i) => !isJewel(i)); return t.level < 7 ? 0.7 : 0.5; },
    luckBonus: 0.2,
    result: (items) => {
      const t = items.find((i) => !isJewel(i)).clone();
      t.level = Math.min(13, t.level + 1);
      return t;
    },
    onFail: (items) => {
      const t = items.find((i) => !isJewel(i)).clone();
      t.level = t.level < 7 ? Math.max(0, t.level - 1) : 0;
      return t; // falha parcial: item volta degradado
    },
  },
  {
    id: 'life_add_option',
    name: 'Jewel of Life (opção adicional +4%)',
    zen: 0,
    requires: [
      { typeId: JEWEL('Jewel of Life'), count: 1 },
      { match: (i) => !isJewel(i) && !i._lifeOpts, count: 1, target: true },
    ],
    chance: 0.5,
    result: (items) => {
      const t = items.find((i) => !isJewel(i)).clone();
      t.extraHp = (t.extraHp || 0) + 4;
      t._lifeOpts = (t._lifeOpts || 0) + 1;
      return t;
    },
  },
  {
    id: 'craft_chaos_card',
    name: '3x Jewel of Chaos → Box of Kundun +1',
    zen: 500000,
    requires: [{ typeId: JEWEL('Jewel of Chaos'), count: 3 }],
    chance: 0.9,
    result: () => null, // retorna token via resultItem
    resultItem: { name: 'Box of Kundun +1', icon: '📦', price: 2500000 },
  },
  {
    id: 'craft_excellent',
    name: 'Item +9 +4opt + Chaos → Excellent (gamble)',
    zen: 2000000,
    requires: [
      { typeId: JEWEL('Jewel of Chaos'), count: 1 },
      { typeId: JEWEL('Jewel of Creation'), count: 1 },
      { match: (i) => i.level >= 9 && !isJewel(i)
          && [ITEM_TYPES.WEAPON, ITEM_TYPES.ARMOR].includes(i.type), count: 1, target: true },
    ],
    chance: 0.35,
    result: (items) => {
      const t = items.find((i) => !isJewel(i)).clone();
      const pool = ['Increase Damage +2%', 'Increase Defense +2%',
                    'Excellent Damage Rate +10%', 'Increase Max HP +4%'];
      t.excellent = [pool[Math.floor(Math.random() * pool.length)]];
      return t;
    },
  },
];

function isJewel(item) {
  return item.type === ITEM_TYPES.OTHER && item.name.startsWith('Jewel');
}

// ------------------------------------------------------------------
export class MixSystem {
  /**
   * Executa um mix.
   * @param {string} recipeId
   * @param {Item[]} items — itens colocados na chaos machine
   * @param {number} zen — zen disponível do jogador
   * @returns {{success:boolean, result:Item|object|null, consumedItems:Item[],
   *            zenCost:number, reason?:string}}
   */
  mix(recipeId, items, zen = Infinity) {
    const recipe = MIX_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return this._fail('recipe-not-found');
    if (!Array.isArray(items) || items.length === 0) return this._fail('no-items');
    if (zen < recipe.zen) return this._fail('not-enough-zen', { zenCost: recipe.zen });

    // Valida requisitos: cada entrada `requires` precisa casar com itens distintos
    const used = new Set();
    const matched = [];
    for (const req of recipe.requires) {
      let remaining = req.count;
      for (const item of items) {
        if (remaining <= 0) break;
        if (used.has(item)) continue;
        // Para stacks: conta quantidade
        if (req.typeId != null && item.typeId !== req.typeId) continue;
        if (req.match && !req.match(item)) continue;
        const avail = item.isStackable ? item.quantity : 1;
        if (avail < 1) continue;
        used.add(item);
        matched.push({ req, item, take: Math.min(avail, remaining) });
        remaining -= Math.min(avail, remaining);
      }
      if (remaining > 0) return this._fail('missing-requirement', { zenCost: 0 });
    }

    // Rolagem
    let chance = typeof recipe.chance === 'function' ? recipe.chance(items) : recipe.chance;
    const target = items.find((i) => !isJewel(i) && recipe.requires.some((r) => r.target && (r.typeId == null || r.typeId === i.typeId)));
    if (target && target.luck && recipe.luckBonus) chance += recipe.luckBonus;
    const roll = Math.random();
    const success = roll < chance;

    // Consumo
    const consumedItems = [];
    for (const m of matched) {
      if (m.item.isStackable && m.item.quantity > m.take) {
        const split = m.item.clone();
        split.quantity = m.take;
        m.item.quantity -= m.take; // resto não é consumido
        consumedItems.push(split);
      } else {
        consumedItems.push(m.item);
      }
    }

    let result = null;
    if (success) {
      result = recipe.result ? recipe.result(items) : (recipe.resultItem || null);
    } else if (recipe.onFail) {
      result = recipe.onFail(items);
    }

    return { success, result, consumedItems, zenCost: recipe.zen, roll, chance };
  }

  _fail(reason, extra = {}) {
    return { success: false, result: null, consumedItems: [], zenCost: 0, reason, ...extra };
  }

  /** Lista receitas disponíveis para um conjunto de itens */
  availableRecipes(items, zen = Infinity) {
    return MIX_RECIPES.map((r) => {
      const probe = this._probe(r, items, zen);
      return { id: r.id, name: r.name, zen: r.zen, ok: probe };
    });
  }

  _probe(recipe, items, zen) {
    if (zen < recipe.zen) return false;
    const used = new Set();
    for (const req of recipe.requires) {
      let remaining = req.count;
      for (const item of items) {
        if (remaining <= 0) break;
        if (used.has(item)) continue;
        if (req.typeId != null && item.typeId !== req.typeId) continue;
        if (req.match && !req.match(item)) continue;
        const avail = item.isStackable ? item.quantity : 1;
        used.add(item);
        remaining -= Math.min(avail, remaining);
      }
      if (remaining > 0) return false;
    }
    return true;
  }
}

export const mixSystem = new MixSystem();
export default mixSystem;
