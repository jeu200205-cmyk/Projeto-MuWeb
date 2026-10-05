import {run as retained} from './fix16-render.mjs';
import * as THREE from 'three';
import {RemoteAssets} from '../data/RemoteAssets.js';
import {MUAssets} from '../assets/MUAssetLoader.js';
import {MUSprites} from '../ui/MUSprites.js';
import {CharacterPreview} from '../graphics/CharacterPreview.js';
import {clearComposedCharacterCache} from '../graphics/PlayerComposer.js';
import CharSelectScene from '../scenes/CharSelectScene.js';
import ServerSelectScene from '../scenes/ServerSelectScene.js';
import {MUModelRenderer} from '../assets/MUModelRenderer.js';
import {applyPcWheelWeaponAlpha} from '../game/PcWheelWeaponPose.js';
import {fixturePartBmd} from './fix4-fixtures.mjs';
function imageOwner(color){const image=document.createElement('canvas');image.width=512;image.height=512;const ctx=image.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,512,512);return{image,url:image.toDataURL()}}
export async function run(){
 const prior=await retained(),results=[];const check=(v,s)=>{if(!v)throw Error(s);results.push(s)};
 const saved={root:RemoteAssets.baseUrl,decoded:RemoteAssets.fetchDecodedImage,binary:RemoteAssets.fetchBinary,bmd:MUAssets.loadBMD,texture:MUAssets.loadModelTexture};
 const char=Object.create(CharSelectScene.prototype);char._applyAssets=()=>{};
 const server=Object.create(ServerSelectScene.prototype);server._applyFrames=()=>{};
 let fetches=0;
 try{
  RemoteAssets.configure('https://fixture.invalid/fix17-rootA/');RemoteAssets.fetchDecodedImage=async()=>{fetches++;return imageOwner('#ff0000')};
  await MUSprites.load();const framesA=MUSprites.frames('btnMenu');const count=fetches;await MUSprites.load();
  check(MUSprites.frames('btnMenu')===framesA&&fetches===count,'same Data reuses sprite frames without new decode');
  check(await char._loadAssets()&&await server._loadAssets(),'both scene caches prepare real canvas crops for Data A');
  RemoteAssets.configure('https://fixture.invalid/fix17-rootB/');
  check(MUSprites.get('chaId')===null&&MUSprites.frames('btnMenu')===null,'new Data cannot read old global UI owners');
  check(!char._ownersReady()&&!server._ownersReady(),'new Data invalidates cached readiness of both scenes');
  RemoteAssets.fetchDecodedImage=async()=>{fetches++;return imageOwner('#0000ff')};
  check(await char._loadAssets()&&await server._loadAssets(),'new Data restores both scene crops and full button states');
  check(MUSprites.frames('btnMenu')[0]!==framesA[0],'new Data Menu pixels come from new image owner');
  // Keep every old global sprite decoder unresolved while a newer Data completes.
  const pending=[];RemoteAssets.configure('https://fixture.invalid/fix17-old-pending/');
  RemoteAssets.fetchDecodedImage=()=>new Promise(r=>pending.push(r));const oldUi=MUSprites.load();
  const oldChar=char._loadAssets(),oldServer=server._loadAssets();await new Promise(r=>setTimeout(r,0));
  RemoteAssets.configure('https://fixture.invalid/fix17-new-ready/');RemoteAssets.fetchDecodedImage=async()=>imageOwner('#00ff00');
  await char._loadAssets();await server._loadAssets();const newer=MUSprites.frames('btnMenu')[0];
  pending.forEach(r=>r(imageOwner('#ff0000')));await oldUi;
  check(await oldChar===false&&await oldServer===false,'late old scene loads cannot report ready or apply crops to new Data');
  check(MUSprites.frames('btnMenu')[0]===newer&&char._ownersReady()&&server._ownersReady(),'late sprite decoder cannot overwrite new scene/button owners');
  clearComposedCharacterCache();let bmdLoads=0;
  const texture=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);texture.needsUpdate=true;texture.userData.muImageReady=true;
  MUAssets.loadBMD=async()=>{bmdLoads++;return{bones:[{name:'root',parent:-1,dummy:false,bindPosition:[0,0,0],bindQuaternion:[0,0,0,1]}],actions:[],meshes:[],textures:[]}};
  MUAssets.loadModelTexture=async()=>texture;RemoteAssets.fetchBinary=async()=>fixturePartBmd();
  const scene={scene:new THREE.Scene(),objects:[]};const preview=new CharacterPreview(scene);
  try{
   const chars=[{name:'authorityHero',classId:0,slot:0}];await preview.setChars(chars);const old=preview.slots[0];
   await preview.setChars(chars);check(preview.slots[0]===old&&bmdLoads===1,'unchanged character in same Data reuses complete preview');
   RemoteAssets.configure('https://fixture.invalid/fix17-preview-new/');await preview.setChars(chars);
   check(preview.slots[0]!==old&&bmdLoads===2&&scene.objects.length===1,'same name/class/CharSet rebuilds preview under new Data without duplicate owner');
  }finally{preview.dispose();texture.dispose();clearComposedCharacterCache()}
  // Actual production MU shader: compare real framebuffer alpha attenuation.
  const gpu=new THREE.WebGLRenderer({antialias:false});gpu.setSize(16,16);gpu.setClearColor(0,1);
  const world=new THREE.Scene(),camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,10);camera.position.z=5;
  const tex=new THREE.DataTexture(new Uint8Array([200,100,40,255]),1,1);tex.needsUpdate=true;tex.userData.muImageReady=true;
  MUAssets.loadModelTexture=async()=>tex;
  const data={bones:[{name:'root',parent:-1,dummy:false,bindPosition:[0,0,0],bindQuaternion:[0,0,0,1]}],actions:[],meshes:[{positions:new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0]),normals:new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),uvs:new Float32Array(8),skinIndices:new Float32Array(16),skinWeights:new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]),indices:new Uint32Array([0,1,2,0,2,3])}],textures:[{FileName:'fixture.jpg',Dir:'Item'}]};
  const model=new MUModelRenderer();await model.initFromBMD(data);model.setLightEnabled(false);world.add(model.group);
  const pixel=()=>{gpu.render(world,camera);const a=new Uint8Array(4),gl=gpu.getContext();gl.readPixels(8,8,1,1,gl.RGBA,gl.UNSIGNED_BYTE,a);return a};
  try{
   applyPcWheelWeaponAlpha(model,1);const full=pixel();check(full[0]>0,'MU weapon shader draws resident texture pixels at Alpha 1');
   for(const alpha of [.6,.5,.4,.3]){applyPcWheelWeaponAlpha(model,alpha);const faded=pixel();check(Math.abs(faded[0]-full[0]*alpha)<=2,`WHEEL2 real shader scales red pixels by PC Alpha ${alpha}`)}
  }finally{model.dispose();tex.dispose();gpu.dispose()}
 }finally{RemoteAssets.fetchDecodedImage=saved.decoded;RemoteAssets.fetchBinary=saved.binary;MUAssets.loadBMD=saved.bmd;MUAssets.loadModelTexture=saved.texture;RemoteAssets.configure(saved.root);clearComposedCharacterCache()}
 return {passed:prior.passed+results.length,retainedPassed:prior.passed,newPassed:results.length,results,environment:prior.environment};
}
