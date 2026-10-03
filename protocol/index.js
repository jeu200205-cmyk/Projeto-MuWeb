/**
 * index.js - Barrel principal da biblioteca de protocolo MU
 * MU Online Season 6 (main 1.03.34) — implementação fiel do PacketManager.cpp
 * Browser-compatible ES Modules (Uint8Array/DataView, sem Node deps).
 */

// ============================================================
// Imports explícitos (o default object precisa deles no escopo)
// ============================================================
import {
  CRC32, XOR_FILTER, SAVE_LOAD_XOR, BitPacking, createENCDECData,
  BlockCipher, xorData, buxConvert, HEADER_TYPE,
  parseHeader, createHeader, createSimpleHeader
} from './MUCrypto.js';
import { MUPacketManager } from './MUPacketManager.js';
import {
  MAIN_OPCODE, F1_SUBCODE, F3_SUBCODE, F4_SUBCODE, F6_SUBCODE, F7_SUBCODE,
  F8_SUBCODE, F9_SUBCODE, FB_SUBCODE, SHOP_SUBCODE, DUEL_SUBCODE, EB_SUBCODE,
  EF_SUBCODE, BC_SUBCODE, MOVE_MAP_SUBCODE, SEND_OPCODE,
  DIR_TABLE, ACTION_CODE, CHAR_CLASS, LOGIN_RESULT,
  getOpcodeName, getSubcodeName
} from './MUOpCodes.js';
import {
  PSBMSG_HEAD, PBMSG_HEAD, NEW_PSWMSG_HEAD,
  PMSG_ANTI_CLIENT_KEY_SEND, PMSG_CONNECT_ACCOUNT_SEND,
  PMSG_SIMPLE_RESULT_RECV, PMSG_CHARACTER_LIST_RECV,
  PacketParser, PROTOCOL_CONSTANTS,
  createCharacterListRequest, createCharacterCreateRequest,
  createCharacterDeleteRequest, createCharacterSelectRequest,
  createPositionPacket, createMovePacket, encodeMovePath,
  createAttackPacket, createMagicPacket, createCancelMagicPacket,
  createMagicAttackPacket, createMagicContinuePacket, createTeleportPacket,
  createChatPacket, createWhisperPacket, createGetItemPacket,
  createDropItemPacket, createEquipmentItemPacket, createUseItemPacket,
  createAddPointPacket, createTradeRequestPacket, createTradeAnswerPacket,
  createTradeGoldPacket, createTradeResultPacket, createTradeXResultPacket,
  createTradeExitPacket, createPartyRequestPacket, createPartyAnswerPacket,
  createPartyListPacket, createPartyLeavePacket, createGuildRequestPacket,
  createGuildAnswerPacket, createGuildCreatePacket, createGuildListPacket,
  createVaultCostPacket, createStorageGoldPacket, createStorageExitPacket,
  createStoragePasswordPacket, createQuestHistoryPacket, createQuestStatePacket,
  createQuestSelectionPacket, createQuestCompletePacket, createTalkPacket,
  createBuyPacket, createSellPacket, createRepairPacket,
  createServerListRequestPacket, createServerAddressRequestPacket,
  createPingPacket, createCheckPacket, createEventChipPacket,
  createMutoNumberPacket, createGensJoiningPacket, createGensSecessionPacket,
  createDuelRequestPacket
} from './MUProtocol.js';

// ============================================================
// Re-exports nomeados (consumidores importam daqui)
// ============================================================
export {
  CRC32, XOR_FILTER, SAVE_LOAD_XOR, BitPacking, createENCDECData,
  BlockCipher, xorData, buxConvert, HEADER_TYPE,
  parseHeader, createHeader, createSimpleHeader
};
export { MUPacketManager, MUPacketManager as PacketManager };
export {
  MAIN_OPCODE, F1_SUBCODE, F3_SUBCODE, F4_SUBCODE, F6_SUBCODE, F7_SUBCODE,
  F8_SUBCODE, F9_SUBCODE, FB_SUBCODE, SHOP_SUBCODE, DUEL_SUBCODE, EB_SUBCODE,
  EF_SUBCODE, BC_SUBCODE, MOVE_MAP_SUBCODE, SEND_OPCODE,
  DIR_TABLE, ACTION_CODE, CHAR_CLASS, LOGIN_RESULT,
  getOpcodeName, getSubcodeName
};
export {
  PSBMSG_HEAD, PBMSG_HEAD, NEW_PSWMSG_HEAD,
  PMSG_ANTI_CLIENT_KEY_SEND, PMSG_CONNECT_ACCOUNT_SEND,
  PMSG_SIMPLE_RESULT_RECV, PMSG_CHARACTER_LIST_RECV,
  PacketParser, PROTOCOL_CONSTANTS
};
export {
  createCharacterListRequest, createCharacterCreateRequest,
  createCharacterDeleteRequest, createCharacterSelectRequest,
  createPositionPacket, createMovePacket, encodeMovePath,
  createAttackPacket, createMagicPacket, createCancelMagicPacket,
  createMagicAttackPacket, createMagicContinuePacket, createTeleportPacket,
  createChatPacket, createWhisperPacket, createGetItemPacket,
  createDropItemPacket, createEquipmentItemPacket, createUseItemPacket,
  createAddPointPacket, createTradeRequestPacket, createTradeAnswerPacket,
  createTradeGoldPacket, createTradeResultPacket, createTradeXResultPacket,
  createTradeExitPacket, createPartyRequestPacket, createPartyAnswerPacket,
  createPartyListPacket, createPartyLeavePacket, createGuildRequestPacket,
  createGuildAnswerPacket, createGuildCreatePacket, createGuildListPacket,
  createVaultCostPacket, createStorageGoldPacket, createStorageExitPacket,
  createStoragePasswordPacket, createQuestHistoryPacket, createQuestStatePacket,
  createQuestSelectionPacket, createQuestCompletePacket, createTalkPacket,
  createBuyPacket, createSellPacket, createRepairPacket,
  createServerListRequestPacket, createServerAddressRequestPacket,
  createPingPacket, createCheckPacket, createEventChipPacket,
  createMutoNumberPacket, createGensJoiningPacket, createGensSecessionPacket,
  createDuelRequestPacket
};

// ============================================================
// Versão
// ============================================================
export const VERSION = '1.0.0';
export const PROTOCOL_VERSION = 'Season 6 (main 1.03.34)';
export const PROTOCOL_DATE = '2024';

// Instância padrão do PacketManager
export const defaultPacketManager = new MUPacketManager();

/**
 * Sequência completa de login: monta pacote e processa (serial+cifra C3/C4)
 */
export async function createLoginSequence(
  account, password, version, serial, encryptionKey, decryptionKey
) {
  const packetManager = new MUPacketManager();

  if (encryptionKey) await packetManager.loadEncryptionKey(encryptionKey);
  if (decryptionKey) await packetManager.loadDecryptionKey(decryptionKey);

  const loginPacket = new PMSG_CONNECT_ACCOUNT_SEND(account, password, version, serial).toBytes();
  const processedPacket = packetManager.processOutgoingPacket(loginPacket);

  return { loginPacket: processedPacket, packetManager };
}

/**
 * Parser de stream TCP (vários pacotes por chunk / pacote partido em chunks)
 */
export class MUProtocolStream {
  #packetManager;
  #buffer;
  #bufferSize;

  constructor(packetManager) {
    this.#packetManager = packetManager || new MUPacketManager();
    this.#buffer = new Uint8Array(8192);
    this.#bufferSize = 0;
  }

  get packetManager() { return this.#packetManager; }
  get bufferedSize() { return this.#bufferSize; }

  feed(data) {
    const packets = [];

    // Redimensiona quando necessário
    if (this.#bufferSize + data.length > this.#buffer.length) {
      let newLen = this.#buffer.length;
      while (newLen < this.#bufferSize + data.length) newLen *= 2;
      const newBuffer = new Uint8Array(newLen);
      newBuffer.set(this.#buffer.subarray(0, this.#bufferSize));
      this.#buffer = newBuffer;
    }

    this.#buffer.set(data, this.#bufferSize);
    this.#bufferSize += data.length;

    // Extrai pacotes completos até esgotar
    while (this.#bufferSize > 0) {
      this.#packetManager.addData(this.#buffer.subarray(0, this.#bufferSize));
      const packet = this.#packetManager.extractPacket();
      if (!packet) break;

      packets.push(packet);
      const packetSize = packet.length;
      this.#buffer.copyWithin(0, packetSize, this.#bufferSize);
      this.#bufferSize -= packetSize;
    }

    return packets;
  }

  clear() { this.#bufferSize = 0; }
}

// ============================================================
// Default export (todos os símbolos no escopo via imports acima)
// ============================================================
export default {
  VERSION,
  PROTOCOL_VERSION,
  PROTOCOL_DATE,
  MUPacketManager,
  CRC32,
  XOR_FILTER,
  SAVE_LOAD_XOR,
  BitPacking,
  BlockCipher,
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
  PSBMSG_HEAD,
  PBMSG_HEAD,
  NEW_PSWMSG_HEAD,
  PMSG_ANTI_CLIENT_KEY_SEND,
  PMSG_CONNECT_ACCOUNT_SEND,
  PMSG_SIMPLE_RESULT_RECV,
  PMSG_CHARACTER_LIST_RECV,
  PacketParser,
  MUProtocolStream,
  defaultPacketManager,
  createLoginSequence,
  createCharacterListRequest,
  createCharacterCreateRequest,
  createCharacterDeleteRequest,
  createCharacterSelectRequest,
  createPositionPacket,
  createMovePacket,
  encodeMovePath,
  createAttackPacket,
  createMagicPacket,
  createCancelMagicPacket,
  createMagicAttackPacket,
  createMagicContinuePacket,
  createTeleportPacket,
  createChatPacket,
  createWhisperPacket,
  createGetItemPacket,
  createDropItemPacket,
  createEquipmentItemPacket,
  createUseItemPacket,
  createAddPointPacket,
  createTradeRequestPacket,
  createTradeAnswerPacket,
  createTradeGoldPacket,
  createTradeResultPacket,
  createTradeXResultPacket,
  createTradeExitPacket,
  createPartyRequestPacket,
  createPartyAnswerPacket,
  createPartyListPacket,
  createPartyLeavePacket,
  createGuildRequestPacket,
  createGuildAnswerPacket,
  createGuildCreatePacket,
  createGuildListPacket,
  createVaultCostPacket,
  createStorageGoldPacket,
  createStorageExitPacket,
  createStoragePasswordPacket,
  createQuestHistoryPacket,
  createQuestStatePacket,
  createQuestSelectionPacket,
  createQuestCompletePacket,
  createTalkPacket,
  createBuyPacket,
  createSellPacket,
  createRepairPacket,
  createServerListRequestPacket,
  createServerAddressRequestPacket,
  createPingPacket,
  createCheckPacket,
  createEventChipPacket,
  createMutoNumberPacket,
  createGensJoiningPacket,
  createGensSecessionPacket,
  createDuelRequestPacket,
  buxConvert,
  xorData,
  parseHeader,
  createHeader,
  createSimpleHeader
};
