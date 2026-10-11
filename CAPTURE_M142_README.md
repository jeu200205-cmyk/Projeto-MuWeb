# MAPS_ENGINE M142 — captura física World1 / World11

**Ainda não realizada.** Este arquivo é um procedimento, não evidência de FPS ou paridade visual. Usar exclusivamente o Data oficial `C:\clientepromax\Nova pasta\MuPromax 1.0.1\Data`; o FIX142 PRE-REGEN não inicializa o jogo sem regenerar as tabelas físicas oficiais.

Compare M141 SAFE e M142 SAFE integrados à mesma autoridade (não promova nenhuma). Em cada versão, mesma máquina, navegador, GPU, resolução/DPR, câmera, personagem, FX, rotas e quantidade de jogadores. Capture entrada fria e morna em World1 e World11, ida/volta de mapas, pelo menos 150 frames estáveis por mapa, screenshot da ponte/descida de Lorencia e dos terrenos/objetos de Icarus.

1. Antes da transição, executar `CAPTURE_M130_WORLD1_WORLD11.js` no DevTools; coletar M69 (map entry), M74 (outer quando existir), M75 (estágios), M127 (dispose), `renderer.info.render.calls`, frustum/culling, `snapshotDrawOwners()` e frame p50/p95/p99. Finalizar com `__MUWEB_MAPS_CAPTURE_M130__.download()`.
2. M142 possui flag **somente diagnóstica** `window.__MU_DISABLE_TERRAIN_RGB_SCRATCH = true`, definida **antes** do carregamento do mapa; `false` ou ausente é a otimização ativa. Comparar M142 flag off/on em entradas independentes. Essa flag afeta apenas o sampler RGB do `staticBatch`; o sampler dinâmico `_terrainLightAt` continua usando scratch por layer.
3. Comparar com `node ANALYZE_M142_WORLD1_WORLD11.mjs --baseline M141_CAPTURE.json --candidate M142_CAPTURE.json > M142_WORLD_AB.json`. Exigir `comparison.evidenceComplete === true`, `comparison.parityFailures.length === 0`, `terrainTiles.parityFailures.length === 0`, e revisão humana das screenshots. **Ausência de `terrainTileAudit.available` não significa ausência de slots faltantes.**
4. Verificar `staticBatchBreakdown.reusableTerrainRgbSamples`, `templateCloneScan`, `serialAuditScan`, `terrainTileAudit.missingSlots` e os tempos M75. Não interpretar chamadas com scratch como bytes de GPU evitados, nem inferir FPS a partir dos contadores CPU.

O manifesto FIX142 PRE-REGEN ainda não contém os slots World11 1/7/8/9/10 observados historicamente; isto não autoriza copiar tiles de World1 ou de outro cliente. Só a verificação do Data físico oficial e captura visual podem encerrar a divergência.
