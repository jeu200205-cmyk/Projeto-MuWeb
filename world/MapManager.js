import * as THREE from 'three';
import { MAPS, getMapById } from './MapData.js';

/**
 * MapManager — estado/metadados do mapa, SEM cenário procedural.
 *
 * R12 removeu o antigo terrain sin/cos, árvores/rochas/cristais geométricos,
 * NPCs hardcoded, portais hardcoded e spawn aleatório. Esses caminhos podiam
 * fazer uma scene "parecer preenchida" sem representar o Main/GS real.
 *
 * Autoridade visual de produção:
 *   GameScene.loadRealMap -> TerrainWorld (OZB/OZJ/OZT/ATT)
 *                         -> TerrainObjectWorld (EncTerrain*.obj + Object*.bmd)
 * Autoridade de entidades:
 *   pacotes/viewport do GameServer.
 */
export class MapManager {
  constructor(scene, gameScene = null) {
    this.scene = scene;
    this.gameScene = gameScene;
    this.authoritativeOnly = true;
    this.currentMap = null;
    this.currentGroup = null;
    this.npcs = [];
    this.portals = [];
    // Pode ser preenchido SOMENTE por parser/dados reais (ex. AttMapLoader).
    this.spawnPoints = [];
    this.monsters = [];
    this.onMapLoaded = null;
    this.onTeleport = null;
  }

  loadMap(id) {
    const mapData = getMapById(id);
    if (!mapData) {
      console.error(`MapManager: mapa ${id} não encontrado`);
      return null;
    }
    this.unloadCurrent();
    this.currentMap = mapData;
    this.currentGroup = new THREE.Group();
    this.currentGroup.name = 'MU_MAP_METADATA_ONLY';
    this.scene.add(this.currentGroup);
    console.info(`[MapManager] map=${mapData.id} metadata-only; visual e entidades exigem dados reais.`);
    this.onMapLoaded?.(mapData);
    return mapData;
  }

  unloadCurrent() {
    if (this.currentGroup) {
      this.scene.remove(this.currentGroup);
      this.currentGroup.clear();
    }
    this.currentGroup = null;
    this.npcs = [];
    this.portals = [];
    this.spawnPoints = [];
    this.monsters = [];
  }

  /** Sem seed aleatória: retorna somente spawns que uma fonte real adicionou. */
  getSpawnPointsNear(pos, radius = 600) {
    return this.spawnPoints.filter((p) => {
      const dx = p.x - pos.x, dz = p.z - pos.z;
      return dx * dx + dz * dz <= radius * radius;
    });
  }

  _inSafezone(mapData, x, z, margin = 0) {
    const s = mapData?.safezone;
    if (!s) return false;
    const dx = x - s.x, dz = z - s.z;
    const r = s.radius + margin;
    return dx * dx + dz * dz < r * r;
  }

  isSafezone(pos) {
    if (!this.currentMap?.safezone) return false;
    return this._inSafezone(this.currentMap, pos.x, pos.z, 0);
  }

  getCurrentMap() { return this.currentMap; }

  /** Altura autoritativa: OZB da GameScene; sem terrain procedural de fallback. */
  getHeightAt(x, z) {
    if (this.gameScene?.heights) return this.gameScene.terrainHeightAt(x, z);
    return 0;
  }

  findNPCFromRaycaster(raycaster) {
    const meshes = [];
    for (const npc of this.npcs) npc.group?.traverse?.((o) => { if (o.isMesh) meshes.push(o); });
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj && !obj.userData.npc) obj = obj.parent;
    return obj?.userData?.npc || null;
  }

  update(dt, playerPos = null, playerLevel = 1) {
    // Somente entidades reais previamente registradas; nada é criado aqui.
    for (const portal of this.portals) {
      portal.update?.(dt);
      if (playerPos) portal.checkPlayer?.(playerPos, playerLevel);
    }
    for (const npc of this.npcs) npc.update?.(dt);
  }
}

export { MAPS };
export default MapManager;
