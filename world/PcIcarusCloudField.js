import * as THREE from 'three';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { MAP_SIZE } from './TerrainWorld.js';
import { tryAcquirePcParticle, releasePcParticle } from './PcParticleBudget.js';
import { pcIcarusCloudControllerContract } from './PcIcarusVisualContract.js';
import { createPcThunderJointBatch } from './PcThunderJoint.js';

const CLOUD='Effect/clouds.OZJ';
const CLOUD_LIGHT='Effect/cloudLight.OZJ';
const ri=(n)=>Math.floor(Math.random()*Math.max(1,n));
function pcWorldToThree(obj,out=new THREE.Vector3()){
  return out.set((Number(obj?.x)||0)-MAP_SIZE/2,Number(obj?.z)||0,MAP_SIZE/2-(Number(obj?.y)||0));
}
async function load(path){
  const d=await RemoteAssets.fetchDecodedImage(path).catch(()=>null);
  if(!d?.image||!(d.w>0)||!(d.h>0))return null;
  const texture=new THREE.Texture(d.image);texture.needsUpdate=true;texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=true;
  texture.userData.muPcBitmapPath=path;return {texture,width:d.w,height:d.h};
}
function makeFieldMesh(loaded,capacity,owner){
  const geo=new THREE.PlaneGeometry(1,1);
  const mat=new THREE.MeshBasicMaterial({map:loaded.texture,color:0xffffff,transparent:true,opacity:1,depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,vertexColors:true});
  const mesh=new THREE.InstancedMesh(geo,mat,capacity);mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=5;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(capacity*3),3);mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);mesh.userData.muPcOwner=owner;
  return {mesh,geo,mat,loaded};
}

/**
 * FIX87 — one World11 owner for all source-hidden Object1..6 cloud controllers.
 * Main semantics remain per-placement; only Web submission/allocation is merged.
 */
export async function createPcIcarusCloudField(gameScene, placements=[]){
  const controllers=[];
  for(const row of placements||[]){const c=pcIcarusCloudControllerContract(row?.serial);if(c)controllers.push({c,obj:row.obj});}
  if(!controllers.length)return null;
  const [cloud,light]=await Promise.all([load(CLOUD),load(CLOUD_LIGHT)]);if(!cloud)return null;
  const group=new THREE.Group();group.name='PcIcarusCloudField';group.userData.muPcOwner='ZzzObject.cpp::World11 Object1..6 merged submission';
  const cloudField=makeFieldMesh(cloud,3000,'BITMAP_CLOUD instanced field');group.add(cloudField.mesh);
  const lightField=light?makeFieldMesh(light,1024,'BITMAP_CLOUD+1 instanced field'):null;if(lightField)group.add(lightField.mesh);
  const thunder=await createPcThunderJointBatch({group,camera:gameScene?.camera?.threeCamera,bitmapPlusOne:false,subtype:6,maxJoints:1024});
  const particles=[]; let disposed=false,acc=0,initial=false;
  const tmp=new THREE.Object3D(), base=new THREE.Vector3(), end=new THREE.Vector3();
  const spawn=(kind,obj,scale,color,life=2)=>{if(!tryAcquirePcParticle())return false;particles.push({kind,obj,pos:pcWorldToThree(obj,new THREE.Vector3()),scale,color:[...color],life,released:false});return true;};
  const release=(p)=>{if(!p.released){p.released=true;releasePcParticle();}};
  // capacity helper: InstancedMesh.count does not expose max after updates.
  cloudField.capacity=3000;if(lightField)lightField.capacity=1024;
  const write=(field,kind,cameraQuat)=>{if(!field)return;let n=0;for(const p of particles){if(p.kind!==kind||n>=field.capacity)continue;tmp.position.copy(p.pos);tmp.quaternion.copy(cameraQuat);tmp.scale.set(field.loaded.width*p.scale,field.loaded.height*p.scale,1);tmp.updateMatrix();field.mesh.setMatrixAt(n,tmp.matrix);field.mesh.setColorAt(n,new THREE.Color(p.color[0],p.color[1],p.color[2]));n++;}field.mesh.count=n;field.mesh.visible=n>0;field.mesh.instanceMatrix.needsUpdate=true;if(field.mesh.instanceColor)field.mesh.instanceColor.needsUpdate=true;};
  const camQuat=new THREE.Quaternion();
  group.userData.update=(dt)=>{
    if(disposed)return;const safe=Math.max(0,Math.min(.25,Number(dt)||0));acc+=safe*25;let steps=Math.min(6,Math.floor(acc));acc-=steps;
    if(!initial){initial=true;for(const {c,obj} of controllers)for(let i=0;i<c.count;i++)spawn('cloud',obj,Number(obj?.scale)||1,[.1,.1,.1],2);}
    while(steps-->0){
      for(const {obj} of controllers){if(ri(10)!==0)continue;const lum=ri(10)*.02;if(light)spawn('light',obj,.5,[lum,lum,lum],2);base.copy(pcWorldToThree(obj,base));for(let k=0;k<2;k++){end.copy(base);end.y-=45*13;thunder?.spawn?.(base,end,ri(20)+10,[lum,lum,lum]);}}
      thunder?.tick?.();
      for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=1;if(p.life<=0){release(p);particles.splice(i,1);}}
    }
    gameScene?.camera?.threeCamera?.getWorldQuaternion?.(camQuat);
    write(cloudField,'cloud',camQuat);write(lightField,'light',camQuat);
    group.userData.muPcCloudField={controllers:controllers.length,particles:particles.length,clouds:cloudField.mesh.count,lights:lightField?.mesh.count||0,thunder:thunder?.joints?.length||0};
  };
  return {group,controllers:controllers.length,dispose(){if(disposed)return;disposed=true;for(const p of particles)release(p);particles.length=0;thunder?.dispose?.();for(const f of [cloudField,lightField])if(f){f.mesh.parent?.remove(f.mesh);f.geo.dispose();f.mat.dispose();f.loaded.texture.dispose();}group.userData.update=null;group.clear();}};
}
