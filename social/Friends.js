// social/Friends.js — Lista de amigos estilo MU Online.
// add/remove por nome (valida se o personagem existe nos Saves de accounts,
// chaves 'chars_<accountId>'), status online (via GameNet quando conectado:
// eventos de chat/atividade marcam o amigo como online), whisper ao clicar
// via ChatSystem, e FriendsWindow (MUWindow, hotkey 'f').

import { MUWindow } from '../ui2/MUWindow.js';
import { Saves } from '../data/LoadData.js';
import { GameNet } from '../protocol/NetClient.js';

const ONLINE_WINDOW_MS = 2 * 60 * 1000; // atividade recente = online

/** Procura um nome de personagem em todas as contas salvas. */
export function charExistsInSaves(charName, saves = Saves) {
    const prefix = saves.prefix + 'chars_';
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const chars = saves.load(k.slice(saves.prefix.length), []);
        if (Array.isArray(chars) && chars.some((c) => c && c.name === charName)) return true;
    }
    return false;
}

export class FriendsList {
    /**
     * @param {string} ownerName - nome do personagem dono da lista
     * @param {SaveSystem} [saves]
     * @param {GameNetClient|null} [net] - se fornecido, escuta chat p/ status online
     */
    constructor(ownerName, saves = Saves, net = GameNet) {
        this.ownerName = ownerName;
        this.saves = saves;
        this.friends = []; // [{ name, note?, addedAt, lastSeen? }]
        this._listeners = {};
        this.load();

        if (net) {
            // jogadores que falaram no chat recentemente contam como online
            net.on('chat', ({ from }) => this.markSeen(from));
            net.on('connect', () => this.emit('status', {}));
            net.on('disconnect', () => {
                for (const f of this.friends) f.lastSeen = 0;
                this.emit('status', {});
            });
        }
    }

    get saveKey() { return `friends_${this.ownerName}`; }

    on(event, fn) { (this._listeners[event] = this._listeners[event] || []).push(fn); return () => this.off(event, fn); }
    off(event, fn) { const l = this._listeners[event]; if (l) this._listeners[event] = l.filter((f) => f !== fn); }
    emit(event, data) { for (const fn of (this._listeners[event] || []).slice()) fn(data); }

    /**
     * Adiciona amigo por nome. Falha se o personagem não existe em nenhuma
     * conta salva (ou se já está na lista).
     * @returns {boolean}
     */
    addFriend(name, note = null) {
        name = (name || '').trim();
        if (!name || name === this.ownerName) return false;
        if (this.friends.some((f) => f.name === name)) return false;
        if (!charExistsInSaves(name, this.saves)) return false;
        this.friends.push({ name, note, addedAt: Date.now(), lastSeen: 0 });
        this._changed({ type: 'add', name });
        return true;
    }

    removeFriend(name) {
        const i = this.friends.findIndex((f) => f.name === name);
        if (i === -1) return false;
        this.friends.splice(i, 1);
        this._changed({ type: 'remove', name });
        return true;
    }

    isFriend(name) { return this.friends.some((f) => f.name === name); }

    /** Marca atividade recente de um nome (usado p/ status online). */
    markSeen(name) {
        const f = this.friends.find((x) => x.name === name);
        if (!f) return false;
        f.lastSeen = Date.now();
        this.emit('status', { name, online: true });
        return true;
    }

    /** true se o amigo teve atividade recente (GameNet conectado). */
    isOnline(name) {
        const f = this.friends.find((x) => x.name === name);
        if (!f || !f.lastSeen) return false;
        return (Date.now() - f.lastSeen) < ONLINE_WINDOW_MS;
    }

    serialize() {
        return this.friends.map(({ name, note, addedAt }) => ({ name, note, addedAt }));
    }

    save() { return this.saves.save(this.saveKey, this.serialize()); }
    _changed(what) { this.save(); this.emit('change', what); }

    load() {
        const data = this.saves.load(this.saveKey, []);
        this.friends = (Array.isArray(data) ? data : []).map((f) => ({
            name: f.name, note: f.note || null, addedAt: f.addedAt || Date.now(), lastSeen: 0,
        }));
        return this;
    }
}

/* ---------------- FriendsWindow — MUWindow hotkey 'f' ---------------- */

export class FriendsWindow extends MUWindow {
    /**
     * @param {FriendsList} friends
     * @param {object} deps
     * @param {ChatSystem} [deps.chat] - usado para whisper ao clicar
     * @param {GameNetClient} [deps.net] - para enviar whisper ao servidor
     */
    constructor(friends, deps = {}, opts = {}) {
        super({ title: 'Friends', width: 250, hotkey: 'f', x: 120, y: 120, ...opts });
        this.friends = friends;
        this.chat = deps.chat || null;
        this.net = deps.net || GameNet;

        this.list = document.createElement('div');
        this.list.className = 'mu-scrollbar';
        this.list.style.cssText = 'max-height:200px;overflow-y:auto;margin-bottom:6px;';
        this.body.appendChild(this.list);

        // linha de adicionar
        const addRow = document.createElement('div');
        addRow.style.cssText = 'display:flex;gap:4px;';
        this.addInput = document.createElement('input');
        this.addInput.placeholder = 'Nome do amigo';
        this.addInput.maxLength = 16;
        this.addInput.style.cssText =
            'flex:1;background:#14100a;color:#f0d98c;border:1px solid #8a6d2f;padding:3px 6px;';
        const addBtn = document.createElement('span');
        addBtn.className = 'mu-btn'; addBtn.textContent = 'Add';
        const doAdd = () => {
            const name = this.addInput.value.trim();
            if (!name) return;
            if (!this.friends.addFriend(name)) {
                this._flash('Personagem não encontrado ou já é amigo.');
            }
            this.addInput.value = '';
        };
        addBtn.onclick = doAdd;
        this.addInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') doAdd();
        });
        addRow.append(this.addInput, addBtn);
        this.body.appendChild(addRow);

        this.msg = document.createElement('div');
        this.msg.style.cssText = 'color:#ff7a7a;min-height:14px;font-size:11px;';
        this.body.appendChild(this.msg);

        friends.on('change', () => this.render());
        friends.on('status', () => this.render());
        this.render();
    }

    _flash(text) {
        this.msg.textContent = text;
        clearTimeout(this._flashT);
        this._flashT = setTimeout(() => { this.msg.textContent = ''; }, 3000);
    }

    /** Inicia whisper com o amigo: injeta o comando no input do chat. */
    whisper(name) {
        if (this.chat) {
            this.chat.input.value = `/w ${name} `;
            this.chat.input.focus();
        } else if (this.net) {
            // sem ChatSystem local: manda pacote de chat direto se conectado
            this.net.sendChat(`/w ${name} `);
        }
        this.emit('whisper', { name });
    }

    on(event, fn) { (this._wl = this._wl || {}); (this._wl[event] = this._wl[event] || []).push(fn); }
    emit(event, data) { for (const fn of ((this._wl && this._wl[event]) || []).slice()) fn(data); }

    render() {
        this.list.innerHTML = '';
        this.setTitle(`Friends (${this.friends.friends.length})`);
        if (!this.friends.friends.length) {
            this.list.textContent = 'Lista vazia. Adicione um amigo abaixo.';
            return;
        }
        for (const f of this.friends.friends.slice().sort((a, b) => a.name.localeCompare(b.name))) {
            const online = this.friends.isOnline(f.name);
            const row = document.createElement('div');
            row.style.cssText =
                'display:flex;justify-content:space-between;align-items:center;' +
                'padding:3px 4px;border-bottom:1px solid #241c0e;cursor:pointer;';
            row.title = 'Clique para sussurrar (whisper)';
            row.onclick = () => this.whisper(f.name);

            const label = document.createElement('span');
            const dot = online ? '●' : '○';
            const color = online ? '#6fe06f' : '#777';
            label.innerHTML = `<span style="color:${color}">${dot}</span> `;
            label.appendChild(document.createTextNode(f.name));
            label.style.color = online ? '#e8dcc0' : '#999';
            row.appendChild(label);

            const rm = document.createElement('span');
            rm.className = 'mu-btn'; rm.style.fontSize = '10px'; rm.textContent = '✕';
            rm.title = 'Remover';
            rm.onclick = (e) => { e.stopPropagation(); this.friends.removeFriend(f.name); };
            row.appendChild(rm);
            this.list.appendChild(row);
        }
    }

    show() { super.show(); this.render(); }
}

export default FriendsList;
