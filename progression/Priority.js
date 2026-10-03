// ============================================================
// Priority.js — Priorização visual de monstros (MU Online)
// - Bosses: glow/aura roxa persistente
// - Filtro por "world rank" (dificuldade mundial por mapa)
// - Top-5 "Most Wanted" boss frame (HUD UI).
// ============================================================

export const BOSS_AURA = {
  color: 0x8a2be2,      // roxa persistente
  intensity: 2.0,
  radius: 2.4,
  pulse: false,         // sempre acesa
};

/** World rank: dificuldade mundial por mapa (quanto maior, mais perigoso). */
export const WORLD_RANKS = {
  lorencia:   { rank: 1, label: 'Novato' },
  noria:      { rank: 1, label: 'Novato' },
  elbeland:   { rank: 2, label: 'Fácil' },
  dungeon:    { rank: 3, label: 'Médio' },
  devias:     { rank: 4, label: 'Médio' },
  atlans:     { rank: 6, label: 'Difícil' },
  tarkan:     { rank: 7, label: 'Difícil' },
  losttower:  { rank: 8, label: 'Avançado' },
  icarus:     { rank: 9, label: 'Elite' },
  karutan:    { rank: 10, label: 'Lendário' },
  crywolf:    { rank: 10, label: 'Lendário' },
};

export function worldRankOf(map) {
  return WORLD_RANKS[(map ?? '').toLowerCase()] ?? { rank: 0, label: 'Desconhecido' };
}

// ------------------------------------------------------------
// Monstro com prioridade calculada
// ------------------------------------------------------------
export class PriorityMonster {
  /**
   * @param {{id:string|number, name:string, level:number, hp:number, maxHp:number,
   *          isBoss?:boolean, map?:string, bounty?:number}} data
   */
  constructor(data) {
    Object.assign(this, data);
    this.isBoss = !!data.isBoss;
    this.worldRank = worldRankOf(data.map);
    this.bounty = data.bounty ?? 0;
  }

  /**
   * Score de prioridade visual: bosses >> mobs, escalado por
   * nível, bounty e dificuldade do mundo.
   */
  get priority() {
    const base = (this.isBoss ? 10000 : 0) + this.level * 10 + this.worldRank.rank * 100;
    return base + this.bounty;
  }

  /** Descritor visual para o renderer (cores, auras, frame). */
  get visual() {
    if (this.isBoss) {
      return {
        aura: { ...BOSS_AURA },
        frame: 'boss',           // frame dorado/roxo no HUD
        showHpBar: true,
        hpColor: '#9b30ff',
        zIndex: 100,
      };
    }
    return { aura: null, frame: 'normal', showHpBar: true, hpColor: '#e74c3c', zIndex: 10 };
  }
}

// ------------------------------------------------------------
// PriorityBoard — ranking + filtro + frame do Top-5
// ------------------------------------------------------------
export class PriorityBoard {
  constructor() {
    /** @type {Map<string|number, PriorityMonster>} */
    this.monsters = new Map();
  }

  upsert(monsterData) { this.monsters.set(monsterData.id, new PriorityMonster(monsterData)); }
  remove(id) { this.monsters.delete(id); }
  clear() { this.monsters.clear(); }

  /**
   * Lista priorizada, com filtro opcional.
   * @param {{ map?: string, minRank?: number, maxRank?: number, bossesOnly?: boolean }} [filter]
   */
  list(filter = {}) {
    let arr = [...this.monsters.values()];
    if (filter.map) {
      const r = worldRankOf(filter.map).rank;
      arr = arr.filter((m) => m.worldRank.rank >= (filter.minRank ?? r));
      if (filter.maxRank != null) arr = arr.filter((m) => m.worldRank.rank <= filter.maxRank);
    }
    if (filter.minRank != null && !filter.map) arr = arr.filter((m) => m.worldRank.rank >= filter.minRank);
    if (filter.maxRank != null) arr = arr.filter((m) => m.worldRank.rank <= filter.maxRank);
    if (filter.bossesOnly) arr = arr.filter((m) => m.isBoss);
    return arr.sort((a, b) => b.priority - a.priority);
  }

  /** Top-N "Most Wanted" (default 5), somente bosses no mapa. */
  topWanted(n = 5, map) {
    return this.list({ bossesOnly: true, map }).slice(0, n).map((m, i) => ({
      rank: i + 1,
      id: m.id, name: m.name, level: m.level, bounty: m.bounty,
      hpPct: m.maxHp ? Math.round((m.hp / m.maxHp) * 100) : 0,
      worldRank: m.worldRank.rank,
      visual: m.visual,
    }));
  }

  /**
   * Renderiza o frame "Top-5 Most Wanted" num container DOM (estilo MU HUD).
   * @param {HTMLElement} container
   */
  renderMostWantedFrame(container, { map, title = '☠ MOST WANTED' } = {}) {
    const top = this.topWanted(5, map);
    container.classList.add('most-wanted-frame');
    container.innerHTML = `
      <div class="mw-title">${title}</div>
      ${top.length === 0 ? '<div class="mw-empty">Nenhum boss ativo</div>' : ''}
      ${top.map((b) => `
        <div class="mw-row" data-id="${b.id}">
          <span class="mw-rank">#${b.rank}</span>
          <span class="mw-name">${b.name}</span>
          <span class="mw-lv">Lv.${b.level}</span>
          <span class="mw-bounty">💰${b.bounty}</span>
          <div class="mw-hp"><div class="mw-hp-fill" style="width:${b.hpPct}%"></div></div>
        </div>`).join('')}
    `;
    return top;
  }
}

/** CSS do frame (injetar uma vez). Exportado como string p/ <style>. */
export const MOST_WANTED_CSS = `
.most-wanted-frame {
  position: absolute; top: 12px; right: 12px; width: 250px;
  background: linear-gradient(160deg, rgba(30,10,50,.92), rgba(10,0,25,.92));
  border: 2px solid #8a2be2; border-radius: 6px; padding: 6px 8px;
  font: 12px 'Trebuchet MS', sans-serif; color: #e8d8ff; z-index: 90;
  box-shadow: 0 0 18px rgba(138,43,226,.55);
}
.mw-title { text-align: center; font-weight: bold; color: #c58bff; letter-spacing: 1px; margin-bottom: 4px; }
.mw-empty { text-align: center; opacity: .6; padding: 6px 0; }
.mw-row { display: grid; grid-template-columns: 28px 1fr auto auto; gap: 4px; align-items: center; padding: 3px 0; border-top: 1px solid rgba(138,43,226,.3); }
.mw-rank { color: #ffd700; font-weight: bold; }
.mw-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mw-lv { opacity: .75; }
.mw-bounty { color: #ffd700; }
.mw-hp { grid-column: 1 / -1; height: 5px; background: #2a0d44; border-radius: 3px; overflow: hidden; }
.mw-hp-fill { height: 100%; background: linear-gradient(90deg, #8a2be2, #e1b7ff); transition: width .3s; }
`;

export default { PriorityMonster, PriorityBoard, worldRankOf, WORLD_RANKS, BOSS_AURA, MOST_WANTED_CSS };
