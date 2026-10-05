# 04 — Mapas, terrain e objetos

## Terrain

`graphics/MuTerrain.js`, `world/TerrainWorld.js` e `world/AttMapLoader.js` carregam altura OZB, attributes/walls, light e tiles. Slots de tile seguem ownership PC e assets ausentes são reportados sem inventar textura substituta.

## EncTerrain / ObjectN

`world/TerrainObjectWorld.js` transforma placements `EncTerrainN.obj` em modelos `ObjectN/ObjectXX.bmd`. O caminho usa batching, spatial culling e regras por mapa.

## FIX9 — controladores ocultos

A FIX9 adiciona regras `HiddenMesh=-2` derivadas da source PC para famílias em Lorencia, Dungeon, Devias, Noria, Lost Tower, Stadium, Atlans e Tarkan. Objetos que no PC são controladores/emissores não devem aparecer como blocos/árvores/paredes crus. Quando a skeleton ainda é necessária para um efeito filho, o renderer pode existir com meshes ocultas.

## FIX40 — Icarus Object11 0–5

A FIX40 porta o ramo `WD_10HEAVEN` de `ZzzObject.cpp::RenderObjectVisual` para `Object11` tipos 0–5. Esses placements emitem uma rajada inicial de `BITMAP_CLOUD` e imediatamente recebem `HiddenMesh=-2`; portanto o BMD cru nunca é um fallback visual válido. A contagem é 20 para tipos 0–2 e 10 para 3–5, com subtipo igual ao tipo, `Effect/clouds.OZJ`, luz 0.1/0.1/0.1 e escala/posição do objeto. Permanecem abertos os child effects aleatórios `BITMAP_CLOUD+1`/`BITMAP_JOINT_THUNDER`, o `MoveHeavenThunder` global e outros owners de Icarus não incluídos neste ramo.

## Já portado

- World1/Lorencia terrain + milhares de placements;
- World2/Dungeon;
- World3/Devias;
- World4/Noria;
- World5/Lost Tower;
- Atlans water owner;
- vários visual owners de Stadium/Tarkan/Icarus e World75;
- map registry, routing, MoveCustom e commit atômico;
- culling/batching/multidraw fallbacks.

## Restante explícito

- `BITMAP_MAPGRASS` e billboards/vegetação específicos;
- famílias map-specific ainda não materializadas (incluindo alguns child emitters/particles);
- objetos/modelos realmente ausentes na Data;
- remaining implicit StreamMesh UV branches;
- Blood Castle/event maps e demais GM*/RenderObjectVisual owners não cobertos;
- validação mapa-a-mapa física, especialmente geometrias gigantes, z-order/transparência e FPS durante cold load.
## Atualização FIX11 — frame de transição

O carregamento cruzado continua staged/atômico e não publica terrain/ObjectN parciais. Durante a espera, o Web reapresenta um frame congelado do mapa real anterior. O caminho principal copia o framebuffer para textura. Se o navegador ou driver rejeitar essa operação, a FIX11 copia o canvas WebGL já apresentado para um canvas 2D e o reapresenta pelo mesmo quad de tela cheia. Isso evita depender de `preserveDrawingBuffer=false`, cujo conteúdo pode ser descartado e aparecer preto. O fallback não desenha mapa, terreno ou cor inventados.

Os dois caminhos liberam textura, geometria e material ao confirmar ou cancelar a transação. A equivalência de bytes foi verificada em WebGL software, inclusive com rejeição forçada da cópia direta. Ainda é necessária validação física nas GPUs e mapas do usuário.

## Residência da luz World75

O estágio de terrain em `GameScene.loadRealMap` consulta `acceptContinue` antes e depois de construir o terreno, além dos checkpoints existentes de ObjectN. Uma troca já obsoleta retorna antes do fetch; se ficar obsoleta durante o terrain, o resultado é descartado pelo cleanup existente antes do estágio ObjectN.

`PcWorld75LightTexture.js` mantém o recurso real `Effect/flare01.OZJ` de BITMAP_LIGHT. Falhas de decode não permanecem em cache: uma nova entrada no mapa pode tentar novamente. A raiz Data participa da chave e decode atrasado de outra raiz é descartado. Sprites existentes mantêm suas referências até a retirada do World; escala, cor, animação e blend dos owners 79/80 continuam definidos pelo renderer e pelo código PC.

## Character scene

WorldActive=74 usa World75/Object75. A carga de objetos aplica slices de trabalho de 12 ms e `shouldContinue` por geração/cameraMode. A saída da cena cancela o trabalho cooperativo; terrain e objects continuam publicados juntos. Isso não demonstra todas as famílias visuais de World75 nem dos destinos dinâmicos de CustomMove.

FIX19: PcIndoorVisibility.js porta HeroTile via L1, Lorencia125/126 e Devias81/82/96/98/99; Alpha por tick40ms. MuTerrain divide grama em regiões32x32 preservando atributos e índices, com bounds para vento.
