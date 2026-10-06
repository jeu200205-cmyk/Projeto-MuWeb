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
import { characterHelperRule, characterHelperRenderRule } from './CharacterHelperLua.js';
import { darkSpiritRule } from './DarkSpiritLua.js';

function helperElementSpec(itemIndex,h,presentation,slot){
  if(!h?.renderModelPath&&!h?.modelPath)return null;
  const common={itemIndex,petModelPath:h.renderModelPath||h.modelPath,size:h.size,sizeCharList:h.sizeCharList,movement:h.movement,height:h.height,type:h.type,rawType:h.rawType,miniature:h.miniature,sizeMiniature:h.sizeMiniature,velocityMiniature:h.velocityMiniature,presentation,owner:'CharacterHelper.lua',slot};
  if(Number(h.rawType)===0)return Object.freeze({kind:'helper',...common});
  if(Number(h.rawType)===3)return Object.freeze({kind:'mount',species:'custom-fenrir',behaviorSpecies:'fenrir',...common});
  if(Number(h.rawType)===4)return Object.freeze({kind:'mount',species:'custom-horse',behaviorSpecies:'dark-horse',...common});
  return Object.freeze({kind:'unresolved-helper',reason:`rawType=${h.rawType} movement owner pending`,...common});
}

export function resolveCustomPreviewElements(customPreview, {
  darkSpiritLookup = darkSpiritRule,
  helperLookup = characterHelperRule,
  helperRenderLookup = characterHelperRenderRule,
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
        owner: 'DarkSpirit.lua', presentation: ds, slot: 0,
      });
    } else {
      const h = helperLookup(first);
      if (h?.renderModelPath || h?.modelPath) out.first = helperElementSpec(first,h,helperRenderLookup(first),0);
    }
  }

  if (second > 0) {
    const h = helperLookup(second);
    if (h?.renderModelPath || h?.modelPath) out.second = helperElementSpec(second,h,helperRenderLookup(second),1);
  }

  return Object.freeze(out);
}

export default resolveCustomPreviewElements;
