// ============================================================
// Mastery.js — Sistema de Mastery + Resets (MU Online web-port)
// Após o level cap (400 normal / 600 master cap), levels master
// concedem pontos para uma árvore universal de bônus.
// Inclui ResetaCommand (reset / reborn) com efeito dourado.
// ============================================================

export const LEVEL_CAP = 600;          // nível máximo base do personagem
export const REBORN_LEVEL_REQ = 400;   // nível mínimo para resetar (reborn)

// ------------------------------------------------------------
// Árvore de bônus universal — cada node define custo e efeito
// por ponto investido.
// ------------------------------------------------------------
export const MASTERY_TREE = {
  vitality: {
    id: 'vitality', label: 'Vitalidade', icon: '❤',
    desc: '+50 HP por ponto',
    maxRank: 100, costPerRank: 1,
    effect: { hp: 50 },
  },
  power: {
    id: 'power', label: 'Poder', icon: '⚔',
    desc: '+3 dano por ponto',
    maxRank: 100, costPerRank: 1,
    effect: { damage: 3 },
  },
  defense: {
    id: 'defense', label: 'Defesa', icon: '🛡',
    desc: '+3 defesa por ponto',
    maxRank: 100, costPerRank: 1,
    effect: { defense: 3 },
  },
  expBoost: {
    id: 'expBoost', label: 'Saber Ancião', icon: '📜',
    desc: '+1% EXP por ponto',
    maxRank: 50, costPerRank: 1,
    effect: { expBonus: 0.01 },
  },
};

export class MasterySystem {
  constructor() {
    /** id do node -> rank atual */
    this.ranks = Object.fromEntries(Object.keys(MASTERY_TREE).map((k) => [k, 0]));
  }

  /**
   * Converte um nível de personagem em nível master e pontos acumulados.
   * @returns {{masterLevel:number, points:number}}
   */
  static masterLevelOf(level, rebornCount = 0) {
    const masterLevel = Math.max(0, Math.min(level, LEVEL_CAP) - (LEVEL_CAP - REBORN_LEVEL_REQ)) +
      (level >= LEVEL_CAP ? level - LEVEL_CAP : 0);
    // Regra: após o cap 600, cada nível master = 1 ponto; reborns dão +1 ponto fixo cada.
    const points = Math.max(0, level - LEVEL_CAP) + rebornCount;
    return { masterLevel, points };
  }

  /** Investi 1 ponto num node. @returns {boolean} sucesso */
  addPoint(nodeId) {
    const node = MASTERY_TREE[nodeId];
    if (!node) throw new Error(`Node de mastery desconhecido: ${nodeId}`);
    if (this.ranks[nodeId] >= node.maxRank) return false;
    this.ranks[nodeId] += node.costPerRank;
    return true;
  }

  /** Totais de bônus concedidos pela árvore. */
  get bonuses() {
    const total = { hp: 0, damage: 0, defense: 0, expBonus: 0 };
    for (const [id, rank] of Object.entries(this.ranks)) {
      const eff = MASTERY_TREE[id].effect;
      for (const [k, v] of Object.entries(eff)) total[k] = (total[k] ?? 0) + v * rank;
    }
    return total;
  }

  /** Aplica os bônus a um objeto de stats do personagem (in-place). */
  applyTo(stats) {
    const b = this.bonuses;
    stats.maxHp = (stats.maxHp ?? 0) + b.hp;
    stats.damage = (stats.damage ?? 0) + b.damage;
    stats.defense = (stats.defense ?? 0) + b.defense;
    stats.expMultiplier = (stats.expMultiplier ?? 1) * (1 + b.expBonus);
    return stats;
  }

  /** Ranking de acerto exigido pelo servidor (nível master mínimo p/ equipar). */
  static requiredMasterLevel(itemLevel) {
    return Math.max(0, itemLevel - LEVEL_CAP + 1);
  }

  /** Serialização. */
  toJSON() { return { ranks: { ...this.ranks } }; }
  static fromJSON(json) {
    const m = new MasterySystem();
    if (json && json.ranks) for (const [k, v] of Object.entries(json.ranks)) m.ranks[k] = v | 0;
    return m;
  }
}

// ------------------------------------------------------------
// ResetaCommand — mimica o /reset do cliente: exige LEVEL≥400,
// volta ao nível 1, soma rebornCount e toca efeito dourado.
// ------------------------------------------------------------
export const RESETA_COMMAND = '/reset';

export class ResetaCommand {
  /**
   * @param {{ chat?: (msg:string)=>void, playEffect?: (kind:string)=>void }} [hooks]
   *   chat: escreve no chat do HUD; playEffect: recebe 'reborn' p/ FX/som dourado.
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.command = RESETA_COMMAND;
  }

  /**
   * Tenta executar o reset no personagem.
   * char deve ter: { name, level, rebornCount, stats:{ str,agi,vit,ene,cmd? } }
   * @returns {{ok:boolean, message:string}}
   */
  execute(char) {
    if (!char || typeof char.level !== 'number') {
      return { ok: false, message: 'Personagem inválido.' };
    }
    if (char.level < REBORN_LEVEL_REQ) {
      return {
        ok: false,
        message: `[Reseta] Requer nível ${REBORN_LEVEL_REQ}+ (atual: ${char.level}).`,
      };
    }

    // Stats voltam ao total de base do level 1 (restam só os pontos iniciais)
    const BASE = { str: 18, agi: 18, vit: 15, ene: 15, cmd: 0 };
    char.stats = { ...BASE };
    char.level = 1;
    char.rebornCount = (char.rebornCount ?? 0) + 1;

    // Som / flash dourado
    this.hooks.chat?.(
      `✨ [Reseta] ${char.name} renasceu! Reset #${char.rebornCount} — nível 1, stats restaurados.`,
    );
    this.hooks.playEffect?.('reborn');

    return { ok: true, message: 'Reset concluído.' };
  }

  /** Registra o comando num parser de chat tipo (cmd, payload) => bool. */
  register(chatSystem) {
    chatSystem.onCommand?.(RESETA_COMMAND, (char) => this.execute(char));
  }
}

/** Caracterizador do efeito visual dourado de reborn (para o Effects engine). */
export const REBORN_EFFECT = {
  kind: 'reborn',
  color: 0xffd700,       // dourado
  particles: 120,
  duration: 2.5,          // segundos
  radius: 1.6,
  /**
   * Cria um pequeno shader/gradiente-FX puro em canvas 2D como fallback
   * quando o motor de partículas Three.js não está carregado.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} t tempo 0..1
   */
  drawFallback(ctx, t, cx, cy) {
    const alpha = Math.sin(Math.PI * t);
    const r = 40 + 140 * t;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,215,0,${0.9 * alpha})`);
    g.addColorStop(0.5, `rgba(255,200,64,${0.45 * alpha})`);
    g.addColorStop(1, 'rgba(255,200,64,0)');
    ctx.save();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
};

export default { MasterySystem, MASTERY_TREE, ResetaCommand, REBORN_EFFECT, LEVEL_CAP, REBORN_LEVEL_REQ, RESETA_COMMAND };
