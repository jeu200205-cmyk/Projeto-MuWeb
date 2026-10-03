// social/GuildSystem.js — Guild estilo MU Online: criação com marca 8x8
// (editor em canvas), custo 2.000.000 zen, ranks (Master/Assistant/
// BattleMaster/Regular), convite/aceite, kick/leave, Guild War (MU exige
// 5 membros VIVOS no lado defensor), tracking de score durante a guerra e
// No client-side guild-vault state is fabricated; unsupported server owners stay fail-closed.
// Não toca Party.js — compõe por fora via eventos.

import { MUWindow } from '../ui2/MUWindow.js';
import { Saves } from '../data/LoadData.js';

export const GUILD_CREATE_COST = 2000000;
export const MARK_SIZE = 8; // 8x8 pixels, fiel ao MU
export const WAR_MIN_ALIVE = 5; // MU não exige 20 membros: precisa 5 VIVOS

export const GuildRank = {
    MASTER: 'Master',
    ASSISTANT: 'Assistant',
    BATTLE_MASTER: 'BattleMaster',
    REGULAR: 'Regular',
};

// Pesos de autoridade (maior = mais poder)
const RANK_POWER = {
    [GuildRank.MASTER]: 4,
    [GuildRank.ASSISTANT]: 3,
    [GuildRank.BATTLE_MASTER]: 2,
    [GuildRank.REGULAR]: 1,
};

/* ---------------- padrão observer (mesmo estilo de Party/Storage) ---------------- */

function makeEmitter(self) {
    self._listeners = {};
    self.on = (event, fn) => {
        (self._listeners[event] = self._listeners[event] || []).push(fn);
        return () => self.off(event, fn);
    };
    self.off = (event, fn) => {
        const l = self._listeners[event];
        if (l) self._listeners[event] = l.filter((f) => f !== fn);
    };
    self.emit = (event, data) => {
        for (const fn of (self._listeners[event] || []).slice()) fn(data);
    };
    return self;
}

/* ---------------- Guild vault ----------------
 * No clean-PC/server owner is wired in this Web tree. The old localStorage
 * Vault simulation was removed in R65; no fake guild-bank state is exposed.
 */

/* ---------------- Guild ---------------- */

export class Guild {
    /**
     * @param {string} name - nome da guild
     * @param {string} masterName - char fundador
     * @param {SaveSystem} [saves]
     */
    constructor(name, masterName = null, saves = Saves) {
        this.saves = saves;
        this.name = name;
        this.mark = new Array(MARK_SIZE * MARK_SIZE).fill(null); // cores '#rrggbb' ou null
        this.masterName = null;
        this.members = []; // [{ name, rank, joinedAt }]
        this.invites = []; // nomes com convite pendente
        this.createdAt = Date.now();
        makeEmitter(this);
        if (masterName) this._addRaw(masterName, GuildRank.MASTER);
    }

    get saveKey() { return `guild_${this.name}`; }
    get size() { return this.members.length; }

    _addRaw(name, rank) {
        if (this.members.some((m) => m.name === name)) return false;
        this.members.push({ name, rank, joinedAt: Date.now() });
        if (rank === GuildRank.MASTER) this.masterName = name;
        return true;
    }

    getMember(name) { return this.members.find((m) => m.name === name) || null; }
    getRank(name) { const m = this.getMember(name); return m ? m.rank : null; }

    /** Pode gerenciar (invite/kick/setRank)? Master ou Assistant. */
    canManage(name) {
        const r = this.getRank(name);
        return r === GuildRank.MASTER || r === GuildRank.ASSISTANT;
    }

    /* ----- convite / aceite ----- */

    /** Master/Assistant convida. self-service: retorna false se já membro/convidado. */
    invite(byName, targetName) {
        if (!this.canManage(byName)) return false;
        if (!targetName || this.getMember(targetName)) return false;
        if (this.invites.includes(targetName)) return false;
        this.invites.push(targetName);
        this.emit('invite', { guild: this.name, target: targetName });
        return true;
    }

    /** Convidado aceita: entra como Regular. */
    acceptInvite(name) {
        const i = this.invites.indexOf(name);
        if (i === -1) return false;
        this.invites.splice(i, 1);
        this._addRaw(name, GuildRank.REGULAR);
        this._changed({ type: 'join', name });
        return true;
    }

    declineInvite(name) {
        const i = this.invites.indexOf(name);
        if (i === -1) return false;
        this.invites.splice(i, 1);
        return true;
    }

    /* ----- kick / leave ----- */

    kick(byName, targetName) {
        const byRank = this.getRank(byName);
        const target = this.getMember(targetName);
        if (!byRank || !target) return false;
        if (target.rank === GuildRank.MASTER) return false; // master nunca é kickado
        // precisa de mais poder que o alvo
        if (RANK_POWER[byRank] <= RANK_POWER[target.rank] && byName !== targetName) return false;
        if (!this.canManage(byName) && byName !== targetName) return false;
        return this._removeMember(targetName, 'kick');
    }

    leave(name) {
        const m = this.getMember(name);
        if (!m) return false;
        if (m.rank === GuildRank.MASTER) {
            // Master sai: passa o bastão para o de maior rank mais antigo, ou dissolve
            const rest = this.members.filter((x) => x.name !== name);
            if (!rest.length) {
                this._removeMember(name, 'leave');
                this.emit('disband', { guild: this.name });
                return true;
            }
            rest.sort((a, b) => RANK_POWER[b.rank] - RANK_POWER[a.rank] || a.joinedAt - b.joinedAt);
            this.setRank(name, rest[0].name, GuildRank.MASTER);
        }
        return this._removeMember(name, 'leave');
    }

    _removeMember(name, reason) {
        const i = this.members.findIndex((m) => m.name === name);
        if (i === -1) return false;
        this.members.splice(i, 1);
        if (this.masterName === name) this.masterName = null;
        this._changed({ type: reason, name });
        return true;
    }

    setRank(byName, targetName, newRank) {
        if (!this.canManage(byName)) return false;
        const target = this.getMember(targetName);
        if (!target || !Object.values(GuildRank).includes(newRank)) return false;
        // só o Master pode promover outro Master; e abdica ao fazê-lo
        if (newRank === GuildRank.MASTER) {
            if (this.getRank(byName) !== GuildRank.MASTER) return false;
            const me = this.getMember(byName);
            if (me) me.rank = GuildRank.ASSISTANT;
            target.rank = GuildRank.MASTER;
            this.masterName = targetName;
        } else {
            if (target.rank === GuildRank.MASTER) return false; // não rebaixa o master
            // não pode definir rank >= o próprio (exceto Master, já tratado)
            if (RANK_POWER[newRank] >= RANK_POWER[this.getRank(byName)]) return false;
            target.rank = newRank;
        }
        this._changed({ type: 'rank', name: targetName, rank: newRank });
        return true;
    }

    setMark(pixels) {
        if (!Array.isArray(pixels) || pixels.length !== MARK_SIZE * MARK_SIZE) return false;
        this.mark = pixels.slice();
        this._changed({ type: 'mark' });
        return true;
    }

    /* ----- persistência ----- */

    serialize() {
        return {
            name: this.name,
            mark: this.mark,
            masterName: this.masterName,
            members: this.members.map(({ name, rank, joinedAt }) => ({ name, rank, joinedAt })),
            invites: this.invites.slice(),
            createdAt: this.createdAt,
        };
    }

    save() { return this.saves.save(this.saveKey, this.serialize()); }
    _changed(what) { this.save(); this.emit('change', what); }

    static load(name, saves = Saves) {
        const data = saves.load(`guild_${name}`, null);
        if (!data) return null;
        return Guild.deserialize(data, saves);
    }

    static deserialize(data, saves = Saves) {
        const g = new Guild(data.name, null, saves);
        g.mark = Array.isArray(data.mark) && data.mark.length === MARK_SIZE * MARK_SIZE
            ? data.mark.slice() : g.mark;
        g.masterName = data.masterName || null;
        g.members = (data.members || []).map((m) => ({
            name: m.name, rank: m.rank || GuildRank.REGULAR, joinedAt: m.joinedAt || Date.now(),
        }));
        g.invites = data.invites || [];
        g.createdAt = data.createdAt || Date.now();
        return g;
    }

    /** Lista nomes de todas as guilds salvas (scan do localStorage). */
    static listAll(saves = Saves) {
        const prefix = saves.prefix + 'guild_';
        const out = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(prefix) && !k.endsWith('_vault')) {
                out.push(k.slice(prefix.length));
            }
        }
        return out;
    }

    /** Guild de um personagem, se houver. */
    static findByMember(charName, saves = Saves) {
        for (const g of Guild.listAll(saves)) {
            const guild = Guild.load(g, saves);
            if (guild && guild.getMember(charName)) return guild;
        }
        return null;
    }
}

/* ---------------- GuildWar ---------------- */

export class GuildWar {
    /**
     * @param {Guild} guildA - declarante
     * @param {Guild} guildB - alvo
     * @param {object} opts - { duration (ms, default 30min), aliveCheck(name)=>bool }
     */
    constructor(guildA, guildB, opts = {}) {
        this.guildA = guildA;
        this.guildB = guildB;
        this.score = { [guildA.name]: 0, [guildB.name]: 0 }; // guild -> kills
        this.startedAt = Date.now();
        this.duration = opts.duration ?? 30 * 60 * 1000;
        this.aliveCheck = opts.aliveCheck || (() => true);
        this.active = true;
        makeEmitter(this);
    }

    /** MU clássico: declarar war exige >= 5 membros VIVOS do lado defensor. */
    canDeclare(guildA, guildB, aliveCheck = this.aliveCheck) {
        if (!guildA || !guildB || guildA.name === guildB.name) return false;
        const alive = guildB.members.filter((m) => aliveCheck(m.name)).length;
        return alive >= WAR_MIN_ALIVE;
    }

    /**
     * Registra kill durante a war.
     * @param {string} killerName - membro de uma das guilds
     * @param {string} victimName - membro da guild adversária
     * @returns {boolean} true se o kill pontuou
     */
    registerKill(killerName, victimName) {
        if (!this.active) return false;
        if (Date.now() - this.startedAt > this.duration) { this.end(); return false; }
        const killerGuild = this.guildA.getMember(killerName) ? this.guildA
            : this.guildB.getMember(killerName) ? this.guildB : null;
        if (!killerGuild) return false;
        const victimGuild = this.guildA !== killerGuild && this.guildA.getMember(victimName) ? this.guildA
            : this.guildB !== killerGuild && this.guildB.getMember(victimName) ? this.guildB : null;
        if (!victimGuild) return false;
        this.score[killerGuild.name]++;
        this.emit('score', {
            killer: killerName, victim: victimName,
            score: { ...this.score },
        });
        return true;
    }

    get remainingMs() {
        return Math.max(0, this.duration - (Date.now() - this.startedAt));
    }

    get winner() {
        const a = this.score[this.guildA.name];
        const b = this.score[this.guildB.name];
        if (a === b) return null;
        return a > b ? this.guildA.name : this.guildB.name;
    }

    end() {
        if (!this.active) return this.winner;
        this.active = false;
        this.emit('end', { winner: this.winner, score: { ...this.score } });
        return this.winner;
    }
}

/* ---------------- GuildMarkEditor — canvas 8x8 ---------------- */

export class GuildMarkEditor {
    /**
     * @param {HTMLElement} parent - onde injetar
     * @param {object} opts - { initial?: (string|null)[64], onChange?(pixels) }
     */
    constructor(parent, opts = {}) {
        this.pixels = (opts.initial && opts.initial.length === MARK_SIZE * MARK_SIZE)
            ? opts.initial.slice() : new Array(MARK_SIZE * MARK_SIZE).fill(null);
        this.color = '#ff0000';
        this.onChange = opts.onChange || null;
        this.cellPx = 14;

        this.wrap = document.createElement('div');
        this.wrap.style.cssText = 'display:inline-block;';

        this.canvas = document.createElement('canvas');
        this.canvas.width = MARK_SIZE * this.cellPx;
        this.canvas.height = MARK_SIZE * this.cellPx;
        this.canvas.style.cssText =
            'border:1px solid #8a6d2f;cursor:crosshair;image-rendering:pixelated;';
        this.ctx = this.canvas.getContext('2d');
        this._draw();

        const tools = document.createElement('div');
        tools.style.cssText = 'margin-top:3px;display:flex;gap:4px;align-items:center;';
        this.picker = document.createElement('input');
        this.picker.type = 'color';
        this.picker.value = this.color;
        this.picker.style.cssText = 'width:24px;height:20px;border:none;background:none;padding:0;cursor:pointer;';
        this.picker.oninput = () => { this.color = this.picker.value; };

        const erase = document.createElement('span');
        erase.className = 'mu-btn'; erase.textContent = 'Borracha';
        erase.onclick = () => { this.color = null; };

        const clear = document.createElement('span');
        clear.className = 'mu-btn'; clear.textContent = 'Limpar';
        clear.onclick = () => { this.pixels.fill(null); this._draw(); this._notify(); };

        tools.append(this.picker, erase, clear);
        this.wrap.append(this.canvas, tools);
        parent.appendChild(this.wrap);

        this._bindPaint();
    }

    _notify() { if (this.onChange) this.onChange(this.pixels.slice()); }

    _bindPaint() {
        let painting = false;
        const paint = (e) => {
            const r = this.canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - r.left) / (r.width / MARK_SIZE));
            const y = Math.floor((e.clientY - r.top) / (r.height / MARK_SIZE));
            if (x < 0 || y < 0 || x >= MARK_SIZE || y >= MARK_SIZE) return;
            this.pixels[y * MARK_SIZE + x] = this.color; // null = borracha
            this._draw();
            this._notify();
        };
        this.canvas.addEventListener('mousedown', (e) => { painting = true; paint(e); });
        this.canvas.addEventListener('mousemove', (e) => { if (painting) paint(e); });
        window.addEventListener('mouseup', () => { painting = false; });
    }

    _draw() {
        const c = this.ctx, s = this.cellPx;
        for (let y = 0; y < MARK_SIZE; y++) {
            for (let x = 0; x < MARK_SIZE; x++) {
                const v = this.pixels[y * MARK_SIZE + x];
                c.fillStyle = v || '#100c06';
                c.fillRect(x * s, y * s, s, s);
                c.strokeStyle = '#2a2114';
                c.strokeRect(x * s + 0.5, y * s + 0.5, s - 1, s - 1);
            }
        }
    }

    getPixels() { return this.pixels.slice(); }

    /** Desenha marca 8x8 (pixels) num canvas alvo escalado — útil para render no jogo. */
    static renderTo(canvas, pixels, scale = 8) {
        canvas.width = MARK_SIZE * scale;
        canvas.height = MARK_SIZE * scale;
        const ctx = canvas.getContext('2d');
        for (let y = 0; y < MARK_SIZE; y++) {
            for (let x = 0; x < MARK_SIZE; x++) {
                const v = pixels[y * MARK_SIZE + x];
                ctx.fillStyle = v || 'rgba(0,0,0,0)';
                ctx.clearRect(x * scale, y * scale, scale, scale);
                if (v) ctx.fillRect(x * scale, y * scale, scale, scale);
            }
        }
        return canvas;
    }
}

/* ---------------- GuildWindow — MUWindow hotkey 'g' ---------------- */

export class GuildWindow extends MUWindow {
    /**
     * @param {object} deps
     * @param {string} deps.selfName - char do jogador local
     * @param {object} [deps.inventory] - { zen, spendZen? } para custo de criação
     * @param {Guild} [deps.guild] - guild atual do jogador (pode ser null)
     * @param {Function} [deps.aliveCheck] - (name)=>bool, usado na GuildWar
     * @param {GuildWar} [deps.war] - war ativa, se houver
     */
    constructor(deps, opts = {}) {
        super({ title: 'Guild', width: 320, hotkey: 'g', x: 90, y: 70, ...opts });
        this.selfName = deps.selfName;
        this.inventory = deps.inventory || null;
        this.guild = deps.guild || Guild.findByMember(deps.selfName) || null;
        this.aliveCheck = deps.aliveCheck || (() => true);
        this.war = deps.war || null;

        this._wl = {}; // eventos da janela (ex.: 'openVault')
        this.on = (e, fn) => { (this._wl[e] = this._wl[e] || []).push(fn); };
        this.emit = (e, d) => { for (const fn of (this._wl[e] || []).slice()) fn(d); };

        this.content = document.createElement('div');
        this.body.appendChild(this.content);
        if (this.guild) this.guild.on('change', () => this.render());
        this.render();
    }

    setGuild(guild) {
        this.guild = guild;
        if (guild) guild.on('change', () => this.render());
        this.render();
    }

    setWar(war) {
        this.war = war;
        if (war) {
            war.on('score', () => this.render());
            war.on('end', () => this.render());
        }
        this.render();
    }

    /* ----- views ----- */

    render() {
        this.content.innerHTML = '';
        if (!this.guild) return this._renderCreate();
        this._renderGuild();
    }

    _renderCreate() {
        this.setTitle('Criar Guild');
        const c = this.content;

        const note = document.createElement('div');
        note.style.marginBottom = '6px';
        note.textContent = `Custo: ${GUILD_CREATE_COST.toLocaleString()} zen`;
        c.appendChild(note);

        const nameInput = document.createElement('input');
        nameInput.placeholder = 'Nome da guild (3-16)';
        nameInput.maxLength = 16;
        nameInput.style.cssText =
            'width:180px;background:#14100a;color:#f0d98c;border:1px solid #8a6d2f;padding:3px 6px;';
        c.appendChild(nameInput);

        const lbl = document.createElement('div');
        lbl.style.marginTop = '8px';
        lbl.textContent = 'Marca da guild (8x8):';
        c.appendChild(lbl);

        let mark = null;
        new GuildMarkEditor(c, { onChange: (px) => { mark = px; } });

        const err = document.createElement('div');
        err.style.cssText = 'color:#ff7a7a;min-height:14px;margin-top:4px;';
        c.appendChild(err);

        const createBtn = document.createElement('span');
        createBtn.className = 'mu-btn';
        createBtn.textContent = `Criar (${GUILD_CREATE_COST.toLocaleString()} zen)`;
        createBtn.onclick = () => {
            const name = nameInput.value.trim();
            if (name.length < 3) { err.textContent = 'Nome muito curto.'; return; }
            if (Guild.load(name)) { err.textContent = 'Nome de guild já existe.'; return; }
            if (this.inventory) {
                if ((this.inventory.zen || 0) < GUILD_CREATE_COST) {
                    err.textContent = 'Zen insuficiente.'; return;
                }
                if (typeof this.inventory.spendZen === 'function') {
                    if (!this.inventory.spendZen(GUILD_CREATE_COST)) return;
                } else {
                    this.inventory.zen -= GUILD_CREATE_COST;
                }
            }
            const g = new Guild(name, this.selfName);
            if (mark) g.setMark(mark);
            g.save();
            this.setGuild(g);
        };
        c.appendChild(createBtn);
    }

    _renderGuild() {
        const g = this.guild;
        this.setTitle(`Guild — ${g.name} (${g.size})`);
        const c = this.content;

        // marca da guild (preview)
        if (g.mark.some(Boolean)) {
            const prev = document.createElement('canvas');
            prev.style.cssText = 'float:right;image-rendering:pixelated;border:1px solid #8a6d2f;';
            GuildMarkEditor.renderTo(prev, g.mark, 4);
            c.appendChild(prev);
        }

        // war score
        if (this.war && this.war.active) {
            const w = document.createElement('div');
            w.style.cssText = 'border:1px solid #6e1a1a;padding:4px;margin-bottom:6px;color:#ffb0b0;';
            const secs = Math.ceil(this.war.remainingMs / 1000);
            w.textContent = `⚔ WAR: ${this.war.guildA.name} ${this.war.score[this.war.guildA.name]} × ` +
                `${this.war.score[this.war.guildB.name]} ${this.war.guildB.name} — ${secs}s`;
            c.appendChild(w);
        }

        // lista de membros
        const list = document.createElement('div');
        list.className = 'mu-scrollbar';
        list.style.cssText = 'max-height:180px;overflow-y:auto;clear:both;';
        for (const m of g.members.slice().sort(
            (a, b) => RANK_POWER[b.rank] - RANK_POWER[a.rank] || a.joinedAt - b.joinedAt)) {
            const row = document.createElement('div');
            row.style.cssText =
                'display:flex;justify-content:space-between;align-items:center;' +
                'padding:2px 3px;border-bottom:1px solid #241c0e;';
            const label = document.createElement('span');
            label.textContent = `${m.name} — ${m.rank}`;
            if (m.rank === GuildRank.MASTER) label.style.color = '#f0d98c';
            row.appendChild(label);

            const acts = document.createElement('span');
            if (g.canManage(this.selfName) && m.name !== this.selfName && m.rank !== GuildRank.MASTER) {
                for (const rank of [GuildRank.ASSISTANT, GuildRank.BATTLE_MASTER, GuildRank.REGULAR]) {
                    if (m.rank === rank) continue;
                    const b = document.createElement('span');
                    b.className = 'mu-btn'; b.style.fontSize = '10px';
                    b.textContent = rank.slice(0, 1); // A/B/R
                    b.title = `Promover a ${rank}`;
                    b.onclick = () => g.setRank(this.selfName, m.name, rank);
                    acts.appendChild(b);
                }
                const kick = document.createElement('span');
                kick.className = 'mu-btn'; kick.style.fontSize = '10px'; kick.textContent = '✕';
                kick.title = 'Kickar';
                kick.onclick = () => g.kick(this.selfName, m.name);
                acts.appendChild(kick);
            }
            row.appendChild(acts);
            list.appendChild(row);
        }
        c.appendChild(list);

        // ações
        const actions = document.createElement('div');
        actions.style.marginTop = '6px';

        if (g.canManage(this.selfName)) {
            const inv = document.createElement('span');
            inv.className = 'mu-btn'; inv.textContent = 'Convidar';
            inv.onclick = () => {
                const name = window.prompt('Nome do personagem:');
                if (name && !g.invite(this.selfName, name.trim())) {
                    window.alert('Convite falhou (já membro/convidado ou sem permissão).');
                }
            };
            actions.appendChild(inv);

            const warBtn = document.createElement('span');
            warBtn.className = 'mu-btn'; warBtn.textContent = 'Declarar War';
            warBtn.onclick = () => {
                const targetName = window.prompt('Guild inimiga:');
                if (!targetName) return;
                const target = Guild.load(targetName.trim());
                if (!target) { window.alert('Guild não encontrada.'); return; }
                const war = new GuildWar(g, target, { aliveCheck: this.aliveCheck });
                if (!war.canDeclare(g, target)) {
                    window.alert(`War exige pelo menos ${WAR_MIN_ALIVE} membros VIVOS na guild inimiga.`);
                    return;
                }
                this.setWar(war);
            };
            actions.appendChild(warBtn);
        }

        if (g.invites.includes(this.selfName)) {
            const acc = document.createElement('span');
            acc.className = 'mu-btn'; acc.textContent = 'Aceitar convite';
            acc.onclick = () => g.acceptInvite(this.selfName);
            actions.appendChild(acc);
        }

        const leave = document.createElement('span');
        leave.className = 'mu-btn'; leave.textContent = 'Sair da guild';
        leave.onclick = () => {
            if (window.confirm(`Sair de "${g.name}"?`)) {
                g.leave(this.selfName);
                this.setGuild(Guild.findByMember(this.selfName));
            }
        };
        actions.appendChild(leave);

        c.appendChild(actions);
    }

    show() { super.show(); this.render(); }
}

export default Guild;
