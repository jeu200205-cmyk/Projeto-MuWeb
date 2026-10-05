import * as THREE from 'three';
import {MUAssets} from '../assets/MUAssetLoader.js';
import {MUModelRenderer} from '../assets/MUModelRenderer.js';
import {RemoteAssets} from '../data/RemoteAssets.js';
import {loadPcBitmapLuaOwners,pcBitmapTexture,resetPcBitmapLuaOwners} from '../data/PcBitmapLuaOwners.js';
import {applyPcNativeRenderModelPresentation} from '../graphics/ItemMaterialPresentation.js?fix6-regression';
import {nativeRenderModelPasses} from '../data/RenderModelNativeOracle.js';
import {run as retained} from './fix5-render.mjs';
export async function run(){
 const prior=await retained(),results=[];const check=(v,s)=>{if(!v)throw Error(s);results.push(s)};
 const equal=(a,b,s)=>check(a.every((v,i)=>Math.abs(v-b[i])<=2),`${s}: ${a} expected ${b}`);
 const r=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});r.setSize(64,64);document.body.append(r.domElement);const gl=r.getContext();
 const pixel=()=>{const p=new Uint8Array(4);gl.readPixels(32,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p]};
 const scene=new THREE.Scene();scene.background=new THREE.Color(0);const camera=new THREE.OrthographicCamera(-1.5,1.5,1.5,-1.5,.1,10);camera.position.z=3;
 const atlas=new THREE.DataTexture(new Uint8Array([200,10,20,255]),1,1),black=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);for(const t of [atlas,black]){t.userData.muImageReady=true;t.needsUpdate=true}
 const ids=new Set();for(let t=0;t<8192;t++)for(const p of nativeRenderModelPasses(t))if(p.textureOverride!=null)ids.add(p.textureOverride);
 const lua='function StartLoadImages()\n'+[...ids].map(id=>`LoadImage('Effect/bitmap_${id}.tga',${id})`).join('\n')+'\nend';
 const manifest=new Map([...ids].map(id=>[`effect/bitmap_${id}.ozt`,`Effect/bitmap_${id}.OZT`]));
 manifest.set('configs/lua/charactersystem/rendermodel.lua','Configs/Lua/CharacterSystem/RenderModel.lua');
 // Controlled encoded OZT files go through the production decoder and sampler.
 const ozt=rgba=>{const b=new Uint8Array(22+rgba.length*4);b[16]=rgba.length;b[18]=1;b[20]=32;for(let i=0;i<rgba.length;i++){const [red,g,blue,a]=rgba[i];b.set([blue,g,red,a],22+i*4)}return b.buffer};
 const oldFetch=RemoteAssets.fetchBinary,oldManifest=RemoteAssets._ensureManifest,oldRoot=RemoteAssets.baseUrl,oldModel=MUAssets.loadModelTexture;let second=false,halfAlpha=false;const fetched=[];
 RemoteAssets._ensureManifest=async()=>manifest;
 RemoteAssets.fetchBinary=async p=>{
  if(p==='Configs/Lua/CharacterSystem/RenderModel.lua')return new TextEncoder().encode(lua).buffer;
  if(p.startsWith('Configs/'))return null;
  fetched.push(p);if(p==='Effect/bitmap_700231.OZT')return ozt([second?[10,180,30,255]:[30,90,150,halfAlpha?128:255]]);
  if(p==='Effect/bitmap_700232.OZT')return ozt([[80,40,20,255],[20,120,240,255]]);
  return ozt([[40,80,120,255]]);
 };
 MUAssets.loadModelTexture=async(name,dir)=>dir==='Effect'?black:atlas;
 const models=[];
 const actor=async(type,target)=>{
  const count=Math.max(...[...nativeRenderModelPasses(type)].map(p=>p.mesh))+1;
  const fixture={bones:[{name:'root',parent:-1,dummy:false,bindPosition:[0,0,0],bindQuaternion:[0,0,0,1]}],actions:[],
   meshes:Array.from({length:count},(_,i)=>({name:`item_${i}`,texture:0,positions:new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0].map((v,j)=>j%3===0&&i!==target?v+10:v)),normals:new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),uvs:new Float32Array(8),skinIndices:new Float32Array(16),skinWeights:new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]),indices:new Uint32Array([0,1,2,0,2,3])})),textures:Array.from({length:count},()=>({FileName:'atlas.jpg',Dir:'Item'}))};
  const model=new MUModelRenderer();await model.initFromBMD(fixture);model.setLightEnabled(false);models.push(model);return model;
 };
 try{
  resetPcBitmapLuaOwners();const meta=await loadPcBitmapLuaOwners();check(meta.count===187,'startup parser registers controlled paths for all retained IDs');
  const decoded=await pcBitmapTexture(700231);const decodedPixels=decoded.image.data || decoded.image.getContext('2d').getImageData(0,0,1,1).data;check(decodedPixels[0]===30&&decodedPixels[1]===90,'registered OZT uses actual production byte decoder');
  check(decoded.minFilter===THREE.NearestFilter&&decoded.wrapS===THREE.ClampToEdgeWrapping,'numeric sampler preserves default PC nearest/clamp');
  const old=await actor(142,0),program=await applyPcNativeRenderModelPresentation(old,{type:142,dynamic:true});scene.add(old.group);
  check(program.complete&&program.added===5,'retained item 142 executes both explicit override draws');
  const opaque=old._overlayMeshes.find(m=>m.material.map?.userData?.muPcBitmapID===700231);
  check(opaque?.material.uniforms.alphaCutoff.value===.25,'RGBA override owns alpha test even when base atlas is RGB');
  for(const ms of [0,600,1800]){old.update(0,ms/1000);r.render(scene,camera);equal(pixel().slice(0,3),[30,90,150],`explicit bitmap replaces base and implicit effect pixels at ${ms}ms`)}
  scene.remove(old.group);
  const scrolling=await actor(611,3);await applyPcNativeRenderModelPresentation(scrolling,{type:611,dynamic:true});scene.add(scrolling.group);
  const draw=scrolling._overlayMeshes.find(m=>m.material.map?.userData?.muPcBitmapID===700232);
  check(Boolean(draw),'retained item 611 publishes explicit textured scroll pass');
  scrolling.meshes.forEach(m=>m.visible=false);scrolling._overlayMeshes.forEach(m=>m.visible=m===draw);
  for(const [ms,expected] of [[0,[40,20,10]],[1500,[10,60,120]],[3000,[10,60,120]]]){scrolling.update(0,ms/1000);r.render(scene,camera);equal(pixel().slice(0,3),expected,`explicit clamp scroll uses authored pixels without wrapping at ${ms}ms`)}
  check(draw.material.map.wrapS===THREE.ClampToEdgeWrapping,'scroll clone retains explicit bitmap clamp');scene.remove(scrolling.group);
  halfAlpha=true;resetPcBitmapLuaOwners();await loadPcBitmapLuaOwners();
  const half=await actor(142,0);await applyPcNativeRenderModelPresentation(half,{type:142,dynamic:false});scene.add(half.group);r.render(scene,camera);
  equal(pixel().slice(0,3),[35,85,135],'RGBA bitmap alpha blends over the preceding authored chrome despite RGB base atlas');scene.remove(half.group);halfAlpha=false;
  // A new Data root must decode a new file even when its relative path is equal.
  second=true;RemoteAssets.configure('http://fixture-authority-b.invalid/');await loadPcBitmapLuaOwners();
  const fresh=await actor(142,0);await applyPcNativeRenderModelPresentation(fresh,{type:142,dynamic:false});scene.add(fresh.group);r.render(scene,camera);
  equal(pixel().slice(0,3),[10,180,30],'new Data authority uses fresh decoded pixels for the same bitmap ID/path');scene.remove(fresh.group);
  scene.add(old.group);r.render(scene,camera);equal(pixel().slice(0,3),[30,90,150],'old live actor retains its prior texture ownership until retired');
  check(fetched.filter(p=>p==='Effect/bitmap_700231.OZT').length===3,'same physical bitmap path decoded once per namespace publication');
  check(gl.getError()===gl.NO_ERROR,'explicit bitmap shaders and root replacement produce no WebGL errors');
 }finally{RemoteAssets.fetchBinary=oldFetch;RemoteAssets._ensureManifest=oldManifest;RemoteAssets.configure(oldRoot);resetPcBitmapLuaOwners();MUAssets.loadModelTexture=oldModel;for(const m of models)m.dispose();atlas.dispose();black.dispose();r.dispose()}
 return {passed:prior.passed+results.length,retainedPassed:prior.passed,newPassed:results.length,results,environment:prior.environment};
}
