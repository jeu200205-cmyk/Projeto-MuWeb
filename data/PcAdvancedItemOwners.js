// PcAdvancedItemOwners.js — binary owners used by Main 5.2 RenderItemInfo.
// Direct ports of ItemAddOptioninfo.cpp, UIJewelHarmony.cpp and SocketSystem.cpp.
// No guessed rows or fallback tables: missing/invalid runtime BMD keeps the
// corresponding tooltip branch fail-closed.

const BUX = Uint8Array.of(0xFC, 0xCF, 0xAB);
const DECODER = new TextDecoder('windows-1252');
const MAX_ITEM = 32 * 512;
const HARMONY_TYPES = 3;
const HARMONY_OPTIONS = 10;
const SOCKET_TYPES = 3;
const SOCKET_OPTIONS = 50;
const MAX_SOCKETS = 5;
const SOCKET_EMPTY = 0xFF;

function asU8(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new Error('advanced owner: binary input ausente');
}
function decodeCString(bytes) {
  let end = bytes.indexOf(0);
  if (end < 0) end = bytes.length;
  return DECODER.decode(bytes.subarray(0, end));
}
function buxWhole(input) {
  const src = asU8(input), out = Uint8Array.from(src);
  for (let i=0;i<out.length;i++) out[i] ^= BUX[i%3];
  return out;
}
function buxRecord(src, off, size) {
  const out = new Uint8Array(size);
  for (let i=0;i<size;i++) out[i] = src[off+i] ^ BUX[i%3];
  return out;
}

// ITEM_ADD_OPTION is 16 bytes under the desktop ABI:
// BYTE@0, pad1, WORD@2, BYTE@4, pad1, WORD@6, BYTE@8, pad3, DWORD@12.
export function parsePcItemAddOption(input) {
  const RECORD=16, expected=MAX_ITEM*RECORD;
  const dec=buxWhole(input);
  if(dec.length < expected) throw new Error(`ItemAddOption.bmd curto ${dec.length}/${expected}`);
  const dv=new DataView(dec.buffer,dec.byteOffset,dec.byteLength);
  const rows=new Array(MAX_ITEM);
  for(let i=0;i<MAX_ITEM;i++){
    const o=i*RECORD;
    rows[i]=Object.freeze({
      option1:dec[o], value1:dv.getUint16(o+2,true),
      option2:dec[o+4], value2:dv.getUint16(o+6,true),
      type:dec[o+8], time:dv.getUint32(o+12,true),
    });
  }
  return Object.freeze(rows);
}

// HarmonyJewelOption is 180 bytes: int, char[60], int, int[14], int[14].
export function parsePcHarmonyOptions(input) {
  const RECORD=180, count=HARMONY_TYPES*HARMONY_OPTIONS, expected=RECORD*count;
  const dec=buxWhole(input);
  if(dec.length < expected) throw new Error(`JewelOfHarmonyOption curto ${dec.length}/${expected}`);
  const dv=new DataView(dec.buffer,dec.byteOffset,dec.byteLength);
  const rows=Array.from({length:HARMONY_TYPES},()=>new Array(HARMONY_OPTIONS));
  for(let t=0;t<HARMONY_TYPES;t++) for(let i=0;i<HARMONY_OPTIONS;i++){
    const o=(t*HARMONY_OPTIONS+i)*RECORD;
    const levels=[], zen=[];
    for(let n=0;n<14;n++) levels.push(dv.getInt32(o+68+n*4,true));
    for(let n=0;n<14;n++) zen.push(dv.getInt32(o+124+n*4,true));
    rows[t][i]=Object.freeze({
      optionType:dv.getInt32(o,true), name:decodeCString(dec.subarray(o+4,o+64)),
      minLevel:dv.getInt32(o+64,true),
      harmonyJewelLevel:Object.freeze(levels), zen:Object.freeze(zen),
    });
  }
  return Object.freeze(rows.map(r=>Object.freeze(r)));
}

// SOCKET_OPTION_INFO is 104 bytes. SocketSystem.cpp decrypts EACH struct with
// BuxConvert separately, so the XOR index restarts at zero every 104 bytes.
export function parsePcSocketOptions(input) {
  const src=asU8(input), RECORD=104, count=SOCKET_TYPES*SOCKET_OPTIONS, expected=RECORD*count;
  if(src.length < expected) throw new Error(`SocketItem bmd curto ${src.length}/${expected}`);
  const rows=Array.from({length:SOCKET_TYPES},()=>new Array(SOCKET_OPTIONS));
  for(let t=0;t<SOCKET_TYPES;t++) for(let i=0;i<SOCKET_OPTIONS;i++){
    const base=(t*SOCKET_OPTIONS+i)*RECORD, rec=buxRecord(src,base,RECORD);
    const dv=new DataView(rec.buffer,rec.byteOffset,rec.byteLength);
    const values=[]; for(let n=0;n<5;n++) values.push(dv.getInt32(76+n*4,true));
    rows[t][i]=Object.freeze({
      optionId:dv.getInt32(0,true), category:dv.getInt32(4,true),
      name:decodeCString(rec.subarray(8,72)), optionType:rec[72],
      values:Object.freeze(values), socketCheck:Object.freeze(Array.from(rec.subarray(96,102))),
    });
  }
  return Object.freeze(rows.map(r=>Object.freeze(r)));
}

export async function loadPcAdvancedItemOwners(fetchBinary, paths={}) {
  if(typeof fetchBinary!=='function') throw new Error('advanced owner: fetchBinary ausente');
  const p={
    itemAdd: paths.itemAdd || 'Local/ItemAddOption.bmd',
    harmony: paths.harmony || 'Local/Por/JewelOfHarmonyOption_por.bmd',
    socket: paths.socket || 'Local/Por/socketitem_por.bmd',
  };
  // Each owner is independent on desktop. Preserve that: one missing file does
  // not silently fabricate another; the branch simply stays unavailable.
  const out={itemAdd:null,harmony:null,socket:null,paths:Object.freeze({...p}),errors:{}};
  const jobs=[
    ['itemAdd',p.itemAdd,parsePcItemAddOption],
    ['harmony',p.harmony,parsePcHarmonyOptions],
    ['socket',p.socket,parsePcSocketOptions],
  ];
  await Promise.all(jobs.map(async ([key,path,parse])=>{
    try{out[key]=parse(await fetchBinary(path));}
    catch(e){out.errors[key]=String(e?.message||e);}
  }));
  out.errors=Object.freeze({...out.errors});
  return Object.freeze(out);
}

export function pcHarmonyItemType(itemType) {
  const t=Number(itemType);
  if(!Number.isInteger(t)||t<0)return 3;
  if(t < 5*512)return 0;       // SI_Weapon: ITEM_SWORD <= type < ITEM_STAFF
  if(t < 6*512)return 1;       // SI_Staff
  if(t < 12*512)return 2;      // SI_Defense: shield..boots/rings family before wing
  return 3;                    // SI_None
}

export function pcIsSocketItemType(itemType) {
  const t=Number(itemType), G=512;
  if([0*G+26,0*G+27,0*G+28,2*G+16,2*G+17,4*G+23,5*G+30,5*G+31,5*G+32,6*G+17,6*G+18,6*G+19,6*G+20].includes(t))return true;
  for(let group=7;group<=11;group++) if(t>=group*G+45 && t<=group*G+53)return true;
  return false;
}

export function pcDecodeSocketFields(item) {
  if(!pcIsSocketItemType(item?.itemType ?? item?.type)) return null;
  const bytes=item?.sockets instanceof Uint8Array?item.sockets:(item?.raw instanceof Uint8Array?item.raw.subarray(7,12):null);
  if(!bytes||bytes.length<MAX_SOCKETS)return null;
  let count=MAX_SOCKETS; const seedId=[],sphereLevel=[];
  for(let i=0;i<MAX_SOCKETS;i++){
    const v=bytes[i]&0xFF;
    if(v===0xFF){count=i;break;}
    if(v===0xFE){seedId[i]=SOCKET_EMPTY;sphereLevel[i]=0;}
    else{seedId[i]=v%SOCKET_OPTIONS;sphereLevel[i]=Math.floor(v/SOCKET_OPTIONS)+1;}
  }
  return Object.freeze({count,seedId:Object.freeze(seedId),sphereLevel:Object.freeze(sphereLevel),setOption:(Number(item?.harmonyByte ?? item?.raw?.[6] ?? 0)&0xFF)});
}

export const PC_ADVANCED_ITEM_CONSTANTS=Object.freeze({MAX_ITEM,HARMONY_TYPES,HARMONY_OPTIONS,SOCKET_TYPES,SOCKET_OPTIONS,MAX_SOCKETS,SOCKET_EMPTY});
