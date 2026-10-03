// data/CharacterClassMap.js — Mapeamento de classes REAL do cliente PC 5.2.
//
// Porte EXATO de:
//   PC_ENGINE/CharacterManager.cpp:1624  ChangeServerClassTypeToClientClassType
//   PC_ENGINE/CharacterManager.cpp:1633+  GetCharacterClass (bits: 0-2 base,
//     bit3 = 2ª classe, bit4 = 3ª classe)
//   PC_ENGINE/_enum.h:1416-1441           enum CLASS_TYPE (IDs REAIS abaixo)
//   mu-server GameServer ObjectManager.cpp:1672  CharSet[0] = (ChangeUp*16)
//     - (CharSet/32) + Class*32  ← COMO O SERVIDOR MONTA o byte que chega no
//     CharSet[0] da char list (F3:00) — verificação cruzada client+server.
//
// Autoverificação: os casos de teste validam a matemática NAS DUAS pontas
// (server encode → client decode → enum correto).

// enum CLASS_TYPE REAL (PC_ENGINE/_enum.h:1416-1441)
export const CLASS = {
  WIZARD: 0, KNIGHT: 1, ELF: 2, DARK: 3, DARK_LORD: 4, SUMMONER: 5,
  RAGEFIGHTER: 6,
  SOULMASTER: 7, BLADEKNIGHT: 8, MUSEELF: 9, BLOODYSUMMONER: 10,
  GRANDMASTER: 11, BLADEMASTER: 12, HIGHELF: 13, DUELMASTER: 14,
  LORDEMPEROR: 15, DIMENSIONMASTER: 16, TEMPLENIGHT: 17,
};

// Nomes por enum (GetCharacterClassText usa GlobalText[20-27,1668+]; nomes
// canônicos oficiais das classes MU — catálogo core não está no Text_por.bmd
// custom do cliente, dump completo verificado)
const NAMES = {
  [CLASS.WIZARD]: 'Dark Wizard',
  [CLASS.KNIGHT]: 'Dark Knight',
  [CLASS.ELF]: 'Fairy Elf',
  [CLASS.DARK]: 'Magic Gladiator',
  [CLASS.DARK_LORD]: 'Dark Lord',
  [CLASS.SUMMONER]: 'Summoner',
  [CLASS.RAGEFIGHTER]: 'Rage Fighter',
  [CLASS.SOULMASTER]: 'Soul Master',
  [CLASS.BLADEKNIGHT]: 'Blade Knight',
  [CLASS.MUSEELF]: 'Muse Elf',
  [CLASS.BLOODYSUMMONER]: 'Bloody Summoner',
  [CLASS.GRANDMASTER]: 'Grand Master',
  [CLASS.BLADEMASTER]: 'Blade Master',
  [CLASS.HIGHELF]: 'High Elf',
  [CLASS.DUELMASTER]: 'Duel Master',
  [CLASS.LORDEMPEROR]: 'Lord Emperor',
  [CLASS.DIMENSIONMASTER]: 'Dimension Master',
  [CLASS.TEMPLENIGHT]: 'Temple Knight',
};

/** ENCODE do servidor (ObjectManager.cpp:1672) — CharSet[0] a partir de
 *  Class (enum GameServer: DW=0,DK=1,ELF=2,MG=3,DL=4,SU=5,RF=6) + ChangeUp. */
export function serverEncodeCharSet0(serverClass, changeUp) {
  let v = (changeUp * 16) & 0xFF;
  v -= Math.floor(v / 32);
  v = (v + serverClass * 32) & 0xFF;
  return v;
}

/** Porte bit-a-bit de ChangeServerClassTypeToClientClassType (CharacterManager.cpp:1624). */
export function serverClassToClientClass(serverClassType) {
  const s = serverClassType & 0xFF;
  return ((((s >> 4) & 1) << 3) | (s >> 5) | (((s >> 3) & 1) << 4)) & 0xFF;
}

/** Porte de GetCharacterClass (CharacterManager.cpp:1633+). */
export function getCharacterClass(byClass) {
  const first = byClass & 0x7;
  const second = (byClass >> 3) & 1;
  const third = (byClass >> 4) & 1;
  if (first === 0) return third ? CLASS.GRANDMASTER : second ? CLASS.SOULMASTER : CLASS.WIZARD;
  if (first === 1) return third ? CLASS.BLADEMASTER : second ? CLASS.BLADEKNIGHT : CLASS.KNIGHT;
  if (first === 2) return third ? CLASS.HIGHELF : second ? CLASS.MUSEELF : CLASS.ELF;
  if (first === 3) return third ? CLASS.DUELMASTER : CLASS.DARK;
  if (first === 4) return third ? CLASS.LORDEMPEROR : CLASS.DARK_LORD;
  if (first === 5) return third ? CLASS.DIMENSIONMASTER : second ? CLASS.BLOODYSUMMONER : CLASS.SUMMONER;
  if (first === 6) return third ? CLASS.TEMPLENIGHT : CLASS.RAGEFIGHTER;
  return byClass;
}

/** Nome da classe (GetCharacterClassText). */
export function characterClassName(byClass) {
  return NAMES[byClass] || '';
}

/** Base class PC (bits 0-2 do byClass do cliente — GetCharacterClass 'first')
 *  → enum local do port (Character.js Classes: DK=0, DW=1, ELF=2, MG=3,
 *  DL=4, SUMMONER=5, RF=6). Resolve o bug físico "aprendeu 0 skills da
 *  classe 25": normalizeChar devolve o enum completo PC (0-17 com
 *  evoluções) e Character/SkillData/CLASS_BASE esperam a base local. */
export function clientClassToLocalBase(byClass) {
  switch (byClass & 0x7) {
    case 0: return 1; // WIZARD  → DW
    case 1: return 0; // KNIGHT  → DK
    case 2: return 2; // ELF     → ELF
    case 3: return 3; // DARK/MG → MG
    case 4: return 4; // DARK_LORD → DL
    case 5: return 5; // SUMMONER  → SUMMONER
    case 6: return 6; // RAGEFIGHTER → RF
    default: return 0; // 7: sem classe — DK como o fallback CLASS_BASE do Character
  }
}

/** Atalho: CharSet[0] → nome (fluxo ReceiveCharacterList WSclient.cpp:11536). */
export function serverClassToName(serverClassType) {
  return characterClassName(getCharacterClass(serverClassToClientClass(serverClassType)));
}

// ===== AUTOVERIFICAÇÃO (node data/CharacterClassMap.js) =====
// Valida ENCODE do servidor → DECODE do cliente → ENUM REAL (_enum.h):
//   DK 1ª: encode(1,0)=0x20 → decode=1=KNIGHT ✓ (fórmula conferida à mão)
if (typeof process !== 'undefined' && process.argv && process.argv[1]
  && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop().replace(/\\/g, '/'))) {
  const cases = [
    // [serverClass, changeUp, expectName]
    [0, 0, 'Dark Wizard'], [0, 1, 'Soul Master'], [0, 2, 'Grand Master'],
    [1, 0, 'Dark Knight'], [1, 1, 'Blade Knight'], [1, 2, 'Blade Master'],
    [2, 0, 'Fairy Elf'], [2, 1, 'Muse Elf'], [2, 2, 'High Elf'],
    [3, 0, 'Magic Gladiator'], [3, 2, 'Duel Master'],
    [4, 0, 'Dark Lord'], [4, 2, 'Lord Emperor'],
    [5, 0, 'Summoner'], [5, 1, 'Bloody Summoner'], [5, 2, 'Dimension Master'],
    [6, 0, 'Rage Fighter'], [6, 2, 'Temple Knight'],
  ];
  let pass = true;
  for (const [srv, up, expect] of cases) {
    const cs0 = serverEncodeCharSet0(srv, up);
    const got = serverClassToName(cs0);
    const ok = got === expect;
    if (!ok) pass = false;
    console.log(`Class=${srv} ChangeUp=${up} → CharSet[0]=0x${cs0.toString(16).padStart(2, '0')} → ${got} ${ok ? 'OK' : 'FAIL (esperado ' + expect + ')'}`);
  }
  console.log(pass ? 'ALL PASS' : 'FAIL');
  process.exit(pass ? 0 : 1);
}
