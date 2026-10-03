/**
 * Current-client item transparency owner.
 * PC authority: transparente.cpp + Configs/lua/Configs/transparente.lua.
 * Lua callback: LoadTransparency(GET_ITEM(section,index), alpha 0..1).
 * No guessed defaults are embedded here; absent rows mean alpha=1 exactly as PC.
 */
import { RemoteAssets } from './RemoteAssets.js';
import { decodePcLuaText } from './PcLuaCrypt.js';

export const ITEM_TRANSPARENCY_PATHS = Object.freeze([
  'Configs/lua/Configs/transparente.lua',
  'Configs/Lua/Configs/transparente.lua',
  'Configs/crypt/Configs/transparente.lua',
]);

function stripComments(input='') {
  const s=String(input??''); let out='',i=0,q=null,long=false;
  while(i<s.length){const c=s[i],n=s[i+1];if(q){out+=c;if(c==='\\'&&i+1<s.length){out+=s[++i];i++;continue;}if(c===q)q=null;i++;continue;}if(long){if(c===']'&&n===']'){long=false;i+=2;}else i++;continue;}if(c==='"'||c==="'"){q=c;out+=c;i++;continue;}if(c==='-'&&n==='-'){if(s[i+2]==='['&&s[i+3]==='['){long=true;i+=4;continue;}i+=2;while(i<s.length&&s[i]!=='\n')i++;if(i<s.length)out+='\n';continue;}out+=c;i++;}
  return out;
}
function itemExpr(raw){
  const s=String(raw??'').trim();
  const m=/^GET_ITEM\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(s);
  if(m){const g=Number(m[1]),idx=Number(m[2]);if(g>=0&&g<16&&idx>=0&&idx<512)return g*512+idx;return null;}
  if(/^\d+$/.test(s)){const v=Number(s);return v>=0&&v<8192?v:null;}
  return null;
}
export function parseItemTransparencyLua(input){
  const text=stripComments(input),out=new Map();
  for(const m of text.matchAll(/\bLoadTransparency\s*\(\s*(GET_ITEM\s*\(\s*\d+\s*,\s*\d+\s*\)|\d+)\s*,\s*([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)\s*\)/gi)){
    const type=itemExpr(m[1]); let alpha=Number(m[2]);
    if(type==null||!Number.isFinite(alpha))continue;
    alpha=Math.max(0,Math.min(1,alpha)); out.set(type,alpha);
  }
  // Retained clients may wrap the callbacks in a table. Accept only an exact
  // GET_ITEM + numeric Transparency row; this mirrors LuaLoadTransparency.
  for(const m of text.matchAll(/\{[^{}]*?(?:ItemIndex|Index)\s*=\s*(GET_ITEM\s*\(\s*\d+\s*,\s*\d+\s*\))[^{}]*?Transparency\s*=\s*([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)[^{}]*?\}/gi)){
    const type=itemExpr(m[1]); let alpha=Number(m[2]);
    if(type==null||!Number.isFinite(alpha)||out.has(type))continue;
    alpha=Math.max(0,Math.min(1,alpha)); out.set(type,alpha);
  }
  return out;
}

let registry=new Map(),status=Object.freeze({loaded:false,count:0,path:null}),inflight=null;
export function itemTransparencyForType(type){const v=registry.get(Number(type));return Number.isFinite(v)?v:null;}
export function itemTransparencyStatus(){return status;}
export function itemTransparencySnapshot(){return new Map(registry);}
export async function loadItemTransparencyLua(fetchBinary=(p)=>RemoteAssets.fetchBinary(p)){
  if(status.loaded)return status;if(inflight)return inflight;
  inflight=(async()=>{let last=null;for(const path of ITEM_TRANSPARENCY_PATHS){try{const b=await fetchBinary(path);if(!b)continue;const next=parseItemTransparencyLua(decodePcLuaText(b));registry=next;status=Object.freeze({loaded:true,count:next.size,path});console.info(`[ItemTransparency] owner real carregado ${path} rows=${next.size}`);return status;}catch(e){last=e;}}throw last||new Error('transparente.lua ausente');})().finally(()=>{inflight=null;});
  return inflight;
}
export function resetItemTransparencyLuaForTests(){registry=new Map();status=Object.freeze({loaded:false,count:0,path:null});inflight=null;}
