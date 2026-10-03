# 10 — Performance

## Mecanismos já presentes

- prewarm/decode de UI/assets;
- cache de BMD/texturas;
- static batching e instancing;
- spatial clusters/frustum culling;
- offscreen animation budget;
- material fusion;
- regional packing/multidraw capability gates;
- animation/bone update reductions;
- single-frame scheduling;
- inventory refresh coalescing;
- map prefetch via MoveCustom;
- same-world asset reuse;
- skip de geometria base para alguns controladores PC-hidden.

## O que os testes estáticos não provam

A meta final de 60 FPS (e 90/120 opcionais) com conteúdo completo, inventário aberto, efeitos ativos e crowd de 80–200 atores só pode ser declarada após benchmark físico na máquina/GPU/browser alvo.

## Métricas que devem ser registradas

- frame time CPU e GPU, avg/p95/p99;
- render calls e triangles;
- número de atores/animVis;
- cold/steady map load;
- tempo por fase `world-entry`;
- GC spikes;
- número de BMD/texturas decodificados;
- prefetch hit rate;
- inventory edit burst e UI paint count.

## Regra de otimização

Não remover itens, efeitos ou estágios PC para bater FPS. Primeiro reduzir trabalho duplicado, alocações, uploads, overdraw, traversal e cold load mantendo fidelidade.
