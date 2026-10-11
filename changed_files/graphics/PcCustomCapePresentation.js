/**
 * PcCustomCapePresentation.js — GPU consumer for CharacterCreateCape.lua::RenderCapeModel.
 *
 * Main 5.2 authority:
 *   CustomCape.cpp::RenderModel -> RenderCapeModel(BMD*, OBJECT*, ItemIndex, RenderCharacter)
 *   LuaBMD.h::RenderBody / RenderMesh -> BMD::RenderBody / RenderMesh
 *
 * This consumer only takes over the rigid cape BMD when every authored body/mesh draw
 * in BOTH BodyLight branches can be represented. Missing explicit bitmap owners or
 * time-dependent Lua keep the original BMD visible (fail closed, no fake pass).
 */
import * as THREE from 'three';
import { pcBitmapTexture } from '../data/PcBitmapLuaOwners.js';

const DYNAMIC_KINDS = new Set(['world-time-read','double-render-read']);
const DRAW_KINDS = new Set(['render-body','render-mesh']);
const SPRITE_KIND = 'bmd-create-sprite';
// FIX80: callbacks captured by the real CharacterCreateCape.lua are semantic owners,
// not optional decoration. Until a callback has an exact Main 5.2 consumer it must
// block rigid-BMD takeover; otherwise FIX78 could hide the stock cape while silently
// dropping its authored sprite/particle/effect/joint branch.
const META_KINDS = new Set(['set-light','set-mesh','gl-color-body','transform-position','transform-position2','object-set-time']);

function finite(v, fallback=0){ const n=Number(v); return Number.isFinite(n)?n:fallback; }
function int(v, fallback=0){ const n=Number(v); return Number.isFinite(n)?Math.trunc(n):fallback; }
function sourceMeshIndex(mesh){ return Number(mesh?.userData?.muMeshIndex); }
function sourceTextureIndex(mesh){ return Number(mesh?.userData?.textureIndex); }

function bodyColor(renderer, call, blendScale=1){
  if (call?.lightOwned && Array.isArray(call.light)) {
    return new THREE.Color(finite(call.light[0],1)*blendScale,finite(call.light[1],1)*blendScale,finite(call.light[2],1)*blendScale);
  }
  const c=renderer?.bodyLight;
  return new THREE.Color(finite(c?.r,1)*blendScale,finite(c?.g,1)*blendScale,finite(c?.b,1)*blendScale);
}

function blendScaleFor(call, mesh, blendMesh, blendLight){
  if (blendMesh <= -2 || sourceTextureIndex(mesh) === blendMesh) return blendLight;
  return 1;
}

async function buildProgram(renderer, program, label){
  const calls=Array.isArray(program)?program:[];
  const dynamic=calls.some(c=>DYNAMIC_KINDS.has(c?.kind));
  const drawCalls=calls.filter(c=>DRAW_KINDS.has(c?.kind));
  const effects=calls.filter(c=>!DRAW_KINDS.has(c?.kind) && !META_KINDS.has(c?.kind));
  const spriteCalls=effects.filter(c=>c?.kind===SPRITE_KIND);
  const unresolvedEffects=effects.filter(c=>c?.kind && c.kind!==SPRITE_KIND);
  // FIX100: even after native particle/effect consumers land, an authored call with
  // missing OBJECT::Angle/Position ownership must remain fail-closed. Never render it
  // from an invented [0,0,0] object transform.
  const missingNativeObjectOwners=effects.filter(c=>
    (c?.kind==='bmd-create-particle' && (c.objectAngleOwnerMissing || c.transformPositionOwnerMissing)) ||
    (c?.kind==='bmd-create-effect' && (c.objectAngleOwnerMissing || c.objectPositionOwnerMissing || c.transformPositionOwnerMissing)) ||
    (c?.kind==='bmd-create-sprite' && c.transformPositionOwnerMissing)
  );
  const handles=[]; const spriteHandles=[]; const pendingBitmaps=[]; let skipped=0;
  if (dynamic || (!drawCalls.length && !spriteCalls.length)) return {label,complete:false,dynamic,handles,spriteHandles,pendingBitmaps,effects,unresolvedEffects:Math.max(unresolvedEffects.length,missingNativeObjectOwners.length),draws:drawCalls.length,sprites:spriteCalls.length,skipped};

  let order=(renderer._overlayMeshes?.length||0)+1;
  for (const call of drawCalls) {
    const a=call.args||[];
    const isMesh=call.kind==='render-mesh';
    const meshIndex=isMesh?int(a[0],-999999):null;
    const flags=int(a[isMesh?1:0],0);
    const alpha=finite(a[isMesh?2:1],1);
    const blendMesh=int(a[isMesh?3:2],-1);
    const blendLight=finite(a[isMesh?4:3],1);
    const uvU=finite(a[isMesh?5:4],0), uvV=finite(a[isMesh?6:5],0);
    const hidden=isMesh?-999999:int(a[6],-1);
    const texture=int(a[isMesh?7:7],-1);
    if (!flags) { skipped++; continue; }
    let explicitMap=null;
    if (texture !== -1) {
      explicitMap=await pcBitmapTexture(texture);
      if (!explicitMap?.isTexture) { pendingBitmaps.push(texture); skipped++; continue; }
    }
    const targets=(renderer.meshes||[]).filter(mesh=>isMesh ? sourceMeshIndex(mesh)===meshIndex : sourceMeshIndex(mesh)!==hidden);
    if (!targets.length) { skipped++; continue; }
    for (const source of targets) {
      const scale=blendScaleFor(call,source,blendMesh,blendLight);
      const pass=renderer.createOverlayPass?.(flags,{
        map:explicitMap,
        alpha,
        color:bodyColor(renderer,call,scale),
        passOrder:order++,
        lightEnabled:false,
        meshFilter:(mesh)=>mesh===source,
      });
      if (!pass) { skipped++; continue; }
      if ((sourceMeshIndex(source)===blendMesh || sourceMeshIndex(source)===int(call.streamMesh,-999999)) && (uvU!==0 || uvV!==0)) pass.setUvOffset?.(uvU,uvV);
      for (const mesh of pass.meshes||[]) mesh.visible=false;
      handles.push({pass,call,source,blendMesh,blendLight});
    }
  }
  // Main 5.2 LuaBMD.h exact contract is:
  //   TransformPosition(Link, PosX, PosY, PosZ) -> caches LinkObject + transformed Position
  //   CreateSprites(Bitmap, Scale, LightX, LightY, LightZ, ObjectStruct)
  //   -> CreateSprite(Bitmap, Position, Scale, Light, Object, 0, 0)
  // The bone is NOT a CreateSprites argument. FIX80's first consumer accidentally read
  // args[1] (Scale) as the bone and shifted Scale/RGB. Consume the captured TransformPosition
  // owner instead: linkObject is the authored bone and position is its local offset.
  for (const call of spriteCalls) {
    const a=call.args||[];
    const bitmap=int(a[0],-1), bone=int(call?.linkObject,-1), scale=finite(a[1],0);
    const r=finite(a[2],0), g=finite(a[3],0), b=finite(a[4],0);
    const localOffset=Array.isArray(call?.transformLocalOffset) ? call.transformLocalOffset : call?.position;
    const offset=call?.positionSpace==='bmd-bone-local' && Array.isArray(localOffset) && localOffset.length>=3
      ? new THREE.Vector3(finite(localOffset[0],0),finite(localOffset[1],0),finite(localOffset[2],0))
      : null;
    if (bitmap < 0 || bone < 0 || scale < 0 || !offset) { skipped++; continue; }
    const map=await pcBitmapTexture(bitmap).catch(()=>null);
    if (!map?.isTexture) { pendingBitmaps.push(bitmap); skipped++; continue; }
    const owner=renderer.createBoneSprite?.({boneIndex:bone,map,offset,scale,color:new THREE.Color(r,g,b)});
    if (!owner?.sprite) { skipped++; continue; }
    owner.sprite.visible=false;
    owner.muCapeLuaCall=call;
    spriteHandles.push(owner);
  }
  // Atomic parity: do not claim the Lua program when any authored FX callback would
  // be discarded. CreateSprite is now exact; particle/effect/joint remain blockers.
  const represented=(handles.length+spriteHandles.length)>0;
  const complete=skipped===0 && represented && unresolvedEffects.length===0;
  return {label,complete,dynamic,handles,spriteHandles,pendingBitmaps:[...new Set(pendingBitmaps)],effects,unresolvedEffects:Math.max(unresolvedEffects.length,missingNativeObjectOwners.length),draws:drawCalls.length,sprites:spriteCalls.length,skipped};
}

function setProgramVisible(program, visible){
  for (const h of program?.handles||[]) for (const mesh of h.pass?.meshes||[]) mesh.visible=Boolean(visible);
  for (const owner of program?.spriteHandles||[]) if (owner?.sprite) owner.sprite.visible=Boolean(visible);
}

function recolorProgram(renderer, program){
  for (const h of program?.handles||[]) {
    const scale=blendScaleFor(h.call,h.source,h.blendMesh,h.blendLight);
    h.pass?.setColor?.(bodyColor(renderer,h.call,scale));
  }
}

export async function applyPcCustomCapePresentation(renderer, plans){
  if (!renderer || !plans?.white || !plans?.lit) return {owned:false,complete:false};
  const white=await buildProgram(renderer,plans.white,'white');
  const lit=await buildProgram(renderer,plans.lit,'lit');
  const complete=white.complete && lit.complete;
  renderer.userData ??= {};
  renderer.userData.muCustomCapeGpu={
    complete,
    white:{draws:white.draws,sprites:white.sprites||0,skipped:white.skipped,dynamic:white.dynamic,pendingBitmaps:white.pendingBitmaps,effects:white.effects.length,unresolvedEffects:white.unresolvedEffects||0},
    lit:{draws:lit.draws,sprites:lit.sprites||0,skipped:lit.skipped,dynamic:lit.dynamic,pendingBitmaps:lit.pendingBitmaps,effects:lit.effects.length,unresolvedEffects:lit.unresolvedEffects||0},
  };
  if (!complete) {
    setProgramVisible(white,false);setProgramVisible(lit,false);
    // FIX84: atomic fail-closed keeps the rigid BMD authoritative. Resources
    // provisioned while proving white/lit parity are therefore speculative and
    // must not survive invisibly until the entire equipped renderer is rebuilt.
    for (const program of [white,lit]) {
      for (const h of program?.handles||[]) h.pass?.dispose?.();
      for (const owner of program?.spriteHandles||[]) owner?.dispose?.();
      program.handles=[]; program.spriteHandles=[];
    }
    return {owned:true,complete:false,white,lit};
  }
  const baseVisibility=(renderer.meshes||[]).map(m=>m.visible);
  for (const mesh of renderer.meshes||[]) mesh.visible=false;
  let current=null;
  const update=()=>{
    const c=renderer.bodyLight;
    const key=(c?.r===1&&c?.g===1&&c?.b===1)?'white':'lit';
    if (key!==current) { setProgramVisible(white,key==='white');setProgramVisible(lit,key==='lit');current=key; }
    recolorProgram(renderer,key==='white'?white:lit);
    renderer.userData.muCustomCapeGpu.active=key;
  };
  update();
  return {owned:true,complete:true,white,lit,update,restore:()=>{setProgramVisible(white,false);setProgramVisible(lit,false);(renderer.meshes||[]).forEach((m,i)=>m.visible=baseVisibility[i]);}};
}
