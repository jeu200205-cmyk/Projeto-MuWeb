# MUWEB R90 — PC Main 5.2 → Web Engine

Checkpoint documentado: **R90 FIX9**.

MUWEB é uma engine/cliente Web para MU Online baseada em portabilidade source-driven da Main PC 5.2. O runtime usa Three.js r160, Data real do cliente, protocolo MU real através de gateway WebSocket e política de **sem placeholders inventados**.

## Estado rápido

A base atual possui pipeline real de assets/BMD/terrain, login/character/world, viewport, inventário/equipamento/storage, MoveCustom, UI principal, vários materiais/owners Lua, skills/FX parciais e otimizações de batching/culling. Ainda existem gaps visuais e funcionais importantes; consulte [Portability Status](docs/ENGINE/11_PORTABILITY_STATUS.md) e [Remaining Ports](docs/ENGINE/12_REMAINING_PORTS.md).

## Documentação

Comece em **[docs/ENGINE/00_INDEX.md](docs/ENGINE/00_INDEX.md)**.

## Validação do checkpoint preparado

- FIX9 focused gate: **12/12 PASS**
- production syntax: **184/184 PASS**
- production tree digest: `7ba01b6d9a6a95b3adc49189d001dfeff7c3c2dcbd2799c3b216affffdec4b92`

## Política de fidelidade

Source PC limpa, Data/Lua atual e wire real têm prioridade. Gaps permanecem explícitos/fail-closed até que exista owner comprovado.

## Runtime local

Use os launchers FIX9 fornecidos no pacote. O Data root e GameServer são externos ao repositório e não devem ser substituídos por assets fake para “fazer funcionar”.

## Segurança/publicação

Este repositório está sendo preparado a partir da FIX9. Antes do import completo do runtime, configurações locais e defaults de desenvolvimento são auditados para evitar publicar credenciais, logs ou Data proprietária.
