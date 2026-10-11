#!/usr/bin/env node
/**
 * MAPS_ENGINE M138: read-only M74/M75 physical World1/World11 A/B.
 * M138 estimates removed synthetic color-buffer bytes and Color allocations for the CPU fallback;
 * never infer actual WebGL upload time or FPS from this estimate.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeM137Capture,compareM137Captures} from './ANALYZE_M137_WORLD1_WORLD11.mjs';
const finite=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
const delta=(a,b)=>a===null||b===null?null:a-b;
const metrics=(stage)=>{
  const t=stage?.staticTransport||{};
  return {
    mode:typeof t.mode==='string'?t.mode:null,
    uncoloredMergedBins:finite(t.uncoloredMergedBins),
    coloredMergedBins:finite(t.coloredMergedBins),
    avoidedSyntheticColorBytes:finite(t.avoidedColorUploadBytes),
    avoidedColorObjects:finite(t.avoidedColorObjects),
    savedDraws:finite(t.savedDraws),
    effectiveStaticDraws:finite(t.effectiveStaticDraws),
  };
};
export function analyzeM138Capture(capture){
  const base=analyzeM137Capture(capture);
  return {...base,cpuMergeColor:Object.fromEntries([1,11].map(w=>[w,metrics(base.worlds[w]?.stage)])),
    noteM138:'avoidedSyntheticColorBytes and avoidedColorObjects are estimated avoided allocations relative to the old per-placement Color/white-color expansion; it is not a GPU timer or physical FPS result.'};
}
export function compareM138Captures(before,after){
  const base=compareM137Captures(before,after);
  const a=analyzeM138Capture(before),b=analyzeM138Capture(after);
  const differences={};
  for(const world of [1,11]){
    differences[world]={};
    for(const name of ['uncoloredMergedBins','coloredMergedBins','avoidedSyntheticColorBytes','avoidedColorObjects','savedDraws','effectiveStaticDraws'])
      differences[world][name]=delta(b.cpuMergeColor[world][name],a.cpuMergeColor[world][name]);
  }
  return {...base,cpuMergeColor:{before:a.cpuMergeColor,after:b.cpuMergeColor,delta:differences}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))){
  const args=process.argv.slice(2);
  const arg=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
  const candidate=arg('--candidate'),baseline=arg('--baseline');
  if(!candidate){console.error('Usage: node ANALYZE_M138_WORLD1_WORLD11.mjs --candidate CAPTURE.json [--baseline CAPTURE.json]');process.exit(2);}
  try{
    const after=JSON.parse(fs.readFileSync(candidate,'utf8'));
    const report=baseline?compareM138Captures(JSON.parse(fs.readFileSync(baseline,'utf8')),after):analyzeM138Capture(after);
    console.log(JSON.stringify(report,null,2));
    if(baseline&&report.comparison.parityFailures.length)process.exitCode=3;
    else if(baseline&&!report.comparison.evidenceComplete)process.exitCode=2;
    else if(!baseline&&report.coverage.length)process.exitCode=2;
  }catch(e){console.error(`Invalid physical capture: ${e.message}`);process.exitCode=2;}
}
