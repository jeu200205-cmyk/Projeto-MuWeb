/**
 * DisableExcellentLua.js — exact current-client excellent/ancient visual veto.
 *
 * PC authority: DisableExcellent.cpp + Configs/DisableExcellent.lua.
 * SetDisableExcellent receives GET_ITEM_MODEL(...), and RenderPartObjectEffect
 * suppresses both the Excellent TEXTURE|BRIGHT tail and the Ancient/Set
 * CHROME3|BRIGHT tail for those model types.
 *
 * Web material ownership is keyed by protocol itemType, so the parser converts
 * GET_ITEM_MODEL(group,index) back to GET_ITEM(group,index). No rows are added.
 */
import { RemoteAssets } from './RemoteAssets.js';
import { decodePcLuaText } from './PcLuaCrypt.js';

const MODEL_ITEM = 1095;
export const DISABLE_EXCELLENT_PATHS = Object.freeze([
  'Configs/lua/Configs/DisableExcellent.lua',
  'Configs/Lua/Configs/DisableExcellent.lua',
  'Configs/crypt/Configs/DisableExcellent.lua',
]);

function stripComments(input=''){
  const s=String(input??'');let out='',i=0,q=null,long=false;
  while(i<s.length){const c=s[i],n=s[i+1];if(q){out+=c;if(c==='\\'&&i+1<s.length){out+=s[++i];i++;continue;}if(c===q)q=null;i++;continue;}if(long){if(c===']'&&n===']'){long=false;i+=2;}else i++;continue;}if(c==='"'||c==="'"){q=c;out+=c;i++;continue;}if(c==='-'&&n==='-'){if(s[i+2]==='['&&s[i+3]==='['){long=true;i+=4;continue;}i+=2;while(i<s.length&&s[i]!=='\n')i++;if(i<s.length)out+='\n';continue;}out+=c;i++;}
  return out;
}
function modelToken(raw){
  const s=String(raw??'').trim();
  let m=/^GET_ITEM_MODEL\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(s);
  if(m){const group=Number(m[1]),index=Number(m[2]),itemType=group*512+index;return {group,index,itemType,modelType:itemType+MODEL_ITEM};}
  if(/^\d+$/.test(s)){const modelType=Number(s);const itemType=modelType-MODEL_ITEM;if(itemType<0)return null;return {group:Math.floor(itemType/512),index:itemType%512,itemType,modelType};}
  return null;
}

export function parseDisableExcellentLua(input){
  const text=stripComments(input),out=new Map();
  // Direct native callback form.
  for(const m of text.matchAll(/\bSetDisableExcellent\s*\(\s*(GET_ITEM_MODEL\s*\(\s*\d+\s*,\s*\d+\s*\)|\d+)\s*\)/gi)){
    const r=modelToken(m[1]);if(r)out.set(r.itemType,Object.freeze({...r,owner:'DisableExcellent.lua'}));
  }
  // Current client table form. Duplicate source rows collapse exactly like
  // std::map::insert: membership remains one boolean owner for that model.
  for(const m of text.matchAll(/\bItemIndex\s*=\s*(GET_ITEM_MODEL\s*\(\s*\d+\s*,\s*\d+\s*\))/gi)){
    const r=modelToken(m[1]);if(r)out.set(r.itemType,Object.freeze({...r,owner:'DisableExcellent.lua'}));
  }
  return out;
}

let registry=new Map(),status=Object.freeze({loaded:false,count:0,path:null}),inflight=null;
export function isExcellentDisabledForItemType(type){return registry.has(Number(type));}
export function disableExcellentSnapshot(){return new Map(registry);}
export function disableExcellentStatus(){return status;}
export async function loadDisableExcellentLua(fetchBinary=(p)=>RemoteAssets.fetchBinary(p)){
  if(status.loaded)return status;if(inflight)return inflight;
  inflight=(async()=>{let last=null;for(const path of DISABLE_EXCELLENT_PATHS){try{const b=await fetchBinary(path);if(!b)continue;const next=parseDisableExcellentLua(decodePcLuaText(b));if(!next.size)throw new Error(`${path}: nenhum SetDisableExcellent ativo reconhecido`);registry=next;status=Object.freeze({loaded:true,count:next.size,path});console.info(`[DisableExcellent] owner real carregado ${path} rows=${next.size}`);return status;}catch(e){last=e;}}throw last||new Error('DisableExcellent.lua ausente');})().finally(()=>{inflight=null;});
  return inflight;
}
export function resetDisableExcellentLuaForTests(){registry=new Map();status=Object.freeze({loaded:false,count:0,path:null});inflight=null;}
