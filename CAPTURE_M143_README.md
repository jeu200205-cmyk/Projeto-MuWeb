# MAPS_ENGINE M143 — captura física World1/World11

**Não executada neste ambiente.** A integração FIX143 PRE-REGEN bloqueia o boot quando o Data oficial Windows não está montado. Única origem autorizada: `C:\clientepromax\Nova pasta\MuPromax 1.0.1\Data`. Nunca usar Data de outro cliente ou simular FPS/terreno.

Compare M142 SAFE e M143 SAFE sobre a mesma autoridade de desenvolvimento (sem promover central), na mesma máquina/navegador/GPU/resolução/DPR, mesmo mapa/câmera/FX e número de personagens. Capturar entrada fria/morna de World1 e World11, ida/volta, >=150 frames estáveis por mundo e screenshots da ponte/descida de Lorencia e terrenos/objetos de Icarus.

1. Antes da entrada, execute `CAPTURE_M130_WORLD1_WORLD11.js` no DevTools. Colete perfis M69/M74/M75/M127, `renderer.info.render.calls`, p50/p95/p99 de frames e draw calls, total/placements/rendered/missing, `terrainTileAudit.missingSlots`, GPU upload estimado e capturas visuais.
2. M143 usa o caminho **direct matrix view** somente no fallback CPU regional sem WebGL multi-draw, em bins de >=256 instâncias, com matriz vanilla `THREE.InstancedMesh` e ArrayBuffer privado. A flag `window.__MU_DISABLE_MAP_DIRECT_MATRIX_VIEW = true` antes da entrada desativa apenas essa otimização e restaura M140. Capture com flag true/false em entradas independentes, mantendo todas as outras condições.
3. Execute `node ANALYZE_M143_WORLD1_WORLD11.mjs --baseline M142_CAPTURE.json --candidate M143_CAPTURE.json > M143_WORLD_AB.json`. Exigir `comparison.evidenceComplete === true`, zero `comparison.parityFailures`, `transportParityFailures` e `terrainTiles.parityFailures`; confirmar screenshots manualmente.
4. `staticTransport.directMatrixBins`, `directMatrixPlacements` e `avoidedPackedMatrixBytes` contam apenas **bins efetivamente publicados**. São bytes de buffer CPU temporário evitados, **não** bytes de GPU, milissegundos ou FPS. Se a extensão WebGL multi-draw estiver ativa ou nenhum bin >=256, os contadores devem permanecer zero.
5. O manifesto de World11 ainda apresenta slots 1/7/8/9/10 ausentes; confirmar contra o Data físico oficial. Não criar aliases nem substituir texturas por arquivos de outros mundos.

O baseline histórico FIX80: World1 frio placementBuild 1635/2260ms; World11 frio placementBuild 370/435ms; World1 morno staticBatch 284/617ms. Icarus histórico ~17–25 FPS e 1259–1819 draw calls. **Não são medições de M143.**
