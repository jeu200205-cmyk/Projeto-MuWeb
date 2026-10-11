/*
 * MAPS_ENGINE M126 — optional, read-only DevTools physical capture helper.
 * Paste into browser DevTools BEFORE transitioning into World1 / World11.
 * No game objects, renderer settings, assets, scheduling or content are mutated.
 * To save: __MUWEB_MAPS_CAPTURE_M126__.download();
 * To finish: __MUWEB_MAPS_CAPTURE_M126__.stop();
 */
(() => {
  const previous = globalThis.__MUWEB_MAPS_CAPTURE_M126__;
  if (previous && typeof previous.stop === 'function') previous.stop();
  const startedAt = performance.now();
  const captures = [];
  const outerCaptures = [];
  const mapEntryCaptures = [];
  const frameDeltasMs = [];
  const longTasks = [];
  let lastFrame = null;
  let lastProfile = null;
  let lastOuterProfile = null;
  let lastMapEntryProfile = null;
  let active = true;
  let frameHandle = 0;
  let observer = null;
  const frameLimit = 12000; // bounded: at 60 FPS, ~200 seconds
  const longTaskLimit = 3000;
  const snapshot = () => {
    const p = globalThis.__MUWEB_MAP_OBJECT_STAGE_PROFILE__;
    if (p && p !== lastProfile) {
      lastProfile = p;
      if (p.world === 1 || p.world === 11) {
        captures.push({capturedAtMs: performance.now() - startedAt, profile: JSON.parse(JSON.stringify(p))});
        console.info(`[MAPS M126 CAPTURE] M75 World${p.world} #${captures.length} total=${Number(p.totalMs || 0).toFixed(1)}ms rendered=${p.rendered ?? 'n/a'} missing=${p.missing ?? 'n/a'}`);
      }
    }
    // M69 Scene.loadRealMap publishes on both initial entry and teleports,
    // unlike M74 GameApp._buildWorld which only covers initial world entry.
    const mapEntry = globalThis.__MUWEB_MAP_ENTRY_PROFILE__;
    if (mapEntry && mapEntry !== lastMapEntryProfile) {
      lastMapEntryProfile = mapEntry;
      if (mapEntry.worldNumber === 1 || mapEntry.worldNumber === 11) {
        mapEntryCaptures.push({capturedAtMs: performance.now() - startedAt, profile: JSON.parse(JSON.stringify(mapEntry))});
        console.info(`[MAPS M126 CAPTURE] M69 World${mapEntry.worldNumber} #${mapEntryCaptures.length} total=${Number(mapEntry.totalMs || 0).toFixed(1)}ms status=${mapEntry.status}`);
      }
    }
    const outer = globalThis.__MUWEB_WORLD_ENTRY_PROFILE__;
    if (outer && outer !== lastOuterProfile) {
      lastOuterProfile = outer;
      if (outer.world === 1 || outer.world === 11) {
        outerCaptures.push({capturedAtMs: performance.now() - startedAt, profile: JSON.parse(JSON.stringify(outer))});
        console.info(`[MAPS M126 CAPTURE] M74 World${outer.world} #${outerCaptures.length} entry=${Number(outer.totalMs || 0).toFixed(1)}ms`);
      }
    }
  };
  const tick = (ts) => {
    if (!active) return;
    if (lastFrame !== null && frameDeltasMs.length < frameLimit) {
      const dt = ts - lastFrame;
      if (Number.isFinite(dt) && dt >= 0 && dt < 1000) frameDeltasMs.push(dt);
    }
    lastFrame = ts;
    frameHandle = requestAnimationFrame(tick);
  };
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (longTasks.length >= longTaskLimit) break;
          if (entry.startTime < startedAt) continue;
          longTasks.push({startMs:entry.startTime - startedAt, durationMs:entry.duration});
        }
      });
      observer.observe({type:'longtask', buffered:true});
    } catch (_) { observer = null; }
  }
  const timer = setInterval(snapshot, 250);
  frameHandle = requestAnimationFrame(tick);
  const recorder = {
    stop() {
      if (!active) return;
      snapshot();
      active = false;
      clearInterval(timer);
      cancelAnimationFrame(frameHandle);
      try { observer?.disconnect(); } catch (_) {}
    },
    data() {
      if (active) snapshot();
      const sorted = [...frameDeltasMs].sort((a,b)=>a-b);
      const percentile = (p) => sorted.length ? sorted[Math.min(sorted.length-1, Math.floor((sorted.length-1)*p))] : null;
      return {
        format:'MUWEB_MAPS_ENGINE_M126_PHYSICAL_V1',
        note:'Frame deltas are whole-session, not per-world attribution; longtasks require browser support. Profile wall timers can include awaited work.',
        startedAtTimeOrigin:performance.timeOrigin || null,
        elapsedMs:performance.now()-startedAt,
        captures,
        outerCaptures,
        mapEntryCaptures,
        frameStats:{count:sorted.length, p50Ms:percentile(.50), p95Ms:percentile(.95), p99Ms:percentile(.99), maxMs:sorted.at(-1) ?? null},
        longTasks:[...longTasks],
      };
    },
    download() {
      const blob = new Blob([JSON.stringify(this.data(),null,2)],{type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href=url; a.download='MUWEB_M126_World1_World11_physical_capture.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    },
  };
  globalThis.__MUWEB_MAPS_CAPTURE_M126__ = recorder;
  console.info('[MAPS M126 CAPTURE] Recording. Enter World1 and World11; call __MUWEB_MAPS_CAPTURE_M126__.download() when finished.');
})();
