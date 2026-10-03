/**
 * PcLuaCrypt.js — exact current-client LuaCrypt reader.
 *
 * Authority:
 *   PC Main client LuaDecrypt.h / LuaDecrypt.cpp
 *   user-supplied current Data/Configs Lua corpus (2026-09-29)
 *
 * The native decryptor uses ONLY privateCode[n % len] % 16 to select the
 * 16-byte xor table.  The 34-value cycle below is that exact modulo-16 stream
 * recovered from the supplied encrypted corpus; no plaintext rows/config data
 * are embedded here and no alternative key is guessed.
 *
 * Fail-closed: a file carrying the LuaCrypt header is returned only when the
 * decrypted body looks like text Lua. Plaintext files are passed through.
 */

export const PC_LUA_CRYPT_HEADER = Object.freeze([0x31,0x73,0xD9,0xE3,0xCD,0xA2,0x5B,0xF7]);
export const PC_LUA_XOR_TABLE = Object.freeze([0x2E,0x61,0x80,0xAA,0x05,0xEE,0x31,0x76,0x71,0xD5,0x20,0xCA,0x62,0x4E,0xE7,0xC4]);
export const PC_LUA_PRIVATE_CODE_MOD16 = Object.freeze([
  5,8,2,0,8,13,3,14,6,13,7,11,10,12,7,7,4,
  9,9,4,6,8,5,9,5,7,5,5,1,4,6,1,0,8,
]);

function asU8(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return new Uint8Array(0);
}

export function isPcEncryptedLua(input) {
  const u=asU8(input);
  if (u.length < PC_LUA_CRYPT_HEADER.length) return false;
  for (let i=0;i<PC_LUA_CRYPT_HEADER.length;i++) if (u[i] !== PC_LUA_CRYPT_HEADER[i]) return false;
  return true;
}

function looksLikeTextLua(bytes) {
  if (!bytes?.length) return false;
  let printable=0, nul=0;
  const n=Math.min(bytes.length, 4096);
  for (let i=0;i<n;i++) {
    const b=bytes[i];
    if (b===0) nul++;
    if (b===9 || b===10 || b===13 || (b>=32 && b<=126) || b>=0x80) printable++;
  }
  if (nul > Math.max(1, Math.floor(n * 0.002))) return false;
  if (printable / n < 0.94) return false;
  let text='';
  try { text=new TextDecoder('windows-1252',{fatal:false}).decode(bytes.subarray(0,n)); }
  catch { text=new TextDecoder('utf-8',{fatal:false}).decode(bytes.subarray(0,n)); }
  // Every supplied owner is ordinary textual Lua, never LuaJIT bytecode.
  return /(?:\bfunction\b|\blocal\b|\breturn\b|\bOpenFolder\s*\(|\b[A-Za-z_]\w*\s*=\s*\{)/.test(text);
}

export function decodePcLuaBytes(input) {
  const src=asU8(input);
  if (!isPcEncryptedLua(src)) return src.slice();
  if (!PC_LUA_PRIVATE_CODE_MOD16.length) throw new Error('LuaCrypt private-code stream unavailable');
  const payload=src.subarray(PC_LUA_CRYPT_HEADER.length);
  const out=new Uint8Array(payload.length);
  for (let n=0;n<payload.length;n++) {
    // C++: cipher -= table[privateCode[n % len] % 16]; cipher ^= table[n % 16]
    const sub=PC_LUA_XOR_TABLE[PC_LUA_PRIVATE_CODE_MOD16[n % PC_LUA_PRIVATE_CODE_MOD16.length]];
    const v=(payload[n] - sub) & 0xFF;
    out[n]=(v ^ PC_LUA_XOR_TABLE[n % PC_LUA_XOR_TABLE.length]) & 0xFF;
  }
  if (!looksLikeTextLua(out)) throw new Error('LuaCrypt header matched but decrypted body failed Lua text gate');
  return out;
}

export function decodePcLuaText(input) {
  const encrypted=isPcEncryptedLua(input);
  const bytes=decodePcLuaBytes(input);
  // Current encrypted scripts are ANSI/Windows client text. Preserve plaintext
  // UTF-8 lanes exactly as R71 did, so this adapter does not reinterpret them.
  if (encrypted) {
    // R77: the current MoveCustom corpus is encrypted but its plaintext bytes
    // are valid UTF-8 (e.g. "Cemitério", "Baú").  Decoding every encrypted
    // file as Windows-1252 produced mojibake (CemitÃ©rio/BaÃº) and therefore
    // wrong visible map/destination names. Prefer strict UTF-8 when valid;
    // retain Windows-1252 for legacy ANSI scripts.
    try { return new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
    catch {
      try { return new TextDecoder('windows-1252',{fatal:false}).decode(bytes); }
      catch { /* old browser fallback below */ }
    }
  }
  return new TextDecoder('utf-8',{fatal:false}).decode(bytes);
}
