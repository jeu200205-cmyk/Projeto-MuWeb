#!/usr/bin/env node
/**
 * MAPS_ENGINE M137: read-only World1/World11 physical A/B for authored
 * template-fusion and vertex-color safety gates. Extends M136; does not
 * fabricate FPS evidence when capture coverage is incomplete.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeM136Capture, compareM136Captures} from './ANALYZE_M136_WORLD1_WORLD11.mjs';
const finite=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
const diff=(after,before)=>after===null||before===null?null:after-before;
function counters(stage) {
  const t=stage?.staticTransport || {};
  return {
    skippedUnsafeTemplateFusionGroups:finite(t.skippedUnsafeTemplateFusionGroups),
    skippedAuthoredVertexColor:finite(t.skippedAuthoredVertexColor),
    skippedOrderDependentMaterial:finite(t.skippedOrderDependentMaterial),
    skippedUnsafeGeometry:finite(t.skippedUnsafeGeometry),
    skippedCustomRenderOwner:finite(t.skippedCustomRenderOwner),
    savedDraws:finite(t.savedDraws),
  };
}
export function analyzeM137Capture(capture) {
  const base=analyzeM136Capture(capture);
  return {...base, contentSafety:Object.fromEntries([1,11].map(w=>[w,counters(base.worlds[w]?.stage)])),
    templateFusionKeptByObject:Object.fromEntries([1,11].map(w=>[w,
      Array.isArray(base.worlds[w]?.stage?.staticTransport?.skippedTemplateFusionByObject)
        ? base.worlds[w].stage.staticTransport.skippedTemplateFusionByObject : null])),
    noteM137:'Counters describe preserved authored BMD/placement presentation; they are not missing objects. More retained source draws may lower FPS. A browser A/B is required.'};
}
export function compareM137Captures(before,after) {
  const base=compareM136Captures(before,after);
  const a=analyzeM137Capture(before),b=analyzeM137Capture(after);
  const changes={};
  for(const world of [1,11]) {
    changes[world]={};
    for(const name of Object.keys(a.contentSafety[world]))
      changes[world][name]=diff(b.contentSafety[world][name],a.contentSafety[world][name]);
  }
  return {...base,contentSafety:{before:a.contentSafety,after:b.contentSafety,delta:changes}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))) {
  const args=process.argv.slice(2);
  const flag=(name)=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
  const candidate=flag('--candidate'),baseline=flag('--baseline');
  if(!candidate){console.error('Usage: node ANALYZE_M137_WORLD1_WORLD11.mjs --candidate CAPTURE.json [--baseline CAPTURE.json]');process.exit(2);}
  try {
    const after=JSON.parse(fs.readFileSync(candidate,'utf8'));
    const report=baseline?compareM137Captures(JSON.parse(fs.readFileSync(baseline,'utf8')),after):analyzeM137Capture(after);
    console.log(JSON.stringify(report,null,2));
    if(baseline&&report.comparison.parityFailures.length)process.exitCode=3;
    else if(baseline&&!report.comparison.evidenceComplete)process.exitCode=2;
    else if(!baseline&&report.coverage.length)process.exitCode=2;
  } catch(e){console.error(`Invalid physical capture: ${e.message}`);process.exitCode=2;}
}
