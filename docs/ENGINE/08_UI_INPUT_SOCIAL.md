# 08 — UI, input e sistemas sociais

## UI atual

`ui2/` contém Main gameplay windows: Inventory, Storage, Character, Chaos Machine, NPC Shop, SkillBar, BuffBar, MoveCustom, Command, StatusBars, Scoreboard e QuickHotkeys. `core/ChatSystem.js` mantém o chat PC owner. Scenes cobrem server-select, login, character select/create, loading e world.

## First-paint/lifecycle

A linha R30–R45 endureceu first-paint atômico, decoded owners, supersession, window generations e lifecycle para impedir flashes de placeholder ou UI velha reaparecendo após troca de scene.

## Input

`core/Input.js`, `game/ClickToMove.js`, `game/Movement.js` e câmera controlam mouse/teclado/movimento. Inventário usa pick/click semantic. F10/F11 e camera owners foram trabalhados em releases anteriores.

## Social

Existem módulos de Party, Trade, Guild, Friends, Duel e PK. A existência do módulo não significa paridade PC completa: cada sistema precisa wire + state + UI + edge cases e teste real.

## Gaps

- janelas PC ainda ausentes ou apenas parcialmente ligadas ao wire;
- tooltip completo;
- alguns diálogos/eventos/sistemas sociais completos;
- visual pixel/geometry parity em todas resoluções;
- drag/click/keyboard focus em casos-limite;
- acessibilidade/browser não pode alterar o comportamento PC de interação.

## Estados de ServerSelect e CharacterSelect

MUSprites inclui Menu (`Interface/server_menu_b_all.OZT`, 3 estados de 54×30) e permite nova carga dos owners ausentes sem repetir owners completos. CharacterSelect exige todos os estados de Create/Delete/Connect/Menu; ServerSelect exige 4 estados de grupo, 3 de servidor e 3 de Register. O board só é publicado com esses owners completos. O encaixe usa o viewport virtual 800×600 existente; não há homologação universal em resoluções físicas.

## Atualização FIX17

MUSprites e os caches de recorte de CharSelectScene/ServerSelectScene pertencem à Data selecionada. Getter, load e strip descartam owners de outra autoridade. Finalizar um decode antigo não pode repintar a interface nova nem fazê-la reportar ready.

FIX19: GameApp._attachClickMovement liga destino ao playerChar consumido pelo movimento autoritativo; raycast mantém altura real, miss não produz destino y=0. Login corrige controles e recorte sem alterar protocolo.
