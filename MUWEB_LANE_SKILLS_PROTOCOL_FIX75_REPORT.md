# MUWEB Skills / Gameplay / Protocol / Viewport — SAFE FIX75 from central FIX74

## Parent / overlap
Parent exato: `MUWEB_R90_FIX74_ICARUS_SPEAR_JOINT_LORENCIA_2026-10-05_FULL.zip` (CURRENT_AUTHORITY da Library no início desta tranche). Não integra nem promove central. Não toca ITEMS_LUA/MAPS_ENGINE.

## Fechamento
F3:22 `ReceiveWTTimeLeft` agora tem parser fail-closed e snapshot server-authoritative. Main 5.2 `PMSG_MATCH_TIMEVIEW` declara `PBMSG_HEADER`, `BYTE m_subCode`, `BYTE m_Type`, `WORD m_Time`; `ReceiveWTTimeLeft` copia somente `m_Time` e `m_Type` para `g_wtMatchTimeLeft`. Sob o layout MSVC default preservado pela mesma linhagem, o body pós-subcode é exatamente 4 bytes: Type, pad de alinhamento, WORD Time LE. Qualquer corpo truncado ou com trailer é rejeitado antes do callback.

## Cobertura
| Família | Estado nesta lane |
|---|---|
| F3:22 WT time-left | FECHADO: 4B exatos, Type + Time server-authoritative |
| F3:06 / C0 FriendList | preservados; não refeitos |
| F3:51 / F3:52 | preservados |
| 0x19/1A/1E/1B ReceiveMagic | preservados; nenhum FX especulativo |
| BK/SM/Elf/MG/DL/Summoner FX | sem alteração sem nova evidência exata |
| Monster/boss / CustomMonsterEffect | preservado; sem modelo/bitmap/joint/particle inventado |

## Changed files
- `protocol/MUPacketRouter.js`
- `tests/fix75/test-f3-22-wt-time-left-contract.mjs`
- `MUWEB_LANE_SKILLS_PROTOCOL_FIX75_REPORT.md`

## Limitações / próximo tranche
F3:23/24/25 continuam sem parser nesta lane. F3:24 tem struct conhecida, mas deve ser fechado somente após confirmar MAX_ID_SIZE e padding físico da autoridade exata. F3:25 possui x/y conhecidos, porém o handler PC está comentado/no-op; não criar FX. Próximo tranche: outro F3/viewport lifecycle com wire físico completamente comprovado ou ReceiveMagic/monster attack owner com graph PC completo.
