# 06 — Rede e protocolo

## Topologia

Browser ↔ WebSocket gateway Node ↔ ConnectServer/GameServer MU. O gateway existe porque o browser não fala TCP MU diretamente.

## Componentes

- `protocol/RealMUProtocol.js`: criação/envio de pacotes e transport owner.
- `protocol/MUPacketRouter.js`: dispatch/parsing de pacotes recebidos.
- `protocol/MUCrypto.js` / `Crypto.js`: owners de crypto.
- `network/MUGateway.js` e `network/MUServerManager.js`: bridge TCP/WebSocket e lifecycle.
- `net/WSClient.js`: cliente WebSocket do browser.

## Famílias já tratadas

ConnectServer, Character F3, life/mana/buffs, chat/whisper, viewport, move/position/action/attack, magic, teleport, ground items, equipment item, inventory delete, NPC talk, storage, weather/notice e partes de IGS/PeriodItem.

## Política de parsing

Tamanho/layout não comprovado deve ser rejeitado; pacotes conhecidos sem parser podem ser retidos/logados, mas não interpretados por heurística.

## Gaps de protocolo

- alguns F3 conhecidos ainda têm parser pendente;
- sistemas sociais/eventos específicos precisam cobertura end-to-end;
- ações especiais só podem ser promovidas após wire byte-exato;
- guild storage permanece sem owner completo;
- IGS/custom families além das já materializadas;
- reconnect/timeout precisa continuar sendo testado sob falha real de socket/GS.
