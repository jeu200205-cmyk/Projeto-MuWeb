# MAPS_ENGINE M133 — World1/World11 A/B (somente leitura)

**Autoridade promovida:** FIX80 CAPE_SPRITE_ENGINE_PROFILE. A integração FIX133 da Library é `DEVELOPMENT / NOT PROMOTED`; a lane não altera a central.

1. No Windows, use exclusivamente `C:\clientepromax\Nova pasta\MuPromax 1.0.1\Data` e passe pelo verificador oficial. A lane não substitui o Data ausente nem habilita boot sem os arquivos reais.
2. Antes de entrar no mundo, cole no DevTools o capturador já existente `CAPTURE_M130_WORLD1_WORLD11.js`. Faça uma rota física reprodutível por World1 (Lorencia) e World11 (Icarus), aguardando 120+ frames **estáveis** por mapa. Capture primeiro com a central/base e depois com a lane integrada em cópia temporária. Use a mesma resolução, câmera, personagem, efeitos, navegador, máquina e rota. Evite inventário aberto em somente uma das capturas.
3. Fora da janela cronometrada, opcionalmente execute `__MUWEB_MAPS_CAPTURE_M130__.snapshotDrawOwners()` uma vez por mapa. É contagem de objetos da hierarquia, **não** contagem de draw calls GPU.
4. Salve com `__MUWEB_MAPS_CAPTURE_M130__.download()` e finalize com `.stop()`. A captura contém M69 (map entry/teleport), M74 (primeira entrada quando aplicável), M75 (estágios), M127 (dispose), RAF por mundo estável e `renderer.info.render.calls`.
5. Compare os dois JSONs sem modificar o cliente:

```bash
node ANALYZE_M133_WORLD1_WORLD11.mjs --baseline ANTES.json --candidate DEPOIS.json > comparacao.json
```

A ferramenta exige M69/M75 e pelo menos 120 amostras de frame/draw calls por mundo para marcar evidência completa. **M74 é opcional por mapa nas transições**: `_buildWorld` não roda em todo teleport; M69 é o owner dessas transições. Ela verifica `placements`, `rendered` e `missing`, destaca o estágio M75 dominante, tempos M69/M74 e diferenças p95 de frame/draw calls. Falta de evidência = exit 2; divergência de conteúdo = exit 3. Uma redução em tempo de parede M75 não é automaticamente redução de tempo de CPU/GPU ou FPS.

**M133 não inclui captura física nova**. A referência FIX80 histórica (World11 17–25 FPS / 1259–1819 calls) não é um benchmark M133. As divergências de terrain/placement/material de Lorencia/Icarus permanecem abertas até haver imagens, perfis e Data oficiais para comparação; não foram ocultados efeitos ou objetos.
