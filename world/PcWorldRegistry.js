/**
 * PcWorldRegistry.js — canonical PC Main 5.2 world routing.
 *
 * Authority: B101 MapManager.h ENUM_WORLD + CMapManager::LoadWorld().
 * IMPORTANT: serverMap is WorldActive / protocol map id. assetWorld is the
 * WorldN/ObjectN/EncTerrainN folder index. They are different domains.
 */

const rows = [
  [0,'Lorencia'],[1,'Dungeon'],[2,'Devias'],[3,'Noria'],[4,'Lost Tower'],[5,'Unknown 5'],
  [6,'Arena'],[7,'Atlans'],[8,'Tarkan'],[9,'Devil Square'],[10,'Icarus'],
  [11,'Blood Castle 1'],[12,'Blood Castle 2'],[13,'Blood Castle 3'],[14,'Blood Castle 4'],[15,'Blood Castle 5'],[16,'Blood Castle 6'],[17,'Blood Castle 7'],
  [18,'Chaos Castle 1'],[19,'Chaos Castle 2'],[20,'Chaos Castle 3'],[21,'Chaos Castle 4'],[22,'Chaos Castle 5'],[23,'Chaos Castle 6'],
  [24,'Hellas 1'],[25,'Hellas 2'],[26,'Hellas 3'],[27,'Hellas 4'],[28,'Hellas 5'],[29,'Hellas 6'],
  [30,'Loren Deep'],[31,'Hunting Ground'],[33,'Aida'],[34,'Crywolf'],[35,'Crywolf 2'],[36,'Hellas 7'],
  [37,'Kanturu Ruins 1'],[38,'Kanturu Ruins 2'],[39,'Kanturu Ruins 3'],[40,'GM Area'],[41,'Changeup 3rd 1'],[42,'Changeup 3rd 2'],
  [45,'Cursed Temple 1'],[46,'Cursed Temple 2'],[47,'Cursed Temple 3'],[48,'Cursed Temple 4'],[49,'Cursed Temple 5'],[50,'Cursed Temple 6'],
  [51,'Elbeland'],[52,'Blood Castle Master'],[53,'Chaos Castle Master'],[54,'Character Scene'],[55,'Login Scene'],
  [56,'Swamp of Peace'],[57,'La Cleon'],[58,'La Cleon Boss'],[62,'Santa Town'],[63,'Vulcanus'],[64,'Duel Arena'],
  [65,'Doppelganger 1'],[66,'Doppelganger 2'],[67,'Doppelganger 3'],[68,'Doppelganger 4'],
  [69,'Empire Guardian 1'],[70,'Empire Guardian 2'],[71,'Empire Guardian 3'],[72,'Empire Guardian 4'],
  [73,'New Login Scene (old)'],[74,'New Character Scene (old)'],[77,'New Login Scene'],[78,'New Character Scene'],
  [79,'United Market'],[80,'Karutan 1'],[81,'Karutan 2'],
];

const names = new Map(rows);

export function normalizePcServerMap(serverMap) {
  const n = Number(serverMap);
  if (!Number.isInteger(n) || n < 0 || n > 255) return null;
  // Exact B101 CMapManager::LoadWorld special redirect.
  return n === 32 ? 9 : n;
}

export function pcAssetWorldForServerMap(serverMap) {
  const m = normalizePcServerMap(serverMap);
  if (m == null) return null;
  if ((m >= 11 && m <= 17) || m === 52) return 12; // Blood Castle family
  if ((m >= 18 && m <= 23) || m === 53) return 19; // Chaos Castle family
  if ((m >= 24 && m <= 29) || m === 36) return 25; // Hellas/Kalima family
  if (m >= 45 && m <= 50) return 47;               // Cursed Temple family
  return m + 1;                                    // exact default B101 rule
}

export function getPcWorldDescriptor(serverMap) {
  const requested = Number(serverMap);
  const normalizedServerMap = normalizePcServerMap(requested);
  if (normalizedServerMap == null) return null;
  const assetWorld = pcAssetWorldForServerMap(normalizedServerMap);
  return Object.freeze({
    requestedServerMap: requested,
    serverMap: normalizedServerMap,
    assetWorld,
    name: names.get(normalizedServerMap) || `Map ${normalizedServerMap}`,
    knownEnum: names.has(normalizedServerMap),
    redirected: requested !== normalizedServerMap,
  });
}

export const PC_WORLD_ROWS = Object.freeze(rows.map(([serverMap,name]) => Object.freeze({
  serverMap, name, assetWorld: pcAssetWorldForServerMap(serverMap),
})));

// MoveReq's first int is an INDEX (MoveCommandData::MOVEREQINFO.index), not
// WorldActive. These are current-client movement aliases mapped to PC worlds.
export const CURRENT_MOVE_REQ_SERVER_MAP_BY_NAME = Object.freeze({
  Arena:6, Lorencia:0, Noria:3,
  Elveland:51, Elveland2:51, Elveland3:51,
  Devias:2, Devias2:2, Devias3:2, Devias4:2,
  Dungeon:1, Dungeon2:1, Dungeon3:1,
  Atlans:7, Atlans2:7, Atlans3:7,
  LostTower:4, LostTower2:4, LostTower3:4, LostTower4:4, LostTower5:4, LostTower6:4, LostTower7:4,
  Tarkan:8, Tarkan2:8,
  Aida1:33, Aida2:33,
  Icarus:10, Crywolf:34,
  KanturuRuins1:37, KanturuRuins2:38, KanturuRuins3:39, KanturuRuins4:39,
  LaCleon:57, SwampOfPeace:56, Vulcanus:63, LorenDeep:30,
});

export function serverMapForMoveReqName(name) {
  return CURRENT_MOVE_REQ_SERVER_MAP_BY_NAME[String(name || '')] ?? null;
}
