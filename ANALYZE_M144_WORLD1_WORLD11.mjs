#!/usr/bin/env node
/** M144: correlate M127 teardown with M144 independent release failures.
 * Synthetic fixtures never count as physical World1/World11 WebGL evidence.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeM143Capture,compareM143Captures} from './ANALYZE_M143_WORLD1_WORLD11.mjs';
const integer=x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0?x:null;
const KEYS=['detachFailures','disposeFailures','sceneDetachFailures','rootClearFailures'];
export function analyzeM144Capture(c){
  const base=analyzeM143Capture(c);
  const perWorld={},missingReleaseWorlds=[],failureWarnings=[];
  for(const world of [1,11]){
    const captures=(c?.m144ReleaseCaptures||[]).filter(x=>x?.profile?.version==='M144'&&x.profile.world===world);
    const p=captures.at(-1)?.profile;
    if(!p){missingReleaseWorlds.push(world);perWorld[world]=null;continue;}
    const stats=Object.fromEntries(KEYS.map(k=>[k,integer(p[k])]));
    stats.slots=integer(p.slots);
    perWorld[world]=stats;
    for(const key of KEYS){
      if(stats[key]===null)failureWarnings.push(`World${world} invalid or missing ${key}`);
      else if(stats[key]>0)failureWarnings.push(`World${world} ${key}=${stats[key]}`);
    }
  }
  return {...base,m144Release:{perWorld,missingReleaseWorlds,failureWarnings,
    evidenceComplete:missingReleaseWorlds.length===0&&failureWarnings.length===0,
    note:'M144 counters are physical only if sourced from a real browser using the authorized MuPromax 1.0.1 Data. A zero-failure sample is not proof of FPS improvement or complete visual parity.'}};
}
export function compareM144Captures(before,after){
  const base=compareM143Captures(before,after),candidate=analyzeM144Capture(after);
  return {...base,m144Release:candidate.m144Release,
    m144EvidenceComplete:base.comparison.evidenceComplete&&candidate.m144Release.evidenceComplete&&
      base.comparison.parityFailures.length===0&&base.terrainTiles.parityFailures.length===0&&base.transportParityFailures.length===0,
    noteM144:'A/B requires matching official Data, World1/World11 M69/M74/M75, 150+ stable frames, zero content/terrain parity regressions, no release errors, and independent screenshots of Lorencia/Icarus.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))){
  const args=process.argv.slice(2),flag=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:null;};
  const candidate=flag('--candidate'),baseline=flag('--baseline');
  if(!candidate){console.error('Usage: node ANALYZE_M144_WORLD1_WORLD11.mjs --candidate M144.json [--baseline M143.json]');process.exit(2);}
  try{
    const after=JSON.parse(fs.readFileSync(candidate,'utf8'));
    const report=baseline?compareM144Captures(JSON.parse(fs.readFileSync(baseline,'utf8')),after):analyzeM144Capture(after);
    console.log(JSON.stringify(report,null,2));
    if(report.m144Release.failureWarnings.length||(baseline&&(report.comparison.parityFailures.length||report.terrainTiles.parityFailures.length||report.transportParityFailures.length)))process.exitCode=3;
    else if(!report.m144Release.evidenceComplete||(baseline&&!report.m144EvidenceComplete)||(!baseline&&report.coverage.length))process.exitCode=2;
  }catch(e){console.error(`Invalid M144 capture: ${e.message}`);process.exitCode=2;}
}
