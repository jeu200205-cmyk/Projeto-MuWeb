/**
 * CurrentClientLuaAuthority.js — exact Data Lua inventory used by this PC source.
 * This does not pretend that every Lua callback is ported: it proves which
 * authoritative scripts are present in the active Data and exposes coverage so
 * subsystem ports can fail closed instead of silently falling back to stale rows.
 */
import { RemoteAssets } from './RemoteAssets.js';
import { decodePcLuaText } from './PcLuaCrypt.js';

export const PC_LUA_SCRIPT_PATHS=Object.freeze([
 'CharacterSystem/CharacterCreateCape.lua','CharacterSystem/CharacterHelper.lua','CharacterSystem/CharacterList.lua','CharacterSystem/DarkSpirit.lua','CharacterSystem/Descriptions.lua','CharacterSystem/DescriptionsItemsVisual.lua','CharacterSystem/PatentSystem.lua','CharacterSystem/RenderModel.lua',
 'Configs/CustomBowCross.lua','Configs/CustomItemFloor.lua','Configs/CustomItemForce.lua','Configs/CustomItemPosition.lua','Configs/CustomItemSize.lua','Configs/CustomServerName.lua','Configs/CustomWings.lua','Configs/DisableExcellent.lua','Configs/ElementSlots.lua','Configs/Font.lua','Configs/ItemEffects.lua','Configs/LoadItens.lua','Configs/MessageColors.lua','Configs/bordas.lua','Configs/transparente.lua',
 'Controller/Interface.lua','Controller/LoadImages.lua',
 'EffectSystem/CharacterEffectItens.lua','EffectSystem/CharacterSetEffect.lua',
 'Monster/CustomMonster.lua','Monster/CustomMonsterEffect.lua','Monster/CustomMonsterGlow.lua','Monster/CustomMonsterName.lua'
]);
let status=Object.freeze({loaded:false,total:PC_LUA_SCRIPT_PATHS.length,present:0,missing:PC_LUA_SCRIPT_PATHS.length,scripts:Object.freeze([])}),inflight=null;
export function currentClientLuaStatus(){return status;}
async function readOne(rel,fetchBinary){const variants=[`Configs/Lua/${rel}`,`Configs/lua/${rel}`,`Configs/crypt/${rel}`];let last=null;for(const path of variants){try{const b=await fetchBinary(path);if(!b)continue;const text=decodePcLuaText(b);return Object.freeze({rel,path,present:true,bytes:b.byteLength??b.length??0,textLength:text.length});}catch(e){last=e;}}return Object.freeze({rel,path:null,present:false,error:last?.message||'absent'});}
export async function loadCurrentClientLuaAuthority(fetchBinary=(p)=>RemoteAssets.fetchBinary(p)){
 if(status.loaded)return status;if(inflight)return inflight;
 inflight=(async()=>{const scripts=await Promise.all(PC_LUA_SCRIPT_PATHS.map(rel=>readOne(rel,fetchBinary)));const present=scripts.filter(x=>x.present).length;status=Object.freeze({loaded:true,total:scripts.length,present,missing:scripts.length-present,scripts:Object.freeze(scripts)});console.info(`[LuaAuthority] PC Data scripts present=${present}/${scripts.length} missing=${status.missing}`);for(const r of scripts)if(!r.present)console.warn(`[LuaAuthority] missing ${r.rel}: ${r.error}`);return status;})().finally(()=>{inflight=null;});return inflight;
}
export function resetCurrentClientLuaAuthorityForTests(){status=Object.freeze({loaded:false,total:PC_LUA_SCRIPT_PATHS.length,present:0,missing:PC_LUA_SCRIPT_PATHS.length,scripts:Object.freeze([])});inflight=null;}
