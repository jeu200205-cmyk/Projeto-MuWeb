// social/Duel.js — Sistema de duelo PvP estilo MU Online:
// request/accept/decline com timeout de 10s, countdown 3-2-1-Lutem!,
// kill tracking, surrender, resultado e flag isDueling (sem penalidade PK).

export const DUEL_STATE = {
  IDLE: 'idle',
  PENDING: 'pending',       // convite enviado/aguardando resposta
  COUNTDOWN: 'countdown',   // 3-2-1-Lutem!
  ACTIVE: 'active',
  FINISHED: 'finished',
};

export class DuelSystem {
  /**
   * @param {object} opts
   * @param {object} [opts.chat]   ChatSystem (usa _addSystem para mensagens)
   * @param {object} [opts.net]    GameNet (envia duel_* via send)
   * @param {object} [opts.self]   personagem local (recebe isDueling)
   */
  constructor(opts = {}) {
    this.chat = opts.chat || null;
    this.net = opts.net || null;
    this.self = opts.self || null;
    this.state = DUEL_STATE.IDLE;
    this.opponent = null;   // { name, char? }
    this.kills = { self: 0, opponent: 0 };
    this._timer = null;
    this._countdownTimer = null;
    this._listeners = {};
  }

  on(event, fn) { (this._listeners[event] = this._listeners[event] || []).push(fn); return () => this.off(event, fn); }
  off(event, fn) { const l = this._listeners[event]; if (l) this._listeners[event] = l.filter((f) => f !== fn); }
  emit(event, data) { for (const fn of (this._listeners[event] || []).slice()) fn(data); }

  _sys(msg) { if (this.chat && typeof this.chat._addSystem === 'function') this.chat._addSystem(msg); }
  get isDueling() { return this.state === DUEL_STATE.ACTIVE || this.state === DUEL_STATE.COUNTDOWN; }

  _setDuelingFlag(v) {
    if (this.self) this.self.isDueling = v;
    if (this.opponent && this.opponent.char) this.opponent.char.isDueling = v;
  }

  /** Envia pedido de duelo. Timeout de 10s aguardando resposta. */
  request(target) {
    if (this.state !== DUEL_STATE.IDLE) return false;
    this.opponent = typeof target === 'string' ? { name: target } : target;
    this.state = DUEL_STATE.PENDING;
    this.kills = { self: 0, opponent: 0 };
    if (this.net) this.net.send({ type: 'duel_request', target: this.opponent.name });
    this._sys(`Pedido de duelo enviado para ${this.opponent.name}. (10s)`);
    this.emit('request', this.opponent);
    this._timer = setTimeout(() => {
      if (this.state === DUEL_STATE.PENDING) {
        this._sys('Pedido de duelo expirou.');
        this.emit('timeout', this.opponent);
        this._reset();
      }
    }, 10000);
    return true;
  }

  /** Aceita um duelo pendente -> inicia countdown MU-style. */
  accept() {
    if (this.state !== DUEL_STATE.PENDING || !this.opponent) return false;
    clearTimeout(this._timer);
    if (this.net) this.net.send({ type: 'duel_accept', target: this.opponent.name });
    this._startCountdown();
    return true;
  }

  decline() {
    if (this.state !== DUEL_STATE.PENDING) return false;
    clearTimeout(this._timer);
    if (this.net) this.net.send({ type: 'duel_decline', target: this.opponent.name });
    this._sys('Duelo recusado.');
    this.emit('declined', this.opponent);
    this._reset();
    return true;
  }

  /** Lado remoto aceitou (via rede). */
  onRemoteAccept() {
    if (this.state !== DUEL_STATE.PENDING) return;
    clearTimeout(this._timer);
    this._startCountdown();
  }

  onRemoteDecline() {
    if (this.state !== DUEL_STATE.PENDING) return;
    clearTimeout(this._timer);
    this._sys(`${this.opponent.name} recusou o duelo.`);
    this.emit('declined', this.opponent);
    this._reset();
  }

  _startCountdown() {
    this.state = DUEL_STATE.COUNTDOWN;
    this._setDuelingFlag(true);
    const seq = ['3', '2', '1', 'Lutem!'];
    let i = 0;
    this.emit('countdown', { step: seq[0] });
    this._sys(`Duelo contra ${this.opponent.name} em 3...`);
    this._countdownTimer = setInterval(() => {
      i++;
      if (i >= seq.length) {
        clearInterval(this._countdownTimer);
        this.state = DUEL_STATE.ACTIVE;
        this.emit('start', this.opponent);
        return;
      }
      this._sys(seq[i]);
      this.emit('countdown', { step: seq[i] });
    }, 1000);
  }

  /** Registra um kill dentro do duelo. @param {'self'|'opponent'} who */
  registerKill(who) {
    if (this.state !== DUEL_STATE.ACTIVE || !this.opponent) return false;
    this.kills[who] = (this.kills[who] || 0) + 1;
    this.emit('kill', { who, kills: { ...this.kills } });
    const winner = who === 'self' ? 'self' : 'opponent';
    this._finish(winner, 'kill');
    return true;
  }

  /** Rende-se: vitória do oponente. */
  surrender() {
    if (!this.isDueling) return false;
    if (this.net) this.net.send({ type: 'duel_surrender', target: this.opponent && this.opponent.name });
    this._sys('Você se rendeu.');
    this._finish('opponent', 'surrender');
    return true;
  }

  _finish(winner, reason) {
    clearTimeout(this._timer);
    clearInterval(this._countdownTimer);
    this.state = DUEL_STATE.FINISHED;
    this._setDuelingFlag(false);
    const result = {
      winner: winner === 'self' ? (this.self && this.self.name) || 'self' : this.opponent.name,
      loser: winner === 'self' ? this.opponent.name : (this.self && this.self.name) || 'self',
      kills: { ...this.kills },
      reason,
    };
    this._sys(`Duelo encerrado — vencedor: ${result.winner} (${reason}).`);
    this.emit('result', result);
    this.state = DUEL_STATE.IDLE;
    this.opponent = null;
  }

  _reset() {
    clearTimeout(this._timer);
    clearInterval(this._countdownTimer);
    this._setDuelingFlag(false);
    this.state = DUEL_STATE.IDLE;
    this.opponent = null;
    this.kills = { self: 0, opponent: 0 };
  }
}

export default DuelSystem;
