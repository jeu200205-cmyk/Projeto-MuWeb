// PcGlobalText.js — port direto de GlobalText.h::TGlobalText<char>::Load.
// Formato: WORD signature 0x5447, DWORD count, repetição {DWORD key,DWORD size,bytes[size]}.
// Cada payload de string usa BuxConvert [0xFC,0xCF,0xAB]. Sem fallback inventado.

const BUX = Uint8Array.of(0xFC, 0xCF, 0xAB);
const DECODER = new TextDecoder('windows-1252');

export function parsePcGlobalText(input) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 6) throw new Error('GlobalText: arquivo curto');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = dv.getUint16(0, true);
  if (signature !== 0x5447) throw new Error(`GlobalText: signature 0x${signature.toString(16)} != 0x5447`);
  const count = dv.getUint32(2, true);
  if (count > 100000) throw new Error('GlobalText: count inválido');
  let p = 6;
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (p + 8 > bytes.length) throw new Error(`GlobalText: header truncado @${i}`);
    const key = dv.getUint32(p, true); p += 4;
    const size = dv.getUint32(p, true); p += 4;
    if (size > 1024 * 1024 || p + size > bytes.length) throw new Error(`GlobalText: string truncada key=${key}`);
    const dec = new Uint8Array(size);
    for (let j = 0; j < size; j++) dec[j] = bytes[p + j] ^ BUX[j % 3];
    p += size;
    // C++ stores exact size and appends NUL after decode. Preserve interior text,
    // remove only accidental terminal NULs present in authored data.
    let text = DECODER.decode(dec);
    text = text.replace(/\0+$/g, '');
    out.set(key, text);
  }
  return out;
}

export async function loadPcGlobalText(fetchBinary, path = 'Local/Por/Text_por.bmd') {
  if (typeof fetchBinary !== 'function') throw new Error('GlobalText: fetchBinary ausente');
  const bytes = await fetchBinary(path);
  return parsePcGlobalText(bytes);
}

export function pcGlobalTextGet(table, key) {
  return table instanceof Map && table.has(key) ? table.get(key) : null;
}

// Subconjunto de sprintf usado pelos owners NewUI/RenderItemInfo: %s, %d, %u,
// largura zero-pad (ex. %02d) e %% literal. Se o formato requer algo fora desse
// contrato, retorna null em vez de fabricar uma string.
export function pcSprintf(format, ...args) {
  if (typeof format !== 'string') return null;
  let ai = 0;
  let unsupported = false;
  const token = /%%|%(0?)(\d+)?([sdiu])/g;
  let last = 0, out = '', m;
  while ((m = token.exec(format))) {
    const between = format.slice(last, m.index);
    if (/%(?!%|0?\d*[sdiu])/.test(between)) unsupported = true;
    out += between;
    last = token.lastIndex;
    if (m[0] === '%%') { out += '%'; continue; }
    if (ai >= args.length) return null;
    const v = args[ai++];
    let s;
    if (m[3] === 's') s = String(v ?? '');
    else {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      s = String(m[3] === 'u' ? (Math.trunc(n) >>> 0) : Math.trunc(n));
    }
    const width = m[2] ? Number(m[2]) : 0;
    if (width > 0 && s.length < width) s = s.padStart(width, m[1] === '0' ? '0' : ' ');
    out += s;
  }
  const tail = format.slice(last);
  if (/%(?!%|0?\d*[sdiu])/.test(tail)) unsupported = true;
  out += tail;
  return unsupported ? null : out;
}
