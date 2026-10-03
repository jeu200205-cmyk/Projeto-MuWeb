// skills/SkillSystem.js — aprendizado, slots e execução de skills de um Character.
// Integra com ui2/SkillBar.js (assign) e game/SkillEffects.js (efeitos visuais).
import * as THREE from 'three';
import { SKILLS, SKILL_BY_ID, getSkillsForClass } from './SkillData.js';

/**
 * class SkillSystem
 * Uso:
 *   const sys = new SkillSystem(character, { effects });
 *   sys.learn(1);
 *   sys.assignSlot(0, 1);
 *   sys.useSkill(1, targetPos); // consome MP, dispara SkillEffects e aplica resultado
 */
export class SkillSystem {
  /**
   * @param {Character} character — instância de game/Character.js
   * @param {object} [opts]
   * @param {SkillEffects} [opts.effects] — renderer de efeitos visuais (opcional)
   * @param {Function} [opts.onDamage] — (skill, amount, targetPos) hook p/ dano em monstros
   * @param {Function} [opts.onSummon] — (skill) hook p/ criar summon
   */
  constructor(character, opts = {}) {
    this.character = character;
    this.effects = opts.effects || null;
    this.onDamage = opts.onDamage || (() => {});
    this.onSummon = opts.onSummon || (() => {});

    this.knownSkills = new Set();                 // ids aprendidos
    this.slots = new Array(8).fill(null);         // id por slot da SkillBar
    this.cooldowns = new Map();                   // id -> timestamp de término (ms)
    this.activeBuffs = new Map();                 // id -> timestamp de expiração
  }

  // ------------------------------------------------------------------
  // Aprendizado
  // ------------------------------------------------------------------
  /**
   * Aprende uma skill. Valida classe e nível mínimo.
   * @returns {{ ok: boolean, reason?: string }}
   */
  learn(skillId) {
    const skill = SKILL_BY_ID.get(skillId);
    if (!skill) return { ok: false, reason: 'skill inexistente' };
    if (this.knownSkills.has(skillId)) return { ok: false, reason: 'já aprendida' };
    if (!skill.classId.includes(this.character.classId)) {
      return { ok: false, reason: 'classe incompatível' };
    }
    if (this.character.level < skill.learnLevel) {
      return { ok: false, reason: `requer nível ${skill.learnLevel}` };
    }
    this.knownSkills.add(skillId);
    return { ok: true, skill };
  }

  /** Lista skills aprendidas (objetos completos). */
  getKnownSkills() {
    return [...this.knownSkills].map((id) => SKILL_BY_ID.get(id)).filter(Boolean);
  }

  /** Skills aprendíveis por esta classe até o nível informado. */
  getAvailableSkills(level = this.character.level) {
    return getSkillsForClass(this.character.classId).filter((s) => s.learnLevel <= level);
  }

  getSkillById(skillId) { return SKILL_BY_ID.get(skillId) || null; }

  // ------------------------------------------------------------------
  // Slots (integra com ui2/SkillBar.js)
  // ------------------------------------------------------------------
  /**
   * Atribui skill conhecida ao slot (0-7). Retorna o objeto skill ou null.
   */
  assignSlot(index, skillId) {
    if (index < 0 || index > 7) return null;
    if (skillId !== null && !this.knownSkills.has(skillId)) return null;
    this.slots[index] = skillId;
    return skillId !== null ? this.getSkillById(skillId) : null;
  }

  getSlot(index) {
    const id = this.slots[index];
    return id === null ? null : this.getSkillById(id);
  }

  // ------------------------------------------------------------------
  // Cooldown
  // ------------------------------------------------------------------
  cooldownReady(skillId, now = Date.now()) {
    return now >= (this.cooldowns.get(skillId) || 0);
  }

  cooldownRemaining(skillId, now = Date.now()) {
    return Math.max(0, (this.cooldowns.get(skillId) || 0) - now);
  }

  // ------------------------------------------------------------------
  // Uso
  // ------------------------------------------------------------------
  /**
   * Usa uma skill. Consome MP, inicia cooldown, dispara efeito visual e
   * aplica o resultado conforme o tipo (attack/buff/heal/summon).
   * @param {number} skillId
   * @param {THREE.Vector3} [targetPos] — posição alvo (opcional para buff/heal)
   * @returns {{ ok: boolean, reason?: string, damage?: number }}
   */
  useSkill(skillId, targetPos = null) {
    const skill = SKILL_BY_ID.get(skillId);
    const c = this.character;
    if (!skill || !this.knownSkills.has(skillId)) return { ok: false, reason: 'não aprendida' };
    if (!this.cooldownReady(skillId)) return { ok: false, reason: 'em cooldown' };
    if (c.mp < skill.mpCost) return { ok: false, reason: 'MP insuficiente' };

    // Alcance (ataques/heals com alvo)
    const target = targetPos ? targetPos.clone() : c.position.clone();
    if (skill.range > 0 && c.position.distanceTo(target) > skill.range) {
      return { ok: false, reason: 'fora de alcance' };
    }

    // Custo + cooldown
    c.mp -= skill.mpCost;
    this.cooldowns.set(skillId, Date.now() + skill.cooldown);

    // Efeito visual pelo elemento
    this._playEffect(skill, target);

    // Resultado por tipo
    let damage = 0;
    switch (skill.type) {
      case 'attack': {
        damage = this._rollDamage(skill);
        this.onDamage(skill, damage, target);
        break;
      }
      case 'buff': {
        this._applyBuff(skill);
        break;
      }
      case 'heal': {
        const amount = Math.floor(c.maxHP * (skill.power > 0 ? skill.power : 0.25));
        c.hp = Math.min(c.maxHP, c.hp + amount);
        break;
      }
      case 'summon': {
        this.onSummon(skill, target);
        break;
      }
    }
    return { ok: true, damage };
  }

  /** Usa a skill do slot i da barra. */
  useSlot(index, targetPos = null) {
    const id = this.slots[index];
    if (id === null) return { ok: false, reason: 'slot vazio' };
    return this.useSkill(id, targetPos);
  }

  // ------------------------------------------------------------------
  // Internos
  // ------------------------------------------------------------------
  _rollDamage(skill) {
    const c = this.character;
    const base = c.attackDamageMin + Math.random() * (c.attackDamageMax - c.attackDamageMin || 1);
    return Math.floor(base * skill.power);
  }

  _applyBuff(skill) {
    const c = this.character;
    // Buffs genéricos via _bonus (mesmo mecanismo do BuffSystem)
    switch (skill.name) {
      case 'Greater Defense':
      case 'Innovation':
        c._bonus.def += 30; break;
      case 'Greater Damage':
        c._bonus.dmg += 25; break;
      case 'Swell Life':
        c.maxHP = Math.floor(c.maxHP * 1.3); c.hp = c.maxHP; break;
      case 'Critical Damage':
        c.critChance = Math.min(0.6, c.critChance + 0.15); break;
      case 'Charging':
        c._bonus.dmg += 40; break;
      case 'Berserker':
        c._bonus.dmg += 50; c._bonus.def -= 15; break;
      default:
        break;
    }
    c.calculateStats();
    this.activeBuffs.set(skill.id, Date.now() + 60000);
  }

  _playEffect(skill, target) {
    if (!this.effects) return;
    const c = this.character;
    const facing = c.rotation ? c.rotation.y : 0;
    switch (skill.element) {
      case 'fire':
        this.effects.createFireballEffect(c.position, target, {});
        break;
      case 'lightning':
        this.effects.createLightningEffect(target, {});
        break;
      case 'ice':
        this.effects.createIceEffect(target, {});
        break;
      default:
        this.effects.createSlashEffect(
          c.position.clone().add(new THREE.Vector3(0, 0, 0)), facing, {}
        );
        break;
    }
  }

  // ------------------------------------------------------------------
  // Serialização
  // ------------------------------------------------------------------
  serialize() {
    return {
      knownSkills: [...this.knownSkills],
      slots: [...this.slots],
      cooldowns: [...this.cooldowns.entries()],
    };
  }

  static deserialize(character, data, opts = {}) {
    const sys = new SkillSystem(character, opts);
    if (!data) return sys;
    for (const id of data.knownSkills || []) sys.knownSkills.add(id);
    (data.slots || []).forEach((id, i) => { sys.slots[i] = id ?? null; });
    for (const [id, ts] of data.cooldowns || []) sys.cooldowns.set(id, ts);
    return sys;
  }
}

export default SkillSystem;
