import {run as retained} from './fix15-render.mjs';
import * as THREE from 'three';
import {CharacterPreview} from '../graphics/CharacterPreview.js';
import {clearComposedCharacterCache} from '../graphics/PlayerComposer.js';
import {MUAssets} from '../assets/MUAssetLoader.js';
import {RemoteAssets} from '../data/RemoteAssets.js';
import {MUSprites} from '../ui/MUSprites.js';
import CharSelectScene from '../scenes/CharSelectScene.js';
import ServerSelectScene from '../scenes/ServerSelectScene.js';
function triangleBmd(){
 const bytes=new Uint8Array(340),v=new DataView(bytes.buffer);let o=0;
 bytes.set([66,77,68,10]);o=36;v.setInt16(o,1,true);o=42;
 for(const n of [3,3,3,1,0]){v.setInt16(o,n,true);o+=2}
 for(const p of [[0,0,0],[10,0,0],[0,0,10]]){v.setInt16(o,0,true);for(let j=0;j<3;j++)v.setFloat32(o+4+j*4,p[j],true);o+=16}
 for(let i=0;i<3;i++){v.setInt16(o,0,true);v.setFloat32(o+12,1,true);v.setInt16(o+16,i,true);o+=20}
 o+=24;bytes[o]=3;
 for(let j=0;j<3;j++)for(let i=0;i<3;i++)v.setInt16(o+2+j*8+i*2,i,true);
 o+=64;bytes.set(new TextEncoder().encode('fixture.jpg'),o);return bytes.slice(0,o+32).buffer;
}
export async function run(){
 const prior=await retained(),results=[];const check=(v,s)=>{if(!v)throw Error(s);results.push(s)};
 const saved={bmd:MUAssets.loadBMD,texture:MUAssets.loadModelTexture,binary:RemoteAssets.fetchBinary,decoded:RemoteAssets.fetchDecodedImage};
 const map=new THREE.DataTexture(new Uint8Array([180,90,30,255]),1,1);map.userData.muImageReady=true;map.needsUpdate=true;
 let release;const game={scene:new THREE.Scene(),objects:[]};const preview=new CharacterPreview(game);
 const gpu=new THREE.WebGLRenderer({antialias:false});gpu.setSize(32,32);gpu.setClearColor(0,1);
 const camera=new THREE.OrthographicCamera(-12,12,12,-12,.1,2000);
 const pixels=()=>{gpu.render(game.scene,camera);const out=new Uint8Array(32*32*4);gpu.getContext().readPixels(0,0,32,32,gpu.getContext().RGBA,gpu.getContext().UNSIGNED_BYTE,out);return out};
 const bones=[{name:'root',parent:-1,dummy:false,bindPosition:[0,0,0],bindQuaternion:[0,0,0,1]}];
 try{
  clearComposedCharacterCache();MUAssets.loadBMD=async()=>({bones,actions:[],meshes:[],textures:[]});
  RemoteAssets.fetchBinary=async()=>triangleBmd();MUAssets.loadModelTexture=async()=>map;
  await preview.setChars([{name:'browserHero',classId:0,slot:0}]);
  const old=preview.slots[0];check(Boolean(old)&&old.renderer.meshes.length===5,'real CharacterPreview composes five valid synthetic v10 class parts');
  for(const mesh of old.renderer.meshes) old.renderer.setLightEnabled(false);
  game.scene.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(old.outer),center=box.getCenter(new THREE.Vector3());
  const gm=old.renderer.meshes[0],points=[0,1,2].map(i=>new THREE.Vector3().fromBufferAttribute(gm.geometry.attributes.position,i).applyMatrix4(gm.matrixWorld));
  const normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
  camera.position.copy(center).addScaledVector(normal,1000);camera.lookAt(center);camera.updateMatrixWorld();
  const initialPixels=pixels();check(initialPixels.some((v,i)=>i%4!==3&&v>0),'actual CharacterPreview class geometry renders nonblack WebGL pixels');
  // A shared residency promise lets every class mesh complete together.
  const wait=new Promise(r=>{release=r});MUAssets.loadModelTexture=()=>wait;
  const changing=preview.setChars([{name:'browserHero',classId:0,slot:1}]);await new Promise(r=>setTimeout(r,0));
  check(preview.slots[0]===old&&game.scene.children.length===1,'changing CharSet/slot retains complete scene while textures await');
  check(pixels().every((v,i)=>v===initialPixels[i]),'pending preview texture cannot erase or change prior WebGL frame');
  const latest=preview.setChars([{name:'browserHero',classId:0,slot:2}]);await new Promise(r=>setTimeout(r,0));
  release(map);await Promise.all([changing,latest]);
  check(preview.slots.length===1&&preview.slots[0].char.slot===2,'last async CharacterPreview generation wins after texture completion');
  check(game.objects.length===1&&game.scene.children.length===1,'superseded preview cannot leak scene or animation owner');
  const ready=preview.slots[0];preview.selectSlot(2);const readyPixels=pixels();MUAssets.loadModelTexture=async()=>{throw Error('fixture missing body pixels')};
  await preview.setChars([{name:'browserHero',classId:0,slot:3}]);
  check(preview.slots[0]===ready,'actual missing body pixels retain previous complete preview');
  check(pixels().every((v,i)=>v===readyPixels[i]),'failed preview body load preserves complete WebGL frame byte for byte');
  const lateWait=new Promise(r=>{release=r});MUAssets.loadModelTexture=()=>lateWait;
  const exiting=preview.setChars([{name:'browserHero',classId:0,slot:4}]);await new Promise(r=>setTimeout(r,0));preview.dispose();release(map);await exiting;
  check(game.scene.children.length===0&&game.objects.length===0,'disposing while textures await prevents late CharacterPreview publication');
 }finally{preview.dispose();MUAssets.loadBMD=saved.bmd;MUAssets.loadModelTexture=saved.texture;RemoteAssets.fetchBinary=saved.binary;clearComposedCharacterCache();map.dispose();gpu.dispose()}
 // Isolated sprite cache, real canvas slices, synthetic images only.
 const {MUSprites:isolated}=await import('../ui/MUSprites.js?fix16-regression');
 let failMenu=true,menuLoads=0,goodLoads=0;
 RemoteAssets.fetchDecodedImage=async(path)=>{
  if(path.includes('server_menu')){menuLoads++;if(failMenu)return null}else goodLoads++;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#a06030';ctx.fillRect(0,0,512,512);
  return {image:canvas,url:canvas.toDataURL()};
 };
 try{
  await isolated.load();check(isolated.frames('btnMenu')===null,'temporarily absent PC Menu owner remains absent');
  const cachedGood=goodLoads;failMenu=false;await isolated.load();
  check(isolated.frames('btnMenu')?.length===3,'Menu retries and slices its three authored states');
  check(menuLoads===2&&goodLoads===cachedGood,'sprite retry reloads missing owner while retaining good owners');
 }finally{RemoteAssets.fetchDecodedImage=saved.decoded}
 const methods={load:MUSprites.load,strip:MUSprites.stripFrames,decoded:MUSprites.fetchDecodedImage,get:MUSprites.get,frames:MUSprites.frames};
 let missing=true;const url='data:image/png;base64,';
 try{
  MUSprites.load=async()=>{};MUSprites.get=()=>url;
  MUSprites.frames=key=>key==='btnMenu'?[url,null,url]:Array(4).fill(url);
  MUSprites.fetchDecodedImage=async()=>({url,image:document.createElement('canvas')});
  const char=Object.create(CharSelectScene.prototype);char._applyAssets=()=>{};
  await char._loadAssets();check(char._ownersReady()===false,'Character Select gate rejects missing Menu hover frame');
  MUSprites.frames=key=>Array(key==='btnMenu'?3:4).fill(url);
  check(char._ownersReady()===true,'Character Select gate accepts all authored states');
  MUSprites.stripFrames=async key=>key==='serverGroupBtn'?(missing?[url,null,url,url]:Array(4).fill(url)):Array(3).fill(url);
  const server=Object.create(ServerSelectScene.prototype);server._applyFrames=()=>{};
  check(await server._loadAssets()===false,'Server Select gate rejects missing group hover frame');missing=false;
  check(await server._loadAssets()===true,'Server Select retries incomplete strip before first paint');
 }finally{Object.assign(MUSprites,{load:methods.load,stripFrames:methods.strip,fetchDecodedImage:methods.decoded,get:methods.get,frames:methods.frames})}
 return {passed:prior.passed+results.length,retainedPassed:prior.passed,newPassed:results.length,results,environment:prior.environment};
}
