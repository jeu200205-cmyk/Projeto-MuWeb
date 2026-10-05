import * as THREE from 'three';
import {MUAssets} from '../assets/MUAssetLoader.js';
import {MUModelRenderer,RenderFlags as F} from '../assets/MUModelRenderer.js';
import {nativeRenderModelPasses} from '../data/RenderModelNativeOracle.js';
import {run as retained} from './fix4-render.mjs';
// Separate module instance avoids coupling this fixture's asset cache to the
// retained suite. The production executor bytes are unchanged.
import {applyPcNativeRenderModelPresentation} from '../graphics/ItemMaterialPresentation.js?fix5-regression';
export async function run(){
 const prior=await retained();const results=[];const check=(v,s)=>{if(!v)throw Error(s);results.push(s)};
 const equal=(a,b,s)=>check(a.every((v,i)=>Math.abs(v-b[i])<=2),`${s}: ${a} expected ${b}`);
 const r=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});r.setSize(64,64);document.body.append(r.domElement);
 const gl=r.getContext();const pixels=()=>{const x=new Uint8Array(4);gl.readPixels(32,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,x);return [...x]};
 const scene=new THREE.Scene();scene.background=new THREE.Color(0);const camera=new THREE.OrthographicCamera(-1.5,1.5,1.5,-1.5,.1,10);camera.position.z=3;
 const atlas=new THREE.DataTexture(new Uint8Array([160,100,40,255]),1,1),effect=new THREE.DataTexture(new Uint8Array([64,128,192,255]),1,1);
 for(const m of [atlas,effect]){m.userData.muImageReady=true;m.needsUpdate=true}
 const old=MUAssets.loadModelTexture;MUAssets.loadModelTexture=async(name,dir)=>dir==='Effect'?effect:atlas;const actors=[];
 const fixture=(count=1,target=0)=>({bones:[{name:'root',parent:-1,dummy:false,bindPosition:[0,0,0],bindQuaternion:[0,0,0,1]}],actions:[],
 meshes:Array.from({length:count},(_,i)=>({name:`fixture_${i}`,texture:0,positions:new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0].map((v,j)=>j%3===0&&i!==target?v+10:v)),
 normals:new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),uvs:new Float32Array(8),skinIndices:new Float32Array(16),skinWeights:new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]),indices:new Uint32Array([0,1,2,0,2,3])})),textures:Array.from({length:count},()=>({FileName:'fixture.jpg',Dir:'Item'}))});
 const actor=async(count=1,target=0)=>{const a=new MUModelRenderer();await a.initFromBMD(fixture(count,target));a.setLightEnabled(false);actors.push(a);return a};
 try{
  const a=await actor();scene.add(a.group);a.meshes[0].visible=false;
  const cases=[
   [F.CHROME|F.LIGHTMAP,[.5,.75,1],'lightmap'],
   [F.CHROME2|F.DARK,[.5,.75,1],'dark'],
   [F.COLOR|F.CHROME|F.DARK,[.5,.25,.75],'color-dark'],
   [F.TEXTURE|F.DARK,[.5,.25,.75],'texture-dark'],
   [F.COLOR|F.BRIGHT,[.1,.2,.3],'color-bright'],
   [F.TEXTURE|F.LIGHTMAP,[.5,.25,.75],'texture-ignores-lightmap'],
  ];
  const bg=[120,100,80];
  for(const [flags,tint,law] of cases){
   scene.background=new THREE.Color().setRGB(...bg.map(v=>v/255),THREE.SRGBColorSpace);
   const o=a.createOverlayPass(flags,{map:effect,color:new THREE.Color(...tint)});check(o?.meshes.length===1,`${law} creates a resident source pass`);r.render(scene,camera);
   const src=tint.map((t,i)=>t*(law.startsWith('color')?255:[64,128,192][i]));
   const expected=src.map((v,i)=>law.includes('dark')?Math.round(bg[i]*(1-v/255)):law==='lightmap'?Math.round(bg[i]*v/255):law==='color-bright'?Math.min(255,Math.round(bg[i]+v)):Math.round(v));
   equal(pixels().slice(0,3),expected,`${law} follows PC glBlendFunc RGB`);
   o.meshes.forEach(m=>m.visible=false);
  }
  // AlphaTest tests final opacity*texture alpha, with GL_GREATER 0.25.
  scene.background=new THREE.Color(0,0,1);const half=new THREE.DataTexture(new Uint8Array([255,0,0,128]),1,1);half.needsUpdate=true;
  const alpha=a.createOverlayPass(F.TEXTURE,{map:half,alpha:.4});r.render(scene,camera);equal(pixels().slice(0,3),[0,0,255],'modulated alpha below PC cutoff discards the fragment');
  alpha.setOpacity(.75);r.render(scene,camera);equal(pixels().slice(0,3),[96,0,159],'alpha above cutoff uses SRC_ALPHA/ONE_MINUS_SRC_ALPHA');alpha.meshes.forEach(m=>m.visible=false);half.dispose();
  // Independently simulate authored calls over one selected mesh. PC constants
  // are literal here; expected values do not call the new state helper.
  for(const [type,target] of [[78,2],[100,0],[130,0],[6920,0]]){
   const passes=[...nativeRenderModelPasses(type)];const model=await actor(Math.max(...passes.map(p=>p.mesh))+1,target);scene.remove(a.group);scene.add(model.group);scene.background=new THREE.Color(0);
   const result=await applyPcNativeRenderModelPresentation(model,{type,dynamic:false});
   check(result.complete&&result.skipped===0,`retained item ${type} now has a complete native program: ${JSON.stringify(result)} indices=${model.meshes.map(m=>m.userData.muMeshIndex)}`);
   check(model.meshes.every(m=>!m.visible),`retained item ${type} suppresses extra implicit base draws`);
   let dst=[0,0,0];
   for(const p of passes.filter(p=>p.mesh===target)){
    const tint=[p.red,p.green,p.blue].map(v=>v/255);
    const special=(p.mode&(4|8|512|1024|2048|4096))!==0;
    const source=tint.map((v,i)=>v*(special?[64,128,192]:[160,100,40])[i]);
    if(p.mode&64)dst=dst.map((d,i)=>Math.min(255,Math.round(d+source[i])));
    else if(p.mode&128)dst=dst.map((d,i)=>Math.round(d*(1-source[i]/255)));
    else if(special&&(p.mode&16))dst=dst.map((d,i)=>Math.round(d*source[i]/255));
    else dst=source.map(Math.round);
   }
   for(let frame=0;frame<3;frame++){r.render(scene,camera);equal(pixels().slice(0,3),dst,`retained item ${type} executes authored draw order frame ${frame+1}`)}
   scene.remove(model.group);model.dispose();
  }
  // Two complete actors overlap. Their authored programs must stay grouped,
  // rather than executing pass 1 of all actors, then pass 2 of all actors.
  const first=await actor(4,0),last=await actor(3,0);scene.add(first.group,last.group);
  await applyPcNativeRenderModelPresentation(first,{type:130,dynamic:false});
  await applyPcNativeRenderModelPresentation(last,{type:100,dynamic:false});
  check(first.group.renderOrder!==last.group.renderOrder,'complete actors have distinct stable Three group orders');
  for(let i=0;i<3;i++){r.render(scene,camera);equal(pixels().slice(0,3),[56,50,30],`overlapping actors preserve each full material program frame ${i+1}`)}
  scene.clear();const depthActor=await actor();depthActor.meshes[0].visible=false;scene.add(depthActor.group);
  scene.background=new THREE.Color().setRGB(120/255,100/255,80/255,THREE.SRGBColorSpace);
  const far=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({color:0xff0000,transparent:true,blending:THREE.NoBlending,depthWrite:false}));
  far.position.z=-.2;far.renderOrder=10000;scene.add(far);
  for(const [flags,expected,label] of [[F.CHROME|F.LIGHTMAP,[30,50,60],'LIGHTMAP writes depth'],[F.CHROME|F.DARK,[255,0,0],'DARK preserves disabled depth mask'],[F.COLOR|F.DARK,[0,0,0],'COLOR DisableTexture restores depth mask']]){
   const o=depthActor.createOverlayPass(flags,{map:effect});r.render(scene,camera);equal(pixels().slice(0,3),expected,label);o.meshes.forEach(m=>m.visible=false);
  }
  scene.remove(far);far.geometry.dispose();far.material.dispose();
  depthActor.meshes[0].geometry.setIndex([0,2,1,0,3,2]);
  for(const [flags,expected,label] of [[F.CHROME|F.LIGHTMAP,[120,100,80],'LIGHTMAP culls reversed winding'],[F.CHROME|F.DARK,[90,50,20],'DARK draws both face orientations']]){
   const o=depthActor.createOverlayPass(flags,{map:effect});r.render(scene,camera);equal(pixels().slice(0,3),expected,label);o.meshes.forEach(m=>m.visible=false);
  }
  check(gl.getError()===gl.NO_ERROR,'all fixed-function blend and depth branches render without WebGL errors');
 }finally{MUAssets.loadModelTexture=old;for(const a of actors)a.dispose();atlas.dispose();effect.dispose();r.dispose()}
 return {passed:prior.passed+results.length,retainedPassed:prior.passed,newPassed:results.length,results,environment:prior.environment};
}
