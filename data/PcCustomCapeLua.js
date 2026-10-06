/**
 * PcCustomCapeLua.js — executes the current client's CharacterCreateCape.lua
 * and captures the exact LuaCloth/CapeStack calls used by CreateCapePlayer.
 *
 * PC authority:
 *   CustomCape.cpp::Init -> CharacterCreateCape.lua
 *   LuaCloth.cpp registers CapeStack(ptr):Create/SetWindMinMax/Collision
 *   CustomCape.cpp::CreateCape -> CreateCapePlayer(pCloth,Object,ItemIndex,Class)
 *
 * The Web runtime never invents cloth rows: if the real Lua cannot execute,
 * custom cloth stays fail-closed and the rigid cape BMD remains the owner.
 */
import {lua,lauxlib,core,base,table,string,math} from '../vendor/fengari-bitmap-0.1.4.mjs';
import {decodePcLuaText} from './PcLuaCrypt.js';
import {RemoteAssets} from './RemoteAssets.js';

const S=core.to_luastring;
export const CUSTOM_CAPE_LUA_PATHS=Object.freeze([
  'Configs/Lua/CharacterSystem/CharacterCreateCape.lua',
  'Configs/lua/CharacterSystem/CharacterCreateCape.lua',
  'Configs/crypt/CharacterSystem/CharacterCreateCape.lua',
]);

export const PCT=Object.freeze({
  PCT_FLAT:0x00000000,PCT_CURVED:0x00000001,PCT_STICKED:0x00000002,
  PCT_SHAPE_NORMAL:0x00000000,PCT_SHORT_SHOULDER:0x00000004,PCT_CYLINDER:0x00000008,
  PCT_SHAPE_HALLOWEEN:0x00000010,
  PCT_COTTON:0x00000000,PCT_RUBBER:0x00000100,PCT_RUBBER2:0x00000200,
  PCT_NORMAL_THICKNESS:0x00000000,PCT_HEAVY:0x00000400,
  PCT_MASK_BLIT:0x00000000,PCT_MASK_ALPHA:0x00001000,PCT_MASK_BLEND:0x00002000,
  PCT_ELASTIC_HALLOWEEN:0x00004000,PCT_ELASTIC_RAGE_L:0x00008000,PCT_ELASTIC_RAGE_R:0x0000C000,
  PCT_OPT_MESHPROG:0x10000000,PCT_OPT_CORRECTEDFORCE:0x20000000,PCT_MASK_LIGHT:0x40000000,PCT_OPT_HAIR:0x80000000,
  PLS_NORMAL:0x00,PLS_LOOSEDISTANCE:0x01,PLS_SPRING:0x02,PLS_STRICTDISTANCE:0x04,
});

function installLibs(L){
  for(const [name,open] of [['_G',base.luaopen_base],['table',table.luaopen_table],['string',string.luaopen_string],['math',math.luaopen_math]]){
    lauxlib.luaL_requiref(L,S(name),open,1);lua.lua_pop(L,1);
  }
  for(const name of ['dofile','loadfile','require','collectgarbage']){lua.lua_pushnil(L);lua.lua_setglobal(L,S(name));}
}
function setNumber(L,name,value){lua.lua_pushnumber(L,Number(value));lua.lua_setglobal(L,S(name));}
function num(L,i){return lua.lua_type(L,i)===lua.LUA_TNUMBER?lua.lua_tonumber(L,i):NaN;}
function pushMethod(L,name,fn){lua.lua_pushcfunction(L,fn);lua.lua_setfield(L,-2,S(name));}
export function pcGetDoubleRender(a1,a2,worldTime=0){
  const A=Number(a1),B=Number(a2),W=Number(worldTime);
  if(!Number.isFinite(A)||A===0||!Number.isFinite(B)||!Number.isFinite(W))return 0;
  const period=Math.trunc(6283.185546875/A);if(!period)return 0;
  const raw=Math.trunc(B*0.01745*1000/A+W);
  const mod=((raw%period)+period)%period;
  const init=mod*0.001*A;
  const r=init>=3.14?Math.cos(init):-Math.cos(init);
  return (r+1)*0.5;
}

function installCapeConstants(L){
  for(const [name,value] of Object.entries(PCT))setNumber(L,name,value);
  setNumber(L,'MODEL_ITEM',1095);setNumber(L,'MODEL_WING',1095+12*512);setNumber(L,'ITEM_WING',12*512);
  setNumber(L,'CLASS_WIZARD',0);setNumber(L,'CLASS_KNIGHT',1);setNumber(L,'CLASS_ELF',2);setNumber(L,'CLASS_DARK',3);setNumber(L,'CLASS_DARK_LORD',4);setNumber(L,'CLASS_SUMMONER',5);setNumber(L,'CLASS_RAGEFIGHTER',6);
  lua.lua_pushcfunction(L,()=>{const g=num(L,1),i=num(L,2);lua.lua_pushnumber(L,g*512+i+1095);return 1;});lua.lua_setglobal(L,S('GET_ITEM_MODEL'));
  lua.lua_pushcfunction(L,()=>{const g=num(L,1),i=num(L,2);lua.lua_pushnumber(L,g*512+i);return 1;});lua.lua_setglobal(L,S('GET_ITEM'));
}
function runCapeModelPosition(text,{itemIndex,path='CharacterCreateCape.lua',instructionLimit=500000}={}){
  const item=Number(itemIndex);if(!Number.isFinite(item))return null;
  const L=lauxlib.luaL_newstate();let steps=0;
  try{
    installLibs(L);installCapeConstants(L);
    // The file may define CreateCapePlayer with CapeStack references, but CapeModelPosition
    // itself has no BMD/OBJECT dependency. A harmless constructor keeps top-level helpers loadable.
    lua.lua_pushcfunction(L,()=>{lua.lua_newtable(L);return 1;});lua.lua_setglobal(L,S('CapeStack'));
    lua.lua_sethook(L,()=>{steps+=1000;if(steps>instructionLimit)lauxlib.luaL_error(L,S('CharacterCreateCape instruction limit exceeded'));},lua.LUA_MASKCOUNT,1000);
    if(lauxlib.luaL_loadbuffer(L,S(text),null,S(path))!==lua.LUA_OK)throw Error(core.to_jsstring(lua.lua_tostring(L,-1)));
    if(lua.lua_pcall(L,0,0,0)!==lua.LUA_OK)throw Error(core.to_jsstring(lua.lua_tostring(L,-1)));
    lua.lua_getglobal(L,S('CapeModelPosition'));
    if(lua.lua_type(L,-1)!==lua.LUA_TFUNCTION)return null;
    lua.lua_pushnumber(L,item);
    if(lua.lua_pcall(L,1,6,0)!==lua.LUA_OK)throw Error(core.to_jsstring(lua.lua_tostring(L,-1)));
    const out=[];for(let i=-6;i<=-1;i++)out.push(num(L,i));
    if(out.some(v=>!Number.isFinite(v)))return null;
    return Object.freeze({angles:Object.freeze(out.slice(0,3)),matrix:Object.freeze(out.slice(3,6))});
  }finally{lua.lua_close(L);}
}


function runRenderCapeModel(text,{itemIndex,renderCharacter=true,path='CharacterCreateCape.lua',instructionLimit=500000,objectState=null,bodyLight=null,worldTime=0}={}){
  const item=Number(itemIndex);if(!Number.isFinite(item))return Object.freeze([]);
  const L=lauxlib.luaL_newstate();const calls=[];let steps=0;
  const obj=Object.freeze({
    alpha:Number(objectState?.alpha ?? 1), blendMesh:Number(objectState?.blendMesh ?? -1),
    blendMeshLight:Number(objectState?.blendMeshLight ?? 1), texU:Number(objectState?.texU ?? 0), texV:Number(objectState?.texV ?? 0),
    hidden:Number(objectState?.hidden ?? -1), action:Number(objectState?.action ?? 0), time:Number(objectState?.time ?? 0),
  });
  const light=[Number(bodyLight?.[0] ?? (renderCharacter?0.5:1)),Number(bodyLight?.[1] ?? (renderCharacter?0.5:1)),Number(bodyLight?.[2] ?? (renderCharacter?0.5:1))];
  let streamMesh=-1,linkObject=-1,position=[0,0,0],timer=obj.time,lightOwned=false;
  const freezeCall=(kind,args,extra={})=>calls.push(Object.freeze({kind,args:Object.freeze(args),...extra}));
  const numericArgs=(startAt=2)=>{const top=lua.lua_gettop(L),args=[];for(let i=startAt;i<=top;i++){const v=num(L,i);args.push(Number.isFinite(v)?v:null);}return args;};
  const captureGlobal=(kind)=>()=>{freezeCall(kind,numericArgs(1));return 0;};
  const pushValueMethod=(name,getter)=>pushMethod(L,name,()=>{lua.lua_pushnumber(L,Number(getter()));return 1;});
  try{
    installLibs(L);installCapeConstants(L);
    // Real LuaBMD/LuaObject scripts construct wrappers with BMD(ptr)/Object(ptr).
    // Keep one JS-owned wrapper table for each native pointer and expose the same ctor names.
    lua.lua_newtable(L);
    pushMethod(L,'GetLight',()=>{const i=num(L,2)|0;lua.lua_pushnumber(L,light[i] ?? light[0]);return 1;});
    pushMethod(L,'SetLight',()=>{for(let i=0;i<3;i++){const v=num(L,2+i);if(Number.isFinite(v))light[i]=v;}lightOwned=true;freezeCall('set-light',light.slice(),{light:Object.freeze(light.slice()),lightOwned});return 0;});
    pushMethod(L,'RenderMesh',()=>{const args=numericArgs(2);freezeCall('render-mesh',args,{light:Object.freeze(light.slice()),lightOwned,streamMesh});return 0;});
    pushMethod(L,'RenderBody',()=>{const args=numericArgs(2);freezeCall('render-body',args,{light:Object.freeze(light.slice()),lightOwned,streamMesh});return 0;});
    pushMethod(L,'glColor3fv',()=>{freezeCall('gl-color-body',[],{light:Object.freeze(light.slice())});return 0;});
    pushMethod(L,'BeginRender',()=>0);pushMethod(L,'EndRender',()=>0);
    pushMethod(L,'setMesh',()=>{const v=num(L,2);if(Number.isFinite(v))streamMesh=v|0;freezeCall('set-mesh',[streamMesh],{streamMesh});return 0;});
    pushMethod(L,'RenderShadowModel',()=>{freezeCall('render-shadow',[],{light:Object.freeze(light.slice())});return 0;});
    const transform=(kind)=>()=>{const link=num(L,2),x=num(L,3),y=num(L,4),z=num(L,5);if([link,x,y,z].every(Number.isFinite)){linkObject=link|0;position=[x,y,z];freezeCall(kind,[link,x,y,z],{linkObject,position:Object.freeze(position.slice())});}return 0;};
    pushMethod(L,'TransformPosition',transform('transform-position'));pushMethod(L,'TransformPosition2',transform('transform-position2'));
    pushMethod(L,'CreateSprite',()=>{const args=numericArgs(2);freezeCall('bmd-create-sprite',args,{linkObject,position:Object.freeze(position.slice()),light:Object.freeze(light.slice())});return 0;});
    pushMethod(L,'CreateParticle',()=>{const args=numericArgs(2);freezeCall('bmd-create-particle',args,{linkObject,position:Object.freeze(position.slice()),light:Object.freeze(light.slice())});return 0;});
    pushMethod(L,'CreateEffect',()=>{const args=numericArgs(2);freezeCall('bmd-create-effect',args,{linkObject,position:Object.freeze(position.slice()),light:Object.freeze(light.slice())});return 0;});
    pushMethod(L,'CreateEffectsInFenrirUsingSkill',()=>{freezeCall('bmd-fenrir-skill',numericArgs(2));return 0;});
    lua.lua_setglobal(L,S('__CapeBMD'));
    lua.lua_pushcfunction(L,()=>{lua.lua_getglobal(L,S('__CapeBMD'));return 1;});lua.lua_setglobal(L,S('BMD'));

    lua.lua_newtable(L);
    pushValueMethod('Alpha',()=>obj.alpha);pushValueMethod('Mesh',()=>obj.blendMesh);pushValueMethod('Light',()=>obj.blendMeshLight);
    pushValueMethod('TexCoordU',()=>obj.texU);pushValueMethod('TexCoordV',()=>obj.texV);pushValueMethod('Hidden',()=>obj.hidden);
    pushValueMethod('getAction',()=>obj.action);pushValueMethod('getTime',()=>timer);
    pushMethod(L,'setTime',()=>{const v=num(L,2);if(Number.isFinite(v))timer=v;freezeCall('object-set-time',[timer]);return 0;});
    lua.lua_setglobal(L,S('__CapeObject'));
    lua.lua_pushcfunction(L,()=>{lua.lua_getglobal(L,S('__CapeObject'));return 1;});lua.lua_setglobal(L,S('Object'));
    // WorldTime/GetDoubleRender are dynamic PC owners. Record their use so consumers
    // never mistake a time-dependent program for an immutable static draw graph.
    lua.lua_pushcfunction(L,()=>{const w=Number(worldTime)||0;freezeCall('world-time-read',[w]);lua.lua_pushnumber(L,w);return 1;});lua.lua_setglobal(L,S('worldTime'));
    lua.lua_pushcfunction(L,()=>{const a1=num(L,1),a2=num(L,2),w=Number(worldTime)||0,v=pcGetDoubleRender(a1,a2,w);freezeCall('double-render-read',[a1,a2,w,v]);lua.lua_pushnumber(L,v);return 1;});lua.lua_setglobal(L,S('GetDoubleRender'));
    for(const name of ['CreateEffect','CreateSprite','CreateParticle','CreateJoint']){lua.lua_pushcfunction(L,captureGlobal(name.replace(/([A-Z])/g,'-$1').replace(/^-/,'').toLowerCase()));lua.lua_setglobal(L,S(name));}
    lua.lua_pushcfunction(L,()=>{lua.lua_newtable(L);return 1;});lua.lua_setglobal(L,S('CapeStack'));
    lua.lua_sethook(L,()=>{steps+=1000;if(steps>instructionLimit)lauxlib.luaL_error(L,S('CharacterCreateCape instruction limit exceeded'));},lua.LUA_MASKCOUNT,1000);
    if(lauxlib.luaL_loadbuffer(L,S(text),null,S(path))!==lua.LUA_OK)throw Error(core.to_jsstring(lua.lua_tostring(L,-1)));
    if(lua.lua_pcall(L,0,0,0)!==lua.LUA_OK)throw Error(core.to_jsstring(lua.lua_tostring(L,-1)));
    lua.lua_getglobal(L,S('RenderCapeModel'));if(lua.lua_type(L,-1)!==lua.LUA_TFUNCTION)return Object.freeze([]);
    // Pass wrapper tables so direct b:RenderMesh fixtures remain compatible; the real
    // client style BMD(BMDStruct)/Object(ObjectStruct) also resolves to these wrappers.
    lua.lua_getglobal(L,S('__CapeBMD'));lua.lua_getglobal(L,S('__CapeObject'));lua.lua_pushnumber(L,item);lua.lua_pushboolean(L,renderCharacter?1:0);
    if(lua.lua_pcall(L,4,0,0)!==lua.LUA_OK)throw Error(core.to_jsstring(lua.lua_tostring(L,-1)));
    return Object.freeze(calls.slice());
  }finally{lua.lua_close(L);}
}

function runCreateCapePlayer(text,{itemIndex,classId=0,path='CharacterCreateCape.lua',instructionLimit=500000}={}){
  const item=Number(itemIndex),cls=Number(classId)&7;if(!Number.isFinite(item))return Object.freeze([]);
  const L=lauxlib.luaL_newstate();const calls=[];let steps=0;
  try{
    installLibs(L);
    installCapeConstants(L);
    // CapeStack(pointer) returns a Lua table with the same method surface as ClothClass.
    lua.lua_pushcfunction(L,()=>{
      lua.lua_newtable(L);
      pushMethod(L,'Create',()=>{
        // colon call: self,numCloth,ObjectStruct,bone,x,y,z,hor,ver,width,height,front,back,type
        const a=[];for(let i=2;i<=14;i++)a.push(num(L,i));
        if(a.every(Number.isFinite))calls.push(Object.freeze({kind:'create',slot:a[0]|0,bone:a[2]|0,offset:Object.freeze([a[3],a[4],a[5]]),hor:a[6]|0,ver:a[7]|0,width:a[8],height:a[9],texFront:a[10]|0,texBack:a[11]|0,type:a[12]>>>0}));
        return 0;
      });
      pushMethod(L,'SetWindMinMax',()=>{const slot=num(L,2),min=num(L,3),max=num(L,4);if([slot,min,max].every(Number.isFinite))calls.push(Object.freeze({kind:'wind',slot:slot|0,min:min|0,max:max|0}));return 0;});
      // PC binding name is SetWindMinMax but native Lua class exposes SetWindMinMax via typo wrapper name SetWindMinMax/SetWindMax depending script generation.
      pushMethod(L,'SetWindMax',()=>{const slot=num(L,2),min=num(L,3),max=num(L,4);if([slot,min,max].every(Number.isFinite))calls.push(Object.freeze({kind:'wind',slot:slot|0,min:min|0,max:max|0}));return 0;});
      pushMethod(L,'Collision',()=>{const slot=num(L,2),x=num(L,3),y=num(L,4),z=num(L,5),r=num(L,6),bone=num(L,7);if([slot,x,y,z,r,bone].every(Number.isFinite))calls.push(Object.freeze({kind:'collision',slot:slot|0,center:Object.freeze([x,y,z]),radius:r,bone:bone|0}));return 0;});
      return 1;
    });lua.lua_setglobal(L,S('CapeStack'));
    lua.lua_sethook(L,()=>{steps+=1000;if(steps>instructionLimit)lauxlib.luaL_error(L,S('CharacterCreateCape instruction limit exceeded'));},lua.LUA_MASKCOUNT,1000);
    if(lauxlib.luaL_loadbuffer(L,S(text),null,S(path))!==lua.LUA_OK)throw Error(core.to_jsstring(lua.lua_tostring(L,-1)));
    if(lua.lua_pcall(L,0,0,0)!==lua.LUA_OK)throw Error(core.to_jsstring(lua.lua_tostring(L,-1)));
    lua.lua_getglobal(L,S('CreateCapePlayer'));
    if(lua.lua_type(L,-1)!==lua.LUA_TFUNCTION)throw Error(`CreateCapePlayer ausente em ${path}`);
    lua.lua_pushnumber(L,1);lua.lua_pushnumber(L,1);lua.lua_pushnumber(L,item);lua.lua_pushnumber(L,cls);
    if(lua.lua_pcall(L,4,0,0)!==lua.LUA_OK)throw Error(core.to_jsstring(lua.lua_tostring(L,-1)));
    const slots=new Map();
    for(const call of calls){
      if(call.kind==='create')slots.set(call.slot,{...call,wind:null,collisions:[]});
      else{const row=slots.get(call.slot);if(!row)continue;if(call.kind==='wind')row.wind=Object.freeze({min:call.min,max:call.max});else if(call.kind==='collision')row.collisions.push(call);}
    }
    return Object.freeze([...slots.values()].sort((a,b)=>a.slot-b.slot).map(row=>Object.freeze({...row,collisions:Object.freeze(row.collisions.slice())})));
  }finally{lua.lua_close(L);}
}

async function expandCustomCapeLuaIncludes(text,fetchBinary){
  const seen=new Set(),ordered=[];
  const norm=(v)=>String(v||'').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'');
  const scan=async(src)=>{
    const files=[...String(src).matchAll(/\bOpenFile\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m=>norm(m[1]));
    const folders=[...String(src).matchAll(/\bOpenFolder\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m=>norm(m[1]));
    for(const name of files){
      const key=`f:${name.toLowerCase()}`; if(seen.has(key))continue; seen.add(key);
      let decoded=null;
      for(const c of [name,`Configs/Lua/${name}`,`Configs/lua/${name}`]){const b=await fetchBinary(c);if(b){decoded=decodePcLuaText(b);break;}}
      if(decoded==null)throw Error(`CustomCape OpenFile ausente: ${name}`);
      await scan(decoded); ordered.push(decoded);
    }
    for(const folder of folders){
      const key=`d:${folder.toLowerCase()}`; if(seen.has(key))continue; seen.add(key);
      let list=[];
      for(const c of [folder,`Configs/Lua/${folder}`,`Configs/lua/${folder}`]){list=await RemoteAssets.listFolder(c,{suffix:'.lua'});if(list.length)break;}
      if(!list.length)throw Error(`CustomCape OpenFolder sem arquivos reais: ${folder}`);
      for(const file of list){const fk=`p:${file.toLowerCase()}`;if(seen.has(fk))continue;seen.add(fk);const b=await fetchBinary(file);if(!b)throw Error(`CustomCape include ausente: ${file}`);const decoded=decodePcLuaText(b);await scan(decoded);ordered.push(decoded);}
    }
  };
  await scan(text);
  // Includes were physically loaded in PC order above. Keep the source calls as
  // harmless guards so CharacterCreateCape.lua can execute unchanged afterwards.
  return `function OpenFile(...) end\nfunction OpenFolder(...) end\n${ordered.join('\n')}\n${text}`;
}

let state={loaded:false,path:null,text:null,error:null},inflight=null;
// FIX72: CharacterCreateCape.lua is immutable for a loaded client asset revision.
// Cache pure callback results by authored arguments so repeated equip/preview paths do
// not allocate a fresh Fengari state or re-execute the Lua file every time.
// Cache is cleared whenever the owner is loaded/reset; no visual fallback is cached.
let capePositionCache=new Map(),capeRenderCache=new Map(),capeRenderPairCache=new Map(),capeClothCache=new Map();
export async function loadPcCustomCapeLua(fetchBinary=(p)=>RemoteAssets.fetchBinary(p)){
  if(state.loaded)return state;if(inflight)return inflight;
  inflight=(async()=>{let last=null;for(const path of CUSTOM_CAPE_LUA_PATHS){try{const b=await fetchBinary(path);if(!b)continue;const raw=decodePcLuaText(b);const text=await expandCustomCapeLuaIncludes(raw,fetchBinary);runCreateCapePlayer(text,{itemIndex:-2147483648,classId:0,path});capePositionCache.clear();capeRenderCache.clear();capeRenderPairCache.clear();capeClothCache.clear();state=Object.freeze({loaded:true,path,text,error:null});console.info(`[CustomCapeLua] owner real carregado ${path} (OpenFile/OpenFolder includes resolvidos)`);return state;}catch(e){last=e;}}
    state=Object.freeze({loaded:false,path:null,text:null,error:last?.message||'CharacterCreateCape.lua ausente'});throw last||Error(state.error);
  })().finally(()=>{inflight=null;});return inflight;
}
export function customCapeClothPlan(itemModelType,classId=0){if(!state.loaded||!state.text)return Object.freeze([]);const item=Number(itemModelType),cls=Number(classId)&7,key=`${item}:${cls}`;if(capeClothCache.has(key))return capeClothCache.get(key);const out=runCreateCapePlayer(state.text,{itemIndex:item,classId:cls,path:state.path});capeClothCache.set(key,out);return out;}
export function customCapeModelPosition(itemModelType){if(!state.loaded||!state.text)return null;const item=Number(itemModelType);if(capePositionCache.has(item))return capePositionCache.get(item);const out=runCapeModelPosition(state.text,{itemIndex:item,path:state.path});capePositionCache.set(item,out);return out;}
export function customCapeRenderPlan(itemModelType,renderCharacter=true){if(!state.loaded||!state.text)return Object.freeze([]);const item=Number(itemModelType),rc=Boolean(renderCharacter),key=`${item}:${rc?1:0}`;if(capeRenderCache.has(key))return capeRenderCache.get(key);const out=runRenderCapeModel(state.text,{itemIndex:item,renderCharacter:rc,path:state.path});capeRenderCache.set(key,out);return out;}
// FIX77: composition may be rebuilt repeatedly for the same equipped cape. Cache the
// immutable white/lit program pair itself, not just each child program, so equip/preview
// rebuilds do not allocate a fresh wrapper object. This does not invent or merge Lua calls.
export function customCapeRenderPlanAtTime(itemModelType,renderCharacter=true,worldTime=0,objectState=null,bodyLight=null){
  if(!state.loaded||!state.text)return Object.freeze([]);
  const item=Number(itemModelType);if(!Number.isFinite(item))return Object.freeze([]);
  return runRenderCapeModel(state.text,{itemIndex:item,renderCharacter:Boolean(renderCharacter),path:state.path,worldTime:Number(worldTime)||0,objectState,bodyLight});
}
export function customCapeRenderPlans(itemModelType){
  if(!state.loaded||!state.text)return null;
  const item=Number(itemModelType);if(!Number.isFinite(item))return null;
  if(capeRenderPairCache.has(item))return capeRenderPairCache.get(item);
  const white=customCapeRenderPlan(item,false),lit=customCapeRenderPlan(item,true);
  const dynamic=[...white,...lit].some(c=>c?.kind==='world-time-read'||c?.kind==='double-render-read');
  const out=Object.freeze({white,lit,itemModelType:item,dynamic,evaluate:(renderCharacter,worldTime,objectState=null,bodyLight=null)=>customCapeRenderPlanAtTime(item,renderCharacter,worldTime,objectState,bodyLight)});
  capeRenderPairCache.set(item,out);return out;
}

export function pcCustomCapeLuaStatus(){return Object.freeze({loaded:state.loaded,path:state.path,error:state.error});}
export function resetPcCustomCapeLuaForTests(){state={loaded:false,path:null,text:null,error:null};inflight=null;capePositionCache.clear();capeRenderCache.clear();capeRenderPairCache.clear();capeClothCache.clear();}
export {runCreateCapePlayer as executeCustomCapeLuaForTests,runCapeModelPosition as executeCapeModelPositionForTests,runRenderCapeModel as executeRenderCapeModelForTests};
