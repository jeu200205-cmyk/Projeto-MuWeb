/**
 * MUProtocol.js - Protocolo completo do MU Online Season 6
 * Baseado em: Protocol.cpp, Packets.h, WSclient.cpp, wsclientinline.h
 * 
 * Inclui:
 * - Estruturas de pacotes (PMSG_*)
 * - Builders para pacotes de envio (Client -> Server)
 * - Parsers para pacotes de recebimento (Server -> Client)
 * - Login, Character List, Character Create/Delete/Select
 * - Move, Attack, Skill, ItemUse
 * - Chat, Trade, Party, Guild
 * - HP/MP/SD/Exp updates, LevelUp, Stats, Inventory, Skills
 * - Quest, Warehouse, Shop, PK, CastleSiege
 */

import { MUPacketManager } from './MUPacketManager.js';
import { MAIN_OPCODE, F1_SUBCODE, F3_SUBCODE, F4_SUBCODE, F6_SUBCODE, F7_SUBCODE, F8_SUBCODE, F9_SUBCODE, FB_SUBCODE, SHOP_SUBCODE, DUEL_SUBCODE, EB_SUBCODE, EF_SUBCODE, BC_SUBCODE, MOVE_MAP_SUBCODE, SEND_OPCODE, HEADER_TYPE, DIR_TABLE, ACTION_CODE, CHAR_CLASS, LOGIN_RESULT, getOpcodeName, getSubcodeName } from './MUOpCodes.js';
import { buxConvert, createHeader, createSimpleHeader, parseHeader, XOR_FILTER, CRC32 } from './MUCrypto.js';

// ============================================================================
// Packet Header Structures (Packets.h)
// ============================================================================

/**
 * PSBMSG_HEAD - Header com subcode (C1/C3)
 * struct { BYTE type; BYTE size; BYTE head; BYTE subh; }
 */
export class PSBMSG_HEAD {
  constructor() {
    this.type = HEADER_TYPE.C1;
    this.size = 0;
    this.head = 0;
    this.subh = 0;
  }

  set(head, subh, size) {
    this.type = HEADER_TYPE.C1;
    this.size = size;
    this.head = head;
    this.subh = subh;
  }

  setE(head, subh, size) {
    this.type = HEADER_TYPE.C3;
    this.size = size;
    this.head = head;
    this.subh = subh;
  }

  toBytes() {
    return new Uint8Array([this.type, this.size, this.head, this.subh]);
  }

  static fromBytes(data) {
    const header = new PSBMSG_HEAD();
    header.type = data[0];
    header.size = data[1];
    header.head = data[2];
    header.subh = data[3];
    return header;
  }
}

/**
 * PBMSG_HEAD - Header simples (C1/C3)
 * struct { BYTE type; BYTE size; BYTE head; }
 */
export class PBMSG_HEAD {
  constructor() {
    this.type = HEADER_TYPE.C1;
    this.size = 0;
    this.head = 0;
  }

  set(head, size) {
    this.type = HEADER_TYPE.C1;
    this.size = size;
    this.head = head;
  }

  setE(head, size) {
    this.type = HEADER_TYPE.C3;
    this.size = size;
    this.head = head;
  }

  toBytes() {
    return new Uint8Array([this.type, this.size, this.head]);
  }

  static fromBytes(data) {
    const header = new PBMSG_HEAD();
    header.type = data[0];
    header.size = data[1];
    header.head = data[2];
    return header;
  }
}

/**
 * NEW_PSWMSG_HEAD - Header word size com subcode (C2/C4)
 * struct { BYTE type; BYTE size[2]; BYTE head; BYTE subh; }
 */
export class NEW_PSWMSG_HEAD {
  constructor() {
    this.type = HEADER_TYPE.C2;
    this.size = new Uint8Array(2);
    this.head = 0;
    this.subh = 0;
  }

  set(head, subh, size) {
    this.type = HEADER_TYPE.C2;
    this.size[0] = (size >> 8) & 0xFF; // HIBYTE
    this.size[1] = size & 0xFF;        // LOBYTE
    this.head = head;
    this.subh = subh;
  }

  setE(head, subh, size) {
    this.type = HEADER_TYPE.C4;
    this.size[0] = (size >> 8) & 0xFF;
    this.size[1] = size & 0xFF;
    this.head = head;
    this.subh = subh;
  }

  getSize() {
    return (this.size[0] << 8) | this.size[1];
  }

  toBytes() {
    return new Uint8Array([this.type, this.size[1], this.size[0], this.head, this.subh]);
  }

  static fromBytes(data) {
    const header = new NEW_PSWMSG_HEAD();
    header.type = data[0];
    header.size[0] = data[2];
    header.size[1] = data[1];
    header.head = data[3];
    header.subh = data[4];
    return header;
  }
}

// ============================================================================
// Login Packets (Protocol.cpp, wsclientinline.h)
// ============================================================================

/**
 * PMSG_ANTI_CLIENT_KEY_SEND - Protocol.cpp line 6-11
 * Client -> Server: Anti-hack key (Mac address)
 */
export class PMSG_ANTI_CLIENT_KEY_SEND {
  constructor(macAddress = '', language = 'eng') {
    this.header = new PSBMSG_HEAD();
    this.m_MacAddress = macAddress.padEnd(40, '\0').substring(0, 40);
    this.m_Language = language.padEnd(4, '\0').substring(0, 4);
    this.header.setE(0xF3, 0xFA, 4 + 40 + 4); // C3:F3:FA
  }

  toBytes() {
    const headerBytes = this.header.toBytes();
    const macBytes = new TextEncoder().encode(this.m_MacAddress);
    const langBytes = new TextEncoder().encode(this.m_Language);
    
    const packet = new Uint8Array(headerBytes.length + macBytes.length + langBytes.length);
    packet.set(headerBytes, 0);
    packet.set(macBytes, headerBytes.length);
    packet.set(langBytes, headerBytes.length + macBytes.length);
    return packet;
  }
}

/**
 * PMSG_CONNECT_ACCOUNT_SEND - ProtocolSend.h line 26-35
 * Client -> Server: Login request (0xF1:0x01)
 */
export class PMSG_CONNECT_ACCOUNT_SEND {
  constructor(account, password, version, serial) {
    this.account = account.padEnd(10, '\0').substring(0, 10);
    this.password = password.padEnd(20, '\0').substring(0, 20);
    this.tickCount = Date.now() & 0xFFFFFFFF;
    this.clientVersion = new Uint8Array(version);
    this.clientSerial = new Uint8Array(serial);
  }

  toBytes(encrypt = true) {
    // Apply BuxConvert to account and password
    const accountBytes = new TextEncoder().encode(this.account);
    const passBytes = new TextEncoder().encode(this.password);
    buxConvert(accountBytes);
    buxConvert(passBytes);

    // Payload: account(10) + password(20) + tickCount(4) + version(5) + serial(16) + language(1) = 56
    // Subcode NÃO entra aqui (está no header PSBMSG: [C1][size][F1][01]).
    // LanguageCode = 0 — exigido por GAMESERVER_UPDATE>=803 (mu-server Protocol.h:273-275);
    // GS EX505 é UPDATE 803 → struct total = 4+56 = 60 bytes (C1 3C).
    const payload = new Uint8Array(56);
    let offset = 0;
    payload.set(accountBytes, offset); offset += 10;
    payload.set(passBytes, offset); offset += 20;

    // TickCount (4 bytes, little endian)
    new DataView(payload.buffer, payload.byteOffset + offset).setUint32(0, this.tickCount, true);
    offset += 4;

    payload.set(this.clientVersion, offset); offset += 5;
    payload.set(this.clientSerial, offset); offset += 16;
    payload[offset] = 0; // LanguageCode (PC client 5.2 preenche 0 / resto de ZeroMemory)

    const header = new PSBMSG_HEAD();
    // encrypt=true → C3 (SimpleModulus), igual ao SendPacket(TRUE) do PC (wsclientinline.h:BlockCipher)
    if (encrypt) header.setE(0xF1, F1_SUBCODE.LOGIN, 4 + payload.length);
    else header.set(0xF1, F1_SUBCODE.LOGIN, 4 + payload.length);

    const packet = new Uint8Array(header.toBytes().length + payload.length);
    packet.set(header.toBytes(), 0);
    packet.set(payload, header.toBytes().length);
    return packet;
  }
}

/**
 * PMSG_SIMPLE_RESULT_RECV - ProtocolSend.h line 62-65
 * Server -> Client: Simple result (login result, etc.)
 */
export class PMSG_SIMPLE_RESULT_RECV {
  constructor() {
    this.result = 0;
  }

  static fromBytes(data) {
    const msg = new PMSG_SIMPLE_RESULT_RECV();
    msg.result = data[4]; // After C1:F1:01
    return msg;
  }

  isSuccess() {
    return this.result === LOGIN_RESULT.SUCCESS_1 || this.result === LOGIN_RESULT.SUCCESS_2;
  }
}

// ============================================================================
// Character Packets
// ============================================================================

/**
 * PMSG_CHARACTER_LIST_RECV - WSclient.h
 * Server -> Client: Character list (0xF3:0x00)
 */
export class PMSG_CHARACTER_LIST_RECV {
  constructor() {
    this.header = new PSBMSG_HEAD();
    this.count = 0;
    this.characters = [];
  }

  static fromBytes(data) {
    const msg = new PMSG_CHARACTER_LIST_RECV();
    const header = PSBMSG_HEAD.fromBytes(data);
    msg.header = header;
    msg.count = data[4];
    
    let offset = 5;
    for (let i = 0; i < msg.count; i++) {
      if (offset + 64 > data.length) break;
      
      const name = new TextDecoder().decode(data.subarray(offset, offset + 10)).replace(/\0/g, '');
      offset += 10;
      
      const level = data[offset] | (data[offset + 1] << 8);
      offset += 2;
      
      const charClass = data[offset++];
      const ctlCode = data[offset++];
      
      const charSet = data.subarray(offset, offset + 18);
      offset += 18;
      
      const guildName = new TextDecoder().decode(data.subarray(offset, offset + 8)).replace(/\0/g, '');
      offset += 8;
      
      const mapNumber = data[offset++];
      const x = data[offset++];
      const y = data[offset++];
      const pkLevel = data[offset++];
      
      msg.characters.push({
        name, level, class: charClass, ctlCode, charSet, guildName, mapNumber, x, y, pkLevel
      });
    }
    
    return msg;
  }
}

/**
 * SendRequestCharactersList - wsclientinline.h line 308-316
 * Client -> Server: Request character list (0xF3:0x00)
 */
export function createCharacterListRequest(language = 0) {
  const payload = new Uint8Array([F3_SUBCODE.CHAR_LIST, language]);
  const header = new PSBMSG_HEAD();
  header.set(0xF3, F3_SUBCODE.CHAR_LIST, 4 + payload.length);
  
  const packet = new Uint8Array(header.toBytes().length + payload.length);
  packet.set(header.toBytes(), 0);
  packet.set(payload, header.toBytes().length);
  return packet;
}

/**
 * SendRequestCreateCharacter - wsclientinline.h line 318-328
 * Client -> Server: Create character (0xF3:0x01)
 */
export function createCharacterCreateRequest(name, charClass, skin) {
  const nameBytes = new TextEncoder().encode(name.padEnd(10, '\0').substring(0, 10));
  const classSkin = ((charClass << 4) | skin) & 0xFF;
  
  const payload = new Uint8Array(1 + 10 + 1);
  payload[0] = F3_SUBCODE.CHAR_CREATE;
  payload.set(nameBytes, 1);
  payload[11] = classSkin;
  
  const header = new PSBMSG_HEAD();
  header.set(0xF3, F3_SUBCODE.CHAR_CREATE, 4 + payload.length);
  
  const packet = new Uint8Array(header.toBytes().length + payload.length);
  packet.set(header.toBytes(), 0);
  packet.set(payload, header.toBytes().length);
  return packet;
}

/**
 * SendRequestDeleteCharacter - wsclientinline.h line 330-340
 * Client -> Server: Delete character (0xF3:0x02)
 */
export function createCharacterDeleteRequest(name, residentNumber) {
  const nameBytes = new TextEncoder().encode(name.padEnd(10, '\0').substring(0, 10));
  const residentBytes = new TextEncoder().encode(residentNumber.padEnd(20, '\0').substring(0, 20));
  
  const payload = new Uint8Array(1 + 10 + 20);
  payload[0] = F3_SUBCODE.CHAR_DELETE;
  payload.set(nameBytes, 1);
  payload.set(residentBytes, 11);
  
  const header = new PSBMSG_HEAD();
  header.set(0xF3, F3_SUBCODE.CHAR_DELETE, 4 + payload.length);
  
  const packet = new Uint8Array(header.toBytes().length + payload.length);
  packet.set(header.toBytes(), 0);
  packet.set(payload, header.toBytes().length);
  return packet;
}

/**
 * SendRequestJoinMapServer - wsclientinline.h line 342-351
 * Client -> Server: Character select / Join map server (0xF3:0x03)
 */
export function createCharacterSelectRequest(name) {
  const nameBytes = new TextEncoder().encode(name.padEnd(10, '\0').substring(0, 10));
  
  const payload = new Uint8Array(1 + 10);
  payload[0] = F3_SUBCODE.JOIN_MAP_SERVER;
  payload.set(nameBytes, 1);
  
  const header = new PSBMSG_HEAD();
  header.set(0xF3, F3_SUBCODE.JOIN_MAP_SERVER, 4 + payload.length);
  
  const packet = new Uint8Array(header.toBytes().length + payload.length);
  packet.set(header.toBytes(), 0);
  packet.set(payload, header.toBytes().length);
  return packet;
}

// ============================================================================
// Movement Packets
// ============================================================================

/**
 * SendPosition - wsclientinline.h line 448-454
 * Client -> Server: Position update (0x15)
 */
export function createPositionPacket(x, y) {
  const payload = new Uint8Array([x & 0xFF, y & 0xFF]);
  return MUPacketManager.createC1Packet(MAIN_OPCODE.POSITION, payload);
}

/**
 * SendCharacterMove - wsclientinline.h line 459-515
 * Client -> Server: Character move with path (0xD4)
 */
export function createMovePacket(move) {
  const payload = new Uint8Array(2 + move.path.length);
  payload[0] = move.x & 0xFF;
  payload[1] = move.y & 0xFF;
  payload.set(move.path, 2);
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.MOVE, payload);
}

/**
 * Encode move path (from wsclientinline.h)
 */
export function encodeMovePath(angle, pathX, pathY, targetX, targetY) {
  const pathNum = pathX.length;
  const path = new Uint8Array(8);
  path.fill(0);
  
  let dir = 0;
  for (let i = 1; i < pathNum; i++) {
    dir = 0;
    for (let j = 0; j < 8; j++) {
      if (DIR_TABLE[j * 2] === (pathX[i] - pathX[i - 1]) && 
          DIR_TABLE[j * 2 + 1] === (pathY[i] - pathY[i - 1])) {
        dir = j;
        break;
      }
    }
    
    if (i % 2 === 1) {
      path[(i + 1) / 2] = dir << 4;
    } else {
      path[(i + 1) / 2] += dir;
    }
  }
  
  if (pathNum === 1) {
    path[0] = ((Math.floor((angle + 22.5) / 360 * 8 + 1) % 8) << 4) & 0xFF;
  } else {
    for (let j = 0; j < 8; j++) {
      if (DIR_TABLE[j * 2] === (targetX - pathX[pathNum - 1]) && 
          DIR_TABLE[j * 2 + 1] === (targetY - pathY[pathNum - 1])) {
        dir = j;
        break;
      }
    }
    path[0] = (dir << 4) & 0xFF;
  }
  
  path[0] += (pathNum - 1) & 0x0F;
  
  return {
    path: path.subarray(0, 1 + Math.floor(pathNum / 2)),
    pathCount: pathNum
  };
}

// ============================================================================
// Combat Packets
// ============================================================================

/**
 * SendRequestAttack - wsclientinline.h line 525-534
 * Client -> Server: Normal attack (0x11)
 */
export function createAttackPacket(targetKey, dir, attackType = ACTION_CODE.ATTACK1) {
  const payload = new Uint8Array(4);
  payload[0] = (targetKey >> 8) & 0xFF;
  payload[1] = targetKey & 0xFF;
  payload[2] = attackType;
  payload[3] = dir & 0xFF;
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.ATTACK, payload);
}

/**
 * SendRequestMagic - wsclientinline.h line 541-567
 * Client -> Server: Magic/skill cast (0x19)
 */
export function createMagicPacket(skillType, targetKey) {
  const payload = new Uint8Array(4);
  payload[0] = (skillType >> 8) & 0xFF; // HIBYTE
  payload[1] = skillType & 0xFF;        // LOBYTE
  payload[2] = (targetKey >> 8) & 0xFF;
  payload[3] = targetKey & 0xFF;
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.MAGIC, payload);
}

/**
 * SendRequestCancelMagic - wsclientinline.h line 595-602
 * Client -> Server: Cancel magic (0x1B)
 */
export function createCancelMagicPacket(skillType, targetKey) {
  const payload = new Uint8Array(4);
  payload[0] = (skillType >> 8) & 0xFF;
  payload[1] = skillType & 0xFF;
  payload[2] = (targetKey >> 8) & 0xFF;
  payload[3] = targetKey & 0xFF;
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.MAGIC_FINISH, payload);
}

/**
 * SendRequestMagicAttack - wsclientinline.h line 607-623
 * Client -> Server: Magic attack with multiple targets (0xDB)
 */
export function createMagicAttackPacket(skillType, x, y, serial, targets) {
  const count = targets.length;
  const payload = new Uint8Array(6 + count * 3);
  
  payload[0] = (skillType >> 8) & 0xFF;
  payload[1] = skillType & 0xFF;
  payload[2] = x & 0xFF;
  payload[3] = y & 0xFF;
  payload[4] = serial & 0xFF; // MakeSkillSerialNumber
  payload[5] = count;
  
  let offset = 6;
  for (const target of targets) {
    payload[offset++] = (target.key >> 8) & 0xFF;
    payload[offset++] = target.key & 0xFF;
    payload[offset++] = target.skillSerial & 0xFF;
  }
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.MAGIC_ATTACK, payload);
}

/**
 * SendRequestMagicContinue - wsclientinline.h line 663-675
 * Client -> Server: Magic continue (0x1E)
 */
export function createMagicContinuePacket(
  skillType, x, y, angle, dest, tpos, targetKey, skillSerial = 0
) {
  // wsclientinline.h::SendRequestMagicContinue escreve DEZ bytes depois do
  // head 0x1E. O byte final é MakeSkillSerialNumber(pSkillSerial); quando o
  // caller passa NULL, o PC escreve 0. O helper antigo truncava esse byte.
  const payload = new Uint8Array(10);
  payload[0] = (skillType >> 8) & 0xFF;
  payload[1] = skillType & 0xFF;
  payload[2] = x & 0xFF;
  payload[3] = y & 0xFF;
  payload[4] = angle & 0xFF;
  payload[5] = dest & 0xFF;
  payload[6] = tpos & 0xFF;
  payload[7] = (targetKey >> 8) & 0xFF;
  payload[8] = targetKey & 0xFF;
  payload[9] = skillSerial & 0xFF;

  return MUPacketManager.createC1Packet(MAIN_OPCODE.MAGIC_CONTINUE, payload);
}

/**
 * SendRequestMagicTeleport - wsclientinline.h line 697-717
 * Client -> Server: Teleport (0x1C)
 */
export function createTeleportPacket(mapIndex, x, y) {
  const payload = new Uint8Array(5);
  payload[0] = 0; // null byte
  payload[1] = (mapIndex >> 8) & 0xFF;
  payload[2] = mapIndex & 0xFF;
  payload[3] = x & 0xFF;
  payload[4] = y & 0xFF;
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.TELEPORT, payload);
}

// ============================================================================
// Chat Packets
// ============================================================================

/**
 * SendChat - wsclientinline.h line 370-429
 * Client -> Server: Normal chat (0x00)
 */
export function createChatPacket(senderName, message) {
  const nameBytes = new TextEncoder().encode(senderName.padEnd(10, '\0').substring(0, 10));
  const msgBytes = new TextEncoder().encode(message.substring(0, 80));
  
  const payload = new Uint8Array(10 + msgBytes.length + 1);
  payload.set(nameBytes, 0);
  payload.set(msgBytes, 10);
  payload[10 + msgBytes.length] = 0; // null terminator
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.CHAT, payload);
}

/**
 * SendChatWhisper - wsclientinline.h line 433-446
 * Client -> Server: Whisper chat (0x02)
 */
export function createWhisperPacket(targetName, message) {
  const nameBytes = new TextEncoder().encode(targetName.padEnd(10, '\0').substring(0, 10));
  const msgBytes = new TextEncoder().encode(message.substring(0, 80));
  
  const payload = new Uint8Array(10 + msgBytes.length + 1);
  payload.set(nameBytes, 0);
  payload.set(msgBytes, 10);
  payload[10 + msgBytes.length] = 0;
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.WHISPER, payload);
}

// ============================================================================
// Item Packets
// ============================================================================

/**
 * SendRequestGetItem - wsclientinline.h line 1164-1175
 * Client -> Server: Pick up item (0x22)
 */
export function createGetItemPacket(itemKey) {
  const payload = new Uint8Array(2);
  payload[0] = (itemKey >> 8) & 0xFF;
  payload[1] = itemKey & 0xFF;
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.GET_ITEM, payload);
}

/**
 * SendRequestDropItem - wsclientinline.h line 1177-1184
 * Client -> Server: Drop item (0x23)
 */
export function createDropItemPacket(inventoryIndex, x, y) {
  const payload = new Uint8Array(3);
  payload[0] = x & 0xFF;
  payload[1] = y & 0xFF;
  payload[2] = inventoryIndex & 0xFF;
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.DROP_ITEM, payload);
}

/**
 * SendRequestEquipmentItem - wsclientinline.h line 992-1099
 * Client -> Server: Wear/remove equipment (0x24)
 */
export function createEquipmentItemPacket(data) {
  const payload = new Uint8Array(16);
  let offset = 0;
  payload[offset++] = data.srcType & 0xFF;
  payload[offset++] = data.srcIndex & 0xFF;
  payload[offset++] = data.itemType & 0xFF;
  payload[offset++] = data.level & 0xFF;
  payload[offset++] = data.durability & 0xFF;
  payload[offset++] = data.option1 & 0xFF;
  payload[offset++] = data.extOption & 0xFF;
  payload[offset++] = data.splitType & 0xFF;
  payload[offset++] = data.spareBits & 0xFF;
  const socketOptions = data.socketOptions || new Uint8Array(5);
  if (socketOptions.length < 5) throw new RangeError('socketOptions requer 5 bytes');
  payload.set(socketOptions.subarray ? socketOptions.subarray(0, 5) : Array.from(socketOptions).slice(0, 5), offset); offset += 5;
  payload[offset++] = data.dstType & 0xFF;
  payload[offset++] = data.dstIndex & 0xFF;
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.EQUIPMENT_ITEM, payload);
}

/**
 * SendRequestUse - wsclientinline.h line 1106-1159
 * Client -> Server: Use item (0x26)
 */
export function createUseItemPacket(inventoryIndex, target, useType = 0) {
  const payload = new Uint8Array(3);
  payload[0] = (inventoryIndex + 12) & 0xFF; // +MAX_EQUIPMENT_INDEX
  payload[1] = target & 0xFF;
  payload[2] = useType & 0xFF;
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.USE_STATE_ITEM, payload);
}

/**
 * SendRequestAddPoint - wsclientinline.h line 1196-1203
 * Client -> Server: Add stat point (0xF3:0x06)
 */
export function createAddPointPacket(statType) {
  const payload = new Uint8Array([F3_SUBCODE.ADD_POINT, statType]);
  const header = new PSBMSG_HEAD();
  header.set(0xF3, F3_SUBCODE.ADD_POINT, 4 + payload.length);
  
  const packet = new Uint8Array(header.toBytes().length + payload.length);
  packet.set(header.toBytes(), 0);
  packet.set(payload, header.toBytes().length);
  return packet;
}

// ============================================================================
// Trade Packets
// ============================================================================

/**
 * SendRequestTrade - wsclientinline.h line 1205-1219
 * Client -> Server: Trade request (0x36)
 */
export function createTradeRequestPacket(targetKey, isTradeX = 0) {
  const payload = new Uint8Array(3);
  payload[0] = (targetKey >> 8) & 0xFF;
  payload[1] = targetKey & 0xFF;
  payload[2] = isTradeX & 0xFF;
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.TRADE, payload);
}

/**
 * SendRequestTradeAnswer - wsclientinline.h line 1221-1227
 * Client -> Server: Trade answer (0x37)
 */
export function createTradeAnswerPacket(result) {
  const payload = new Uint8Array([result]);
  return MUPacketManager.createC1Packet(MAIN_OPCODE.TRADE_RESULT, payload);
}

/**
 * SendRequestTradeGold - wsclientinline.h line 1229-1236
 * Client -> Server: Trade gold (0x3A)
 */
export function createTradeGoldPacket(gold) {
  const payload = new Uint8Array(5);
  payload[0] = 0; // null
  new DataView(payload.buffer, payload.byteOffset + 1).setUint32(0, gold, true);
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.TRADE_MY_GOLD, payload);
}

/**
 * SendRequestTradeResult - wsclientinline.h line 1238-1244
 * Client -> Server: Trade OK button (0x3C)
 */
export function createTradeResultPacket(result) {
  const payload = new Uint8Array([result]);
  return MUPacketManager.createC1Packet(MAIN_OPCODE.TRADE_YOUR_RESULT, payload);
}

/**
 * SendRequestTradeXResult - wsclientinline.h line 1246-1254
 * Client -> Server: TradeX OK button (0x3C with extra bytes)
 */
export function createTradeXResultPacket(result, tradeX, cancel) {
  const payload = new Uint8Array([result, tradeX, cancel]);
  return MUPacketManager.createC1Packet(MAIN_OPCODE.TRADE_YOUR_RESULT, payload);
}

/**
 * SendRequestTradeExit - wsclientinline.h line 1256-1261
 * Client -> Server: Trade exit (0x3D)
 */
export function createTradeExitPacket() {
  return MUPacketManager.createC1Packet(MAIN_OPCODE.TRADE_EXIT, new Uint8Array(0));
}

// ============================================================================
// Party Packets
// ============================================================================

/**
 * SendRequestParty - wsclientinline.h line 1336-1350
 * Client -> Server: Party request (0x40)
 */
export function createPartyRequestPacket(targetKey) {
  const payload = new Uint8Array(2);
  payload[0] = (targetKey >> 8) & 0xFF;
  payload[1] = targetKey & 0xFF;
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.PARTY, payload);
}

/**
 * SendRequestPartyAnswer - wsclientinline.h line 1352-1358
 * Client -> Server: Party answer (0x41)
 */
export function createPartyAnswerPacket(result, partyKey) {
  const payload = new Uint8Array(3);
  payload[0] = result & 0xFF;
  payload[1] = (partyKey >> 8) & 0xFF;
  payload[2] = partyKey & 0xFF;
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.PARTY_RESULT, payload);
}

/**
 * SendRequestPartyList - wsclientinline.h line 1360-1365
 * Client -> Server: Party list (0x42)
 */
export function createPartyListPacket() {
  return MUPacketManager.createC1Packet(MAIN_OPCODE.PARTY_LIST, new Uint8Array(0));
}

/**
 * SendRequestPartyLeave - wsclientinline.h line 1367-1373
 * Client -> Server: Party leave (0x43)
 */
export function createPartyLeavePacket(index) {
  const payload = new Uint8Array([index & 0xFF]);
  return MUPacketManager.createC1Packet(MAIN_OPCODE.PARTY_LEAVE, payload);
}

// ============================================================================
// Guild Packets
// ============================================================================

/**
 * SendRequestGuild - wsclientinline.h line 1458-1472
 * Client -> Server: Guild request (0x50)
 */
export function createGuildRequestPacket(targetKey) {
  const payload = new Uint8Array(2);
  payload[0] = (targetKey >> 8) & 0xFF;
  payload[1] = targetKey & 0xFF;
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.GUILD, payload);
}

/**
 * SendRequestGuildAnswer - wsclientinline.h line 1474-1480
 * Client -> Server: Guild answer (0x51)
 */
export function createGuildAnswerPacket(result, guildPlayerKey) {
  const payload = new Uint8Array(3);
  payload[0] = result & 0xFF;
  payload[1] = (guildPlayerKey >> 8) & 0xFF;
  payload[2] = guildPlayerKey & 0xFF;
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.GUILD_RESULT, payload);
}

/**
 * SendRequestCreateGuild - wsclientinline.h line 1383-1391
 * Client -> Server: Create guild (0x55)
 */
export function createGuildCreatePacket(guildType, guildName, guildMark) {
  const nameBytes = new TextEncoder().encode(guildName.padEnd(8, '\0').substring(0, 8));
  const markBytes = guildMark.subarray(0, 32);
  
  const payload = new Uint8Array(1 + 8 + 32);
  payload[0] = guildType & 0xFF;
  payload.set(nameBytes, 1);
  payload.set(markBytes, 9);
  
  const header = new PSBMSG_HEAD();
  header.set(0xF3, F3_SUBCODE.CHAR_CREATE, 4 + payload.length); // Actually 0x55
  
  // Override for guild create
  const packet = new Uint8Array(4 + payload.length);
  packet[0] = HEADER_TYPE.C1;
  packet[1] = packet.length & 0xFF;
  packet[2] = MAIN_OPCODE.GUILD; // 0x50? No, it's 0x55 for create guild
  packet[3] = 0x55; // subcode for create guild
  packet.set(payload, 4);
  
  return packet;
}

/**
 * SendRequestGuildList - wsclientinline.h line 1489-1494
 * Client -> Server: Guild list (0x52)
 */
export function createGuildListPacket() {
  return MUPacketManager.createC1Packet(MAIN_OPCODE.GUILD_LIST, new Uint8Array(0));
}

// ============================================================================
// Warehouse Packets
// ============================================================================

/**
 * SendRequestVaultCost - wsclientinline.h line 1270-1275
 * Client -> Server: Vault cost (0x80)
 */
export function createVaultCostPacket() {
  return MUPacketManager.createC1Packet(MAIN_OPCODE.VAULT_COST, new Uint8Array(0));
}

/**
 * SendRequestStorageGold - wsclientinline.h line 1296-1304
 * Client -> Server: Storage gold (0x81)
 */
export function createStorageGoldPacket(flag, gold) {
  const payload = new Uint8Array(5);
  payload[0] = flag & 0xFF;
  new DataView(payload.buffer, payload.byteOffset + 1).setUint32(0, gold, true);
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.STORAGE_GOLD, payload);
}

/**
 * SendRequestStorageExit - wsclientinline.h line 1317-1325
 * Client -> Server: Storage exit (0x82)
 */
export function createStorageExitPacket() {
  return MUPacketManager.createC1Packet(MAIN_OPCODE.STORAGE_EXIT, new Uint8Array(0));
}

/**
 * SendStoragePassword - wsclientinline.h line 1327-1334
 * Client -> Server: Storage password (0x83)
 */
export function createStoragePasswordPacket(type, password, residentNumber) {
  const residentBytes = new TextEncoder().encode(residentNumber.padEnd(20, '\0').substring(0, 20));
  
  const payload = new Uint8Array(3 + 20);
  payload[0] = type & 0xFF;
  payload[1] = password & 0xFF;
  payload[2] = (password >> 8) & 0xFF;
  payload.set(residentBytes, 3);
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.STORAGE_STATUS, payload);
}

// ============================================================================
// Quest Packets
// ============================================================================

/**
 * SendRequestQuestHistory - wsclientinline.h line 833-838
 * Client -> Server: Quest history (0xA0)
 */
export function createQuestHistoryPacket() {
  return MUPacketManager.createC1Packet(MAIN_OPCODE.QUEST_HISTORY, new Uint8Array(0));
}

/**
 * SendRequestQuestState - wsclientinline.h line 840-846
 * Client -> Server: Quest state (0xA2)
 */
export function createQuestStatePacket(questIndex, state) {
  const payload = new Uint8Array(2);
  payload[0] = questIndex & 0xFF;
  payload[1] = state & 0xFF;
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.QUEST_STATE, payload);
}

/**
 * SendQuestSelection - wsclientinline.h line 868-876
 * Client -> Server: Quest selection (0xF6:0x0A)
 */
export function createQuestSelectionPacket(questIndex, result) {
  const payload = new Uint8Array(6);
  payload[0] = F6_SUBCODE.QUEST_SELECTION;
  new DataView(payload.buffer, payload.byteOffset + 1).setUint32(0, questIndex, true);
  payload[5] = result & 0xFF;
  
  const header = new PSBMSG_HEAD();
  header.set(0xF6, F6_SUBCODE.QUEST_SELECTION, 4 + payload.length);
  
  const packet = new Uint8Array(header.toBytes().length + payload.length);
  packet.set(header.toBytes(), 0);
  packet.set(payload, header.toBytes().length);
  return packet;
}

/**
 * SendRequestQuestComplete - wsclientinline.h line 888-895
 * Client -> Server: Quest complete (0xF6:0x0D)
 */
export function createQuestCompletePacket(questIndex) {
  const payload = new Uint8Array(5);
  payload[0] = F6_SUBCODE.QUEST_COMPLETE;
  new DataView(payload.buffer, payload.byteOffset + 1).setUint32(0, questIndex, true);
  
  const header = new PSBMSG_HEAD();
  header.set(0xF6, F6_SUBCODE.QUEST_COMPLETE, 4 + payload.length);
  
  const packet = new Uint8Array(header.toBytes().length + payload.length);
  packet.set(header.toBytes(), 0);
  packet.set(payload, header.toBytes().length);
  return packet;
}

// ============================================================================
// NPC Interaction
// ============================================================================

/**
 * SendRequestTalk - wsclientinline.h line 738-744
 * Client -> Server: Talk to NPC (0x30)
 */
export function createTalkPacket(npcKey) {
  const payload = new Uint8Array(2);
  payload[0] = (npcKey >> 8) & 0xFF;
  payload[1] = npcKey & 0xFF;
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.TALK, payload);
}

// ============================================================================
// Shop Packets
// ============================================================================

/**
 * SendRequestBuy - wsclientinline.h line 764-774
 * Client -> Server: Buy item (0x32)
 */
export function createBuyPacket(index) {
  const payload = new Uint8Array([index & 0xFF]);
  return MUPacketManager.createC1Packet(MAIN_OPCODE.BUY, payload);
}

/**
 * SendRequestSell - wsclientinline.h line 753-760
 * Client -> Server: Sell item (0x33)
 */
export function createSellPacket(index) {
  const payload = new Uint8Array([index & 0xFF]);
  return MUPacketManager.createC1Packet(MAIN_OPCODE.SELL, payload);
}

/**
 * SendRequestRepair - wsclientinline.h line 776-782
 * Client -> Server: Repair item (0x34)
 */
export function createRepairPacket(index, addGold) {
  const payload = new Uint8Array(2);
  payload[0] = index & 0xFF;
  payload[1] = addGold & 0xFF;
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.REPAIR, payload);
}

// ============================================================================
// Server List Packets
// ============================================================================

/**
 * SendRequestServerList - wsclientinline.h line 134-141
 * Client -> Server: Request server list (0xF4:0x06)
 */
export function createServerListRequestPacket() {
  const payload = new Uint8Array([F4_SUBCODE.SERVER_LIST]);
  const header = new PSBMSG_HEAD();
  header.set(0xF4, F4_SUBCODE.SERVER_LIST, 4 + payload.length);
  
  const packet = new Uint8Array(header.toBytes().length + payload.length);
  packet.set(header.toBytes(), 0);
  packet.set(payload, header.toBytes().length);
  return packet;
}

/**
 * SendRequestServerAddress - wsclientinline.h line 151-162
 * Client -> Server: Request server address (0xF4:0x03)
 */
export function createServerAddressRequestPacket(serverIndex) {
  const payload = new Uint8Array(3);
  payload[0] = F4_SUBCODE.SERVER_CONNECT;
  payload[1] = serverIndex & 0xFF;
  payload[2] = (serverIndex >> 8) & 0xFF;
  
  const header = new PSBMSG_HEAD();
  header.set(0xF4, F4_SUBCODE.SERVER_CONNECT, 4 + payload.length);
  
  const packet = new Uint8Array(header.toBytes().length + payload.length);
  packet.set(header.toBytes(), 0);
  packet.set(payload, header.toBytes().length);
  return packet;
}

// ============================================================================
// Ping / Keep Alive
// ============================================================================

/**
 * SendPing - wsclientinline.h line 1263-1268
 * Client -> Server: Ping (0x71)
 */
export function createPingPacket() {
  return MUPacketManager.createC1Packet(MAIN_OPCODE.PING, new Uint8Array(0));
}

/**
 * SendCheck - wsclientinline.h line 171-207
 * Client -> Server: Check/Keep alive (0x0E)
 */
export function createCheckPacket(attackSpeed, magicSpeed) {
  const payload = new Uint8Array(5);
  payload[0] = 0; // null
  new DataView(payload.buffer, payload.byteOffset + 1).setUint32(0, Date.now() & 0xFFFFFFFF, true);
  // Attack speed and magic speed would be added
  
  return MUPacketManager.createC1Packet(0x0E, payload);
}

// ============================================================================
// Event Packets
// ============================================================================

/**
 * SendRequestEventChip - wsclientinline.h line 784-790
 * Client -> Server: Event chip (0x95)
 */
export function createEventChipPacket(type, index) {
  const payload = new Uint8Array([type & 0xFF, index & 0xFF]);
  return MUPacketManager.createC1Packet(MAIN_OPCODE.EVENT_CHIP, payload);
}

/**
 * SendRequestMutoNumber - wsclientinline.h line 792-797
 * Client -> Server: Muto number (0x96)
 */
export function createMutoNumberPacket() {
  return MUPacketManager.createC1Packet(MAIN_OPCODE.MUTO_NUMBER, new Uint8Array(0));
}

// ============================================================================
// Gens System
// ============================================================================

/**
 * SendRequestGensJoining - wsclientinline.h line 941-948
 * Client -> Server: Gens joining (0xF8:0x01)
 */
export function createGensJoiningPacket(influence) {
  const payload = new Uint8Array([F8_SUBCODE.REQUEST_JOINING, influence & 0xFF]);
  const header = new PSBMSG_HEAD();
  header.set(0xF8, F8_SUBCODE.REQUEST_JOINING, 4 + payload.length);
  
  const packet = new Uint8Array(header.toBytes().length + payload.length);
  packet.set(header.toBytes(), 0);
  packet.set(payload, header.toBytes().length);
  return packet;
}

/**
 * SendRequestGensSecession - wsclientinline.h line 950-956
 * Client -> Server: Gens secession (0xF8:0x03)
 */
export function createGensSecessionPacket() {
  const payload = new Uint8Array([F8_SUBCODE.REQUEST_SECESSION]);
  const header = new PSBMSG_HEAD();
  header.set(0xF8, F8_SUBCODE.REQUEST_SECESSION, 4 + payload.length);
  
  const packet = new Uint8Array(header.toBytes().length + payload.length);
  packet.set(header.toBytes(), 0);
  packet.set(payload, header.toBytes().length);
  return packet;
}

// ============================================================================
// Duel Packets
// ============================================================================

/**
 * Duel request packet (0xAA:0x02)
 */
export function createDuelRequestPacket(targetKey) {
  const payload = new Uint8Array(3);
  payload[0] = DUEL_SUBCODE.REQUEST;
  payload[1] = (targetKey >> 8) & 0xFF;
  payload[2] = targetKey & 0xFF;
  
  return MUPacketManager.createC1Packet(MAIN_OPCODE.DUEL, payload);
}

// ============================================================================
// Packet Parsers (Server -> Client)
// ============================================================================

export class PacketParser {
  static parse(data) {
    const header = parseHeader(data);
    if (!header) return null;
    
    let payloadOffset = header.type === HEADER_TYPE.C1 || header.type === HEADER_TYPE.C3 ? 3 : 4;
    if (header.subh !== undefined) payloadOffset++;
    
    return {
      opcode: header.head,
      subcode: header.subh,
      payload: data.subarray(payloadOffset)
    };
  }

  static parseLoginResult(data) {
    return PMSG_SIMPLE_RESULT_RECV.fromBytes(data);
  }

  static parseCharacterList(data) {
    return PMSG_CHARACTER_LIST_RECV.fromBytes(data);
  }

  static parseChat(data) {
    if (data.length < 11) return null;
    const sender = new TextDecoder().decode(data.subarray(0, 10)).replace(/\0/g, '');
    const message = new TextDecoder().decode(data.subarray(10)).replace(/\0/g, '');
    return { sender, message };
  }

  static parseWhisper(data) {
    return this.parseChat(data);
  }

  static parseMove(data) {
    if (data.length < 2) return null;
    return {
      x: data[0],
      y: data[1],
      path: data.subarray(2)
    };
  }

  static parseAttack(data) {
    if (data.length < 6) return null;
    return {
      attackerKey: (data[0] << 8) | data[1],
      targetKey: (data[2] << 8) | data[3],
      damage: (data[4] << 8) | data[5]
    };
  }

  static parseLife(data) {
    if (data.length < 4) return null;
    return {
      life: (data[0] << 8) | data[1],
      maxLife: (data[2] << 8) | data[3]
    };
  }

  static parseMana(data) {
    if (data.length < 4) return null;
    return {
      mana: (data[0] << 8) | data[1],
      maxMana: (data[2] << 8) | data[3]
    };
  }

  static parseLevelUp(data) {
    if (data.length < 8) return null;
    return {
      level: data[0],
      levelUpPoint: data[1],
      maxLife: (data[2] << 8) | data[3],
      maxMana: (data[4] << 8) | data[5]
    };
  }
}

// ============================================================================
// Protocol Constants
// ============================================================================

export const PROTOCOL_CONSTANTS = {
  MAX_ID_SIZE: 10,
  MAX_PASSWORD_SIZE: 20,
  MAX_CHAT_SIZE: 80,
  MAX_PATH_FIND: 15,
  SIZE_PROTOCOLVERSION: 5,
  SIZE_PROTOCOLSERIAL: 16,
  MAX_SPE_BUFFERSIZE: 2048,
};

// ============================================================================
// Export all
// ============================================================================

export {
  // Re-export opcodes
  MAIN_OPCODE,
  F1_SUBCODE,
  F3_SUBCODE,
  F4_SUBCODE,
  F6_SUBCODE,
  F7_SUBCODE,
  F8_SUBCODE,
  F9_SUBCODE,
  FB_SUBCODE,
  SHOP_SUBCODE,
  DUEL_SUBCODE,
  EB_SUBCODE,
  EF_SUBCODE,
  BC_SUBCODE,
  MOVE_MAP_SUBCODE,
  SEND_OPCODE,
  HEADER_TYPE,
  DIR_TABLE,
  ACTION_CODE,
  CHAR_CLASS,
  LOGIN_RESULT,
  getOpcodeName,
  getSubcodeName
} from './MUOpCodes.js';

export {
  // Re-export crypto
  buxConvert,
  createHeader,
  createSimpleHeader,
  parseHeader,
  XOR_FILTER,
  CRC32
} from './MUCrypto.js';