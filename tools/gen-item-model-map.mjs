// tools/gen-item-model-map.mjs — R12.4 P3: gera data/ItemModelMap.js a partir
// da AUTORIDADE PC (D:\Source\Source\Main\source): os gLoadData.AccessModel(...)
// (LoadData.cpp:21-29: i omitido → Name.bmd; i<10 → Name0i.bmd; senão Namei.bmd).
// Type = MODEL_<FAMILIA> + offset → chave web '<FAMILIA>:<offset>'.
// Loops são resolvidos por varredura para trás (a source sempre cola o for no
// AccessModel); diretivas #if/#else viram variantes — 1ª escrita primária, o
// resolver runtime decide por existência no manifest (fail-closed).
import fs from 'fs';
import path from 'path';
import url from 'url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const PC_SRC_CANDIDATES = [
  'D:/Source/Source/Main/source',
  'E:/Users/jeu/Documents/Nova pasta/mu_source',
];
const PC_SRC = process.env.MU_PC_SOURCE || PC_SRC_CANDIDATES.find((p) => fs.existsSync(p)) || PC_SRC_CANDIDATES[0];
if (!fs.existsSync(PC_SRC)) {
  console.error(`[gen] FAIL-CLOSED: source PC não encontrada (MU_PC_SOURCE=${process.env.MU_PC_SOURCE ?? '-'}; candidatos: ${PC_SRC_CANDIDATES.join(', ')}). Abortando SEM sobrescrever data/ItemModelMap.js.`);
  process.exit(1);
}
const FILES = ['ZzzOpenData.cpp', 'Event.cpp', 'MonkSystem.cpp', 'ChangeRingManager.cpp', 'GMEmpireGuardian4.cpp'];
// R12.6 (t-muhjlq66-8): POTION adicionada — autoridade ZzzOpenData.cpp:944+
// (for i<7 → Potion01-07; +8 Antidote; +9 Beer; +10 Scroll; +11 MagicBox;
// +12 Event; +13/14 Jewel01/02; +15 Gold; +16 Jewel(3); +21 ConChip; +31 suho;
// +41 rs; +42 jos; partCharge*/cherryblossom) — necessária p/ os ícones 3D
// do inventário (RenderItem3D usa Type+MODEL_ITEM = mesmo índice família).
const FAMILIES = ['SWORD', 'AXE', 'MACE', 'SPEAR', 'BOW', 'STAFF', 'SHIELD', 'WING', 'HELPER', 'POTION', 'ETC'];

function evalExpr(expr, env = {}) {
  // Tiny arithmetic parser for the forms used by AccessModel rows in Main 5.2:
  // constants, loop vars, unary +/- and + - *.  Never use JS eval on source.
  const src = String(expr ?? '').replace(/\s+/g, '');
  if (!src) return null;
  const toks = src.match(/[A-Za-z_]\w*|\d+|[()+*\-]/g) || [];
  if (toks.join('') !== src) return null;
  let pos = 0;
  const primary = () => {
    const t = toks[pos++];
    if (t == null) return null;
    if (t === '(') {
      const v = sum();
      if (toks[pos++] !== ')') return null;
      return v;
    }
    if (/^\d+$/.test(t)) return Number(t);
    if (/^[A-Za-z_]\w*$/.test(t) && Number.isInteger(env[t])) return env[t];
    return null;
  };
  const unary = () => {
    if (toks[pos] === '+') { pos++; return unary(); }
    if (toks[pos] === '-') { pos++; const v = unary(); return v == null ? null : -v; }
    return primary();
  };
  const product = () => {
    let v = unary(); if (v == null) return null;
    while (toks[pos] === '*') { pos++; const r = unary(); if (r == null) return null; v *= r; }
    return v;
  };
  const sum = () => {
    let v = product(); if (v == null) return null;
    while (toks[pos] === '+' || toks[pos] === '-') {
      const op = toks[pos++], r = product(); if (r == null) return null;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const out = sum();
  return out != null && pos === toks.length && Number.isInteger(out) ? out : null;
}

function exprIdentifiers(expr) {
  return new Set((String(expr ?? '').match(/[A-Za-z_]\w*/g) || []));
}


// Main 5.2 mostly calls gLoadData.AccessModel(...), but MonkSystem.cpp uses the
// same loader contract through its inherited/bare AccessModel(...). The source file
// allow-list above and MODEL_<family> first argument keep this parser narrow.
const reAccess = /(?:(?:::)?gLoadData\s*\.\s*)?AccessModel\s*\(\s*MODEL_([A-Z_0-9]+)\s*([+][^,]*)?,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*(?:,\s*([^)]*))?\)/;
const reFor = (line) => {
  const m = line.match(/for\s*\(\s*(?:int\s+|short\s+|BYTE\s+|auto\s+)?([a-z])\s*=\s*(\d+)\s*;\s*\1\s*(<|<=)\s*(\d+)\s*;/);
  if (!m) return null;
  return { var: m[1], from: +m[2], to: m[3] === '<' ? +m[4] - 1 : +m[4] };
};

function normDir(dir) {
  return dir.replace(/\\\\/g, '/').replace(/\\/g, '/').replace(/^Data\//i, '').replace(/\/+$/, '');
}

const entries = new Map();
let collisions = 0, skipped = 0, parsed = 0;
const skippedLog = [];

function addEntry(fam, off, dir, fileName, iEff, lineNo, file) {
  let name;
  if (iEff < 0) name = `${fileName}.bmd`;
  else if (iEff < 10) name = `${fileName}0${iEff}.bmd`;
  else name = `${fileName}${iEff}.bmd`;
  const d = normDir(dir);
  const rel = (d ? d + '/' : '') + name;
  const key = `${fam}:${off}`;
  const ev = { path: rel, src: `${file}:L${lineNo}` };
  const cur = entries.get(key);
  if (!cur) { entries.set(key, { path: rel, variants: [ev] }); parsed++; }
  else { collisions++; cur.variants.push(ev); }
}

for (const f of FILES) {
  const fp = path.join(PC_SRC, f);
  if (!fs.existsSync(fp)) continue;
  const lines = fs.readFileSync(fp, 'utf8').split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const ma = line.match(reAccess);
    if (!ma) continue;
    const [, fam, offExprRaw, dir, fileName, iArgRaw] = ma;
    if (!FAMILIES.includes(fam)) continue;
    const exprText = `${offExprRaw || ''} ${iArgRaw ?? ''}`;
    const ids = exprIdentifiers(exprText);
    if (!ids.size) {
      const off = evalExpr(offExprRaw || '0');
      const iEff = iArgRaw === undefined ? -1 : evalExpr(iArgRaw);
      if (off == null || iEff == null) { skipped++; skippedLog.push(`${f}:L${li + 1} expr não avaliável`); continue; }
      addEntry(fam, off, dir, fileName, iEff, li + 1, f);
      continue;
    }

    // Recover the source loop context. Main 5.2 has both one-level loops and
    // the socket-sphere nested i/j loop (MODEL_WING+100+i*6+j).  FIX8's
    // generator only understood i/c and the nearest loop, silently omitting
    // 30 stock sphere models plus k-loop package items from ItemModelMap.
    const loops = [];
    const sameLine = reFor(line);
    if (sameLine) loops.push(sameLine);
    for (let b = li - 1; b >= 0 && b >= li - 12; b--) {
      const bl = lines[b].trim();
      if (reAccess.test(bl)) break;
      const lf = reFor(bl);
      if (lf && !loops.some((x) => x.var === lf.var)) loops.push(lf);
      // A closed block before any recovered loop means the AccessModel row is
      // not governed by a nearby for. Once at least one loop is found, keep
      // scanning across opening braces so nested outer loops can be recovered.
      if (!loops.length && (bl === '}' || bl === '};')) break;
      if ([...ids].every((id) => loops.some((x) => x.var === id))) break;
    }
    const required = [...ids];
    if (!required.every((id) => loops.some((x) => x.var === id))) {
      skipped++; skippedLog.push(`${f}:L${li + 1} índice sem loop completo (${required.join(',')}): ${line.trim().slice(0, 90)}`); continue;
    }

    const enumerate = (idx, env) => {
      if (idx >= loops.length) {
        const off = evalExpr(offExprRaw || '0', env);
        const iEff = iArgRaw === undefined ? -1 : evalExpr(iArgRaw, env);
        if (off == null || iEff == null) return false;
        addEntry(fam, off, dir, fileName, iEff, li + 1, f);
        return true;
      }
      const loop = loops[idx];
      for (let v = loop.from; v <= loop.to; v++) {
        if (!enumerate(idx + 1, { ...env, [loop.var]: v })) return false;
      }
      return true;
    };
    if (!enumerate(0, {})) { skipped++; skippedLog.push(`${f}:L${li + 1} expr de loop falhou`); }

  }
}

// Guarda fail-closed: sem massa de entradas real (tabela PC tem ~320), não
// sobrescreve o arquivo comprometendo o contrato R12.5.
if (entries.size < 100) {
  console.error(`[gen] FAIL-CLOSED: apenas ${entries.size} entradas parseadas de ${PC_SRC} — provável source errada/incompleta. Abortando SEM sobrescrever data/ItemModelMap.js.`);
  process.exit(1);
}

const out = {};
for (const [k, v] of [...entries.entries()].sort()) out[k] = v.path;

const header = `// data/ItemModelMap.js — GERADO por tools/gen-item-model-map.mjs (autoridade PC Main 5.2 limpa).\n// Não editar à mão. Chave '<FAMILIA>:<offset>' → path relativo a Data/.\n// FAMILIA = SWORD|AXE|MACE|SPEAR|BOW|STAFF|SHIELD|WING|HELPER|POTION|ETC (offset = ExtType do CharSet).\nexport const ITEM_MODEL_MAP = `;
fs.writeFileSync(path.join(ROOT, 'data', 'ItemModelMap.js'), header + JSON.stringify(out, null, 1) + ';\n\nexport default ITEM_MODEL_MAP;\n');

console.log(`[gen] entradas=${Object.keys(out).length} parsed-lines-ok colisões=${collisions} skipped=${skipped}`);
const famCount = {};
for (const k of Object.keys(out)) famCount[k.split(':')[0]] = (famCount[k.split(':')[0]] || 0) + 1;
console.log('[gen] por família:', JSON.stringify(famCount));
if (skippedLog.length) { console.log('[gen] skipped:'); skippedLog.slice(0, 20).forEach((s) => console.log('   ' + s)); }
console.log('[gen] -> data/ItemModelMap.js');
