// PcItemInfo.js — porte evidenciado de ITEM/ItemConvert/RenderItemInfo da Main 5.2.
// Cobertura desta revisão: equipamento stock grupos 0..11, incluindo Skill/Luck/
// AddOption normal, resistências, requisitos/classe e blocos staff/scepter.
// R69 estende a cobertura com owners binários reais de 380/Harmony/Socket e
// period expiry wire. Excellent/Ancient/Set continuam fail-closed até CSItemOption.

import { pcMaxDurability } from './PcItemAttributes.js';
import { pcGlobalTextGet, pcSprintf } from './PcGlobalText.js';
import { resolveSkillByType } from '../skills/ServerMagicList.js';
import { pcHarmonyItemType, pcIsSocketItemType, pcDecodeSocketFields } from './PcAdvancedItemOwners.js';
import { pcResolveSetItem } from './PcItemSetOwners.js';
import { pcApplyCustomItemForce } from './CustomItemForceLua.js';
import { customItemModelForType } from './CustomItemModelMap.js';

export const PC_TEXT_COLOR = Object.freeze({
  WHITE:'white', BLUE:'blue', GRAY:'gray', GREEN_BLUE:'greenBlue', RED:'red',
  YELLOW:'yellow', GREEN:'green', PURPLE:'purple', RED_PURPLE:'redPurple',
  VIOLET:'violet', ORANGE:'orange', DARK_RED:'darkRed', DARK_BLUE:'darkBlue', DARK_YELLOW:'darkYellow',
});

const G = 512;
const ITEM_SWORD=0*G, ITEM_MACE=2*G, ITEM_BOW=4*G, ITEM_STAFF=5*G, ITEM_SHIELD=6*G;
const ITEM_HELM=7*G, ITEM_GLOVES=10*G, ITEM_BOOTS=11*G, ITEM_WING=12*G;

// SkillManager.h ActionSkillType — only values consumed by the stock ItemConvert/
// GetSpecialOptionText path below. Numeric values are the PC enum values.
const AT = Object.freeze({
  SKILL_BLOCKING:18, SKILL_SWORD1:19, SKILL_SWORD2:20, SKILL_SWORD3:21,
  SKILL_SWORD4:22, SKILL_SWORD5:23, SKILL_CROSSBOW:24,
  SKILL_RIDER:49, SKILL_BLAST_CROSSBOW4:54, SKILL_ICE_BLADE:56,
  SKILL_STRONG_PIER:60, SKILL_DARK_HORSE:62, SKILL_LONG_SPEAR:66,
  IMPROVE_DAMAGE:80, IMPROVE_MAGIC:81, IMPROVE_CURSE:82,
  IMPROVE_BLOCKING:83, IMPROVE_DEFENSE:84, LUCK:85, LIFE_REGENERATION:86,
  IMPROVE_LIFE:87, IMPROVE_MANA:88, DECREASE_DAMAGE:89, REFLECTION_DAMAGE:90,
  IMPROVE_BLOCKING_PERCENT:91, IMPROVE_GAIN_GOLD:92, EXCELLENT_DAMAGE:93,
  IMPROVE_DAMAGE_LEVEL:94, IMPROVE_DAMAGE_PERCENT:95, IMPROVE_MAGIC_LEVEL:96,
  IMPROVE_MAGIC_PERCENT:97, IMPROVE_ATTACK_SPEED:98, IMPROVE_GAIN_LIFE:99, IMPROVE_GAIN_MANA:100,
  IMPROVE_HP_MAX:101, IMPROVE_MP_MAX:102, ONE_PERCENT_DAMAGE:103, IMPROVE_AG_MAX:104,
  DAMAGE_ABSORB:105, DAMAGE_REFLECTION:106, RECOVER_FULL_LIFE:107, RECOVER_FULL_MANA:108, IMPROVE_CHARISMA:109,
  SKILL_RECOVER:234, SKILL_MULTI_SHOT:235,
  SKILL_MANY_ARROW_UP:490, SKILL_POWER_SLASH_UP:505, SKILL_ASHAKE_UP:515,
});

function levelAdd(level) {
  let n=Math.min(9,level)*3;
  const d=level-9;
  if(d>=1&&d<=6)n += d+3; // PC switch: +10=>4 ... +15=>9
  return n;
}

function isScepterItem(type) {
  // ZzzInfomation.cpp::IsCepterItem (spelling preserved in PC source).
  return (type>=ITEM_MACE+8 && type<=ITEM_MACE+15) || type===ITEM_MACE+17 || type===ITEM_MACE+18;
}

function isSpecialMagicSword(type) {
  return type===ITEM_SWORD+31 || type===ITEM_SWORD+23 || type===ITEM_SWORD+25 ||
         type===ITEM_SWORD+21 || type===ITEM_SWORD+28;
}

export function decodePcPacketItemFlags(item) {
  const raw=item?.raw;
  if(!(raw instanceof Uint8Array) || raw.length<12) return null;
  const option380Byte=raw[5]&0xFF, harmonyByte=raw[6]&0xFF;
  const sockets=Array.from(raw.subarray(7,12));
  let socketCount=5;
  const socketSeedId=[],socketSphereLv=[];
  for(let i=0;i<5;i++){
    const v=sockets[i];
    if(v===0xFF){socketCount=i;break;}
    if(v===0xFE){socketSeedId[i]=-1;socketSphereLv[i]=0;}
    else{socketSeedId[i]=v%50;socketSphereLv[i]=Math.floor(v/50)+1;}
  }
  return Object.freeze({
    option380:(option380Byte&0x08)!==0,
    periodItem:(option380Byte&0x02)!==0,
    expiredPeriod:(option380Byte&0x04)!==0,
    option380Byte,harmonyByte,
    harmonyOption:(harmonyByte&0xF0)>>4,harmonyLevel:harmonyByte&0x0F,
    sockets:Object.freeze(sockets),socketCount,
    socketSeedId:Object.freeze(socketSeedId),socketSphereLv:Object.freeze(socketSphereLv),
  });
}

function isPcTooltipBaseStockItem(item) {
  const type=Number(item?.itemType ?? item?.type);
  if(!Number.isInteger(type)||type<0||type>=ITEM_WING) return false; // groups 0..11 only
  return !!decodePcPacketItemFlags(item);
}

export function isPcTooltipCommonStockItem(item) {
  if(!isPcTooltipBaseStockItem(item)) return false;
  // R68 common-only gate intentionally excludes the advanced wire branches.
  if(((Number(item.option1)||0)&63)!==0) return false;
  if((Number(item.extOption)||0)!==0) return false;
  const flags=decodePcPacketItemFlags(item); if(!flags) return false;
  if(flags.option380 || flags.periodItem || flags.expiredPeriod) return false;
  if(flags.harmonyByte!==0) return false;
  if(flags.sockets.some(v=>v!==0xFF)) return false;
  return true;
}

/**
 * ItemConvert stock Special[] builder (groups 0..11 only).
 * Returns exact special type/value entries and the Option3 strength increment.
 */
export function decodePcCommonSpecials(item, attr, {allowAdvanced=false} = {}) {
  if(!(allowAdvanced ? isPcTooltipBaseStockItem(item) : isPcTooltipCommonStockItem(item)) || !attr) return null;
  const type=Number(item.itemType ?? item.type);
  const attribute1=Number(item.rawLevel ?? item.raw?.[1] ?? 0)&0xFF;
  const attribute2=Number(item.option1 ?? item.raw?.[3] ?? 0)&0xFF;
  const out=[];

  // ItemConvert: (Attribute1>>7)&1 -> p->m_bySkillIndex.
  if((attribute1&0x80)!==0 && Number(attr.skill||0)!==0) {
    out.push(Object.freeze({type:Number(attr.skill),value:0,kind:'skill'}));
  }

  // ItemConvert: luck for stock sword..boots, excluding arrows/bolts BOW+7/+15.
  if((attribute1&0x04)!==0 && type>=ITEM_SWORD && type<ITEM_BOOTS+G && type!==ITEM_BOW+7 && type!==ITEM_BOW+15) {
    out.push(Object.freeze({type:AT.LUCK,value:0,kind:'luck'}));
  }

  // Option3 = (Attribute1&3) + ((Attribute2&64)/64*4).
  const option3=(attribute1&0x03)+((attribute2&0x40)!==0?4:0);
  let strengthAdd=0;
  if(option3){
    if(type>=ITEM_SWORD && type<ITEM_BOW+G){
      if(type!==ITEM_BOW+7 && type!==ITEM_BOW+15){
        out.push(Object.freeze({type:AT.IMPROVE_DAMAGE,value:option3*4,kind:'option3'}));
        strengthAdd=option3*5;
      }
    } else if(type>=ITEM_STAFF && type<ITEM_STAFF+G){
      out.push(Object.freeze({type:(type>=ITEM_STAFF+21&&type<=ITEM_STAFF+29)?AT.IMPROVE_CURSE:AT.IMPROVE_MAGIC,value:option3*4,kind:'option3'}));
      strengthAdd=option3*5;
    } else if(type>=ITEM_SHIELD && type<ITEM_SHIELD+G){
      out.push(Object.freeze({type:AT.IMPROVE_BLOCKING,value:option3*5,kind:'option3'}));
      strengthAdd=option3*5;
    } else if(type>=ITEM_HELM && type<ITEM_BOOTS+G){
      out.push(Object.freeze({type:AT.IMPROVE_DEFENSE,value:option3*4,kind:'option3'}));
      strengthAdd=option3*5;
    }
  }
  return Object.freeze({specials:Object.freeze(out),option3,strengthAdd});
}

export function pcConvertCommonItem(item, attr, {allowAdvanced=false} = {}) {
  if(!(allowAdvanced ? isPcTooltipBaseStockItem(item) : isPcTooltipCommonStockItem(item)) || !attr) return null;
  const type=Number(item.itemType ?? item.type), level=((Number(item.rawLevel)||0)>>3)&15;
  const p=attr;
  const excellentBits=(Number(item.option1)||0)&63;
  const extOption=(Number(item.extOption)||0)&0xFF;
  const setKind=extOption%4;
  if(setKind===3)return null; // source table has only A/B entries; invalid wire stays closed
  const isSet=setKind===1||setKind===2;

  // ZzzInfomation.cpp::ItemConvert first excellent suppression block, followed
  // by the Ancient/Set override that forces the excellent stat path on.
  let statExcel=excellentBits;
  if(type===ITEM_SWORD+19||type===ITEM_BOW+18||type===ITEM_STAFF+10||type===ITEM_MACE+13)statExcel=0;
  if(isSet)statExcel=1;
  const setItemDropLevel=Number(p.itemLevel||0)+30;
  let excelAddValue=0;
  if(type===ITEM_MACE+6)excelAddValue=15;
  else if(type===ITEM_BOW+6)excelAddValue=30;
  else if(type===ITEM_STAFF+7)excelAddValue=25;

  let damageMin=Number(p.damageMin||0), damageMax=Number(p.damageMax||0), blocking=Number(p.successfulBlocking||0);
  let defense=Number(p.defense||0), magicDefense=Number(p.magicDefense||0), magicPower=Number(p.magicPower||0);
  const itemBaseLevel=Number(p.itemLevel||0);
  if(damageMin>0){
    if(statExcel>0&&itemBaseLevel)damageMin+=excelAddValue||Math.trunc(Number(p.damageMin)*25/itemBaseLevel)+5;
    if(isSet)damageMin+=5+Math.trunc(setItemDropLevel/40);
    damageMin+=levelAdd(level);
  }
  if(damageMax>0){
    if(statExcel>0&&itemBaseLevel)damageMax+=excelAddValue||Math.trunc(Number(p.damageMin)*25/itemBaseLevel)+5; // desktop uses DamageMin here
    if(isSet)damageMax+=5+Math.trunc(setItemDropLevel/40);
    damageMax+=levelAdd(level);
  }
  if(magicPower>0){
    if(statExcel>0&&itemBaseLevel)magicPower+=excelAddValue||Math.trunc(Number(p.magicPower)*25/itemBaseLevel)+5;
    if(isSet)magicPower+=2+Math.trunc(setItemDropLevel/60);
    magicPower+=levelAdd(level);magicPower=Math.trunc(magicPower/2);
    if(!isScepterItem(type))magicPower+=level*2;
  }
  if(blocking>0){
    if(statExcel>0&&itemBaseLevel)blocking+=Math.trunc(Number(p.successfulBlocking)*25/itemBaseLevel)+5;
    blocking+=levelAdd(level);
  }
  if(defense>0){
    if(type>=ITEM_SHIELD&&type<ITEM_SHIELD+G){
      defense+=level;
      if(isSet)defense+=Math.trunc(defense*20/setItemDropLevel)+2;
    }else{
      if(statExcel>0&&itemBaseLevel)defense+=Math.trunc(Number(p.defense)*12/itemBaseLevel)+4+Math.trunc(itemBaseLevel/5);
      if(isSet)defense+=Math.trunc(defense*3/setItemDropLevel)+2+Math.trunc(setItemDropLevel/30);
      defense+=levelAdd(level); // groups 7..11 use the generic desktop branch
    }
  }
  if(magicDefense>0){
    magicDefense+=Math.min(9,level)*3;
    // Preserve the desktop missing-break fall-through literally.
    switch(level-9){case 6:magicDefense+=9;case 4:magicDefense+=7;case 3:magicDefense+=6;case 2:magicDefense+=5;case 1:magicDefense+=4;}
  }

  // ItemConvert computes requirement ItemLevel before its later per-item
  // excellent suppression. Because Set forces excel=1, stock Ancient items use
  // +25 here exactly as the source does (the +30 branch is unreachable there).
  const requirementItemLevel=statExcel?itemBaseLevel+25:(isSet?itemBaseLevel+30:itemBaseLevel);
  let requireLevel=Number(p.requireLevel||0); // groups 0..11 fixed branch
  const statBase=requirementItemLevel+level*3;
  const req=(base,mul)=>base?20+Math.trunc(Number(base)*statBase*mul/100):0;
  let requireStrength=req(p.requireStrength,3);
  const requireDexterity=req(p.requireDexterity,3),requireVitality=req(p.requireVitality,3);
  let requireEnergy=0;
  if(p.requireEnergy){
    if(type>=ITEM_STAFF+21&&type<=ITEM_STAFF+29)requireEnergy=20+Math.trunc(Number(p.requireEnergy)*(requirementItemLevel+level)*3/100);
    else requireEnergy=20+Math.trunc(Number(p.requireEnergy)*statBase*4/100);
  }
  const requireCharisma=Number(p.requireCharisma||0); // final desktop overwrite for these groups

  // Late excellent suppression affects only the +20 level requirement; earlier
  // stat/requirement-base calculations above have already happened on desktop.
  let lateExcel=statExcel;
  const idx=type%G,grp=Math.floor(type/G);
  if((grp>=7&&grp<=11&&((idx>=29&&idx<=33)||idx===43))||type===ITEM_SWORD+22||type===ITEM_SWORD+23||type===ITEM_STAFF+12||type===ITEM_BOW+21||type===ITEM_MACE+14||type===ITEM_STAFF+19)lateExcel=0;
  if(lateExcel>0&&requireLevel>0)requireLevel+=20;

  const specialOwner=decodePcCommonSpecials(item,p,{allowAdvanced});if(!specialOwner)return null;
  requireStrength+=specialOwner.strengthAdd;
  // Current client CustomItemForce.cpp runs at the END of ItemConvert and has
  // final authority over these four converted stat fields only.
  const forced=pcApplyCustomItemForce(item,p,{damageMin,damageMax,defense,magicDefense});
  if(forced){damageMin=forced.damageMin;damageMax=forced.damageMax;defense=forced.defense;magicDefense=forced.magicDefense;}
  return Object.freeze({
    type,level,twoHand:!!p.twoHand,damageMin,damageMax,successfulBlocking:blocking,defense,magicDefense,
    weaponSpeed:Number(p.weaponSpeed||0),walkSpeed:Number(p.walkSpeed||0),magicPower,
    requireLevel,requireStrength,requireDexterity,requireVitality,requireEnergy,requireCharisma,
    maxDurability:pcMaxDurability(item,p),durability:Number(item.durability||0),
    specials:specialOwner.specials,option3:specialOwner.option3,
    excellentBits,extOption,setKind,isSet,statExcel,
    resistances:Object.freeze(Array.isArray(p.resistance)?Array.from(p.resistance):[]),
  });
}

function gt(table,key,...args){const f=pcGlobalTextGet(table,key);return f==null?null:pcSprintf(f,...args);}
function add(lines,text,color=PC_TEXT_COLOR.WHITE,bold=false){
  // Required authored text missing/unsupported sprintf is carried as null so
  // the whole tooltip can fail closed at the end instead of silently omitting it.
  if(text==null){lines.push({text:null,color,bold,missing:true});return false;}
  if(typeof text==='string'&&text.length)lines.push({text,color,bold});
  return true;
}
function blank(lines){lines.push({text:'\n',color:PC_TEXT_COLOR.WHITE,bold:false,empty:true});}

function skillTextKey(option){
  if(option===AT.SKILL_BLOCKING)return 80;
  if(option>=AT.SKILL_SWORD1&&option<=AT.SKILL_SWORD5)return 81+(option-AT.SKILL_SWORD1);
  if(option===AT.SKILL_CROSSBOW || (option>=AT.SKILL_MANY_ARROW_UP&&option<=AT.SKILL_MANY_ARROW_UP+4))return 86;
  if(option===AT.SKILL_BLAST_CROSSBOW4 || option===AT.SKILL_MULTI_SHOT || option===AT.SKILL_RECOVER)return 920;
  if(option===AT.SKILL_ICE_BLADE || (option>=AT.SKILL_POWER_SLASH_UP&&option<=AT.SKILL_POWER_SLASH_UP+4))return 98;
  if(option===AT.SKILL_RIDER)return 745;
  if(option===AT.SKILL_STRONG_PIER)return 1210;
  if(option===AT.SKILL_LONG_SPEAR)return 1186;
  if(option===AT.SKILL_DARK_HORSE || (option>=AT.SKILL_ASHAKE_UP&&option<=AT.SKILL_ASHAKE_UP+4))return 1189;
  return null;
}

function pcCommonSpecialText(type,special,globalText){
  const option=Number(special?.type), value=Number(special?.value||0);
  const skillKey=skillTextKey(option);
  if(skillKey!=null){
    const skill=resolveSkillByType(option);
    if(!skill) return null; // PC owner needs SkillAttribute[Option].Mana
    const main=gt(globalText,skillKey,skill.mana);
    if(main==null)return null;
    const extra=[];
    if(option===AT.SKILL_RIDER){const t=gt(globalText,179);if(t==null)return null;extra.push({text:t,color:PC_TEXT_COLOR.DARK_RED,bold:false});}
    else if(option===AT.SKILL_DARK_HORSE || (option>=AT.SKILL_ASHAKE_UP&&option<=AT.SKILL_ASHAKE_UP+4)){
      const t=gt(globalText,1201);if(t==null)return null;extra.push({text:t,color:PC_TEXT_COLOR.DARK_RED,bold:false});
    }
    return {main,extra};
  }
  let key=null,args=[];
  switch(option){
    case AT.LUCK:key=87;break;
    case AT.IMPROVE_DAMAGE:key=88;args=[value];break;
    case AT.IMPROVE_MAGIC:key=89;args=[value];break;
    case AT.IMPROVE_CURSE:key=1697;args=[value];break;
    case AT.IMPROVE_BLOCKING:key=90;args=[value];break;
    case AT.IMPROVE_DEFENSE:key=91;args=[value];break;
    case AT.LIFE_REGENERATION:key=92;args=[value];break;
    case AT.IMPROVE_LIFE:key=622;break;
    case AT.IMPROVE_MANA:key=623;break;
    case AT.DECREASE_DAMAGE:key=624;break;
    case AT.REFLECTION_DAMAGE:key=625;break;
    case AT.IMPROVE_BLOCKING_PERCENT:key=626;break;
    case AT.IMPROVE_GAIN_GOLD:key=627;break;
    case AT.EXCELLENT_DAMAGE:key=628;break;
    case AT.IMPROVE_DAMAGE_LEVEL:key=629;break;
    case AT.IMPROVE_DAMAGE_PERCENT:key=630;args=[value];break;
    case AT.IMPROVE_MAGIC_LEVEL:key=631;break;
    case AT.IMPROVE_MAGIC_PERCENT:key=632;args=[value];break;
    case AT.IMPROVE_ATTACK_SPEED:key=633;args=[value];break;
    case AT.IMPROVE_GAIN_LIFE:key=634;break;
    case AT.IMPROVE_GAIN_MANA:key=635;break;
    case AT.IMPROVE_HP_MAX:key=740;args=[value];break;
    case AT.IMPROVE_MP_MAX:key=741;args=[value];break;
    case AT.ONE_PERCENT_DAMAGE:key=742;args=[value];break;
    case AT.IMPROVE_AG_MAX:key=743;args=[value];break;
    case AT.DAMAGE_ABSORB:key=744;args=[value];break;
    case AT.DAMAGE_REFLECTION:key=1673;args=[value];break;
    case AT.RECOVER_FULL_LIFE:key=1674;args=[value];break;
    case AT.RECOVER_FULL_MANA:key=1675;args=[value];break;
    default:return null;
  }
  const main=gt(globalText,key,...args);if(main==null)return null;
  const extra=[];
  if(option===AT.LUCK){const t=gt(globalText,94,value);if(t==null)return null;extra.push({text:t,color:PC_TEXT_COLOR.BLUE,bold:false});}
  else if(option===AT.IMPROVE_DAMAGE && [31,21,23,25,28].some(i=>type===ITEM_SWORD+i)){
    const t=gt(globalText,89,value);if(t==null)return null;extra.push({text:t,color:PC_TEXT_COLOR.BLUE,bold:false});
  }
  return {main,extra};
}




function isPcStockWingType(type){
  if(!Number.isInteger(type)||type<ITEM_WING||type>=ITEM_WING+G)return false;
  const n=type-ITEM_WING;
  return (n>=0&&n<=6)||n===41||n===42||(n>=36&&n<=40)||n===43||(n>=49&&n<=50)||(n>=130&&n<=135);
}
function pcWingLevelExtra(level,third=false){
  if(level<10||level>15)return 0;
  return (level-9)+(third?4:3); // third: +10=>5..+15=>10; common: +10=>4..+15=>9
}
function pcStockWingOptionSpecials(item,type,level){
  const attribute1=Number(item.rawLevel ?? item.raw?.[1] ?? 0)&0xff;
  const excelWing=Number(item.option1 ?? item.raw?.[3] ?? 0)&63;
  const n=type-ITEM_WING,out=[];
  const add=(t,v,k='wing')=>out.push(Object.freeze({type:t,value:v,kind:k}));
  if((n>=3&&n<=6)||n===42){
    if(excelWing&1)add(AT.IMPROVE_HP_MAX,50+level*5);if(excelWing&2)add(AT.IMPROVE_MP_MAX,50+level*5);
    if(excelWing&4)add(AT.ONE_PERCENT_DAMAGE,3);if(excelWing&8)add(AT.IMPROVE_AG_MAX,50);if(excelWing&16)add(AT.IMPROVE_ATTACK_SPEED,5);
  }else if((n>=36&&n<=40)||n===43){
    if(excelWing&1)add(AT.ONE_PERCENT_DAMAGE,5);if(excelWing&2)add(AT.DAMAGE_REFLECTION,5);
    if(excelWing&4)add(AT.RECOVER_FULL_LIFE,5);if(excelWing&8)add(AT.RECOVER_FULL_MANA,5);
  }
  // ItemConvert luck families.
  if((attribute1&4)!==0 && ((n>=0&&n<=6)||(n>=36&&n<=43)||(n>=49&&n<=50))) add(AT.LUCK,0,'luck');
  const option3=(attribute1&3)+(((Number(item.option1)||0)&0x40)?4:0);
  if(option3){
    const ex4=(excelWing&16)!==0,ex5=(excelWing&32)!==0;
    if(n===0)add(AT.LIFE_REGENERATION,option3);
    else if(n===1||n===41)add(AT.IMPROVE_MAGIC,option3*4);
    else if(n===2)add(AT.IMPROVE_DAMAGE,option3*4);
    else if(n===3)add(ex5?AT.LIFE_REGENERATION:AT.IMPROVE_DAMAGE,ex5?option3:option3*4);
    else if(n===4)add(ex5?AT.IMPROVE_MAGIC:AT.LIFE_REGENERATION,ex5?option3*4:option3);
    else if(n===5)add(ex5?AT.IMPROVE_DAMAGE:AT.LIFE_REGENERATION,ex5?option3*4:option3);
    else if(n===6)add(ex5?AT.IMPROVE_DAMAGE:AT.IMPROVE_MAGIC,option3*4);
    else if(n===42)add(ex5?AT.IMPROVE_MAGIC:AT.IMPROVE_CURSE,option3*4);
    else if(n===36)add(ex4?AT.IMPROVE_DAMAGE:(ex5?AT.IMPROVE_DEFENSE:AT.LIFE_REGENERATION),ex4||ex5?option3*4:option3);
    else if(n===37)add(ex4?AT.IMPROVE_MAGIC:(ex5?AT.IMPROVE_DEFENSE:AT.LIFE_REGENERATION),ex4||ex5?option3*4:option3);
    else if(n===38)add(ex4?AT.IMPROVE_DAMAGE:(ex5?AT.IMPROVE_DEFENSE:AT.LIFE_REGENERATION),ex4||ex5?option3*4:option3);
    else if(n===39)add(ex4?AT.IMPROVE_DAMAGE:(ex5?AT.IMPROVE_MAGIC:AT.LIFE_REGENERATION),ex4||ex5?option3*4:option3);
    else if(n===40)add(ex4?AT.IMPROVE_DAMAGE:(ex5?AT.IMPROVE_DEFENSE:AT.LIFE_REGENERATION),ex4||ex5?option3*4:option3);
    else if(n===43)add(ex4?AT.IMPROVE_MAGIC:(ex5?AT.IMPROVE_CURSE:AT.LIFE_REGENERATION),ex4||ex5?option3*4:option3);
  }
  return out;
}
function buildPcStockWingTooltip(item,attr,globalText,character=null){
  const type=Number(item?.itemType ?? item?.type);if(!isPcStockWingType(type)||customWingOwnerForItem(item)||!attr?.name||!(globalText instanceof Map))return null;
  const n=type-ITEM_WING,raw=Number(item.rawLevel ?? item.raw?.[1] ?? 0)&0xff,level=(raw>>3)&15,excelWing=Number(item.option1 ?? item.raw?.[3] ?? 0)&63;
  const suppressExcel=(n>=3&&n<=6)||(n>=36&&n<=40)||(n>=42&&n<=43)||(n>=49&&n<=50)||(n>=130&&n<=135);
  const excel=suppressExcel?0:excelWing;
  const third=(n>=36&&n<=40)||n===43;
  let defense=Number(attr.defense||0),baseLevel=Number(attr.itemLevel||0);
  if(defense>0){if(excel>0&&baseLevel)defense+=Math.trunc(Number(attr.defense||0)*12/baseLevel)+4+Math.trunc(baseLevel/5);
    const mult=((n>=3&&n<=6)||n===42)?2:(third?4:3);defense+=Math.min(9,level)*mult+pcWingLevelExtra(level,third);}
  const specials=pcStockWingOptionSpecials(item,type,level);
  const lines=[];blank(lines);add(lines,level?`${attr.name} +${level}`:attr.name,level>=7?PC_TEXT_COLOR.YELLOW:(specials.length?PC_TEXT_COLOR.BLUE:PC_TEXT_COLOR.WHITE),true);blank(lines);
  if(defense>0)add(lines,gt(globalText,65,defense));
  const maxDur=pcMaxDurability(item,attr);if(maxDur!=null&&(attr.durability||attr.magicDur))add(lines,gt(globalText,71,Number(item.durability||0),maxDur));
  const stat=character&&typeof character==='object'?character:null;
  const req=(key,need,current)=>{if(!need)return;const cur=Number(current);const ok=Number.isFinite(cur)&&cur>=need;add(lines,gt(globalText,key,need),ok?PC_TEXT_COLOR.WHITE:PC_TEXT_COLOR.RED);if(!ok&&Number.isFinite(cur))add(lines,gt(globalText,74,need-cur),PC_TEXT_COLOR.RED);};
  const addValue=((n>=3&&n<=6)||n===42)?5:4;
  const staticReq=(n>=7&&n<=40)||(n>=43&&n<512);
  const requireLevel=Number(attr.requireLevel||0)?(staticReq?Number(attr.requireLevel):Number(attr.requireLevel)+level*addValue):0;
  const itemLevel=excel?baseLevel+25:baseLevel,statBase=itemLevel+level*3;
  const calc=(base,mul)=>Number(base||0)?20+Math.trunc(Number(base)*statBase*mul/100):0;
  req(76,requireLevel,stat?.level);req(73,calc(attr.requireStrength,3),Number(stat?.strength||0)+Number(stat?.addStrength||0));req(75,calc(attr.requireDexterity,3),Number(stat?.dexterity||0)+Number(stat?.addDexterity||0));req(1930,calc(attr.requireVitality,3),Number(stat?.vitality||0)+Number(stat?.addVitality||0));req(77,calc(attr.requireEnergy,4),Number(stat?.energy||0)+Number(stat?.addEnergy||0));req(698,calc(attr.requireCharisma,3),Number(stat?.charisma||0)+Number(stat?.addCharisma||0));
  blank(lines);
  if((n>=0&&n<=2)||n===41){add(lines,gt(globalText,577,12+level*2));add(lines,gt(globalText,578,12+level*2));add(lines,gt(globalText,579));}
  else if((n>=3&&n<=6)||n===42){add(lines,gt(globalText,577,32+level));add(lines,gt(globalText,578,25+level*2));add(lines,gt(globalText,579));}
  else if(third){add(lines,gt(globalText,577,39+level*2));add(lines,gt(globalText,578,n===40?24+level*2:39+level*2));add(lines,gt(globalText,579));}
  else if(n>=130&&n<=135){const v=(n===130||n===135)?20+level*2:12+level*2;add(lines,gt(globalText,577,v));add(lines,gt(globalText,578,v));add(lines,gt(globalText,579));}
  if(specials.length)blank(lines);for(const sp of specials){const r=pcCommonSpecialText(type,sp,globalText);if(!r){add(lines,null);continue;}add(lines,r.main,PC_TEXT_COLOR.BLUE,false);for(const ex of r.extra)add(lines,ex.text,ex.color,ex.bold);}
  if(lines.some(l=>l.text==null))return null;return lines;
}

function customWingOwnerForItem(item) {
  const type=Number(item?.itemType ?? item?.type);
  if(!Number.isInteger(type)||type<ITEM_WING||type>=ITEM_WING+G)return null;
  const owner=customItemModelForType(type);
  return owner?.customWing===true ? owner : null;
}

function buildPcCustomWingTooltip(item,attr,globalText,character=null){
  const owner=customWingOwnerForItem(item);
  if(!owner || !attr || !(globalText instanceof Map) || !attr.name)return null;
  const type=Number(item.itemType ?? item.type);
  const level=((Number(item.rawLevel ?? item.raw?.[1] ?? 0)>>3)&15);
  const attribute1=Number(item.rawLevel ?? item.raw?.[1] ?? 0)&0xFF;
  const attribute2=Number(item.option1 ?? item.raw?.[3] ?? 0)&0xFF;
  const excelWing=attribute2&0x3F;
  const option3=(attribute1&3)+((attribute2&0x40)!==0?4:0);

  // ZzzInfomation.cpp::ItemConvert custom-wing branch.
  let defense=Number(attr.defense||0);
  const itemBaseLevel=Number(attr.itemLevel||0);
  if(excelWing>0 && itemBaseLevel) defense += Math.trunc(Number(attr.defense||0)*12/itemBaseLevel)+4+Math.trunc(itemBaseLevel/5);
  defense += Number(owner.defenseConstA||0)*level;
  if(level>=10&&level<=15) defense += (level-9)+4; // +10=>5 ... +15=>10

  const specials=[];
  for(let i=0;i<4;i++) if((excelWing>>i)&1){
    const [idx,val]=owner.newOptionPairs?.[i]||[0,0];
    if(Number(idx)>0)specials.push({type:Number(idx),value:Number(val||0),kind:'custom-wing-new'});
  }
  if((attribute1>>2)&1) specials.push({type:AT.LUCK,value:0,kind:'luck'});
  if(option3){
    const slot=((excelWing>>4)&1)?1:(((excelWing>>5)&1)?2:0);
    const [idx,val]=owner.optionPairs?.[slot]||[0,0];
    if(Number(idx)>0)specials.push({type:Number(idx),value:Number(val||0),kind:'custom-wing-option3'});
  }

  const lines=[]; blank(lines);
  const title=level===0?attr.name:`${attr.name} +${level}`;
  add(lines,title,level>=7?PC_TEXT_COLOR.YELLOW:(specials.length?PC_TEXT_COLOR.BLUE:PC_TEXT_COLOR.WHITE),true); blank(lines);
  if(defense>0)add(lines,gt(globalText,65,defense));
  const maxDur=pcMaxDurability(item,attr);
  if(maxDur!=null && (attr.durability||attr.magicDur)) add(lines,gt(globalText,71,Number(item.durability||0),maxDur));

  const stat=(character&&typeof character==='object')?character:null;
  const req=(key,need,current)=>{if(!need)return;const cur=Number(current);const ok=Number.isFinite(cur)&&cur>=need;add(lines,gt(globalText,key,need),ok?PC_TEXT_COLOR.WHITE:PC_TEXT_COLOR.RED);if(!ok&&Number.isFinite(cur))add(lines,gt(globalText,74,need-cur),PC_TEXT_COLOR.RED);};
  // Custom-wing source keeps RequireLevel authored by ItemAttribute; stat
  // requirements still follow the common ItemConvert item-level/level formula.
  const requirementItemLevel=(excelWing>0)?itemBaseLevel+25:itemBaseLevel;
  const statBase=requirementItemLevel+level*3;
  const calc=(base,mul)=>Number(base||0)?20+Math.trunc(Number(base)*statBase*mul/100):0;
  req(76,Number(attr.requireLevel||0),stat?.level);
  req(73,calc(attr.requireStrength,3),Number(stat?.strength||0)+Number(stat?.addStrength||0));
  req(75,calc(attr.requireDexterity,3),Number(stat?.dexterity||0)+Number(stat?.addDexterity||0));
  req(1930,calc(attr.requireVitality,3),Number(stat?.vitality||0)+Number(stat?.addVitality||0));
  req(77,attr.requireEnergy?20+Math.trunc(Number(attr.requireEnergy)*statBase*4/100):0,Number(stat?.energy||0)+Number(stat?.addEnergy||0));
  req(698,Number(attr.requireCharisma||0),Number(stat?.charisma||0)+Number(stat?.addCharisma||0));

  blank(lines);
  add(lines,gt(globalText,577,(Number(owner.incDamageConstA||0)+(level*Number(owner.incDamageConstB||0)))-100));
  add(lines,gt(globalText,578,100-(Number(owner.decDamageConstA||0)-(level*Number(owner.decDamageConstB||0)))));
  add(lines,gt(globalText,579));
  if(specials.length)blank(lines);
  for(const special of specials){const rendered=pcCommonSpecialText(type,special,globalText);if(!rendered){add(lines,null);continue;}add(lines,rendered.main,PC_TEXT_COLOR.BLUE,false);for(const extra of rendered.extra)add(lines,extra.text,extra.color,extra.bold);}
  if(lines.some(l=>l.text==null))return null;
  return lines;
}


function pcExcellentSpecials(item,type){
  const bits=(Number(item?.option1)||0)&63;if(!bits)return [];
  const out=[];
  const push=(mask,code,value=0)=>{if(bits&mask)out.push(Object.freeze({type:code,value,kind:'excellent'}));};
  // ItemConvert exact stock family branches. Defensive = shield..boots;
  // offensive = sword..staff. Bits are consumed high-to-low in both cases.
  if(type>=ITEM_SHIELD&&type<ITEM_BOOTS+G){
    push(0x20,AT.IMPROVE_LIFE);push(0x10,AT.IMPROVE_MANA);push(0x08,AT.DECREASE_DAMAGE);
    push(0x04,AT.REFLECTION_DAMAGE);push(0x02,AT.IMPROVE_BLOCKING_PERCENT);push(0x01,AT.IMPROVE_GAIN_GOLD);
  }else if(type>=ITEM_SWORD&&type<ITEM_STAFF+G){
    push(0x20,AT.EXCELLENT_DAMAGE);
    const staff=type>=ITEM_STAFF&&type<ITEM_STAFF+G;
    push(0x10,staff?AT.IMPROVE_MAGIC_LEVEL:AT.IMPROVE_DAMAGE_LEVEL);
    push(0x08,staff?AT.IMPROVE_MAGIC_PERCENT:AT.IMPROVE_DAMAGE_PERCENT,2);
    push(0x04,AT.IMPROVE_ATTACK_SPEED,7);push(0x02,AT.IMPROVE_GAIN_LIFE);push(0x01,AT.IMPROVE_GAIN_MANA);
  }
  return out;
}

function pcSetExplainText(globalText,option,value){
  option=Number(option);value=Number(value);
  if(!Number.isInteger(option)||option<0||option>35)return null;
  if(option===7)return gt(globalText,632,value); // AT_SET_OPTION_IMPROVE_MAGIC_POWER
  if(option>=0&&option<=6)return gt(globalText,950+option,value);
  if(option>=8&&option<=20)return gt(globalText,949+option,value);
  if(option===21)return gt(globalText,970,value);
  if(option===22)return gt(globalText,984,value);
  if(option===23)return gt(globalText,983,value);
  if(option>=24&&option<=35)return gt(globalText,971+(option-24),value);
  return null;
}

function pcClassStep(character){
  const c=Number(character?.clientClass);if(!Number.isInteger(c))return {base:-1,second:0,step:0};
  return {base:c&7,second:(c>>3)&1,step:(c&16)?3:((c&8)?2:1)};
}
function pcClassCanEquip(attr,character){
  const {base,step}=pcClassStep(character),req=attr?.requireClass;
  if(base<0||!Array.isArray(req)||base>=req.length)return false;
  const need=Number(req[base]||0);return need>0&&step>=need;
}
function pcSetMasteryAllowed(row,character){
  const {base,second}=pcClassStep(character);if(base<0)return false;
  const need=Number(row?.byRequireClass?.[base]||0);return !!need&&second>=need-1;
}
function pcSetEquippedEligible(item,attr,character,advancedOwners){
  if(!item||Number(item.durability)<=0||!attr||!pcClassCanEquip(attr,character))return false;
  const o=pcConvertCommonItem(item,attr,{allowAdvanced:true});if(!o)return false;
  const adj=pcAdvancedDisplayAdjustments(item,o,advancedOwners,character);if(!adj)return false;
  const total=(base,add)=>Number(character?.[base]||0)+Number(character?.[add]||0);
  return o.requireLevel<=Number(character?.level||0)
    && o.requireStrength-adj.requireStrengthDown<=total('strength','addStrength')
    && o.requireDexterity-adj.requireDexterityDown<=total('dexterity','addDexterity')
    && o.requireVitality<=total('vitality','addVitality')
    && o.requireEnergy<=total('energy','addEnergy')
    && o.requireCharisma<=total('charisma','addCharisma');
}
function pcBuildSetOptionGroups(setRuntime,character,advancedOwners){
  const owners=setRuntime?.owners,equipment=setRuntime?.equipment,attrs=setRuntime?.itemAttributes;
  if(!owners?.type||!owners?.option||!Array.isArray(equipment)||!(attrs instanceof Map))return null;
  // CSItemOption::CheckItemSetOptions second pass. `checkItemType` preserves the
  // first-seen group order from equipment slots and the last observed A/B kind.
  const groups=[];let prevType=-1,prevKind=-1;
  for(let slot=0;slot<12;slot++){
    if(slot===7||slot===8)continue; // EQUIPMENT_WING / EQUIPMENT_HELPER
    const item=equipment[slot];
    if(!item){if(slot===0||slot===10){prevType=-1;prevKind=-1;}continue;}
    const type=Number(item.itemType??item.type),kind=(Number(item.extOption)||0)%4;
    if((slot===1||slot===11)&&type===prevType&&kind===prevKind)continue;
    const def=pcResolveSetItem(item,owners),attr=attrs.get(type);
    if(def&&pcSetEquippedEligible(item,attr,character,advancedOwners)){
      let g=groups.find(x=>x.index===def.index);
      if(!g){g={index:def.index,count:0,setType:def.kind-1};groups.push(g);}
      g.count++;g.setType=def.kind-1;
    }
    if(slot===0||slot===10){prevType=type;prevKind=kind;}
  }
  return groups;
}

function pcPcRequireClassFlag(row,character){
  // Literal calcSetOptionList branch, including the duplicated `==1` checks
  // present for Magic Gladiator/Dark Lord/Summoner/Rage Fighter in this source.
  const {base,second}=pcClassStep(character);if(base<0)return 0;
  const need=Number(row?.byRequireClass?.[base]||0);
  if(base<=2)return (need===1||(need===2&&second))?1:0;
  return need===1?1:0;
}

function pcCalcSetOptionRuntime(setRuntime,character,advancedOwners){
  const owners=setRuntime?.owners;const groups=pcBuildSetOptionGroups(setRuntime,character,advancedOwners);
  if(!owners||!groups)return null;
  const tmp=[[],[]],tmpReq=[[],[]],tmpSeq=[[],[]];
  const optionCount=[0,0],setNames=['',''];let sameSetItem=0,nextSequence=0;
  const sequenceNames=[];
  for(const g of groups){
    if(g.count<2)continue;
    const count=g.count-1,standardCount=Math.min(count,6),row=owners.option[g.index],setType=g.setType;
    if(!row||(setType!==0&&setType!==1))continue;
    const requireClass=pcPcRequireClassFlag(row,character);
    if(setNames[setType]&&setNames[setType]!==row.name){
      if(!setNames[0])setNames[0]=row.name;else setNames[1]=row.name;
      sameSetItem=count;
    }else setNames[setType]=row.name;
    let seq=sequenceNames.indexOf(row.name);
    if(seq<0){seq=nextSequence++;sequenceNames[seq]=row.name;}
    const append=(opt,val)=>{
      opt=Number(opt);if(opt===255)return;
      if(opt>=24&&!pcSetMasteryAllowed(row,character))return;
      tmp[setType].push({option:opt,value:Number(val),requireClass,sequence:seq});
      tmpReq[setType].push(requireClass);tmpSeq[setType].push(seq);optionCount[setType]++;
    };
    for(let j=0;j<count;j++){
      let option0=255,option1=255,value0=0,value1=0;
      if(j<standardCount){
        option0=row.byStandardOption[j]?.[0]??255;value0=row.byStandardOptionValue[j]?.[0]??0;
        option1=row.byStandardOption[j]?.[1]??255;value1=row.byStandardOptionValue[j]?.[1]??0;
      }else if(j<(count-standardCount)){
        // Preserve the shipped Main 5.2 condition literally. For normal set
        // counts this branch is effectively unreachable; do not "fix" it.
        option0=row.byExtOption[j]??255;value0=row.byExtOptionValue[j]??0;
      }
      append(option0,value0);append(option1,value1);
    }
    if(count>=Number(row.byOptionCount)-2){
      for(let j=0;j<5;j++){
        const before=optionCount[setType];append(row.byFullOption[j],row.byFullOptionValue[j]);
        if(optionCount[setType]!==before&&sameSetItem!==0)sameSetItem++;
      }
    }
  }
  const list=[];
  for(let setType=0;setType<2;setType++)for(const e of tmp[setType])list.push(e);
  return {groups,list,optionCount,setANum:optionCount[0],setBNum:optionCount[1],sameSetItem,sequenceNames};
}

function pcSetCurrentTypeCount(item,runtime,setRuntime){
  const def=pcResolveSetItem(item,setRuntime?.owners);if(!def||!runtime)return 0;
  const g=runtime.groups.find(x=>x.index===def.index);if(!g)return 0;
  const row=setRuntime.owners.option[def.index];
  return g.count>=Number(row.byOptionCount)-1?255:g.count;
}

function pcSetTotalTypeCount(def,owners){
  // CSItemOption::GetSetItmeCount compares the selected set-option byte, not
  // the display name, and counts both A/B table entries independently.
  let n=0;for(const t of owners?.type||[]){if(!t)continue;for(let k=0;k<2;k++)if(Number(t.byOption?.[k])===def.index)n++;}
  return n;
}
function pcSetFullEffect(def,setRuntime){
  // Literal isFullseteffect: unique equipped item Types whose resolved set
  // display name equals the selected set name, compared with GetSetItmeCount.
  const eq=setRuntime?.equipment,owners=setRuntime?.owners;if(!Array.isArray(eq)||!owners)return false;
  const seen=new Set();
  for(const item of eq){
    if(!item)continue;const d=pcResolveSetItem(item,owners);
    if(d?.optionRow?.name===def.optionRow.name)seen.add(Number(item.itemType??item.type));
  }
  const total=pcSetTotalTypeCount(def,owners);return total>0&&seen.size===total;
}
function pcSetTooltipLines(item,globalText,character,advancedOwners,setRuntime){
  const def=pcResolveSetItem(item,setRuntime?.owners);if(!def)return null;
  const runtime=pcCalcSetOptionRuntime(setRuntime,character,advancedOwners);if(!runtime)return null;
  const row=def.optionRow,full=pcSetFullEffect(def,setRuntime);
  const lines=[];blank(lines);
  const a=pcGlobalTextGet(globalText,1089),b=pcGlobalTextGet(globalText,159);if(a==null||b==null)return null;
  add(lines,`${a} ${b}`,PC_TEXT_COLOR.YELLOW,false);blank(lines);blank(lines);

  // Search_From_EquippedSetItemNameSequence: locate the first flattened option
  // whose sequence belongs to the selected set name.
  const seqId=runtime.sequenceNames.indexOf(row.name);
  let count1=seqId<0?255:runtime.list.findIndex(e=>e.sequence===seqId);
  let byLimitOptionNum=seqId<0?0:Math.abs((runtime.setANum+runtime.setBNum)-runtime.sameSetItem);
  if(full)byLimitOptionNum=13;
  const iLimitOptionCount=pcSetCurrentTypeCount(item,runtime,setRuntime)-1;
  const active=(opt,i)=>{
    if(count1===255||byLimitOptionNum===255||byLimitOptionNum===0||!(iLimitOptionCount>i))return false;
    const e=runtime.list[count1];
    if(e&&Number(e.option)===Number(opt)){count1++;return true;}
    return false;
  };

  // Preserve RenderSetOptionListInItem's variable lifetime exactly: option1/2
  // are initialized once before the loop and the unselected column is not
  // reset in the ext/full branches.
  let option1=255,option2=255,value1=255,value2=255;
  for(let i=0;i<=12;i++){
    if(i<6){
      option1=row.byStandardOption[i]?.[0]??255;option2=row.byStandardOption[i]?.[1]??255;
      value1=row.byStandardOptionValue[i]?.[0]??255;value2=row.byStandardOptionValue[i]?.[1]??255;
    }else if(i<8){
      if(def.kind-1===0){option1=row.byExtOption[i-6]??255;value1=row.byExtOptionValue[i-6]??255;}
      else{option2=row.byExtOption[i-6]??255;value2=row.byExtOptionValue[i-6]??255;}
    }else{
      if(def.kind-1===0){option1=row.byFullOption[i-8]??255;value1=row.byFullOptionValue[i-8]??255;}
      else{option2=row.byFullOption[i-8]??255;value2=row.byFullOptionValue[i-8]??255;}
      byLimitOptionNum=full?13:255;
    }
    if(Number(option1)!==255){const text=pcSetExplainText(globalText,option1,value1);if(text==null)return null;add(lines,text,active(option1,i)?PC_TEXT_COLOR.BLUE:PC_TEXT_COLOR.GRAY,false);}
    if(Number(option2)!==255){const text=pcSetExplainText(globalText,option2,value2);if(text==null)return null;add(lines,text,active(option2,i)?PC_TEXT_COLOR.BLUE:PC_TEXT_COLOR.GRAY,false);}
  }
  blank(lines);blank(lines);return lines;
}

function pcSocketOptionValue(info, sphere, character) {
  const raw=Number(info?.values?.[Math.max(0,Number(sphere||1)-1)]);
  if(!Number.isFinite(raw))return null;
  const typ=Number(info?.optionType);
  if(typ===1||typ===2)return Math.trunc(raw);
  if(raw===0)return null;
  if(typ===3){
    const lv=Number(character?.level); if(!Number.isFinite(lv))return null;
    const total=character?.masterValid?lv+Number(character?.masterLevel||0):lv;
    return Math.trunc(total/raw);
  }
  if(typ===4){
    const max=character?.masterValid?Number(character?.masterMaxLife):Number(character?.maxLife);
    return Number.isFinite(max)?Math.trunc(max/raw):null;
  }
  if(typ===5){
    const max=character?.masterValid?Number(character?.masterMaxMana):Number(character?.maxMana);
    return Number.isFinite(max)?Math.trunc(max/raw):null;
  }
  return null;
}

// Exact RenderItemInfo-visible stat adjustments. Harmony's StrengthenCapability
// is consulted at indices 0/1/2, and Socket seed 38/39 lower requirements.
// These are presentation calculations only; gameplay authority remains server-side.
function pcAdvancedDisplayAdjustments(item,o,advancedOwners,character) {
  const out={damageMin:0,damageMax:0,defense:0,requireStrengthDown:0,requireDexterityDown:0};
  const flags=decodePcPacketItemFlags(item); if(!flags)return null;
  if(!pcIsSocketItemType(o.type) && flags.harmonyOption!==0){
    const harmony=advancedOwners?.harmony;if(!harmony)return null;
    const hType=pcHarmonyItemType(o.type), opt=flags.harmonyOption, lv=flags.harmonyLevel;
    if(hType<3){
      const validMax=hType===0?10:8;
      if(opt<1||opt>validMax)return out; // invalid option is rendered diagnostically later
      const h=harmony[hType]?.[opt-1], value=Number(h?.harmonyJewelLevel?.[lv]);
      if(!h||!Number.isFinite(value))return null;
      if(o.level>=lv){
        if(hType===0){
          if(opt===1)out.damageMin=value;
          else if(opt===2)out.damageMax=value;
          else if(opt===5){out.damageMin=value;out.damageMax=value;}
          else if(opt===3)out.requireStrengthDown=value;
          else if(opt===4)out.requireDexterityDown=value;
        }else if(hType===1){
          // SI_SP.magicalpower is assigned by the PC but not consumed by
          // RenderItemInfo (the local magicalindex is never read). Preserve bug.
          if(opt===2)out.requireStrengthDown=value;
          else if(opt===3)out.requireDexterityDown=value;
        }else if(hType===2 && opt===1)out.defense=value;
      }
    }
  }
  if(pcIsSocketItemType(o.type)){
    const socket=advancedOwners?.socket;if(!socket)return null;
    const sf=pcDecodeSocketFields(item);if(!sf)return null;
    for(let i=0;i<sf.count;i++){
      const seed=sf.seedId[i];
      if(seed!==38&&seed!==39)continue;
      const info=socket[0]?.[seed],v=pcSocketOptionValue(info,sf.sphereLevel[i],character);
      if(v==null)return null;
      if(seed===38)out.requireStrengthDown+=v;else out.requireDexterityDown+=v;
    }
  }
  return out;
}

function buildPcStockItemTooltip(item, attr, globalText, character=null, advancedOwners=null, commonOnly=true, setRuntime=null) {
  const o=pcConvertCommonItem(item,attr,{allowAdvanced:!commonOnly}); if(!o || !(globalText instanceof Map)) return null;
  const adj=commonOnly?{damageMin:0,damageMax:0,defense:0,requireStrengthDown:0,requireDexterityDown:0}:pcAdvancedDisplayAdjustments(item,o,advancedOwners,character);
  if(!adj)return null;
  const setDef=(!commonOnly&&o.isSet)?pcResolveSetItem(item,setRuntime?.owners):null;
  if(!commonOnly&&o.isSet&&!setDef)return null;
  const excellentSpecials=!commonOnly?pcExcellentSpecials(item,o.type):[];
  const allSpecials=commonOnly?o.specials:[...o.specials,...excellentSpecials];
  const lines=[];
  blank(lines);
  let titleName=setDef?`${setDef.optionRow.name} ${attr.name}`:attr.name;
  if(!commonOnly&&o.excellentBits){const ex=pcGlobalTextGet(globalText,620);if(ex==null)return null;titleName=`${ex} ${titleName}`;}
  const title=o.level===0?titleName:`${titleName} +${o.level}`;
  const specialPurple=o.type===ITEM_STAFF+10||o.type===ITEM_SWORD+19||o.type===ITEM_BOW+18||o.type===ITEM_MACE+13;
  const titleColor=specialPurple?PC_TEXT_COLOR.PURPLE:(o.isSet?PC_TEXT_COLOR.GREEN_BLUE:((!commonOnly&&pcIsSocketItemType(o.type))?PC_TEXT_COLOR.VIOLET:((o.excellentBits&&allSpecials.length)?PC_TEXT_COLOR.GREEN:(o.level>=7?PC_TEXT_COLOR.YELLOW:(allSpecials.length?PC_TEXT_COLOR.BLUE:PC_TEXT_COLOR.WHITE)))));
  add(lines,title,titleColor,true); blank(lines);

  if(o.damageMin){
    const key=40+(o.twoHand?1:0);
    const dMin=o.damageMin+adj.damageMin, dMax=o.damageMax+adj.damageMax;
    const minDamage=dMin>=dMax?dMax:dMin;
    add(lines,gt(globalText,key,minDamage,dMax),(adj.damageMin||adj.damageMax)?PC_TEXT_COLOR.YELLOW:PC_TEXT_COLOR.WHITE);
  }
  if(o.defense) add(lines,gt(globalText,65,o.defense+adj.defense),adj.defense?PC_TEXT_COLOR.YELLOW:PC_TEXT_COLOR.WHITE);
  if(o.magicDefense) add(lines,gt(globalText,66,o.magicDefense));
  if(attr.successfulBlocking) add(lines,gt(globalText,67,o.successfulBlocking));
  if(attr.weaponSpeed) add(lines,gt(globalText,64,o.weaponSpeed));
  if(attr.walkSpeed) add(lines,gt(globalText,68,o.walkSpeed));
  if(o.maxDurability!=null && (attr.durability||attr.magicDur)) add(lines,gt(globalText,71,o.durability,o.maxDurability));

  // ZzzInventory.cpp: bows +7/+15 use their level as an authored extra
  // damage/arrow block instead of Luck/Option3 handling.
  if((o.type===ITEM_BOW+7 || o.type===ITEM_BOW+15) && o.level>=1){
    add(lines,gt(globalText,577,o.level*2+1),PC_TEXT_COLOR.BLUE,false);
    add(lines,gt(globalText,88,1),PC_TEXT_COLOR.BLUE,false);
  }

  // RenderItemInfo MAX_RESISTANCE loop: text is authored as element name + Level+1.
  for(let i=0;i<Math.min(7,o.resistances.length);i++){
    if(!o.resistances[i])continue;
    const element=pcGlobalTextGet(globalText,48+i);
    add(lines,element==null?null:gt(globalText,72,element,o.level+1));
  }

  const stat=(character&&typeof character==='object')?character:null;
  const reqLine=(key,need,current,adjusted=false)=>{
    if(!need)return;
    const cur=Number(current);
    const ok=Number.isFinite(cur)&&cur>=need;
    add(lines,gt(globalText,key,need),ok?(adjusted?PC_TEXT_COLOR.YELLOW:PC_TEXT_COLOR.WHITE):PC_TEXT_COLOR.RED);
    if(!ok && Number.isFinite(cur))add(lines,gt(globalText,74,need-cur),PC_TEXT_COLOR.RED);
  };
  reqLine(76,o.requireLevel,stat?.level);
  const needStr=o.requireStrength-adj.requireStrengthDown, needDex=o.requireDexterity-adj.requireDexterityDown;
  reqLine(73,needStr,Number(stat?.strength||0)+Number(stat?.addStrength||0),adj.requireStrengthDown!==0);
  reqLine(75,needDex,Number(stat?.dexterity||0)+Number(stat?.addDexterity||0),adj.requireDexterityDown!==0);
  reqLine(1930,o.requireVitality,Number(stat?.vitality||0)+Number(stat?.addVitality||0));
  reqLine(77,o.requireEnergy,Number(stat?.energy||0)+Number(stat?.addEnergy||0));
  reqLine(698,o.requireCharisma,Number(stat?.charisma||0)+Number(stat?.addCharisma||0));

  const rc=Array.isArray(attr.requireClass)?attr.requireClass:[];
  const count=rc.filter(v=>v===1).length;
  if(rc.some(v=>v>0) && count!==7){
    blank(lines);
    const classText=[[20,25,1669],[21,26,1668],[22,27,1670],[23,null,1671],[24,null,1672],[1687,1688,1689],[3150,null,3151]];
    const first=Number.isInteger(stat?.clientClass)?(stat.clientClass&7):-1;
    const step=Number.isInteger(stat?.clientClass)?((stat.clientClass&16)?3:((stat.clientClass&8)?2:1)):0;
    for(let i=0;i<Math.min(7,rc.length);i++){
      const need=rc[i]; if(!need)continue;
      const nameKey=classText[i]?.[need-1]; if(nameKey==null){add(lines,null);continue;}
      const className=pcGlobalTextGet(globalText,nameKey); if(className==null){add(lines,null);continue;}
      const text=gt(globalText,61,className); const ok=i===first && need<=step;
      add(lines,text,ok?PC_TEXT_COLOR.WHITE:PC_TEXT_COLOR.DARK_RED);
    }
  }

  // Exact RenderItemInfo level >=5 footwear bonuses.
  if(o.type>=ITEM_BOOTS&&o.type<ITEM_BOOTS+G&&o.level>=5){blank(lines);add(lines,gt(globalText,78),PC_TEXT_COLOR.BLUE,true);}
  if(o.type>=ITEM_GLOVES&&o.type<ITEM_GLOVES+G&&o.level>=5){blank(lines);add(lines,gt(globalText,93),PC_TEXT_COLOR.BLUE,true);}

  // Staff + five magic swords share the PC magic-power block.
  if((typeIsStaff(o.type)||isSpecialMagicSword(o.type))){
    blank(lines);
    add(lines,gt(globalText,(o.type>=ITEM_STAFF+21&&o.type<=ITEM_STAFF+29)?1691:79,o.magicPower),PC_TEXT_COLOR.BLUE,true);
  }
  if(isScepterItem(o.type)){
    blank(lines);add(lines,gt(globalText,1234,o.magicPower),PC_TEXT_COLOR.BLUE,true);
  }

  if(!commonOnly){
    const flags=decodePcPacketItemFlags(item);
    if(!flags)return null;

    // ZzzInventory.cpp::RenderItemInfo — 380 additional-option text comes
    // before Harmony/default/special lines and is owned by ItemAddOption.bmd.
    if(flags.option380){
      const row=advancedOwners?.itemAdd?.[o.type];
      if(!row)return null;
      const opts=[[row.option1,row.value1],[row.option2,row.value2]];
      blank(lines);
      for(const [kind,value] of opts){
        let text=null;
        switch(Number(kind)){
          case 1:text=gt(globalText,2184,value);break; case 2:text=gt(globalText,2185,value);break;
          case 3:text=gt(globalText,2186,value);break; case 4:text=gt(globalText,2187,value);break;
          case 5:text=gt(globalText,2188,value);break; case 6:text=gt(globalText,2189,value);break;
          case 7:text=gt(globalText,2190);break; case 8:text=gt(globalText,2191,value);break;
          default:return null;
        }
        add(lines,text,PC_TEXT_COLOR.RED_PURPLE,true);
      }
      blank(lines);
    }

    // Socket items reuse byte 6 as SocketSeedSetOption, therefore Harmony is
    // deliberately suppressed exactly as CNewUIItemMng::CreateItem does.
    if(!pcIsSocketItemType(o.type) && flags.harmonyOption!==0){
      const harmony=advancedOwners?.harmony; if(!harmony)return null;
      const hType=pcHarmonyItemType(o.type);
      if(hType<3){
        const validMax=hType===0?10:8;
        blank(lines);
        if(flags.harmonyOption>=1 && flags.harmonyOption<=validMax){
          const h=harmony[hType]?.[flags.harmonyOption-1];
          const value=h?.harmonyJewelLevel?.[flags.harmonyLevel];
          if(!h || !h.name || !Number.isFinite(value))return null;
          const pct=hType===2 && flags.harmonyOption===7;
          add(lines,`${h.name} +${value}${pct?'%':''}`,o.level>=flags.harmonyLevel?PC_TEXT_COLOR.YELLOW:PC_TEXT_COLOR.GRAY,true);
        }else{
          add(lines,gt(globalText,2204,hType,flags.harmonyOption,flags.harmonyLevel),PC_TEXT_COLOR.DARK_RED,true);
          add(lines,gt(globalText,2205),PC_TEXT_COLOR.DARK_RED,true);
        }
        blank(lines);
      }
    }
  }

  if(!commonOnly){
    // CSItemOption::RenderDefaultOptionText — ExtOption bits 2..3 carry the
    // stock +5/+10/+15 stat option selected by ITEM_ATTRIBUTE::AttType.
    const dv=((o.extOption>>2)%4);
    if(dv>0){
      const key={1:950,2:951,3:952,4:953}[Number(attr.attType)];
      if(key!=null)add(lines,gt(globalText,key,dv*5),PC_TEXT_COLOR.BLUE,false);
    }
  }

  if(allSpecials.length) blank(lines);
  for(const special of allSpecials){
    const rendered=pcCommonSpecialText(o.type,special,globalText);
    if(!rendered){add(lines,null);continue;}
    add(lines,rendered.main,PC_TEXT_COLOR.BLUE,false);
    for(const extra of rendered.extra) add(lines,extra.text,extra.color,extra.bold);
  }
  if(allSpecials.length) blank(lines);

  if(!commonOnly){
    const flags=decodePcPacketItemFlags(item); if(!flags)return null;
    // Period branch is near the end of RenderItemInfo. Active period items with
    // lExpireTime==0 abort the entire desktop tooltip, so Web does the same.
    if(flags.periodItem){
      if(flags.expiredPeriod){
        add(lines,gt(globalText,3266),PC_TEXT_COLOR.RED,false);
      }else{
        const seconds=Number(item?.expireTime||0); if(!(seconds>0))return null;
        add(lines,gt(globalText,3265),PC_TEXT_COLOR.ORANGE,false);
        const d=new Date(seconds*1000); if(!Number.isFinite(d.getTime()))return null;
        const z=(n)=>String(n).padStart(2,'0');
        add(lines,`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}  ${z(d.getHours())}:${z(d.getMinutes())}`,PC_TEXT_COLOR.BLUE,false);
      }
    }

    // CSItemOption::RenderSetOptionListInItem sits after descriptions/period
    // and immediately before SocketSystem::AttachToolTipForSocketItem.
    if(o.isSet){
      const setLines=pcSetTooltipLines(item,globalText,character,advancedOwners,setRuntime);
      if(!setLines)return null;
      lines.push(...setLines);
    }

    // SocketSystem::AttachToolTipForSocketItem is attached after period/set
    // branches. Only exact SocketItem_Por.bmd rows are consumed.
    if(pcIsSocketItemType(o.type)){
      const socket=advancedOwners?.socket; if(!socket)return null;
      const sf=pcDecodeSocketFields(item); if(!sf)return null;
      if(sf.count>0){
        blank(lines);
        const headA=pcGlobalTextGet(globalText,2650), headB=pcGlobalTextGet(globalText,159);
        add(lines,(headA==null||headB==null)?null:`${headA} ${headB}`,PC_TEXT_COLOR.PURPLE,false);
        blank(lines);
        const valueText=(info,sphere)=>{const v=pcSocketOptionValue(info,sphere,character);return v==null?null:`+${v}${Number(info.optionType)===2?'%':''}`;};
        for(let i=0;i<sf.count;i++){
          const seed=sf.seedId[i]; let optText=null,color=PC_TEXT_COLOR.GRAY;
          if(seed===0xFF){optText=gt(globalText,2652);}
          else if(seed>=0&&seed<50){
            const info=socket[0]?.[seed]; const val=valueText(info,sf.sphereLevel[i]);
            const cat=pcGlobalTextGet(globalText,2640+Number(info?.category||0)-1);
            if(!info||!info.name||val==null||cat==null)return null;
            optText=`${cat}(${info.name} ${val})`; color=PC_TEXT_COLOR.BLUE;
          }else return null;
          add(lines,gt(globalText,2655,i+1,optText),color,false);
        }
        if(sf.setOption>=0&&sf.setOption<50){
          const info=socket[1]?.[sf.setOption]; const val=valueText(info,1); if(!info||!info.name||val==null)return null;
          blank(lines); add(lines,gt(globalText,2656),PC_TEXT_COLOR.PURPLE,false); blank(lines);
          add(lines,`${info.name} ${val}`,PC_TEXT_COLOR.BLUE,false);
        }
      }
    }
  }

  if(lines.some(l=>l.text==null)) return null;
  return lines;
}

export function pcCommonItemTooltip(item, attr, globalText, character=null) {
  return buildPcStockItemTooltip(item,attr,globalText,character,null,true,null);
}
export function pcItemTooltip(item, attr, globalText, character=null, advancedOwners=null, setRuntime=null) {
  const customWing=buildPcCustomWingTooltip(item,attr,globalText,character);
  if(customWing)return customWing;
  const stockWing=buildPcStockWingTooltip(item,attr,globalText,character);
  if(stockWing)return stockWing;
  return buildPcStockItemTooltip(item,attr,globalText,character,advancedOwners,false,setRuntime);
}
function typeIsStaff(type){return type>=ITEM_STAFF&&type<ITEM_STAFF+G;}

export const PC_TOOLTIP_CSS_COLOR = Object.freeze({
  white:'#ffffff',blue:'rgb(128,179,255)',gray:'rgb(102,102,102)',greenBlue:'#00ff00',red:'rgb(255,51,26)',
  yellow:'rgb(255,204,26)',green:'rgb(26,255,128)',purple:'rgb(255,26,255)',redPurple:'rgb(204,128,204)',
  violet:'rgb(179,102,255)',orange:'rgb(230,107,10)',darkRed:'#ffffff',darkBlue:'#ffffff',darkYellow:'#ffffff',
});
export const PC_TOOLTIP_CSS_BG = Object.freeze({darkRed:'rgb(160,0,0)',darkBlue:'rgb(0,0,160)',darkYellow:'rgb(160,102,0)',greenBlue:'rgb(60,60,200)'});
