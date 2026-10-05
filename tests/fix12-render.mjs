import * as THREE from 'three';
import {run as retained} from './fix11-render.mjs';
import {MUAssets} from '../assets/MUAssetLoader.js';
import {RemoteAssets} from '../data/RemoteAssets.js';
import {renderIcon3D} from '../ui2/ItemIconRenderer.js';
export async function run() {
 const prior=await retained(),results=[];
 const check=(v,label)=>{if(!v)throw Error(label);results.push(label)};
 const oldRoot=RemoteAssets.baseUrl, oldLoad=MUAssets.loadModelTexture;
 const diffuse=new THREE.DataTexture(new Uint8Array([60,80,120,255]),1,1);
 const effect=new THREE.DataTexture(new Uint8Array([100,180,240,255]),1,1);
 for(const t of [diffuse,effect]){t.userData.muImageReady=true;t.needsUpdate=true}
 const cube=new THREE.BoxGeometry(240,240,240),count=cube.attributes.position.count;
 const mesh=()=>({positions:new Float32Array(cube.attributes.position.array),normals:new Float32Array(cube.attributes.normal.array),uvs:new Float32Array(cube.attributes.uv.array),indices:new Uint32Array(cube.index.array),skinIndices:new Float32Array(count*4),skinWeights:Float32Array.from({length:count*4},(_,i)=>i%4===0?1:0)});
 const bmd={bones:[{name:'root',parent:-1,dummy:false,bindPosition:[0,0,0],bindQuaternion:[0,0,0,1]}],actions:[],meshes:Array.from({length:5},mesh),textures:Array.from({length:5},()=>({FileName:'fixture.jpg',Dir:'Item'}))};
 let bmdLoads=0,fail=true,effectLoads=0;
 const io={loadBMD:async()=>{bmdLoads++;return bmd},fetchBinary:async()=>null};
 const render=()=>renderIcon3D(io,6697,0,{w:40,h:40},{iconPadding:32,twoHand:false,customColor:[1,1,1]});
 try {
  RemoteAssets.baseUrl='https://fixture.invalid/fix12-browser/';
  MUAssets.loadModelTexture=async(name,dir)=>{if(dir==='Effect'){effectLoads++;return fail?null:effect}return diffuse};
  check(await render()===null,'resident diffuse with missing implicit Chrome cannot publish an incomplete icon');
  check(effectLoads>0,'native program requests its implicit effect texture');
  fail=false;
  const recovered=await render();
  check(Boolean(recovered),'same item retries successfully after implicit Chrome recovery');
  check(bmdLoads===2,'missing implicit texture did not poison the thumbnail cache');
  const pixels=recovered.getContext('2d').getImageData(0,0,recovered.width,recovered.height).data;
  check(pixels.some((v,i)=>i%4===3&&v>0),'recovered icon contains rendered pixels');
  const cached=await render();
  check(Boolean(cached)&&cached!==recovered&&bmdLoads===2,'complete recovered icon is cached and cloned');
  RemoteAssets.baseUrl='https://fixture.invalid/fix12-browser-other/';
  fail=true;
  check(await render()===null,'new Data authority cannot borrow a cached material from previous Data');
  fail=false;
  check(Boolean(await render()),'new Data authority recovers its own material and icon');
 } finally {MUAssets.loadModelTexture=oldLoad;RemoteAssets.baseUrl=oldRoot;cube.dispose();diffuse.dispose();effect.dispose()}
 return {passed:prior.passed+results.length,retainedPassed:prior.passed,newPassed:results.length,results,environment:prior.environment};
}
