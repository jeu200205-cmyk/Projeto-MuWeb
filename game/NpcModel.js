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
  if (rule.playerBody) throw new Error(`NPC ${npcType} usa MODEL_PLAYER no PC; recipe de equipamento ainda não materializada — fail-closed`);
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
