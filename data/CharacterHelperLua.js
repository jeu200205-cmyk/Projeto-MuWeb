/**
 * CharacterHelperLua.js — current-client authority for CharacterHelper.lua.
 * PC authority: HelperSystem.cpp::SetHelper / CHelperSystem::Init.
 */
import { RemoteAssets } from './RemoteAssets.js';
import { decodePcLuaText } from './PcLuaCrypt.js';
import { scanLuaGlobalCalls,parseLuaStringLiteral,assertPcLuaScriptCompiles } from './PcLuaStaticLex.js';

export const CHARACTER_HELPER_PATHS = Object.freeze([
  'Configs/lua/CharacterSystem/CharacterHelper.lua',
  'Configs/Lua/CharacterSystem/CharacterHelper.lua',
  'Configs/crypt/CharacterSystem/CharacterHelper.lua',
]);

function num(v){const s=String(v??'').trim();if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s))return null;const n=Number(s);return Number.isFinite(n)?n:null;}
function item(v){const s=String(v??'').trim();let m=/^GET_ITEM(?:_MODEL)?\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(s);if(m)return Number(m[1])*512+Number(m[2]);const n=num(s);return Number.isInteger(n)?n:null;}
function modelPath(model){if(!model)return null;let p=String(model).replace(/\\/g,'/').replace(/^Data\//i,'').replace(/^\.\//,'');if(!/\.bmd$/i.test(p))p += '.bmd';return p;}

export function parseCharacterHelperLua(input, options={}){
  const text=String(input??''),out=new Map();
  for(const a of scanLuaGlobalCalls(text,'SetHelper')){
    if(a.length<11)continue;
    const itemIndex=item(a[0]); const vals=a.slice(1,9).map(num); const model=parseLuaStringLiteral(a[9],options),objectModel=parseLuaStringLiteral(a[10],options);
    if(!Number.isInteger(itemIndex)||vals.some(v=>v==null)||model==null||objectModel==null)continue;
    const [rawType,movement,height,size,sizeCharList,miniature,sizeMiniature,velocityMiniature]=vals;
    const type=rawType===1?2:rawType===2?4:rawType===3?8:rawType===4?16:rawType;
    out.set(itemIndex,Object.freeze({itemIndex,type,rawType,movement,height,size,sizeCharList,miniature,sizeMiniature,velocityMiniature,model,objectModel,modelPath:modelPath(model),objectModelPath:modelPath(objectModel),owner:'CharacterHelper.lua'}));
  }
  return out;
}
const EMPTY_STATUS=Object.freeze({loaded:false,count:0,path:null});
let registry=new Map(),status=EMPTY_STATUS,inflight=null,authority=null,inflightAuthority=null;
const ready=()=>status.loaded && authority===RemoteAssets.authorityKey;
export function characterHelperRule(itemIndex){return ready()?(registry.get(Number(itemIndex))||null):null;}
export function characterHelperStatus(){return ready()?status:EMPTY_STATUS;}
export function characterHelperSnapshot(){return ready()?new Map(registry):new Map();}
export async function loadCharacterHelperLua(fetchBinary=(p)=>RemoteAssets.fetchBinary(p)){
  const owner=RemoteAssets.authorityKey;
  if(ready())return status;
  if(inflight && inflightAuthority===owner)return inflight;
  const request=(async()=>{
    let last=null;
    for(const path of CHARACTER_HELPER_PATHS){
      if(RemoteAssets.authorityKey!==owner)return characterHelperStatus();
      try{
        const b=await fetchBinary(path);
        if(RemoteAssets.authorityKey!==owner)return characterHelperStatus();
        if(!b)continue;
        const text=decodePcLuaText(b);
        assertPcLuaScriptCompiles(text,path);
        const next=parseCharacterHelperLua(text,{strictLuaStrings:true});
        if(!next.size)throw new Error(`${path}: nenhum SetHelper ativo reconhecido`);
        registry=next;
        authority=owner;
        status=Object.freeze({loaded:true,count:next.size,path});
        console.info(`[CharacterHelper] owner real ${path} rows=${next.size}`);
        return status;
      }catch(e){if(RemoteAssets.authorityKey!==owner)return characterHelperStatus();last=e;}
    }
    throw last||new Error('CharacterHelper.lua ausente');
  })();
  inflight=request;inflightAuthority=owner;
  return request.finally(()=>{if(inflight===request){inflight=null;inflightAuthority=null;}});
}
export function resetCharacterHelperLuaForTests(){registry=new Map();status=EMPTY_STATUS;inflight=null;authority=null;inflightAuthority=null;}
