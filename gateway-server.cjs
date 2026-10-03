/**
 * MU Online WebSocket ↔ TCP Gateway
 * Bridge entre WebSocket (browser) e TCP (servidores MU reais)
 * Protocolo: C1/C2 + XOR filter (PacketManager.cpp original)
 *
 * Uso: node gateway-server.cjs
 * WS p/ cliente web: ws://localhost:9091
 * Servidores MU reais detectados em 2026-09-23 (mu-server\):
 *   ConnectServer EX603: 44405 TCP / 55557 UDP (heartbeat)
 *   GameServer EX505:    55901 TCP
 * Cliente MU nunca fala diretamente com JoinServer(55970)/DataServer(55960) —
 * essas portas são internas do stack; o gateway só precisa de CS + GS.
 */

const net = require('net');
const WebSocket = require('ws');

const MU_SERVERS = {
  connect: { host: '127.0.0.1', port: 44405 },
  game:    { host: '127.0.0.1', port: 55901 },
  // AndroidLayer (BOTH_CONNECT olc::net — ProtocolSend.h do Main 5.2): o GS
  // real aceitou login 'teste' por essa porta às 15:34:17 (log AddAccountInfo
  // Android=1 + BOTH_CONNECT_CHARACTER). Enquanto o F1:01 C3 trava em
  // 'Packet encryption error', o caminho Android é o login FUNCIONAL.
  android: { host: '127.0.0.1', port: 55902 },
  // Internal-only: kept for reference; NOT reached by the MU client protocol.
  join:    { host: '127.0.0.1', port: 55970 },
  data:    { host: '127.0.0.1', port: 55960 },
};

const XOR_FILTER = [
  0xE7, 0x6D, 0x3A, 0x89, 0xBC, 0xB2, 0x9F, 0x73,
  0x23, 0xA8, 0xFE, 0xB6, 0x49, 0x5D, 0x39, 0x5D,
  0x8A, 0xCB, 0x63, 0x8D, 0xEA, 0x7D, 0x2B, 0x5F,
  0xC3, 0xB1, 0xE9, 0x83, 0x29, 0x51, 0xE8, 0x56
];

// Reassembly de pacotes C1/C2/C3/C4 a partir do stream TCP bruto.
// mode 'classic' (C1-C4, default) | 'both' (olc::net do Main 5.2 novo:
// uint32 LE size + uint16 LE id + body — ProtocolSend.h; AndroidLayer 55902)
class PacketAssembler {
  constructor(mode = 'classic') { this.buf = Buffer.alloc(0); this.mode = mode; }

  push(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    const packets = [];
    if (this.mode === 'both') {
      // olc::net message_header = {uint16 id, uint32 size} — id PRIMEIRO.
      // Evidência wire (tools/e2e-android-flow.cjs, GS 55902):
      //   bytes 02 00 0C 00 00 00 + body[12] = id=2 SERVER_CONNECT, size=12.
      // (ler size no offset 0 aqui corrompe todos os frames!)
      while (this.buf.length >= 6) {
        const size = this.buf.readUInt32LE(2);
        if (size > 65536) { this.buf = this.buf.slice(1); continue; }
        if (this.buf.length < 6 + size) break; // incompleto
        packets.push(this.buf.slice(0, 6 + size));
        this.buf = this.buf.slice(6 + size);
      }
      return packets;
    }
    while (this.buf.length >= 2) {
      let size;
      switch (this.buf[0]) {
        case 0xC1: case 0xC3:
          size = this.buf[1];
          break;
        case 0xC2: case 0xC4:
          if (this.buf.length < 3) return packets;
          size = this.buf[1] * 256 + this.buf[2];
          break;
        default:
          // Stream corrompido — descarta 1 byte e tenta resync
          this.buf = this.buf.slice(1);
          continue;
      }
      if (size < 2) { this.buf = this.buf.slice(1); continue; }
      if (this.buf.length < size) break; // pacote incompleto, espera mais
      packets.push(this.buf.slice(0, size));
      this.buf = this.buf.slice(size);
    }
    return packets;
  }
}

// Conecta um WebSocket a um servidor MU TCP (por tipo, ou alvo explícito
// vindo do handoff F4:03 — ReceiveServerConnect entrega IP:porta do GS)
// R12.4 hardening (OWASP audit 471d): alvo arbitrário vindo do cliente seria
// SSRF/TCP-proxy direto. Só aceitamos target explícito quando ele for de fato
// um GameServer MU no loopback (44405/55901/55902); qualquer outro host:port
// é REJEITADO com log. Nunca proxy para rede interna arbitrária.
const ALLOWED_GAME_PORTS = new Set([44405, 55901, 55902]);
function parseGameTarget(target) {
  if (!target) return null;
  const m = String(target).match(/^([0-9a-zA-Z:.-]+):(\d{1,5})$/);
  if (!m) return null;
  const host = m[1].toLowerCase();
  const port = parseInt(m[2], 10);
  if (!(port >= 1 && port <= 65535)) return null;
  const isLoopback = host === '127.0.0.1' || host.startsWith('127.') || host === '::1' || host === 'localhost';
  if (!isLoopback) return null;
  if (!ALLOWED_GAME_PORTS.has(port)) return null;
  return { host: host === 'localhost' ? '127.0.0.1' : host, port };
}

function connectWSToMU(ws, serverType, target = null, generation = 0, isCurrent = () => true, useBinary = () => false) {
  const parsed = parseGameTarget(target);
  if (target && !parsed) {
    console.warn(`[Gateway] ALVO REJEITADO (SSRF guard): "${target}" — não é loopback:44405/55901/55902`);
    try { ws.send(JSON.stringify({ type: 'error', message: 'target fora da allowlist loopback:44405/55901/55902' })); } catch (e) {}
    return null;
  }
  const cfg = parsed || MU_SERVERS[serverType] || MU_SERVERS.connect;
  // Modo do assembler: 'android' (AndroidLayer 55902) fala olc::net BOTH
  // (uint32 size); demais falam C1-C4 clássico.
  const assembler = new PacketAssembler(cfg.port === 55902 ? 'both' : 'classic');

  const sock = net.createConnection({ host: cfg.host, port: cfg.port }, () => {
    // R22 latency: disable Nagle and keep the MU socket warm. Packets such as
    // move/attack/chat are tiny and must not wait for TCP coalescing.
    sock.setNoDelay(true);
    sock.setKeepAlive(true, 10000);
    console.log(`[Gateway] TCP conectado: ${serverType} ${cfg.host}:${cfg.port}${target ? ' (alvo F4:03)' : ''}`);
    if (!isCurrent()) return;
    try { ws.send(JSON.stringify({ type: 'connected', server: serverType, generation })); } catch (e) {}
  });

  sock.on('data', (chunk) => {
    for (const pkt of assembler.push(chunk)) {
      if (!isCurrent()) continue;
      try {
        if (useBinary()) ws.send(pkt, { binary: true });
        else ws.send(JSON.stringify({ type: 'data', data: pkt.toString('base64'), server: serverType, generation }));
      } catch (e) { /* ws fechou */ }
    }
  });

  sock.on('close', () => {
    // R15: ao retarget/reconnect na MESMA lane (android→android), comparar só
    // serverType não distingue o close do socket velho. Generation torna o
    // lifecycle monotônico e suprime o disconnect stale antes de chegar ao UI.
    if (!isCurrent()) return;
    try { ws.send(JSON.stringify({ type: 'disconnected', server: serverType, generation })); } catch (e) {}
  });

  sock.on('error', (err) => {
    console.error(`[Gateway] TCP erro (${serverType}): ${err.message}`);
    if (!isCurrent()) return;
    try { ws.send(JSON.stringify({ type: 'error', message: `${serverType}: ${err.message}`, server: serverType, generation })); } catch (e) {}
  });

  return sock;
}

// ============================================
// WebSocket server p/ cliente web (porta 9091)
// ============================================

// R12.4 hardening (OWASP audit 471d): bind explícito em 127.0.0.1 e limite de
// payload. O default do `ws` escuta em 0.0.0.0 (todas as interfaces), o que
// expunha o bridge TCP do CU/rede local para qualquer cliente na LAN.
// Verificado: netstat mostrava :::9091 ouvindo e o host LAN 192.168.0.100
// abria conexão TCP — risco real de SSRF/abuso remoto do gateway.
const BIND_HOST = '127.0.0.1';

const wss = new WebSocket.Server({ port: 9091, host: BIND_HOST, maxPayload: 1024 * 1024 }, () => {
  console.log('=== MU ONLINE GATEWAY READY ===');
  console.log(`WebSocket p/ cliente web: ws://${BIND_HOST}:9091`);
  console.log('Servidores MU (rotas serverType):');
  console.log('  ConnectServer: 127.0.0.1:44405 (TCP) + UDP 55559 — F4:06/F4:03');
  console.log('  GameServer:    127.0.0.1:55901 (C1-C4 + handoff F4:03)');
  console.log('  Android (GS):  127.0.0.1:55902 (BOTH_CONNECT olc::net — login funcional)');
  console.log('  JoinServer:    127.0.0.1:55970 (interno)');
  console.log('  DataServer:    127.0.0.1:55960 (interno)');
});

wss.on('connection', (ws, req) => {
  const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
  console.log(`[Gateway] Cliente web conectado: ${clientId}`);

  let tcpSocket = null;
  let currentServer = null;
  let tcpGeneration = 0;
  let binaryDataMode = false;

  ws.on('message', (raw, isBinary) => {
    // R22 latency: binary gameplay packets are the hot path. Do not convert
    // them to UTF-8 and intentionally throw JSON.parse on every move/attack.
    // Control frames stay JSON; gameplay bytes go straight to the MU socket.
    if (isBinary) {
      if (tcpSocket && tcpSocket.writable) tcpSocket.write(raw);
      return;
    }
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return; // malformed control frame; fail closed
    }

    switch (msg.type) {
      case 'connect': {
        // R15 generation FIRST: invalida callbacks do socket antigo ANTES de
        // destroy(), inclusive quando old/new usam a mesma lane 'android'.
        const generation = ++tcpGeneration;
        if (tcpSocket) { try { tcpSocket.destroy(); } catch (e) {} }
        currentServer = msg.serverType || msg.server || 'connect';
        if (msg.binaryData === true) binaryDataMode = true;
        // target explícito (handoff F4:03): IP:porta do GameServer real
        tcpSocket = connectWSToMU(
          ws, currentServer, msg.target || null, generation,
          () => generation === tcpGeneration,
          () => binaryDataMode,
        );
        break;
      }
      case 'send': {
        if (tcpSocket && tcpSocket.writable && msg.data) {
          tcpSocket.write(Buffer.from(msg.data, 'base64'));
        }
        break;
      }
      case 'disconnect': {
        ++tcpGeneration; // invalida close/data pendentes antes do destroy
        if (tcpSocket) { try { tcpSocket.destroy(); } catch (e) {} tcpSocket = null; }
        break;
      }
    }
  });

  ws.on('close', () => {
    ++tcpGeneration;
    if (tcpSocket) { try { tcpSocket.destroy(); } catch (e) {} tcpSocket = null; }
    console.log(`[Gateway] Cliente web desconectado: ${clientId}`);
  });

  ws.on('error', (err) => console.error(`[Gateway] WS erro ${clientId}: ${err.message}`));
});

// WebSocket server de administração (porta 9090) — status dos servidores
const wssAdmin = new WebSocket.Server({ port: 9090, host: BIND_HOST, maxPayload: 64 * 1024 }, () => {
  console.log(`WebSocket admin/status: ws://${BIND_HOST}:9090`);
});

wssAdmin.on('connection', (ws) => {
  const status = {};
  for (const [name, cfg] of Object.entries(MU_SERVERS)) {
    const probe = net.createConnection({ host: cfg.host, port: cfg.port, timeout: 1500 });
    status[name] = 'checking';
    probe.on('connect', () => { status[name] = 'online'; probe.destroy();
      try { ws.send(JSON.stringify({ type: 'status', servers: status })); } catch (e) {} });
    probe.on('error', () => { status[name] = 'offline';
      try { ws.send(JSON.stringify({ type: 'status', servers: status })); } catch (e) {} });
    probe.on('timeout', () => { status[name] = 'offline'; probe.destroy();
      try { ws.send(JSON.stringify({ type: 'status', servers: status })); } catch (e) {} });
  }
});
