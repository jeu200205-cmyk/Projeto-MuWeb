// effects2/DisplayPotionFX.js — Main 5.2 ReceiveDisplayEffectViewport 0x01/0x03.
// Exact PC owner chain:
//   CreateEffect(BITMAP_MAGIC+1,..., SubType=5, Owner)
//   constructor LifeTime=20 logical 25-Hz ticks
//   MoveEffect -> CreateHealing every tick -> 3× BITMAP_JOINT_HEALING subtype 11
//   healing joint: LifeTime=12, Scale=5, MaxTails=2, Velocity=0;
//   MoveJoint generic step then Velocity+=4, MoveHumming(target+120Z, Turn=10),
//   Light=(0.9,0.49,0.04)*((12-LifeTime)*0.1).
// Subtype 5 is an invisible controller in RenderEffects; only its healing joints render.
// Joint asset: Effect/JointEnergy01.jpg (.OZJ in Data).
import * as THREE from 'three';
import { RemoteAssets } from '../data/RemoteAssets.js';

const PC_TICK = 1 / 25;
const MAGIC_LIFE = 20;
const JOINT_LIFE = 12;
const JOINT_SCALE = 5;
const JOINT_MAX_TAILS = 2;
const JOINT_POOL_SIZE = 39; // spawn-before-retire scheduler peak: 3 * (12 + 1)
const texCache = new Map();

async function loadTex(path) {
  if (texCache.has(path)) return await texCache.get(path);
  const p=(async()=>{try{const url=await RemoteAssets.fetchImageURL(path);if(!url)return null;const t=await new Promise((ok,bad)=>new THREE.TextureLoader().load(url,ok,undefined,bad));t.colorSpace=THREE.SRGBColorSpace;return t;}catch{return null;}})();
  texCache.set(path,p); const t=await p; texCache.set(path,t); return t;
}

function angleMatrix(a){
  const d=Math.PI/180, sy=Math.sin(a[2]*d), cy=Math.cos(a[2]*d), sp=Math.sin(a[1]*d), cp=Math.cos(a[1]*d), sr=Math.sin(a[0]*d), cr=Math.cos(a[0]*d);
  return [
    [cp*cy, sr*sp*cy-cr*sy, cr*sp*cy+sr*sy],
    [cp*sy, sr*sp*sy+cr*cy, cr*sp*sy-sr*cy],
    [-sp,   sr*cp,          cr*cp],
  ];
}
function rotate(v,m){return [v[0]*m[0][0]+v[1]*m[0][1]+v[2]*m[0][2],v[0]*m[1][0]+v[1]*m[1][1]+v[2]*m[1][2],v[0]*m[2][0]+v[1]*m[2][1]+v[2]*m[2][2]];}
function createAngle(x1,y1,x2,y2){
  const nx=x2-x1, ny=y2-y1;
  if(Math.abs(nx)<1e-4)return ny<0?0:180;
  if(Math.abs(ny)<1e-4)return nx<0?270:90;
  let r=Math.atan(ny/nx)/Math.PI*180+90;
  if(nx<0)r+=180;
  while(r<0)r+=360; while(r>=360)r-=360; return r;
}
function turnAngle2(angle,a,d){
  if(angle<0)angle+=360;if(a<0)a+=360;let aa;
  if(angle<180){aa=angle-d;if(a>=angle+d&&a<angle+180)angle+=d;else if(aa>=0&&(a>=angle+180||a<aa))angle-=d;else if(aa<0&&a>=angle+180&&a<aa+360)angle=angle-d+360;else angle=a;}
  else{aa=angle+d;if(a<angle-d&&a>=angle-180)angle-=d;else if(aa<360&&(a<angle-180||a>=aa))angle+=d;else if(aa>=360&&a<angle-180&&a>=aa-360)angle=angle+d-360;else angle=a;}
  return angle;
}
function moveHumming(pos,ang,target,turn){
  ang[2]=turnAngle2(ang[2],createAngle(pos[0],pos[1],target[0],target[1]),turn);
  const dx=pos[0]-target[0],dy=pos[1]-target[1],dist=Math.hypot(dx,dy);
  ang[0]=turnAngle2(ang[0],360-createAngle(pos[2],dist,target[2],0),turn);
}
function threeToMu(v){return [v.x,-v.z,v.y];}
function muToThree(v,out=new THREE.Vector3()){return out.set(v[0],v[2],-v[1]);}

export async function preloadDisplayPotionTextures(){await loadTex('Effect/JointEnergy01.OZJ');}

function tailCorners(pos,ang,scale=JOINT_SCALE){
  const m=angleMatrix(ang),h=scale*.5;
  return [[-h,0,0],[h,0,0],[0,0,-h],[0,0,h]].map(v=>{const r=rotate(v,m);return [pos[0]+r[0],pos[1]+r[1],pos[2]+r[2]];});
}
function writeTailMesh(mesh,current,previous){
  if(!mesh||!current||!previous)return;
  const a=mesh.geometry.attributes.position.array;
  const vs=[current[2],current[3],previous[3],previous[2],current[0],current[1],previous[1],previous[0]];
  let n=0;for(const v of vs){const t=muToThree(v);a[n++]=t.x;a[n++]=t.y;a[n++]=t.z;}
  mesh.geometry.attributes.position.needsUpdate=true;
  mesh.geometry.computeBoundingSphere();
}
function makeTailMesh(tex,scene){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(8*3),3));
  // PC NumTails=1, MaxTails=2 => Light1=1, Light2=0.
  g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array([
    1,1, 1,0, 0,0, 0,1,
    1,0, 1,1, 0,1, 0,0,
  ]),2));
  g.setIndex([0,1,2,0,2,3,4,5,6,4,6,7]);
  const m=new THREE.MeshBasicMaterial({map:tex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,color:new THREE.Color(0,0,0)});
  const mesh=new THREE.Mesh(g,m);mesh.frustumCulled=false;mesh.visible=false;scene.add(mesh);return mesh;
}

export function playDisplayPotionEffect(actorRoot,scene){
  if(!actorRoot||!scene)return null;
  const effectOrigin=threeToMu(actorRoot.position); let effectLife=MAGIC_LIFE,acc=0,disposed=false,pending=1;
  const joints=[]; let jointTex=null;
  // FIX92: PC has 3 subtype-11 spawns per authored tick. Because this scheduler
  // spawns before retiring the oldest 12-tick generation, reserve 39 meshes (13 generations) and
  // reuse meshes/materials instead of allocating/freeing Geometry+Material up
  // to 60 times per display effect.  Logical spawn/lifetime/tail semantics stay
  // unchanged; only WebGL ownership is pooled.
  const meshPool=[], freeMeshes=[];
  const build=async()=>{
    jointTex=await loadTex('Effect/JointEnergy01.OZJ');
    if(jointTex&&!disposed){for(let i=0;i<JOINT_POOL_SIZE;i++){const m=makeTailMesh(jointTex,scene);meshPool.push(m);freeMeshes.push(m);}}
    pending=0;
  }; build().catch(()=>{pending=0;});
  function acquireMesh(){const m=freeMeshes.pop()||null;if(m){m.visible=false;m.material.color.setRGB(0,0,0);}return m;}
  function releaseMesh(m){if(!m)return;m.visible=false;if(!freeMeshes.includes(m))freeMeshes.push(m);}

  function spawnJoint(){
    const p=[0,-200,0];
    for(let i=0;i<3;i++){
      const ang=[Math.floor(Math.random()*90),0,Math.floor(Math.random()*360)];
      const r=rotate(p,angleMatrix(ang)); const pos=[effectOrigin[0]-r[0],effectOrigin[1]-r[1],effectOrigin[2]-r[2]+120];
      const initial=tailCorners(pos,ang);
      const state={pos,ang,velocity:0,life:JOINT_LIFE,currentTail:initial,previousTail:initial.map(v=>v.slice()),mesh:acquireMesh()};
      if(state.mesh)writeTailMesh(state.mesh,state.currentTail,state.previousTail);
      joints.push(state);
    }
  }
  function ensureMesh(j){if(!j.mesh&&jointTex){j.mesh=acquireMesh();if(j.mesh)writeTailMesh(j.mesh,j.currentTail,j.previousTail);}}
  function tickJoint(j){
    // MoveJoint pre-switch generic movement: (0,-Velocity,0) rotated by current Angle.
    if(j.velocity!==0){const d=rotate([0,-j.velocity,0],angleMatrix(j.ang));j.pos[0]+=d[0];j.pos[1]+=d[1];j.pos[2]+=d[2];}
    j.velocity+=4;
    const liveOwner=threeToMu(actorRoot.position); const target=[liveOwner[0],liveOwner[1],liveOwner[2]+120]; moveHumming(j.pos,j.ang,target,10);
    const lum=(12-j.life)*0.1, c=[lum*.9,lum*.49,lum*.04];
    // CreateTail happens after MoveJoint: shift one prior cross-section then author the new one.
    j.previousTail=j.currentTail.map(v=>v.slice());j.currentTail=tailCorners(j.pos,j.ang);
    ensureMesh(j);if(j.mesh){writeTailMesh(j.mesh,j.currentTail,j.previousTail);j.mesh.material.color.setRGB(c[0],c[1],c[2]);j.mesh.visible=true;}
    j.life-=1;
  }
  function disposeJoint(j){if(j.mesh){releaseMesh(j.mesh);j.mesh=null;}}
  function disposePool(){for(const m of meshPool){scene.remove(m);m.geometry.dispose();m.material.dispose();}meshPool.length=0;freeMeshes.length=0;}
  return {update(dt){if(disposed)return false;acc+=Math.max(0,Number(dt)||0);while(acc>=PC_TICK){acc-=PC_TICK;if(effectLife>0){spawnJoint();effectLife--;}for(let i=joints.length-1;i>=0;i--){tickJoint(joints[i]);if(joints[i].life<0){disposeJoint(joints[i]);joints.splice(i,1);}}}return effectLife>0||joints.length>0||pending>0;},dispose(){if(disposed)return;disposed=true;for(const j of joints)disposeJoint(j);joints.length=0;disposePool();}};
}
