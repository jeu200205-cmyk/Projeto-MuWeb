# Sistemas da source

A tabela abaixo descreve onde cada área está localizada. **“Existe” significa apenas que há uma base de implementação; não significa sistema finalizado.**

| Área | Principais caminhos | Estado geral |
|---|---|---|
| Boot/game loop | `core/`, `scenes/` | base funcional, incompleta |
| BMD/modelos | `graphics/BmdParser.js`, `BmdAdapter.js`, `assets/MUModelRenderer.js` | parcial |
| Texturas/materials | `assets/MUTextureManager.js`, `graphics/ItemMaterialPresentation.js` | parcial |
| Terrain/mapas | `graphics/MuTerrain.js`, `world/TerrainWorld.js`, `world/TerrainObjectWorld.js` | parcial |
| Personagem | `game/Character.js`, `graphics/PlayerComposer.js` | parcial |
| Monstros/NPCs | `game/Monster*.js`, `game/NpcModel.js` | parcial |
| Movimento/path | `game/Movement.js`, `ClickToMove.js`, `world/Pathfinding.js` | parcial |
| Viewport | `game/PlayerViewportManager.js`, `game/ViewportActorSemantics.js` | parcial |
| Inventário | `game/InventoryGrid.js`, `data/Inventory.js`, `ui2/InventoryWindow.js` | parcial |
| Equipamentos | `data/CharacterEquipmentCodec.js`, `graphics/PlayerComposer.js` | parcial |
| Itens | `data/Item*.js`, `data/*Item*Owner*.js` | parcial |
| Skills | `skills/`, `game/SkillEffects.js`, `game/PCSkillEffectsPackA.js` | inicial/parcial |
| Buffs | `game/BuffSystem.js`, `ui2/BuffBar.js` | inicial/parcial |
| FX | `graphics/Effects.js`, `effects2/`, `game/Pc*Impact.js` | inicial/parcial |
| UI/HUD | `ui/`, `ui2/` | inicial/parcial |
| Chat/social | `core/ChatSystem.js`, `social/` | inicial/parcial |
| MoveCustom | `ui2/MoveCustomWindow.js`, `data/MoveCustomLua.js` | parcial |
| Áudio | `audio/`, `assets/MUSoundManager.js` | inicial |
| Protocolo | `protocol/` | parcial |
| Gateway | `gateway-server.cjs`, `network/`, `net/` | base de integração |
| Database | `database/` | base auxiliar, não é um stack MU completo |
| Progressão | `progression/` | inicial |

## Regra importante

Esta source é um ponto de partida. Muitas classes existem porque uma parte do fluxo já foi pesquisada/implementada, mas ainda faltam branches, estados, efeitos, validação visual, comportamento de rede e integração final.
