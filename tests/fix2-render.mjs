import * as THREE from 'three';
import { MUAssets, MUAssetLoader } from '../assets/MUAssetLoader.js';
import { MUModelRenderer, RenderFlags } from '../assets/MUModelRenderer.js';
import { GameScene } from '../graphics/Scene.js';
import { createMuTerrainMesh } from '../graphics/MuTerrain.js';
export async function run() {
 const results=[];
 const check=(v,message)=>{if(!v)throw new Error(message);results.push(message)};
 const equal=(a,b,message,tolerance=1)=>check(a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=tolerance),`${message}: got=${a}, expected=${b}`);
 const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true,alpha:false});renderer.setSize(64,64);renderer.setPixelRatio(1);document.body.append(renderer.domElement);
 const gl=renderer.getContext();const pixel=(x,y)=>{const b=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,b);return [...b]};
 const fixture={bones:[{name:'root',parent:-1,dummy:false,bindPosition:[0,0,0],bindQuaternion:[0,0,0,1]}],actions:[],
 meshes:[{name:'body_0',texture:0,positions:new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0]),normals:new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),uvs:new Float32Array([0,0,1,0,1,1,0,1]),skinIndices:new Float32Array(16),skinWeights:new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]),indices:new Uint32Array([0,1,2,0,2,3])}],textures:[{FileName:'fixture.tga',Dir:'Item'}]};
 const loader=new MUAssetLoader({useIDB:false,useWorkers:false});
 const desc=loader._createThreeTexture({format:'rgba',width:2,height:2,data:new Uint8ClampedArray([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255])});
 const standard=desc.createThreeTexture(THREE),pc=desc.createThreeTexture(THREE,{pcBmd:true});pc.minFilter=pc.magFilter=THREE.NearestFilter;pc.generateMipmaps=false;pc.needsUpdate=true;
 check(standard.flipY===true && standard.colorSpace===THREE.SRGBColorSpace,'UI texture settings remain independent');
 check(pc.flipY===false && pc.colorSpace===THREE.NoColorSpace,'BMD texture uses PC verbatim row/byte convention');
 check(pc===desc.createThreeTexture(THREE,{pcBmd:true}),'BMD consumers share one asset-owned view');
 const npot=loader._createThreeTexture({format:'rgba',width:3,height:2,data:new Uint8ClampedArray(3*2*4).fill(255)});
 const npotUI=npot.createThreeTexture(THREE),npotPC=npot.createThreeTexture(THREE,{pcBmd:true});
 check(npotPC.image.width===4 && npotPC.image.height===2,'PC NPOT texture padded to authored power-of-two upload stride');
 check(npotUI.image.width===3 && npotUI.source!==npotPC.source,'PC padding does not mutate standard UI source');
 const padPixels=npotPC.image.getContext('2d').getImageData(0,0,4,1).data;
 equal([...padPixels.slice(8,12)],[255,255,255,255],'NPOT source pixels retained at original scale');
 equal([...padPixels.slice(12,16)],[0,0,0,0],'NPOT padding adds empty allocation, does not stretch image');
 const oldLoad=MUAssets.loadModelTexture;MUAssets.loadModelTexture=async()=>desc;
 const live=new MUModelRenderer();await live.initFromBMD(fixture);live.setLightEnabled(false);
 const world=new THREE.Scene();world.add(live.group);world.background=new THREE.Color().setRGB(10/256,20/256,14/256,THREE.SRGBColorSpace);
 const camera=new THREE.OrthographicCamera(-1.2,1.2,1.2,-1.2,.1,10);camera.position.z=2;
 renderer.render(world,camera);
 equal(pixel(16,16),[255,0,0,255],'BMD bottom-left matches first uploaded PC texture row');
 equal(pixel(16,48),[0,0,255,255],'BMD top-left matches second PC texture row');
 live.setBodyLight(new THREE.Color(.5,.5,.5));renderer.render(world,camera);
 equal(pixel(16,16),[128,0,0,255],'BodyLight modulates encoded bytes exactly once');
 equal(pixel(48,48),[128,128,128,255],'white texture at half light is 128, not gamma-bright 188');
 let mapDispose=0;pc.addEventListener('dispose',()=>mapDispose++);
 for(let i=0;i<30;i++) { const next=new MUModelRenderer();await next.initFromBMD(fixture);next.dispose();renderer.render(world,camera);equal(pixel(16,16),[128,0,0,255],`GPU retains live map after icon/reequip disposal ${i+1}`); }
 check(mapDispose===0,'shared model texture not disposed by retired renderers');
 live.meshes[0].visible=false;const overlay=live.createOverlayPass(RenderFlags.TEXTURE|RenderFlags.BRIGHT,{color:new THREE.Color(.5,.5,.5)});check(overlay?.meshes.length===1,'hidden diffuse base can publish authored overlay');
 renderer.render(world,camera);check(gl.getError()===gl.NO_ERROR,'base and overlay shaders compile/draw without GL errors');
 // Freeze actual prior world across render submissions, supersession and resize.
 live.meshes[0].visible=true;overlay.meshes[0].visible=false;renderer.render(world,camera);const before=pixel(1,1),bodyBefore=pixel(16,16);
 const gs=new GameScene({});gs.renderer=renderer;gs.scene=world;gs.camera={threeCamera:camera};gs.cameraMode='game';gs.mainObject=live.group;gs.terrain=new THREE.Group();gs.worldObjectLayer={root:new THREE.Group()};
 gs.beginRealMapTransition(3);
 world.background=new THREE.Color(0x0000ff);
 for(let i=0;i<8;i++){gs.render();equal(pixel(16,16),bodyBefore,`transition preserves rendered body frame ${i+1}`);equal(pixel(1,1),before,`transition preserves actual background byte ${i+1}`);}
 gs.beginRealMapTransition(7);gs.render();equal(pixel(16,16),bodyBefore,'superseding destination never captures an empty hidden graph');
 gs.finishRealMapTransition({commit:false});renderer.render(world,camera);check(live.group.visible,'rollback keeps live character visible');
 // Actual production terrain shader and grass builder with controlled images.
 const img=document.createElement('canvas');img.width=img.height=2;const ctx=img.getContext('2d');ctx.fillStyle='rgb(200,100,50)';ctx.fillRect(0,0,2,2);
 const light=document.createElement('canvas');light.width=light.height=256;const lctx=light.getContext('2d');lctx.fillStyle='rgb(128,128,128)';lctx.fillRect(0,0,256,256);
 const alphas=new Float32Array(65536).fill(.5);
 const terrain=await createMuTerrainMesh({THREE,fetchImageURL:async p=>p.includes('TerrainLight')?light.toDataURL():img.toDataURL()},75,{mapNumber:75,layer1:new Uint8Array(65536),layer2:new Uint8Array(65536),alpha:alphas},new Float32Array(65536));
 check(terrain.mesh.userData.terrainGrassCells===0,'fractional path alpha excludes grass in all affected cells');
 world.clear();world.background=null;world.add(terrain.mesh);const tc=new THREE.OrthographicCamera(-300,300,300,-300,1,1000);tc.position.set(-12700,500,12700);tc.up.set(0,0,-1);tc.lookAt(-12700,0,12700);renderer.render(world,tc);
 // Flat normal: dot((0,0,1),(.5,-.5,.5))+.5 = 1 -> 128/255 light.
 equal(pixel(32,32),[100,50,25,255],'terrain shares PC byte-space light modulation');check(gl.getError()===gl.NO_ERROR,'terrain shader compiles and renders');
 terrain.mesh.userData.dispose?.();terrain.mesh.geometry.dispose();terrain.mesh.material.dispose();live.dispose();MUAssets.loadModelTexture=oldLoad;renderer.dispose();
 return {passed:results.length,results,environment:{three:THREE.REVISION,webgl:gl.constructor.name,renderer:gl.getParameter(gl.RENDERER),scope:'isolated synthetic regression inputs; production render paths; software WebGL; not live GameServer/Data'}};
}
