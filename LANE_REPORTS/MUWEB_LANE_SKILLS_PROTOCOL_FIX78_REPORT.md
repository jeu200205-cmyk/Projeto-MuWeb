# MUWEB Skills / Gameplay / Monsters / Bosses / Protocol / Viewport — SAFE FIX78 from central FIX77

## Parent / overlap
Parent exato: `MUWEB_R90_FIX77_ITEM_LUA_FX_CACHE_2026-10-05_FULL.zip`, CURRENT_AUTHORITY da Library antes da edição. FIX77 integra ITEMS_LUA FIX77 e MAPS_ENGINE M74. Esta lane não toca esses owners e não promove central.

## Evidência PC Main 5.2 / fechamento
`PRECEIVE_HELPER_ITEM` após opcode 0x29 é `[Index][TimeLE16]`, exatamente 3 bytes. O owner `ReceiveHelperItem` aceita Index 0..2 e converte `Time` para lifetime de animação `Time*24`. A web agora faz gate exato de 3B, rejeita index fora de 0..2 antes do callback e publica `{index,time,animationTicks}` server-authoritative.

## Matriz de cobertura
| Área | Estado nesta lane |
|---|---|
| 0x29 ReceiveHelperItem | FECHADO: 3B exatos; Index 0..2; Time LE16; animationTicks=Time*24 |
| F3:06 / FriendList / F3:22 / F3:23 / F3:51 / F3:52 | preservados, não refeitos |
| F3:24 | aberto: MAX_ID_SIZE/padding físico ainda não fechado |
| F3:25 | PC no-op/comentado; nenhum FX inventado |
| 0x19/1A/1E/1B ReceiveMagic | preservado; residual visual somente com graph PC completo |
| BK/SM/Elf/MG/DL/Summoner | sem alteração especulativa |
| Monster/boss / CustomMonsterEffect | preservado; sem model/bitmap/joint/particle inventado |

## Changed files
- `protocol/MUPacketRouter.js`
- `tests/fix78/test-0x29-helper-item-contract.mjs`
- `MUWEB_LANE_SKILLS_PROTOCOL_FIX78_REPORT.md`

## Limitações / próximo tranche
Próximo: outro lifecycle/packet com struct física exata, ou ReceiveMagic/monster-boss owner com stages/bones/lifetimes comprovados. Não preencher F3:24/F3:25 nem FX residual por inferência.
