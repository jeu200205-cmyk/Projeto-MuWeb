/**
 * RealMUProtocol.js — Transporte WebSocket ↔ Gateway ↔ Servidores MU reais.
 * Usa o protocolo REAL (MUPacketManager/MUOpCodes) — sem duplicação local.
 * Estados: offline | connecting | gateway-connected | connecting-tcp | connected
 *          | authenticating | authenticated | selecting-character | loading-world | in-world
 * 100% browser-compatible (ES Modules, Uint8Array/DataView).
 */

import { MUPacketManager } from './MUPacketManager.js';
import { MAIN_OPCODE, F1_SUBCODE, HEADER_TYPE, getOpcodeName } from './MUOpCodes.js';
import { parseHeader, xorData } from './MUCrypto.js';

// Re-export p/ consumidores legados (GameApp importa OPCODES daqui)
export { MAIN_OPCODE as OPCODES, MUPacketManager, HEADER_TYPE };

const XOR_FILTER = [
  0xE7, 0x6D, 0x3A, 0x89, 0xBC, 0xB2, 0x9F, 0x73,
  0x23, 0xA8, 0xFE, 0xB6, 0x49, 0x5D, 0x39, 0x5D,
  0x8A, 0xCB, 0x63, 0x8D, 0xEA, 0x7D, 0x2B, 0x5F,
  0xC3, 0xB1, 0xE9, 0x83, 0x29, 0x51, 0xE8, 0x56
];

// R12.5: famílias de headcode C1/C3 que REALMENTE carregam byte subcode
// (prova PC WSclient.cpp + wire capturado): F1 login, F3 character, F4 server.
// Demais opcodes C1 são structs sem sub (PBMSG_HEADER 3B).
const C1_HAS_SUBCODE = new Set([0xF1, 0xF3, 0xF4, 0xFA]);

class RealMUProtocol {
  constructor(options = {}) {
    this.gatewayUrl = options.gatewayUrl || 'ws://localhost:9091';
    this.ws = null;
    this.packetManager = new MUPacketManager();
    this.isConnected = false;
    this.connectionState = 'offline';
    this._manualDisconnect = false;
    this.accountId = null;
    this.characterId = null;
    this.handlers = {
      onConnect: options.onConnect || (() => {}),
      onDisconnect: options.onDisconnect || (() => {}),
      onError: options.onError || (() => {}),
      onPacket: options.onPacket || (() => {})
    };
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 8;
    this.reconnectDelay = 500;
    this.maxReconnectDelay = 3000;
    this._tcpReconnectAttempts = 0;
    this._binaryGatewayData = true;
    // R13: waiters do TCP real e handoff CS→GS sem reabrir WebSocket.
    this._tcpConnectedWaiters = [];
    this._retargeting = false;
    this._resendConnectTimer = null;
    this._wsReconnectTimer = null;
    // R15.5: geração TCP monotônica emitida pelo gateway. Mesmo quando a lane
    // permanece 'android', callbacks/dados de um socket anterior nunca podem
    // derrubar ou alimentar a sessão nova.
    this._tcpGeneration = 0;
    this._gameHandoffPromise = null;
    // Nível de transporte: 'connect' (ConnectServer 44405) | 'game' (GameServer
    // 55901 PC — SocketManager DecryptData/ENCRYPT_STATE=1 + C3 DES:
    // probe C1 raw/caesar/XOR → ECONNRESET em TODAS as variantes) | 'android'
    // (GS 55902 AndroidLayer — frames olc::net sem cifra — PROVADO E2E
    // 2026-09-23: login teste/1 result=1, charlist 10 chars, world join ok).
    this.serverType = 'connect';
    // R12.5 evidence marker: prova no console que ESTE build tem o fix do
    // payloadStart C1-sem-subcode (charCard/life/mana/chat/teleport).
    console.info('[MU Protocol] R12.5 C1-no-subcode payloadStart=3 — ATIVO');
    // Lane usada no handoff CS→GS (Config.GAME_LANE; default 'android').
    this.gameLane = options.gameLane || 'android';
  }

  /** Lane de GameServer ativa? ('game' PC ou 'android' olc::net) */
  inGameLane() {
    return this.serverType === 'game' || this.serverType === 'android';
  }

  getConnectionState() { return this.connectionState; }

  /** Carrega as chaves reais do cliente: Enc1 (client→server) e Dec2 (server→client). */
  async loadClientCrypto(fetchBinary) {
    if (this._cryptoReady) return true;
    if (this._cryptoPromise) return this._cryptoPromise;
    this._cryptoPromise = (async () => {
      const [enc1, dec2] = await Promise.all([fetchBinary('Enc1.dat'), fetchBinary('Dec2.dat')]);
      if (!enc1 || !dec2) throw new Error('Enc1.dat/Dec2.dat ausentes no Data real');
      const ab = (x) => x instanceof ArrayBuffer ? x : x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength);
      const okEnc = await this.packetManager.loadEncryptionKey(ab(enc1));
      const okDec = await this.packetManager.loadDecryptionKey(ab(dec2));
      if (!okEnc || !okDec) throw new Error(`chaves SimpleModulus inválidas enc=${okEnc} dec=${okDec}`);
      this._cryptoReady = true;
      console.info('[MU Protocol] SimpleModulus client keys READY (Enc1 + Dec2)');
      return true;
    })().catch((e) => { this._cryptoPromise = null; throw e; });
    return this._cryptoPromise;
  }

  /**
   * HANDOFF ConnectServer → GameServer (fluxo real do PC):
   * ReceiveServerConnect (F4:03) entrega IP:porta do GS → o PC fecha o socket
   * do CS e abre um novo no GS, enviando o login F1:01 lá. No web, o gateway
   * mantém um socket TCP por sessão WS: trocamos serverType e reconectamos,
   * pedindo ao gateway o alvo novo (IP/porta do F4:03, ou o GS default).
   * @param {string} ip  IP vindo do F4:03 (ReceiveServerConnect)
   * @param {number} port porta do F4:03
   */
  async switchToGame(ip = null, port = null) {
    // Single-flight: F4:03 duplicado/repetido não pode abrir dois TCPs GS.
    if (this._gameHandoffPromise) return this._gameHandoffPromise;
    if (this.serverType !== 'connect') return; // já numa lane de GS
    const run = async () => {
    const lane = this.gameLane || 'android';
    this.gameTarget = (lane === 'game' && ip && port) ? `${ip}:${port}` : null;
    this.serverType = lane;
    this.isConnected = false;
    this.connectionState = 'connecting-game';

    // R13 FAST HANDOFF: gateway-server.cjs já suporta `type:connect` no MESMO
    // WebSocket e fecha/substitui apenas o TCP anterior. O código antigo fechava
    // WS + TCP e abria outro WS, gerando handshake extra, evento disconnected e
    // retry de 1.5s. Retarget preserva a sessão WS e aguarda confirmação TCP.
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this._retargeting = true;
      const ready = this._waitForTcpConnected(8000);
      const connect = { type: 'connect', serverType: this.serverType, binaryData: this._binaryGatewayData };
      if (this.serverType === 'game' && this.gameTarget) connect.target = this.gameTarget;
      this.ws.send(JSON.stringify(connect));
      await ready;
      return;
    }

    // Fallback: WS realmente caiu. Abre novamente e espera o TCP, não apenas
    // o onopen do browser.
    const ready = this._waitForTcpConnected(8000);
    await this.connect();
    await ready;
    };
    this._gameHandoffPromise = run().finally(() => { this._gameHandoffPromise = null; });
    return this._gameHandoffPromise;
  }

  _waitForTcpConnected(timeoutMs = 8000) {
    if (this.isConnected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const i = this._tcpConnectedWaiters.indexOf(waiter);
        if (i >= 0) this._tcpConnectedWaiters.splice(i, 1);
        reject(new Error(`timeout aguardando TCP ${this.serverType}`));
      }, timeoutMs);
      this._tcpConnectedWaiters.push(waiter);
    });
  }

  _resolveTcpConnectedWaiters() {
    const list = this._tcpConnectedWaiters.splice(0);
    for (const w of list) { clearTimeout(w.timer); try { w.resolve(); } catch (_) {} }
  }

  connect() {
    this._manualDisconnect = false;
    this.connectionState = 'connecting';
    return new Promise((resolve, reject) => {
      let settled = false;
      try {
        this.ws = new WebSocket(this.gatewayUrl);
        this.ws.binaryType = 'arraybuffer';
      } catch (e) {
        this.connectionState = 'offline';
        return reject(e);
      }

      this.ws.onopen = () => {
        console.log('[MU Protocol] WebSocket do gateway aberto');
        this.connectionState = 'gateway-connected';
        settled = true;
        // Gateway abre TCP com o servidor MU real — alvo explícito quando
        // handoff F4:03 (IP:porta do GS), senão default por serverType.
        try {
          const connect = { type: 'connect', serverType: this.serverType, binaryData: this._binaryGatewayData };
          if (this.serverType === 'game' && this.gameTarget) connect.target = this.gameTarget;
          this.ws.send(JSON.stringify(connect));
        } catch (e) { /* segue */ }
        // `onConnect` representa TCP MU pronto, não apenas o WebSocket do
        // gateway. O callback é disparado somente no frame JSON `connected`
        // abaixo; isso evita inicialização duplicada de sons/UI e status enganoso.
        resolve();
      };

      this.ws.onmessage = (event) => {
        // R22: gameplay bytes use native WebSocket binary frames end-to-end.
        // JSON remains only for tiny gateway control messages. This removes
        // base64 encode/decode + JSON allocation/GC from every MU packet.
        if (event.data instanceof ArrayBuffer) {
          this._handleTcpChunk(new Uint8Array(event.data));
          return;
        }
        if (ArrayBuffer.isView(event.data)) {
          this._handleTcpChunk(new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength));
          return;
        }
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (e) {
          console.error('[MU Protocol] Parse error:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[MU Protocol] WebSocket error:', err);
        this.handlers.onError(err);
        if (!settled) {
          settled = true;
          this.connectionState = 'offline';
          reject(new Error('Falha ao conectar ao gateway: ' + this.gatewayUrl));
        }
      };

      this.ws.onclose = () => {
        console.log('[MU Protocol] Desconectado do gateway');
        const wasConnected = this.isConnected;
        this.isConnected = false;
        this.connectionState = 'offline';
        if (!settled) {
          settled = true;
          return reject(new Error('Gateway fechou a conexão antes de abrir'));
        }
        this.handlers.onDisconnect();
        if (wasConnected && !this._manualDisconnect) this.attemptReconnect();
      };
    });
  }

  async sendPacket(packet) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // processOutgoingPacket aplica serial + cifra C3/C4 quando aplicável
      const processed = this.packetManager.processOutgoingPacket(packet);
      // Binary WS is backward-compatible with the old gateway too: its JSON
      // parser falls through to raw TCP write. No base64/JSON copy on hot path.
      this.ws.send(processed);
    }
  }

  // Build C1: [0xC1][size:1][head:1][sub:1][payload...] — size = total
  buildPacket(headcode, subcode, payload) {
    const total = 4 + payload.length;
    const buf = new Uint8Array(total);
    buf[0] = HEADER_TYPE.C1;
    buf[1] = total & 0xFF;
    buf[2] = headcode;
    buf[3] = subcode;
    buf.set(payload, 4);
    return buf;
  }

  // Build C2 (size > 255): [0xC2][sizeH][sizeL][head:1][sub:1][payload...]
  // ORDEM REAL: HIGH primeiro (SET_NUMBERHB/SET_NUMBERLB — ConnectServerProtocol.cpp;
  // prova: lista F4:06 real capturada = C2 00 0B = 11 bytes)
  buildC2Packet(headcode, subcode, payload) {
    const total = 5 + payload.length;
    const buf = new Uint8Array(total);
    buf[0] = HEADER_TYPE.C2;
    buf[1] = (total >> 8) & 0xFF; // HIGH
    buf[2] = total & 0xFF;        // LOW
    buf[3] = headcode;
    buf[4] = subcode;
    buf.set(payload, 5);
    return buf;
  }

  writeString(buffer, offset, str, maxLen) {
    for (let i = 0; i < maxLen && i < str.length; i++) {
      buffer[offset + i] = str.charCodeAt(i);
    }
    for (let i = str.length; i < maxLen; i++) buffer[offset + i] = 0;
  }


  // LuaSocket.cpp authority: PMSG_CUSTOM_SOCKET_SEND = C2 0xFA:<sub>,
  // fixed char PacketName[100], then the Lua-owned payload. This is NOT a
  // web-private envelope; it is the exact current PC client wire contract.
  createCustomSocketPacket(subcode, packetName, payload = new Uint8Array(0)) {
    const body = payload instanceof Uint8Array ? payload : new Uint8Array(payload || 0);
    const out = new Uint8Array(100 + body.length);
    this.writeString(out, 0, String(packetName || ''), 100);
    out.set(body, 100);
    return this.buildC2Packet(0xFA, subcode & 0xFF, out);
  }

  createMoveCustomPacket({ map, destination, mapNumber, cx, cy } = {}) {
    // MoveCustomInterface.lua exact order:
    // char[10] map, char[10] destination, DWORD mapNumber/cx/cy (network BE).
    const payload = new Uint8Array(32);
    this.writeString(payload, 0, String(map || ''), 10);
    this.writeString(payload, 10, String(destination || ''), 10);
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    view.setUint32(20, Number(mapNumber) >>> 0, false);
    view.setUint32(24, Number(cx) >>> 0, false);
    view.setUint32(28, Number(cy) >>> 0, false);
    return this.createCustomSocketPacket(0x48, 'GS_MoveCustom', payload);
  }

  async requestMoveCustom(move) {
    if (!move || !Number.isFinite(Number(move.mapNumber)) || !Number.isFinite(Number(move.cx)) || !Number.isFinite(Number(move.cy))) {
      throw new TypeError('MoveCustom inválido');
    }
    await this.sendPacket(this.createMoveCustomPacket(move));
    return true;
  }

  // Login request — C1 [F1][01] (PMSG_CONNECT_ACCOUNT_SEND)
  // MAIN_OPCODE.CONNECT = 0xF1 (MUOpCodes.js linha 201)
  createLoginPacket(account, password) {
    const payload = new Uint8Array(48);
    const view = new DataView(payload.buffer);
    payload[0] = MAIN_OPCODE.CONNECT;         // headcode 0xF1
    payload[1] = F1_SUBCODE.LOGIN;            // subcode = login (01)
    view.setUint32(2, Date.now() & 0xFFFFFFFF, true); // tick count
    this.writeString(payload, 6, account.padEnd(10, '\0'), 10);
    this.writeString(payload, 16, password.padEnd(20, '\0'), 20);
    view.setUint32(36, 0, true);  // tick count 2
    view.setUint32(40, 0, true);  // version
    view.setUint16(44, 0, true);  // serial
    // PSBMSG_HEAD (F1/01) embutido no payload: extraído p/ buf[2..3]
    const total = 4 + payload.length - 2;
    const buf = new Uint8Array(total);
    buf[0] = HEADER_TYPE.C1;
    buf[1] = total & 0xFF;
    buf[2] = payload[0]; // head (F1)
    buf[3] = payload[1]; // sub (01)
    buf.set(payload.subarray(2), 4);
    return buf;
  }

  // Login (autenticação) — envia pacote e muda estado
  async login(account, password, serverId = 0) {
    this.account = account;
    this.password = password;
    this.serverId = serverId;
    this.connectionState = 'authenticating';
    const packet = this.createLoginPacket(account, password);
    await this.sendPacket(packet);
  }

  // Server list request (ConnectServer): C1 [size][F4][06] — PORT REAL do
  // SendRequestServerList (wsclientinline.h: CStreamPacketEngine Init(0xC1,0xF4)
  // + BYTE 0x06 → bytes C1 04 F4 06). O ConnectServer responde C2 …F4 06
  // com {WORD count} + N×{WORD ServerCode, BYTE Percent, BYTE type} (C# ConnectServerProtocol.h).
  async requestServerList() {
    const pkt = this.buildPacket(0xF4, 0x06, new Uint8Array(0));
    await this.sendPacket(pkt);
  }

  // Server address request (ConnectServer): C1 [size][F4][03][WORD serverCode]
  // SendRequestServerAddress (wsclientinline.h). Resposta: C1 F4 03 IP[16] WORD port.
  async requestServerAddress(serverCode) {
    const payload = new Uint8Array(2);
    payload[0] = serverCode & 0xFF;
    payload[1] = (serverCode >> 8) & 0xFF;
    const pkt = this.buildPacket(0xF4, 0x03, payload);
    await this.sendPacket(pkt);
  }

  // Character list request (GameServer): C1 [size][F3][00][byLanguage]
  // SendRequestCharactersList (wsclientinline.h). Resposta: C1 F3 00 com
  // [ClassCode][MoveCnt][count][MaxCharacter] + N×{BYTE slot, Name[10], WORD
  // Level, BYTE CtlCode, BYTE CharSet[18], BYTE GuildStatus} = 33B por char
  // (PMSG_CHARACTER_LIST, WSclient.h — sizeof 33, alignment 1).
  async requestCharacterList(byLanguage = 0) {
    const pkt = this.buildPacket(0xF3, 0x00, new Uint8Array([byLanguage & 0xFF]));
    await this.sendPacket(pkt);
  }

  // SendRequestFinishLoading (clean Main 5.2 wsclientinline.h:360-365):
  // spe.Init(C1,F3); spe << 0x12; spe.Send() => C1 04 F3 12.
  createFinishLoadingPacket() {
    return this.buildPacket(0xF3, 0x12, new Uint8Array(0));
  }

  async requestFinishLoading() {
    await this.sendPacket(this.createFinishLoadingPacket());
  }

  // Create character (GameServer): C1 [size][F3][01][name 10B nullpad]
  // [byte ((Class<<4)+Skin)] — SendRequestCreateCharacter
  // (wsclientinline.h:318-328; PREQUEST_CREATE_CHARACTER WSclient.h:430).
  // Resposta F3 01: [Result][Name10][Slot][Level:2][Class] — Result 1=OK
  // (ReceiveCreateCharacter WSclient.cpp:560), 0/2=fail.
  // Class = ENUM DO SERVIDOR (DW=0, DK=1, ELF=2, MG=3, DL=4, SUM=5, RF=6 —
  // ObjectManager.cpp:1672; NÃO os ids de exibição da UI).
  async requestCreateCharacter(name, classId, skin = 0) {
    const payload = new Uint8Array(11);
    this.writeString(payload, 0, String(name || '').slice(0, 10), 10);
    payload[10] = ((((classId ?? 0) & 0xF) << 4) + (skin & 0xF)) & 0xFF;
    const pkt = this.buildPacket(0xF3, 0x01, payload);
    await this.sendPacket(pkt);
  }

  // ===== Skill cast real (GameServer) — autoridade wsclientinline.h =====

  // SendRequestMagic (wsclientinline.h:570-591): C1 [size][0x19]
  // [TypeHI][TypeLO][KeyHI][KeyLO] — magia direcionada a um alvo por Key.
  // PC também aplica throttle 300ms (g_dwLatestMagicTick) — o guard fica
  // no consumidor (GameApp._useSkill), aqui só o frame fiel.
  // spe.Init(0xC1, 0x19) + HIBYTE(LOBYTE) do WORD Type + Key em 2B BE.
  createMagicPacket(type, key) {
    const payload = new Uint8Array(4);
    payload[0] = ((type >> 8) & 0xFF); // HIBYTE(p_Type)
    payload[1] = (type & 0xFF);        // LOBYTE(p_Type)
    payload[2] = ((key >> 8) & 0xFF);  // Key>>8
    payload[3] = (key & 0xFF);         // Key&0xff
    const total = 3 + payload.length; // [C1][size][0x19][payload] — size=7
    const buf = new Uint8Array(total);
    buf[0] = HEADER_TYPE.C1;
    buf[1] = total & 0xFF;
    buf[2] = 0x19; // MAIN_OPCODE.MAGIC (MUOpCodes.js:47/497)
    buf.set(payload, 3);
    return buf;
  }

  // SendRequestAttack (wsclientinline.h): C1 07 11 [KeyH][KeyL][AT_ATTACK1][Dir].
  // O cliente solicita o ataque; dano/sucesso/action continuam autoritativos
  // nos RX 0x11/0x18. Nenhum dano e calculado neste caminho TX.
  createAttackPacket(key, dir, attackType = 0x00) {
    const target = Number(key);
    const direction = Number(dir);
    if (!Number.isInteger(target) || target < 0 || target > 0x7FFF) {
      throw new RangeError(`attack target key invalida: ${key}`);
    }
    if (!Number.isInteger(direction) || direction < 0 || direction > 7) {
      throw new RangeError(`attack direction invalida: ${dir}`);
    }
    const buf = new Uint8Array(7);
    buf[0] = HEADER_TYPE.C1;
    buf[1] = 7;
    buf[2] = 0x11; // PACKET_ATTACK
    buf[3] = (target >> 8) & 0xFF;
    buf[4] = target & 0xFF;
    buf[5] = attackType & 0xFF; // AT_ATTACK1 == 0
    buf[6] = direction & 0xFF;
    return buf;
  }

  async requestAttack(key, dir) {
    await this.sendPacket(this.createAttackPacket(key, dir, 0x00));
  }

  // SendRequestAddPoint (current Main 5.2 / PcBuildAddPoint):
  // C1 05 F3 06 type, where type 0..4 = STR/DEX/VIT/ENE/LEAD.
  // No optimistic stat mutation is allowed; F3:06/F3:E0/F3:E1 own state.
  createAddPointPacket(statType) {
    const t = Number(statType);
    if (!Number.isInteger(t) || t < 0 || t > 4) throw new RangeError(`add-point type invalido: ${statType}`);
    return new Uint8Array([HEADER_TYPE.C1, 0x05, 0xF3, 0x06, t & 0xFF]);
  }

  async requestAddPoint(statType) {
    await this.sendPacket(this.createAddPointPacket(statType));
  }

  // SendRequestGetItem (wsclientinline.h): C1 05 22 keyH keyL.
  createGetItemPacket(key) {
    const k = Number(key);
    if (!Number.isInteger(k) || k < 0 || k > 0x7FFF) throw new RangeError(`ground item key invalida: ${key}`);
    return new Uint8Array([HEADER_TYPE.C1, 0x05, 0x22, (k >> 8) & 0xFF, k & 0xFF]);
  }

  async requestGetItem(key) {
    await this.sendPacket(this.createGetItemPacket(key));
  }

  // SendRequestDropItem (wsclientinline.h): C1 06 23 x y inventoryIndex.
  createDropItemPacket(inventoryIndex, x, y) {
    for (const [name, v] of [['inventoryIndex', inventoryIndex], ['x', x], ['y', y]]) {
      if (!Number.isInteger(Number(v)) || Number(v) < 0 || Number(v) > 0xFF) throw new RangeError(`${name} invalido: ${v}`);
    }
    return new Uint8Array([HEADER_TYPE.C1, 0x06, 0x23, x & 0xFF, y & 0xFF, inventoryIndex & 0xFF]);
  }

  async requestDropItem(inventoryIndex, x, y) {
    await this.sendPacket(this.createDropItemPacket(inventoryIndex, x, y));
  }

  // SendRequestEquipmentItem (wsclientinline.h): 16-byte body after head 0x24.
  // Body: srcType,srcIndex,itemType,level,durability,option1,extOption,
  // splitType,spareBits,socket[5],dstType,dstIndex.
  createEquipmentItemPacket(data) {
    const sockets = data?.socketOptions ?? data?.socketBits ?? new Uint8Array(5);
    if (!sockets || sockets.length < 5) throw new RangeError('socketOptions requer 5 bytes');
    const payload = new Uint8Array(16);
    let o = 0;
    payload[o++] = data.srcType & 0xFF;
    payload[o++] = data.srcIndex & 0xFF;
    payload[o++] = data.itemType & 0xFF;
    payload[o++] = data.level & 0xFF;
    payload[o++] = data.durability & 0xFF;
    payload[o++] = data.option1 & 0xFF;
    payload[o++] = data.extOption & 0xFF;
    payload[o++] = data.splitType & 0xFF;
    payload[o++] = data.spareBits & 0xFF;
    for (let i = 0; i < 5; i++) payload[o++] = sockets[i] & 0xFF;
    payload[o++] = data.dstType & 0xFF;
    payload[o++] = data.dstIndex & 0xFF;
    const out = new Uint8Array(3 + payload.length);
    out[0] = HEADER_TYPE.C1; out[1] = out.length; out[2] = 0x24; out.set(payload, 3);
    return out;
  }

  async requestEquipmentItem(data) {
    await this.sendPacket(this.createEquipmentItemPacket(data));
  }

  // ===== Warehouse / Storage — clean Main 5.2 wsclientinline.h authority =====
  // These opcodes use PBMSG_HEADER without subcode. Never route them through
  // buildPacket(), which emits a PSBMSG subcode byte.
  _buildC1NoSub(headcode, payload = new Uint8Array(0)) {
    const body = payload instanceof Uint8Array ? payload : Uint8Array.from(payload || []);
    const total = 3 + body.length;
    if (total > 0xFF) throw new RangeError(`C1 no-sub demasiado grande: ${total}`);
    const out = new Uint8Array(total);
    out[0] = HEADER_TYPE.C1; out[1] = total & 0xFF; out[2] = headcode & 0xFF;
    out.set(body, 3);
    return out;
  }

  createStorageGoldPacket(flag, gold) {
    const f = Number(flag), g = Number(gold);
    if (!Number.isInteger(f) || (f !== 0 && f !== 1)) throw new RangeError(`storage gold flag invalida: ${flag}`);
    if (!Number.isInteger(g) || g < 0 || g > 0xFFFFFFFF) throw new RangeError(`storage gold invalido: ${gold}`);
    const payload = new Uint8Array(5);
    const dv = new DataView(payload.buffer);
    payload[0] = f & 0xFF;
    dv.setUint32(1, g >>> 0, true);
    return this._buildC1NoSub(0x81, payload);
  }

  async requestStorageGold(flag, gold) { await this.sendPacket(this.createStorageGoldPacket(flag, gold)); }

  createStorageExitPacket() { return this._buildC1NoSub(0x82); }
  async requestStorageExit() { await this.sendPacket(this.createStorageExitPacket()); }

  createStoragePasswordPacket(type, password, residentNumber = '') {
    const t = Number(type), pw = Number(password);
    if (!Number.isInteger(t) || t < 0 || t > 0xFF) throw new RangeError(`storage password type invalido: ${type}`);
    if (!Number.isInteger(pw) || pw < 0 || pw > 0xFFFF) throw new RangeError(`storage password invalido: ${password}`);
    const payload = new Uint8Array(23);
    const dv = new DataView(payload.buffer);
    payload[0] = t & 0xFF;
    dv.setUint16(1, pw & 0xFFFF, true);
    this.writeString(payload, 3, String(residentNumber || '').slice(0, 20), 20);
    return this._buildC1NoSub(0x83, payload);
  }

  async requestStoragePassword(type, password, residentNumber = '') {
    await this.sendPacket(this.createStoragePasswordPacket(type, password, residentNumber));
  }

  createChangeWarehousePacket(targetWarehouse) {
    const target = Number(targetWarehouse);
    if (!Number.isInteger(target) || target < 1 || target > 0xFFFFFFFF) throw new RangeError(`warehouse alvo invalido: ${targetWarehouse}`);
    const payload = new Uint8Array(5);
    const dv = new DataView(payload.buffer);
    payload[0] = 0; // clean Main 5.2 SendRequestChangeWare flag
    dv.setUint32(1, target >>> 0, true);
    return this._buildC1NoSub(0x84, payload);
  }

  async requestChangeWarehouse(targetWarehouse) { await this.sendPacket(this.createChangeWarehousePacket(targetWarehouse)); }

  createVaultCostPacket() { return this._buildC1NoSub(0x80); }
  async requestVaultCost() { await this.sendPacket(this.createVaultCostPacket()); }

  createVaultBuyPacket() { return this._buildC1NoSub(0x85); }
  async requestVaultBuy() { await this.sendPacket(this.createVaultBuyPacket()); }

  // SendChat (wsclientinline.h): C1 [size] 00 [ID 10B] [message\0].
  // O prefixo (~ party, @ guild, $ gens) e responsabilidade do input owner.
  createChatPacket(senderName, message) {
    const enc = new TextEncoder();
    const idRaw = enc.encode(String(senderName || '').slice(0, 10));
    const msgRaw = enc.encode(String(message || '').slice(0, 80));
    const total = 3 + 10 + msgRaw.length + 1;
    if (total > 0xFF) throw new RangeError('chat packet > C1');
    const out = new Uint8Array(total);
    out[0] = HEADER_TYPE.C1; out[1] = total; out[2] = 0x00;
    out.set(idRaw.subarray(0, 10), 3);
    out.set(msgRaw, 13);
    out[13 + msgRaw.length] = 0;
    return out;
  }

  async requestChat(senderName, message) {
    await this.sendPacket(this.createChatPacket(senderName, message));
  }

  // SendChatWhisper (clean Main 5.2 wsclientinline.h):
  // C1 [size] 02 [TargetID 10B] [message\0].
  createWhisperPacket(targetId, message) {
    const enc = new TextEncoder();
    const idRaw = enc.encode(String(targetId || '').slice(0, 10));
    const msgRaw = enc.encode(String(message || '').slice(0, 80));
    const total = 3 + 10 + msgRaw.length + 1;
    if (total > 0xFF) throw new RangeError('whisper packet > C1');
    const out = new Uint8Array(total);
    out[0] = HEADER_TYPE.C1; out[1] = total; out[2] = 0x02;
    out.set(idRaw.subarray(0, 10), 3);
    out.set(msgRaw, 13); out[13 + msgRaw.length] = 0;
    return out;
  }

  async requestWhisper(targetId, message) {
    await this.sendPacket(this.createWhisperPacket(targetId, message));
  }

  createTalkPacket(npcKey) {
    const key = Number(npcKey);
    if (!Number.isInteger(key) || key < 0 || key > 0x7FFF) throw new RangeError(`npc key invalida: ${npcKey}`);
    return this._buildC1NoSub(0x30, Uint8Array.from([(key >> 8) & 0xFF, key & 0xFF]));
  }

  async requestTalk(npcKey) {
    await this.sendPacket(this.createTalkPacket(npcKey));
  }

  // Main 5.2 wsclientinline.h SendRequestAction macro:
  //   C1 05 18 [Angle] [Action]
  // PREQUEST_ACTION includes two target-key bytes in the struct declaration,
  // but the macro itself serializes only Angle+Action; preserve the actual wire.
  createActionPacket(action, angle) {
    const a=Number(action), d=Number(angle);
    if (!Number.isInteger(a) || a < 0 || a > 0xFF) throw new RangeError(`action invalida: ${action}`);
    if (!Number.isInteger(d) || d < 0 || d > 7) throw new RangeError(`action angle invalido: ${angle}`);
    return this._buildC1NoSub(0x18, Uint8Array.from([d & 0xFF, a & 0xFF]));
  }

  async requestAction(action, angle) {
    const classic=this.createActionPacket(action, angle);
    if (this.serverType === 'android') {
      // Retained Main/mobile authority: Android_SendClassicStreamPacket wraps
      // the exact classic CStreamPacketEngine bytes in ProtocolHead::BOTH_MESSAGE(11).
      // Current Web Android lane is the legacy/plain classic transport (no SPE1
      // capability state is negotiated here), so preserve those bytes verbatim.
      const pkt=new Uint8Array(6+classic.length); const dv=new DataView(pkt.buffer);
      dv.setUint16(0,RealMUProtocol.BOTH_HEAD.BOTH_MESSAGE,true);
      dv.setUint32(2,classic.length,true); pkt.set(classic,6);
      await this.sendPacket(pkt);
      return true;
    }
    await this.sendPacket(classic);
    return true;
  }


  createBuyPacket(index) {
    if (!Number.isInteger(index) || index < 0 || index > 0xFF) throw new RangeError(`shop index invalido: ${index}`);
    return this._buildC1NoSub(0x32, Uint8Array.from([index & 0xFF]));
  }
  async requestBuy(index) { await this.sendPacket(this.createBuyPacket(index)); }

  createSellPacket(index) {
    if (!Number.isInteger(index) || index < 0 || index > 0xFF) throw new RangeError(`inventory index invalido: ${index}`);
    return this._buildC1NoSub(0x33, Uint8Array.from([index & 0xFF]));
  }
  async requestSell(index) { await this.sendPacket(this.createSellPacket(index)); }

  createRepairPacket(index, addGold = 0) {
    if (!Number.isInteger(index) || index < 0 || index > 0xFF) throw new RangeError(`repair index invalido: ${index}`);
    if (!Number.isInteger(addGold) || addGold < 0 || addGold > 0xFF) throw new RangeError(`repair addGold invalido: ${addGold}`);
    return this._buildC1NoSub(0x34, Uint8Array.from([index & 0xFF, addGold & 0xFF]));
  }
  async requestRepair(index, addGold = 0) { await this.sendPacket(this.createRepairPacket(index, addGold)); }

  async requestMagic(type, key) {
    await this.sendPacket(this.createMagicPacket(type, key));
  }

  // SendRequestMagicContinue (wsclientinline.h:667-693):
  // C1 0D 1E [TypeHI][TypeLO][x][y][angle][dest][tpos][TKeyHI][TKeyLO][serial].
  // MakeSkillSerialNumber(NULL) retorna 0; os branches BK auditados nesta
  // revisão passam exatamente NULL/0. Não inventar contador quando o owner
  // não fornece ponteiro de serial.
  createMagicContinuePacket(type, x, y, angle, dest, tpos, targetKey, skillSerial = 0) {
    const vals = { type, x, y, angle, dest, tpos, targetKey, skillSerial };
    if (!Number.isInteger(type) || type < 0 || type > 0xFFFF) throw new RangeError(`magic continue type invalido: ${type}`);
    for (const k of ['x', 'y', 'angle', 'dest', 'tpos', 'skillSerial']) {
      const v = vals[k];
      if (!Number.isInteger(v) || v < 0 || v > 0xFF) throw new RangeError(`magic continue ${k} invalido: ${v}`);
    }
    if (!Number.isInteger(targetKey) || targetKey < 0 || targetKey > 0xFFFF) {
      throw new RangeError(`magic continue targetKey invalido: ${targetKey}`);
    }
    const payload = new Uint8Array(10);
    payload[0] = (type >> 8) & 0xFF;
    payload[1] = type & 0xFF;
    payload[2] = x & 0xFF;
    payload[3] = y & 0xFF;
    payload[4] = angle & 0xFF;
    payload[5] = dest & 0xFF;
    payload[6] = tpos & 0xFF;
    payload[7] = (targetKey >> 8) & 0xFF;
    payload[8] = targetKey & 0xFF;
    payload[9] = skillSerial & 0xFF;
    const total = 3 + payload.length;
    const buf = new Uint8Array(total);
    buf[0] = HEADER_TYPE.C1;
    buf[1] = total & 0xFF;
    buf[2] = 0x1E;
    buf.set(payload, 3);
    return buf;
  }

  async requestMagicContinue(type, x, y, angle, dest, tpos, targetKey, skillSerial = 0) {
    await this.sendPacket(this.createMagicContinuePacket(type, x, y, angle, dest, tpos, targetKey, skillSerial));
  }

  // SendRequestMagicAttack (wsclientinline.h:607-643): C1 [size][0xDB]
  // [TypeHI][TypeLO][x][y][serial][count][ {KeyHI}{KeyLO}{skillSerial} × count ]
  // — magia em área/multi-alvo. SERIAL: o PC NÃO envia serial cru — passa
  // MakeSkillSerialNumber(&Serial) (ZzzInterface.cpp:4705-4714): contador
  // global WORD, ++ antes de gravar, wrap >50 → 1 (nunca 0). Portado 1:1.
  static g_byLastSkillSerialNumber = 0;
  makeSkillSerialNumber() {
    RealMUProtocol.g_byLastSkillSerialNumber++;
    if (RealMUProtocol.g_byLastSkillSerialNumber > 50) RealMUProtocol.g_byLastSkillSerialNumber = 1;
    return RealMUProtocol.g_byLastSkillSerialNumber & 0xFF;
  }

  createMagicAttackPacket(type, x, y, targets, skillSerial) {
    const count = targets?.length ?? 0;
    const payload = new Uint8Array(6 + count * 3);
    payload[0] = ((type >> 8) & 0xFF);
    payload[1] = (type & 0xFF);
    payload[2] = x & 0xFF;
    payload[3] = y & 0xFF;
    payload[4] = this.makeSkillSerialNumber(); // MakeSkillSerialNumber — normalizado 1..50
    payload[5] = count & 0xFF;
    for (let i = 0; i < count; i++) {
      const o = 6 + i * 3;
      const k = targets[i]?.key ?? targets[i] ?? 0;
      payload[o] = ((k >> 8) & 0xFF);
      payload[o + 1] = (k & 0xFF);
      payload[o + 2] = (skillSerial ?? 0) & 0xFF; // WORD truncado a BYTE no wire (PC idem)
    }
    const total = 3 + payload.length;
    const buf = new Uint8Array(total);
    buf[0] = HEADER_TYPE.C1;
    buf[1] = total & 0xFF;
    buf[2] = 0xDB; // SEND.MAGIC_ATTACK (MUOpCodes.js:499, PACKET_MAGIC_ATTACK)
    buf.set(payload, 3);
    return buf;
  }

  async requestMagicAttack(type, x, y, targets, skillSerial) {
    await this.sendPacket(this.createMagicAttackPacket(type, x, y, targets, skillSerial));
  }

  // Join map server (GameServer): C1 [size][F3][03][name 10B null-padded]
  // SendRequestJoinMapServer (wsclientinline.h — REQUEST_JOIN_MAP_SERVER;
  // disparado pelo CONECTAR da char select). O GS responde com a entrada no
  // mundo (mapa, posição, inventário).
  //
  // LANE ANDROID (55902): DEVE usar frame olc::net id=6 BOTH_POSITION com o
  // nome — o handler do servidor (AndroidLayer.cpp:298-331) além de chamar
  // CGCharacterInfoRecv seta LastServerCode=ServerCode, sem o qual o caminho
  // clássico F3:03 faz CheckMapServerMove(map,-1) → CloseClient (disconnect).
  async requestJoinMapServer(name) {
    const payload = new Uint8Array(10);
    this.writeString(payload, 0, String(name || '').slice(0, 10), 10);
    if (this.serverType === 'android') {
      const pkt = new Uint8Array(6 + 10);
      const dv = new DataView(pkt.buffer);
      dv.setUint16(0, RealMUProtocol.BOTH_HEAD.BOTH_POSITION, true);
      dv.setUint32(2, 10, true);
      pkt.set(payload, 6);
      await this.sendPacket(pkt);
      return;
    }
    const pkt = this.buildPacket(0xF3, 0x03, payload);
    await this.sendPacket(pkt);
  }

  // ===== BOTH_CONNECT (protocolo novo do Main 5.2 — olc::net) =====
  // PC_ENGINE/ProtocolSend.h: enum ProtocolHead { CLIENT_ACCEPT=0,
  // CLIENT_LIVE_CLIENT=1, SERVER_CONNECT=2, SERVER_DISCONNECT=3,
  // BOTH_CONNECT_LOGIN=4, BOTH_CONNECT_CHARACTER=5, BOTH_POSITION=6,
  // BOTH_MOVE=7, BOTH_ATTACK1=8, BOTH_ATTACK2=9, BOTH_ATTACK3=10,
  // BOTH_MESSAGE=11 } — header olc::net: uint32 LE size + uint16 LE id.
  // PMSG_CONNECT_ACCOUNT_SEND (ProtocolSend.h:26): {char account[10],
  // char password[20], DWORD TickCount, BYTE ClientVersion[5],
  // BYTE ClientSerial[16]} = 55 bytes PLAIN (sem SimpleModulus).
  // PROVA REAL: GS C:\ms aceitou login 'teste' às 15:34:17 via esse formato
  // (AndroidLayer 55902 — AddAccountInfo + BOTH_CONNECT_CHARACTER no log),
  // enquanto o F1:01 C3 clássico trava em 'Packet encryption error'.
  static BOTH_HEAD = {
    CLIENT_ACCEPT: 0, CLIENT_LIVE_CLIENT: 1,
    SERVER_CONNECT: 2, SERVER_DISCONNECT: 3,
    BOTH_CONNECT_LOGIN: 4, BOTH_CONNECT_CHARACTER: 5,
    BOTH_POSITION: 6, BOTH_MOVE: 7, BOTH_ATTACK1: 8, BOTH_ATTACK2: 9,
    BOTH_ATTACK3: 10, BOTH_MESSAGE: 11,
  };

  /**
   * Pacote BOTH_CONNECT_LOGIN (frame ASIO do AndroidLayer do GS).
   * WIRE REAL (SocketManager_android.cpp: 'frames ASIO normais: [uint16_t id]
   * [uint32_t bodySize][body] (6 bytes header)' + AndroidRawSend
   * 'memcpy(frameBuf,&id,2); memcpy(frameBuf+2,&bodySize,4)'):
   *   [u16 LE id=4][u32 LE bodySize=55][body 55B]
   * Body = PMSG_CONNECT_ACCOUNT_SEND (ProtocolSend.h:26): {account[10],
   * password[20], TickCount u32, ClientVersion[5], ClientSerial[16]} PLAIN.
   * PROVA REAL: GS C:\ms aceitou login 'teste' às 15:34:17 via esse formato
   * (AndroidLayer 55902), enquanto o F1:01 C3 trava em 'Packet encryption error'.
   * @param {string} account  ID da conta (max 10)
   * @param {string} password senha (max 20)
   * @param {Uint8Array} version 5 bytes (ex: '10405' = [49,48,52,48,53])
   * @param {Uint8Array} serial 16 bytes (ClientSerial real do cliente)
   */
  buildBothConnectLogin(account, password, version, serial) {
    const H = RealMUProtocol.BOTH_HEAD;
    const body = new Uint8Array(55);
    // BuxConvert ENCRYPT (AndroidLayer.cpp:245-246 decifra account e password
    // antes de autenticar; chave ANDROID_BUX_KEY {0xfc,0xcf,0xab} AndroidLayer.h:73;
    // XOR com ciclo reiniciando em cada campo). Prova: 'teste'→88 aa d8 88 aa.
    const bux = (str, len) => {
      const out = new Uint8Array(len);
      const KEY = [0xFC, 0xCF, 0xAB];
      for (let i = 0; i < len; i++) {
        const ch = i < str.length ? str.charCodeAt(i) : 0;
        out[i] = ch ^ KEY[i % 3];
      }
      return out;
    };
    body.set(bux(String(account || '').slice(0, 10), 10), 0);
    body.set(bux(String(password || '').slice(0, 20), 20), 10);
    const dv = new DataView(body.buffer);
    dv.setUint32(30, Date.now() & 0xFFFFFFFF, true); // TickCount
    const ver = version || Uint8Array.from([0x31, 0x30, 0x34, 0x30, 0x35]); // '10405'
    body.set(ver, 34);
    // Serial OBRIGATÓRIO: GS faz memcmp com "TbYehR2hFUPBKgZj" (16 chars —
    // GameServerInfo - Common.dat ServerSerial). Zero-serial → result=6.
    // Prova: tools/e2e-android-flow.cjs só obteve result=1 com esse serial.
    const DEFAULT_SERIAL = Uint8Array.from(
      Array.from('TbYehR2hFUPBKgZj', (c) => c.charCodeAt(0)));
    const ser = serial || DEFAULT_SERIAL;
    body.set(ser.subarray(0, 16), 39);
    // Frame ASIO do GS: [u16 LE id][u32 LE bodySize][body]
    const pkt = new Uint8Array(6 + body.length);
    const pdv = new DataView(pkt.buffer);
    pdv.setUint16(0, H.BOTH_CONNECT_LOGIN, true); // id primeiro (AndroidRawSend)
    pdv.setUint32(2, body.length, true);           // bodySize depois
    pkt.set(body, 6);
    return pkt;
  }

  /** Envia login pelo protocolo BOTH (Main 5.2 novo) — BuxConvert interno. */
  async loginBothConnect(account, password, version, serial) {
    const pkt = this.buildBothConnectLogin(account, password, version, serial);
    await this.sendPacket(pkt);
  }

  /**
   * Pedido de char list pelo fluxo BOTH (AndroidLayer.cpp:269-291):
   * frame id=5 (APH_BOTH_CONNECT_CHARACTER) com body VAZIO — o cliente envia
   * após o login result=1; o GS chama CGCharacterListRecv → DataServer →
   * DataSend detecta Android → AndroidSendWrapped → BOTH_MESSAGE id=11 com o
   * C1/C2 F3:00 clássico embutido (comprovado real: C2 0153 F3 00, 10 chars
   * reais da conta 'teste': MagoX, LevelUP, DLCorno, Hugo, Magno...).
   */
  async requestBothCharacterList() {
    const pkt = new Uint8Array(6);
    const dv = new DataView(pkt.buffer);
    dv.setUint16(0, RealMUProtocol.BOTH_HEAD.BOTH_CONNECT_CHARACTER, true); // id=5
    dv.setUint32(2, 0, true); // bodySize=0
    await this.sendPacket(pkt);
  }

  // Clean PC / retained mobile SendCharacterMoveNew one-node path.
  // PMSG_MOVE_SEND body is always 10 bytes: firstTargetX,firstTargetY,path[8].
  // HeroMovementV11::EncodePcMoveBody validates the step against the origin,
  // then writes nodes[0] to body[0..1]. For one node path[0].high is the
  // movement/facing direction and path[0].low == PathNum-1 == 0.
  buildBothMoveStep(x, y, dir) {
    if (!Number.isInteger(x) || x < 0 || x > 255 || !Number.isInteger(y) || y < 0 || y > 255)
      throw new RangeError('BOTH_MOVE tile out of range');
    if (!Number.isInteger(dir) || dir < 0 || dir > 7) throw new RangeError('BOTH_MOVE dir out of range');
    const body = new Uint8Array(10);
    body[0]=x; body[1]=y; body[2]=(dir<<4)&0xF0;
    const pkt=new Uint8Array(16); const dv=new DataView(pkt.buffer);
    dv.setUint16(0,RealMUProtocol.BOTH_HEAD.BOTH_MOVE,true);
    dv.setUint32(2,body.length,true); pkt.set(body,6);
    return pkt;
  }

  async requestBothMoveStep(x, y, dir) {
    if (this.serverType !== 'android') throw new Error('BOTH_MOVE requires android/55902 lane');
    await this.sendPacket(this.buildBothMoveStep(x,y,dir));
  }

  // SendCharacterMove(PathNum=1) usado como pre-facing por WHEEL, MULTI_SHOT
  // e LIGHTNING_SHOCK. Classic: C1 06 D4 x y [dir<<4]. NEW_PROTOCOL_SYSTEM:
  // BOTH_MOVE body fixo de 10 bytes com o mesmo path[0].
  buildClassicMoveFacing(x, y, dir) {
    if (!Number.isInteger(x) || x < 0 || x > 255 || !Number.isInteger(y) || y < 0 || y > 255)
      throw new RangeError('MOVE facing tile out of range');
    if (!Number.isInteger(dir) || dir < 0 || dir > 7) throw new RangeError('MOVE facing dir out of range');
    return new Uint8Array([HEADER_TYPE.C1, 0x06, MAIN_OPCODE.MOVE, x & 0xFF, y & 0xFF, (dir << 4) & 0xF0]);
  }

  buildPcFacingMove(x, y, dir) {
    return this.serverType === 'android'
      ? this.buildBothMoveStep(x, y, dir)
      : this.buildClassicMoveFacing(x, y, dir);
  }

  async requestPcFacingMove(x, y, dir) {
    await this.sendPacket(this.buildPcFacingMove(x, y, dir));
  }

  _handleTcpChunk(chunk) {
    if (!(chunk instanceof Uint8Array) || !chunk.length) return;
    if (this.serverType === 'android' || this._looksBoth(chunk)) {
      this._dispatchBoth(chunk);
      return;
    }
    const useXor = (this.serverType === 'game');
    if (!this.packetManager.addData(chunk)) return;
    let raw;
    while ((raw = this.packetManager.extractPacket(useXor)) !== null) {
      let decoded = raw;
      if (raw[0] === HEADER_TYPE.C3 || raw[0] === HEADER_TYPE.C4) {
        if (!this._cryptoReady) {
          console.warn('[MU Protocol] C3/C4 clássico recebido sem Dec2.dat — fail-closed');
          continue;
        }
        try { decoded = this.packetManager.decryptEncryptedFrame(raw); }
        catch (e) { console.warn('[MU Protocol] C3/C4 decrypt rejeitado:', e?.message || e); continue; }
      }
      const packet = this._parseDecoded(decoded);
      if (packet) this.handlers.onPacket(packet);
    }
  }

  // Handle mensagens do gateway (JSON control + legacy base64 fallback)
  handleMessage(msg) {
    switch (msg.type) {
      case 'connected':
        // R16 integration guard: lane authority is checked BEFORE generation.
        // A delayed event from the old CS socket may carry a numerically newer
        // generation than the currently-confirmed GS generation; it must never
        // advance _tcpGeneration or publish connection state for another lane.
        if (msg.server && msg.server !== this.serverType) {
          console.info(`[MU Protocol] connected stale ignorado: ${msg.server} (lane atual ${this.serverType})`);
          break;
        }
        if (Number.isInteger(msg.generation) && msg.generation < this._tcpGeneration) {
          console.info(`[MU Protocol] connected generation stale ignorado: ${msg.generation} < ${this._tcpGeneration}`);
          break;
        }
        if (Number.isInteger(msg.generation)) this._tcpGeneration = msg.generation;
        // Gateway confirmou TCP com o servidor MU real. Durante retarget CS→GS,
        // um evento atrasado do socket antigo pode chegar fora de ordem: nunca
        // deixe a lane anterior sobrescrever o estado da lane atual.
        this.isConnected = true;
        this.connectionState = 'connected';
        this._retargeting = false;
        this.reconnectAttempts = 0;
        this._tcpReconnectAttempts = 0;
        if (this._resendConnectTimer) { clearTimeout(this._resendConnectTimer); this._resendConnectTimer = null; }
        if (this._wsReconnectTimer) { clearTimeout(this._wsReconnectTimer); this._wsReconnectTimer = null; }
        this._resolveTcpConnectedWaiters();
        this.handlers.onConnect();
        // FLUXO PC (WSclient.cpp): ao conectar no ConnectServer o cliente pede
        // a server list (SendRequestServerList C1 F4 06) — sem isso o TCP fica
        // idle e o CS derruba a conexão (wire: 'disconnected' logo após open).
        if (this.serverType === 'connect') {
          this.requestServerList().catch(() => {});
        }
        break;
      case 'disconnected':
        // Same ordering as `connected`: reject another lane before consulting
        // generation so a stale CS close cannot perturb the active GS session.
        if (msg.server && msg.server !== this.serverType) {
          console.info(`[MU Protocol] disconnected stale ignorado: ${msg.server} (lane atual ${this.serverType})`);
          break;
        }
        if (Number.isInteger(msg.generation) && msg.generation < this._tcpGeneration) {
          console.info(`[MU Protocol] disconnected generation stale ignorado: ${msg.generation} < ${this._tcpGeneration}`);
          break;
        }
        // O gateway destrói o TCP do ConnectServer antes de abrir o GameServer.
        // O `close` do socket antigo pode chegar DEPOIS do `connected` novo.
        // A tag server do gateway permite descartar esse evento stale sem criar
        // reconnect falso nem derrubar a sessão já estabelecida no GS.
        this.isConnected = false;
        this.connectionState = 'offline';
        this.handlers.onDisconnect();
        // RECUPERAÇÃO (contrato PC: reconexão de socket morto): o gateway
        // mantém o WS aberto e só reabre o TCP quando pedimos 'connect' de
        // novo. Sem isso, um TCP idle-killed deixava o cliente offline para
        // sempre com WS vivo (sendPacket escrevia no vazio).
        if (this._retargeting) {
          // Fechamento do TCP antigo durante CS→GS no mesmo WS; o novo `connected`
          // chega em seguida. Não agendar reconnect do target antigo.
          this.connectionState = 'connecting-game';
          break;
        }
        if (this.ws && this.ws.readyState === 1 && !this._manualDisconnect) {
          // Um TCP pode emitir mais de um close/error em cascata. Nunca deixar
          // múltiplos reconnect timers sobreviverem e reabrirem o GS depois que
          // a sessão já voltou (sintoma físico R14: "Conectado" repetido).
          if (this._resendConnectTimer) clearTimeout(this._resendConnectTimer);
          const tcpDelay = Math.min(2000, 250 * (2 ** Math.min(this._tcpReconnectAttempts++, 3)));
          this._resendConnectTimer = setTimeout(() => {
            this._resendConnectTimer = null;
            if (this.connectionState === 'offline' && this.ws
                && this.ws.readyState === 1 && !this._manualDisconnect) {
              try {
                const connect = { type: 'connect', serverType: this.serverType, binaryData: this._binaryGatewayData };
                if (this.serverType === 'game' && this.gameTarget) connect.target = this.gameTarget;
                this.ws.send(JSON.stringify(connect));
                this.connectionState = 'reconnecting';
              } catch (e) { /* segue */ }
            }
          }, tcpDelay);
        }
        break;
      case 'error':
        if (msg.server && msg.server !== this.serverType) break;
        if (Number.isInteger(msg.generation) && msg.generation < this._tcpGeneration) break;
        this.handlers.onError(new Error(msg.message));
        break;
      case 'data': {
        // Lane first: bytes from a retired CS socket are never allowed to
        // influence generation or packet reassembly for the current GS lane.
        if (msg.server && msg.server !== this.serverType) break;
        if (Number.isInteger(msg.generation) && msg.generation < this._tcpGeneration) break;
        if (Number.isInteger(msg.generation) && msg.generation > this._tcpGeneration) {
          // data não deve preceder 'connected'; fail-closed em vez de promover
          // uma geração ainda não confirmada.
          console.warn(`[MU Protocol] data de geração futura ignorado: ${msg.generation} > ${this._tcpGeneration}`);
          break;
        }
        // Gateway entrega bytes TCP brutos — reassembly + XOR via protocolo real.
        // XOR DO CONTRATO PC: os pacotes do GameServer vêm cifrados com o filtro
        // XOR (PacketManager.cpp), MAS o ConnectServer (fase server-list, porta
        // 44405) envia bytes PLAIN — verificado na source: SocketManager.cpp
        // DataSend faz WSASend direto do buffer sem cifragem. Aplicar XOR aqui
        // corromperia o F4:06 (server list). Logo: XOR só quando serverType='game'.
        const chunk = Uint8Array.from(atob(msg.data), c => c.charCodeAt(0));
        this._handleTcpChunk(chunk);
        break;
      }
    }
  }

  /**
   * Header ASIO plausível? [u16 LE id ≤ 11][u32 LE size ≤ 64K] e NÃO C1-C4.
   * (AndroidLayer do GS: id PRIMEIRO — SocketManager_android.cpp DataRecvAndroid)
   */
  _looksBoth(chunk) {
    if (chunk.length < 6) return false;
    if (chunk[0] >= 0xC1 && chunk[0] <= 0xC4) return false;
    const dv = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const id = dv.getUint16(0, true);
    const size = dv.getUint32(2, true);
    return size > 0 && size <= 65536 && 6 + size === chunk.length && id <= 11;
  }

  /**
   * Dispatch de pacote BOTH (frame ASIO do AndroidLayer — ProtocolSend.cpp:63-95).
   * Frame: [u16 LE id][u32 LE bodySize][body].
   * SERVER_CONNECT(id2): PMSG_CONNECT_CLIENT_RECV {result, index[2], ver[5]}
   * BOTH_CONNECT_LOGIN(id4): PMSG_SIMPLE_RESULT_RECV {result}
   * BOTH_CONNECT_CHARACTER(id5): body = PMSG_CHARACTER_LIST_RECV clássico
   *   (mesmo parse do F3:00 — ReceiveCharacterList é chamado nos 2 caminhos)
   * BOTH_MESSAGE(id11): carrega pacote C1/C2 clássico DENTRO (ProtocolSend.cpp:97+)
   */
  _dispatchBoth(chunk) {
    const H = RealMUProtocol.BOTH_HEAD;
    // R15.7: Android/BOTH is server-authoritative framing. Validate the complete
    // [u16 id][u32 size][body] envelope before DataView/body dispatch; malformed
    // or truncated TCP data must never become a partial protocol packet.
    if (!chunk || chunk.length < 6) {
      console.warn(`[MU BOTH] frame curto (${chunk?.length ?? 0}/6) — fail-closed`);
      return false;
    }
    const dv = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const id = dv.getUint16(0, true);        // id primeiro (AndroidRawSend)
    const size = dv.getUint32(2, true);      // bodySize depois
    if (size === 0 || size > 65536 || 6 + size !== chunk.length) {
      console.warn(`[MU BOTH] envelope inválido id=${id} bodySize=${size} frame=${chunk.length} — fail-closed`);
      return false;
    }
    const body = chunk.slice(6);
    switch (id) {
      case H.SERVER_CONNECT: {
        // PMSG_CONNECT_CLIENT_RECV = result(1)+index(2)+version(5) => 8B.
        if (body.length < 8) {
          console.warn(`[MU BOTH] SERVER_CONNECT curto (${body.length}/8) — fail-closed`);
          return false;
        }
        const result = body[0];
        this.handlers.onPacket({
          type: 0xC1, headcode: 0xF1, subcode: 0x00, size: body.length,
          payload: body, opcodeName: 'BOTH_SERVER_CONNECT',
          both: { id, result },
        });
        break;
      }
      case H.BOTH_CONNECT_LOGIN: {
        if (body.length < 1) {
          console.warn('[MU BOTH] LOGIN_RESULT vazio — fail-closed');
          return false;
        }
        const result = body[0]; // PMSG_SIMPLE_RESULT_RECV
        this.handlers.onPacket({
          type: 0xC1, headcode: 0xF1, subcode: 0x01, size: body.length,
          payload: body, opcodeName: 'BOTH_LOGIN_RESULT',
          both: { id, result },
        });
        break;
      }
      case H.BOTH_CONNECT_CHARACTER: {
        // O body É o pacote clássico C1 F3 00 COMPLETO (com header —
        // ProtocolSend.cpp:88 chama ReceiveCharacterList((BYTE*)msg.body.data())
        // que faz o cast direto p/ PMSG_CHARACTER_LIST_RECV, cujo primeiro
        // campo é PSWMSGS_HEAD C1:F3:00). Reusa _parseDecoded (strip de header):
        const packet = this._parseDecoded(body);
        if (packet) {
          packet.opcodeName = 'BOTH_CHAR_LIST';
          packet.both = { id };
          this.handlers.onPacket(packet);
        } else {
          console.warn('[MU BOTH] CHAR_LIST com header inválido:', body[0]?.toString(16));
        }
        break;
      }
      case H.BOTH_MESSAGE: {
        // Pacote C1/C2 clássico EMBUTIDO (recv[0] C1/C3 ou C2/C4) —
        // protocolo clássico por dentro (ProtocolSend.cpp:106-117).
        // R12.5 fail-closed (censo wire 2026-09-25, probe-both-wire-capture):
        // inner C3/C4 chega CIFRADO (SimpleModulus não portado) — parsear como
        // plain lia CIPHERTEXT como stats (F3:03 real era `c3 68 f3 03...`).
        // O servidor envia a MESMA informação em paralelo via frame plain
        // C1/C2 (censo: F3:10 veio plain em C2 e cifrado em C4), então pular
        // o inner cifrado NÃO perde dado — só remove leitura de lixo.
        let decodedBody = body;
        if (body[0] === 0xC3 || body[0] === 0xC4) {
          if (!this._cryptoReady) {
            this._bothCipherLogged = this._bothCipherLogged || new Set();
            const key = `nokey:${body[0]}`;
            if (!this._bothCipherLogged.has(key)) {
              this._bothCipherLogged.add(key);
              console.warn('[MU BOTH] inner C3/C4 recebido antes de Dec2.dat ficar pronto — fail-closed');
            }
            break;
          }
          try {
            decodedBody = this.packetManager.decryptEncryptedFrame(body);
            if (!decodedBody) break;
          } catch (e) {
            console.warn(`[MU BOTH] SimpleModulus decrypt rejeitou frame 0x${body[0].toString(16)}: ${e?.message || e}`);
            break;
          }
        }
        // Reusa _parseDecoded p/ strip correto do header já plain C1/C2.
        const packet = this._parseDecoded(decodedBody);
        if (packet) {
          packet.opcodeName = 'BOTH_MESSAGE';
          packet.both = { id };
          this.handlers.onPacket(packet);
        } else {
          console.warn('[MU BOTH] MESSAGE com header inválido:', body[0]?.toString(16));
        }
        break;
      }
      default:
        console.info(`[MU BOTH] id=${id} size=${size} — não mapeado ainda`);
    }
    return true;
  }

  // Parse do pacote JÁ decifrado (XOR aplicado pelo extractPacket real)
  _parseDecoded(raw) {
    const header = parseHeader(raw);
    if (!header) {
      console.warn('[MU Protocol] Header inválido:', raw[0]?.toString(16));
      return null;
    }
    // R12.5: subcode NÃO é universal no clássico MU. PC WSclient.cpp lê structs
    // por opcode direto do ReceiveBuffer; PBMSG_HEADER p/ C1/C3 = 3 bytes
    // ([C1][size][head]) — SÓ as famílias sub-codificadas (F1 login, F3 char,
    // F4 server) carregam o byte extra. Antes deste fix, TODO C1 sem sub
    // perdia 1 byte de payload (byte v[3] virava "subcode" fantasma):
    // wire real 'c1 05 de 00 0f' (charCard) era descartado
    // ("payload curto p/ charCard (1/2)") e C1 0C 26/27 (life/mana do HUD),
    // chat C1 00, teleport C1 1C e buff C1 2D herdam o mesmo deslocamento.
    // C2/C4 NÃO tocados: cláusula PWHEADER_DEFAULT_WORD (0x12/0x13/0x14/0x1C)
    // depende do start atual=5 p/ ler a WORD count pelo byte baixo (provas de
    // mundo em FLOW_STATUS) — alterar exige prova PC por família.
    // C2/C4: reformulado com a fonte PC crua (correção cfbeefaf forense):
    //   PWHEADER_DEFAULT_WORD = {PWMSG_HEADER(4B c/ byte0=C2), BYTE Value}  (WSclient.h:264)
    //   → entries começam em offset 5 = header(4B) + count(1B). payloadStart=4
    //   NÃO descarta o count: payload[0]=Value/count (cláusula já consumida pelo
    //   router: viewports pacientes do armazenamento atual). Antes: 0x12 rodava
    //   com payloadStart=5 → count virava KeyH: '163 players' = 0xA3 etc; também
    //   o "(36/37)" → boundary off-by-one consome mais 1 byte no readerEntry.
    // C4: header = [C4][sz32:4][head] = 5 bytes → payload em 5 + (sub?1:0).
    const isShortHeader = header.type === HEADER_TYPE.C1 || header.type === HEADER_TYPE.C3;
    const hasSub = C1_HAS_SUBCODE.has(header.head);
    const base = isShortHeader ? 3 : (header.type === HEADER_TYPE.C2 ? 4 : 5);
    const payloadStart = base + (hasSub ? 1 : 0);
    return {
      type: raw[0],
      headcode: header.head,
      subcode: hasSub ? header.subh : null,
      size: header.size,
      payload: raw.slice(payloadStart, header.size),
      // R12.4: preservar bytes wire para diagnóstico de layouts variantes
      // (ex.: F3:00 legacy/update>=602/padding nativo), sem redecodificar.
      raw: raw.slice(0, header.size),
      opcodeName: getOpcodeName(header.head)
    };
  }

  async attemptReconnect() {
    if (this._manualDisconnect) return; // logout voluntário não reconecta
    if (this._wsReconnectTimer) return; // já há uma tentativa pendente
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[MU Protocol] Max reconnect attempts reached');
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(this.maxReconnectDelay, this.reconnectDelay * (2 ** Math.max(0, this.reconnectAttempts - 1)));
    this._wsReconnectTimer = setTimeout(() => {
      this._wsReconnectTimer = null;
      this.connect().catch(() => {});
    }, delay);
  }

  disconnect() {
    this._manualDisconnect = true;
    this.connectionState = 'offline';
    if (this._resendConnectTimer) { clearTimeout(this._resendConnectTimer); this._resendConnectTimer = null; }
    if (this._wsReconnectTimer) { clearTimeout(this._wsReconnectTimer); this._wsReconnectTimer = null; }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export { RealMUProtocol };
export default RealMUProtocol;
