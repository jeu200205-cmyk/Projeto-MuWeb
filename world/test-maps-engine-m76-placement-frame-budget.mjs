import fs from 'node:fs'; import assert from 'node:assert/strict';
const s=fs.readFileSync(new URL('./TerrainObjectWorld.js', import.meta.url),'utf8');
assert.ok(s.includes("version: 'M75'"), 'M75 profile must remain integrated');
assert.ok(s.includes('const checkpoint = createCooperativeLoadBudget({ budgetMs: cooperativeSliceMs || 8 })'), 'shared cooperative budget regressed');
assert.ok(s.includes('if (cooperativeSliceMs > 0 || (index & 7) === 0) await cooperate();'), 'M76 per-placement active-transition checkpoint missing');
assert.ok(s.includes('placementBuildConcurrency = logicalCores >= 12 ? 6 : logicalCores >= 8 ? 5 : 4'), 'M66 concurrency changed');
console.log('PASS M76 active-transition per-placement cooperative budget');
