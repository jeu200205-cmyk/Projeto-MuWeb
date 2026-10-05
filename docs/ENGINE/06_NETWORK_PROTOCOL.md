# 06 — Rede e protocolo

## Topologia

Browser ↔ WebSocket gateway Node ↔ ConnectServer/GameServer MU. O gateway existe porque o browser não fala TCP MU diretamente.

## Componentes

- `protocol/RealMUProtocol.js`: criação/envio de packets e transport owner.
- `protocol/MUPacketRouter.js`: dispatch/parsing de pacotes recebidos.
- `protocol/MUCrypto.js` / `Crypto.js`: crypto/Bux/SimpleModulus owners.
- `network/MUGateway.js` e `network/MUServerManager.js`: bridge TCP/WebSocket e lifecycle.
- `net/WSClient.js`: cliente WebSocket do browser.

## Famílias já tratadas

ConnectServer F1/F4, Character F3 (char list/create/delete/join/inventory/equipment/magic list/stats/custom preview e outros), life/mana/buffs, chat/whisper, viewport 0x12/0x13/0x14, move/position/action/attack, magic 0x19/1A/1B/1E, teleport 0x1C, ground items 0x20–0x23, equipment item 0x24, inventory delete 0x28, NPC talk, storage 0x81–0x84, weather/notice e partes de IGS/PeriodItem.

## Política de parsing

Tamanho/layout não comprovado deve ser rejeitado; pacotes conhecidos sem parser podem ser retidos/logados, mas não interpretados por heurística. O router mantém lista de subcodes F3 conhecidos da source PC para distinguir “parser pendente” de “default ignorado pelo PC”.

## Gaps de protocolo

- alguns F3 conhecidos ainda têm parser pendente;
- sistemas sociais/eventos específicos precisam cobertura end-to-end;
- Dark Spirit e outras ações especiais só podem ser promovidas após wire byte-exato;
- guild storage permanece sem owner completo;
- IGS/custom families além das já materializadas;
- reconnect/timeout precisa continuar sendo testado sob falha real de socket/GS.
