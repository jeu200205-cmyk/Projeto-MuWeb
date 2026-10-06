import fs from 'node:fs';import assert from 'node:assert/strict';
const b=fs.readFileSync(new URL('./world/PcIcarusBoids.js',import.meta.url),'utf8');
for(const x of ['SPEAR_COUNT = 10','velocity: 2.2','240*40','ri(1024) - 512','>= 1500','ri(5120) === 0','41273','5161','SPEAR_TAILS = 30','SPEAR_SCALE = 25','BITMAP_JOINT_SPIRIT','0.048 * 0.5','0.0613 * 0.5','0.1113 * 0.5','* 70','+ 10 + vz * 140','0.4 + 0.2 * sa']) assert.ok(b.includes(x),`missing ${x}`);
assert.ok(b.includes('Math.sin(b.angle)')&&b.includes('Math.cos(b.angle)'),'MoveHeavenBug must use raw Angle[2]');
assert.ok(!b.includes('const az = rad(b.angle)'),'degree conversion regressed into MoveHeavenBug');
console.log('PASS M72/FIX74 Icarus 10 MODEL_SPEARSKILL subtype1 boids source contracts');
