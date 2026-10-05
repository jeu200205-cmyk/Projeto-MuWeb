import {run as retained} from './fix22-render.mjs';
import * as THREE from 'three';
import {MUModelRenderer} from '../assets/MUModelRenderer.js';
import {MUAssets} from '../assets/MUAssetLoader.js';
export async function run(){
 const prior=await retained();if(prior.error)return prior;
 const results=[];const check=(v,s)=>{if(!v)throw Error(s);results.push(s)};
 const saved=MUAssets.loadModelTexture;let gpu,a,b,tex;
 try{
  gpu=new THREE.WebGLRenderer({antialias:false});gpu.setSize(32,16);gpu.setClearColor(0,1);
  const scene=new THREE.Scene(),cam=new THREE.OrthographicCamera(-2,2,1,-1,.1,10);cam.position.z=5;
  tex=new THREE.DataTexture(new Uint8Array([160,160,160,255]),1,1);tex.needsUpdate=true;tex.userData.muImageReady=true;MUAssets.loadModelTexture=async()=>tex;
  const data={bones:[{name:'root',parent:-1,dummy:false,bindPosition:[0,0,0],bindQuaternion:[0,0,0,1]}],actions:[],textures:[{FileName:'fixture.jpg',Dir:'Item'}],meshes:[{positions:new Float32Array([-.4,-.4,0,.4,-.4,0,.4,.4,0,-.4,.4,0]),normals:new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),uvs:new Float32Array(8),skinIndices:new Float32Array(16),skinWeights:new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]),indices:new Uint32Array([0,1,2,0,2,3])}]};
  a=new MUModelRenderer();b=new MUModelRenderer();await a.initFromBMD(data);await b.initFromBMD(data);
  a.setLightEnabled(false);b.setLightEnabled(false);a.setBodyLight(new THREE.Color(1,0,0));b.setBodyLight(new THREE.Color(0,0,1));
  a.bones[0].position.x=-1;b.bones[0].position.x=1;scene.add(a.group,b.group);
  const gl=gpu.getContext(),pixel=new Uint8Array(4);const read=x=>{gpu.render(scene,cam);gl.readPixels(x,8,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel]};
  const left=read(8),right=read(24);
  check(a.meshes[0].geometry===b.meshes[0].geometry&&left[0]>100&&left[2]<3&&right[2]>100&&right[0]<3,'shared geometry GPU draw retains independent bone palettes and red/blue materials');
  scene.remove(a.group);a.dispose();const survivor=read(24);
  check(survivor[2]>100&&survivor[0]<3,'disposing preview/old map does not retire surviving actor GPU geometry');
  b.bones[0].position.x=0;const moved=read(16);
  check(moved[2]>100&&moved[0]<3,'surviving actor can animate shared geometry after sibling disposal');
  return {passed:prior.passed+results.length,retainedPassed:prior.passed,newPassed:results.length,results,environment:prior.environment};
 }catch(e){return {error:e.stack,passed:prior.passed+results.length,results}}
 finally{MUAssets.loadModelTexture=saved;a?.dispose();b?.dispose();tex?.dispose();gpu?.dispose()}
}
