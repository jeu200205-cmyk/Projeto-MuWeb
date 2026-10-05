# 01 — Arquitetura da engine

## Visão geral

MUWEB é uma reimplementação Web do cliente MU Online PC Main 5.2, com **Three.js r160** no render 3D, JavaScript ES modules no cliente e um gateway Node/WebSocket para o protocolo MU real. O objetivo não é um clone visual aproximado: o projeto mantém ownership PC/source-driven para dados, protocolo, timing, materiais, itens, UI e mapas sempre que a evidência existe.

## Camadas

| Camada | Diretórios principais | Responsabilidade |
|---|---|---|
| Runtime/orquestração | `core/`, `scenes/` | lifecycle, scene switch, boot, state, first paint, transições de mapa |
| Assets/Data | `assets/`, `data/` | BMD/texturas/Data remota, Lua owners, tabelas item/skill/monster, caches |
| Render | `graphics/`, `world/`, `effects2/` | BMD/skinning, materiais, terrain, objetos, câmera, particles/effects |
| Gameplay | `game/`, `skills/`, `progression/` | personagem, movimento, viewport, pets, buffs, inventory mirrors, cast/FX |
| Protocolo | `protocol/`, `net/`, `network/` | wire MU, crypto, router, gateway WebSocket, config |
| UI | `ui/`, `ui2/` | HUD, inventário, storage, skillbar, character, move custom, chat owners |
| Social | `social/` | party, trade, guild, friends, duel, PK |
| Ferramentas/testes | `tools/`, `tests/`, `validation/`, `test-*.mjs` | geração de owners, probes, gates e auditorias de regressão |

## Núcleo de execução

`core/GameApp.js` é o integrador principal: inicializa rede/assets, recebe eventos do router, mantém mirrors server-authoritative, coordena Scene/World, publica personagem/viewport, cria UI e controla teleport/reload. `graphics/Scene.js` e `scenes/SceneManager.js` fazem o ownership visual/lifecycle.

## Princípios estruturais

- **Server authoritative:** posição, inventário, equipamento, storage, stats e eventos entram por pacote real; UI não deve se tornar fonte de verdade.
- **Atomic publish:** mundos e UIs importantes são preparados e só então revelados; geração antiga/superseded deve ser descartada.
- **Fail-closed:** recurso sem owner comprovado não recebe placeholder visual ou lógica inventada.
- **Data root real:** models, textures e Lua são resolvidos a partir da Data selecionada pelo runtime, com variantes normalizadas sem basename guessing arbitrário.
- **Source cross-reference:** comentários e testes preservam referências a `WSclient.cpp`, `ZzzInventory.cpp`, `ZzzObject.cpp`, `ZzzOpenData.cpp`, `ZzzCharacter.cpp` e demais owners PC.
- **Portabilidade incremental com regressão:** cada release mantém gates de versões anteriores em vez de recomeçar o port.

## Dependências runtime declaradas

`package.json` usa `three ^0.160.0` e `ws ^8.21.3`. O projeto foi estruturado para rodar o cliente no browser e o gateway/asset service no Node.
