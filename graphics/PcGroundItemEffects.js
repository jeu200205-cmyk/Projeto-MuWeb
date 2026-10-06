import * as THREE from 'three';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { loadItemEffectsLuaConfig, itemTypeToModelType, groundItemEffectRuntimeContract } from '../data/ItemEffectsLuaConfig.js';
import { tryAcquirePcParticle, releasePcParticle } from '../world/PcParticleBudget.js';

// Main 5.2 owners:
//   EffectManager.cpp::LoadEffect -> CItemEffectManager::m_EffectInfo
//   ZzzObject.cpp::MoveItems -> CreateShiny / CreateThunderBolt
// The owner is intentionally ground-only. Equipment uses Runne + CharacterEffectItens.
export const PC_GROUND_ITEM_EFFECT_BITMAPS = Object.freeze({
  LIGHT: 'Effect/flare01.OZJ',
  FLARE: 'Effect/Flare.OZJ',
  FIRE: 'Effect/Fire01.OZJ',
  JOINT_ENERGY: 'Effect/JointLaser01.OZJ',
});

const bitmapCache = new Map();
const ri = (n) => Math.floor(Math.random() * Math.max(1, n));
const rad = (d) => d * Math.PI / 180;

async function loadBitmap(path) {
  if (bitmapCache.has(path)) return bitmapCache.get(path);
  const task = (async () => {
    const d = await RemoteAssets.fetchDecodedImage(path);
    if (!d?.image || !(d.w > 0) || !(d.h > 0)) return null;
    const texture = new THREE.Texture(d.image);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.userData.muPcBitmapPath = path;
    return Object.freeze({ texture, width:d.w, height:d.h, path });
  })().catch(() => null);
  bitmapCache.set(path, task);
  return task;
}

function rotatePcInto(v, angle, out) {
  const ax=rad(Number(angle?.[0])||0), ay=rad(Number(angle?.[1])||0), az=rad(Number(angle?.[2])||0);
  const sr=Math.sin(ax),cr=Math.cos(ax),sp=Math.sin(ay),cp=Math.cos(ay),sy=Math.sin(az),cy=Math.cos(az);
  const m00=cp*cy,m10=cp*sy,m20=-sp;
  const m01=sr*sp*cy+cr*-sy,m11=sr*sp*sy+cr*cy,m21=sr*cp;
  const m02=cr*sp*cy+-sr*-sy,m12=cr*sp*sy+-sr*cy,m22=cr*cp;
  out[0]=v[0]*m00+v[1]*m01+v[2]*m02;
  out[1]=v[0]*m10+v[1]*m11+v[2]*m12;
  out[2]=v[0]*m20+v[1]*m21+v[2]*m22;
  return out;
}
function muLocalToThree(v,out){out.set(v[0],v[2],-v[1]);return out;}
function set3(a,x=0,y=0,z=0){a=a||[0,0,0];a[0]=x;a[1]=y;a[2]=z;return a;}

function makeSpriteMaterial(loaded) {
  return new THREE.SpriteMaterial({
    map:loaded.texture,color:0xffffff,transparent:true,opacity:1,
    depthTest:true,depthWrite:false,fog:false,toneMapped:false,
    blending:THREE.AdditiveBlending,
  });
}
function acquireSprite(loaded,pool) {
  if (!tryAcquirePcParticle()) return null;
  let p=pool.pop()||null;
  if(!p){const mat=makeSpriteMaterial(loaded),sprite=new THREE.Sprite(mat);sprite.frustumCulled=true;sprite.userData.muPcOwner='MoveItems/CreateShiny';p={mat,sprite};}
  p.loaded=loaded;p.sprite.visible=true;p.mat.map=loaded.texture;p.mat.opacity=1;p.mat.rotation=0;return p;
}
function recycleSprite(group,p,pool){group.remove(p.sprite);p.sprite.visible=false;releasePcParticle();pool.push(p);}
function disposeSpritePool(pool){for(const p of pool)p.mat.dispose();pool.length=0;}

function configureShinyParticle(p,subtype,info,spawnMu,textureKind) {
  p.kind=textureKind;p.subtype=subtype|0;p.life=subtype===0?20:10;p.maxLife=p.life;
  p.scale=Math.max(.001,Number(info.scale)||1);p.rotation=ri(360);p.gravity=0;
  p.pos=set3(p.pos,spawnMu[0],spawnMu[1],spawnMu[2]);
  // The custom source forwards configured Light into CreateParticle. Some stock
  // BITMAP_LIGHT constructors overwrite it; retain the explicit custom owner
  // color here rather than fabricating a different hue.
  p.light=set3(p.light,Number(info.colorR)||0,Number(info.colorG)||0,Number(info.colorB)||0);
  p.velocity=set3(p.velocity,0,0,0);
  if(textureKind==='light'){
    p.velocity[2]=subtype===0?(ri(10)+10):(ri(5)+1);
  } else if(textureKind==='fire') {
    p.life=p.maxLife=24;
    p.velocity[1]=-(ri(16)+32)*.1;
  } else {
    p.life=p.maxLife=100;
    p.velocity[2]=(ri(150))/100;
  }
  return p;
}
function updateShinyParticle(p) {
  p.life-=1;if(p.life<=0)return false;
  if(p.kind==='light'){
    const fScale=p.subtype===0?.5:1;
    p.pos[0]+=(Math.random()*.8-.4)*fScale;
    p.pos[1]+=(Math.random()*.8-.4)*fScale;
    p.pos[2]+=2.5*fScale;
    if(p.subtype===0)p.scale-=.05;else p.scale*=.98;
  }else if(p.kind==='fire'){
    p.gravity+=.004;p.pos[2]+=p.gravity*10;
    if(p.subtype===0)p.scale-=.04;else p.scale+=p.gravity;
  }else{
    // BITMAP_FLARE subtype 0/1 in this custom path was authored without a
    // Target even though the desktop stock constructor dereferences Target.
    // Keep the intended passed color/scale and only apply the stock fade law.
    if(p.life<=20){p.light[0]/=1.1;p.light[1]/=1.1;p.light[2]/=1.1;}
    p.scale=Math.max(.001,p.scale-.002);
  }
  return p.scale>.001;
}
function applyShinyVisual(p,tmp) {
  p.mat.color.setRGB(Math.max(0,p.light[0]),Math.max(0,p.light[1]),Math.max(0,p.light[2]));
  const fade=Math.max(0,Math.min(1,p.life/Math.max(1,p.maxLife)));
  p.mat.opacity=fade;
  muLocalToThree(p.pos,tmp);p.sprite.position.copy(tmp);
  const w=p.loaded.width*p.scale,h=p.loaded.height*p.scale;
  p.sprite.scale.set(w,h,1);p.mat.rotation=rad(p.rotation||0);
}

class ThunderPointLayer {
  constructor(group,loaded,{slots,lifeTicks,scale,color,name}){
    this.slots=slots;this.lifeTicks=lifeTicks;this.cursor=0;this.tick=0;this.slotSpawn=new Int32Array(slots);this.slotSpawn.fill(-0x3fffffff);
    this.positions=new Float32Array(slots*500*3);this.positions.fill(1e9);
    this.geometry=new THREE.BufferGeometry();this.attr=new THREE.BufferAttribute(this.positions,3);this.attr.setUsage(THREE.DynamicDrawUsage);this.geometry.setAttribute('position',this.attr);
    this.material=new THREE.PointsMaterial({map:loaded.texture,color:new THREE.Color(color[0],color[1],color[2]),transparent:true,opacity:1,alphaTest:.01,depthTest:true,depthWrite:false,fog:false,toneMapped:false,blending:THREE.AdditiveBlending,size:Math.max(1,loaded.width*scale),sizeAttenuation:true});
    this.points=new THREE.Points(this.geometry,this.material);this.points.name=name;this.points.frustumCulled=false;this.points.userData.muPcOwner='MoveItems/CreateThunderBolt';group.add(this.points);
  }
  spawn(height){const slot=this.cursor;this.cursor=(this.cursor+1)%this.slots;this.slotSpawn[slot]=this.tick;const base=slot*500*3;for(let i=0;i<500;i++){const j=base+i*3;const x=(ri(10)-5)*.04,y=(ri(10)-5)*.04,z=height+i;this.positions[j]=x;this.positions[j+1]=z;this.positions[j+2]=-y;}this.attr.needsUpdate=true;}
  step(){this.tick++;let dirty=false;for(let slot=0;slot<this.slots;slot++){if(this.tick-this.slotSpawn[slot]!==this.lifeTicks)continue;const base=slot*500*3,end=base+1500;for(let i=base;i<end;i++)this.positions[i]=1e9;dirty=true;}if(dirty)this.attr.needsUpdate=true;}
  dispose(){this.points.parent?.remove?.(this.points);this.geometry.dispose();this.material.dispose();}
}

export const pcGroundItemEffectRuntimeContract=groundItemEffectRuntimeContract;
function shinyTextureKind(effectType){if((effectType|0)===1)return 'flare';if((effectType|0)===2)return 'fire';return 'light';}
function shinyPath(kind){return kind==='flare'?PC_GROUND_ITEM_EFFECT_BITMAPS.FLARE:kind==='fire'?PC_GROUND_ITEM_EFFECT_BITMAPS.FIRE:PC_GROUND_ITEM_EFFECT_BITMAPS.LIGHT;}

export async function createPcGroundItemEffectOwner(itemType,itemAngle=[0,0,0]) {
  const itemModel=itemTypeToModelType(itemType);if(itemModel==null)return null;
  let config;try{config=await loadItemEffectsLuaConfig((path)=>RemoteAssets.fetchBinary(path));}catch{return null;}
  const info=config.effects.get(itemModel);if(!info)return null;
  const group=new THREE.Group();group.name=`GroundItemEffect_${itemType}`;group.userData.muPcEffectOwner='EffectManager.cpp/MoveItems';
  const spritePool=[],active=[];const tmpV=new THREE.Vector3(),rot=[0,0,0],base=[0,0,0];let tickAcc=0,sourceSubType=0,disposed=false;
  let shinyBitmap=null,energyLayer=null,glowLayer=null;
  if((info.effectType|0)===3){
    const [energy,light]=await Promise.all([loadBitmap(PC_GROUND_ITEM_EFFECT_BITMAPS.JOINT_ENERGY),loadBitmap(PC_GROUND_ITEM_EFFECT_BITMAPS.LIGHT)]);if(!energy||!light)return null;
    const intensity=Math.max(.05,Number(info.intensity)||1),color=[info.colorR*intensity,info.colorG*intensity,info.colorB*intensity],scale=Math.max(.001,Number(info.scale)||1);
    // 120/20 source ticks with a burst every 6 ticks => 20/4 retained slots.
    energyLayer=new ThunderPointLayer(group,energy,{slots:20,lifeTicks:120,scale,color,name:'GroundThunderEnergy500'});
    glowLayer=new ThunderPointLayer(group,light,{slots:4,lifeTicks:20,scale:scale*1.4,color,name:'GroundThunderGlow500'});
  }else{
    const kind=shinyTextureKind(info.effectType);shinyBitmap=await loadBitmap(shinyPath(kind));if(!shinyBitmap)return null;
  }
  const angle=[Number(itemAngle?.[0])||0,Number(itemAngle?.[1])||0,Number(itemAngle?.[2])||0];
  const emitShiny=()=>{set3(base,ri(32)+16,0,ri(32)+16);rotatePcInto(base,angle,rot);rot[2]+=Number(info.height)||0;const kind=shinyTextureKind(info.effectType);for(let subtype=0;subtype<2;subtype++){const p=acquireSprite(shinyBitmap,spritePool);if(!p)continue;configureShinyParticle(p,subtype,info,rot,kind);active.push(p);group.add(p.sprite);applyShinyVisual(p,tmpV);}};
  const sourceStep=(settled)=>{
    energyLayer?.step();glowLayer?.step();
    if(settled){if((info.effectType|0)===3){if((sourceSubType++%6)===0){const h=Number(info.height)||0;energyLayer.spawn(h);glowLayer.spawn(h);}}else if((sourceSubType++%24)===0)emitShiny();}
    for(let i=active.length-1;i>=0;i--){const p=active[i];if(!updateShinyParticle(p)){recycleSprite(group,p,spritePool);active.splice(i,1);continue;}applyShinyVisual(p,tmpV);}
  };
  return {group,info,itemModel,update(dt,settled=true){if(disposed)return;tickAcc+=Math.max(0,Math.min(.25,Number(dt)||0))*25;let steps=Math.min(6,Math.floor(tickAcc));tickAcc-=steps;while(steps-->0)sourceStep(Boolean(settled));},dispose(){if(disposed)return;disposed=true;for(const p of active)recycleSprite(group,p,spritePool);active.length=0;disposeSpritePool(spritePool);energyLayer?.dispose();glowLayer?.dispose();group.clear();}};
}
