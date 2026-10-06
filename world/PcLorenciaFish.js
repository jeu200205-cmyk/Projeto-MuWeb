// PcLorenciaFish.js — retained Main 5.2 GOBoid.cpp::MoveFishs owner for WD_0LORENCIA.
// Lorencia processes only Fishs[0..2] and spawns MODEL_FISH01 exclusively where
// TerrainMappingLayer1 == 5. The real Object1/Fish01.bmd is always used.
import * as THREE from 'three';
import { MUAssets } from '../assets/MUAssetLoader.js';
import { MUModelRenderer, RenderFlags } from '../assets/MUModelRenderer.js';
import { applyMuUpAxis } from '../graphics/BmdAdapter.js';
import { pcTerrainTileAt } from './PcIndoorVisibility.js';

const PC_HZ=25,TICK=1/PC_HZ,COUNT=3,FISH_BMD='Object1/Fish01.bmd';
const ri=(n)=>Math.floor(Math.random()*Math.max(1,n));
const rad=(d)=>d*Math.PI/180;
function heroMu(scene){const p=scene?.mainObject?.position;if(!p?.isVector3)return null;return{x:p.x,y:-p.z,z:p.y};}
function terrainZ(scene,x,y){const h=scene?.terrainHeightAt?.(x,-y);return Number.isFinite(Number(h))?Number(h):0;}
function waterTile(scene,x,y){return pcTerrainTileAt(scene?.terrainMapping,x,-y)===5;}
function calcAngle(x,y,tx,ty){let a=Math.atan2(ty-y,tx-x)*180/Math.PI;if(a<0)a+=360;return a;}
function turnAngle(cur,target,step){let d=((target-cur+540)%360)-180;if(Math.abs(d)<=step)return(target+360)%360;return(cur+Math.sign(d)*step+360)%360;}
function steer(f,fish){let n=0,tx=0,ty=0;for(const t of fish){if(!t.live||t===f)continue;const dx=f.x-t.x,dy=f.y-t.y,dz=f.z-t.z,d=Math.hypot(dx,dy,dz);if(!(d<400))continue;let xdist=t.dirX-t.x,ydist=t.dirY-t.y;if(d<80){xdist-=t.dirX-f.x;ydist-=t.dirY-f.y;}else{xdist+=t.dirX-f.x;ydist+=t.dirY-f.y;}const pd=Math.hypot(xdist,ydist);if(pd>1e-6){tx+=xdist/pd;ty+=ydist/pd;n++;}}if(n>0)f.angle=turnAngle(f.angle,calcAngle(f.x,f.y,f.x+tx/n,f.y+ty/n),f.gravity);}
function alphaTick(f){if(f.alphaTarget>f.alpha)f.alpha=Math.min(1,f.alpha+.05);else if(f.alphaTarget<f.alpha)f.alpha=Math.max(0,f.alpha-.05);}

export function createPcLorenciaFishOwner(gameScene){
  const group=new THREE.Group();group.name='Lorencia_PC_Fish01';
  group.userData.muPcOwner='GOBoid.cpp::MoveFishs/RenderFishs::WD_0LORENCIA';group.userData.muPcFishModel=FISH_BMD;group.userData.muPcFishCount=COUNT;
  const fish=Array.from({length:COUNT},(_,i)=>({i,live:false,renderer:null,outer:null,x:0,y:0,z:0,angle:0,scale:.5,alpha:0,alphaTarget:.2,velocity:1,gravity:13,subtype:0,life:0,dirX:0,dirY:0}));
  let disposed=false,ready=false,acc=0,elapsed=0;
  void MUAssets.loadBMD(FISH_BMD).then(async(bmd)=>{if(disposed)return;for(const f of fish){const r=new MUModelRenderer({scene:gameScene.scene,camera:gameScene.camera?.threeCamera});await r.initFromBMD(bmd);if(disposed){r.dispose?.();return;}applyMuUpAxis(r.group);r.playAction?.('action_0');const outer=new THREE.Group();outer.name=`Lorencia_Fish01_${f.i}`;outer.visible=false;outer.add(r.group);f.renderer=r;f.outer=outer;group.add(outer);}ready=true;}).catch(e=>{group.userData.muPcFishMissing=`${FISH_BMD}: ${e?.message||e}`;});
  function trySpawn(f,h){const x=h.x+(ri(1024)-512),y=h.y+(ri(1024)-512);if(!waterTile(gameScene,x,y))return false;f.live=true;f.x=x;f.y=y;f.z=terrainZ(gameScene,x,y);f.alpha=0;f.alphaTarget=(ri(2)+2)*.1;f.scale=(ri(4)+4)*.1;f.velocity=.6/f.scale;f.gravity=13;f.angle=0;f.subtype=0;f.life=ri(128);f.dirX=f.x+f.velocity*8;f.dirY=f.y;f.outer.visible=true;return true;}
  function kill(f){f.live=false;if(f.outer)f.outer.visible=false;}
  function tick(){const h=heroMu(gameScene);if(!ready||!h)return;for(const f of fish){if(!f.live){trySpawn(f,h);continue;}steer(f,fish);const mag=f.velocity*(ri(4)+6),a=rad(f.angle),dx=Math.cos(a)*mag,dy=Math.sin(a)*mag;f.x+=dx;f.y+=dy;f.z=terrainZ(gameScene,f.x,f.y);f.dirX=f.x+3*dx;f.dirY=f.y+3*dy;if(!waterTile(gameScene,f.x,f.y)){f.angle=(f.angle+180)%360;f.subtype++;}else if(f.subtype>0)f.subtype--;if(f.subtype>=2||Math.hypot(f.x-h.x,f.y-h.y)>=1500){kill(f);continue;}f.life-=1;if(f.life<=0&&ri(64)===0)f.life=ri(128);alphaTick(f);f.outer.position.set(f.x,f.z,-f.y);f.outer.rotation.y=rad(f.angle+90);f.outer.scale.setScalar(f.scale);f.renderer.playSpeed=f.velocity*.5;f.renderer.setRenderFlags?.(RenderFlags.TEXTURE,{alpha:f.alpha});}}
  group.userData.update=(dt)=>{if(disposed)return;const d=Math.max(0,Number(dt)||0);elapsed+=d;acc+=d;let guard=0;while(acc+1e-9>=TICK&&guard++<8){acc-=TICK;tick();}if(acc+1e-9>=TICK){const dropped=Math.floor(acc/TICK);acc-=dropped*TICK;group.userData.muPcDroppedBacklogTicks=(group.userData.muPcDroppedBacklogTicks||0)+dropped;}for(const f of fish)if(f.live)f.renderer?.update?.(d,elapsed);group.userData.muPcLiveFish=fish.reduce((n,f)=>n+(f.live?1:0),0);};
  group.userData.muPcShadowOpen='BMD::RenderBodyShadow for Fish01 remains separate from the real Fish01 body owner';
  return {group,dispose(){if(disposed)return;disposed=true;for(const f of fish){try{f.renderer?.dispose?.();}catch{}f.renderer=null;f.outer=null;}group.clear();}};
}
export const PC_LORENCIA_FISH_MODEL=FISH_BMD;
