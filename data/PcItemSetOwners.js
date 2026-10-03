// PcItemSetOwners.js — direct Main 5.2 CSItemOption binary/table owner.
// Authority: _struct.h ITEM_SET_TYPE/ITEM_SET_OPTION + CSItemOption.cpp.
// No fallback rows. Files that do not match a supported desktop ABI/checksum
// fail closed and leave Ancient/Set presentation unavailable.

import { pcItemChecksum } from './PcItemAttributes.js';

const BUX = Uint8Array.of(0xFC,0xCF,0xAB);
const DECODER = new TextDecoder('windows-1252');
export const PC_SET_MAX_ITEM = 16*512; // _define.h MAX_ITEM_TYPE(16)*MAX_ITEM_INDEX(512)
export const PC_SET_MAX_OPTION = 64;
export const PC_SET_TYPE_RECORD = 4;

function asU8(input){
  if(input instanceof Uint8Array)return input;
  if(input instanceof ArrayBuffer)return new Uint8Array(input);
  throw new Error('CSItemOption: binary input ausente');
}
function cstr(bytes){let e=bytes.indexOf(0);if(e<0)e=bytes.length;return DECODER.decode(bytes.subarray(0,e));}
function decryptRecord(src,off,size){const out=new Uint8Array(size);for(let i=0;i<size;i++)out[i]=src[off+i]^BUX[i%3];return out;}
function exactBodyWithChecksum(input,record,count,key,label){
  const src=asU8(input), bodySize=record*count, expected=bodySize+4;
  if(src.length!==expected)throw new Error(`${label}: tamanho ${src.length}/${expected}`);
  const body=src.subarray(0,bodySize), got=new DataView(src.buffer,src.byteOffset+bodySize,4).getUint32(0,true);
  const want=pcItemChecksum(body,key)>>>0;
  if(got!==want)throw new Error(`${label}: checksum mismatch ${got.toString(16)}/${want.toString(16)}`);
  return body;
}

export function parsePcItemSetType(input){
  const body=exactBodyWithChecksum(input,PC_SET_TYPE_RECORD,PC_SET_MAX_ITEM,0xE5F1,'ItemSetType.bmd');
  const rows=new Array(PC_SET_MAX_ITEM);
  for(let i=0;i<rows.length;i++){
    const r=decryptRecord(body,i*4,4);
    rows[i]=Object.freeze({byOption:Object.freeze([r[0],r[1]]),byMixItemLevel:Object.freeze([r[2],r[3]])});
  }
  return Object.freeze(rows);
}

// ITEM_SET_OPTION is byte-only after char[64]. Source supports MAX_CLASS 6 or
// 7 via PBG_ADD_NEWCHAR_MONK. Accept exactly those two source ABIs by file size;
// no offset/record-size guessing is performed.
export function parsePcItemSetOption(input){
  const src=asU8(input);
  const candidates=[7,6].map(maxClass=>({maxClass,record:103+maxClass}));
  const abi=candidates.find(x=>src.length===x.record*PC_SET_MAX_OPTION+4);
  if(!abi)throw new Error(`ItemSetOption: unsupported exact size ${src.length}`);
  const body=exactBodyWithChecksum(src,abi.record,PC_SET_MAX_OPTION,0xA2F1,`ItemSetOption(${abi.maxClass} classes)`);
  const rows=new Array(PC_SET_MAX_OPTION);
  for(let i=0;i<rows.length;i++){
    const r=decryptRecord(body,i*abi.record,abi.record);
    let o=0;
    const name=cstr(r.subarray(o,o+64));o+=64;
    const stdOpt=Array.from({length:6},()=>Object.freeze([r[o++],r[o++]]));
    const stdVal=Array.from({length:6},()=>Object.freeze([r[o++],r[o++]]));
    const extOpt=Object.freeze([r[o++],r[o++]]), extVal=Object.freeze([r[o++],r[o++]]);
    const optionCount=r[o++];
    const fullOpt=Object.freeze(Array.from(r.subarray(o,o+5)));o+=5;
    const fullVal=Object.freeze(Array.from(r.subarray(o,o+5)));o+=5;
    const requireClass=Object.freeze(Array.from(r.subarray(o,o+abi.maxClass)));
    rows[i]=Object.freeze({name,byStandardOption:Object.freeze(stdOpt),byStandardOptionValue:Object.freeze(stdVal),byExtOption:extOpt,byExtOptionValue:extVal,byOptionCount:optionCount,byFullOption:fullOpt,byFullOptionValue:fullVal,byRequireClass:requireClass});
  }
  return Object.freeze({rows:Object.freeze(rows),maxClass:abi.maxClass,recordSize:abi.record});
}

export async function loadPcItemSetOwners(fetchBinary,paths={}){
  if(typeof fetchBinary!=='function')throw new Error('CSItemOption: fetchBinary ausente');
  const p=Object.freeze({
    type:paths.type||'Local/ItemSetType.bmd',
    option:paths.option||'Local/Por/ItemSetOption_Por.bmd',
  });
  const out={type:null,option:null,maxClass:0,paths:p,errors:{}};
  try{out.type=parsePcItemSetType(await fetchBinary(p.type));}catch(e){out.errors.type=String(e?.message||e);}
  try{const v=parsePcItemSetOption(await fetchBinary(p.option));out.option=v.rows;out.maxClass=v.maxClass;}catch(e){out.errors.option=String(e?.message||e);}
  out.errors=Object.freeze({...out.errors});
  return Object.freeze(out);
}

export function pcResolveSetItem(item,owners){
  const type=Number(item?.itemType??item?.type), ext=Number(item?.extOption||0)&0xFF, kind=ext%4;
  if(!Number.isInteger(type)||type<0||type>=PC_SET_MAX_ITEM||kind<1||kind>2)return null;
  const st=owners?.type?.[type]; if(!st)return null;
  const idx=Number(st.byOption?.[kind-1]);
  if(!Number.isInteger(idx)||idx<=0||idx===255||idx>=PC_SET_MAX_OPTION)return null;
  const so=owners?.option?.[idx]; if(!so||Number(so.byOptionCount)>=255||!so.name)return null;
  return Object.freeze({kind,index:idx,typeRow:st,optionRow:so});
}

export const PC_SET_CONSTANTS=Object.freeze({MAX_ITEM:PC_SET_MAX_ITEM,MAX_SET_OPTION:PC_SET_MAX_OPTION,TYPE_RECORD:PC_SET_TYPE_RECORD});
