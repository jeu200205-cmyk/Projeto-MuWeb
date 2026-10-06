import fs from 'node:fs'; import assert from 'node:assert/strict';
const s=fs.readFileSync(new URL('./world/TerrainObjectWorld.js', import.meta.url),'utf8');
for(const x of ["version: 'M75'","fetchParse","modelStage","templateProbe","staticBatch","placementBuild","finalize","muMapObjectStageProfile","__MUWEB_MAP_OBJECT_STAGE_PROFILE__","stageProfile: frozenProfile"]){assert.ok(s.includes(x),`missing ${x}`)}
assert.ok(s.includes('modelStageConcurrency = pcMapModelStageConcurrency()'));
assert.ok(s.includes('placementBuildConcurrency = logicalCores >= 12 ? 6 : logicalCores >= 8 ? 5 : 4'));
console.log('PASS M75 structured map object-stage profile');
