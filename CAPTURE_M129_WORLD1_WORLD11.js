/*
 * MAPS_ENGINE M129 — optional, read-only DevTools physical capture helper.
 * Paste into browser DevTools BEFORE transitioning into World1 / World11.
 * No game objects, renderer settings, assets, scheduling or content are mutated.
 * M129 adds per-world stable-frame pacing and approximate renderer.info.render.calls samples; keeps M69/M74/M75/M127 capture.
 * To save: __MUWEB_MAPS_CAPTURE_M129__.download();
 * To finish: __MUWEB_MAPS_CAPTURE_M129__.stop();
 */
(() => {
  const previous = globalThis.__MUWEB_MAPS_CAPTURE_M129__;
  if (previous && typeof previous.stop === 'function') previous.stop();
  // Avoid simultaneous RAF sampling from the earlier read-only recorder.
  globalThis.__MUWEB_MAPS_CAPTURE_M127__?.stop?.();
  const startedAt = performance.now();
  const captures = [];
  const outerCaptures = [];
  const mapEntryCaptures = [];
  const disposeCaptures = [];
  const frameDeltasMs = [];
  const worldSamples = {1: [], 11: []};
  let lastStableWorld = null;
  const longTasks = [];
  let lastFrame = null;
  let lastProfile = null;
  let lastOuterProfile = null;
  let lastMapEntryProfile = null;
  let lastDisposeProfile = null;
  let active = true;
  let frameHandle = 0;
  let observer = null;
  const frameLimit = 12000; // bounded: at 60 FPS, ~200 seconds
  const longTaskLimit = 3000;
  // Only attribute a frame to World1/World11 after terrain AND objects of the
  // same generation have been committed. Transition/loading frames remain in
  // the global timeline, never silently assigned to the departing map.
  const stableWorld = () => {
    const scene = globalThis.app?.scene;
    const world = Number(scene?.mapIndex);
    if ((world !== 1 && world !== 11) || scene?.cameraMode !== 'game') return null;
    if (scene?.worldObjectLayer?.worldNum !== world) return null;
    if (typeof scene.hasStableRealMap !== 'function' || !scene.hasStableRealMap(world)) return null;
    return world;
  };
  const snapshot = () => {
    const p = globalThis.__MUWEB_MAP_OBJECT_STAGE_PROFILE__;
    if (p && p !== lastProfile) {
      lastProfile = p;
      if (p.world === 1 || p.world === 11) {
        captures.push({capturedAtMs: performance.now() - startedAt, profile: JSON.parse(JSON.stringify(p))});
        console.info(`[MAPS M129 CAPTURE] M75 World${p.world} #${captures.length} total=${Number(p.totalMs || 0).toFixed(1)}ms rendered=${p.rendered ?? 'n/a'} missing=${p.missing ?? 'n/a'}`);
      }
    }
    // M127 map-layer disposal measures old-world retirement during transitions.
    // This is distinct from M69/M74/M75 entry and contains no GPU timing.
    const disposed = globalThis.__MUWEB_MAP_DISPOSE_PROFILE__;
    if (disposed && disposed !== lastDisposeProfile) {
      lastDisposeProfile = disposed;
      if (disposed.world === 1 || disposed.world === 11) {
        disposeCaptures.push({capturedAtMs:performance.now() - startedAt, profile:JSON.parse(JSON.stringify(disposed))});
        console.info(`[MAPS M129 CAPTURE] dispose World${disposed.world} total=${Number(disposed.totalMs || 0).toFixed(1)}ms`);
      }
    }
    // M69 Scene.loadRealMap publishes on both initial entry and teleports,
    // unlike M74 GameApp._buildWorld which only covers initial world entry.
    const mapEntry = globalThis.__MUWEB_MAP_ENTRY_PROFILE__;
    if (mapEntry && mapEntry !== lastMapEntryProfile) {
      lastMapEntryProfile = mapEntry;
      if (mapEntry.worldNumber === 1 || mapEntry.worldNumber === 11) {
        mapEntryCaptures.push({capturedAtMs: performance.now() - startedAt, profile: JSON.parse(JSON.stringify(mapEntry))});
        console.info(`[MAPS M129 CAPTURE] M69 World${mapEntry.worldNumber} #${mapEntryCaptures.length} total=${Number(mapEntry.totalMs || 0).toFixed(1)}ms status=${mapEntry.status}`);
      }
    }
    const outer = globalThis.__MUWEB_WORLD_ENTRY_PROFILE__;
    if (outer && outer !== lastOuterProfile) {
      lastOuterProfile = outer;
      if (outer.world === 1 || outer.world === 11) {
        outerCaptures.push({capturedAtMs: performance.now() - startedAt, profile: JSON.parse(JSON.stringify(outer))});
        console.info(`[MAPS M129 CAPTURE] M74 World${outer.world} #${outerCaptures.length} entry=${Number(outer.totalMs || 0).toFixed(1)}ms`);
      }
    }
  };
  const tick = (ts) => {
    if (!active) return;
    if (lastFrame !== null && frameDeltasMs.length < frameLimit) {
      const dt = ts - lastFrame;
      if (Number.isFinite(dt) && dt >= 0 && dt < 1000) frameDeltasMs.push(dt);
    }
    const world = stableWorld();
    if (world && world === lastStableWorld && lastFrame !== null && worldSamples[world].length < frameLimit) {
      const dt = ts - lastFrame;
      if (Number.isFinite(dt) && dt >= 0 && dt < 1000) {
        // RAF ordering may sample the preceding render; draw calls are a
        // steady-state diagnostic, NOT a GPU timing or exact owner attribution.
        const calls = Number(globalThis.app?.scene?.renderer?.info?.render?.calls);
        worldSamples[world].push({tMs: ts - startedAt, dtMs: dt,
          drawCalls: Number.isFinite(calls) && calls >= 0 ? calls : null});
      }
    }
    lastStableWorld = world;
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
      const stats = (values) => {
        const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
        const at = (p) => sorted.length ? sorted[Math.floor((sorted.length-1)*p)] : null;
        return {count:sorted.length,p50:at(.50),p95:at(.95),p99:at(.99),max:sorted.at(-1) ?? null};
      };
      const worldStats = Object.fromEntries([1,11].map(world => [world, {
        frameMs: stats(worldSamples[world].map(s=>s.dtMs)),
        drawCalls: stats(worldSamples[world].map(s=>s.drawCalls).filter(x=>x!==null && x>0)),
      }]));
      return {
        format:'MUWEB_MAPS_ENGINE_M129_PHYSICAL_V1',
        note:'Global frame deltas include transitions. Per-world samples require a stable committed map and exclude the first frame after any world change. Draw calls are read-only renderer.info samples (RAF ordering may lag a frame), not GPU time or per-owner attribution. Long tasks are session-wide; profile wall timers can include awaits.',
        startedAtTimeOrigin:performance.timeOrigin || null,
        elapsedMs:performance.now()-startedAt,
        captures,
        outerCaptures,
        mapEntryCaptures,
        disposeCaptures,
        frameStats:{count:sorted.length, p50Ms:percentile(.50), p95Ms:percentile(.95), p99Ms:percentile(.99), maxMs:sorted.at(-1) ?? null},
        worldStats,
        worldSamples:{1:[...worldSamples[1]],11:[...worldSamples[11]]},
        longTasks:[...longTasks],
      };
    },
    download() {
      const blob = new Blob([JSON.stringify(this.data(),null,2)],{type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href=url; a.download='MUWEB_M129_World1_World11_physical_capture.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    },
  };
  globalThis.__MUWEB_MAPS_CAPTURE_M129__ = recorder;
  console.info('[MAPS M129 CAPTURE] Recording. Enter World1 and World11; call __MUWEB_MAPS_CAPTURE_M129__.download() when finished.');
})();
