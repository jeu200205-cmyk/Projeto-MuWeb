/**
 * WSClient.js - Port de WSclient.cpp
 * Cliente de rede usando WebSocket (substitui TCP sockets nativos)
 * 
 * NOTA: O cliente original usa TCP binário com protocolo próprio (XOR, CRC32).
 * Na web, conexões must use WebSocket. Para conectar a um servidor MU
 * real, é necessário um gateway websocket↔tcp no backend.
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

    /**
     * Conecta a um endpoint WebSocket
     * @param {string} url - ex: 'wss://seu-gateway.com:8080'
     */
    connect(url) {
        if (this.socket) this.disconnect();
        this.url = url;

        try {
            this.socket = new WebSocket(url);
            this.socket.binaryType = 'arraybuffer';

            this.socket.onopen = () => {
                this.connected = true;
                this.reconnectAttempts = 0;
                this._emit('connect');
            };

            this.socket.onclose = (event) => {
                this.connected = false;
                this._emit('disconnect', event);
                this._tryReconnect();
            };

            this.socket.onerror = (err) => {
                this._emit('error', err);
            };

            this.socket.onmessage = (msg) => {
                // Pacotes binários do servidor
                this._emit('message', msg.data);
                if (msg.data instanceof ArrayBuffer) {
                    this._handlePacket(new Uint8Array(msg.data));
                }
            };
        } catch (err) {
            console.error('[WSClient] Falha ao conectar:', err);
            this._emit('error', err);
        }
    }

    /**
     * Envia bytes como pacote binário
     * @param {Uint8Array} data
     */
    send(data) {
        if (this.socket && this.connected) {
            this.socket.send(data);
            return true;
        }
        return false;
    }

    /**
     * Envia pacote estilo MU: [header][size][type]...[payload]
     * Port da estrutura de pacotes original (C1/C2)
     * @param {number} type - tipo do pacote
     * @param {Uint8Array} payload - dados
     */
    sendPacket(type, payload = new Uint8Array(0)) {
        const size = 4 + payload.length;
        const packet = new Uint8Array(size);
        packet[0] = 0xC1;           // Header
        packet[1] = size;           // Tamanho total
        packet[2] = type;           // Tipo do pacote
        packet.set(payload, 4);
        return this.send(packet);
    }

    /**
     * Roteia pacotes recebidos por tipo
     */
    _handlePacket(data) {
        if (data.length < 4) return;
        const type = data[2];
        const payload = data.slice(4);
        this._emit(`packet:${type}`, payload);
    }

    /**
     * Registra handler de evento
     * @param {string} event - 'connect', 'disconnect', 'error', 'message', 'packet:N'
     * @param {Function} fn
     */
    on(event, fn) {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event).push(fn);
    }

    off(event, fn) {
        const list = this.listeners.get(event);
        if (list) {
            const idx = list.indexOf(fn);
            if (idx > -1) list.splice(idx, 1);
        }
    }

    _emit(event, data) {
        const list = this.listeners.get(event);
        if (list) list.forEach(fn => fn(data));
    }

    _tryReconnect() {
        if (!this.autoReconnect) return;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        this._emit('reconnecting', { attempt: this.reconnectAttempts, delay });
        setTimeout(() => {
            if (this.url) this.connect(this.url);
        }, delay);
    }

    disconnect() {
        this.autoReconnect = false;
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.connected = false;
    }
}

// Singleton
export const Net = new WSClient();
