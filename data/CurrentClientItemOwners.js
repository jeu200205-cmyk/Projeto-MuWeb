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
  let out='', i=0, quote=null;
  const longOpenAt=(at)=>{
    if(s[at] !== '[') return null;
    let j=at+1; while(s[j] === '=') j++;
    return s[j] === '[' ? {eq:j-at-1,end:j+1} : null;
  };
  while (i<s.length) {
    const c=s[i], n=s[i+1];
    if (quote) {
      out+=c;
      if (c==='\\' && i+1<s.length) { out+=s[++i]; i++; continue; }
      if (c===quote) quote=null;
      i++; continue;
    }
    if (c==='"' || c==="'") { quote=c; out+=c; i++; continue; }
    if (c==='-' && n==='-') {
      const open=longOpenAt(i+2);
      if(open){
        const close=']'+'='.repeat(open.eq)+']';
        const end=s.indexOf(close,open.end);
        // Lua long comments are comments through EOF when malformed/unclosed;
        // fail closed instead of reviving a disabled LoadItem/LoadWing owner.
        if(end<0) break;
        // Preserve line boundaries so diagnostics/source-relative behavior do
        // not collapse after stripping a multiline current-client owner block.
        const body=s.slice(i,end+close.length);
        out+='\n'.repeat((body.match(/\n/g)||[]).length);
        i=end+close.length; continue;
      }
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

function callBodies(text, name) {
  const out=[]; const re=new RegExp(`\\b${name}\\s*\\(`,'g'); let m;
  while((m=re.exec(text))){
    let i=re.lastIndex, start=i, depth=1, quote=null;
    for(;i<text.length;i++){
      const c=text[i];
      if(quote){ if(c==='\\\\'){i++;continue;} if(c===quote)quote=null; continue; }
      if(c==='\"'||c==="'"){quote=c;continue;}
      if(c==='(')depth++; else if(c===')' && --depth===0){out.push(text.slice(start,i));re.lastIndex=i+1;break;}
    }
  }
  return out;
}

function modelPath(group,name) {
  const dir=group>=7 && group<12 ? 'Player' : 'Item';
  return `${dir}/${name}.bmd`;
}

export function parseLoadItensLua(input) {
  const text=stripLuaComments(input);
  const map=new Map();
  for(const body of callBodies(text,'LoadItem')) {
    const a=splitArgs(body);
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

function normalizeDeclaredWingFolder(raw) {
  if (raw == null) return null;
  let s=String(raw).trim().replace(/\\/g,'/');
  s=s.replace(/^\.\//,'').replace(/^Data\//i,'').replace(/^\/+/, '').replace(/\/{2,}/g,'/');
  if (!s || /(^|\/)\.\.(?:\/|$)/.test(s) || /^[A-Za-z]:\//.test(s)) return null;
  if (!s.endsWith('/')) s+='/';
  return s;
}

export function parseCustomWingsLua(input) {
  const text=stripLuaComments(input);
  const map=new Map();
  for(const body of callBodies(text,'LoadWing')) {
    const a=splitArgs(body);
    // Main 5.2 native owner: 23 args. Some field clients ship an extended
    // 25-arg owner preserving the same first 22 semantics and appending
    // explicit ModelFolder + ModelName + trailing metadata. Keep both layouts
    // independent; never reinterpret the native 23-arg call.
    if(a.length!==23 && a.length!==25) continue;
    const extended=a.length===25;
    const item=itemToken(a[0],false), modelType=numberToken(a[20]), isCape=numberToken(a[21]);
    const declaredFolder=extended?normalizeDeclaredWingFolder(stringToken(a[22])):null;
    const name=stringToken(a[extended?23:22]);
    const declaredTrailing=extended?numberToken(a[24]):null;
    if(!item || modelType==null || isCape==null || !name) continue;
    if(extended && (declaredFolder==null || declaredTrailing==null)) continue;
    const ints=a.slice(1,20).map(numberToken); if(ints.some(v=>v==null)) continue;
    const path=extended?`${declaredFolder}${name}.bmd`:`Item/${name}.bmd`;
    map.set(item.itemType,Object.freeze({
      itemType:item.itemType, modelType:item.modelType, group:item.group, index:item.index,
      name, path, color:null, effectType:0, owner:'CustomWings.lua',
      customWing:true, wingModelType:modelType, isCape:isCape>0, isCapeCount:isCape,
      wingSchema:extended?'extended25':'native23',
      declaredModelFolder:declaredFolder, declaredTrailing,
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

async function loadFirstText(paths,fetchBinary) {
  let last=null;
  for(const path of paths) {
    try {
      const bytes=await fetchBinary(path); if(!bytes)continue;
      return {path,text:decodePcLuaText(bytes)};
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
    // FIX94: the user's authoritative 2->1 Lua port keeps LoadWing(...) inside
    // LoadItens.lua so there is only one StartLoadItens owner.  Read that file
    // once and extract BOTH tables. A dedicated CustomWings.lua remains a
    // supported native/field layout and overrides by ItemID when physically
    // present; no second runtime loader is invented.
    const [liTextResult,cwResult,ccResult]=await Promise.allSettled([
      loadFirstText(LOAD_ITENS_PATHS,fetchBinary),
      loadFirst(CUSTOM_WINGS_PATHS,parseCustomWingsLua,fetchBinary),
      loadFirst(CUSTOM_CAPE_PATHS,parseCharacterCreateCapeLua,fetchBinary),
    ]);
    const liText=liTextResult.status==='fulfilled'?liTextResult.value:{path:null,text:''};
    const liValue=liText.text?parseLoadItensLua(liText.text):new Map();
    const liWings=liText.text?parseCustomWingsLua(liText.text):new Map();
    if(liTextResult.status==='fulfilled' && liValue.size===0)
      console.warn(`[CurrentClientItemOwners] ${liText.path}: LoadItens sem LoadItem reconhecível; mantendo owners independentes`);
    const dedicatedWings=cwResult.status==='fulfilled'?cwResult.value.value:new Map();
    const wings=new Map(liWings);
    for(const [type,row] of dedicatedWings) wings.set(type,row);
    const cc=ccResult.status==='fulfilled'?ccResult.value:{path:null,value:new Map()};
    if(liTextResult.status==='rejected') console.warn(`[CurrentClientItemOwners] LoadItens indisponível; owner isolado: ${liTextResult.reason?.message||liTextResult.reason}`);
    if(cwResult.status==='rejected' && liWings.size===0) console.warn(`[CurrentClientItemOwners] CustomWings indisponível e LoadItens não contém LoadWing ativo: ${cwResult.reason?.message||cwResult.reason}`);
    if(ccResult.status==='rejected') console.warn(`[CurrentClientItemOwners] CharacterCreateCape indisponível; owner isolado: ${ccResult.reason?.message||ccResult.reason}`);
    if(liValue.size===0 && wings.size===0 && cc.value.size===0) throw new Error('nenhum owner de item/wings/cape atual reconhecido');
    const next=new Map(liValue);
    for(const [type,wing] of wings) {
      const cape=cc.value.get(type)||null;
      next.set(type,Object.freeze({...wing,cape}));
    }
    // Atomic publish of the validated union: no partially-mutated table leaks.
    _registry=next;
    let wingsNative23=0,wingsExtended25=0;
    for(const w of wings.values()){if(w.wingSchema==='extended25')wingsExtended25++;else if(w.wingSchema==='native23')wingsNative23++;}
    _meta=Object.freeze({
      loaded:true,count:next.size,loadItens:liValue.size,wings:wings.size,
      wingsFromLoadItens:liWings.size,wingsDedicated:dedicatedWings.size,
      wingsNative23,wingsExtended25,capes:cc.value.size,
      paths:Object.freeze({loadItens:liText.path,wings:cwResult.status==='fulfilled'?cwResult.value.path:null,capes:cc.path}),
      errors:Object.freeze({loadItens:liTextResult.status==='rejected',wings:cwResult.status==='rejected'&&liWings.size===0,capes:ccResult.status==='rejected'})
    });
    console.info(`[CurrentClientItemOwners] owners reais: LoadItens=${liValue.size} Wings=${wings.size} (inLoadItens=${liWings.size} dedicated=${dedicatedWings.size} native23=${wingsNative23} extended25=${wingsExtended25}) CapePos=${cc.value.size} total=${next.size}`);
    return _meta;
  })().finally(()=>{_inflight=null;});
  return _inflight;
}

export function resetCurrentClientItemOwnersForTests(){_registry=new Map();_meta=Object.freeze({loaded:false,count:0,loadItens:0,wings:0,capes:0,paths:Object.freeze({})});_inflight=null;}
