#!/usr/bin/env node
/** MAPS_ENGINE M141: physical World1/World11 M69/M74/M75 attribution.
 * Extends M140 with committed CPU-bounds counters and exact-angle quaternion
 * MRU hit rate. No historical/synthetic fixture is an M141 physical FPS test.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeM140Capture,compareM140Captures} from './ANALYZE_M140_WORLD1_WORLD11.mjs';
const finite=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
const delta=(before,after)=>before===null||after===null?null:after-before;
const lastStage=(capture,world)=>[...(capture?.captures||[])].reverse().find(x=>Number(x?.profile?.world)===world)?.profile||null;
function metrics(stage){
  const q=stage?.placementQuaternionScratch||{},t=stage?.staticTransport||{};
  const hits=finite(q.rotationMruHits),misses=finite(q.rotationMruMisses);
  return {
    rotationMruHits:hits,
    rotationMruMisses:misses,
    rotationMruHitPct:hits!==null&&misses!==null&&hits+misses>0?100*hits/(hits+misses):null,
    avoidedBoundsRecomputes:finite(t.avoidedBoundsRecomputes),
    avoidedBoundsVertexVisits:finite(t.avoidedBoundsVertexVisits),
    placementBuildMs:finite(stage?.phases?.placementBuild),
    staticBatchMs:finite(stage?.phases?.staticBatch),
    cpuFallbackBuildMs:finite(t.cpuFallbackBuildMs),
  };
}
export function analyzeM141Capture(capture){
  const base=analyzeM140Capture(capture);
  return {...base,m141Cpu:Object.fromEntries([1,11].map(w=>[w,metrics(lastStage(capture,w))])),
    noteM141:'MRU counters are exact synchronous reuse decisions; bounds counters count duplicate CPU bounds calls avoided on committed merges. Neither proves FPS, GPU upload, material/terrain parity or improved frame pacing. Physical capture with official MuPromax Data required.'};
}
export function compareM141Captures(before,after){
  const base=compareM140Captures(before,after),a=analyzeM141Capture(before),b=analyzeM141Capture(after),changes={};
  for(const w of [1,11]){
    changes[w]={};
    for(const name of Object.keys(a.m141Cpu[w]))changes[w][name]=delta(a.m141Cpu[w][name],b.m141Cpu[w][name]);
  }
  return {...base,m141Cpu:{before:a.m141Cpu,after:b.m141Cpu,delta:changes},
    noteM141:'Only report physical A/B if comparison.evidenceComplete=true and comparison.parityFailures=[]; the same camera/scene and official Data must be used. Null metrics mean not captured.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))){
  const args=process.argv.slice(2),flag=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null;};
  const candidate=flag('--candidate'),baseline=flag('--baseline');
  if(!candidate){console.error('Usage: node ANALYZE_M141_WORLD1_WORLD11.mjs --candidate CAPTURE_M141.json [--baseline CAPTURE_M140.json]');process.exit(2);}
  try{
    const after=JSON.parse(fs.readFileSync(candidate,'utf8'));
    const report=baseline?compareM141Captures(JSON.parse(fs.readFileSync(baseline,'utf8')),after):analyzeM141Capture(after);
    console.log(JSON.stringify(report,null,2));
    if(baseline&&report.comparison.parityFailures.length)process.exitCode=3;
    else if(baseline&&!report.comparison.evidenceComplete)process.exitCode=2;
    else if(!baseline&&report.coverage.length)process.exitCode=2;
  }catch(e){console.error(`Invalid M141 physical capture: ${e.message}`);process.exitCode=2;}
}
