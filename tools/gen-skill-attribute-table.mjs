// tools/gen-skill-attribute-table.mjs — Gera skills/SkillAttributeData.js a partir
// do skill_por.bmd REAL do cliente (Data/Local/Por/skill_por.bmd), decodificado com
// BuxCode por registro (OpenSkillScript ZzzInfomation.cpp:256; SKILL_ATTRIBUTE
// _struct.h:301-327, stride 80, 600 registros + DWORD checksum).
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const authority = require('./verify-data-authority-r90.cjs');
const SRC = authority.validateOfficialSource('Local/Por/skill_por.bmd');
const OUT = new URL('../skills/SkillAttributeData.js', import.meta.url);
const BUX = [0xFC, 0xCF, 0xAB];
const RECORD = 80, COUNT = 600;

const b = readFileSync(SRC);
if (b.length !== RECORD * COUNT + 4) throw new Error(`skill_por.bmd layout inesperado: ${b.length}, esperado ${RECORD*COUNT+4}`);

const rows = [];
for (let r = 0; r < COUNT; r++) {
  const rec = Buffer.alloc(RECORD);
  for (let i = 0; i < RECORD; i++) rec[i] = b[r * RECORD + i] ^ BUX[i % 3];
  let name = '';
  for (let i = 0; i < 32; i++) { const c = rec[i]; if (c === 0) break; name += String.fromCharCode(c); }
  if (!name) continue;
  rows.push({
    type: r,
    name,
    level: rec[32],
    damage: rec.readUInt16LE(34),
    mana: rec.readUInt16LE(36),
    distance: rec[40],
    delay: rec.readInt32LE(44),
    energy: rec.readInt32LE(48),
    masteryType: rec[54],
    skillUseType: rec[55],
    magicIcon: rec.readUInt16LE(68),
    typeSkill: rec[70],
  });
}
console.log(`registros com nome: ${rows.length}`);

const js = `// skills/SkillAttributeData.js — Tabela REAL de skills do cliente PC 5.2
// (MuPromax). GERADO de Data/Local/Por/skill_por.bmd (${b.length} bytes =
// 600 registros × 80B + DWORD checksum) via tools/gen-skill-attribute-table.mjs.
//
// AUTORIDADE PC: OpenSkillScript (ZzzInfomation.cpp:256-299) — BuxConvert XOR
// FC/CF/AB com key reiniciada POR REGISTRO; SKILL_ATTRIBUTE (_struct.h:301-327):
//   Name[32]@0  Level(BYTE)@32  Damage(WORD)@34  Mana(WORD)@36
//   AbilityGuage(WORD)@38  Distance(BYTE)@40  Delay(int)@44  Energy(int)@48
//   Charisma(WORD)@52  MasteryType(B)@54  SkillUseType(B)@55  SkillBrand(B)@56
//   KillCount(B)@57  RequireDutyClass[3]@58  RequireClass[7]@61
//   Magic_Icon(WORD)@68  TypeSkill(B)@70  Strength(int)@72  Dexterity(int)@76
//
// O índice do registro = wire-type AT_SKILL_* (SkillManager.h) — é o MESMO
// Type que o servidor envia no F3:11 magicList (WSclient.cpp:1179:
// CharacterAttribute->Skill[Index] = Type). ReceiveMagicList também usa
// SkillAttribute[SkillType] para ícone/usabilidade (WSclient.cpp:1237).
// Nomes PT-BR vindos do arquivo REAL — zero invenção.

export const SKILL_ATTRIBUTE_STRIDE = 80;
export const SKILL_ATTRIBUTE_COUNT = 600;
const BUX = [0xFC, 0xCF, 0xAB];

/** Porte de BuxConvert + parse de um registro (OpenSkillScript). */
export function decodeSkillAttributeRecord(src, offset = 0) {
  const rec = new Uint8Array(SKILL_ATTRIBUTE_STRIDE);
  for (let i = 0; i < SKILL_ATTRIBUTE_STRIDE; i++) rec[i] = src[offset + i] ^ BUX[i % 3];
  let name = '';
  for (let i = 0; i < 32; i++) { const c = rec[i]; if (c === 0) break; name += String.fromCharCode(c); }
  if (!name) return null;
  const dv = rec;
  return {
    type: 0, // preenchido pelo caller (índice do registro)
    name,
    level: dv[32],
    damage: dv[34] | (dv[35] << 8),
    mana: dv[36] | (dv[37] << 8),
    distance: dv[40],
    delay: dv[44] | (dv[45] << 8) | (dv[46] << 16) | (dv[47] << 24),
    energy: dv[48] | (dv[49] << 8) | (dv[50] << 16) | (dv[51] << 24),
    masteryType: dv[54],
    skillUseType: dv[55],
    magicIcon: dv[68] | (dv[69] << 8),
    typeSkill: dv[70],
  };
}

/** Porte de OpenSkillScript: decodifica o buffer inteiro do skill_*.bmd. */
export function decodeSkillAttributeScript(buffer) {
  const src = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (src.length !== SKILL_ATTRIBUTE_STRIDE * SKILL_ATTRIBUTE_COUNT + 4) {
    throw new Error(\`skill_por.bmd oficial incompleto: \${src.length} (esperado \${SKILL_ATTRIBUTE_STRIDE * SKILL_ATTRIBUTE_COUNT + 4})\`);
  }
  const out = new Array(SKILL_ATTRIBUTE_COUNT).fill(null);
  for (let r = 0; r < SKILL_ATTRIBUTE_COUNT; r++) {
    const rec = decodeSkillAttributeRecord(src, r * SKILL_ATTRIBUTE_STRIDE);
    if (rec) { rec.type = r; out[r] = rec; }
  }
  return out;
}

// Tabela gerada FISICAMENTE do skill_por.bmd oficial. Ela serve ao
// ServerMagicList após o boot validar o manifesto SHA-256; não é fallback
// para falhas de fetch do asset-server.
export const SKILL_ATTRIBUTE_TABLE = ${JSON.stringify(rows, null, 1)};

/** Loader fail-closed: uma única fonte oficial, sem alias ou tabela substituta. */
let _loaded = null, _loading = null;
export function loadSkillAttributes(fetchBinary) {
  if (_loaded) return Promise.resolve(_loaded);
  if (_loading) return _loading;
  _loading = (async () => {
    const source = 'Local/Por/skill_por.bmd';
    const buf = await fetchBinary(source);
    if (!buf) throw new Error('[DATA AUTHORITY] skill_por.bmd oficial indisponível');
    const table = decodeSkillAttributeScript(buf);
    const named = table.filter(Boolean).length;
    if (named < 10) throw new Error('[DATA AUTHORITY] skill_por.bmd oficial incompleto');
    _loaded = table;
    return table;
  })().catch((error) => { _loading = null; throw error; });
  return _loading;
}
`;
writeFileSync(OUT, js, 'utf8');
console.log(`gerado: ${OUT.pathname} (${rows.length} skills embutidas)`);
