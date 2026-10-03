# Engine

## Visão geral

A source é uma base de cliente MU no navegador. O browser executa cena, renderização, UI, input, lógica local e decodificação de dados. Quando há servidor MU real, um gateway local converte WebSocket do browser para TCP do protocolo MU.

Fluxo principal:

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

A renderização usa Three.js como backend WebGL. `graphics/BmdParser.js` e `graphics/BmdAdapter.js` lidam com BMD; `assets/MUModelRenderer.js` e `MUTextureManager.js` fazem parte do pipeline visual; `graphics/PlayerComposer.js` compõe personagem/equipamentos; `world/` concentra terrain, objetos, mapas e pathfinding.

A fidelidade de materials, blend, alpha, chrome, animações, efeitos e objetos de mapa ainda é incompleta.
