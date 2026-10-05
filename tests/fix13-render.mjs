import * as THREE from 'three';
import {run as retained} from './fix12-render.mjs';
import {MUAssets} from '../assets/MUAssetLoader.js';
import {RemoteAssets} from '../data/RemoteAssets.js';
import {renderIcon3D} from '../ui2/ItemIconRenderer.js';
export async function run(){
 const prior=await retained(),results=[];const check=(v,s)=>{if(!v)throw Error(s);results.push(s)};
 const oldRoot=RemoteAssets.baseUrl,oldLoad=MUAssets.loadModelTexture;
 const diffuse=new THREE.DataTexture(new Uint8Array([80,100,140,255]),1,1),chrome=new THREE.DataTexture(new Uint8Array([150,200,255,255]),1,1);
 for(const t of [diffuse,chrome]){t.userData.muImageReady=true;t.needsUpdate=true}
 const cube=new THREE.BoxGeometry(240,240,240),count=cube.attributes.position.count;
 const fixture={bones:[{name:'root',parent:-1,dummy:false,bindPosition:[0,0,0],bindQuaternion:[0,0,0,1]}],actions:[],meshes:[{positions:new Float32Array(cube.attributes.position.array),normals:new Float32Array(cube.attributes.normal.array),uvs:new Float32Array(cube.attributes.uv.array),indices:new Uint32Array(cube.index.array),skinIndices:new Float32Array(count*4),skinWeights:Float32Array.from({length:count*4},(_,i)=>i%4===0?1:0)}],textures:[{FileName:'fixture.jpg',Dir:'Item'}]};
 let fail=true,bmdLoads=0,effectLoads=0;const io={loadBMD:async()=>{bmdLoads++;return fixture},fetchBinary:async()=>null};
 const render=()=>renderIcon3D(io,0,7<<3,{w:40,h:40},{iconPadding:32,twoHand:false,customColor:[1,1,1]});
 try{
  RemoteAssets.baseUrl='https://fixture.invalid/fix13-browser/';
  MUAssets.loadModelTexture=async(name,dir)=>{if(dir==='Effect'){effectLoads++;return fail?null:chrome}return diffuse};
  check(await render()===null,'stock +7 icon waits when Chrome01 is unavailable');
  check(effectLoads===1,'stock item requests only the selected effect owner');
  fail=false;const recovered=await render();
  check(Boolean(recovered)&&bmdLoads===2,'stock icon retries and renders after Chrome01 recovery');
  const pixels=recovered.getContext('2d').getImageData(0,0,recovered.width,recovered.height).data;
  check(pixels.some((v,i)=>i%4===3&&v>0),'recovered stock material produces visible icon pixels');
  check(Boolean(await render())&&bmdLoads===2,'complete stock material enters thumbnail cache');
 }finally{RemoteAssets.baseUrl=oldRoot;MUAssets.loadModelTexture=oldLoad;cube.dispose();diffuse.dispose();chrome.dispose()}
 return {passed:prior.passed+results.length,retainedPassed:prior.passed,newPassed:results.length,results,environment:prior.environment};
}
