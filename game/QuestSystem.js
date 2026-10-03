// QuestSystem.js — Sistema de quests estilo MU: objetivos, progresso, recompensas
// e janela de quests (tecla Q) baseada em MUWindow.
import { MUWindow } from '../ui2/MUWindow.js';
import { Sound } from '../audio/SoundManager.js';

// ---------------------------------------------------------------------------
// Banco estático de quests
// ---------------------------------------------------------------------------
export const QUEST_DB = [
  {
    id: 'q_kill_spiders',
    name: 'Mate 10 Spiders',
    description: 'Elimine 10 Spiders que infestam os arredores de Lorencia.',
    objectives: [{ type: 'kill', target: 'Spider', count: 10, current: 0 }],
    rewards: { exp: 500, zen: 2000 },
    reqLevel: 1,
  },
  {
    id: 'q_collect_jewels',
    name: 'Colete 5 jewels',
    description: 'Reúna 5 joias quaisquer (Bless, Soul, Chaos...) para o comerciante.',
    objectives: [{ type: 'collect', target: 'jewel', count: 5, current: 0 }],
    rewards: { exp: 1500, zen: 10000, item: 'Jewel of Chaos' },
    reqLevel: 1,
  },
  {
    id: 'q_talk_npc',
    name: 'Fale com o NPC X',
    description: 'Procure o NPC X na praça de Lorencia e converse com ele.',
    objectives: [{ type: 'talk', target: 'NPC X', count: 1, current: 0 }],
    rewards: { exp: 250, zen: 500 },
    reqLevel: 1,
  },
  {
    id: 'q_level_10',
    name: 'Chegue ao nível 10',
    description: 'Treine até alcançar o nível 10.',
    objectives: [{ type: 'level', target: null, count: 10, current: 0 }],
    rewards: { exp: 0, zen: 5000, item: 'Small Healing Potion' },
    reqLevel: 1,
  },
  {
    id: 'q_kill_boss',
    name: 'Derrote o Boss',
    description: 'Derrote o Boss que ameaça a região. Vá preparado.',
    objectives: [{ type: 'kill', target: 'Boss', count: 1, current: 0 }],
    rewards: { exp: 10000, zen: 50000, item: 'Jewel of Bless' },
    reqLevel: 8,
  },
];

// ---------------------------------------------------------------------------
// QuestManager
// ---------------------------------------------------------------------------
/**
 * Eventos via on():
 *  - 'progress'  → { quest, objective }
 *  - 'complete'  → { quest }
 *  - 'accept'    → { quest }
 *  - 'reward'    → { quest, rewards }
 */
export class QuestManager {
  constructor() {
    this.quests = new Map(); // id -> quest instance
    this._listeners = {};
  }

  on(event, fn) {
    (this._listeners[event] = this._listeners[event] || []).push(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    const l = this._listeners[event];
    if (l) this._listeners[event] = l.filter((f) => f !== fn);
  }
  emit(event, data) {
    for (const fn of (this._listeners[event] || []).slice()) fn(data);
  }

  /** Concede uma quest do banco ao jogador. Retorna a instância ou null. */
  accept(idOrDef) {
    const def = typeof idOrDef === 'string'
      ? QUEST_DB.find((q) => q.id === idOrDef)
      : idOrDef;
    if (!def || this.quests.has(def.id)) return null;
    const quest = {
      id: def.id,
      name: def.name,
      description: def.description,
      rewards: { ...def.rewards },
      reqLevel: def.reqLevel || 1,
      state: 'active', // active | complete | claimed
      objectives: def.objectives.map((o) => ({ ...o, current: 0 })),
    };
    this.quests.set(quest.id, quest);
    this.emit('accept', { quest });
    return quest;
  }

  /** Aceita todas as quests cujo reqLevel o player atende. */
  acceptAllForLevel(level) {
    for (const def of QUEST_DB) {
      if ((def.reqLevel || 1) <= level) this.accept(def);
    }
  }

  getQuest(id) { return this.quests.get(id) || null; }
  get activeQuests() { return [...this.quests.values()].filter((q) => q.state === 'active'); }
  get completeQuests() { return [...this.quests.values()].filter((q) => q.state === 'complete'); }

  // ---------- Progresso ----------

  /**
   * Notifica um evento de jogo. Tipos: 'kill' | 'collect' | 'talk' | 'level'.
   * @param {string} type
   * @param {string|null} target — ex.: 'Spider', 'jewel', 'NPC X', null p/ level
   * @param {number} amount — quantidade a somar (default 1)
   */
  notify(type, target = null, amount = 1) {
    for (const quest of this.activeQuests) {
      for (const obj of quest.objectives) {
        if (obj.type !== type) continue;
        if (obj.target && target && obj.target !== target) continue;
        if (type === 'level') {
          obj.current = Math.max(obj.current, amount); // level usa valor absoluto
        } else {
          obj.current = Math.min(obj.count, obj.current + amount);
        }
        this.emit('progress', { quest, objective: obj });
        this._checkComplete(quest);
      }
    }
  }

  /** Atalhos semânticos */
  onKill(monsterName) { this.notify('kill', monsterName, 1); }
  onCollect(target, qty = 1) { this.notify('collect', target, qty); }
  onTalk(npcName) { this.notify('talk', npcName, 1); }
  onLevelUp(level) { this.notify('level', null, level); }

  _checkComplete(quest) {
    if (quest.state !== 'active') return;
    const done = quest.objectives.every((o) => o.current >= o.count);
    if (done) {
      quest.state = 'complete';
      Sound.uiSuccess();
      this.emit('complete', { quest });
    }
  }

  /**
   * Coleta a recompensa de uma quest completa.
   * @param {string} questId
   * @param {object} target — { addExp(n), inventory } — aplica exp/zen/item
   * @returns {object|null} rewards aplicadas ou null
   */
  claimReward(questId, target = {}) {
    const quest = this.quests.get(questId);
    if (!quest || quest.state !== 'complete') return null;
    quest.state = 'claimed';
    const r = quest.rewards;

    if (r.exp && typeof target.addExp === 'function') target.addExp(r.exp);
    if (r.zen && target.inventory) target.inventory.addZen(r.zen);
    if (r.item && target.inventory) {
      const { Item } = target; // permite injeção; fallback abaixo
      // item pode ser nome do ITEM_DB
      const itemInst = typeof target.createItem === 'function'
        ? target.createItem(r.item)
        : null;
      if (itemInst) target.inventory.addItem(itemInst);
    }
    Sound.uiSuccess();
    this.emit('reward', { quest, rewards: r });
    return r;
  }

  serialize() {
    return [...this.quests.values()].map((q) => ({
      id: q.id, state: q.state,
      objectives: q.objectives.map((o) => o.current),
    }));
  }

  deserialize(data) {
    if (!Array.isArray(data)) return;
    for (const saved of data) {
      const def = QUEST_DB.find((q) => q.id === saved.id);
      if (!def) continue;
      const quest = this.accept(def);
      if (!quest) continue;
      quest.state = saved.state || 'active';
      (saved.objectives || []).forEach((v, i) => {
        if (quest.objectives[i]) quest.objectives[i].current = v;
      });
    }
  }
}

// ---------------------------------------------------------------------------
// QuestWindow — janela MU (tecla Q)
// ---------------------------------------------------------------------------
export class QuestWindow extends MUWindow {
  /**
   * @param {QuestManager} questManager
   */
  constructor(questManager) {
    super({ title: 'Quests', width: 320, x: 60, y: 90, hotkey: 'q' });
    this.qm = questManager;
    this.listEl = document.createElement('div');
    this.listEl.className = 'mu-scrollbar';
    this.listEl.style.cssText = 'max-height:320px;overflow-y:auto;';
    this.body.appendChild(this.listEl);

    this._rerender = () => this.render();
    this.qm.on('progress', this._rerender);
    this.qm.on('complete', this._rerender);
    this.qm.on('accept', this._rerender);
    this.qm.on('reward', this._rerender);
    this.render();
  }

  render() {
    this.listEl.innerHTML = '';
    const quests = [...this.qm.quests.values()];
    if (!quests.length) {
      this.listEl.innerHTML =
        '<div style="color:#888;padding:8px">Nenhuma quest ativa.</div>';
      return;
    }
    const order = { active: 0, complete: 1, claimed: 2 };
    quests.sort((a, b) => order[a.state] - order[b.state]);

    for (const q of quests) {
      const card = document.createElement('div');
      card.style.cssText =
        'border:1px solid #4a3a1c;border-radius:3px;margin:4px 0;padding:6px;background:rgba(30,24,12,0.6)';

      const titleColor = q.state === 'complete' ? '#55ff88'
        : q.state === 'claimed' ? '#888' : '#f0d98c';
      const badge = q.state === 'complete' ? ' ✔' : q.state === 'claimed' ? ' (recompensa coletada)' : '';
      card.innerHTML = `<div style="color:${titleColor};font-weight:bold">${q.name}${badge}</div>` +
        `<div style="color:#b0a080;font-size:11px;margin:2px 0">${q.description}</div>`;

      for (const o of q.objectives) {
        const line = document.createElement('div');
        const done = o.current >= o.count;
        line.style.color = done ? '#55ff88' : '#e8dcc0';
        const label = o.target ? `${o.type}: ${o.target}` : o.type;
        line.textContent = `  • ${label} ${o.current}/${o.count}`;
        card.appendChild(line);
      }

      const rw = [];
      if (q.rewards.exp) rw.push(`${q.rewards.exp} exp`);
      if (q.rewards.zen) rw.push(`${q.rewards.zen} zen`);
      if (q.rewards.item) rw.push(q.rewards.item);
      const rwEl = document.createElement('div');
      rwEl.style.cssText = 'color:#c0a040;font-size:11px;margin-top:2px';
      rwEl.textContent = `Recompensa: ${rw.join(' · ') || '—'}`;
      card.appendChild(rwEl);

      if (q.state === 'complete') {
        const btn = document.createElement('div');
        btn.className = 'mu-btn';
        btn.textContent = 'Coletar recompensa';
        btn.addEventListener('click', () => {
          this.qm.emit('claimRequested', { quest: q }); // Game integra com player/inventory
        });
        card.appendChild(btn);
      }
      this.listEl.appendChild(card);
    }
  }

  destroy() {
    this.qm.off('progress', this._rerender);
    this.qm.off('complete', this._rerender);
    this.qm.off('accept', this._rerender);
    this.qm.off('reward', this._rerender);
    super.destroy();
  }
}

export default QuestManager;
