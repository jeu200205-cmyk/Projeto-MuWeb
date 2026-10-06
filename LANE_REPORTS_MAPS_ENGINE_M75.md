# MUWEB MAPS_ENGINE M75 SAFE — FROM FIX79

Parent exact: MUWEB_R90_FIX79_PROTOCOL_WIRE_INTEGRATED_2026-10-05_FULL.zip
Parent SHA-256: bcaae3278e3249e81d227e2dffda2184e2349d0ffba0437ef12ccff66cc287ef
Scope: maps/world/engine/performance only. No central promotion.

## Change
Adds structured object-staging telemetry to TerrainObjectWorld without changing rendering semantics. World1/World11 physical runs can now read `scene.userData.muMapObjectStageProfile` or `globalThis.__MUWEB_MAP_OBJECT_STAGE_PROFILE__` and separate: fetchParse, modelStage, templateProbe, staticBatch, placementBuild, finalize. Snapshot also records totalMs, placements/rendered/missing and the existing M68/M66 concurrency values.

No mesh, BMD, material, placement, terrain, particle, joint, effect, quality, staging concurrency or budget was changed. M74 outer profile and FIX76 PcJointPool remain untouched.

## Why
M74 identifies outer world-entry cost but could not distinguish BMD stage vs static batching vs per-placement fallback. This closes that measurement gap before changing performance-sensitive owners, preventing speculative quality reductions.

## Gates
- node --check world/TerrainObjectWorld.js: PASS
- test-maps-engine-m75-object-stage-profile.mjs: PASS
- test-maps-engine-m74-world-entry-profile.mjs: PASS
- package unzip -t: PASS

## Limitation / handoff
No physical browser capture was available inside this run, so no fabricated World1/World11 before/after FPS claim is made. Next physical capture should collect M74 + M75 snapshots on Lorencia and Icarus, then optimize the dominant measured phase while preserving all authored content.
