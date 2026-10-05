# 03 — Pipeline de renderização

## Modelos BMD

`MUAssetLoader.loadBMD` compartilha fetch/parse pendente entre consumidores do mesmo caminho. Falhas liberam a tentativa; clearCache invalida resultados pendentes. Cache de memória e registros BMD do IndexedDB são vinculados à raiz Data. Trocar a raiz impede publicar geometria/esqueleto atrasado da origem anterior. O modelo parseado permanece compartilhado e o renderer continua criando seus próprios bones/materials.

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

## Publicação de previews

CharacterPreview prepara body, materiais e anexos sem publicar o grupo na scene. `playerVisualLoadIssues` e partes de classe não resolvidas bloqueiam candidatos incompletos. A geração é conferida novamente após os awaits; `_publishSlot` preserva o owner anterior até o commit, mantém a rotação de inspeção e aplica a pose antes do primeiro draw. Helpers de seleção entram na scene no mesmo commit.
