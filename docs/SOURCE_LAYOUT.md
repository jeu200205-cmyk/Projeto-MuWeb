# Estrutura da source

```text
assets/       carregadores/renderers de assets
 audio/        áudio e soundboard
 core/         aplicação, input, timer e chat
 data/         tabelas/resolvers/configurações da engine
 database/     base auxiliar de persistência
 effects2/     efeitos adicionais
 game/         entidades, movimento, inventário, pets, buffs e FX
 graphics/     BMD, câmera, scene, terrain e composição visual
 net/          cliente WebSocket simples
 network/      infraestrutura/configuração de rede
 progression/  sistemas de progressão em estágio inicial
 protocol/     codec, crypto, opcodes e roteamento MU
 scenes/       telas e WorldScene
 skills/       dados/roteamento de skills
 social/       party, guild, trade, duel, friends e PK
 ui/           primitives/UI base
 ui2/          HUD e janelas de jogo
 vendor/       dependências vendorizadas e licenças
 world/        mapas, terrain, objetos, pathfinding e partículas
 tools/        servidores locais mínimos para desenvolvimento
 public/       manifesto usado pela base
```

Arquivos principais na raiz:

- `index.html`: entrada do browser;
- `runtime-config.js`: URLs runtime;
- `gateway-server.cjs`: bridge WebSocket ↔ TCP MU;
- `ui.js`: integração de UI;
- `math.js`: helpers matemáticos;
- `package.json`: dependências/scripts.

Os arquivos históricos de checkpoint, patches, logs e launchers antigos não fazem parte desta publicação limpa.
