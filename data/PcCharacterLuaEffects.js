/**
 * PcCharacterLuaEffects.js — runtime owner for the two PC Lua character-effect systems.
 *
 * PC authority:
 *   CustomEffects.cpp -> CharacterEffectItens.lua -> CharacterItensEffect(Object,BMD,Type)
 *     registered bridges: CreateSprite(BMD,Bitmap,Link,Scale,R,G,B,Object)
 *                         CreateParticle(BMD,Bitmap,SubType,Link,Scale,R,G,B,Object)
 *   CustomSetEffect.cpp -> CharacterSetEffect.lua -> CreateEffectSetPlayer(BMD,Object,ItemIndex,EquipmentLevelSet)
 *     registered bridges: CreateSprite(BMD,Object,Bone,EffectID,Scale,R,B,G,PosX,PosY,PosZ)
 *                         CreateParticle(BMD,Object,Bone,EffectID,EffectLv,Scale,R,B,G,PosX,PosY,PosZ)
 *                         CreateSkill(BMD,Object,Bone,EffectID,EffectLv,Scale,R,B,G,PosX,PosY,PosZ)
 *
 * This module executes the real client Lua with Fengari and records only bridge calls.
 * Pointer arguments are represented by opaque numeric handles because the Lua layer never
 * dereferences them; the native bridge owns the TransformPosition operation.
 */
import {lua,lauxlib,core,base,table,string,math} from '../vendor/fengari-bitmap-0.1.4.mjs';
import {decodePcLuaText} from './PcLuaCrypt.js';
import {RemoteAssets} from './RemoteAssets.js';

const S=core.to_luastring;
// Opaque pointer sentinels: distinct values let the S6 compatibility ABI prove
// whether Object lives in arg2 or arg8/9 without guessing from EffectID ranges.
const LUA_BMD_HANDLE=0x6d000001, LUA_OBJECT_HANDLE=0x6d000002;
export const CHARACTER_ITEM_EFFECT_PATHS=Object.freeze([
  'Configs/Lua/EffectSystem/CharacterEffectItens.lua','Configs/lua/EffectSystem/CharacterEffectItens.lua','Configs/crypt/EffectSystem/CharacterEffectItens.lua',
]);
export const CHARACTER_SET_EFFECT_PATHS=Object.freeze([
  'Configs/Lua/EffectSystem/CharacterSetEffect.lua','Configs/lua/EffectSystem/CharacterSetEffect.lua','Configs/crypt/EffectSystem/CharacterSetEffect.lua',
]);

function numberArg(L,i){ if(lua.lua_type(L,i)!==lua.LUA_TNUMBER) return null; const v=lua.lua_tonumber(L,i); return Number.isFinite(v)?v:null; }
function installLibs(L){
  for(const [name,open] of [['_G',base.luaopen_base],['table',table.luaopen_table],['string',string.luaopen_string],['math',math.luaopen_math]]){
    lauxlib.luaL_requiref(L,S(name),open,1); lua.lua_pop(L,1);
  }
  for(const name of ['dofile','loadfile','require','collectgarbage']){lua.lua_pushnil(L);lua.lua_setglobal(L,S(name));}
}
function register(L,name,fn){lua.lua_pushcfunction(L,fn);lua.lua_setglobal(L,S(name));}
function runLua(text,path,entry,args,bridges,{instructionLimit=400000,modules=new Map(),folders=new Map()}={}){
  const L=lauxlib.luaL_newstate(); const calls=[]; let steps=0;
  try{
    installLibs(L);
    const loaded=new Set();
    const execModule=(name)=>{
      if(loaded.has(name)) return;
      const mod=modules.get(name); if(mod==null) throw Error(`Lua include ausente: ${name}`);
      loaded.add(name);
      if(lauxlib.luaL_loadbuffer(L,S(mod),null,S(name))!==lua.LUA_OK) throw Error(core.to_jsstring(lua.lua_tostring(L,-1)));
      lua.lua_pushstring(L,S(name));
      if(lua.lua_pcall(L,1,1,0)!==lua.LUA_OK) throw Error(core.to_jsstring(lua.lua_tostring(L,-1)));
      lua.lua_pop(L,1);
    };
    register(L,'OpenFile',()=>{const name=core.to_jsstring(lua.lua_tostring(L,1)||S('')); execModule(name.replace(/\\/g,'/')); return 0;});
    register(L,'OpenFolder',()=>{const raw=core.to_jsstring(lua.lua_tostring(L,1)||S('')).replace(/\\/g,'/').replace(/^\/+|\/+$/g,''); const list=folders.get(raw)||folders.get(raw.toLowerCase()); if(!list) return lauxlib.luaL_error(L,S(`OpenFolder sem manifesto: ${raw}`)); for(const name of list) execModule(name); return 0;});
    for(const [name,bridge] of Object.entries(bridges)) register(L,name,()=>{
      const count=lua.lua_gettop(L); const values=[];
      for(let i=1;i<=count;i++){const v=numberArg(L,i); if(v==null) return lauxlib.luaL_error(L,S(`${name}: argumento ${i} não numérico`)); values.push(v);}
      const row=bridge(values); if(row) calls.push(Object.freeze(row)); return 0;
    });
    lua.lua_sethook(L,()=>{steps+=1000;if(steps>instructionLimit)lauxlib.luaL_error(L,S('Lua character-effect instruction limit exceeded'));},lua.LUA_MASKCOUNT,1000);
    if(lauxlib.luaL_loadbuffer(L,S(text),null,S(path))!==lua.LUA_OK) throw Error(core.to_jsstring(lua.lua_tostring(L,-1)));
    if(lua.lua_pcall(L,0,0,0)!==lua.LUA_OK) throw Error(core.to_jsstring(lua.lua_tostring(L,-1)));
    lua.lua_getglobal(L,S(entry));
    if(lua.lua_type(L,-1)!==lua.LUA_TFUNCTION) throw Error(`${entry} ausente em ${path}`);
    for(const arg of args) lua.lua_pushnumber(L,arg);
    if(lua.lua_pcall(L,args.length,0,0)!==lua.LUA_OK) throw Error(core.to_jsstring(lua.lua_tostring(L,-1)));
    return Object.freeze(calls.slice());
  } finally { lua.lua_close(L); }
}

function itemSpriteBridge(a){
  if(a.length===8 && a[0]===LUA_BMD_HANDLE && a[7]===LUA_OBJECT_HANDLE)
    return {kind:'sprite',bitmap:a[1],bone:a[2],scale:a[3],r:a[4],g:a[5],b:a[6],owner:'CharacterEffectItens.lua'};
  if(a.length===11 && a[0]===LUA_BMD_HANDLE){
    // S6 layout A: BMD,Object,Bone,EffectID,Scale,RGB,XYZ
    if(a[1]===LUA_OBJECT_HANDLE) return {kind:'sprite',bitmap:a[3],bone:a[2],scale:a[4],r:a[5],g:a[6],b:a[7],offset:Object.freeze([a[8],a[9],a[10]]),s6:true,owner:'CharacterEffectItens.lua'};
    // S6 layout B: BMD,EffectID,Bone,Scale,RGB,Object,XYZ
    if(a[7]===LUA_OBJECT_HANDLE) return {kind:'sprite',bitmap:a[1],bone:a[2],scale:a[3],r:a[4],g:a[5],b:a[6],offset:Object.freeze([a[8],a[9],a[10]]),s6:true,owner:'CharacterEffectItens.lua'};
  }
  return null;
}
function itemParticleBridge(a){
  if(a.length===9 && a[0]===LUA_BMD_HANDLE && a[8]===LUA_OBJECT_HANDLE)
    return {kind:'particle',bitmap:a[1],subtype:a[2],bone:a[3],scale:a[4],r:a[5],g:a[6],b:a[7],owner:'CharacterEffectItens.lua'};
  if(a.length===12 && a[0]===LUA_BMD_HANDLE){
    // S6 layout A: BMD,Object,Bone,EffectID,SubType,Scale,RGB,XYZ
    if(a[1]===LUA_OBJECT_HANDLE) return {kind:'particle',bitmap:a[3],subtype:a[4],bone:a[2],scale:a[5],r:a[6],g:a[7],b:a[8],offset:Object.freeze([a[9],a[10],a[11]]),s6:true,owner:'CharacterEffectItens.lua'};
    // S6 layout B: BMD,EffectID,SubType,Bone,Scale,RGB,Object,XYZ
    if(a[8]===LUA_OBJECT_HANDLE) return {kind:'particle',bitmap:a[1],subtype:a[2],bone:a[3],scale:a[4],r:a[5],g:a[6],b:a[7],offset:Object.freeze([a[9],a[10],a[11]]),s6:true,owner:'CharacterEffectItens.lua'};
  }
  return null;
}
function itemEffectBridges(){return {
  CreateSprite:itemSpriteBridge,CreateParticle:itemParticleBridge,
  CreateSpriteS6Item:itemSpriteBridge,CreateParticleS6Item:itemParticleBridge,
};}

export function executeCharacterItemEffectsLua(text,{type,path='CharacterEffectItens.lua'}={}){
  const n=Number(type); if(!Number.isFinite(n)) return Object.freeze([]);
  return runLua(text,path,'CharacterItensEffect',[LUA_OBJECT_HANDLE,LUA_BMD_HANDLE,n],itemEffectBridges());
}
export function executeCharacterSetEffectsLua(text,{itemIndex,equipmentLevelSet=0,path='CharacterSetEffect.lua'}={}){
  const item=Number(itemIndex),level=Number(equipmentLevelSet); if(!Number.isFinite(item)||!Number.isFinite(level)) return Object.freeze([]);
  const map=(kind,a,hasLv)=>{
    const min=hasLv?12:11; if(a.length!==min)return null;
    const off=hasLv?1:0;
    return {kind,bone:a[2],effectId:a[3],effectLv:hasLv?a[4]:0,scale:a[4+off],r:a[5+off],b:a[6+off],g:a[7+off],offset:Object.freeze([a[8+off],a[9+off],a[10+off]]),owner:'CharacterSetEffect.lua'};
  };
  return runLua(text,path,'CreateEffectSetPlayer',[LUA_BMD_HANDLE,LUA_OBJECT_HANDLE,item,level],{
    CreateSprite:(a)=>map('sprite',a,false),
    CreateParticle:(a)=>map('particle',a,true),
    CreateSkill:(a)=>map('skill',a,true),
  });
}

let state={item:null,set:null,status:Object.freeze({loaded:false,itemPath:null,setPath:null})},inflight=null;
const itemPlanCache=new Map(),setPlanCache=new Map();
async function loadOne(paths,fetchBinary){let last=null;for(const path of paths){try{const b=await fetchBinary(path);if(!b)continue;return {path,text:decodePcLuaText(b)};}catch(e){last=e;}}throw last||Error(`Lua owner ausente: ${paths[0]}`);}
async function preloadEffectLuaDeps(text,fetchBinary){
  const modules=new Map(),folders=new Map(),visiting=new Set();
  const normalize=(v)=>String(v).replace(/\\/g,'/').replace(/^\/+/, '');
  const literalFiles=(src)=>[...String(src).matchAll(/\bOpenFile\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m=>normalize(m[1]));
  const literalFolders=(src)=>[...String(src).matchAll(/\bOpenFolder\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m=>normalize(m[1]).replace(/\/+$/,''));
  const loadFile=async(name)=>{
    name=normalize(name); if(modules.has(name)) return;
    if(visiting.has(`f:${name}`)) throw Error(`OpenFile Lua include ciclico: ${name}`);
    visiting.add(`f:${name}`);
    const candidates=[name, `Configs/Lua/${name}`, `Configs/lua/${name}`];
    let decoded=null,physical=null;
    for(const candidate of candidates){const b=await fetchBinary(candidate);if(!b)continue;decoded=decodePcLuaText(b);physical=candidate;break;}
    if(decoded==null){visiting.delete(`f:${name}`);throw Error(`OpenFile Lua include ausente: ${name}`);}
    // Register before recursion exactly as LuaOpenFolder's loaded-file guard does;
    // the visiting guard still rejects a real include cycle rather than hanging.
    modules.set(name,decoded); modules.set(physical,decoded);
    await scan(decoded);
    visiting.delete(`f:${name}`);
  };
  const loadFolder=async(folder)=>{
    folder=normalize(folder).replace(/\/+$/,''); if(folders.has(folder))return;
    if(visiting.has(`d:${folder}`)) throw Error(`OpenFolder Lua include ciclico: ${folder}`);
    visiting.add(`d:${folder}`);
    const candidates=[folder, `Configs/Lua/${folder}`, `Configs/lua/${folder}`]; let files=[];
    for(const c of candidates){files=await RemoteAssets.listFolder(c,{suffix:'.lua'});if(files.length)break;}
    if(!files.length){visiting.delete(`d:${folder}`);throw Error(`OpenFolder sem arquivos reais: ${folder}`);}
    const names=[];
    for(const file of files){const b=await fetchBinary(file);if(!b)throw Error(`Lua include ausente: ${file}`);const decoded=decodePcLuaText(b);modules.set(file,decoded);names.push(file);await scan(decoded);}
    folders.set(folder,names);folders.set(folder.toLowerCase(),names);visiting.delete(`d:${folder}`);
  };
  async function scan(src){
    for(const name of [...new Set(literalFiles(src))]) await loadFile(name);
    for(const folder of [...new Set(literalFolders(src))]) await loadFolder(folder);
  }
  await scan(text);
  return {modules,folders};
}
export async function loadPcCharacterLuaEffects(fetchBinary=(p)=>RemoteAssets.fetchBinary(p)){
  if(state.status.loaded)return state.status;if(inflight)return inflight;
  inflight=(async()=>{
    const [item,set]=await Promise.all([loadOne(CHARACTER_ITEM_EFFECT_PATHS,fetchBinary),loadOne(CHARACTER_SET_EFFECT_PATHS,fetchBinary)]);
    const [itemDeps,setDeps]=await Promise.all([preloadEffectLuaDeps(item.text,fetchBinary),preloadEffectLuaDeps(set.text,fetchBinary)]);
    // Compile/symbol smoke test using values that are safe even when no row matches.
    runLua(item.text,item.path,'CharacterItensEffect',[LUA_OBJECT_HANDLE,LUA_BMD_HANDLE,-2147483648],{
      CreateSprite:(a)=>null,CreateParticle:(a)=>null,CreateSpriteS6Item:(a)=>null,CreateParticleS6Item:(a)=>null,
    },itemDeps);
    runLua(set.text,set.path,'CreateEffectSetPlayer',[LUA_BMD_HANDLE,LUA_OBJECT_HANDLE,-2147483648,0],{
      CreateSprite:(a)=>null,CreateParticle:(a)=>null,CreateSkill:(a)=>null,
    },setDeps);
    item.deps=itemDeps; set.deps=setDeps;
    itemPlanCache.clear(); setPlanCache.clear();
    state={item,set,status:Object.freeze({loaded:true,itemPath:item.path,setPath:set.path,runtime:'fengari-0.1.4-lua-5.3+OpenFolder'})};
    console.info(`[CharacterLuaFX] owners reais carregados: ${item.path} + ${set.path}`);return state.status;
  })().finally(()=>{inflight=null;});return inflight;
}
export function characterItemEffectPlan(type){
  if(!state.item) return Object.freeze([]);
  const n=Number(type); if(!Number.isFinite(n)) return Object.freeze([]);
  if(itemPlanCache.has(n)) return itemPlanCache.get(n);
  const out=runLua(state.item.text,state.item.path,'CharacterItensEffect',[LUA_OBJECT_HANDLE,LUA_BMD_HANDLE,n],itemEffectBridges(),state.item.deps||{});
  itemPlanCache.set(n,out); return out;
}
export function characterSetEffectPlan(itemIndex,equipmentLevelSet=0){
  if(!state.set) return Object.freeze([]);
  const item=Number(itemIndex),level=Number(equipmentLevelSet);
  if(!Number.isFinite(item)||!Number.isFinite(level)) return Object.freeze([]);
  const key=`${item}:${level}`; if(setPlanCache.has(key)) return setPlanCache.get(key);
  const out=runLua(state.set.text,state.set.path,'CreateEffectSetPlayer',[LUA_BMD_HANDLE,LUA_OBJECT_HANDLE,item,level],{
    CreateSprite:(a)=>{if(a.length!==11)return null;return {kind:'sprite',bone:a[2],effectId:a[3],effectLv:0,scale:a[4],r:a[5],b:a[6],g:a[7],offset:Object.freeze([a[8],a[9],a[10]]),owner:'CharacterSetEffect.lua'};},
    CreateParticle:(a)=>{if(a.length!==12)return null;return {kind:'particle',bone:a[2],effectId:a[3],effectLv:a[4],scale:a[5],r:a[6],b:a[7],g:a[8],offset:Object.freeze([a[9],a[10],a[11]]),owner:'CharacterSetEffect.lua'};},
    CreateSkill:(a)=>{if(a.length!==12)return null;return {kind:'skill',bone:a[2],effectId:a[3],effectLv:a[4],scale:a[5],r:a[6],b:a[7],g:a[8],offset:Object.freeze([a[9],a[10],a[11]]),owner:'CharacterSetEffect.lua'};}
  },state.set.deps||{});
  setPlanCache.set(key,out); return out;
}
export function pcCharacterLuaEffectsStatus(){return state.status;}
export function resetPcCharacterLuaEffectsForTests(){state={item:null,set:null,status:Object.freeze({loaded:false,itemPath:null,setPath:null})};inflight=null;itemPlanCache.clear();setPlanCache.clear();}
