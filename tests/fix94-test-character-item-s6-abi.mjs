import assert from 'node:assert/strict';
import {executeCharacterItemEffectsLua} from '../data/PcCharacterLuaEffects.js';
const src=`
function CharacterItensEffect(Object,BMD,Type)
 if Type==1 then
  CreateSpriteS6Item(BMD,32001,7,1.25,1,.5,.25,Object,1,2,3)
  CreateParticleS6Item(BMD,32002,4,8,.75,.2,.3,.4,Object,4,5,6)
 elseif Type==2 then
  CreateSpriteS6Item(BMD,Object,9,32003,.8,.1,.2,.3,7,8,9)
  CreateParticleS6Item(BMD,Object,10,32004,5,.9,.4,.5,.6,10,11,12)
 elseif Type==3 then
  CreateSprite(BMD,32005,11,1.0,.7,.8,.9,Object)
  CreateParticle(BMD,32006,6,12,1.1,.9,.8,.7,Object)
 end
end`;
let p=executeCharacterItemEffectsLua(src,{type:1});
assert.equal(p.length,2); assert.equal(p[0].bitmap,32001); assert.deepEqual(p[0].offset,[1,2,3]);
assert.equal(p[1].subtype,4); assert.equal(p[1].bone,8); assert.deepEqual(p[1].offset,[4,5,6]);
p=executeCharacterItemEffectsLua(src,{type:2});
assert.equal(p[0].bitmap,32003); assert.equal(p[0].bone,9); assert.deepEqual(p[0].offset,[7,8,9]);
assert.equal(p[1].bitmap,32004); assert.equal(p[1].subtype,5); assert.equal(p[1].bone,10); assert.deepEqual(p[1].offset,[10,11,12]);
p=executeCharacterItemEffectsLua(src,{type:3});
assert.equal(p[0].kind,'sprite'); assert.equal(p[1].kind,'particle');
console.log('PASS FIX94 CharacterEffectItens CreateSpriteS6Item/CreateParticleS6Item all proven layouts');
