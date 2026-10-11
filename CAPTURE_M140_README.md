# MAPS_ENGINE M140 — captura física World1/World11

**Estado:** SAFE lane / DEVELOPMENT / NOT PROMOTED. A central promovida continua FIX80; o checkpoint FIX140 PRE-REGEN é apenas integração de teste.

**Data oficial e única origem permitida:** `C:\clientepromax\Nova pasta\MuPromax 1.0.1\Data`. Não usar assets de outro cliente, tabelas regeneradas sem provenance, ou fixtures sintéticas como prova visual/física.

## Protocolo A/B físico

1. Em ambiente Windows com Data oficial íntegro e cliente WebGL funcional, executar **M139 SAFE** e **M140 SAFE** com exatamente o mesmo Data, resolução, DPR, navegador, GPU, personagem, câmera e efeitos ativos. Não remover vegetação, objetos, BMD, joint, dragon, spear, partículas ou sombras para obter FPS.
2. Abrir DevTools e executar `CAPTURE_M130_WORLD1_WORLD11.js` antes de entrar em World1/Lorencia e World11/Icarus. Fazer **entrada fria e morna** para cada mundo, registrar janelas estáveis de pelo menos 150 frames, transições e `snapshotDrawOwners()` em ponto equivalente. Salvar JSON pela função `__MUWEB_MAPS_CAPTURE_M130__.download()`.
3. Repetir em M140 sem alterar a cena e executar:

```bash
node ANALYZE_M140_WORLD1_WORLD11.mjs --baseline CAPTURE_M139.json --candidate CAPTURE_M140.json > M140_WORLD_AB.json
```

4. Exigir `comparison.evidenceComplete=true`, `comparison.parityFailures=[]`, `totals/placements/rendered/missing` sem perda, frame p50/p95/p99 e draw calls por mundo estável. Inspecionar `dominantStage` M75 (`fetchParse`, `modelStage`, `templateProbe`, `staticBatch`, `placementBuild`, `finalize`), `cpuFallbackBuildMs` e `transportBuildMs`. Para material/placement/terrain, comparar capturas visuais da ponte/descida de Lorencia e objetos/terreno de Icarus com o Main 5.2 do mesmo Data.
5. `bulkMatrixCopies`, `bulkMatrixBytes` e `avoidedGetMatrixAtCalls` são **contadores de operações CPU em merges bem-sucedidos**, não medições de tempo GPU, upload WebGL, FPS ou draw calls. Ausência dos contadores em M139 é representada como `null`, nunca `0` inventado. Se não houver WebGL ou Data oficial, declarar **captura pendente**.

## Contexto histórico, não medição de M140

A referência física FIX80 (2026-10-05) registrou World1 frio `placementBuild=1635/2260 ms`, World11 frio `370/435 ms`, World1 morno `staticBatch=284/617 ms`, Icarus estável aproximadamente 17–25 FPS e 1.259–1.819 draw calls. **Não extrapolar esses números para M139/M140**. Em M140 a otimização de cópia em bloco atinge apenas a construção do fallback CPU regional, não o custo de renderização contínua de Icarus.
