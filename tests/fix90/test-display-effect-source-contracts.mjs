import fs from 'node:fs';
import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('../../core/GameApp.js',import.meta.url),'utf8');
const fx=fs.readFileSync(new URL('../../effects2/DisplayEffectFX.js',import.meta.url),'utf8');
const obj=fs.readFileSync(new URL('../../world/PcMapObjectVisuals.js',import.meta.url),'utf8');
const tow=fs.readFileSync(new URL('../../world/TerrainObjectWorld.js',import.meta.url),'utf8');
assert.match(app,/t === 0x10/);
assert.match(app,/Number\(this\.playerChar\?\.level \|\| 0\) >= 401/);
assert.match(app,/\(rawClass & 0x10\) !== 0/);
assert.ok(!app.includes('silent: true, heroLight: [1,1,1]'),'0x10 must not suppress PC SOUND_LEVEL_UP');
assert.match(app,/t === 0x11/);
assert.match(app,/pcInChaosCastle/);
assert.match(app,/playDisplayShieldCrash/);
assert.match(app,/shieldclash\.wav/);
assert.match(fx,/Effect\/atshild\.bmd/);
assert.match(fx,/Effect\/atshild2\.bmd/);
assert.match(fx,/SHIELD_LIFETIME_TICKS = 24/);
assert.match(fx,/SHIELD_SCALE = 1\.1/);
assert.match(fx,/new THREE\.Color\(0\.5, 0\.5, 1\.0\)/);
// Lorencia Object134/PoseBox01 is an invisible operation owner in PC; never
// turn it into visible scenery just to satisfy a missing-object audit.
assert.match(tow,/m\[133\]\s*=\s*'PoseBox01'/);
assert.match(obj,/t===130\|\|t===131\|\|t===132\|\|t===133/);
console.log('PASS FIX90 DisplayEffect 0x10 master+sound / 0x11 shield BMD + Lorencia PoseBox hidden owner');
