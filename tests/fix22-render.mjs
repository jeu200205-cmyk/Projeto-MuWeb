import {run as retained} from './fix21-render.mjs';
import * as THREE from 'three';
import {MUModelRenderer} from '../assets/MUModelRenderer.js';
import {MUAssets} from '../assets/MUAssetLoader.js';
import {installPcLoginObjectPresentation} from '../world/PcLoginObjectPresentation.js';
function fixture(meshes){return {bones:[{name:'root',parent:-1,dummy:false,bindPosition:[0,0,0],bindQuaternion:[0,0,0,1]}],actions:[],textures:[{FileName:'fixture.jpg',Dir:'Object95'}],meshes:Array.from({length:meshes},()=>({positions:new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0]),normals:new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),uvs:new Float32Array([.25,.25,.25,.25,.25,.25,.25,.25]),skinIndices:new Float32Array(16),skinWeights:new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]),indices:new Uint32Array([0,1,2,0,2,3])}))}}
export async function run(){
 const prior=await retained();if(prior.error)return prior;
 const results=[];const check=(v,s)=>{if(!v)throw Error(s);results.push(s)};
 const saved=MUAssets.loadModelTexture;let gpu,water,hull,texture,chrome;
 try{
  gpu=new THREE.WebGLRenderer({antialias:false});gpu.setSize(16,16);gpu.setClearColor(0,1);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,10);camera.position.z=5;
  const gl=gpu.getContext(),pixel=new Uint8Array(4);const read=()=>{gpu.render(scene,camera);gl.readPixels(8,8,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel]};
  texture=new THREE.DataTexture(new Uint8Array([120,0,0,255,0,120,0,255]),1,2);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.needsUpdate=true;texture.userData.muImageReady=true;
  MUAssets.loadModelTexture=async()=>texture;water=new MUModelRenderer();await water.initFromBMD(fixture(2));
  let now=0;await installPcLoginObjectPresentation(95,1,water,{clock:()=>now});scene.add(water.group);
  check(water._overlayMeshes.length===1&&water.meshes.every(m=>!m.visible),'actual MU renderer replaces water body with one mesh0 pass');
  let p=read();check(p[0]>100&&p[1]<3&&p[2]<3,'water GPU pass samples original texture at initial authored UV phase');
  now=2000;water.update(.04,.04);p=read();check(p[1]>100&&p[0]<3&&p[2]<3,'water GPU pixels advance with shared clock despite zero BMD clips');
  scene.remove(water.group);
  chrome=new THREE.DataTexture(new Uint8Array([120,120,120,255]),1,1);chrome.needsUpdate=true;chrome.userData.muImageReady=true;
  hull=new MUModelRenderer();await hull.initFromBMD(fixture(29));await installPcLoginObjectPresentation(95,5,hull,{loadChrome:async()=>chrome});
  check(hull._overlayMeshes.length===13,'real MU renderer publishes all thirteen boat diffuse/chrome calls');
  hull.meshes.forEach(m=>m.visible=false);hull._overlayMeshes.forEach((m,i)=>m.visible=i===0);scene.add(hull.group);p=read();
  check(p[0]>70&&p[1]>60&&p[2]>20&&Math.abs(p[1]/p[0]-.875)<.03&&Math.abs(p[2]/p[0]-.375)<.03,'boat chrome shader retains source .8/.7/.3 RGB instead of white');
  return {passed:prior.passed+results.length,retainedPassed:prior.passed,newPassed:results.length,results,environment:prior.environment};
 }catch(e){return {error:e.stack,passed:prior.passed+results.length,results}}
 finally{MUAssets.loadModelTexture=saved;water?.dispose();hull?.dispose();texture?.dispose();chrome?.dispose();gpu?.dispose()}
}
