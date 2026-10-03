/**
 * MapData.js — server-world metadata + exact current MoveReq aliases.
 *
 * R77 fixes a long-standing domain mixup:
 * - `id` / `serverMapId` = protocol WorldActive map id.
 * - `assetWorld` = WorldN/ObjectN/EncTerrainN folder selected by B101 LoadWorld.
 * - `moveReqIndex` / legacy `mapNumber` = MOVEREQINFO.index from movereq_por.bmd.
 * These numbers are NOT interchangeable.
 */
import { REAL_MAPS } from '../data/generated/RealMaps.js';
import { getPcWorldDescriptor, serverMapForMoveReqName } from './PcWorldRegistry.js';

const CLASSIC_SPAWNS = {
  Lorencia:['budgedragon','hound','spider','bullfighter'], Dungeon:['ghost','skeletonwarrior','hellhound','cyclops'],
  Devias:['icemonster','yeti','assassin','wormsqueen'], Noria:['goblin','stonegolem','forestmonster','argnat'],
  LostTower:['devil','poisshadow','cursedwarrior','deathcow'], Atlans:['bahamut','seawizard','greatbahamut','hydra'],
  Tarkan:['mutant','bloodywolf','irongolem','shadowknight'], Aida1:['gindle','deathpoets','bals','deathrider'],
};
function themeFor(name){const n=String(name).toLowerCase();if(/devias|swamp|lacleon/.test(n))return{bg:0xcfe8f5,fog:0xe8f4fb,terrain:0xdfeef7,music:'snow',decor:{trees:60,rocks:50,crystals:15,ruins:1}};if(/dungeon|tower/.test(n))return{bg:0x0a0a14,fog:0x1a1a2e,terrain:0x3a3a44,music:'dungeon',decor:{trees:0,rocks:80,crystals:20,ruins:10}};if(/atlans/.test(n))return{bg:0x0a3d62,fog:0x2e86ab,terrain:0x1f5c7a,music:'underwater',decor:{trees:0,rocks:60,crystals:50,ruins:15}};if(/tarkan/.test(n))return{bg:0xc19a5b,fog:0xe0c690,terrain:0xd4b26a,music:'desert',decor:{trees:15,rocks:70,crystals:10,ruins:12}};if(/noria|elveland|elbeland/.test(n))return{bg:0x7fb069,fog:0xb8e0a0,terrain:0x5d8a3c,music:'forest',decor:{trees:200,rocks:25,crystals:10,ruins:1}};if(/arena/.test(n))return{bg:0x6b4f2a,fog:0xa8875a,terrain:0x9c7b4a,music:'arena',decor:{trees:0,rocks:10,crystals:5,ruins:30}};return{bg:0x2e4a1f,fog:0x9db68a,terrain:0x4a6b2f,music:'field',decor:{trees:120,rocks:40,crystals:0,ruins:2}};}

export const MAPS = {};
for (const mp of REAL_MAPS) {
  const serverMapId=serverMapForMoveReqName(mp.name);
  const d=serverMapId==null?null:getPcWorldDescriptor(serverMapId);
  const theme=themeFor(mp.name);
  MAPS[mp.name.toUpperCase().replace(/[^A-Z0-9]/g,'_')]={
    id:serverMapId, serverMapId, assetWorld:d?.assetWorld ?? null,
    moveReqIndex:mp.mapNumber, mapNumber:mp.mapNumber,
    name:mp.name,nameAlt:mp.nameAlt,minZen:mp.minZen,moveZen:mp.moveZen,
    center:{x:0,z:0},size:25600,levelReq:1,
    monsters:CLASSIC_SPAWNS[mp.name]||CLASSIC_SPAWNS[mp.name.replace(/[2-7]$/,'')]||[],
    safezone:null,pvp:serverMapId===6,bgColor:theme.bg,fogColor:theme.fog,musicTheme:theme.music,terrainColor:theme.terrain,decor:theme.decor,
  };
}

export function getMapById(id){
  const n=Number(id); if(!Number.isInteger(n))return null;
  const exact=Object.values(MAPS).find(m=>m.serverMapId===n);
  if(exact)return exact;
  const d=getPcWorldDescriptor(n); if(!d)return null;
  const theme=themeFor(d.name);
  return {id:d.serverMap,serverMapId:d.serverMap,assetWorld:d.assetWorld,moveReqIndex:null,mapNumber:null,name:d.name,nameAlt:d.name,minZen:null,moveZen:null,center:{x:0,z:0},size:25600,levelReq:1,monsters:[],safezone:null,pvp:d.serverMap===6,bgColor:theme.bg,fogColor:theme.fog,musicTheme:theme.music,terrainColor:theme.terrain,decor:theme.decor};
}
export function getMapByNumber(moveReqIndex){return Object.values(MAPS).find(m=>m.moveReqIndex===moveReqIndex)||null;}
export function getMapByServerId(serverMapId){return getMapById(serverMapId);}
export function getMapsForLevel(level){return Object.values(MAPS).filter(m=>level>=m.levelReq);}
