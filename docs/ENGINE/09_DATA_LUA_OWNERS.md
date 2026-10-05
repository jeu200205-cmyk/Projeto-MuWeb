# 09 — Data e Lua owners

## Regra

A Data real do cliente é autoridade runtime. Parsers Web só promovem uma tabela quando reconhecem seu contrato. Arquivo existente mas com sintaxe dinâmica não suportada não deve gerar row inventada.

## Owners atuais relevantes

- item/monster/skill tables geradas e BMD data;
- `CurrentClientItemOwners`;
- `CurrentClientMonsterOwners`;
- `CustomItemModelMap`;
- `CustomItemPresentation`;
- `ItemUiLuaConfig`;
- `ItemEffectsLuaConfig`;
- `ItemTransparencyLua`;
- `MoveCustomLua`;
- `DisableExcellentLua`;
- `CustomItemForceLua`;
- `CustomItemFloorLua`;
- bitmap Lua owners/VM;
- ElementSlots;
- GlobalText;
- PcAdvancedItemOwners/PcItemSetOwners.

## Limites

Lua dinâmico (loops, variáveis, condições, funções indiretas ou LoadImageByDir não reconhecido) pode permanecer não portado. O próximo trabalho deve ampliar o parser/VM quando houver source/contract, não substituir o valor final manualmente.
