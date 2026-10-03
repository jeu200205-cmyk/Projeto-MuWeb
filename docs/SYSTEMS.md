# Sistemas da source

A presença de um módulo indica somente que existe uma base de implementação. Não significa sistema completo.

| Área | Principais caminhos | Estado |
|---|---|---|
| Boot/game loop | `core/`, `scenes/` | base incompleta |
| BMD/modelos | `graphics/BmdParser.js`, `BmdAdapter.js`, `assets/MUModelRenderer.js` | parcial |
| Texturas/materials | `assets/MUTextureManager.js`, `graphics/ItemMaterialPresentation.js` | parcial |
| Terrain/mapas | `graphics/MuTerrain.js`, `world/TerrainWorld.js`, `world/TerrainObjectWorld.js` | parcial |
| Personagem | `game/Character.js`, `graphics/PlayerComposer.js` | parcial |
| Monstros/NPCs | `game/Monster*.js`, `game/NpcModel.js` | parcial |
| Movimento/path | `game/Movement.js`, `ClickToMove.js`, `world/Pathfinding.js` | parcial |
| Viewport | `game/PlayerViewportManager.js` | parcial |
| Inventário/equipamento | `game/InventoryGrid.js`, `ui2/InventoryWindow.js`, `data/CharacterEquipmentCodec.js` | parcial |
| Skills/FX | `skills/`, `game/SkillEffects.js`, `effects2/` | inicial/parcial |
| UI/HUD | `ui/`, `ui2/` | inicial/parcial |
| Social | `social/` | inicial/parcial |
| Protocolo | `protocol/` | parcial |
| Gateway | `gateway-server.cjs`, `network/`, `net/` | base de integração |
| Database | `database/` | base auxiliar |
| Áudio | `audio/` | inicial |
