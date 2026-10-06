import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseDarkSpiritLua} from '../data/DarkSpiritLua.js';
const src=`
DARK_SPIRIT_INFO = {
 { ItemIndex=GET_ITEM(13,139), ModelName='ravenwhite', ObjectName='ravenwhite' },
 { ItemIndex=GET_ITEM(13,200), ModelName='eaglecustom', ObjectName='eaglecustom' },
}
DARK_SPIRIT_RENDER_MODEL={}
DARK_SPIRIT_RENDER_MODEL[GET_ITEM(13,139)]={
 {renderType=2,layer=0,effectLayer=2,lightR=1,lightG=1,lightB=1,color3fv=0,textureID=-1},
 {renderType=2,layer=1,effectLayer=2,lightR=1,lightG=1,lightB=1,color3fv=0,textureID=-1},
}
DARK_SPIRIT_EFFECT={}
DARK_SPIRIT_EFFECT[GET_ITEM(13,139)]={
 {Type=0,EffectID=32002,EffectLv=0,Bone=15,Size=.9,ColorR=.8,ColorG=.2,ColorB=.8,Black=0,RandTime=100},
 {Type=0,EffectID=32002,EffectLv=0,Bone=16,Size=.9,ColorR=.8,ColorG=.2,ColorB=.8,Black=0,RandTime=100},
}
function StartLoadDarkSpirit() for i=1,#DARK_SPIRIT_INFO do SetDarkSpirit(DARK_SPIRIT_INFO[i].ItemIndex,DARK_SPIRIT_INFO[i].ModelName,DARK_SPIRIT_INFO[i].ObjectName) end end
`;
const r=parseDarkSpiritLua(src);assert.equal(r.size,2);
const w=r.get(13*512+139);assert.equal(w.modelPath,'Item/ravenwhite.bmd');assert.equal(w.objectModelPath,'Item/ravenwhite.bmd');
assert.equal(w.renderModel.length,2);assert.equal(w.renderModel[1].effectLayer,2);assert.equal(w.effects.length,2);assert.equal(w.effects[0].bone,15);
const pet=fs.readFileSync(new URL('../game/PetSystem.js',import.meta.url),'utf8');
for(const token of ['_attachLuaPresentation','renderBaseOwned','dynamic-randtime-not-owned','pcBitmapTexture','createBoneSprite'])assert.ok(pet.includes(token),`missing ${token}`);
const composer=fs.readFileSync(new URL('../graphics/PlayerComposer.js',import.meta.url),'utf8');assert.ok(composer.includes('presentation: resolved.helper.darkSpirit || null'));
console.log('PASS FIX94 DarkSpirit table owner + Item/ model authority + real bone presentation junction');
