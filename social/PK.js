// social/PK.js — Sistema PK (Player Kill) estilo MU Online:
// níveis hero/commoner/outlaw1/outlaw2/murderer, penalidade de drop de
// equipamento ao morrer como murderer, respawn em Lorencia e cor do nome.

export const PK_LEVELS = ['hero', 'commoner', 'outlaw1', 'outlaw2', 'murderer'];

// Cor do nome por nível (fiel ao MU: murderer em vermelho, outlaw laranja).
export const PK_NAME_COLORS = {
  hero: '#5aa9ff',
  commoner: '#e8dcc0',
  outlaw1: '#ffa040',
  outlaw2: '#ff7020',
  murderer: '#ff2020',
};

// Chance de dropar item equipado ao morrer, por nível.
const DROP_CHANCE = { hero: 0, commoner: 0, outlaw1: 0.1, outlaw2: 0.25, murderer: 0.5 };

export class PKSystem {
  /**
   * @param {object} opts
   * @param {object} [opts.chat]  ChatSystem (_addSystem)
   * @param {object} [opts.net]   GameNet (send pk events)
   * @param {string} [opts.respawnMap] default 'Lorencia'
   */
  constructor(opts = {}) {
    this.chat = opts.chat || null;
    this.net = opts.net || null;
    this.respawnMap = opts.respawnMap || 'Lorencia';
    this.respawnPos = opts.respawnPos || { x: 137, y: 123 }; // praça de Lorencia
    this._listeners = {};
  }

  on(event, fn) { (this._listeners[event] = this._listeners[event] || []).push(fn); return () => this.off(event, fn); }
  off(event, fn) { const l = this._listeners[event]; if (l) this._listeners[event] = l.filter((f) => f !== fn); }
  emit(event, data) { for (const fn of (this._listeners[event] || []).slice()) fn(data); }

  _sys(msg) { if (this.chat && typeof this.chat._addSystem === 'function') this.chat._addSystem(msg); }

  _ensure(char) {
    if (char.pkPoints == null) char.pkPoints = 0;
    if (!char.pkLevel) char.pkLevel = 'commoner';
    return char;
  }

  /** Recalcula pkLevel a partir de pkPoints (kills de inocentes). */
  levelFor(points) {
    if (points <= -3) return 'hero';
    if (points <= 0) return 'commoner';
    if (points <= 2) return 'outlaw1';
    if (points <= 4) return 'outlaw2';
    return 'murderer';
  }

  /**
   * Registra que `killer` matou `victim`.
   * Matar inocente (commoner/hero): +1 pk point -> sobe de nível.
   * Matar outlaw/murderer não pune; matar murderer limpa 1 ponto (caçar PK).
   * Em duelo (isDueling) não há penalidade.
   */
  registerKill(killer, victim) {
    this._ensure(killer);
    this._ensure(victim || {});
    if (killer.isDueling || (victim && victim.isDueling)) return null; // sem penalidade em duelo
    if (killer === victim) return null;

    const victimLevel = victim ? (victim.pkLevel || 'commoner') : 'commoner';
    const innocent = victimLevel === 'commoner' || victimLevel === 'hero';
    if (innocent) {
      killer.pkPoints += 1;
    } else if (victimLevel === 'murderer' && killer.pkPoints > 0) {
      killer.pkPoints -= 1; // recompensa por caçar murderer
    }
    const before = killer.pkLevel;
    killer.pkLevel = this.levelFor(killer.pkPoints);
    const out = { killer: killer.name, pkPoints: killer.pkPoints, level: killer.pkLevel };
    if (killer.pkLevel !== before) {
      this._sys(`${killer.name} agora é ${killer.pkLevel.toUpperCase()} (PK ${killer.pkPoints}).`);
      this.emit('levelChange', out);
    }
    this.emit('pk', out);
    if (this.net) this.net.send({ type: 'pk_update', ...out });
    return out;
  }

  /**
   * Penalidade de morte: murderer pode dropar item do EQUIPAMENTO.
   * @param {object} char personagem morto (com .inventory = Inventory)
   * @returns {{ dropped: Array<{slot,item}> }} itens dropados
   */
  onDeath(char) {
    this._ensure(char);
    const chance = DROP_CHANCE[char.pkLevel] || 0;
    const dropped = [];
    if (chance > 0 && char.inventory && char.inventory.equipment) {
      for (const slot of Object.keys(char.inventory.equipment)) {
        const item = char.inventory.equipment[slot];
        if (item && Math.random() < chance) {
          char.inventory.equipment[slot] = null;
          dropped.push({ slot, item });
        }
      }
      if (dropped.length && typeof char.inventory._changed === 'function') {
        char.inventory._changed({ type: 'pkDrop', dropped });
      }
    }
    // Respawn forçado em Lorencia para outlaws/murderer
    if (char.pkLevel === 'outlaw1' || char.pkLevel === 'outlaw2' || char.pkLevel === 'murderer') {
      char.map = this.respawnMap;
      char.x = this.respawnPos.x;
      char.y = this.respawnPos.y;
      this._sys(`${char.name} renasceu em ${this.respawnMap} (penalidade PK).`);
    }
    const result = { dropped, respawn: { map: char.map, x: char.x, y: char.y } };
    this.emit('death', result);
    return result;
  }

  /** Cor do nome para render (warning color). */
  getNameColor(char) {
    this._ensure(char);
    return PK_NAME_COLORS[char.pkLevel] || PK_NAME_COLORS.commoner;
  }

  /** Reduz pkPoints com o tempo/matos (dissipação, como no MU). */
  dissipate(char, points = 1) {
    this._ensure(char);
    if (char.pkPoints > 0) {
      char.pkPoints = Math.max(0, char.pkPoints - points);
      const nl = this.levelFor(char.pkPoints);
      if (nl !== char.pkLevel) {
        char.pkLevel = nl;
        this.emit('levelChange', { killer: char.name, pkPoints: char.pkPoints, level: nl });
      }
    }
    return char.pkPoints;
  }
}

export default PKSystem;
