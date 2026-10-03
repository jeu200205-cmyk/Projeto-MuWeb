# 04 — Mapas, terrain e objetos

## Terrain

`graphics/MuTerrain.js`, `world/TerrainWorld.js` e `world/AttMapLoader.js` carregam altura OZB, attributes/walls, light e tiles. Slots de tile seguem ownership PC e assets ausentes são reportados sem inventar textura substituta.

## EncTerrain / ObjectN

`world/TerrainObjectWorld.js` transforma placements `EncTerrainN.obj` em modelos `ObjectN/ObjectXX.bmd`. O caminho usa batching, spatial culling e regras por mapa.

## FIX9 — controladores ocultos

A FIX9 adiciona regras `HiddenMesh=-2` derivadas da source PC para famílias em Lorencia, Dungeon, Devias, Noria, Lost Tower, Stadium, Atlans e Tarkan. Objetos que no PC são controladores/emissores não devem aparecer como blocos/árvores/paredes crus. Quando a skeleton ainda é necessária para um efeito filho, o renderer pode existir com meshes ocultas.

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
