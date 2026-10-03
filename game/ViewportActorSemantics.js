/**
 * ViewportActorSemantics.js — R80
 *
 * Autoridade: source PC Main 5.2 limpa enviada pelo usuário, com a tradução
 * Android já auditada contra Setting_Monster().  Nenhum dado externo/GitHub é
 * autoridade desta tabela.
 *
 * Gates recuperados da portabilidade PC->Android:
 * - 201..259 = NPC stock; 260 volta a MONSTER
 * - 367 = NPC explícito
 * - 451 = TMP explícito
 * - 480..491 = MONSTER override
 * - 0x1F summon / 0x45 transform preservam KIND_PLAYER (PLAYERLIKE)
 *
 * Tipos NPC abaixo têm apresentação comprovada pelos arquivos enviados:
 * 230/248/250 -> Man01 + partes; 253 -> Girl01 + partes;
 * 255 -> Female01 + partes; 251 -> Smith01; 254 -> Wizard01.
 * 247/249 são guards MODEL_PLAYER no PC; sem inventar equipamento aqui.
 */

export const VIEWPORT_KIND = Object.freeze({
  MONSTER: 'monster',
  NPC: 'npc',
  TMP: 'tmp',
  PLAYERLIKE: 'playerlike',
});

export function classifyViewportActor(monsterType, { viewportKind = 0, customType = null } = {}) {
  const type = Number(monsterType);
  if (viewportKind === 1 || viewportKind === 2) return VIEWPORT_KIND.PLAYERLIKE;

  // CustomMonster Type 0/1 from the supplied client data: 0 NPC, 1 monster.
  if (customType === 0) return VIEWPORT_KIND.NPC;
  if (customType === 1) return VIEWPORT_KIND.MONSTER;

  if (!Number.isInteger(type) || type < 0) return VIEWPORT_KIND.MONSTER;
  if (type === 451) return VIEWPORT_KIND.TMP;
  if (type >= 480 && type <= 491) return VIEWPORT_KIND.MONSTER;
  if (type === 367) return VIEWPORT_KIND.NPC;
  if (type >= 201 && type < 260) return VIEWPORT_KIND.NPC;
  return VIEWPORT_KIND.MONSTER;
}

export function isCombatViewportKind(kind) {
  return kind === VIEWPORT_KIND.MONSTER || kind === VIEWPORT_KIND.PLAYERLIKE;
}

const NPC_VISUAL = new Map([
  [230, { base: 'Data/Npc/Man01.bmd', parts: ['Data/Npc/ManHead01.bmd','Data/Npc/ManUpper02.bmd','Data/Npc/ManGloves02.bmd','Data/Npc/ManBoots01.bmd'] }],
  [248, { base: 'Data/Npc/Man01.bmd', parts: ['Data/Npc/ManHead02.bmd','Data/Npc/ManUpper02.bmd','Data/Npc/ManGloves02.bmd','Data/Npc/ManBoots02.bmd'] }],
  [250, { base: 'Data/Npc/Man01.bmd', parts: ['Data/Npc/ManHead01.bmd','Data/Npc/ManUpper01.bmd','Data/Npc/ManGloves01.bmd','Data/Npc/ManBoots01.bmd'] }],
  [251, { base: 'Data/Npc/Smith01.bmd', parts: [] }],
  [253, { base: 'Data/Npc/Girl01.bmd', parts: ['Data/Npc/GirlHead01.bmd','Data/Npc/GirlUpper01.bmd','Data/Npc/GirlLower01.bmd'] }],
  [254, { base: 'Data/Npc/Wizard01.bmd', parts: [] }],
  [255, { base: 'Data/Npc/Female01.bmd', parts: ['Data/Npc/FemaleHead02.bmd','Data/Npc/FemaleUpper02.bmd','Data/Npc/FemaleLower02.bmd','Data/Npc/FemaleBoots02.bmd'] }],
  // Setting_Monster() authors these guards from MODEL_PLAYER + equipment.
  // Until the exact equipment recipe is recovered from source.zip in-workspace,
  // they MUST stay fail-closed rather than become Monster01.
  [247, { playerBody: true, base: null, parts: [] }],
  [249, { playerBody: true, base: null, parts: [] }],
]);

export function getPcNpcVisualRule(type) {
  return NPC_VISUAL.get(Number(type)) || null;
}
