// ============================================================
// Awakening.js — Sistema de Despertar de itens (MU Online)
// Item com level >= 13 pode "despertar" numa versão
// "Awakened X +Y": +30% em todos os stats, glow adicional.
// Chance baixa; falha conserva o item (sem destruição).
// ============================================================

export const AWAKEN_MIN_LEVEL = 13;
export const AWAKEN_STAT_BONUS = 0.30;         // +30% nos stats do item
export const AWAKEN_BASE_CHANCE = 0.05;        // 5% base

/** Glow característico do estado Awakened (roxo-violeta incandescente). */
export const AWAKEN_GLOW = {
  color: 0x9b30ff,
  intensity: 1.6,
  pulseSpeed: 2.2, // Hz
};

/**
 * Calcula a chance de despertar.
 * level 13 → ~8%, cada nível a mais dá +1%, cap em 25%. Jewel bonus soma.
 */
export function awakenChance(item, opts = {}) {
  if ((item.level ?? 0) < AWAKEN_MIN_LEVEL) return 0;
  let chance = AWAKEN_BASE_CHANCE + (item.level - AWAKEN_MIN_LEVEL) * 0.01;
  if (opts.soulOfBless) chance += 0.10;                     // Soul of Bless: +10%
  if (typeof opts.luck === 'boolean' && opts.luck) chance += 0.05;
  return Math.min(chance, opts.cap ?? 0.25);
}

/**
 * Tenta despertar um item. NÃO muta o objeto passado em caso de falha.
 * @param {{name:string, level:number, stats?:object, options?:object}} item
 * @param {{rng?:()=>number}} [opts]
 * @returns {{success:boolean, chance:number, item:object}} novo item (awakened ou original).
 */
export function awaken(item, opts = {}) {
  const rng = opts.rng ?? Math.random;
  const chance = awakenChance(item, opts);
  if (chance <= 0) {
    return { success: false, chance: 0, item, reason: 'Item abaixo do level mínimo (13).' };
  }
  if (item.awakened) {
    return { success: false, chance, item, reason: 'Item já está desperto.' };
  }

  if (rng() < chance) {
    const awakenedItem = applyAwaken(item);
    return { success: true, chance, item: awakenedItem };
  }
  return { success: false, chance, item, reason: 'Falha — o item foi conservado.' };
}

/** Aplica a transformação Awakened: +30% nos stats, nome e glow. */
export function applyAwaken(item) {
  const boostedStats = {};
  for (const [k, v] of Object.entries(item.stats ?? {})) {
    boostedStats[k] = typeof v === 'number' ? Math.round(v * (1 + AWAKEN_STAT_BONUS) * 100) / 100 : v;
  }
  return {
    ...item,
    name: item.awakened ? item.name : `Awakened ${item.name} +${item.level}`,
    level: item.level,
    awakened: true,
    stats: boostedStats,
    glow: { ...AWAKEN_GLOW },
  };
}

/** Remove o despertar (ferramenta de GM / rollback). */
export function cleanse(item) {
  if (!item.awakened) return item;
  const reverted = { ...item, awakened: false, glow: null };
  reverted.name = item.name.replace(/^Awakened /, '').replace(/ \+\d+$/, ` +${item.level}`);
  const baseStats = {};
  for (const [k, v] of Object.entries(item.stats ?? {})) {
    baseStats[k] = typeof v === 'number' ? v / (1 + AWAKEN_STAT_BONUS) : v;
  }
  reverted.stats = baseStats;
  return reverted;
}

/** Sistema de inventário em nível de conta com log de awakenings. */
export class AwakeningSystem {
  constructor(hooks = {}) {
    this.hooks = hooks;               // { chat?, playEffect? }
    this.history = [];
  }

  /** Executa um despertar sobre um índice do inventário. */
  awakenSlot(inventory, slotIndex, opts = {}) {
    const item = inventory[slotIndex];
    if (!item) return { success: false, reason: 'Slot vazio.' };
    const result = awaken(item, opts);
    if (result.success) {
      inventory[slotIndex] = result.item;
      this.history.push({ at: Date.now(), item: result.item.name, chance: result.chance });
      this.hooks.chat?.(`🌟 Despertado! ${result.item.name} (${(result.chance * 100).toFixed(1)}%)`);
      this.hooks.playEffect?.('awaken');
    } else {
      this.hooks.chat?.(`💨 Falha no despertar (${(result.chance * 100).toFixed(1)}%) — item conservado.`);
    }
    return result;
  }

  /** Estatísticas da conta. */
  stats() {
    return {
      totalSuccesses: this.history.length,
      last: this.history[this.history.length - 1] ?? null,
    };
  }
}

export default {
  AwakeningSystem, awaken, awakenChance, applyAwaken, cleanse,
  AWAKEN_MIN_LEVEL, AWAKEN_STAT_BONUS, AWAKEN_BASE_CHANCE, AWAKEN_GLOW,
};
