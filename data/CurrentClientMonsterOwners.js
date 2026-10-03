/** Current-client CustomMonster / Glow / Effect owner registry. */
import { RemoteAssets } from './RemoteAssets.js';
import { decodePcLuaText } from './PcLuaCrypt.js';

const MONSTER_PATHS=Object.freeze([
  'Configs/lua/Monster/CustomMonster.lua','Configs/Lua/Monster/CustomMonster.lua','Configs/crypt/Monster/CustomMonster.lua',
]);
const GLOW_PATHS=Object.freeze([
  'Configs/lua/Monster/CustomMonsterGlow.lua','Configs/Lua/Monster/CustomMonsterGlow.lua','Configs/crypt/Monster/CustomMonsterGlow.lua',
]);
const EFFECT_PATHS=Object.freeze([
  'Configs/lua/Monster/CustomMonsterEffect.lua','Configs/Lua/Monster/CustomMonsterEffect.lua','Configs/crypt/Monster/CustomMonsterEffect.lua',
]);
function stripComments(s=''){return String(s).replace(/--\[\[[\s\S]*?\]\]/g,'').replace(/--[^\n]*/g,'');}
function field(body,name){return new RegExp(`\\b${name}\\s*=\\s*(-?(?:\\d+(?:\\.\\d*)?|\\.\\d+))`,'i').exec(body)?.[1]??null;}
function str(body,name){return new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`,'i').exec(body)?.[1]??null;}
export function parseCustomMonsterLua(input){
  const text=stripComments(input),out=new Map();
  for(const m of text.matchAll(/\{([^{}]*\bMonsterID\s*=\s*\d+[^{}]*)\}/gi)){
    const b=m[1],id=Number(field(b,'MonsterID'));if(!Number.isInteger(id)||out.has(id))continue;
    const type=Number(field(b,'MonsterType')),size=Number(field(b,'Size')),map=Number(field(b,'Map')),x=Number(field(b,'PosX')),y=Number(field(b,'PosY'));
    const folder=str(b,'MonsterFolder'),model=str(b,'MonsterModel'),name=str(b,'MonsterName');if(!folder||!model||![type,size,map,x,y].every(Number.isFinite))continue;
    const rel=(folder+model+'.bmd').replace(/\\/g,'/').replace(/\/{2,}/g,'/').replace(/^Data\//i,'');
    out.set(id,Object.freeze({monsterId:id,modelType:id+574,customType:type,size,map,x,y,name:name||'',path:rel,owner:'CustomMonster.lua'}));
  }return out;
}
export function parseCustomMonsterGlowLua(input){const text=stripComments(input),out=new Map();for(const m of text.matchAll(/\{([^{}]*\bMonsterID\s*=\s*\d+[^{}]*)\}/gi)){const b=m[1],id=Number(field(b,'MonsterID'));if(!Number.isInteger(id)||out.has(id))continue;const layer=Number(field(b,'GlowLayer')),glowType=Number(field(b,'GlowType')),r=Number(field(b,'GlowR')),g=Number(field(b,'GlowG')),bl=Number(field(b,'GlowB'));if([layer,glowType,r,g,bl].every(Number.isFinite))out.set(id,Object.freeze({monsterId:id,layer,glowType,r:r/255,g:g/255,b:bl/255,owner:'CustomMonsterGlow.lua'}));}return out;}
export function parseCustomMonsterEffectLua(input){
  const text=stripComments(input),out=new Map();
  for(const block of text.matchAll(/CUSTOM_MONSTER_EFFECT\s*\[\s*(\d+)\s*\]\s*=\s*\{([\s\S]*?)\}\s*(?=(?:CUSTOM_MONSTER_EFFECT\s*\[|function\b|$))/g)){
    const id=Number(block[1]),rules=[];for(const m of block[2].matchAll(/\{([^{}]*\bType\s*=\s*\d+[^{}]*)\}/g)){const b=m[1],rule={type:Number(field(b,'Type')),effectId:Number(field(b,'EffectID')),effectLv:Number(field(b,'EffectLv')),bone:Number(field(b,'Bone')),size:Number(field(b,'Size')),r:Number(field(b,'ColorR')),g:Number(field(b,'ColorG')),b:Number(field(b,'ColorB')),black:Number(field(b,'Black')),randTime:Number(field(b,'RandTime'))};if(Object.values(rule).every(Number.isFinite))rules.push(Object.freeze(rule));}if(rules.length)out.set(id,Object.freeze(rules));
  }return out;
}
let registry=new Map(),glows=new Map(),effects=new Map(),status=Object.freeze({loaded:false,count:0,glows:0,effects:0,paths:{}}),inflight=null;
export function customMonsterRule(id){return registry.get(Number(id))||null;}export function customMonsterGlow(id){return glows.get(Number(id))||null;}export function customMonsterEffects(id){return effects.get(Number(id))||null;}export function customMonsterType(id){return customMonsterRule(id)?.customType??null;}export function customMonsterStatus(){return status;}
async function one(paths,parser,fetchBinary){let last=null;for(const path of paths){try{const b=await fetchBinary(path);if(!b)continue;const value=parser(decodePcLuaText(b));return {path,value};}catch(e){last=e;}}throw last||new Error(`owner ausente: ${paths[0]}`);}
export async function loadCurrentClientMonsterOwners(fetchBinary=(p)=>RemoteAssets.fetchBinary(p)){
  if(status.loaded)return status;if(inflight)return inflight;inflight=(async()=>{const [m,g,e]=await Promise.all([one(MONSTER_PATHS,parseCustomMonsterLua,fetchBinary),one(GLOW_PATHS,parseCustomMonsterGlowLua,fetchBinary),one(EFFECT_PATHS,parseCustomMonsterEffectLua,fetchBinary)]);if(!m.value.size)throw new Error('CustomMonster sem rows ativos');registry=m.value;glows=g.value;effects=e.value;status=Object.freeze({loaded:true,count:registry.size,glows:glows.size,effects:[...effects.values()].reduce((n,a)=>n+a.length,0),paths:Object.freeze({monster:m.path,glow:g.path,effect:e.path})});console.info(`[CustomMonster] owners reais models=${status.count} glows=${status.glows} effects=${status.effects}`);return status;})().finally(()=>{inflight=null;});return inflight;
}
export function resetCurrentClientMonsterOwnersForTests(){registry=new Map();glows=new Map();effects=new Map();status=Object.freeze({loaded:false,count:0,glows:0,effects:0,paths:{}});inflight=null;}
