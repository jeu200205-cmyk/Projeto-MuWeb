/**
 * CustomItemForceLua.js — current-client ItemConvert final stat override.
 * Authority: CustomItemForce.cpp + Configs/CustomItemForce.lua from the active client.
 * This owner runs at the END of ItemConvert and therefore overrides only the
 * displayed/converted DamageMin, DamageMax, Defense and MagicDefense fields.
 */
import { RemoteAssets } from './RemoteAssets.js';
import { decodePcLuaText } from './PcLuaCrypt.js';
import { currentClientItemModelForType } from './CurrentClientItemOwners.js';

export const CUSTOM_ITEM_FORCE_PATHS = Object.freeze([
  'Configs/lua/Configs/CustomItemForce.lua',
  'Configs/Lua/Configs/CustomItemForce.lua',
  'Configs/crypt/Configs/CustomItemForce.lua',
]);

function stripComments(input=''){
  const s=String(input??'');let out='',i=0,q=null,long=false;
  while(i<s.length){const c=s[i],n=s[i+1];if(q){out+=c;if(c==='\\'&&i+1<s.length){out+=s[++i];i++;continue;}if(c===q)q=null;i++;continue;}if(long){if(c===']'&&n===']'){long=false;i+=2;}else i++;continue;}if(c==='"'||c==="'"){q=c;out+=c;i++;continue;}if(c==='-'&&n==='-'){if(s[i+2]==='['&&s[i+3]==='['){long=true;i+=4;continue;}i+=2;while(i<s.length&&s[i]!=='\n')i++;if(i<s.length)out+='\n';continue;}out+=c;i++;}
  return out;
}
function itemToken(v){const m=/^GET_ITEM\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(String(v??'').trim());if(!m)return null;const group=Number(m[1]),index=Number(m[2]);return {group,index,itemType:group*512+index};}
function num(body,name){const m=new RegExp(`\\b${name}\\s*=\\s*(-?\\d+)`,'i').exec(body);return m?Number(m[1]):null;}

export function parseCustomItemForceLua(input){
  const text=stripComments(input),out=new Map();
  for(const m of text.matchAll(/\{([^{}]*\bItemIndex\s*=\s*GET_ITEM\s*\([^{}]*?)\}/gi)){
    const body=m[1];const itemExpr=/\bItemIndex\s*=\s*(GET_ITEM\s*\(\s*\d+\s*,\s*\d+\s*\))/i.exec(body)?.[1];const it=itemToken(itemExpr);if(!it)continue;
    const damageMin=num(body,'DamageMin'),damageMax=num(body,'DamageMax'),defense=num(body,'Defense'),magicDefense=num(body,'MagicDefense');
    if(![damageMin,damageMax,defense,magicDefense].every(Number.isFinite))continue;
    if(!out.has(it.itemType))out.set(it.itemType,Object.freeze({...it,damageMin,damageMax,defense,magicDefense,owner:'CustomItemForce.lua'})); // std::map::insert first wins
  }
  // Native direct callback form for future client variants.
  for(const m of text.matchAll(/\bSetItemForce\s*\(\s*(GET_ITEM\s*\(\s*\d+\s*,\s*\d+\s*\))\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/gi)){
    const it=itemToken(m[1]);if(it&&!out.has(it.itemType))out.set(it.itemType,Object.freeze({...it,damageMin:Number(m[2]),damageMax:Number(m[3]),defense:Number(m[4]),magicDefense:Number(m[5]),owner:'CustomItemForce.lua'}));
  }
  return out;
}

let registry=new Map(),status=Object.freeze({loaded:false,count:0,path:null}),inflight=null;
export function customItemForceRule(type){return registry.get(Number(type))||null;}
export function customItemForceStatus(){return status;}
export function customItemForceSnapshot(){return new Map(registry);}
export async function loadCustomItemForceLua(fetchBinary=(p)=>RemoteAssets.fetchBinary(p)){
  if(status.loaded)return status;if(inflight)return inflight;
  inflight=(async()=>{let last=null;for(const path of CUSTOM_ITEM_FORCE_PATHS){try{const b=await fetchBinary(path);if(!b)continue;const next=parseCustomItemForceLua(decodePcLuaText(b));if(!next.size)throw new Error(`${path}: nenhum owner ativo`);registry=next;status=Object.freeze({loaded:true,count:next.size,path});console.info(`[CustomItemForce] owner real carregado ${path} rows=${next.size}`);return status;}catch(e){last=e;}}throw last||new Error('CustomItemForce.lua ausente');})().finally(()=>{inflight=null;});
  return inflight;
}
export function resetCustomItemForceLuaForTests(){registry=new Map();status=Object.freeze({loaded:false,count:0,path:null});inflight=null;}

function levelBonusFallthrough(level, wingLike=false){
  let n=Math.min(9,level)*3;
  if(wingLike){ // custom wing branch in CustomItemForce::Defense uses +5..+10 fall-through
    if(level>=10) for(let l=10;l<=level;l++) n += l-5;
  }else{
    if(level>=10) for(let l=10;l<=level;l++) n += l-6;
  }
  return n;
}
function customWing(type){return !!currentClientItemModelForType(type)?.customWing;}
function suppressExcellent(type){
  return (type>=6147&&type<=6150)||(type>=6180&&type<=6184)||(type>=6186&&type<=6187)||type===19||type===2066||type===2570||type===1037||type===6686||(type>=6274&&type<=6278)||(type>=6193&&type<=6194)||type===6279||type===2596||customWing(type);
}

/** Exact CCustomItemForce::ItemConverts result for the four overridden fields. */
export function pcApplyCustomItemForce(item,attr,current={}){
  const type=Number(item?.itemType??item?.type);const rule=customItemForceRule(type);if(!rule||!attr)return null;
  const option=Number(item?.rawLevel??item?.raw?.[1]??0)&0xff;
  const special=Number(item?.option1??item?.raw?.[3]??0)&0xff;
  const value=Number(item?.extOption??item?.raw?.[4]??0)&0xff;
  const level=(option>>3)&0xf, baseLevel=Number(attr.itemLevel||0),dropItem=baseLevel+30;
  let exc=special&0x3f, ancient=false;if(suppressExcellent(type))exc=0;if(value%4===1||value%4===2){exc=1;ancient=true;}
  let addExc=0;if(type===0x406)addExc=15;else if(type===0x806)addExc=30;else if(type===0xA07)addExc=25;
  const stat=(base)=>{let v=Number(base)||0;if(v<=0)return v;if(exc>0&&baseLevel)v+=addExc||Math.trunc(25*base/baseLevel)+5;if(ancient)v+=Math.trunc(dropItem/40)+5;v+=levelBonusFallthrough(level,false);return v;};
  let damageMin=stat(rule.damageMin),damageMax=stat(rule.damageMax);
  let defense=Number(rule.defense)||0;
  if(type===6686)defense=15;
  if(rule.defense>0){
    if(type<3072||type>=3584){
      if(exc>0&&baseLevel)defense+=Math.trunc(12*rule.defense/baseLevel)+Math.trunc(baseLevel/5)+4;
      if(ancient)defense+=Math.trunc(3*defense/dropItem)+Math.trunc(dropItem/30)+2;
      const wingLike=((type>=6180&&type<=6184)||type===6187||type===6194||customWing(type));
      const double=((type>=6147&&type<=6150)||type===6186||type===6686||type===6193);
      defense+=Math.min(9,level)*(double?2:(wingLike?4:3));
      if(wingLike){if(level>=10)for(let l=10;l<=level;l++)defense+=l-5;}
      else {if(level>=10)for(let l=10;l<=level;l++)defense+=l-6;}
    }else{
      defense+=level;if(ancient)defense+=Math.trunc(20*defense/dropItem)+2;
    }
  }
  let magicDefense=Number(rule.magicDefense)||0;
  if(rule.magicDefense>0)magicDefense+=levelBonusFallthrough(level,false);
  return Object.freeze({damageMin,damageMax,defense,magicDefense,owner:rule.owner});
}
