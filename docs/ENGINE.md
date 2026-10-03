# Engine

## Visão geral

A source é uma base de cliente MU no navegador. O browser executa a cena, renderização, UI, input, lógica local e decodificação dos dados. Quando há servidor MU real, um gateway local converte WebSocket do browser para TCP do protocolo MU.

Fluxo simplificado:

```text
index.html
  -> core/GameApp.js
  -> scenes/SceneManager.js
     -> ServerSelectScene / LoginScene / CharSelectScene / WorldScene
  -> graphics/Scene.js
  -> world/TerrainWorld.js + world/TerrainObjectWorld.js
  -> game/Character.js / Monster.js / NpcModel.js
  -> ui + ui2
  -> protocol/network
```

## Renderização

A renderização usa Three.js como backend WebGL. Os módulos principais são:

- `graphics/BmdParser.js`: leitura de BMD;
- `graphics/BmdAdapter.js`: adaptação do modelo para a engine Web;
- `assets/MUModelRenderer.js`: construção/render de modelos;
- `assets/MUTextureManager.js`: texturas;
- `graphics/ItemMaterialPresentation.js`: material/apresentação de item;
- `graphics/PlayerComposer.js`: composição visual do personagem;
- `graphics/CharacterPreview.js`: preview 3D usado por telas/UI;
- `graphics/Scene.js`: cena e integração de render.

A paridade de materials, blend, alpha, chrome, meshes ocultas e efeitos ainda é incompleta.

## Mundo e mapas

- `world/TerrainWorld.js`: terrain;
- `graphics/MuTerrain.js`: construção/render do terreno;
- `world/TerrainObjectWorld.js`: objetos do mapa;
- `world/MapManager.js`: seleção e lifecycle de mapas;
- `world/AttMapLoader.js`: atributos/colisão do mapa;
- `world/Pathfinding.js`: navegação;
- `world/PcMapObjectVisuals.js`: regras visuais portadas da referência PC.

O carregamento de mapas existe, mas ainda precisa de bastante trabalho para obter fidelidade visual e performance equivalentes ao cliente PC.

## Loop de jogo e entidades

- `core/GameApp.js`: lifecycle principal;
- `core/Input.js`: entrada;
- `core/Timer.js`: tempo;
- `game/Character.js`: personagem;
- `game/Monster.js`, `MonsterManager.js`, `MonsterModel.js`: monstros;
- `game/NpcModel.js`: NPCs;
- `game/PlayerViewportManager.js`: atores recebidos pelo viewport;
- `game/Movement.js`, `ClickToMove.js`: movimento;
- `game/PetSystem.js`: base de pets.

## Dados

A pasta `data/` contém tabelas e owners usados pela engine para resolver classes, itens, modelos, textos, skills e configurações. Parte dela foi derivada da lógica necessária para reproduzir o comportamento observado no Main 5.2 e nos dados do cliente usados durante o desenvolvimento.

Ela não substitui a pasta Data real do cliente.
