/**
 * ServerListData.js — Dados REAIS de servidores (sem placeholders).
 *
 * Duas fontes, ambas da source PC (ServerListManager.cpp + WSclient.cpp):
 *
 * 1) SCRIPT ESTÁTICO — Data/Local/ServerList.bmd (CServerListManager::LoadServerListScript)
 *    Formato (BuxCode XOR fc cf ab aplicada por bloco lido):
 *      loop até EOF:
 *        WORD wIndex            (offset 0)
 *        char  name[32]         (SLM_MAX_SERVER_NAME_LENGTH)
 *        BYTE  byPos            (SBP_LEFT=0 / SBP_RIGHT=1 / SBP_CENTER=2)
 *        BYTE  bySequence
 *        BYTE  abyNonPVP[15]    (SLM_MAX_SERVER_COUNT)
 *        short nDescriptLen
 *        char  desc[nDescriptLen]
 *    XOR restarts a cada fread do C++ — aqui emulamos os blocos exatos:
 *    o struct inteiro é UMA fread (XOR index 0..52), e cada descrição é
 *    OUTRA fread (XOR index 0..descLen-1).
 *
 * 2) PACOTE DINÂMICO F4:06 do ConnectServer (ReceiveServerList, WSclient.cpp:310):
 *      C2 [sizeH sizeL] F4 06 [countH] [countL] N× { WORD ServerCode(LE), BYTE Percent, BYTE type }
 *    Captura real: C2 00 0B F4 06 00 01 01 00 00 CC => count=1, ServerCode=1.
 *    Cada entrada: InsertServerGroup(ServerCode, Percent) →
 *    grupo = ServerCode/20 (index no script), servidor dentro do grupo.
 *    Percent alimenta o gauge (CGaugeBar 160×4).
 *
 * 3) SERVER ADDRESS F4:03 (ReceiveServerConnect):
 *      C1 [size] F4 03 [IP 16 bytes] [WORD port]
 */

// BuxCode (ServerListManager.cpp: BuxConvert)
const BUX = [0xFC, 0xCF, 0xAB];

// Limites do CServerSelWin (ServerSelWin.h)
const SSW_LEFT_MAX = 10;   // SSW_LEFT_SERVER_G_MAX
const SSW_RIGHT_MAX = 10;  // SSW_RIGHT_SERVER_G_MAX

/** XOR de um range com restart do índice (emula cada fread do C++). */
function buxRange(bytes, start, len) {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = bytes[start + i] ^ BUX[i % 3];
  }
  return out;
}

/**
 * Decodifica Data/Local/ServerList.bmd → array de grupos do script.
 * Retorna [{index, name, pos, sequence, nonPvp[15], description}]
 */
export function decodeServerListScript(buffer) {
  const bytes = new Uint8Array(buffer);
  const STRUCT = 53; // 2+32+1+1+15+2
  const groups = [];
  let off = 0;

  while (off + STRUCT <= bytes.length) {
    const s = buxRange(bytes, off, STRUCT);
    off += STRUCT;

    const index = s[0] | (s[1] << 8);
    let name = '';
    for (let i = 2; i < 34; i++) {
      if (s[i] === 0) break;
      name += String.fromCharCode(s[i]);
    }
    const pos = s[34];      // SBP_LEFT/RIGHT/CENTER
    const sequence = s[35];
    const nonPvp = Array.from(s.slice(36, 51));
    const descLen = s[51] | (s[52] << 8);

    let description = '';
    if (descLen > 0 && off + descLen <= bytes.length) {
      const d = buxRange(bytes, off, descLen);
      off += descLen;
      // textos podem ter 1 byte UTF-16 LE por char em alguns builds;
      // detecta: se todos os bytes ímpares são 0 → UTF-16LE
      let utf16 = descLen >= 2 && d[1] === 0;
      if (utf16) {
        for (let i = 1; i < descLen; i += 2) if (d[i] !== 0) { utf16 = false; break; }
      }
      if (utf16) {
        for (let i = 0; i < descLen; i += 2) description += String.fromCharCode(d[i] | (d[i + 1] << 8));
      } else {
        for (let i = 0; i < descLen; i++) description += String.fromCharCode(d[i]);
      }
    }

    groups.push({ index, name, pos, sequence, nonPvp, description });
  }
  return groups;
}

/** Posições de botão (ServerGroup.h SERVER_BTN_POSITION). */
export const SBP = { LEFT: 0, RIGHT: 1, CENTER: 2 };

/**
 * Parse do pacote F4:06 (ReceiveServerList, WSclient.cpp).
 * Retorna { total: WORD, entries: [{ serverCode, percent }] } ou null.
 * Pacote: C2 sizeH sizeL F4 06 countH countL entries×(WORD codeLE, BYTE percent, BYTE type)
 */
export function parseServerListPacket(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // C2 (C1 também aceito: size é 1 byte)
  let hdr;
  if (u8[0] === 0xC2 || u8[0] === 0xC4) {
    hdr = { head: u8[3], sub: u8[4], countAt: 5, entryAt: 7 };
  } else if (u8[0] === 0xC1 || u8[0] === 0xC3) {
    hdr = { head: u8[2], sub: u8[3], countAt: 4, entryAt: 6 };
  } else {
    return null;
  }
  if (hdr.head !== 0xF4 || hdr.sub !== 0x06) return null;

  // F4:06 count is big-endian on the real ConnectServer wire.
  const total = (u8[hdr.countAt] << 8) | u8[hdr.countAt + 1];
  const entries = [];
  let off = hdr.entryAt;
  const ENTRY = 4; // WORD code LE + BYTE percent + BYTE type
  // Match MUPacketRouter atomic authority: never return a declared total with a prefix only.
  const required = hdr.entryAt + total * ENTRY;
  if (u8.length < required) return null;
  for (let i = 0; i < total; i++, off += ENTRY) {
    const serverCode = u8[off] | (u8[off + 1] << 8);
    const percent = u8[off + 2];
    entries.push({ serverCode, percent });
  }
  return { total, entries };
}

/**
 * Parse do pacote F4:03 (ReceiveServerConnect) → { ip, port } ou null.
 * Pacote: C1 size F4 03 [16 bytes IP] [WORD port]
 */
export function parseServerAddressPacket(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8[0] === 0xC1 && u8[2] === 0xF4 && u8[3] === 0x03 && u8.length >= 22) {
    let ip = '';
    for (let i = 4; i < 20; i++) {
      if (u8[i] === 0) break;
      ip += String.fromCharCode(u8[i]);
    }
    const port = u8[20] | (u8[21] << 8);
    return { ip, port };
  }
  return null;
}

/** Grupo de um ServerCode (InsertServerGroup: iConnectIndex/20). */
export function groupIndexOf(serverCode) {
  return Math.floor(serverCode / 20);
}

/**
 * ServerListData — fachada async usada pelas cenas.
 * Grupos vêm do ServerList.bmd REAL; servidores vêm do pacote F4:06 REAL
 * (via NetClient/gateway quando o ConnectServer está online).
 */
import { RemoteAssets } from './RemoteAssets.js';

class ServerListDataService {
  constructor() {
    this._scriptPromise = null;
    this.groups = [];      // grupos do script (estáticos, reais)
    this.servers = [];     // entradas F4:06 (dinâmicas, reais)
    this.online = false;   // true quando F4:06 recebido
  }

  /** Grupos estáticos do ServerList.bmd (cache por sessão). */
  async loadScript() {
    if (this._scriptPromise) return this._scriptPromise;
    this._scriptPromise = (async () => {
      try {
        const buf = await RemoteAssets.fetchBinary('Local/ServerList.bmd');
        if (!buf) return [];
        this.groups = decodeServerListScript(buf);
        return this.groups;
      } catch (e) {
        return [];
      }
    })();
    return this._scriptPromise;
  }

  /** Aplica entradas F4:06 recebidas do ConnectServer real (via router). */
  applyServerListEntries(entries, total) {
    this.servers = Array.from(entries || []);
    this.totalServers = total ?? this.servers.length;
    this.online = true;
  }

  /** Aplica um pacote F4:06 recebido do ConnectServer real (bytes brutos). */
  applyServerListPacket(u8) {
    const parsed = parseServerListPacket(u8);
    if (!parsed) return false;
    this.servers = parsed.entries;
    this.totalServers = parsed.total;
    this.online = true;
    return true;
  }

  /**
   * Merged view (UpdateDisplay do CServerSelWin):
   * FIEL AO PC — m_mapServerGroup só é populado por InsertServerGroup
   * (uma chamada por entrada F4:06), logo SÓ APARECEM grupos com servidor
   * recebido do ConnectServer real (UpdateDisplay: m_icntServerGroup<1 → nada).
   */
  buildDisplay() {
    const byIndex = new Map();
    for (const g of this.groups) byIndex.set(g.index, { ...g, servers: [] });
    for (const s of this.servers) {
      const g = byIndex.get(groupIndexOf(s.serverCode));
      if (g) g.servers.push(s);
    }
    const withServers = Array.from(byIndex.values())
      .filter((g) => g.servers.length > 0)
      .sort((a, b) => a.sequence - b.sequence); // m_mapServerGroup (key=sequence)
    return {
      centerGroup: withServers.find((g) => g.pos === SBP.CENTER) || null,
      leftGroups: withServers.filter((g) => g.pos === SBP.LEFT).slice(0, SSW_LEFT_MAX),
      rightGroups: withServers.filter((g) => g.pos === SBP.RIGHT).slice(0, SSW_RIGHT_MAX),
      all: withServers,
    };
  }
}

export const ServerListData = new ServerListDataService();
export default ServerListData;
