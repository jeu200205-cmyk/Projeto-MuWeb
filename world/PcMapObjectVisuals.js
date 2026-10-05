import * as THREE from 'three';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { MAP_SIZE } from './TerrainWorld.js';
import { pcIcarusSourceHidden } from './PcIcarusVisualContract.js';

const BITMAPS = Object.freeze({
  LIGHT: 'Effect/flare01.OZJ',
  FLARE: 'Effect/Flare.OZJ',
  LIGHTNING1: 'Effect/lightning2.OZJ',
  MAGIC1: 'Effect/Magic_Ground2.OZJ',
  IMPACT: 'Effect/Impack03.OZJ',
});
const cache=new Map();
const ri=(n)=>Math.floor(Math.random()*Math.max(1,n));
const rad=(d)=>d*Math.PI/180;
const isBloodCastleWorld=(w)=>((w|0)>=12&&(w|0)<=18)||(w|0)===53;
async function loadBitmap(path){
  if(cache.has(path))return cache.get(path);
  const p=(async()=>{const d=await RemoteAssets.fetchDecodedImage(path);if(!d?.image||!(d.w>0)||!(d.h>0))return null;
    const t=new THREE.Texture(d.image);t.needsUpdate=true;t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.minFilter=t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.userData.muPcBitmapPath=path;return Object.freeze({texture:t,width:d.w,height:d.h,path});})().catch(()=>null);
  cache.set(path,p);return p;
}
function boneWorldPoint(renderer,index,offset,out){const b=renderer?.bones?.[index|0];if(!b)return null;renderer.group.updateWorldMatrix?.(true,true);out.set(offset?.[0]||0,offset?.[1]||0,offset?.[2]||0);return b.localToWorld(out);}
function muWorldPoint(obj,zAdd=0,out=new THREE.Vector3()){return out.set((Number(obj?.x)||0)-MAP_SIZE/2,(Number(obj?.z)||0)+zAdd,MAP_SIZE/2-(Number(obj?.y)||0));}
function makeSprite(loaded){const m=new THREE.SpriteMaterial({map:loaded.texture,color:0xffffff,transparent:true,opacity:1,depthTest:true,depthWrite:false,fog:false,toneMapped:false,blending:THREE.AdditiveBlending});const s=new THREE.Sprite(m);s.frustumCulled=true;s.userData.muPcOwner='ZzzObject.cpp::RenderObjectVisual';return {sprite:s,mat:m,loaded};}
function setSprite(x,pos,scale,rgb,rot=0){x.sprite.position.copy(pos);x.sprite.scale.set(x.loaded.width*scale,x.loaded.height*scale,1);x.mat.color.setRGB(rgb[0],rgb[1],rgb[2]);x.mat.rotation=rad(rot);x.sprite.visible=true;}

// `worldNum` is asset ObjectN/TerrainN, while PC WorldActive is N-1.
export function pcMapBoneVisualContract(worldNum,serial){
  const w=worldNum|0,t=serial|0;
  if(w===3&&t===100)return {points:[{bitmap:'LIGHTNING1',bone:0,offset:[0,0,150],scale:2.5,dual:true,law:'devias100'}]};
  if(w===4&&t===9)return {points:[{bitmap:'LIGHT',bone:1,offset:[0,0,0],scale:1.5,law:'noria'}]};
  if(w===4&&t===35)return {points:[{bitmap:'LIGHT',bone:3,offset:[0,0,0],scale:1.5,law:'noria'}]};
  if(w===4&&t===1)return {points:[2,4,6].map(b=>({bitmap:'LIGHT',bone:b,offset:[0,0,0],scale:.5,law:'noria'}))};
  if(w===4&&t===17)return {points:[4,7,10,13].map(b=>({bitmap:'LIGHT',bone:b,offset:[0,0,0],scale:1,law:'noria'}))};
  if(w===4&&t===39)return {points:[
    {bitmap:'LIGHTNING1',bone:57,offset:[0,0,0],scale:1,dual:true,law:'noria39Lightning'},
    ...[61,62,63,64,65].map(b=>({bitmap:'LIGHT',bone:b,offset:[0,0,0],scale:1,law:'white'})),
  ],partialChildrenOpen:true};
  if(w===5&&(t===19||t===20))return {points:[
    {bitmap:t===19?'MAGIC1':'LIGHTNING1',bone:15,offset:[0,0,0],scale:.3,dual:true,law:t===19?'lostFire':'lostBlue'},
    {bitmap:t===19?'MAGIC1':'LIGHTNING1',bone:19,offset:[0,0,0],scale:.3,dual:true,law:t===19?'lostFire':'lostBlue'},
    {bitmap:t===19?'MAGIC1':'LIGHTNING1',bone:21,offset:[0,0,0],scale:1.5,dual:true,law:t===19?'lostFire':'lostBlue'},
  ]};
  if(w===7&&t===9)return {points:[{bitmap:'LIGHT',bone:1,offset:[0,0,0],scale:5,scaleByLum:true,law:'merchant'}]};
  if(w===9&&(t===63||t===64))return {points:[{bitmap:'IMPACT',bone:2,offset:[0,0,0],scale:1.5,scaleByLum:true,law:t===63?'tarkanCyan':'tarkanRed'}]};
  // WD_10HEAVEN RenderObjectVisual type10: bone 3 -> BITMAP_LIGHT, white, scale 1.
  if(w===11&&t===10)return {points:[{bitmap:'LIGHT',bone:3,offset:[0,0,0],scale:1,law:'white'}]};
  if(w===52&&t===63)return {points:[{bitmap:'LIGHT',bone:5,offset:[-40,-10,0],scale:6,scaleByObject:true,law:'newTown63'}]};
  if(w===52&&t===121)return {points:[3,4,5,6,7,8].map(b=>({bitmap:'LIGHT',bone:b,offset:[5,-4,-1],scale:1,scaleByLum:true,law:'newTown121'}))};
  if(isBloodCastleWorld(w)&&t===11)return {points:[1,2,4,6,9,10,11].map(b=>({bitmap:'LIGHT',bone:b,offset:[0,0,2],scale:.5,law:'blood11'}))};
  if(isBloodCastleWorld(w)&&t===13)return {points:[{bitmap:'FLARE',bone:3,offset:[0,0,0],scale:1,scaleByLum:true,law:'blood13'}]};
  return null;
}
export function hasPcMapBoneVisual(worldNum,serial){return !!pcMapBoneVisualContract(worldNum,serial);}

function pointPresentation(pt,obj,ms){
  const randomLum=(ri(30)+70)*.01;
  const rotation=(Math.trunc(ms*.1)%360);
  switch(pt.law){
    case'noria':return {lum:randomLum,rgb:[randomLum*.4,randomLum*.7,randomLum],rotation:0};
    case'noria39Lightning':return {lum:randomLum,rgb:[randomLum*.4,randomLum*.8,randomLum],rotation};
    case'lostFire':return {lum:randomLum,rgb:[randomLum,randomLum*.2,0],rotation};
    case'lostBlue':return {lum:randomLum,rgb:[randomLum*.4,randomLum*.8,randomLum],rotation};
    case'merchant':return {lum:randomLum,rgb:[randomLum*.6,randomLum*.3,randomLum*.1],rotation:0};
    case'tarkanCyan':{const l=Math.sin((ms+(Number(obj?.angleZ)||0)*5)*.002)*.3+.7;return {lum:l,rgb:[l/1.7,l,l],rotation:0};}
    case'tarkanRed':{const l=Math.sin((ms+(Number(obj?.angleZ)||0)*5)*.002)*.3+.7;return {lum:l,rgb:[l,l*.32,l*.32],rotation:0};}
    case'newTown63':{const l=(Math.sin(ms*.001)+1)*.3+.4;return {lum:l,rgb:[l,l,l*.6],rotation:0};}
    case'newTown121':{const l=(Math.sin(ms*.002)+1)*.5+.5;return {lum:l,rgb:[l,l*.5,l*.3],rotation:0};}
    case'blood11':{const l=Math.sin(((Number(obj?.angleZ)||0)*20+ms)*.001)*.5+.5;return {lum:l,rgb:[l,l*.5,0],rotation:0};}
    case'blood13':{const l=Math.sin(ms*.001)*.3+.7;return {lum:l,rgb:[l,l,l],rotation:0};}
    case'white':return {lum:1,rgb:[1,1,1],rotation:0};
    default:return {lum:randomLum,rgb:[randomLum,randomLum,randomLum],rotation};
  }
}

export async function createPcMapBoneVisualOwner(worldNum,serial,renderer,obj){
  const c=pcMapBoneVisualContract(worldNum,serial);if(!c)return null;
  const loadedByKey=new Map();
  for(const pt of c.points){if(!loadedByKey.has(pt.bitmap)){const loaded=await loadBitmap(BITMAPS[pt.bitmap]);if(!loaded)return null;loadedByKey.set(pt.bitmap,loaded);}}
  const group=new THREE.Group();group.name=`PcMapVisual_W${worldNum}_T${serial}`;group.userData.muPcOwner='ZzzObject.cpp::RenderObjectVisual';if(c.partialChildrenOpen)group.userData.muPcPartialChildrenOpen=true;
  const entries=[];for(const pt of c.points){const loaded=loadedByKey.get(pt.bitmap);const a=makeSprite(loaded);group.add(a.sprite);entries.push({pt,x:a,mirror:false});if(pt.dual){const b=makeSprite(loaded);group.add(b.sprite);entries.push({pt,x:b,mirror:true});}}
  const tmp=new THREE.Vector3();let disposed=false;
  renderer.addPresentationUpdate?.((worldMs=0)=>{if(disposed)return;const ms=Number(worldMs)||0;
    for(const e of entries){const pos=boneWorldPoint(renderer,e.pt.bone,e.pt.offset,tmp);if(!pos){e.x.sprite.visible=false;continue;}const pr=pointPresentation(e.pt,obj,ms);let sc=e.pt.scale;if(e.pt.scaleByLum)sc*=pr.lum;if(e.pt.scaleByObject)sc*=Number(obj?.scale)||1;setSprite(e.x,pos,sc,pr.rgb,e.mirror?-pr.rotation:(e.pt.dual?pr.rotation:0));}
  });
  return {group,dispose(){if(disposed)return;disposed=true;for(const e of entries)e.x.mat.dispose();group.clear();}};
}

/** Exact world-space sprite owners that do not require a per-placement BMD. */
export async function createPcMapWorldVisualOwner(worldNum,placements){
  const w=worldNum|0;
  if(w!==5)return null;
  const src=(placements||[]).filter(o=>(o.serial|0)===40);if(!src.length)return null;
  const loaded=await loadBitmap(BITMAPS.LIGHTNING1);if(!loaded)return null;
  const group=new THREE.Group();group.name='LostTower_Object40_WorldVisual';group.userData.muPcOwner='ZzzObject.cpp::RenderObjectVisual/WD_4LOSTTOWER/type40';
  const rows=[];const tmp=new THREE.Vector3();
  for(const obj of src){const a=makeSprite(loaded),b=makeSprite(loaded);group.add(a.sprite,b.sprite);muWorldPoint(obj,260,tmp);a.sprite.position.copy(tmp);b.sprite.position.copy(tmp);rows.push({obj,a,b});}
  let elapsed=0,disposed=false;group.userData.update=(dt)=>{if(disposed)return;elapsed+=Math.max(0,Number(dt)||0);const ms=elapsed*1000,rot=Math.trunc(ms*.1)%360;for(const r of rows){const l=(ri(30)+70)*.01,rgb=[l,l,l];setSprite(r.a,r.a.sprite.position,2.5,rgb,rot);setSprite(r.b,r.b.sprite.position,2.5,rgb,-rot);}};
  return {group,dispose(){if(disposed)return;disposed=true;for(const r of rows){r.a.mat.dispose();r.b.mat.dispose();}group.clear();}};
}

// Exact MoveObject presentation branches. R76 ports BlendMesh branches and
// StreamMesh branches only when the PC source assigns the StreamMesh index
// explicitly (e.g. Dungeon=1, Noria 42/43=0). Branches that only modify UV
// while relying on an unknown pre-existing model StreamMesh remain open; we
// never apply those offsets to every mesh as a guess.
export function pcMapRuntimePresentationContract(worldNum,serial){
  const w=worldNum|0,t=serial|0;
  // WD_0LORENCIA: exact CreateObject + MoveObject material owners from Main 5.2.
  // NOTE: BMD::RenderMesh uses OBJECT::BlendMesh twice with different domains:
  //   - mesh index for UV wave ownership (i == BlendMesh), and
  //   - texture index for GL_ONE/GL_ONE additive ownership (m->Texture == BlendMesh).
  // installPcMapRuntimePresentation intentionally preserves that split.
  if(w===1){
    if(t===52)return {blendMesh:1,light25hz:()=> (ri(6)+4)*.1};              // Bonfire
    if(t===90)return {blendMesh:1};                                         // StreetLight
    if(t===98)return {blendMesh:2};                                         // Carriage01
    if(t===105)return {blendMesh:3,uv:(ms)=>[0,-(Math.trunc(ms)%1000)*.001]}; // Waterspout
    if(t===117)return {blendMesh:4,light25hz:()=> (ri(4)+4)*.1};             // House03
    if(t===118)return {blendMesh:8,uv:(ms)=>[0,-(Math.trunc(ms)%1000)*.001]}; // House04
    if(t===119)return {blendMesh:2,uv:(ms)=>[0,-(Math.trunc(ms)%1000)*.001]}; // House05
    if(t===122)return {blendMesh:4,light25hz:()=> (ri(4)+4)*.1};             // HouseWall02
    if(t===150)return {blendMesh:1};                                        // Candle
  }
  // WD_1DUNGEON: source explicitly assigns Models[o->Type].StreamMesh = 1.
  if(w===2&&(t===22||t===23||t===24))return {streamMesh:1,uv:(ms)=>[0,-(Math.trunc(ms)%1000)*.001]};
  // WD_3NORIA: only branches with explicit BlendMesh/StreamMesh ownership.
  if(w===4){
    if(t===39)return {blendMesh:1};
    if(t===41)return {blendMesh:0,uv:(ms)=>[0,(Math.trunc(ms)%2000)*.0005]};
    if(t===42)return {streamMesh:0,uv:(ms)=>[-(Math.trunc(ms)%500)*.002,0]};
    if(t===43)return {streamMesh:0,uv:(ms)=>[(Math.trunc(ms)%500)*.002,0]};
  }
  // WD_4LOSTTOWER.
  if(w===5){
    if(t===19||t===20)return {blendMesh:4,uv:(ms)=>[-(Math.trunc(ms)%1000)*.001,0]};
    if(t===18||t===23)return {blendMesh:1};
  }
  // WD_5UNKNOWN.
  if(w===6){
    if(t===2)return {blendMesh:0};
    if(t===3)return {blendMesh:0,light25hz:()=> (ri(4)+6)*.1};
  }
  // WD_6STADIUM.
  if(w===7&&t===21)return {blendMesh:3,uv:(ms)=>[0,-(Math.trunc(ms)%1000)*.001]};
  // WD_7ATLANSE.
  if(w===8){
    if(t===23)return {blendMesh:0,light:(ms)=>Math.sin(ms*.002)*.3+.5};
    if(t===32||t===34)return {blendMesh:1,light:(ms)=>Math.sin(ms*.004)*.5+.5};
    if(t===38)return {blendMesh:0};
    if(t===40)return {blendMesh:0,light:(ms)=>Math.sin(ms*.004)*.3+.5,playSpeed:.05};
  }
  // WD_8TARKAN.
  if(w===9){
    if(t===2)return {blendMesh:0,uv:(ms)=>[-(Math.trunc(ms)%1000)*.001,0]};
    if(t===4)return {blendMesh:0,uv:(ms)=>[0,-(Math.trunc(ms)%10000)*.0001],light:(ms)=>Math.sin(ms*.002)*.35+.65};
    if(t===7)return {blendMesh:0,light:(ms,obj)=>Math.sin((ms+(Number(obj?.angleZ)||0)*100)*.002)*.35+.65};
    // 61/65/66 use the sine ONLY for AddTerrainLight in the PC source.  They
    // never assign BlendMeshLight; R76 intentionally keeps material light at
    // the object's existing BlendMeshLight instead of multiplying by sine.
    if(t===61||t===65||t===66)return {blendMesh:1,uv:(ms)=>[0,-(Math.trunc(ms)%1000)*.001]};
    if(t===72)return {blendMesh:0,uv:(ms)=>[0,-(Math.trunc(ms)%10000)*.0002]};
    if(t===82)return {blendMesh:0,bodyLight:[1,1,1]};
  }
  if(w===52&&t===56)return {blendMesh:0,light:(ms)=>Math.sin(ms*.003)*.3+.5,playSpeed:.05};
  return null;
}
export function hasPcMapRuntimePresentation(worldNum,serial){return !!pcMapRuntimePresentationContract(worldNum,serial);}

// OBJECT::Velocity / BMD action-0 playback ownership for classic map props.
// Default CreateObject velocity is 0.16f; Lorencia overrides only these serials.
export function pcMapObjectPlaySpeed(worldNum,serial,scale=1){
  const w=worldNum|0,t=serial|0,s=Math.max(0.0001,Number(scale)||1);
  if(w===1){
    if(t===0||t===1)return 0.4/s;       // Tree01/Tree02: 1/Scale * 0.4f
    if(t===90||t===96||t===97||t===150)return 0.3; // StreetLight, Sign01/02, Candle
    if(t===59)return 0;                 // TreasureChest: OBJECT::Velocity = 0.f
  }
  return 0.16;
}

export function installPcMapRuntimePresentation(worldNum,serial,renderer,obj){
  const c=pcMapRuntimePresentationContract(worldNum,serial);if(!c||!renderer)return false;
  if(Array.isArray(c.bodyLight)&&c.bodyLight.length>=3){
    renderer.setBodyLight?.(new THREE.Color(Number(c.bodyLight[0])||0,Number(c.bodyLight[1])||0,Number(c.bodyLight[2])||0));
  }
  const meshes=renderer.meshes||[];
  const uvOwners=[];
  if(Number.isInteger(c.blendMesh))uvOwners.push(c.blendMesh|0);
  if(Number.isInteger(c.streamMesh)&&!uvOwners.includes(c.streamMesh|0))uvOwners.push(c.streamMesh|0);
  // ZzzBMD::RenderMesh wave condition is mesh-index based:
  //   i == BlendMesh || i == StreamMesh.
  // BlendMesh render-state/color ownership is different: m->Texture == BlendMesh.
  const uvTargets=meshes.filter(m=>uvOwners.includes(Number(m?.userData?.muMeshIndex)|0));
  const streamTargets=Number.isInteger(c.streamMesh)?meshes.filter(m=>(Number(m?.userData?.muMeshIndex)|0)===(c.streamMesh|0)):[];
  const lightTargets=Number.isInteger(c.blendMesh)?meshes.filter(m=>(Number(m?.userData?.textureIndex)|0)===(c.blendMesh|0)):[];
  const baseColors=new Map();
  // PC RenderMesh stream path: glColor3fv(BodyLight); EnableLight=false.
  for(const m of streamTargets){if(m.material?.uniforms?.enableLight)m.material.uniforms.enableLight.value=false;}
  // PC EnableAlphaBlend(): GL_ONE/GL_ONE, depth mask off, alpha test off.
  // Keep depth testing enabled unless the source branch explicitly requests NODEPTH.
  for(const m of lightTargets){
    const mat=m.material;const d=mat?.uniforms?.diffuse?.value||mat?.color;
    if(d?.clone)baseColors.set(m,d.clone());
    if(mat?.uniforms?.enableLight)mat.uniforms.enableLight.value=false;
    if(mat){
      mat.transparent=true;mat.blending=THREE.CustomBlending;
      mat.blendEquation=THREE.AddEquation;mat.blendSrc=THREE.OneFactor;mat.blendDst=THREE.OneFactor;
      mat.depthWrite=false;mat.alphaTest=0;
      if(mat.uniforms?.alphaCutoff)mat.uniforms.alphaCutoff.value=0;
      mat.needsUpdate=true;
      mat.userData=mat.userData||{};mat.userData.muPcBlendMeshOneOne=true;
    }
  }
  if(Number.isFinite(c.playSpeed))renderer.playSpeed=c.playSpeed;
  let heldLight=1,lastPcLightTick=null;
  renderer.addPresentationUpdate?.((worldMs=0)=>{
    const ms=Number(worldMs)||0;
    if(c.uv){const [u,v]=c.uv(ms,obj);for(const m of uvTargets){const q=m.material?.uniforms?.uvOffset?.value;if(q?.set)q.set(u,v);}}
    let lum=null;
    if(c.light)lum=Math.max(0,Number(c.light(ms,obj))||0);
    else if(c.light25hz){const tick=Math.floor(Math.max(0,ms)/40);if(lastPcLightTick!==tick){lastPcLightTick=tick;heldLight=Math.max(0,Number(c.light25hz(ms,obj))||0);}lum=heldLight;}
    if(lum!=null){for(const m of lightTargets){const base=baseColors.get(m);const q=m.material?.uniforms?.diffuse?.value||m.material?.color;if(base&&q?.copy)q.copy(base).multiplyScalar(lum);}}
  });
  renderer.userData=renderer.userData||{};renderer.userData.muPcMapRuntimePresentation={worldNum:worldNum|0,serial:serial|0,blendMesh:c.blendMesh,streamMesh:c.streamMesh,uvOwners:[...uvOwners],bodyLight:c.bodyLight||null};return true;
}

/**
 * Exact source HiddenMesh=-2 map-object branches for the classic worlds.
 *
 * `worldNum` is ObjectN/TerrainN (PC WorldActive + 1).  These BMDs are
 * interaction/emitter/controller objects in the desktop client; drawing their
 * raw geometry is incorrect and produced the giant black/ice/tree slabs seen
 * in the physical FIX8 screenshots.  Replacement particles remain separately
 * fail-closed when their owner has not been ported; we never keep a source-
 * hidden controller mesh visible as a placeholder for a missing effect.
 *
 * Authority: Main 5.2 ZzzObject.cpp CreateObject + MoveObject.
 */
export function pcMapHideBaseBmd(worldNum,serial){
  const w=worldNum|0,t=serial|0;
  if(w===1)return t===130||t===131||t===132||t===133;                 // Lorencia
  if(w===2)return t===39||t===40||t===51||t===52||t===60;            // Dungeon
  if(w===3)return t===91||t===100;                                   // Devias
  if(w===4)return t===38;                                            // Noria
  if(w===5)return t===24||t===25;                                    // Lost Tower
  if(w===7)return t===38;                                            // Stadium
  if(w===8)return t===22||t===39;                                    // Atlans
  if(w===9)return t===60||t===63||t===64||t===70||t===76||t===83;    // Tarkan
  // WD_10HEAVEN: Object11 types 0..5 are one-shot BITMAP_CLOUD emitters.
  // RenderObjectVisual creates 20 clouds for 0..2 / 10 for 3..5 on the
  // first visible call, then sets OBJECT::HiddenMesh=-2.  Keeping the raw
  // BMD visible is not a valid fallback for a missing particle owner.
  if(w===11)return pcIcarusSourceHidden(t);                           // Icarus
  return false;
}

const TARKAN_DYNAMIC_LIGHT_SERIALS=new Set([4,7,61,65,66]);
export function createPcMapDynamicTerrainLightOwner(gameScene,worldNum,placements){
  const w=worldNum|0;
  if(w===9){
    const src=(placements||[]).filter(o=>TARKAN_DYNAMIC_LIGHT_SERIALS.has(o.serial|0));if(!src.length)return null;
    const owner=new THREE.Object3D();owner.name='Tarkan_DynamicPrimaryTerrainLight';owner.userData.muPcOwner='ZzzObject.cpp/AddTerrainLight';
    let elapsed=0;owner.userData.update=(dt)=>{elapsed+=Math.max(0,Number(dt)||0);const ms=elapsed*1000;for(const o of src){const t=o.serial|0;let lum,light,range;if(t===7){lum=Math.sin((ms+(Number(o.angleZ)||0)*100)*.002)*.35+.65;light=[lum,lum*.6,lum*.2];range=3;}else{lum=Math.sin(ms*.002)*.35+.65;light=(t===4)?[lum,lum,lum]:[lum,lum*.6,lum*.2];range=(t===4?3:2);}gameScene.addDynamicTerrainLightMu?.(o.x,o.y,light,range);}};
    return owner;
  }
  if(w===52){
    const src=(placements||[]).filter(o=>(o.serial|0)===0||(o.serial|0)===61);if(!src.length)return null;
    const owner=new THREE.Object3D();owner.name='NewTown_DynamicPrimaryTerrainLight';owner.userData.muPcOwner='GMNewTown.cpp::MoveObject/AddTerrainLight';
    owner.userData.update=()=>{for(const o of src){const lum=(ri(4)+3)*.1;const light=(o.serial|0)===0?[lum,lum*.6,lum*.2]:[lum*.2,lum*.6,lum];gameScene.addDynamicTerrainLightMu?.(o.x,o.y,light,3);}};
    return owner;
  }
  return null;
}

export const PC_MAP_VISUAL_BITMAP_PATHS=BITMAPS;
