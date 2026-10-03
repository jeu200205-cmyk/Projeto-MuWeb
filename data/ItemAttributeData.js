/**
 * ItemAttributeData.js — reader of the real PC Item_<lang>.bmd table.
 *
 * Main 5.2 authority (same contract already ported on Android):
 *   Data/Local/<lang>/Item_<lang>.bmd = encrypted ITEM_ATTRIBUTE[MAX_ITEM]
 *   followed by DWORD checksum. Each record is Bux XOR decoded with FC CF AB.
 * TwoHand is byte 30: char Name[30]; bool TwoHand.
 *
 * This module intentionally exposes only metadata proven by the binary layout.
 * No guessed item family/two-hand table is baked into Web.
 */

const MAX_ITEM = 16 * 512; // Main 5.2 category space used by this source.
const BUX = [0xFC, 0xCF, 0xAB];
const PATHS = [
  'Local/Eng/item_eng.bmd',
  'Local/Eng/Item_Eng.bmd',
  'Local/Eng/2item_eng.bmd',
  'Local/Eng/orgn-item_eng.bmd',
  'Local/Eng/--item_eng.bmd',
  'Local/Por/item_por.bmd',
];

let _cache = null;
let _inflight = null;
let _warned = false;

function u32(v) { return v >>> 0; }

/** Port of GenerateCheckSum2(buffer,size,0xE2F1). */
export function generateCheckSum2(bytes, key = 0xE2F1) {
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
  let result = u32((key >>> 0) << 9);
  if (src.length < 4) return result;
  for (let checked = 0; checked <= src.length - 4; checked += 4) {
    const temp = dv.getUint32(checked, true);
    if ((((checked >>> 2) + key) & 1) === 0) result = u32(result ^ temp);
    else result = u32(result + temp);
    if ((checked & 15) === 0) {
      const shift = (((checked >>> 2) & 7) + 1);
      result = u32(result ^ (u32(key + result) >>> shift));
    }
  }
  return result;
}

function decodeRecord(raw, offset, stride) {
  const out = new Uint8Array(stride);
  for (let i = 0; i < stride; i++) out[i] = raw[offset + i] ^ BUX[i % 3];
  return out;
}

export function parseItemAttributeBmd(input) {
  const rawFile = input instanceof Uint8Array ? input : new Uint8Array(input || 0);
  if (rawFile.length <= 4 || ((rawFile.length - 4) % MAX_ITEM) !== 0) {
    throw new Error(`ItemAttribute tamanho inválido ${rawFile.length}`);
  }
  const dataSize = rawFile.length - 4;
  const stride = dataSize / MAX_ITEM;
  if (stride < 31) throw new Error(`ItemAttribute stride inválido ${stride}`);
  const encrypted = rawFile.subarray(0, dataSize);
  const stored = new DataView(rawFile.buffer, rawFile.byteOffset + dataSize, 4).getUint32(0, true);
  const calc = generateCheckSum2(encrypted, 0xE2F1);
  if (stored !== calc) throw new Error(`ItemAttribute checksum inválido stored=${stored.toString(16)} calc=${calc.toString(16)}`);

  const twoHand = new Uint8Array(MAX_ITEM);
  const width = new Uint8Array(MAX_ITEM);
  const height = new Uint8Array(MAX_ITEM);
  const names = new Array(MAX_ITEM);
  // Width/Height offsets are ABI-dependent after the early ITEM_ATTRIBUTE fields.
  // Do not guess them here. TwoHand/name are enough for SetPlayerStop/Walk.
  for (let i = 0; i < MAX_ITEM; i++) {
    const rec = decodeRecord(encrypted, i * stride, stride);
    twoHand[i] = rec[30] ? 1 : 0;
    let end = 0;
    while (end < 30 && rec[end]) end++;
    try { names[i] = new TextDecoder('windows-1252').decode(rec.subarray(0, end)); }
    catch { names[i] = String.fromCharCode(...rec.subarray(0, end)); }
    width[i] = 1; height[i] = 1;
  }
  return { stride, twoHand, width, height, names, count: MAX_ITEM };
}

export async function loadItemAttributes(fetchBinary) {
  if (_cache) return _cache;
  if (_inflight) return _inflight;
  if (typeof fetchBinary !== 'function') return null;
  _inflight = (async () => {
    let last = null;
    for (const path of PATHS) {
      try {
        const buf = await fetchBinary(path);
        if (!buf) continue;
        const parsed = parseItemAttributeBmd(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
        parsed.path = path;
        console.info(`[ItemAttribute] PC ${path} OK entries=${parsed.count} stride=${parsed.stride}`);
        _cache = parsed;
        return parsed;
      } catch (e) { last = e; }
    }
    if (!_warned) {
      _warned = true;
      console.warn(`[ItemAttribute] Item_Eng.bmd indisponível/inválido — TwoHand fica desconhecido (fail-closed): ${last?.message || 'asset ausente'}`);
    }
    return null;
  })().finally(() => { _inflight = null; });
  return _inflight;
}

export async function itemAttributeFor(fetchBinary, itemType) {
  if (!Number.isInteger(itemType) || itemType < 0 || itemType >= MAX_ITEM) return null;
  const db = await loadItemAttributes(fetchBinary);
  if (!db) return null;
  return { itemType, twoHand: db.twoHand[itemType] !== 0, name: db.names[itemType] || '', stride: db.stride };
}

export const ITEM_ATTRIBUTE_MAX_ITEM = MAX_ITEM;
