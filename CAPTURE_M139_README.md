# MAPS_ENGINE M139 — captura física World1/World11 (pendente)

Estado: **SAFE LANE / DEVELOPMENT / NOT PROMOTED**. Não são fornecidos FPS inventados nem screenshots sintéticos como prova física.

**Fonte autorizada de Data:** `C:\clientepromax\Nova pasta\MuPromax 1.0.1\Data`. Não aceitar fallback de outro cliente, `MuPromax 1.0.2` ou assets gerados a partir de origem desconhecida. O checkpoint FIX139 PRE_REGEN não é central promovida.

Execute o cliente real em navegador com WebGL e Data oficial validado. Em cada versão (M138 SAFE final e M139 SAFE), capture uma entrada fria e uma morna em World1/Lorencia e World11/Icarus. Use `CAPTURE_M130_WORLD1_WORLD11.js` da lane, mantendo os campos M69/M74/M75 e as janelas de FPS/draw calls. Mantenha câmera/rota/quantidade de personagens equivalentes, sem desativar efeitos, vegetação ou conteúdo.

Salve os JSONs reais e rode:

```bash
node ANALYZE_M139_WORLD1_WORLD11.mjs --candidate CAPTURE_M139.json --baseline CAPTURE_M138.json > M139_WORLD_AB.json
```

Confirme `comparison.evidenceComplete=true`, `parityFailures=[]`, totals/placements/rendered/missing equivalentes, e examine fase dominante de M75 (`fetchParse`, `modelStage`, `templateProbe`, `staticBatch`, `placementBuild`, `finalize`), `cpuFallbackBuildMs`, `transportBuildMs`, draw calls e frame pacing p50/p95/p99. `matrixPackedBins`, `avoidedMatrixObjects`, `packedMatrixBytes` são **estimativas de alocação CPU**, não medições de GPU upload/FPS. Um delta de FPS só é válido após captura real pareada.

Referência histórica FIX80 (NÃO M139): World1 frio placementBuild 1635/2260ms; World11 placementBuild 370/435ms; World1 morno staticBatch 284/617ms; Icarus estável 17–25 FPS e 1259–1819 draw calls. Não extrapolar estes números para M139.
