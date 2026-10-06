# MUWEB lane MAPS/ENGINE M61 from FIX60 — 2026-10-05

## Authority and non-overlap
Parent authority: `MUWEB_R90_FIX60_QUEST_PROTOCOLS_CAPE_POSITION_2026-10-05_FULL.zip`.
The concurrent ITEMS/LUA lane already published its own FIX61 candidate; this map lane does not touch wings, Lua item presentation, inventory, quest packets, cape position, or protocol code.

## Problem closed
The retained 25-Hz map owners bounded catch-up to eight authored ticks per render call, but left the remaining accumulator backlog intact. After browser suspension, a long GC, debugger stop, tab throttling, or a large frame hitch, every following frame could execute another eight old map ticks until seconds of backlog were replayed. That creates a self-sustaining CPU/update hitch precisely in the Icarus/Lorencia environment owners.

Main 5.2 drives these owners from its live update/render cadence; missed wall-clock time is not replayed as a backlog of historical `MoveHeavenRain`, leaf, bird or fish calls. The Web fixed-step adapter must therefore preserve the 25-Hz authored step while bounding stale catch-up.

## Changes
Touched only:
- `world/PcIcarusEnvironment.js`
- `world/PcLorenciaEnvironment.js`
- `world/PcLorenciaFauna.js`
- `world/PcLorenciaFish.js`
- new `test-fix61-map-backlog.mjs`

Each owner still executes at most eight 40-ms authored ticks in one update. If at least one full 40-ms step remains afterward, complete stale steps are discarded and only the sub-tick remainder is retained. `group.userData.muPcDroppedBacklogTicks` records exactly how many stale ticks were discarded for physical diagnostics.

No particle count, texture, model, map object, weather child, random domain, movement equation, 25-Hz tick duration, render quality, terrain mesh policy, BMD, camera, or authored effect was removed or reduced.

## Deterministic load bound
Before: a 10.0 s accumulated stall contains 250 map ticks. With an 8-tick/frame guard but no backlog discard it can require ceil(250/8)=32 subsequent render frames to drain the old simulation work.
After: the first resumed frame runs at most 8 authored ticks and discards the remaining complete stale ticks, retaining <40 ms remainder. Subsequent frames return immediately to live cadence.

This is a CPU/update-work bound, not a claimed device FPS measurement.

## Validation
- `node test-fix61-map-backlog.mjs`: PASS for all four owners.
- `node --check` on all four modified runtime files: PASS.
- Patch is against exact FIX60 parent bytes.
- Physical browser/device FPS and final visual acceptance remain required; no such validation is claimed here.

## Handoff
Integrate semantically onto the newest central authority after checking whether another lane has promoted beyond FIX60. Keep the ITEMS/LUA FIX61 candidate independent; do not whole-tree overwrite it. Next map tranche should use physical logs/screenshots to target remaining Icarus/Lorencia visual mismatches, especially missing-model diagnostics and transition timings, rather than guessing geometry or hiding meshes.
