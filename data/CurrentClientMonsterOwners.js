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
const NAME_PATHS=Object.freeze([
  'Configs/lua/Monster/CustomMonsterName.lua','Configs/Lua/Monster/CustomMonsterName.lua','Configs/crypt/Monster/CustomMonsterName.lua',
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
export function parseCustomMonsterGlowLua(input){
  const text=stripComments(input),out=new Map();
  // PC MonsterGlow.cpp exact owner: SetMonsterGlow(MonsterID, Layer, MeshType, R, G, B).
  for(const m of text.matchAll(/\bSetMonsterGlow\s*\(\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\)/g)){
    const id=Number(m[1]),layer=Number(m[2]),meshType=Number(m[3]),r=Number(m[4]),g=Number(m[5]),b=Number(m[6]);
    if(Number.isInteger(id)&&[layer,meshType,r,g,b].every(Number.isFinite)&&!out.has(id))out.set(id,Object.freeze({monsterId:id,layer,meshType,r:r/255,g:g/255,b:b/255,owner:'CustomMonsterGlow.lua'}));
  }
  return out;
}

export function parseCustomMonsterNameLua(input){
  const text=stripComments(input),out=[];
  for(const m of text.matchAll(/\bSetCustomMonsterName\s*\(([^\n]*)\)/g)){
    const parts=m[1].split(',').map(x=>x.trim()); if(parts.length<5)continue;
    const cls=Number(parts[0]),map=Number(parts[1]),x=Number(parts[2]),y=Number(parts[3]);
    const sm=/^['"]([\s\S]*)['"]$/.exec(parts.slice(4).join(',').trim());
    if([cls,map,x,y].every(Number.isFinite)&&sm)out.push(Object.freeze({classId:cls,map,x,y,name:sm[1],owner:'CustomMonsterName.lua'}));
  }
  return Object.freeze(out);
}
export function parseCustomMonsterEffectLua(input){
  const text=stripComments(input),out=new Map();
  // PC MonsterEffect.cpp exact owner:
  // SetMonsterEffect(MonsterID,Type,EffectID,EffectLv,Bone,Size,R,G,B,Black,Rand).
  const re=/\bSetMonsterEffect\s*\(\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*,\s*([+-]?\d+)\s*\)/g;
  for(const m of text.matchAll(re)){
    const monsterId=Number(m[1]);
    const rule=Object.freeze({type:Number(m[2]),effectId:Number(m[3]),effectLv:Number(m[4]),bone:Number(m[5]),size:Number(m[6]),r:Number(m[7]),g:Number(m[8]),b:Number(m[9]),black:Number(m[10]),randTime:Number(m[11]),owner:'CustomMonsterEffect.lua'});
    if(!Number.isInteger(monsterId)||!Object.values(rule).filter(v=>typeof v==='number').every(Number.isFinite))continue;
    const arr=out.get(monsterId)||[];arr.push(rule);out.set(monsterId,arr);
  }
  for(const [id,rules] of out)out.set(id,Object.freeze(rules.slice()));
  return out;
}

let registry=new Map(),glows=new Map(),effects=new Map(),names=[],status=Object.freeze({loaded:false,count:0,glows:0,effects:0,names:0,paths:{}}),inflight=null;
export function customMonsterRule(id){return registry.get(Number(id))||null;}export function customMonsterGlow(id){return glows.get(Number(id))||null;}export function customMonsterEffects(id){return effects.get(Number(id))||null;}export function customMonsterType(id){return customMonsterRule(id)?.customType??null;}export function customMonsterName(id,map,x,y){const cls=Number(id),m=Number(map),px=Number(x),py=Number(y);return names.find(r=>r.classId===cls&&r.map===m&&r.x===px&&r.y===py)?.name||null;}export function customMonsterStatus(){return status;}
async function one(paths,parser,fetchBinary){let last=null;for(const path of paths){try{const b=await fetchBinary(path);if(!b)continue;const value=parser(decodePcLuaText(b));return {path,value};}catch(e){last=e;}}throw last||new Error(`owner ausente: ${paths[0]}`);}
export async function loadCurrentClientMonsterOwners(fetchBinary=(p)=>RemoteAssets.fetchBinary(p)){
  if(status.loaded)return status;if(inflight)return inflight;inflight=(async()=>{
    const rs=await Promise.allSettled([one(MONSTER_PATHS,parseCustomMonsterLua,fetchBinary),one(GLOW_PATHS,parseCustomMonsterGlowLua,fetchBinary),one(EFFECT_PATHS,parseCustomMonsterEffectLua,fetchBinary),one(NAME_PATHS,parseCustomMonsterNameLua,fetchBinary)]);
    const val=(i,empty)=>rs[i].status==='fulfilled'?rs[i].value:{path:null,value:empty};
    const m=val(0,new Map()),g=val(1,new Map()),e=val(2,new Map()),n=val(3,[]);
    if(!m.value.size)throw new Error(rs[0].status==='rejected'?(rs[0].reason?.message||'CustomMonster indisponível'):'CustomMonster sem rows ativos');
    registry=m.value;glows=g.value;effects=e.value;names=Array.isArray(n.value)?n.value:[];
    status=Object.freeze({loaded:true,count:registry.size,glows:glows.size,effects:[...effects.values()].reduce((a,b)=>a+b.length,0),names:names.length,paths:Object.freeze({monster:m.path,glow:g.path,effect:e.path,name:n.path}),errors:Object.freeze({glow:rs[1].status==='rejected',effect:rs[2].status==='rejected',name:rs[3].status==='rejected'})});
    console.info(`[CustomMonster] owners reais models=${status.count} glows=${status.glows} effects=${status.effects} names=${status.names}`);return status;
  })().finally(()=>{inflight=null;});return inflight;
}
export function resetCurrentClientMonsterOwnersForTests(){registry=new Map();glows=new Map();effects=new Map();names=[];status=Object.freeze({loaded:false,count:0,glows:0,effects:0,names:0,paths:{}});inflight=null;}
