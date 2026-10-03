import { RemoteAssets } from './RemoteAssets.js';
import { decodePcLuaText } from './PcLuaCrypt.js';

const CONFIG_PATHS=Object.freeze([
  'Configs/lua/Manager/Interface/MoveCustomInterfaceConfig.lua',
  'Configs/Lua/Manager/Interface/MoveCustomInterfaceConfig.lua',
  'Configs/crypt/Manager/Interface/MoveCustomInterfaceConfig.lua',
]);
const INTERFACE_PATHS=Object.freeze([
  'Configs/lua/Manager/Interface/MoveCustomInterface.lua',
  'Configs/Lua/Manager/Interface/MoveCustomInterface.lua',
  'Configs/crypt/Manager/Interface/MoveCustomInterface.lua',
]);

function stripComments(input='') {
  const s=String(input||''); let out='',i=0,q=null;
  while(i<s.length){const c=s[i],n=s[i+1];if(q){out+=c;if(c==='\\'&&i+1<s.length){out+=s[++i];i++;continue;}if(c===q)q=null;i++;continue;}if(c==='"'||c==="'"){q=c;out+=c;i++;continue;}if(c==='-'&&n==='-'){if(s[i+2]==='['&&s[i+3]==='['){const e=s.indexOf(']]',i+4);i=e<0?s.length:e+2;continue;}i+=2;while(i<s.length&&s[i]!='\n')i++;continue;}out+=c;i++;}return out;
}
function blockAt(text,open){if(open<0||text[open]!=='{')return null;let d=0,q=null;for(let i=open;i<text.length;i++){const c=text[i];if(q){if(c==='\\')i++;else if(c===q)q=null;continue;}if(c==='"'||c==="'"){q=c;continue;}if(c==='{')d++;else if(c==='}'){d--;if(d===0)return{text:text.slice(open,i+1),end:i};}}return null;}
function entries(table){const body=table.text.slice(1,-1),out=[];let i=0;while(i<body.length){const o=body.indexOf('{',i);if(o<0)break;const b=blockAt(body,o);if(!b)break;out.push(b.text);i=b.end+1;}return out;}
function strField(row,key){const m=new RegExp(`\\b${key}\\s*=\\s*(['"])([\\s\\S]*?)\\1`,'i').exec(row);return m?m[2]:null;}
function numField(row,key){const m=new RegExp(`\\b${key}\\s*=\\s*([-+]?\\d+(?:\\.\\d+)?)`,'i').exec(row);if(!m)return null;const v=Number(m[1]);return Number.isFinite(v)?v:null;}
function boolField(row,key){const m=new RegExp(`\\b${key}\\s*=\\s*(true|false)`,'i').exec(row);return m?m[1].toLowerCase()==='true':null;}
function alignField(row){const m=/\balignText\s*=\s*\{([\s\S]*?)\}/i.exec(row);if(!m)return null;const x=/\[\s*0\s*\]\s*=\s*([-+]?\d+)/.exec(m[1]),y=/\[\s*1\s*\]\s*=\s*([-+]?\d+)/.exec(m[1]);return x&&y?Object.freeze([Number(x[1]),Number(y[1])]):null;}
function parseRow(row,isMove=false){const label=strField(row,isMove?'title':'name');const required={index:numField(row,'index'),IX:numField(row,'IX'),IY:numField(row,'IY'),wdth:numField(row,'wdth'),heigth:numField(row,'heigth'),mapNumber:numField(row,'mapNumber'),cdX:numField(row,'cdX'),cdY:numField(row,'cdY')};if(!label||Object.values(required).some((v)=>!Number.isFinite(v)))return null;const rec={...(isMove?{title:label}:{name:label}),...required,alignText:alignField(row)};if(!isMove){const listMove=boolField(row,'listMove');if(listMove===null)return null;rec.listMove=listMove;}return Object.freeze(rec);}

export function parseMoveCustomConfigLua(input){
  const text=stripComments(input), topDecl=/\bmoveCustomConfigMap\s*=\s*\{/i.exec(text);if(!topDecl)throw new Error('moveCustomConfigMap ausente');const topBlock=blockAt(text,text.indexOf('{',topDecl.index));if(!topBlock)throw new Error('moveCustomConfigMap truncado');const maps=entries(topBlock).map((r)=>parseRow(r,false)).filter(Boolean);if(!maps.length)throw new Error('moveCustomConfigMap sem entradas literais');
  const moves=new Map();const re=/moveCustomConfigMoves\s*\[\s*(['"])(.*?)\1\s*\]\s*=\s*\{/g;let m;while((m=re.exec(text))){const open=text.indexOf('{',m.index+m[0].length-1),b=blockAt(text,open);if(!b)continue;const list=entries(b).map((r)=>parseRow(r,true)).filter(Boolean);if(list.length)moves.set(m[2],Object.freeze(list));re.lastIndex=b.end+1;}
  for(const map of maps){if(map.listMove&&!moves.has(map.name))throw new Error(`MoveCustom config sem destinos para ${map.name}`);}
  return Object.freeze({maps:Object.freeze(maps),moves});
}

export function parseMoveCustomInterfaceContract(input){
  const text=stripComments(input);
  const p=/\blocal\s+MoveCustom_Packet\s*=\s*(0x[0-9a-f]+|\d+)/i.exec(text), w=/\blocal\s+moveWindow\s*=\s*(\d+)/i.exec(text);
  const packet=p?Number(p[1]):NaN,windowId=w?Number(w[1]):NaN;
  const checks=[
    packet===0x48,windowId===90876,
    /CreatePacket\s*\(\s*packName\s*,\s*packet\s*\)/.test(text),
    /SetCharPacketLength\s*\(\s*packName\s*,\s*map\s*,\s*10\s*\)/.test(text),
    /SetCharPacketLength\s*\(\s*packName\s*,\s*destination\s*,\s*10\s*\)/.test(text),
    (text.match(/SetDwordPacket\s*\(\s*packName\s*,/g)||[]).length>=3,
    /SendPacket\s*\(\s*packName\s*\)/.test(text),
    /packetName\s*==\s*['"]GS_MoveCustom['"]/.test(text),
    /Keys\.M\s*==\s*key/.test(text),
    /DrawBar\s*\(\s*200\s*,\s*138\s*,\s*205\s*,\s*149\s*\)/.test(text),
  ];
  if(checks.some((v)=>!v))throw new Error('MoveCustomInterface.lua: contrato exato não reconhecido');
  return Object.freeze({packet,windowId,packetName:'GS_MoveCustom',panel:Object.freeze({x:200,y:138,w:205,h:149}),close:Object.freeze({x:273,y:250,w:60,h:25}),back:Object.freeze({x:208,y:250,w:60,h:25})});
}

async function firstValid(paths,parse){let last=null;for(const path of paths){try{const bytes=await RemoteAssets.fetchBinary(path);if(!bytes)continue;const text=decodePcLuaText(bytes);const value=parse(text);return{path,text,value};}catch(e){last=e;}}throw last||new Error(`MoveCustom owner ausente: ${paths.join(', ')}`);}
let cached=null,inflight=null;
export async function loadMoveCustomLua(){if(cached)return cached;if(inflight)return inflight;inflight=(async()=>{const [cfg,iface]=await Promise.all([firstValid(CONFIG_PATHS,parseMoveCustomConfigLua),firstValid(INTERFACE_PATHS,parseMoveCustomInterfaceContract)]);cached=Object.freeze({config:cfg.value,contract:iface.value,configPath:cfg.path,interfacePath:iface.path});console.info(`[MoveCustom] owner real carregado config=${cfg.path} interface=${iface.path} maps=${cfg.value.maps.length}`);return cached;})().finally(()=>{inflight=null;});return inflight;}
export function clearMoveCustomLuaCache(){cached=null;}
