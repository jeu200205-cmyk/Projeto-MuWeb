# MUWEB FIX143 — integração segura, PRE-REGEN (2026-10-08)

**Parent de desenvolvimento:** FIX142 PRE-REGEN. **Autoridade promovida:** FIX80 (CURRENT_AUTHORITY.txt inalterado). **Status:** DEVELOPMENT / NOT PROMOTED. Nenhuma publicação no GitHub.

A FIX143 aplica somente os diffs semânticos novos das lanes mais recentes, sem substituir a árvore por snapshots de base FIX80:

- **ITEMS/LUA FIX138:** `RenderCapeModel` separa o bone cache `positionBone` do `LinkObject` mais recente. `TransformPosition(-1, ...)` preserva o vetor e bone anteriores para sprites/partículas, enquanto `CreateEffect` usa a posição do objeto. `CreateParticle`, `CreateEffect` e `CreateJoint` permanecem sem consumidor GPU nativo comprovado, com takeover atômico bloqueado onde necessário.
- **MAPS/ENGINE M142:** reutiliza buffers RGB de iluminação do terreno por layer/render part, cacheia a lista de filhos de templates estáticos por carga e contabiliza serial em uma passagem. Preserva placements, clones individuais, materiais, BodyLight e ordem. Diagnóstico `terrainTileAudit` expõe somente ausências do manifesto observadas, sem inventar assets. O toggle de diagnóstico `window.__MU_DISABLE_TERRAIN_RGB_SCRATCH` restaura o caminho anterior para comparação visual.
- **SKILLS/PROTOCOL FIX140:** `createNpcVisual()` fornece descarte idempotente para NPCs BMD simples/compostos, liberando renderers no pacote `0x14 DeleteViewport` e no teardown do mapa. O ramo MODEL_PLAYER já tinha seu próprio owner de descarte.
- **Integração:** teste novo para impedir regressão da autoridade absoluta de Data nos entrypoints; testes das três lanes reproduzidos no checkpoint. Os testes M142 referenciam `world/TerrainObjectWorld.js` real e um snapshot M141 exclusivamente em `tests/fixtures`.

## Autoridade de assets e tabelas

**Único Data autorizado:** `C:\clientepromax\Nova pasta\MuPromax 1.0.1\Data`.

O handoff de 05/10 e o SAFE hotfix foram aplicados semanticamente sobre a implementação posterior. O boot, o asset server e o HTTP standalone verificam a proveniência e falham fechados. Os módulos `RealItems`, `RealMaps`, `RealMonsters`, `SkillAttributeData` e o manifesto `OFFICIAL_DATA_AUTHORITY.json` permanecem **fisicamente ausentes**, não foram substituídos por dados de outro cliente e **não são declarados limpos**. A regeneração exige acesso real ao Data oficial no Windows.

## Gates de desenvolvimento

- 696/696 arquivos JS/MJS/CJS passaram `node --check`.
- 8/8 testes direcionados passaram (incluindo 4032 verificações do sampler nativo M142 e 21 do novo gate de Data).
- Regressão histórica controlada: 303 testes; FIX142 206 PASS / 97 FAIL, FIX143 206 PASS / 97 FAIL, zero novas falhas nessa amostra. As falhas herdadas não foram corrigidas.
- `verify-only` RC=2, regeneração RC=2, boot RC=1, asset server standalone RC=2 e HTTP standalone RC=2: falhas esperadas neste ambiente sem Data oficial.
- Exatamente 3 BATs: `LIGAR_WEB_R90_FIX143.bat`, `DESLIGAR_WEB_R90.bat`, `INSTALAR_DEPENDENCIAS_R90.bat`.

## Pendências para promoção

Regenerar fisicamente as tabelas oficiais e o manifesto de SHA-256 no Windows; auditar outras tabelas estáticas de proveniência antiga sem reutilizar Data externo; validar no navegador WebGL os modelos e efeitos Main 5.2, Lorencia/Icarus, mapas, transições e o desempenho com 80–200 jogadores. Contadores de CPU e testes sintéticos não comprovam 60 FPS nem fidelidade visual.
