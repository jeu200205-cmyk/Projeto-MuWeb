import * as THREE from 'three';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { MAP_SIZE } from './TerrainWorld.js';
import { tryAcquirePcParticle, releasePcParticle } from './PcParticleBudget.js';
import { pcIcarusCloudControllerContract } from './PcIcarusVisualContract.js';
import { createPcThunderJoint, tickPcThunderJoint, disposePcThunderJoint, createPcThunderJointBatch } from './PcThunderJoint.js';

const PATHS=Object.freeze({
  SMOKE:'Effect/smoke01.OZJ',
  RAIN_CIRCLE_1:'World10/rain03.OZT',
  CLOUD:'Effect/clouds.OZJ',
  CLOUD_LIGHT:'Effect/cloudLight.OZJ',
});
const cache=new Map();
const ri=(n)=>Math.floor(Math.random()*Math.max(1,n));
const rad=(d)=>d*Math.PI/180;
async function loadBitmap(path){
  if(cache.has(path))return cache.get(path);
  const p=(async()=>{const d=await RemoteAssets.fetchDecodedImage(path);if(!d?.image||!(d.w>0)||!(d.h>0))return null;const t=new THREE.Texture(d.image);t.needsUpdate=true;t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.minFilter=t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.userData.muPcBitmapPath=path;return Object.freeze({texture:t,width:d.w,height:d.h,path});})().catch(()=>null);
  cache.set(path,p);return p;
}
function rotatePcInto(v,angle,out){const ax=rad(Number(angle?.[0])||0),ay=rad(Number(angle?.[1])||0),az=rad(Number(angle?.[2])||0);const sr=Math.sin(ax),cr=Math.cos(ax),sp=Math.sin(ay),cp=Math.cos(ay),sy=Math.sin(az),cy=Math.cos(az);const m00=cp*cy,m10=cp*sy,m20=-sp,m01=sr*sp*cy+cr*-sy,m11=sr*sp*sy+cr*cy,m21=sr*cp,m02=cr*sp*cy+-sr*-sy,m12=cr*sp*sy+-sr*cy,m22=cr*cp;out[0]=v[0]*m00+v[1]*m01+v[2]*m02;out[1]=v[0]*m10+v[1]*m11+v[2]*m12;out[2]=v[0]*m20+v[1]*m21+v[2]*m22;return out;}
function pcWorldToThree(pos,out){return out.set(pos[0]-MAP_SIZE/2,pos[2],MAP_SIZE/2-pos[1]);}
function boneWorldPoint(renderer,index,offset,out){const b=renderer?.bones?.[index|0];if(!b)return null;renderer.group.updateWorldMatrix?.(true,true);out.set(offset?.[0]||0,offset?.[1]||0,offset?.[2]||0);return b.localToWorld(out);}
function makeMat(loaded){return new THREE.SpriteMaterial({map:loaded.texture,color:0xffffff,transparent:true,opacity:1,depthTest:true,depthWrite:false,fog:false,toneMapped:false,blending:THREE.AdditiveBlending});}
function acquireSpriteParticle(loaded,pool){
  if(!tryAcquirePcParticle())return null;
  const key=loaded.path;let bucket=pool.get(key);let p=bucket?.pop()||null;
  if(!p){const mat=makeMat(loaded),sprite=new THREE.Sprite(mat);sprite.frustumCulled=true;sprite.userData.muPcOwner='ZzzEffectParticle.cpp';p={mat,sprite,loaded,_poolKey:key};}
  p.loaded=loaded;p._poolKey=key;p.sprite.visible=true;p.mat.map=loaded.texture;p.mat.opacity=1;p.mat.rotation=0;p.mat.color.setRGB(1,1,1);
  return p;
}
function recycleSpriteParticle(group,p,pool){
  group.remove(p.sprite);p.sprite.visible=false;releasePcParticle();
  let bucket=pool.get(p._poolKey);if(!bucket){bucket=[];pool.set(p._poolKey,bucket);}bucket.push(p);
}
function releaseUnattachedParticle(p,pool){
  p.sprite.visible=false;releasePcParticle();let bucket=pool.get(p._poolKey);if(!bucket){bucket=[];pool.set(p._poolKey,bucket);}bucket.push(p);
}
function disposeSpritePool(pool){for(const bucket of pool.values())for(const p of bucket)p.mat.dispose();pool.clear();}
function set3(a,x=0,y=0,z=0){a=a||[0,0,0];a[0]=x;a[1]=y;a[2]=z;return a;}

export function pcMapParticleContract(worldNum,serial){
  const w=worldNum|0,t=serial|0;
  if(w===10&&t===2)return{kind:'devilSquare2'};
  if(w===9&&(t===60||t===70||t===76||t===83))return{kind:'tarkanSmoke',subtype:t};
  if(w===11){const ic=pcIcarusCloudControllerContract(t);if(ic)return{kind:'icarusCloudController',...ic};}
  return null;
}
export function hasPcMapParticleVisual(worldNum,serial){return !!pcMapParticleContract(worldNum,serial);}

function newIcarusCloud(loaded,subtype,obj,spawnIndex,pool){
  const q=acquireSpriteParticle(loaded,pool);if(!q)return null;
  // ZzzEffectParticle.cpp::CreateParticle(BITMAP_CLOUD) leaves subtypes 0..5
  // on the constructor defaults in Icarus: LifeTime=2, zero velocity,
  // OBJECT scale, supplied Light=(.1,.1,.1), no position jitter.
  const p=q;p.kind='icarusCloud';p.subtype=subtype|0;p.life=2;p.scale=Number(obj?.scale)||1;p.light=set3(p.light,.1,.1,.1);p.rotation=0;p.spawnIndex=spawnIndex|0;
  pcWorldToThree([Number(obj?.x)||0,Number(obj?.y)||0,Number(obj?.z)||0],p.sprite.position);
  p.mat.color.setRGB(.1,.1,.1);
  p.sprite.scale.set(loaded.width*p.scale,loaded.height*p.scale,1);
  p.sprite.userData.muPcParticle=`cloud:${p.subtype}`;
  return p;
}
function updateIcarusCloud(p,f){
  p.life-=f;if(p.life<=0)return false;
  // Subtypes 0 and 3 read legacy TurningForce/StartPosition slots for a
  // rotation phase in RenderParticles.  CreateParticle does not initialize
  // those fields for this branch, so no deterministic source value exists;
  // preserve the defined constructor Rotation=0 instead of inventing motion.
  p.mat.rotation=rad(p.rotation||0);
  return true;
}

function newRain(loaded,worldPos,pool){const q=acquireSpriteParticle(loaded,pool);if(!q)return null;const p=q;p.kind='rain';p.life=20;p.scale=(ri(6)+8)*.1;p.light=set3(p.light,1,1,1);p.sprite.position.copy(worldPos);const dx=ri(10)-5,dy=ri(10)-5,dz=ri(10)-5;/* CreateParticle jitters MU world XYZ, then the Web basis is X,Y,Z -> X,Z,-Y. */p.sprite.position.x+=dx;p.sprite.position.y+=dz;p.sprite.position.z-=dy;p.sprite.scale.set(loaded.width*p.scale,loaded.height*p.scale,1);return p;}
function updateRain(p,f){p.life-=f;if(p.life<=0)return false;p.scale+=.03*f;p.light[0]-=.05*f;p.light[1]-=.05*f;p.light[2]-=.05*f;p.mat.color.setRGB(Math.max(0,p.light[0]),Math.max(0,p.light[1]),Math.max(0,p.light[2]));p.sprite.scale.set(p.loaded.width*p.scale,p.loaded.height*p.scale,1);return true;}

function newSmoke(loaded,subtype,obj,positionOverride,scaleOverride,worldMs,pool){
  const q=acquireSpriteParticle(loaded,pool);if(!q)return null;
  const scaleArg=Number.isFinite(Number(scaleOverride))?Number(scaleOverride):(Number(obj?.scale)||1);
  const p=q;p.kind='smoke';p.subtype=subtype|0;p.life=2;p.scale=scaleArg;p.gravity=0;p.rotation=0;p.rotationBaseZ=0;
  p.velocity=set3(p.velocity,0,0,0);p.angle=set3(p.angle,Number(obj?.angleX)||0,Number(obj?.angleY)||0,Number(obj?.angleZ)||0);
  p.pos=set3(p.pos,positionOverride?.[0]??(Number(obj?.x)||0),positionOverride?.[1]??(Number(obj?.y)||0),positionOverride?.[2]??(Number(obj?.z)||0));p.light=set3(p.light,1,1,1);
  switch(p.subtype){
    case 4:p.life=16;p.scale=(ri(32)+48)*.01;p.angle[0]=ri(360);p.rotation=Math.trunc(worldMs)%360;break;
    case 6:p.life=30;p.gravity=ri(1000);p.scale=(ri(20)+180)*.01;p.pos[0]+=(ri(200)-100)*scaleArg;p.pos[1]+=(ri(200)-100)*scaleArg;p.pos[2]+=ri(20)+20;p.rotation=p.pos[2];p.rotationBaseZ=p.rotation;break;
    case 7:p.life=30;set3(p.velocity,0,(ri(4)+6)*p.scale,0);p.gravity=ri(200)/200;p.scale*=(ri(20)+120)*.01;p.rotation=ri(360);break;
    case 8:p.life=24;set3(p.velocity,0,-(ri(8)+32)*.3,0);p.scale*=.8;p.rotation=ri(360);break;
    default:releaseUnattachedParticle(p,pool);return null;
  }
  p.sprite.userData.muPcParticle=`smoke:${p.subtype}`;return p;
}
const smokeRotateScratch=[0,0,0];
function updateSmoke(p,f,worldMs){
  p.life-=f;if(p.life<=0&&p.subtype!==6)return false;
  if(p.subtype!==6){const rv=rotatePcInto(p.velocity,p.angle,smokeRotateScratch);p.pos[0]+=rv[0]*f;p.pos[1]+=rv[1]*f;p.pos[2]+=rv[2]*f;}
  let lum=1;
  switch(p.subtype){
    case 4:lum=p.life/8;set3(p.light,lum*120/255,lum*100.7/255,lum*80/255);p.gravity+=.2*f;p.pos[2]+=p.gravity*f;p.scale+=.05*f;break;
    case 6:p.life=10;p.pos[2]=p.rotationBaseZ+Math.sin((worldMs+p.gravity)/5000)*20;p.scale=Math.sin(((Math.trunc(p.gravity+worldMs)%1800)*.1)*(Math.PI/180))*.5+1.8;lum=.6;set3(p.light,lum*.6,lum*.5,lum*.4);break;
    case 7:lum=1;p.scale+=.03*f;p.gravity+=1*f;p.velocity[1]-=.1*f;p.pos[2]-=p.gravity*f;if(p.life<5){lum=p.life/8;p.scale-=.1*f;}set3(p.light,lum*.725,lum*.572,lum*.333);break;
    case 8:p.gravity+=.02*f;if(p.life>5){p.scale+=p.gravity*f;p.pos[2]+=p.gravity*20*f;const vm=Math.pow(1.05,f)*Math.pow(.4,f);p.velocity[0]*=vm;p.velocity[1]*=vm;p.velocity[2]*=vm;lum=p.life/24;set3(p.light,lum,lum,lum);}else{p.light[0]/=2;p.light[1]/=2;p.light[2]/=2;set3(p.velocity,0,0,0);}break;
  }
  p.mat.color.setRGB(Math.max(0,p.light[0]),Math.max(0,p.light[1]),Math.max(0,p.light[2]));p.mat.rotation=p.subtype===6?0:rad(p.rotation);p.sprite.scale.set(p.loaded.width*p.scale,p.loaded.height*p.scale,1);pcWorldToThree(p.pos,p.sprite.position);return p.scale>0;
}

export async function createPcMapParticleOwner(worldNum,serial,renderer,obj){
  const c=pcMapParticleContract(worldNum,serial);if(!c)return null;
  const group=new THREE.Group();group.name=`PcMapParticles_W${worldNum}_T${serial}`;group.userData.muPcOwner='ZzzObject.cpp::RenderObjectVisual/ZzzEffectParticle.cpp';
  const particles=[];const particlePool=new Map();const thunderJoints=[];let disposed=false,lastMs=null,tickAcc=0,elapsedMs=0,initialBurstDone=false;
  let icarusThunderBatch=null;
  const tmpA=new THREE.Vector3(),tmpB=new THREE.Vector3();
  // M71: retained World11 MoveObjectOnEffect scratch; visual semantics unchanged.
  const icarusBase=new THREE.Vector3(),icarusEnd=new THREE.Vector3();
  if(c.kind==='icarusCloudController'){
    const [cloud,cloudLight,batch]=await Promise.all([
      loadBitmap(PATHS.CLOUD), loadBitmap(PATHS.CLOUD_LIGHT),
      createPcThunderJointBatch({group,camera:renderer?.camera,bitmapPlusOne:false,subtype:6,maxJoints:48}),
    ]);if(!cloud)return null;
    icarusThunderBatch=batch||null;
    // ZzzObject.cpp::RenderObjectVisual/WD_10HEAVEN types 0..5: emit once
    // while HiddenMesh != -2, then the BMD is hidden forever for this object.
    const icarusTick=(worldMs=0)=>{
      if(disposed)return;
      const ms=Math.max(0,Number(worldMs)||0);
      const safe=lastMs==null?0:Math.max(0,Math.min(.25,(ms-lastMs)/1000));lastMs=ms;
      if(!initialBurstDone){initialBurstDone=true;for(let i=0;i<c.count;i++){const p=newIcarusCloud(cloud,c.subtype,obj,i,particlePool);if(p){particles.push(p);group.add(p.sprite);}}}
      // ZzzObject.cpp::MoveObjectOnEffect WD_10HEAVEN: controllers 0..5
      // randomly emit BITMAP_CLOUD+1 at scale .5 using the object's authored
      // world position and a grayscale light in [0,.18].  This is a separate
      // retained owner from the one-shot BITMAP_CLOUD burst above.
      tickAcc+=safe*25;let steps=Math.min(6,Math.floor(tickAcc));tickAcc-=steps;
      while(steps-->0){
        if(cloudLight && ri(10)===0){
          const q=acquireSpriteParticle(cloudLight,particlePool);
          const lum=ri(10)*.02;
          const base=pcWorldToThree([Number(obj?.x)||0,Number(obj?.y)||0,Number(obj?.z)||0],icarusBase);
          if(q){
            const p=q;p.kind='icarusCloudLight';p.life=2;p.scale=.5;p.light=set3(p.light,lum,lum,lum);
            p.sprite.position.copy(base);
            p.mat.color.setRGB(lum,lum,lum);p.sprite.scale.set(cloudLight.width*.5,cloudLight.height*.5,1);
            p.sprite.userData.muPcParticle='cloudLight:BITMAP_CLOUD+1';particles.push(p);group.add(p.sprite);
          }
          // MoveObjectOnEffect creates TWO BITMAP_JOINT_THUNDER subtype 6
          // children in the same authored 1/10 branch.  ZzzEffectJoint subtype6
          // creates 45 descending tails at MU Z -= 13 with scale rand()%20+10.
          for(let k=0;k<2;k++){
            const end=icarusEnd.copy(base);end.y-=45*13;
            const scale=ri(20)+10;
            // FIX84: preserve both logical subtype-6 joints but submit the live
            // ribbons through one retained mesh for this controller instead of
            // one WebGL draw/material/geometry per joint.
            if(icarusThunderBatch) icarusThunderBatch.spawn(base,end,scale,[lum,lum,lum]);
            else void createPcThunderJoint({group,camera:renderer?.camera,start:base,end,bitmapPlusOne:false,subtype:6,scale,light:[lum,lum,lum]}).then(j=>{if(j&&!disposed)thunderJoints.push(j);else if(j)disposePcThunderJoint(j);});
          }
        }
      }
      const f=Math.min(2.5,safe*25);for(let jt=0;jt<Math.floor(f);jt++){
        icarusThunderBatch?.tick?.();
        for(let j=thunderJoints.length-1;j>=0;j--){if(!tickPcThunderJoint(thunderJoints[j]))thunderJoints.splice(j,1);}
      }
      for(let i=particles.length-1;i>=0;i--){const p=particles[i];let live=true;if(p.kind==='icarusCloudLight'){p.life-=f;live=p.life>0;}else live=updateIcarusCloud(p,f);if(!live){recycleSpriteParticle(group,p,particlePool);particles.splice(i,1);}}
    };
    if(renderer?.addPresentationUpdate) renderer.addPresentationUpdate(icarusTick);
    else {
      let standaloneMs=0;
      group.userData.update=(dt)=>{standaloneMs+=Math.max(0,Number(dt)||0)*1000;icarusTick(standaloneMs);};
      group.userData.muPcStandaloneController=true;
    }
  }else if(c.kind==='devilSquare2'){
    const rain=await loadBitmap(PATHS.RAIN_CIRCLE_1);if(!rain)return null;
    renderer.addPresentationUpdate?.((worldMs=0)=>{if(disposed)return;const ms=Number(worldMs)||0;const dt=lastMs==null?0:Math.max(0,Math.min(.25,(ms-lastMs)/1000));lastMs=ms;tickAcc+=dt*25;let steps=Math.min(6,Math.floor(tickAcc));tickAcc-=steps;while(steps-->0){const emit=(bone)=>{const w=boneWorldPoint(renderer,bone,[-15,0,0],bone===23?tmpA:tmpB);if(!w)return;const p=newRain(rain,w,particlePool);if(p){particles.push(p);group.add(p.sprite);}};if(ri(4)===0)emit(23);if(ri(4)===0)emit(31);emit(23);}const f=Math.min(2.5,dt*25);for(let i=particles.length-1;i>=0;i--){const p=particles[i];if(!updateRain(p,f)){recycleSpriteParticle(group,p,particlePool);particles.splice(i,1);}}});
  }else{
    const smoke=await loadBitmap(PATHS.SMOKE);if(!smoke)return null;
    // ZzzObject::RenderObjectVisual is visibility/render-owner driven.  Keep
    // Tarkan smoke on the same renderer callback instead of a free-running
    // Scene object; this prevents offscreen emission and preserves the source
    // WorldTime phase without replaying missed particles on re-entry.
    renderer.addPresentationUpdate?.((worldMs=0)=>{
      if(disposed)return;
      const ms=Math.max(0,Number(worldMs)||0);
      const safe=lastMs==null?0:Math.max(0,Math.min(.25,(ms-lastMs)/1000));
      lastMs=ms; elapsedMs=ms; tickAcc+=safe*25;
      let steps=Math.min(6,Math.floor(tickAcc)); tickAcc-=steps;
      // Type60 is a one-time first-visible burst.  The original code hides the
      // BMD immediately after this first RenderObjectVisual call.
      if((serial|0)===60&&!initialBurstDone){
        initialBurstDone=true;
        for(let i=0;i<20;i++){const p=newSmoke(smoke,6,obj,null,obj.scale,ms,particlePool);if(p){particles.push(p);group.add(p.sprite);}}
      }
      while(steps-->0){
        const t=serial|0;
        if(t===70){
          if(ri(5)===0){const p=newSmoke(smoke,7,obj,null,obj.scale,ms,particlePool);if(p){particles.push(p);group.add(p.sprite);}}
        }else if(t===76){
          if((Math.trunc(ms)%5000)>4500){const p=newSmoke(smoke,4,obj,null,obj.scale,ms,particlePool);if(p){particles.push(p);group.add(p.sprite);}}
        }else if(t===83){
          const inter=Math.trunc(Number(obj?.angleZ)||0)*10,timing=Math.trunc(ms)%10000;
          if(timing>3500+inter&&timing<4000+inter){
            const p8=newSmoke(smoke,8,obj,null,obj.scale,ms,particlePool);if(p8){particles.push(p8);group.add(p8.sprite);}
            if(ri(3)===0){
              const pos=[(Number(obj?.x)||0)+ri(128)-64,(Number(obj?.y)||0)+ri(128)-64,Number(obj?.z)||0];
              const p4=newSmoke(smoke,4,obj,pos,(Number(obj?.scale)||1)*.5,ms,particlePool);if(p4){particles.push(p4);group.add(p4.sprite);}
              group.userData.muPcStoneEffectStillOpen=true;
            }
          }
        }
      }
      const f=Math.min(2.5,safe*25);
      for(let i=particles.length-1;i>=0;i--){const p=particles[i];if(!updateSmoke(p,f,ms)){recycleSpriteParticle(group,p,particlePool);particles.splice(i,1);}}
    });
  }
  return {group,usesRendererTick:Boolean(renderer),dispose(){if(disposed)return;disposed=true;for(const p of particles)recycleSpriteParticle(group,p,particlePool);particles.length=0;disposeSpritePool(particlePool);for(const j of thunderJoints.splice(0))disposePcThunderJoint(j);icarusThunderBatch?.dispose?.();icarusThunderBatch=null;group.userData.update=null;group.clear();}};
}

export const PC_MAP_PARTICLE_BITMAP_PATHS=PATHS;
