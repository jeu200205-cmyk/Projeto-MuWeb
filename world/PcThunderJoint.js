// PcThunderJoint.js — retained BITMAP_JOINT_THUNDER owner for the Icarus lanes
// ported in FIX56.  This is intentionally limited to the source subtypes used by
// WD_10HEAVEN: base subtype 6 (MoveObjectOnEffect) and +1 subtype 0
// (MoveHeavenThunder).  Other joint families stay fail-closed.
import * as THREE from 'three';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { tryAcquirePcParticle, releasePcParticle } from './PcParticleBudget.js';

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
  const dir=new THREE.Vector3().subVectors(end,start);const len=dir.length();if(!(len>0))return;
  dir.normalize();
  const camPos=new THREE.Vector3();camera?.getWorldPosition?.(camPos);
  const mid=new THREE.Vector3().addVectors(start,end).multiplyScalar(.5);
  const view=camPos.sub(mid).normalize();
  const side=new THREE.Vector3().crossVectors(dir,view);if(side.lengthSq()<1e-6)side.set(0,1,0);side.normalize();
  const up=new THREE.Vector3().crossVectors(side,dir).normalize();
  const segments=(pos.length/6)-1;
  const p=new THREE.Vector3(),off=new THREE.Vector3();
  for(let i=0;i<=segments;i++){
    const t=i/segments;p.lerpVectors(start,end,t);
    // Endpoints remain exact. Interior follows the retained thunder tail jitter.
    const envelope=Math.sin(Math.PI*t);const wobble=seedNoise(i,phase)*width*.42*envelope;
    off.copy(up).multiplyScalar(wobble);p.add(off);
    const half=width*.5*(.75+.25*Math.sin(Math.PI*t));
    const l=new THREE.Vector3().copy(p).addScaledVector(side,-half),r=new THREE.Vector3().copy(p).addScaledVector(side,half);
    let o=i*6;pos[o]=l.x;pos[o+1]=l.y;pos[o+2]=l.z;pos[o+3]=r.x;pos[o+4]=r.y;pos[o+5]=r.z;
  }
  mesh.geometry.attributes.position.needsUpdate=true;mesh.geometry.computeBoundingSphere();
}

export async function createPcThunderJoint({group,camera,start,end,bitmapPlusOne=false,subtype=0,scale=40,light=null}){
  if(!group||!start?.isVector3||!end?.isVector3)return null;
  // FIX56 is restricted to the exact Icarus call-sites.
  if(bitmapPlusOne ? subtype!==0 : subtype!==6)return null;
  if(!tryAcquirePcParticle())return null;
  const texture=await loadTexture();if(!texture){releasePcParticle();return null;}
  const geometry=makeGeometry(bitmapPlusOne?18:10);
  const c=Array.isArray(light)?new THREE.Color(light[0],light[1],light[2]):new THREE.Color(1,1,1);
  const material=new THREE.MeshBasicMaterial({map:texture,color:c,transparent:true,opacity:1,depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=6;
  mesh.userData.muPcOwner=bitmapPlusOne?'CreateJoint(BITMAP_JOINT_THUNDER+1,subtype0)':'CreateJoint(BITMAP_JOINT_THUNDER,subtype6)';
  // ZzzEffectJoint.cpp: +1 subtype0 LifeTime=20; base subtype6 LifeTime=rand()%20+6.
  const lifeTicks=bitmapPlusOne?20:(Math.floor(Math.random()*20)+6);
  const owner={mesh,start:start.clone(),end:end.clone(),width:Math.max(1,Number(scale)||1)*.12,lifeTicks,phase:Math.random()*100,camera,disposed:false};
  group.add(mesh);updateRibbon(owner,camera);
  return owner;
}
export function tickPcThunderJoint(owner){
  if(!owner||owner.disposed)return false;owner.phase+=.17;owner.lifeTicks-=1;updateRibbon(owner,owner.camera);
  // Source subtype6 picks grayscale light in constructor; +1 uses inherited white.
  if(owner.lifeTicks<=0){disposePcThunderJoint(owner);return false;}return true;
}
export function disposePcThunderJoint(owner){
  if(!owner||owner.disposed)return;owner.disposed=true;owner.mesh?.parent?.remove(owner.mesh);owner.mesh?.geometry?.dispose?.();owner.mesh?.material?.dispose?.();releasePcParticle();
}
export const PC_THUNDER_JOINT_TEXTURE=TEXTURE_PATH;
