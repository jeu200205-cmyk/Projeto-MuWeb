/**
 * generateRealData.mjs
 * Extrai dados REAIS do cliente MuPromax 1.0.1 OFICIAL (MU Online Season 6 custom)
 * e materializa módulos ES em web-port/data/generated/.
 *
 * Fontes (DATA_ROOT):
 *  - Itens   : Data/Local/Por/item_por.bmd     — XOR3 (chave FC CF AB), 8192 struct*84B + footer 4B
 *  - Monstros: Data/Local/Por/Npcname_por.txt  — texto plano "idx\t1\t\"nome\""
 *  - Mapas   : Data/Local/Por/movereq_por.bmd  — count u32 plano (37) + 37 struct*84B XOR3
 *
 * Uso: node tools/generateRealData.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, 'data', 'generated');

const require = createRequire(import.meta.url);
const authority = require('./verify-data-authority-r90.cjs');
const { RECORD_COUNT, recordIdentity } = require('./official-item-index-r90.cjs');
// Never accept a different root, including direct generator invocations.
authority.canonicalRoot();

const XOR3_KEY = [0xfc, 0xcf, 0xab]; // chave clássica MU p/ BMD de Local/

function readXor3(file, startOffset = 0) {
  const raw = fs.readFileSync(file);
  const out = Buffer.alloc(raw.length - startOffset);
  for (let i = startOffset; i < raw.length; i++) out[i - startOffset] = raw[i] ^ XOR3_KEY[(i - startOffset) % 3];
  return { buf: out, rawLen: raw.length };
}

function cstr(buf, off, max) {
  let end = off;
  while (end < off + max && end < buf.length && buf[end] !== 0) end++;
  return buf.subarray(off, end).toString('latin1');
}

// ---------------------------------------------------------------- ITENS
function parseItems() {
  const file = authority.validateOfficialSource('Local/Por/item_por.bmd');
  const { buf, rawLen } = readXor3(file);
  const REC = 84;
  // validação de magic/estrutura: (rawLen - 4) % 84 === 0 e nome[32] ASCII no primeiro registro
  if ((rawLen - 4) % REC !== 0) throw new Error('item_por.bmd: layout inesperado len=' + rawLen);
  const count = (rawLen - 4) / REC;
  // Main 5.2: 16 categories x 512 slots. A truncated or oversized
  // official table must fail instead of producing plausible wrong indices.
  if (count !== RECORD_COUNT) throw new Error('item_por.bmd oficial incompleto: '+count+' registros; esperado '+RECORD_COUNT);
  const first = cstr(buf, 0, 32);
  if (first !== 'Kris') throw new Error('item_por.bmd: primeiro item != Kris (' + first + ')');

  const SECTIONS = [
    'sword', 'axe', 'mace', 'spear', 'bow', 'crossbow', 'staff',
    'shield', 'helm', 'armor', 'pants', 'gloves', 'boots',
    'wings_accessory', 'misc', 'jewel_scroll',
  ];
  const items = [];
  for (let i = 0; i < count; i++) {
    const off = i * REC;
    const name = cstr(buf, off, 32).trim();
    if (!name) continue; // slot vazio
    const nameOk = /^[\x20-\x7e\u00c0-\u00ff .,'+éÉáÁãÃçÇõÕíÍóÓúÚâÂêÊôÔüÜ()\-]+$/.test(name);
    if (!nameOk) continue; // lixo → slot inválido
    const identity = recordIdentity(i);
    items.push({
      ...identity,             // linear index = category * 512 + slot
      kind: SECTIONS[identity.category],
      name,
      // NB: campos de stats dentro do struct84 não foram confirmados com segurança
      // (este cliente usa layout custom) — omitidos para não inventar dados.
    });
  }
  return items;
}

// ---------------------------------------------------------------- MONSTROS/NPCs
function parseMonsters() {
  const file = authority.validateOfficialSource('Local/Por/Npcname_por.txt');
  const text = fs.readFileSync(file, 'latin1');
  const re = /^(\d{1,3})\s+\d+\s+"(.+)"\s*$/gm;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ monsterClass: parseInt(m[1], 10), name: m[2].trim() });
  }
  return out;
}

// ---------------------------------------------------------------- MAPAS
function parseMaps() {
  const file = authority.validateOfficialSource('Local/Por/movereq_por.bmd');
  const raw = fs.readFileSync(file);
  const count = raw.readUInt32LE(0); // contador em plano (não-XOR)
  const { buf } = readXor3(file, 4); // corpo XOR3
  const REC = 84;
  if (buf.length !== count * REC) throw new Error(`movereq: body ${buf.length} != ${count}*${REC}`);
  const maps = [];
  for (let i = 0; i < count; i++) {
    const off = i * REC;
    maps.push({
      mapNumber: buf.readUInt32LE(off + 0),   // validado: nome bate com mapa (2-Lorencia, 8-Dungeon, 14-LostTower...)
      name: cstr(buf, off + 4, 32).trim(),
      nameAlt: cstr(buf, off + 36, 32).trim(),
      minZen: buf.readUInt32LE(off + 72),
      moveZen: buf.readUInt32LE(off + 76),
    });
  }
  return maps;
}

// ---------------------------------------------------------------- escrita
function writeModule(file, constName, data, header) {
  const body = `${header}\nexport const ${constName} = ${JSON.stringify(data, null, 1)}\n;\n\nexport default ${constName};\n`;
  fs.writeFileSync(path.join(OUT_DIR, file), body, 'utf8');
  return body.length;
}

const HEADER = (src) => `// GERADO AUTOMATICAMENTE por tools/generateRealData.mjs — NÃO EDITAR
// Fonte REAL do cliente MuPromax 1.0.1 OFICIAL: ${src}`;

fs.mkdirSync(OUT_DIR, { recursive: true });

// Parse and validate ALL official sources before writing any generated table.
// The orchestrator snapshots/restores outputs if a later filesystem write fails.
const items = parseItems();
const monsters = parseMonsters();
const maps = parseMaps();
if (!items.length || !monsters.length || !maps.length) {
  throw new Error('Data oficial incompleto: items/monsters/maps vazios; nenhuma tabela escrita.');
}
writeModule('RealItems.js', 'REAL_ITEMS', items, HEADER('Data/Local/Por/item_por.bmd (XOR3 FC CF AB)'));
writeModule('RealMonsters.js', 'REAL_MONSTERS', monsters, HEADER('Data/Local/Por/Npcname_por.txt (texto plano)'));
writeModule('RealMaps.js', 'REAL_MAPS', maps, HEADER('Data/Local/Por/movereq_por.bmd (count plano + XOR3)'));
console.log(JSON.stringify({items:items.length,monsters:monsters.length,maps:maps.length,errors:[]},null,1));
