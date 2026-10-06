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
const PARTICLE_KIND = 'bmd-create-particle';
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
  const effects=calls.filter(c=>!DRAW_KINDS.has(c?.kind) && !META_KINDS.has(c?.kind) && !DYNAMIC_KINDS.has(c?.kind));
  const spriteCalls=effects.filter(c=>c?.kind===SPRITE_KIND);
  const particleCalls=effects.filter(c=>c?.kind===PARTICLE_KIND);
  const unresolvedEffects=effects.filter(c=>c?.kind && c.kind!==SPRITE_KIND && c.kind!==PARTICLE_KIND);
  const handles=[]; const spriteHandles=[]; const particleHandles=[]; const pendingBitmaps=[]; let skipped=0;
  if (!drawCalls.length && !spriteCalls.length && !particleCalls.length) return {label,complete:false,dynamic,handles,spriteHandles,particleHandles,pendingBitmaps,effects,unresolvedEffects:unresolvedEffects.length,draws:drawCalls.length,sprites:spriteCalls.length,particles:particleCalls.length,skipped};

  let order=(renderer._overlayMeshes?.length||0)+1;
  for (let drawOrdinal=0; drawOrdinal<drawCalls.length; drawOrdinal++) {
    const call=drawCalls[drawOrdinal];
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
      handles.push({pass,call,source,blendMesh,blendLight,drawOrdinal});
    }
  }
  // LuaBMD.h::CreateSprites(Bitmap,Link,Scale,R,G,B,ObjectStruct) resolves the
  // authored bone position and calls CreateSprite(Bitmap,Position,Scale,Light,Object,0,0).
  // createBoneSprite is the Web owner for the same bone/bitmap/scale/light contract.
  for (const call of spriteCalls) {
    const a=call.args||[];
    const bitmap=int(a[0],-1), bone=int(a[1],-1), scale=finite(a[2],0);
    const r=finite(a[3],0), g=finite(a[4],0), b=finite(a[5],0);
    if (bitmap < 0 || bone < 0 || scale < 0) { skipped++; continue; }
    const map=await pcBitmapTexture(bitmap).catch(()=>null);
    if (!map?.isTexture) { pendingBitmaps.push(bitmap); skipped++; continue; }
    const owner=renderer.createBoneSprite?.({boneIndex:bone,map,scale,color:new THREE.Color(r,g,b)});
    if (!owner?.sprite) { skipped++; continue; }
    owner.sprite.visible=false;
    owner.muCapeLuaCall=call;
    spriteHandles.push(owner);
  }
  // LuaBMD::CreateParticle(Bitmap,SubType,Link,Scale,R,G,B,Object).  This is
  // the same bone-particle bridge already consumed by CharacterEffectItens.
  for (const call of particleCalls) {
    const a=call.args||[];
    const bitmap=int(a[0],-1), subtype=int(a[1],0), bone=int(a[2],-1), scale=finite(a[3],0);
    const r=finite(a[4],0), g=finite(a[5],0), b=finite(a[6],0);
    if(bitmap<0||bone<0||scale<0){skipped++;continue;}
    const map=await pcBitmapTexture(bitmap).catch(()=>null);
    if(!map?.isTexture){pendingBitmaps.push(bitmap);skipped++;continue;}
    const owner=renderer.createBoneParticle?.({boneIndex:bone,map,scale,color:new THREE.Color(r,g,b),subtype,emitMs:40,poolSize:6});
    if(!owner){skipped++;continue;}
    owner.setEnabled?.(false); owner.muCapeLuaCall=call; particleHandles.push(owner);
  }
  // Atomic parity: CreateParticle is exact and worldTime/GetDoubleRender are now
  // executed by the 25-Hz dynamic runner. Global CreateEffect/CreateJoint remain
  // blockers until their family-specific native lifecycle contracts land.
  const represented=(handles.length+spriteHandles.length+particleHandles.length)>0;
  const complete=skipped===0 && represented && unresolvedEffects.length===0;
  return {label,complete,dynamic,handles,spriteHandles,particleHandles,pendingBitmaps:[...new Set(pendingBitmaps)],effects,unresolvedEffects:unresolvedEffects.length,draws:drawCalls.length,sprites:spriteCalls.length,particles:particleCalls.length,skipped};
}


function drawFixedSignature(call){
  const a=call?.args||[];
  if(call?.kind==='render-mesh')return JSON.stringify([call.kind,int(a[0],-999999),int(a[1],0),int(a[3],-1),int(a[7],-1)]);
  if(call?.kind==='render-body')return JSON.stringify([call.kind,int(a[0],0),int(a[2],-1),int(a[6],-1),int(a[7],-1)]);
  return String(call?.kind||'');
}
function staticEffectSignature(call){return JSON.stringify([call?.kind,call?.args||[],call?.linkObject,call?.position,call?.light]);}
function dynamicTopologySafe(samples){
  if(!Array.isArray(samples)||samples.length<2)return true;
  const base=samples[0]||[];
  const baseDraw=base.filter(c=>DRAW_KINDS.has(c?.kind)).map(drawFixedSignature);
  const baseFx=base.filter(c=>!DRAW_KINDS.has(c?.kind)&&!META_KINDS.has(c?.kind)&&!DYNAMIC_KINDS.has(c?.kind)).map(staticEffectSignature);
  return samples.slice(1).every(sample=>{
    const d=(sample||[]).filter(c=>DRAW_KINDS.has(c?.kind)).map(drawFixedSignature);
    const f=(sample||[]).filter(c=>!DRAW_KINDS.has(c?.kind)&&!META_KINDS.has(c?.kind)&&!DYNAMIC_KINDS.has(c?.kind)).map(staticEffectSignature);
    return JSON.stringify(d)===JSON.stringify(baseDraw)&&JSON.stringify(f)===JSON.stringify(baseFx);
  });
}
function updateDynamicDrawProgram(renderer,program,calls){
  const draws=(calls||[]).filter(c=>DRAW_KINDS.has(c?.kind));
  if(draws.length!==program.draws)return false;
  for(const h of program.handles||[]){
    const call=draws[h.drawOrdinal];if(!call||drawFixedSignature(call)!==drawFixedSignature(h.call))return false;
    const a=call.args||[],isMesh=call.kind==='render-mesh';
    const alpha=finite(a[isMesh?2:1],1),blendMesh=int(a[isMesh?3:2],-1),blendLight=finite(a[isMesh?4:3],1);
    const uvU=finite(a[isMesh?5:4],0),uvV=finite(a[isMesh?6:5],0);
    h.call=call;h.blendMesh=blendMesh;h.blendLight=blendLight;
    h.pass?.setOpacity?.(alpha);h.pass?.setUvOffset?.(uvU,uvV);
    h.pass?.setColor?.(bodyColor(renderer,call,blendScaleFor(call,h.source,blendMesh,blendLight)));
  }
  return true;
}

function setProgramVisible(program, visible){
  for (const h of program?.handles||[]) for (const mesh of h.pass?.meshes||[]) mesh.visible=Boolean(visible);
  for (const owner of program?.spriteHandles||[]) if (owner?.sprite) owner.sprite.visible=Boolean(visible);
  for (const owner of program?.particleHandles||[]) owner?.setEnabled?.(Boolean(visible));
}

function recolorProgram(renderer, program){
  for (const h of program?.handles||[]) {
    const scale=blendScaleFor(h.call,h.source,h.blendMesh,h.blendLight);
    h.pass?.setColor?.(bodyColor(renderer,h.call,scale));
  }
}

export async function applyPcCustomCapePresentation(renderer, plans){
  if (!renderer || !plans?.white || !plans?.lit) return {owned:false,complete:false};
  let whiteCalls=plans.white,litCalls=plans.lit,dynamicSafe=true;
  if(plans.dynamic&&typeof plans.evaluate==='function'){
    const sampleTimes=[0,1000,2500,5000];
    const whiteSamples=sampleTimes.map(t=>plans.evaluate(false,t,null,[1,1,1]));
    const c=renderer.bodyLight||new THREE.Color(.5,.5,.5);
    const litSamples=sampleTimes.map(t=>plans.evaluate(true,t,null,[c.r,c.g,c.b]));
    dynamicSafe=dynamicTopologySafe(whiteSamples)&&dynamicTopologySafe(litSamples);
    whiteCalls=whiteSamples[0];litCalls=litSamples[0];
  }
  const white=await buildProgram(renderer,whiteCalls,'white');
  const lit=await buildProgram(renderer,litCalls,'lit');
  const complete=white.complete && lit.complete && dynamicSafe;
  renderer.userData ??= {};
  renderer.userData.muCustomCapeGpu={
    complete,dynamicSafe,
    white:{draws:white.draws,sprites:white.sprites||0,particles:white.particles||0,skipped:white.skipped,dynamic:white.dynamic,pendingBitmaps:white.pendingBitmaps,effects:white.effects.length,unresolvedEffects:white.unresolvedEffects||0},
    lit:{draws:lit.draws,sprites:lit.sprites||0,particles:lit.particles||0,skipped:lit.skipped,dynamic:lit.dynamic,pendingBitmaps:lit.pendingBitmaps,effects:lit.effects.length,unresolvedEffects:lit.unresolvedEffects||0},
  };
  if (!complete) {
    setProgramVisible(white,false);setProgramVisible(lit,false);
    return {owned:true,complete:false,white,lit};
  }
  const baseVisibility=(renderer.meshes||[]).map(m=>m.visible);
  for (const mesh of renderer.meshes||[]) mesh.visible=false;
  let current=null,lastDynamic=-Infinity,dynamicBlocked=false;
  const update=(nowMs=performance.now())=>{
    const c=renderer.bodyLight;
    const key=(c?.r===1&&c?.g===1&&c?.b===1)?'white':'lit';
    if (key!==current) { setProgramVisible(white,key==='white');setProgramVisible(lit,key==='lit');current=key; }
    if(plans.dynamic&&typeof plans.evaluate==='function'&&!dynamicBlocked&&nowMs-lastDynamic>=40){
      lastDynamic=nowMs;
      const calls=plans.evaluate(key!=='white',nowMs,null,[c?.r??1,c?.g??1,c?.b??1]);
      const target=key==='white'?white:lit;
      if(!updateDynamicDrawProgram(renderer,target,calls)){
        dynamicBlocked=true;setProgramVisible(white,false);setProgramVisible(lit,false);
        (renderer.meshes||[]).forEach((m,i)=>m.visible=baseVisibility[i]);
        renderer.userData.muCustomCapeGpu.dynamicRuntimeBlocked=true;
        return;
      }
    }
    recolorProgram(renderer,key==='white'?white:lit);
    renderer.userData.muCustomCapeGpu.active=key;
  };
  update(0);
  if(plans.dynamic)renderer.addPresentationUpdate?.(update);
  return {owned:true,complete:true,white,lit,update,restore:()=>{setProgramVisible(white,false);setProgramVisible(lit,false);(renderer.meshes||[]).forEach((m,i)=>m.visible=baseVisibility[i]);}};
}
