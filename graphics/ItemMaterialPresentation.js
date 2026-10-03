/**
 * ItemMaterialPresentation.js — stock Main 5.2 item material owner.
 *
 * Evidence retained from ZzzObject.cpp::RenderPartObjectEffect and the Android
 * parity renderer:
 *  - groups 0..11 use the +level Chrome/Metal ladder;
 *  - Excellent is ONE moving TEXTURE|BRIGHT pass when (Option1 & 63) != 0;
 *  - Ancient/Set is CHROME3|BRIGHT and is mutually exclusive with Excellent;
 *  - BRIGHT is fixed-function ONE/ONE, never browser alpha glow.
 *
 * Custom RenderModel.lua / CharacterEffectItens.lua ownership is a separate
 * registry. This module deliberately does not invent those rules.
 */
import * as THREE from 'three';
import { RenderFlags } from '../assets/MUModelRenderer.js';
import { MUAssets } from '../assets/MUAssetLoader.js';
import { nativeRenderModelRange, nativeRenderModelPass, nativeRenderTextureOverride, RENDER_MODEL_ORACLE_COUNTS } from '../data/RenderModelNativeOracle.js';
import { pcBitmapTexture, pcBitmapOwner } from '../data/PcBitmapLuaOwners.js';
import { isExcellentDisabledForItemType } from '../data/DisableExcellentLua.js';
import { itemTransparencyForType } from '../data/ItemTransparencyLua.js';

const MAX_ITEM_INDEX = 512;
const _specialTexturePromises = new Map();



/**
 * Execute the retained current-client CharacterSystem/RenderModel.lua DATA.
 *
 * The source oracle contains the exact ordered mesh/mode/light program for
 * 1,853 items. Web implements the representable subset without inventing any
 * bitmap mapping: explicit numeric overrides resolve only through the
 * current Data Lua startup bitmap owner; unknown IDs remain unavailable. R51 also executes the
 * retained chrome+UV-scroll combination through a dedicated shader uvOffset;
 * the vast majority of additive/chrome/metal passes are reproduced exactly by
 * mesh index, color, pulse and authored U-scroll law.
 */
export async function applyPcNativeRenderModelPresentation(renderer, {
  type, dynamic = true, meshFilter = null,
} = {}) {
  if (!renderer || !Number.isInteger(type)) return { owned:false, colorOwned:false, added:0, skipped:0 };
  const range = nativeRenderModelRange(type);
  if (!range?.count) return { owned:false, colorOwned:false, added:0, skipped:0 };

  const filterBase = typeof meshFilter === 'function' ? meshFilter : (() => true);
  const meshAt = (index) => (renderer.meshes || []).filter((mesh) =>
    filterBase(mesh) && Number(mesh?.userData?.muMeshIndex) === index);
  const authoredColor = (pass, timeMs = performance.now()) => {
    let scale = 1;
    // Android/PC generated oracle: flags&2 == GetDoubleRender pulse.
    if ((pass.flags & 2) !== 0) scale = 0.35 + 0.65 * Math.abs(Math.sin(Number(timeMs) * 0.002));
    return new THREE.Color((pass.red / 255) * scale, (pass.green / 255) * scale, (pass.blue / 255) * scale);
  };

  const firstPassOrder = renderer._overlayMeshes?.length || 0;
  const pendingBitmaps = [], pendingBitmapPaths = [];
  let added=0, skipped=0;
  for (let rel=0; rel<range.count; rel++) {
    const pass = nativeRenderModelPass(range.first + rel);
    if (!pass) { skipped++; continue; }
    // The retained oracle has only 16 mode bits. A zero row needs the
    // original Lua flag: it may be a truncated high flag, or a real zero
    // inheriting prior GL state. Never invent an independent opaque draw.
    if (pass.mode === 0) { skipped++; continue; }
    const bitmap = nativeRenderTextureOverride(type, rel);
    // Exact numeric bitmap->asset path table is a different PC owner. Never
    // substitute a random texture.
    const explicitMap = bitmap != null ? await pcBitmapTexture(bitmap) : null;
    if (bitmap != null && !explicitMap) {
      pendingBitmaps.push(bitmap);
      const declared = pcBitmapOwner(bitmap);
      if (declared) pendingBitmapPaths.push(declared.physicalPath);
      skipped++; continue;
    }
    const scroll = (pass.flags & 4) !== 0;
    const chromeMask = RenderFlags.CHROME | RenderFlags.CHROME2 | RenderFlags.CHROME3 | RenderFlags.CHROME4 | RenderFlags.CHROME5 | RenderFlags.CHROME6 | RenderFlags.CHROME7;
    const chromeScroll = scroll && (pass.mode & RenderFlags.COLOR) === 0 && (pass.mode & chromeMask) !== 0;
    // The retained native owner defines UV scroll as U += ticks*(0.1/150).
    // Plain TEXTURE|BRIGHT uses a private texture clone; chrome+scroll uses
    // the renderer shader uvOffset. Other scroll combinations remain pending.
    if (scroll && pass.mode !== (RenderFlags.TEXTURE | RenderFlags.BRIGHT) && !chromeScroll) { skipped++; continue; }
    const targets = meshAt(pass.mesh);
    if (!targets.length) { skipped++; continue; }

    // Every authored call gets its own ordered draw, including opaque TEXTURE,
    // COLOR, DARK and LIGHTMAP. A separate implicit base draw
    // would brighten chrome-only meshes and reorder opaque calls after effects.
    // RenderMesh selects these bitmap owners when no explicit bitmap was
    // supplied. Sampling the item's diffuse atlas here gives colored patches
    // instead of the authored Chrome/Shiny pass.
    const implicitKind = explicitMap || (pass.mode & RenderFlags.COLOR) ? null : pcImplicitMaterialTextureKind(pass.mode);
    const implicitMap = implicitKind ? await pcMaterialTexture(implicitKind) : null;
    if (implicitKind && !implicitMap) { skipped++; continue; }
    let scrollMap = null;
    if (scroll && !chromeScroll) {
      const original = explicitMap || targets[0]?.userData?.originalMap || targets[0]?.material?.map || null;
      if (!original?.isTexture) { skipped++; continue; }
      scrollMap = original.clone();
      scrollMap.wrapS = explicitMap ? original.wrapS : THREE.RepeatWrapping;
      scrollMap.wrapT = original.wrapT;
      scrollMap.needsUpdate = true;
      renderer.userData ??= {};
      (renderer.userData.muOwnedPresentationTextures ??= []).push(scrollMap);
    }
    const overlay = renderer.createOverlayPass?.(pass.mode, {
      color: authoredColor(pass, performance.now()),
      alpha: 1,
      passOrder: firstPassOrder + rel + 1,
      map: scrollMap || explicitMap || implicitMap,
      meshFilter: (mesh) => filterBase(mesh) && Number(mesh?.userData?.muMeshIndex) === pass.mesh,
    });
    if (!overlay) { scrollMap?.dispose?.(); skipped++; continue; }
    added++;
    if (dynamic && typeof renderer.addPresentationUpdate === 'function' && ((pass.flags & 2) !== 0 || scroll)) {
      renderer.addPresentationUpdate((timeMs) => {
        if ((pass.flags & 2) !== 0) overlay.setColor?.(authoredColor(pass, timeMs));
        const scrollU = Number(timeMs) * (0.1 / 150);
        if (scrollMap) scrollMap.offset.x = scrollU;
        // FIX2: all overlays use the PC shader. Texture.offset is not
        // automatically injected into a custom ShaderMaterial's UVs.
        if (scrollMap || chromeScroll) overlay.setUvOffset?.(scrollU, 0);
      });
    }
  }

  renderer.userData ??= {};
  // RenderPartObjectEffect returns immediately for a RenderModel owner. Only
  // take over the complete base graph when every requested source draw exists;
  // missing bitmap owners retain the previous partial recovery behavior.
  const complete = skipped === 0;
  if (complete && renderer.group?.isGroup && renderer.group.renderOrder === 0) {
    // Three sorts groupOrder before per-pass renderOrder. Give this program's
    // model a stable group so passes from different actors cannot interleave.
    renderer.group.renderOrder = renderer.group.id + 1;
  }
  if (complete) for (const mesh of renderer.meshes || []) {
    if (!filterBase(mesh)) continue;
    mesh.userData ??= {};
    mesh.userData.muRenderModelHidden = true;
    mesh.visible = false;
  }
  renderer.userData.muRenderModel = {
    itemType:type, count:range.count, colorOwned:range.colorOwned, applied:added, skipped, complete, pendingBitmaps:[...new Set(pendingBitmaps)], pendingBitmapPaths:[...new Set(pendingBitmapPaths)],
    oraclePrograms:RENDER_MODEL_ORACLE_COUNTS.programs,
  };
  (renderer.userData.muRenderModelPrograms ??= {})[type] = renderer.userData.muRenderModel;
  return { owned:true, colorOwned:range.colorOwned, added, skipped, complete };
}
export function pcIsStandardEquipment(type) {
  return Number.isInteger(type) && type >= 0 && Math.floor(type / MAX_ITEM_INDEX) <= 11;
}

/**
 * Main 5.2 ZzzObject.cpp::RenderPartObjectEffect pre-render level remap.
 * `rawLevel` is the legacy packed ItemLevel byte; returned value is the
 * presentation level used by mesh/chrome/bright branches (not gameplay level).
 */
export function pcRenderPartObjectLevel(type, rawLevel = 0) {
  let level = (Number(rawLevel) >> 3) & 0x0f;
  const group = Math.floor(Number(type) / MAX_ITEM_INDEX), index = Number(type) % MAX_ITEM_INDEX;

  // HELPER
  if (group === 13) {
    if (index === 3 || index === 10) level = 8;
    else if ([39,40,41,42,134].includes(index)) level = 13;
    else if ([30,50,52,53].includes(index)) level = 0;
  // WING
  } else if (group === 12) {
    if ([0,1,2,3,4,5,6,11,36,37,38,39,40,41,42,43,49,50,139,140,142,143].includes(index)) level = 0;
    else if ([7,12,13,14,16,17,18,19,44,45,46,47].includes(index)) level = 9;
    else if ([15,136,138,141].includes(index)) level = 8;
    else if (index === 137) level = 8;
  // POTION
  } else if (group === 14) {
    if ([13,14,16,31].includes(index)) level = 8;
    else if (index >= 17 && index <= 19) level = level <= 6 ? level * 2 : 13;
    else if (index === 20) level = 9;
    else if ([12,22,25,26].includes(index)) level = 8;
    else if ([41,42,43,44,64].includes(index)) level = 0;
    else if (index === 51) level = 13;
  // EVENT
  } else if (group === 15) {
    if (index === 0 || index === 1 || index === 9 || index === 15) level = 8;
    else if ([4,5,7,8,12,13,16].includes(index)) level = 0;
    else if (index === 6) level = level === 13 ? 13 : 9;
    else if (index === 10) level = (level - 8) * 2 + 1;
    else if (index === 11) level -= 1;
    else if (index === 14) level += 7;
  }

  // BOW+7/+15 remap is part of the same source switch.
  if (group === 4 && (index === 7 || index === 15)) level = level >= 1 ? level * 2 + 1 : 0;
  return level;
}

export function pcRenderedItemLevel(type, rawLevel = 0) {
  return pcRenderPartObjectLevel(type, rawLevel);
}

export function pcEquipmentBaseTint(type, rawLevel = 0, timeMs = performance.now()) {
  if (!pcIsStandardEquipment(type)) return new THREE.Color(1, 1, 1);
  const level = pcRenderedItemLevel(type, rawLevel);
  const lum = Math.sin(Number(timeMs) * 0.004) * 0.15 + 0.6;
  if (level >= 3 && level <= 4) return new THREE.Color(lum, lum * 0.6, lum * 0.6);
  if (level >= 5 && level <= 6) return new THREE.Color(lum * 0.5, lum * 0.7, lum);
  if (level >= 7 && level <= 8) return new THREE.Color(0.8, 0.8, 0.8);
  if (level >= 9) return new THREE.Color(0.9, 0.9, 0.9);
  return new THREE.Color(1, 1, 1);
}

export function pcExcellentTint(timeMs = performance.now()) {
  const l = Math.sin(Number(timeMs) * 0.002) * 0.5 + 0.5;
  return new THREE.Color(l, l * 0.3, 1 - l);
}

export function pcIsSetExtOption(extOption = 0) {
  const kind = Number(extOption) & 0x03;
  return kind === 1 || kind === 2;
}

export function pcSetTint(type) {
  const group = Math.floor(Number(type) / MAX_ITEM_INDEX), index = Number(type) % MAX_ITEM_INDEX;
  if (group >= 7 && group <= 11 && (index === 3 || index === 9 || index === 17)) {
    return new THREE.Color(1.0, 0.7, 0.2);
  }
  return new THREE.Color(0.1, 0.6, 1.0);
}

function materialTextureDescriptor(kind) {
  switch (kind) {
    case 'chrome': return ['Chrome01.OZJ', 'Effect'];
    case 'chrome2':
    case 'chrome3':
    case 'chrome4': return ['Chrome02.OZJ', 'Effect'];
    case 'chrome6': return ['Chrome06.OZJ', 'Effect'];
    case 'metal': return ['Shiny01.OZJ', 'Effect'];
    default: return null;
  }
}

export function pcImplicitMaterialTextureKind(flags) {
  if (flags & RenderFlags.CHROME2) return 'chrome2';
  if (flags & RenderFlags.CHROME3) return 'chrome3';
  if (flags & RenderFlags.CHROME4) return 'chrome4';
  if (flags & RenderFlags.CHROME6) return 'chrome6';
  if (flags & RenderFlags.CHROME) return 'chrome';
  if (flags & RenderFlags.METAL) return 'metal';
  // CHROME5/7 and OIL retain the bound mesh/explicit texture in RenderMesh.
  return null;
}

export async function pcMaterialTexture(kind) {
  if (_specialTexturePromises.has(kind)) return _specialTexturePromises.get(kind);
  const desc = materialTextureDescriptor(kind);
  if (!desc) return null;
  const p = MUAssets.loadModelTexture(desc[0], desc[1]).then(async (loaded) => {
    const tex = loaded?.isTexture ? loaded : loaded?.createThreeTexture?.(THREE, { pcBmd: true });
    if (tex?.userData?.muImageReadyPromise) await tex.userData.muImageReadyPromise;
    if (tex?.isTexture && !Number.isInteger(tex.channel)) tex.channel = 0;
    if (!tex?.isTexture || (!tex.image && tex.userData?.muImageReady !== true)) return null;
    // ZzzOpenData: Chrome01 LINEAR/REPEAT, Shiny01 LINEAR/CLAMP,
    // Chrome02/06 NEAREST/CLAMP. Keep each owner's sampler independent.
    const view = tex.clone();
    view.wrapS = view.wrapT = kind === 'chrome' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    view.minFilter = view.magFilter = kind === 'chrome' || kind === 'metal' ? THREE.LinearFilter : THREE.NearestFilter;
    view.generateMipmaps = false;
    view.userData = { ...tex.userData, muSharedAsset: true };
    view.needsUpdate = true;
    return view;
  }).catch(() => null);
  _specialTexturePromises.set(kind, p);
  p.then(tex => {
    if (!tex && _specialTexturePromises.get(kind) === p) _specialTexturePromises.delete(kind);
  });
  return p;
}

export function pcStockMaterialPassPlan(type, rawLevel = 0, option1 = 0, extOption = 0, customColor = null) {
  const passes = [];
  // Main 5.2 ItemManager::GetItemColor gives LoadItens.lua precedence for
  // custom models. An explicitly authored black color is meaningful: it
  // suppresses the generic +level chrome ladder instead of becoming white.
  const hasCustomColor = Array.isArray(customColor) && customColor.length >= 3;
  const customVisible = hasCustomColor && customColor.some((v) => Number(v) > 0.0001);
  if (pcIsStandardEquipment(type) && (!hasCustomColor || customVisible)) {
    const level = pcRenderedItemLevel(type, rawLevel);
    if (level >= 13) passes.push({ kind: 'chrome4', flags: RenderFlags.CHROME4 | RenderFlags.BRIGHT });
    else if (level >= 11) passes.push({ kind: 'chrome2', flags: RenderFlags.CHROME2 | RenderFlags.BRIGHT });
    if (level >= 9) passes.push({ kind: 'metal', flags: RenderFlags.METAL | RenderFlags.BRIGHT });
    if (level >= 7) passes.push({ kind: 'chrome', flags: RenderFlags.CHROME | RenderFlags.BRIGHT });
  }
  // Current client DisableExcellent.cpp wraps BOTH Excellent and Ancient/Set
  // tails in the same veto. Registry is populated only from the real Lua owner;
  // absent/unreadable owner therefore leaves stock Main 5.2 behavior unchanged.
  const visualTailDisabled = isExcellentDisabledForItemType(type);
  const excellent = (Number(option1) & 0x3f) !== 0;
  if (!visualTailDisabled && excellent) passes.push({ kind: 'excellent', flags: RenderFlags.TEXTURE | RenderFlags.BRIGHT });
  else if (!visualTailDisabled && pcIsSetExtOption(extOption)) passes.push({ kind: 'chrome3', flags: RenderFlags.CHROME3 | RenderFlags.BRIGHT });
  return passes;
}

/** Apply only stock Main 5.2 material ownership. Returns overlay count. */

function _meshIndexFilter(baseFilter, index) {
  return (mesh) => (typeof baseFilter !== 'function' || baseFilter(mesh)) && Number(mesh?.userData?.muMeshIndex) === index;
}
function _setMeshBaseColor(renderer, filter, color) {
  for (const mesh of renderer.meshes || []) {
    if (!filter(mesh)) continue;
    mesh.userData ??= {};
    mesh.userData.muAuthoredBaseColor = color.clone();
    if (mesh.material?.color) mesh.material.color.copy(color);
    if (mesh.material?.uniforms?.diffuse?.value?.copy) mesh.material.uniforms.diffuse.value.copy(color);
  }
}
function _setMeshVisible(renderer, filter, visible) {
  for (const mesh of renderer.meshes || []) if (filter(mesh)) mesh.visible = visible;
}

/**
 * ZzzObject.cpp::RenderPartObjectEffect fixed-function branches that are fully
 * representable by the current Web renderer (mesh visibility/tint and solid
 * TEXTURE/BRIGHT/CHROME/METAL passes). Bone sprites/joints are intentionally
 * not approximated here; those remain EffectManager owners.
 */
export async function applyPcRenderPartObjectSolidPresentation(renderer, {
  type, rawLevel = 0, dynamic = true, meshFilter = null, phase = 'exclusive',
} = {}) {
  if (!renderer || !Number.isInteger(type)) return {handled:false,exclusive:false,added:0};
  const group=Math.floor(type/512), index=type%512;
  const level=pcRenderPartObjectLevel(type, rawLevel);
  const all=(m)=>typeof meshFilter !== 'function' || meshFilter(m);
  const mi=(n)=>_meshIndexFilter(meshFilter,n);
  let added=0;
  const overlay=(flags,opt={})=>{
    const o=renderer.createOverlayPass?.(flags,opt);
    if(o) added++;
    return o;
  };
  const chrome=await pcMaterialTexture('chrome');
  const chrome2=await pcMaterialTexture('chrome2');
  const metal=await pcMaterialTexture('metal');

  if (phase === 'exclusive') {
    // MODEL_POTION+27: authored mesh-count by level plus chrome on the added gems.
    if (group===14 && index===27) {
      _setMeshVisible(renderer, all, false); _setMeshVisible(renderer, mi(0), true);
      if(level>=2) _setMeshVisible(renderer,mi(1),true);
      if(level>=3) _setMeshVisible(renderer,mi(2),true);
      if(level>=2) overlay(RenderFlags.CHROME|RenderFlags.BRIGHT,{map:chrome,color:new THREE.Color(.75,.65,.5),meshFilter:mi(1)});
      if(level>=3) overlay(RenderFlags.CHROME|RenderFlags.BRIGHT,{map:chrome,color:new THREE.Color(.75,.65,.5),meshFilter:mi(2)});
      return {handled:true,exclusive:true,added};
    }
    // MODEL_POTION+63: mesh1 is red texture plus red chrome, mesh0 remains white.
    if (group===14 && index===63) {
      _setMeshBaseColor(renderer,mi(0),new THREE.Color(1,1,1));
      _setMeshBaseColor(renderer,mi(1),new THREE.Color(1,0,0));
      overlay(RenderFlags.CHROME|RenderFlags.BRIGHT,{map:chrome,color:new THREE.Color(1,0,0),meshFilter:mi(1)});
      return {handled:true,exclusive:true,added};
    }
    // MODEL_POTION+52: normal body + half-alpha teal chrome on mesh0.
    if (group===14 && index===52) {
      overlay(RenderFlags.CHROME|RenderFlags.BRIGHT,{map:chrome,color:new THREE.Color(.1,.6,.4),alpha:.5,meshFilter:mi(0)});
      return {handled:true,exclusive:true,added};
    }
    // MODEL_EVENT+14 with rendered Level 9: cyan diffuse body + warm chrome.
    // ZzzObject.cpp::RenderPartObjectEffect exact solid branch.
    if (group===15 && index===14 && level===9) {
      _setMeshBaseColor(renderer, all, new THREE.Color(.3,.8,1));
      overlay(RenderFlags.CHROME|RenderFlags.BRIGHT,{map:chrome,color:new THREE.Color(1,.8,.3),meshFilter:all});
      return {handled:true,exclusive:true,added};
    }
    // MODEL_EVENT+11: ordinary texture plus half-alpha Chrome02/bright.
    if (group===15 && index===11) {
      _setMeshBaseColor(renderer, all, new THREE.Color(.9,.9,.9));
      overlay(RenderFlags.CHROME|RenderFlags.BRIGHT,{map:chrome2||chrome,color:new THREE.Color(.9,.9,.9),alpha:.5,meshFilter:all});
      return {handled:true,exclusive:true,added};
    }
    // MODEL_EVENT+5 reads the RAW item level bits in the source, not the
    // remapped render level. +14 and +15 own both chrome and metal bright passes.
    if (group===15 && index===5) {
      const itemLevel=(Number(rawLevel)>>3)&15;
      if (itemLevel===14 || itemLevel===15) {
        const base=itemLevel===14?new THREE.Color(.2,.3,.5):new THREE.Color(.5,.3,.2);
        const glow=itemLevel===14?new THREE.Color(.1,.3,1):new THREE.Color(1,.3,.1);
        _setMeshBaseColor(renderer,all,base);
        overlay(RenderFlags.CHROME|RenderFlags.BRIGHT,{map:chrome,color:glow,meshFilter:all});
        overlay(RenderFlags.METAL|RenderFlags.BRIGHT,{map:metal||chrome2||chrome,color:glow,meshFilter:all});
        return {handled:true,exclusive:true,added};
      }
    }
    // MODEL_EVENT+6 rendered Level 13: blue COLOR body + chrome bright.
    if (group===15 && index===6 && level===13) {
      _setMeshBaseColor(renderer,all,new THREE.Color(.4,.6,1));
      overlay(RenderFlags.CHROME|RenderFlags.BRIGHT,{map:chrome,color:new THREE.Color(.4,.6,1),meshFilter:all});
      return {handled:true,exclusive:true,added};
    }

    // Wings 21..24 / 35 / 48: two additive authored texture meshes cross-fade.
    if (group===12 && ((index>=21&&index<=24)||index===35||index===48)) {
      _setMeshVisible(renderer,all,false); [0,1,2].forEach(n=>_setMeshVisible(renderer,mi(n),true));
      const p=Math.sin(performance.now()*.001)*.5+.5;
      const a=overlay(RenderFlags.TEXTURE|RenderFlags.BRIGHT,{color:new THREE.Color(p,p,p),meshFilter:mi(1)});
      const b=overlay(RenderFlags.TEXTURE|RenderFlags.BRIGHT,{color:new THREE.Color(1-p,1-p,1-p),meshFilter:mi(2)});
      if(dynamic && renderer.addPresentationUpdate && (a||b)) renderer.addPresentationUpdate((t)=>{
        const q=Math.sin(Number(t)*.001)*.5+.5;
        a?.setColor?.(new THREE.Color(q,q,q)); b?.setColor?.(new THREE.Color(1-q,1-q,1-q));
      });
      return {handled:true,exclusive:true,added};
    }
    // MODEL_HELPER+31: body plus one bright texture pass; level1 is cyan.
    if (group===13 && index===31) {
      const c=level===1?new THREE.Color(.3,.8,1):new THREE.Color(1,1,1);
      overlay(RenderFlags.TEXTURE|RenderFlags.BRIGHT,{color:c,meshFilter:mi(0)});
      return {handled:true,exclusive:true,added};
    }
    // MODEL_HELPER+15: source replaces normal body by METAL then additive CHROME.
    if (group===13 && index===15) {
      const colors=[new THREE.Color(0,.5,1),new THREE.Color(1,.2,0),new THREE.Color(1,.8,0),new THREE.Color(.6,.8,.4)];
      const c=colors[level]||new THREE.Color(1,1,1);
      _setMeshVisible(renderer,all,false);
      const m=overlay(RenderFlags.METAL,{map:metal||chrome2,color:c,meshFilter:all});
      const ch=overlay(RenderFlags.CHROME|RenderFlags.BRIGHT,{map:chrome2||chrome,color:c,meshFilter:all});
      // Overlay meshes are independent draws; hiding source exactly avoids the
      // extra diffuse pass that produced white helpers in previous builds.
      return {handled:true,exclusive:true,added};
    }
    // MODEL_HELPER+18: TEXTURE|BRIGHT body with source sine light.
    if (group===13 && index===18) {
      _setMeshVisible(renderer,all,false);
      const lum=Math.sin(performance.now()*.002)*.3+.7;
      const o=overlay(RenderFlags.TEXTURE|RenderFlags.BRIGHT,{color:new THREE.Color(lum,lum,lum),meshFilter:all});
      if(dynamic&&o&&renderer.addPresentationUpdate) renderer.addPresentationUpdate((t)=>{
        const q=Math.sin(Number(t)*.002)*.3+.7;o.setColor?.(new THREE.Color(q,q,q));
      });
      return {handled:true,exclusive:true,added};
    }
  }

  if (phase === 'continuation') {
    // Spear+9 streams Chrome over the normal RenderPartObject tail.
    if(group===3&&index===9) {
      overlay(RenderFlags.CHROME,{map:chrome,color:new THREE.Color(.5,.5,1.5),meshFilter:all});
      return {handled:true,exclusive:false,added};
    }
    // Helper+17: moving chrome stream mesh0; body texture remains underneath.
    if(group===13&&index===17) {
      const o=overlay(RenderFlags.CHROME,{map:chrome,color:new THREE.Color(.9,.1,.1),meshFilter:mi(0)});
      if(dynamic&&o&&renderer.addPresentationUpdate) renderer.addPresentationUpdate((t)=>o.setUvOffset?.(0,-(Number(t)%2000)*.0005));
      return {handled:true,exclusive:false,added};
    }
    // Source HiddenMesh switches.
    if((group===14&&index===7)||(group===13&&index===7)) {
      _setMeshVisible(renderer,mi(level===0?1:0),false);
      return {handled:true,exclusive:false,added};
    }
    if(group===13&&index===11) {
      _setMeshVisible(renderer,mi(1),false);
      return {handled:true,exclusive:false,added};
    }
    // BlendMeshLight-only branches are represented as a matching additive
    // texture light pass so the original diffuse item is not recolored.
    let law=null;
    if(group===12&&index===5) law=(t)=>(Math.sin(t*.001)+1)/4;
    else if(group===12&&index===4) law=(t)=>Math.sin(t*.001)+1.1;
    else if((group===9&&index===24)||(group===7&&index===24)) law=(t)=>Math.sin(t*.001)*.4+.6;
    else if(group===5&&index===11) law=(t)=>Math.sin(t*.004)*.3+.7;
    else if(((group===7||group===10||group===11)&&index===19)) law=()=>1;
    if(law) {
      const q=Math.max(0,law(performance.now()));
      const o=overlay(RenderFlags.TEXTURE|RenderFlags.BRIGHT,{color:new THREE.Color(q,q,q),alpha:1,meshFilter:all});
      if(dynamic&&o&&renderer.addPresentationUpdate) renderer.addPresentationUpdate((t)=>{
        const v=Math.max(0,law(Number(t)));o.setColor?.(new THREE.Color(v,v,v));
      });
      return {handled:true,exclusive:false,added};
    }
  }
  return {handled:false,exclusive:false,added};
}

function applyPcItemTransparency(renderer, type, meshFilter = null) {
  const alpha=itemTransparencyForType(type);
  if (!Number.isFinite(alpha)) return null;
  const all=[...(renderer.meshes||[]),...(renderer._overlayMeshes||[])];
  for(const mesh of all){
    const isOverlay=String(mesh?.name||'').includes('__mu_overlay');
    if(!isOverlay&&typeof meshFilter==='function'&&!meshFilter(mesh))continue;
    const mat=mesh?.material;if(!mat)continue;
    mat.opacity=alpha;
    if(mat.uniforms?.opacity)mat.uniforms.opacity.value=alpha;
    // Base TEXTURE with Alpha<0.99 enters EnableAlphaTest in BMD::RenderMesh.
    // Overlay passes already own their additive/custom blend factors; changing
    // only opacity preserves those factors instead of flattening every glow.
    if(alpha<0.99 && !mesh.name?.includes('__mu_overlay')){
      mat.transparent=true;mat.blending=THREE.NormalBlending;mat.depthWrite=true;
      mat.alphaTest=Math.max(Number(mat.alphaTest)||0,0.25);
      if(mat.uniforms?.alphaCutoff)mat.uniforms.alphaCutoff.value=mat.alphaTest;
    }
    mat.needsUpdate=true;
  }
  renderer.userData ??= {}; renderer.userData.muItemTransparency=alpha;
  return alpha;
}

export async function applyPcStockItemPresentation(renderer, {
  type, rawLevel = 0, option1 = 0, extOption = 0, customColor = null, effectType = 0, dynamic = true, meshFilter = null,
} = {}) {
  if (!renderer || !Number.isInteger(type)) return 0;

  // Current-client CharacterSystem/RenderModel.lua is an OWNER, not an extra
  // layer on top of the stock +level/Excellent/Set tail. The retained PC/mobile
  // audit proved that stacking both paths was the direct cause of white/saturated
  // blinking items. Any authored RenderModel program suppresses the generic tail
  // for that item, even when colorOwned=0; its ordered passes already describe
  // the intended mesh/mode/light presentation.
  const native = await applyPcNativeRenderModelPresentation(renderer, { type, dynamic, meshFilter });
  if (native.owned) {
    renderer.userData ??= {};
    renderer.userData.muItemEffectType = Number(effectType) || 0;
    renderer.userData.muStockTailSuppressedByRenderModel = true;
    applyPcItemTransparency(renderer,type,meshFilter);
    return native.added;
  }

  // RenderPartObjectEffect special branches precede the generic stock ladder.
  const special = await applyPcRenderPartObjectSolidPresentation(renderer, {type,rawLevel,dynamic,meshFilter,phase:'exclusive'});
  if (special.exclusive) {
    renderer.userData ??= {};
    renderer.userData.muRenderPartObjectEffect = { type, solid:true, exclusive:true, added:special.added };
    renderer.userData.muItemEffectType = Number(effectType) || 0;
    applyPcItemTransparency(renderer,type,meshFilter);
    return special.added;
  }

  // Base equipment tint is source-authored even before the additive passes.
  const updateBase = (timeMs) => {
    const c = pcEquipmentBaseTint(type, rawLevel, timeMs);
    for (const mesh of renderer.meshes || []) {
      if (typeof meshFilter === 'function' && !meshFilter(mesh)) continue;
      const mat = mesh.material;
      mesh.userData ??= {};
      const authored = mesh.userData.muAuthoredBaseColor ??= c.clone();
      authored.copy(c);
      if (mat?.color) mat.color.copy(c);
      else if (mat?.uniforms?.diffuse?.value?.copy) mat.uniforms.diffuse.value.copy(c);
    }
  };
  updateBase(performance.now());
  if (dynamic && typeof renderer.addPresentationUpdate === 'function') renderer.addPresentationUpdate(updateBase);

  const plan = pcStockMaterialPassPlan(type, rawLevel, option1, extOption, customColor);
  let added = 0;
  for (const pass of plan) {
    let tex = null;
    let tint = new THREE.Color(1, 1, 1);
    if (pass.kind === 'excellent') {
      // Excellent replays the authored item texture, not Chrome01/02.
      tint = pcExcellentTint(performance.now());
    } else {
      tex = await pcMaterialTexture(pass.kind);
      if (!tex) continue; // fail closed: no fake material texture
      if (pass.kind === 'chrome3') tint = pcSetTint(type);
      else if (Array.isArray(customColor) && customColor.length >= 3) {
        // LoadItens.lua color owns generic equipment material tint. Do not
        // apply it to Ancient/Set or Excellent, which have their own PC colors.
        tint = new THREE.Color(
          Math.max(0, Math.min(1, Number(customColor[0]) || 0)),
          Math.max(0, Math.min(1, Number(customColor[1]) || 0)),
          Math.max(0, Math.min(1, Number(customColor[2]) || 0)),
        );
      }
    }
    const overlay = renderer.createOverlayPass?.(pass.flags, { map: tex, color: tint, alpha: 1, meshFilter });
    if (!overlay) continue;
    added++;

    if (dynamic && typeof renderer.addPresentationUpdate === 'function') {
      if (pass.kind === 'excellent') {
        renderer.addPresentationUpdate((timeMs) => overlay.setColor?.(pcExcellentTint(timeMs)));
      } else if (pass.kind === 'chrome3') {
        renderer.addPresentationUpdate((timeMs) => {
          const pulse = Math.sin(Number(timeMs) * 0.001) * 0.5 + 0.4;
          const c = pcSetTint(type).multiplyScalar(Math.max(0, pulse));
          overlay.setColor?.(c);
        });
      }
    }
  }
  // Keep the authored effect selector attached to the renderer for the next
  // source-backed EffectType owner. It is metadata only here: inventing a
  // browser glow for an unknown EffectType would violate the PC data contract.
  const continuation = await applyPcRenderPartObjectSolidPresentation(renderer, {type,rawLevel,dynamic,meshFilter,phase:'continuation'});
  renderer.userData ??= {};
  renderer.userData.muItemEffectType = Number(effectType) || 0;
  renderer.userData.muRenderPartObjectEffect = { type, solid:continuation.handled, exclusive:false, added:continuation.added };
  applyPcItemTransparency(renderer,type,meshFilter);
  return added + continuation.added + native.added;
}
