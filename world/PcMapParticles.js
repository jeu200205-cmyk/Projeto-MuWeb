import * as THREE from 'three';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { MAP_SIZE } from './TerrainWorld.js';
import { tryAcquirePcParticle, releasePcParticle } from './PcParticleBudget.js';

const PATHS=Object.freeze({
  SMOKE:'Effect/smoke01.OZJ',
  RAIN_CIRCLE_1:'World10/rain03.OZT',
});
const cache=new Map();
const ri=(n)=>Math.floor(Math.random()*Math.max(1,n));
const rad=(d)=>d*Math.PI/180;
async function loadBitmap(path){
  if(cache.has(path))return cache.get(path);
  const p=(async()=>{const d=await RemoteAssets.fetchDecodedImage(path);if(!d?.image||!(d.w>0)||!(d.h>0))return null;const t=new THREE.Texture(d.image);t.needsUpdate=true;t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.minFilter=t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.userData.muPcBitmapPath=path;return Object.freeze({texture:t,width:d.w,height:d.h,path});})().catch(()=>null);
  cache.set(path,p);return p;
}
function rotatePc(v,angle){const ax=rad(Number(angle?.[0])||0),ay=rad(Number(angle?.[1])||0),az=rad(Number(angle?.[2])||0);const sr=Math.sin(ax),cr=Math.cos(ax),sp=Math.sin(ay),cp=Math.cos(ay),sy=Math.sin(az),cy=Math.cos(az);const m00=cp*cy,m10=cp*sy,m20=-sp,m01=sr*sp*cy+cr*-sy,m11=sr*sp*sy+cr*cy,m21=sr*cp,m02=cr*sp*cy+-sr*-sy,m12=cr*sp*sy+-sr*cy,m22=cr*cp;return[v[0]*m00+v[1]*m01+v[2]*m02,v[0]*m10+v[1]*m11+v[2]*m12,v[0]*m20+v[1]*m21+v[2]*m22];}
function pcWorldToThree(pos,out){return out.set(pos[0]-MAP_SIZE/2,pos[2],MAP_SIZE/2-pos[1]);}
function boneWorldPoint(renderer,index,offset,out){const b=renderer?.bones?.[index|0];if(!b)return null;renderer.group.updateWorldMatrix?.(true,true);out.set(offset?.[0]||0,offset?.[1]||0,offset?.[2]||0);return b.localToWorld(out);}
function makeMat(loaded){return new THREE.SpriteMaterial({map:loaded.texture,color:0xffffff,transparent:true,opacity:1,depthTest:true,depthWrite:false,fog:false,toneMapped:false,blending:THREE.AdditiveBlending});}
function makeSpriteParticle(loaded){if(!tryAcquirePcParticle())return null;const mat=makeMat(loaded),sprite=new THREE.Sprite(mat);sprite.frustumCulled=true;sprite.userData.muPcOwner='ZzzEffectParticle.cpp';return{mat,sprite,loaded};}
function destroy(group,p){group.remove(p.sprite);p.mat.dispose();releasePcParticle();}

export function pcMapParticleContract(worldNum,serial){
  const w=worldNum|0,t=serial|0;
  if(w===10&&t===2)return{kind:'devilSquare2'};
  if(w===9&&(t===60||t===70||t===76||t===83))return{kind:'tarkanSmoke',subtype:t};
  return null;
}
export function hasPcMapParticleVisual(worldNum,serial){return !!pcMapParticleContract(worldNum,serial);}

function newRain(loaded,worldPos){const q=makeSpriteParticle(loaded);if(!q)return null;const p={...q,kind:'rain',life:20,scale:(ri(6)+8)*.1,light:[1,1,1]};p.sprite.position.copy(worldPos);const dx=ri(10)-5,dy=ri(10)-5,dz=ri(10)-5;/* CreateParticle jitters MU world XYZ, then the Web basis is X,Y,Z -> X,Z,-Y. */p.sprite.position.x+=dx;p.sprite.position.y+=dz;p.sprite.position.z-=dy;p.sprite.scale.set(loaded.width*p.scale,loaded.height*p.scale,1);return p;}
function updateRain(p,f){p.life-=f;if(p.life<=0)return false;p.scale+=.03*f;p.light[0]-=.05*f;p.light[1]-=.05*f;p.light[2]-=.05*f;p.mat.color.setRGB(Math.max(0,p.light[0]),Math.max(0,p.light[1]),Math.max(0,p.light[2]));p.sprite.scale.set(p.loaded.width*p.scale,p.loaded.height*p.scale,1);return true;}

function newSmoke(loaded,subtype,obj,positionOverride=null,scaleOverride=null,worldMs=0){
  const q=makeSpriteParticle(loaded);if(!q)return null;
  const scaleArg=Number.isFinite(Number(scaleOverride))?Number(scaleOverride):(Number(obj?.scale)||1);
  const pos=positionOverride?[...positionOverride]:[Number(obj?.x)||0,Number(obj?.y)||0,Number(obj?.z)||0];
  const angle=[Number(obj?.angleX)||0,Number(obj?.angleY)||0,Number(obj?.angleZ)||0];
  const p={...q,kind:'smoke',subtype:subtype|0,life:2,scale:scaleArg,gravity:0,rotation:0,velocity:[0,0,0],angle,pos,light:[1,1,1],rotationBaseZ:0};
  switch(p.subtype){
    case 4:p.life=16;p.scale=(ri(32)+48)*.01;p.angle[0]=ri(360);p.rotation=Math.trunc(worldMs)%360;break;
    case 6:p.life=30;p.gravity=ri(1000);p.scale=(ri(20)+180)*.01;p.pos[0]+=(ri(200)-100)*scaleArg;p.pos[1]+=(ri(200)-100)*scaleArg;p.pos[2]+=ri(20)+20;p.rotation=p.pos[2];p.rotationBaseZ=p.rotation;break;
    case 7:p.life=30;p.velocity=[0,(ri(4)+6)*p.scale,0];p.gravity=ri(200)/200;p.scale*=(ri(20)+120)*.01;p.rotation=ri(360);break;
    case 8:p.life=24;p.velocity=[0,-(ri(8)+32)*.3,0];p.scale*=.8;p.rotation=ri(360);break;
    default:releasePcParticle();p.mat.dispose();return null;
  }
  p.sprite.userData.muPcParticle=`smoke:${p.subtype}`;return p;
}
function updateSmoke(p,f,worldMs){
  p.life-=f;if(p.life<=0&&p.subtype!==6)return false;
  if(p.subtype!==6){const rv=rotatePc(p.velocity,p.angle);p.pos[0]+=rv[0]*f;p.pos[1]+=rv[1]*f;p.pos[2]+=rv[2]*f;}
  let lum=1;
  switch(p.subtype){
    case 4:lum=p.life/8;p.light=[lum*120/255,lum*100.7/255,lum*80/255];p.gravity+=.2*f;p.pos[2]+=p.gravity*f;p.scale+=.05*f;break;
    case 6:p.life=10;p.pos[2]=p.rotationBaseZ+Math.sin((worldMs+p.gravity)/5000)*20;p.scale=Math.sin(((Math.trunc(p.gravity+worldMs)%1800)*.1)*(Math.PI/180))*.5+1.8;lum=.6;p.light=[lum*.6,lum*.5,lum*.4];break;
    case 7:lum=1;p.scale+=.03*f;p.gravity+=1*f;p.velocity[1]-=.1*f;p.pos[2]-=p.gravity*f;if(p.life<5){lum=p.life/8;p.scale-=.1*f;}p.light=[lum*.725,lum*.572,lum*.333];break;
    case 8:p.gravity+=.02*f;if(p.life>5){p.scale+=p.gravity*f;p.pos[2]+=p.gravity*20*f;p.velocity=p.velocity.map(v=>v*Math.pow(1.05,f));lum=p.life/24;p.light=[lum,lum,lum];p.velocity=p.velocity.map(v=>v*Math.pow(.4,f));}else{p.light=p.light.map(v=>v/2);p.velocity=[0,0,0];}break;
  }
  p.mat.color.setRGB(Math.max(0,p.light[0]),Math.max(0,p.light[1]),Math.max(0,p.light[2]));p.mat.rotation=p.subtype===6?0:rad(p.rotation);p.sprite.scale.set(p.loaded.width*p.scale,p.loaded.height*p.scale,1);pcWorldToThree(p.pos,p.sprite.position);return p.scale>0;
}

export async function createPcMapParticleOwner(worldNum,serial,renderer,obj){
  const c=pcMapParticleContract(worldNum,serial);if(!c)return null;
  const group=new THREE.Group();group.name=`PcMapParticles_W${worldNum}_T${serial}`;group.userData.muPcOwner='ZzzObject.cpp::RenderObjectVisual/ZzzEffectParticle.cpp';
  const particles=[];let disposed=false,lastMs=null,tickAcc=0,elapsedMs=0,initialBurstDone=false;
  const tmpA=new THREE.Vector3(),tmpB=new THREE.Vector3();
  if(c.kind==='devilSquare2'){
    const rain=await loadBitmap(PATHS.RAIN_CIRCLE_1);if(!rain)return null;
    renderer.addPresentationUpdate?.((worldMs=0)=>{if(disposed)return;const ms=Number(worldMs)||0;const dt=lastMs==null?0:Math.max(0,Math.min(.25,(ms-lastMs)/1000));lastMs=ms;tickAcc+=dt*25;let steps=Math.min(6,Math.floor(tickAcc));tickAcc-=steps;while(steps-->0){const emit=(bone)=>{const w=boneWorldPoint(renderer,bone,[-15,0,0],bone===23?tmpA:tmpB);if(!w)return;const p=newRain(rain,w);if(p){particles.push(p);group.add(p.sprite);}};if(ri(4)===0)emit(23);if(ri(4)===0)emit(31);emit(23);}const f=Math.min(2.5,dt*25);for(let i=particles.length-1;i>=0;i--){const p=particles[i];if(!updateRain(p,f)){destroy(group,p);particles.splice(i,1);}}});
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
        for(let i=0;i<20;i++){const p=newSmoke(smoke,6,obj,null,obj.scale,ms);if(p){particles.push(p);group.add(p.sprite);}}
      }
      while(steps-->0){
        const t=serial|0;
        if(t===70){
          if(ri(5)===0){const p=newSmoke(smoke,7,obj,null,obj.scale,ms);if(p){particles.push(p);group.add(p.sprite);}}
        }else if(t===76){
          if((Math.trunc(ms)%5000)>4500){const p=newSmoke(smoke,4,obj,null,obj.scale,ms);if(p){particles.push(p);group.add(p.sprite);}}
        }else if(t===83){
          const inter=Math.trunc(Number(obj?.angleZ)||0)*10,timing=Math.trunc(ms)%10000;
          if(timing>3500+inter&&timing<4000+inter){
            const p8=newSmoke(smoke,8,obj,null,obj.scale,ms);if(p8){particles.push(p8);group.add(p8.sprite);}
            if(ri(3)===0){
              const pos=[(Number(obj?.x)||0)+ri(128)-64,(Number(obj?.y)||0)+ri(128)-64,Number(obj?.z)||0];
              const p4=newSmoke(smoke,4,obj,pos,(Number(obj?.scale)||1)*.5,ms);if(p4){particles.push(p4);group.add(p4.sprite);}
              group.userData.muPcStoneEffectStillOpen=true;
            }
          }
        }
      }
      const f=Math.min(2.5,safe*25);
      for(let i=particles.length-1;i>=0;i--){const p=particles[i];if(!updateSmoke(p,f,ms)){destroy(group,p);particles.splice(i,1);}}
    });
  }
  return {group,usesRendererTick:true,dispose(){if(disposed)return;disposed=true;for(const p of particles)destroy(group,p);particles.length=0;group.userData.update=null;group.clear();}};
}

export const PC_MAP_PARTICLE_BITMAP_PATHS=PATHS;
