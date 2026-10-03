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
import { parseBMD, angleQuaternion } from './BmdParser.js';
import { extractPartMeshes, extractRigidAttachment, buildBindWorldTransforms } from './BmdAdapter.js';
import { decodeCharacterEquipment } from '../data/CharacterEquipmentCodec.js';
import { resolveCharacterModels } from '../data/ItemModelResolver.js';
import { itemAttributeFor } from '../data/ItemAttributeData.js';
import { applyPcStockItemPresentation } from './ItemMaterialPresentation.js';

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
    if (key === 'WING:40') return { bone: 19, offset: [0, 0, 15], rotYDeg: 0, playSpeed: 0.25 };
    if (key === 'HELPER:30') return { bone: 47, offset: [0, 0, 15], rotYDeg: 0, playSpeed: 0.25 };
    if (key === 'HELPER:1') return { bone: 34, offset: [20, 0, 0], rotYDeg: 0, playSpeed: 0.5 };
    return { bone: 47, offset: [0, 0, 15], rotYDeg: 0, playSpeed: 0.25 };
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
let _characterCacheEpoch = 0;

export async function buildEquipmentAttach(charset, io, playerBones, playerBoneCount) {
    const bind = buildBindWorldTransforms(playerBones || []);
    const bindSignature = JSON.stringify(bind.map(t => [...t.r,...t.p]));
    const equipCacheKey = Array.isArray(charset) ? `${charset.join(',')}|bones=${playerBoneCount}|bind=${bindSignature}` : 'empty';
    const epoch = _characterCacheEpoch;
    if (_equipmentAttachCache.has(equipCacheKey)) return _equipmentAttachCache.get(equipCacheKey);
    if (_equipmentAttachInflight.has(equipCacheKey)) return _equipmentAttachInflight.get(equipCacheKey);
    const equipmentJob = (async () => {

    const out = { meshes: [], textures: [], bodyMeshes: [], bodyTextures: [], bodySpecs: {}, replacedBodyKeys: [], bodyMissing: [], wing: null, helper: null, darkSpirit: null, fenrir: null, rider: null, helperKind: null, missing: [], weaponRightSpec: null, weaponLeftSpec: null, weaponRenderMode: 'render-link-object' };
    if (!charset || !Array.isArray(charset) || charset.length < 18) return out;

    let decoded;
    try { decoded = decodeCharacterEquipment(charset); }
    catch (e) { out.missing.push(`charset-decode: ${e.message}`); return out; }

    const resolved = resolveCharacterModels(decoded);
    for (const m of resolved.missing) out.missing.push(m);
    for (const m of resolved.bodyMissing || []) out.bodyMissing.push(m);

    const buildItem = async (entry, sideOrKind) => {
        if (!entry || !entry.path) return;
        try {
            const buf = await io.fetchBinary(entry.path);
            if (!buf) { out.missing.push(`fetch-null: ${entry.path}`); return; }
            const model = parseBMD(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
            return { model, entry };
        } catch (e) {
            out.missing.push(`parse falhou ${entry.path}: ${e.message}`);
        }
    };

    // Weapons/shield — meshes skinned nos bones de mão do player
    for (const [entry, side, key] of [
        [resolved.weaponRight, 'right', 'weaponR'],
        [resolved.weaponLeft, 'left', 'weaponL'],
    ]) {
        const built = await buildItem(entry);
        if (!built) continue;
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
        if (side === 'right') out.weaponRightSpec = spec; else out.weaponLeftSpec = spec;
        // Compatibility data remains available for old audits, but production
        // R46 renders weapons through their OWN BMD hierarchy under LinkBone
        // (RenderLinkObject), not by remapping every item vertex onto Player.bmd.
        const linkBone = PLAYER_WEAPON_LINK_BONE[side];
        const meshes = extractRigidAttachment(built.model, key, linkBone, playerBones, playerBoneCount);
        for (const m of meshes) {
            out.meshes.push(m);
            out.textures.push({ FileName: m.texFileName, Dir: 'Item' });
        }
    }

    // Body equipment (helm/armor/pants/gloves/boots) uses the item's own
    // Player/*.bmd meshes skinned by the shared Player.bmd skeleton. R48 still
    // kept the class base pieces even when CharSet carried real equipped armor,
    // which made sets/textures/glow visibly wrong. Replace only the authored
    // body family that has a real model; missing/custom entries remain fail-closed.
    const bodyKeyInfo = {
        helm: ['helm', 'Player'], armor: ['armor', 'Player'], pants: ['pant', 'Player'],
        gloves: ['glove', 'Player'], boots: ['boot', 'Player'],
    };
    for (const key of Object.keys(bodyKeyInfo)) {
        const src = decoded.body?.[key];
        const entry = resolved.body?.[key];
        if (!src || src.baseSkin || !entry?.path) continue;
        const built = await buildItem(entry);
        if (!built) { out.bodyMissing.push(`body-load-failed: ${key}:${entry.path}`); continue; }
        const [meshKey, fallbackDir] = bodyKeyInfo[key];
        const dir = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : fallbackDir;
        const partMeshes = extractPartMeshes(built.model, meshKey, playerBoneCount, playerBones);
        if (!partMeshes.length) { out.bodyMissing.push(`body-empty: ${key}:${entry.path}`); continue; }
        for (const m of partMeshes) {
            out.bodyMeshes.push(m);
            out.bodyTextures.push({ FileName: m.texFileName, Dir: dir });
        }
        out.replacedBodyKeys.push(meshKey);
        out.bodySpecs[meshKey] = {
            path: entry.path,
            extType: entry.itemType,
            bodyOffset: src.extType,
            rawLevel: (src.level || 0) << 3,
            visualLevel: src.level || 0,
            option1: src.option1 || 0,
            extOption: src.extOption || 0,
            customColor: entry.color || null, effectType: entry.effectType || 0,
        };
    }

    // Wing/helper — renderData próprio (skeleton/actions próprios) + regra de
    // attach PC (bone alvo/offset/rotação — accessoryAttachRule)
    if (resolved.wing?.path) {
        const built = await buildItem(resolved.wing);
        if (built) out.wing = {
            path: resolved.wing.path, bufModel: built.model, viaCacheKey: resolved.wing.key,
            attach: accessoryAttachRule(resolved.wing), extType: resolved.wing.itemType,
            customColor: resolved.wing.color || null, effectType: resolved.wing.effectType || 0,
        };
    }
    if (resolved.helper?.path) {
        if (resolved.helper.kind === 'dark-spirit') {
            // R24: junction finalmente fechado. No PC o scepter DL (STAFF+5)
            // é engolido por ChangeCharacterExt e vira CreatePetDarkSpirit;
            // o companion usa MODEL_DARK_SPIRIT / Skill/darkspirit.bmd no
            // CSPetSystem, nunca um item rígido anexado ao bone da mão.
            out.darkSpirit = {
                kind: 'dark-spirit',
                petModelPath: 'Skill/darkspirit.bmd',
                viaCacheKey: resolved.helper.key || 'HELPER:5',
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
            } else if (resolved.helper.kind === 'unicon' || resolved.helper.kind === 'pegasus') {
                out.rider = {
                    species: resolved.helper.kind,
                    petModelPath: resolved.helper.kind === 'pegasus' ? 'Skill/Rider02.bmd' : 'Skill/Rider01.bmd',
                };
            } else if (resolved.helper.kind === 'dark-horse') {
                out.rider = { species: 'dark-horse', petModelPath: 'Skill/DarkHorse.bmd' };
            } else {
                out.missing.push(`${resolved.helper.kind || 'helper'} (${resolved.helper.key}): lane PetSystem pendente (CreateBug)`);
            }
        } else {
            // Apenas o IMP tem attach bone-parented real (PC L15287-15311).
            const built = await buildItem(resolved.helper);
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
export async function applyBodyEquipmentPresentation(renderer, attach) {
    if (!renderer || !attach?.bodySpecs) return 0;
    let passes = 0;
    for (const [meshKey, spec] of Object.entries(attach.bodySpecs)) {
        passes += await applyPcStockItemPresentation(renderer, {
            type: spec.extType, rawLevel: spec.rawLevel, option1: spec.option1,
            extOption: spec.extOption, customColor: spec.customColor || null,
            effectType: spec.effectType || 0,
            meshFilter: (mesh) => String(mesh?.name || '').startsWith(`${meshKey}_`),
        });
    }
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
export async function buildLinkedWeaponRenderer({ scene, camera }, spec) {
    if (!spec?.model || !Number.isInteger(spec?.linkBone)) return null;
    const { MUModelRenderer } = await import('../assets/MUModelRenderer.js');
    const { bmdToRenderData } = await import('./BmdAdapter.js');
    const wr = new MUModelRenderer({ scene, camera });
    try {
    await wr.initFromBMD(bmdToRenderData(spec.model, spec.path));
    const action = wr.mixer?.clips?.has?.('action_0') ? wr.playAction('action_0', 0) : null;
    if (action) action.time = 0;
    await applyPcStockItemPresentation(wr, {
        type: spec.extType, rawLevel: spec.rawLevel || 0,
        option1: spec.option1 || 0, extOption: spec.extOption || 0,
        customColor: spec.customColor || null, effectType: spec.effectType || 0,
    });
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
    // Wings/rigid helpers are items too. R53 applied RenderModel/+level/etc to
    // body and held weapons but skipped these separate BMD renderers, making
    // equipped character visuals diverge from inventory/current-client rules.
    if (Number.isInteger(spec.extType)) {
        await applyPcStockItemPresentation(wr, {
            type: spec.extType, customColor: spec.customColor || null,
            effectType: spec.effectType || 0,
        });
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
}

export async function composeCharacter(classId, io) {
  const epoch = _characterCacheEpoch;
  const cacheKey = Number(classId) & 0xff;
  if (_composedCharacterCache.has(cacheKey)) return _composedCharacterCache.get(cacheKey);
  if (_composedCharacterInflight.has(cacheKey)) return _composedCharacterInflight.get(cacheKey);
  const job = (async () => {
  const { loadBMD, fetchBinary } = io;

  // Esqueleto-mestre + 284 ações (Player.bmd — 0 meshes, ZzzOpenData.cpp:119)
  const player = await loadBMD('Player/Player.bmd');
  const playerBoneCount = player.bones.length;

  const skinIndex = getSkinModelIndex(classId);
  const prefixes = ['Helm', 'Armor', 'Pant', 'Glove', 'Boot'];
  const meshes = [];
  const textures = [];
  const usedParts = [];
  const missingParts = [];
  const emptyParts = [];

  for (const prefix of prefixes) {
    const file = partFileName(prefix, skinIndex);
    try {
      // Parse PURO da peça (extractPartMeshes trabalha sobre o parse bruto;
      // o skin remapeia Node → índice no esqueleto do Player)
      const buf = await fetchBinary(file);
      if (!buf) { missingParts.push(file); continue; }
      const partModel = parseBMD(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
      const partMeshes = extractPartMeshes(partModel, prefix.toLowerCase(), playerBoneCount, player.bones);
      if (!partMeshes.length) { emptyParts.push(file); usedParts.push(prefix); continue; }
      for (const m of partMeshes) {
        meshes.push(m);
        textures.push({ FileName: m.texFileName, Dir: 'Player' });
      }
      usedParts.push(prefix);
    } catch (e) {
      missingParts.push(file);
      // Peça ausente para a classe (ex.: sem Helm tier) — composição parcial
      // real, nunca placeholder geométrico.
      console.warn(`[PlayerComposer] peça ausente ${file}: ${e.message}`);
    }
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
  // CCharacterManager::GetEquipedBowType, standard-item branch.
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
