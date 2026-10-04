# 11 — Matriz consolidada de portabilidade FIX40

> Status aqui significa **estado de implementação/evidência**, não porcentagem estética. “Portado substancial” ainda pode conter casos de borda e validação física pendente.
## Atualização R90 FIX40

A matriz abaixo continua qualitativa. Entre FIX19 e FIX40 foram incorporadas correções de click-to-move/câmera/indoor, Fenrir/safezone, grass/culling e load budget, passes World95, pooling de geometria, autoridade de textura, slots de equipamento, modelos alternativos de inventário, terrain ATT/topologia, HUD/FPS, namespaces EVENT/ARMORINVEN, materiais EVENT e o contrato Icarus `Object11` 0–5. Essas entregas melhoram cobertura real, mas não fecham os catálogos completos nem substituem teste físico.


| Área | Estado | Evidência/limite |
|---|---|---|
| Boot/runtime Windows | **Portado / usado** | Launchers seguros, asset server, gateway, HTTP, profile Data e markers de release. Ainda requer validação física por máquina. |
| Asset pipeline BMD/OZJ/OZT/OZB/ATT | **Portado substancial** | Decode/caches/fail-closed e Data root real ativos. Variantes dinâmicas e assets realmente ausentes continuam como gaps explícitos. |
| Render BMD/skinning/materials | **Portado substancial** | Three.js r160, bind pose/skinning, materiais PC, chrome/metal/alpha e bitmap owners. Exceções fix-function/model-specific ainda não estão 100% fechadas. |
| Terrain/world objects | **Portado substancial** | Altura/tile/ATT/EncTerrain, batching/culling, objetos ocultos PC e vários efeitos de mapas. Grass/billboards e famílias map-specific restantes ainda abertas. |
| Character/viewport/NPC/monster | **Parcial-avançado** | Hero, remotos, viewport, body/equipment, muitos NPCs/custom monsters. Receitas MODEL_PLAYER e exceções de material/modelo ainda incompletas. |
| Inventory/equipment/storage | **Parcial-avançado** | Mirror server-authoritative, 0x24/0x28/F3:10/F3:13/F3:14, grid/equipment/storage e 533 owners de item. Projeção 1-degree/SizeInventory/PosX/PosY, RenderItemInfo completo e alguns fluxos de jewel seguem abertos. |
| Items/material/FX | **Parcial-avançado** | Excellent/Ancient/Set/Socket/Harmony owners e Lua custom owners presentes. Paridade visual item-a-item, stage children e alguns glows ainda exigem fechamento. |
| Skills/cast/VFX | **Parcial** | Wire/cast de várias famílias e FX específicos BK/Wizard/Elf portados. Cobertura integral de classes, master skills e todos os stage graphs ainda não está concluída. |
| Protocol/network | **Parcial-avançado** | Login/CS/GS, SimpleModulus, viewport, move, attack, skill, inventory/storage e vários F3. Há subcodes conhecidos ainda sem parser e sistemas completos ainda não conectados. |
| UI/HUD/chat | **Parcial-avançado** | Main frame, chat, skill bar, inventory, storage, move custom, character, chaos/shop e first-paint owners. Há janelas/sistemas PC ainda não materializados. |
| Social | **Parcial** | Party/trade/guild/friends/duel/PK possuem módulos, mas cobertura wire/UI end-to-end não é declarada 100%. |
| Performance | **Ativo / não fechado fisicamente** | Batching, culling, prewarm, coalescing e frame scheduling existem. Meta 60/90/120 e 80–200 atores precisa benchmark físico final. |
| No-placeholder/fail-closed policy | **Ativo** | Owners não provados permanecem ausentes/logados em vez de receber arte/lógica inventada. |

## Leitura correta

- **Portado / usado:** caminho principal existe e é usado pelo runtime.
- **Portado substancial:** grande parte está materializada, mas não há prova de catálogo 100%.
- **Parcial-avançado:** vários owners reais já estão presentes, porém ainda há subfamílias abertas.
- **Parcial:** existe implementação significativa, mas falta uma fração funcional/visual importante.
- **Pendente de validação física:** source/static tests podem passar sem garantir a imagem exata no Chrome/GPU/GameServer do usuário.
