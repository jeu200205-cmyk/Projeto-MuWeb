/** Bitmap startup only. Source authority: Lua.cpp, LuaLoadImage.cpp,
 * LuaOpenFolder.cpp, RenderModel.cpp. Fengari supplies Lua 5.3 semantics;
 * this is not a complete port of the PC's Lua libraries or BMD draw API.
 */
import {lua,lauxlib,core,base,table,string,math} from '../vendor/fengari-bitmap-0.1.4.mjs';
import {decodePcLuaText} from './PcLuaCrypt.js';
const S=core.to_luastring;
const modulePath=(prefix,name)=>{
 const p=String(name).replace(/\\/g,'/');
 if(!p||p.includes(':')||p.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('invalid Lua module path');
 return prefix+p;
};
/** Includes are fetched asynchronously, then the uncommitted startup is
 * replayed from its original counter. No partial owner/counter escapes.
 * A fresh Lua state per source matches the PC's separate Lua objects.
 */
export async function executePcBitmapLua(source,{entry,path,firstID=200000,physicalPath,readFile,listFolder,beforeEntry,instructionLimit=1000000,maxDependencies=64,valid=()=>true}={}){
 const modules=new Map(),folders=new Map();let dependencies=0,intervention=null;
 for(;;){
  if(!valid())throw Error('stale Lua startup');
  const L=lauxlib.luaL_newstate();const owners=new Map(),loaded=new Map();let nextID=firstID,request=null,steps=0;
  const error=message=>lauxlib.luaL_error(L,S(message));
  const textArg=index=>{if(lua.lua_type(L,index)!==lua.LUA_TSTRING)return error('bitmap path must be a string');return core.to_jsstring(lua.lua_tostring(L,index))};
  const register=(name,fn)=>{lua.lua_pushcfunction(L,fn);lua.lua_setglobal(L,S(name))};
  const execute=(text,name,args=0,results=0)=>{
   if(lauxlib.luaL_loadbuffer(L,S(text),null,S(name))!==lua.LUA_OK)throw Error(core.to_jsstring(lua.lua_tostring(L,-1)));
   if(args){lua.lua_pushstring(L,S(name))}
   if(lua.lua_pcall(L,args,results,0)!==lua.LUA_OK)throw Error(core.to_jsstring(lua.lua_tostring(L,-1)));
  };
  const own=(file,id)=>{
   if(!Number.isInteger(id)||id<0||id>0x7fffffff)return error('invalid bitmap ID');
   let physical;try{physical=physicalPath(file)}catch(e){return error(e.message)}
   owners.set(id,Object.freeze({id,path:file,physicalPath:physical,entry}));
  };
  const include=name=>{
   if(loaded.get(name)==='loading')return error('loop or previous error loading Lua module '+name);
   if(loaded.has(name))return;
   if(!modules.has(name)){request??={kind:'file',name};return error('Lua module requires asynchronous fetch')}
   loaded.set(name,'loading');execute(modules.get(name),name,1,1);
   // LuaOpenFolder.cpp caches nil as true; an explicit false is reloadable.
   if(lua.lua_isnil(L,-1)||lua.lua_toboolean(L,-1))loaded.set(name,'loaded');else loaded.delete(name);
   lua.lua_pop(L,1);
  };
  let failure=null;
  try{
   for(const [name,open] of [['_G',base.luaopen_base],['table',table.luaopen_table],['string',string.luaopen_string],['math',math.luaopen_math]]){
    lauxlib.luaL_requiref(L,S(name),open,1);lua.lua_pop(L,1);
   }
   // No implicit network/file library can bypass exact Data ownership.
   for(const name of ['dofile','loadfile','collectgarbage']){lua.lua_pushnil(L);lua.lua_setglobal(L,S(name))}
   register('LoadImage',()=>{const file=textArg(1),id=lua.lua_tonumber(L,2);if(lua.lua_type(L,2)!==lua.LUA_TNUMBER)return error('bitmap ID must be numeric');own(file,id);return 0});
   register('LoadImageByDir',()=>{const id=nextID;own(textArg(1),id);nextID++;lua.lua_pushinteger(L,id);return 1});
   register('OpenFile',()=>{let name;try{name=modulePath('Draw/Lua/',textArg(1))}catch(e){return error(e.message)}include(name);return 0});
   register('OpenFolder',()=>{
    let name;try{name=modulePath('Configs/Lua/Manager/',textArg(1))+'/'}catch(e){return error(e.message)}
    if(!folders.has(name)){request??={kind:'folder',name};return error('Lua folder requires asynchronous fetch')}
    for(const file of folders.get(name))include(file);return 0;
   });
   register('LogDebug',()=>0);
   lua.lua_getglobal(L,S('math'));
   for(const name of ['random','randomseed']){
    lua.lua_pushcfunction(L,()=>error('PC random bitmap startup requires a source-backed RNG bridge'));
    lua.lua_setfield(L,-2,S(name));
   }
   lua.lua_pop(L,1);
   // Legacy unpack is commonly used by PC scripts. Other removed 5.1 APIs
   // deliberately fail instead of silently returning fabricated values.
   execute('unpack = table.unpack','bitmap compatibility');
   lua.lua_sethook(L,()=>{steps+=1000;if(steps>instructionLimit)error('Lua bitmap instruction limit exceeded')},lua.LUA_MASKCOUNT,1000);
   execute(source,path);
   if(beforeEntry){
    // PC RenderModel::Init executes globals before the UI controller; its
    // StartLoadImages entry runs afterwards. Dependency replay must not run
    // that intervening controller twice or overwrite its later bitmap owners.
    intervention??=await beforeEntry({owners:new Map(owners),nextID});
    if(!valid())throw Error('stale Lua startup');
    nextID=intervention.nextID;owners.clear();
   }
   lua.lua_getglobal(L,S(entry));
   if(lua.lua_type(L,-1)!==lua.LUA_TFUNCTION)throw Error(`startup function ${entry} absent`);
   if(lua.lua_pcall(L,0,0,0)!==lua.LUA_OK)throw Error(core.to_jsstring(lua.lua_tostring(L,-1)));
  }catch(e){failure=e}finally{lua.lua_close(L)}
  if(!request){if(failure)throw failure;return {owners,nextID}}
  if(++dependencies>maxDependencies)throw Error('Lua bitmap dependency limit exceeded');
  if(request.kind==='folder'){
   if(!listFolder)throw Error('Lua folder manifest unavailable');
   const files=await listFolder(request.name);
   if(!Array.isArray(files))throw Error('Lua folder manifest unavailable');
   // Preserve manifest order. Windows enumeration order is Data-dependent.
   for(const name of files){
    if(!name.toLowerCase().startsWith(request.name.toLowerCase())||name.slice(request.name.length).includes('/')||!name.toLowerCase().endsWith('.lua'))throw Error('invalid Lua folder manifest member');
   }
   folders.set(request.name,files);
  }else{
   if(!readFile)throw Error('Lua include unavailable: '+request.name);
   const bytes=await readFile(request.name);if(!bytes)throw Error('Lua include absent: '+request.name);
   modules.set(request.name,decodePcLuaText(bytes));
  }
 }
}
