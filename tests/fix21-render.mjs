import {run as retained} from './fix19-render.mjs';
import * as THREE from 'three';
import {pcTerrainGrassUsesAlphaBlend} from '../graphics/MuTerrain.js';
export async function run() {
  const prior=await retained(); if(prior.error)return prior;
  let passed=0; const results=[];
  const check=(value,label)=>{if(!value)throw new Error(label);passed++;results.push(label)};
  let gpu, geometry, material;
  try {
    gpu=new THREE.WebGLRenderer({alpha:false,antialias:false});gpu.setSize(16,16);gpu.setClearColor(0x0000ff,1);
    const scene=new THREE.Scene();const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
    geometry=new THREE.PlaneGeometry(2,2);
    material=new THREE.ShaderMaterial({transparent:pcTerrainGrassUsesAlphaBlend(75),fragmentShader:'void main(){gl_FragColor=vec4(1.0,0.0,0.0,0.5);}',vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'});
    scene.add(new THREE.Mesh(geometry,material));gpu.render(scene,camera);
    const gl=gpu.getContext(),pixel=new Uint8Array(4);gl.readPixels(8,8,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    check(pixel[0]>250&&pixel[2]<5,'World75 accepted alpha texel preserves PC RGB instead of blending sky/background');
    material.transparent=pcTerrainGrassUsesAlphaBlend(64);material.needsUpdate=true;gpu.render(scene,camera);gl.readPixels(8,8,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    check(pixel[0]>=126&&pixel[0]<=129&&pixel[2]>=126&&pixel[2]<=129,'PK Field preserves authored source-alpha blend exception');
    return {passed:prior.passed+passed,retainedPassed:prior.passed,newPassed:passed,results,environment:prior.environment};
  }catch(e){return {error:e.stack,passed:prior.passed+passed,results}}
  finally{geometry?.dispose();material?.dispose();gpu?.dispose()}
}
