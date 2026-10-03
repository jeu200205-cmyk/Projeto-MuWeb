// ui2/Minimap.js — real PC minimap artwork owner. No procedural terrain placeholder.
import { RemoteAssets } from '../data/RemoteAssets.js';
const MAP_HALF=12800,TERRAIN_SCALE=100;
const ASSETS=Object.freeze({map:'World1/mini_map.OZT',frame:'Interface/newui_SW_Minimap_Frame.OZT'});
async function loadImage(path){let image=await RemoteAssets.fetchDecodedImage(path).catch(()=>null);if(!image)image=await RemoteAssets.fetchDecodedImage(path).catch(()=>null);return image;}
export class Minimap{
 constructor(opts={}){this.size=opts.size||160;this.worldSize=opts.worldSize||256;this.mapName=opts.mapName||'Lorencia';this.player={x:0,z:0};this.monsters=[];this.npcs=[];this._destroyed=false;this._autoReveal=opts.autoReveal!==false;this._parent=opts.parent||document.body;this._ready=false;
  this.root=document.createElement('div');this.root.id='mu-pc-minimap';this.root.dataset.muPcOwner='CNewUIMiniMap';this.root.style.cssText='position:absolute;right:8px;top:8px;z-index:600;visibility:hidden;pointer-events:none;background-repeat:no-repeat;background-size:100% 100%;';
  this.map=document.createElement('div');this.map.style.cssText='position:absolute;background-repeat:no-repeat;background-size:100% 100%;overflow:hidden;';
  this.canvas=document.createElement('canvas');this.canvas.width=this.size;this.canvas.height=this.size;this.canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;';this.ctx=this.canvas.getContext('2d');this.map.appendChild(this.canvas);this.root.appendChild(this.map);this._parent.appendChild(this.root);
  this._loadPromise=Promise.all([loadImage(ASSETS.map),loadImage(ASSETS.frame)]).then(([map,frame])=>{if(this._destroyed||!map||!frame){console.warn('[UI PC] minimap real incompleto — placeholder procedural DESATIVADO.');return;}this.root.style.width=`${frame.w}px`;this.root.style.height=`${frame.h}px`;this.root.style.backgroundImage=`url("${frame.url}")`;const s=Math.min(this.size,map.w,map.h,Math.max(1,frame.w-16),Math.max(1,frame.h-16));this.map.style.width=`${s}px`;this.map.style.height=`${s}px`;this.map.style.left=`${Math.round((frame.w-s)/2)}px`;this.map.style.top=`${Math.round((frame.h-s)/2)}px`;this.map.style.backgroundImage=`url("${map.url}")`;this._ready=true;if(this._autoReveal)this.reveal();return true;});
 }
 setMapName(n){this.mapName=n;}
 setWorldTerrain(){/* real map texture is authoritative visual; ATT remains gameplay owner elsewhere */}
 setPlayer(x,z){this.player.x=x;this.player.z=z;} setMonsters(v){this.monsters=v||[];} setNpcs(v){this.npcs=v||[];}
 _tx(x){return(x+MAP_HALF)/TERRAIN_SCALE;} _ty(z){return(MAP_HALF-z)/TERRAIN_SCALE;}
 _wxz(o){if(!o)return null;if(typeof o.x==='number')return{x:o.x,z:typeof o.z==='number'?o.z:o.y};const p=o.position||(o.group&&o.group.position);return p?{x:p.x,z:p.z}:null;}
 _draw(){
  // R33: the decoded mini_map + NewUI frame are the only authored visual owners
  // proven for this adapter. The former red/yellow/white canvas circles were a
  // browser-authored approximation for monsters/NPC/player markers, not decoded
  // PC Main 5.2 artwork/UV. Keep authoritative positions cached for the future
  // exact marker owner, but render no invented marker while that evidence is absent.
  this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
 }
 ready(){return this._loadPromise.then(()=>this._ready);}
 reveal(){if(this._ready&&!this._destroyed)this.root.style.visibility='visible';}
 hide(){this.root.style.visibility='hidden';}
 update() { this._draw(); }
 destroy(){this._destroyed=true;this.root.remove();}
}
