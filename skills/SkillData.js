// skills/SkillData.js — Catálogo de skills estilo MU Season 6.
// classId: 0=DK, 1=DW, 2=ELF, 3=MG, 4=DL, 5=SUM, 6=RF (Character.Classes)
//
// Cada skill: { id, name, classId[], icon, mpCost, cooldown(ms), range,
//   power (multiplicador de dano), type 'attack'|'buff'|'heal'|'summon',
//   element 'none'|'fire'|'ice'|'lightning'|'poison'|'wind',
//   description (PT), learnLevel }

// ---- Dark Knight (0) ----
const DK = [
  { id: 1, name: 'Falling Slash', classId: [0], icon: '⚔️', mpCost: 4, cooldown: 1000, range: 3, power: 1.4, type: 'attack', element: 'none', description: 'Golpe descendente poderoso com a espada.', learnLevel: 1 },
  { id: 2, name: 'Lunge', classId: [0], icon: '🗡️', mpCost: 6, cooldown: 1500, range: 4, power: 1.5, type: 'attack', element: 'none', description: 'Investida rápida perfurando o alvo.', learnLevel: 6 },
  { id: 3, name: 'Cyclone', classId: [0, 3], icon: '🌀', mpCost: 9, cooldown: 2500, range: 7, power: 1.6, type: 'attack', element: 'wind', description: 'Corte giratório com projétil de vento à distância.', learnLevel: 14 },
  { id: 4, name: 'Twisting Slash', classId: [0], icon: '💫', mpCost: 10, cooldown: 3000, range: 3, power: 1.8, type: 'attack', element: 'none', description: 'Giro selvagem atingindo todos os inimigos ao redor.', learnLevel: 20 },
  { id: 5, name: 'Death Stab', classId: [0], icon: '☠️', mpCost: 15, cooldown: 4000, range: 4, power: 2.6, type: 'attack', element: 'none', description: 'Estocada mortal que atravessa a defesa do alvo.', learnLevel: 160 },
  { id: 6, name: 'Rageful Blow', classId: [0], icon: '🔥', mpCost: 25, cooldown: 5000, range: 3, power: 3.0, type: 'attack', element: 'fire', description: 'Golpe furioso carregado de energia destrutiva.', learnLevel: 170 },
  { id: 7, name: 'Destruction', classId: [0], icon: '💥', mpCost: 30, cooldown: 6000, range: 4, power: 3.4, type: 'attack', element: 'none', description: 'Explosão devastadora ao redor do cavaleiro.', learnLevel: 220 },
  { id: 8, name: 'Strike of Destruction', classId: [0, 3], icon: '🌋', mpCost: 60, cooldown: 8000, range: 7, power: 4.2, type: 'attack', element: 'fire', description: 'Ondas de energia aniquilam múltiplos inimigos à frente.', learnLevel: 350 },
  { id: 9, name: 'Swell Life', classId: [0], icon: '❤️', mpCost: 22, cooldown: 30000, range: 0, power: 0, type: 'buff', element: 'none', description: 'Aumenta temporariamente o HP máximo do cavaleiro.', learnLevel: 120 },
];

// ---- Dark Wizard (1) ----
const DW = [
  { id: 10, name: 'Energy Ball', classId: [1, 5], icon: '🔮', mpCost: 1, cooldown: 500, range: 8, power: 1.0, type: 'attack', element: 'none', description: 'Esfera básica de energia mágica.', learnLevel: 1 },
  { id: 11, name: 'Fire Ball', classId: [1], icon: '🔥', mpCost: 3, cooldown: 800, range: 9, power: 1.2, type: 'attack', element: 'fire', description: 'Bola de fogo lançada contra o inimigo.', learnLevel: 5 },
  { id: 12, name: 'Power Wave', classId: [1], icon: '🌊', mpCost: 5, cooldown: 1200, range: 10, power: 1.3, type: 'attack', element: 'none', description: 'Onda de choque mágica em linha reta.', learnLevel: 9 },
  { id: 13, name: 'Lightning', classId: [1], icon: '⚡', mpCost: 7, cooldown: 1500, range: 8, power: 1.6, type: 'attack', element: 'lightning', description: 'Descarga elétrica fulminante sobre o alvo.', learnLevel: 13 },
  { id: 14, name: 'Teleport', classId: [1, 5], icon: '✨', mpCost: 30, cooldown: 3000, range: 12, power: 0, type: 'buff', element: 'none', description: 'Teleporta o mago para a posição alvo.', learnLevel: 18 },
  { id: 15, name: 'Meteorite', classId: [1], icon: '☄️', mpCost: 12, cooldown: 2500, range: 9, power: 1.9, type: 'attack', element: 'fire', description: 'Meteoro em chamas cai do céu sobre os inimigos.', learnLevel: 21 },
  { id: 16, name: 'Ice', classId: [1, 5], icon: '❄️', mpCost: 10, cooldown: 2000, range: 8, power: 1.7, type: 'attack', element: 'ice', description: 'Estilhaços de gelo que perfuram e congelam o alvo.', learnLevel: 25 },
  { id: 17, name: 'Evil Spirit', classId: [1, 5], icon: '👻', mpCost: 18, cooldown: 3000, range: 9, power: 2.1, type: 'attack', element: 'poison', description: 'Espíritos sombrios atormentam os inimigos em área.', learnLevel: 35 },
  { id: 18, name: 'Hellfire', classId: [1], icon: '🎇', mpCost: 30, cooldown: 4000, range: 5, power: 2.5, type: 'attack', element: 'fire', description: 'Chamas do inferno irrompem ao redor do mago.', learnLevel: 60 },
  { id: 19, name: 'Aqua Beam', classId: [1], icon: '💧', mpCost: 25, cooldown: 3500, range: 10, power: 2.4, type: 'attack', element: 'ice', description: 'Jato concentrado de água pressurizada.', learnLevel: 80 },
  { id: 20, name: 'Cometfall', classId: [1, 3], icon: '🌠', mpCost: 40, cooldown: 5000, range: 10, power: 2.9, type: 'attack', element: 'fire', description: 'Cometa devastador despenca sobre a área alvo.', learnLevel: 100 },
  { id: 21, name: 'Inferno', classId: [1], icon: '🔥', mpCost: 50, cooldown: 6000, range: 7, power: 3.3, type: 'attack', element: 'fire', description: 'Labaredas gigantes consomem tudo ao redor.', learnLevel: 120 },
  { id: 22, name: 'Ice Storm', classId: [1], icon: '🌨️', mpCost: 55, cooldown: 7000, range: 9, power: 3.2, type: 'attack', element: 'ice', description: 'Tempestade de gelo cobre uma grande área.', learnLevel: 150 },
  { id: 23, name: 'Decay', classId: [1], icon: '🧪', mpCost: 85, cooldown: 9000, range: 8, power: 3.8, type: 'attack', element: 'poison', description: 'Veneno corrosivo decompõe os inimigos lentamente.', learnLevel: 220 },
  { id: 24, name: 'Nova', classId: [1], icon: '💥', mpCost: 180, cooldown: 15000, range: 8, power: 5.0, type: 'attack', element: 'lightning', description: 'Explosão suprema de energia pura ao redor do mago.', learnLevel: 250 },
];

// ---- Fairy Elf (2) ----
const ELF = [
  { id: 25, name: 'Triple Shot', classId: [2], icon: '🏹', mpCost: 5, cooldown: 1200, range: 10, power: 1.5, type: 'attack', element: 'none', description: 'Três flechas disparadas em rápida sucessão.', learnLevel: 8 },
  { id: 26, name: 'Penetration', classId: [2], icon: '🎯', mpCost: 9, cooldown: 2500, range: 11, power: 2.2, type: 'attack', element: 'none', description: 'Flecha perfurante que atravessa múltiplos alvos.', learnLevel: 20 },
  { id: 27, name: 'Greater Defense', classId: [2], icon: '🛡️', mpCost: 20, cooldown: 10000, range: 8, power: 0, type: 'buff', element: 'none', description: 'Aumenta a defesa do aliado por um tempo.', learnLevel: 15 },
  { id: 28, name: 'Greater Damage', classId: [2], icon: '⚔️', mpCost: 20, cooldown: 10000, range: 8, power: 0, type: 'buff', element: 'none', description: 'Aumenta o ataque do aliado por um tempo.', learnLevel: 30 },
  { id: 29, name: 'Heal', classId: [2], icon: '💚', mpCost: 15, cooldown: 5000, range: 8, power: 0.5, type: 'heal', element: 'none', description: 'Restaura o HP do alvo aliado.', learnLevel: 10 },
  { id: 30, name: 'Summon Goblin', classId: [2], icon: '👺', mpCost: 30, cooldown: 20000, range: 6, power: 1.0, type: 'summon', element: 'none', description: 'Invoca um goblin para lutar ao seu lado.', learnLevel: 40 },
  { id: 31, name: 'Stone Golem', classId: [2], icon: '🗿', mpCost: 50, cooldown: 25000, range: 6, power: 1.5, type: 'summon', element: 'none', description: 'Invoca um golem de pedra resistente.', learnLevel: 60 },
  { id: 32, name: 'Assassin', classId: [2], icon: '🥷', mpCost: 70, cooldown: 30000, range: 6, power: 1.8, type: 'summon', element: 'none', description: 'Invoca um assassino das sombras veloz.', learnLevel: 90 },
  { id: 33, name: 'Elite Yeti', classId: [2], icon: '🦍', mpCost: 90, cooldown: 30000, range: 6, power: 2.2, type: 'summon', element: 'ice', description: 'Invoca um yeti de elite do gelo eterno.', learnLevel: 110 },
  { id: 34, name: 'Dark Knight', classId: [2], icon: '🐴', mpCost: 110, cooldown: 35000, range: 6, power: 2.6, type: 'summon', element: 'none', description: 'Invoca um cavaleiro das trevas montado.', learnLevel: 150 },
  { id: 35, name: 'Giant', classId: [2], icon: '⛰️', mpCost: 130, cooldown: 40000, range: 6, power: 3.0, type: 'summon', element: 'none', description: 'Invoca o guardião gigante da floresta.', learnLevel: 180 },
];

// ---- Magic Gladiator (3) ----
const MG = [
  { id: 36, name: 'Fire Slash', classId: [3], icon: '🔥', mpCost: 10, cooldown: 2000, range: 4, power: 1.8, type: 'attack', element: 'fire', description: 'Lâmina envolta em chamas corta o inimigo.', learnLevel: 1 },
  { id: 37, name: 'Power Slash', classId: [3], icon: '⚔️', mpCost: 12, cooldown: 2500, range: 4, power: 2.0, type: 'attack', element: 'none', description: 'Corte concentrado de energia bruta.', learnLevel: 20 },
  { id: 38, name: 'Flame Strike', classId: [3], icon: '🎇', mpCost: 25, cooldown: 4000, range: 5, power: 2.6, type: 'attack', element: 'fire', description: 'Pilar de fogo explode sob os pés do alvo.', learnLevel: 60 },
  { id: 39, name: 'Gigantic Storm', classId: [3], icon: '🌪️', mpCost: 120, cooldown: 12000, range: 7, power: 3.8, type: 'attack', element: 'wind', description: 'Tempestade colossal gira ao redor do gladiador.', learnLevel: 220 },
  { id: 40, name: 'Fire Scream', classId: [3, 4], icon: '🦅', mpCost: 70, cooldown: 7000, range: 8, power: 3.2, type: 'attack', element: 'fire', description: 'Grito flamejante lança projéteis explosivos.', learnLevel: 150 },
  { id: 41, name: 'Spiral Slash', classId: [3], icon: '💫', mpCost: 18, cooldown: 3000, range: 4, power: 2.3, type: 'attack', element: 'none', description: 'Cortes espirais rápidos atingem alvos ao redor.', learnLevel: 40 },
];

// ---- Dark Lord (4) ----
const DL = [
  { id: 42, name: 'Force', classId: [4], icon: '🌑', mpCost: 8, cooldown: 1200, range: 9, power: 1.4, type: 'attack', element: 'none', description: 'Esfera de energia escura lançada contra o alvo.', learnLevel: 1 },
  { id: 43, name: 'Earthshake', classId: [4], icon: '🌍', mpCost: 15, cooldown: 3000, range: 5, power: 2.0, type: 'attack', element: 'none', description: 'Golpeia o chão causando um terremoto local.', learnLevel: 30 },
  { id: 44, name: 'Fireburst', classId: [4], icon: '💥', mpCost: 25, cooldown: 4500, range: 6, power: 2.4, type: 'attack', element: 'fire', description: 'Explosão de fogo concentrada à frente.', learnLevel: 70 },
  { id: 45, name: 'Critical Damage', classId: [4], icon: '🎲', mpCost: 20, cooldown: 20000, range: 8, power: 0, type: 'buff', element: 'none', description: 'Aumenta a chance de dano crítico dos aliados próximos.', learnLevel: 50 },
  { id: 46, name: 'Summon', classId: [4], icon: '🧿', mpCost: 35, cooldown: 30000, range: 0, power: 0, type: 'buff', element: 'none', description: 'Teleporta um membro do grupo até o Dark Lord.', learnLevel: 98 },
  { id: 47, name: 'Earthshake II', classId: [4], icon: '🌋', mpCost: 20, cooldown: 3500, range: 6, power: 2.5, type: 'attack', element: 'none', description: 'Tremor aprimorado com ondas de choque maiores.', learnLevel: 100 },
  { id: 48, name: 'Fire Scream', classId: [4], icon: '🔥', mpCost: 70, cooldown: 7000, range: 8, power: 3.2, type: 'attack', element: 'fire', description: 'Grito flamejante lança projéteis explosivos.', learnLevel: 150 },
  { id: 49, name: 'Birds', classId: [4], icon: '🦅', mpCost: 10, cooldown: 1500, range: 10, power: 1.6, type: 'attack', element: 'wind', description: 'O corvo de guerra ataca o alvo em voo rasante.', learnLevel: 15 },
];

// ---- Summoner (5) ----
const SUM = [
  { id: 50, name: 'Drain Life', classId: [5], icon: '🩸', mpCost: 20, cooldown: 3000, range: 8, power: 1.8, type: 'attack', element: 'poison', description: 'Drena a vida do inimigo, curando a conjuradora.', learnLevel: 1 },
  { id: 51, name: 'Chain Lightning', classId: [5], icon: '⚡', mpCost: 30, cooldown: 4000, range: 9, power: 2.2, type: 'attack', element: 'lightning', description: 'Raio que salta entre múltiplos inimigos.', learnLevel: 30 },
  { id: 52, name: 'Damage Reflection', classId: [5], icon: '🔄', mpCost: 25, cooldown: 20000, range: 6, power: 0, type: 'buff', element: 'none', description: 'Reflete parte do dano recebido de volta ao atacante.', learnLevel: 40 },
  { id: 53, name: 'Sleep', classId: [5], icon: '😴', mpCost: 18, cooldown: 15000, range: 8, power: 0, type: 'buff', element: 'none', description: 'Adormece o alvo por alguns segundos.', learnLevel: 25 },
  { id: 54, name: 'Speed', classId: [5], icon: '💨', mpCost: 15, cooldown: 10000, range: 8, power: 0, type: 'buff', element: 'none', description: 'Aumenta a velocidade de movimento do aliado.', learnLevel: 15 },
  { id: 55, name: 'Weakness', classId: [5], icon: '🕸️', mpCost: 22, cooldown: 8000, range: 8, power: 1.3, type: 'attack', element: 'poison', description: 'Enfraquece o alvo, reduzindo seu ataque e causando dano.', learnLevel: 60 },
  { id: 56, name: 'Innovation', classId: [5], icon: '🛡️', mpCost: 28, cooldown: 15000, range: 8, power: 0, type: 'buff', element: 'none', description: 'Aumenta a defesa dos aliados próximos.', learnLevel: 80 },
  { id: 57, name: 'Berserker', classId: [5], icon: '😈', mpCost: 40, cooldown: 30000, range: 8, power: 0, type: 'buff', element: 'none', description: 'Aumenta muito o ataque, mas reduz a defesa do alvo.', learnLevel: 100 },
  { id: 58, name: 'Pollution', classId: [5], icon: '☣️', mpCost: 60, cooldown: 8000, range: 8, power: 3.0, type: 'attack', element: 'poison', description: 'Névoa venenosa contamina uma área inteira.', learnLevel: 140 },
];

// ---- Rage Fighter (6) ----
const RF = [
  { id: 59, name: 'Kill Log', classId: [6], icon: '👊', mpCost: 6, cooldown: 1000, range: 3, power: 1.5, type: 'attack', element: 'none', description: 'Sequência rápida de socos devastadores.', learnLevel: 1 },
  { id: 60, name: 'Dragon Lore', classId: [6], icon: '🐉', mpCost: 20, cooldown: 4000, range: 4, power: 2.4, type: 'attack', element: 'none', description: 'Invoca o poder do dragão num golpe ascendente.', learnLevel: 40 },
  { id: 61, name: 'Phoenix Shot', classId: [6], icon: '🕊️', mpCost: 30, cooldown: 5000, range: 9, power: 2.6, type: 'attack', element: 'fire', description: 'Disparo flamejante da fênix à distância.', learnLevel: 60 },
  { id: 62, name: 'Chain Drive', classId: [6], icon: '⛓️', mpCost: 12, cooldown: 2000, range: 5, power: 1.9, type: 'attack', element: 'none', description: 'Avanço com cadeia de socos em combo.', learnLevel: 20 },
  { id: 63, name: 'Charging', classId: [6], icon: '💢', mpCost: 25, cooldown: 8000, range: 0, power: 0, type: 'buff', element: 'none', description: 'Carrega energia espiritual, aumentando o próximo golpe.', learnLevel: 30 },
  { id: 64, name: 'Darkside', classId: [6], icon: '🌑', mpCost: 45, cooldown: 7000, range: 6, power: 3.0, type: 'attack', element: 'poison', description: 'Meteoro sombrio cai atingindo todos ao redor.', learnLevel: 90 },
  { id: 65, name: 'Uppercut', classId: [6], icon: '🥊', mpCost: 15, cooldown: 2500, range: 3, power: 2.1, type: 'attack', element: 'none', description: 'Gancho ascendente que lança o inimigo ao ar.', learnLevel: 15 },
  { id: 66, name: 'Dragon Roar', classId: [6], icon: '🐲', mpCost: 60, cooldown: 10000, range: 7, power: 3.5, type: 'attack', element: 'fire', description: 'Rugido do dragão incinera tudo em cone à frente.', learnLevel: 130 },
];

/** Catálogo completo de skills (lista simples). */
export const SKILLS = [...DK, ...DW, ...ELF, ...MG, ...DL, ...SUM, ...RF];

/** Índice rápido por id. */
export const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

/** Retorna todas as skills de uma classe. */
export function getSkillsForClass(classId) {
  return SKILLS.filter((s) => s.classId.includes(classId));
}

export default SKILLS;
