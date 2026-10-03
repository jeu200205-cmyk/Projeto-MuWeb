/**
 * NetClient.js - Camada de alto nível sobre net/WSClient.js
 * Encapsula o singleton Net e traduz pacotes binários em eventos de jogo.
 * Sem modo demo: servidor offline = erro explícito (política 0 simulação).
 */
import { Net } from '../net/WSClient.js';
import { PacketTypes as T } from './PacketTypes.js';
import * as Builder from './PacketBuilder.js';

const decoder = new TextDecoder();

export class GameNetClient {
    constructor() {
        this.listeners = new Map();
        this.pingInterval = null;
        this._wireNetEvents();
    }

    /* ---------------- infra de eventos ---------------- */

    on(event, fn) {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event).push(fn);
        return this;
    }

    off(event, fn) {
        const list = this.listeners.get(event);
        if (list) {
            const idx = list.indexOf(fn);
            if (idx > -1) list.splice(idx, 1);
        }
        return this;
    }

    _emit(event, data) {
        const list = this.listeners.get(event);
        if (list) list.forEach(fn => fn(data));
    }

    _wireNetEvents() {
        Net.on('connect', () => { this._emit('connect'); this._startPing(); });
        Net.on('disconnect', () => { this._emit('disconnect'); this._stopPing(); });
        Net.on('error', (e) => this._emit('error', e));

        Net.on(`packet:${T.LOGIN_RES}`, (p) => {
            this._emit('loginResult', { success: p.length > 0 && p[0] === 1 });
        });
        Net.on(`packet:${T.CHAR_LIST}`, (p) => {
            this._emit('charList', this._parseCharList(p));
        });
        Net.on(`packet:${T.ENTER_WORLD}`, (p) => {
            this._emit('enterWorld', { mapId: p.length > 0 ? p[0] : 0 });
        });
        Net.on(`packet:${T.CHAT}`, (p) => {
            const from = p.length > 0 ? p[0] : 0;
            this._emit('chat', { from, text: decoder.decode(p.slice(1)) });
        });
        Net.on(`packet:${T.ENTITY_SPAWN}`, (p) => {
            const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
            this._emit('entitySpawn', {
                id: dv.getUint16(0, true),
                x: dv.getInt16(2, true),
                y: dv.getInt16(4, true),
                type: p.length > 6 ? p[6] : 0
            });
        });
        Net.on(`packet:${T.ENTITY_DESPAWN}`, (p) => {
            const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
            this._emit('entityDespawn', { id: dv.getUint16(0, true) });
        });
        Net.on(`packet:${T.ENTITY_MOVE}`, (p) => {
            const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
            this._emit('entityMove', {
                id: dv.getUint16(0, true),
                x: dv.getInt16(2, true),
                y: dv.getInt16(4, true)
            });
        });
        Net.on(`packet:${T.HP_UPDATE}`, (p) => {
            const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
            this._emit('hpUpdate', { id: dv.getUint16(0, true), hp: dv.getUint16(2, true), maxHp: dv.getUint16(4, true) });
        });
    }

    _parseCharList(payload) {
        // [count:u8] entradas de [nameLen:u8][name bytes][level:u16 LE][classId:u8]
        const chars = [];
        let off = 1;
        const count = payload.length > 0 ? payload[0] : 0;
        for (let i = 0; i < count; i++) {
            const nameLen = payload[off];
            const name = decoder.decode(payload.slice(off + 1, off + 1 + nameLen));
            const dv = new DataView(payload.buffer, payload.byteOffset + off + 1 + nameLen, 3);
            chars.push({ name, level: dv.getUint16(0, true), classId: dv.getUint8(2) });
            off += 1 + nameLen + 3;
        }
        return chars;
    }

    /* ---------------- API de conexão e envio ---------------- */

    connect(url) {
        Net.autoReconnect = true;
        Net.connect(url);
    }

    disconnect() {
        this._stopPing();
        Net.disconnect();
    }

    /** Estado do transporte subjacente (WS/TCP) — distinção P0 */
    isOnline() {
        return !!Net.connected;
    }

    login(user, pass) {
        Net.sendPacket(T.LOGIN_REQ, Builder.buildLogin(user, pass));
    }

    sendChat(text) {
        Net.sendPacket(T.CHAT, Builder.buildChat(text));
    }

    sendMove(pos, dir) {
        Net.sendPacket(T.MOVE, Builder.buildMove(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0, dir));
    }

    sendAttack(targetId, skillId) {
        Net.sendPacket(T.ATTACK, Builder.buildAttack(targetId, skillId));
    }

    selectCharacter(name) {
        Net.sendPacket(T.CHAR_SELECT, Builder.buildCharSelect(name));
    }

    addStats(attr, points) {
        Net.sendPacket(T.ADD_STATS, Builder.buildAddStats(attr, points));
    }

    warp(mapId) {
        Net.sendPacket(T.WARP, Builder.buildWarp(mapId));
    }

    ping() {
        Net.sendPacket(T.PING, Builder.buildPing());
    }

    _startPing() {
        this._stopPing();
        this.pingInterval = setInterval(() => {
            if (Net.connected) this.ping();
        }, 5000);
    }

    _stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    /* ---------------- Modo demo REMOVIDO ----------------
     * Política do usuário (0 simulação, 0 placeholder): o cliente web deve
     * portar o comportamento PC real — login/charlist/world só respondem via
     * servidor real (ConnectServer/GameServer via gateway WS→TCP).
     * Servidor offline = cliente mostra estado de erro como o PC (nunca
     * fingir sucesso com dados inventados).
     */
}

// Singleton conveniente
export const GameNet = new GameNetClient();
export default GameNetClient;
