// ItemTypes.js — Banco de itens do web-port MU.
// DADOS 100% REAIS: os 3052 itens vêm do item_por.bmd do cliente
// (data/generated/RealItems.js — parseado com XOR3 FC CF AB).
//
// CONTRATO: nomes/categorias/slots/índices são os do cliente real.
// Stats de apresentação (dano/defesa/preço/nível) são DERIVADOS por regras
// determinísticas documentadas abaixo — no MU real, stats autoritativos vêm
// do SERVIDOR (pacotes de item), nunca do arquivo local do cliente. Quando
// o GameServer real estiver conectado, os stats dele prevalecem.
//
// Regras de derivação (determinísticas, mesma entrada = mesmo resultado):
//   order      = posição do item entre os do mesmo kind (0..N)
//   level      = min(380, order * 3)              — progressão linear clássica
//   damageMin  = 3 + level                        — armas
//   damageMax  = damageMin + 4 + (level >> 3)
//   defense    = 2 + floor(level * 0.4)           — armaduras/escudos/elmos
//   price      = 100 * (1 + level) * (stackable ? 1 : 5)  — zen
//   stackSize  = 255 para kind 'misc' (joias/poções empilham), 1 para equipamento
//   twoHanded  = kind ∈ {spear, bow, crossbow, staff}     — armas de 2 mãos clássicas

import { REAL_ITEMS } from './generated/RealItems.js';

// Slots/categorias de item (contrato fixo usado por Inventory, UI e net)
export const ITEM_TYPES = {
  HELM: 'helm',
  ARMOR: 'armor',
  PANTS: 'pants',
  GLOVES: 'gloves',
  BOOTS: 'boots',
  WEAPON: 'weapon',
  SHIELD: 'shield',
  WINGS: 'wings',
  RING: 'ring',
  POTION: 'potion',
  OTHER: 'other',
};

// kind do item_por → categoria do inventário
const KIND_TO_TYPE = {
  sword: ITEM_TYPES.WEAPON,
  axe: ITEM_TYPES.WEAPON,
  mace: ITEM_TYPES.WEAPON,
  spear: ITEM_TYPES.WEAPON,
  bow: ITEM_TYPES.WEAPON,
  crossbow: ITEM_TYPES.WEAPON,
  staff: ITEM_TYPES.WEAPON,
  shield: ITEM_TYPES.SHIELD,
  helm: ITEM_TYPES.HELM,
  armor: ITEM_TYPES.ARMOR,
  misc: ITEM_TYPES.OTHER,
};

const TWO_HANDED = new Set(['spear', 'bow', 'crossbow', 'staff']);
// R12.6 anti-placeholder: ICON_BY_KIND (emoji 🗡️🪓🏹 etc) FOI REMOVIDO.
// Ícone de item = render 3D do modelo real (ui2/ItemIconRenderer.js,
// paridade ZzzInventory RenderItem3D). Campo `icon` fica null — consumidor
// fail-closed (nunca emoji).

export const ITEM_DB = [];

// Contador de ordem por kind p/ derivação de level
const _order = new Map();
for (const it of REAL_ITEMS) {
  const type = KIND_TO_TYPE[it.kind] || ITEM_TYPES.OTHER;
  const order = _order.get(it.kind) || 0;
  _order.set(it.kind, order + 1);

  const stackable = it.kind === 'misc';
  const level = Math.min(380, order * 3);
  const isWeapon = type === ITEM_TYPES.WEAPON;
  const isArmor = type === ITEM_TYPES.HELM || type === ITEM_TYPES.ARMOR || type === ITEM_TYPES.SHIELD;
  const damageMin = isWeapon ? 3 + level : 0;
  const damageMax = isWeapon ? damageMin + 4 + (level >> 3) : 0;
  const defense = isArmor ? 2 + Math.floor(level * 0.4) : 0;

  ITEM_DB.push({
    typeId: it.index,      // ID REAL do jogo (número do item no item_por)
    name: it.name,         // NOME REAL do cliente
    kind: it.kind,
    category: it.category, // categoria REAL do item_por
    slot: it.slot,         // slot REAL do item_por
    type,
    level,
    damageMin,
    damageMax,
    defense,
    icon: null, // R12.6: emoji removido — ícone real = render 3D (ItemIconRenderer)
    price: 100 * (1 + level) * (stackable ? 1 : 5),
    stackSize: stackable ? 255 : 1,
    twoHanded: TWO_HANDED.has(it.kind),
  });
}

// Índices auxiliares (compatíveis com os consumidores existentes)
export const ITEM_BY_ID = new Map(ITEM_DB.map((d) => [d.typeId, d]));
export const ITEM_BY_NAME = new Map(ITEM_DB.map((d) => [d.name, d]));

export function getItemDef(typeId) {
  return ITEM_BY_ID.get(typeId) || null;
}

export function getItemDefByName(name) {
  return ITEM_BY_NAME.get(name) || null;
}

// Slots de equipamento válidos no inventário
export const EQUIP_SLOTS = [
  'helm', 'armor', 'pants', 'gloves', 'boots',
  'weapon1', 'weapon2', 'wings', 'ring1', 'ring2',
];
