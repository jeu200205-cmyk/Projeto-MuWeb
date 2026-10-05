# 13 — Validação e testes

FIX18: execute `node tools/test-fix18-runtime.mjs`. São 535 checks Node em 19 suítes, incluindo 1944 comparações RGB contra execução compilada das funções do PC. A página `tests/fix18-render.html` retém 307 checks anteriores e acrescenta 17 checks (324 total): textura correta de mato/terreno, prefetch/retry por Data, clique real do modal e pixels RGB do MU shader.

Fixtures são isoladas e sintéticas. Chromium/WebGL2 software; Data real, GameServer, Windows e GPU física não foram executados. Logs, patch e histórico ficam na auditoria separada. Nenhuma contagem significa portabilidade universal concluída.

FIX19: `node tools/test-fix19-runtime.mjs` retém 535 checks e acrescenta 14 (549 em 20 suítes). `tests/fix19-render.html`: 331 checks (324 retidos + 7 novos), layout real de Login e culling WebGL sem remover grama.

FIX20: `node tools/test-fix20-runtime.mjs` retém os 549 checks Node da FIX19 e acrescenta 18 verificações do owner Fenrir (567 total em 21 suítes). São cobertos marcador não-ausente, quatro cores, publicação transacional e ocultação em `TW_SAFEZONE`. O teste físico Windows/Data real permanece obrigatório; teste automatizado não é declaração de paridade visual completa.
FIX21: `node tools/test-fix21-runtime.mjs`: 613 checks Node (567 herdados + 46 novos), 22 suítes. `tests/fix21-render.html`: 333 checks WebGL (331 retidos + 2 pixels blend/alpha-test). Validação com fixtures isoladas, não com Data física. Não equivale a portabilidade visual completa.
