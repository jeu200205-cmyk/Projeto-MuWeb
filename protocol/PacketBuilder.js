/**
 * PacketBuilder.js - Construção de payloads binários (little-endian).
 * Port das estruturas de pacotes do cliente C++ original.
 */

const encoder = new TextEncoder();

/** Codifica string em bytes UTF-8, terminada em 0x00 (estilo C string). */
function cString(text, fixedLen = 0) {
    const raw = encoder.encode(String(text));
    const body = fixedLen > 0 ? raw.slice(0, fixedLen - 1) : raw;
    const out = new Uint8Array(fixedLen > 0 ? fixedLen : body.length + 1);
    out.set(body, 0);
    return out; // resto fica 0x00 (terminador)
}

/** CHAT: [len:u8][text bytes] */
export function buildChat(text) {
    const bytes = encoder.encode(String(text));
    const payload = new Uint8Array(1 + bytes.length);
    new DataView(payload.buffer).setUint8(0, bytes.length);
    payload.set(bytes, 1);
    return payload;
}

/** LOGIN: [len:u8][user][len:u8][pass] */
export function buildLogin(user, pass) {
    const u = encoder.encode(String(user));
    const p = encoder.encode(String(pass));
    const payload = new Uint8Array(2 + u.length + p.length);
    const dv = new DataView(payload.buffer);
    dv.setUint8(0, u.length);
    payload.set(u, 1);
    dv.setUint8(1 + u.length, p.length);
    payload.set(p, 2 + u.length);
    return payload;
}

/** MOVE: [x:i16][y:i16][z:i16][dir:u8] little-endian */
export function buildMove(x, y, z, dir) {
    const payload = new Uint8Array(7);
    const dv = new DataView(payload.buffer);
    dv.setInt16(0, x | 0, true);
    dv.setInt16(2, y | 0, true);
    dv.setInt16(4, z | 0, true);
    dv.setUint8(6, dir & 0xFF);
    return payload;
}

/** ATTACK: [targetId:u16][skillId:u8] */
export function buildAttack(targetId, skillId) {
    const payload = new Uint8Array(3);
    const dv = new DataView(payload.buffer);
    dv.setUint16(0, targetId & 0xFFFF, true);
    dv.setUint8(2, skillId & 0xFF);
    return payload;
}

/** CHAR_SELECT: nome como C-string (máx 16 bytes) */
export function buildCharSelect(name) {
    return cString(name, 16);
}

/** ADD_STATS: [attr:u8][points:u16 LE] */
export function buildAddStats(attr, points) {
    const payload = new Uint8Array(3);
    const dv = new DataView(payload.buffer);
    dv.setUint8(0, attr & 0xFF);
    dv.setUint16(1, points & 0xFFFF, true);
    return payload;
}

/** WARP: [mapId:u8] */
export function buildWarp(mapId) {
    const payload = new Uint8Array(1);
    new DataView(payload.buffer).setUint8(0, mapId & 0xFF);
    return payload;
}

/** PING: payload vazio */
export function buildPing() {
    return new Uint8Array(0);
}
