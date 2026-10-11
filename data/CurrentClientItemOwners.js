/**
 * CurrentClientItemOwners.js — runtime authority for current-client custom item
 * model owners that are actually active in the user's Lua Data.
 *
 * Sources/owners:
 *   ItemManager.cpp       -> Configs/Lua/Configs/LoadItens.lua / LoadItem(...)
 *   CustomWing.cpp        -> Configs/Lua/Configs/CustomWings.lua / LoadWing(...)
 *   CustomCape.cpp        -> CharacterSystem/CharacterCreateCape.lua
 *
 * No commented rows are imported. Unknown expressions fail closed. The Web
 * registry is replaced atomically only after the actual current-client owners
 * have been parsed; there is no 2k-row historical/commented fallback.
 */
import { RemoteAssets } from './RemoteAssets.js';
import { decodePcLuaText } from './PcLuaCrypt.js';
import { luaCodeMask,scanLuaGlobalCalls,parseLuaStringLiteral,assertPcLuaScriptCompiles } from './PcLuaStaticLex.js';

export const ITEM_MODEL_BASE = 1095;
export const LOAD_ITENS_PATHS = Object.freeze([
  'Configs/lua/Configs/LoadItens.lua',
  'Configs/Lua/Configs/LoadItens.lua',
  'Configs/crypt/Configs/LoadItens.lua',
]);
export const CUSTOM_WINGS_PATHS = Object.freeze([
  'Configs/lua/Configs/CustomWings.lua',
  'Configs/Lua/Configs/CustomWings.lua',
  'Configs/crypt/Configs/CustomWings.lua',
]);
export const CUSTOM_CAPE_PATHS = Object.freeze([
  'Configs/lua/CharacterSystem/CharacterCreateCape.lua',
  'Configs/Lua/CharacterSystem/CharacterCreateCape.lua',
  'Configs/crypt/CharacterSystem/CharacterCreateCape.lua',
]);

function numberToken(raw) {
  const s=String(raw??'').trim();
  if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) return null;
  const n=Number(s); return Number.isFinite(n)?n:null;
}
function itemToken(raw, model=false) {
  const s=String(raw??'').trim();
  const re=model
    ? /^GET_ITEM_MODEL\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i
    : /^GET_ITEM\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i;
  const m=re.exec(s); if(!m)return null;
  const group=Number(m[1]), index=Number(m[2]);
  return {group,index,itemType:group*512+index,modelType:group*512+index+ITEM_MODEL_BASE};
}

function modelPath(group,name) {
  const dir=group>=7 && group<12 ? 'Player' : 'Item';
  return `${dir}/${String(name).replace(/\\/g,'/')}.bmd`;
}

export function parseLoadItensLua(input) {
  const map=new Map();
  for(const a of scanLuaGlobalCalls(input,'LoadItem')) {
    if(a.length<5 || a.length>6) continue;
    const item=itemToken(a[0],true), r=numberToken(a[1]), g=numberToken(a[2]), b=numberToken(a[3]), name=parseLuaStringLiteral(a[4],{strictLuaStrings:true});
    if(!item || [r,g,b].some(v=>v==null) || !name) continue;
    // Native ItemManager.cpp reads arg6 but does not persist/use it. Keep it
    // only as declared metadata; it must not become a fabricated visual owner.
    const declaredEffectType=a.length>=6?numberToken(a[5]):0;
    map.set(item.itemType,Object.freeze({
      itemType:item.itemType, modelType:item.modelType, group:item.group, index:item.index,
      name, path:modelPath(item.group,name), color:Object.freeze([r/255,g/255,b/255]),
      effectType:0, declaredEffectType:declaredEffectType ?? 0, owner:'LoadItens.lua',
    }));
  }
  return map;
}

export function parseCustomWingsLua(input) {
  const map=new Map();
  for(const a of scanLuaGlobalCalls(input,'LoadWing')) { if(a.length!==23) continue;
    const item=itemToken(a[0],false), modelType=numberToken(a[20]), isCape=numberToken(a[21]), name=parseLuaStringLiteral(a[22],{strictLuaStrings:true});
    if(!item || modelType==null || isCape==null || !name) continue;
    const ints=a.slice(1,20).map(numberToken); if(ints.some(v=>v==null)) continue;
    map.set(item.itemType,Object.freeze({
      itemType:item.itemType, modelType:item.modelType, group:item.group, index:item.index,
      name, path:modelPath(item.group,name), color:null, effectType:0, owner:'CustomWings.lua',
      customWing:true, wingModelType:modelType, isCape:isCape>0, isCapeCount:isCape,
      defenseConstA:ints[0], incDamageConstA:ints[1], incDamageConstB:ints[2],
      decDamageConstA:ints[3], decDamageConstB:ints[4],
      optionPairs:Object.freeze([[ints[5],ints[6]],[ints[7],ints[8]],[ints[9],ints[10]]]),
      newOptionPairs:Object.freeze([[ints[11],ints[12]],[ints[13],ints[14]],[ints[15],ints[16]],[ints[17],ints[18]]]),
    }));
  }
  return map;
}

function parseAssignmentTables(text, tableName) {
  const clean=luaCodeMask(text), out=new Map();
  const re=new RegExp(`(?:^|[^\\w.:])${tableName.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\s*\\[\\s*GET_ITEM_MODEL\\s*\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*\\)\\s*\\]\\s*=\\s*\\{([^}]*)\\}`,'gim');
  let m; while((m=re.exec(clean))) {
    const group=Number(m[1]), index=Number(m[2]), body=m[3], fields={};
    // Main Lua 5.2 numeric table literals are complete tokens. The previous
    // prefix regex turned posX=1e-3 into 1 and posX=1+2 into 1, publishing a
    // false BMD cape offset. Parse full comma/semicolon-separated literals;
    // dynamic expressions remain fail-closed until a real Lua owner evaluates them.
    for(const part of body.split(/[;,]/)){
      const fm=/^\s*([A-Za-z_]\w*)\s*=\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*$/.exec(part);
      if(!fm)continue;
      const value=Number(fm[2]);
      if(Number.isFinite(value))fields[fm[1]]=value;
    }
    out.set(group*512+index,{group,index,itemType:group*512+index,modelType:group*512+index+ITEM_MODEL_BASE,fields});
  }
  return out;
}

export function parseCharacterCreateCapeLua(input) {
  const pos=parseAssignmentTables(input,'CAPE_SYSTEM_SET_POSITION');
  const bone=parseAssignmentTables(input,'CAPE_SYSTEM_SET_BONE');
  const out=new Map();
  for(const [itemType,rec] of pos) {
    const f=rec.fields;
    if(['posX','posY','posZ','matrixX','matrixY','matrixZ'].some(k=>!Number.isFinite(f[k]))) continue;
    const b=bone.get(itemType)?.fields?.Bone;
    out.set(itemType,Object.freeze({
      itemType, bone:Number.isFinite(b)?b:null,
      angles:Object.freeze([f.posX,f.posY,f.posZ]),
      matrix:Object.freeze([f.matrixX,f.matrixY,f.matrixZ]),
    }));
  }
  return out;
}

async function loadFirst(paths,parser,fetchBinary) {
  let last=null;
  for(const path of paths) {
    try {
      const bytes=await fetchBinary(path); if(!bytes)continue;
      const text=decodePcLuaText(bytes); assertPcLuaScriptCompiles(text,path); const value=parser(text);
      if(!(value instanceof Map) || value.size===0) throw new Error(`${path}: owner sem entradas ativas reconhecíveis`);
      return {path,value};
    } catch(e) { last=e; }
  }
  throw last || new Error(`owner ausente: ${paths.join(', ')}`);
}

let _registry=new Map();
const EMPTY_META=Object.freeze({loaded:false,count:0,loadItens:0,wings:0,capes:0,paths:Object.freeze({})});
let _meta=EMPTY_META;
let _authority=null;
let _inflight=null;
let _inflightAuthority=null;
const currentOwnerReady=()=>_meta.loaded && _authority===RemoteAssets.authorityKey;
export function currentClientItemModelForType(itemType){return currentOwnerReady()?(_registry.get(Number(itemType))||null):null;}
export function currentClientItemOwnerSnapshot(){return currentOwnerReady()?new Map(_registry):new Map();}
export function currentClientItemOwnerMeta(){return currentOwnerReady()?_meta:EMPTY_META;}

export async function loadCurrentClientItemOwners(fetchBinary=(p)=>RemoteAssets.fetchBinary(p)) {
  const authority=RemoteAssets.authorityKey;
  if(currentOwnerReady())return _meta;
  if(_inflight && _inflightAuthority===authority)return _inflight;
  const request=(async()=>{
    // FIX41 recovery: each desktop Lua owner is independent. A malformed or
    // absent CharacterCreateCape.lua must never suppress valid LoadItens.lua or
    // CustomWings.lua tables. Publish the union of every owner that validated.
    const [liResult,cwResult,ccResult]=await Promise.allSettled([
      loadFirst(LOAD_ITENS_PATHS,parseLoadItensLua,fetchBinary),
      loadFirst(CUSTOM_WINGS_PATHS,parseCustomWingsLua,fetchBinary),
      loadFirst(CUSTOM_CAPE_PATHS,parseCharacterCreateCapeLua,fetchBinary),
    ]);
    // A newer physical Data revision may become active while three Lua files
    // load concurrently. Do not publish stale custom wings/items/cape owners.
    if(RemoteAssets.authorityKey!==authority)return currentClientItemOwnerMeta();
    const ownerValue=(r)=>r.status==='fulfilled'?r.value:{path:null,value:new Map()};
    const li=ownerValue(liResult), cw=ownerValue(cwResult), cc=ownerValue(ccResult);
    for (const [name,result] of [['LoadItens',liResult],['CustomWings',cwResult],['CharacterCreateCape',ccResult]]) {
      if (result.status==='rejected') console.warn(`[CurrentClientItemOwners] ${name} indisponível; owner isolado: ${result.reason?.message||result.reason}`);
    }
    const next=new Map(li.value);
    for(const [type,wing] of cw.value) {
      const cape=cc.value.get(type)||null;
      next.set(type,Object.freeze({...wing,cape}));
    }
    // Atomic publish of the validated union: no partially-mutated table leaks.
    _registry=next;
    _authority=authority;
    _meta=Object.freeze({loaded:true,count:next.size,loadItens:li.value.size,wings:cw.value.size,capes:cc.value.size,paths:Object.freeze({loadItens:li.path,wings:cw.path,capes:cc.path}),errors:Object.freeze({loadItens:liResult.status==='rejected',wings:cwResult.status==='rejected',capes:ccResult.status==='rejected'})});
    console.info(`[CurrentClientItemOwners] real owners loaded independently: LoadItens=${li.value.size} CustomWings=${cw.value.size} CapePos=${cc.value.size} total=${next.size}`);
    return _meta;
  })();
  _inflight=request;
  _inflightAuthority=authority;
  return request.finally(()=>{if(_inflight===request){_inflight=null;_inflightAuthority=null;}});
}

export function resetCurrentClientItemOwnersForTests(){_registry=new Map();_meta=EMPTY_META;_authority=null;_inflight=null;_inflightAuthority=null;}
