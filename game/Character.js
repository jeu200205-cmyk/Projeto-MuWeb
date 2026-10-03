import * as THREE from 'three';
import { worldVectorToThreeYaw } from './MUDirection.js';

export const Classes = { DK: 0, DW: 1, ELF: 2, MG: 3, DL: 4, SUMMONER: 5, RF: 6 };

const CLASS_BASE = {
  [Classes.DK]:       { str: 28, agi: 20, vit: 25, ene: 10, cmd: 0,  hpPerVit: 3, mpPerEne: 1 },
  [Classes.DW]:       { str: 18, agi: 18, vit: 15, ene: 30, cmd: 0,  hpPerVit: 1, mpPerEne: 2 },
  [Classes.ELF]:      { str: 22, agi: 25, vit: 20, ene: 15, cmd: 0,  hpPerVit: 2, mpPerEne: 2 },
  [Classes.MG]:       { str: 26, agi: 26, vit: 26, ene: 26, cmd: 0,  hpPerVit: 2, mpPerEne: 2 },
  [Classes.DL]:       { str: 26, agi: 26, vit: 20, ene: 20, cmd: 25, hpPerVit: 2, mpPerEne: 2 },
  [Classes.SUMMONER]: { str: 21, agi: 21, vit: 18, ene: 23, cmd: 0,  hpPerVit: 2, mpPerEne: 3 },
  [Classes.RF]:       { str: 32, agi: 27, vit: 25, ene: 10, cmd: 0,  hpPerVit: 3, mpPerEne: 1 },
};

function expForLevel(level) { return Math.floor(100 * Math.pow(level, 1.8)); }

export class Character {
  constructor({ name = 'Hero', classId = Classes.DK, level = 1, points = 0 } = {}) {
    this.name = name;
    this.classId = classId;
    this.level = level;
    this.experience = 0;
    this.points = points;

    const base = CLASS_BASE[classId] || CLASS_BASE[Classes.DK];
    this.stats = { str: base.str, agi: base.agi, vit: base.vit, ene: base.ene, cmd: base.cmd };
    this._hpPerVit = base.hpPerVit;
    this._mpPerEne = base.mpPerEne;
    this._bonus = { def: 0, dmg: 0, defRate: 0, maxSD: 0 }; // buff modifiers

    this.position = new THREE.Vector3();
    this.rotation = new THREE.Euler();
    this.velocity = new THREE.Vector3();
    this.targetPos = null;
    this.respawnPosition = new THREE.Vector3();

    this.calculateStats();
    this.hp = this.maxHP;
    this.mp = this.maxMP;
    this.sd = this.maxSD;
  }

  calculateStats() {
    const { str, agi, vit, ene } = this.stats;
    const b = this._bonus;
    const lvl = this.level;
    this.maxHP = Math.floor(30 + lvl * 2 + vit * this._hpPerVit);
    this.maxMP = Math.floor((ene * this._mpPerEne + lvl) * 1.2);
    this.maxSD = Math.floor((lvl * 1.2) + (str + agi + vit + ene) * 0.3 + b.maxSD);
    this.defense = Math.floor(agi / 4 + b.def);
    this.defenseRate = Math.floor(agi / 3 + b.defRate);
    this.attackDamageMin = Math.floor(str / 6 + ene / 10 + b.dmg);
    this.attackDamageMax = Math.floor(str / 4 + ene / 8 + b.dmg);
    this.attackDamage = this.attackDamageMax;
    this.attackRate = Math.floor(lvl * 5 + agi * 1.5 + str / 4);
    this.moveSpeed = Math.min(2.0, 0.4 + agi / 400);
    this.critChance = Math.min(0.3, this.stats.cmd / 1000);
  }

  addStatPoints(map) {
    for (const k of ['str', 'agi', 'vit', 'ene', 'cmd']) {
      const n = map[k] || 0;
      if (n <= 0) continue;
      if (n > this.points) return false;
      this.stats[k] += n;
      this.points -= n;
    }
    this.calculateStats();
    this.hp = Math.min(this.hp, this.maxHP);
    return true;
  }

  levelUp() {
    this.level++;
    this.points += 5;
    this.calculateStats();
    this.hp = this.maxHP;
    this.mp = this.maxMP;
    this.sd = this.maxSD;
    return this.level;
  }

  gainExp(amount) {
    this.experience += Math.max(0, Math.floor(amount));
    let ups = 0;
    while (this.experience >= expForLevel(this.level)) {
      this.experience -= expForLevel(this.level);
      this.levelUp();
      ups++;
    }
    return ups;
  }

  expToNextLevel() { return expForLevel(this.level); }

  getHitChance(attacker) {
    const rate = attacker.attackRate;
    const defRate = this.defenseRate;
    return Math.max(0.1, Math.min(0.95, rate / (rate + defRate + 1)));
  }

  takeDamage(amount, source) {
    if (!this.isAlive()) return { dealt: 0, miss: false, killed: false };
    let dealt = Math.max(1, Math.floor(amount - this.defense));
    let miss = false;
    if (source && source.attackRate !== undefined && Math.random() > this.getHitChance(source)) {
      dealt = 0;
      miss = true;
    }
    if (dealt > 0) {
      if (this.sd > 0) {
        const sdPart = Math.min(this.sd, Math.floor(dealt * 0.9));
        this.sd -= sdPart;
        dealt -= sdPart;
      }
      this.hp = Math.max(0, this.hp - dealt);
    }
    return { dealt, miss, killed: this.hp <= 0 };
  }

  heal(amount) {
    if (!this.isAlive()) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHP, this.hp + Math.floor(amount));
    return this.hp - before;
  }

  isAlive() { return this.hp > 0; }

  update(dt) {
    if (this.targetPos) {
      const dir = this.targetPos.clone().sub(this.position);
      dir.y = 0;
      const dist = dir.length();
      if (dist < 0.5) {
        this.targetPos = null;
        this.velocity.set(0, 0, 0);
      } else {
        dir.normalize();
        this.rotation.y = worldVectorToThreeYaw(dir.x, dir.z, this.rotation.y);
        this.velocity.copy(dir).multiplyScalar(this.moveSpeed * 3);
        this.position.addScaledVector(this.velocity, dt);
      }
    }
  }

  serialize() {
    return {
      name: this.name, classId: this.classId, level: this.level,
      experience: this.experience, points: this.points, stats: { ...this.stats },
      hp: this.hp, mp: this.mp, sd: this.sd,
      position: [this.position.x, this.position.y, this.position.z],
    };
  }

  static deserialize(data) {
    const c = new Character({ name: data.name, classId: data.classId, level: data.level });
    c.experience = data.experience || 0;
    c.points = data.points || 0;
    Object.assign(c.stats, data.stats || {});
    c.calculateStats();
    c.hp = Math.min(data.hp ?? c.maxHP, c.maxHP);
    c.mp = Math.min(data.mp ?? c.maxMP, c.maxMP);
    c.sd = Math.min(data.sd ?? c.maxSD, c.maxSD);
    if (data.position) c.position.set(data.position[0], data.position[1], data.position[2]);
    return c;
  }
}
