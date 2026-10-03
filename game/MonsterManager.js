import * as THREE from 'three';
import { Monster, resolveMonsterType } from './Monster.js';
import { REAL_MONSTERS } from '../data/generated/RealMonsters.js';
import { muDirectionToThreeYaw } from './MUDirection.js';
import { classifyViewportActor } from './ViewportActorSemantics.js';
import { customMonsterType } from '../data/CurrentClientMonsterOwners.js';

export class MonsterManager {
  /**
   * @param {THREE.Scene|null} scene optional scene to add monster meshes into
   * @param {{areaSize?: number, areaCenter?: THREE.Vector3}} opts
   */
  constructor(scene = null, { areaSize = 100, areaCenter = new THREE.Vector3(0, 0, 0) } = {}) {
    this.scene = scene;
    this.areaSize = areaSize;
    this.areaCenter = areaCenter;
    this.monsters = [];
    this.playerAvoidRadius = 5; // don't spawn right next to player
    this.onMonsterDeath = null; // callback(monster, killerPos)
    this.onMonsterAttack = null; // callback(monster, player, result)
  }

  randomPosition(avoidPos = null) {
    for (let i = 0; i < 20; i++) {
      const x = this.areaCenter.x + (Math.random() - 0.5) * this.areaSize;
      const z = this.areaCenter.z + (Math.random() - 0.5) * this.areaSize;
      const p = new THREE.Vector3(x, 0, z);
      if (avoidPos && p.distanceTo(avoidPos) < this.playerAvoidRadius) continue;
      return p;
    }
    return new THREE.Vector3(this.areaCenter.x, 0, this.areaCenter.z + this.areaSize * 0.4);
  }

  /**
   * Spawn initial monsters at random positions.
   * @param {number} count
   * @param {string[]|null} typeKeys null => nomes REAIS do Npcname (517)
   */
  spawnInitial(count = 20, typeKeys = null) {
    // Chaves válidas apenas (resolvem num monstro REAL) — nenhuma invenção.
    const candidates = (typeKeys && typeKeys.length ? typeKeys : REAL_MONSTERS.map((m) => m.name))
      .filter((k) => resolveMonsterType(k));
    if (!candidates.length) {
      console.error('[MonsterManager] nenhuma chave de spawn resolve um monstro real');
      return 0;
    }
    for (let i = 0; i < count; i++) {
      const key = candidates[Math.floor(Math.random() * candidates.length)];
      this.spawn(key, this.randomPosition());
    }
    return this.monsters.length;
  }

  spawn(typeKey, position) {
    const m = new Monster(typeKey, position || this.randomPosition());
    this.monsters.push(m);
    if (this.scene) this.scene.add(m.mesh);
    return m;
  }

  /**
   * Injeta a função de altura do terreno (unidades de mundo, y-up do jogo).
   * Prioridade recomendada (decisão mesh review TODO#3): scene.terrainHeightAt
   * (alturas OZB REAIS) com fallback mapManager.getHeightAt (procedural).
   */
  setTerrainHeight(fn) { this._terrainHeight = fn; }
  setTerrainLight(fn) { this._terrainLight = fn; }

  /**
   * Spawna monstros REAIS do viewport do servidor (0x13 ReceiveCreateMonsterViewport).
   * Dedup por key (viewport re-envia); primeira leva limpa os client-side
   * (spawnInitial é só p/ modo desconectado — servidor autoritativo, política
   * 0 simulação). Tile→mundo: mesh MuTerrain centrado (MAP_SIZE/2=12800):
   *   three.x = (tileX+0.5)×100 − 12800 | three.z = 12800 − (tileY+0.5)×100
   * Yaw: PC Angle[2] = ((Path>>4)−1)×45° (MU Z-up, 0=norte tile−y);
   *   three rotation.y = π + rad(angle) (modelo forward = −Z pós applyMuUpAxis).
   * @param {Array<{key,type,x,y,dir,buffs}>} list decodificado pelo MUPacketRouter
   */
  spawnFromServer(list) {
    if (!Array.isArray(list) || list.length === 0) return 0;
    if (!this._serverByKey) this._serverByKey = new Map();
    // primeira leva do servidor: descarta os client-side (demo/offline)
    if (!this._serverAssumed && this.monsters.some((m) => !m.serverDriven)) {
      this.clearClientSide();
      this._serverAssumed = true;
    }
    let created = 0;
    for (const e of list) {
      if (!e || !Number.isInteger(e.key) || !Number.isInteger(e.type)) continue;
      if (this._serverByKey.has(e.key)) continue; // dedup: viewport re-envia
      try {
        const pos = new THREE.Vector3(
            (e.x + 0.5) * 100 - 12800,
            0,
            12800 - (e.y + 0.5) * 100,
        );
        const semanticKind = classifyViewportActor(e.type, { viewportKind: e.viewportKind ?? 0, customType: e.customType ?? customMonsterType(e.type) });
        const m = new Monster(e.type, pos, {
          serverDriven: true, serverKey: e.key, serverTileX: e.x, serverTileY: e.y,
          semanticKind, viewportKind: e.viewportKind ?? 0, ownerKey: e.ownerKey ?? null, buffs: e.buffs || [],
        });
        // Use the same Main-5.2 direction -> Three yaw owner as hero and
        // remote players. The old local π-angle bridge mirrored the X axis and
        // also disagreed with D4/0x18 after spawn. `rotation` is the final
        // server-facing yaw for serverDriven monsters; Monster._initRealModel
        // preserves it when the async BMD finishes loading.
        m.rotation.y = muDirectionToThreeYaw(e.dir ?? ((e.path >> 4) & 7));
        m.mesh.rotation.set(0, m.rotation.y, 0);
        this.monsters.push(m);
        this._serverByKey.set(e.key, m);
        if (this.scene) this.scene.add(m.mesh);
        created++;
      } catch (err) {
        // classe sem monstro real correspondente → erro explícito, sem inventar
        console.error(`[MonsterManager] spawn servidor falhou (type=${e.type}): ${err.message}`);
      }
    }
    return created;
  }

  /** Remove monstros do servidor por key (0x14 DeleteViewport). */
  removeByServerKeys(keys) {
    if (!this._serverByKey || !Array.isArray(keys)) return 0;
    let removed = 0;
    for (const { key } of keys) {
      const m = this._serverByKey.get(key);
      if (!m) continue;
      const idx = this.monsters.indexOf(m);
      if (idx >= 0) this.monsters.splice(idx, 1);
      if (this.scene) this.scene.remove(m.mesh);
      this._serverByKey.delete(key);
      removed++;
    }
    return removed;
  }

  /** Descarta os monstros client-side (quando o servidor assume o viewport). */
  clearClientSide() {
    this.monsters = this.monsters.filter((m) => {
      if (m.serverDriven) return true;
      if (this.scene) this.scene.remove(m.mesh);
      return false;
    });
  }

  updateAll(dt, playerPos, player = null) {
    for (const m of this.monsters) {
      // Chão real ANTES do updateAI (que copia position→mesh): monstro apoia
      // na altura do terreno (OZB real via scene.terrainHeightAt; fallback
      // procedural getHeightAt) — mesmo critério do player (review TODO#3).
      if (this._terrainHeight && m.isAlive()) {
        m.position.y = this._terrainHeight(m.position.x, m.position.z);
      }
      if (this._terrainLight && m.isAlive()) {
        const c = this._terrainLight(m.position.x, m.position.z, m._terrainBodyLight);
        if (c) m.setBodyLight(c);
      }
      m.updateAI(dt, playerPos);

      // Entidade de viewport real: o GS e o unico owner de ataque, morte e
      // respawn. O cliente apenas apresenta posicao/action/dano recebidos.
      if (m.serverDriven) continue;

      // Offline/debug only. Nunca roda para monstros do servidor.
      if (m.shouldRespawn()) m.respawn();
      if (m.aiState === 'attack' && player && player.isAlive && player.isAlive()) {
        const atk = m.tryAttack(player);
        if (atk) {
          const res = player.takeDamage(atk.damage, m);
          if (this.onMonsterAttack) this.onMonsterAttack(m, player, res);
        }
      }
    }
  }

  /**
   * Damage a monster; handles kill reward callback.
   */
  damageMonster(monster, amount, attacker) {
    // Viewport do GS e fail-closed contra dano local. O unico caminho valido
    // para alterar HP/death e o RX autoritativo 0x11 (GameApp.onAttack).
    if (monster?.serverDriven) {
      return { damage: 0, dealt: 0, killed: false, serverAuthoritative: true };
    }
    const res = monster.takeDamage(amount, attacker);
    if (res.killed && this.onMonsterDeath) this.onMonsterDeath(monster, attacker);
    return res;
  }

  /**
   * Nearest living monster to pos within range; null if none.
   */
  queryNearestMonster(pos, range = Infinity) {
    let best = null;
    let bestD = range;
    for (const m of this.monsters) {
      if (!m.isAlive() || !m.isAttackable?.()) continue;
      const d = m.position.distanceTo(pos);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }

  queryNearestNpc(pos, range = Infinity) {
    let best = null;
    let bestD = range;
    for (const actor of this.monsters) {
      if (!actor?.isNpc?.()) continue;
      const d = actor.position.distanceTo(pos);
      if (d < bestD) { bestD = d; best = actor; }
    }
    return best;
  }

  /**
   * Actor sob o cursor. O PC escolhe o actor apontado pelo mouse; usar o
   * monstro mais próximo do herói fazia clicar em A e atacar B.
   * Raycast recursivo usa somente meshes BMD reais já presentes no viewport.
   */
  pickFromPointer(clientX, clientY, camera, domElement, heroPos = null, range = Infinity) {
    if (!camera || !domElement?.getBoundingClientRect) return null;
    const roots = [];
    const ownerByRoot = new Map();
    for (const m of this.monsters) {
      if (!m?.mesh || !m.isAlive()) continue;
      if (heroPos && Number.isFinite(range) && m.position.distanceTo(heroPos) > range) continue;
      roots.push(m.mesh);
      ownerByRoot.set(m.mesh, m);
    }
    if (!roots.length) return null;

    const rect = domElement.getBoundingClientRect();
    const width = Math.max(1, rect.width || 1);
    const height = Math.max(1, rect.height || 1);
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / width) * 2 - 1,
      -((clientY - rect.top) / height) * 2 + 1,
    );
    const raycaster = this._pointerRaycaster || (this._pointerRaycaster = new THREE.Raycaster());
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(roots, true);
    for (const hit of hits) {
      let node = hit.object;
      while (node) {
        const owner = ownerByRoot.get(node);
        if (owner) return owner;
        node = node.parent;
      }
    }
    return null;
  }

  queryMonstersInRange(pos, range) {
    return this.monsters.filter((m) => m.isAlive() && m.position.distanceTo(pos) <= range);
  }

  /** Lookup O(1) do actor server-driven usado por ReceiveMagic/Attack. */
  getByServerKey(key) {
    return this._serverByKey?.get?.(key) || null;
  }

  aliveCount() { return this.monsters.filter((m) => m.isAlive()).length; }

  clear() {
    for (const m of this.monsters) if (this.scene) this.scene.remove(m.mesh);
    this.monsters = [];
    if (this._serverByKey) this._serverByKey.clear();
    this._serverAssumed = false;
  }

  serialize() {
    return { areaSize: this.areaSize, monsters: this.monsters.map((m) => m.serialize()) };
  }

  restore(data) {
    this.clear();
    for (const md of data.monsters || []) {
      const m = Monster.deserialize(md);
      this.monsters.push(m);
      if (this.scene) this.scene.add(m.mesh);
    }
  }
}
