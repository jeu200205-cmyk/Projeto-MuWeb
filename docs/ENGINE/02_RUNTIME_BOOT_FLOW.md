# 02 — Boot e fluxo runtime

## Sequência de alto nível

1. Launcher Windows seleciona/configura Data e sobe os serviços locais.
2. `GameApp.init()` inicializa input, SceneManager, rede, asset service e owners críticos.
3. `RemoteAssets` indexa o Data root e loaders aquecem recursos de Login/World95/World75/World1.
4. ConnectServer real fornece server list e destino GameServer.
5. Login/Character Select usam pacotes reais e World75 real.
6. Ao selecionar personagem, o GameServer envia inventário, magic list, custom preview, viewport e join-map.
7. `loadRealMap()` carrega terrain/ATT/tiles/ObjectN, faz staging e commit atômico.
8. Hero/equipment/UI são publicados e o loop entra em steady state.

## Transições de mapa

O fluxo atual trata `0x1C` como autoridade do destino. Gerações de teleport obsoletas são canceladas; same-world pode reutilizar assets; cross-world passa por staging. FIX8/FIX9 adicionam prefetch de MoveCustom e reduzem trabalho de objetos que no PC são controladores ocultos.

## Character Select

World75, preview BMD, equipamento e UI seguem a mesma política de owner real. Ainda há gaps explícitos de skin/modelo específicos e de efeitos/vegetação do World75; não são substituídos por arte genérica.

## Falhas de boot

Falha de asset, modelo ou textura deve aparecer como log/owner ausente. O runtime não deve marcar um mundo como completo se há `missingModels` ou publicar textura sem pixels decodificados.
