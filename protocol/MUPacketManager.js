/**
 * MUPacketManager.js - Port EXATO do PacketManager.cpp
 * 
 * Funcionalidades:
 * - LoadEncryptionKey/LoadDecryptionKey (carrega chaves .dat)
 * - Encrypt/Decrypt (blocos de 8 bytes → 11 bytes)
 * - AddData/ExtractPacket (headers C1/C2/C3/C4)
 * - XorData (XOR filter m_XorFilter[32])
 * - EncryptBlock/DecryptBlock com aritmética modular
 */

import {
  BlockCipher,
  createENCDECData,
  xorData,
  XOR_FILTER,
  SAVE_LOAD_XOR,
  parseHeader,
  createHeader,
  HEADER_TYPE,
  buxConvert,
  CRC32
} from './MUCrypto.js';

export class MUPacketManager {
  #encryption;
  #decryption;
  #saveLoadXor;
  #buffer;
  #size;
  #xorFilter;
  #blockCipher;
  #packetSerial;
  #encryptionKeyReady;
  #decryptionKeyReady;

  constructor() {
    this.#encryption = createENCDECData();
    this.#decryption = createENCDECData();
    this.#saveLoadXor = new Uint32Array(SAVE_LOAD_XOR);
    this.#buffer = new Uint8Array(2048);
    this.#size = 0;
    this.#xorFilter = new Uint8Array(XOR_FILTER);
    this.#blockCipher = new BlockCipher();
    this.#packetSerial = 0;
    this.#encryptionKeyReady = false;
    this.#decryptionKeyReady = false;
  }

  // ========================================================================
  // Initialization (PacketManager.cpp lines 23-69)
  // ========================================================================

  init() {
    this.#encryption = createENCDECData();
    this.#decryption = createENCDECData();
    this.#saveLoadXor.set(SAVE_LOAD_XOR);
    this.#buffer.fill(0);
    this.#size = 0;
    this.#xorFilter.set(XOR_FILTER);
    this.#packetSerial = 0;
    this.#encryptionKeyReady = false;
    this.#decryptionKeyReady = false;
  }

  // ========================================================================
  // Key Loading (PacketManager.cpp lines 71-138)
  // ========================================================================

  /**
   * LoadEncryptionKey - PacketManager.cpp line 72-74
   * Carrega chave de criptografia do arquivo .dat
   */
  async loadEncryptionKey(arrayBuffer) {
    const ok = await this.#loadKey(arrayBuffer, 4370, 0);
    this.#encryptionKeyReady = ok;
    return ok;
  }

  /**
   * LoadDecryptionKey - PacketManager.cpp line 76-79
   * Carrega chave de descriptografia do arquivo .dat
   */
  async loadDecryptionKey(arrayBuffer) {
    const ok = await this.#loadKey(arrayBuffer, 4370, 1);
    this.#decryptionKeyReady = ok;
    return ok;
  }

  /**
   * LoadKey - PacketManager.cpp lines 81-138
   * Carrega chave do arquivo .dat (header 4370, size = header + ENCDEC_DATA)
   */
  async #loadKey(arrayBuffer, header, type) {
    const view = new DataView(arrayBuffer);
    let offset = 0;

    // Read ENCDEC_HEADER (WORD header, DWORD size)
    if (arrayBuffer.byteLength < 6) return false;
    
    const fileHeader = view.getUint16(offset, true); // little endian
    offset += 2;
    const fileSize = view.getUint32(offset, true);
    offset += 4;

    if (fileHeader !== header || fileSize !== (6 + 48)) { // 6 = header size, 48 = ENCDEC_DATA (3 x 4 x 4 bytes)
      return false;
    }

    const targetData = type === 0 ? this.#encryption : this.#decryption;

    // Read 3 tables of 4 DWORDs each
    for (let tableIdx = 0; tableIdx < 3; tableIdx++) {
      const table = new Uint32Array(4);
      for (let n = 0; n < 4; n++) {
        if (offset + 4 > arrayBuffer.byteLength) return false;
        table[n] = view.getUint32(offset, true);
        offset += 4;
      }

      // XOR with SaveLoadXor
      for (let n = 0; n < 4; n++) {
        if (tableIdx === 0) {
          targetData.Modulus[n] = this.#saveLoadXor[n] ^ table[n];
        } else if (tableIdx === 1) {
          targetData.Key[n] = this.#saveLoadXor[n] ^ table[n];
        } else {
          targetData.Xor[n] = this.#saveLoadXor[n] ^ table[n];
        }
      }
    }

    // Update block cipher
    this.#blockCipher.setEncryptionKey(this.#encryption);
    this.#blockCipher.setDecryptionKey(this.#decryption);

    return true;
  }

  // ========================================================================
  // Encryption/Decryption (PacketManager.cpp lines 140-201)
  // ========================================================================

  /**
   * Encrypt - PacketManager.cpp lines 140-170
   * Criptografa dados em blocos de 8 bytes → 11 bytes cada
   * @returns tamanho dos dados criptografados
   */
  encrypt(source) {
    const oriSize = source.length;
    const dec = Math.ceil((oriSize + 7) / 8);
    const encryptedSize = ((dec + (dec * 4)) * 2) + dec; // Fórmula original
    
    const target = new Uint8Array(encryptedSize);
    let targetOffset = 0;
    let remainingSize = oriSize;

    for (let n = 0; n < oriSize; n += 8, remainingSize -= 8, targetOffset += 11) {
      let blockSize = remainingSize;
      if (blockSize > 8) blockSize = 8;
      
      const blockSource = source.subarray(n, n + blockSize);
      const blockTarget = target.subarray(targetOffset, targetOffset + 11);
      
      this.#blockCipher.encryptBlock(blockTarget, blockSource, blockSize);
    }

    return target.subarray(0, targetOffset);
  }

  /**
   * Decrypt - PacketManager.cpp lines 172-201
   * Descriptografa dados de 11 bytes → 8 bytes cada bloco
   * @returns Uint8Array com dados descriptografados
   */
  decrypt(source) {
    // R15.20: SimpleModulus ciphertext is an exact sequence of 11-byte blocks
    // (PacketManager.cpp EncryptBlock/DecryptBlock: 8 plain -> 11 wire). Never
    // accept/ignore a trailing partial block: doing so would let a malformed C3/C4
    // frame be authenticated only for its prefix while silently discarding bytes.
    if (!(source instanceof Uint8Array) || source.length === 0 || (source.length % 11) !== 0) {
      throw new Error('SimpleModulus ciphertext length inválido');
    }
    if (!this.#decryptionKeyReady) throw new Error('SimpleModulus Dec2 key não carregada');
    const estimatedSize = (source.length * 8) / 11;
    const target = new Uint8Array(Math.ceil(estimatedSize) + 8);
    
    let result = 0;
    let decSize = 0;
    let srcOffset = 0;
    let dstOffset = 0;

    while (decSize < source.length && srcOffset + 11 <= source.length) {
      const blockSource = source.subarray(srcOffset, srcOffset + 11);
      const blockTarget = target.subarray(dstOffset, dstOffset + 8);
      
      const blockResult = this.#blockCipher.decryptBlock(blockTarget, blockSource);
      
      if (blockResult < 0) {
        throw new Error('Decryption failed: checksum mismatch');
      }
      // R15.21: the encrypted block carries the original plaintext byte count.
      // EncryptBlock is only ever called with 1..8 bytes, so an authenticated
      // block claiming 0 or >8 bytes is structurally impossible and must not
      // advance the destination cursor outside the 8-byte block contract.
      if (blockResult < 1 || blockResult > 8) {
        throw new Error('SimpleModulus plaintext block size inválido');
      }
      
      result += blockResult;
      decSize += 11;
      srcOffset += 11;
      dstOffset += blockResult;
    }

    return target.subarray(0, result);
  }

  /**
   * EncryptBlock - PacketManager.cpp lines 203-243
   * Criptografa um bloco de 8 bytes → 11 bytes
   */
  encryptBlock(target, source, size) {
    return this.#blockCipher.encryptBlock(target, source, size);
  }

  /**
   * DecryptBlock - PacketManager.cpp lines 245-296
   * Descriptografa um bloco de 11 bytes → 8 bytes
   * @returns tamanho real dos dados ou -1 se erro
   */
  decryptBlock(target, source) {
    return this.#blockCipher.decryptBlock(target, source);
  }

  // ========================================================================
  // Packet Assembly/Extraction (PacketManager.cpp lines 374-416)
  // ========================================================================

  /**
   * AddData - PacketManager.cpp lines 374-384 (adaptado ao transporte WS):
   * CONCATENA chunks (o stream TCP pode vir dividido ou com vários pacotes —
   * probe real do ConnectServer entregou C1-init + C2-list no mesmo fluxo).
   */
  addData(data) {
    if (!data || data.length <= 0) return false;
    const incoming = data.length;
    if (this.#size + incoming > this.#buffer.length) {
      // proteção: 64KB máximo — stream dessincronizado não pode crescer infinito
      if (this.#size + incoming > 65536) { this.#size = 0; return false; }
      const grown = new Uint8Array(Math.min(65536, Math.max(this.#buffer.length * 2, this.#size + incoming)));
      grown.set(this.#buffer.subarray(0, this.#size), 0);
      this.#buffer = grown;
    }
    this.#buffer.set(data, this.#size);
    this.#size += incoming;
    return true;
  }

  /**
   * ExtractPacket - PacketManager.cpp lines 386-416
   * Extrai UM pacote completo por chamada, CONSUMINDO o buffer (permite vários
   * pacotes por chunk — sem consumo o caller entrava em loop infinito no mesmo
   * pacote). XOR CONDICIONAL: ConnectServer (server list) envia PLAIN
   * (SocketManager.cpp DataSend = WSASend direto, sem cifra); o filtro XOR do
   * PacketManager.cpp só vale para pacotes do GameServer. useXor=false no fluxo CS.
   * @returns {Uint8Array} pacote extraído ou null se incompleto
   */
  extractPacket(useXor = true) {
    let guard = 0;
    while (this.#size >= 3 && guard++ < 4096) {
      let packetSize;
      let headerEnd;
      switch (this.#buffer[0]) {
        case HEADER_TYPE.C1:
        case HEADER_TYPE.C3:
          packetSize = this.#buffer[1];
          headerEnd = 2;
          break;
        case HEADER_TYPE.C2:
        case HEADER_TYPE.C4:
          // ORDEM REAL (ConnectServerProtocol.cpp): header.size[0]=HB, size[1]=LB
          // → bytes [C2][sizeH][sizeL] (HIGH primeiro — C2 00 0B = 11 ✓ capturado)
          packetSize = (this.#buffer[1] << 8) | this.#buffer[2];
          headerEnd = 3;
          break;
        default:
          // stream dessincronizado: descarta 1 byte e tenta resync
          this.#buffer.copyWithin(0, 1, this.#size);
          this.#size -= 1;
          continue;
      }
      // A complete MU frame always includes a headcode after its size field:
      // C1/C3 => 2-byte header + head (min 3); C2/C4 => 3-byte header + head (min 4).
      // Reject impossible declared sizes instead of waiting/dispatching a header-only frame.
      const minFrame = headerEnd + 1;
      if (packetSize < minFrame) {
        this.#buffer.copyWithin(0, 1, this.#size);
        this.#size -= 1;
        continue;
      }
      if (this.#size < packetSize) return null; // incompleto
      // Aplica XOR nos dados (após header) — apenas quando o fluxo é cifrado
      // XOR filter é do frame plain C1/C2. C3/C4 carregam ciphertext
      // SimpleModulus; tocar esses bytes antes do decrypt destrói o checksum.
      if (useXor && (this.#buffer[0] === HEADER_TYPE.C1 || this.#buffer[0] === HEADER_TYPE.C2)) {
        xorData(this.#buffer, headerEnd + 1, packetSize);
      }
      const out = this.#buffer.slice(0, packetSize);
      this.#buffer.copyWithin(0, packetSize, this.#size);
      this.#size -= packetSize;
      return out;
    }
    return null;
  }

  /**
   * Get next packet serial for encrypted packets
   */
  getNextPacketSerial() {
    return this.#packetSerial++ & 0xFF;
  }

  // ========================================================================
  // Full Packet Processing (Protocol.cpp lines 51-93)
  // ========================================================================

  /**
   * Process outgoing packet (encrypt if needed, add serial)
   * Protocol.cpp DataSend function
   */
  processOutgoingPacket(packet) {
    if (!(packet instanceof Uint8Array)) throw new Error('MU TX packet inválido');
    const type = packet[0];
    const encryptedType = type === HEADER_TYPE.C3 || type === HEADER_TYPE.C4;
    if (!encryptedType) return packet;

    // R15.21: encrypted TX must already be one exact classic MU frame before
    // serial insertion/SimpleModulus. Do not encrypt a truncated frame, bytes
    // trailing after the declared frame, or a header-only C3/C4 packet.
    const headerBytes = type === HEADER_TYPE.C3 ? 2 : 3;
    const minFrame = headerBytes + 1; // at least one headcode byte
    if (packet.length < minFrame) throw new Error('MU TX encrypted frame curto');
    const declaredSize = type === HEADER_TYPE.C3
      ? packet[1]
      : ((packet[1] << 8) | packet[2]);
    if (declaredSize !== packet.length) throw new Error('MU TX encrypted frame size inválido');
    // R15.23: never execute modular arithmetic with the constructor's zeroed
    // key tables. Encrypted TX is authoritative only after Enc1.dat passed
    // the exact key-file loader; otherwise fail closed before consuming serial.
    if (!this.#encryptionKeyReady) throw new Error('SimpleModulus Enc1 key não carregada');

    let result = packet;
    let size = packet.length;

    if (type === HEADER_TYPE.C3 || type === HEADER_TYPE.C4) {
      const serial = this.getNextPacketSerial();
      
      if (type === HEADER_TYPE.C3) {
        // C3: 1 byte size, encrypt from byte 1 (after type)
        // R15.23: serial insertion is transactional. Never mutate the caller's
        // source frame; an encryption/size failure must leave retry/debug bytes exact.
        const plain = packet.slice(1, size);
        plain[0] = serial;
        const encrypted = this.encrypt(plain);
        const newSize = encrypted.length + 2;
        if (newSize > 0xFF) throw new Error('C3 ciphertext excede tamanho wire');

        result = new Uint8Array(newSize);
        result[0] = HEADER_TYPE.C3;
        result[1] = newSize & 0xFF;
        result.set(encrypted, 2);
      } else {
        // C4: 2 byte size, encrypt from byte 2 (after type + size)
        const plain = packet.slice(2, size);
        plain[0] = serial;
        const encrypted = this.encrypt(plain);
        const newSize = encrypted.length + 3;
        if (newSize > 0xFFFF) throw new Error('C4 ciphertext excede tamanho wire');

        result = new Uint8Array(newSize);
        result[0] = HEADER_TYPE.C4;
        // PWMSG size é HIGH,LOW no wire (mesma ordem de parseHeader/C2).
        result[1] = (newSize >> 8) & 0xFF;
        result[2] = newSize & 0xFF;
        result.set(encrypted, 3);
      }
    }

    return result;
  }

  /**
   * Decifra UM frame C3/C4 completo e o reconstrói como C1/C2 plain.
   * Autoridade: PacketManager.cpp/Protocol.cpp — o bloco cifrado começa no
   * byte de serial; após decrypt o serial é descartado antes do dispatch.
   * Retorna null para frame não-cifrado e lança em checksum/key inválida.
   */
  decryptEncryptedFrame(frame) {
    if (!(frame instanceof Uint8Array) || frame.length < 3) return null;
    const type = frame[0];
    if (type === HEADER_TYPE.C3) {
      const wireSize = frame[1];
      if (wireSize !== frame.length || frame.length < 13) throw new Error('C3 frame size inválido');
      const plain = this.decrypt(frame.subarray(2)); // [serial][head][sub?/payload...]
      if (plain.length < 2) throw new Error('C3 plaintext curto');
      const total = plain.length + 1;
      if (total > 0xFF) throw new Error('C3 plaintext excede C1');
      const out = new Uint8Array(total);
      out[0] = HEADER_TYPE.C1; out[1] = total; out.set(plain.subarray(1), 2);
      return out;
    }
    if (type === HEADER_TYPE.C4) {
      const wireSize = (frame[1] << 8) | frame[2];
      if (wireSize !== frame.length || frame.length < 14) throw new Error('C4 frame size inválido');
      const plain = this.decrypt(frame.subarray(3)); // [serial][head][sub?/payload...]
      if (plain.length < 2) throw new Error('C4 plaintext curto');
      const total = plain.length + 2;
      const out = new Uint8Array(total);
      out[0] = HEADER_TYPE.C2; out[1] = (total >> 8) & 0xFF; out[2] = total & 0xFF;
      out.set(plain.subarray(1), 3);
      return out;
    }
    return null;
  }

  /**
   * Process incoming packet (framing; callers que recebem C3/C4 usam
   * decryptEncryptedFrame depois de carregar Dec2.dat).
   */
  processIncomingPacket(data) {
    this.addData(data);
    return this.extractPacket();
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  getBuffer() {
    return this.#buffer.subarray(0, this.#size);
  }

  getSize() {
    return this.#size;
  }

  clear() {
    this.#buffer.fill(0);
    this.#size = 0;
  }

  // ========================================================================
  // Static Helper Methods
  // ========================================================================

  /**
   * Create a C1 packet (1-byte size, no subcode)
   */
  static createC1Packet(head, payload) {
    const size = 3 + payload.length; // type + size + head + payload
    const packet = new Uint8Array(size);
    packet[0] = HEADER_TYPE.C1;
    packet[1] = size & 0xFF;
    packet[2] = head;
    packet.set(payload, 3);
    return packet;
  }

  /**
   * Create a C1 packet with subcode (PSBMSG_HEAD)
   */
  static createC1PacketSub(head, subh, payload) {
    const size = 4 + payload.length; // type + size + head + subh + payload
    const packet = new Uint8Array(size);
    packet[0] = HEADER_TYPE.C1;
    packet[1] = size & 0xFF;
    packet[2] = head;
    packet[3] = subh;
    packet.set(payload, 4);
    return packet;
  }

  /**
   * Create a C2 packet (2-byte size, with subcode) — HIGH byte primeiro
   * (SET_NUMBERHB/SET_NUMBERLB — ConnectServerProtocol.cpp)
   */
  static createC2Packet(head, subh, payload) {
    const size = 5 + payload.length;
    const packet = new Uint8Array(size);
    packet[0] = HEADER_TYPE.C2;
    packet[1] = (size >> 8) & 0xFF;
    packet[2] = size & 0xFF;
    packet[3] = head;
    packet[4] = subh;
    packet.set(payload, 5);
    return packet;
  }

  /**
   * Create a C3 packet (encrypted, 1-byte size)
   */
  static createC3Packet(head, subh, payload) {
    const size = 4 + payload.length;
    const packet = new Uint8Array(size);
    packet[0] = HEADER_TYPE.C3;
    packet[1] = size & 0xFF;
    packet[2] = head;
    packet[3] = subh;
    packet.set(payload, 4);
    return packet;
  }

  /**
   * Create a C4 packet (encrypted, 2-byte size) — HIGH byte primeiro
   */
  static createC4Packet(head, subh, payload) {
    const size = 5 + payload.length;
    const packet = new Uint8Array(size);
    packet[0] = HEADER_TYPE.C4;
    packet[1] = (size >> 8) & 0xFF;
    packet[2] = size & 0xFF;
    packet[3] = head;
    packet[4] = subh;
    packet.set(payload, 5);
    return packet;
  }

  /**
   * BuxConvert - wsclientinline.h
   * Aplica NOT bitwise nos dados (usado para login)
   */
  static buxConvert(data) {
    buxConvert(data, data.length);
  }
}

export default MUPacketManager;