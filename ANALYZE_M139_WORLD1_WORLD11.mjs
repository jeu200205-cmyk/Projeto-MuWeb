#!/usr/bin/env node
/** M139 physical capture extension: read-only CPU merge matrix allocation counters.
 * Never report these estimates as measured GPU upload, frame time or FPS.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeM138Capture,compareM138Captures} from './ANALYZE_M138_WORLD1_WORLD11.mjs';
const finite=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
const delta=(a,b)=>a===null||b===null?null:a-b;
function metrics(stage){const t=stage?.staticTransport||{};return {
  matrixPackedBins:finite(t.matrixPackedBins),
  avoidedMatrixObjects:finite(t.avoidedMatrixObjects),
  packedMatrixBytes:finite(t.packedMatrixBytes),
  cpuFallbackBuildMs:finite(t.cpuFallbackBuildMs),
  transportBuildMs:finite(t.transportBuildMs),
};}
export function analyzeM139Capture(capture){
  const base=analyzeM138Capture(capture);
  return {...base,cpuMergeMatrices:Object.fromEntries([1,11].map(w=>[w,metrics(base.worlds[w]?.stage)])),
    noteM139:'packedMatrixBytes and avoidedMatrixObjects are CPU allocation estimates, not physical GPU upload or measured FPS. Compare physical p50/p95/p99 separately.'};
}
export function compareM139Captures(before,after){
  const base=compareM138Captures(before,after);
  const a=analyzeM139Capture(before),b=analyzeM139Capture(after),differences={};
  for(const world of [1,11]){
    differences[world]={};
    for(const name of Object.keys(a.cpuMergeMatrices[world]))
      differences[world][name]=delta(b.cpuMergeMatrices[world][name],a.cpuMergeMatrices[world][name]);
  }
  return {...base,cpuMergeMatrices:{before:a.cpuMergeMatrices,after:b.cpuMergeMatrices,delta:differences}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))){
  const args=process.argv.slice(2),flag=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
  const candidate=flag('--candidate'),baseline=flag('--baseline');
  if(!candidate){console.error('Usage: node ANALYZE_M139_WORLD1_WORLD11.mjs --candidate CAPTURE.json [--baseline CAPTURE.json]');process.exit(2);}
  try{
    const after=JSON.parse(fs.readFileSync(candidate,'utf8'));
    const report=baseline?compareM139Captures(JSON.parse(fs.readFileSync(baseline,'utf8')),after):analyzeM139Capture(after);
    console.log(JSON.stringify(report,null,2));
    if(baseline&&report.comparison.parityFailures.length)process.exitCode=3;
    else if(baseline&&!report.comparison.evidenceComplete)process.exitCode=2;
    else if(!baseline&&report.coverage.length)process.exitCode=2;
  }catch(e){console.error(`Invalid physical capture: ${e.message}`);process.exitCode=2;}
}
