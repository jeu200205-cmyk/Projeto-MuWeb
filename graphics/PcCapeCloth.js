/**
 * PcCapeCloth.js — CPhysicsCloth-compatible cape owner.
 * Ports the topology, fixed shoulder row, spring/loose constraints, wind,
 * weight and collision-sphere contracts used by ZzzCharacter.cpp capes.
 * Simulation runs at a fixed 60 Hz and updates one dynamic indexed mesh.
 */
import * as THREE from 'three';
import {PCT,customCapeClothPlan} from '../data/PcCustomCapeLua.js';
import {pcBitmapTexture} from '../data/PcBitmapLuaOwners.js';
import {MUAssetLoader} from '../assets/MUAssetLoader.js';
import {RemoteAssets} from '../data/RemoteAssets.js';

const MASK_SHAPE=0x3,MASK_SHAPE_EXT=0xC,MASK_ELASTIC=0x300,MASK_WEIGHT=0xC00,MASK_DRAW=0x3000;
const PLS_LOOSE=0x01,PLS_SPRING=0x02,PLS_STRICT=0x04;
const RATE_SHORT_SHOULDER=0.6;
const BITMAP_ROBE=30543;
const STOCK_ROBE_PATHS=new Map([
 [BITMAP_ROBE,'Player/Robe01.OZJ'],[BITMAP_ROBE+1,'Player/Robe02.OZJ'],[BITMAP_ROBE+2,'Player/Robe03.OZT'],
 [BITMAP_ROBE+6,'Monster/iui06.OZJ'],[BITMAP_ROBE+7,'Player/DarklordRobe.OZT'],[BITMAP_ROBE+8,'Item/msword03.OZT'],
 [BITMAP_ROBE+9,'Item/dl_redwings02.OZT'],[BITMAP_ROBE+10,'Item/dl_redwings03.OZT'],
]);
let stockLoader=null;
async function clothTexture(id){
  const lua=await pcBitmapTexture(id).catch(()=>null);if(lua)return lua;
  const path=STOCK_ROBE_PATHS.get(Number(id));if(!path)return null;
  const canonical=await RemoteAssets.resolveExistingPath(path,{exactOnly:true});if(!canonical)return null;
  stockLoader ??= new MUAssetLoader({baseUrl:RemoteAssets.baseUrl,useIDB:false,useWorkers:false});
  const d=await stockLoader.loadTexture(canonical).catch(()=>null);const t=d?.isTexture?d:d?.createThreeTexture?.(THREE,{pcBmd:true});
  if(!t?.isTexture)return null;if(t.userData?.muImageReadyPromise)await t.userData.muImageReadyPromise;
  const v=t.clone();v.flipY=false;v.colorSpace=THREE.NoColorSpace;v.wrapS=v.wrapT=THREE.ClampToEdgeWrapping;v.minFilter=v.magFilter=THREE.LinearFilter;v.generateMipmaps=false;v.userData={...t.userData,muSharedAsset:true,muCapeBitmapID:id};v.needsUpdate=true;return v;
}
function dist(a,b){const dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z;return Math.hypot(dx,dy,dz)||0.001;}
function localPointFor(row,i,j){
  const {hor,ver,width,height,type}=row;let w=width;let uw=width/(hor-1),uh=height/(ver-1);let cylinder=false;
  if((type&MASK_SHAPE_EXT)===PCT.PCT_SHORT_SHOULDER){w*=RATE_SHORT_SHOULDER+(1-RATE_SHORT_SHOULDER)*j/(ver-1);uw=w/(hor-1);}else if((type&MASK_SHAPE_EXT)===PCT.PCT_CYLINDER)cylinder=true;
  let x,y,z;if(cylinder){x=uw*i;y=Math.sin(i/(hor-1)*Math.PI)*100-30;z=uh*j;}else{x=uw*i-.5*w;y=20;z=-uh*j;}
  if((type&MASK_SHAPE)===PCT.PCT_CURVED){const m=2*Math.abs(i/(hor-1)-.5);y-=10*m*m;}else if((type&MASK_SHAPE)===PCT.PCT_STICKED)y=0;
  return new THREE.Vector3(x+row.offset[0],y+row.offset[1],z+row.offset[2]);
}
function transformBoneLocal(renderer,boneIndex,point,out=new THREE.Vector3()){
  const bone=renderer.bones?.[boneIndex];if(!bone)return out.copy(point);
  renderer.group.updateMatrixWorld(true);bone.updateMatrixWorld(true);out.copy(point).applyMatrix4(bone.matrixWorld);return renderer.group.worldToLocal(out);
}
function makeLinks(vertices,row){
  const links=[];const {hor,ver,type}=row;const rubber=(type&MASK_ELASTIC)===PCT.PCT_RUBBER;
  const verStyle=PLS_SPRING|(rubber?0:PLS_STRICT),crossStyle=rubber?0:PLS_LOOSE;
  const add=(a,b,small,large,style)=>links.push({a,b,small,large,style});
  for(let j=0;j<ver;j++)for(let i=0;i<hor;i++){
    const v=hor*j+i;
    if(j<ver-1){const d=dist(vertices[v],vertices[v+hor]);add(v,v+hor,d*.8,d,verStyle);}
    if(i<hor-1){let d=dist(vertices[v],vertices[v+1]);add(v,v+1,d*.8,d,PLS_SPRING|PLS_LOOSE);
      if(j<ver-1){d=dist(vertices[v],vertices[v+1+hor]);add(v,v+1+hor,d*.8,d,crossStyle);}
      if(j>1){d=dist(vertices[v],vertices[v+1-hor]);add(v,v+1-hor,d*.8,d,crossStyle);}
    }
  }return links;
}
class ClothOwner{
  constructor(renderer,row,texture){this.renderer=renderer;this.row=row;this.texture=texture;this.disposed=false;this.acc=0;this.now=0;this.seed=(row.slot+1)*101;
    this.vertices=[];this.vel=[];this.force=[];this.fixed=[];this.links=[];this.collisions=row.collisions||[];
    for(let j=0;j<row.ver;j++)for(let i=0;i<row.hor;i++){const p=transformBoneLocal(renderer,row.bone,localPointFor(row,i,j));this.vertices.push(p);this.vel.push(new THREE.Vector3());this.force.push(new THREE.Vector3());this.fixed.push(j===0);}
    this.links=makeLinks(this.vertices,row);this.geometry=this._geometry();this.material=this._material();this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.name=`pc_cape_cloth_${row.slot}`;this.mesh.frustumCulled=false;renderer.group.add(this.mesh);
  }
  _geometry(){const g=new THREE.BufferGeometry(),n=this.vertices.length,pos=new Float32Array(n*3),uv=new Float32Array(n*2),idx=[];for(let j=0;j<this.row.ver;j++)for(let i=0;i<this.row.hor;i++){const k=j*this.row.hor+i;uv[k*2]=i/(this.row.hor-1);uv[k*2+1]=1-j/(this.row.ver-1);if(i<this.row.hor-1&&j<this.row.ver-1){const a=k,b=k+1,c=k+this.row.hor,d=c+1;idx.push(a,c,b,b,c,d);}}
    g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(idx);this._write();g.computeVertexNormals();return g;}
  _material(){const draw=this.row.type&MASK_DRAW;return new THREE.MeshBasicMaterial({map:this.texture,transparent:draw!==0||Boolean(this.texture?.userData?.muPcBitmapHasAlpha),opacity:1,side:THREE.DoubleSide,depthTest:true,depthWrite:draw===0,blending:draw===PCT.PCT_MASK_BLEND?THREE.AdditiveBlending:THREE.NormalBlending,toneMapped:false});}
  _write(){if(!this.geometry)return;const a=this.geometry.getAttribute('position');for(let i=0;i<this.vertices.length;i++)a.setXYZ(i,this.vertices[i].x,this.vertices[i].y,this.vertices[i].z);a.needsUpdate=true;}
  _fixedRow(){for(let i=0;i<this.row.hor;i++){let w=this.row.width,uw=w/(this.row.hor-1);if((this.row.type&MASK_SHAPE_EXT)===PCT.PCT_SHORT_SHOULDER){w*=RATE_SHORT_SHOULDER;uw=w/(this.row.hor-1);}const p=new THREE.Vector3(uw*i-.5*w,20,0);if((this.row.type&MASK_SHAPE_EXT)===PCT.PCT_CYLINDER){p.x=uw*i;p.y=Math.sin(i/(this.row.hor-1)*Math.PI)*100-30;}if((this.row.type&MASK_SHAPE)===PCT.PCT_CURVED){const m=2*Math.abs(i/(this.row.hor-1)-.5);p.y-=10*m*m;}else if((this.row.type&MASK_SHAPE)===PCT.PCT_STICKED)p.y=0;p.add(new THREE.Vector3(...this.row.offset));transformBoneLocal(this.renderer,this.row.bone,p,this.vertices[i]);this.vel[i].set(0,0,0);}}
  _rand(){this.seed=(this.seed*1664525+1013904223)>>>0;return this.seed/4294967296;}
  _step(dt){const row=this.row,n=this.vertices.length;this._fixedRow();const rubber=(row.type&MASK_ELASTIC)===PCT.PCT_RUBBER,rubber2=(row.type&MASK_ELASTIC)===PCT.PCT_RUBBER2,heavy=(row.type&MASK_WEIGHT)===PCT.PCT_HEAVY;
    let wind=0.25;if(rubber2){const min=row.wind?.min??1,max=row.wind?.max??1;wind=(Math.floor(this._rand()*Math.max(1,max))+min)/100;}const yaw=0;const wx=wind*Math.sin(Math.PI+yaw),wy=-wind*Math.cos(Math.PI+yaw);
    const seed=(Math.floor(this.now/.4)*101)%n;
    for(let k=0;k<n;k++){if(this.fixed[k]){this.force[k].set(0,0,0);continue;}const i=k%row.hor,j=Math.floor(k/row.hor),sk=seed%row.hor,sj=Math.floor(seed/row.hor);const key=Math.abs(sk-i)+Math.abs(sj-j),temp=Math.min(Math.max(0,5-key),4),r=temp===0?0:temp+2;const f=this.force[k],v=this.vel[k];f.set(r*wx-v.x*.01,r*wy-v.y*.01,0);if(rubber)f.z+=r*(wind+.1);else if(rubber2)f.z+=r*wind;f.z-=9.8*.0025*(heavy?180:100);}
    for(const l of this.links){if(!(l.style&PLS_SPRING))continue;const a=this.vertices[l.a],b=this.vertices[l.b],d=dist(a,b);if(d>l.large+.01){const s=(d-l.large)/d*(rubber?3:1);const dx=(a.x-b.x)*s,dy=(a.y-b.y)*s,dz=(a.z-b.z)*s;this.force[l.a].add(new THREE.Vector3(-dx,-dy,-dz));this.force[l.b].add(new THREE.Vector3(dx,dy,dz));}}
    for(let k=0;k<n;k++){if(this.fixed[k])continue;this.vel[k].addScaledVector(this.force[k],400*dt);this.vertices[k].addScaledVector(this.vel[k],dt);}
    // PC loose-distance averaged one-time correction.
    const sum=Array.from({length:n},()=>new THREE.Vector3()),count=new Uint16Array(n);for(const l of this.links){if(!(l.style&PLS_LOOSE))continue;const a=this.vertices[l.a],b=this.vertices[l.b],d=dist(a,b),s=(d-l.large)*.5/d,move=new THREE.Vector3(a.x-b.x,a.y-b.y,a.z-b.z).multiplyScalar(s);sum[l.a].sub(move);sum[l.b].add(move);count[l.a]++;count[l.b]++;}
    for(let k=0;k<n;k++)if(!this.fixed[k]&&count[k])this.vertices[k].addScaledVector(sum[k],1/count[k]);
    // Collision spheres are transformed from their authored bone into renderer-local space.
    for(const c of this.collisions){const center=transformBoneLocal(this.renderer,c.bone,new THREE.Vector3(...c.center));for(let k=0;k<n;k++){if(this.fixed[k])continue;const p=this.vertices[k],d=dist(p,center);if(d<c.radius){const s=(c.radius-d)/d;p.x+=(p.x-center.x)*s;p.y+=(p.y-center.y)*s;p.z+=(p.z-center.z)*s;}}}
    for(const l of this.links){if(!(l.style&PLS_STRICT)||l.b<row.hor)continue;const a=this.vertices[l.a],b=this.vertices[l.b],d=dist(b,a);if(d>l.large){const s=(d-l.large)/d;b.x-=(b.x-a.x)*s;b.y-=(b.y-a.y)*s;b.z-=(b.z-a.z)*s;}else if(d<l.small){const s=(d-l.small)/d;b.x-=(b.x-a.x)*s;b.y-=(b.y-a.y)*s;b.z-=(b.z-a.z)*s;}}
  }
  update(nowMs){if(this.disposed)return;const now=Number(nowMs)||0,delta=Math.min(.1,Math.max(0,(now-this.now*1000)/1000||0));this.now=now/1000;this.acc+=delta;let steps=0;while(this.acc>=1/60&&steps<4){this._step(1/60);this.acc-=1/60;steps++;}this._write();if(steps){this.geometry.computeVertexNormals();this.geometry.getAttribute('normal').needsUpdate=true;}}
  dispose(){if(this.disposed)return;this.disposed=true;this.mesh.parent?.remove(this.mesh);this.geometry.dispose();this.material.dispose();}
}

export function stockCapeClothPlan(modelType,classId=0){
  const offset=Number(modelType)-(1095+12*512);const rows=[];
  if(offset===39)rows.push({kind:'create',slot:0,bone:19,offset:[0,15,0],hor:10,ver:10,width:120,height:120,texFront:BITMAP_ROBE+8,texBack:BITMAP_ROBE+8,type:PCT.PCT_CURVED|PCT.PCT_SHORT_SHOULDER|PCT.PCT_HEAVY|PCT.PCT_MASK_ALPHA,wind:null,collisions:[]});
  if(offset===130)rows.push({kind:'create',slot:0,bone:19,offset:[0,8,10],hor:10,ver:10,width:100,height:100,texFront:BITMAP_ROBE+7,texBack:BITMAP_ROBE+7,type:PCT.PCT_CURVED|PCT.PCT_SHORT_SHOULDER|PCT.PCT_MASK_ALPHA,wind:null,collisions:[{center:[-10,-10,-10],radius:25,bone:17},{center:[10,-10,-10],radius:25,bone:17},{center:[-10,-10,20],radius:27,bone:17},{center:[10,-10,20],radius:27,bone:17}]});
  if(offset===40){rows.push({kind:'create',slot:0,bone:19,offset:[0,8,10],hor:10,ver:10,width:180,height:180,texFront:BITMAP_ROBE+9,texBack:BITMAP_ROBE+9,type:PCT.PCT_CURVED|PCT.PCT_SHORT_SHOULDER|PCT.PCT_HEAVY|PCT.PCT_MASK_ALPHA,wind:null,collisions:[{center:[-10,-10,-10],radius:25,bone:17},{center:[10,-10,-10],radius:25,bone:17},{center:[-10,-10,20],radius:27,bone:17},{center:[10,-10,20],radius:27,bone:17}]},{kind:'create',slot:4,bone:19,offset:[30,15,10],hor:2,ver:5,width:12,height:200,texFront:BITMAP_ROBE+10,texBack:BITMAP_ROBE+10,type:PCT.PCT_MASK_ALPHA,wind:null,collisions:[{center:[0,-15,-20],radius:30,bone:2},{center:[0,0,0],radius:35,bone:17}]},{kind:'create',slot:5,bone:19,offset:[-30,20,10],hor:2,ver:5,width:12,height:200,texFront:BITMAP_ROBE+10,texBack:BITMAP_ROBE+10,type:PCT.PCT_MASK_ALPHA,wind:null,collisions:[{center:[0,-15,-20],radius:30,bone:2},{center:[0,0,0],radius:35,bone:17}]});}
  return Object.freeze(rows.map(r=>Object.freeze({...r,offset:Object.freeze(r.offset),collisions:Object.freeze((r.collisions||[]).map(c=>Object.freeze({...c,center:Object.freeze(c.center)})))})));
}

export async function attachCapeCloth(renderer,{itemModelType,classId=0,custom=false}={}){
  if(!renderer?.group||!Number.isFinite(Number(itemModelType)))return Object.freeze([]);
  let plan=custom?customCapeClothPlan(Number(itemModelType),classId):stockCapeClothPlan(Number(itemModelType),classId);
  if(!plan.length)return Object.freeze([]);const owners=[];
  for(const row of plan){if(row.hor<2||row.ver<2||row.hor*row.ver>1024)continue;const tex=await clothTexture(row.texFront);if(!tex)continue;const owner=new ClothOwner(renderer,row,tex);owners.push(owner);renderer._boneSprites?.push(owner);renderer._presentationUpdates?.push((ms)=>owner.update(ms));}
  if(owners.length){renderer.userData??={};renderer.userData.muCapeCloth={count:owners.length,itemModelType:Number(itemModelType),custom:Boolean(custom),classId:Number(classId)&7};}
  return Object.freeze(owners.slice());
}
