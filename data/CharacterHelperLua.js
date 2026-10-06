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
  while(i<s.length){
    const c=s[i],n=s[i+1];
    if(q){out+=c;if(c==='\\'&&i+1<s.length)out+=s[++i];else if(c===q)q=null;i++;continue;}
    if(c==='"'||c==="'"){q=c;out+=c;i++;continue;}
    if(c==='-'&&n==='-'){
      // Lua long comments are --[[...]], --[=[...]=], --[==[...]==], etc.
      // Treat every valid long-bracket delimiter as comment authority so a
      // commented SetHelper can never become an active helper/model owner.
      const tail=s.slice(i+2); const m=/^\[(=*)\[/.exec(tail);
      if(m){
        const close=']'+m[1]+']'; const body=i+2+m[0].length; const e=s.indexOf(close,body);
        if(e<0)return out;
        // Preserve newlines so diagnostics/source-relative behavior remains sane.
        for(let k=body;k<e;k++)if(s[k]==='\n')out+='\n';
        i=e+close.length; continue;
      }
      i+=2;while(i<s.length&&s[i]!=='\n')i++;continue;
    }
    out+=c;i++;
  }
  return out;
}
function splitArgs(body=''){const out=[];let cur='',d=0,q=null;for(let i=0;i<body.length;i++){const c=body[i];if(q){cur+=c;if(c==='\\'&&i+1<body.length)cur+=body[++i];else if(c===q)q=null;continue;}if(c==='"'||c==="'"){q=c;cur+=c;continue;}if('({['.includes(c))d++;else if(')}]'.includes(c))d--;if(c===','&&d===0){out.push(cur.trim());cur='';}else cur+=c;}if(cur.trim())out.push(cur.trim());return out;}
function scanCalls(text,name){const out=[];let p=0;for(;;){p=text.indexOf(name,p);if(p<0)break;const before=p>0?text[p-1]:'';const after=text[p+name.length]||'';/* Lua identifier boundary: never promote FooSetHelper/SetHelperAlias into an authoritative owner. */if(/[A-Za-z0-9_]/.test(before)||/[A-Za-z0-9_]/.test(after)){p+=name.length;continue;}let i=p+name.length;while(/\s/.test(text[i]||''))i++;if(text[i]!=='('){p=i;continue;}const start=++i;let d=1,q=null;for(;i<text.length;i++){const c=text[i];if(q){if(c==='\\')i++;else if(c===q)q=null;continue;}if(c==='"'||c==="'"){q=c;continue;}if(c==='(')d++;else if(c===')'&&--d===0)break;}if(d===0)out.push(splitArgs(text.slice(start,i)));p=i+1;}return out;}
function num(v){const s=String(v??'').trim();if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))return null;const n=Number(s);return Number.isFinite(n)?n:null;}
function str(v){const m=/^(['"])([\s\S]*)\1$/.exec(String(v??'').trim());return m?m[2]:null;}
function item(v){const s=String(v??'').trim();let m=/^GET_ITEM(?:_MODEL)?\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(s);if(m)return Number(m[1])*512+Number(m[2]);const n=num(s);return Number.isInteger(n)?n:null;}
function modelPath(model,baseDir){if(!model)return null;let p=String(model).replace(/\\/g,'/').replace(/\/{2,}/g,'/').replace(/^Data\//i,'').replace(/^\.\//,'').replace(/^\//,'');if(!p.includes('/'))p=`${baseDir}/${p}`;if(!/\.bmd$/i.test(p))p += '.bmd';return p;}


function findMatchingBrace(text,start){let d=0,q=null;for(let i=start;i<text.length;i++){const c=text[i];if(q){if(c==='\\')i++;else if(c===q)q=null;continue;}if(c==='"'||c==="'"){q=c;continue;}if(c==='{')d++;else if(c==='}'&&--d===0)return i;}return -1;}
function tableField(body,key){
  const re=new RegExp(`(?:^|[,\\n\\r])\\s*${key}\\s*=\\s*`,'i'); const m=re.exec(body); if(!m)return null;
  let i=m.index+m[0].length,start=i,d=0,q=null;
  for(;i<body.length;i++){const c=body[i];if(q){if(c==='\\')i++;else if(c===q)q=null;continue;}if(c==='"'||c==="'"){q=c;continue;}if(c==='('||c==='{'||c==='[')d++;else if(c===')'||c==='}'||c===']'){if(d===0)break;d--;}else if(c===','&&d===0)break;else if((c==='\n'||c==='\r')&&d===0)break;}
  return body.slice(start,i).trim();
}
function boolVal(v){const s=String(v??'').trim().toLowerCase();return s==='true'?true:s==='false'?false:null;}
function parseActions(v){const m=/^\{([\s\S]*)\}$/.exec(String(v??'').trim());if(!m)return Object.freeze([]);const a=m[1].split(',').map(x=>num(x.trim())).filter(Number.isFinite);return Object.freeze(a);}
function rowActions(row){const m=/\bActions\s*=\s*\{([^}]*)\}/i.exec(row);return m?parseActions(`{${m[1]}}`):Object.freeze([]);}
function parseRecordTables(body){const out=[];let i=0;while(i<body.length){const p=body.indexOf('{',i);if(p<0)break;const e=findMatchingBrace(body,p);if(e<0)break;const row=body.slice(p+1,e);out.push(row);i=e+1;}return out;}
function namedTableBody(block,key){const re=new RegExp(String.raw`(?:^|[,\n\r])\s*${key}\s*=\s*\{`,'i');const m=re.exec(block);if(!m)return null;const p=m.index+m[0].lastIndexOf('{');const e=findMatchingBrace(block,p);return e>=0?block.slice(p+1,e):null;}
function parseRenderRow(row){
  const actions=rowActions(row); const n=(k,d=null)=>{const v=num(tableField(row,k));return v==null?d:v;};
  const b=(k,d=false)=>{const v=boolVal(tableField(row,k));return v==null?d:v;};
  const mesh=n('Mesh');const glow=n('Glow'); if(mesh==null||glow==null)return null;
  return Object.freeze({actions,mesh,glow,r:n('R',-1),g:n('G',-1),b:n('B',-1),shadow:b('Shadow'),render:b('Render'),effect:n('Effect',-1),fixEffect:b('FixEffect'),value:n('Value',1),renOpacity:n('RenOpacity',0),renSpeed:n('RenSpeed',0),renColor:n('RenColor',1),color:b('Color'),rr:n('RR',1),rg:n('RG',1),rb:n('RB',1),timer:n('Timer',100),texture:n('Texture',-1)});
}
function parseEffectRow(row){
  const actions=rowActions(row);const n=(k,d=null)=>{const v=num(tableField(row,k));return v==null?d:v;};const b=(k,d=false)=>{const v=boolVal(tableField(row,k));return v==null?d:v;};
  const effectType=n('EffectType'),effectIndex=n('EffectIndex'),bone=n('Bone');if(effectType==null||effectIndex==null||bone==null)return null;
  return Object.freeze({actions,effectType,effectIndex,effectLevel:n('EffectLevel',0),bone,size:n('Size',1),r:n('R',1),g:n('G',1),b:n('B',1),posX:n('PosX',0),posY:n('PosY',0),posZ:n('PosZ',0),black:b('Black'),randTime:n('RandTime',100)});
}
function parseNamedEffectTables(text){
  const out=new Map();const re=/(?:^|[\n\r])\s*(?:local\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/g;let m;
  while((m=re.exec(text))){const name=m[1],start=m.index+m[0].lastIndexOf('{'),end=findMatchingBrace(text,start);if(end<0)break;const body=text.slice(start+1,end);const rows=parseRecordTables(body).map(parseEffectRow).filter(Boolean);if(rows.length)out.set(name,Object.freeze(rows));re.lastIndex=end+1;}
  return out;
}
function resolveEffectRows(block,key,named){
  const body=namedTableBody(block,key);if(body!=null)return Object.freeze(parseRecordTables(body).map(parseEffectRow).filter(Boolean));
  const ref=String(tableField(block,key)||'').trim();return named.get(ref)||Object.freeze([]);
}
export function parseCharacterHelperRenderTables(input){
  const text=stripComments(input),out=new Map(),namedEffects=parseNamedEffectTables(text);const re=/RENDER_HELPER\s*\[\s*GET_ITEM(?:_MODEL)?\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*\]\s*=\s*\{/gi;let m;
  while((m=re.exec(text))){const start=m.index+m[0].lastIndexOf('{'),end=findMatchingBrace(text,start);if(end<0)break;const block=text.slice(start+1,end);const itemIndex=Number(m[1])*512+Number(m[2]);
    const modelBody=namedTableBody(block,'Model');const footBody=namedTableBody(block,'FootEffect');
    const model=Object.freeze((modelBody?parseRecordTables(modelBody):[]).map(parseRenderRow).filter(Boolean));
    const effects=resolveEffectRows(block,'Effect',namedEffects);
    const miniature=resolveEffectRows(block,'Miniature',namedEffects);
    out.set(itemIndex,Object.freeze({itemIndex,shadow:boolVal(tableField(block,'Shadow'))===true,model,effects,miniature,footEffectRows:footBody?parseRecordTables(footBody).length:0,owner:'CharacterHelper.lua'}));
    re.lastIndex=end+1;
  }
  return out;
}

function parseHelperConfigTable(text,out){
  const m=/\bHELPER_CONFIG\s*=\s*\{/i.exec(text);if(!m)return;
  const start=m.index+m[0].lastIndexOf('{'),end=findMatchingBrace(text,start);if(end<0)return;
  const body=text.slice(start+1,end);
  for(const row of parseRecordTables(body)){
    const itemIndex=item(tableField(row,'ItemIndex'));const rawType=num(tableField(row,'Type'));const movement=num(tableField(row,'Movement'));const height=num(tableField(row,'Height'));const size=num(tableField(row,'Size'));const sizeCharList=num(tableField(row,'SizeSelectChar'));const miniature=num(tableField(row,'Miniature'));const sizeMiniature=num(tableField(row,'SizeMiniature'));const velocityMiniature=num(tableField(row,'VelocityMiniature'));const model=str(tableField(row,'Model'));const objectModel=str(tableField(row,'ObjectModel'));
    if(!Number.isInteger(itemIndex)||[rawType,movement,height,size,sizeCharList,miniature,sizeMiniature,velocityMiniature].some(v=>v==null)||model==null||objectModel==null)continue;
    const type=rawType===1?2:rawType===2?4:rawType===3?8:rawType===4?16:rawType;
    const modelDir=str(tableField(row,'ModelDir'))||'Data\\Item\\';const objectModelDir=str(tableField(row,'ObjectModelDir'))||(rawType===0?'Data\\Item\\':'Data\\Skill\\');
    const dirBase=(d,fallback)=>{let x=String(d||'').replace(/\\/g,'/').replace(/\/{2,}/g,'/').replace(/^Data\//i,'').replace(/^\//,'').replace(/\/$/,'');return x||fallback;};
    const itemModelPath=modelPath(model,dirBase(modelDir,'Item'));const objectModelPath=modelPath(objectModel,dirBase(objectModelDir,rawType===0?'Item':'Skill'));const renderModelPath=rawType===0?itemModelPath:objectModelPath;
    out.set(itemIndex,Object.freeze({itemIndex,type,rawType,movement,height,size,sizeCharList,miniature,sizeMiniature,velocityMiniature,model,objectModel,modelDir,objectModelDir,separateModel:num(tableField(row,'SeparateModel')),defenseSkill:num(tableField(row,'DefenseSkill')),fileType:num(tableField(row,'FileType')),modelPath:itemModelPath,itemModelPath,objectModelPath,renderModelPath,owner:'CharacterHelper.lua'}));
  }
}

export function parseCharacterHelperLua(input){
  const text=stripComments(input),out=new Map();
  parseHelperConfigTable(text,out);
  for(const a of scanCalls(text,'SetHelper')){
    if(a.length<11)continue;
    const itemIndex=item(a[0]); const vals=a.slice(1,9).map(num); const model=str(a[9]),objectModel=str(a[10]);
    if(!Number.isInteger(itemIndex)||vals.some(v=>v==null)||model==null||objectModel==null)continue;
    const [rawType,movement,height,size,sizeCharList,miniature,sizeMiniature,velocityMiniature]=vals;
    const type=rawType===1?2:rawType===2?4:rawType===3?8:rawType===4?16:rawType;
    const itemModelPath=modelPath(model,'Item');
    const objectModelPath=modelPath(objectModel,'Skill');
    // PC OpenItems/HelperSystem: Model is the inventory/item BMD under Data\Item.
    // Type==0 renders that item model directly; Type>0 receives a synthetic ModelID
    // whose BMD is ObjectModel loaded from Data\Skill. Keep both identities and expose
    // the exact runtime selection so flying pets are never mistaken for mount models.
    const renderModelPath=type===0?itemModelPath:objectModelPath;
    out.set(itemIndex,Object.freeze({itemIndex,type,rawType,movement,height,size,sizeCharList,miniature,sizeMiniature,velocityMiniature,model,objectModel,modelPath:itemModelPath,itemModelPath,objectModelPath,renderModelPath,owner:'CharacterHelper.lua'}));
  }
  return out;
}
let registry=new Map(),renderRegistry=new Map(),status=Object.freeze({loaded:false,count:0,renderCount:0,path:null}),inflight=null;
export function characterHelperRule(itemIndex){return registry.get(Number(itemIndex))||null;}
export function characterHelperRenderRule(itemIndex){return renderRegistry.get(Number(itemIndex))||null;}
export function characterHelperRenderSnapshot(){return new Map(renderRegistry);}
export function characterHelperStatus(){return status;}
export function characterHelperSnapshot(){return new Map(registry);}
export async function loadCharacterHelperLua(fetchBinary=(p)=>RemoteAssets.fetchBinary(p)){
  if(status.loaded)return status;if(inflight)return inflight;
  inflight=(async()=>{let last=null;for(const path of CHARACTER_HELPER_PATHS){try{const b=await fetchBinary(path);if(!b)continue;const decoded=decodePcLuaText(b);const next=parseCharacterHelperLua(decoded);if(!next.size)throw new Error(`${path}: nenhum SetHelper ativo reconhecido`);const renderNext=parseCharacterHelperRenderTables(decoded);registry=next;renderRegistry=renderNext;status=Object.freeze({loaded:true,count:next.size,renderCount:renderNext.size,path});console.info(`[CharacterHelper] owner real ${path} rows=${next.size} renderRows=${renderNext.size}`);return status;}catch(e){last=e;}}throw last||new Error('CharacterHelper.lua ausente');})().finally(()=>{inflight=null;});return inflight;
}
export function resetCharacterHelperLuaForTests(){registry=new Map();renderRegistry=new Map();status=Object.freeze({loaded:false,count:0,renderCount:0,path:null});inflight=null;}
