import * as THREE from 'three';
import {run as retained} from './fix13-render.mjs';
import {MUAssets} from '../assets/MUAssetLoader.js';
import {RemoteAssets} from '../data/RemoteAssets.js';
import {renderIcon3D} from '../ui2/ItemIconRenderer.js';
export async function run(){
 const prior=await retained(),results=[];const check=(v,s)=>{if(!v)throw Error(s);results.push(s)};
 const oldRoot=RemoteAssets.baseUrl,oldLoad=MUAssets.loadModelTexture;
 const diffuse=new THREE.DataTexture(new Uint8Array([50,100,160,255]),1,1),bab2=new THREE.DataTexture(new Uint8Array([130,200,250,255]),1,1);
 for(const t of [diffuse,bab2]){t.userData.muImageReady=true;t.needsUpdate=true}
 const cube=new THREE.BoxGeometry(240,240,240),count=cube.attributes.position.count;
 const fixture={bones:[{name:'root',parent:-1,dummy:false,bindPosition:[0,0,0],bindQuaternion:[0,0,0,1]}],actions:[],meshes:[{positions:new Float32Array(cube.attributes.position.array),normals:new Float32Array(cube.attributes.normal.array),uvs:new Float32Array(cube.attributes.uv.array),indices:new Uint32Array(cube.index.array),skinIndices:new Float32Array(count*4),skinWeights:Float32Array.from({length:count*4},(_,i)=>i%4===0?1:0)}],textures:[{FileName:'fixture.jpg',Dir:'Item'}]};
 let fail=true,loads=0,effects=[];const io={loadBMD:async()=>{loads++;return fixture},fetchBinary:async()=>null};
 const render=(type,level=0)=>renderIcon3D(io,type,level,{w:40,h:40},{iconPadding:32,twoHand:false,customColor:[1,1,1]});
 try{
  RemoteAssets.baseUrl='https://fixture.invalid/fix14-browser/';
  MUAssets.loadModelTexture=async(name,dir)=>{if(dir==='Effect'){effects.push(name);return fail?null:bab2}return diffuse};
  check(await render(6671)===null,'Helper15 waits for its actual explicit bab2 owner');
  check(effects.join(',')==='bab2.OZJ','Helper15 requests bab2 once without Shiny or Chrome02');
  fail=false;const recovered=await render(6671);
  check(Boolean(recovered)&&loads===2,'Helper15 retries and renders both passes after bab2 recovery');
  const pixels=recovered.getContext('2d').getImageData(0,0,recovered.width,recovered.height).data;
  check(pixels.some((v,i)=>i%4===3&&v>0),'explicit bab2 material produces visible GPU pixels');
  check(Boolean(await render(6671))&&loads===2,'complete explicit material is cached after recovery');
  effects=[];fail=true;RemoteAssets.baseUrl='https://fixture.invalid/fix14-potion/';
  check(Boolean(await render(7195,1<<3)),'Potion27 level1 renders its base without unavailable unused Chrome');
  check(effects.length===0,'Potion27 level1 requires no effect texture request in production icon renderer');
 }finally{RemoteAssets.baseUrl=oldRoot;MUAssets.loadModelTexture=oldLoad;cube.dispose();diffuse.dispose();bab2.dispose()}
 return {passed:prior.passed+results.length,retainedPassed:prior.passed,newPassed:results.length,results,environment:prior.environment};
}
