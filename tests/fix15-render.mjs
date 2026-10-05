import {run as retained} from './fix14-render.mjs';
import {MUAssetLoader} from '../assets/MUAssetLoader.js';
import {RemoteAssets} from '../data/RemoteAssets.js';
export async function run(){
 const prior=await retained(),results=[];const check=(v,s)=>{if(!v)throw Error(s);results.push(s)};
 const root=RemoteAssets.baseUrl;
 const bytes=new Uint8Array(42);bytes.set([66,77,68,10]);bytes.set(new TextEncoder().encode('browser-fixture'),4);
 let loads=0;const remote={baseUrl:'https://fixture.invalid/fix15-idb-A/',fetchBinary:async()=>{loads++;return bytes.buffer}};
 try{
  const loader=new MUAssetLoader({useIDB:true,useWorkers:false});loader.remoteAssets=remote;
  const values=await Promise.all(Array.from({length:12},()=>loader.loadBMD('Object1/fixture.bmd')));
  check(loads===1,'browser 12 concurrent BMD loads share one fetch/parse');
  check(values.every(v=>v===values[0]),'browser concurrent callers share resident parsed BMD');
  const second=new MUAssetLoader({useIDB:true,useWorkers:false});second.remoteAssets=remote;
  const stored=await second.loadBMD('Object1/fixture.bmd');
  check(Boolean(stored)&&loads===1,'same Data authority reuses parsed IndexedDB record in another loader');
  remote.baseUrl='https://fixture.invalid/fix15-idb-B/';
  await second.loadBMD('Object1/fixture.bmd');
  check(loads===2,'another Data authority cannot consume prior IndexedDB BMD record');
  const third=new MUAssetLoader({useIDB:true,useWorkers:false});third.remoteAssets=remote;
  await third.loadBMD('Object1/fixture.bmd');
  check(loads===2,'new Data authority persists its independent BMD record');
 }finally{RemoteAssets.configure(root)}
 return {passed:prior.passed+results.length,retainedPassed:prior.passed,newPassed:results.length,results,environment:prior.environment};
}
