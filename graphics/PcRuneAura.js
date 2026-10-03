/**
 * PcRuneAura.js — exact CItemEffectManager Runne EffectType=0 presentation.
 *
 * PC owner (ZzzCharacter.cpp):
 *   fLumi = sin(WorldTime*0.0015)*0.3 + 0.5
 *   EnableAlphaBlend() => GL_ONE,GL_ONE
 *   RenderTerrainAlphaBitmap(BITMAP_GM_AURORA, x,y, scale*2,scale*2, light, +WorldTime*0.01)
 *   RenderTerrainAlphaBitmap(BITMAP_GM_AURORA, x,y, scale,  scale,  light, -WorldTime*0.01)
 * BITMAP_GM_AURORA is Data/Skill/gmmzine.jpg (compiled client: Skill/gmmzine.OZJ).
 *
 * The Web mesh below ports RenderTerrainAlphaBitmap's tile-grid geometry/UV
 * math and samples the real current terrain height. It is not a billboard or
 * generic aura replacement.
 */
import * as THREE from 'three';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { TERRAIN_SCALE, MAP_SIZE } from '../world/TerrainWorld.js';

export const PC_GM_AURORA_PATH = 'Skill/gmmzine.OZJ';

let _texturePromise = null;
async function loadAuraTexture() {
  if (_texturePromise) return _texturePromise;
  _texturePromise = (async () => {
    const url = await RemoteAssets.fetchImageURL(PC_GM_AURORA_PATH);
    if (!url) return null;
    const tex = await new Promise((resolve, reject) => new THREE.TextureLoader().load(url, resolve, undefined, reject));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  })().catch(() => null);
  return _texturePromise;
}

function rotateUv(x, y, degrees) {
  const a = Number(degrees) * Math.PI / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const px = x - 0.5, py = y - 0.5;
  return [px*c - py*s + 0.5, px*s + py*c + 0.5];
}

/** Pure port of ZzzLodTerrain.cpp::RenderTerrainAlphaBitmap tile/UV planner. */
export function planTerrainAlphaBitmap(pcX, pcY, sizeX, sizeY, rotationDeg = 0) {
  const mxf = Number(pcX) / TERRAIN_SCALE;
  const myf = Number(pcY) / TERRAIN_SCALE;
  const mxi = Math.trunc(mxf), myi = Math.trunc(myf);
  const maxSize = Math.max(Number(sizeX), Number(sizeY));
  if (!(maxSize > 0) || !(Number(sizeY) > 0)) return [];
  const texU = (mxi - mxf) + 0.5 * maxSize;
  const texV = (myi - myf) + 0.5 * maxSize;
  const texScaleU = 1 / maxSize, texScaleV = 1 / maxSize;
  const loopSize = Math.trunc(maxSize) + 1;
  const aspect = Number(sizeX) / Number(sizeY);
  const quads = [];
  for (let y=-loopSize; y<=loopSize; y+=1) {
    for (let x=-loopSize; x<=loopSize; x+=1) {
      const raw = [
        [(texU+x)*texScaleU,     (texV+y)*texScaleV],
        [(texU+x+1)*texScaleU,   (texV+y)*texScaleV],
        [(texU+x+1)*texScaleU,   (texV+y+1)*texScaleV],
        [(texU+x)*texScaleU,     (texV+y+1)*texScaleV],
      ];
      const uv = raw.map(([u,v]) => {
        const [ru,rv] = rotateUv(u,v,rotationDeg);
        return [(ru-0.5)*aspect+0.5, rv];
      });
      quads.push({ tileX:mxi+x, tileY:myi+y, uv });
    }
  }
  return quads;
}

function muTileVertexToThree(tileX, tileY, terrainHeightAt, heightOffset) {
  const x = tileX * TERRAIN_SCALE - MAP_SIZE/2;
  const z = MAP_SIZE/2 - tileY * TERRAIN_SCALE;
  const y = Number(terrainHeightAt?.(x,z)) || 0;
  return [x, y + heightOffset, z];
}

function ensureGeometryBuffers(mesh, quadCount) {
  const vertexCount=quadCount*4;
  const current=mesh.geometry;
  if (current?.userData?.quadCount === quadCount) return current;
  current?.dispose?.();
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(vertexCount*3),3));
  geo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(vertexCount*2),2));
  const idx=new Uint32Array(quadCount*6);
  for(let q=0;q<quadCount;q++){
    const b=q*4,o=q*6;
    idx[o]=b;idx[o+1]=b+1;idx[o+2]=b+2;idx[o+3]=b;idx[o+4]=b+2;idx[o+5]=b+3;
  }
  geo.setIndex(new THREE.BufferAttribute(idx,1));
  geo.userData.quadCount=quadCount;
  mesh.geometry=geo;
  return geo;
}

/** Allocation-stable runtime form of RenderTerrainAlphaBitmap. */
function updateTerrainAlphaGeometry(mesh, pcX, pcY, sizeX, sizeY, rotationDeg, terrainHeightAt, heightOffset=5) {
  const mxf=Number(pcX)/TERRAIN_SCALE, myf=Number(pcY)/TERRAIN_SCALE;
  const mxi=Math.trunc(mxf), myi=Math.trunc(myf);
  const maxSize=Math.max(Number(sizeX),Number(sizeY));
  if(!(maxSize>0) || !(Number(sizeY)>0)) return;
  const texU=(mxi-mxf)+0.5*maxSize, texV=(myi-myf)+0.5*maxSize;
  const texScale=1/maxSize, loopSize=Math.trunc(maxSize)+1, aspect=Number(sizeX)/Number(sizeY);
  const side=loopSize*2+1, quadCount=side*side;
  const geo=ensureGeometryBuffers(mesh,quadCount);
  const pos=geo.getAttribute('position').array, uv=geo.getAttribute('uv').array;
  const a=Number(rotationDeg)*Math.PI/180,c=Math.cos(a),sn=Math.sin(a);
  let pi=0,ui=0;
  for(let dy=-loopSize;dy<=loopSize;dy++){
    for(let dx=-loopSize;dx<=loopSize;dx++){
      const tx=mxi+dx,ty=myi+dy;
      const verts=[[tx,ty],[tx+1,ty],[tx+1,ty+1],[tx,ty+1]];
      const raw=[
        [(texU+dx)*texScale,(texV+dy)*texScale],
        [(texU+dx+1)*texScale,(texV+dy)*texScale],
        [(texU+dx+1)*texScale,(texV+dy+1)*texScale],
        [(texU+dx)*texScale,(texV+dy+1)*texScale],
      ];
      for(let i=0;i<4;i++){
        const [wx,wy,wz]=muTileVertexToThree(verts[i][0],verts[i][1],terrainHeightAt,heightOffset);
        pos[pi++]=wx;pos[pi++]=wy;pos[pi++]=wz;
        const px=raw[i][0]-0.5,py=raw[i][1]-0.5;
        const ru=px*c-py*sn+0.5,rv=px*sn+py*c+0.5;
        uv[ui++]=(ru-0.5)*aspect+0.5;uv[ui++]=rv;
      }
    }
  }
  geo.getAttribute('position').needsUpdate=true;
  geo.getAttribute('uv').needsUpdate=true;
}


export class PcTerrainAlphaPass {
  constructor(scene, texture, terrainHeightAt) {
    this.scene=scene; this.terrainHeightAt=terrainHeightAt;
    this.material = new THREE.MeshBasicMaterial({
      map:texture, transparent:true, opacity:1,
      color:new THREE.Color(1,1,1), blending:THREE.AdditiveBlending,
      blendSrc:THREE.OneFactor, blendDst:THREE.OneFactor,
      depthWrite:false, depthTest:true, side:THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    // Aura follows the hero. Avoid per-frame bounding-sphere recomputation;
    // the PC draws this pass whenever the visible player is being rendered.
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.scene.add(this.mesh);
  }
  update(pcX,pcY,sizeX,sizeY,rotationDeg,color) {
    updateTerrainAlphaGeometry(this.mesh,pcX,pcY,sizeX,sizeY,rotationDeg,this.terrainHeightAt,5);
    this.material.color.copy(color);
  }
  dispose(){ this.scene?.remove(this.mesh); this.mesh.geometry?.dispose?.(); this.material?.dispose?.(); }
}

export class PcRuneAura {
  static async create({ scene, terrainHeightAt, getPosition, info }={}) {
    if (!scene || typeof terrainHeightAt !== 'function' || typeof getPosition !== 'function' || !info || info.effectType !== 0) return null;
    const tex=await loadAuraTexture();
    if (!tex) return null; // exact asset absent => fail closed
    const a=new PcRuneAura(scene,terrainHeightAt,getPosition,info,tex);
    return a;
  }
  constructor(scene,terrainHeightAt,getPosition,info,texture){
    this.scene=scene; this.getPosition=getPosition; this.info=info;
    this.outer=new PcTerrainAlphaPass(scene,texture,terrainHeightAt);
    this.inner=new PcTerrainAlphaPass(scene,texture,terrainHeightAt);
    this.disposed=false;
  }
  setVisible(flag) {
    const v=Boolean(flag);
    if (this.outer?.mesh) this.outer.mesh.visible=v;
    if (this.inner?.mesh) this.inner.mesh.visible=v;
  }
  update(worldTimeMs) {
    if(this.disposed) return;
    const p=this.getPosition(); if(!p) return;
    const pcX=Number(p.x)+MAP_SIZE/2, pcY=MAP_SIZE/2-Number(p.z);
    const t=Number(worldTimeMs)||0;
    const lumi=Math.sin(t*0.0015)*0.3+0.5;
    const base=this.info.customColor
      ? new THREE.Color(this.info.colorR,this.info.colorG,this.info.colorB)
      : new THREE.Color(1,1,1);
    base.multiplyScalar(lumi);
    this.outer.update(pcX,pcY,this.info.scale*2,this.info.scale*2, t*0.01,base);
    this.inner.update(pcX,pcY,this.info.scale,this.info.scale,-t*0.01,base);
  }
  dispose(){ if(this.disposed)return; this.disposed=true; this.outer.dispose(); this.inner.dispose(); }
}

export function resetPcRuneAuraTextureForTests(){ _texturePromise=null; }
