// PcLorenciaFauna.js — retained Main 5.2 GOBoid.cpp WD_0LORENCIA bird owner.
// The PC owns five MODEL_BIRD01 boids in normal maps.  This module ports that
// authored owner from the real Object1/Bird01.bmd; there is no substitute mesh.
import * as THREE from 'three';
import { MUAssets } from '../assets/MUAssetLoader.js';
import { MUModelRenderer, RenderFlags } from '../assets/MUModelRenderer.js';
import { applyMuUpAxis } from '../graphics/BmdAdapter.js';
import { Sound } from '../audio/SoundManager.js';

const PC_HZ=25, TICK=1/PC_HZ, MAX_LORENCIA_BOIDS=5;
const BOID_FLY=0, BOID_DOWN=1, BOID_GROUND=2, BOID_UP=3;
const BIRD_BMD='Object1/Bird01.bmd';
const BIRD_SOUNDS=Object.freeze([['pc-lorencia-bird1','aBird1.wav'],['pc-lorencia-bird2','aBird2.wav']]);
const ri=(n)=>Math.floor(Math.random()*Math.max(1,n));
const deg=(r)=>r*180/Math.PI;
const rad=(d)=>d*Math.PI/180;

function heroMu(gameScene){
  const p=gameScene?.mainObject?.position;
  if(!p?.isVector3)return null;
  // Centered MU plane coordinates are enough for every retained delta law:
  // MU X == Web X, MU Y == -Web Z, MU Z == Web Y.
  return {x:p.x,y:-p.z,z:p.y};
}
function terrainMuZ(gameScene,mx,my){
  const h=gameScene?.terrainHeightAt?.(mx,-my);
  return Number.isFinite(Number(h))?Number(h):0;
}
function shortestTurn(current,target,maxStep){
  let d=((target-current+540)%360)-180;
  if(Math.abs(d)<=maxStep)return (target+360)%360;
  return (current+Math.sign(d)*maxStep+360)%360;
}
function calcAngle(x,y,tx,ty){
  let a=deg(Math.atan2(ty-y,tx-x)); if(a<0)a+=360; return a;
}
function sourceChance(divisor){return ri(divisor)===0;}

export function createPcLorenciaFaunaOwner(gameScene){
  const group=new THREE.Group(); group.name='Lorencia_PC_Boids';
  group.userData.muPcOwner='GOBoid.cpp::MoveBoids/MoveBird/MoveBoidGroup';
  group.userData.muPcBirdModel=BIRD_BMD; group.userData.muPcBirdCount=MAX_LORENCIA_BOIDS;
  const birds=Array.from({length:MAX_LORENCIA_BOIDS},(_,i)=>({i,live:false,renderer:null,outer:null,
    x:0,y:0,z:0,angle:0,velocity:1,dirZ:0,gravity:13,ai:BOID_FLY,alpha:0,dirX:0,dirY:0}));
  let disposed=false,ready=false,acc=0,elapsed=0;

  // OpenBoidData() loads these once on entering Lorencia. Web does the same
  // asynchronously so world publication is never blocked by fauna I/O.
  for(const [id,wav] of BIRD_SOUNDS){ if(typeof Sound.loadWav==='function'&&!Sound.buffers?.has?.(id)) void Sound.loadWav(id,wav).catch(()=>{}); }
  void MUAssets.loadBMD(BIRD_BMD).then(async(bmd)=>{
    if(disposed)return;
    const hero=heroMu(gameScene); if(!hero)return;
    for(const b of birds){
      const r=new MUModelRenderer({scene:gameScene.scene,camera:gameScene.camera?.threeCamera});
      await r.initFromBMD(bmd); if(disposed){r.dispose?.();return;}
      applyMuUpAxis(r.group); r.playAction?.('action_0'); r.playSpeed=1;
      const outer=new THREE.Group(); outer.name=`Lorencia_Bird_${b.i}`; outer.add(r.group); outer.scale.setScalar(.8);
      b.renderer=r;b.outer=outer;group.add(outer);
      // MoveBoids source creation block for normal WD_0LORENCIA.
      b.x=hero.x+(ri(1024)-512); b.y=hero.y+(ri(1024)-512);
      b.z=terrainMuZ(gameScene,b.x,b.y)+(ri(200)+150);
      b.angle=0;b.velocity=1;b.gravity=13;b.ai=BOID_FLY;b.alpha=0;b.dirZ=0;
      b.dirX=b.x+25;b.dirY=b.y;
      outer.position.set(b.x,b.z,-b.y); outer.rotation.y=rad(b.angle);
      r.setRenderFlags?.(RenderFlags.TEXTURE,{alpha:0}); b.live=true;
    }
    ready=true;
  }).catch((e)=>{group.userData.muPcBirdMissing=`${BIRD_BMD}: ${e?.message||e}`;});

  function respawn(b,hero){
    b.x=hero.x+(ri(1024)-512);b.y=hero.y+(ri(1024)-512);
    b.z=terrainMuZ(gameScene,b.x,b.y)+(ri(200)+150);
    b.angle=0;b.velocity=1;b.gravity=13;b.ai=BOID_FLY;b.alpha=0;b.dirZ=0;
    b.dirX=b.x+25;b.dirY=b.y;b.live=true;b.outer.visible=true;
  }
  function steer(b){
    let n=0,tx=0,ty=0;
    for(const t of birds){if(!t.live||t===b)continue;const dx=b.x-t.x,dy=b.y-t.y,d=Math.hypot(dx,dy);if(d>=400)continue;
      let xdist=t.dirX-t.x,ydist=t.dirY-t.y;
      if(d<80){xdist-=t.dirX-b.x;ydist-=t.dirY-b.y;}else{xdist+=t.dirX-b.x;ydist+=t.dirY-b.y;}
      const pd=Math.hypot(xdist,ydist);if(pd>1e-6){tx+=xdist/pd;ty+=ydist/pd;n++;}}
    if(n>0){const target=calcAngle(b.x,b.y,b.x+tx/n,b.y+ty/n);b.angle=shortestTurn(b.angle,target,b.gravity);}
  }
  function tick(){
    const hero=heroMu(gameScene);if(!hero||!ready)return;
    const worldMs=elapsed*1000;
    for(const b of birds){
      if(!b.live){respawn(b,hero);continue;}
      const range=Math.hypot(b.x-hero.x,b.y-hero.y);
      // MoveBird exact state laws.
      if(b.ai===BOID_FLY){
        if((Math.floor(worldMs)%8192)<2048&&range>=200&&range<=400)b.ai=BOID_DOWN;
        b.velocity=1;b.z+=ri(16)-8;if(b.z<200)b.dirZ=10;else if(b.z>600)b.dirZ=-10;
      }else if(b.ai===BOID_DOWN){
        b.dirZ=-20;const h=terrainMuZ(gameScene,b.x,b.y);if(b.z<h){b.ai=BOID_UP;b.velocity=1.1;b.dirZ=20;}
      }else if(b.ai===BOID_GROUND){
        if(sourceChance(256)){b.ai=BOID_UP;b.velocity=1.1;b.dirZ=20;}
      }else if(b.ai===BOID_UP){b.z+=ri(16)-8;b.velocity-=.005;if(b.velocity<=1)b.ai=BOID_FLY;}

      // MoveBoid + normal-map MoveBoidGroup: forward vector velocity*25.
      if(b.ai!==BOID_GROUND)steer(b);
      const a=rad(b.angle),forward=b.velocity*25;
      const dx=Math.cos(a)*forward,dy=Math.sin(a)*forward;
      b.x+=dx;b.y+=dy;b.z+=b.dirZ;b.dirX=b.x+3*dx;b.dirY=b.y+3*dy;
      const newRange=Math.hypot(b.x-hero.x,b.y-hero.y);
      if(sourceChance(512)||newRange>=1500){b.live=false;b.outer.visible=false;continue;}
      b.alpha+=(1-b.alpha)*.1;
      b.outer.position.set(b.x,b.z,-b.y);b.outer.rotation.y=rad(b.angle);b.outer.visible=true;
      b.renderer?.setRenderFlags?.(RenderFlags.TEXTURE,{alpha:b.alpha});
      if(newRange<600){if(sourceChance(512)&&Sound.buffers?.has?.('pc-lorencia-bird1'))Sound.play?.('pc-lorencia-bird1');if(sourceChance(512)&&Sound.buffers?.has?.('pc-lorencia-bird2'))Sound.play?.('pc-lorencia-bird2');}
    }
  }

  group.userData.update=(dt)=>{
    if(disposed)return;const d=Math.max(0,Number(dt)||0);elapsed+=d;acc+=d;
    let guard=0;while(acc+1e-9>=TICK&&guard++<8){acc-=TICK;tick();}
    if(acc+1e-9>=TICK){const dropped=Math.floor(acc/TICK);acc-=dropped*TICK;group.userData.muPcDroppedBacklogTicks=(group.userData.muPcDroppedBacklogTicks||0)+dropped;}
    for(const b of birds)if(b.live)b.renderer?.update?.(d,elapsed);
    group.userData.muPcLiveBirds=birds.reduce((n,b)=>n+(b.live?1:0),0);
  };
  return {group,dispose(){if(disposed)return;disposed=true;for(const b of birds){try{b.renderer?.dispose?.();}catch{}b.renderer=null;b.outer=null;}group.clear();}};
}
