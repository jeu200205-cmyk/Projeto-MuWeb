/**
 * DarkSpiritLua.js — current-client authority for CharacterSystem/DarkSpirit.lua.
 * PC authority: DarkSpirit.cpp::SetDarkSpirit / CDarkSpirit::Init.
 * Exact callback: SetDarkSpirit(ItemIndex, modelName, objectName).
 */
import { RemoteAssets } from './RemoteAssets.js';
import { decodePcLuaText } from './PcLuaCrypt.js';

export const DARK_SPIRIT_PATHS = Object.freeze([
  'Configs/lua/CharacterSystem/DarkSpirit.lua',
  'Configs/Lua/CharacterSystem/DarkSpirit.lua',
  'Configs/crypt/CharacterSystem/DarkSpirit.lua',
]);

function stripComments(input='') {
  const s=String(input??''); let out='',i=0,q=null;
  while(i<s.length){const c=s[i],n=s[i+1];if(q){out+=c;if(c==='\\'&&i+1<s.length)out+=s[++i];else if(c===q)q=null;i++;continue;}if(c==='"'||c==="'"){q=c;out+=c;i++;continue;}if(c==='-'&&n==='-'){if(s[i+2]==='['&&s[i+3]==='['){const e=s.indexOf(']]',i+4);i=e<0?s.length:e+2;}else{i+=2;while(i<s.length&&s[i]!=='\n')i++;}continue;}out+=c;i++;}return out;
}
function splitArgs(body=''){const out=[];let cur='',d=0,q=null;for(let i=0;i<body.length;i++){const c=body[i];if(q){cur+=c;if(c==='\\'&&i+1<body.length)cur+=body[++i];else if(c===q)q=null;continue;}if(c==='"'||c==="'"){q=c;cur+=c;continue;}if('({['.includes(c))d++;else if(')}]'.includes(c))d--;if(c===','&&d===0){out.push(cur.trim());cur='';}else cur+=c;}if(cur.trim())out.push(cur.trim());return out;}
function scanCalls(text,name){const out=[];let p=0;for(;;){p=text.indexOf(name,p);if(p<0)break;let i=p+name.length;while(/\s/.test(text[i]||''))i++;if(text[i]!=='('){p=i;continue;}const start=++i;let d=1,q=null;for(;i<text.length;i++){const c=text[i];if(q){if(c==='\\')i++;else if(c===q)q=null;continue;}if(c==='"'||c==="'"){q=c;continue;}if(c==='(')d++;else if(c===')'&&--d===0)break;}if(d===0)out.push(splitArgs(text.slice(start,i)));p=i+1;}return out;}
function num(v){const s=String(v??'').trim();if(!/^[+-]?\d+$/.test(s))return null;const n=Number(s);return Number.isSafeInteger(n)?n:null;}
function str(v){const m=/^(['"])([\s\S]*)\1$/.exec(String(v??'').trim());return m?m[2]:null;}
function item(v){const s=String(v??'').trim();const m=/^GET_ITEM(?:_MODEL)?\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(s);if(m)return Number(m[1])*512+Number(m[2]);return num(s);}
function modelPath(v){if(!v)return null;let p=String(v).replace(/\\/g,'/').replace(/^Data\//i,'').replace(/^\.\//,'');if(!/\.bmd$/i.test(p))p+='.bmd';return p;}

export function parseDarkSpiritLua(input){
  const text=stripComments(input), out=new Map();
  for(const a of scanCalls(text,'SetDarkSpirit')){
    if(a.length<3)continue;
    const itemIndex=item(a[0]), modelName=str(a[1]), objectName=str(a[2]);
    if(!Number.isInteger(itemIndex)||modelName==null||objectName==null)continue;
    out.set(itemIndex,Object.freeze({itemIndex,modelName,objectName,modelPath:modelPath(modelName),objectModelPath:modelPath(objectName),owner:'DarkSpirit.lua'}));
  }
  return out;
}

let registry=new Map(), status=Object.freeze({loaded:false,count:0,path:null}), inflight=null;
export function darkSpiritRule(itemIndex){return registry.get(Number(itemIndex))||null;}
export function darkSpiritStatus(){return status;}
export function darkSpiritSnapshot(){return new Map(registry);}
export async function loadDarkSpiritLua(fetchBinary=(p)=>RemoteAssets.fetchBinary(p)){
  if(status.loaded)return status;if(inflight)return inflight;
  inflight=(async()=>{let last=null;for(const path of DARK_SPIRIT_PATHS){try{const b=await fetchBinary(path);if(!b)continue;const next=parseDarkSpiritLua(decodePcLuaText(b));if(!next.size)throw new Error(`${path}: nenhum SetDarkSpirit ativo reconhecido`);registry=next;status=Object.freeze({loaded:true,count:next.size,path});console.info(`[DarkSpiritLua] owner real ${path} rows=${next.size}`);return status;}catch(e){last=e;}}throw last||new Error('DarkSpirit.lua ausente');})().finally(()=>{inflight=null;});return inflight;
}
export function resetDarkSpiritLuaForTests(){registry=new Map();status=Object.freeze({loaded:false,count:0,path:null});inflight=null;}
