// PcIcarusBoids.js — retained Main 5.2 GOBoid.cpp WD_10HEAVEN sky boids.
// FIX72 closes the three source-owned MODEL_MONSTER01+31 dragons.
// FIX74 closes boid slots 3..12: MoveHeavenBug + MODEL_SPEARSKILL CreateJoint subtype1
// using the retained JointSpirit01 texture, 30-tail cross ribbon and authored light law.
import * as THREE from 'three';
import { MUAssets } from '../assets/MUAssetLoader.js';
import { MUModelRenderer, RenderFlags } from '../assets/MUModelRenderer.js';
import { applyMuUpAxis } from '../graphics/BmdAdapter.js';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { tryAcquirePcParticle, releasePcParticle } from './PcParticleBudget.js';
import { acquirePcJointSlot, releasePcJointSlot } from './PcJointPool.js';

const PC_HZ = 25;
const TICK = 1 / PC_HZ;
const DRAGON_COUNT = 3;
const SPEAR_COUNT = 10;
const SPEAR_TAILS = 30;
const SPEAR_SCALE = 25;
const SPEAR_TEXTURE = 'Effect/JointSpirit01.OZJ';
let spearTexturePromise = null;
const DRAGON_BMD = 'Monster/Monster32.bmd'; // OpenMonsterModel(31) => Type+1.
const DRAGON_ACTION = 'action_7'; // MONSTER01_DIE(6)+1.
const ri = (n) => Math.floor(Math.random() * Math.max(1, n));
const rad = (d) => d * Math.PI / 180;
const deg = (r) => r * 180 / Math.PI;


async function loadSpearTexture() {
  if (spearTexturePromise) return spearTexturePromise;
  spearTexturePromise = (async () => {
    const d = await RemoteAssets.fetchDecodedImage(SPEAR_TEXTURE);
    if (!d?.image) return null;
    const t = new THREE.Texture(d.image);
    t.needsUpdate = true;
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.userData.muPcBitmapPath = SPEAR_TEXTURE;
    return t;
  })().catch(() => null);
  return spearTexturePromise;
}
function makeSpearBatchGeometry(count=SPEAR_COUNT) {
  const samples=SPEAR_TAILS, vertsPerSample=4, vertsPerSpear=samples*vertsPerSample;
  const totalVerts=count*vertsPerSpear;
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(totalVerts*3),3));
  g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(totalVerts*3),3));
  const uv=new Float32Array(totalVerts*2),idx=[];
  for(let s=0;s<count;s++){
    const vb=s*vertsPerSpear;
    for(let i=0;i<samples;i++){
      const v=i/Math.max(1,samples-1),o=(vb+i*4)*2;
      uv[o]=0;uv[o+1]=v;uv[o+2]=1;uv[o+3]=v;uv[o+4]=0;uv[o+5]=v;uv[o+6]=1;uv[o+7]=v;
    }
    for(let i=0;i<samples-1;i++){
      const a=vb+i*4,b=a+1,c=a+2,d=a+3,n=vb+(i+1)*4;
      idx.push(a,b,n,b,n+1,n,c,d,n+2,d,n+3,n+2);
    }
  }
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(idx);
  return g;
}
function updateSpearBatch(spears,mesh){
  if(!mesh)return;
  const pa=mesh.geometry.attributes.position.array,ca=mesh.geometry.attributes.color.array;
  const half=SPEAR_SCALE*.5,vertsPerSpear=SPEAR_TAILS*4;
  let any=false;
  for(let si=0;si<spears.length;si++){
    const owner=spears[si],enabled=owner.live&&owner.budget&&owner.tails.length>0;
    any ||= enabled;
    const l=owner.point?.light||[.2,.2,.4];
    for(let i=0;i<SPEAR_TAILS;i++){
      const p=enabled?(owner.tails[i]||owner.tails[owner.tails.length-1]||owner.point):null;
      const x=p?.x||0,y=p?.z||0,z=-(p?.y||0),vbase=si*vertsPerSpear+i*4,o=vbase*3;
      const h=enabled?half:0;
      pa[o]=x-h;pa[o+1]=y;pa[o+2]=z;pa[o+3]=x+h;pa[o+4]=y;pa[o+5]=z;
      pa[o+6]=x;pa[o+7]=y-h;pa[o+8]=z;pa[o+9]=x;pa[o+10]=y+h;pa[o+11]=z;
      for(let v=0;v<4;v++){const c=o+v*3;ca[c]=l[0];ca[c+1]=l[1];ca[c+2]=l[2];}
    }
  }
  mesh.geometry.attributes.position.needsUpdate=true;mesh.geometry.attributes.color.needsUpdate=true;
  mesh.visible=any;
  // World-space ribbons span the whole Icarus sky. Do not force a per-tick O(N) bounds recompute.
  mesh.frustumCulled=false;
}

function spearOrbitMu(target, worldTick, jointIndex) {
  // ZzzEffectJoint.cpp MODEL_SPEARSKILL subtype 1.
  let iFrame = worldTick;
  iFrame = ((jointIndex % 2) ? iFrame : -iFrame) + jointIndex * 53731;
  const f0 = 0.048 * 0.5, f1 = 0.0613 * 0.5, f2 = 0.1113 * 0.5;
  const x0 = Math.sin((iFrame + 55555) * f0) * Math.cos(iFrame * f1);
  const y0 = Math.sin((iFrame + 55555) * f0) * Math.sin(iFrame * f1);
  const z0 = Math.cos((iFrame + 55555) * f0);
  const sa = Math.sin((iFrame + 11111) * f2), ca = Math.cos((iFrame + 11111) * f2);
  const vz = x0;
  const vy = sa * y0 + ca * z0;
  const vx = ca * y0 - sa * z0;
  return {
    x: target.x + vx * 70,
    y: target.y + vy * 70,
    z: target.z + 10 + vz * 140,
    light: [0.2, 0.2, 0.4 + 0.2 * sa],
  };
}

function heroMu(gameScene) {
  const p = gameScene?.mainObject?.position;
  if (!p?.isVector3) return null;
  return { x: p.x, y: -p.z, z: p.y };
}
function calcAngle(x, y, tx, ty) {
  let a = deg(Math.atan2(ty - y, tx - x));
  if (a < 0) a += 360;
  return a;
}
function turnAngle(current, target, step) {
  let d = ((target - current + 540) % 360) - 180;
  if (Math.abs(d) <= step) return (target + 360) % 360;
  return (current + Math.sign(d) * step + 360) % 360;
}

export function createPcIcarusBoidsOwner(gameScene) {
  const group = new THREE.Group();
  group.name = 'Icarus_PC_DragonBoids';
  group.userData.muPcOwner = 'GOBoid.cpp::MoveBoids/CreateDragon/MoveBoidGroup';
  group.userData.muPcDragonModel = DRAGON_BMD;
  group.userData.muPcDragonCount = DRAGON_COUNT;
  group.userData.muPcSpearJointBoids = SPEAR_COUNT;
  group.userData.muPcSpearJointOwner = 'GOBoid.cpp::CreateDragon(index>=3)+MoveHeavenBug; ZzzEffectJoint MODEL_SPEARSKILL subtype1';

  const dragons = Array.from({ length: DRAGON_COUNT }, (_, i) => ({
    i, live: false, renderer: null, outer: null,
    x: 0, y: 0, z: 0, angle: 0, velocity: 0.2, gravity: 0.5,
    dirX: 0, dirY: 0, dirZ: 0, scale: 0.3, alpha: 1,
  }));
  const spears = Array.from({ length: SPEAR_COUNT }, (_, j) => ({
    i: j + DRAGON_COUNT, jointIndex: -1, jointSlot: null, live: false,
    x: 0, y: 0, z: 0, angle: 0, velocity: 2.2, lifeTime: 240*40,
    tails: [], point: {x:0,y:0,z:0,light:[.2,.2,.4]}, budget: false,
  }));
  // Desktop ZzzEffectJoint indexes the actual global JOINT slot in subtype-1 orbit.
  // Acquire all ten retained Icarus joints in creation order instead of using 0..9.
  for (const b of spears) { b.jointSlot=acquirePcJointSlot('MODEL_SPEARSKILL:1'); b.jointIndex=b.jointSlot.index; }
  group.userData.muPcSpearJointIndices=spears.map(b=>b.jointIndex);
  let worldTick = 0, spearBatchMesh=null;
  let disposed = false, ready = false, acc = 0, elapsed = 0;

  function spawn(d, hero) {
    // GOBoid.cpp::CreateDragon(index<3), exact authored ranges.
    d.scale = (ri(3) + 6) * 0.05;       // .30/.35/.40
    d.velocity = (ri(10) + 10) * 0.02;  // .20..38
    d.gravity = (ri(10) + 10) * 0.05;   // .50..95
    d.angle = ri(360);
    d.x = hero.x + (ri(4000) - 2000);
    d.y = hero.y + (ri(4000) - 2000);
    d.z = hero.z - 600;
    d.dirZ = 0;
    const a = rad(d.angle);
    d.dirX = d.x + Math.cos(a) * d.velocity * 75;
    d.dirY = d.y + Math.sin(a) * d.velocity * 75;
    d.alpha = 1;
    d.live = true;
    if (d.outer) {
      d.outer.visible = true;
      d.outer.scale.setScalar(d.scale);
      d.outer.position.set(d.x, d.z, -d.y);
      d.outer.rotation.y = rad(d.angle);
    }
  }
  function steer(d) {
    let n = 0, tx = 0, ty = 0;
    for (const t of dragons) {
      if (!t.live || t === d) continue;
      const dx = d.x - t.x, dy = d.y - t.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= 400) continue;
      let xdist = t.dirX - t.x;
      let ydist = t.dirY - t.y;
      if (distance < 80) {
        xdist -= t.dirX - d.x;
        ydist -= t.dirY - d.y;
      } else {
        xdist += t.dirX - d.x;
        ydist += t.dirY - d.y;
      }
      const pd = Math.hypot(xdist, ydist);
      if (pd > 1e-6) { tx += xdist / pd; ty += ydist / pd; n++; }
    }
    if (n > 0) {
      const target = calcAngle(d.x, d.y, d.x + tx / n, d.y + ty / n);
      d.angle = turnAngle(d.angle, target, d.gravity);
    }
  }
  function spawnSpear(b, hero) {
    b.velocity = 2.2;
    b.lifeTime = 240 * 40;
    b.angle = ri(360);
    b.x = hero.x + (ri(1024) - 512);
    b.y = hero.y + (ri(1024) - 512);
    b.z = hero.z;
    b.live = true;
    b.tails.length = 0;
  }
  function tickSpear(b, hero) {
    if (!b.live) { spawnSpear(b, hero); return; }
    // GOBoid.cpp::MoveHeavenBug, authored at the 25 Hz FX/world tick.
    // PC passes Angle[2] directly to sinf/cosf here (no degree conversion).
    b.x += b.velocity * Math.sin(b.angle);
    b.y -= b.velocity * Math.cos(b.angle);
    const iFrame = worldTick;
    b.angle += 0.01 * Math.cos((34571 + iFrame + b.i * 41273) * 0.0003)
                    * Math.sin((17732 + iFrame + b.i * 5161) * 0.0003);
    b.lifeTime -= 1;
    if (Math.hypot(b.x-hero.x,b.y-hero.y) >= 1500 || ri(5120) === 0) {
      b.live = false; b.tails.length = 0; return;
    }
    const q = spearOrbitMu(b, worldTick, b.jointIndex);
    b.point = q;
    b.tails.unshift({x:q.x,y:q.y,z:q.z});
    if (b.tails.length > SPEAR_TAILS) b.tails.length = SPEAR_TAILS;
  }

  function tick() {
    const hero = heroMu(gameScene);
    if (!ready || !hero) return;
    worldTick++;
    for (const d of dragons) {
      if (!d.live) { spawn(d, hero); continue; }
      steer(d); // ZzzAI.cpp::MoveBoid.
      // MoveBoidGroup normal-map direction = Velocity*25, FPS factor=1 at 25 Hz.
      const a = rad(d.angle);
      const vx = Math.cos(a) * d.velocity * 25;
      const vy = Math.sin(a) * d.velocity * 25;
      d.x += vx; d.y += vy; d.z += d.dirZ;
      d.dirX = d.x + 3 * vx; d.dirY = d.y + 3 * vy;
      if (Math.hypot(d.x - hero.x, d.y - hero.y) >= 4000) {
        d.live = false;
        if (d.outer) d.outer.visible = false;
        continue;
      }
      d.outer.position.set(d.x, d.z, -d.y);
      d.outer.rotation.y = rad(d.angle);
      d.outer.visible = true;
    }
    for (const b of spears) tickSpear(b, hero);
    updateSpearBatch(spears,spearBatchMesh);
  }

  void MUAssets.loadBMD(DRAGON_BMD).then(async (bmd) => {
    if (disposed) return;
    const hero = heroMu(gameScene);
    if (!hero) return;
    for (const d of dragons) {
      const r = new MUModelRenderer({ scene: gameScene.scene, camera: gameScene.camera?.threeCamera });
      await r.initFromBMD(bmd);
      if (disposed) { r.dispose?.(); return; }
      applyMuUpAxis(r.group);
      if (r.mixer?.clips?.has?.(DRAGON_ACTION)) r.playAction?.(DRAGON_ACTION);
      else r.playAction?.(DRAGON_ACTION); // preserve authored action request; renderer logs if asset differs.
      r.playSpeed = 0.5; // MoveBoids MODEL_MONSTER01+31 exact PlaySpeed.
      const outer = new THREE.Group();
      outer.name = `Icarus_Dragon_${d.i}`;
      outer.add(r.group);
      d.renderer = r; d.outer = outer; group.add(outer);
      r.setRenderFlags?.(RenderFlags.TEXTURE, { alpha: 1 });
      spawn(d, hero);
    }
    ready = true;
  }).catch((e) => {
    group.userData.muPcDragonMissing = `${DRAGON_BMD}: ${e?.message || e}`;
  });

  void loadSpearTexture().then((texture) => {
    if (disposed || !texture) return;
    const hero = heroMu(gameScene);
    if (!hero) return;
    for (const b of spears) {
      if (!tryAcquirePcParticle()) { group.userData.muPcSpearBudgetDrops = (group.userData.muPcSpearBudgetDrops || 0) + 1; continue; }
      b.budget = true; spawnSpear(b,hero);
    }
    const geometry=makeSpearBatchGeometry(SPEAR_COUNT);
    const material=new THREE.MeshBasicMaterial({map:texture,vertexColors:true,transparent:true,opacity:1,depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
    spearBatchMesh=new THREE.Mesh(geometry,material);spearBatchMesh.frustumCulled=false;spearBatchMesh.renderOrder=6;spearBatchMesh.visible=false;
    spearBatchMesh.name='Icarus_SpearJoint_Batch10';
    spearBatchMesh.userData.muPcOwner='10x CreateJoint(MODEL_SPEARSKILL, subtype1, scale25) batched transport';
    spearBatchMesh.userData.muPcLogicalJointCount=SPEAR_COUNT;spearBatchMesh.userData.muPcMaxTails=SPEAR_TAILS;
    group.add(spearBatchMesh);updateSpearBatch(spears,spearBatchMesh);
  }).catch((e)=>{ group.userData.muPcSpearTextureMissing = `${SPEAR_TEXTURE}: ${e?.message || e}`; });

  group.userData.update = (dt) => {
    if (disposed) return;
    const d = Math.max(0, Number(dt) || 0);
    elapsed += d; acc += d;
    let guard = 0;
    while (acc + 1e-9 >= TICK && guard++ < 8) { acc -= TICK; tick(); }
    if (acc + 1e-9 >= TICK) {
      const dropped = Math.floor(acc / TICK); acc -= dropped * TICK;
      group.userData.muPcDroppedBacklogTicks = (group.userData.muPcDroppedBacklogTicks || 0) + dropped;
    }
    for (const x of dragons) if (x.live) x.renderer?.update?.(d, elapsed);
    group.userData.muPcLiveDragons = dragons.reduce((n, x) => n + (x.live ? 1 : 0), 0);
    group.userData.muPcLiveSpearBoids = spears.reduce((n, x) => n + (x.live ? 1 : 0), 0);
  };

  return {
    group,
    dispose() {
      if (disposed) return; disposed = true;
      for (const d of dragons) { try { d.renderer?.dispose?.(); } catch {} d.renderer = null; d.outer = null; }
      for (const b of spears) {
        b.live=false; b.tails.length=0; releasePcJointSlot(b.jointSlot); b.jointSlot=null;
        if (b.budget) releasePcParticle(); b.budget=false;
      }
      if(spearBatchMesh){try{spearBatchMesh.geometry?.dispose?.();spearBatchMesh.material?.dispose?.();}catch{}spearBatchMesh=null;}
      group.clear();
    },
  };
}
