import * as THREE from 'three';
import MapManager from '../world/MapManager.js';

/**
 * CollisionWithWorld.js - Colisão simples (círculos 2D no plano XZ)
 *
 * Mantém uma lista de colliders (árvores, rochas, NPCs...) indexada por mapa
 * e bloqueia o movimento do jogador quando ele entraria em um collider.
 *
 * API:
 *   const cw = new CollisionWorld(mapManager)  // usa a instância existente do MapManager
 *   cw.adicionarCollider({ x, z, radius })     // ou um THREE.Object3D + radius
 *   cw.removerCollider(id)
 *   cw.isBlocked({x, z})                       // true se a posição colide
 *   cw.clearMap(mapId)                         // limpa colliders de um mapa
 *   cw.syncFromMap()                           // reconstrói a partir do mapa atual
 */
export class CollisionWorld {
    /**
     * @param {MapManager} mapManager - instância de world/MapManager.js
     */
    constructor(mapManager = null) {
        this.mapManager = mapManager;
        // colliders por mapa: Map<mapId, Array<{id,x,z,radius,source}>>
        this._byMap = new Map();
        this._nextId = 1;
        this.defaultPadding = 0.5;

        if (mapManager) {
            // Re-sincroniza colliders automáticamente a cada troca de mapa
            const prev = mapManager.onMapLoaded;
            mapManager.onMapLoaded = (mapData) => {
                this.syncFromMap();
                if (typeof prev === 'function') prev(mapData);
            };
        }
    }

    _currentMapId() {
        return this.mapManager && this.mapManager.currentMap
            ? this.mapManager.currentMap.id
            : '__global__';
    }

    _bucket(mapId) {
        if (!this._byMap.has(mapId)) this._byMap.set(mapId, []);
        return this._byMap.get(mapId);
    }

    /**
     * Adiciona um collider.
     * @param {object} c - { x, z, radius } ou { object3D, radius } ou { object3D, autoRadius }
     * @param {number} [mapId] - mapa ao qual pertence (default: mapa atual)
     * @returns {number} id do collider
     */
    adicionarCollider(c, mapId = this._currentMapId()) {
        let x = c.x, z = c.z, radius = c.radius;
        if (c.object3D) {
            const obj = c.object3D;
            x = obj.position.x;
            z = obj.position.z;
            if (radius === undefined) {
                // estima pelo tamanho do bounding box
                const box = new THREE.Box3().setFromObject(obj);
                const size = box.getSize(new THREE.Vector3());
                radius = Math.max(size.x, size.z) * 0.4;
            }
        }
        if (radius === undefined) radius = 2;
        const id = this._nextId++;
        this._bucket(mapId).push({
            id, x, z, radius: radius + this.defaultPadding,
            source: c.source || (c.object3D ? (c.object3D.name || c.object3D.type) : 'manual')
        });
        return id;
    }

    /** Remove um collider pelo id */
    removerCollider(id) {
        for (const list of this._byMap.values()) {
            const i = list.findIndex(c => c.id === id);
            if (i >= 0) { list.splice(i, 1); return true; }
        }
        return false;
    }

    /** Limpa todos os colliders de um mapa */
    clearMap(mapId) {
        this._byMap.delete(mapId);
    }

    /**
     * Reconstrói os colliders do mapa atual a partir do MapManager:
     * árvores/rochas (meshes decorativos do currentGroup) e NPCs.
     */
    syncFromMap() {
        const mm = this.mapManager;
        if (!mm || !mm.currentMap) return;
        const mapId = mm.currentMap.id;
        this.clearMap(mapId);

        // Decorações: percorre o grupo do mapa; ignora terreno/anel de safezone
        if (mm.currentGroup) {
            for (const child of mm.currentGroup.children) {
                if (child === mm.terrain) continue;
                if (child.isMesh && child.geometry && child.geometry.type === 'RingGeometry') continue;
                // só objetos posicionados no chão (trees/rocks/crystals/ruins/NPCs são groups ou meshes com posição)
                if (child.position && (Math.abs(child.position.x) > 0 || Math.abs(child.position.z) > 0)) {
                    this.adicionarCollider({ object3D: child, source: 'decor' }, mapId);
                }
            }
        }

        // NPCs (raio um pouco maior para bloquear interação corpo-a-corpo)
        for (const npc of mm.npcs || []) {
            const p = npc.group ? npc.group.position : npc.position;
            if (p) this.adicionarCollider({ x: p.x, z: p.z, radius: 3, source: 'npc' }, mapId);
        }
    }

    /**
     * Verifica se uma posição {x, z} colide com algum collider do mapa atual.
     * @returns {boolean}
     */
    isBlocked(pos) {
        const list = this._byMap.get(this._currentMapId());
        if (!list || list.length === 0) return false;
        for (const c of list) {
            const dx = pos.x - c.x, dz = pos.z - c.z;
            if (dx * dx + dz * dz < c.radius * c.radius) return true;
        }
        return false;
    }

    /** Retorna os colliders do mapa atual (para debug/visualização) */
    getColliders(mapId = this._currentMapId()) {
        return this._byMap.get(mapId) || [];
    }
}

export default CollisionWorld;
