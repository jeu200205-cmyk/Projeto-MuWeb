/**
 * WSClient.js - Port de WSclient.cpp
 * Cliente de rede usando WebSocket (substitui TCP sockets nativos)
 */
export class WSClient {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.listeners = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.autoReconnect = true;
        this.url = null;
    }
    connect(url) {
        if (this.socket) this.disconnect();
        this.url = url;
        try {
            this.socket = new WebSocket(url);
            this.socket.binaryType = 'arraybuffer';
            this.socket.onopen = () => { this.connected = true; this.reconnectAttempts = 0; this._emit('connect'); };
            this.socket.onclose = (event) => { this.connected = false; this._emit('disconnect', event); this._tryReconnect(); };
            this.socket.onerror = (err) => this._emit('error', err);
            this.socket.onmessage = (msg) => {
                this._emit('message', msg.data);
                if (msg.data instanceof ArrayBuffer) this._handlePacket(new Uint8Array(msg.data));
            };
        } catch (err) {
            console.error('[WSClient] Falha ao conectar:', err);
            this._emit('error', err);
        }
    }
    send(data) {
        if (this.socket && this.connected) { this.socket.send(data); return true; }
        return false;
    }
    sendPacket(type, payload = new Uint8Array(0)) {
        const size = 4 + payload.length;
        const packet = new Uint8Array(size);
        packet[0] = 0xC1;
        packet[1] = size;
        packet[2] = type;
        packet.set(payload, 4);
        return this.send(packet);
    }
    _handlePacket(data) {
        if (data.length < 4) return;
        const type = data[2];
        const payload = data.slice(4);
        this._emit(`packet:${type}`, payload);
    }
    on(event, fn) {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event).push(fn);
    }
    off(event, fn) {
        const list = this.listeners.get(event);
        if (list) { const idx = list.indexOf(fn); if (idx > -1) list.splice(idx, 1); }
    }
    _emit(event, data) {
        const list = this.listeners.get(event);
        if (list) list.forEach(fn => fn(data));
    }
    _tryReconnect() {
        if (!this.autoReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) return;
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        this._emit('reconnecting', { attempt: this.reconnectAttempts, delay });
        setTimeout(() => { if (this.url) this.connect(this.url); }, delay);
    }
    disconnect() {
        this.autoReconnect = false;
        if (this.socket) { this.socket.close(); this.socket = null; }
        this.connected = false;
    }
}
export const Net = new WSClient();
