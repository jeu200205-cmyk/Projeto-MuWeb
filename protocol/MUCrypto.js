/**
 * MUCrypto.js - Criptografia EXATA do MU Online Season 6 (main 1.03.34)
 * Port direto de CCRC32.cpp, PacketManager.cpp
 * 
 * Inclui:
 * - CRC32 (polinômio PKZip 0x04C11DB7)
 * - XOR Filter (m_XorFilter[32])
 * - Bit-packing (AddBits, Shift, GetByteOfBit)
 * - EncryptBlock/DecryptBlock (8 bytes → 11 bytes, aritmética modular)
 * - XOR Data (aplicação do filtro XOR)
 */

// ============================================================================
// CRC32 - Polinômio PKZip 0x04C11DB7 (CCRC32.cpp)
// ============================================================================

export class CRC32 {
  static #table = null;

  static #initializeTable() {
    if (this.#table) return this.#table;
    
    const table = new Uint32Array(256);
    const polynomial = 0x04C11DB7;
    
    for (let i = 0; i <= 0xFF; i++) {
      let crc = this.#reflect(i, 8) << 24;
      
      for (let j = 0; j < 8; j++) {
        crc = (crc << 1) ^ ((crc & 0x80000000) ? polynomial : 0);
      }
      
      table[i] = this.#reflect(crc, 32);
    }
    
    this.#table = table;
    return table;
  }

  static #reflect(value, bits) {
    let result = 0;
    for (let i = 1; i <= bits; i++) {
      if (value & 1) {
        result |= (1 << (bits - i));
      }
      value >>= 1;
    }
    return result;
  }

  static partialCRC(crc, data, offset = 0, length) {
    const table = this.#initializeTable();
    const end = offset + (length ?? data.length - offset);
    
    for (let i = offset; i < end; i++) {
      crc = (crc >>> 8) ^ table[(crc & 0xFF) ^ data[i]];
    }
    
    return crc;
  }

  static fullCRC(data, offset = 0, length) {
    let crc = 0xFFFFFFFF;
    crc = this.partialCRC(crc, data, offset, length);
    return crc ^ 0xFFFFFFFF;
  }

  static compute(data) {
    return this.fullCRC(data);
  }
}

// ============================================================================
// XOR Filter - m_XorFilter[32] (PacketManager.cpp lines 37-68)
// ============================================================================

export const XOR_FILTER = new Uint8Array([
  0xE7, 0x6D, 0x3A, 0x89, 0xBC, 0xB2, 0x9F, 0x73,
  0x23, 0xA8, 0xFE, 0xB6, 0x49, 0x5D, 0x39, 0x5D,
  0x8A, 0xCB, 0x63, 0x8D, 0xEA, 0x7D, 0x2B, 0x5F,
  0xC3, 0xB1, 0xE9, 0x83, 0x29, 0x51, 0xE8, 0x56
]);

export const SAVE_LOAD_XOR = new Uint32Array([
  0x3F08A79B, 0xE25CC287, 0x93D27AB9, 0x20DEA7BF
]);

// ============================================================================
// Bit-packing Utilities (PacketManager.cpp lines 298-372)
// ============================================================================

export class BitPacking {
  /**
   * GetByteOfBit - PacketManager.cpp line 334-337
   * Retorna o índice do byte para uma posição de bit
   */
  static getByteOfBit(bitPos) {
    return bitPos >> 3; // value / 8
  }

  /**
   * Shift - PacketManager.cpp lines 339-372
   * Desloca bits no buffer (positivo = direita, negativo = esquerda)
   */
  static shift(buffer, size, shiftSize) {
    if (shiftSize === 0) return;
    
    if (shiftSize > 0) {
      // Shift right
      if (size > 1) {
        for (let n = size - 1; n > 0; n--) {
          buffer[n] = ((buffer[n - 1] << (8 - shiftSize)) | (buffer[n] >> shiftSize)) & 0xFF;
        }
      }
      buffer[0] = (buffer[0] >> shiftSize) & 0xFF;
    } else {
      // Shift left
      shiftSize = -shiftSize;
      if (size > 1) {
        for (let n = 0; n < size - 1; n++) {
          buffer[n] = ((buffer[n + 1] >> (8 - shiftSize)) | (buffer[n] << shiftSize)) & 0xFF;
        }
      }
      buffer[size - 1] = (buffer[size - 1] << shiftSize) & 0xFF;
    }
  }

  /**
   * AddBits - PacketManager.cpp lines 298-332
   * Adiciona bits do source ao target na posição TargetBitPos
   * Retorna a nova posição do bit
   */
  static addBits(target, targetBitPos, source, sourceBitPos, bitSize) {
    const sourceBitEnd = sourceBitPos + bitSize;
    const sourceByteStart = this.getByteOfBit(sourceBitPos);
    const sourceByteEnd = this.getByteOfBit(sourceBitEnd - 1);
    const tempSize1 = sourceByteEnd - sourceByteStart + 1;

    const tempBuff = new Uint8Array(tempSize1 + 1);
    tempBuff.fill(0);
    
    // Copy source bytes
    tempBuff.set(source.subarray(sourceByteStart, sourceByteStart + tempSize1), 0);

    // Mask last byte if not aligned
    if ((sourceBitEnd % 8) !== 0) {
      const mask = 0xFF << (8 - (sourceBitEnd % 8));
      tempBuff[tempSize1 - 1] &= mask;
    }

    const shiftLeft = sourceBitPos % 8;
    const shiftRight = targetBitPos % 8;

    this.shift(tempBuff, tempSize1, -shiftLeft);
    this.shift(tempBuff, tempSize1 + 1, shiftRight);

    const tempSize2 = ((shiftRight <= shiftLeft) ? 0 : 1) + tempSize1;
    const targetByteStart = this.getByteOfBit(targetBitPos);

    for (let n = 0; n < tempSize2; n++) {
      if (targetByteStart + n < target.length) {
        target[targetByteStart + n] |= tempBuff[n];
      }
    }

    return targetBitPos + bitSize;
  }

  /**
   * Extract bits from source to target
   * Inverse of addBits - used in DecryptBlock
   */
  static extractBits(target, targetBitPos, source, sourceBitPos, bitSize) {
    const sourceByteStart = this.getByteOfBit(sourceBitPos);
    const sourceByteEnd = this.getByteOfBit(sourceBitPos + bitSize - 1);
    const tempSize1 = sourceByteEnd - sourceByteStart + 1;

    const tempBuff = new Uint8Array(tempSize1 + 1);
    tempBuff.fill(0);
    
    tempBuff.set(source.subarray(sourceByteStart, sourceByteStart + tempSize1), 0);

    const shiftLeft = sourceBitPos % 8;
    const shiftRight = targetBitPos % 8;

    this.shift(tempBuff, tempSize1, -shiftLeft);
    this.shift(tempBuff, tempSize1 + 1, shiftRight);

    const tempSize2 = ((shiftRight <= shiftLeft) ? 0 : 1) + tempSize1;
    const targetByteStart = this.getByteOfBit(targetBitPos);

    for (let n = 0; n < tempSize2; n++) {
      if (targetByteStart + n < target.length) {
        target[targetByteStart + n] |= tempBuff[n];
      }
    }
  }
}

// ============================================================================
// ENCDEC Data Structures (PacketManager.h lines 15-20)
// ============================================================================

/**
 * @typedef {Object} ENCDECData
 * @property {Uint32Array} Modulus - Array de 4 DWORDs
 * @property {Uint32Array} Key - Array de 4 DWORDs
 * @property {Uint32Array} Xor - Array de 4 DWORDs
 */

/**
 * @returns {ENCDECData}
 */
export function createENCDECData() {
  return {
    Modulus: new Uint32Array(4),
    Key: new Uint32Array(4),
    Xor: new Uint32Array(4)
  };
}

// ============================================================================
// Block Encryption/Decryption (PacketManager.cpp lines 203-296)
// ============================================================================

export class BlockCipher {
  constructor() {
    this.encryption = createENCDECData();
    this.decryption = createENCDECData();
  }

  setEncryptionKey(data) {
    this.encryption.Modulus.set(data.Modulus);
    this.encryption.Key.set(data.Key);
    this.encryption.Xor.set(data.Xor);
  }

  setDecryptionKey(data) {
    this.decryption.Modulus.set(data.Modulus);
    this.decryption.Key.set(data.Key);
    this.decryption.Xor.set(data.Xor);
  }

  /**
   * EncryptBlock - PacketManager.cpp lines 203-243
   * 8 bytes source → 11 bytes target
   */
  encryptBlock(target, source, size) {
    const encBuffer = new Uint32Array(4);
    let encValue = 0;

    // Clear target (11 bytes)
    target.fill(0, 0, 11);

    // Process 4 WORDs (8 bytes) — loads LE manuais (a view Uint16Array direta de subarray
    // com byteOffset ÍMPAR quebrava o fluxo C3 real; semântica idêntica à source)
    const sourceWords = new Uint16Array(4);
    for (let i = 0; i < 4; i++) sourceWords[i] = (source[i * 2] | (source[i * 2 + 1] << 8)) & 0xFFFF;
    
    for (let n = 0; n < 4; n++) {
      const srcWord = n < ((size + 1) >> 1) ? sourceWords[n] : 0;
      encBuffer[n] = (((this.encryption.Xor[n] ^ srcWord) ^ encValue) * this.encryption.Key[n]) % this.encryption.Modulus[n];
      encValue = encBuffer[n] & 0xFFFF;
    }

    // XOR chain
    for (let n = 0; n < 3; n++) {
      encBuffer[n] = (encBuffer[n] ^ this.encryption.Xor[n]) ^ (encBuffer[n + 1] & 0xFFFF);
    }

    // Bit-packing: 4 x 16 bits + 4 x 2 bits = 72 bits = 9 bytes
    let bitPos = 0;
    for (let n = 0; n < 4; n++) {
      bitPos = BitPacking.addBits(target, bitPos, new Uint8Array(new Uint16Array([encBuffer[n]]).buffer), 0, 16);
      bitPos = BitPacking.addBits(target, bitPos, new Uint8Array(new Uint16Array([encBuffer[n]]).buffer), 22, 2);
    }

    // Checksum calculation
    let checkSum = 0xF8;
    for (let n = 0; n < 8; n++) {
      checkSum ^= source[n];
    }

    encValue = ((checkSum ^ size) ^ 0x3D) | (checkSum << 8);

    // Add final 16 bits (checksum + size)
    bitPos = BitPacking.addBits(target, bitPos, new Uint8Array(new Uint16Array([encValue]).buffer), 0, 16);

    return 11; // Always 11 bytes output
  }

  /**
   * DecryptBlock - PacketManager.cpp lines 245-296
   * 11 bytes source → 8 bytes target (returns actual size or -1 on error)
   */
  decryptBlock(target, source) {
    const decBuffer = new Uint32Array(4);

    // Clear target (8 bytes)
    target.fill(0, 0, 8);

    // Extract 4 x 18 bits (16 + 2)
    let bitPos = 0;
    for (let n = 0; n < 4; n++) {
      const temp = new Uint16Array(1);
      BitPacking.extractBits(new Uint8Array(temp.buffer), 0, source, bitPos, 16);
      decBuffer[n] = temp[0];
      bitPos += 16;
      
      BitPacking.extractBits(new Uint8Array(temp.buffer), 22, source, bitPos, 2);
      decBuffer[n] |= (temp[0] & 0x3) << 22;
      bitPos += 2;
    }

    // Reverse XOR chain
    for (let n = 2; n >= 0; n--) {
      decBuffer[n] = (decBuffer[n] ^ this.decryption.Xor[n]) ^ (decBuffer[n + 1] & 0xFFFF);
    }

    // Decrypt — target pode ser subarray com byteOffset ÍMPAR: palavras locais + store manual LE
    let value = 0;
    const targetWords = new Uint16Array(4);

    for (let n = 0; n < 4; n++) {
      targetWords[n] = ((((this.decryption.Key[n] * decBuffer[n]) % this.decryption.Modulus[n]) ^ this.decryption.Xor[n]) ^ value) & 0xFFFF;
      value = decBuffer[n] & 0xFFFF;
    }
    for (let n = 0; n < 4; n++) { target[n * 2] = targetWords[n] & 0xFF; target[n * 2 + 1] = (targetWords[n] >> 8) & 0xFF; }

    // Extract checksum/size (16 bits)
    decBuffer[0] = 0;
    const checkTemp = new Uint16Array(1);
    BitPacking.extractBits(new Uint8Array(checkTemp.buffer), 0, source, bitPos, 16);
    decBuffer[0] = checkTemp[0];

    const checkByte0 = (decBuffer[0] & 0xFF) ^ ((decBuffer[0] >> 8) & 0xFF) ^ 0x3D;
    const checkByte1 = (decBuffer[0] >> 8) & 0xFF;

    // Verify checksum
    let checkSum = 0xF8;
    for (let n = 0; n < 8; n++) {
      checkSum ^= target[n];
    }

    if (checkSum !== checkByte1) {
      return -1; // Checksum mismatch
    }

    return checkByte0; // Return actual size
  }
}

// ============================================================================
// XOR Data (PacketManager.cpp lines 418-429)
// ============================================================================

export function xorData(buffer, start, end) {
  if (start > end) return;
  
  for (let n = start; n < end; n++) {
    buffer[n] ^= buffer[n - 1] ^ XOR_FILTER[n % 32];
  }
}

// ============================================================================
// BuxConvert (wsclientinline.h)
// ============================================================================

export function buxConvert(buffer, size) {
  // PC wsclientinline.h: XOR rotativo bBuxCode[3] = {0xFC,0xCF,0xAB}
  // (counterpart exato de PacketArgumentDecrypt no GS — mu-server Util.cpp:154-162).
  // Antes estava NOT bitwise (~), o que quebrava login contra o GameServer real;
  // e size=undefined (default) não iterava. Agora: plenamente funcional.
  const BUX_KEY = [0xFC, 0xCF, 0xAB];
  const n = (size === undefined || size === null) ? buffer.length : Math.min(size, buffer.length);
  for (let i = 0; i < n; i++) {
    buffer[i] ^= BUX_KEY[i % 3];
  }
}

// ============================================================================
// Header Types (Packets.h)
// ============================================================================

export const HEADER_TYPE = {
  C1: 0xC1,  // Normal packet (1 byte size)
  C2: 0xC2,  // Normal packet (2 byte size)
  C3: 0xC3,  // Encrypted packet (1 byte size)
  C4: 0xC4   // Encrypted packet (2 byte size)
};

/**
 * @typedef {Object} PacketHeader
 * @property {number} type
 * @property {number} size
 * @property {number} head
 * @property {number} [subh]
 */

export function parseHeader(data) {
  if (data.length < 3) return null;
  
  const type = data[0];
  
  if (type === HEADER_TYPE.C1 || type === HEADER_TYPE.C3) {
    if (data.length < 4) return null;
    return {
      type,
      size: data[1],
      head: data[2],
      subh: data[3]
    };
  } else if (type === HEADER_TYPE.C2 || type === HEADER_TYPE.C4) {
    if (data.length < 5) return null;
    return {
      type,
      // ORDEM REAL (ConnectServerProtocol.cpp): header.size[0]=SET_NUMBERHB,
      // size[1]=SET_NUMBERLB → bytes [C2][sizeH][sizeL] (big-endian).
      // Prova: lista real F4:06 capturada = C2 00 0B = 11 bytes.
      size: (data[1] << 8) | data[2],
      head: data[3],
      subh: data[4]
    };
  }
  
  return null;
}

export function createHeader(type, head, subh, size) {
  if (type === HEADER_TYPE.C1 || type === HEADER_TYPE.C3) {
    const header = new Uint8Array(4);
    header[0] = type;
    header[1] = size & 0xFF;
    header[2] = head;
    header[3] = subh;
    return header;
  } else {
    const header = new Uint8Array(5);
    header[0] = type;
    header[1] = (size >> 8) & 0xFF;   // HIGH primeiro (SET_NUMBERHB — ver parseHeader)
    header[2] = size & 0xFF;          // LOW depois (SET_NUMBERLB)
    header[3] = head;
    header[4] = subh;
    return header;
  }
}

export function createSimpleHeader(type, head, size) {
  if (type === HEADER_TYPE.C1 || type === HEADER_TYPE.C3) {
    const header = new Uint8Array(3);
    header[0] = type;
    header[1] = size & 0xFF;
    header[2] = head;
    return header;
  } else {
    const header = new Uint8Array(4);
    header[0] = type;
    header[1] = size & 0xFF;
    header[2] = (size >> 8) & 0xFF;
    header[3] = head;
    return header;
  }
}