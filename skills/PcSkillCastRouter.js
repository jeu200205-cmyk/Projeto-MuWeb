// skills/PcSkillCastRouter.js — roteamento TX de skills baseado no owner PC.
//
// Autoridade materializada:
//   - ZzzInterface.cpp::AttackKnight / SkillWarrior / UseSkillWarrior
//   - ZzzInterface.cpp::UseSkillWizard
//   - ZzzInterface.cpp::AttackElf / SkillElf / UseSkillElf
//   - SkillManager.cpp / SkillManager.h master-family mapping
//   - ZzzAI.cpp::CreateAngle / CalcTargetPos
//   - wsclientinline.h::GetDestValue / SendRequestMagic / SendRequestMagicContinue
//
// Regra de produção: só famílias com owner explícito entram aqui. Skill sem
// owner retorna null (fail-closed); nunca existe fallback 0xDB inventado.

import { AT_SKILL } from '../data/SkillNames.js';

function inMasterFamily(type, base) {
  return Number.isInteger(type) && Number.isInteger(base) && type >= base && type <= base + 4;
}

const WARRIOR_TARGET_MAGIC = new Set([
  AT_SKILL.SWORD1,
  AT_SKILL.SWORD2,
  AT_SKILL.SWORD3,
  AT_SKILL.SWORD4,
  AT_SKILL.SWORD5,
  AT_SKILL.ONETOONE, // Death Stab — UseSkillWarrior -> SendRequestMagic(target)
  AT_SKILL.SPEAR,    // Impale — UseSkillWarrior -> SendRequestMagic(target)
]);

// B101 ZzzInterface.cpp::UseSkillWizard target-magic subset. These all use
// SendRequestMagic(type,targetKey) after CheckTile + CheckWall.
const WIZARD_TARGET_MAGIC = new Set([
  AT_SKILL.POISON,
  AT_SKILL.METEO,
  AT_SKILL.THUNDER,
  AT_SKILL.ENERGYBALL,
  AT_SKILL.POWERWAVE,
  AT_SKILL.SLOW,
  AT_SKILL.FIREBALL,
  AT_SKILL.JAVELIN,
  AT_SKILL.DEATH_CANNON,
]);

const ELF_DIRECT_TARGET_MAGIC = new Set([
  AT_SKILL.PARALYZE,
  AT_SKILL.DEEPIMPACT,
]);

const SELF_MAGIC = new Set([
  AT_SKILL.BLOCKING,
  AT_SKILL.VITALITY,
  AT_SKILL.INFINITY_ARROW,
  AT_SKILL.IMPROVE_AG,
]);

function isWizardHellFire(type) {
  return type === AT_SKILL.HELL || inMasterFamily(type, AT_SKILL.HELL_FIRE_UP);
}

function isWizardIceContinue(type) {
  return type === AT_SKILL.BLAST_POISON || type === AT_SKILL.BLAST_FREEZE || inMasterFamily(type, AT_SKILL.ICE_UP);
}

function isWizardLightningShock(type) {
  return type === AT_SKILL.LIGHTNING_SHOCK || inMasterFamily(type, AT_SKILL.LIGHTNING_SHOCK_UP);
}

function isElfSupportMagic(type) {
  return type === AT_SKILL.HEALING
    || type === AT_SKILL.DEFENSE
    || type === AT_SKILL.ATTACK
    || type === AT_SKILL.RECOVER
    || inMasterFamily(type, AT_SKILL.HEAL_UP)
    || inMasterFamily(type, AT_SKILL.DEF_POWER_UP)
    || inMasterFamily(type, AT_SKILL.ATT_POWER_UP);
}

function isTargetMagic(type) {
  return WARRIOR_TARGET_MAGIC.has(type)
    || WIZARD_TARGET_MAGIC.has(type)
    || ELF_DIRECT_TARGET_MAGIC.has(type)
    || inMasterFamily(type, AT_SKILL.BLOW_UP);
}

function isSelfMagic(type) {
  return SELF_MAGIC.has(type) || inMasterFamily(type, AT_SKILL.LIFE_UP);
}

function continueFamily(type) {
  if (type === AT_SKILL.WHEEL
      || inMasterFamily(type, AT_SKILL.TORNADO_SWORDA_UP)
      || inMasterFamily(type, AT_SKILL.TORNADO_SWORDB_UP)) return 'wheel';
  if (type === AT_SKILL.FURY_STRIKE || inMasterFamily(type, AT_SKILL.ANGER_SWORD_UP)) return 'fury';
  if (type === AT_SKILL.BLOW_OF_DESTRUCTION) return 'blow';
  if (type === AT_SKILL.CROSSBOW || inMasterFamily(type, AT_SKILL.MANY_ARROW_UP)) return 'elf-crossbow';
  if (type === AT_SKILL.PIERCING) return 'elf-piercing';
  if (type === AT_SKILL.BLAST_CROSSBOW4) return 'elf-blast-crossbow4';
  if (type === AT_SKILL.MULTI_SHOT) return 'elf-multi-shot';
  if (isWizardHellFire(type)) return 'wizard-hellfire';
  if (type === AT_SKILL.INFERNO) return 'wizard-inferno';
  if (type === AT_SKILL.FLASH) return 'wizard-flash';
  if (type === AT_SKILL.FLAME) return 'wizard-flame';
  if (isWizardIceContinue(type)) return 'wizard-ice';
  if (isWizardLightningShock(type)) return 'wizard-lightning-shock';
  return null;
}

function finitePoint(p) {
  return p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.z));
}

/** Web world -> tile MU. Three.z é o inverso do MU-y. */
export function webPointToPcTile(point) {
  if (!finitePoint(point)) return null;
  const x = Math.max(0, Math.min(255, Math.floor((Number(point.x) + 12800) / 100)));
  const y = Math.max(0, Math.min(255, Math.floor((12800 - Number(point.z)) / 100)));
  return { x, y };
}

/** Porte 1:1 de ZzzAI.cpp::CreateAngle, usando pontos no espaço Web. */
export function pcCreateAngleDegrees(from, to) {
  if (!finitePoint(from) || !finitePoint(to)) return null;
  const nx2 = Number(to.x) - Number(from.x);
  // PC usa +Y de mapa; Web usa -Z para o mesmo eixo.
  const ny2 = -(Number(to.z) - Number(from.z));
  if (Math.abs(nx2) < 0.0001) return ny2 < 0 ? 0 : 180;
  if (Math.abs(ny2) < 0.0001) return nx2 < 0 ? 270 : 90;
  const angle = Math.atan(ny2 / nx2) / Math.PI * 180 + 90;
  return nx2 < 0 ? angle + 180 : angle;
}

/** Cast BYTE de (Angle/360*256) usado por BK e bow/piercing. */
export function pcAngleByte256(angleDegrees) {
  if (!Number.isFinite(Number(angleDegrees))) return null;
  return Math.trunc((Number(angleDegrees) / 360) * 256) & 0xFF;
}

/** Cast BYTE de (Angle/360*255) usado pelo owner Elf Multi/Blast. */
export function pcAngleByte255(angleDegrees) {
  if (!Number.isFinite(Number(angleDegrees))) return null;
  return Math.trunc((Number(angleDegrees) / 360) * 255) & 0xFF;
}

/** Cast BYTE de (((Angle+180)/360)*255), exatamente AttackElf/SkillElf. */
export function pcRearAngleByte255(angleDegrees) {
  if (!Number.isFinite(Number(angleDegrees))) return null;
  return Math.trunc(((Number(angleDegrees) + 180) / 360) * 255) & 0xFF;
}

/** SendCharacterMove(PathNum=1): ((Angle+22.5)/360*8 + 1) % 8. */
export function pcFacingDirection8(angleDegrees) {
  if (!Number.isFinite(Number(angleDegrees))) return null;
  const raw = Math.trunc(((Number(angleDegrees) + 22.5) / 360) * 8 + 1);
  return ((raw % 8) + 8) % 8;
}

/**
 * Porte 1:1 de wsclientinline.h::GetDestValue.
 * Cada delta é clampado em [-8,7], então empacotado em dois nibbles.
 */
export function pcGetDestValue(fromTile, toTile) {
  if (!fromTile || !toTile || !Number.isInteger(fromTile.x) || !Number.isInteger(fromTile.y)
      || !Number.isInteger(toTile.x) || !Number.isInteger(toTile.y)) return null;
  let dx = toTile.x - fromTile.x;
  let dy = toTile.y - fromTile.y;
  dx = Math.max(-8, Math.min(7, dx));
  dy = Math.max(-8, Math.min(7, dy));
  return ((((dx + 8) & 0x0F) << 4) | ((dy + 8) & 0x0F)) & 0xFF;
}

/**
 * Porte 1:1 de ZzzAI.cpp::CalcTargetPos:
 *   dx = BYTE(8 + TargetX - PositionX)
 *   dy = BYTE(8 + TargetY - PositionY)
 *   return BYTE(dx | (dy << 4))
 */
export function pcCalcTargetPos(from, to) {
  const a = webPointToPcTile(from);
  const b = webPointToPcTile(to);
  if (!a || !b) return null;
  const dx = (8 + b.x - a.x) & 0xFF;
  const dy = (8 + b.y - a.y) & 0xFF;
  return (dx | (dy << 4)) & 0xFF;
}

function validKey(v, allowFFFF = false) {
  return Number.isInteger(v) && v >= 0 && v <= (allowFFFF ? 0xFFFF : 0x7FFF);
}

function isPlayerTarget(target) {
  return target?.kind === 'player' || target?.kind === 'hero' || target?.isPlayer === true;
}

/**
 * Constrói somente o REQUEST lógico; o transporte fica em RealMUProtocol.
 * Retornos:
 *   { kind:'magic', type, key }
 *   { kind:'continue', type,x,y,angle,dest,tpos,targetKey,skillSerial }
 *   null => owner desta família ainda não auditado/portado.
 */
export function buildPcSkillCastRequest({
  skillType,
  heroKey,
  heroTile,
  heroPosition,
  heroFacingDegrees = null,
  target = null,
  groundPoint = null,
} = {}) {
  const type = Number(skillType);
  if (!Number.isInteger(type) || type <= 0 || type > 0xFFFF) return null;

  // AttackWizard early owners: these bypass the generic target/wall lane.
  if (type === AT_SKILL.BLAST_HELL_BEGIN) {
    if (!validKey(heroKey)) return null;
    return { kind:'magic', type, key:heroKey, owner:'PC:AttackWizard/BLAST_HELL_BEGIN-self-0x19' };
  }
  if (type === AT_SKILL.BLAST_HELL) {
    if (!validKey(heroKey)) return null;
    const key = validKey(target?.serverKey) ? target.serverKey : heroKey;
    return { kind:'magic', type, key, owner:'PC:AttackWizard/BLAST_HELL-target-or-self-0x19' };
  }

  // AttackElf: Heal/Defense/Attack (+ masters) and Recover target a selected
  // player; with no player selected, the same skill is sent to HeroKey.
  if (isElfSupportMagic(type)) {
    if (!validKey(heroKey)) return null;
    const targetKey = isPlayerTarget(target) && validKey(target?.serverKey) ? target.serverKey : heroKey;
    return {
      kind: 'magic', type, key: targetKey,
      owner: type === AT_SKILL.RECOVER
        ? 'PC:AttackElf/RECOVER-player-or-self-0x19'
        : 'PC:AttackElf/ELF_SUPPORT-player-or-self-0x19',
    };
  }

  if (isSelfMagic(type)) {
    if (!validKey(heroKey)) return null;
    let owner = 'PC:self-0x19';
    if (inMasterFamily(type, AT_SKILL.LIFE_UP)) owner = 'PC:AttackKnight/LIFE_UP-self-0x19';
    else if (type === AT_SKILL.INFINITY_ARROW) owner = 'PC:AttackElf/INFINITY_ARROW-self-0x19';
    else if (type === AT_SKILL.IMPROVE_AG) owner = 'PC:AttackElf/IMPROVE_AG-self-0x19';
    return { kind: 'magic', type, key: heroKey, owner };
  }

  if (isTargetMagic(type)) {
    const key = target?.serverKey;
    if (!validKey(key)) return null;
    const owner = inMasterFamily(type, AT_SKILL.BLOW_UP)
      ? 'PC:SkillWarrior/BLOW_UP-target-0x19'
      : type === AT_SKILL.ONETOONE
        ? 'PC:SkillWarrior/DEATH_STAB-target-0x19'
        : type === AT_SKILL.SPEAR
          ? 'PC:SkillWarrior/IMPALE-target-0x19'
          : type === AT_SKILL.DEATH_CANNON
            ? 'PC:UseSkillWizard/DEATH_CANNON-target-0x19'
            : ELF_DIRECT_TARGET_MAGIC.has(type)
              ? 'PC:UseSkillElf/PARALYZE_DEEPIMPACT-target-0x19'
              : WIZARD_TARGET_MAGIC.has(type)
                ? 'PC:UseSkillWizard/basic-target-0x19'
                : 'PC:target-0x19';
    return { kind: 'magic', type, key, owner };
  }

  const family = continueFamily(type);
  if (!family) return null;
  if (!heroTile || !Number.isInteger(heroTile.x) || !Number.isInteger(heroTile.y)) return null;
  if (!finitePoint(heroPosition)) return null;

  // Hell/Hellfire and Inferno use the caster's current facing and tile; no mouse target is required.
  if (family === 'wizard-hellfire' || family === 'wizard-inferno') {
    if (!Number.isFinite(Number(heroFacingDegrees))) return null;
    const angle = pcAngleByte256(Number(heroFacingDegrees));
    if (angle == null) return null;
    return { kind:'continue', type, x:heroTile.x&0xFF, y:heroTile.y&0xFF, angle, dest:0, tpos:0, targetKey:0xFFFF, skillSerial:0,
      owner: family === 'wizard-inferno' ? 'PC:AttackWizard/INFERNO-0x1E' : 'PC:AttackWizard/HELL_HELLFIRE-0x1E' };
  }

  const point = finitePoint(target?.position) ? target.position : groundPoint;
  if (!finitePoint(point)) return null;

  const targetTile = (Number.isInteger(target?.serverTileX) && Number.isInteger(target?.serverTileY))
    ? { x: target.serverTileX & 0xFF, y: target.serverTileY & 0xFF }
    : webPointToPcTile(point);
  if (!targetTile) return null;

  const angleDeg = pcCreateAngleDegrees(heroPosition, point);
  if (angleDeg == null) return null;
  const targetKey = validKey(target?.serverKey, true) ? target.serverKey : 0xFFFF;

  // AttackKnight owners.
  if (family === 'wheel' || family === 'fury' || family === 'blow') {
    const angle = pcAngleByte256(angleDeg);
    if (angle == null) return null;
    const tpos = family === 'wheel' ? 0 : pcCalcTargetPos(heroPosition, point);
    if (tpos == null) return null;
    const x = family === 'blow' ? targetTile.x : (heroTile.x & 0xFF);
    const y = family === 'blow' ? targetTile.y : (heroTile.y & 0xFF);

    let owner = 'PC:AttackKnight/BLOW_OF_DESTRUCTION-0x1E';
    if (family === 'wheel') owner = type === AT_SKILL.WHEEL
      ? 'PC:AttackKnight/WHEEL-0x1E'
      : 'PC:AttackKnight/TORNADO_MASTER-0x1E';
    else if (family === 'fury') owner = type === AT_SKILL.FURY_STRIKE
      ? 'PC:AttackKnight/FURY-0x1E'
      : 'PC:AttackKnight/ANGER_MASTER-0x1E';

    const req = { kind: 'continue', type, x, y, angle, dest: 0, tpos, targetKey, skillSerial: 0, owner };
    if (family === 'wheel') {
      const dir = pcFacingDirection8(angleDeg);
      if (dir == null) return null;
      Object.defineProperty(req, 'preFacing', { enumerable:false, value:{ x:heroTile.x&0xFF, y:heroTile.y&0xFF, dir, angleDegrees:angleDeg, owner:'PC:SendCharacterMove/PathNum1' } });
    }
    return req;
  }

  // Elf item/bow owners recovered from SkillElf/AttackElf.
  if (family === 'elf-crossbow' || family === 'elf-piercing') {
    const angle = pcAngleByte256(angleDeg);
    if (angle == null) return null;
    return {
      kind: 'continue', type,
      x: heroTile.x & 0xFF, y: heroTile.y & 0xFF,
      angle, dest: 0, tpos: 0, targetKey, skillSerial: 0,
      owner: family === 'elf-piercing'
        ? 'PC:AttackElf/PIERCING-0x1E'
        : (type === AT_SKILL.CROSSBOW
          ? 'PC:SkillElf/CROSSBOW-0x1E'
          : 'PC:SkillElf/MANY_ARROW_MASTER-0x1E'),
    };
  }

  if (family === 'elf-blast-crossbow4' || family === 'elf-multi-shot') {
    const angle = pcAngleByte255(angleDeg);
    const dest = pcGetDestValue(heroTile, targetTile);
    const tpos = pcRearAngleByte255(angleDeg);
    if (angle == null || dest == null || tpos == null) return null;
    const req = {
      kind: 'continue', type,
      x: heroTile.x & 0xFF, y: heroTile.y & 0xFF,
      angle, dest, tpos, targetKey, skillSerial: 0,
      owner: family === 'elf-multi-shot'
        ? 'PC:AttackElf/MULTI_SHOT-0x1E'
        : 'PC:SkillElf/BLAST_CROSSBOW4-0x1E',
    };
    if (family === 'elf-multi-shot') {
      const dir = pcFacingDirection8(angleDeg);
      if (dir == null) return null;
      Object.defineProperty(req, 'preFacing', { enumerable:false, value:{ x:heroTile.x&0xFF, y:heroTile.y&0xFF, dir, angleDegrees:angleDeg, owner:'PC:SendCharacterMove/PathNum1' } });
    }
    return req;
  }

  if (family === 'wizard-flash' || family === 'wizard-flame' || family === 'wizard-ice' || family === 'wizard-lightning-shock') {
    const use255 = family === 'wizard-lightning-shock';
    const angle = use255 ? pcAngleByte255(angleDeg) : pcAngleByte256(angleDeg);
    if (angle == null) return null;
    let x = heroTile.x & 0xFF, y = heroTile.y & 0xFF, dest = 0, tpos = 0, key = 0xFFFF;
    if (family === 'wizard-flame' || family === 'wizard-ice') { x=targetTile.x; y=targetTile.y; }
    if (family === 'wizard-ice') key=targetKey;
    if (family === 'wizard-lightning-shock') {
      dest=pcGetDestValue(heroTile,targetTile); tpos=pcRearAngleByte255(angleDeg); key=targetKey;
      if (dest == null || tpos == null) return null;
    }
    const owner = family === 'wizard-flash' ? 'PC:AttackWizard/FLASH-0x1E'
      : family === 'wizard-flame' ? 'PC:AttackWizard/FLAME-0x1E'
      : family === 'wizard-ice' ? 'PC:AttackWizard/BLAST_POISON_ICE_FREEZE-0x1E'
      : 'PC:AttackWizard/LIGHTNING_SHOCK-0x1E';
    const req={kind:'continue',type,x,y,angle,dest,tpos,targetKey:key,skillSerial:0,owner};
    if (family === 'wizard-lightning-shock') {
      const dir=pcFacingDirection8(angleDeg); if(dir==null)return null;
      Object.defineProperty(req, 'preFacing', { enumerable:false, value:{x:heroTile.x&0xFF,y:heroTile.y&0xFF,dir,angleDegrees:angleDeg,owner:'PC:SendCharacterMove/PathNum1'} });
    }
    return req;
  }

  return null;
}

/** Clean PC MOVEMENT_SKILL families. */
export function isPcWarriorApproachSkill(skillType) {
  const type = Number(skillType);
  return WARRIOR_TARGET_MAGIC.has(type) || inMasterFamily(type, AT_SKILL.BLOW_UP);
}

export function isPcWizardApproachSkill(skillType) {
  const type=Number(skillType);
  return WIZARD_TARGET_MAGIC.has(type)
    || type === AT_SKILL.FLASH || type === AT_SKILL.FLAME
    || isWizardIceContinue(type) || isWizardLightningShock(type);
}

export function isPcElfApproachSkill(skillType) {
  const type = Number(skillType);
  // AttackElf's PathFinding2 condition does not include RECOVER; it includes
  // Heal/Attack/Defense (+ their master families) and CheckAttack skills.
  const supportApproach = type === AT_SKILL.HEALING
    || type === AT_SKILL.DEFENSE
    || type === AT_SKILL.ATTACK
    || inMasterFamily(type, AT_SKILL.HEAL_UP)
    || inMasterFamily(type, AT_SKILL.DEF_POWER_UP)
    || inMasterFamily(type, AT_SKILL.ATT_POWER_UP);
  return supportApproach || ELF_DIRECT_TARGET_MAGIC.has(type);
}

/** Exact MOVEMENT_SKILL stop-distance family recovered from B101. */
export function pcSkillApproachPolicy(skillType) {
  const type = Number(skillType);
  if (isPcWarriorApproachSkill(type)) return { family: 'warrior', rangeMultiplier: 1.2, requiresWall: false };
  if (isPcWizardApproachSkill(type)) return { family: 'wizard', rangeMultiplier: 1.0, requiresWall: true };
  // AttackElf queues PathFinding2 only when SelectedCharacter is KIND_PLAYER.
  if (isPcElfApproachSkill(type)) return { family: 'elf', rangeMultiplier: 1.0, requiresWall: true, requiresPlayerTarget: true };
  return null;
}

export function hasPcSkillCastOwner(skillType) {
  const type = Number(skillType);
  return type === AT_SKILL.BLAST_HELL_BEGIN || type === AT_SKILL.BLAST_HELL || isElfSupportMagic(type) || isSelfMagic(type) || isTargetMagic(type) || continueFamily(type) !== null;
}

export function pcSkillCastFamily(skillType) {
  const type = Number(skillType);
  if (type === AT_SKILL.BLAST_HELL_BEGIN || type === AT_SKILL.BLAST_HELL) return 'wizard-blast-hell-magic';
  if (isElfSupportMagic(type)) return 'elf-support-magic';
  if (isSelfMagic(type)) return 'self-magic';
  if (ELF_DIRECT_TARGET_MAGIC.has(type)) return 'elf-target-magic';
  if (WIZARD_TARGET_MAGIC.has(type)) return 'wizard-target-magic';
  if (isTargetMagic(type)) return 'target-magic';
  return continueFamily(type);
}
