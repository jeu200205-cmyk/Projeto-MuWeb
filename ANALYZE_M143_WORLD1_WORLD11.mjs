#!/usr/bin/env node
/** M143: report direct matrix-view CPU allocation avoidance separately from
 * physical frame pacing. No synthetic counters are physical GPU/FPS evidence.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeM142Capture,compareM142Captures} from './ANALYZE_M142_WORLD1_WORLD11.mjs';
const finite=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
const delta=(a,b)=>a===null||b===null?null:b-a;
const stage=(c,w)=>[...(c?.captures||[])].reverse().find(x=>Number(x?.profile?.world)===w)?.profile||null;
const metrics=(p)=>{
  const t=p?.staticTransport||{};
  return {mode:typeof t.mode==='string'?t.mode:null,
    directMatrixBins:finite(t.directMatrixBins),directMatrixPlacements:finite(t.directMatrixPlacements),
    avoidedPackedMatrixBytes:finite(t.avoidedPackedMatrixBytes),
    matrixPackedBins:finite(t.matrixPackedBins),packedMatrixBytes:finite(t.packedMatrixBytes),
    bulkMatrixCopies:finite(t.bulkMatrixCopies),bulkMatrixBytes:finite(t.bulkMatrixBytes),
    avoidedGetMatrixAtCalls:finite(t.avoidedGetMatrixAtCalls),
    cpuFallbackBuildMs:finite(t.cpuFallbackBuildMs),
    staticBatchMs:finite(p?.phases?.staticBatch),placementBuildMs:finite(p?.phases?.placementBuild),
    placements:finite(p?.placements),rendered:finite(p?.rendered),missing:finite(p?.missing)};
};
export function analyzeM143Capture(c){
  const base=analyzeM142Capture(c);
  return {...base,m143Cpu:Object.fromEntries([1,11].map(w=>[w,metrics(stage(c,w))])),
    noteM143:'Direct-view metrics count only committed large CPU-merge bins. Bytes are temporary CPU packing avoided, NOT WebGL upload savings. Compare same official Data, GPU, scene, capture frame p50/p95/p99 and visual screenshots; missing metrics remain null.'};
}
export function compareM143Captures(before,after){
  const base=compareM142Captures(before,after),a=analyzeM143Capture(before),b=analyzeM143Capture(after),d={};
  for(const w of [1,11]){
    d[w]={};
    for(const k of Object.keys(a.m143Cpu[w]))if(k!=='mode')d[w][k]=delta(a.m143Cpu[w][k],b.m143Cpu[w][k]);
  }
  const transportParityFailures=[];
  for(const w of [1,11]){
    const x=a.m143Cpu[w],y=b.m143Cpu[w];
    for(const k of ['placements','rendered','missing'])
      if(x[k]!==null&&y[k]!==null&&x[k]!==y[k])transportParityFailures.push(`World${w} ${k}: ${x[k]} -> ${y[k]}`);
  }
  return {...base,m143Cpu:{before:a.m143Cpu,after:b.m143Cpu,delta:d},transportParityFailures,
    noteM143:'Require complete physical M69/M74/M75 captures, zero placement/terrain parity failures, stable >=150-frame statistics and official Data screenshots. Do not infer FPS from CPU byte counters.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))){
  const args=process.argv.slice(2),flag=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null;};
  const candidate=flag('--candidate'),baseline=flag('--baseline');
  if(!candidate){console.error('Usage: node ANALYZE_M143_WORLD1_WORLD11.mjs --candidate M143.json [--baseline M142.json]');process.exit(2);}
  try{
    const after=JSON.parse(fs.readFileSync(candidate,'utf8'));
    const report=baseline?compareM143Captures(JSON.parse(fs.readFileSync(baseline,'utf8')),after):analyzeM143Capture(after);
    console.log(JSON.stringify(report,null,2));
    if(baseline&&(report.comparison.parityFailures.length||report.terrainTiles.parityFailures.length||report.transportParityFailures.length))process.exitCode=3;
    else if(baseline&&!report.comparison.evidenceComplete)process.exitCode=2;
    else if(!baseline&&report.coverage.length)process.exitCode=2;
  }catch(e){console.error(`Invalid M143 capture: ${e.message}`);process.exitCode=2;}
}
