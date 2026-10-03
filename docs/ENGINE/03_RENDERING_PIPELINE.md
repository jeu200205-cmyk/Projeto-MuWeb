# 03 — Pipeline de renderização

## Modelos BMD

- `assets/MUModelRenderer.js` é o renderer BMD principal.
- `graphics/BmdParser.js` e `graphics/BmdAdapter.js` fazem parsing/adaptação.
- Skinning/bind pose, bone matrices, animation retirement e uploads foram endurecidos em várias releases.
- Texturas só são publicadas após decode real; ausência mantém mesh oculta/fail-closed.

## Materiais

`graphics/ItemMaterialPresentation.js`, owners Lua bitmap e oracle nativo dão suporte a modos PC como normal, alpha, chrome/metal e overrides de bitmap. O pipeline já removeu vários white-item fallbacks, mas ainda existem exceções fixed-function/model-specific a fechar e validar fisicamente.

## Personagens

`graphics/PlayerComposer.js`, `graphics/CharacterPreview.js`, `data/PcPlayerBodyModelMap.js` e `data/CharacterEquipmentCodec.js` compõem body/equipment. Equipamento stock usa owners de Player/OpenPlayers, não `Item/*.bmd` genérico.

## Itens 3D

`ui2/ItemIconRenderer.js` compartilha BMD/material owners com regras próprias de `RenderObjectScreen`, HideSkin, posição, escala, ângulo e texturas de inventário. O caminho não é equivalente a simplesmente renderizar o world model em miniatura.

## Efeitos

Existem dois níveis: effects genéricos do engine e ports exatos de famílias PC em `game/Pc*` + `game/PCSkillEffectsPackA.js`. Efeitos stage-specific ainda sem owner não devem cair num glow genérico.

## Problemas ainda possíveis

- blend/alpha/fixed-function edge cases;
- itens com owner dinâmico Lua não interpretado;
- stage children de CharacterEffectItens/CharacterSetEffect;
- meshes especiais com HideSkin/StreamMesh/BlendMesh ainda não catalogados;
- diferenças GPU/browser que só o teste físico revela.
