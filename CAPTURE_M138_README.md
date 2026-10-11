# MAPS_ENGINE M138 — captura física World1 / World11

**Autoridade de Data obrigatória:** `C:\clientepromax\Nova pasta\MuPromax 1.0.1\Data`. A central promovida continua FIX80. FIX138 é **DEVELOPMENT / PRE-REGEN**, sem tabelas oficiais regeneradas neste ambiente. Não abrir outro Data, não forçar o boot nem tratar capturas sintéticas como reais.

Depois de regenerar e verificar os arquivos exclusivamente no Windows autorizado, aplique a lane SAFE M138 a uma cópia de teste da central. Faça uma execução BASE (M137) e outra M138, com o mesmo navegador/versão Three, hardware, resolução, carga de personagens/efeitos e trajetória da câmera. Abra DevTools e execute o capturador **existente** `CAPTURE_M130_WORLD1_WORLD11.js` antes de entrar em World1/World11. Não refazer M75 nem modificar o capturador M130. Registre a entrada fria, entrada morna, mudança World1→World11→World1, 120+ frames estáveis em cada mapa, câmera parada e em movimento; capture draw calls, frame P50/P95/P99, GPU upload se o navegador expuser e os perfis M69/M74/M75. Salve via `__MUWEB_MAPS_CAPTURE_M130__.download()` e finalize com `.stop()`.

Compare:

```bash
node ANALYZE_M138_WORLD1_WORLD11.mjs --baseline BASE_CAPTURE.json --candidate M138_CAPTURE.json
```

M138 acrescenta `staticTransport.uncoloredMergedBins`, `coloredMergedBins` e `avoidedColorUploadBytes`. O último é **estimativa de bytes RGB float32 que o caminho antigo criaria**, não contagem física de bytes enviados ao driver, tempo GPU ou ganho de FPS. O analisador conserva a cobertura, comparação de fases, contagens de placements/rendered/missing, frames e draw calls de M137/M136/M133. Capturas sem cobertura ou com divergência de conteúdo falham; contadores ausentes permanecem `null`.

Verifique ponte/terreno/BodyLight de Lorencia e clouds/props de Icarus com o PC real, sem apagar modelos, efeitos ou detalhes para ganhar FPS. A referência histórica FIX80 (2026-10-05) teve `placementBuild` 1635/2260ms World1 frio, 370/435ms World11, e Icarus ~17–25 FPS / 1259–1819 draw calls; **não** é benchmark M138.
