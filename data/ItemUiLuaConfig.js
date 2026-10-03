import { decodePcLuaText } from './PcLuaCrypt.js';
/**
 * Real current-client item UI Lua owners used by Main 5.2:
 *   Configs/lua/Configs/bordas.lua            -> AddItemBorder(...)
 *   Configs/lua/Configs/CustomJewelStack.lua  -> SetJewelStack(...)
 *
 * No hard-coded item rows live here. Unsupported/dynamic expressions are
 * skipped fail-closed rather than guessed.
 */
const MAX_ITEM_INDEX=512, MAX_ITEM=16*MAX_ITEM_INDEX;
const BORDER_PATHS=['Configs/lua/Configs/bordas.lua','Configs/Lua/Configs/bordas.lua','Configs/crypt/Configs/bordas.lua'];
const STACK_PATHS=['Configs/lua/Configs/CustomJewelStack.lua','Configs/Lua/Configs/CustomJewelStack.lua','Configs/crypt/Configs/CustomJewelStack.lua'];
let _loaded=false,_inflight=null,_borders=new Map(),_stacks=new Set();
let _status=Object.freeze({loaded:false,borderPath:null,stackPath:null,borders:0,stacks:0});

function stripLuaComments(input=''){
  const s=String(input||''); let out='',i=0,q=null;
  while(i<s.length){const c=s[i],n=s[i+1]; if(q){out+=c;if(c==='\\'&&i+1<s.length){out+=s[++i];i++;continue;}if(c===q)q=null;i++;continue;} if(c==='"'||c==="'"){q=c;out+=c;i++;continue;} if(c==='-'&&n==='-'){if(s[i+2]==='['&&s[i+3]==='['){const e=s.indexOf(']]',i+4);i=e<0?s.length:e+2;continue;}i+=2;while(i<s.length&&s[i]!='\n')i++;continue;}out+=c;i++;}return out;
}
function splitArgs(body){const a=[];let start=0,depth=0,q=null;for(let i=0;i<body.length;i++){const c=body[i];if(q){if(c==='\\')i++;else if(c===q)q=null;continue;}if(c==='"'||c==="'"){q=c;continue;}if(c==='('||c==='{'||c==='[')depth++;else if(c===')'||c==='}'||c===']')depth--;else if(c===','&&depth===0){a.push(body.slice(start,i).trim());start=i+1;}}a.push(body.slice(start).trim());return a;}
function scanCalls(text,name){const out=[];let p=0;const needle=name;while((p=text.indexOf(needle,p))>=0){let i=p+needle.length;while(/\s/.test(text[i]||''))i++;if(text[i]!=='('){p=i;continue;}const open=i;let depth=0,q=null,end=-1;for(;i<text.length;i++){const c=text[i];if(q){if(c==='\\')i++;else if(c===q)q=null;continue;}if(c==='"'||c==="'"){q=c;continue;}if(c==='(')depth++;else if(c===')'){depth--;if(depth===0){end=i;break;}}}if(end<0)break;out.push(splitArgs(text.slice(open+1,end)));p=end+1;}return out;}
function evalNumber(expr){const t=String(expr||'').trim();if(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(t)){const v=Number(t);return Number.isFinite(v)?v:null;}return null;}
function evalItem(expr){const t=String(expr||'').trim();let m=/^GET_ITEM\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(t);if(m){const g=Number(m[1]),n=Number(m[2]);return g>=0&&g<16&&n>=0&&n<MAX_ITEM_INDEX?g*MAX_ITEM_INDEX+n:null;}const v=evalNumber(t);return Number.isInteger(v)&&v>=0&&v<MAX_ITEM?v:null;}
export function parseItemBordersLua(source){const out=new Map(),text=stripLuaComments(source);for(const a of scanCalls(text,'AddItemBorder')){if(a.length<6)continue;const item=evalItem(a[0]),th=evalNumber(a[1]),r=evalNumber(a[2]),g=evalNumber(a[3]),b=evalNumber(a[4]),alpha=evalNumber(a[5]);if(item===null||![th,r,g,b,alpha].every(Number.isFinite)||th<0)continue;out.set(item,{thickness:th,r:Math.max(0,Math.min(255,r)),g:Math.max(0,Math.min(255,g)),b:Math.max(0,Math.min(255,b)),alpha:Math.max(0,Math.min(255,alpha))/255});}return out;}
export function parseJewelStackLua(source){
  const out=new Set(),text=stripLuaComments(source);
  for(const a of scanCalls(text,'SetJewelStack')){if(!a.length)continue;const item=evalItem(a[0]);if(item!==null)out.add(item);}
  // Current-client owner is table-driven: CUSTOM_JEWEL_STACK rows are passed
  // verbatim to SetJewelStack from StartLoadJewelStack(). Consume that table
  // only when the exact loader contract exists; do not scan unrelated GET_ITEMs.
  if(/\bfunction\s+StartLoadJewelStack\s*\(/i.test(text) && /SetJewelStack\s*\(\s*CUSTOM_JEWEL_STACK\s*\[/i.test(text)){
    const decl=/\bCUSTOM_JEWEL_STACK\s*=\s*\{/i.exec(text);
    if(decl){let open=text.indexOf('{',decl.index),depth=0,q=null,end=-1;for(let i=open;i<text.length;i++){const c=text[i];if(q){if(c==='\\')i++;else if(c===q)q=null;continue;}if(c==='"'||c==="'"){q=c;continue;}if(c==='{')depth++;else if(c==='}'){depth--;if(depth===0){end=i;break;}}}if(end>open){const table=text.slice(open,end+1),re=/\bItemIndex\s*=\s*(GET_ITEM\s*\(\s*\d+\s*,\s*\d+\s*\)|\d+)/gi;let m;while((m=re.exec(table))){const item=evalItem(m[1]);if(item!==null)out.add(item);}}}
  }
  return out;
}
async function readParsed(fetchBinary,paths,parse){let first=null,lastError=null;for(const p of paths){try{const b=await fetchBinary(p);if(!b)continue;const u=b instanceof Uint8Array?b:new Uint8Array(b),text=decodePcLuaText(u);if(!first)first={path:p,text};const value=parse(text);if(value?.size)return{path:p,text,value};}catch(e){lastError=e;}}return{...(first||{path:null,text:null}),value:parse(''),error:lastError};}
export async function loadItemUiLuaConfig(fetchBinary){if(_loaded)return _status;if(_inflight)return _inflight;if(typeof fetchBinary!=='function')return _status;_inflight=(async()=>{const [b,s]=await Promise.all([readParsed(fetchBinary,BORDER_PATHS,parseItemBordersLua),readParsed(fetchBinary,STACK_PATHS,parseJewelStackLua)]);_borders=b.value||new Map();_stacks=s.value||new Set();_loaded=true;_status=Object.freeze({loaded:true,borderPath:b.path,stackPath:s.path,borders:_borders.size,stacks:_stacks.size});console.info(`[ItemUIConfig] borders=${_borders.size} (${b.path||'missing'}) jewelStacks=${_stacks.size} (${s.path||'missing'})`);return _status;})().finally(()=>{_inflight=null;});return _inflight;}
export function itemBorderFor(type){return _borders.get(type)||null;}
export function isJewelStackType(type){return _stacks.has(type);}
export function itemUiLuaStatus(){return _status;}
