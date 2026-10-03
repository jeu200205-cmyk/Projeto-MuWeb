import { decodePcLuaText } from './PcLuaCrypt.js';
/**
 * Runtime owner for the current client's real Lua item presentation tables.
 *
 * Desktop authority:
 *   ItemPosition.cpp -> SetItemPosition(ItemIndex, PosX, PosY, AngleX, AngleY, AngleZ)
 *   ItemSize.cpp     -> SetItemSize(ItemIndex, SizeInventory)
 *   Data/Configs/Lua/Configs/CustomItemPosition.lua
 *   Data/Configs/Lua/Configs/CustomItemSize.lua
 *
 * No embedded rows and no guessed replacement values live here. If the exact
 * client files are unavailable or cannot be parsed, callers fall back only to
 * the stock Main 5.2 RenderObjectScreen branches already ported elsewhere.
 */

const MAX_ITEM_INDEX = 512;
const MAX_ITEM = 16 * MAX_ITEM_INDEX;
const POS_PATHS = [
  'Configs/lua/Configs/CustomItemPosition.lua',
  'Configs/Lua/Configs/CustomItemPosition.lua',
  'Configs/crypt/Configs/CustomItemPosition.lua',
];
const SIZE_PATHS = [
  'Configs/lua/Configs/CustomItemSize.lua',
  'Configs/Lua/Configs/CustomItemSize.lua',
  'Configs/crypt/Configs/CustomItemSize.lua',
];

let _loaded = false;
let _inflight = null;
let _positions = new Map();
let _sizes = new Map();
let _status = Object.freeze({ loaded:false, positionPath:null, sizePath:null, positions:0, sizes:0 });

function stripLuaComments(input='') {
  const s = String(input || '');
  let out = '', i = 0, quote = null;
  while (i < s.length) {
    const c=s[i], n=s[i+1];
    if (quote) {
      out += c;
      if (c === '\\' && i + 1 < s.length) { out += s[++i]; i++; continue; }
      if (c === quote) quote = null;
      i++; continue;
    }
    if (c === '"' || c === "'") { quote=c; out+=c; i++; continue; }
    if (c === '-' && n === '-') {
      // --[[ block comment ]]
      if (s[i+2] === '[' && s[i+3] === '[') {
        const end=s.indexOf(']]', i+4); i=end<0?s.length:end+2; continue;
      }
      i += 2; while (i < s.length && s[i] !== '\n') i++; continue;
    }
    out += c; i++;
  }
  return out;
}

function itemTypeFromBlock(block) {
  const m = /GET_ITEM\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/i.exec(block);
  if (!m) return -1;
  const g=Number(m[1]), idx=Number(m[2]);
  if (!Number.isInteger(g) || !Number.isInteger(idx) || g < 0 || g >= 16 || idx < 0 || idx >= MAX_ITEM_INDEX) return -1;
  return g * MAX_ITEM_INDEX + idx;
}

function numField(block, key) {
  const re = new RegExp(`\\b${key}\\s*=\\s*([-+]?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)`, 'i');
  const m = re.exec(block);
  if (!m) return null;
  const v=Number(m[1]); return Number.isFinite(v) ? v : null;
}

function boolField(block, key) {
  const re = new RegExp(`\\b${key}\\s*=\\s*(true|false)`, 'i');
  const m = re.exec(block); return m ? m[1].toLowerCase() === 'true' : null;
}


function splitLuaArgs(body) {
  const out=[]; let start=0,depth=0,quote=null;
  for(let i=0;i<body.length;i++){const c=body[i];if(quote){if(c==='\\')i++;else if(c===quote)quote=null;continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='('||c==='{'||c==='[')depth++;else if(c===')'||c==='}'||c===']')depth--;else if(c===','&&depth===0){out.push(body.slice(start,i).trim());start=i+1;}}
  out.push(body.slice(start).trim()); return out;
}
function scanLuaCalls(text,name){
  const out=[];let p=0;while((p=text.indexOf(name,p))>=0){let i=p+name.length;while(/\s/.test(text[i]||''))i++;if(text[i]!== '('){p=i;continue;}const open=i;let depth=0,quote=null,end=-1;for(;i<text.length;i++){const c=text[i];if(quote){if(c==='\\')i++;else if(c===quote)quote=null;continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='(')depth++;else if(c===')'){depth--;if(depth===0){end=i;break;}}}if(end<0)break;out.push(splitLuaArgs(text.slice(open+1,end)));p=end+1;}return out;
}
function literalNumber(expr){const t=String(expr||'').trim();if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(t))return null;const v=Number(t);return Number.isFinite(v)?v:null;}
function literalItem(expr){const type=itemTypeFromBlock(String(expr||''));if(type>=0)return type;const v=literalNumber(expr);return Number.isInteger(v)&&v>=0&&v<MAX_ITEM?v:-1;}

function findTable(text, name) {
  const p=text.indexOf(name); if (p < 0) return null;
  const open=text.indexOf('{', p); if (open < 0) return null;
  let depth=0, quote=null;
  for (let i=open;i<text.length;i++) {
    const c=text[i];
    if (quote) { if (c==='\\') i++; else if(c===quote) quote=null; continue; }
    if (c==='"'||c==="'") {quote=c; continue;}
    if (c==='{') depth++;
    else if(c==='}') { depth--; if(depth===0) return text.slice(open, i+1); }
  }
  return null;
}

function findEntryAroundGetItem(table, getPos) {
  let open=-1;
  for (let i=getPos;i>=0;i--) { if (table[i]==='{') { open=i; break; } }
  if (open < 0) return null;
  let depth=0, quote=null;
  for (let i=open;i<table.length;i++) {
    const c=table[i];
    if (quote) { if (c==='\\') i++; else if(c===quote) quote=null; continue; }
    if (c==='"'||c==="'") {quote=c; continue;}
    if(c==='{') depth++;
    else if(c==='}') {
      depth--;
      if(depth===0) return { block:table.slice(open,i+1), start:open, end:i+1 };
      if(depth<0)return null;
    }
  }
  return null;
}

export function parseCustomItemPositionLua(source) {
  const text=stripLuaComments(source);
  const out=new Map();
  // Exact C++ Lua callback owner: SetItemPosition(ItemIndex, PosX, PosY,
  // AngleX, AngleY, AngleZ).  Literal calls are authoritative even when this
  // client's Lua does not expose the historical CUSTOM_ITEM_POSITION table.
  for(const a of scanLuaCalls(text,'SetItemPosition')){
    if(a.length<6)continue;const type=literalItem(a[0]);const v=a.slice(1,6).map(literalNumber);
    if(type>=0&&v.every(Number.isFinite))out.set(type,{posX:v[0],posY:v[1],angleX:v[2],angleY:v[3],angleZ:v[4]});
  }
  const table=findTable(text,'CUSTOM_ITEM_POSITION');
  if(!table) return out;
  let p=0;
  while((p=table.indexOf('GET_ITEM',p))>=0) {
    const entry=findEntryAroundGetItem(table,p); if(!entry){p+=8;continue;}
    const block=entry.block;
    const type=itemTypeFromBlock(block);
    const pp=block.indexOf('Position');
    const pe=pp>=0?block.indexOf('Size',pp):-1;
    const posBlock=pp>=0?block.slice(pp,pe>=0?pe:undefined):'';
    if(type>=0 && boolField(posBlock,'Enabled')===true && !out.has(type)) {
      const posX=numField(posBlock,'PosX'),posY=numField(posBlock,'PosY');
      const angleX=numField(posBlock,'AngleX'),angleY=numField(posBlock,'AngleY'),angleZ=numField(posBlock,'AngleZ');
      if([posX,posY,angleX,angleY,angleZ].every(Number.isFinite)) out.set(type,{posX,posY,angleX,angleY,angleZ});
    }
    p = Math.max(p + 8, entry.end);
  }
  return out;
}

export function parseCustomItemSizeLua(source) {
  const text=stripLuaComments(source);
  const out=new Map();
  // Exact C++ Lua callback owner: SetItemSize(ItemIndex, SizeInventory).
  for(const a of scanLuaCalls(text,'SetItemSize')){
    if(a.length<2)continue;const type=literalItem(a[0]),size=literalNumber(a[1]);
    if(type>=0&&Number.isFinite(size)&&size>0)out.set(type,size);
  }
  const table=findTable(text,'CUSTOM_ITEM_SIZE');
  if(!table) return out;
  let p=0;
  while((p=table.indexOf('GET_ITEM',p))>=0) {
    const entry=findEntryAroundGetItem(table,p); if(!entry){p+=8;continue;}
    const block=entry.block;
    const type=itemTypeFromBlock(block), size=numField(block,'SizeInventory');
    if(type>=0 && Number.isFinite(size) && size>0 && !out.has(type)) out.set(type,size);
    p = Math.max(p + 8, entry.end);
  }
  return out;
}

async function readParsed(fetchBinary, paths, parse) {
  let first=null,last=null;
  for(const p of paths) {
    try {
      const b=await fetchBinary(p); if(!b) continue;
      const u=b instanceof Uint8Array?b:new Uint8Array(b);
      const text=decodePcLuaText(u);
      if(!first)first={path:p,text};
      const value=parse(text);
      if(value?.size)return {path:p,text,value};
    } catch(e){last=e;}
  }
  return {...(first||{path:null,text:null}),value:new Map(),error:last};
}

export async function loadCustomItemPresentation(fetchBinary) {
  if (_loaded) return _status;
  if (_inflight) return _inflight;
  if (typeof fetchBinary !== 'function') return _status;
  _inflight=(async()=>{
    const [p,s]=await Promise.all([readParsed(fetchBinary,POS_PATHS,parseCustomItemPositionLua),readParsed(fetchBinary,SIZE_PATHS,parseCustomItemSizeLua)]);
    _positions=p.value||new Map();
    _sizes=s.value||new Map();
    _loaded=true;
    _status=Object.freeze({loaded:true,positionPath:p.path,sizePath:s.path,positions:_positions.size,sizes:_sizes.size});
    console.info(`[ItemPresentation] CustomItemPosition=${_positions.size} (${p.path||'missing'}) CustomItemSize=${_sizes.size} (${s.path||'missing'})`);
    return _status;
  })().finally(()=>{_inflight=null;});
  return _inflight;
}

export function customItemPosition(itemType) { return _positions.get(itemType) || null; }
export function customItemSize(itemType) { return _sizes.get(itemType) ?? null; }
export function customItemPresentationStatus() { return _status; }

export const CUSTOM_ITEM_PRESENTATION_MAX_ITEM = MAX_ITEM;
