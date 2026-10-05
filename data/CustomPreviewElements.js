/**
 * CustomPreviewElements.js — exact F3:72 Element[] ownership resolver.
 *
 * PC authority: ZzzCharacter.cpp:12887-12924.
 * Element[0]: gDarkSpirit.checkIsDarkSpirit(value) first; otherwise
 *              gHelperSystem.CheckIsHelper(value + MODEL_ITEM).
 * Element[1]: helper lane only.
 *
 * The wire WORD is the extended item index used before MODEL_ITEM is added for
 * model-space tests, so the Lua registries are queried with the wire value.
 */
import { characterHelperRule } from './CharacterHelperLua.js';
import { darkSpiritRule } from './DarkSpiritLua.js';

export function resolveCustomPreviewElements(customPreview, {
  darkSpiritLookup = darkSpiritRule,
  helperLookup = characterHelperRule,
} = {}) {
  const raw = Array.isArray(customPreview?.element) ? customPreview.element : [0, 0];
  const first = Number(raw[0] || 0) & 0xFFFF;
  const second = Number(raw[1] || 0) & 0xFFFF;
  const out = { first: null, second: null };

  if (first > 0) {
    const ds = darkSpiritLookup(first);
    if (ds?.modelPath) {
      out.first = Object.freeze({
        kind: 'dark-spirit', itemIndex: first, petModelPath: ds.modelPath,
        owner: 'DarkSpirit.lua', slot: 0,
      });
    } else {
      const h = helperLookup(first);
      if (h?.modelPath) out.first = Object.freeze({
        kind: 'helper', itemIndex: first, petModelPath: h.modelPath,
        size: h.size, sizeCharList: h.sizeCharList, movement: h.movement,
        height: h.height, type: h.type, miniature: h.miniature,
        sizeMiniature: h.sizeMiniature, velocityMiniature: h.velocityMiniature,
        owner: 'CharacterHelper.lua', slot: 0,
      });
    }
  }

  if (second > 0) {
    const h = helperLookup(second);
    if (h?.modelPath) out.second = Object.freeze({
      kind: 'helper', itemIndex: second, petModelPath: h.modelPath,
      size: h.size, sizeCharList: h.sizeCharList, movement: h.movement,
      height: h.height, type: h.type, miniature: h.miniature,
      sizeMiniature: h.sizeMiniature, velocityMiniature: h.velocityMiniature,
      owner: 'CharacterHelper.lua', slot: 1,
    });
  }

  return Object.freeze(out);
}

export default resolveCustomPreviewElements;
