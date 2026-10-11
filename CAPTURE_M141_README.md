# M141 physical capture World1 / World11

This is a **procedure**, not a completed physical capture. Official Windows Data is `C:\clientepromax\Nova pasta\MuPromax 1.0.1\Data` (do not use another client). Capture M140 baseline and M141 candidate with identical browser/GPU, DPR/resolution, camera route, player and FX.

Before entering each world, run `CAPTURE_M130_WORLD1_WORLD11.js` in DevTools; capture cold and warm World1/World11, >=150 stable frames each, map transitions, `snapshotDrawOwners()`, then `__MUWEB_MAPS_CAPTURE_M130__.download()`. For both versions, collect M69/M74/M75, M127 disposal, renderer draw calls, p50/p95/p99 frames, placements/rendered/missing and map screenshots.

Run:

```bash
node ANALYZE_M141_WORLD1_WORLD11.mjs --baseline M140_World1_World11.json --candidate M141_World1_World11.json > M141_WORLD_AB.json
```

Reject visual/placement regressions; `comparison.evidenceComplete=true` and `comparison.parityFailures=[]` are required. `rotationMruHits`, `rotationMruMisses`, `avoidedBoundsRecomputes` and `avoidedBoundsVertexVisits` are CPU counters only; missing older metrics are null, not zero. `renderer.info.render.calls` is not GPU timing. If the official Windows Data/WebGL capture is unavailable, leave FPS and visual parity **unverified**.
