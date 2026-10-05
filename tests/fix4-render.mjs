import * as THREE from 'three';
import { MUAssets } from '../assets/MUAssetLoader.js';
import { MUModelRenderer } from '../assets/MUModelRenderer.js';
import { GameScene } from '../graphics/Scene.js';
import { run as retained } from './fix3-render.mjs';
export async function run() {
 const previous=await retained();const results=[];
 const check=(v,label)=>{if(!v)throw new Error(label);results.push(label)};
 const equal=(a,b,label)=>check(a.every((v,i)=>Math.abs(v-b[i])<=1),`${label}: got=${a}; expected=${b}`);
 const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(64,64);renderer.setPixelRatio(1);document.body.append(renderer.domElement);
 const gl=renderer.getContext();const pixel=()=>{const b=new Uint8Array(4);gl.readPixels(32,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,b);return [...b]};
 const camera=new THREE.OrthographicCamera(-1.5,1.5,1.5,-1.5,.1,10);camera.position.z=3;
 const fixture={bones:[{name:'root',parent:-1,dummy:false,bindPosition:[0,0,0],bindQuaternion:[0,0,0,1]}],actions:[],
 meshes:[{name:'body_0',texture:0,positions:new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0]),normals:new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),uvs:new Float32Array(8),
 skinIndices:new Float32Array(16),skinWeights:new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]),indices:new Uint32Array([0,1,2,0,2,3])}],textures:[{FileName:'fixture.jpg',Dir:'Player'}]};
 const oldLoad=MUAssets.loadModelTexture;const all=[];const textures=[];
 const visual=async(s,rgb,ready=true)=>{
  const map=new THREE.DataTexture(new Uint8Array([...rgb,255]),1,1);map.userData.muImageReady=true;map.needsUpdate=true;textures.push(map);
  MUAssets.loadModelTexture=async()=>map;const actor=new MUModelRenderer();await actor.initFromBMD(fixture);actor.setLightEnabled(false);all.push(actor);
  const object=new THREE.Group();object.add(actor.group);object.visible=false;object.userData.muStagedPlayerOwner={renderer:actor,extras:[]};
  if(!ready){actor.meshes[0].visible=false;actor.meshes[0].userData.textureReady=false;actor.meshes[0].userData.textureMissing='controlled-failure.jpg';}
  s.scene.add(object);return object;
 };
 const setup=async()=>{
  const s=new GameScene({});s.scene=new THREE.Scene();s.scene.background=new THREE.Color(0);s.renderer=renderer;s.camera={threeCamera:camera};s.cameraMode='game';
  const old=await visual(s,[255,0,0]);s.mainObject=old;s._playerRenderer=old.userData.muStagedPlayerOwner.renderer;s._playerExtras=[];old.visible=true;old.userData.muStagedPlayerOwner=null;return s;
 };
 const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
 try {
  for(const fail of [false,true]){
   const s=await setup(),slow=deferred();let n=0;s.attachPlayerCharacter=async()=>++n===1?slow.promise:visual(s,[0,255,0]);
   const first=s.replacePlayerCharacter(0);const next=await s.replacePlayerCharacter(0);
   if(fail)slow.reject(new Error('obsolete build failure'));else slow.resolve(await visual(s,[0,0,255]));
   check(await first===null,`obsolete ${fail?'failure':'completion'} rejected by production publication fence`);
   for(let i=0;i<8;i++){s.render();equal(pixel(),[0,255,0,255],`new body remains rendered after obsolete ${fail?'failure':'completion'} frame ${i+1}`);}
   check(s.mainObject===next && !s._playerRenderer._disposed,'latest published GPU body remains live');s.detachPlayerCharacter();
  }
  {
   const s=await setup(),old=s.mainObject,bad=await visual(s,[0,0,255],false);s.attachPlayerCharacter=async()=>bad;
   let rejected=false;try{await s.replacePlayerCharacter(0);}catch{rejected=true;}check(rejected,'incomplete real renderer is rejected before publication');
   for(let i=0;i<8;i++){s.render();equal(pixel(),[255,0,0,255],`failed texture replacement preserves actual old body frame ${i+1}`);}
   check(s.mainObject===old && !s._playerRenderer._disposed,'failure leaves live renderer and ownership unchanged');s.detachPlayerCharacter();
  }
  {
   const s=await setup(),slow=deferred();s.attachPlayerCharacter=()=>slow.promise;const job=s.replacePlayerCharacter(0);s.detachPlayerCharacter();
   slow.resolve(await visual(s,[0,0,255]));check(await job===null,'removed hero rejects late decoded GPU graph');
   s.render();equal(pixel(),[0,0,0,255],'removed hero does not reappear as a late blue body');
   check(s.scene.children.length===0,'late retired graph has no remaining scene owner');
  }
  check(gl.getError()===gl.NO_ERROR,'staging/disposal/draw sequence produces no WebGL errors');
 }finally{for(const actor of all)actor.dispose();for(const texture of textures)texture.dispose();MUAssets.loadModelTexture=oldLoad;renderer.dispose();}
 return {passed:previous.passed+results.length,retainedPassed:previous.passed,newPassed:results.length,results,environment:previous.environment};
}
