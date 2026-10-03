/** PC LuaLoadImage.cpp -> LoadBitmap -> GlobalBitmap.cpp bitmap owner.
 * Executes startup Lua through the bitmap VM. Numeric IDs come only from
 * source-backed LoadImage/LoadImageByDir calls, never basename guesses.
 */
import * as THREE from 'three';
import {decodePcLuaText} from './PcLuaCrypt.js';
import {RemoteAssets} from './RemoteAssets.js';
import {MUAssetLoader} from '../assets/MUAssetLoader.js';
import {executePcBitmapLua} from './PcBitmapLuaVM.js';
export const PC_BITMAP_LUA_SOURCES = Object.freeze([
 {entry:'LoadImages',paths:['Configs/Lua/Controller/LoadImages.lua','Configs/lua/Controller/LoadImages.lua','Configs/crypt/Controller/LoadImages.lua']},
 {entry:'StartLoadImages',paths:['Configs/Lua/CharacterSystem/RenderModel.lua','Configs/lua/CharacterSystem/RenderModel.lua','Configs/crypt/CharacterSystem/RenderModel.lua']},
]);
// Lexical tokenization keeps strings and both Lua comment forms opaque.
function tokens(source){
 const out=[];let i=0;const s=String(source);
 const longAt=pos=>{const m=s.slice(pos).match(/^\[(=*)\[/);if(!m)return null;const start=pos+m[0].length,end=s.indexOf(']'+m[1]+']',start);if(end<0)throw Error('unterminated Lua long string');return {value:s.slice(start,end).replace(/^\r?\n/,''),end:end+m[1].length+2}};
 while(i<s.length){
  if(/\s/.test(s[i])){i++;continue}
  if(s.slice(i,i+2)==='--'){const long=longAt(i+2);if(long)i=long.end;else{const end=s.indexOf('\n',i+2);i=end<0?s.length:end}continue}
  const long=longAt(i);if(long){out.push({kind:'string',value:long.value});i=long.end;continue}
  if(s[i]==='"'||s[i]==="'"){
   const quote=s[i++];let value='',closed=false;
   while(i<s.length){const c=s[i++];if(c===quote){closed=true;break}if(c==='\\'){
    const e=s[i++];const escapes={a:'\x07',b:'\b',f:'\f',n:'\n',r:'\r',t:'\t',v:'\v','\\':'\\','"':'"',"'":"'"};
    if(Object.hasOwn(escapes,e))value+=escapes[e];else throw Error('unsupported Lua string escape');
   }else value+=c}
   if(!closed)throw Error('unterminated Lua string');out.push({kind:'string',value});continue;
  }
  const word=s.slice(i).match(/^[A-Za-z_]\w*/);if(word){out.push({kind:'word',value:word[0]});i+=word[0].length;continue}
  const number=s.slice(i).match(/^(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?)/);if(number){out.push({kind:'number',value:Number(number[0])});i+=number[0].length;continue}
  out.push({kind:'symbol',value:s[i++]});
 }
 return out;
}
function blockStep(stack,word){
 if(['function','if','for','while','repeat'].includes(word))stack.push(word);
 else if(word==='do'){if(['for','while'].includes(stack.at(-1)))stack[stack.length-1]='loop';else stack.push('do')}
 else if(word==='end'){if(!stack.length||stack.at(-1)==='repeat')throw Error('unbalanced Lua end');stack.pop()}
 else if(word==='until'){if(stack.at(-1)!=='repeat')throw Error('unbalanced Lua until');stack.pop()}
}
export function pcBitmapPhysicalPath(path){
 const normalized=String(path).replace(/\\/g,'/');
 if(normalized.startsWith('/')||normalized.includes(':')||normalized.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('invalid bitmap owner path');
 const m=normalized.match(/^(.*)\.(jpg|tga)$/i);if(!m)throw Error('LoadBitmap only owns JPG/TGA');
 return `${m[1]}.${m[2].toLowerCase()==='jpg'?'OZJ':'OZT'}`;
}
export function parsePcBitmapLuaOwners(source,entry){
 const ts=tokens(source);let selected=null;const scope=[];
 for(let i=0;i<ts.length;i++){
  const t=ts[i];if(t.kind!=='word')continue;
  if(t.value===entry&&ts[i+1]?.value==='='&&ts[i-1]?.value!=='.'&&ts[i-1]?.value!==':')throw Error('startup reassignment unsupported');
  if(t.value==='local'&&scope.length===0){
   let j=i+1;if(ts[j]?.value==='function')j++;
   while(ts[j]?.kind==='word'){
    if(ts[j].value===entry)throw Error('startup local shadow unsupported');
    if(ts[j+1]?.value!==',')break;j+=2;
   }
  }
  if(t.value==='function'&&scope.length>0&&ts[i+1]?.value===entry)throw Error('nested startup definition unsupported');
  if(t.value==='function'&&scope.length===0&&ts[i-1]?.value!=='local'&&ts[i+1]?.value===entry&&ts[i+2]?.value==='('&&ts[i+3]?.value===')'){
   const stack=['function'];let end=i+4;for(;end<ts.length;end++){if(ts[end].kind==='word')blockStep(stack,ts[end].value);if(!stack.length)break}
   if(stack.length)throw Error('unterminated startup function');selected=ts.slice(i+4,end);i=end;continue;
  }
  blockStep(scope,t.value);
 }
 if(scope.length)throw Error('unbalanced Lua script');if(!selected)throw Error(`startup function ${entry} absent`);
 const owners=new Map();let i=0;
 const take=(kind,value)=>{const t=selected[i++];if(!t||t.kind!==kind||(value!==undefined&&t.value!==value))throw Error(`unsupported statement in ${entry}`);return t.value};
 while(i<selected.length){
  if(selected[i].value===';'){i++;continue}
  if(selected[i].value==='return'){i++;if(i!==selected.length)throw Error('startup return expression unsupported');break}
  take('word','LoadImage');take('symbol','(');const path=take('string');take('symbol',',');const id=take('number');take('symbol',')');
  if(!Number.isSafeInteger(id)||id<0||id>0xffffffff)throw Error('invalid bitmap ID');
  const physicalPath=pcBitmapPhysicalPath(path);owners.set(id,Object.freeze({id,path,physicalPath,entry}));
 }
 return owners;
}
let root=RemoteAssets.baseUrl,epoch=0,owners=new Map(),loading=null,bitmapLoader=null;
const textures=new Map();
export function resetPcBitmapLuaOwners(){root=RemoteAssets.baseUrl;epoch++;owners=new Map();loading=null;bitmapLoader=null;textures.clear()}
function current(){if(root!==RemoteAssets.baseUrl)resetPcBitmapLuaOwners()}
export function pcBitmapOwner(id){current();return owners.get(id)||null}
export function loadPcBitmapLuaOwners(fetchBinary=async p=>{
 const canonical=await RemoteAssets.resolveExistingPath(p,{exactOnly:true});
 return canonical ? RemoteAssets.fetchBinary(canonical) : null;
}, {listFolder=async prefix=>{
 const manifest=await RemoteAssets._ensureManifest();if(!manifest)return null;
 return [...manifest.values()].filter(p=>p.toLowerCase().startsWith(prefix.toLowerCase())&&!p.slice(prefix.length).includes('/')&&p.toLowerCase().endsWith('.lua'));
}}={}){
 current();if(loading)return loading;
 const revision=epoch,authority=root;
 const job=(async()=>{
  const next=new Map(),sources=[],unavailable=[];let nextID=200000;
  const readSource=async source=>{
   // An existing file is authoritative, even if execution later fails.
   for(const path of source.paths){try{
    const bytes=await fetchBinary(path);if(bytes)return {...source,path,text:decodePcLuaText(bytes)};
   }catch(error){unavailable.push({path,reason:error.message});return null}}
   unavailable.push({path:source.paths[0],reason:'source absent'});return null;
  };
  const controller=await readSource(PC_BITMAP_LUA_SOURCES[0]);
  const model=await readSource(PC_BITMAP_LUA_SOURCES[1]);
  const publish=(source,parsed)=>{for(const [id,owner] of parsed)next.set(id,Object.freeze({...owner,source:source.path}))};
  const options=source=>({entry:source.entry,path:source.path,firstID:nextID,
   physicalPath:pcBitmapPhysicalPath,readFile:fetchBinary,listFolder,
   valid:()=>revision===epoch&&authority===RemoteAssets.baseUrl});
  let controllerDone=false;
  const runController=async()=>{
   if(controllerDone)return;controllerDone=true;if(!controller)return;
   try{const result=await executePcBitmapLua(controller.text,options(controller));
    publish(controller,result.owners);nextID=result.nextID;
    sources.push({path:controller.path,entry:controller.entry,count:result.owners.size});
   }catch(error){unavailable.push({path:controller.path,reason:error.message})}
  };
  if(model){let globalCount=0;
   try{
    // Winmain -> RenderModel::Init globals; NewUISystem -> controller;
    // NewUIDuelWindow -> StartLoadImages, retaining the model Lua state.
    const result=await executePcBitmapLua(model.text,{...options(model),beforeEntry:async initial=>{
     publish(model,initial.owners);globalCount=initial.owners.size;nextID=initial.nextID;
     await runController();return {nextID};
    }});
    publish(model,result.owners);nextID=result.nextID;
    sources.push({path:model.path,entry:model.entry,count:result.owners.size,globalCount});
   }catch(error){unavailable.push({path:model.path,reason:error.message})}
  }
  await runController();
  if(revision!==epoch||authority!==RemoteAssets.baseUrl)return null;
  owners=next;bitmapLoader=null;textures.clear();epoch++;
  return {count:next.size,sources,unavailable,nextDynamicID:nextID,runtime:'fengari-0.1.4-lua-5.3'};
 })().finally(()=>{if(loading===job)loading=null});loading=job;return job;
}
export function pcBitmapTexture(id){
 current();const owner=owners.get(id);if(!owner)return Promise.resolve(null);
 if(textures.has(id))return textures.get(id);
 const revision=epoch,authority=root;
 const valid=()=>revision===epoch&&authority===RemoteAssets.baseUrl&&owners.get(id)===owner;
 const job=(async()=>{
  // Exact manifest resolution forbids global basename recovery for an ID owner.
  const canonical=await RemoteAssets.resolveExistingPath(owner.physicalPath,{exactOnly:true});
  if(!canonical||!valid())return null;
  // Keep decoded texture caches scoped to this Data authority. The generic
  // BMD cache is indexed by path, so it cannot own numeric-ID root changes.
  bitmapLoader ??= new MUAssetLoader({baseUrl:authority,useIDB:false,useWorkers:false});
  const descriptor=await bitmapLoader.loadTexture(canonical);
  const texture=descriptor?.isTexture?descriptor:descriptor?.createThreeTexture?.(THREE,{pcBmd:true});
  if(texture?.userData?.muImageReadyPromise)await texture.userData.muImageReadyPromise;
  if(!valid()||!texture?.isTexture||(!texture.image&&texture.userData?.muImageReady!==true))return null;
  const view=texture.clone();view.colorSpace=THREE.NoColorSpace;view.flipY=false;
  view.minFilter=view.magFilter=THREE.NearestFilter;view.wrapS=view.wrapT=THREE.ClampToEdgeWrapping;view.generateMipmaps=false;
  view.userData={...texture.userData,muSharedAsset:true,muPcBitmapID:id,muPcBitmapPath:canonical,muPcBitmapHasAlpha:owner.physicalPath.toLowerCase().endsWith('.ozt')};view.needsUpdate=true;
  return view;
 })().catch(()=>null).then(texture=>{if(!texture&&textures.get(id)===job)textures.delete(id);return texture});
 textures.set(id,job);return job;
}
