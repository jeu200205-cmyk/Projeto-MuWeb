import * as THREE from 'three';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { tryAcquirePcParticle, releasePcParticle } from './PcParticleBudget.js';

// Main 5.2/B101 owners: ZzzObject.cpp WD_0LORENCIA +
// ZzzEffectFireLeave.cpp::CreateFire + ZzzEffectParticle.cpp.
export const PC_LORENCIA_RUNTIME_VISUAL_SERIALS = Object.freeze([50, 51, 52, 55, 56, 80, 105, 130, 131, 132]);
export const PC_LORENCIA_HIDDEN_EMITTER_SERIALS = Object.freeze([130, 131, 132]);
export const PC_LORENCIA_BITMAP_PATHS = Object.freeze({
  BITMAP_FIRE: 'Effect/Fire01.OZJ',
  BITMAP_SMOKE: 'Effect/smoke01.OZJ',
  BITMAP_LIGHT: 'Effect/flare01.OZJ',
});
const texCache = new Map();
const fireFrameTextureCache = new Map();
const ri=(n)=>Math.floor(Math.random()*Math.max(1,n));
const rad=(d)=>d*Math.PI/180;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function rotatePc(v, angle) {
  const ax=rad(Number(angle?.[0])||0), ay=rad(Number(angle?.[1])||0), az=rad(Number(angle?.[2])||0);
  const sr=Math.sin(ax),cr=Math.cos(ax),sp=Math.sin(ay),cp=Math.cos(ay),sy=Math.sin(az),cy=Math.cos(az);
  const m00=cp*cy,m10=cp*sy,m20=-sp;
  const m01=sr*sp*cy+cr*-sy,m11=sr*sp*sy+cr*cy,m21=sr*cp;
  const m02=cr*sp*cy+-sr*-sy,m12=cr*sp*sy+-sr*cy,m22=cr*cp;
  return [v[0]*m00+v[1]*m01+v[2]*m02,v[0]*m10+v[1]*m11+v[2]*m12,v[0]*m20+v[1]*m21+v[2]*m22];
}
function pcToThree(origin,p,out=new THREE.Vector3()) { return out.set(origin.x+p[0],origin.y+p[2],origin.z-p[1]); }
async function loadBitmap(path){
  if(texCache.has(path)) return texCache.get(path);
  const p=(async()=>{const d=await RemoteAssets.fetchDecodedImage(path); if(!d?.image||!(d.w>0)||!(d.h>0))return null;
    const t=new THREE.Texture(d.image);t.needsUpdate=true;t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.minFilter=t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.userData.muPcBitmapPath=path;return Object.freeze({texture:t,width:d.w,height:d.h,path});})().catch(()=>null);
  texCache.set(path,p);return p;
}
function emitterSpecs(serial){
  switch(serial|0){
    case 50:return [{type:0,offset:[0,0,200]}];
    case 51:return [{type:0,offset:[0,-30,60]}];
    case 52:return [{type:0,offset:[0,0,60]}];
    case 55:return [{type:0,offset:[-150,-150,140]},{type:0,offset:[150,-150,140]}];
    case 80:return [{type:0,offset:[90,-200,30]},{type:0,offset:[90,200,30]}];
    case 130:return [{type:0,offset:[0,0,0]}];
    case 131:return [{type:1,offset:[0,0,0]}];
    case 132:return [{type:2,offset:[0,0,0]}];
    default:return [];
  }
}
export function pcLorenciaVisualContract(serial){
  const emitters=emitterSpecs(serial);
  if(!emitters.length)return null;
  return Object.freeze({serial:serial|0,hidden:PC_LORENCIA_HIDDEN_EMITTER_SERIALS.includes(serial|0),emitters:Object.freeze(emitters.map(e=>Object.freeze({...e,offset:Object.freeze([...e.offset])}))) });
}
function fireFrameTexture(loaded, frame) {
  const f = ((frame | 0) % 4 + 4) % 4;
  const key = `${loaded.path}#${f}`;
  if (fireFrameTextureCache.has(key)) return fireFrameTextureCache.get(key);
  const t = loaded.texture.clone();
  t.repeat.set(0.25, 1);
  t.offset.set(f * 0.25, 0);
  t.needsUpdate = true;
  t.userData.muPcFireAtlasFrame = f;
  fireFrameTextureCache.set(key, t);
  return t;
}
function makeMaterial(loaded, subtype, kind){
  const subtractive=kind==='smoke'&&subtype===2;
  const map = kind === 'fire' ? fireFrameTexture(loaded, 0) : loaded.texture;
  const m=new THREE.SpriteMaterial({map,color:0xffffff,transparent:true,opacity:1,depthTest:true,depthWrite:false,fog:false,toneMapped:false});
  if(subtractive){m.blending=THREE.CustomBlending;m.blendEquation=THREE.AddEquation;m.blendSrc=THREE.ZeroFactor;m.blendDst=THREE.OneMinusSrcColorFactor;} else m.blending=THREE.AdditiveBlending;
  return m;
}
function makeParticle(kind,subtype,light,origin,angle,loaded){
  if(!tryAcquirePcParticle())return null;
  const p={kind,subtype,life:2,scale:1,rotation:0,gravity:0,frame:0,angle:[...angle],velocity:[0,0,0],pos:[...origin],light:[...light],sprite:null,mat:null,loaded};
  if(kind==='fire'){
    p.life=24;p.rotation=ri(360);
    if(subtype===0){p.velocity=[0,-(ri(16)+32)*.1,0];p.scale=(ri(64)+128)*.01;}
    else if(subtype===1){p.velocity=[0,-(ri(16)+32)*.1,0];p.scale=(ri(4)+10)*.01;}
    else {p.velocity=[0,-(ri(32)-16)*.1,0];p.scale=1;}
  }else if(kind==='smoke'&&subtype===0){p.life=16;p.scale=(ri(32)+48)*.01;p.angle[0]=ri(360);p.rotation=0;}
  else if(kind==='smoke'&&subtype===2){p.life=50;p.scale=(ri(64)+64)*.01;p.rotation=ri(360);p.gravity=(ri(32)+60)*.1;}
  p.mat=makeMaterial(loaded,subtype,kind);p.sprite=new THREE.Sprite(p.mat);p.sprite.frustumCulled=true;p.sprite.userData.muPcOwner='ZzzEffectParticle.cpp';p.sprite.userData.muPcParticle=`${kind}:${subtype}`;return p;
}
function updateParticle(p,f){
  p.life-=f;if(p.life<=0)return false;
  const rv=rotatePc(p.velocity,p.angle);p.pos[0]+=rv[0]*f;p.pos[1]+=rv[1]*f;p.pos[2]+=rv[2]*f;
  if(p.kind==='fire'){
    p.gravity+=.004*f;const lum=p.life/24;
    if(p.subtype===0){p.scale-=.04*f;p.frame=Math.floor((23-p.life)/6);p.pos[2]+=p.gravity*10*f;}
    else {p.scale+=p.gravity*f;p.velocity=p.velocity.map(v=>v*Math.pow(.98,f));p.frame=Math.floor((23-p.life)/6);p.pos[2]+=p.gravity*10*f;}
    // CreateFire supplies the authored orange light. Fire subtype 0..3 does not
    // overwrite o->Light in MoveParticles; only its frame/scale/position change.
    void lum;
  }else if(p.subtype===0){const lum=p.life/8;p.light=[lum,lum,lum];p.gravity+=.2*f;p.pos[2]+=p.gravity*f;p.scale+=.05*f;}
  else if(p.subtype===2){const lum=p.life/50;p.light=[lum,lum,lum];p.gravity-=.1*f;p.pos[0]-=p.gravity*.2*f;p.pos[2]+=p.gravity*f;p.scale-=.01*f;}
  return p.scale>0;
}
function applyParticleVisual(p,baseOrigin){
  p.mat.color.setRGB(Math.max(0,p.light[0]),Math.max(0,p.light[1]),Math.max(0,p.light[2]));
  p.mat.opacity=1;
  if(p.kind==='fire'){
    // RenderSprite(BITMAP_FIRE): 4-frame horizontal atlas, width*0.25.
    // Use four shared atlas views rather than mutating one Texture's offset;
    // particles on different source frames must not overwrite each other's UV.
    p.mat.map = fireFrameTexture(p.loaded, Math.max(0, p.frame) | 0);
    p.sprite.scale.set(p.loaded.width*.25*p.scale,p.loaded.height*p.scale,1);
    p.sprite.material.rotation=rad(p.subtype===0?p.angle[0]:p.rotation);
  }else{
    p.sprite.scale.set(p.loaded.width*p.scale,p.loaded.height*p.scale,1);p.sprite.material.rotation=rad(p.rotation);
  }
  pcToThree(baseOrigin,p.pos,p.sprite.position);
}
function gate(dt,referenceFrames,fn){const chance=clamp(Math.max(0,dt)*25/Math.max(1,referenceFrames),0,1);if(Math.random()<chance)fn();}

export async function createPcLorenciaVisualOwner(serial,obj,origin,options={}){
  const contract=pcLorenciaVisualContract(serial);if(!contract)return null;
  const fire=await loadBitmap(PC_LORENCIA_BITMAP_PATHS.BITMAP_FIRE);const smoke=await loadBitmap(PC_LORENCIA_BITMAP_PATHS.BITMAP_SMOKE);
  if(!fire||!smoke)return null;
  const group=new THREE.Group();group.name=`LorenciaVisual_Type${serial|0}`;group.userData.muPcVisualOwner='ZzzObject.cpp/CreateFire';
  const particles=[];let disposed=false;
  const angle=[Number(obj?.angleX)||0,Number(obj?.angleY)||0,Number(obj?.angleZ)||0];
  const addTerrainLightMu = typeof options?.addTerrainLightMu === 'function' ? options.addTerrainLightMu : null;
  const objMuX = Number(obj?.x) || 0, objMuY = Number(obj?.y) || 0;
  const baseOrigin=origin.clone();
  group.userData.update=(dt)=>{
    if(disposed)return;const safe=Math.max(0,Number(dt)||0);const factor=Math.min(2.5,safe*25);
    // CreateFire is called once per RenderObjectVisual frame. rand_fps_check(2)
    // uses 25Hz-reference density independent of presentation FPS.
    for(const spec of contract.emitters){
      const local=rotatePc(spec.offset,angle);const randomized=[local[0]+ri(16)-8,local[1]+ri(16)-8,local[2]+ri(16)-8];
      if(spec.type===0){
        const lum=(ri(6)+6)*.1;const light=[lum,lum*.6,lum*.4];
        // CreateFire(Type 0): AddTerrainLight uses the SAME rotated+jittered
        // Position and RGB as the optional fire particle, every render frame.
        addTerrainLightMu?.(objMuX + randomized[0], objMuY + randomized[1], light, 4);
        gate(safe,2,()=>{const p=makeParticle('fire',ri(4),light,randomized,angle,fire);if(p){particles.push(p);group.add(p.sprite);}});
      }
      else if(spec.type===1)gate(safe,2,()=>{const p=makeParticle('smoke',0,[1,1,1],randomized,angle,smoke);if(p){particles.push(p);group.add(p.sprite);}});
      else gate(safe,2,()=>{const p=makeParticle('smoke',2,[1,1,1],randomized,angle,smoke);if(p){particles.push(p);group.add(p.sprite);}});
    }
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];if(!updateParticle(p,factor)){group.remove(p.sprite);p.mat.dispose();releasePcParticle();particles.splice(i,1);continue;}applyParticleVisual(p,baseOrigin);}
  };
  return {group,hidden:contract.hidden,dispose(){if(disposed)return;disposed=true;for(const p of particles){group.remove(p.sprite);p.mat.dispose();releasePcParticle();}particles.length=0;}};
}


function boneWorldPoint(renderer, boneIndex, pcOffset, out = new THREE.Vector3()) {
  const bone = renderer?.bones?.[boneIndex | 0];
  if (!bone) return null;
  // Mixer has already updated local bone transforms when presentation callbacks
  // run. Pull parent/outer matrices now; local offset remains in MU Z-up because
  // renderer.group owns the single applyMuUpAxis(-90° X) conversion.
  renderer.group.updateWorldMatrix?.(true, true);
  out.set(Number(pcOffset?.[0]) || 0, Number(pcOffset?.[1]) || 0, Number(pcOffset?.[2]) || 0);
  return bone.localToWorld(out);
}
function makeBoneSmokeParticle(worldPos, loaded, worldMs = 0) {
  const p = makeParticle('smoke', 0, [1,1,1], [0,0,0], [0,0,0], loaded);
  if (!p) return null;
  p.baseOrigin = worldPos.clone();
  p.rotation = Number(worldMs) % 360;
  return p;
}
function makePcLightSprite(loaded) {
  const mat = new THREE.SpriteMaterial({map:loaded.texture,color:0xffffff,transparent:true,opacity:1,depthTest:true,depthWrite:false,fog:false,toneMapped:false,blending:THREE.AdditiveBlending});
  const sprite = new THREE.Sprite(mat);
  sprite.frustumCulled = true;
  sprite.userData.muPcOwner = 'ZzzObject.cpp::RenderObjectVisual/MerchantAnimal';
  return {sprite,mat};
}

/**
 * Lorencia bone-space visual owners from B101 ZzzObject.cpp:
 * - MODEL_WATERSPOUT (105): smoke at BoneTransform[1]/[4] and mesh-3 V scroll.
 * - MODEL_MERCHANT_ANIMAL01 (56): BITMAP_LIGHT at bones 48/57.
 *
 * The callback is registered on MUModelRenderer so it executes after mixer bone
 * transforms for the same frame, matching RenderObjectVisual's BoneTransform use.
 */
export async function createPcLorenciaBoneVisualOwner(serial, renderer, obj) {
  const type = serial | 0;
  if (type !== 56 && type !== 105) return null;
  const group = new THREE.Group();
  group.name = type === 105 ? 'Lorencia_Waterspout_BoneVisual' : 'Lorencia_MerchantAnimal_BoneVisual';
  group.userData.muPcBoneVisualOwner = true;
  let disposed = false, lastMs = null, pcTickAcc = 0;
  const smoke = type === 105 ? await loadBitmap(PC_LORENCIA_BITMAP_PATHS.BITMAP_SMOKE) : null;
  const flare = type === 56 ? await loadBitmap(PC_LORENCIA_BITMAP_PATHS.BITMAP_LIGHT) : null;
  if ((type === 105 && !smoke) || (type === 56 && !flare)) return null;
  const particles = [];
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  const merchant = [];

  if (type === 56) {
    merchant.push(makePcLightSprite(flare), makePcLightSprite(flare));
    group.add(merchant[0].sprite, merchant[1].sprite);
  }

  if (type === 105) {
    // R76: BlendMesh=3 UV/additive render-state is centralized in
    // PcMapObjectVisuals so the same source RenderMesh law owns all maps.
    // This bone owner now owns only the source smoke children.
    renderer.userData = renderer.userData || {};
    renderer.userData.muPcLorenciaWaterspout = { blendMesh:3, blendMeshLight:1, runtimePresentationOwner:'PcMapObjectVisuals' };
  }

  const emitWaterspoutPair = (worldMs) => {
    const p1 = [ri(32)-16, -20, ri(32)-16];
    const p4 = [ri(32)-16, -80, ri(32)-16];
    const w1 = boneWorldPoint(renderer, 1, p1, tmpA);
    if (w1) { const p=makeBoneSmokeParticle(w1, smoke, worldMs); if(p){particles.push(p);group.add(p.sprite);} }
    const w4 = boneWorldPoint(renderer, 4, p4, tmpB);
    if (w4) { const p=makeBoneSmokeParticle(w4, smoke, worldMs); if(p){particles.push(p);group.add(p.sprite);} }
  };

  renderer.addPresentationUpdate?.((worldMs = 0) => {
    if (disposed) return;
    const ms = Number(worldMs) || 0;
    const dt = lastMs == null ? 0 : Math.max(0, Math.min(0.25, (ms-lastMs)/1000));
    lastMs = ms;
    if (type === 105) {
      // B101 uses raw rand()%2 in RenderObjectVisual. R74/R75 preserve the MU
      // 25Hz reference presentation cadence so density is stable at 60/120Hz.
      pcTickAcc += dt * 25;
      let steps = Math.min(6, Math.floor(pcTickAcc));
      pcTickAcc -= steps;
      while (steps-- > 0) if (ri(2) === 0) emitWaterspoutPair(ms);
      const factor = Math.min(2.5, dt * 25);
      for (let i=particles.length-1;i>=0;i--) {
        const p=particles[i];
        if (!updateParticle(p,factor)) { group.remove(p.sprite); p.mat.dispose(); releasePcParticle(); particles.splice(i,1); continue; }
        applyParticleVisual(p,p.baseOrigin);
      }
    } else {
      // Source Luminosity=(rand()%30+70)*.01; two BITMAP_LIGHT sprites.
      const lum=(ri(30)+70)*.01, scale=lum*5;
      const rgb=[lum*.6,lum*.3,lum*.1];
      const bones=[48,57];
      for(let i=0;i<2;i++){
        const w=boneWorldPoint(renderer,bones[i],[0,0,0],i===0?tmpA:tmpB);
        if(!w) { merchant[i].sprite.visible=false; continue; }
        merchant[i].sprite.visible=true;
        merchant[i].sprite.position.copy(w);
        merchant[i].mat.color.setRGB(rgb[0],rgb[1],rgb[2]);
        merchant[i].sprite.scale.set(flare.width*scale,flare.height*scale,1);
      }
    }
  });

  return {group,dispose(){if(disposed)return;disposed=true;for(const p of particles){group.remove(p.sprite);p.mat.dispose();releasePcParticle();}particles.length=0;for(const x of merchant)x.mat.dispose();group.clear();}};
}
