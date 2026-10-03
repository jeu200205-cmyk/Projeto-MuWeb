# Estrutura da source

```text
assets/       carregadores e renderers de assets
audio/        áudio
core/         aplicação, input, timer e chat
data/         tabelas, resolvers e configurações
database/     base auxiliar de persistência
effects2/     efeitos adicionais
game/         entidades, movimento, inventário, pets, buffs e FX
graphics/     BMD, câmera, scene, terrain e composição visual
net/          cliente WebSocket
network/      infraestrutura/configuração de rede
progression/  progressão em estágio inicial
protocol/     codec, crypto, opcodes e roteamento MU
scenes/       telas e WorldScene
skills/       skills
social/       party, guild, trade, duel, friends e PK
ui/           UI base
ui2/          HUD e janelas
vendor/       dependências vendorizadas/licenças
world/        mapas, terrain, objetos, pathfinding e partículas
tools/        servidores locais mínimos
public/       manifesto usado pela base
```

Na raiz: `index.html`, `runtime-config.js`, `gateway-server.cjs`, `ui.js`, `math.js` e `package.json`.

Arquivos históricos de checkpoint, patches, logs e launchers antigos não fazem parte da publicação limpa.
