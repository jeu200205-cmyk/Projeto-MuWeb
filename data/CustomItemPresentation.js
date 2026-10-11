import { decodePcLuaText } from './PcLuaCrypt.js';
import { RemoteAssets } from './RemoteAssets.js';
import { luaCodeMask,scanLuaGlobalCalls,assertPcLuaScriptCompiles } from './PcLuaStaticLex.js';
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
let _authority = null;
let _inflight = null;
let _inflightAuthority = null;
let _positions = new Map();
let _sizes = new Map();
let _status = Object.freeze({ loaded:false, positionPath:null, sizePath:null, positions:0, sizes:0 });

function itemTypeFromBlock(block) {
  const m = /(?:^|[^\w.:])GET_ITEM\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/i.exec(block);
  if (!m) return -1;
  const g=Number(m[1]), idx=Number(m[2]);
  if (!Number.isInteger(g) || !Number.isInteger(idx) || g < 0 || g >= 16 || idx < 0 || idx >= MAX_ITEM_INDEX) return -1;
  return g * MAX_ITEM_INDEX + idx;
}

function numField(block, key) {
  // A numeric field is one complete Lua literal, not a regex prefix.
  // PosX=1+2 previously published a fabricated position 1 while Lua
  // evaluates an expression. Preserve exact literals, fail closed otherwise.
  const re = new RegExp(`\\b${key}\\s*=\\s*([^,}\\n;]+)`, 'i');
  const m = re.exec(block);
  return m ? literalNumber(m[1]) : null;
}

function boolField(block, key) {
  const re = new RegExp(`\\b${key}\\s*=\\s*([^,}\\n;]+)`, 'i');
  const m = re.exec(block);
  const v=m?.[1]?.trim().toLowerCase();
  return v==='true'?true:v==='false'?false:null;
}


function literalNumber(expr){const t=String(expr||'').trim();if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(t))return null;const v=Number(t);return Number.isFinite(v)?v:null;}
function literalItem(expr){const type=itemTypeFromBlock(String(expr||''));if(type>=0)return type;const v=literalNumber(expr);return Number.isInteger(v)&&v>=0&&v<MAX_ITEM?v:-1;}

function findTable(text, name) {
  // Do not interpret CUSTOM_ITEM_POSITION_BACKUP or quoted/commented names
  // as the active Lua table. luaCodeMask already removed string/comment text.
  const match=new RegExp(`\\b${name}\\b\\s*=`, 'g').exec(text);
  if (!match) return null;
  const open=text.indexOf('{', match.index+match[0].length); if (open < 0) return null;
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
  const text=luaCodeMask(source);
  const out=new Map();
  // Exact C++ Lua callback owner: SetItemPosition(ItemIndex, PosX, PosY,
  // AngleX, AngleY, AngleZ).  Literal calls are authoritative even when this
  // client's Lua does not expose the historical CUSTOM_ITEM_POSITION table.
  for(const a of scanLuaGlobalCalls(source,'SetItemPosition')){
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
  const text=luaCodeMask(source);
  const out=new Map();
  // Exact C++ Lua callback owner: SetItemSize(ItemIndex, SizeInventory).
  for(const a of scanLuaGlobalCalls(source,'SetItemSize')){
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
      // A syntactically invalid Lua file never executes its SetItemPosition /
      // SetItemSize callbacks on Main 5.2. Do not publish regex-matched rows
      // from a script that the real Lua 5.2 VM would reject entirely.
      assertPcLuaScriptCompiles(text,p);
      if(!first)first={path:p,text};
      const value=parse(text);
      if(value?.size)return {path:p,text,value};
    } catch(e){last=e;}
  }
  return {...(first||{path:null,text:null}),value:new Map(),error:last};
}

export async function loadCustomItemPresentation(fetchBinary) {
  const authority=RemoteAssets.authorityKey;
  if (_loaded && _authority===authority) return _status;
  if (_inflight && _inflightAuthority===authority) return _inflight;
  if (typeof fetchBinary !== 'function') return customItemPresentationStatus();
  const request=(async()=>{
    const [p,s]=await Promise.all([readParsed(fetchBinary,POS_PATHS,parseCustomItemPositionLua),readParsed(fetchBinary,SIZE_PATHS,parseCustomItemSizeLua)]);
    // The Lua rows are derived from the selected physical Data revision.
    // A previous client's async fetch cannot publish after a root switch.
    if(RemoteAssets.authorityKey!==authority)return customItemPresentationStatus();
    _positions=p.value||new Map();
    _sizes=s.value||new Map();
    _authority=authority;
    _loaded=true;
    _status=Object.freeze({loaded:true,positionPath:p.path,sizePath:s.path,positions:_positions.size,sizes:_sizes.size});
    console.info(`[ItemPresentation] CustomItemPosition=${_positions.size} (${p.path||'missing'}) CustomItemSize=${_sizes.size} (${s.path||'missing'})`);
    return _status;
  })();
  _inflight=request;
  _inflightAuthority=authority;
  return request.finally(()=>{if(_inflight===request){_inflight=null;_inflightAuthority=null;}});
}

export function customItemPosition(itemType) { return _loaded && _authority===RemoteAssets.authorityKey ? (_positions.get(itemType)||null) : null; }
export function customItemSize(itemType) { return _loaded && _authority===RemoteAssets.authorityKey ? (_sizes.get(itemType)??null) : null; }
export function customItemPresentationStatus() { return _authority===RemoteAssets.authorityKey ? _status : Object.freeze({loaded:false,positionPath:null,sizePath:null,positions:0,sizes:0}); }

export const CUSTOM_ITEM_PRESENTATION_MAX_ITEM = MAX_ITEM;
