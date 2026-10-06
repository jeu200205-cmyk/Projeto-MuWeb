import * as THREE from 'three';
import { pcBitmapTexture } from '../data/PcBitmapLuaOwners.js';

// CharacterHelper.lua presentation owner. The script's RenderHelper replaces the
// stock helper body. The Web renderer already owns one resident RENDER_TEXTURE
// draw per BMD mesh, so plain flag=2 rows are folded into that draw; every other
// authored RenderMesh becomes one overlay pass on the same skeleton/geometry.
export async function applyPcCharacterHelperPresentation(renderer, rule) {
  if (!renderer || !rule || rule.owner !== 'CharacterHelper.lua') return null;
  const attached=[]; const unresolved=[]; let baseRows=0, overlayRows=0;
  const rows=Array.isArray(rule.model)?rule.model:[];
  for (const row of rows) {
    if (Number(row.timer)!==100) { unresolved.push({kind:'render',reason:'dynamic-timer',row}); continue; }
    if (Array.isArray(row.actions)&&row.actions.length&&!row.actions.includes(-1)) { unresolved.push({kind:'render',reason:'action-gated',row}); continue; }
    const meshIndex=Number(row.mesh), flags=Number(row.glow), textureId=Number(row.texture);
    if (!Number.isInteger(meshIndex)||!Number.isFinite(flags)) { unresolved.push({kind:'render',reason:'bad-mesh-or-flags',row}); continue; }
    const source=renderer.meshes?.find?.(m=>Number(m?.userData?.muMeshIndex)===meshIndex);
    if (!source) { unresolved.push({kind:'render',reason:'mesh-missing',row}); continue; }
    const color=(Number(row.r)>=0&&Number(row.g)>=0&&Number(row.b)>=0)?new THREE.Color(Number(row.r),Number(row.g),Number(row.b)):null;
    let map=null;
    if (textureId>=0) {
      try { map=await pcBitmapTexture(textureId); } catch (_) { map=null; }
      if (!map) { unresolved.push({kind:'render',reason:'texture-id-unresolved',row}); continue; }
    }
    // Exact RENDER_TEXTURE/default-texture row: consume the already resident base
    // mesh instead of publishing a duplicate draw.
    if (flags===2 && textureId===-1 && row.render!==true) {
      if (color) {
        if (source.material?.color?.copy) source.material.color.copy(color);
        if (source.material?.uniforms?.diffuse?.value?.copy) source.material.uniforms.diffuse.value.copy(color);
        source.userData ??={}; source.userData.muCharacterHelperBodyLight=color.clone();
      }
      source.visible=true; baseRows++; continue;
    }
    const repeat=Math.max(1,Math.min(32,Number(row.value)||1));
    for(let i=0;i<repeat;i++){
      const pass=renderer.createOverlayPass?.(flags,{map,color:color||new THREE.Color(1,1,1),alpha:1,meshFilter:m=>Number(m?.userData?.muMeshIndex)===meshIndex,passOrder:2+i*0.001});
      if(!pass){unresolved.push({kind:'render',reason:'overlay-pass-failed',row});break;}
      attached.push(pass);overlayRows++;
      // Render=true in this script means authored pulse/UV motion. Only eight
      // rows in the supplied 2.4 MB table use it; preserve their formulas.
      if(row.render===true){
        const effect=Number(row.effect),speed=Number(row.renSpeed)||0,opacity=Number(row.renOpacity)||0,limit=Number(row.renColor)||1;
        renderer.addPresentationUpdate?.((worldMs)=>{
          if(effect===0){
            const vertex=Math.min(limit,Math.sin(worldMs*0.001*speed)*0.5+0.5+opacity);
            let c=new THREE.Color(vertex,vertex,vertex);
            if(row.color===true){
              if(Number(row.r)>=0)c.setRGB(Number(row.rr)||0,vertex,vertex);
              if(Number(row.g)>=0)c.setRGB(vertex,Number(row.rg)||0,vertex);
              if(Number(row.b)>=0)c.setRGB(vertex,vertex,Number(row.rb)||0);
            }
            pass.setColor?.(c);
          } else {
            let u=0,v=0;const t=worldMs;
            if(effect===1)v=t/100*speed;
            else if(effect===2)v=t/100*-speed;
            else if(effect===3)u=t/100*speed;
            else if(effect===4)u=t/100*-speed;
            else if(effect===5){u=Math.floor(((t%(15*40))/40)%4)*speed;v=Math.floor(((t%(15*40))/40)/4)*speed;}
            else if(effect===6){u=Math.floor(((t%(15*40))/40)%4)*-speed;v=Math.floor(((t%(15*40))/40)/4)*-speed;}
            pass.setUvOffset?.(u,v);
          }
        });
      }
    }
  }
  // CharacterHelper.lua::RenderHelper Effect table. The script first calls
  // TransformPosition(Bone, PosX,PosY,PosZ), then CreateSprite/CreateParticle.
  // This is the same bone->bitmap bridge already owned by MUModelRenderer.
  let effectRows=0,effectAttached=0;
  for (const fx of (Array.isArray(rule.effects)?rule.effects:[])) {
    effectRows++;
    if (Number(fx.randTime)!==100) { unresolved.push({kind:'effect',reason:'dynamic-randtime',row:fx}); continue; }
    if (Array.isArray(fx.actions)&&fx.actions.length&&!fx.actions.includes(-1)) { unresolved.push({kind:'effect',reason:'action-gated',row:fx}); continue; }
    if (fx.black===true) { unresolved.push({kind:'effect',reason:'black-sprite-semantics-pending',row:fx}); continue; }
    const type=Number(fx.effectType);
    if (type!==0 && type!==1) { unresolved.push({kind:'effect',reason:'CreateEffect-native-lifecycle-pending',row:fx}); continue; }
    const map=await pcBitmapTexture(Number(fx.effectIndex)).catch(()=>null);
    if (!map?.isTexture) { unresolved.push({kind:'effect',reason:'bitmap-id-unresolved',row:fx}); continue; }
    const common={
      boneIndex:Number(fx.bone), map,
      offset:new THREE.Vector3(Number(fx.posX)||0,Number(fx.posY)||0,Number(fx.posZ)||0),
      scale:Number(fx.size)||0,
      color:new THREE.Color(Number(fx.r)||0,Number(fx.g)||0,Number(fx.b)||0),
    };
    const owner=type===0
      ? renderer.createBoneSprite?.(common)
      : renderer.createBoneParticle?.({...common,subtype:Number(fx.effectLevel)||0,emitMs:40,poolSize:5});
    if(!owner){unresolved.push({kind:'effect',reason:'bone-or-bitmap-invalid',row:fx});continue;}
    attached.push(owner); effectAttached++;
  }
  // Script-level RenderShadowModel and foot-effect factories need their own PC
  // geometry/lifecycle owners. Record them rather than substituting fake blobs.
  if(rule.shadow) unresolved.push({kind:'shadow',reason:'RenderShadowModel-native-projection-pending'});
  if(Number(rule.footEffectRows)>0) unresolved.push({kind:'foot-effect',reason:'helper-foot-lifecycle-pending',rows:Number(rule.footEffectRows)});
  const state=Object.freeze({baseRows,overlayRows,effectRows,effectAttached,attached:Object.freeze(attached),unresolved:Object.freeze(unresolved)});
  renderer.userData ??={}; renderer.userData.muCharacterHelperPresentation=state;
  return state;
}
