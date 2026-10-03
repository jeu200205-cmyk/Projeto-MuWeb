/**
 * ItemEffectsLuaConfig.js — exact current-client Configs/ItemEffects.lua owner.
 *
 * This module does not execute Lua and does not invent fallback rows. It parses
 * only the three CItemEffectManager bridge calls registered by EffectManager.cpp:
 *   LoadEffect, LoadRunneEffect, LoadCustomLightEffect.
 * Encrypted current-client Lua is decoded by PcLuaCrypt before parsing.
 */
import { decodePcLuaText } from './PcLuaCrypt.js';

export const ITEM_MODEL_BASE = 1095; // Manager/Definitions/Defines.lua ITEM_BASE
export const ITEM_EFFECTS_PATHS = Object.freeze([
  'Configs/lua/Configs/ItemEffects.lua',
  'Configs/Lua/Configs/ItemEffects.lua',
  'Configs/crypt/Configs/ItemEffects.lua',
]);

function stripLuaLineComment(line) {
  const i = String(line ?? '').indexOf('--');
  return i >= 0 ? String(line).slice(0, i) : String(line ?? '');
}

function parseNumberToken(raw) {
  const n = Number(String(raw ?? '').trim().replace(/\u00a0/g, ' '));
  return Number.isFinite(n) ? n : null;
}

function parseItemModelToken(raw) {
  const s = String(raw ?? '').trim();
  let m = s.match(/^GET_ITEM_MODEL\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (m) return ITEM_MODEL_BASE + Number(m[1]) * 512 + Number(m[2]);
  m = s.match(/^(-?\d+)$/);
  return m ? Number(m[1]) : null;
}

function splitArgs(raw) {
  // Current owner rows are scalar GET_ITEM_MODEL()/numeric calls. Keep the
  // parser deliberately narrow so an unknown expression fails closed.
  const out = [];
  let cur = '', depth = 0;
  for (const ch of String(raw ?? '')) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function parseItemEffectsLua(text) {
  const effects = new Map();
  const runneEffects = new Map();
  const customLights = new Map();
  const source = String(text ?? '').split(/\r?\n/).map(stripLuaLineComment).join('\n');
  const callRe = /\b(LoadEffect|LoadRunneEffect|LoadCustomLightEffect)\s*\(([^\n]*)\)/g;
  let m;
  while ((m = callRe.exec(source))) {
    const fn = m[1];
    const args = splitArgs(m[2]);
    if (fn === 'LoadEffect') {
      if (args.length < 5 || args.length > 8) continue;
      const itemModel = parseItemModelToken(args[0]);
      const r = parseNumberToken(args[1]), g = parseNumberToken(args[2]), b = parseNumberToken(args[3]);
      const effectType = parseNumberToken(args[4]);
      const intensity = args.length >= 6 ? parseNumberToken(args[5]) : 1;
      const scale = args.length >= 7 ? parseNumberToken(args[6]) : 1;
      const height = args.length >= 8 ? parseNumberToken(args[7]) : 0;
      if ([itemModel,r,g,b,effectType,intensity,scale,height].some(v => v == null)) continue;
      effects.set(itemModel, Object.freeze({
        itemModel, colorR:r/255, colorG:g/255, colorB:b/255,
        effectType:effectType & 0xff, intensity, scale, height,
      }));
    } else if (fn === 'LoadRunneEffect') {
      if (args.length < 2 || args.length > 6) continue;
      const itemModel = parseItemModelToken(args[0]);
      const scale = parseNumberToken(args[1]);
      if (itemModel == null || scale == null) continue;
      let customColor = false, colorR = 0, colorG = 0, colorB = 0, effectType = 0;
      if (args.length >= 5) {
        const r=parseNumberToken(args[2]), g=parseNumberToken(args[3]), b=parseNumberToken(args[4]);
        if ([r,g,b].some(v => v == null)) continue;
        customColor = true; colorR=r/255; colorG=g/255; colorB=b/255;
      }
      if (args.length >= 6) {
        const t=parseNumberToken(args[5]); if (t == null) continue; effectType=t;
      }
      runneEffects.set(itemModel, Object.freeze({ itemModel, scale, customColor, colorR, colorG, colorB, effectType }));
    } else {
      if (args.length !== 4) continue;
      const subType = parseItemModelToken(args[0]);
      const r=parseNumberToken(args[1]), g=parseNumberToken(args[2]), b=parseNumberToken(args[3]);
      if ([subType,r,g,b].some(v => v == null)) continue;
      customLights.set(subType, Object.freeze({ subType, colorR:r/255, colorG:g/255, colorB:b/255 }));
    }
  }
  return Object.freeze({ effects, runneEffects, customLights });
}

let _cached = null;
export async function loadItemEffectsLuaConfig(fetchBinary) {
  if (_cached) return _cached;
  if (typeof fetchBinary !== 'function') throw new TypeError('fetchBinary required');
  let lastError = null;
  for (const path of ITEM_EFFECTS_PATHS) {
    try {
      const bytes = await fetchBinary(path);
      if (!bytes) continue;
      const text = decodePcLuaText(bytes);
      const parsed = parseItemEffectsLua(text);
      // Current CItemEffectManager owner must contain at least one registered row.
      if (!parsed.effects.size && !parsed.runneEffects.size && !parsed.customLights.size) {
        throw new Error('ItemEffects.lua sem calls CItemEffectManager reconhecíveis');
      }
      _cached = Object.freeze({ ...parsed, path, textLength:text.length });
      return _cached;
    } catch (e) { lastError = e; }
  }
  throw lastError || new Error('ItemEffects.lua ausente');
}

export function resetItemEffectsLuaConfigCacheForTests() { _cached = null; }

export function itemTypeToModelType(itemType) {
  return Number.isInteger(itemType) && itemType >= 0 ? ITEM_MODEL_BASE + itemType : null;
}

/** PC ZzzCharacter ResolveRuneAuraDecision order: BodyPart[0..5], Weapon[0..1], Wing, Helper. */
export function resolveRuneAuraForEquipment(attach, config) {
  const runne = config?.runneEffects;
  if (!(runne instanceof Map) || !attach) return null;
  const orderedItemTypes = [];
  // BodyPart[0] is the class head model, not an equipped item. Remaining order:
  // HELM, ARMOR, PANTS, GLOVES, BOOTS.
  for (const key of ['helm','armor','pant','glove','boot']) {
    const t = attach.bodySpecs?.[key]?.extType;
    if (Number.isInteger(t)) orderedItemTypes.push(t);
  }
  for (const spec of [attach.weaponRightSpec, attach.weaponLeftSpec]) {
    if (Number.isInteger(spec?.extType)) orderedItemTypes.push(spec.extType);
  }
  if (Number.isInteger(attach.wing?.extType)) orderedItemTypes.push(attach.wing.extType);
  if (Number.isInteger(attach.helper?.extType)) orderedItemTypes.push(attach.helper.extType);

  for (const itemType of orderedItemTypes) {
    const itemModel = itemTypeToModelType(itemType);
    const info = runne.get(itemModel);
    if (info && info.effectType === 0) return Object.freeze({ ...info, itemType, itemModel });
  }
  return null;
}
