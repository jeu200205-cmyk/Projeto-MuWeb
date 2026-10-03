// social/Party.js — Party estilo MU Online: max 5 membros, bônus de EXP
// fiel ao original (3 => +10%, 4 => +15%, 5 => +20%), shareBuff com range,
// serialização e PartyWindow (hotkey 'p') com HP bar, kick e promote.
import { MUWindow } from '../ui2/MUWindow.js';

const EXP_BONUS = { 3: 0.10, 4: 0.15, 5: 0.20 }; // fiel ao MU

export class Party {
  /** @param {string|null} leaderName */
  constructor(leaderName = null) {
    this.leaderName = leaderName;
    this.members = []; // [{ name, level, hp, maxHp, char? }]
    this.maxSize = 5;
    this._listeners = {};
    if (leaderName) this.members.push({ name: leaderName, level: 1, hp: 100, maxHp: 100 });
  }

  on(event, fn) { (this._listeners[event] = this._listeners[event] || []).push(fn); return () => this.off(event, fn); }
  off(event, fn) { const l = this._listeners[event]; if (l) this._listeners[event] = l.filter((f) => f !== fn); }
  emit(event, data) { for (const fn of (this._listeners[event] || []).slice()) fn(data); }

  /** @param {string|object} member nome ou { name, level, hp, maxHp, char } */
  addMember(member) {
    if (this.members.length >= this.maxSize) return false;
    const name = typeof member === 'string' ? member : member && member.name;
    if (!name || this.members.some((m) => m.name === name)) return false;
    this.members.push(typeof member === 'string'
      ? { name, level: 1, hp: 100, maxHp: 100 }
      : { name, level: member.level || 1, hp: member.hp ?? 100, maxHp: member.maxHp ?? 100, char: member.char || null });
    if (!this.leaderName) this.leaderName = this.members[0].name;
    this.emit('change', { type: 'join', name });
    return true;
  }

  removeMember(name) {
    const idx = this.members.findIndex((m) => m.name === name);
    if (idx === -1) return false;
    this.members.splice(idx, 1);
    if (this.leaderName === name) this.leaderName = this.members.length ? this.members[0].name : null;
    this.emit('change', { type: 'leave', name });
    return true;
  }

  promote(name) {
    if (!this.members.some((m) => m.name === name)) return false;
    this.leaderName = name;
    this.emit('change', { type: 'promote', name });
    return true;
  }

  isLeader(name) { return this.leaderName === name; }
  get size() { return this.members.length; }

  /** Multiplicador de EXP: 1.0 (solo/duo), 1.10, 1.15, 1.20 conforme tamanho. */
  getExpBonus() {
    return 1 + (EXP_BONUS[this.members.length] || 0);
  }

  updateMember(name, patch) {
    const m = this.members.find((mm) => mm.name === name);
    if (!m) return false;
    Object.assign(m, patch);
    this.emit('change', { type: 'update', name });
    return true;
  }

  /**
   * Aplica buffDef a todos os membros em range de `center` ({x,y,map}).
   * Sem center, aplica a todos. Retorna lista de nomes afetados.
   */
  shareBuff(buffDef, center = null, range = 6) {
    const applied = [];
    for (const m of this.members) {
      if (center && m.char && center.map != null && m.char.map === center.map) {
        const dx = m.char.x - center.x, dy = m.char.y - center.y;
        if (Math.hypot(dx, dy) > range) continue;
      }
      if (m.char && typeof m.char.applyBuff === 'function') m.char.applyBuff(buffDef);
      applied.push(m.name);
    }
    this.emit('buff', { buff: buffDef, applied });
    return applied;
  }

  serialize() {
    return {
      leaderName: this.leaderName,
      maxSize: this.maxSize,
      members: this.members.map(({ name, level, hp, maxHp }) => ({ name, level, hp, maxHp })),
    };
  }

  static deserialize(data) {
    const p = new Party(null);
    if (!data) return p;
    p.leaderName = data.leaderName || null;
    p.maxSize = data.maxSize || 5;
    p.members = (data.members || []).map((m) => ({ name: m.name, level: m.level || 1, hp: m.hp ?? 100, maxHp: m.maxHp ?? 100 }));
    return p;
  }
}

export class PartyWindow extends MUWindow {
  /** @param {Party} party @param {string} selfName nome do jogador local */
  constructor(party, selfName, opts = {}) {
    super({ title: 'Party', width: 250, hotkey: 'p', x: 60, y: 120, ...opts });
    this.party = party;
    this.selfName = selfName;
    this.list = document.createElement('div');
    this.list.className = 'mu-scrollbar';
    this.list.style.cssText = 'max-height:220px;overflow-y:auto;';
    this.body.appendChild(this.list);
    party.on('change', () => this.render());
    this.render();
  }

  render() {
    this.list.innerHTML = '';
    const bonus = Math.round((this.party.getExpBonus() - 1) * 100);
    this.setTitle(`Party ${this.party.size}/${this.party.maxSize} (+${bonus}% EXP)`);
    const amLeader = this.party.isLeader(this.selfName);

    for (const m of this.party.members) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:6px;padding:3px;border:1px solid #4a3a1a;border-radius:3px;';

      const top = document.createElement('div');
      top.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
      const label = document.createElement('span');
      label.textContent = `${m.name} Lv.${m.level}`;
      if (this.party.isLeader(m.name)) { label.textContent = '★ ' + label.textContent; label.style.color = '#f0d98c'; }
      top.appendChild(label);

      if (amLeader && m.name !== this.selfName) {
        const btns = document.createElement('span');
        const kick = document.createElement('span');
        kick.className = 'mu-btn'; kick.textContent = 'Kick';
        kick.onclick = () => this.party.removeMember(m.name);
        const prom = document.createElement('span');
        prom.className = 'mu-btn'; prom.textContent = 'Promote';
        prom.onclick = () => this.party.promote(m.name);
        btns.append(kick, prom);
        top.appendChild(btns);
      }
      row.appendChild(top);

      // HP bar
      const barBg = document.createElement('div');
      barBg.style.cssText = 'height:8px;background:#1a0a0a;border:1px solid #5a2a2a;border-radius:2px;margin-top:3px;';
      const bar = document.createElement('div');
      const pct = m.maxHp > 0 ? Math.max(0, Math.min(1, m.hp / m.maxHp)) : 0;
      bar.style.cssText = `height:100%;width:${(pct * 100).toFixed(0)}%;background:linear-gradient(180deg,#c33,#7a1111);`;
      barBg.appendChild(bar);
      row.appendChild(barBg);

      this.list.appendChild(row);
    }
    if (!this.party.members.length) this.list.textContent = 'Sem party.';
  }

  show() { super.show(); this.render(); }
}

export default Party;
