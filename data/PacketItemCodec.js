/**
 * PacketItemCodec.js — decode mínimo e fiel do ItemInfo de 12 bytes no wire.
 *
 * Autoridade: WSclient.h PACKET_ITEM_LENGTH=12 e o decode usado pelo port
 * auditado da Main 5.2 para world-items. Este módulo NÃO constrói Item local e
 * não inventa option/visual ausente; preserva os 12 bytes para owners reais.
 */
export const PACKET_ITEM_LENGTH = 12;

export function copyPacketItem(bytes) {
  if (!bytes || bytes.length < PACKET_ITEM_LENGTH) return null;
  return Uint8Array.from(bytes.subarray ? bytes.subarray(0, PACKET_ITEM_LENGTH) : Array.from(bytes).slice(0, PACKET_ITEM_LENGTH));
}

// PC/mobile audited formula: item[0] + ((item[3]&0x80)<<1) + ((item[5]&0xF0)<<5)
export function decodePacketItemType(bytes) {
  if (!bytes || bytes.length < PACKET_ITEM_LENGTH) return -1;
  return (bytes[0] | 0) + (((bytes[3] & 0x80) << 1) | 0) + (((bytes[5] & 0xF0) << 5) | 0);
}

export function packetItemLevelByte(bytes) {
  return bytes && bytes.length >= PACKET_ITEM_LENGTH ? bytes[1] : 0;
}
