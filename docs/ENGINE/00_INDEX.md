# MUWEB Engine Documentation — FIX9

**Authority:** `MUWEB_R90_FIX9_PC_HIDDEN_OBJECT_ITEM_PRESENTATION_PERF_2026-10-02`  
**PC semantic authority:** Main 5.2 clean `source.zip`  
**Generated:** 2026-10-03  
**Production module tree SHA-256:** `7ba01b6d9a6a95b3adc49189d001dfeff7c3c2dcbd2799c3b216affffdec4b92`

Este diretório é a documentação de engenharia consolidada da linha MU Online PC → Web. Ela separa **portado por source/static evidence**, **parcial**, **pendente de port**, e **pendente apenas de validação física**. Nenhuma seção transforma teste estático em prova visual.

## Leitura recomendada

1. [Arquitetura](01_ARCHITECTURE.md)
2. [Boot e fluxo runtime](02_RUNTIME_BOOT_FLOW.md)
3. [Pipeline de render](03_RENDERING_PIPELINE.md)
4. [Mapas, terrain e objetos](04_MAP_TERRAIN_OBJECTS.md)
5. [Itens, inventário e equipamento](05_ITEMS_INVENTORY_EQUIPMENT.md)
6. [Rede e protocolo](06_NETWORK_PROTOCOL.md)
7. [Skills e efeitos](07_SKILLS_EFFECTS.md)
8. [UI, input e social](08_UI_INPUT_SOCIAL.md)
9. [Data/Lua owners](09_DATA_LUA_OWNERS.md)
10. [Performance](10_PERFORMANCE.md)
11. [Matriz do que já foi portado](11_PORTABILITY_STATUS.md)
12. [O que falta portar](12_REMAINING_PORTS.md)
13. [Validação/testes](13_VALIDATION_AND_TESTS.md)
14. [Fluxo GitHub/manutenção](14_GITHUB_MAINTENANCE.md)
15. [Release checklist](15_RELEASE_CHECKLIST.md)
16. [Cross-reference PC → Web](SOURCE_CROSS_REFERENCE.md)
17. [Pré-check de segurança para GitHub](GITHUB_SECURITY_PRECHECK.md)

## Números do checkpoint documentado

- arquivos no pacote: **1737**
- módulos JS/MJS/CJS de produção analisados: **184**
- testes `test-*.mjs` no root: **372**
- arquivos em `tests/`: **15**
- arquivos em `validation/`: **34**
- scripts JS/MJS/CJS em `tools/`: **97**
- documentação Markdown antes deste conjunto: aproximadamente **299** arquivos
- gate FIX9 executado nesta preparação: **12/12 PASS**
- sintaxe de módulos de produção executada nesta preparação: **184/184 PASS**

## Regra de autoridade

A Web não deve inventar comportamento para preencher lacunas. A ordem de decisão é: source PC limpa → Data/Lua do cliente real → wire/GameServer real → evidência física → implementação Web. Um owner ausente deve ficar explícito e fail-closed.
