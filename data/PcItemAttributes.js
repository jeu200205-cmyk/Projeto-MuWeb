// PC authority: MU52_PC_SOURCE_ITEM_RENDER_FIXED_2026-08-24,
// _struct.h ITEM_ATTRIBUTE; ZzzInfomation.cpp OpenItemScript;
// ZzzInfomation.h GenerateCheckSum2. Explicit ABI, no offset heuristics.
export const ITEM_ATTRIBUTE_LAYOUTS = Object.freeze({
  'main52-byte-skill': Object.freeze({stride:84,skillWord:false,skill:35,width:36,height:37,damageMin:38,damageMax:39,blocking:40,defense:41,magicDefense:42,weaponSpeed:43,walkSpeed:44,durability:45,magicDur:46,magicPower:47,reqStrength:48,reqDexterity:50,reqEnergy:52,reqVitality:54,reqCharisma:56,reqLevel:58,value:60,zen:64,attType:68,requireClass:69,resistance:76}),
  'main52-word-skill': Object.freeze({stride:84,skillWord:true,skill:36,width:38,height:39,damageMin:40,damageMax:41,blocking:42,defense:43,magicDefense:44,weaponSpeed:45,walkSpeed:46,durability:47,magicDur:48,magicPower:49,reqStrength:50,reqDexterity:52,reqEnergy:54,reqVitality:56,reqCharisma:58,reqLevel:60,value:62,zen:64,attType:68,requireClass:69,resistance:76}),
});
export function pcItemChecksum(bytes, key=0xE2F1) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let result=(key<<9)>>>0;
  for(let offset=0;offset+4<=bytes.length;offset+=4){
    const value=view.getUint32(offset,true);
    result=((offset/4+key)%2===0 ? result^value : result+value)>>>0;
    if(offset%16===0) result=(result^(((key+result)>>>0)>>>((offset/4)%8+1)))>>>0;
  }
  return result;
}
export function parsePcItemAttributes(input,{layout}={}) {
  const abi=ITEM_ATTRIBUTE_LAYOUTS[layout];
  if(!abi)throw Error('ItemAttribute: explicit supported layout required');
  const bytes=input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  if(!(bytes instanceof Uint8Array)||bytes.length!==8192*abi.stride+4)throw Error('ItemAttribute: invalid exact size');
  const encrypted=bytes.subarray(0,-4);
  const crc=new DataView(bytes.buffer,bytes.byteOffset+bytes.length-4,4).getUint32(0,true);
  if(pcItemChecksum(encrypted)!==crc)throw Error('ItemAttribute: checksum mismatch');
  const table=new Map(),key=[0xFC,0xCF,0xAB],decoder=new TextDecoder('windows-1252');
  for(let type=0;type<8192;type++){
    const rec=Uint8Array.from(encrypted.subarray(type*abi.stride,(type+1)*abi.stride),(b,i)=>b^key[i%3]);
    const end=rec.subarray(0,30).indexOf(0);
    const name=decoder.decode(rec.subarray(0,end<0?30:end)).trim();
    const width=rec[abi.width],height=rec[abi.height];
    // Unused/unsupported entries are absent, never fabricated as 1x1.
    if(!name||width<1||width>8||height<1||height>8)continue;
    const rv=new DataView(rec.buffer,rec.byteOffset,rec.byteLength);
    table.set(type,Object.freeze({
      type,name,width,height,twoHand:rec[30]!==0,
      itemLevel:rv.getUint16(32,true),slot:rec[34],skill:abi.skillWord?rv.getUint16(abi.skill,true):rec[abi.skill],
      damageMin:rec[abi.damageMin],damageMax:rec[abi.damageMax],successfulBlocking:rec[abi.blocking],
      defense:rec[abi.defense],magicDefense:rec[abi.magicDefense],weaponSpeed:rec[abi.weaponSpeed],walkSpeed:rec[abi.walkSpeed],
      durability:rec[abi.durability],magicDur:rec[abi.magicDur],magicPower:rec[abi.magicPower],
      requireStrength:rv.getUint16(abi.reqStrength,true),requireDexterity:rv.getUint16(abi.reqDexterity,true),
      requireEnergy:rv.getUint16(abi.reqEnergy,true),requireVitality:rv.getUint16(abi.reqVitality,true),
      requireCharisma:rv.getUint16(abi.reqCharisma,true),requireLevel:rv.getUint16(abi.reqLevel,true),
      value:rec[abi.value],zen:rv.getInt32(abi.zen,true),attType:rec[abi.attType],
      requireClass:Object.freeze(Array.from(rec.subarray(abi.requireClass,abi.requireClass+7))),
      resistance:Object.freeze(Array.from(rec.subarray(abi.resistance,abi.resistance+7))),
    }));
  }
  if(!table.size)throw Error('ItemAttribute: no usable records');
  return table;
}


/** ZzzInventory.cpp::calcMaxDurability — standard Main 5.2 branch. */
export function pcMaxDurability(item, attr, { customWing = false } = {}) {
  if (!item || !attr || !Number.isInteger(Number(item.itemType ?? item.type))) return null;
  const type = Number(item.itemType ?? item.type);
  const group = Math.floor(type / 512), index = type % 512;
  const level = Math.max(0, Math.min(15, Number.isInteger(item.level) ? item.level : ((Number(item.rawLevel)||0) >> 3) & 15));
  let max = group === 5 ? Number(attr.magicDur || 0) : Number(attr.durability || 0);
  if (!Number.isFinite(max)) return null;
  for (let i=0; i<level; i++) {
    if (type >= 13*512 + 51) break; // ITEM_HELPER+51+
    let add = i >= 14 ? 8 : i >= 13 ? 7 : i >= 12 ? 6 : i >= 11 ? 5 : i >= 10 ? 4 : i >= 9 ? 3 : i >= 4 ? 2 : 1;
    max = i >= 13 ? Math.min(255, max + add) : max + add;
  }
  if (type === 13*512+4 || type === 13*512+5) max = 255;
  const ext = Number(item.extOption || 0);
  const setKind = ext % 4;
  if (setKind === 1 || setKind === 2) max += 20;
  else {
    const excellent = (Number(item.option1 || 0) & 63) > 0;
    const excluded = (group === 12 && index >= 3 && index <= 6)
      || type === 0*512+19 || type === 4*512+18 || type === 5*512+10
      || type === 13*512+30
      || (group === 12 && index >= 36 && index <= 40)
      || (group === 12 && index >= 42 && index <= 43)
      || type === 2*512+13 || customWing;
    if (excellent && !excluded) max += 15;
  }
  return Math.max(0, max);
}
