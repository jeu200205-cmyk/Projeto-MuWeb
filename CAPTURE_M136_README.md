# M136 World1 / World11 physical verification

Use only the authorized `C:\clientepromax\Nova pasta\MuPromax 1.0.1\Data` on Windows, with the project's required strict verify-only/regeneration passing. Do not substitute another client's Data or treat the FIX136 development checkpoint as promoted.

For **both** M135 baseline and M136 candidate, at identical camera positions/resolution/browser/player density, paste `CAPTURE_M130_WORLD1_WORLD11.js` into DevTools **before** loading World1 and World11. Capture cold entry, warm revisit, stable camera still, camera movement, and map transitions. During a stable interval, call `__MUWEB_MAPS_CAPTURE_M130__.snapshotDrawOwners()` only **outside** the timed frame window. Save with `__MUWEB_MAPS_CAPTURE_M130__.download()` and stop with `.stop()`.

Compare:

```bash
node ANALYZE_M136_WORLD1_WORLD11.mjs --baseline M135_CAPTURE.json --candidate M136_CAPTURE.json
```

Inspect M75 stage counts (`placements`, `rendered`, `missing`), M69/M74 map entry, `staticTransport.transportBuildMs`, `multiDrawBuildMs`, `cpuFallbackBuildMs`, `skippedUnsafeGeometry`, `skippedCustomRenderOwner`, draw-call P50/P95 and frame P95/P99. A positive retained-owner count means a former unsafe merge was rejected; it does **not** mean content was removed. Investigate any draw-call increase against actual BMD groups/drawRange and materials before changing grouping rules. Validate Lorencia bridge/terrain/BodyLight and Icarus clouds/placements visually against the authorized PC Data; these are still open.

The comparator exits nonzero for missing evidence or placement parity divergence. RAF frame time is not GPU execution time. Do not claim FPS improvement or complete visual parity without physical A/B and pixel/placement checks.
