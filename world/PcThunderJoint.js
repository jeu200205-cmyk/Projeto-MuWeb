// PcThunderJoint.js — retained BITMAP_JOINT_THUNDER owner for the Icarus lanes
// ported in FIX56.  This is intentionally limited to the source subtypes used by
// WD_10HEAVEN: base subtype 6 (MoveObjectOnEffect) and +1 subtype 0
// (MoveHeavenThunder).  Other joint families stay fail-closed.
import * as THREE from 'three';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { tryAcquirePcParticle, releasePcParticle } from './PcParticleBudget.js';
import { acquirePcJointSlot, releasePcJointSlot } from './PcJointPool.js';

const TEXTURE_PATH='Effect/JointThunder01.OZJ';
let texturePromise=null;
async function loadTexture(){
  if(texturePromise)return texturePromise;
  texturePromise=(async()=>{const d=await RemoteAssets.fetchDecodedImage(TEXTURE_PATH);if(!d?.image)return null;const t=new THREE.Texture(d.image);t.needsUpdate=true;t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.ClampToEdgeWrapping;t.minFilter=t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.userData.muPcBitmapPath=TEXTURE_PATH;return t;})().catch(()=>null);
  return texturePromise;
}
function seedNoise(i,phase){
  // deterministic per-segment wobble.  The desktop joint creates retained tails
  // from its velocity/random constructor; this keeps the same authored width/life
  // without allocating a new geometry every frame.
  return Math.sin((i+1)*12.9898+phase*78.233)*0.5;
}
function makeGeometry(segments=12){
  const g=new THREE.BufferGeometry();
  const count=(segments+1)*2;
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3));
  const uv=new Float32Array(count*2);
  for(let i=0;i<=segments;i++){const u=i/segments;uv[(i*2)*2]=u;uv[(i*2)*2+1]=0;uv[(i*2+1)*2]=u;uv[(i*2+1)*2+1]=1;}
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  const idx=[];for(let i=0;i<segments;i++){const a=i*2,b=a+1,c=a+2,d=a+3;idx.push(a,b,c,b,d,c);}g.setIndex(idx);g.computeBoundingSphere();return g;
}
function updateRibbon(owner,camera){
  const {start,end,mesh,width,phase}=owner;
  const pos=mesh.geometry.attributes.position.array;
  const q=owner._scratch||(owner._scratch={dir:new THREE.Vector3(),cam:new THREE.Vector3(),mid:new THREE.Vector3(),view:new THREE.Vector3(),side:new THREE.Vector3(),up:new THREE.Vector3(),p:new THREE.Vector3(),off:new THREE.Vector3(),l:new THREE.Vector3(),r:new THREE.Vector3()});
  const dir=q.dir.subVectors(end,start);const len=dir.length();if(!(len>0))return;
  dir.normalize(); camera?.getWorldPosition?.(q.cam);
  q.mid.addVectors(start,end).multiplyScalar(.5); q.view.copy(q.cam).sub(q.mid).normalize();
  q.side.crossVectors(dir,q.view);if(q.side.lengthSq()<1e-6)q.side.set(0,1,0);q.side.normalize();
  q.up.crossVectors(q.side,dir).normalize();
  const segments=(pos.length/6)-1;
  for(let i=0;i<=segments;i++){
    const t=i/segments;q.p.lerpVectors(start,end,t);
    const envelope=Math.sin(Math.PI*t);const wobble=seedNoise(i,phase)*width*.42*envelope;
    q.off.copy(q.up).multiplyScalar(wobble);q.p.add(q.off);
    const half=width*.5*(.75+.25*Math.sin(Math.PI*t));
    q.l.copy(q.p).addScaledVector(q.side,-half);q.r.copy(q.p).addScaledVector(q.side,half);
    let o=i*6;pos[o]=q.l.x;pos[o+1]=q.l.y;pos[o+2]=q.l.z;pos[o+3]=q.r.x;pos[o+4]=q.r.y;pos[o+5]=q.r.z;
  }
  mesh.geometry.attributes.position.needsUpdate=true;mesh.geometry.computeBoundingSphere();
}

export async function createPcThunderJoint({group,camera,start,end,bitmapPlusOne=false,subtype=0,scale=40,light=null}){
  if(!group||!start?.isVector3||!end?.isVector3)return null;
  // FIX56 is restricted to the exact Icarus call-sites.
  if(bitmapPlusOne ? subtype!==0 : subtype!==6)return null;
  if(!tryAcquirePcParticle())return null;
  const jointSlot=acquirePcJointSlot(bitmapPlusOne?'BITMAP_JOINT_THUNDER+1:0':'BITMAP_JOINT_THUNDER:6');
  const texture=await loadTexture();if(!texture){releasePcJointSlot(jointSlot);releasePcParticle();return null;}
  const geometry=makeGeometry(bitmapPlusOne?18:10);
  const c=Array.isArray(light)?new THREE.Color(light[0],light[1],light[2]):new THREE.Color(1,1,1);
  const material=new THREE.MeshBasicMaterial({map:texture,color:c,transparent:true,opacity:1,depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=6;
  mesh.userData.muPcOwner=bitmapPlusOne?'CreateJoint(BITMAP_JOINT_THUNDER+1,subtype0)':'CreateJoint(BITMAP_JOINT_THUNDER,subtype6)';
  // ZzzEffectJoint.cpp: +1 subtype0 LifeTime=20; base subtype6 LifeTime=rand()%20+6.
  const lifeTicks=bitmapPlusOne?20:(Math.floor(Math.random()*20)+6);
  const owner={mesh,start:start.clone(),end:end.clone(),width:Math.max(1,Number(scale)||1)*.12,lifeTicks,phase:Math.random()*100,camera,disposed:false,jointSlot};
  mesh.userData.muPcJointIndex=jointSlot.index;
  group.add(mesh);updateRibbon(owner,camera);
  return owner;
}
export function tickPcThunderJoint(owner){
  if(!owner||owner.disposed)return false;owner.phase+=.17;owner.lifeTicks-=1;updateRibbon(owner,owner.camera);
  // Source subtype6 picks grayscale light in constructor; +1 uses inherited white.
  if(owner.lifeTicks<=0){disposePcThunderJoint(owner);return false;}return true;
}
export function disposePcThunderJoint(owner){
  if(!owner||owner.disposed)return;owner.disposed=true;owner.mesh?.parent?.remove(owner.mesh);owner.mesh?.geometry?.dispose?.();owner.mesh?.material?.dispose?.();releasePcJointSlot(owner.jointSlot);releasePcParticle();
}
export const PC_THUNDER_JOINT_TEXTURE=TEXTURE_PATH;

// FIX84: shared-draw retained thunder batch used by Icarus cloud controllers.
// The old Web lane created one THREE.Mesh/material/geometry per logical joint.
// Main 5.2 submits the joint family through one retained effect renderer; on
// WebGL the per-joint mesh path produced 1,200-1,800 draw calls in World11.
// This batch preserves every logical joint/lifetime/width/light but packs all
// live ribbons owned by one controller into ONE dynamic mesh/draw call.
export async function createPcThunderJointBatch({group,camera,bitmapPlusOne=false,subtype=6,maxJoints=64}={}){
  if(!group) return null;
  if(bitmapPlusOne ? subtype!==0 : subtype!==6) return null;
  const texture=await loadTexture(); if(!texture) return null;
  const segments=bitmapPlusOne?18:10;
  const vertsPer=(segments+1)*2, idxPer=segments*6;
  const cap=Math.max(4,Math.min(2048,maxJoints|0));
  const pos=new Float32Array(cap*vertsPer*3);
  const col=new Float32Array(cap*vertsPer*3);
  const uv=new Float32Array(cap*vertsPer*2);
  const idx=new Uint32Array(cap*idxPer);
  for(let j=0;j<cap;j++){
    const vb=j*vertsPer, ib=j*idxPer;
    for(let i=0;i<=segments;i++){
      const u=i/segments, a=(vb+i*2)*2, b=a+2;
      uv[a]=u;uv[a+1]=0;uv[b]=u;uv[b+1]=1;
    }
    for(let i=0;i<segments;i++){
      const a=vb+i*2,b=a+1,c=a+2,d=a+3,o=ib+i*6;
      idx[o]=a;idx[o+1]=b;idx[o+2]=c;idx[o+3]=b;idx[o+4]=d;idx[o+5]=c;
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color',new THREE.BufferAttribute(col,3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv',new THREE.BufferAttribute(uv,2)); geo.setIndex(new THREE.BufferAttribute(idx,1));
  geo.setDrawRange(0,0);
  const mat=new THREE.MeshBasicMaterial({map:texture,color:0xffffff,vertexColors:true,transparent:true,opacity:1,depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
  const mesh=new THREE.Mesh(geo,mat);mesh.frustumCulled=false;mesh.renderOrder=6;mesh.visible=false;
  mesh.userData.muPcOwner=bitmapPlusOne?'CreateJointBatch(BITMAP_JOINT_THUNDER+1,subtype0)':'CreateJointBatch(BITMAP_JOINT_THUNDER,subtype6)';
  group.add(mesh);
  const joints=[];
  const vDir=new THREE.Vector3(),camPos=new THREE.Vector3(),mid=new THREE.Vector3(),view=new THREE.Vector3(),side=new THREE.Vector3(),up=new THREE.Vector3(),p=new THREE.Vector3(),off=new THREE.Vector3(),l=new THREE.Vector3(),r=new THREE.Vector3();
  let disposed=false;
  const release=(j)=>{releasePcJointSlot(j.jointSlot);releasePcParticle();};
  const write=()=>{
    let n=0;
    camera?.getWorldPosition?.(camPos);
    for(const j of joints){
      if(n>=cap) break;
      vDir.subVectors(j.end,j.start); const len=vDir.length(); if(!(len>0)) continue; vDir.normalize();
      mid.addVectors(j.start,j.end).multiplyScalar(.5); view.copy(camPos).sub(mid).normalize();
      side.crossVectors(vDir,view); if(side.lengthSq()<1e-6)side.set(0,1,0); side.normalize(); up.crossVectors(side,vDir).normalize();
      const vb=n*vertsPer; const rgb=j.light;
      for(let i=0;i<=segments;i++){
        const t=i/segments; p.lerpVectors(j.start,j.end,t);
        const envelope=Math.sin(Math.PI*t), wobble=seedNoise(i,j.phase)*j.width*.42*envelope;
        off.copy(up).multiplyScalar(wobble); p.add(off);
        const half=j.width*.5*(.75+.25*Math.sin(Math.PI*t)); l.copy(p).addScaledVector(side,-half); r.copy(p).addScaledVector(side,half);
        const vo=(vb+i*2)*3;
        pos[vo]=l.x;pos[vo+1]=l.y;pos[vo+2]=l.z;pos[vo+3]=r.x;pos[vo+4]=r.y;pos[vo+5]=r.z;
        col[vo]=rgb[0];col[vo+1]=rgb[1];col[vo+2]=rgb[2];col[vo+3]=rgb[0];col[vo+4]=rgb[1];col[vo+5]=rgb[2];
      }
      n++;
    }
    geo.setDrawRange(0,n*idxPer);geo.attributes.position.needsUpdate=true;geo.attributes.color.needsUpdate=true;mesh.visible=n>0;
  };
  return {
    mesh,joints,
    spawn(start,end,scale=40,light=null){
      if(disposed||!start?.isVector3||!end?.isVector3||joints.length>=cap)return false;
      if(!tryAcquirePcParticle())return false;
      const jointSlot=acquirePcJointSlot(bitmapPlusOne?'BITMAP_JOINT_THUNDER+1:0':'BITMAP_JOINT_THUNDER:6');
      const lifeTicks=bitmapPlusOne?20:(Math.floor(Math.random()*20)+6);
      const rgb=Array.isArray(light)?[Number(light[0])||0,Number(light[1])||0,Number(light[2])||0]:[1,1,1];
      joints.push({start:start.clone(),end:end.clone(),width:Math.max(1,Number(scale)||1)*.12,lifeTicks,phase:Math.random()*100,light:rgb,jointSlot});
      write(); return true;
    },
    tick(){
      if(disposed)return false;
      for(let i=joints.length-1;i>=0;i--){const j=joints[i];j.phase+=.17;j.lifeTicks-=1;if(j.lifeTicks<=0){release(j);joints.splice(i,1);}}
      write(); return joints.length>0;
    },
    dispose(){if(disposed)return;disposed=true;for(const j of joints)release(j);joints.length=0;mesh.parent?.remove(mesh);geo.dispose();mat.dispose();},
  };
}
