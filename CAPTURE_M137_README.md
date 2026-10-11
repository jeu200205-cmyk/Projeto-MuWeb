# MAPS_ENGINE M137 — captura física World1 / World11

Somente no Windows com o Data autorizado `C:\clientepromax\Nova pasta\MuPromax 1.0.1\Data`, após a regeneração e verificação oficial terem passado. A FIX137 PRE-REGEN não é promovida e não pode ser tratada como execução física válida.

Na versão base e na versão candidata, em mesmo hardware/navegador/resolução/câmera e mesma carga de players/efeitos, execute o `CAPTURE_M130_WORLD1_WORLD11.js` no DevTools **antes** de entrar em Lorencia (World1) e Icarus (World11). Registre primeira entrada, retorno morno, câmera parada, câmera em movimento e transições. Colete pelo menos 120 frames estáveis e 120 amostras de draw calls por mapa; salve com `__MUWEB_MAPS_CAPTURE_M130__.download()` e encerre com `.stop()`. `snapshotDrawOwners()` só fora da janela cronometrada.

Compare com:

```bash
node ANALYZE_M137_WORLD1_WORLD11.mjs --baseline BASE_CAPTURE.json --candidate M137_CAPTURE.json
```

Leia M69/M74/M75, fase dominante, `placementBreakdown`, `staticTransport.transportBuildMs`, `multiDrawBuildMs`, `cpuFallbackBuildMs`, `skippedUnsafeTemplateFusionGroups`, `skippedTemplateFusionByObject`, `skippedAuthoredVertexColor`, `skippedOrderDependentMaterial`, `templateMaterialKeyHits/Misses`, draw calls P50/P95, frame P95/P99, placements/rendered/missing. Um contador de `skipped` positivo significa que o renderer **manteve** o conteúdo original para proteger fidelidade, não que apagou um objeto. O comparador falha quando faltam evidências ou quando há divergência de contagem de placements. Nenhum benchmark sintético ou log antigo substitui essa comparação física.
