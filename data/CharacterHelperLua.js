/**
 * CharacterHelperLua.js — current-client authority for CharacterHelper.lua.
 * PC authority: HelperSystem.cpp::SetHelper / CHelperSystem::Init.
 */
import { RemoteAssets } from './RemoteAssets.js';
import { decodePcLuaText } from './PcLuaCrypt.js';

export const CHARACTER_HELPER_PATHS = Object.freeze([
  'Configs/lua/CharacterSystem/CharacterHelper.lua',
  'Configs/Lua/CharacterSystem/CharacterHelper.lua',
  'Configs/crypt/CharacterSystem/CharacterHelper.lua',
]);

function stripComments(input='') {
  const s=String(input??''); let out='',i=0,q=null;
  while(i<s.length){const c=s[i],n=s[i+1];if(q){out+=c;if(c==='\\'&&i+1<s.length)out+=s[++i];else if(c===q)q=null;i++;continue;}if(c==='"'||c==="'"){q=c;out+=c;i++;continue;}if(c==='-'&&n==='-'){if(s[i+2]==='['&&s[i+3]==='['){const e=s.indexOf(']]',i+4);i=e<0?s.length:e+2;}else{i+=2;while(i<s.length&&s[i]!=='\n')i++;}continue;}out+=c;i++;}return out;
}
function splitArgs(body=''){const out=[];let cur='',d=0,q=null;for(let i=0;i<body.length;i++){const c=body[i];if(q){cur+=c;if(c==='\\'&&i+1<body.length)cur+=body[++i];else if(c===q)q=null;continue;}if(c==='"'||c==="'"){q=c;cur+=c;continue;}if('({['.includes(c))d++;else if(')}]'.includes(c))d--;if(c===','&&d===0){out.push(cur.trim());cur='';}else cur+=c;}if(cur.trim())out.push(cur.trim());return out;}
function scanCalls(text,name){const out=[];let p=0;for(;;){p=text.indexOf(name,p);if(p<0)break;let i=p+name.length;while(/\s/.test(text[i]||''))i++;if(text[i]!=='('){p=i;continue;}const start=++i;let d=1,q=null;for(;i<text.length;i++){const c=text[i];if(q){if(c==='\\')i++;else if(c===q)q=null;continue;}if(c==='"'||c==="'"){q=c;continue;}if(c==='(')d++;else if(c===')'&&--d===0)break;}if(d===0)out.push(splitArgs(text.slice(start,i)));p=i+1;}return out;}
function num(v){const s=String(v??'').trim();if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))return null;const n=Number(s);return Number.isFinite(n)?n:null;}
function str(v){const m=/^(['"])([\s\S]*)\1$/.exec(String(v??'').trim());return m?m[2]:null;}
function item(v){const s=String(v??'').trim();let m=/^GET_ITEM(?:_MODEL)?\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(s);if(m)return Number(m[1])*512+Number(m[2]);const n=num(s);return Number.isInteger(n)?n:null;}
function modelPath(model){if(!model)return null;let p=String(model).replace(/\\/g,'/').replace(/^Data\//i,'').replace(/^\.\//,'');if(!/\.bmd$/i.test(p))p += '.bmd';return p;}

export function parseCharacterHelperLua(input){
  const text=stripComments(input),out=new Map();
  for(const a of scanCalls(text,'SetHelper')){
    if(a.length<11)continue;
    const itemIndex=item(a[0]); const vals=a.slice(1,9).map(num); const model=str(a[9]),objectModel=str(a[10]);
    if(!Number.isInteger(itemIndex)||vals.some(v=>v==null)||model==null||objectModel==null)continue;
    const [rawType,movement,height,size,sizeCharList,miniature,sizeMiniature,velocityMiniature]=vals;
    const type=rawType===1?2:rawType===2?4:rawType===3?8:rawType===4?16:rawType;
    out.set(itemIndex,Object.freeze({itemIndex,type,rawType,movement,height,size,sizeCharList,miniature,sizeMiniature,velocityMiniature,model,objectModel,modelPath:modelPath(model),objectModelPath:modelPath(objectModel),owner:'CharacterHelper.lua'}));
  }
  return out;
}
let registry=new Map(),status=Object.freeze({loaded:false,count:0,path:null}),inflight=null;
export function characterHelperRule(itemIndex){return registry.get(Number(itemIndex))||null;}
export function characterHelperStatus(){return status;}
export function characterHelperSnapshot(){return new Map(registry);}
export async function loadCharacterHelperLua(fetchBinary=(p)=>RemoteAssets.fetchBinary(p)){
  if(status.loaded)return status;if(inflight)return inflight;
  inflight=(async()=>{let last=null;for(const path of CHARACTER_HELPER_PATHS){try{const b=await fetchBinary(path);if(!b)continue;const next=parseCharacterHelperLua(decodePcLuaText(b));if(!next.size)throw new Error(`${path}: nenhum SetHelper ativo reconhecido`);registry=next;status=Object.freeze({loaded:true,count:next.size,path});console.info(`[CharacterHelper] owner real ${path} rows=${next.size}`);return status;}catch(e){last=e;}}throw last||new Error('CharacterHelper.lua ausente');})().finally(()=>{inflight=null;});return inflight;
}
export function resetCharacterHelperLuaForTests(){registry=new Map();status=Object.freeze({loaded:false,count:0,path:null});inflight=null;}
