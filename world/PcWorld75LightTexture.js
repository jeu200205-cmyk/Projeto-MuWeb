import * as THREE from 'three';
import {RemoteAssets} from '../data/RemoteAssets.js';

export const WORLD75_LIGHT_SPRITE_PATH='Effect/flare01.OZJ';
const textures=new Map();

/** Shared BITMAP_LIGHT pixels for real World75 sprite owners. Failed loads
 * remain retryable on world re-entry; a Data switch cannot publish old pixels.
 * Existing sprites retain their asset view until their world is retired. */
export async function loadWorld75LightTexture(){
 const authority=RemoteAssets.baseUrl;
 if(textures.has(authority))return textures.get(authority);
 const job=(async()=>{
  const decoded=await RemoteAssets.fetchDecodedImage(WORLD75_LIGHT_SPRITE_PATH);
  if(authority!==RemoteAssets.baseUrl||!decoded?.image||!(decoded.w>0)||!(decoded.h>0))return null;
  const texture=new THREE.Texture(decoded.image);
  texture.needsUpdate=true;texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=true;texture.userData.muPcBitmapPath=WORLD75_LIGHT_SPRITE_PATH;
  return Object.freeze({texture,width:decoded.w,height:decoded.h});
 })().catch(()=>null);
 textures.set(authority,job);
 job.then(value=>{if(!value&&textures.get(authority)===job)textures.delete(authority)});
 return job;
}
