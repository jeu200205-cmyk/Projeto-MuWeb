#!/usr/bin/env node
/** M142: M74/M75 physical World1/World11 comparison for template fallback
 * eligibility scans and native terrain RGB scratch requests. No FPS inference
 * from these counters. No synthetic capture is physical evidence.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeM141Capture,compareM141Captures} from './ANALYZE_M141_WORLD1_WORLD11.mjs';
const finite=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
const delta=(a,b)=>a===null||b===null?null:b-a;
const stage=(c,w)=>[...(c?.captures||[])].reverse().find(x=>Number(x?.profile?.world)===w)?.profile||null;
function metrics(p){
  const clone=p?.templateCloneScan||{},batch=p?.staticBatchBreakdown||{},audit=p?.serialAuditScan||{};
  return {
    auditVisitedSlots:finite(audit.visitedSlots),
    auditSerials:finite(audit.auditedSerials),
    auditAvoidedRepeatedSlotVisits:finite(audit.avoidedRepeatedSlotVisits),
    sourceListsBuilt:finite(clone.sourceListsBuilt),
    sourceListHits:finite(clone.sourceListHits),
    clonedChildren:finite(clone.clonedChildren),
    avoidedChildEligibilityScans:finite(clone.avoidedChildEligibilityScans),
    reusableTerrainRgbSamples:finite(batch.reusableTerrainRgbSamples),
    directTerrainColorWrites:finite(batch.directTerrainColorWrites),
    placementBuildMs:finite(p?.phases?.placementBuild),
    staticBatchMs:finite(p?.phases?.staticBatch),
    totalMs:finite(p?.totalMs),
  };
}
function tileAudit(p){
  const audit=p?.terrainTileAudit;
  return {available:typeof audit?.available==='boolean'?audit.available:null,
    missingSlots:Array.isArray(audit?.missingSlots)?audit.missingSlots.slice():null};
}
export function analyzeM142Capture(c){
  const base=analyzeM141Capture(c);
  return {...base,m142Cpu:Object.fromEntries([1,11].map(w=>[w,metrics(stage(c,w))])),
    terrainTiles:Object.fromEntries([1,11].map(w=>[w,tileAudit(stage(c,w))])),
    noteM142:'Counters describe CPU scan reuse (including FIX42 serial audit) and calls with a reusable output buffer; custom terrain samplers may ignore it. Require official Data, same browser/GPU/scene, complete M69/M74/M75 and stable frames for physical A/B.'};
}
export function compareM142Captures(before,after){
  const base=compareM141Captures(before,after),a=analyzeM142Capture(before),b=analyzeM142Capture(after),changes={};
  for(const w of [1,11]){
    changes[w]={};
    for(const k of Object.keys(a.m142Cpu[w]))changes[w][k]=delta(a.m142Cpu[w][k],b.m142Cpu[w][k]);
  }
  const terrainParityFailures=[];
  for(const w of [1,11]){
    const old=a.terrainTiles[w],now=b.terrainTiles[w];
    if(old.available===true&&now.available===true&&
       JSON.stringify(old.missingSlots)!==JSON.stringify(now.missingSlots))
      terrainParityFailures.push(`World${w} terrain missingSlots ${JSON.stringify(old.missingSlots)} -> ${JSON.stringify(now.missingSlots)}`);
  }
  return {...base,m142Cpu:{before:a.m142Cpu,after:b.m142Cpu,delta:changes},
    terrainTiles:{before:a.terrainTiles,after:b.terrainTiles,parityFailures:terrainParityFailures},
    noteM142:'evidenceComplete=true and zero parityFailures are required, but screenshots and the official physical Data are independently required for visual/terrain claims. Missing metrics remain null.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))){
  const args=process.argv.slice(2),flag=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null;};
  const candidate=flag('--candidate'),baseline=flag('--baseline');
  if(!candidate){console.error('Usage: node ANALYZE_M142_WORLD1_WORLD11.mjs --candidate M142.json [--baseline M141.json]');process.exit(2);}
  try{
    const after=JSON.parse(fs.readFileSync(candidate,'utf8'));
    const report=baseline?compareM142Captures(JSON.parse(fs.readFileSync(baseline,'utf8')),after):analyzeM142Capture(after);
    console.log(JSON.stringify(report,null,2));
    if(baseline&&(report.comparison.parityFailures.length||report.terrainTiles.parityFailures.length))process.exitCode=3;
    else if(baseline&&!report.comparison.evidenceComplete)process.exitCode=2;
    else if(!baseline&&report.coverage.length)process.exitCode=2;
  }catch(e){console.error(`Invalid M142 capture: ${e.message}`);process.exitCode=2;}
}
