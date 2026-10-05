import {GameApp} from '../core/GameApp.js';
import {RemoteAssets} from '../data/RemoteAssets.js';
import {run as retained} from './fix17-render.mjs';
import * as THREE from 'three';
import {createMuTerrainMesh} from '../graphics/MuTerrain.js';
import CharSelectScene from '../scenes/CharSelectScene.js';
import {pcPartObjectColor} from '../graphics/PcItemChromeColors.js';
import {MUModelRenderer,RenderFlags} from '../assets/MUModelRenderer.js';
import {MUAssets} from '../assets/MUAssetLoader.js';
const canvas=(w,h,color)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,w,h);return c.toDataURL()};
export async function run(){
 const prior=await retained(),results=[],check=(x,s)=>{if(!x)throw Error(s);results.push(s)};
 const mapData={layer1:new Uint8Array(65536),layer2:new Uint8Array(65536).fill(255),alpha:new Uint8Array(65536)};
 const heights=new Float32Array(65536),ground=canvas(256,256,'#aa8844'),light=canvas(256,256,'#ffffff'),grass=canvas(256,32,'rgba(0,120,0,.5)');
 let strictRequests=[];
 const io={THREE,fetchImageURL:async(p,options)=>{
  if(options?.exactOnly){strictRequests.push(p);return null}
  if(p.endsWith('/TerrainLight.OZJ'))return light;
  if(p.endsWith('/TileGrass01.OZJ'))return ground;
  return null;
 }};
 const noGrass=await createMuTerrainMesh(io,3,mapData,heights);
 try{check(noGrass.mesh.userData.terrainGrassCells===0,'Devias same-stem JPEG ground cannot become vertical grass walls');check(noGrass.mesh.userData.terrainTiles.some(p=>p.endsWith('TileGrass01.OZJ')),'ground JPEG remains rendered by its original terrain owner');check(strictRequests.length===6&&strictRequests.every(p=>p.startsWith('World3/')&&!p.endsWith('.OZJ')),'all grass candidates are exact World3 TGA/OZT lookups');}finally{noGrass.mesh.userData.dispose();noGrass.mesh.geometry.dispose();noGrass.mesh.material.dispose()}
 let active=0,maxActive=0;
 const real={THREE,fetchImageURL:async(p,o)=>{
  if(o?.exactOnly){active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,5));active--;return p.endsWith('/TileGrass01.OZT')?grass:null}
  return p.endsWith('/TerrainLight.OZJ')?light:p.endsWith('/TileGrass01.OZJ')?ground:null;
 }};
 const actual=await createMuTerrainMesh(real,75,mapData,heights);
 try{check(actual.mesh.userData.terrainGrassCells===65536,'real World75 OZT grass keeps all PC authored cell owners');check(maxActive===3,'three independent grass owners decode concurrently');const mesh=actual.mesh.children[0].children[0];check(Math.abs(mesh.geometry.attributes.position.getY(0)-64)<1e-6,'OZT height32 produces exact PC blade height64, not ground height512');check(actual.mesh.userData.terrainGrassSources[0].includes('TileGrass01.OZT'),'grass residency identifies correct alpha-texture owner');}finally{actual.mesh.userData.dispose();actual.mesh.geometry.dispose();actual.mesh.material.dispose()}
 // Execute GameApp's actual MoveCustom prefetch with one encrypted placement.
 const originalFetch=RemoteAssets.fetchBinary,originalBmd=MUAssets.loadBMD,originalRoot=RemoteAssets.baseUrl;
 const plain=new Uint8Array(34),dv=new DataView(plain.buffer);dv.setUint16(2,1,true);dv.setFloat32(6,100,true);dv.setFloat32(10,100,true);dv.setFloat32(30,1,true);
 const key=[0xD1,0x73,0x52,0xF6,0xD2,0x9A,0xCB,0x27,0x3E,0xAF,0x59,0x31,0x37,0xB3,0xE7,0xA2];let rolling=0x5E;
 const encrypted=plain.map((p,i)=>{const b=((p+rolling)&255)^key[i%16];rolling=(b+0x3D)&255;return b});
 const app=Object.create(GameApp.prototype);app.scenes={currentName:'world'};let binaryCalls=0,bmdCalls=0,missing=false;
 const start=async(map)=>{app._startWorldPrefetch(map,{priority:'move'});await new Promise(r=>setTimeout(r,10));await app._worldPrefetchJob};
 try{
  RemoteAssets.configure('https://fixture.invalid/fix18-move/');RemoteAssets.fetchBinary=async p=>{binaryCalls++;return p.endsWith('.obj')?encrypted.buffer:new Uint8Array([1]).buffer};MUAssets.loadBMD=async()=>{bmdCalls++;return missing?null:{textures:[]}};
  await start(0);const count=binaryCalls,bmd=bmdCalls;check(app._worldPrefetchCompleted.size===1,'complete MoveCustom prefetch memoizes current WorldN and Data');
  await start(2);await start(0);check(binaryCalls===count+4&&bmdCalls===bmd+1,'returning hover to completed Lorencia skips repeated terrain/object scan');
  RemoteAssets.configure('https://fixture.invalid/fix18-move-new/');await start(0);check(binaryCalls>count+4,'different Data cannot reuse prior prefetch completion');
  missing=true;await start(1);const failedCount=bmdCalls;await start(1);check(bmdCalls===failedCount+1,'incomplete BMD prefetch remains retryable');
  missing=false;await start(1);const ready=bmdCalls;await start(1);check(bmdCalls===ready,'recovered complete prefetch is reused');
 }finally{app._worldPrefetchAbort?.abort();RemoteAssets.fetchBinary=originalFetch;MUAssets.loadBMD=originalBmd;RemoteAssets.configure(originalRoot)}
 // Real DOM: duplicate replies must not leave an orphan overlay after OK.
 const scene=new CharSelectScene();scene.el=document.createElement('div');scene.el.style.cssText='position:fixed;inset:0;z-index:10000;pointer-events:none';document.body.appendChild(scene.el);
 scene.showDeleteResult(2,'test');scene.showDeleteResult(2,'test');check(scene.el.querySelectorAll('[data-mu-modal]').length===1,'duplicate refusal replaces one modal instead of stacking overlays');
 check(getComputedStyle(scene.modal).pointerEvents==='auto','delete refusal intercepts input even under transparent non-interactive parent');
 window.__fix18Modal={scene,results};
 await new Promise((resolve,reject)=>{window.__fix18Dismiss=()=>{try{check(scene.modal===null&&scene.el.querySelectorAll('[data-mu-modal]').length===0,'actual browser pointer click OK removes refusal and restores scene');resolve()}catch(e){reject(e)}};scene.modal.querySelector('button').addEventListener('click',window.__fix18Dismiss);});
 scene.showDeleteResult(2);scene.dispose();check(scene.modal===null&&scene.el.children.length===0,'scene disposal removes result modal and listeners');scene.el.remove();
 // Actual MU renderer's additive pass, using exact PC orange instead of white.
 const saved=MUAssets.loadModelTexture,gpu=new THREE.WebGLRenderer({antialias:false});gpu.setSize(16,16);gpu.setClearColor(0,1);
 const world=new THREE.Scene(),cam=new THREE.OrthographicCamera(-2,2,2,-2,.1,10);cam.position.z=5;
 const tex=new THREE.DataTexture(new Uint8Array([160,160,160,255]),1,1);tex.needsUpdate=true;tex.userData.muImageReady=true;MUAssets.loadModelTexture=async()=>tex;
 const model=new MUModelRenderer();
 try{
 await model.initFromBMD({bones:[{name:'root',parent:-1,dummy:false,bindPosition:[0,0,0],bindQuaternion:[0,0,0,1]}],actions:[],textures:[{FileName:'fixture.jpg',Dir:'Item'}],meshes:[{positions:new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0]),normals:new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),uvs:new Float32Array(8),skinIndices:new Float32Array(16),skinWeights:new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]),indices:new Uint32Array([0,1,2,0,2,3])}]});
 model.setLightEnabled(false);model.meshes.forEach(m=>m.visible=false);model.createOverlayPass(RenderFlags.TEXTURE|RenderFlags.BRIGHT,{map:tex,color:new THREE.Color(...pcPartObjectColor(0))});world.add(model.group);gpu.render(world,cam);const pixel=new Uint8Array(4),gl=gpu.getContext();gl.readPixels(8,8,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);check(pixel[0]>100&&Math.abs(pixel[1]-pixel[0]*.5)<3&&pixel[2]===0,'MU additive shader renders PC orange channel proportions instead of white');
 }finally{MUAssets.loadModelTexture=saved;model.dispose();tex.dispose();gpu.dispose()}
 return {passed:prior.passed+results.length,retainedPassed:prior.passed,newPassed:results.length,results,environment:prior.environment};
}
