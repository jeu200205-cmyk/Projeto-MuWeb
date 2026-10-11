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
const EFFECT_KIND = 'bmd-create-effect';
// FIX80: callbacks captured by the real CharacterCreateCape.lua are semantic owners,
// not optional decoration. Until a callback has an exact Main 5.2 consumer it must
// block rigid-BMD takeover; otherwise FIX78 could hide the stock cape while silently
// dropping its authored sprite/particle/effect/joint branch.
const META_KINDS = new Set(['set-light','set-mesh','gl-color-body','transform-position','transform-position2','object-set-time']);

function finite(v, fallback=0){ const n=Number(v); return Number.isFinite(n)?n:fallback; }
function int(v, fallback=0){ const n=Number(v); return Number.isFinite(n)?Math.trunc(n):fallback; }
// FIX128: live animated TransformPosition diagnostic in MODEL space. The sprite
// consumer below is already bone-parented, so it MUST receive the original
// BMD bone-local offset. Passing matrixWorld into a bone-local Sprite would
// double-apply the bone and model/world placement.
// Keep the two-argument diagnostic entry point for callers that do not own
// a full white/lit frame. Batched paths below pass an ephemeral frame owner.
function transformPositionModelSpace(renderer, call) {
  return transformPositionModelSpaceFrame(renderer,call,null);
}
function transformPositionModelSpaceFrame(renderer, call, frame=null) {
  const bone=int(call?.positionBone??call?.linkObject,-1);
  const local=Array.isArray(call?.transformLocalOffset)?call.transformLocalOffset:call?.position;
  if (bone<0 || call?.positionSpace!=='bmd-bone-local' || !Array.isArray(local) || local.length<3) return null;
  if (!local.slice(0,3).every(x=>Number.isFinite(Number(x)))) return null;
  const node=renderer?.bones?.[bone];
  const group=renderer?.group;
  if (!node?.isBone || !group?.isGroup) return null;
  // ITEMS/LUA FIX137: a single RenderCapeModel frame can emit dozens of native
  // particle/effect calls in both BodyLight branches. Those calls are still
  // blocked from GPU takeover, but the exact diagnostics used to traverse the
  // *entire* bone tree and invert the model matrix once per call. Snapshot the
  // live BMD transform once per synchronous diagnostic pass, not per effect.
  // Never cache across frames: worldTime/animation can change every 40 ms.
  let inverse;
  if (frame) {
    if (!frame.prepared || frame.group!==group) {
      group.updateMatrixWorld(true);
      frame.inverse=group.matrixWorld.clone().invert();
      frame.group=group;
      frame.prepared=true;
    }
    inverse=frame.inverse;
  } else {
    group.updateMatrixWorld(true);
    inverse=group.matrixWorld.clone().invert();
  }
  // node.matrixWorld includes the group transform; cancel it to keep model-space.
  const point=new THREE.Vector3(Number(local[0]),Number(local[1]),Number(local[2]));
  return point.applyMatrix4(node.matrixWorld).applyMatrix4(inverse);
}
// FIX125: LuaBMD CreateParticles/CreateEffects do not share a parameter list.
// Capture only native arguments actually published by PcCustomCapeLua's live
// Lua invocation; NEVER reinterpret BMD BodyLight as FX RGB or LinkObject as
// a non-existent c.bone. This is a diagnostic handoff, not a physics consumer.
function nativeFxVec3(value){
  if (!Array.isArray(value) || value.length<3) return null;
  // Do not coerce null/undefined/strings to 0: missing authored Lua owners
  // are not valid vectors, even when Number(value) would be finite.
  const out=value.slice(0,3);
  return out.every(v=>typeof v==='number'&&Number.isFinite(v)) ? Object.freeze(out) : null;
}
// FIX132: native LuaBMD::CreateSprites requires bitmap, scale and RGB
// as five authored numeric arguments; no missing field can become zero.
function spritePayloadValid(c){
  const a=c?.args;
  return Array.isArray(a) && a.length>=5 && Number.isInteger(a[0]) && a[0]>=0 &&
    a.slice(1,5).every(v=>typeof v==='number'&&Number.isFinite(v)) && a[1]>=0;
}
function spriteTransformValid(c){
  // TransformPosition2 applies BMD BodyScale + BodyOrigin after bone
  // transformation. A bone-parented sprite would double-apply that stage;
  // until a dedicated root-space sprite consumer exists, retain stock BMD.
  // LinkObject may have become -1 after an earlier valid TransformPosition.
  // CreateSprites still consumes that cached Position; only CreateEffects
  // selects OBJECT::Position when LinkObject == -1.
  const bone=c?.positionBone??c?.linkObject;
  return Number.isInteger(bone) && bone>=0 &&
    c.transformTranslate!==true && c.positionSpace==='bmd-bone-local' && c.transformPositionOwnerMissing!==true && c.objectStructOwnerMissing!==true &&
    nativeFxVec3(c.transformLocalOffset??c.position)!==null;
}
function nativeFxPhysicalInput(renderer,c,frame=null){
  const isParticle=c?.kind===PARTICLE_KIND;
  const isEffect=c?.kind===EFFECT_KIND;
  const nativeLink=Number.isInteger(c?.linkObject)?c.linkObject:null;
  const cachedBone=Number.isInteger(c?.positionBone)?c.positionBone:nativeLink;
  const bone=isParticle?cachedBone:nativeLink;
  const bitmap=Number.isInteger(c?.bitmap)&&c.bitmap>=0?c.bitmap:null;
  const subtype=Number.isInteger(c?.subtype)?c.subtype:null;
  // Only CreateParticle has a Scale argument; CreateEffect does not.
  const scale=isParticle&&Number.isFinite(c?.scale)?c.scale:null;
  // LuaBMD forwards the three numeric CreateParticle/CreateEffect RGB args.
  // BMD::SetLight/BodyLight is a distinct RenderBody/RenderMesh owner.
  const light=nativeFxVec3(c?.rgb);
  const objectAngle=nativeFxVec3(c?.objectAngle);
  const objectPosition=nativeFxVec3(c?.objectPosition);
  const objectWorld=isEffect&&c?.positionSpace==='object-world'&&c?.useObjectPosition===true&&nativeLink===-1;
  const boneLocal=c?.positionSpace==='bmd-bone-local'&&bone!==null&&bone>=0;
  const localPosition=boneLocal?nativeFxVec3(c?.transformLocalOffset??c?.position):null;
  const transformed=boneLocal&&localPosition?(frame?transformPositionModelSpaceFrame(renderer,c,frame):transformPositionModelSpace(renderer,c)):null;
  // Main 5.2 BMD::TransformPosition(...,Translate=true) scales by BodyScale
  // and adds BodyOrigin; Translate=false uses the raw bone matrix. These
  // positions are diagnostics only, not a particle/effect physics consumer.
  let modelPosition=transformed;
  let modelSpace='bmd-model';
  if (transformed && c.transformTranslate===true) {
    const sc=renderer?.bodyScale,origin=renderer?.bodyOrigin;
    if(typeof sc==='number' && Number.isFinite(sc) && origin &&
       [origin.x,origin.y,origin.z].every(v=>typeof v==='number'&&Number.isFinite(v))) {
      modelPosition={x:transformed.x*sc+origin.x,y:transformed.y*sc+origin.y,z:transformed.z*sc+origin.z};
      modelSpace='bmd-body-origin';
    } else modelPosition=null;
  }
  // Do not mislabel model-space bone coordinates as world-space. A future
  // native FX consumer still needs the actual OBJECT placement/physics.
  const effectivePosition=objectWorld?objectPosition:(modelPosition?Object.freeze([modelPosition.x,modelPosition.y,modelPosition.z]):null);
  const effectivePositionSpace=objectWorld?'object-world':(modelPosition?modelSpace:null);
  const ownerReady=c.transformPositionOwnerMissing!==true && c.objectStructOwnerMissing!==true &&
    c.objectAngleOwnerMissing!==true && c.objectPositionOwnerMissing!==true;
  const payloadReady=Boolean((isParticle||isEffect)&&bitmap!==null&&subtype!==null&&light&&objectAngle&&
    (!isParticle||scale!==null) && (objectWorld?objectPosition:(boneLocal&&localPosition)));
  return {
    revision:4,kind:c.kind,bitmap,subtype,bone,linkObject:nativeLink,positionBone:cachedBone,scale,transformTranslate:c.transformTranslate===true,
    localPosition,light,objectAngle,objectPosition,
    positionOwner:c.positionOwner??null,positionSpace:c.positionSpace??null,
    effectivePosition,effectivePositionSpace,
    ownerReady:ownerReady,payloadReady:payloadReady,transformReady:effectivePosition!==null,
    inputReady:ownerReady&&payloadReady&&effectivePosition!==null,
  };
}
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

async function buildProgram(renderer, program, label, {liveFrame=false}={}){
  const calls=Array.isArray(program)?program:[];
  const dynamicReads=calls.filter(c=>DYNAMIC_KINDS.has(c?.kind));
  const dynamic=dynamicReads.length>0;
  // FIX126: a captured GetDoubleRender is an INPUT read, not a drawable FX.
  // Static/equip plans still cannot claim it. A live-frame pair can consume
  // it only when every sampled value is finite and came from the live owner.
  const dynamicOwnerInvalid=dynamicReads.filter(c=>!liveFrame || c.ownerMissing===true ||
    (c.kind==='double-render-read' && !(typeof c.value==='number' && Number.isFinite(c.value))) ||
    (c.kind==='world-time-read' && !(typeof c.value==='number' && Number.isFinite(c.value)))).length;
  const drawCalls=calls.filter(c=>DRAW_KINDS.has(c?.kind));
  const effects=calls.filter(c=>!DRAW_KINDS.has(c?.kind) && !META_KINDS.has(c?.kind) && !DYNAMIC_KINDS.has(c?.kind));
  const spriteCalls=effects.filter(c=>c?.kind===SPRITE_KIND);
  const particleCalls=effects.filter(c=>c?.kind===PARTICLE_KIND);
  const effectCalls=effects.filter(c=>c?.kind===EFFECT_KIND);
  const unresolvedEffects=effects.filter(c=>c?.kind && c.kind!==SPRITE_KIND && c.kind!==PARTICLE_KIND && c.kind!==EFFECT_KIND);
  // FIX100: even after native particle/effect consumers land, an authored call with
  // missing OBJECT::Angle/Position ownership must remain fail-closed. Never render it
  // from an invented [0,0,0] object transform.
  const missingNativeObjectOwners=effects.filter(c=>
    (c?.kind==='bmd-create-particle' && (c.objectAngleOwnerMissing || c.transformPositionOwnerMissing || c.objectStructOwnerMissing)) ||
    (c?.kind==='bmd-create-effect' && (c.objectAngleOwnerMissing || c.objectPositionOwnerMissing || c.transformPositionOwnerMissing || c.objectStructOwnerMissing)) ||
    (c?.kind==='bmd-create-sprite' && (c.transformPositionOwnerMissing || c.objectStructOwnerMissing))
  );
  const handles=[]; const spriteHandles=[]; const pendingBitmaps=[]; let skipped=0;
  // FIX104: particle/effect are recognized native contracts, but they are NOT represented
  // until ZzzEffectParticle/CreateEffect physics exists. Keep atomic takeover fail-closed
  // without misclassifying them as unknown Lua callbacks.
  const nativeFxUnrepresented=particleCalls.length+effectCalls.length;
  // Missing-owner entries for known native FX refer to the same physical call already
  // represented by nativeFxUnrepresented. Count unresolved calls, not overlapping reasons.
  const nativeFxOwnerInvalid=
    particleCalls.filter(c=>c.objectAngleOwnerMissing||c.transformPositionOwnerMissing||c.objectStructOwnerMissing).length+
    effectCalls.filter(c=>c.objectAngleOwnerMissing||c.objectPositionOwnerMissing||c.transformPositionOwnerMissing||c.objectStructOwnerMissing).length;
  const spriteOwnerInvalid=spriteCalls.filter(c=>!spriteTransformValid(c)).length;
  const spritePayloadInvalid=spriteCalls.filter(c=>!spritePayloadValid(c)).length;
  // Count invalid calls once even when both payload and transform are missing.
  const invalidSprites=spriteCalls.filter(c=>!spriteTransformValid(c)||!spritePayloadValid(c)).length;
  const ownerOnlyUnresolved=invalidSprites;
  const unresolvedCallCount=unresolvedEffects.length+nativeFxUnrepresented+invalidSprites+dynamicOwnerInvalid;
  // Keep reasons separate from call cardinality: one native call can be both
  // physically unrepresented and owner-invalid without becoming two calls.
  const unresolvedReasons=Object.freeze({
    unknownLua:unresolvedEffects.length,
    nativeFxUnrepresented,
    nativeOwnerInvalid:nativeFxOwnerInvalid+spriteOwnerInvalid,
    nativeFxOwnerInvalid,
    spriteOwnerInvalid,
    spritePayloadInvalid,
    ownerOnlyUnresolved,
    dynamicOwnerInvalid,
    buildFailure:0
  });
  // FIX110 ITEMS/LUA: fail before allocating speculative GPU owners when the
  // authored program is already known to be incomplete. Particle/effect have no
  // exact physical consumer yet; owner-invalid sprites cannot be materialized.
  // Previously we still built draw overlays/sprites and disposed them afterwards,
  // causing avoidable equip/rebuild GPU churn for capes that can never pass the
  // atomic gate in this revision.
  const preflightBlocked=dynamicOwnerInvalid>0 || nativeFxUnrepresented>0 || unresolvedEffects.length>0 || missingNativeObjectOwners.length>0 || invalidSprites>0;
  if (preflightBlocked || (!drawCalls.length && !spriteCalls.length)) return {label,complete:false,dynamic,handles,spriteHandles,pendingBitmaps,effects,unresolvedEffects:unresolvedCallCount,draws:drawCalls.length,sprites:spriteCalls.length,particles:particleCalls.length,nativeEffects:effectCalls.length,unresolvedReasons,preflightBlocked,skipped};

  // A bitmap fetch or a renderer factory can reject after an earlier draw pass
  // has allocated private GPU resources. The dynamic runner keeps the BMD alive
  // across frames, so an exception must roll back this partial program locally.
  // No substitute texture/FX is created on failure.
  try {
  let order=(renderer._overlayMeshes?.length||0)+1;
  let drawOrdinal=-1;
  for (const call of drawCalls) {
    drawOrdinal++;
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
  // Main 5.2 LuaBMD.h exact contract is:
  //   TransformPosition(Link, PosX, PosY, PosZ) -> caches LinkObject + transformed Position
  //   CreateSprites(Bitmap, Scale, LightX, LightY, LightZ, ObjectStruct)
  //   -> CreateSprite(Bitmap, Position, Scale, Light, Object, 0, 0)
  // The bone is NOT a CreateSprites argument. FIX80's first consumer accidentally read
  // args[1] (Scale) as the bone and shifted Scale/RGB. Consume the captured TransformPosition
  // owner instead: linkObject is the authored bone and position is its local offset.
  for (const call of spriteCalls) {
    const a=call.args||[];
    // Preflight has already validated these exact Lua values. Never substitute
    // RGB/scale/offset zero for missing BMD arguments after atomic takeover.
    const bitmap=a[0],bone=call.positionBone??call.linkObject,scale=a[1];
    const r=a[2],g=a[3],b=a[4];
    const localOffset=call.transformLocalOffset??call.position;
    // finite() is identity here: spritePayloadValid/spriteTransformValid already
    // proved the values. Retain the FIX128 bone-local parity guard.
    const offset=new THREE.Vector3(finite(localOffset[0],0),finite(localOffset[1],0),finite(localOffset[2],0));
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
  const complete=skipped===0 && represented && unresolvedEffects.length===0 && nativeFxUnrepresented===0 && missingNativeObjectOwners.length===0;
  return {label,complete,dynamic,handles,spriteHandles,pendingBitmaps:[...new Set(pendingBitmaps)],effects,unresolvedEffects:unresolvedCallCount,draws:drawCalls.length,sprites:spriteCalls.length,particles:particleCalls.length,nativeEffects:effectCalls.length,unresolvedReasons,skipped};
  } catch (error) {
    // Preserve the original BMD and retire every speculative owner allocated
    // before the failure. Private GPU materials belong to the returned handles;
    // shared BMD geometry and bitmap textures remain owned by their caches.
    for (const h of handles) { try { h.pass?.dispose?.(); } catch (_) {} }
    for (const owner of spriteHandles) { try { owner?.dispose?.(); } catch (_) {} }
    handles.length=0;
    spriteHandles.length=0;
    return {
      label,complete:false,dynamic,handles,spriteHandles,
      pendingBitmaps:[...new Set(pendingBitmaps)],effects,
      unresolvedEffects:unresolvedCallCount+1,draws:drawCalls.length,
      sprites:spriteCalls.length,particles:particleCalls.length,
      nativeEffects:effectCalls.length,
      unresolvedReasons:Object.freeze({...unresolvedReasons,buildFailure:1}),
      skipped:skipped+1,preflightBlocked:false,
      // The error is diagnostic only; never classify a missing physical asset
      // as a successfully represented Lua instruction.
      buildError:String(error?.message||error),
    };
  }
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
  // Only customCapeRenderPlansDynamic publishes this frame-owned pair.
  // Ordinary equip-time plans have neither field and cannot bypass the gate.
  const liveFrame=typeof plans.worldTime==='number' && Number.isFinite(plans.worldTime) &&
    Number.isInteger(plans.doubleRenderSamples) && plans.doubleRenderSamples>=0;
  const white=await buildProgram(renderer,plans.white,'white',{liveFrame});
  const lit=await buildProgram(renderer,plans.lit,'lit',{liveFrame});
  const complete=white.complete && lit.complete;
  renderer.userData ??= {};
  // Both white/lit branches refer to the same accessory skeleton in this
  // frame. Share only the ephemeral transform snapshot; no cross-frame cache.
  const nativeFxFrame={prepared:false,group:null,inverse:null};
  const blockerDescriptor = (program) => Object.freeze((program?.effects||[])
    .filter(c=>c?.kind===PARTICLE_KIND || c?.kind===EFFECT_KIND)
    .map(c=>{
      const physical=nativeFxPhysicalInput(renderer,c,nativeFxFrame);
      return Object.freeze({
      kind:c.kind,
      bitmap:c.bitmap??null,
      bone:Number.isInteger(c.kind===EFFECT_KIND?c.linkObject:(c.positionBone??c.linkObject))?(c.kind===EFFECT_KIND?c.linkObject:(c.positionBone??c.linkObject)):null,
      positionBone:Number.isInteger(c.positionBone)?c.positionBone:null,
      linkObject:Number.isInteger(c.linkObject)?c.linkObject:null,
      subtype:Number.isInteger(c.subtype)?c.subtype:null,
      scale:c.kind===PARTICLE_KIND&&Number.isFinite(c.scale)?c.scale:null,
      positionSpace:c.positionSpace??null,
      authoredPosition:Array.isArray(c.position)?Object.freeze(c.position.map(Number)):null,
      // Historical BodyLight diagnostic retained separately from native FX RGB.
      authoredLight:Array.isArray(c.light)?Object.freeze(c.light.map(Number)):null,
      authoredFxRgb:nativeFxVec3(c.rgb),
      authoredObjectAngle:Array.isArray(c.objectAngle)?Object.freeze(c.objectAngle.map(Number)):null,
      authoredObjectPosition:Array.isArray(c.objectPosition)?Object.freeze(c.objectPosition.map(Number)):null,
      transformedPosition:physical.effectivePositionSpace?.startsWith('bmd-')?physical.effectivePosition:null,
      transformTranslate:c.transformTranslate===true,
      transformPositionOwnerMissing:c.transformPositionOwnerMissing===true,
      objectAngleOwnerMissing:c.objectAngleOwnerMissing===true,
      objectStructOwnerMissing:c.objectStructOwnerMissing===true,
      objectPositionOwnerMissing:c.objectPositionOwnerMissing===true,
      transformInput:Object.freeze({
        bone:Number.isInteger(c.kind===EFFECT_KIND?c.linkObject:(c.positionBone??c.linkObject))?(c.kind===EFFECT_KIND?c.linkObject:(c.positionBone??c.linkObject)):null,
        positionBone:Number.isInteger(c.positionBone)?c.positionBone:null,
        linkObject:Number.isInteger(c.linkObject)?c.linkObject:null,
        localPosition:nativeFxVec3(c.transformLocalOffset??c.position),
        objectAngle:nativeFxVec3(c.objectAngle),
        objectPosition:nativeFxVec3(c.objectPosition),
        positionSpace:c.positionSpace??null
      }),
      // V1 schema marker is retained for historical diagnostics; revision 2
      // fixes the native LuaBMD argument mapping. No physical FX is enabled.
      physicalConsumerInput:Object.freeze({
        schema:'MUWEB_NATIVE_FX_V1',
        ...physical
      })
    });}));
  renderer.userData.muCustomCapeGpu={
    complete,
    white:{draws:white.draws,sprites:white.sprites||0,particles:white.particles||0,nativeEffects:white.nativeEffects||0,skipped:white.skipped,dynamic:white.dynamic,pendingBitmaps:white.pendingBitmaps,effects:white.effects.length,unresolvedEffects:white.unresolvedEffects||0,unresolvedReasons:white.unresolvedReasons||null,preflightBlocked:white.preflightBlocked===true,buildError:white.buildError??null,nativeFxBlockers:blockerDescriptor(white)},
    lit:{draws:lit.draws,sprites:lit.sprites||0,particles:lit.particles||0,nativeEffects:lit.nativeEffects||0,skipped:lit.skipped,dynamic:lit.dynamic,pendingBitmaps:lit.pendingBitmaps,effects:lit.effects.length,unresolvedEffects:lit.unresolvedEffects||0,unresolvedReasons:lit.unresolvedReasons||null,preflightBlocked:lit.preflightBlocked===true,buildError:lit.buildError??null,nativeFxBlockers:blockerDescriptor(lit)},
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
  let disposed=false;
  // ITEMS/LUA FIX135: a live GetLight/SetLight change is a material-color
  // update, not a reason to rebuild two GPU overlay programs. The dynamic
  // signature still includes authored draw arguments, mesh/bitmap/FX calls;
  // only the captured draw RGB metadata may vary in-place.
  const update=(nextPlans=null)=>{
    if (disposed) return false;
    if (nextPlans) {
      const newWhite=(nextPlans.white||[]).filter(c=>DRAW_KINDS.has(c?.kind));
      const newLit=(nextPlans.lit||[]).filter(c=>DRAW_KINDS.has(c?.kind));
      const valid=(program,draws)=>program.draws===draws.length &&
        (program.handles||[]).every(h=>draws[h.drawOrdinal]?.kind===h.call.kind);
      if (!valid(white,newWhite) || !valid(lit,newLit)) return false;
      for (const h of white.handles||[]) h.call=newWhite[h.drawOrdinal];
      for (const h of lit.handles||[]) h.call=newLit[h.drawOrdinal];
    }
    const c=renderer.bodyLight;
    const key=(c?.r===1&&c?.g===1&&c?.b===1)?'white':'lit';
    if (key!==current) { setProgramVisible(white,key==='white');setProgramVisible(lit,key==='lit');current=key; }
    recolorProgram(renderer,key==='white'?white:lit);
    renderer.userData.muCustomCapeGpu.active=key;
    return true;
  };
  update();
  const restore=()=>{
    if (disposed) return;
    disposed=true;
    setProgramVisible(white,false);
    setProgramVisible(lit,false);
    // A replaced authored program must release its private GPU allocations.
    // Old restore() only hid them and leaked materials/meshes on each rebuild.
    for (const program of [white,lit]) {
      for (const h of program.handles||[]) h.pass?.dispose?.();
      for (const owner of program.spriteHandles||[]) owner?.dispose?.();
      program.handles=[];
      program.spriteHandles=[];
    }
    (renderer.meshes||[]).forEach((m,i)=>m.visible=baseVisibility[i]);
  };
  return {owned:true,complete:true,white,lit,update,restore};
}
