/**
 * NpcModel.js — R80 PC-authored NPC BMD presentation.
 * Authority: source PC Main 5.2 supplied by the user + its audited Android port.
 * No Monster01 / Player.bmd cosmetic fallback is allowed.
 */
import * as THREE from 'three';
import { MUModelRenderer } from '../assets/MUModelRenderer.js';
import { MUAssets } from '../assets/MUAssetLoader.js';
import { applyMuUpAxis, extractPartMeshes } from '../graphics/BmdAdapter.js';
import { parseBMD } from '../graphics/BmdParser.js';
import { getPcNpcVisualRule } from './ViewportActorSemantics.js';
import { composeCharacter, buildEquipmentAttach, mergeEquipmentBodyRenderData, buildLinkedWeaponRenderer, buildAnimationControl, getPcTextureSkinIndex, pcCharacterScale, applyBodyEquipmentPresentation } from '../graphics/PlayerComposer.js';
import { serverClassToClientClass } from '../data/CharacterClassMap.js';

const NPC_IDLE_SPEED = 0.25;

async function loadRenderer(rel) {
  const bmd = await MUAssets.loadBMD(rel);
  const renderer = new MUModelRenderer();
  await renderer.initFromBMD(bmd);
  return renderer;
}

function relDir(rel) {
  const p = String(rel || '').replace(/\\/g, '/');
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(0, i) : 'Npc';
}


function encodeGuardCharset(rule) {
  const cs = new Uint8Array(18);
  cs.fill(0);
  cs[0] = Number(rule.classByte ?? 0x00) & 0xff;
  const e = cs.subarray(1);
  const noWeapon = 0x0fff;
  const wr = Number.isInteger(rule.weaponRightExtType) ? rule.weaponRightExtType : noWeapon;
  const wl = Number.isInteger(rule.weaponLeftExtType) ? rule.weaponLeftExtType : noWeapon;
  e[0] = wr & 0xff;
  e[1] = wl & 0xff;
  e[11] = ((wr >> 8) & 0x0f) << 4;
  e[12] = ((wl >> 8) & 0x0f) << 4;

  // Exact inverse of CharacterEquipmentCodec's 9-bit body fields.
  const off = Number(rule.bodyOffset ?? 9) & 0x1ff;
  const low = off & 0x0f, bit16 = (off >> 4) & 1, hi32 = (off >> 5) & 0x0f;
  e[2] = (low << 4) | low;
  e[3] = (low << 4) | low;
  e[4] = low << 4;
  if (bit16) e[8] |= 0xf8; // helm/armor/pants/gloves/boots +16 bits (7..3)
  e[12] |= hi32;          // helm +32*n
  e[13] |= (hi32 << 4) | hi32; // armor/pants
  e[14] |= (hi32 << 4) | hi32; // gloves/boots

  // No stock wing/helper unless the exact recipe says otherwise.
  // wingType=3 + ext=0 => null; helperType=3 + e9.bit0=0 => null.
  e[4] |= 0x0f;
  if (Number.isInteger(rule.wingOffset)) {
    const wing = rule.wingOffset;
    if (wing >= 3 && wing <= 9) {
      e[4] = (e[4] & ~0x0c) | 0x0c;
      e[8] = (e[8] & ~0x07) | ((wing - 2) & 0x07);
    }
  }

  const levelValue = Number(rule.bodyLevel ?? 0);
  const levelCode = new Map([[0,0],[3,1],[5,2],[7,3],[9,4],[11,5],[13,6],[15,7]]).get(levelValue) ?? 0;
  let levelBits = 0;
  for (const shift of [6,9,12,15,18]) levelBits |= levelCode << shift;
  e[5] = (levelBits >> 16) & 0xff;
  e[6] = (levelBits >> 8) & 0xff;
  e[7] = levelBits & 0xff;
  return Array.from(cs);
}

async function loadPlayerNpcVisual(rule) {
  const classId = serverClassToClientClass(rule.classByte ?? 0x00);
  const io = {
    loadBMD: (rel) => MUAssets.loadBMD(rel),
    fetchBinary: (rel) => MUAssets.remoteAssets.fetchBinary(rel),
    assetAuthority: MUAssets.remoteAssets?.authorityKey || MUAssets.remoteAssets?.baseUrl || '',
  };
  const composed = await composeCharacter(classId, io);
  const charset = encodeGuardCharset(rule);
  const attach = await buildEquipmentAttach(charset, io, composed.renderData.bones, composed.renderData.bones.length);
  let finalData = mergeEquipmentBodyRenderData(composed.renderData, attach);
  const renderer = new MUModelRenderer({ skinIndex: getPcTextureSkinIndex(classId) });
  await renderer.initFromBMD(finalData);
  await applyBodyEquipmentPresentation(renderer, attach);
  const root = new THREE.Group();
  const fix = new THREE.Group();
  applyMuUpAxis(fix);
  root.add(fix);
  fix.add(renderer.group);
  root.scale.setScalar(pcCharacterScale(classId, { characterScene:false, skin:0 }));

  const extras = [];
  const linked = [];
  for (const spec of [attach.weaponRightSpec, attach.weaponLeftSpec]) {
    if (!spec) continue;
    const wr = await buildLinkedWeaponRenderer({ scene:null, camera:null }, spec);
    const bone = renderer.bones?.[spec.linkBone];
    if (!wr || !bone) { wr?.dispose?.(); throw new Error(`NPC MODEL_PLAYER weapon bone ${spec.linkBone} inexistente`); }
    bone.add(wr.group);
    extras.push(wr); linked.push({wr,spec});
  }
  const anim = buildAnimationControl(renderer, classId, attach, { safeZone:()=>false });
  let currentState = '';
  const visual = {
    root, bmdPath:'Player/Player.bmd', renderer, renderers:[{renderer,path:'Player/Player.bmd'}], extras,
    setBodyLight(color) { renderer.setBodyLight?.(color); for (const wr of extras) wr.setBodyLight?.(color); },
    setAction(idx) { const a=renderer.playAction('action_'+idx); if (a) a.timeScale=NPC_IDLE_SPEED; },
    setActionFor(state) { currentState=state; anim?.play?.(state === 'walk' ? 'walk' : 'idle'); },
    update(dt, elapsed=0) { renderer.update(dt, elapsed); for (const wr of extras) wr.update?.(dt, elapsed); },
    dispose() { renderer.dispose?.(); for (const wr of extras) wr.dispose?.(); },
  };
  visual.setActionFor('idle');
  return visual;
}

/**
 * PC merchant NPCs such as Female01/Girl01/Man01 use a MODEL skeleton plus
 * separate authored body-part BMDs. Rendering the base BMD by itself is wrong:
 * some bases intentionally have zero meshes, and each part's raw Vertex::Node
 * indices target the base skeleton. This mirrors the already-proven Player
 * composition lane: keep the base bones/actions and remap part meshes onto it.
 */
async function loadCompositeNpcRenderer(rule) {
  const base = await MUAssets.loadBMD(rule.base);
  const baseMeshes = Array.isArray(base?.meshes) ? [...base.meshes] : [];
  const textures = Array.isArray(base?.textures) ? [...base.textures] : [];
  const bones = Array.isArray(base?.bones) ? base.bones : [];

  for (let i = 0; i < (rule.parts || []).length; i++) {
    const rel = rule.parts[i];
    const buf = await MUAssets.remoteAssets.fetchBinary(rel);
    if (!buf) throw new Error(`Failed to fetch BMD: ${rel}`);
    const raw = parseBMD(buf instanceof Uint8Array ? buf : new Uint8Array(buf));
    const partMeshes = extractPartMeshes(raw, `npcPart${i}`, bones.length, bones);
    for (const mesh of partMeshes) {
      baseMeshes.push(mesh);
      textures.push({ FileName: mesh.texFileName, Dir: relDir(rel) });
    }
  }

  if (!baseMeshes.length) throw new Error(`NPC composto sem meshes: ${rule.base}`);
  const renderer = new MUModelRenderer();
  await renderer.initFromBMD({ ...base, meshes: baseMeshes, textures, source: `npc:${rule.base}+${(rule.parts || []).join('+')}` });
  return renderer;
}

export async function createNpcVisual(npcType, customRule = null) {
  const rule = customRule ? { base: customRule.path, parts: [], custom:true } : getPcNpcVisualRule(npcType);
  if (!rule) throw new Error(`NPC ${npcType} sem regra visual PC materializada — fail-closed`);
  if (rule.playerBody) return loadPlayerNpcVisual(rule);
  if (!rule.base) throw new Error(`NPC ${npcType} sem BMD base PC — fail-closed`);

  const renderers = [];
  const root = new THREE.Group();
  const fix = new THREE.Group();
  applyMuUpAxis(fix);
  root.add(fix);
  if (Number.isFinite(customRule?.size)) root.scale.setScalar(customRule.size);

  const baseRenderer = (rule.parts || []).length
    ? await loadCompositeNpcRenderer(rule)
    : await loadRenderer(rule.base);
  renderers.push({ renderer: baseRenderer, path: rule.base });
  fix.add(baseRenderer.group);

  let currentAction = -1;
  const visual = {
    root,
    bmdPath: rule.base,
    renderers,
    setBodyLight(color) { for (const { renderer } of renderers) renderer.setBodyLight?.(color); },
    setAction(idx) {
      if (idx === currentAction) return;
      currentAction = idx;
      for (const { renderer } of renderers) {
        const action = renderer.playAction('action_' + idx);
        if (action) action.timeScale = NPC_IDLE_SPEED;
      }
    },
    setActionFor(state) {
      // Server-driven NPC viewport is presentation-only here. Movement/action
      // packets may override later; idle=action_0 matches the authored BMD lane.
      return visual.setAction(state === 'walk' ? 2 : 0);
    },
    update(dt, elapsed = 0) {
      for (const { renderer } of renderers) renderer.update(dt, elapsed);
    },
  };
  visual.setAction(0);
  return visual;
}
