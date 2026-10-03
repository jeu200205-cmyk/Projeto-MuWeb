/**
 * CharacterEquipmentCodec.js — decode REAL do CharSet da lista de personagens.
 *
 * Autoridade: PC Main 5.2 `ZzzCharacter.cpp::ChangeCharacterExt`.
 * O pacote F3:00 contém CharSet[18]:
 *   charset[0]  = classe codificada pelo servidor
 *   charset[1..17] = bloco `Equipment` entregue a ChangeCharacterExt.
 *
 * Este módulo NÃO inventa BMD/visual. Ele somente decodifica a informação que
 * o Main realmente usa para weapon/body/wing/helper. A resolução do model-id
 * para BMD exato continua em uma camada separada e deve falhar fechado quando
 * o asset mapping ainda não estiver portado.
 */

export const NO_EQUIPMENT_12BIT = 0x0fff;
export const NO_BODY_ITEM_9BIT = 0x01ff;

export function levelConvert(levelBits) {
  const map = [0, 3, 5, 7, 9, 11, 13, 15];
  return map[levelBits & 7] ?? 0;
}

function requireCharSet(charset) {
  if (!charset || charset.length < 18) {
    throw new Error(`CharSet inválido: esperado 18 bytes, recebido ${charset?.length ?? 0}`);
  }
  return Uint8Array.from(charset);
}

/**
 * @param {ArrayLike<number>} charset 18 bytes do PMSG_CHARACTER_LIST_INFO.
 * @returns {object} estrutura semântica equivalente ao ChangeCharacterExt.
 */
export function decodeCharacterEquipment(charset) {
  const cs = requireCharSet(charset);
  const e = cs.subarray(1); // Equipment[0..16]

  const levelBits = (e[5] << 16) | (e[6] << 8) | e[7];

  const rightExtType = e[0] | (16 * (e[11] & 0xf0));
  const leftExtType = e[1] | (16 * (e[12] & 0xf0));

  const helmExtType = (e[2] >> 4) + (((e[8] >> 7) & 1) * 16) + ((e[12] & 15) * 32);
  const armorExtType = (e[2] & 15) + (((e[8] >> 6) & 1) * 16) + (((e[13] >> 4) & 15) * 32);
  const pantsExtType = (e[3] >> 4) + (((e[8] >> 5) & 1) * 16) + ((e[13] & 15) * 32);
  const glovesExtType = (e[3] & 15) + (((e[8] >> 4) & 1) * 16) + (((e[14] >> 4) & 15) * 32);
  const bootsExtType = (e[4] >> 4) + (((e[8] >> 3) & 1) * 16) + ((e[14] & 15) * 32);

  let wing = null;
  let wingType = (e[4] >> 2) & 3;
  if (wingType === 3) {
    const ext = e[8] & 0x07;
    if (ext !== 0) {
      wing = ext === 5 ? { family: 'helper', offset: 30 }
        : ext === 6 ? { family: 'wing', offset: 41 }
          : ext === 7 ? { family: 'wing', offset: 42 }
            : { family: 'wing', offset: ext + 2 };
    }
  } else {
    wing = { family: 'wing', offset: wingType };
  }
  const wingExt2 = (e[15] >> 2) & 0x07;
  if (wingExt2 > 0) {
    wing = wingExt2 === 6 ? { family: 'wing', offset: 43 }
      : { family: 'wing', offset: 35 + wingExt2 };
  }
  const wingExt3 = e[16] >> 5;
  if (wingExt3 > 0 && wingExt3 <= 5) {
    wing = { family: 'wing', offset: 129 + wingExt3 };
  }

  let helper = null;
  let helperType = e[4] & 3;
  if (helperType === 3) {
    if ((e[9] & 0x01) === 1) helper = { family: 'helper', offset: 3, kind: 'pegasus' };
  } else {
    const ext = e[15] & 0xe0;
    const extMap = new Map([[32, 64], [64, 65], [128, 67], [224, 80], [160, 106], [96, 123]]);
    if (extMap.has(ext)) helper = { family: 'helper', offset: extMap.get(ext), kind: 'extended' };
    // PC ZzzCharacter.cpp L12633: c->Helper.Type = MODEL_HELPER+Type ANTES do
    // switch — Type==1 (imp) TAMBÉM renderiza (L15287-15301: bone 34,
    // off(20,0,0) no CharacterRenderBackItem; Helper02.bmd). O bCreateHelper
    // default=FALSE (L12641) só omite o CreateBug companheiro (pet inicial),
    // NÃO o modelo. Mobile confirma 2× (AndroidInventory L180 /
    // CharacterRenderer L12217 mantém type==1). (correção do cross-review)
    else if (helperType === 0) helper = { family: 'helper', offset: 0, kind: 'helper' };
    else if (helperType === 1) helper = { family: 'helper', offset: 1, kind: 'imp' };
    else if (helperType === 2) helper = { family: 'helper', offset: 2, kind: 'unicon' };
  }
  if ((e[11] & 0x01) === 1) helper = { family: 'helper', offset: 4, kind: 'dark-horse' };
  if ((e[11] & 0x04) === 0x04) {
    let option = e[15] & 3;
    if ((e[16] & 1) === 1) option = 0x04;
    helper = { family: 'helper', offset: 37, kind: 'fenrir', option };
  }

  const body = {
    helm:   { extType: helmExtType,   baseSkin: helmExtType   === NO_BODY_ITEM_9BIT, level: levelConvert((levelBits >> 6) & 7),  option1: (e[9] >> 7) & 1, extOption: (e[10] >> 7) & 1 },
    armor:  { extType: armorExtType,  baseSkin: armorExtType  === NO_BODY_ITEM_9BIT, level: levelConvert((levelBits >> 9) & 7),  option1: (e[9] >> 6) & 1, extOption: (e[10] >> 6) & 1 },
    pants:  { extType: pantsExtType,  baseSkin: pantsExtType  === NO_BODY_ITEM_9BIT, level: levelConvert((levelBits >> 12) & 7), option1: (e[9] >> 5) & 1, extOption: (e[10] >> 5) & 1 },
    gloves: { extType: glovesExtType, baseSkin: glovesExtType === NO_BODY_ITEM_9BIT, level: levelConvert((levelBits >> 15) & 7), option1: (e[9] >> 4) & 1, extOption: (e[10] >> 4) & 1 },
    boots:  { extType: bootsExtType,  baseSkin: bootsExtType  === NO_BODY_ITEM_9BIT, level: levelConvert((levelBits >> 18) & 7), option1: (e[9] >> 3) & 1, extOption: (e[10] >> 3) & 1 },
  };

  return {
    classByte: cs[0],
    weaponRight: {
      extType: rightExtType,
      empty: rightExtType === NO_EQUIPMENT_12BIT,
      level: levelConvert(levelBits & 7),
      option1: (e[9] >> 2) & 1,
      extOption: (e[10] >> 2) & 1,
    },
    weaponLeft: {
      extType: leftExtType,
      empty: leftExtType === NO_EQUIPMENT_12BIT,
      level: levelConvert((levelBits >> 3) & 7),
      option1: (e[9] >> 1) & 1,
      extOption: (e[10] >> 1) & 1,
    },
    body,
    wing,
    helper,
    extendState: e[10] & 0x01,
    etcPartLion: ((e[11] >> 1) & 0x01) === 1,
    rawEquipment: Array.from(e),
  };
}

export default decodeCharacterEquipment;
