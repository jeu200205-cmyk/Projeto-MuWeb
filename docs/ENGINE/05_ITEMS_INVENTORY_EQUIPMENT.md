# 05 — Itens, inventário, equipamento e storage

## Estado server-authoritative

- `game/ServerInventoryMirror.js`: snapshot/update/delete/move do inventário.
- `game/ServerStorageMirror.js`: warehouse real.
- `data/PacketItemCodec.js`: item packet decoding.
- `core/GameApp.js`: aplica F3:10, F3:13, F3:14, 0x24 e 0x28 e coordena refresh visual.

## Movimento de item

FIX8 migrou o gesto para o modelo PC de **pegar por clique e soltar no segundo clique**, em vez de depender de hold até mouse-up. `game/PcInventoryMoveRules.js` e a UI preservam destino wire/top-left, overlay rules e confirmação do servidor.

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
- wing/helper/weapon/armor model resolution significativo;
- server equipment publication incremental;
- storage real sem simulação local;
- quantity/jewel stack number rules;
- item borders;
- várias tooltip/data owners;
- item transparency owner;
- refresh coalescido por frame para bursts de pacote.

## Ainda não completo

1. equivalência física da câmera 3D de inventário `NewUI3DRenderMng/CreateScreenVector` de 1 grau;
2. conversão exata de `SizeInventory`, `PosX` e `PosY` em todos os itens;
3. `RenderItemInfo` integral com todas linhas/cores/options/380/socket/harmony/set/excellent/requirements/value;
4. JewelStack split e fluxos especiais que usam `SendRequestUse`/4C:81;
5. CharacterEffectItens/CharacterSetEffect stage children completos;
6. item/material parity item-a-item, incluindo branco/solidez/glow/cortes relatados;
7. teste repetido equipar→tirar→equipar sem desaparecimento ou hitch.


## Atualização FIX10

FIX10 preserva HideSkin/AccessModel e aplica BodyHeight na pose após o bind. Ícones têm margem de recorte sem escala; caches dependem da raiz Data e só publicam texturas selecionadas completas. Slots conectados têm até 3 tentativas. Passes nativos excluídos por HideSkin não buscam bitmap.

## Dependências de material

Os programas nativos RenderModel também exigem suas texturas implícitas Chrome/Shiny. Uma dependência ausente entra em `pendingBitmapPaths`: o ícone não é armazenado como completo e a troca do grafo do personagem aguarda a residência. O cache de texturas especiais distingue a raiz Data e rejeita conclusão de carregamento da raiz anterior. Falhas de imagem permanecem recuperáveis, sem pixels substitutos. A verificação não equivale à cobertura visual de todas as famílias de materiais.

FIX13 estende o mesmo contrato ao caminho stock de +nível/Ancient/Set e aos ramos sólidos representados de RenderPartObjectEffect. A dependência é registrada por item, inclusive quando várias peças de corpo usam o mesmo renderer. O ramo especial carrega somente Chrome/Shiny selecionado pela condição PC; itens sem ramo deixaram de provocar três buscas desnecessárias. Chrome02 e Shiny não recebem mais Chrome01 como substituto silencioso.

FIX14 filtra os meshes antes de criar dependências ou passes especiais e respeita os casos exatos Level==2/3 do Potion+27. Os passes de Helper+15 e Event+11 usam `BITMAP_CHROME+1`, cujo arquivo é `Effect/bab2.OZJ`, LINEAR/REPEAT; ele é distinto de `BITMAP_CHROME2`/Chrome02. Textura ausente não vira pass Chrome/Metal sobre a textura difusa.

## Atualização FIX17

Composição de classe e equipamento incluem a Data selecionada nas chaves de cache. Cargas invalidadas por troca de Data/clear são rejeitadas antes de cache/publicação. A assinatura do CharacterPreview também inclui Data, mantendo a transação de publicação da FIX16.
