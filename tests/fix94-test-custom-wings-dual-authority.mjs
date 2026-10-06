import assert from 'node:assert/strict';
import {
  parseCustomWingsLua, loadCurrentClientItemOwners,
  currentClientItemModelForType, currentClientItemOwnerMeta,
  resetCurrentClientItemOwnersForTests,
} from '../data/CurrentClientItemOwners.js';

const native=`function StartLoadWings()\nLoadWing(GET_ITEM(12,200),20,20,20,20,20,80,10,81,10,82,10,84,10,106,10,86,10,108,10,0,1,"NativeWing")\nend`;
const extended=`function StartLoadWings()\nLoadWing(GET_ITEM(12,201),20,20,20,20,20,80,10,81,10,82,10,84,10,106,10,86,10,108,10,0,4,"Data\\\\Item\\\\","ExtendedCape",0)\nend`;
let m=parseCustomWingsLua(native+'\n'+extended);
assert.equal(m.size,2);
assert.equal(m.get(12*512+200).wingSchema,'native23');
assert.equal(m.get(12*512+200).path,'Item/NativeWing.bmd');
assert.equal(m.get(12*512+201).wingSchema,'extended25');
assert.equal(m.get(12*512+201).path,'Item/ExtendedCape.bmd');
assert.equal(m.get(12*512+201).isCape,true);
assert.equal(m.get(12*512+201).declaredTrailing,0);

// 2->1 current-client layout: LoadWing lives inside LoadItens.lua and there is
// intentionally no CustomWings.lua. It must still publish a wing owner once.
resetCurrentClientItemOwnersForTests();
const merged=`function StartLoadItens()\nLoadItem(GET_ITEM_MODEL(7,9),255,255,255,"Armor9",0)\nLoadWing(GET_ITEM(12,202),20,20,20,20,20,80,10,81,10,82,10,84,10,106,10,86,10,108,10,0,4,"Data\\\\Item\\\\","MergedCape",0)\nend`;
const enc=new TextEncoder();
await loadCurrentClientItemOwners(async path=>{
  if(/LoadItens\.lua$/i.test(path)) return enc.encode(merged);
  return null;
});
const w=currentClientItemModelForType(12*512+202);
assert.ok(w?.customWing);
assert.equal(w.path,'Item/MergedCape.bmd');
assert.equal(currentClientItemOwnerMeta().wingsFromLoadItens,1);
assert.equal(currentClientItemOwnerMeta().wingsDedicated,0);
console.log('PASS FIX94 CustomWings native23 + extended25 + 2->1 LoadItens wing authority');
