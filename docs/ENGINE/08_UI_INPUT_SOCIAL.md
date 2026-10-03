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
