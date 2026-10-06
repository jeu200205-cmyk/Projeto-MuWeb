import fs from 'node:fs'; import assert from 'node:assert/strict';
const s=fs.readFileSync(new URL('./core/GameApp.js',import.meta.url),'utf8');
for(const x of ["version: 'M74'","__MUWEB_WORLD_ENTRY_PROFILE__","muWorldEntryProfile","objectsReadyBeforeReveal","loadRealMapMs: _tMapMs","sceneMapEntry:","gpuWarmup: Object.freeze","phases: Object.freeze"]){assert.ok(s.includes(x),`missing ${x}`)}
assert.ok(s.includes("waitWorldObjectsReady?.(realMapIndex, 1500)"));
assert.ok(s.includes("warmupCurrentScene?.()"));
console.log('PASS M74 structured outer world-entry profile; visual/load semantics unchanged');
