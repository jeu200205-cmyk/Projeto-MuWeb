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


## Atualização FIX10

FIX10 compartilha o orçamento cooperativo entre workers de carga ativa (sliceMs>0) e usa tarefa sem idle deadline. Placements já instanciados/controladores ocultos sem renderer são descartados antes da cooperação. Nenhum benchmark físico de MoveCustom/FPS foi executado.

FIX19: culling de grama por regiões32x32 em vez de um mesh abrangendo todo mapa. Todos os quads permanecem residentes; sem ganho FPS físico declarado.
FIX21: bounds iniciais por serial/por carga de Data, transformados conservadoramente por placement. Evita repetir o sweep de vértices skinned por cópia. Deduplicação/publicação/retirada de callbacks usam conjuntos e passes lineares; preserva ordem e identidade do array global. Nenhum modelo ou efeito é removido. Redução do tempo físico total ainda não medida.
## FIX99 — pools retidos de partículas de mapa

`PcLorenciaVisuals` e `PcMapParticles` deixam de criar/descartar `SpriteMaterial` e `Sprite` a cada emissão/morte nas famílias cobertas. O active-particle budget continua contando apenas partículas vivas; objetos reciclados ficam inativos. Tarkan deixa de usar `.map()`/arrays novos no update de partículas. O objetivo é reduzir GC/driver churn e spikes p95/p99 sem reduzir densidade, lifetime, bitmap ou spawn gate. Ganho físico ainda precisa ser medido no navegador/GPU do usuário.

