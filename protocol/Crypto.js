/**
 * Crypto.js - Utilitários criptográficos do protocolo MU.
 * Port do XOR simétrico e CRC32 do cliente C++ original.
 */

export const DEFAULT_XOR_KEY = [0x45, 0xAB, 0x12, 0xC9];

/**
 * XOR simétrico com chave rotativa byte a byte.
 * Mesma função criptografa e descriptografa.
 * @param {Uint8Array} bytes
 * @param {number[]} key
 * @returns {Uint8Array} nova instância (não muta a entrada)
 */
export function xorCrypt(bytes, key = DEFAULT_XOR_KEY) {
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        out[i] = bytes[i] ^ key[i % key.length];
    }
    return out;
}

// Tabela CRC32 (polinômio 0xEDB88320), gerada em runtime
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
    }
    return table;
})();

/**
 * CRC32 clássico (zlib) de um buffer de bytes.
 * @param {Uint8Array|string} bytes
 * @returns {number} uint32
 */
export function crc32(bytes) {
    let input = bytes;
    if (typeof bytes === 'string') {
        input = new TextEncoder().encode(bytes);
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < input.length; i++) {
        crc = CRC_TABLE[(crc ^ input[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Verificação rápida de sanidade.
 * @returns {boolean} true se xor(xor(x))===x e CRC32("123456789")===0xCBF43926
 */
export function selfTest() {
    const sample = new TextEncoder().encode('MU Protocol Test 12345');
    const roundTrip = xorCrypt(xorCrypt(sample));
    const xorOk = roundTrip.every((b, i) => b === sample[i]);

    // CRC32 de "123456789" é o valor de referência clássico 0xCBF43926
    const crcOk = crc32('123456789') === 0xCBF43926;

    if (!xorOk) console.error('[Crypto] selfTest: XOR falhou');
    if (!crcOk) console.error('[Crypto] selfTest: CRC32 falhou');
    return xorOk && crcOk;
}
