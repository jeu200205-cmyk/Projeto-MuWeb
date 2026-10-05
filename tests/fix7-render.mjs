import * as THREE from 'three';
import {MUAssets} from '../assets/MUAssetLoader.js';
import {MUModelRenderer} from '../assets/MUModelRenderer.js';
import {RemoteAssets} from '../data/RemoteAssets.js';
import {loadPcBitmapLuaOwners,resetPcBitmapLuaOwners,pcBitmapTexture} from '../data/PcBitmapLuaOwners.js';
import {applyPcNativeRenderModelPresentation} from '../graphics/ItemMaterialPresentation.js?fix7-regression';
import {run as retained} from './fix6-render.mjs';
export async function run(){
 const prior=await retained(),results=[];const check=(v,s)=>{if(!v)throw Error(s);results.push(s)};
 const r=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});r.setSize(64,64);document.body.append(r.domElement);const gl=r.getContext();
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1.5,1.5,1.5,-1.5,.1,10);scene.background=new THREE.Color(0);camera.position.z=3;
 const readPixel=()=>{const p=new Uint8Array(4);gl.readPixels(32,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p]};
 const eq=(expected,s)=>{const actual=readPixel().slice(0,3);check(actual.every((v,i)=>Math.abs(v-expected[i])<=2),`${s}: ${actual} expected ${expected}`)};
 const files=new Map([
 ['Configs/Lua/Controller/LoadImages.lua',`OpenFolder('Textures')
function LoadImages() for i=0,2 do LoadImage('Effect/dynamic'..i..'.tga',BASE+i) end end`],
 ['Configs/Lua/Manager/Textures/constants.lua','BASE=700230'],
 ['Configs/Lua/CharacterSystem/RenderModel.lua',`local allocated=LoadImageByDir('Effect/global.tga')
function StartLoadImages() assert(allocated==200000); local names={'winner'}
 for i,name in ipairs(names) do LoadImage('Effect/'..name..'.tga',700230+i) end end`],
 ]);
 const manifest=new Map([...files.keys()].map(p=>[p.toLowerCase(),p]));
 for(const p of ['Effect/dynamic0.OZT','Effect/dynamic1.OZT','Effect/dynamic2.OZT','Effect/winner.OZT','Effect/global.OZT'])manifest.set(p.toLowerCase(),p);
 const oldFetch=RemoteAssets.fetchBinary,oldManifest=RemoteAssets._ensureManifest,oldModel=MUAssets.loadModelTexture;
 const ozt=([red,g,blue,a])=>{const b=new Uint8Array(26);b[16]=1;b[18]=1;b[20]=32;b.set([blue,g,red,a],22);return b.buffer};
 const atlas=new THREE.DataTexture(new Uint8Array([220,10,10,255]),1,1),black=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);
 for(const t of [atlas,black]){t.userData.muImageReady=true;t.needsUpdate=true}
 const model=new MUModelRenderer();
 try{
  RemoteAssets._ensureManifest=async()=>manifest;
  RemoteAssets.fetchBinary=async p=>files.has(p)?new TextEncoder().encode(files.get(p)).buffer:p==='Effect/global.OZT'?ozt([60,140,210,255]):p==='Effect/winner.OZT'?ozt([20,170,80,255]):p.startsWith('Effect/')?ozt([100,40,30,255]):null;
  MUAssets.loadModelTexture=async(name,dir)=>dir==='Effect'?black:atlas;
  resetPcBitmapLuaOwners();const meta=await loadPcBitmapLuaOwners();check(meta.count===4&&meta.unavailable.length===0,'browser VM executes Lua globals, folder constants and both startup loops');
  check(meta.nextDynamicID===200001,'browser model globals allocate the first shared automatic ID');
  const map=await pcBitmapTexture(200000);check(map?.userData.muPcBitmapPath==='Effect/global.OZT','automatic bitmap ID resolves its actual encoded physical file');
  const mesh=(i)=>({name:'mesh'+i,texture:0,positions:new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0].map((v,j)=>j%3===0&&i!==0?v+10:v)),normals:new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),uvs:new Float32Array(8),skinIndices:new Float32Array(16),skinWeights:new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]),indices:new Uint32Array([0,1,2,0,2,3])});
  await model.initFromBMD({bones:[{name:'root',parent:-1,dummy:false,bindPosition:[0,0,0],bindQuaternion:[0,0,0,1]}],actions:[],meshes:Array.from({length:5},(_,i)=>mesh(i)),textures:Array.from({length:5},()=>({FileName:'atlas.jpg',Dir:'Item'}))});model.setLightEnabled(false);scene.add(model.group);
  const program=await applyPcNativeRenderModelPresentation(model,{type:142,dynamic:true});check(program.complete&&program.added===5,'real retained material program uses IDs calculated by startup Lua');
  for(const ms of [0,600,1800]){model.update(0,ms/1000);r.render(scene,camera);eq([20,170,80],`later model startup replaces loop-owned texture at ${ms}ms`)}
  model.meshes.forEach(m=>m.visible=false);model._overlayMeshes.forEach(m=>m.visible=false);
  const overlay=model.createOverlayPass(2,{mesh:0,map,color:new THREE.Color(1,1,1)});check(Boolean(overlay),'automatically allocated bitmap creates a resident PC texture draw');
  r.render(scene,camera);eq([60,140,210],'LoadImageByDir pixels reach the production WebGL shader');
  check(gl.getError()===gl.NO_ERROR,'Lua execution and dynamic bitmap draws produce no WebGL errors');
 }finally{RemoteAssets.fetchBinary=oldFetch;RemoteAssets._ensureManifest=oldManifest;MUAssets.loadModelTexture=oldModel;resetPcBitmapLuaOwners();model.dispose();atlas.dispose();black.dispose();r.dispose()}
 return {passed:prior.passed+results.length,retainedPassed:prior.passed,newPassed:results.length,results,environment:prior.environment};
}
