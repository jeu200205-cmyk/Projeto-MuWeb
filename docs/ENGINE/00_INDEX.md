# MUWEB Engine Documentation — FIX40

Autoridade pública atual: **R90 FIX40 HOTFIX1**, preservando integralmente os incrementos anteriores. Autoridade semântica: source PC Main 5.2 limpa. Esta é uma base parcial de desenvolvimento; nenhum percentual de completude é homologado como 100%.

## Leitura recomendada

1. [Arquitetura](01_ARCHITECTURE.md)
2. [Boot e fluxo runtime](02_RUNTIME_BOOT_FLOW.md)
3. [Pipeline de render](03_RENDERING_PIPELINE.md)
4. [Mapas, terrain e objetos](04_MAP_TERRAIN_OBJECTS.md)
5. [Itens, inventário e equipamento](05_ITEMS_INVENTORY_EQUIPMENT.md)
6. [Rede e protocolo](06_NETWORK_PROTOCOL.md)
7. [Skills e efeitos](07_SKILLS_EFFECTS.md)
8. [UI, input e social](08_UI_INPUT_SOCIAL.md)
9. [Data/Lua owners](09_DATA_LUA_OWNERS.md)
10. [Performance](10_PERFORMANCE.md)
11. [Matriz do que já foi portado](11_PORTABILITY_STATUS.md)
12. [O que falta portar](12_REMAINING_PORTS.md)
13. [Validação/testes](13_VALIDATION_AND_TESTS.md)
14. [Fluxo GitHub/manutenção](14_GITHUB_MAINTENANCE.md)
15. [Cross-reference PC → Web](SOURCE_CROSS_REFERENCE.md)
16. [Índice automático de módulos](AUTOGEN_MODULE_INDEX.md)
17. [Índice automático de testes](AUTOGEN_TEST_INDEX.md)
18. [Pré-check de segurança para GitHub](GITHUB_SECURITY_PRECHECK.md)
19. [Notas da publicação FIX40](16_FIX40_RELEASE_NOTES.md)

## Validação atual

As verificações Node atuais, o teste exaustivo dos 131.072 pares tipo/nível e os resultados históricos ficam registrados na auditoria da entrega. Os 1.010 casos nativos UV e 333 checks WebGL anteriores estão preservados no histórico. As fixtures GPU FIX22/FIX23 estão preparadas, mas não foram executadas neste ambiente sem Chromium. Isso não equivale à homologação física.

## Regra de autoridade

A Web não deve inventar comportamento para preencher lacunas. A ordem de decisão é: source PC limpa → Data/Lua do cliente real → wire/GameServer real → evidência física → implementação Web. Um owner ausente deve ficar explícito e fail-closed.
# Incremento FIX20

FIX20 preserva integralmente a FIX19 e corrige a passagem de HELPER+37 para o owner de montaria. O marcador Fenrir não é um BMD anexado ao osso e, portanto, não pode entrar na lista de assets ausentes. `PlayerComposer` publica `out.fenrir` para o `PetSystem`; `MountCompanion` aplica a ocultação de `TW_SAFEZONE` antes de avançar a criatura ou escolher ações montadas do herói.

## Incremento FIX21

Grama comum usa alpha-test sem composição source-alpha, conforme `ZzzLodTerrain.cpp`; World64/67 mantêm a exceção alpha-blend. O preparo de bounds reutiliza o AABB inicial do modelo e transforma seus oito cantos por placement. Publicação/remoção de callbacks do mapa deixam de pesquisar repetidamente milhares de owners. O controller do personagem permanece autoridade das ações montadas; o companion não o sobrescreve com ações exclusivas de Fenrir. Ganho de tempo no cliente físico ainda precisa ser medido.

## Incremento FIX22

`PcLoginObjectPresentation` porta os passes de `GMCryingWolf2nd.cpp`, ramo WorldActive94: água Type1 e detalhes do navio Type5. `MUModelRenderer.hasPresentationUpdates` impede que callbacks de material sejam congelados pelo batching estático, inclusive nos pulsos e UV de World75. Os passes diffuse dos detalhes conservam iluminação normal; StreamMesh0 não a aplica. Chrome usa o bitmap PC explícito e a cor .8/.7/.3.

## Incremento FIX23

`assets/BmdGeometryPool.js` compartilha somente os buffers/bounds imutáveis do mesh parseado. Não compartilha ossos, poses, mixer, material ou relógio. Os leases são idempotentes e a geometria só é descartada pelo último dono; bake estático continua clonando geometria privada. Identidade de dados diferentes não é unificada por nome/caminho. Uma futura alteração de topologia/LOD deve usar uma cópia privada. `ItemIconRenderer` recusa captura/cache durante perda de contexto.

## Incremento FIX24

`MUAssetLoader` separa texturas persistentes por URL da Data e valida geração antes de publicar cargas assíncronas. Troca de origem ou limpeza do cache invalida jobs antigos, sem descartar texturas GPU que cenas publicadas ainda usam. O decoder da UI também rejeita resultados tardios e preserva o novo owner do mesmo caminho. Registros antigos sem origem deixam de ser lidos. A URL identifica a origem: trocar conteúdo na mesma URL ainda exige revisão/limpeza explícita. Esta alteração não muda RGB, shader, escala ou regras de escolha dos arquivos do PC.

## Incremento FIX25

`InventoryWindow` usa os retângulos de `CNewUIMyInventory::SetEquipmentSlotInfo`: amuleto e anéis voltam a 20×20 nas posições NewUI corretas. O host já contém o `x+1` do PC; o canvas 3D deixa de somar um segundo pixel. Armadura conserva exclusivamente o `y-10` de `Render3DItem`. Isso corrige o contrato geométrico e os hitboxes, mas não substitui validação visual de todos os modelos, materiais e cores.

## Incremento FIX26

`pcAlternateInventoryModelPath` centraliza os ModelIDs alternativos escolhidos por `RenderItem3D` antes de `AccessModel`. Essa precedência impede que um owner do tipo original em `LoadItens.lua` esconda caixas/eventos, anéis, armas especiais e os pergaminhos 14:47/48 que o PC troca para outro modelo. A tabela é conferida em todo o domínio de 12 bits e nos 16 níveis; tipos sem remap preservam a autoridade customizada atual. A correção é lógica e automatizada, ainda sem homologação visual no cliente Windows.

## Incremento FIX27

`TerrainWorld` transmite `att.walls` ao renderer. `applyPcTerrainGeometry` aplica `RenderTerrainTile`: não emite faces para `TW_NOGROUND` no Index1, substitui vértices `TW_HEIGHT` por 1200 e usa o fan Index1→Index3, conservando o campo original de alturas. Grama recebe alturas visuais e ignora células ocultas. `Scene.loadRealMap` inicia leitura de BMDs enquanto prepara terrain; não cria uma segunda cena nem espera o prefetch para publicar. Mantém commit atômico e aborta o aquecimento ao terminar/cancelar. Latência física ainda não medida.

## Incremento FIX28

FPS segue `NewUIMainFrameWindow::RenderFrame`: x=555, y=altura−14, largura35, na mesma camada/escala da arte. Limites 30/60/120 aparecem no menu do indicador; coordenadas usam x55/76.5 e y=altura−13. RF armor 59/60/61 muda de ModelID no `RenderItem3D` para ARMORINVEN_60/61/62, cujos BMDs vêm de `MonkSystem::LoadModelItem`. Mantém a composição Player/partes e BodyHeight, mas usa ângulos zero, escala .0039 e offsets .01/.08. Lua do ModelID original não sobrescreve o alternativo. Paridade de material/efeitos ainda precisa auditoria e validação física.
