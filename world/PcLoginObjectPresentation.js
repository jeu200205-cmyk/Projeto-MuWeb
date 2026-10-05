import * as THREE from 'three';
import {RenderFlags} from '../assets/MUModelRenderer.js';
import {pcMaterialTexture} from '../graphics/ItemMaterialPresentation.js';

// GMCryingWolf2nd.cpp::RenderCryingWolf2ndObjectVisual, WorldActive == 94.
// Types are EncTerrain OBJECT::Type (filenames are type+1).
export function hasPcLoginObjectPresentation(worldNum, type) {
  return Number(worldNum) === 95 && (Number(type) === 1 || Number(type) === 5);
}

export function pcLoginWaterV(timeMs) {
  // timeGetTime supplies integral DWORD milliseconds; v552 and multiplication
  // are float32. Preserve those rounds before C++'s signed remainder and the
  // final float assignment (not a clamped, positive-only sawtooth).
  const uptime=Math.trunc(Number(timeMs)) >>> 0;
  const numerator=Math.trunc(Math.fround(4000-Math.fround(Math.fround(uptime)*0.75))) % 4001;
  return numerator===0?0:Math.fround(numerator*0.0002500000118743628);
}

export function pcLoginObjectPassPlan(type) {
  if (Number(type) === 1) return [{mesh:0, flags:RenderFlags.TEXTURE | RenderFlags.BRIGHT, chrome:false}];
  if (Number(type) !== 5) return [];
  const plan=[{mesh:0,flags:RenderFlags.CHROME | RenderFlags.BRIGHT,chrome:true}];
  for(let mesh=23;mesh<=28;mesh++) {
    plan.push({mesh,flags:RenderFlags.TEXTURE | RenderFlags.BRIGHT,chrome:false});
    plan.push({mesh,flags:RenderFlags.CHROME | RenderFlags.BRIGHT,chrome:true});
  }
  return plan;
}

/** The hull retains its ordinary pass; type1 replaces its whole ordinary body
 * with only mesh0. An absent Chrome01 never becomes a diffuse/white fallback.
 * The material owner already keys that shared texture by Data authority. */
export async function installPcLoginObjectPresentation(worldNum,type,renderer,options={}) {
  if(!hasPcLoginObjectPresentation(worldNum,type)||!renderer)return false;
  renderer.userData ??= {};
  if(renderer.userData.muPcLoginPresentationInstalled)return true;
  const isWater=Number(type)===1;
  const chrome=isWater?null:await (options.loadChrome || (()=>pcMaterialTexture('chrome')))();
  if(renderer._disposed)return false;
  if(isWater)for(const mesh of renderer.meshes||[])mesh.visible=false;
  const baseLight=renderer.bodyLight?.clone?.() || new THREE.Color(1,1,1);
  const chromeLight=new THREE.Color(0.80000001,0.69999999,0.30000001);
  const passes=[];
  let missingChrome=0;
  for(const entry of pcLoginObjectPassPlan(type)) {
    if(entry.chrome&&!chrome?.isTexture){missingChrome++;continue;}
    const pass=renderer.createOverlayPass(entry.flags,{
      // StreamMesh=0 disables normal lighting for water/mesh0. Other diffuse
      // meshes consume the existing LightTransform from the ordinary object;
      // the later BodyLight assignment in Visual affects chrome, not that array.
      color:entry.chrome?chromeLight:baseLight,alpha:1,passOrder:passes.length+1,
      lightEnabled:!isWater&&!entry.chrome&&renderer.userData.muLightEnable!==false,
      ...(entry.chrome?{map:chrome}:{}),
      meshFilter:mesh=>Number(mesh.userData?.muMeshIndex)===entry.mesh,
    });
    if(pass)passes.push(pass);
  }
  if(isWater&&passes.length) {
    // timeGetTime is a shared monotonic uptime; don't reset phase per placement.
    const clock=options.clock || (()=>performance.now());
    const update=()=>passes[0].setUvOffset(0,pcLoginWaterV(clock()));
    renderer.addPresentationUpdate(update);update();
  }
  renderer.userData.muPcLoginPresentationInstalled=true;
  renderer.userData.muPcLoginPresentation={type:Number(type),passes:passes.length,missingChrome};
  if(missingChrome)console.warn('[World95 PC presentation] Effect/Chrome01.OZJ unavailable; chrome passes remain absent');
  return true;
}
