# M142 SAFE — reprodução sem promover central

1. Obter M141 SAFE e extrair `src/TerrainObjectWorld.js`. Confirmar SHA-256 `2a76ae6974aae5cf00e9a33a1414f63ae3aa8065f7d66969512cb95e83f841d7`.
2. Em uma cópia temporária da integração FIX142 PRE-REGEN (nunca na Library central), confirmar que `world/TerrainObjectWorld.js` tem esse SHA. Executar `git apply --check M142_FROM_M141.patch`, depois `git apply M142_FROM_M141.patch`. Confirmar que o owner resultante corresponde a `src/TerrainObjectWorld.js` byte a byte.
3. Em `src/`, executar `node test-maps-engine-m142.mjs`, `node test-maps-engine-m142-audit.mjs`, `node test-maps-engine-m142-terrain-audit.mjs`, `node test-maps-engine-m142-analysis.mjs`, e testes M140/M141 existentes. O teste `test-maps-engine-m142-native-sampler.mjs` recebe como argumento o caminho para o `graphics/MuTerrain.js` REAL da integração FIX142; o ZIP SAFE não distribui esse owner nem outro Data.
4. Conferir `M142_LANE_AB_REGRESSION.json`, `M142_FIX142_AB_REGRESSION.json`, `M142_FIX142_INTEGRATION_SYNTAX.json`, `M142_PROTECTED_OWNER_HASHES.json` e `M142_INTEGRATION_GATE.json`. As falhas históricas herdadas não são PASS. Nunca executar `--regenerate` com Data de outro cliente.
5. Para capturas reais, seguir `CAPTURE_M142_README.md`. Nenhum teste Node substitui World1/World11 físico com o Data oficial.

**Escopo da lane:** exclusivamente `world/TerrainObjectWorld.js`; nenhum arquivo de produção da central foi publicado, nenhuma central foi promovida, nenhum GitHub foi alterado.
