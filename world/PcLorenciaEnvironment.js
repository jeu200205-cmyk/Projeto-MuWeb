// PcLorenciaEnvironment.js — retained Main 5.2 WD_0LORENCIA leaf owner.
// Source: ZzzEffectFireLeave.cpp::CreateLorenciaLeaf / MoveHeavenRain / RenderLeaves.
// Uses the real final BITMAP_LEAF1 asset load (World1/leaf01.jpg -> leaf01.OZJ).
import * as THREE from 'three';
import { RemoteAssets } from '../data/RemoteAssets.js';

const PC_HZ=25, TICK=1/PC_HZ, MAX_LEAVES=80;
const LEAF_PATH='World1/leaf01.OZJ';
const ri=(n)=>Math.floor(Math.random()*Math.max(1,n));
const rad=(d)=>d*Math.PI/180;

let leafTexturePromise=null;
async function loadLeafTexture(){
  if(leafTexturePromise)return leafTexturePromise;
  leafTexturePromise=(async()=>{
    const d=await RemoteAssets.fetchDecodedImage(LEAF_PATH);
    if(!d?.image||!(d.w>0)||!(d.h>0))return null;
    const t=new THREE.Texture(d.image);t.needsUpdate=true;t.colorSpace=THREE.SRGBColorSpace;
    t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;
    t.userData.muPcBitmapPath=LEAF_PATH;return t;
  })().catch(()=>null);
  return leafTexturePromise;
}
function heroMu(scene){const p=scene?.mainObject?.position;if(!p?.isVector3)return null;return{x:p.x,y:-p.z,z:p.y};}
function cameraMu(scene){const p=scene?.camera?.threeCamera?.position;if(!p?.isVector3)return null;return{x:p.x,y:-p.z,z:p.y};}
function spawn(p,hero,cam){
  p.x=hero.x+(ri(1600)-800);p.y=hero.y+(ri(1400)-500);p.z=hero.z+(ri(300)+50);
  p.sx=p.x;p.sy=p.y;p.sz=p.z;
  p.vx=-(ri(64)+64)*.1;
  if(cam&&p.y<cam.y+400)p.vx=-p.vx+3.2;
  p.vy=(ri(32)-16)*.1;p.vz=(ri(32)-16)*.1;
  p.ax=(ri(16)-8)*.1;p.ay=(ri(64)-32)*.1;p.az=(ri(16)-8)*.1;
  p.live=true;
}
function step(p){
  p.vx+=(ri(16)-8)*.1;p.vy+=(ri(16)-8)*.1;p.vz+=(ri(16)-8)*.1;
  p.x+=p.vx;p.y+=p.vy;p.z+=p.vz;
  p.ax+=(ri(8)-4)*.02;p.ay+=(ri(16)-8)*.02;p.az+=(ri(8)-4)*.02;
  const dx=p.sx-p.x,dy=p.sy-p.y,dz=p.sz-p.z;
  if(dx*dx+dy*dy+dz*dz>=200000)p.live=false;
}

// B converts MU Z-up [x,y,z] to Three/Web [x,z,-y].
const B=new THREE.Matrix4().set(1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,0,0,1);
const BIN=B.clone().invert();
const R=new THREE.Matrix4(), TMP=new THREE.Matrix4(), OUT=new THREE.Matrix4();
function instanceMatrix(p){
  const ax=rad(p.ax),ay=rad(p.ay),az=rad(p.az),sr=Math.sin(ax),cr=Math.cos(ax),sp=Math.sin(ay),cp=Math.cos(ay),sy=Math.sin(az),cy=Math.cos(az);
  const m00=cp*cy,m10=cp*sy,m20=-sp,m01=sr*sp*cy-cr*sy,m11=sr*sp*sy+cr*cy,m21=sr*cp,m02=cr*sp*cy+sr*sy,m12=cr*sp*sy-sr*cy,m22=cr*cp;
  R.set(m00,m01,m02,0, m10,m11,m12,0, m20,m21,m22,0, 0,0,0,1);
  TMP.multiplyMatrices(B,R);OUT.multiplyMatrices(TMP,BIN);
  OUT.setPosition(p.x,p.z,-p.y);return OUT;
}
function leafGeometry(){
  // Exact RenderPlane3D(3,3) vertices, converted MU -> Three basis once.
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([
    -3,-3, 3,  3,-3,-3,  3,3,-3, -3,3,3,
  ],3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,1,1,1,0,0,0],2));
  g.setIndex([0,1,2,0,2,3]);g.computeBoundingSphere();return g;
}

export function createPcLorenciaEnvironmentOwner(gameScene){
  const group=new THREE.Group();group.name='Lorencia_PC_Leaves';
  group.userData.muPcOwner='ZzzEffectFireLeave.cpp::CreateLorenciaLeaf/MoveHeavenRain/RenderLeaves';
  group.userData.muPcLeafPath=LEAF_PATH;group.userData.muPcMaxLeaves=MAX_LEAVES;
  const leaves=Array.from({length:MAX_LEAVES},()=>({live:false,x:0,y:0,z:0,sx:0,sy:0,sz:0,vx:0,vy:0,vz:0,ax:0,ay:0,az:0}));
  let mesh=null,geometry=null,material=null,disposed=false,acc=0;
  void loadLeafTexture().then((texture)=>{
    if(disposed||!texture){if(!texture)group.userData.muPcLeafMissing=LEAF_PATH;return;}
    geometry=leafGeometry();material=new THREE.MeshBasicMaterial({map:texture,color:0xffffff,transparent:true,alphaTest:.01,depthTest:true,depthWrite:true,side:THREE.DoubleSide,toneMapped:false});
    mesh=new THREE.InstancedMesh(geometry,material,MAX_LEAVES);mesh.name='Lorencia_BITMAPPLEAF1_80';mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);
  });
  const publish=()=>{if(!mesh)return;const h=heroMu(gameScene),cam=cameraMu(gameScene);if(!h)return;for(let i=0;i<MAX_LEAVES;i++){const p=leaves[i];if(!p.live)spawn(p,h,cam);mesh.setMatrixAt(i,instanceMatrix(p));}mesh.instanceMatrix.needsUpdate=true;};
  const tick=()=>{const h=heroMu(gameScene),cam=cameraMu(gameScene);if(!h)return;for(const p of leaves){if(!p.live){spawn(p,h,cam);continue;}step(p);if(!p.live)spawn(p,h,cam);}publish();};
  group.userData.update=(dt)=>{if(disposed)return;const d=Math.max(0,Number(dt)||0);acc+=d;let guard=0;while(acc+1e-9>=TICK&&guard++<8){acc-=TICK;tick();}group.userData.muPcLiveLeaves=leaves.reduce((n,p)=>n+(p.live?1:0),0);};
  return {group,dispose(){if(disposed)return;disposed=true;mesh?.parent?.remove(mesh);geometry?.dispose?.();material?.dispose?.();group.clear();}};
}

export const PC_LORENCIA_LEAF_PATH=LEAF_PATH;
