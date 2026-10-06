# MUWEB ITEMS/LUA FIX80 SAFE lane

Parent exato: `MUWEB_R90_FIX79_PROTOCOL_WIRE_INTEGRATED_2026-10-05_FULL.zip` (central; SHA-256 `bcaae3278e3249e81d227e2dffda2184e2349d0ffba0437ef12ccff66cc287ef`).

## Escopo / evidência
FIX79 preserva FIX78 RenderCapeModel RenderBody/RenderMesh, mas declara BMD CreateSprite/CreateParticle/CreateEffect/TransformPosition e worldTime/GetDoubleRender abertos. FIX78 já captura esses callbacks do CharacterCreateCape.lua. Esta lane não inventa assinatura/bitmap/FX sem a autoridade Main 5.2/Lua real disponível no pacote.

## Correção
`graphics/PcCustomCapePresentation.js`: callbacks autorais ainda sem consumer exato agora bloqueiam atomicamente o takeover GPU do BMD rígido. Antes, `complete` ignorava `effects`, podia esconder o BMD stock e descartar silenciosamente CreateSprite/CreateParticle/CreateEffect/CreateJoint. Meta-calls BMD (SetLight/setMesh/TransformPosition etc.) continuam permitidas; callback visual não consumido torna o programa incompleto/fail-closed e aparece em telemetria `unresolvedEffects`.

## Cobertura antes/depois
Antes: RenderBody/RenderMesh podiam assumir ownership mesmo com FX autoral não materializado. Depois: takeover somente se ambos white/lit não têm callback visual pendente. Isso evita regressão visual enquanto a tranche de FX exata é fechada.

## Arquivos alterados
- graphics/PcCustomCapePresentation.js
- test-r90-fix80-cape-fx-atomic.mjs
- ITEMS_LUA_FIX80.md

## Gates
- node --check PcCustomCapePresentation.js: PASS
- FIX80 cape FX atomic fail-closed: PASS
- FIX78 custom cape GPU source contracts: PASS
- FIX77 CharacterEffectItens/CharacterSetEffect cache: PASS

## Limitações / próximos
Ainda abertos: consumer exato BMD CreateSprite/CreateParticle/CreateEffect/TransformPosition; runner persistente worldTime/GetDoubleRender; assets físicos BMD/texturas wings/capes/helpers/pets/mounts; CharacterHelper presentation; names/tooltips; profiling equip rebuild. Nenhum desses foi marcado como fechado.

SAFE LANE / NOT CENTRAL PROMOTION.
