import fs from 'node:fs';
import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('../../core/GameApp.js',import.meta.url),'utf8');
const fx=fs.readFileSync(new URL('../../effects2/DisplayPotionFX.js',import.meta.url),'utf8');
const proto=fs.readFileSync(new URL('../../protocol/RealMUProtocol.js',import.meta.url),'utf8');
const tow=fs.readFileSync(new URL('../../world/TerrainObjectWorld.js',import.meta.url),'utf8');

// ReceiveDisplayEffectViewport 0x01/0x03 -> BITMAP_MAGIC+1 subtype5 -> CreateHealing.
assert.match(app,/t === 0x01 \|\| t === 0x03/);
assert.match(app,/playDisplayPotionEffect/);
assert.match(fx,/MAGIC_LIFE = 20/);
assert.match(fx,/JOINT_LIFE = 12/);
assert.match(fx,/JOINT_SCALE = 5/);
assert.match(fx,/JOINT_MAX_TAILS = 2/);
assert.match(fx,/for\(let i=0;i<3;i\+\+\)/);
assert.match(fx,/Math\.floor\(Math\.random\(\)\*90\)/);
assert.match(fx,/Math\.floor\(Math\.random\(\)\*360\)/);
assert.match(fx,/j\.velocity\+=4/);
assert.match(fx,/moveHumming\(j\.pos,j\.ang,target,10\)/);
assert.match(fx,/lum\*\.9,lum\*\.49,lum\*\.04/);
assert.match(fx,/Effect\/JointEnergy01\.OZJ/);
assert.ok(!fx.includes('Magic_Ground2'),'subtype5 is an invisible effect controller in RenderEffects');

// Main 5.2 SendRequestAction macro: C1 05 18 Angle Action.
assert.match(proto,/createActionPacket\(action, angle\)/);
assert.match(proto,/_buildC1NoSub\(0x18, Uint8Array\.from\(\[d & 0xFF, a & 0xFF\]\)\)/);
assert.match(proto,/BOTH_HEAD\.BOTH_MESSAGE/);

// Lorencia CreateOperate exact owner set and default/pose OBB heights.
for (const marker of ["[6,'sit']","[133,'pose']","[145,'sit-facing']","[146,'sit']"]) assert.ok(tow.includes(marker),marker);
assert.match(tow,/maxHeight=\(obj\.serial\|0\)===133\?160:80/);
assert.match(app,/_pickPcOperateFromPointer/);
assert.match(app,/_startPcOperate/);
assert.match(app,/_updatePcOperateIntent/);
assert.match(app,/const action=op\.kind==='pose'\?129:128/);
assert.match(app,/requestPcFacingMove/);
assert.match(app,/requestAction/);

for (const marker of [
  "new THREE.MeshBasicMaterial",
  "THREE.AdditiveBlending",
  "tailCorners(pos,ang,scale=JOINT_SCALE)",
  "g.setIndex([0,1,2,0,2,3,4,5,6,4,6,7])",
]) assert(fx.includes(marker),`missing PC joint tail render contract: ${marker}`);
assert(app.includes("MUSounds.play('ui.drop')"),'Lorencia operate SOUND_DROP_ITEM01 owner missing');
console.log('PASS FIX91 DisplayEffect healing joints + Lorencia CreateOperate/action wire');
