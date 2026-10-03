/**
 * CustomItemFloorLua.js — exact current-client dropped-item transform owner.
 *
 * PC authority: CustomItemFloor.cpp
 *   SetItemFloor(ItemIndex, AngleX, AngleY, AngleZ, Size)
 *   stores ItemIndex + MODEL_ITEM and CCustomItemFloor::AngleItem overrides the
 *   stock ItemAngle only when a real configured row exists.
 *
 * Web keeps the registry keyed by protocol itemType (GET_ITEM result). The
 * GroundItemLayer already owns the MODEL_ITEM/BMD translation, so this is
 * semantically identical without inventing a second model-number namespace.
 */
import { RemoteAssets } from './RemoteAssets.js';
import { decodePcLuaText } from './PcLuaCrypt.js';

export const CUSTOM_ITEM_FLOOR_PATHS = Object.freeze([
  'Configs/lua/Configs/CustomItemFloor.lua',
  'Configs/Lua/Configs/CustomItemFloor.lua',
  'Configs/crypt/Configs/CustomItemFloor.lua',
]);

function stripComments(input='') {
  const s=String(input ?? ''); let out='',i=0,q=null,long=false;
  while(i<s.length){
    const c=s[i],n=s[i+1];
    if(q){out+=c;if(c==='\\'&&i+1<s.length){out+=s[++i];i++;continue;}if(c===q)q=null;i++;continue;}
    if(long){if(c===']'&&n===']'){long=false;i+=2;}else i++;continue;}
    if(c==='"'||c==="'"){q=c;out+=c;i++;continue;}
    if(c==='-'&&n==='-'){
      if(s[i+2]==='['&&s[i+3]==='['){long=true;i+=4;continue;}
      i+=2;while(i<s.length&&s[i]!=='\n')i++;if(i<s.length)out+='\n';continue;
    }
    out+=c;i++;
  }
  return out;
}
function numberToken(v){const s=String(v??'').trim();if(!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))return null;const n=Number(s);return Number.isFinite(n)?n:null;}
function itemToken(v){const m=/^GET_ITEM\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(String(v??'').trim());if(!m)return null;const group=Number(m[1]),index=Number(m[2]);return {group,index,itemType:group*512+index};}
function splitArgs(raw=''){const out=[];let cur='',d=0,q=null;for(let i=0;i<raw.length;i++){const c=raw[i];if(q){cur+=c;if(c==='\\'&&i+1<raw.length)cur+=raw[++i];else if(c===q)q=null;continue;}if(c==='"'||c==="'"){q=c;cur+=c;continue;}if(c==='('||c==='{'||c==='[')d++;else if(c===')'||c==='}'||c===']')d--;if(c===','&&d===0){out.push(cur.trim());cur='';}else cur+=c;}if(cur.trim())out.push(cur.trim());return out;}

function put(out,item,ax,ay,az,size){
  if(!item||![ax,ay,az,size].every(Number.isFinite)||!(size>0))return;
  out.set(item.itemType,Object.freeze({itemType:item.itemType,group:item.group,index:item.index,ax,ay,az,size,owner:'CustomItemFloor.lua'}));
}

export function parseCustomItemFloorLua(input){
  const text=stripComments(input),out=new Map();
  // Direct callback form is accepted because it is the native C++ contract.
  for(const m of text.matchAll(/\bSetItemFloor\s*\(([^\n]*)\)/g)){
    const a=splitArgs(m[1]);if(a.length!==5)continue;
    put(out,itemToken(a[0]),numberToken(a[1]),numberToken(a[2]),numberToken(a[3]),numberToken(a[4]));
  }
  // Current client uses the table + StartLoadItemFloor loop form.
  // Parse only literal records containing ItemIndex=GET_ITEM(...). The loop
  // body references CUSTOM_ITEM_FLOOR[i] and therefore cannot be mistaken for
  // a row by itemToken(), while unrelated tables without ItemIndex are ignored.
  for(const m of text.matchAll(/\{([^{}]*\bItemIndex\s*=\s*GET_ITEM\s*\([^{}]*?)\}/gi)){
    const body=m[1];
    const itemExpr=/\bItemIndex\s*=\s*(GET_ITEM\s*\(\s*\d+\s*,\s*\d+\s*\))/i.exec(body)?.[1] ?? null;
    const value=(name)=>new RegExp(`\\b${name}\\s*=\\s*([-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))`,'i').exec(body)?.[1] ?? null;
    put(out,itemToken(itemExpr),numberToken(value('AngleX')),numberToken(value('AngleY')),numberToken(value('AngleZ')),numberToken(value('Size')));
  }
  return out;
}

let cached=null,inflight=null;
export async function loadCustomItemFloorLua(fetchBinary=(p)=>RemoteAssets.fetchBinary(p)){
  if(cached)return cached;if(inflight)return inflight;
  inflight=(async()=>{
    let last=null;
    for(const path of CUSTOM_ITEM_FLOOR_PATHS){
      try{
        const bytes=await fetchBinary(path);if(!bytes)continue;
        const rules=parseCustomItemFloorLua(decodePcLuaText(bytes));
        if(!rules.size)throw new Error(`${path}: nenhum SetItemFloor ativo reconhecido`);
        cached=Object.freeze({path,rules});
        console.info(`[CustomItemFloor] owner real carregado ${path} rows=${rules.size}`);
        return cached;
      }catch(e){last=e;}
    }
    throw last||new Error('CustomItemFloor.lua ausente');
  })().finally(()=>{inflight=null;});
  return inflight;
}
export function resetCustomItemFloorLuaForTests(){cached=null;inflight=null;}
