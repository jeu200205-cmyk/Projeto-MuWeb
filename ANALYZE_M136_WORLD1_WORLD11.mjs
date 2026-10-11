#!/usr/bin/env node
/**
 * MAPS_ENGINE M136 — read-only analysis of M69/M74/M75 + M136 transport
 * build timing and fail-closed owner counts. Physical capture is mandatory;
 * no synthetic or historical FIX80 sample is treated as an M136 FPS result.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeCapture,compareCaptures} from './ANALYZE_M133_WORLD1_WORLD11.mjs';
const number=(x)=>typeof x==='number'&&Number.isFinite(x)?x:null;
const delta=(a,b)=>a!==null&&b!==null?a-b:null;
function transportFor(stage) {
  const t=stage?.staticTransport || {};
  const wall=number(stage?.phasesMs?.staticBatch);
  const build=number(t.transportBuildMs);
  return {
    staticBatchWallMs:wall,transportBuildMs:build,
    multiDrawBuildMs:number(t.multiDrawBuildMs),cpuFallbackBuildMs:number(t.cpuFallbackBuildMs),
    transportSharePct:wall>0&&build!==null?100*build/wall:null,
    skippedUnsafeGeometry:number(t.skippedUnsafeGeometry),
    skippedCustomRenderOwner:number(t.skippedCustomRenderOwner),
    savedDraws:number(t.savedDraws),effectiveStaticDraws:number(t.effectiveStaticDraws),
  };
}
export function analyzeM136Capture(capture) {
  const base=analyzeCapture(capture);
  return { ...base, transportAttribution:Object.fromEntries([1,11].map(w=>[w,transportFor(base.worlds[w]?.stage)])),
    note:'Transport build is JS load wall time, not GPU upload time. Owner skips retain authored draws; they may increase draw calls versus unsafe merges. No FPS gain inferred.'};
}
export function compareM136Captures(before,after) {
  const base=compareCaptures(before,after);
  const a=analyzeM136Capture(before),b=analyzeM136Capture(after);
  const transportComparison={};
  for(const w of [1,11]) {
    const x=a.transportAttribution[w],y=b.transportAttribution[w];
    transportComparison[w]={
      buildMsDelta:delta(y.transportBuildMs,x.transportBuildMs),
      cpuFallbackMsDelta:delta(y.cpuFallbackBuildMs,x.cpuFallbackBuildMs),
      savedDrawsDelta:delta(y.savedDraws,x.savedDraws),
      effectiveStaticDrawsDelta:delta(y.effectiveStaticDraws,x.effectiveStaticDraws),
      keptUnsafeGeometryDelta:delta(y.skippedUnsafeGeometry,x.skippedUnsafeGeometry),
      keptCustomRenderOwnerDelta:delta(y.skippedCustomRenderOwner,x.skippedCustomRenderOwner),
    };
  }
  return {...base,transportAttribution:{before:a.transportAttribution,after:b.transportAttribution,delta:transportComparison}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))) {
  const args=process.argv.slice(2);
  const get=(name)=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
  const candidate=get('--candidate'),baseline=get('--baseline');
  if(!candidate){console.error('Usage: node ANALYZE_M136_WORLD1_WORLD11.mjs --candidate CAPTURE.json [--baseline BASE.json]');process.exit(2);}
  try {
    const after=JSON.parse(fs.readFileSync(candidate,'utf8'));
    const report=baseline?compareM136Captures(JSON.parse(fs.readFileSync(baseline,'utf8')),after):analyzeM136Capture(after);
    console.log(JSON.stringify(report,null,2));
    const complete=baseline?report.comparison.evidenceComplete:report.coverage.length===0;
    if(baseline&&report.comparison.parityFailures.length)process.exitCode=3;
    else if(!complete)process.exitCode=2;
  }catch(e){console.error(`Invalid physical capture: ${e.message}`);process.exitCode=2;}
}
