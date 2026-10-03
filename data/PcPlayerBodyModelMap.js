/**
 * PcPlayerBodyModelMap.js — exact stock Player armour BMD owner from Main 5.2.
 *
 * Authority: ZzzOpenData.cpp::OpenPlayers + LoadData.cpp::AccessModel.
 * These models are NOT part of OpenItems/ItemModelMap; the desktop loads them
 * into MODEL_HELM/MODEL_ARMOR/MODEL_PANTS/MODEL_GLOVES/MODEL_BOOTS from
 * Data/Player.  Keep this table/routing separate so an absent desktop owner
 * stays fail-closed instead of falling back to a similarly named item model.
 */

const PART_PREFIX = Object.freeze({
  HELM: 'Helm',
  ARMOR: 'Armor',
  PANTS: 'Pant',
  GLOVES: 'Glove',
  BOOTS: 'Boot',
});

function accessModelName(base, index) {
  if (!Number.isInteger(index) || index < 0) return null;
  return index < 10 ? `${base}0${index}.bmd` : `${base}${index}.bmd`;
}

/**
 * Resolve the exact stock MODEL_{HELM..BOOTS}+offset path loaded by OpenPlayers.
 * @param {'HELM'|'ARMOR'|'PANTS'|'GLOVES'|'BOOTS'} group
 * @param {number} offset item family-relative index from CharSet
 * @returns {string|null} path relative to Data/
 */
export function pcPlayerBodyModelPath(group, offset) {
  const prefix = PART_PREFIX[group];
  const off = Number(offset);
  if (!prefix || !Number.isInteger(off) || off < 0) return null;

  let base = null;
  let index = null;

  // Main 5.2 OpenPlayers: stock Male01..10.
  if (off >= 0 && off <= 9) {
    base = `${prefix}Male`; index = off + 1;
  }
  // Elf01..05.
  else if (off >= 10 && off <= 14) {
    base = `${prefix}Elf`; index = off - 9;
  }
  // Offset 15 has no helm owner in the desktop source.
  else if (off === 15) {
    if (group === 'HELM') return null;
    base = `${prefix}Male`; index = 16;
  }
  // Full Male17 set.
  else if (off === 16) {
    base = `${prefix}Male`; index = 17;
  }
  // 18..21 authored block.  Offset 19 (model #20) is the MaleTest family;
  // offset 18 pants uniquely uses t_PantMale19; offset 20 has no helm.
  else if (off >= 17 && off <= 20) {
    index = off + 1;
    if (off === 19) base = `${prefix}MaleTest`;
    else if (group === 'HELM' && off === 20) return null;
    else if (group === 'PANTS' && off === 18) base = 't_PantMale';
    else base = `${prefix}Male`;
  }
  // Male22..25; desktop intentionally has no helm at offset 23.
  else if (off >= 21 && off <= 24) {
    if (group === 'HELM' && off === 23) return null;
    base = `${prefix}Male`; index = off + 1;
  }
  // Male26..29.
  else if (off >= 25 && off <= 28) {
    base = `${prefix}Male`; index = off + 1;
  }
  // Dragon Knight/HDK 01..05. Helm #4 (offset 32) is absent in source.
  else if (off >= 29 && off <= 33) {
    if (group === 'HELM' && off === 32) return null;
    base = `HDK_${prefix}Male`; index = off - 28;
  }
  // CW 01..05. Helm #4 (offset 37) is absent in source.
  else if (off >= 34 && off <= 38) {
    if (group === 'HELM' && off === 37) return null;
    base = `CW_${prefix}Male`; index = off - 33;
  }
  // Male40..45.
  else if (off >= 39 && off <= 44) {
    base = `${prefix}Male`; index = off + 1;
  }
  // Male46..54. Helm offsets 47/48 are intentionally not loaded.
  else if (off >= 45 && off <= 53) {
    if (group === 'HELM' && (off === 47 || off === 48)) return null;
    base = `${prefix}Male`; index = off + 1;
  }
  // PBG Rage Fighter common stock extension: source loads helm/armor/pants/boots,
  // but not gloves, at offsets 59..61.
  else if (off >= 59 && off <= 61) {
    if (group === 'GLOVES') return null;
    base = `${prefix}Male`; index = off + 1;
  }

  const file = base && index != null ? accessModelName(base, index) : null;
  return file ? `Player/${file}` : null;
}

export function resolvePcPlayerBodyModel(group, offset) {
  const off = Number(offset);
  const key = `${group}:${off}`;
  const path = pcPlayerBodyModelPath(group, off);
  return { path, key, missing: path ? null : `sem-registro-PC:${key}` };
}

export default pcPlayerBodyModelPath;
