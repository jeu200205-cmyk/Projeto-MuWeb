// PcIcarusEnvironment.js — exact retained Main 5.2 WD_10HEAVEN environment owners.
// Source owners:
//   ZzzEffectFireLeave.cpp CreateHeavenRain/MoveHeavenRain/MoveLeaves/RenderLeaves
//   Winmain.cpp ambient SOUND_HEAVEN01 loop
// No procedural replacement: missing rain texture/audio simply omits that child owner.
import * as THREE from 'three';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { Sound } from '../audio/SoundManager.js';
import { MUAssets } from '../assets/MUAssetLoader.js';
import { MUModelRenderer } from '../assets/MUModelRenderer.js';
import { applyMuUpAxis } from '../graphics/BmdAdapter.js';
import { createPcThunderJointBatch } from './PcThunderJoint.js';
import { tryAcquirePcParticle, releasePcParticle } from './PcParticleBudget.js';

const PC_HZ = 25;
const TICK = 1 / PC_HZ;
const MAX_ACTIVE_RAIN = 80; // MoveLeaves(): iMaxLeaves=80 outside DevilSquare.
const RAIN_TARGET = 100;    // WD_10HEAVEN: MAX_LEAVES/2, MAX_LEAVES=200.
const RAIN_TEXTURE = 'World11/rain01.OZT';
const AMBIENT_BUFFER_ID = 'pc-icarus-heaven-buffer';
const AMBIENT_WAV = 'aHeaven.wav';
const HEAVEN_CLOUD_BMD = 'Object11/cloud.bmd';
const HEAVEN_LIGHT_TEXTURE = 'Effect/flare01.OZJ';
let ambientOwnerSerial = 0;
let heavenCloudBmdPromise = null;
function loadHeavenCloudBmd(){
  if(!heavenCloudBmdPromise) heavenCloudBmdPromise=MUAssets.loadBMD(HEAVEN_CLOUD_BMD).catch(()=>null);
  return heavenCloudBmdPromise;
}

let heavenLightTexturePromise = null;
async function loadHeavenLightTexture() {
  if (heavenLightTexturePromise) return heavenLightTexturePromise;
  heavenLightTexturePromise = (async () => {
    const d = await RemoteAssets.fetchDecodedImage(HEAVEN_LIGHT_TEXTURE);
    if (!d?.image || !(d.w > 0) || !(d.h > 0)) return null;
    const t = new THREE.Texture(d.image);
    t.needsUpdate = true;
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.userData.muPcBitmapPath = HEAVEN_LIGHT_TEXTURE;
    return Object.freeze({ texture: t, width: d.w, height: d.h });
  })().catch(() => null);
  return heavenLightTexturePromise;
}

let rainTexturePromise = null;
async function loadRainTexture() {
  if (rainTexturePromise) return rainTexturePromise;
  rainTexturePromise = (async () => {
    const d = await RemoteAssets.fetchDecodedImage(RAIN_TEXTURE);
    if (!d?.image || !(d.w > 0) || !(d.h > 0)) return null;
    const t = new THREE.Texture(d.image);
    t.needsUpdate = true;
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.userData.muPcBitmapPath = RAIN_TEXTURE;
    return t;
  })().catch(() => null);
  return rainTexturePromise;
}

// Main 5.2 RenderPlane3D(1,20, AngleMatrix(-30,0,0)), converted from
// MU Z-up into Web/Three Y-up. The quad stays source-oriented; instances only
// translate it to each authored particle position.
function makeRainGeometry() {
  const w = 1, h = 20;
  const mu = [
    [-w,-w,-h], [ w, w,-h], [ w, w, h], [-w,-w, h],
  ];
  const a = -30 * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const pos = new Float32Array(12);
  for (let i=0;i<4;i++) {
    const x=mu[i][0], y=mu[i][1], z=mu[i][2];
    const ry=y*c-z*s, rz=y*s+z*c;
    // MU (X,Y,Z) -> Web (X,Z,-Y)
    pos[i*3+0]=x; pos[i*3+1]=rz; pos[i*3+2]=-ry;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    0,1, 1,1, 1,0, 0,0,
  ]),2));
  g.setIndex([0,1,2, 0,2,3]);
  g.computeBoundingSphere();
  return g;
}

function heroPosition(gameScene) {
  const p = gameScene?.mainObject?.position;
  return p?.isVector3 ? p : null;
}

function terrainHeight(gameScene, x, z) {
  const h = gameScene?.terrainHeightAt?.(x,z);
  return Number.isFinite(Number(h)) ? Number(h) : 0;
}

function spawnRain(p, hero) {
  // CreateHeavenRain exact domains:
  // X + rand()%1600-800; MU-Y + rand()%1400-500; Z + rand()%200+200.
  const dx = Math.floor(Math.random()*1600)-800;
  const dy = Math.floor(Math.random()*1400)-500;
  const dz = Math.floor(Math.random()*200)+200;
  const speed = Math.floor(Math.random()*24)+20;
  p.x = hero.x + dx;
  p.y = hero.y + dz;
  // MU-Y positive maps to negative Web-Z.
  p.z = hero.z - dy;
  // Vector(0,0,-speed) rotated by MU AngleX=-30 then converted to Web axes.
  p.vx = 0;
  p.vy = -Math.cos(Math.PI/6) * speed;
  p.vz = Math.sin(Math.PI/6) * speed;
  p.live = true;
}

export async function createPcIcarusEnvironmentOwner(gameScene) {
  const group = new THREE.Group();
  group.name = 'PcIcarusEnvironment_W11';
  group.userData.muPcOwner = 'ZzzEffectFireLeave.cpp::WD_10HEAVEN + Winmain.cpp::SOUND_HEAVEN01';
  group.userData.muPcRainMaxLeaves = MAX_ACTIVE_RAIN;
  group.userData.muPcRainTarget = RAIN_TARGET;
  group.userData.muPcTerrainMeshDraw = false;

  let disposed = false;
  let active = false;
  let ambientStarted = false;
  const ambientPlayId = `pc-icarus-heaven-owner-${++ambientOwnerSerial}`;
  let rainMesh = null;
  let rainMaterial = null;
  let rainGeometry = null;
  const particles = Array.from({length:MAX_ACTIVE_RAIN},()=>({live:false,x:0,y:0,z:0,vx:0,vy:0,vz:0}));
  const dummy = new THREE.Object3D();
  let rainCurrent = 0;
  let accumulator = 0;
  let elapsed = 0;
  const heavenClouds = [];
  // World11 MoveHeavenThunder MODEL_CLOUD lives only two authored 25-Hz ticks.
  // Reuse expired renderers instead of rebuilding skeleton/material state for every
  // lightning pulse. The pool is unbounded-on-demand (never drops a source spawn),
  // and only inactive renderers are reused, so visual ownership/lifetime is exact.
  const heavenCloudPool = [];
  let heavenCloudCreated = 0, heavenCloudReused = 0;
  // FIX88: MoveHeavenThunder +1/subtype0 shares one retained batch for the whole
  // environment owner. The source still spawns two logical joints per authored
  // branch; only Web submission/allocation is fused.
  let thunderBatch = null;
  const pendingThunder=[];
  void createPcThunderJointBatch({group,camera:gameScene.camera?.threeCamera,bitmapPlusOne:true,subtype:0,maxJoints:96})
    .then((b)=>{
      if(disposed){b?.dispose?.();return;}
      thunderBatch=b; group.userData.muPcHeavenThunderBatch=Boolean(b);
      if(b) for(const q of pendingThunder.splice(0)) b.spawn(q.start,q.end,q.scale,q.light);
      else pendingThunder.length=0;
    });

  // ZzzObject.cpp::MoveObjectSetting(WD_10HEAVEN) creates BITMAP_LIGHT
  // around Hero with a 1/10 tick gate.  The effect itself is an invisible
  // motion owner; MoveEffect emits BITMAP_LIGHT subtype 1 trail particles.
  // Keep both owners in PC-space so the authored Direction/Z gravity math is
  // not distorted by the MU Z-up -> Three Y-up basis conversion.
  const heavenLightEffects = [];
  const heavenLightParticles = [];
  // FIX83: reuse BITMAP_LIGHT sprite/material objects. The old path allocated and
  // disposed a SpriteMaterial for every 25-Hz trail particle, producing GC/GPU
  // churn severe enough to collapse Icarus to ~20 FPS on physical runs.
  const heavenLightParticlePool = [];
  let heavenLightLoaded = null;
  void loadHeavenLightTexture().then((v) => {
    heavenLightLoaded = v;
    if (!v) group.userData.muPcHeavenLightMissing = HEAVEN_LIGHT_TEXTURE;
  });

  // Prewarm one inactive MODEL_CLOUD renderer while World11 is staging.  The
  // first authored 1/50 thunder tick must not pay BMD skeleton/material setup
  // on the live frame.  This does not spawn or draw an effect: the renderer is
  // kept detached in the same inactive pool consumed by spawnHeavenThunderRoot.
  void loadHeavenCloudBmd().then(async(b)=>{
    if(!b){ group.userData.muPcHeavenCloudMissing=HEAVEN_CLOUD_BMD; return; }
    if(disposed)return;
    try{
      const r=new MUModelRenderer({scene:gameScene.scene,camera:gameScene.camera?.threeCamera});
      await r.initFromBMD(b);
      if(disposed){r.dispose?.();return;}
      heavenCloudPool.push(r); heavenCloudCreated++;
      group.userData.muPcHeavenCloudRenderersCreated=heavenCloudCreated;
      group.userData.muPcHeavenCloudPrewarmed=1;
    }catch(e){group.userData.muPcHeavenCloudPrewarmError=e?.message||String(e);}
  });


  const publishInstances = () => {
    if (!rainMesh) return;
    for (let i=0;i<MAX_ACTIVE_RAIN;i++) {
      const p=particles[i];
      if (p.live) { dummy.position.set(p.x,p.y,p.z); dummy.scale.setScalar(1); }
      else { dummy.position.set(0,-100000,0); dummy.scale.setScalar(0); }
      dummy.rotation.set(0,0,0); dummy.updateMatrix();
      rainMesh.setMatrixAt(i,dummy.matrix);
    }
    rainMesh.instanceMatrix.needsUpdate=true;
  };


  // Map publication must not wait on remote decode/audio. The PC loads these
  // assets up front; Web starts the exact child owners as soon as their retained
  // files resolve, while terrain/objects can commit immediately.
  void loadRainTexture().then((texture)=>{
    if(!texture||disposed){ if(!texture)group.userData.muPcRainMissingTexture=RAIN_TEXTURE; return; }
    rainGeometry = makeRainGeometry();
    rainMaterial = new THREE.MeshBasicMaterial({
      map:texture, color:0xffffff, transparent:true, opacity:1,
      depthTest:true, depthWrite:false, side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending, toneMapped:false,
    });
    rainMesh = new THREE.InstancedMesh(rainGeometry,rainMaterial,MAX_ACTIVE_RAIN);
    rainMesh.name='Icarus_PC_Rain01'; rainMesh.frustumCulled=false;
    rainMesh.userData.muPcOwner='CreateHeavenRain/MoveHeavenRain/RenderLeaves::BITMAP_RAIN';
    group.add(rainMesh); publishInstances();
  }).catch(()=>{group.userData.muPcRainMissingTexture=RAIN_TEXTURE;});

  const startAmbient = () => {
    if (disposed || !active || ambientStarted) return;
    const base = Sound.buffers?.get?.(AMBIENT_BUFFER_ID);
    if (!base) return;
    // Each staged/published World11 owns a private playback id. When Scene
    // activates the new layer before disposing the old one, the old dispose
    // cannot stop the new loop by sharing the same SoundManager id.
    Sound.buffers?.set?.(ambientPlayId, base);
    Sound.play?.(ambientPlayId,{loop:true});
    ambientStarted = true;
    group.userData.muPcAmbient='Sound/aHeaven.wav';
    group.userData.muPcAmbientPlayId=ambientPlayId;
  };
  if (typeof Sound.loadWav === 'function') {
    if (Sound.buffers?.has?.(AMBIENT_BUFFER_ID)) startAmbient();
    else void Sound.loadWav(AMBIENT_BUFFER_ID,AMBIENT_WAV)
      .then(()=>startAmbient())
      .catch(()=>{group.userData.muPcAmbientMissing='Sound/aHeaven.wav';});
  }


  const pcToWeb=(v)=>new THREE.Vector3(v[0],v[2],-v[1]);
  const webHeroToPc=(hero)=>[hero.x,-hero.z,hero.y];

  const spawnHeavenLightTrailParticle = (fx) => {
    if (!heavenLightLoaded || !tryAcquirePcParticle()) return;
    let pooled = heavenLightParticlePool.pop() || null;
    let mat = pooled?.mat || null, sprite = pooled?.sprite || null;
    if (!sprite || !mat) {
      mat = new THREE.SpriteMaterial({
        map: heavenLightLoaded.texture, color: new THREE.Color(.3,.3,.3),
        transparent: true, opacity: 1, depthTest: true, depthWrite: false,
        blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
      });
      sprite = new THREE.Sprite(mat);
      sprite.frustumCulled = true;
      sprite.userData.muPcOwner = 'ZzzEffect.cpp::BITMAP_LIGHT/0 -> ZzzEffectParticle.cpp::BITMAP_LIGHT/1';
    }
    mat.map = heavenLightLoaded.texture; mat.opacity = 1; mat.color.setRGB(.3,.3,.3);
    sprite.visible = true;
    group.add(sprite);
    heavenLightParticles.push({
      pos: [...fx.pos], light: [.3,.3,.3], scale: fx.scale, life: 50,
      sprite, mat, released: false,
    });
  };

  const stepHeavenLightParticle = (p) => {
    // ZzzEffectParticle.cpp BITMAP_LIGHT subtype 1 exact retained decay.
    p.life -= 1;
    p.light[0] *= .9; p.light[1] *= .9; p.light[2] *= .9;
    p.scale *= .95;
    p.mat.color.setRGB(p.light[0],p.light[1],p.light[2]);
    p.sprite.position.copy(pcToWeb(p.pos));
    p.sprite.scale.set(heavenLightLoaded.width*p.scale,heavenLightLoaded.height*p.scale,1);
    return p.life > 0 && p.scale > .01;
  };

  const moveHeavenLightEffect = (fx) => {
    // ZzzEffect.cpp BITMAP_LIGHT subtype 0. FPS_ANIMATION_FACTOR=1 at 25 Hz.
    fx.pos[0] += fx.dir[0]; fx.pos[1] += fx.dir[1]; fx.pos[2] += fx.dir[2];
    fx.dir[2] -= .01;
    spawnHeavenLightTrailParticle(fx);
    fx.life -= 1;
    if (fx.dir[2] < -2) fx.life = 0;
    return fx.life > 0;
  };

  const spawnHeavenAmbientLight = (hero) => {
    // MoveObjectSetting: Hero XY +/-2500, MU-Z -1000, white CreateEffect input.
    // CreateEffect(BITMAP_LIGHT, subtype0) then overrides Light=.3, Scale=3,
    // LifeTime=400 and Direction from the authored 70°/30° vector.
    const h = webHeroToPc(hero);
    const speed = (9 + Math.floor(Math.random()*5)) * .5;
    const a70 = 70*Math.PI/180, a30 = 30*Math.PI/180;
    heavenLightEffects.push({
      pos:[h[0]+Math.floor(Math.random()*5000)-2500,h[1]+Math.floor(Math.random()*5000)-2500,h[2]-1000],
      dir:[speed*Math.cos(a70)*Math.sin(a30),speed*Math.cos(a70)*Math.cos(a30),speed*Math.sin(a70)],
      scale:3, life:400,
    });
    group.userData.muPcHeavenAmbientLightSpawned = (group.userData.muPcHeavenAmbientLightSpawned||0)+1;
  };
  const rotZ=(v,deg)=>{const a=deg*Math.PI/180,c=Math.cos(a),sn=Math.sin(a);return [v[0]*c-v[1]*sn,v[0]*sn+v[1]*c,v[2]];};
  const addPc=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
  const subPc=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  const spawnHeavenThunderRibbon = (hero) => {
    // ZzzObject.cpp::MoveHeavenThunder exact 1/5 child branch after the 1/50 root gate.
    const h=webHeroToPc(hero); const caseId=Math.floor(Math.random()*4);
    let v1,rot2,v2;
    if(caseId===0){v1=[-400,-1000,0];rot2=240;v2=[-200,-1000,0];}
    else if(caseId===1){v1=[-300,-400,0];rot2=210;v2=[-500,-1000,0];}
    else if(caseId===2){v1=[-200,-400,0];rot2=235;v2=[-1000,-1500,0];}
    else {v1=[-200,400,0];rot2=200;v2=[-600,-1200,0];}
    const r1=rotZ(v1,-45);
    const pos=caseId===1?subPc(h,r1):addPc(h,r1);
    const r2=rotZ(v2,rot2); let p2=subPc(pos,r2),p1=addPc(pos,r2);
    p1=[p1[0],p1[1],p1[2]-300];p2=[p2[0],p2[1],p2[2]-300];
    for(let i=0;i<2;i++){
      const scale=40+Math.floor(Math.random()*10);
      const start=pcToWeb(p1),end=pcToWeb(p2);
      if(thunderBatch) thunderBatch.spawn(start,end,scale);
      else pendingThunder.push({start,end,scale,light:null});
    }
  };

  const spawnHeavenThunderRoot = (hero) => {
    // MoveHeavenThunder: 1/50 authored tick gate. The source always adds the
    // local terrain-light pulse and creates MODEL_CLOUD at Hero position; the
    // MODEL_CLOUD constructor then applies MU Y+200 / Z-190, Scale=10, Life=2.
    const muX=hero.x,muY=-hero.z,muZ=hero.y;
    const lum=(Math.floor(Math.random()*4)+4)*.05;
    gameScene.addDynamicTerrainLightMu?.(muX+Math.floor(Math.random()*300)-150,muY,[lum*.3,lum*.3,lum*.081],2);
    void loadHeavenCloudBmd().then(async(bmd)=>{
      if(!bmd||disposed||!active)return;
      try{
        let r=heavenCloudPool.pop()||null;
        if(r){ heavenCloudReused++; }
        else {
          r=new MUModelRenderer({scene:gameScene.scene,camera:gameScene.camera?.threeCamera});
          await r.initFromBMD(bmd); heavenCloudCreated++;
        }
        if(disposed||!active){r.dispose?.();return;}
        applyMuUpAxis(r.group);r.group.position.set(hero.x,hero.y-190,hero.z-200);r.group.scale.setScalar(10);
        r.setLightEnabled?.(false);r.playAction?.('action_0');r.group.userData.muPcOwner='MoveHeavenThunder::MODEL_CLOUD';
        r.group.userData.muPcLifeTicks=2;r.group.userData.muPcBlendMesh=0;group.add(r.group);heavenClouds.push({r,ticks:2});
        group.userData.muPcHeavenCloudRenderersCreated=heavenCloudCreated;
        group.userData.muPcHeavenCloudRenderersReused=heavenCloudReused;
      }catch(e){group.userData.muPcHeavenCloudError=e?.message||String(e);}
    });
  };

  const authoredTick = () => {
    const hero=heroPosition(gameScene);
    if (!hero) return;
    if (rainCurrent > RAIN_TARGET) rainCurrent -= 1;
    else if (rainCurrent < RAIN_TARGET) rainCurrent += 1;
    if(Math.floor(Math.random()*50)===0){ spawnHeavenThunderRoot(hero); if(Math.floor(Math.random()*5)===0) spawnHeavenThunderRibbon(hero); }
    // MoveObjectSetting(WD_10HEAVEN): independent 1/10 ambient light-effect gate.
    if(Math.floor(Math.random()*10)===0) spawnHeavenAmbientLight(hero);
    for(let i=heavenClouds.length-1;i>=0;i--){const c=heavenClouds[i];c.r.update?.(TICK,elapsed);c.ticks--;if(c.ticks<=0){c.r.group?.parent?.remove(c.r.group);heavenCloudPool.push(c.r);heavenClouds.splice(i,1);}}
    thunderBatch?.tick?.();
    for(let i=heavenLightEffects.length-1;i>=0;i--){
      const fx=heavenLightEffects[i];
      // MoveEffects calls MoveEffect once, then BITMAP_LIGHT/0 can receive the
      // source rand_fps_check(2) extra MoveEffect call. Preserve that second move.
      let live=moveHeavenLightEffect(fx);
      if(live&&Math.floor(Math.random()*2)===0) live=moveHeavenLightEffect(fx);
      if(!live) heavenLightEffects.splice(i,1);
    }
    for(let i=heavenLightParticles.length-1;i>=0;i--){
      const p=heavenLightParticles[i];
      if(!stepHeavenLightParticle(p)){
        p.sprite.parent?.remove(p.sprite); p.sprite.visible=false;
        heavenLightParticlePool.push({sprite:p.sprite,mat:p.mat});
        if(!p.released){p.released=true;releasePcParticle();}
        heavenLightParticles.splice(i,1);
      }
    }
    group.userData.muPcHeavenAmbientLightLive = heavenLightEffects.length;
    group.userData.muPcHeavenAmbientLightTrailLive = heavenLightParticles.length;
    group.userData.muPcHeavenAmbientLightPool = heavenLightParticlePool.length;
    const rainly = rainCurrent * 2; // RainCurrent * MAX_LEAVES / 100; MAX_LEAVES=200.
    for(let i=0;i<MAX_ACTIVE_RAIN;i++) {
      const p=particles[i];
      if(!p.live) {
        if(i<rainly) spawnRain(p,hero);
        continue;
      }
      // MoveHeavenRain: one authored PC tick; FPS_ANIMATION_FACTOR=1 at 25 Hz.
      p.x += p.vx; p.y += p.vy; p.z += p.vz;
      if(p.y < terrainHeight(gameScene,p.x,p.z)) {
        p.live=false; // Icarus intentionally creates NO rain-circle splash.
      }
    }
    publishInstances();
  };

  group.userData.update=(dt)=>{
    if(disposed)return;
    const step=Math.max(0,Number(dt)||0); elapsed+=step; accumulator+=step;
    // Fixed authored 25-Hz leaf/rain owner. Cap catch-up without changing rate.
    let guard=0; while(accumulator+1e-9>=TICK&&guard++<8){accumulator-=TICK;authoredTick();}
    // Browser suspension/long GC must not create a multi-frame catch-up storm.
    // Main 5.2 advances these owners from the live 25-Hz render/update cadence;
    // it does not replay seconds of missed leaf ticks after the process resumes.
    if(accumulator+1e-9>=TICK){const dropped=Math.floor(accumulator/TICK);accumulator-=dropped*TICK;group.userData.muPcDroppedBacklogTicks=(group.userData.muPcDroppedBacklogTicks||0)+dropped;}
    group.userData.muPcRainCurrent=rainCurrent;
    group.userData.muPcRainLive=particles.reduce((n,p)=>n+(p.live?1:0),0);
    group.userData.muPcElapsed=elapsed;
  };

  return {
    group,
    activate(){
      if(disposed)return false;
      active=true;
      startAmbient();
      group.userData.muPcActive=true;
      return true;
    },
    dispose(){
      if(disposed)return;disposed=true;active=false;
      if(ambientStarted){
        try{Sound.stop?.(ambientPlayId);}catch(_){}
        try{Sound.buffers?.delete?.(ambientPlayId);}catch(_){}
        ambientStarted=false;
      }
      for(const c of heavenClouds.splice(0)){try{c.r?.dispose?.();}catch{}}
      for(const r of heavenCloudPool.splice(0)){try{r?.dispose?.();}catch{}}
      pendingThunder.length=0; thunderBatch?.dispose?.(); thunderBatch=null;
      heavenLightEffects.length=0;
      for(const p of heavenLightParticles.splice(0)){
        try{p.sprite?.parent?.remove(p.sprite);p.mat?.dispose?.();}catch{}
        if(!p.released){p.released=true;releasePcParticle();}
      }
      for(const p of heavenLightParticlePool.splice(0)){try{p.sprite?.parent?.remove(p.sprite);p.mat?.dispose?.();}catch{}}
      rainMesh?.parent?.remove(rainMesh);
      rainGeometry?.dispose?.(); rainMaterial?.dispose?.();
      group.clear();
    }
  };
}
