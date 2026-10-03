# 05 — Itens, inventário, equipamento e storage

## Estado atual

O inventário e o storage são mantidos por mirrors server-authoritative; a UI reflete o estado recebido do servidor e não deve se tornar fonte de verdade.

## Movimento de item

FIX8 migrou o gesto para o modelo PC de **pegar por clique e soltar no segundo clique**, em vez de depender de hold até mouse-up. A confirmação final continua vinculada ao estado do servidor.

## Apresentação no inventário

FIX8/FIX9 ampliaram `RenderObjectScreen`/`AccessModel`, offsets, ângulos, escalas, HideSkin e texturas específicas. O `ItemModelMap` gerado atual contém **533 owners PC** com geração determinística e `skipped=0` no gate FIX9.

## Owners Data/Lua relevantes

- `item_eng.bmd` / `item_por.bmd`;
- CustomItemPosition.lua;
- CustomItemSize.lua;
- bordas.lua;
- CustomJewelStack.lua;
- transparente.lua;
- DisableExcellent.lua;
- CustomItemForce.lua;
- Excellent/Ancient/Set/Socket/Harmony owners;
- CharacterEffectItens/CharacterSetEffect como tabelas de autoridade.

## Já portado

- grid footprint multi-célula;
- slots equipados;
- resolução significativa de modelos para weapon/armor/wing/helper;
- publicação incremental de equipamento;
- storage real sem simulação local;
- regras de quantidade/stack e bordas;
- vários owners de tooltip/dados;
- owner de transparência de item;
- refresh de UI coalescido por frame para bursts de atualização.

## Ainda não completo

1. equivalência física da câmera 3D de inventário;
2. conversão exata de `SizeInventory`, `PosX` e `PosY` em todos os itens;
3. `RenderItemInfo` integral com todas as linhas/cores/opções;
4. fluxos especiais de stack/jewel;
5. CharacterEffectItens/CharacterSetEffect stage children completos;
6. item/material parity item-a-item, incluindo branco/solidez/glow/cortes relatados;
7. teste repetido equipar→tirar→equipar sem desaparecimento ou hitch.
