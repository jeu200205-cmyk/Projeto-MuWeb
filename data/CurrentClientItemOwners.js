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

function stripLuaComments(input='') {
  const s=String(input ?? '');
  let out='', i=0, quote=null, longDepth=0;
  while (i<s.length) {
    const c=s[i], n=s[i+1];
    if (quote) {
      out+=c;
      if (c==='\\' && i+1<s.length) { out+=s[++i]; i++; continue; }
      if (c===quote) quote=null;
      i++; continue;
    }
    if (longDepth) {
      if (c===']' && n===']') { longDepth=0; i+=2; }
      else i++;
      continue;
    }
    if (c==='"' || c==="'") { quote=c; out+=c; i++; continue; }
    if (c==='-' && n==='-') {
      if (s[i+2]==='[' && s[i+3]==='[') { longDepth=1; i+=4; continue; }
      i+=2; while(i<s.length && s[i] !== '\n') i++;
      if (i<s.length) out+='\n';
      continue;
    }
    out+=c; i++;
  }
  return out;
}

function splitArgs(raw='') {
  const out=[]; let cur='', depth=0, quote=null;
  for (let i=0;i<raw.length;i++) {
    const c=raw[i];
    if (quote) {
      cur+=c;
      if (c==='\\' && i+1<raw.length) cur+=raw[++i];
      else if (c===quote) quote=null;
      continue;
    }
    if (c==='"' || c==="'") { quote=c; cur+=c; continue; }
    if (c==='(' || c==='{' || c==='[') depth++;
    else if (c===')' || c==='}' || c===']') depth--;
    if (c===',' && depth===0) { out.push(cur.trim()); cur=''; }
    else cur+=c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function numberToken(raw) {
  const s=String(raw??'').trim();
  if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
  const n=Number(s); return Number.isFinite(n)?n:null;
}
function stringToken(raw) {
  const s=String(raw??'').trim(); const m=/^(['"])([\s\S]*)\1$/.exec(s); return m?m[2]:null;
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
  return `${dir}/${name}.bmd`;
}

export function parseLoadItensLua(input) {
  const text=stripLuaComments(input);
  const map=new Map();
  const re=/\bLoadItem\s*\(([^\n]*)\)/g; let m;
  while((m=re.exec(text))) {
    const a=splitArgs(m[1]);
    if(a.length<5 || a.length>6) continue;
    const item=itemToken(a[0],true), r=numberToken(a[1]), g=numberToken(a[2]), b=numberToken(a[3]), name=stringToken(a[4]);
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
  const text=stripLuaComments(input);
  const map=new Map();
  const re=/\bLoadWing\s*\(([^\n]*)\)/g; let m;
  while((m=re.exec(text))) {
    const a=splitArgs(m[1]); if(a.length!==23) continue;
    const item=itemToken(a[0],false), modelType=numberToken(a[20]), isCape=numberToken(a[21]), name=stringToken(a[22]);
    if(!item || modelType==null || isCape==null || !name) continue;
    const ints=a.slice(1,20).map(numberToken); if(ints.some(v=>v==null)) continue;
    map.set(item.itemType,Object.freeze({
      itemType:item.itemType, modelType:item.modelType, group:item.group, index:item.index,
      name, path:`Item/${name}.bmd`, color:null, effectType:0, owner:'CustomWings.lua',
      customWing:true, wingModelType:modelType, isCape:isCape!==0,
      defenseConstA:ints[0], incDamageConstA:ints[1], incDamageConstB:ints[2],
      decDamageConstA:ints[3], decDamageConstB:ints[4],
      optionPairs:Object.freeze([[ints[5],ints[6]],[ints[7],ints[8]],[ints[9],ints[10]]]),
      newOptionPairs:Object.freeze([[ints[11],ints[12]],[ints[13],ints[14]],[ints[15],ints[16]],[ints[17],ints[18]]]),
    }));
  }
  return map;
}

function parseAssignmentTables(text, tableName) {
  const clean=stripLuaComments(text), out=new Map();
  const re=new RegExp(`${tableName.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\s*\\[\\s*GET_ITEM_MODEL\\s*\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*\\)\\s*\\]\\s*=\\s*\\{([^}]*)\\}`,'gi');
  let m; while((m=re.exec(clean))) {
    const group=Number(m[1]), index=Number(m[2]), body=m[3], fields={};
    for(const fm of body.matchAll(/\b(\w+)\s*=\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+))/g)) fields[fm[1]]=Number(fm[2]);
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
      const text=decodePcLuaText(bytes); const value=parser(text);
      if(!(value instanceof Map) || value.size===0) throw new Error(`${path}: owner sem entradas ativas reconhecíveis`);
      return {path,value};
    } catch(e) { last=e; }
  }
  throw last || new Error(`owner ausente: ${paths.join(', ')}`);
}

let _registry=new Map();
let _meta=Object.freeze({loaded:false,count:0,loadItens:0,wings:0,capes:0,paths:Object.freeze({})});
let _inflight=null;
export function currentClientItemModelForType(itemType){return _registry.get(Number(itemType))||null;}
export function currentClientItemOwnerSnapshot(){return new Map(_registry);}
export function currentClientItemOwnerMeta(){return _meta;}

export async function loadCurrentClientItemOwners(fetchBinary=(p)=>RemoteAssets.fetchBinary(p)) {
  if(_meta.loaded)return _meta;
  if(_inflight)return _inflight;
  _inflight=(async()=>{
    // FIX41 recovery: each desktop Lua owner is independent. A malformed or
    // absent CharacterCreateCape.lua must never suppress valid LoadItens.lua or
    // CustomWings.lua tables. Publish the union of every owner that validated.
    const [liResult,cwResult,ccResult]=await Promise.allSettled([
      loadFirst(LOAD_ITENS_PATHS,parseLoadItensLua,fetchBinary),
      loadFirst(CUSTOM_WINGS_PATHS,parseCustomWingsLua,fetchBinary),
      loadFirst(CUSTOM_CAPE_PATHS,parseCharacterCreateCapeLua,fetchBinary),
    ]);
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
    _meta=Object.freeze({loaded:true,count:next.size,loadItens:li.value.size,wings:cw.value.size,capes:cc.value.size,paths:Object.freeze({loadItens:li.path,wings:cw.path,capes:cc.path}),errors:Object.freeze({loadItens:liResult.status==='rejected',wings:cwResult.status==='rejected',capes:ccResult.status==='rejected'})});
    console.info(`[CurrentClientItemOwners] real owners loaded independently: LoadItens=${li.value.size} CustomWings=${cw.value.size} CapePos=${cc.value.size} total=${next.size}`);
    return _meta;
  })().finally(()=>{_inflight=null;});
  return _inflight;
}

export function resetCurrentClientItemOwnersForTests(){_registry=new Map();_meta=Object.freeze({loaded:false,count:0,loadItens:0,wings:0,capes:0,paths:Object.freeze({})});_inflight=null;}
