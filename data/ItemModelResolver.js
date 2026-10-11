/**
 * ItemModelResolver.js — R12.5 (P3): resolve CharSet decodificado → paths de
 * modelo REAIS do cliente, usando a tabela gerada da autoridade PC
 * (tools/gen-item-model-map.mjs lê gLoadData.AccessModel da source Main 5.2).
 *
 * Autoridade PC:
 * - _define.h:379-394: categoria = floor(extType/512), offset = extType%512
 *   (ITEM_SWORD=0, ITEM_AXE=1*512, ITEM_MACE=2*512, ITEM_SPEAR=3*512,
 *    ITEM_BOW=4*512, ITEM_STAFF=5*512, ITEM_SHIELD=6*512, ITEM_HELM=7*512,
 *    ..., ITEM_WING=12*512, ITEM_HELPER=13*512).
 * - ZzzCharacter.cpp::ChangeCharacterExt: Weapon[k].Type = MODEL_SWORD+ExtType
 *   (a aritmética PC atravessa as famílias por si — MODEL_SWORD=MODEL_ITEM+0).
 * - Wing/Helper já chegam aqui como offsets family-relative (codec R12.4).
 *
 * FAIL-CLOSED: asset sem registro na tabela PC ou fora do manifest = null +
 * `missing` explicando o motivo. NUNCA inventar modelo.
 */

import { ITEM_MODEL_MAP } from './ItemModelMap.js';
import { customItemModelForType } from './CustomItemModelMap.js';
import { characterHelperRule } from './CharacterHelperLua.js';
import { darkSpiritRule } from './DarkSpiritLua.js';
import { resolvePcPlayerBodyModel } from './PcPlayerBodyModelMap.js';
import { NO_EQUIPMENT_12BIT } from './CharacterEquipmentCodec.js';
import { serverClassToClientClass, CLASS } from './CharacterClassMap.js';

// PC ZzzCharacter.cpp L12511-12525: DL com scepter na esquerda → o item vira o
// Dark Spirit (CreatePetDarkSpirit + Weapon[1].Type=MODEL_HELPER+5, que é
// HELPER+5 = SpiritBill). ExtType esperado = ITEM_STAFF+5 = 5*512+5 = 2565.
const DARK_SPIRIT_SCEPTER_EXTYPE = 5 * 512 + 5;

const ITEM_CATEGORY = ['SWORD', 'AXE', 'MACE', 'SPEAR', 'BOW', 'STAFF', 'SHIELD',
  'HELM', 'ARMOR', 'PANTS', 'GLOVES', 'BOOTS', 'WING', 'HELPER', 'POTION', 'ETC'];

/** Resolve um extType 12-bit de arma/escudo → { path|null, key, missing|null } */
export function resolveWeaponModel(extType) {
  if (extType == null || extType === NO_EQUIPMENT_12BIT) return { path: null, key: null, missing: null };
  const cat = Math.floor(extType / 512);
  const off = extType % 512;
  const fam = ITEM_CATEGORY[cat];
  if (!fam) return { path: null, key: null, missing: `categoria-desconhecida:${cat}` };
  const key = `${fam}:${off}`;
  // PC OpenItems appends LoadItens.lua after the compile-time AccessModel table.
  // The retained current-client Lua therefore has precedence when it owns this
  // exact item type; stock ItemModelMap remains the fallback.
  const custom = customItemModelForType(extType);
  const path = custom?.path || ITEM_MODEL_MAP[key] || null;
  return {
    path, key, custom: custom || null,
    color: custom?.color || null, effectType: custom?.effectType ?? 0,
    missing: path ? null : `sem-registro-PC/Lua:${key}`,
  };
}

/**
 * Fenrir 4 cores — autoridade PC (t-mugvwist-k):
 *   ZzzOpenData.cpp L4125-4135: fenril_{black,red,blue,gold}.bmd em Data/Skill/
 *     (GOLD compartilha OpenTexture do BLUE — L4135).
 *   ZzzCharacter.cpp L12677-12701: Option1 1→BLACK, 2→BLUE, 4→GOLD, else(0)→RED.
 *   _enum.h L633-636: MODEL_FENRIR_BLACK/RED/BLUE/GOLD.
 * NOTA DE ARQUITETURA (decisão de review com bd05, pub-30e339e1): o fenrir NÃO
 * é accessory-attach — no PC ele nasce via CreateBug (mount/pet lane). O path
 * por cor é resolvido em PlayerComposer.buildEquipmentAttach (out.fenrir.petModelPath)
 * para o PetSystem consumir; o resolver de accessory NÃO deve devolver path
 * p/ fenrir (senão o helper viraria renderer filho — semântica errada).
 */
export const FENRIR_MODEL_BY_OPTION = {
  1: 'Skill/fenril_black.bmd',
  2: 'Skill/fenril_blue.bmd',
  4: 'Skill/fenril_gold.bmd',
  0: 'Skill/fenril_red.bmd',
};
export const FENRIR_KIND_BY_OPTION = {
  1: 'fenrir-black', 2: 'fenrir-blue', 4: 'fenrir-gold', 0: 'fenrir-red',
};
// CONTRATO: resolver.devolve kind='fenrir' (genérico — consumido pelo
// PlayerComposer L206 `resolved.helper.kind === 'fenrir'` para o junction
// out.fenrir/petModelPath) + colorKind discriminando a cor. NÃO mudar kind
// para 'fenrir-red' etc.: quebraria o junction do PlayerComposer e o assert
// L126 do test-r12_5-item-model-resolve (contrato travado por testes).

/** Resolve wing helper offsets family-relative ({family:'wing'|'helper', offset}) */
export function resolveAccessoryModel(entry) {
  if (!entry) return { path: null, key: null, missing: null };
  // Fenrir: marker ONLY — o modelo por cor é consumido pela lane PetSystem
  // (PlayerComposer.out.fenrir.petModelPath). Sem path aqui = helper attach
  // não acontece (correto: PC usa CreateBug, não RenderLinkObject).
  if (entry.family === 'helper' && entry.kind === 'fenrir') {
    const opt = entry.option === 1 || entry.option === 2 || entry.option === 4 ? entry.option : 0;
    return {
      path: null,
      key: `FENRIR:${opt}`,
      // A marker owned by PetSystem is a resolved visual owner, not a missing
      // accessory. Reporting it in missing[] made the staged equipment
      // transaction reject the complete graph before GameApp could summon the
      // real Fenrir BMD.
      missing: null,
      kind: 'fenrir',                       // contrato original (PlayerComposer L206)
      colorKind: FENRIR_KIND_BY_OPTION[opt], // cor discriminada (fenrir-red/black/blue/gold)
      option: opt,
    };
  }
  const fam = entry.family === 'helper' ? 'HELPER' : 'WING';
  const key = `${fam}:${entry.offset}`;
  const itemType = (entry.family === 'helper' ? 13 : 12) * 512 + Number(entry.offset || 0);
  const custom = customItemModelForType(itemType);
  const helper = entry.family === 'helper' ? characterHelperRule(itemType) : null;
  const darkSpirit = entry.family === 'helper' ? darkSpiritRule(itemType) : null;
  const path = custom?.path || darkSpirit?.modelPath || helper?.modelPath || ITEM_MODEL_MAP[key] || null;
  return {
    path, key, custom: custom || null, helper: helper || null, darkSpirit: darkSpirit || null, color: custom?.color || null,
    effectType: custom?.effectType ?? 0,
    missing: path ? null : `sem-registro-PC/Lua:${key}`,
    kind: entry.kind || null, option: entry.option, itemType,
  };
}

/**
 * @param {object} decoded saída de decodeCharacterEquipment(charset)
 * @returns {{weaponRight, weaponLeft, wing, helper, missing: string[]}}
 */
export function resolveCharacterModels(decoded) {
  const weaponRight = decoded.weaponRight?.empty ? { path: null, key: null, missing: null } : resolveWeaponModel(decoded.weaponRight?.extType);

  // PC: base class sai do classByte (CharSet[0] server-encode → client class,
  // CharacterManager.cpp:1624) — a regra do Dark Spirit exige classe base.
  const baseClass = serverClassToClientClass(decoded.classByte) & 7;
  let helperSrc = decoded.helper;

  let weaponLeftSrc = decoded.weaponLeft;
  if (
    weaponLeftSrc && !weaponLeftSrc.empty &&
    weaponLeftSrc.extType === DARK_SPIRIT_SCEPTER_EXTYPE &&
    baseClass === CLASS.DARK_LORD
  ) {
    // PC L12511-12525: NÃO desenha o cetro na mão esquerda; o item é SUBSTITUÍDO
    // pelo pet Dark Spirit (CreatePetDarkSpirit). Lane visual real = PetSystem
    // (cfbeefaf), então aqui só marcamos o fato — mesh não vira item no bone.
    weaponLeftSrc = { extType: weaponLeftSrc.extType, empty: true, swallowedBy: 'dark-spirit' };
    helperSrc = { family: 'helper', offset: 5, kind: 'dark-spirit' };
  }

  const weaponLeft = weaponLeftSrc?.empty ? { path: null, key: null, missing: null } : resolveWeaponModel(weaponLeftSrc?.extType);
  const body = {};
  const bodyGroup = { helm: 7, armor: 8, pants: 9, gloves: 10, boots: 11 };
  for (const key of ['helm','armor','pants','gloves','boots']) {
    const src = decoded.body?.[key];
    if (!src || src.baseSkin) {
      body[key] = { path: null, key: null, missing: null, baseSkin: true, itemType: null };
      continue;
    }
    const itemType = bodyGroup[key] * 512 + src.extType;
    const custom = customItemModelForType(itemType);
    const stock = resolvePcPlayerBodyModel(bodyGroup[key] === 7 ? 'HELM'
      : bodyGroup[key] === 8 ? 'ARMOR'
      : bodyGroup[key] === 9 ? 'PANTS'
      : bodyGroup[key] === 10 ? 'GLOVES' : 'BOOTS', src.extType);
    // OpenPlayers is a separate PC owner from OpenItems. Current-client Lua
    // still wins when it explicitly owns this exact type, then the exact
    // stock Player/ BMD owner is used. Do not route body armour through the
    // generic OpenItems table first (that is what made stock sets invisible).
    const path = custom?.path || stock.path || null;
    body[key] = {
      path,
      key: stock.key,
      custom: custom || null,
      color: custom?.color || null,
      effectType: custom?.effectType ?? 0,
      missing: path ? null : stock.missing,
      baseSkin: false,
      itemType,
    };
  }
  const wing = resolveAccessoryModel(decoded.wing);
  const helper = resolveAccessoryModel(helperSrc);
  const missing = [weaponRight, weaponLeft, wing, helper].map((r) => r?.missing).filter(Boolean);
  // Keep the historical missing[] contract for weapon/accessory gates. Body
  // model gaps are a distinct portability surface because this client has
  // custom body sets loaded outside the stock AccessModel table.
  const bodyMissing = Object.values(body).map((r) => r?.missing).filter(Boolean);
  return { weaponRight, weaponLeft, body, wing, helper, missing, bodyMissing };
}

export default resolveCharacterModels;
