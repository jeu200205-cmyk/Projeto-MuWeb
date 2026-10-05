import {run as retained} from './fix18-render.mjs';
import LoginScene from '../scenes/LoginScene.js';
import {RemoteAssets} from '../data/RemoteAssets.js';
import * as THREE from 'three';
import {pcTerrainGrassQuad,splitPcGrassGeometry} from '../graphics/MuTerrain.js';
export async function run(){
 const prior=await retained();if(prior.error)return prior;
 let passed=0;const results=[],check=(v,s)=>{if(!v)throw new Error(s);passed++;results.push(s)};
 const original=RemoteAssets.fetchDecodedImage,root=document.createElement('div');root.style.cssText='position:fixed;inset:0;';document.body.appendChild(root);
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;canvas.getContext('2d').fillRect(0,0,256,256);
 const login=new LoginScene();
 try{
  RemoteAssets.fetchDecodedImage=async()=>({image:canvas,url:canvas.toDataURL()});
  await login.mount(root);const panel=login.panelEl.getBoundingClientRect();
  const inside=r=>r.left>=panel.left-.1&&r.right<=panel.right+.1&&r.top>=panel.top-.1&&r.bottom<=panel.bottom+.1;
  check([login.userInput,login.passInput,login.rememberChk.parentElement,login.connectBtn,login.cancelBtn].every(el=>inside(el.getBoundingClientRect())),'login controls fit inside authored panel');
  check(Math.abs(login.userInput.getBoundingClientRect().width-login.userInput.parentElement.getBoundingClientRect().width)<.1,'login input padding does not expand hitbox');
  check(login.passInput.getBoundingClientRect().bottom<login.rememberChk.parentElement.getBoundingClientRect().top,'password and remember account never overlap');
  check(getComputedStyle(login.panelEl).backgroundSize==='100% 100%','already cropped PC panel is not cropped a second time');
  check(root.querySelector('[data-mu-virtual-board]').dataset.muFirstPaint==='complete','atomic login artwork paint retained');
  const h=new Float32Array(65536),geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([...pcTerrainGrassQuad(0,0,h,64).flat(),...pcTerrainGrassQuad(64,64,h,64).flat()],3));geo.setIndex([0,2,1,0,3,2,4,6,5,4,7,6]);
  const chunks=splitPcGrassGeometry(geo,THREE),world=new THREE.Scene(),mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  chunks.forEach(g=>world.add(new THREE.Mesh(g,mat)));
  const camera=new THREE.PerspectiveCamera(60,1,1,1000);camera.position.set(-12750,200,12900);camera.lookAt(-12750,32,12750);
  const gpu=new THREE.WebGLRenderer();gpu.setSize(32,32);gpu.render(world,camera);
  check(gpu.info.render.triangles===2,'actual WebGL submits visible grass region and culls distant region');
  check(chunks.reduce((n,g)=>n+g.index.count/3,0)===4,'culled grass remains resident with every authored triangle');
  chunks.forEach(g=>g.dispose());geo.dispose();mat.dispose();gpu.dispose();
  return {passed:prior.passed+passed,retainedPassed:prior.passed,newPassed:passed,results,environment:prior.environment};
 }catch(e){return {error:e.stack,passed:prior.passed+passed,results}}finally{RemoteAssets.fetchDecodedImage=original;login.dispose();root.remove()}
}
