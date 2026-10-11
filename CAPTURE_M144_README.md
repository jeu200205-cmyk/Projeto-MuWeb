# MAPS_ENGINE M144 — captura física World1/World11

**Não executada neste ambiente.** FIX144 DATA_LOCK_PRE_REGEN é um checkpoint de integração **DEVELOPMENT / NOT PROMOTED**, sem tabelas geradas a partir do Data Windows autorizado. A autoridade central promovida continua FIX80. A única origem física válida é `C:\clientepromax\Nova pasta\MuPromax 1.0.1\Data`. Não usar Data de outro cliente, texturas substitutas, modelos simulados ou números de FPS sintéticos.

## Procedimento físico de A/B

1. Na mesma máquina/GPU/navegador/DPR, com o Data oficial regenerado e verificado, executar M143 (controle) e M144 SAFE (candidato) em ambientes separados, **sem promover a central**. Registrar a versão exata, SHA, resolução, número de personagens, FX, posição e câmera.
2. No DevTools, antes de entrar no mapa, colar `CAPTURE_M130_WORLD1_WORLD11.js` e depois `CAPTURE_M144_WORLD1_WORLD11.js`. O segundo é um wrapper **somente leitura**, que acrescenta a telemetria de liberação M144 à captura física M130 (M69/M74/M75/M127, frustum, frame pacing e draw calls).
3. Fazer World1 frio → World11 frio → World1 morno → World11 morno; manter >=150 frames estáveis em cada mapa e executar ida/volta adicional se necessário para obter eventos de `dispose` dos **dois mundos**. Capturar screenshots da ponte/descida de Lorencia, terreno, materiais e placements de Icarus. Observar `renderer.info.render.calls`, p50/p95/p99, long tasks, GPU upload e memória WebGL com profiler nativo. M75 já inclui `fetchParse`, `modelStage`, `templateProbe`, `staticBatch`, `placementBuild`, `finalize`, `placements`, `rendered`, `missing` e concorrência; não refazer esse estágio.
4. No console: `__MUWEB_MAPS_CAPTURE_M144__.download()` e depois `__MUWEB_MAPS_CAPTURE_M144__.stop()`. A coleta M144 consulta `__MUWEB_MAP_RELEASE_PROFILE__` a cada 250ms: **transições mais rápidas podem sobrescrever eventos**; verificar logs `[PERF M144]` e repetir se faltar um mundo. Os contadores `disposeFailures` incluem sprite/visual/renderer, geometrias instanciadas e templates; falhas do helper histórico M135 de transporte são absorvidas internamente e **não** estão cobertas por esse contador. Nenhum contador M144 mede GPU upload nem FPS.
5. Analisar com `node ANALYZE_M144_WORLD1_WORLD11.mjs --baseline M143_CAPTURE.json --candidate M144_CAPTURE.json > M144_WORLD_AB.json`. Exigir `m144EvidenceComplete=true`, nenhum `comparison.parityFailures`, `transportParityFailures`, `terrainTiles.parityFailures`, `m144Release.failureWarnings`, além de evidência visual independente. Se faltar evento M144, a comparação é **incompleta**, não aprovada.

## Referência e limitações

O log histórico FIX80 (05/10/2026) mostrou `placementBuild` frio em World1 = 1635/2260ms (72,3%) e World11 = 370/435ms (85,1%); World1 morno teve `staticBatch` = 284/617ms (46%). Icarus histórico ~17–25 FPS e 1259–1819 draw calls. **Não são resultados M144.** M144 corrige isolamento de falhas no descarte de recursos e evita retenção de callbacks de bone-space, mas não afirma melhoria de FPS sem capturas físicas.

World11 tem slots 1,7,8,9,10 ausentes **no manifesto disponível**, não comprovadamente no Data oficial. Não criar aliases ou preencher esses slots com assets de outro cliente. O diagnóstico de terreno/placement/BMD precisa de evidência do Data físico e screenshots.
