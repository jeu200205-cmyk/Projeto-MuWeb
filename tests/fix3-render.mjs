import * as THREE from 'three';
import { MUAssets } from '../assets/MUAssetLoader.js';
import { MUModelRenderer, RenderFlags } from '../assets/MUModelRenderer.js';
import { applyMuUpAxis } from '../graphics/BmdAdapter.js';
import { bakeStaticSkinnedGeometry } from '../world/TerrainObjectWorld.js';
import { run as retained } from './fix2-render.mjs';
export async function run() {
 const previous=await retained();
 const results=[];
 const check=(v,label)=>{if(!v)throw new Error(label);results.push(label)};
 const equal=(a,b,label)=>check(a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=1),`${label}: got=${a}; expected=${b}`);
 const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(64,64);renderer.setPixelRatio(1);
 document.body.append(renderer.domElement);const gl=renderer.getContext();
 const pixel=()=>{const bytes=new Uint8Array(4);gl.readPixels(32,32,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return [...bytes]};
 const white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);white.userData.muImageReady=true;white.needsUpdate=true;
 const oldLoad=MUAssets.loadModelTexture;MUAssets.loadModelTexture=async()=>white;
 const fixture={bones:[{name:'vertex',parent:-1,dummy:false,bindPosition:[0,0,0],bindQuaternion:[0,0,0,1]},
 {name:'normal',parent:-1,dummy:false,bindPosition:[0,0,0],bindQuaternion:[0,0,0,1]}],actions:[],
 meshes:[{name:'fixture_0',texture:0,positions:new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0]),
 normals:new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),uvs:new Float32Array(8).fill(.25),
 skinIndices:new Float32Array(16),normalSkinIndices:new Float32Array([1,1,1,1]),
 skinWeights:new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]),indices:new Uint32Array([0,1,2,0,2,3])}],textures:[{FileName:'fixture.jpg',Dir:'Item'}]};
 const actor=new MUModelRenderer();await actor.initFromBMD(fixture);
 const scene=new THREE.Scene();scene.background=new THREE.Color(0);scene.add(actor.group);
 const camera=new THREE.OrthographicCamera(-1.5,1.5,1.5,-1.5,.1,10);camera.position.z=3;
 renderer.render(scene,camera);equal(pixel(),[255,255,255,255],'initial authored normal lights original body');
 actor.bones[1].rotation.x=Math.PI/2;renderer.render(scene,camera);
 equal(pixel(),[102,102,102,255],'GPU light follows normal bone independently of vertex bone');
 actor.bones[0].rotation.z=.3;renderer.render(scene,camera);
 equal(pixel(),[102,102,102,255],'vertex bone rotation cannot change independent normal light');
 actor.bones[1].rotation.x=Math.PI;renderer.render(scene,camera);
 equal(pixel(),[51,51,51,255],'GPU back-facing independent normal uses PC minimum light');
 const baked=bakeStaticSkinnedGeometry(actor.meshes[0]);const staticMesh=new THREE.Mesh(baked,actor.meshes[0].material);
 scene.remove(actor.group);scene.add(staticMesh);renderer.render(scene,camera);
 equal(pixel(),[51,51,51,255],'baked map transport retains identical authored normal pixels');
 scene.remove(staticMesh);scene.add(actor.group);actor.bones[0].rotation.set(0,0,0);actor.bones[1].rotation.set(0,0,0);
 // Independent reference values transcribed from PC RenderMesh, sampled from
 // a deterministic 16x16 texture. No production helper supplies expectations.
 const n=[.3,.4,Math.sqrt(.75)];const attr=actor.meshes[0].geometry.getAttribute('normal');for(let i=0;i<4;i++)attr.setXYZ(i,...n);attr.needsUpdate=true;
 const pixels=new Uint8Array(16*16*4);for(let y=0;y<16;y++)for(let x=0;x<16;x++){const o=(y*16+x)*4;pixels[o]=x*16;pixels[o+1]=y*16;pixels[o+2]=64;pixels[o+3]=255;}
 const gradient=new THREE.DataTexture(pixels,16,16);gradient.wrapS=gradient.wrapT=THREE.ClampToEdgeWrapping;gradient.minFilter=gradient.magFilter=THREE.NearestFilter;gradient.generateMipmaps=false;gradient.needsUpdate=true;
 const expectedUv=(mode,ms)=>{
  const w=(Math.floor(ms)%10000)*.0001,w2=(Math.floor(ms)%5000)*.00024-.4;
  const L=[Math.cos(ms*.001),Math.sin(ms*.002),1],d=n[0]*L[0]+n[1]*L[1]+n[2];
  switch(mode){
   case 1:return [n[2]*.5+w,n[1]*.5+w*2];
   case 2:return [(n[2]+n[0])*.8+w2*2,n[1]+n[0]+w2*3];
   case 3:{const a=-n[1]*.1-n[2]*.8;return [a,1-a];}
   case 4:return [d+n[1]*.5+L[1]*3,1-d-n[2]*.5-w*3];
   case 5:return [d+n[1]*3+L[1]*5,1-d-n[2]*2.5-w];
   case 6:{const a=(n[2]+n[0])*.8+w2*2;return [a,a];}
   case 7:{const a=(n[2]+n[0])*.8+ms*.00006;return [a,a];}
   case 8:return [n[2]*.5+.2,n[1]*.5+.5];
   case 9:return [n[0]*.25,n[1]*.25];
  }
 };
 const expectedPixel=uv=>[Math.min(15,Math.max(0,Math.floor(uv[0]*16)))*16,Math.min(15,Math.max(0,Math.floor(uv[1]*16)))*16,64,255];
 actor.meshes[0].visible=false;
 const modes=[[1,RenderFlags.CHROME],[2,RenderFlags.CHROME2],[3,RenderFlags.CHROME3],[4,RenderFlags.CHROME4],[5,RenderFlags.CHROME5],[6,RenderFlags.CHROME6],[7,RenderFlags.CHROME7],[8,RenderFlags.METAL],[9,RenderFlags.OIL]];
 for(const [mode,flag] of modes){
  const overlay=actor.createOverlayPass(flag|RenderFlags.BRIGHT,{map:gradient});
  for(const ms of [0,1234,4999,5000,10001]){
   actor.update(0,ms/1000);renderer.render(scene,camera);
   equal(pixel(),expectedPixel(expectedUv(mode,ms)),`PC family ${mode} at ${ms}ms uses source UV formula`);
  }
  // CHROME4/OIL apply authored offsets; ordinary chrome does not.
  overlay.setUvOffset(.13,.17);actor.update(0,0);renderer.render(scene,camera);
  let uv=expectedUv(mode,0);if(mode===4||mode===9)uv=[uv[0]+.13,uv[1]+.17];
  equal(pixel(),expectedPixel(uv),`PC family ${mode} owns its authored UV offset`);
  overlay.meshes[0].visible=false;
 }
 // World conversion must not change PC chrome coordinates. Rotate the camera
 // with the MU basis so the controlled quad remains at the center of view.
 const worldPass=actor.createOverlayPass(RenderFlags.CHROME6|RenderFlags.BRIGHT,{map:gradient});
 applyMuUpAxis(actor.group);camera.position.set(0,3,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);actor.update(0,0);renderer.render(scene,camera);
 equal(pixel(),expectedPixel(expectedUv(6,0)),'world MU up-axis conversion preserves chrome normal coordinates');
 // Add a new overlay after conversion: it inherits the ancestor basis.
 worldPass.meshes[0].visible=false;const latePass=actor.createOverlayPass(RenderFlags.METAL|RenderFlags.BRIGHT,{map:gradient});renderer.render(scene,camera);
 equal(pixel(),expectedPixel(expectedUv(8,0)),'late equipment overlay inherits PC basis from its ancestor');
 latePass.meshes[0].visible=false;
 const alphaPass=actor.createOverlayPass(RenderFlags.CHROME3,{map:white,color:new THREE.Color(.4,.2,.1),alpha:.5});renderer.render(scene,camera);
 equal(pixel(),[51,26,13,255],'additive chrome scales RGB by alpha without requiring explicit BRIGHT');
 alphaPass.setOpacity(0);renderer.render(scene,camera);
 equal(pixel(),[0,0,0,255],'zero additive chrome alpha removes its RGB contribution');
 alphaPass.meshes[0].visible=false;
 const noDepth=actor.createOverlayPass(RenderFlags.CHROME7|RenderFlags.NODEPTH,{map:white});
 check(noDepth.meshes[0].material.depthTest===false,'NODEPTH applies to actual overlay material');
 check(gl.getError()===gl.NO_ERROR,'all normal/chrome/map shaders compile and draw without GL errors');
 baked.dispose();actor.dispose();white.dispose();gradient.dispose();MUAssets.loadModelTexture=oldLoad;renderer.dispose();
 return {passed:previous.passed+results.length,retainedPassed:previous.passed,newPassed:results.length,results,environment:previous.environment};
}
