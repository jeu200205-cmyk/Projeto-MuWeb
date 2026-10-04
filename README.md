# Projeto MuWeb — MU Online Main 5.2 → Web

Port experimental do cliente/engine **MU Online Main 5.2** para JavaScript/WebGL.

**Autoridade publicada:** `MUWEB R90 FIX40 HOTFIX1` — 04/10/2026.

> Este projeto ainda é uma portabilidade parcial. A presença de um sistema ou módulo na árvore não significa paridade 100% com o cliente PC. A referência de comportamento continua sendo a source PC Main 5.2 + Data/Lua reais + protocolo real do servidor.

## Estado da FIX40

A FIX40 preserva os incrementos anteriores e adiciona um fechamento source-backed específico de Icarus (`WD_10HEAVEN`): `Object11` tipos 0–5 deixam de ser renderizados como BMD de cenário e passam a atuar como controladores do burst inicial de `BITMAP_CLOUD`, seguindo o comportamento do PC. A HOTFIX1 corrige somente o bootstrap do pacote, removendo launchers FIX39 herdados; a lógica de jogo/render da FIX40 não foi alterada.

Validação automatizada registrada para esta autoridade:

- manifesto/launcher: **258 arquivos verificados**;
- syntax set da entrega: **307 arquivos**;
- contrato Icarus FIX40: **39 checks PASS**;
- validação visual física em browser/GPU/Data real: **ainda necessária**.

Icarus não deve ser considerado 100% fechado: `MoveObjectOnEffect`, `MoveHeavenThunder`, o owner de `BITMAP_LIGHT` do tipo 10 e outros owners do mapa continuam no backlog.

## Principais áreas já presentes

- carregamento BMD/OZJ/OZT/OZB/ATT e Data real;
- renderer BMD, skinning, materiais, chrome/metal/alpha e owners de bitmap;
- terrain, objetos de mapa, grass, culling e vários contratos map-specific;
- personagens, viewport, NPCs, monstros, inventário, equipamentos e storage;
- itens, materiais, Excellent/Ancient/Socket/Harmony e owners Lua/custom;
- skills/cast/VFX em evolução;
- login, ConnectServer/GameServer, gateway WebSocket↔TCP e roteamento MU;
- HUD/UI/chat/social e click-to-move;
- testes Node/WebGL e ferramentas de validação.

Consulte a matriz atual em [`docs/ENGINE/11_PORTABILITY_STATUS.md`](docs/ENGINE/11_PORTABILITY_STATUS.md) e as pendências em [`docs/ENGINE/12_REMAINING_PORTS.md`](docs/ENGINE/12_REMAINING_PORTS.md).

## Como executar no Windows

### Requisitos

- Windows;
- Node.js com npm;
- uma pasta `Data` compatível do cliente MU;
- GameServer/ConnectServer externos para conexão real.

### Inicialização

1. Extraia/clone a source completa.
2. Execute `INSTALAR_DEPENDENCIAS_R90.bat`.
3. Execute **somente** `LIGAR_WEB_R90_FIX40.bat`.
4. Informe a Data quando solicitado, ou configure `MUWEB_OFFICIAL_CLIENT_ROOT` / `MUWEB_OFFICIAL_DATA`.
5. Para encerrar os processos Node desta source, execute `DESLIGAR_WEB_R90_FIX40.bat`.

A Data completa e os executáveis de servidor MU **não são distribuídos neste repositório**.

## Verificação

```bash
npm ci
node tools/start-r90-fix40-safe.cjs --verify-only
node tools/test-fix40-runtime.mjs
```

Para fixtures WebGL, use o servidor de desenvolvimento e abra as páginas em `tests/` conforme a documentação de validação.

## Estrutura

- `assets/`, `graphics/`, `world/`: assets, modelos, materiais, terrain e render do mundo;
- `core/`, `game/`, `scenes/`: runtime, gameplay e cenas;
- `data/`, `database/`: owners/configurações e dados gerados;
- `network/`, `protocol/`, `net/`: gateway, wire e protocolo;
- `skills/`, `effects2/`: skills e efeitos;
- `ui/`, `ui2/`, `social/`: HUD, janelas e sistemas sociais;
- `tests/` e `test-r90-fix*.mjs`: regressões e fixtures;
- `tools/`: launch/verify/generators e utilitários;
- `docs/ENGINE/`: documentação técnica da engine e da portabilidade.

## Documentação técnica

Comece por [`docs/ENGINE/00_INDEX.md`](docs/ENGINE/00_INDEX.md). A documentação cobre arquitetura, boot, render, mapas, itens, protocolo, skills, UI, Data/Lua, performance, status, backlog, testes e manutenção do GitHub.

Notas desta publicação: [`docs/ENGINE/16_FIX40_RELEASE_NOTES.md`](docs/ENGINE/16_FIX40_RELEASE_NOTES.md).

## Política de fidelidade

Não preencher lacunas com placeholders que pareçam “funcionar”. Quando um owner PC não estiver provado, a implementação deve permanecer explícita/fail-closed até existir evidência da source PC, Data/Lua, wire real ou validação física correspondente.

## Segurança

Não versione `.env`, credenciais, senhas, dumps, Data proprietária completa ou segredos de servidor. Serviços de desenvolvimento devem permanecer locais até receberem hardening apropriado.

## Licença e conteúdo do jogo

Este repositório contém o código desta adaptação. Assets/Data e executáveis proprietários do jogo não são fornecidos aqui; use apenas conteúdo que você tenha direito de utilizar.
