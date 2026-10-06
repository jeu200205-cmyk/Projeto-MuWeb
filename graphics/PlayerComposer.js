/**
 * PlayerComposer.js — Composição do personagem do jogador a partir dos
 * modelos REAIS do cliente (Main 5.2), fiel à arquitetura PC:
 *
 *   ZzzOpenData.cpp:128-154 (OpenPlayers): Player.bmd (esqueleto, 0 meshes)
 *     + peças por classe: Helm/Armor/Pant/Glove/Boot Class{i+1}.bmd
 *     (tiers 2/3: {prefix}2{i+1} / {prefix}3{i+1} — só DW/DK/ELF/SUM têm 2ª)
 *   CharacterManager.cpp:273 (GetSkinModelIndex): base=classId&7, 2ª=bit3,
 *     3ª=bit4 → skin = first + tier*MAX_CLASS(7)
 *   LoadData.cpp:21 (AccessModel): sprintf("%s0%d.bmd", prefix, base+1)
 *   ZzzObject.cpp:10718-10724 (RenderPartObject): as peças recebem o
 *     BoneTransform do OBJETO (Player.bmd) — Vertex_t.Node das peças indexa o
 *     esqueleto do PLAYER; a lista de bones da peça é vestigial (nomes
 *     diferem, índices casam: 41/56).
 *   ZzzCharacter.cpp:280-289: idle por classe — ELF→STOP_FEMALE,
 *     SUMMONER→STOP_SUMMONER, RAGEFIGHTER→STOP_RAGEFIGHTER, senão STOP_MALE.
 *   _enum.h:1103: PLAYER_SET=0, PLAYER_STOP_MALE=1, PLAYER_STOP_FEMALE=2,
 *     PLAYER_STOP_SUMMONER=3; RAGEFIGHTER real é o index 289 (auditoria e188).
 */

import * as THREE from 'three';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { angleQuaternion } from './BmdParser.js';
import { MUAssets } from '../assets/MUAssetLoader.js';
import { extractPartMeshes, extractRigidAttachment, buildBindWorldTransforms } from './BmdAdapter.js';
import { decodeCharacterEquipment } from '../data/CharacterEquipmentCodec.js';
import { resolveCharacterModels } from '../data/ItemModelResolver.js';
import { customItemModelForType } from '../data/CustomItemModelMap.js';
import { itemAttributeFor } from '../data/ItemAttributeData.js';
import { applyPcStockItemPresentation } from './ItemMaterialPresentation.js';
import { applyPcCustomCapePresentation } from './PcCustomCapePresentation.js';
import { customBowType } from '../data/CustomBowLua.js';
import { characterItemEffectPlan, characterSetEffectPlan } from '../data/PcCharacterLuaEffects.js';
import { pcBitmapTexture } from '../data/PcBitmapLuaOwners.js';
import { characterHelperRule } from '../data/CharacterHelperLua.js';
import { customCapeModelPosition, customCapeRenderPlans } from '../data/PcCustomCapeLua.js';

/** PC ZzzCharacter.cpp (LinkBone) + prova Player.bmd real (bone names). */
export const PLAYER_WEAPON_LINK_BONE = { right: 33, left: 42 }; // "knife_gdf" / "hand_bofdgne01"

/**
 * R12.5 attach rules p/ acessórios RÍGIDOS-animados (wing/helper têm skeleton
 * e actions próprios, ex.: Wing42.bmd = 17 bones): o PC anexa o OBJETO ao
 * bone do herói (BoneTransform[LinkBone]) e deixa a animação própria rodar.
 * Autoridade (ZzzCharacter.cpp + revisão cruzada mesh e188c76a):
 *  - asas default: bone 47 ("Bone05", filho da Spine) — RenderCharacterBackItem;
 *  - capas (WING+40 / robe custom HELPER+30): bone 19 ("Bip01 Neck"),
 *    offset (-47,-7,0), rotação MU (0,90°,0);
 *  - Imp (HELPER+1): bone 34 ("Bip01 L Clavicle"), offset (20,0,0);
 *  - armas de costas (IsBackItem): bone 47 (bows: off (-10,8,40), rot (0,20°,180°)).
 */
/**
 * R12.5 attach rules p/ acessórios RÍGIDOS-animados (autoridade PC direta):
 *  - ZzzCharacter.cpp:15252-15283 (RenderCharacterBackItem, wings):
 *      w->LinkBone = 47 default ("Bone05", filho da Spine); offset FIXO
 *      (0,0,15) = RenderLinkObject(0.f,0.f,15.f,...) para wing E cape.
 *    WING+40/cape-custom → LinkBone 19 ("Bip01 Neck"), MESMO offset (0,0,15),
 *      flag=true (rotação interna do RenderLinkObject — sem Angle PC aqui).
 *  - Capa DL: ChangeCharacterExt L12540 roteia ext==5 pelo pipeline WING
 *      (c->Wing.Type=MODEL_HELPER+30) → mesmas regras de wing.
 *  - Imp HELPER+1: L15287-15311 — bone 34 ("Bip01 L Clavicle"), off (20,0,0),
 *      PlaySpeed=0.5 (L15291). RagFighter com armor 59-61 muda p/ (20,-5,35).
 *  - UNICON/PEGASUS/DARKHORSE/FENRIR/DARKSPIRIT NÃO renderizam como item:
 *    nascem via CreateBug (ZzzCharacter.cpp:12511-12704) — lane PetSystem.
 */
export function accessoryAttachRule(input) {
    const key = typeof input === 'string' ? input : input?.key;
    const custom = typeof input === 'object' ? input?.custom : null;
    // PC CustomWing + CustomCape: a custom cape asks CapeModelPosition(Type)
    // for full MU Euler + translation and uses the Lua-authored cape bone.
    // Do not reduce this to the stock WING+40 offset.
    if (custom?.customWing && custom?.isCape && custom?.cape) {
        const cape=custom.cape;
        return {
            bone: Number.isInteger(cape.bone) ? cape.bone : 19,
            offset: [...cape.matrix], anglesDeg: [...cape.angles],
            playSpeed: 0.25, customCape: true,
        };
    }
    if (!key) return { bone: 47, offset: [0, 0, 15], rotYDeg: 0, playSpeed: 0.25 };
    // PC ZzzCharacter.cpp::RenderLinkObject: WING+40 is a linked cape, not a
    // generic wing. LinkBone=19 and the local matrix is Angle(0,90,0) with
    // translation (-47,-7,0). The old Web (0,0,15) rule misplaced it.
    if (key === 'WING:40') return { bone: 19, offset: [-47, -7, 0], anglesDeg: [0, 90, 0], playSpeed: 0.25, stockCape: true };
    // RenderLinkObject switch(Type): MODEL_WING+39 owns 0.15 play speed.
    if (key === 'WING:39') return { bone: 47, offset: [0, 0, 15], rotYDeg: 0, playSpeed: 0.15 };
    if (key === 'HELPER:30') return { bone: 47, offset: [0, 0, 15], rotYDeg: 0, playSpeed: 0.25 };
    if (key === 'HELPER:1') return { bone: 34, offset: [20, 0, 0], rotYDeg: 0, playSpeed: 0.5 };
    return { bone: 47, offset: [0, 0, 15], rotYDeg: 0, playSpeed: 0.25 };
}


/** PC ZzzCharacter.cpp:12821-12863 custom-preview override. */
export function applyCustomPreviewWingOverride(decoded, customPreview) {
  const previewWingIndex = Number(customPreview?.wingIndex || 0);
  if (!decoded || !Number.isInteger(previewWingIndex) || previewWingIndex <= 0 || previewWingIndex >= 512) return decoded;
  const customType = 12 * 512 + previewWingIndex;
  if (!customItemModelForType(customType)?.customWing) return decoded;
  return { ...decoded, wing: { family:'wing', offset:previewWingIndex, customPreview:true } };
}

/** PC ZzzCharacter.cpp:12830-12853 / 12866-12889 F3:72 PetIndex override.
 * The current-client helper table is the authority: a server PetIndex only
 * replaces CharSet helper when CharacterHelper.lua owns HELPER+index. */
export function applyCustomPreviewHelperOverride(decoded, customPreview) {
  const petIndex = Number(customPreview?.petIndex || 0);
  if (!decoded || !Number.isInteger(petIndex) || petIndex <= 0 || petIndex >= 512) return decoded;
  const itemType = 13 * 512 + petIndex;
  const rule = characterHelperRule(itemType);
  if (!rule?.modelPath) return decoded;
  return { ...decoded, helper: { family:'helper', offset:petIndex, kind:'custom-preview', customPreview:true } };
}

export const MAX_CLASS = 7; // _define.h:399 (PBG_ADD_NEWCHAR_MONK)

// _enum.h:1416 CLASS_TYPE (classId bitwise: bits 0-2 base, bit3 2ª, bit4 3ª)
export const CLASS = {
  WIZARD: 0, KNIGHT: 1, ELF: 2, DARK: 3 /* MG */, DARK_LORD: 4, SUMMONER: 5, RAGEFIGHTER: 6,
};

/**
 * ZzzCharacter.cpp::SetCharacterScale exact player scale.
 * This source has PJH_NEW_SERVER_SELECT_MAP and PBG_ADD_NEWCHAR_MONK enabled.
 * CharacterScene ignores Skin for scale: all base classes are 1.2, RF 1.35.
 * MainScene has separate Skin==0 / transformed-skin branches.
 */
export function pcCharacterScale(classId, { characterScene = false, skin = 0 } = {}) {
  const base = Number(classId) & 0x7;
  if (characterScene) return base === CLASS.RAGEFIGHTER ? 1.35 : 1.2;
  if (base === CLASS.RAGEFIGHTER) return 1.03;
  if (base === CLASS.DARK) return 0.95;
  if (base === CLASS.DARK_LORD) return 0.92;
  if (base === CLASS.SUMMONER) return 0.90;
  if (base === CLASS.ELF) return Number(skin) === 0 ? 0.88 : 0.86;
  // Wizard / Knight
  return Number(skin) === 0 ? 0.90 : 0.93;
}

/** Ações do Player.bmd — índices EXATOS do enum _enum.h:1103-1419 (auditors cfbeefaf/e188).
 * PLAYER_SET=0. Cada identificador enum = 1 posição no array BMD Actions (ZzzCharacter.cpp:463).
 */
export const PLAYER_ACTIONS = {
  SET: 0,            // L1103
  STOP_MALE: 1,      // L1104
  STOP_FEMALE: 2,    // L1105
  STOP_SUMMONER: 3,  // L1106 (Summoner's Place)
  STOP_SWORD: 4,
  STOP_TWO_HAND_SWORD: 5,
  STOP_SPEAR: 6,
  STOP_SCYTHE: 7,
  STOP_BOW: 8,
  STOP_CROSSBOW: 9,
  STOP_WAND: 10,
  STOP_FLY: 11,
  STOP_FLY_CROSSBOW: 12,
  STOP_RIDE: 13,
  STOP_RIDE_WEAPON: 14,
  // PC enum L1107 = PLAYER_STOP_SWORD (index 4) — não é RAGEFIGHTER.
  // Valor real do RAGEFIGHTER: _enum.h:1410 → index 289 (contagem identificador-a-identificador).
  // Parcialmente verificado com CF8 (sequence 1103→1410 = 289 identificadores).
  STOP_RAGEFIGHTER: 289,
  WALK_MALE: 15,     // L1119 (era 16 — off-by-one confirmado pela auditoria)
  WALK_FEMALE: 16,   // L1120 (era 17)
  WALK_SWORD: 17,
  WALK_TWO_HAND_SWORD: 18,
  WALK_SPEAR: 19,
  WALK_SCYTHE: 20,
  WALK_BOW: 21,
  WALK_CROSSBOW: 22,
  WALK_WAND: 23,
  WALK_SWIM: 24,
  RUN: 25,
  RUN_SWORD: 26,
  RUN_TWO_SWORD: 27,
  RUN_TWO_HAND_SWORD: 28,
  RUN_SPEAR: 29,
  RUN_BOW: 30,
  RUN_CROSSBOW: 31,
  RUN_WAND: 32,
  RUN_SWIM: 33,
  FLY: 34,
  FLY_CROSSBOW: 35,
  RUN_RIDE: 36,
  RUN_RIDE_WEAPON: 37,
  ATTACK_FIST: 38,
  ATTACK_SWORD_RIGHT1: 39,
  ATTACK_SWORD_RIGHT2: 40,
  ATTACK_SWORD_LEFT1: 41,
  ATTACK_SWORD_LEFT2: 42,
  ATTACK_TWO_HAND_SWORD1: 43,
  ATTACK_TWO_HAND_SWORD2: 44,

  ATTACK_TWO_HAND_SWORD3: 45,

  // Main 5.2 clean _enum.h: ride/Fenrir/special two-hand actions.
  DARKLORD_STAND: 76,
  DARKLORD_WALK: 77,
  STOP_RIDE_HORSE: 78,
  RUN_RIDE_HORSE: 79,
  FENRIR_RUN: 110,
  FENRIR_RUN_TWO_SWORD: 111,
  FENRIR_RUN_ONE_RIGHT: 112,
  FENRIR_RUN_ONE_LEFT: 113,
  FENRIR_RUN_MAGOM: 114,
  FENRIR_RUN_TWO_SWORD_MAGOM: 115,
  FENRIR_RUN_ONE_RIGHT_MAGOM: 116,
  FENRIR_RUN_ONE_LEFT_MAGOM: 117,
  FENRIR_RUN_ELF: 118,
  FENRIR_RUN_TWO_SWORD_ELF: 119,
  FENRIR_RUN_ONE_RIGHT_ELF: 120,
  FENRIR_RUN_ONE_LEFT_ELF: 121,
  FENRIR_STAND: 122,
  FENRIR_STAND_TWO_SWORD: 123,
  FENRIR_STAND_ONE_RIGHT: 124,
  FENRIR_STAND_ONE_LEFT: 125,
  FENRIR_WALK: 126,
  FENRIR_WALK_TWO_SWORD: 127,
  FENRIR_WALK_ONE_RIGHT: 128,
  FENRIR_WALK_ONE_LEFT: 129,
  // Main 5.2 social/operate actions: enum sequence comments anchor GOODBYE1=160.
  SIT1: 204,
  SIT2: 205,
  SIT_FEMALE1: 206,
  SIT_FEMALE2: 207,
  HEALING1: 208,
  HEALING_FEMALE1: 209,
  POSE1: 210,
  POSE_FEMALE1: 211,

  STOP_TWO_HAND_SWORD_TWO: 142,
  WALK_TWO_HAND_SWORD_TWO: 143,
  RUN_TWO_HAND_SWORD_TWO: 144,

  // Combate/skills — índices EXATOS por contagem do enum _enum.h a partir
  // de PLAYER_SET=0. Estes valores são consumidos pelo ReceiveMagic 0x19
  // server-authoritative (WSclient.cpp:3824-4865), nunca pelo catálogo local.
  ATTACK_SKILL_SWORD1: 60, // PLAYER_ATTACK_SKILL_SWORD1
  ATTACK_SKILL_SWORD2: 61,
  ATTACK_SKILL_SWORD3: 62,
  ATTACK_SKILL_SWORD4: 63,
  ATTACK_SKILL_SWORD5: 64,
  ATTACK_SKILL_WHEEL: 65,  // Twisting Slash
  ATTACK_SKILL_FURY_STRIKE: 66,
  SKILL_VITALITY: 67,
  SKILL_RIDER: 68,
  SKILL_RIDER_FLY: 69,
  ATTACK_SKILL_SPEAR: 70,
  ATTACK_ONETOONE: 71,
  SKILL_HELL_BEGIN: 72,    // AttackWizard BLAST_HELL_BEGIN
  SKILL_HELL_START: 73,    // AttackWizard BLAST_HELL
  SKILL_HAND1: 146,        // SetPlayerMagic -> male caster
  SKILL_HAND2: 147,
  SKILL_ELF1: 150,         // SetPlayerMagic -> female caster
  SKILL_FLASH: 152,        // AttackWizard FLASH
  SKILL_INFERNO: 153,      // AttackWizard INFERNO
  SKILL_HELL: 154,         // AttackWizard HELL/HELL_FIRE + ReceiveMagicPosition
  RIDE_SKILL: 155,         // mounted caster (owner/fenrir variants remain P1)
  FENRIR_ATTACK_MAGIC: 97,
  FENRIR_ATTACK_SPEAR: 99, // _enum.h exact; UseSkillWarrior on HELPER+37
  ATTACK_DEATH_CANNON: 138,
  SKILL_BLOW_OF_DESTRUCTION: 176, // _enum.h PLAYER_SKILL_BLOW_OF_DESTRUCTION
  SKILL_LIGHTNING_SHOCK: 185, // _enum.h exact
  RUSH1: 234,              // AttackElf INFINITY_ARROW unmounted
  RECOVER_SKILL: 252,      // AttackElf RECOVER
  ATTACK_STRIKE: 81,       // PLAYER_ATTACK_STRIKE
  ATTACK_TELEPORT: 82,     // PLAYER_ATTACK_TELEPORT
  ATTACK_RIDE_STRIKE: 83,  // PLAYER_ATTACK_RIDE_STRIKE
  ATTACK_RIDE_TELEPORT: 84,// PLAYER_ATTACK_RIDE_TELEPORT
  ATTACK_RIDE_ATTACK_MAGIC: 87, // PLAYER_ATTACK_RIDE_ATTACK_MAGIC
  ATTACK_DARKHORSE: 88,    // PLAYER_ATTACK_DARKHORSE
  FENRIR_ATTACK_DARKLORD_STRIKE: 93,
  FENRIR_ATTACK_DARKLORD_TELEPORT: 95,
  FENRIR_ATTACK_DARKLORD_FLASH: 96,
  ATTACK_ONE_FLASH: 137,
  ATTACK_RUSH: 138,
  ATTACK_REMOVAL: 140,
  SKILL_SLEEP: 157,
  SKILL_SLEEP_UNI: 158,
  SKILL_SLEEP_DINO: 159,
  SKILL_SLEEP_FENRIR: 160,
  SKILL_LIGHTNING_ORB: 165,
  SKILL_LIGHTNING_ORB_UNI: 166,
  SKILL_LIGHTNING_ORB_DINO: 167,
  SKILL_LIGHTNING_ORB_FENRIR: 168,
  SKILL_DRAIN_LIFE: 169,
  SKILL_DRAIN_LIFE_UNI: 170,
  SKILL_DRAIN_LIFE_DINO: 171,
  SKILL_DRAIN_LIFE_FENRIR: 172,
  SKILL_SWELL_OF_MP: 178,
  SKILL_GIGANTICSTORM: 184,
  SKILL_FLAMESTRIKE: 185,
};

/** GetSkinModelIndex — porte EXATO de CharacterManager.cpp:273. */
export function getSkinModelIndex(classId) {
  const first = classId & 0x7;
  const second = (classId >> 3) & 0x01;
  const third = (classId >> 4) & 0x01;
  if (first === CLASS.WIZARD || first === CLASS.KNIGHT ||
      first === CLASS.ELF || first === CLASS.SUMMONER) {
    return first + (second + third) * MAX_CLASS;
  }
  return first + third * 2 * MAX_CLASS;
}

/**
 * BMD::Skin texture selector — ZzzCharacter.cpp
 * R0711B92ResolveSkinWithBaseClass. This is NOT GetSkinModelIndex above:
 * it indexes BITMAP_SKIN+n for BMD textures named ski* or level*.
 */
export function getPcTextureSkinIndex(classId) {
  const base = Number(classId) & 0x7;
  const second = (Number(classId) >> 3) & 0x01;
  const third = (Number(classId) >> 4) & 0x01;
  if (base === CLASS.RAGEFIGHTER) return base * 2 + third;
  return base * 2 + second;
}

/**
 * Nome do arquivo de uma peça — AccessModel (LoadData.cpp:21-29:
 * sprintf "%s0%d.bmd", o dígito do tier FAZ PARTE do FileName) +
 * OpenPlayers (ZzzOpenData.cpp:131): tier 1 → {prefix}Class2{NN},
 * tier 2 → {prefix}Class3{NN} (arquivos reais: HelmClass201..207/301..307).
 * @param {'Helm'|'Armor'|'Pant'|'Glove'|'Boot'} prefix
 */
export function partFileName(prefix, skinIndex) {
  const tier = Math.floor(skinIndex / MAX_CLASS); // 0,1,2
  const base = skinIndex % MAX_CLASS;
  const num = String(base + 1).padStart(2, '0');
  return `Player/${prefix}Class${tier > 0 ? tier + 1 : ''}${num}.bmd`;
}

/** Ação de idle por classe — ZzzCharacter.cpp:280-289 (sem arma na mão). */
export function idleActionFor(classId) {
  const base = classId & 0x7;
  if (base === CLASS.ELF) return PLAYER_ACTIONS.STOP_FEMALE;
  if (base === CLASS.SUMMONER) return PLAYER_ACTIONS.STOP_SUMMONER;
  if (base === CLASS.RAGEFIGHTER) return PLAYER_ACTIONS.STOP_RAGEFIGHTER;
  return PLAYER_ACTIONS.STOP_MALE;
}

/** Classe base é feminina? (CharacterManager.h:20 IsFemale) */
export function isFemaleClass(classId) {
  const base = classId & 0x7;
  return base === CLASS.ELF || base === CLASS.SUMMONER;
}

/**
 * Compõe o render-data do personagem completo: esqueleto + ações do
 * Player.bmd + meshes das 5 peças da classe (skinIndex = Vertex_t.Node direto
 * no esqueleto do Player — como RenderPartObject do PC).
 *
 * @param {number} classId byte de classe do servidor
 * @param {object} io { loadBMD, fetchBinary } — MUAssets.loadBMD para o
 *        esqueleto (render-data c/ bones+actions) e RemoteAssets.fetchBinary
 *        para os binários das peças (parse puro aqui).
 * @returns {Promise<{renderData, skinIndex, parts: string[]}>}
 */
/**
 * R12.5 (P3 CharSet): decodifica o CharSet[18] REAL e resolve os equipamentos
 * com a tabela gerada da autoridade PC (tools/gen-item-model-map.mjs).
 *
 * - Weapons/shield (BMD rígido, 1 bone): viram meshes skinned EXTRAS no
 *   renderData do personagem, com Node remapeado ao LinkBone PC
 *   (33=mão direita / 42=mão esquerda). Seguem o osso animado a cada frame
 *   (equivalente Three do BoneTransform[LinkBone] do PC).
 * - Wing/helper (BMD com skeleton+actions próprios, ex.: Item/Wing42.bmd tem
 *   17 bones/1 action): NÃO viram mesh do player — retornam renderData próprio
 *   para o consumidor montar um MUModelRenderer filho (cópia de posição/ângulo
 *   do personagem, exatamente como o objet Wing do PC).
 *
 * FAIL-CLOSED TOTAL: charset inválido/ausente, item fora da tabela PC ou
 * fora do manifest ⇒ ausente + `missing[]` documentado; NUNCA inventar mesh.
 *
 * @param {number[]|null} charset CharSet[18] do F3:00 (router R12.4)
 * @param {object} io { fetchBinary }  (RemoteAssets.fetchBinary)
 * @param {Array} playerBones bones do Player.bmd (authority bind-space)
 * @param {number} playerBoneCount 60
 * @returns {Promise<{meshes:Array, textures:Array, wing:object|null, helper:object|null, missing:string[]}>}
 */
const _equipmentAttachCache = new Map();
const _equipmentAttachInflight = new Map();
// FIX85: parsed item/equipment BMDs are immutable inside one Data authority.
// F3:13 bursts may alter CharSet option bytes and therefore miss the whole-attach
// cache even when the same HDK_Sword/Wing/body model remains equipped. Parsing
// those BMDs again caused 150-700ms main-thread hitches. Cache the parsed model
// by authority+path and clear it together with the character authority epoch.
const _equipmentModelCache = new Map();
const _equipmentModelInflight = new Map();
let _characterCacheEpoch = 0;
function characterAuthority(io) { return String(io?.assetAuthority ?? RemoteAssets.baseUrl ?? ''); }
function assertCharacterAuthority(io, authority, epoch) {
    if (epoch !== _characterCacheEpoch || characterAuthority(io) !== authority) {
        const error = new Error('Character assets superseded by another Data authority');
        error.code = 'MUWEB_STALE_CHARACTER_LOAD';
        throw error;
    }
}

/** FIX85: lightweight semantic signature for equipment visuals.
 * Uses only decoded CharSet + resolver metadata; no fetch, BMD parse or GPU work.
 * It intentionally includes material-affecting fields (level/excellent/options)
 * so true visual changes are not suppressed, while protocol bytes unrelated to
 * rendering no longer force a character rebuild.
 */
export function characterEquipmentVisualSignature(charset, customPreview = null) {
    if (!Array.isArray(charset) || charset.length < 18) return null;
    try {
        let decoded = decodeCharacterEquipment(charset);
        decoded = applyCustomPreviewWingOverride(decoded, customPreview || null);
        decoded = applyCustomPreviewHelperOverride(decoded, customPreview || null);
        const resolved = resolveCharacterModels(decoded);
        const itemSig = (src, entry) => src || entry ? [
            entry?.path || null, entry?.itemType ?? src?.extType ?? null,
            src?.level ?? 0, src?.option1 ?? 0, src?.extOption ?? 0,
            Boolean(src?.baseSkin), entry?.effectType ?? 0, entry?.color || null,
        ] : null;
        const body = {};
        for (const key of ['helm','armor','pants','gloves','boots']) body[key] = itemSig(decoded.body?.[key], resolved.body?.[key]);
        return JSON.stringify({
            classByte: decoded.classByte ?? charset[0] ?? 0,
            body,
            weaponRight: itemSig(decoded.weaponRight, resolved.weaponRight),
            weaponLeft: itemSig(decoded.weaponLeft, resolved.weaponLeft),
            wing: itemSig(decoded.wing, resolved.wing),
            helper: [resolved.helper?.kind || null, resolved.helper?.path || null, resolved.helper?.itemType ?? decoded.helper?.extType ?? null],
            previewWing: Number(customPreview?.wingIndex || 0),
            previewPet: Number(customPreview?.petIndex || 0),
            previewSecondPet: Number(customPreview?.secondPetIndex || 0),
        });
    } catch (_) { return null; }
}


/** FIX86: signature of body geometry only. Material/options are excluded on purpose.
 * PC ChangeCharacterExt changes +level/excellent/set presentation without replacing
 * the Player.bmd skeleton or the equipped part BMD when the resolved model path is
 * unchanged. This lets the live renderer update materials without a full rebuild. */
export function characterBodyGeometrySignature(charset) {
    if (!Array.isArray(charset) || charset.length < 18) return null;
    try {
        const decoded = decodeCharacterEquipment(charset);
        const resolved = resolveCharacterModels(decoded);
        return JSON.stringify(['helm','armor','pants','gloves','boots'].map((key) => {
            const src = decoded.body?.[key] || null;
            const entry = resolved.body?.[key] || null;
            return src ? [Boolean(src.baseSkin), entry?.path || null, entry?.itemType ?? src.extType ?? null] : null;
        }));
    } catch (_) { return null; }
}

export async function buildEquipmentAttach(charset, io, playerBones, playerBoneCount, opts = {}) {
    const bind = buildBindWorldTransforms(playerBones || []);
    const bindSignature = JSON.stringify(bind.map(t => [...t.r,...t.p]));
    const authority = characterAuthority(io);
    const previewWingIndex = Number(opts?.customPreview?.wingIndex || 0);
    const previewPetIndex = Number(opts?.customPreview?.petIndex || 0);
    const charsetKey = Array.isArray(charset) ? `${charset.join(',')}|previewWing=${previewWingIndex}|previewPet=${previewPetIndex}|bones=${playerBoneCount}|bind=${bindSignature}` : 'empty';
    const equipCacheKey = JSON.stringify([authority, charsetKey]);
    const epoch = _characterCacheEpoch;
    if (_equipmentAttachCache.has(equipCacheKey)) return _equipmentAttachCache.get(equipCacheKey);
    if (_equipmentAttachInflight.has(equipCacheKey)) return _equipmentAttachInflight.get(equipCacheKey);
    const equipmentJob = (async () => {

    const out = { meshes: [], textures: [], bodyMeshes: [], bodyTextures: [], bodySpecs: {}, replacedBodyKeys: [], bodyMissing: [], wing: null, helper: null, customHelper: null, darkSpirit: null, fenrir: null, rider: null, helperKind: null, missing: [], weaponRightSpec: null, weaponLeftSpec: null, weaponRenderMode: 'render-link-object' };
    const reusableBody = opts?.reuseBodyAttach || null;
    const refreshReusableBodySpecs = Boolean(opts?.refreshReusableBodySpecs);
    if (!charset || !Array.isArray(charset) || charset.length < 18) return out;

    let decoded;
    try { decoded = decodeCharacterEquipment(charset); }
    catch (e) { out.missing.push(`charset-decode: ${e.message}`); return out; }
    // FIX50 / PC ZzzCharacter.cpp:12821-12863: F3:72 custom preview is an
    // authoritative post-ChangeCharacterExt override. When WingIndex>0 and the
    // current CustomWings.lua owns WING+index, it REPLACES the stock CharSet
    // wing. This closes the bug where customs were displayed as Wing01/Wing06.
    decoded = applyCustomPreviewWingOverride(decoded, opts?.customPreview || null);
    decoded = applyCustomPreviewHelperOverride(decoded, opts?.customPreview || null);

    const resolved = resolveCharacterModels(decoded);
    for (const m of resolved.missing) out.missing.push(m);
    for (const m of resolved.bodyMissing || []) out.bodyMissing.push(m);

    const buildItem = async (entry, reuseSpec = null) => {
        if (!entry || !entry.path) return;
        const modelKey = JSON.stringify([authority, entry.path]);
        try {
            // FIX87: linked-item fast path begins before fetch/parse.  The live
            // equipment attachment already owns the parsed BMD; when the resolved
            // model path is unchanged, reuse that exact model object instead of
            // consulting fetch/cache/extract paths again.
            let model = (reuseSpec?.path === entry.path ? (reuseSpec.model || reuseSpec.bufModel || null) : null) || _equipmentModelCache.get(modelKey) || null;
            if (!model) {
                let pending = _equipmentModelInflight.get(modelKey);
                if (!pending) {
                    pending = (async () => {
                        // FIX88: use the engine-wide authority-scoped BMD cache. Inventory
                        // icons, ground items, previews and equipment now share the same
                        // parsed BMD object instead of PlayerComposer doing a second
                        // fetchBinary+parseBMD on the equip hot path.
                        const parsed = await MUAssets.loadBMDRaw(entry.path);
                        assertCharacterAuthority(io, authority, epoch);
                        _equipmentModelCache.set(modelKey, parsed);
                        return parsed;
                    })().finally(() => _equipmentModelInflight.delete(modelKey));
                    _equipmentModelInflight.set(modelKey, pending);
                }
                model = await pending;
            }
            return { model, entry };
        } catch (e) {
            out.missing.push(`parse falhou ${entry.path}: ${e.message}`);
        }
    };

    // FIX51: prepare held weapons and all five body families concurrently.
    // Publication is still atomic because this function returns only after every
    // real owner has settled. This removes the serial BMD/fetch chain that made
    // a single F3:13 equipment snapshot stall the render thread for hundreds ms.
    const weaponRequests = [
        [resolved.weaponRight, 'right', 'weaponR'],
        [resolved.weaponLeft, 'left', 'weaponL'],
    ];
    const weaponResults = await Promise.all(weaponRequests.map(async ([entry, side, key]) => {
        const reuse = side === 'right' ? opts?.reuseLinkedAttach?.weaponRightSpec : opts?.reuseLinkedAttach?.weaponLeftSpec;
        const built = await buildItem(entry, reuse);
        if (!built) return null;
        const extType = side === 'right' ? decoded.weaponRight?.extType : decoded.weaponLeft?.extType;
        const meta = Number.isInteger(extType) ? await itemAttributeFor(io.fetchBinary, extType).catch(() => null) : null;
        const spec = {
            path: entry.path, model: built.model, side, linkBone: PLAYER_WEAPON_LINK_BONE[side],
            extType, category: Number.isInteger(extType) ? Math.floor(extType / 512) : -1,
            index: Number.isInteger(extType) ? (extType % 512) : -1,
            rawLevel: ((side === 'right' ? decoded.weaponRight?.level : decoded.weaponLeft?.level) || 0) << 3,
            visualLevel: (side === 'right' ? decoded.weaponRight?.level : decoded.weaponLeft?.level) || 0,
            option1: (side === 'right' ? decoded.weaponRight?.option1 : decoded.weaponLeft?.option1) || 0,
            extOption: (side === 'right' ? decoded.weaponRight?.extOption : decoded.weaponLeft?.extOption) || 0,
            twoHand: meta ? Boolean(meta.twoHand) : null, itemName: meta?.name || '',
            customColor: entry.color || null, effectType: entry.effectType || 0,
        };
        const linkBone = PLAYER_WEAPON_LINK_BONE[side];
        const meshes = extractRigidAttachment(built.model, key, linkBone, playerBones, playerBoneCount);
        return { side, spec, meshes };
    }));
    for (const result of weaponResults) {
        if (!result) continue;
        if (result.side === 'right') out.weaponRightSpec = result.spec; else out.weaponLeftSpec = result.spec;
        for (const m of result.meshes) {
            out.meshes.push(m);
            out.textures.push({ FileName: m.texFileName, Dir: 'Item' });
        }
    }

    // Body equipment (helm/armor/pants/gloves/boots) shares Player.bmd bones.
    const bodyKeyInfo = {
        helm: ['helm', 'Player'], armor: ['armor', 'Player'], pants: ['pant', 'Player'],
        gloves: ['glove', 'Player'], boots: ['boot', 'Player'],
    };
    let bodyResults = null;
    if (reusableBody) {
        // FIX86: geometry reuse is broader than byte-identical body state. If the
        // resolved BMD paths are unchanged, keep the exact live mesh graph even when
        // +level/excellent/set/material options changed. Only bodySpecs are refreshed.
        out.bodyMeshes = reusableBody.bodyMeshes || [];
        out.bodyTextures = reusableBody.bodyTextures || [];
        out.bodySpecs = refreshReusableBodySpecs ? {} : (reusableBody.bodySpecs || {});
        out.replacedBodyKeys = [...(reusableBody.replacedBodyKeys || [])];
        out.bodyMissing = [...(reusableBody.bodyMissing || [])];
        if (refreshReusableBodySpecs) {
            for (const key of ['helm','armor','pants','gloves','boots']) {
                const src = decoded.body?.[key];
                const entry = resolved.body?.[key];
                if (!src || src.baseSkin || !entry?.path) continue;
                const meshKey = bodyKeyInfo[key][0];
                out.bodySpecs[meshKey] = {
                    path: entry.path, extType: entry.itemType, bodyOffset: src.extType,
                    rawLevel: (src.level || 0) << 3, visualLevel: src.level || 0,
                    option1: src.option1 || 0, extOption: src.extOption || 0,
                    customColor: entry.color || null, effectType: entry.effectType || 0,
                };
            }
        }
        bodyResults = [];
    } else bodyResults = await Promise.all(Object.keys(bodyKeyInfo).map(async (key) => {
        const src = decoded.body?.[key];
        const entry = resolved.body?.[key];
        if (!src || src.baseSkin || !entry?.path) return null;
        const built = await buildItem(entry);
        if (!built) return { key, error:`body-load-failed: ${key}:${entry.path}` };
        const [meshKey, fallbackDir] = bodyKeyInfo[key];
        const dir = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : fallbackDir;
        const partMeshes = extractPartMeshes(built.model, meshKey, playerBoneCount, playerBones);
        if (!partMeshes.length) return { key, error:`body-empty: ${key}:${entry.path}` };
        return {
            key, meshKey, dir, entry, src, partMeshes,
            spec: {
                path: entry.path,
                extType: entry.itemType,
                bodyOffset: src.extType,
                rawLevel: (src.level || 0) << 3,
                visualLevel: src.level || 0,
                option1: src.option1 || 0,
                extOption: src.extOption || 0,
                customColor: entry.color || null, effectType: entry.effectType || 0,
            },
        };
    }));
    for (const result of bodyResults) {
        if (!result) continue;
        if (result.error) { out.bodyMissing.push(result.error); continue; }
        for (const m of result.partMeshes) {
            out.bodyMeshes.push(m);
            out.bodyTextures.push({ FileName: m.texFileName, Dir: result.dir });
        }
        out.replacedBodyKeys.push(result.meshKey);
        out.bodySpecs[result.meshKey] = result.spec;
    }

    // Wing/helper — renderData próprio (skeleton/actions próprios) + regra de
    // attach PC (bone alvo/offset/rotação — accessoryAttachRule)
    if (resolved.wing?.path) {
        const built = await buildItem(resolved.wing, opts?.reuseLinkedAttach?.wing || null);
        // FIX59: FIX57 had the attach consumer for custom.cape but no producer ever
        // populated that field. Resolve the six values from the authoritative
        // CharacterCreateCape.lua callback after the bootstrap gate has loaded it.
        let wingResolved=resolved.wing;
        if (resolved.wing.custom?.customWing && resolved.wing.custom?.isCape) {
            const cape=customCapeModelPosition(PC_MODEL_ITEM + resolved.wing.itemType);
            if (cape) wingResolved={...resolved.wing,custom:{...resolved.wing.custom,cape}};
        }
        if (built) out.wing = {
            path: wingResolved.path, bufModel: built.model, viaCacheKey: wingResolved.key,
            attach: accessoryAttachRule(wingResolved), extType: wingResolved.itemType,
            itemModelType: Number.isInteger(resolved.wing.itemType) ? (PC_MODEL_ITEM + resolved.wing.itemType) : null,
            customWing: Boolean(resolved.wing.custom?.customWing), isCape: Boolean(resolved.wing.custom?.isCape), isCapeCount: Number(resolved.wing.custom?.isCapeCount || 0),
            // PC CustomCape::RenderCape calls RenderCapeModel(BMD,Object,Type,RenderCharacter).
            // Keep the exact authored callback plan beside the equipped model; consumers may
            // execute only operations the renderer actually implements (never synthesize FX).
            // PC CustomCape::RenderModel derives RenderCharacter from BMD::BodyLight:
            // exact white (1,1,1) => 0, any other BodyLight => 1.  Keep both
            // immutable Lua-authored programs because terrain lighting can change after
            // equip; selecting one must not re-enter Fengari in the render hot path.
            renderCapePlans: (resolved.wing.custom?.customWing && resolved.wing.custom?.isCape)
                ? customCapeRenderPlans(PC_MODEL_ITEM + resolved.wing.itemType) : null,
            classId: Number(opts?.classId ?? decoded.classByte ?? 0) & 7,
            customColor: resolved.wing.color || null, effectType: resolved.wing.effectType || 0,
        };
    }
    // Fenrir is intentionally pathless here: it is a CreateBug/PetSystem
    // marker, not a bone-attached item. Gate on the resolved owner itself so
    // HELPER+37 reaches out.fenrir; the old `.path` gate silently discarded it.
    if (resolved.helper?.path || resolved.helper?.kind) {
        if (resolved.helper.kind === 'dark-spirit') {
            // R24: junction finalmente fechado. No PC o scepter DL (STAFF+5)
            // é engolido por ChangeCharacterExt e vira CreatePetDarkSpirit;
            // o companion usa MODEL_DARK_SPIRIT / Skill/darkspirit.bmd no
            // CSPetSystem, nunca um item rígido anexado ao bone da mão.
            out.darkSpirit = {
                kind: 'dark-spirit',
                // Current-client DarkSpirit.lua is the first owner. The stock
                // Main 5.2 AccessModel remains the exact fallback only when
                // no Lua row owns HELPER+5.
                petModelPath: resolved.helper.darkSpirit?.modelPath || resolved.helper.path || 'Skill/darkspirit.bmd',
                objectModelPath: resolved.helper.darkSpirit?.objectModelPath || null,
                itemType: resolved.helper.itemType ?? (13 * 512 + 5),
                viaCacheKey: resolved.helper.key || 'HELPER:5',
                owner: resolved.helper.darkSpirit ? 'DarkSpirit.lua' : 'stock-PC',
                presentation: resolved.helper.darkSpirit || null,
            };
        } else if (resolved.helper.kind === 'fenrir') {
            // PC: HELPER+37 é marcador + CreateBug(MODEL_FENRIR_*). Os modelos
            // reais por cor são Skill/fenril_{red,black,blue,gold}.bmd
            // (ZzzOpenData.cpp:4125-4134; L12677-12703 Option1: 1=BLACK,
            // 2=BLUE, 4=GOLD, senão RED). Mount/ride actions + creature no
            // mundo = lane PetSystem (cfbeefaf); aqui só reportamos o modelo
            // correto — NÃO anexamos mesh inventada.
            const FENRIR_MODEL = { 1: 'Skill/fenril_black.bmd', 2: 'Skill/fenril_blue.bmd', 4: 'Skill/fenril_gold.bmd' };
            out.fenrir = { option: resolved.helper.option ?? 0, petModelPath: FENRIR_MODEL[resolved.helper.option] ?? 'Skill/fenril_red.bmd' };
            // R24: junction PetSystem já está ativo no GameApp; não reportar
            // falso missing quando o owner real do mount está disponível.
        } else if (resolved.helper.key !== 'HELPER:1') {
            // Unicon/pegasus/horse/ext-pets: CreateBug creatures (ZzzCharacter
            // .cpp L12627-12704) — NÃO viram mesh anexada. Lane PetSystem.
            // Junction HelperCompanion (R12.5 t-muhgu6qw-1): HELPER:0 expõe
            // helperKind p/ o Scene/GameApp consumir via pets.summonHelper
            // (CreateBug MODEL_HELPER, ZzzCharacter.cpp:12646). Riders
            // HELPER:2/3 (R12.5 riders): expõem out.rider com o BMD REAL por
            // espécie (ZzzOpenData.cpp:4121-4122 AccessModel "Rider",1/2 —
            // Skill/Rider01.bmd / Rider02.bmd padStart-2, probes v10 reais)
            // p/ o summonMount da MountCompanion (MoveBug GOBoid.cpp:495-601).
            // dark-horse: R12.6 — o parseBMD JÁ suporta v12 (decrypt MapFileDecrypt
            // transparente; probe REAL Skill/DarkHorse.bmd 330601B: 13 meshes/
            // 60 bones/7 actions, tex dkfurop.TGA — o comentário "v12 não
            // portado" estava desatualizado). AccessModel(MODEL_DARK_HORSE,
            // "Data\Skill\", "DarkHorse") ZzzOpenData.cpp:4123; CreateBug no
            // ChangeCharacterExt ZzzCharacter.cpp:12653-12661 (Equipment[11]&1).
            // Mount lane PetSystem: MountCompanion species 'dark-horse' com
            // DARKHORSE_ACTIONS (MoveBug GOBoid.cpp:324-494).
            if (resolved.helper.kind === 'helper') {
                out.helperKind = 'helper';
            } else if (resolved.helper.kind === 'custom-preview' && (resolved.helper.helper?.renderModelPath || resolved.helper.helper?.modelPath)) {
                const h = resolved.helper.helper;
                const common = {
                    itemType: resolved.helper.itemType,
                    petModelPath: h.renderModelPath || h.modelPath, itemModelPath: h.itemModelPath || h.modelPath, objectModelPath: h.objectModelPath || null,
                    movement: Number(h.movement), height: Number(h.height), size: Number(h.size), sizeCharList: Number(h.sizeCharList),
                    type: Number(h.type), rawType: Number(h.rawType), miniature: Number(h.miniature),
                    sizeMiniature: Number(h.sizeMiniature), velocityMiniature: Number(h.velocityMiniature),
                    presentation: resolved.helper.helperPresentation || null, owner: 'CharacterHelper.lua', viaCacheKey: resolved.helper.key,
                };
                // CharacterHelper.lua RenderHelper dispatcher is explicit: raw Type 0=Fly,
                // 2=Dinorant(mask4), 3=Fenrir(mask8), 4=Horse(mask16). Never route mounts through HelperCompanion.
                if (Number(h.rawType) === 0) out.customHelper = { kind:'custom-helper', ...common };
                else if (Number(h.rawType) === 2) out.rider = { ...common, species:'custom-dinorant', behaviorSpecies:'pegasus' };
                else if (Number(h.rawType) === 3) out.rider = { ...common, species:'custom-fenrir', behaviorSpecies:'fenrir' };
                else if (Number(h.rawType) === 4) out.rider = { ...common, species:'custom-horse', behaviorSpecies:'dark-horse' };
                else out.missing.push(`custom-helper rawType=${h.rawType} (${resolved.helper.key}): movement owner específico pendente; não roteado como pet voador`);
            } else if (resolved.helper.kind === 'unicon' || resolved.helper.kind === 'pegasus') {
                out.rider = {
                    species: resolved.helper.kind,
                    petModelPath: resolved.helper.kind === 'pegasus' ? 'Skill/Rider02.bmd' : 'Skill/Rider01.bmd',
                };
            } else if (resolved.helper.kind === 'dark-horse') {
                out.rider = { species: 'dark-horse', petModelPath: 'Skill/DarkHorse.bmd' };
            } else if (!resolved.helper.path) {
                out.missing.push(`${resolved.helper.kind || 'helper'} (${resolved.helper.key}): sem modelo PC/Lua`);
            } else {
                out.missing.push(`${resolved.helper.kind || 'helper'} (${resolved.helper.key}): lane PetSystem pendente (CreateBug)`);
            }
        } else {
            // Apenas o IMP tem attach bone-parented real (PC L15287-15311).
            const built = await buildItem(resolved.helper, opts?.reuseLinkedAttach?.helper || null);
            if (built) out.helper = {
                path: resolved.helper.path, bufModel: built.model, kind: resolved.helper.kind, viaCacheKey: resolved.helper.key,
                attach: accessoryAttachRule(resolved.helper.key), playSpeed: resolved.helper.kind === 'imp' ? 0.5 : undefined,
                extType: resolved.helper.itemType, customColor: resolved.helper.color || null, effectType: resolved.helper.effectType || 0,
            };
        }
    }

    return out;
    })();
    _equipmentAttachInflight.set(equipCacheKey, equipmentJob);
    try {
        const result = await equipmentJob;
        assertCharacterAuthority(io, authority, epoch);
        // Temporary fetch/parse failures must not persist across reequip.
        if (epoch === _characterCacheEpoch && !result.missing.length && !result.bodyMissing.length) _equipmentAttachCache.set(equipCacheKey, result);
        return result;
    } finally {
        if (_equipmentAttachInflight.get(equipCacheKey) === equipmentJob) _equipmentAttachInflight.delete(equipCacheKey);
    }
}

/** Replace class-base body meshes with the exact CharSet body models. */
export function mergeEquipmentBodyRenderData(renderDataBase, attach) {
    if (!renderDataBase || !attach?.bodyMeshes?.length) return renderDataBase;
    const replaced = new Set(attach.replacedBodyKeys || []);
    const keepMeshes = [];
    const keepTextures = [];
    for (let i = 0; i < (renderDataBase.meshes || []).length; i++) {
        const mesh = renderDataBase.meshes[i];
        const name = String(mesh?.name || '');
        const owned = [...replaced].some((key) => name.startsWith(`${key}_`));
        if (!owned) {
            keepMeshes.push(mesh);
            keepTextures.push(renderDataBase.textures?.[i] || null);
        }
    }
    return {
        ...renderDataBase,
        meshes: [...keepMeshes, ...attach.bodyMeshes],
        textures: [...keepTextures, ...attach.bodyTextures],
        source: `${renderDataBase.source || 'player'}+body-equip`,
    };
}

/** Residency required before replacing an already visible player graph. */
export function playerVisualLoadIssues(renderer, extras = [], equipment = null) {
    const issues = [...(renderer?.userData?.muCompositionMissing || []), ...(equipment?.missing || []), ...(equipment?.bodyMissing || [])];
    for (const owner of [renderer, ...extras]) {
        const programs = owner?.userData?.muRenderModelPrograms || (owner?.userData?.muRenderModel ? {current:owner.userData.muRenderModel} : {});
        for (const program of Object.values(programs)) {
            for (const path of program.pendingBitmapPaths || []) issues.push(`bitmap-not-ready:${path}`);
        }
        for (const program of Object.values(owner?.userData?.muItemMaterialResidencyPrograms || {})) {
            for (const path of program.pendingBitmapPaths || []) issues.push(`bitmap-not-ready:${path}`);
        }
        for (const mesh of owner?.meshes || []) {
            if (mesh.userData?.textureReady !== true && !mesh.userData?.pcBitmapHide) {
                issues.push(`texture-not-ready:${mesh.userData?.textureMissing || mesh.name || 'mesh'}`);
            }
        }
    }
    for (const spec of [equipment?.wing, equipment?.helper, equipment?.weaponRightSpec, equipment?.weaponLeftSpec]) {
        if (!spec) continue;
        const present = extras.some(owner => owner?.userData?.path === spec.path &&
            (spec.side == null || owner?.userData?.side === spec.side));
        if (!present) issues.push(`attachment-not-ready:${spec.path}`);
    }
    return issues;
}

export function unresolvedClassParts(composed, equipment) {
    const replaced = new Set(equipment?.replacedBodyKeys || []);
    return (composed?.missingParts || []).filter(path => {
        const key = String(path).match(/(?:^|\/)(Helm|Armor|Pant|Glove|Boot)Class/i)?.[1]?.toLowerCase();
        return !key || !replaced.has(key);
    });
}

/** Apply stock +level/excellent/set material passes only to the body families
 * actually replaced by CharSet. Unknown custom RenderModel.lua rules stay out. */
const PC_MODEL_ITEM = 1095; // _enum.h MODEL_ITEM, same authority used by DisableExcellentLua

async function attachLuaSpritePlans(renderer, plans, ownerKey) {
    if (!renderer || !Array.isArray(plans) || !plans.length) return { owners: [], unresolved: [] };
    const owners = [], unresolved = [];
    for (const plan of plans) {
        const bitmap = Number.isFinite(plan.bitmap) ? plan.bitmap : plan.effectId;
        const map = await pcBitmapTexture(bitmap).catch(() => null);
        if (!map?.isTexture) {
            unresolved.push(Object.freeze({ ...plan, reason: 'bitmap-id-unresolved' }));
            continue;
        }
        const offset = Array.isArray(plan.offset) ? new THREE.Vector3(...plan.offset) : null;
        const common = {
            boneIndex: Number(plan.bone), map, offset, scale: Number(plan.scale) || 0,
            color: new THREE.Color(Number(plan.r) || 0, Number(plan.g) || 0, Number(plan.b) || 0),
        };
        let owner = null;
        if (plan?.kind === 'sprite') owner = renderer.createBoneSprite?.(common);
        else if (plan?.kind === 'particle') owner = renderer.createBoneParticle?.({ ...common, subtype:Number(plan.subtype ?? plan.effectLv) || 0, emitMs:40 });
        else if (plan?.kind === 'skill') {
            // PC CustomSetEffect::CreateSetEffectSkill emits TWO children from the
            // same transformed bone: CreateParticle(...) and CreateEffect(...).
            // The retained bitmap particle owner is exact here.  Never silently
            // collapse the second CreateEffect family into the particle; retain
            // it as explicit semantic debt until that EffectID's native lifecycle
            // (MoveEffect/RenderEffects) is available in Web.
            owner = renderer.createBoneParticle?.({ ...common, subtype:Number(plan.effectLv)||0, emitMs:40, poolSize:6 });
            unresolved.push(Object.freeze({ ...plan, kind:'effect', childOf:'skill', reason:'CreateEffect-native-lifecycle-unresolved' }));
        } else {
            unresolved.push(Object.freeze({ ...plan, reason: `${plan?.kind || 'unknown'}-unsupported` }));
            continue;
        }
        if (!owner) {
            unresolved.push(Object.freeze({ ...plan, reason: 'bone-or-bitmap-invalid' }));
            continue;
        }
        owner.muLuaPlan = Object.freeze({ ...plan });
        owners.push(owner);
    }
    if (!renderer.userData) renderer.userData = {};
    const previous = Array.isArray(renderer.userData.muCharacterLuaFX) ? renderer.userData.muCharacterLuaFX : [];
    renderer.userData.muCharacterLuaFX = [...previous, { ownerKey, owners, unresolved }];
    return { owners, unresolved };
}

/** Consume the real CharacterEffectItens.lua / CharacterSetEffect.lua sprite bridges.
 * PC authority calls CharacterItensEffect for each item MODEL type and invokes
 * CreateEffectSetPlayer with the BOOTS model type every character render. In this
 * client CheckFullSet() returns 0 before its legacy body, so EquipmentLevelSet is
 * exactly 0 for this source. FIX54 consumes sprite, particle and skill child lanes
 * from their authored bone using the fixed 40 ms FX clock and pooled allocations. */
export async function applyPcCharacterLuaSpritePresentation(renderer, attach) {
    if (!renderer || !attach) return { owners: [], unresolved: [] };
    const allOwners = [], allUnresolved = [];
    const seen = new Set();
    const applyType = async (extType, key) => {
        if (!Number.isInteger(extType)) return;
        const modelType = PC_MODEL_ITEM + extType;
        const sig = `${key}:${modelType}`;
        if (seen.has(sig)) return;
        seen.add(sig);
        const result = await attachLuaSpritePlans(renderer, characterItemEffectPlan(modelType), `CharacterEffectItens:${sig}`);
        allOwners.push(...result.owners); allUnresolved.push(...result.unresolved);
    };
    for (const [key, spec] of Object.entries(attach.bodySpecs || {})) await applyType(spec?.extType, key);
    const boots = attach.bodySpecs?.boot;
    if (Number.isInteger(boots?.extType)) {
        const bootModelType = PC_MODEL_ITEM + boots.extType;
        const result = await attachLuaSpritePlans(renderer, characterSetEffectPlan(bootModelType, 0), `CharacterSetEffect:boot:${bootModelType}`);
        allOwners.push(...result.owners); allUnresolved.push(...result.unresolved);
    }
    return { owners: allOwners, unresolved: allUnresolved };
}

export async function applyBodyEquipmentPresentation(renderer, attach) {
    if (!renderer || !attach?.bodySpecs) return 0;
    // FIX86: body presentation is independently replaceable. PC changes +level/
    // excellent/set state on the live character; it does not recreate Player.bmd.
    // Retire only overlays/bone FX/update callbacks produced by the previous body
    // presentation pass, keeping the base renderer/skeleton/textures resident.
    const prior = renderer.userData?.muBodyEquipmentPresentationOwner || null;
    if (prior) {
        for (const mesh of prior.overlays || []) {
            try { mesh.parent?.remove?.(mesh); } catch (_) {}
            try { mesh.material?.dispose?.(); } catch (_) {}
        }
        if (Array.isArray(renderer._overlayMeshes) && prior.overlays?.length)
            renderer._overlayMeshes = renderer._overlayMeshes.filter((m) => !prior.overlays.includes(m));
        for (const owner of prior.boneSprites || []) { try { owner?.dispose?.(); } catch (_) {} }
        if (Array.isArray(renderer._boneSprites) && prior.boneSprites?.length)
            renderer._boneSprites = renderer._boneSprites.filter((o) => !prior.boneSprites.includes(o));
        if (Array.isArray(renderer._presentationUpdates) && prior.updates?.length)
            renderer._presentationUpdates = renderer._presentationUpdates.filter((fn) => !prior.updates.includes(fn));
    }
    renderer.userData ??= {};
    const overlayStart = renderer._overlayMeshes?.length || 0;
    const boneStart = renderer._boneSprites?.length || 0;
    const updateStart = renderer._presentationUpdates?.length || 0;
    // RenderModel takeover may have hidden meshes on the previous body state.
    // Re-evaluate visibility from persistent bitmap/render flags before applying
    // the new exact owner. Do not unhide texture-missing or explicitly skipped meshes.
    for (const mesh of renderer.meshes || []) {
        if (!mesh?.name || !/^(helm|armor|pant|glove|boot)_/i.test(mesh.name)) continue;
        if (mesh.userData) mesh.userData.muRenderModelHidden = false;
        mesh.visible = !mesh.userData?.pcBitmapHide && !mesh.userData?.textureMissing && !mesh.userData?.muRenderFlagsSkip;
    }
    let passes = 0;
    for (const [meshKey, spec] of Object.entries(attach.bodySpecs)) {
        passes += await applyPcStockItemPresentation(renderer, {
            type: spec.extType, rawLevel: spec.rawLevel, option1: spec.option1,
            extOption: spec.extOption, customColor: spec.customColor || null,
            effectType: spec.effectType || 0,
            meshFilter: (mesh) => String(mesh?.name || '').startsWith(`${meshKey}_`),
        });
        const modelType = PC_MODEL_ITEM + Number(spec.extType);
        if (Number.isInteger(spec.extType)) await attachLuaSpritePlans(renderer, characterItemEffectPlan(modelType), `CharacterEffectItens:body:${meshKey}:${modelType}`);
    }
    const boots = attach.bodySpecs?.boot;
    if (Number.isInteger(boots?.extType)) {
        const bootModelType = PC_MODEL_ITEM + boots.extType;
        await attachLuaSpritePlans(renderer, characterSetEffectPlan(bootModelType, 0), `CharacterSetEffect:boot:${bootModelType}`);
    }
    renderer.userData.muBodyEquipmentPresentationOwner = {
        overlays: [...(renderer._overlayMeshes || []).slice(overlayStart)],
        boneSprites: [...(renderer._boneSprites || []).slice(boneStart)],
        updates: [...(renderer._presentationUpdates || []).slice(updateStart)],
    };
    return passes;
}

/**
 * R12.5: cria um MUModelRenderer pronto p/ acessório (wing/helper) do personagem.
 * Aplica pose do PC (offset/rot do accessoryAttachRule — MU space no bone frame)
 * + PlaySpeed da regra (wing idle 0.25 / imp 0.5). O caller PARENTA o grupo
 * no THREE.Bone alvo e registra dispose/update.
 *
 * Fail-closed: qualquer falha de fetch/parse/criação ⇒ null + log warn.
 */
/** RenderLinkObject-style held weapon: the item keeps its own BMD hierarchy
 * and is parented under the player's authored hand bone. This replaces the
 * old Web shortcut that rewrote all item vertices to a Player.bmd bone. */

function retireLinkedItemPresentation(renderer) {
    const prior = renderer?.userData?.muLinkedItemPresentationOwner || null;
    if (!renderer || !prior) return;
    for (const mesh of prior.overlays || []) {
        try { mesh.parent?.remove?.(mesh); } catch (_) {}
        try { mesh.material?.dispose?.(); } catch (_) {}
    }
    if (Array.isArray(renderer._overlayMeshes) && prior.overlays?.length)
        renderer._overlayMeshes = renderer._overlayMeshes.filter((m) => !prior.overlays.includes(m));
    for (const owner of prior.boneSprites || []) { try { owner?.dispose?.(); } catch (_) {} }
    if (Array.isArray(renderer._boneSprites) && prior.boneSprites?.length)
        renderer._boneSprites = renderer._boneSprites.filter((o) => !prior.boneSprites.includes(o));
    if (Array.isArray(renderer._presentationUpdates) && prior.updates?.length)
        renderer._presentationUpdates = renderer._presentationUpdates.filter((fn) => !prior.updates.includes(fn));
    renderer.userData.muLinkedItemPresentationOwner = null;
}

async function applyLinkedItemPresentation(renderer, spec, ownerKey) {
    if (!renderer || !spec) return 0;
    retireLinkedItemPresentation(renderer);
    renderer.userData ??= {};
    // A previous RenderModel/Lua material owner may have hidden a mesh. Re-evaluate
    // from persistent physical flags before installing the next presentation.
    for (const mesh of renderer.meshes || []) {
        if (mesh?.userData) mesh.userData.muRenderModelHidden = false;
        if (mesh) mesh.visible = !mesh.userData?.pcBitmapHide && !mesh.userData?.textureMissing && !mesh.userData?.muRenderFlagsSkip;
    }
    const overlayStart = renderer._overlayMeshes?.length || 0;
    const boneStart = renderer._boneSprites?.length || 0;
    const updateStart = renderer._presentationUpdates?.length || 0;
    const passes = await applyPcStockItemPresentation(renderer, {
        type: spec.extType, rawLevel: spec.rawLevel || 0,
        option1: spec.option1 || 0, extOption: spec.extOption || 0,
        customColor: spec.customColor || null, effectType: spec.effectType || 0,
    });
    if (Number.isInteger(spec.extType)) {
        const modelType = PC_MODEL_ITEM + spec.extType;
        await attachLuaSpritePlans(renderer, characterItemEffectPlan(modelType), `CharacterEffectItens:${ownerKey}:${modelType}`);
    }
    renderer.userData.muLinkedItemPresentationOwner = {
        overlays: [...(renderer._overlayMeshes || []).slice(overlayStart)],
        boneSprites: [...(renderer._boneSprites || []).slice(boneStart)],
        updates: [...(renderer._presentationUpdates || []).slice(updateStart)],
    };
    return passes;
}

/** FIX87: update +level/excellent/custom material/CharacterEffectItens on an
 * already-resident linked item. Geometry, BMD parser output and GPU base mesh
 * stay alive. CustomCape RenderCapeModel remains atomic and is intentionally
 * excluded by the caller when its Lua program changes. */
export async function refreshLinkedItemPresentation(renderer, spec, ownerKey = 'linked') {
    if (!renderer || !spec) return false;
    await applyLinkedItemPresentation(renderer, spec, ownerKey);
    renderer.userData = { ...(renderer.userData || {}), extType:spec.extType, effectType:spec.effectType || 0 };
    renderer.setLightEnabled?.(false);
    return true;
}

export async function buildLinkedWeaponRenderer({ scene, camera }, spec) {
    if (!spec?.model || !Number.isInteger(spec?.linkBone)) return null;
    const { MUModelRenderer } = await import('../assets/MUModelRenderer.js');
    const { bmdToRenderData } = await import('./BmdAdapter.js');
    const wr = new MUModelRenderer({ scene, camera });
    try {
    await wr.initFromBMD(bmdToRenderData(spec.model, spec.path));
    const action = wr.mixer?.clips?.has?.('action_0') ? wr.playAction('action_0', 0) : null;
    if (action) action.time = 0;
    await applyLinkedItemPresentation(wr, spec, `weapon:${spec.side}`);
    // ZzzCharacter::RenderLinkObject explicitly forces b->LightEnable=false
    // for linked weapons/items. This must apply after material overlays exist.
    wr.setLightEnabled?.(false);
    // Most held item BMDs are rigid; action speed is updated by their own
    // authored action when present. Never invent a per-item rotation here.
    wr.userData = { ...(wr.userData || {}), bone: spec.linkBone, kind: 'weapon', side: spec.side, path: spec.path, extType: spec.extType, effectType: spec.effectType || 0 };
    return wr;
    } catch (error) {
        try { wr.dispose(); } catch (_) {}
        throw error;
    }
}

function muTransformMatrix(position, anglesDeg) {
    const radians = anglesDeg.map((v) => THREE.MathUtils.degToRad(v));
    const q = angleQuaternion(radians);
    const quat = new THREE.Quaternion(q[0], q[1], q[2], q[3]);
    const m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(position[0], position[1], position[2]), quat, new THREE.Vector3(1, 1, 1));
    return m;
}

/**
 * RenderLinkObject(Link=true) weapon-back transform recovered from the retained
 * PC/Android port. Values are in the same MU-space used by Player.bmd bones.
 * Unknown custom groups use the stock default instead of an invented offset.
 */
export function weaponBackTransformFor(spec) {
    const type = specType(spec);
    const group = type == null ? -1 : Math.floor(type / 512);
    const number = type == null ? -1 : (type % 512);
    let angles = [70, 0, 90], position = [-20, 5, 40];
    if (group === 4 && ((number >= 9 && number <= 15) || [17, 19, 20].includes(number))) {
        angles = [0, 20, 180]; position = [-10, 8, 40];
    } else if (group === 4 && number === 21) {
        angles = [-60, 0, -80]; position = [-5, 20, 0];
    } else if (group === 4 && number === 24) {
        angles = [-60, 0, -80]; position = [-5, 20, -5];
    } else if (group === 4 && number === 25) {
        angles = [90, 0, -80]; position = [10, 20, -5];
    } else if (group === 4) {
        position = [-10, 5, 10];
    } else if (group === 5 && number === 10) {
        angles = [110, 180, 90]; position = [-10, 5, -10];
    } else if (group === 5 && number === 9) {
        position = [-10, 5, 10];
    } else if (group === 6 && number === 17) {
        angles = [30, 0, 90]; position = [-20, 0, -20];
    } else if (group === 6 && (number === 15 || number === 16)) {
        angles = [50, 0, 90]; position = [-28, 0, -25];
    } else if (group === 6 && number === 7) {
        angles = [30, 0, 90]; position = [-15, 0, -25];
    } else if (group === 6) {
        position = [-10, 0, 0];
    }
    let matrix = muTransformMatrix(position, angles);
    // PC applies a second authored matrix to ordinary left-hand back items.
    if (spec?.side === 'left' && group !== 6 && !(group === 4 && number === 21)) {
        matrix = matrix.multiply(muTransformMatrix([0, 10, -30], [145, 0, 275]));
    }
    return matrix;
}

/** Switches a weapon between normal hand bone (33/42) and stock back bone 47.
 * Re-parenting happens only when the state changes, so movement frames do not
 * churn the Three hierarchy. */
export function setLinkedWeaponSafeZonePresentation(renderer, wr, spec, safeZone) {
    if (!renderer || !wr?.group || !spec) return false;
    const back = Boolean(safeZone);
    const state = back ? 'back' : 'hand';
    if (wr.userData?.presentation === state) return true;
    const boneIndex = back ? 47 : spec.linkBone;
    const bone = renderer.bones?.[boneIndex];
    if (!bone) return false;
    bone.add(wr.group);
    if (back) {
        const m = weaponBackTransformFor(spec);
        m.decompose(wr.group.position, wr.group.quaternion, wr.group.scale);
    } else {
        wr.group.position.set(0, 0, 0);
        wr.group.quaternion.identity();
        wr.group.scale.set(1, 1, 1);
    }
    wr.userData = { ...(wr.userData || {}), presentation: state, bone: boneIndex };
    return true;
}

export async function buildAccessoryRenderer({ scene, camera }, spec /* {bufModel,path,attach,kind} */) {
    const { MUModelRenderer } = await import('../assets/MUModelRenderer.js');
    const { bmdToRenderData } = await import('./BmdAdapter.js');
    const wr = new MUModelRenderer({ scene, camera });
    try {
    await wr.initFromBMD(bmdToRenderData(spec.bufModel, spec.path));
    const rule = spec.attach || { bone: 47, offset: [0, 0, 15], rotYDeg: 0 };
    if (Array.isArray(rule.anglesDeg)) {
        // CustomCape::CapeModelPosition returns Angle[0..2] + Matrix[0..2].
        // Use the same MU angle conversion already used by weapon-back owners.
        const m=muTransformMatrix(rule.offset,rule.anglesDeg);
        m.decompose(wr.group.position,wr.group.quaternion,wr.group.scale);
    } else {
        wr.group.position.set(rule.offset[0], rule.offset[1], rule.offset[2]);
        if (rule.rotYDeg) wr.group.rotation.y = rule.rotYDeg * Math.PI / 180;
    }
    if (wr.mixer?.clips?.has?.('action_0')) wr.playAction('action_0');
    if (rule.playSpeed != null) wr.playSpeed = rule.playSpeed;
    // FIX74: mirror CustomCape.cpp exactly: RenderCharacter is zero only when
    // BMD::BodyLight is exactly white.  Selection is allocation-free and follows
    // later terrain-light updates; Lua execution itself remains memoized by FIX72.
    let capeGpu = null;
    if (spec.renderCapePlans) {
        const chooseCapePlan = () => {
            const c = wr.bodyLight;
            const white = c?.r === 1 && c?.g === 1 && c?.b === 1;
            wr.userData ??= {};
            wr.userData.muRenderCapePlan = white ? spec.renderCapePlans.white : spec.renderCapePlans.lit;
            wr.userData.muRenderCapeCharacter = white ? 0 : 1;
        };
        chooseCapePlan();
        // FIX78: consume the Lua-authored RenderBody/RenderMesh program on the GPU.
        // The takeover is atomic: if either BodyLight branch is incomplete, the rigid
        // BMD stays visible and no partial overlay is exposed.
        capeGpu = await applyPcCustomCapePresentation(wr, spec.renderCapePlans);
        const setBodyLight = wr.setBodyLight.bind(wr);
        wr.setBodyLight = (color) => {
            const out=setBodyLight(color); chooseCapePlan(); capeGpu?.update?.(); return out;
        };
    }
    // Wings/rigid helpers are items too. Custom capes are different: on PC the
    // gCustomCape branch REPLACES the normal RenderPartObject body program. Do
    // not stack stock +level/chrome passes on top when the exact Lua GPU program
    // was completely materialized. CharacterEffectItens remains a separate owner.
    if (Number.isInteger(spec.extType)) {
        if (!capeGpu?.complete) await applyLinkedItemPresentation(wr, spec, spec.kind || 'accessory');
        else {
            // CustomCape owns the base RenderModel program, but CharacterEffectItens
            // remains an independent native owner. Track just those Lua children.
            retireLinkedItemPresentation(wr);
            const boneStart=wr._boneSprites?.length||0, updateStart=wr._presentationUpdates?.length||0;
            const modelType = PC_MODEL_ITEM + spec.extType;
            await attachLuaSpritePlans(wr, characterItemEffectPlan(modelType), `CharacterEffectItens:${spec.kind || 'accessory'}:${modelType}`);
            wr.userData.muLinkedItemPresentationOwner={overlays:[],boneSprites:[...(wr._boneSprites||[]).slice(boneStart)],updates:[...(wr._presentationUpdates||[]).slice(updateStart)]};
        }
    }
    // Wings/helpers use the same linked-item LightEnable=false owner.
    wr.setLightEnabled?.(false);
    wr.userData = {
        ...(wr.userData || {}), bone: rule.bone, kind: spec.kind, path: spec.path,
        extType: spec.extType, effectType: spec.effectType || 0,
    };
    return wr;
    } catch (error) {
        try { wr.dispose(); } catch (_) {}
        throw error;
    }
}

const _composedCharacterCache = new Map();
const _composedCharacterInflight = new Map();

export function clearComposedCharacterCache() {
  _characterCacheEpoch++;
  _composedCharacterCache.clear();
  _composedCharacterInflight.clear();
  _equipmentAttachCache.clear();
  _equipmentAttachInflight.clear();
  _equipmentModelCache.clear();
  _equipmentModelInflight.clear();
}

export async function composeCharacter(classId, io) {
  const epoch = _characterCacheEpoch;
  const authority = characterAuthority(io);
  const cacheKey = JSON.stringify([authority, Number(classId) & 0xff]);
  if (_composedCharacterCache.has(cacheKey)) return _composedCharacterCache.get(cacheKey);
  if (_composedCharacterInflight.has(cacheKey)) return _composedCharacterInflight.get(cacheKey);
  const job = (async () => {
  const { loadBMD, fetchBinary } = io;
  if (typeof loadBMD !== 'function' || typeof fetchBinary !== 'function') throw new Error('composeCharacter: IO BMD incompleto');

  // Esqueleto-mestre + 284 ações (Player.bmd — 0 meshes, ZzzOpenData.cpp:119).
  // O Player pode usar o cache adaptado global. As 5 peças de classe precisam
  // do BMD bruto porque extractPartMeshes remapeia seus Vertex_t.Node para o
  // bind-pose de Player.bmd (mesma ownership do RenderPartObject do PC).
  const player = await loadBMD('Player/Player.bmd');
  const playerBoneCount = player.bones.length;

  const skinIndex = getSkinModelIndex(classId);
  const prefixes = ['Helm', 'Armor', 'Pant', 'Glove', 'Boot'];
  const meshes = [];
  const textures = [];
  const usedParts = [];
  const missingParts = [];
  const emptyParts = [];

  // FIX51: the five class-base parts are independent OpenPlayers owners.
  // Fetch/parse them concurrently; preserve deterministic Helm->Boot merge order.
  const basePartResults = await Promise.all(prefixes.map(async (prefix) => {
    const file = partFileName(prefix, skinIndex);
    try {
      const partModel = await MUAssets.loadBMDRaw(file);
      if (!partModel || !Array.isArray(partModel.meshes)) return { prefix, file, missing:true, error:new Error('BMD bruto sem meshes') };
      const partMeshes = extractPartMeshes(partModel, prefix.toLowerCase(), playerBoneCount, player.bones);
      return { prefix, file, partMeshes };
    } catch (e) {
      return { prefix, file, missing:true, error:e };
    }
  }));
  for (const result of basePartResults) {
    const { prefix, file, partMeshes = [] } = result;
    if (result.missing) {
      missingParts.push(file);
      if (result.error) console.warn(`[PlayerComposer] peça ausente ${file}: ${result.error.message}`);
      continue;
    }
    if (!partMeshes.length) { emptyParts.push(file); usedParts.push(prefix); continue; }
    for (const m of partMeshes) {
      meshes.push(m);
      textures.push({ FileName: m.texFileName, Dir: 'Player' });
    }
    usedParts.push(prefix);
  }

  const renderData = {
    ...player,
    source: `composed:player+${usedParts.join('+')}`,
    upAxis: 'z',
    meshes,
    textures,
  };
  return { renderData, skinIndex, parts: usedParts, missingParts, emptyParts };
  })();
  _composedCharacterInflight.set(cacheKey, job);
  try {
    const result = await job;
    assertCharacterAuthority(io, authority, epoch);
    if (epoch === _characterCacheEpoch && !result.missingParts.length) _composedCharacterCache.set(cacheKey, result);
    return result;
  } finally {
    if (_composedCharacterInflight.get(cacheKey) === job) _composedCharacterInflight.delete(cacheKey);
  }
}

/**
 * Controlador de animação do personagem no MUNDO (contrato do Movement).
 *
 * Movement._animate (game/Movement.js:164) chama
 *   mesh.userData.animationControl.play('idle' | 'walk' | 'run')
 * quando o mesh existe. Este builder produz esse objeto a partir de um
 * MUModelRenderer já inicializado:
 *
 *   'idle' → action idleActionFor(classId)  (STOP_MALE/FEMALE/SUMMONER/RF —
 *            ZzzCharacter.cpp:280-289; frames 6/6/8/7 confirmados no parse)
 *   'walk' → action WALK_MALE(15)/WALK_FEMALE(16) por isFemaleClass.
 *   'run'  → PLAYER_RUN(25) quando o BMD possui o clip; fail-closed para WALK
 *            se a variante não existir. Velocidade de authoring segue o PC:
 *            walk=0.33, run=0.34; idle comum=0.28 (Summoner=0.24).
 *   Outros nomes → no-op (nunca lança — o loop principal não pode morrer).
 *
 * Idempotente: re-chamadas do mesmo estado não re-disparam (Movement só
 * chama quando muda, mas o contrato tolera fontes externas repetidas).
 *
 * @param {import('../assets/MUModelRenderer.js').MUModelRenderer} renderer
 * @param {number} classId byte de classe do servidor
 */
export function playerActionPlaySpeed(state, classId, actionIndex = null) {
  // Base speeds from SetPlayerStop/SetPlayerWalk tables already proven in the
  // PC/mobile port. Weapon-specific stop clips have their authored rates.
  if (state === 'walk') {
    if (actionIndex === PLAYER_ACTIONS.WALK_WAND) return 0.44;
    return 0.33;
  }
  if (state === 'run') {
    if (actionIndex === PLAYER_ACTIONS.RUN_WAND) return 0.76;
    if (actionIndex === PLAYER_ACTIONS.RUN_RIDE_HORSE || actionIndex === PLAYER_ACTIONS.DARKLORD_WALK) return 0.33;
    if ((classId & 0x7) === CLASS.RAGEFIGHTER) return 0.28;
    return 0.34;
  }
  if (state === 'idle') {
    const stopSpeed = new Map([
      [PLAYER_ACTIONS.STOP_SWORD, 0.26],
      [PLAYER_ACTIONS.STOP_TWO_HAND_SWORD, 0.24],
      [PLAYER_ACTIONS.STOP_SPEAR, 0.24],
      [PLAYER_ACTIONS.STOP_SCYTHE, 0.24],
      [PLAYER_ACTIONS.STOP_BOW, 0.22],
      [PLAYER_ACTIONS.STOP_CROSSBOW, 0.22],
      [PLAYER_ACTIONS.STOP_WAND, 0.30],
    ]);
    if (stopSpeed.has(actionIndex)) return stopSpeed.get(actionIndex);
    return ((classId & 0x7) === CLASS.SUMMONER) ? 0.24 : 0.28;
  }
  return 1.0;
}

function specType(spec) {
  return Number.isInteger(spec?.extType) ? spec.extType : null;
}
function specCategory(spec) {
  const t = specType(spec); return t == null ? -1 : Math.floor(t / 512);
}
function specIndex(spec) {
  const t = specType(spec); return t == null ? -1 : (t % 512);
}
function hasAnyWeapon(equipment) {
  return specType(equipment?.weaponRightSpec) != null || specType(equipment?.weaponLeftSpec) != null;
}
function equippedBowType(equipment) {
  const left = equipment?.weaponLeftSpec, right = equipment?.weaponRightSpec;
  // CCharacterManager::GetEquipedBowType: current-client CustomBow owner has
  // parity precedence, then the stock item-family ranges.
  const customLeft = customBowType(specType(left));
  const customRight = customBowType(specType(right));
  if (customLeft === 'bow') return 'bow';
  if (customRight === 'crossbow') return 'crossbow';
  if (specCategory(left) === 4 && specIndex(left) !== 7) return 'bow';
  if (specCategory(right) === 4 && specIndex(right) >= 8 && specIndex(right) !== 15) return 'crossbow';
  return null;
}

function fenrirActionFor(state, classId, equipment) {
  const right = specType(equipment?.weaponRightSpec) != null;
  const left = specType(equipment?.weaponLeftSpec) != null;
  if (state === 'idle') {
    if (right && left) return PLAYER_ACTIONS.FENRIR_STAND_TWO_SWORD;
    if (right) return PLAYER_ACTIONS.FENRIR_STAND_ONE_RIGHT;
    if (left) return PLAYER_ACTIONS.FENRIR_STAND_ONE_LEFT;
    return PLAYER_ACTIONS.FENRIR_STAND;
  }
  if (state === 'walk') {
    if (right && left) return PLAYER_ACTIONS.FENRIR_WALK_TWO_SWORD;
    if (right) return PLAYER_ACTIONS.FENRIR_WALK_ONE_RIGHT;
    if (left) return PLAYER_ACTIONS.FENRIR_WALK_ONE_LEFT;
    return PLAYER_ACTIONS.FENRIR_WALK;
  }

  const base = classId & 0x7;
  const family = base === CLASS.ELF ? 'ELF' : (base === CLASS.DARK ? 'MAGOM' : 'NORMAL');
  if (right && left) {
    if (family === 'ELF') return PLAYER_ACTIONS.FENRIR_RUN_TWO_SWORD_ELF;
    if (family === 'MAGOM') return PLAYER_ACTIONS.FENRIR_RUN_TWO_SWORD_MAGOM;
    return PLAYER_ACTIONS.FENRIR_RUN_TWO_SWORD;
  }
  if (right) {
    if (family === 'ELF') return PLAYER_ACTIONS.FENRIR_RUN_ONE_RIGHT_ELF;
    if (family === 'MAGOM') return PLAYER_ACTIONS.FENRIR_RUN_ONE_RIGHT_MAGOM;
    return PLAYER_ACTIONS.FENRIR_RUN_ONE_RIGHT;
  }
  if (left) {
    if (family === 'ELF') return PLAYER_ACTIONS.FENRIR_RUN_ONE_LEFT_ELF;
    if (family === 'MAGOM') return PLAYER_ACTIONS.FENRIR_RUN_ONE_LEFT_MAGOM;
    return PLAYER_ACTIONS.FENRIR_RUN_ONE_LEFT;
  }
  if (family === 'ELF') return PLAYER_ACTIONS.FENRIR_RUN_ELF;
  if (family === 'MAGOM') return PLAYER_ACTIONS.FENRIR_RUN_MAGOM;
  return PLAYER_ACTIONS.FENRIR_RUN;
}

/**
 * Main 5.2 SetPlayerStop/SetPlayerWalk presentation owner.
 * Branch order is important: Fenrir/dark-horse/rider precede ordinary wing
 * flight, and SafeZone forces walking/standing instead of running/flying.
 */
export function worldActionFor(state, classId, equipment = null, context = null) {
  const readBool = (value) => {
    try { return Boolean(typeof value === 'function' ? value() : value); } catch (_) { return false; }
  };
  const safeZone = readBool(context?.safeZone);
  const inBloodCastle = readBool(context?.inBloodCastle);
  const inChaosCastle = readBool(context?.inChaosCastle);
  const inSwimWorld = readBool(context?.inSwimWorld);
  const cursedTemplePlayer = readBool(context?.cursedTemplePlayer);
  const baseClass = classId & 0x7;
  const genericIdle = baseClass === CLASS.ELF ? PLAYER_ACTIONS.STOP_FEMALE
    : (baseClass === CLASS.SUMMONER && !inChaosCastle ? PLAYER_ACTIONS.STOP_SUMMONER
      : (baseClass === CLASS.RAGEFIGHTER ? PLAYER_ACTIONS.STOP_RAGEFIGHTER : PLAYER_ACTIONS.STOP_MALE));
  const genericWalk = (!isFemaleClass(classId) || (baseClass === CLASS.SUMMONER && inChaosCastle))
    ? PLAYER_ACTIONS.WALK_MALE : PLAYER_ACTIONS.WALK_FEMALE;
  const fallback = state === 'idle' ? genericIdle : (state === 'run' ? PLAYER_ACTIONS.RUN : genericWalk);
  const bowType = equippedBowType(equipment);
  const hasWing = Boolean(equipment?.wing);
  const hasFenrir = Boolean(equipment?.fenrir);
  const hasDarkSpirit = Boolean(equipment?.darkSpirit);
  const riderKind = equipment?.rider?.species || equipment?.helperKind || null;
  const weapons = hasAnyWeapon(equipment);

  // ZzzCharacter.cpp::SetPlayerStop/SetPlayerWalk branch order is strict.
  // Every mount branch is suppressed by SafeZone before ordinary weapon stance.
  if (!safeZone && hasFenrir) return fenrirActionFor(state, classId, equipment);
  if (!safeZone && riderKind === 'dark-horse')
    return state === 'idle' ? PLAYER_ACTIONS.STOP_RIDE_HORSE : PLAYER_ACTIONS.RUN_RIDE_HORSE;
  if (hasDarkSpirit && safeZone && (state !== 'idle' || !inChaosCastle))
    return state === 'idle' ? PLAYER_ACTIONS.DARKLORD_STAND : PLAYER_ACTIONS.DARKLORD_WALK;
  if (!safeZone && (riderKind === 'unicon' || riderKind === 'pegasus')) {
    if (state === 'idle') return weapons ? PLAYER_ACTIONS.STOP_RIDE_WEAPON : PLAYER_ACTIONS.STOP_RIDE;
    return weapons ? PLAYER_ACTIONS.RUN_RIDE_WEAPON : PLAYER_ACTIONS.RUN_RIDE;
  }

  // Wings own Fly outside SafeZone, except the two Cursed Temple player
  // subtypes. Atlans/Hellas/Doppelganger3 have the PC's swim family even
  // without wings: idle uses STOP_FLY, locomotion uses WALK/RUN_SWIM.
  if (!safeZone && !cursedTemplePlayer && hasWing) {
    if (state === 'idle') return bowType === 'crossbow' ? PLAYER_ACTIONS.STOP_FLY_CROSSBOW : PLAYER_ACTIONS.STOP_FLY;
    return bowType === 'crossbow' ? PLAYER_ACTIONS.FLY_CROSSBOW : PLAYER_ACTIONS.FLY;
  }
  if (!safeZone && inSwimWorld) {
    if (state === 'idle') return bowType === 'crossbow' ? PLAYER_ACTIONS.STOP_FLY_CROSSBOW : PLAYER_ACTIONS.STOP_FLY;
    return state === 'run' ? PLAYER_ACTIONS.RUN_SWIM : PLAYER_ACTIONS.WALK_SWIM;
  }

  // Main 5.2 deliberately ignores an equipped weapon in ordinary SafeZone,
  // but NOT inside Blood Castle. This distinction fixes the city stance while
  // preserving the authored Blood Castle weapon pose.
  if (!weapons || (safeZone && !inBloodCastle)) return fallback;

  if (bowType === 'bow') return state === 'idle' ? PLAYER_ACTIONS.STOP_BOW : state === 'run' ? PLAYER_ACTIONS.RUN_BOW : PLAYER_ACTIONS.WALK_BOW;
  if (bowType === 'crossbow') return state === 'idle' ? PLAYER_ACTIONS.STOP_CROSSBOW : state === 'run' ? PLAYER_ACTIONS.RUN_CROSSBOW : PLAYER_ACTIONS.WALK_CROSSBOW;

  const right = equipment?.weaponRightSpec;
  const left = equipment?.weaponLeftSpec;
  const cat = specCategory(right), idx = specIndex(right);
  const twoHand = right?.twoHand;

  if (cat >= 0 && cat <= 2) {
    const specialTwo = cat === 0 && [21, 23, 25, 31].includes(idx);
    if (twoHand == null) return fallback;
    if (specialTwo) {
      if (state === 'idle') return PLAYER_ACTIONS.STOP_TWO_HAND_SWORD_TWO;
      if (state === 'walk') return PLAYER_ACTIONS.WALK_TWO_HAND_SWORD_TWO;
      return PLAYER_ACTIONS.RUN_TWO_HAND_SWORD_TWO;
    }
    if (state === 'idle') return twoHand ? PLAYER_ACTIONS.STOP_TWO_HAND_SWORD : PLAYER_ACTIONS.STOP_SWORD;
    if (state === 'walk') return twoHand ? PLAYER_ACTIONS.WALK_TWO_HAND_SWORD : PLAYER_ACTIONS.WALK_SWORD;
    const leftCat = specCategory(left);
    if (leftCat >= 0 && leftCat <= 2 && baseClass !== CLASS.RAGEFIGHTER) return PLAYER_ACTIONS.RUN_TWO_SWORD;
    return twoHand ? PLAYER_ACTIONS.RUN_TWO_HAND_SWORD : PLAYER_ACTIONS.RUN_SWORD;
  }

  if (cat === 3) {
    if (state === 'run') return PLAYER_ACTIONS.RUN_SPEAR;
    if (idx === 1 || idx === 2) return state === 'idle' ? PLAYER_ACTIONS.STOP_SPEAR : PLAYER_ACTIONS.WALK_SPEAR;
    if (twoHand == null) return fallback;
    return state === 'idle'
      ? (twoHand ? PLAYER_ACTIONS.STOP_SCYTHE : PLAYER_ACTIONS.STOP_SWORD)
      : (twoHand ? PLAYER_ACTIONS.WALK_SCYTHE : PLAYER_ACTIONS.WALK_SWORD);
  }

  if (cat === 5) {
    if (idx >= 14 && idx <= 20) return state === 'idle' ? PLAYER_ACTIONS.STOP_WAND : state === 'run' ? PLAYER_ACTIONS.RUN_WAND : PLAYER_ACTIONS.WALK_WAND;
    if (twoHand == null) return fallback;
    if (state === 'idle') return twoHand ? PLAYER_ACTIONS.STOP_SCYTHE : PLAYER_ACTIONS.STOP_SWORD;
    if (state === 'run') return twoHand ? PLAYER_ACTIONS.RUN_SPEAR : PLAYER_ACTIONS.RUN_SWORD;
    return twoHand ? PLAYER_ACTIONS.WALK_SCYTHE : PLAYER_ACTIONS.WALK_SWORD;
  }

  return fallback;
}

export function buildAnimationControl(renderer, classId, equipment = null, context = null) {
  return {
    _current: null,
    _action: null,
    play(name) {
      if (!['idle', 'walk', 'run'].includes(name)) return;
      const safeZone = Boolean(typeof context?.safeZone === 'function' ? context.safeZone() : context?.safeZone);
      try { context?.onSafeZoneChange?.(safeZone); } catch (_) { /* presentation adapter fail-closed */ }
      const actionIndex = worldActionFor(name, classId, equipment, { ...(context || {}), safeZone });
      const target = `action_${actionIndex}`;
      // If a family-specific clip is absent, fail closed to the old generic
      // class state rather than killing animation playback.
      let chosen = target;
      if (!renderer.mixer?.clips?.has(chosen)) {
        const fallbackIndex = name === 'idle' ? idleActionFor(classId)
          : (name === 'run' ? PLAYER_ACTIONS.RUN : (isFemaleClass(classId) ? PLAYER_ACTIONS.WALK_FEMALE : PLAYER_ACTIONS.WALK_MALE));
        chosen = `action_${fallbackIndex}`;
      }
      // R78 physical animation recovery: `_current/_action` are only the
      // locomotion controller's logical cache. Skills/server actions can call
      // renderer.playAction() directly and replace currentAction; a one-shot can
      // also finish/clamp while the logical cache still says e.g. `idle`. The old
      // early-return then never reasserted locomotion and the hero stayed frozen.
      const live = renderer.currentAction;
      const liveClip = live?.clip?.name || null;
      const liveMatches = liveClip === chosen && live?.enabled !== false && live?._finished !== true;
      if (name === this._current && chosen === this._action && liveMatches) return;
      renderer.playSpeed = playerActionPlaySpeed(name, classId, Number(chosen.slice(7)));
      // PC SetAction resets AnimationFrame to 0 and BMD::Animation blends from
      // PriorAction only until the first authored animation key is crossed.
      // At walk/run speeds (~0.33/0.34) this is ~0.12s, not the Web default
      // 0.30s. The long cross-fade made legs/shoulders look dragged backward.
      const sourceBlendSeconds = Math.max(0.04, Math.min(0.14,
        1 / (Math.max(0.01, Number(renderer.playSpeed) || 0.33) * 25)));
      const action = renderer.playAction(chosen, sourceBlendSeconds);
      if (action) { this._current = name; this._action = chosen; }
    },
  };
}
