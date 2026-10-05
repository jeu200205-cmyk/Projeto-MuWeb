import * as THREE from 'three';
import {MUAssets} from '../assets/MUAssetLoader.js';
import { InventoryWindow } from '../ui2/InventoryWindow.js';
import {RemoteAssets} from '../data/RemoteAssets.js';
import {renderIcon3D} from '../ui2/ItemIconRenderer.js';
import {run as retained} from './fix7-render.mjs';
export async function run(){
 const prior=await retained(),results=[];const check=(v,s)=>{if(!v)throw Error(s);results.push(s)};
 const texture=new THREE.DataTexture(new Uint8Array([30,80,150,255]),1,1);texture.userData.muImageReady=true;texture.needsUpdate=true;
 const original=MUAssets.loadModelTexture;let fail=true,loads=0;
 // A broad real model-space surface intentionally extends beyond the slot.
 const fixture={bones:[{name:'root',parent:-1,dummy:false,bindPosition:[0,0,0],bindQuaternion:[0,0,0,1]}],actions:[],meshes:[{positions:new Float32Array([-120,-120,0,120,-120,0,120,120,0,-120,120,0]),normals:new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),uvs:new Float32Array(8),skinIndices:new Float32Array(16),skinWeights:new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]),indices:new Uint32Array([0,1,2,0,2,3])}],textures:[{FileName:'fixture.jpg',Dir:'Item'}]};
 const io={loadBMD:async()=>{loads++;return fixture},fetchBinary:async()=>null};
 const cube=new THREE.BoxGeometry(240,240,240),count=cube.attributes.position.count;
 Object.assign(fixture.meshes[0],{positions:new Float32Array(cube.attributes.position.array),normals:new Float32Array(cube.attributes.normal.array),uvs:new Float32Array(cube.attributes.uv.array),indices:new Uint32Array(cube.index.array),skinIndices:new Float32Array(count*4),skinWeights:Float32Array.from({length:count*4},(_,i)=>i%4===0?1:0)});cube.dispose();
 const custom={iconPadding:32,twoHand:false,customColor:[1,1,1]};
 const read=cv=>cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
 try{
  MUAssets.loadModelTexture=async()=>fail?null:texture;
  const missing=await renderIcon3D(io,1,0,{w:20,h:20},custom);check(missing===null,'incomplete texture cannot produce a cached blank inventory icon');
  fail=false;const cv=await renderIcon3D(io,1,0,{w:20,h:20},custom);check(Boolean(cv),'same inventory item retries and becomes resident after texture recovery');
  check(loads===2,'failed render did not poison the thumbnail cache');
  check(cv.width===84&&cv.height===84&&cv.dataset.muIconPadding==='32','guard band metadata survives canvas cloning');
  const cached=await renderIcon3D(io,1,0,{w:20,h:20},custom);check(loads===2&&cached!==cv,'complete cached item returns an independent canvas');
  const data=read(cv);let outside=0,inside=0;
  for(let y=0;y<cv.height;y++)for(let x=0;x<cv.width;x++)if(data[(y*cv.width+x)*4+3]){if(x<32||x>=52||y<32||y>=52)outside++;else inside++}
  check(inside>0,'authored item occupies its logical slot');check(outside>0,'authored pixels outside the slot are retained instead of clipped');
  const plain=await renderIcon3D(io,1,0,{w:20,h:20},{...custom,iconPadding:0});const cropped=read(plain);let same=true;
  for(let y=0;y<20;y++)for(let x=0;x<20;x++)for(let k=0;k<4;k++)if(Math.abs(cropped[(y*20+x)*4+k]-data[((y+32)*84+x+32)*4+k])>2)same=false;
  check(same,'guard band does not change item scale or projected slot position');
  const host=document.createElement('div');document.body.append(host);
  const windowOwner={_itemIO:async()=>io,_pcItemNumber:()=>null};
  let textureCalls=0;MUAssets.loadModelTexture=async()=>++textureCalls===1?null:texture;
  const slot=InventoryWindow.prototype._iconNode.call(windowOwner,{itemType:2,rawLevel:0,twoHand:false},20);host.append(slot);
  const deadline=performance.now()+4000;
  while(!slot.querySelector('canvas')&&performance.now()<deadline)await new Promise(r=>setTimeout(r,25));
  const node=slot.querySelector('canvas');
  check(Boolean(node)&&textureCalls===2,'connected inventory slot retries an incomplete texture and installs the recovered icon');
  check(node.style.left==='-32px'&&node.style.top==='-32px'&&node.style.width==='84px','inventory DOM preserves overspill pixels without shrinking them');
  check(node.style.pointerEvents==='none','overspill does not steal clicks from neighboring slots');host.remove();
  const oldRoot=RemoteAssets.baseUrl;
  try{
   RemoteAssets.baseUrl='https://fixture.invalid/fix10-new-root/';
   const before=loads;
   const fresh=await renderIcon3D(io,1,0,{w:20,h:20},custom);
   check(Boolean(fresh)&&loads===before+1,'switching Data authority cannot reuse the previous root thumbnail');
  }finally{RemoteAssets.baseUrl=oldRoot}

 }finally{MUAssets.loadModelTexture=original;texture.dispose()}
 return {passed:prior.passed+results.length,retainedPassed:prior.passed,newPassed:results.length,results,environment:prior.environment};
}
