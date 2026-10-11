#!/usr/bin/env node
/**
 * MAPS_ENGINE M133 — offline, read-only M69/M74/M75 physical capture comparator.
 * Does not alter runtime, render policy, content or the official Data authority.
 * Accepts JSON produced by CAPTURE_M130_WORLD1_WORLD11.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const WORLDS = [1, 11];
const PHASES = ['fetchParse', 'modelStage', 'templateProbe', 'staticBatch', 'placementBuild', 'finalize'];
const finite = (x) => typeof x === 'number' && Number.isFinite(x) ? x : null;
const lastFor = (items, field, world) => [...(items || [])].reverse().find(x => Number(x?.profile?.[field]) === world)?.profile || null;
const percentage = (part, total) => finite(part) !== null && finite(total) !== null && total > 0 ? 100 * part / total : null;
const diff = (candidate, baseline) => finite(candidate) !== null && finite(baseline) !== null ? candidate - baseline : null;

export function analyzeCapture(capture, label = 'capture') {
  const worlds = {};
  const coverage = [];
  const warnings = [];
  for (const world of WORLDS) {
    const stage = lastFor(capture?.captures, 'world', world);
    const outer = lastFor(capture?.outerCaptures, 'world', world);
    const entry = lastFor(capture?.mapEntryCaptures, 'worldNumber', world);
    const steady = capture?.worldStats?.[world] || null;
    const phasePairs = PHASES.map(name => [name, finite(stage?.phases?.[name])]);
    const measured = phasePairs.filter(([, ms]) => ms !== null);
    const dominant = measured.length ? measured.reduce((best, cur) => cur[1] > best[1] ? cur : best) : null;
    const phaseSum = measured.reduce((sum, [, ms]) => sum + ms, 0);
    const frames = Number(steady?.frameMs?.count) || 0;
    const draws = Number(steady?.drawCalls?.count) || 0;
    if (!stage) coverage.push(`World${world}: M75 object-stage absent`);
    // M74 _buildWorld is an initial-entry owner, not guaranteed on teleports.
    // M69 covers both initial entries and map transitions. Missing M74 is a
    // documented limitation, not fabricated evidence of a broken capture.
    if (!outer) warnings.push(`World${world}: M74 initial-entry absent (may be normal for teleport; use M69)`);
    if (!entry) coverage.push(`World${world}: M69 map-entry absent`);
    if (frames < 120 || draws < 120) coverage.push(`World${world}: stable frame/draw samples <120 (frames=${frames}, draws=${draws})`);
    worlds[world] = {
      stage: stage ? {totalMs:finite(stage.totalMs), placements:stage.placements ?? null,
        rendered:stage.rendered ?? null, missing:stage.missing ?? null,
        phasesMs:Object.fromEntries(phasePairs), dominant:dominant ? {name:dominant[0],ms:dominant[1],sharePct:percentage(dominant[1],phaseSum)} : null,
        placementBreakdown:stage.placementBreakdown || null,
        staticTransport:stage.staticTransport || null} : null,
      outerEntryMs:finite(outer?.totalMs), mapEntryMs:finite(entry?.totalMs),
      steady:steady ? {frameP50Ms:finite(steady.frameMs?.p50),frameP95Ms:finite(steady.frameMs?.p95),
        frameP99Ms:finite(steady.frameMs?.p99),drawCallsP50:finite(steady.drawCalls?.p50),
        drawCallsP95:finite(steady.drawCalls?.p95),frames,draws} : null,
    };
  }
  return {label, format:capture?.format || 'unknown', coverage, warnings, worlds};
}

export function compareCaptures(baseline, candidate) {
  const before = analyzeCapture(baseline, 'baseline');
  const after = analyzeCapture(candidate, 'candidate');
  const worlds = {};
  const parityFailures = [];
  for (const world of WORLDS) {
    const a=before.worlds[world], b=after.worlds[world];
    for (const key of ['placements','rendered','missing']) {
      const old=a.stage?.[key], now=b.stage?.[key];
      if (old !== null && old !== undefined && now !== null && now !== undefined && old !== now)
        parityFailures.push(`World${world} ${key}: ${old} -> ${now}`);
    }
    worlds[world] = {
      dominantBefore:a.stage?.dominant || null,dominantAfter:b.stage?.dominant || null,
      objectStageMsDelta:diff(b.stage?.totalMs,a.stage?.totalMs),
      outerEntryMsDelta:diff(b.outerEntryMs,a.outerEntryMs),
      mapEntryMsDelta:diff(b.mapEntryMs,a.mapEntryMs),
      frameP95MsDelta:diff(b.steady?.frameP95Ms,a.steady?.frameP95Ms),
      drawCallsP50Delta:diff(b.steady?.drawCallsP50,a.steady?.drawCallsP50),
      placementParity:a.stage && b.stage ? ['placements','rendered','missing'].every(k=>a.stage[k]===b.stage[k]) : null,
    };
  }
  return {baseline:before,candidate:after,comparison:{worlds,parityFailures,
    evidenceComplete:before.coverage.length===0 && after.coverage.length===0,
    caveat:'Physical A/B must use identical Data, camera route, resolution, browser, device and player/FX load. M75 wall time includes asynchronous waits; RAF frame deltas and renderer.info calls are not GPU timer queries. Missing captures never prove an FPS gain.'}};
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args=process.argv.slice(2);
  const flag=(key)=>{const i=args.indexOf(key);return i>=0?args[i+1]:null;};
  const base=flag('--baseline'), candidate=flag('--candidate');
  if (!candidate) {console.error('Usage: node ANALYZE_M133_WORLD1_WORLD11.mjs --candidate CAPTURE.json [--baseline PREVIOUS_CAPTURE.json]');process.exit(2);}
  try {
    const after=JSON.parse(fs.readFileSync(candidate,'utf8'));
    const report=base ? compareCaptures(JSON.parse(fs.readFileSync(base,'utf8')),after) : analyzeCapture(after);
    console.log(JSON.stringify(report,null,2));
    if (base && report.comparison.parityFailures.length) process.exitCode=3;
    else if (base && !report.comparison.evidenceComplete) process.exitCode=2;
    else if (!base && report.coverage.length) process.exitCode=2;
  } catch(e) {console.error(`Invalid capture: ${e.message}`);process.exitCode=2;}
}
