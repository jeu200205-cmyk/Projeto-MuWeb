// Buff system: BuffDatabase definitions + BuffContainer mixed into Character.

export const BuffDatabase = {
  mana_shield: {
    id: 'mana_shield', name: 'Mana Shield', icon: '🛡️', duration: 120, skillId: 40,
    onApply(c) { c._bonus.def += 20; c.calculateStats(); },
    onExpire(c) { c._bonus.def -= 20; c.calculateStats(); },
    absorbFraction: 0.5,
  },
  greater_defense: {
    id: 'greater_defense', name: 'Greater Defense', icon: '🛡', duration: 60, skillId: 26,
    onApply(c) { c._bonus.def += 30; c.calculateStats(); },
    onExpire(c) { c._bonus.def -= 30; c.calculateStats(); },
  },
  greater_attack: {
    id: 'greater_attack', name: 'Greater Attack', icon: '⚔️', duration: 60, skillId: 25,
    onApply(c) { c._bonus.dmg += 25; c.calculateStats(); },
    onExpire(c) { c._bonus.dmg -= 25; c.calculateStats(); },
  },
  elf_heal: {
    id: 'elf_heal', name: 'Heal', icon: '💚', duration: 0, skillId: 24, consumable: false,
    tick: { interval: 0, healPct: 0.25 },
  },
  passive_heal: {
    id: 'passive_heal', name: 'Regeneration', icon: '✚', duration: 10,
    tick: { interval: 1, healPct: 0.02 },
  },
  potion_hp: {
    id: 'potion_hp', name: 'Healing Potion', icon: '🧪', duration: 0, itemId: 1,
    onApply(c) { c.heal(c.maxHP * 0.35); },
  },
  potion_mp: {
    id: 'potion_mp', name: 'Mana Potion', icon: '🔷', duration: 0, itemId: 2,
    onApply(c) { c.mp = Math.min(c.maxMP, c.mp + c.maxMP * 0.35); },
  },
  potion_antidote: {
    id: 'potion_antidote', name: 'Antidote', icon: '⚗️', duration: 5, itemId: 3,
    cleansesPoison: true,
  },
  soul_barrier: {
    id: 'soul_barrier', name: 'Soul Barrier', icon: '🔮', duration: 90, skillId: 74,
    onApply(c) { c._bonus.defRate += 15; c.calculateStats(); },
    onExpire(c) { c._bonus.defRate -= 15; c.calculateStats(); },
  },
};

export class ActiveBuff {
  constructor(def, sourceId = null) {
    this.def = def;
    this.id = def.id;
    this.sourceId = sourceId;
    this.remaining = def.duration;
    this.tickTimer = def.tick?.interval || 0;
    this.onExpire = null; // user callback
  }

  update(dt, target) {
    if (this.def.tick && this.def.tick.healPct && this.def.tick.interval > 0) {
      this.tickTimer -= dt;
      if (this.tickTimer <= 0) {
        this.tickTimer = this.def.tick.interval;
        target.heal(target.maxHP * this.def.tick.healPct);
      }
    }
    if (this.remaining > 0) {
      this.remaining -= dt;
      if (this.remaining <= 0) {
        if (this.onExpire) this.onExpire(this);
        return true; // expired
      }
    }
    return false;
  }
}

export class BuffContainer {
  constructor(character) {
    this.character = character;
    this.buffs = new Map();
    this.listeners = { apply: [], expire: [] };
  }

  on(event, cb) {
    if (this.listeners[event]) this.listeners[event].push(cb);
  }

  _emit(event, buff) {
    (this.listeners[event] || []).forEach((cb) => cb(buff, this.character));
  }

  apply(buffId, sourceId = null) {
    const def = BuffDatabase[buffId];
    if (!def) return null;
    const existing = this.buffs.get(buffId);
    if (existing) existing.remaining = def.duration; // refresh
    if (def.onApply) def.onApply(this.character);
    // instant tick with interval 0 executes immediately
    if (def.tick && def.tick.healPct && def.tick.interval === 0) {
      this.character.heal(this.character.maxHP * def.tick.healPct);
    }
    let buff = existing;
    if (def.duration > 0) {
      if (!existing) {
        buff = new ActiveBuff(def, sourceId);
        buff.onExpire = () => {
          if (def.onExpire) def.onExpire(this.character);
          this.buffs.delete(buffId);
          this._emit('expire', buff);
        };
        this.buffs.set(buffId, buff);
      }
    }
    this._emit('apply', existing || def);
    return buff || existing || def;
  }

  remove(buffId) {
    const buff = this.buffs.get(buffId);
    if (buff) {
      buff.remaining = 0;
      if (buff.onExpire) buff.onExpire(buff);
    }
  }

  /** Remove um eBuffState vindo do servidor (mesma key usada por 0x2D). */
  removeServerBuffState(buffState) {
    if (!Number.isInteger(buffState) || buffState <= 0) return false;
    const id = `srv_${buffState}`;
    const buff = this.buffs.get(id);
    if (!buff) return false;
    buff.remaining = 0;
    if (buff.onExpire) buff.onExpire(buff);
    return true;
  }

  has(buffId) { return this.buffs.has(buffId); }

  update(dt) {
    for (const buff of Array.from(this.buffs.values())) {
      buff.update(dt, this.character);
    }
  }

  serialize() {
    const t = Date.now();
    return Array.from(this.buffs.values()).map((b) => ({
      id: b.id, remaining: b.remaining, sourceId: b.sourceId, savedAt: t,
    }));
  }

  restore(list) {
    for (const s of list || []) {
      if (s.remaining <= 0) continue;
      const def = BuffDatabase[s.id];
      if (!def) continue;
      const buff = this.newTimed(def, s.sourceId, s.remaining);
      this.buffs.set(s.id, buff);
    }
  }

  newTimed(def, sourceId, remaining) {
    const buff = new ActiveBuff(def, sourceId);
    buff.remaining = remaining;
    buff.onExpire = () => {
      if (def.onExpire) def.onExpire(this.character);
      this.buffs.delete(def.id);
      this._emit('expire', buff);
    };
    if (def.onApply) def.onApply(this.character);
    return buff;
  }

  // ===== Buffs do servidor REAL (0x2D ReceiveBuffState) =====
  // Autoridade PC (WSclient.cpp:9631-9652 + WSclient.h:1973-1981):
  // PMSG_ITEMEFFECTCANCEL payload (pós-header C3):
  //   [wOptionType:2][wEffectType:2][byEffectOption:1][wEffectTime:int4][byBuffType:1]
  // byEffectOption==0 → RegisterBuff(type, wEffectTime); !=0 → UnRegisterBuff.
  // O eBuffState REAL é a autoridade do ícone (NewUIBuffWindow RenderBuffIcon
  // indexa newui_statusicon sheets por ele) — a UI consome buff.serverBuffState.

  /** Sincroniza o snapshot de eBuffState que vem no create-player viewport.
   * O viewport informa presença, não duração; portanto mantém esses estados até
   * novo snapshot/DeleteViewport/0x1B. Nenhum stat local é inventado. */
  setServerBuffSnapshot(states) {
    const wanted = new Set((states || []).filter((v) => Number.isInteger(v) && v > 0 && v < 200));
    for (const [id, buff] of Array.from(this.buffs.entries())) {
      if (!id.startsWith('srv_')) continue;
      const state = Number(id.slice(4));
      if (!wanted.has(state)) {
        buff.remaining = 0;
        if (buff.onExpire) buff.onExpire(buff);
      }
    }
    for (const state of wanted) {
      const id = `srv_${state}`;
      if (this.buffs.has(id)) continue;
      const def = { id, name: `Buff ${state}`, icon: null, duration: Infinity, serverBuffState: state, serverDriven: true, viewportSnapshot: true };
      const buff = new ActiveBuff(def, 'server-viewport');
      buff.remaining = Infinity;
      buff.onExpire = () => { this.buffs.delete(id); this._emit('expire', buff); };
      this.buffs.set(id, buff);
      this._emit('apply', buff);
    }
    return wanted.size;
  }

  /**
   * Aplica um pacote 0x2D real do GameServer sobre este container.
   * Cria/renova uma entrada com o eBuffState do wire (id local derivado
   * 'srv_<state>'), sem stats locais inventados — duração real do servidor.
   * @param {number[]|Uint8Array} raw payload pós-header (10 bytes)
   * @returns {{applied:boolean, buffState:number, option:number, effectTime:number, id:string|null}}
   */
  onServerBuffState(raw) {
    const p = raw instanceof Uint8Array ? raw : Uint8Array.from(raw || []);
    const out = { applied: false, buffState: 0, option: 0, effectTime: 0, id: null };
    if (p.length < 10) return out; // fail-closed (payload curto)
    const option = p[4];                      // byEffectOption
    const effectTime = p[5] | (p[6] << 8) | (p[7] << 16) | (p[8] << 24); // int LE
    const buffState = p[9];                   // byBuffType (eBuffState real)
    out.option = option;
    out.effectTime = effectTime;
    out.buffState = buffState;
    // PC: eBuffNone(0) ou >= eBuff_Count → ignora
    if (buffState === 0 || buffState >= 200) return out;
    const id = `srv_${buffState}`;
    out.id = id;
    if (option === 0) {
      // RegisterBuff: nova entrada server-driven com duração REAL do GS
      const existing = this.buffs.get(id);
      if (existing) {
        existing.remaining = effectTime; // refresh (PC RegisterBuff idem)
      } else {
        const def = {
          id,
          name: `Buff ${buffState}`,
          icon: null,                  // sem emoji — ícone vem do sheet real
          duration: effectTime,
          serverBuffState: buffState,  // eBuffState real (autoridade do ícone)
          serverDriven: true,
        };
        const buff = new ActiveBuff(def, 'server');
        buff.remaining = effectTime > 0 ? effectTime : Infinity;
        buff.onExpire = () => {
          this.buffs.delete(id);
          this._emit('expire', buff);
        };
        this.buffs.set(id, buff);
      }
      this._emit('apply', this.buffs.get(id));
      out.applied = true;
    } else {
      // UnRegisterBuff
      const buff = this.buffs.get(id);
      if (buff) {
        buff.remaining = 0;
        if (buff.onExpire) buff.onExpire(buff);
      }
      out.applied = true;
    }
    return out;
  }
}
