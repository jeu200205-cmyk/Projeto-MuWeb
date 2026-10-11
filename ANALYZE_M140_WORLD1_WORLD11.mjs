#!/usr/bin/env node
/** M140: compare measured World1/World11 physical captures with CPU bulk-copy
 * counters. These counters are NOT evidence of improved FPS/GPU upload.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeM139Capture,compareM139Captures} from './ANALYZE_M139_WORLD1_WORLD11.mjs';
const finite = x => typeof x === 'number' && Number.isFinite(x) ? x : null;
const delta = (a,b) => a === null || b === null ? null : b - a;
function bulk(stage) {
  const t = stage?.staticTransport || {};
  return {
    bulkMatrixCopies: finite(t.bulkMatrixCopies),
    bulkMatrixBytes: finite(t.bulkMatrixBytes),
    avoidedGetMatrixAtCalls: finite(t.avoidedGetMatrixAtCalls),
    cpuFallbackBuildMs: finite(t.cpuFallbackBuildMs),
    transportBuildMs: finite(t.transportBuildMs),
  };
}
export function analyzeM140Capture(capture) {
  const base = analyzeM139Capture(capture);
  return {...base, cpuMergeBulk: Object.fromEntries([1,11].map(w=>[w,bulk(base.worlds[w]?.stage)])),
    noteM140:'Bulk counters count committed CPU operations/bytes. They do not measure physical FPS, WebGL GPU uploads, visual parity or frame pacing.'};
}
export function compareM140Captures(before,after) {
  const base=compareM139Captures(before,after);
  const a=analyzeM140Capture(before), b=analyzeM140Capture(after);
  const changes={};
  for (const world of [1,11]) {
    changes[world]={};
    for (const key of Object.keys(a.cpuMergeBulk[world])) changes[world][key]=delta(a.cpuMergeBulk[world][key],b.cpuMergeBulk[world][key]);
  }
  return {...base,cpuMergeBulk:{before:a.cpuMergeBulk,after:b.cpuMergeBulk,delta:changes}};
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args=process.argv.slice(2),flag=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
  const candidate=flag('--candidate'),baseline=flag('--baseline');
  if (!candidate) {console.error('Usage: node ANALYZE_M140_WORLD1_WORLD11.mjs --candidate CAPTURE_M140.json [--baseline CAPTURE_M139.json]');process.exit(2);}
  try {
    const after=JSON.parse(fs.readFileSync(candidate,'utf8'));
    const report=baseline ? compareM140Captures(JSON.parse(fs.readFileSync(baseline,'utf8')),after) : analyzeM140Capture(after);
    console.log(JSON.stringify(report,null,2));
    if (baseline && report.comparison.parityFailures.length) process.exitCode=3;
    else if (baseline && !report.comparison.evidenceComplete) process.exitCode=2;
    else if (!baseline && report.coverage.length) process.exitCode=2;
  } catch (e) {console.error(`Invalid physical capture: ${e.message}`);process.exitCode=2;}
}
