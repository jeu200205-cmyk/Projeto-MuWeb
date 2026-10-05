import * as THREE from 'three';
import { Character } from './Character.js';
import { REAL_MONSTERS } from '../data/generated/RealMonsters.js';
import { STATS_BY_CLASS } from '../data/generated/RealMonsterStats.js';
import {
    CLASS_TO_MODEL, CLASS_SCALE, RAND2_CLASSES, monsterBmdPath,
} from '../data/generated/MonsterModelMap.js';
import { VIEWPORT_KIND, isCombatViewportKind } from './ViewportActorSemantics.js';
import { customMonsterRule, customMonsterGlow } from '../data/CurrentClientMonsterOwners.js';

/**
 * Monster.js — Monstro com DADOS e MODELO REAIS (política 0 placeholder).
 *
 *  - Stats: C:\ms\Data\Monster\Monster.txt (GameServer real, 509 classes) via
 *    data/generated/RealMonsterStats.js — level/HP/dano/defesa/velocidades.
 *    ExpReward não existe no Monster.txt deste servidor → DERIVADO (level×12),
 *    documentado; o valor autoritativo vem do servidor quando conectado.
 *  - Modelo: Monster/{N}.bmd real do cliente (MonsterModel.js) via cadeia PC
 *    CreateMonster switch → OpenMonsterModel → AccessModel (ver MonsterModelMap).
 *  - Nome: PT do Npcname (84+) ou nome do servidor (clássicos 0-83).
 *  - Unidades: MESMAS do PC (TERRAIN_SCALE=100, _define.h:265). MoveSpeed do
 *    servidor (ms/célula) → u/s = 100/(ms/1000). ViewRange/AttackRange em
 *    células → ×100.
 */

function norm(s) { return String(s).toLowerCase().replace(/[\s_\-.]/g, ''); }

// Índices por nome: servidor (EN, 0-510) + Npcname PT (84+)
const _byName = new Map();
for (const e of STATS_BY_CLASS.values()) {
    const n = norm(e.name);
    if (n && !_byName.has(n)) _byName.set(n, e);
}
for (const m of REAL_MONSTERS) {
    const n = norm(m.name);
    if (n && !_byName.has(n)) _byName.set(n, STATS_BY_CLASS.get(m.monsterClass));
}

/**
 * Resolve uma chave de spawn no MONSTRO REAL correspondente.
 * Aceita: (a) número/classe numérica direta do servidor (ex.: 2 = Budge Dragon
 * do viewport 0x13), (b) nome (EN servidor ou PT Npcname), exato ou contido.
 * Chave desconhecida → null (ERRO explícito; nunca inventar monstro).
 */
export function resolveMonsterType(typeKey) {
    const asNum = Number(typeKey);
    if (Number.isInteger(asNum) && asNum >= 0 && String(typeKey).trim() !== '' && STATS_BY_CLASS.has(asNum)) {
        return statsFromReal(STATS_BY_CLASS.get(asNum));
    }
    const k = norm(typeKey);
    if (!k) return null;
    const exact = _byName.get(k);
    if (exact) return statsFromReal(exact);
    for (const [n, e] of _byName) {
        if ((n.includes(k) || k.includes(n)) && e) return statsFromReal(e);
    }
    return null;
}

function statsFromReal(entry) {
    if (!entry) return null;
    return {
        id: entry.class,                    // classe real (índice Monster.txt)
        name: entry.namePT || entry.name,   // PT quando existe (Npcname 84+)
        serverName: entry.name,
        level: entry.level,
        hp: entry.hp,
        mana: entry.mana || 0,
        dmg: [entry.dmgMin, entry.dmgMax],
        def: entry.def,
        attackRate: entry.attackRate,
        defenseRate: entry.defenseRate,
        moveRange: entry.moveRange,
        attackType: entry.attackType,
        attackRange: entry.attackRange,      // células
        viewRange: entry.viewRange,         // células
        moveSpeed: entry.moveSpeed,         // ms/célula (servidor)
        attackSpeed: entry.attackSpeed,     // ms
    };
}

// Facing: modelos MU são Z-up com forward +Y → após applyMuUpAxis (rot X −90°)
// o forward vira three −Z. AI orienta +Z ao alvo (atan2(dx,dz)) → offset π.
const MODEL_FORWARD_YAW = Math.PI;

const TERRAIN_SCALE = 100; // _define.h:265 (unidades por célula — igual ao PC)

/** monsterClass → model Type (dados gerados da source PC; rand%2 nas RAND2). */
function classToModel(monsterClass) {
    if (RAND2_CLASSES.includes(monsterClass)) return 71 + (Math.random() < 0.5 ? 1 : 0);
    return CLASS_TO_MODEL[monsterClass] ?? 0; // default do switch PC → OpenMonsterModel(0)
}

/** Object.Scale por classe (ZzzCharacter.cpp switch); 1 quando não definida. */
function classScale(monsterClass) {
    return CLASS_SCALE[monsterClass] ?? 1;
}

let nextId = 1;

export class Monster extends Character {
  constructor(typeKey, position, opts = {}) {
    const type = resolveMonsterType(typeKey);
    if (!type) {
        throw new Error(`[Monster] chave de spawn desconhecida: "${typeKey}" — nenhum monstro real correspondente (Monster.txt/Npcname)`);
    }
    super({ name: type.name, level: type.level });
    this.typeKey = typeKey;
    this.type = type;             // GameApp usa m.type?.name
    this.typeId = type.id;        // classe real do servidor (índice Monster.txt)
    this.customOwner = customMonsterRule(this.typeId);
    if (this.customOwner?.name) this.name = this.customOwner.name;
    this._terrainBodyLight = new THREE.Color(1, 1, 1);
    this._pendingBodyLight = null;
    this.monsterId = nextId++;
    this.semanticKind = opts.semanticKind || VIEWPORT_KIND.MONSTER;
    this.viewportKind = opts.viewportKind ?? 0;
    this.ownerKey = opts.ownerKey ?? null;
    this.buffs = Array.isArray(opts.buffs) ? opts.buffs.slice() : [];

    // Stats REAIS do servidor (Monster.txt)
    this.calculateStats();
    this.maxHP = type.hp;
    this.hp = type.hp;
    this.defense = type.def;
    this.attackDamageMin = type.dmg[0];
    this.attackDamageMax = type.dmg[1];
    this.attackDamage = type.dmg[1];
    this.expReward = type.level * 12; // DERIVADO (sem coluna exp no Monster.txt)
    this.moveSpeed = TERRAIN_SCALE / (type.moveSpeed / 1000 || 400); // ms/célula → u/s

    this.aiState = 'idle'; // idle | chase | attack | return | death
    this.aggroRange = (type.viewRange || 5) * TERRAIN_SCALE;
    this.attackRange = Math.max(1, type.attackRange || 1) * TERRAIN_SCALE;
    this.attackCooldown = 0;
    this.attackInterval = (type.attackSpeed || 1600) / 1000;
    this.respawnTime = 8; // DERIVADO (gameplay) — timer real é do servidor
    this.deathTimer = 0;
    this.dropTable = [
      { item: 'zen', chance: 0.9, amount: 50 + type.level * 20 },
      { item: 'potion_hp', chance: 0.2 },
      { item: 'jewel_bless', chance: 0.005 },
    ];

    this.spawnPosition = position ? position.clone() : new THREE.Vector3();
    if (position) this.position.copy(position);
    this.maxWanderDist = 15 * TERRAIN_SCALE;

    this.mesh = new THREE.Group(); // container; modelo real entra via _initRealModel
    this.mesh.position.copy(this.position);
    // serverDriven: entidade autoritativa do SERVIDOR (viewport 0x13) — sem AI
    // client-side (posição/rotação só mudam via servidor); visual continua real.
    this.serverDriven = !!opts.serverDriven;
    this.serverKey = opts.serverKey ?? null;
    // Tiles autoritativos do viewport. Mantidos separados de THREE world-space
    // para protocolos (attack/move/action) nao dependerem de arredondamento.
    this.serverTileX = Number.isInteger(opts.serverTileX) ? opts.serverTileX : null;
    this.serverTileY = Number.isInteger(opts.serverTileY) ? opts.serverTileY : null;
    this._visual = null;
    this._visualFailed = false;
    this._initRealModel();
  }

  /** Carrega o modelo BMD real assíncrono (asset-server). Falha = erro explícito. */
  async _initRealModel() {
    try {
        const visual = this.semanticKind === VIEWPORT_KIND.NPC
          ? await (await import('./NpcModel.js')).createNpcVisual(this.typeId, this.customOwner)
          : await (await import('./MonsterModel.js')).createMonsterVisual(this.typeId, this.customOwner);
        this._visual = visual;
        this.mesh.add(visual.root);
        visual.setActionFor(this.aiState);
        const glow = customMonsterGlow(this.typeId);
        if (glow) visual.setBodyLight?.(new THREE.Color(glow.r, glow.g, glow.b));
        else if (this._pendingBodyLight) visual.setBodyLight?.(this._pendingBodyLight);
        this.mesh.position.copy(this.position);
        // serverDriven.rotation is already the final Three yaw decoded from the
        // MU direction owner. Do not add MODEL_FORWARD_YAW a second time when
        // the async BMD resolves, otherwise the monster flips 180° after load.
        this.mesh.rotation.set(0, this.serverDriven ? this.rotation.y : this.rotation.y + MODEL_FORWARD_YAW, 0);
    } catch (e) {
        this._visualFailed = true;
        // modelType resolvido DENTRO do createMonsterVisual (rand por spawn);
        // o path real já vem no erro do loader (fail-closed do MUAssets.loadBMD).
        console.error(`[ViewportActor] modelo real falhou p/ classe ${this.typeId}`
            + ` kind=${this.semanticKind} (${this.type.serverName}): ${e.message}`);
    }
  }

  setBodyLight(color) {
    if (!color) return;
    this._pendingBodyLight = this._pendingBodyLight || new THREE.Color();
    this._pendingBodyLight.copy(color);
    // CustomMonsterGlow is the PC final BodyLight owner when configured.
    const glow = customMonsterGlow(this.typeId);
    if (glow) this._visual?.setBodyLight?.(new THREE.Color(glow.r, glow.g, glow.b));
    else this._visual?.setBodyLight?.(this._pendingBodyLight);
  }

  get renderer() { return this._visual?.renderer || null; }
  isNpc() { return this.semanticKind === VIEWPORT_KIND.NPC; }
  isAttackable() { return isCombatViewportKind(this.semanticKind); }

  updateAI(dt, playerPos) {
    if (this.serverDriven) {
      // Entidade do servidor (viewport 0x13): SEM AI client-side — o servidor
      // é autoritativo para posição/rotação (movimento chega em pacotes 0x14+).
      // Só atualiza o visual da entidade (posição já setada pelo spawn/update).
      if (this.mesh) this.mesh.position.copy(this.position);
      if (this._visual) this._visual.update(dt);
      return;
    }
    if (!this.isAlive()) {
      this.deathTimer -= dt;
      if (this._visual) {
        // Morte real: action DIE (loop, PlaySpeed .55 — OpenMonsterModel)
        this._visual.setActionFor('death');
        this._visual.update(dt);
      } else if (this.mesh) {
        // sem modelo carregado: sink legado de feedback (mesh vazio = invisível)
        this.mesh.position.y = Math.max(-1.5, this.mesh.position.y - dt * 0.8);
        this.mesh.rotation.x = Math.min(Math.PI / 2, this.mesh.rotation.x + dt * 0.6);
      }
      return;
    }
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    const distToPlayer = playerPos ? this.position.distanceTo(playerPos) : Infinity;

    switch (this.aiState) {
      case 'idle':
        if (distToPlayer < this.aggroRange) this.aiState = 'chase';
        break;
      case 'chase': {
        if (distToPlayer > this.aggroRange * 2.5) { this.aiState = 'return'; break; }
        if (distToPlayer <= this.attackRange) { this.aiState = 'attack'; break; }
        this.position.x += ((playerPos.x - this.position.x) / distToPlayer) * this.moveSpeed * 3 * dt;
        this.position.z += ((playerPos.z - this.position.z) / distToPlayer) * this.moveSpeed * 3 * dt;
        this.rotation.y = Math.atan2(playerPos.x - this.position.x, playerPos.z - this.position.z);
        break;
      }
      case 'attack':
        if (distToPlayer > this.attackRange * 1.3) { this.aiState = 'chase'; break; }
        // attack executes in Game loop when cooldown is 0
        break;
      case 'return': {
        const d = this.spawnPosition.clone().sub(this.position);
        d.y = 0;
        const dist = d.length();
        if (dist < 0.5) {
          this.aiState = 'idle';
          this.hp = Math.min(this.maxHP, this.hp + this.maxHP * 0.5);
        } else {
          d.normalize();
          this.position.addScaledVector(d, this.moveSpeed * 4 * dt);
          this.rotation.y = Math.atan2(d.x, d.z);
        }
        break;
      }
    }
    if (this.mesh) {
      this.mesh.position.copy(this.position);
      this.mesh.rotation.set(0, this.rotation.y + MODEL_FORWARD_YAW, 0);
    }
    if (this._visual) {
      this._visual.setActionFor(this.aiState);
      this._visual.update(dt);
    }
  }

  tryAttack(target) {
    if (!this.isAlive() || this.aiState !== 'attack' || this.attackCooldown > 0) return null;
    this.attackCooldown = this.attackInterval;
    const dmg = this.attackDamageMin + Math.random() * (this.attackDamageMax - this.attackDamageMin);
    return { target, damage: dmg };
  }

  die() {
    this.hp = 0;
    this.aiState = 'death';
    this.deathTimer = this.respawnTime;
  }

  takeDamage(amount, source) {
    const result = super.takeDamage(amount, source);
    if (result.killed && this.aiState !== 'death') this.die();
    return result;
  }

  rollDrops() {
    return this.dropTable.filter((d) => Math.random() < d.chance);
  }

  shouldRespawn() {
    return this.aiState === 'death' && this.deathTimer <= 0;
  }

  respawn() {
    this.position.copy(this.spawnPosition);
    this.calculateStats();
    this.hp = this.maxHP;
    this.sd = this.maxSD;
    this.aiState = 'idle';
    if (this.mesh) {
      this.mesh.position.copy(this.position);
      this.mesh.rotation.set(0, this.rotation.y + MODEL_FORWARD_YAW, 0);
      this.mesh.visible = true;
    }
    if (this._visual) this._visual.setActionFor('idle');
  }

  serialize() {
    return {
      ...super.serialize(),
      typeKey: this.typeKey, monsterId: this.monsterId, aiState: this.aiState,
      spawn: [this.spawnPosition.x, this.spawnPosition.y, this.spawnPosition.z],
    };
  }

  static deserialize(data) {
    const m = new Monster(data.typeKey, new THREE.Vector3(...(data.spawn || [0, 0, 0])));
    m.monsterId = data.monsterId;
    if (data.position) m.position.set(...data.position);
    m.mesh.position.copy(m.position);
    m.hp = Math.min(data.hp ?? m.maxHP, m.maxHP);
    if (data.aiState === 'death' || m.hp <= 0) { m.hp = 0; m.die(); }
    return m;
  }
}

/** Classe→model/scale expostos p/ testes/telemetria (dados gerados da source PC). */
export { classToModel, classScale, monsterBmdPath };
