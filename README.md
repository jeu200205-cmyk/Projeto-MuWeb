# MUWEB — PC Main 5.2 → Web

FIX40 continua diretamente a autoridade FIX39 e fecha um owner concreto de Icarus (`WD_10HEAVEN` / `Object11` tipos 0–5). No PC esses BMDs não são cenário: no primeiro `RenderObjectVisual` emitem `BITMAP_CLOUD` e passam para `HiddenMesh=-2`. A Web agora esconde o corpo bruto, usa `Effect/clouds.OZJ`, preserva subtipo 0–5, luz `(0.1,0.1,0.1)`, escala/posição do objeto e a contagem exata de 20 partículas para tipos 0–2 / 10 para tipos 3–5. Isso remove uma causa source-backed de geometria indevida em Icarus sem ocultação heurística.

FIX39 porta o estado completo de `MODEL_POTION+17`: `BlendMesh=1`, luz pulsante, alpha 2, scroll V e `OBJECT::Light`. Como no PC, o blend seleciona o slot de textura 1, enquanto o scroll pertence ao mesh 1; esses dois índices não são tratados como equivalentes.

FIX38 recupera a autoridade da FIX37: o primeiro ZIP FIX37 continha manifesto/testes novos, mas três arquivos centrais ainda tinham bytes antigos. Use FIX38 ou posterior; não use o ZIP FIX37.

FIX36 porta os sprites `BITMAP_SPARK+1` dos EVENT12 e EVENT13. O owner usa o arquivo físico `Effect/Spark03.OZJ`, sampler LINEAR/CLAMP, tamanho real do bitmap × `Scale`, posição local no bone 0, billboard de câmera e blend ONE/ONE. Cor/escala seguem a senoide do PC e o material é descartado com o renderer. A validação visual no cliente físico continua pendente.

FIX35 porta o `BlendMesh=1` do EVENT18 sem overlay duplicado. A seleção usa o slot de textura BMD, e não o índice visual do mesh; os draws correspondentes passam a ONE/ONE, sem depth-write/culling e sem iluminação por normal, mantendo a textura original. Validação física do modelo continua pendente.

FIX34 porta o `StreamMesh=0` do EVENT13: somente o mesh 0 recebe o deslocamento V em serra de 4 segundos e ignora iluminação por normal, como em `BMD::RenderMesh`. O estado fica no uniforme do material por instância, sem alterar `Texture.offset` compartilhado entre ícones/personagens. O sprite preso ao osso foi fechado estruturalmente na FIX36.

FIX33 corrige o ramo EVENT6 nível 13: o corpo texturizado é realmente substituído pelo passe sólido `RENDER_COLOR` azul do PC antes do Chrome. Isso elimina a antiga aproximação que somente tingia a textura e preserva profundidade/culling, ordem dos draws e retry quando Chrome01 estiver ausente. A correção está coberta pelo shader real; a validação física continua pendente.

FIX32 restaura a continuação de materiais dos modelos EVENT do inventário: nível remapeado, cor da base, Chrome/Metal e caudas Excellent/Ancient seguem a sequência stock do PC. Os ramos exclusivos conservam seus retornos; os sprites EVENT12/13 foram portados na FIX36, enquanto outros sprites/joints continuam pendentes. Não há homologação visual universal nem benchmark de latência nesta entrega.

Versão de desenvolvimento: R90 FIX40, baseada integralmente na FIX39 e preservando os incrementos anteriores. Este projeto é uma base parcial de engine/cliente Web; não é uma portabilidade completa de MU Online.

## Executar no Windows

1. Extraia esta pasta SOURCE inteira. Instale Node.js com npm.
2. Execute INSTALAR_DEPENDENCIAS_R90.bat para instalar three e ws pelo package-lock.json.
3. Execute LIGAR_WEB_R90_FIX40.bat. O launcher verifica o código e inicia os serviços locais.
4. Use a Data real do cliente compatível e o GameServer externo. O setup mantém o perfil do cliente MuPromax 1.0.1; MUWEB_OFFICIAL_CLIENT_ROOT ou MUWEB_OFFICIAL_DATA permitem indicar sua pasta. O launcher valida o perfil; não substitui assets ausentes.

Data e GameServer não estão incluídos. A configuração de rede depende do seu servidor. O launcher gera runtime-config.js para as portas locais; esse arquivo é configurável e não faz parte do gate imutável de boot.

## Engine e sistemas

Leia docs/ENGINE/00_INDEX.md. A árvore inclui renderer BMD/terrain, skins, inventário/equipamentos, protocolo e gateway, cenas, UI, owners Lua, skills e efeitos. Muitos sistemas continuam parciais. Consulte docs/ENGINE/12_REMAINING_PORTS.md.

## Verificar

- node tools/start-r90-fix40-safe.cjs --verify-only
- node tools/test-fix40-runtime.mjs
- Para testes WebGL: node tools/dev-web-server.cjs 8087 e abra http://127.0.0.1:8087/tests/fix23-render.html. A fixture inclui teste de modal: clique no botão OK apresentado.

Fixtures de teste são isoladas; não são assets substitutos do jogo. Os resultados e o histórico detalhado ficam no relatório separado da entrega.


Desligar no Windows: execute `DESLIGAR_WEB_R90_FIX40.bat` na mesma SOURCE. Encerra somente os processos Node identificados pelo caminho exato dos scripts desta source. GameServer, ConnectServer, DataServer e outras cópias não são encerrados. Depois execute `LIGAR_WEB_R90_FIX40.bat` para iniciar novamente.

FIX19 continua a FIX18; clique aponta para o personagem lógico do movimento, câmera TW_CAMERA_UP e coberturas seguem regras PC. Grama preservada em regiões com culling. Login com layout corrigido e recorte único.

FIX20 preserva tudo da FIX19 e corrige o owner do Fenrir: HELPER+37 deixa de ser classificado como asset ausente, alcança a lane PetSystem nas quatro cores e não bloqueia a publicação transacional do equipamento. Fenrir/Unicon/Pegasus ficam ocultos em TW_SAFEZONE como no MoveBug do PC e não substituem a animação normal do herói dentro da cidade.

FIX21 mantém todos os modelos, placements, partículas e animações. A grama usa alpha-test sem blend nos mapas normais e preserva as exceções PKField/Doppelganger2. Bounds iniciais são calculados por modelo e transformados por placement, conservadoramente; callbacks do mapa são publicados/retirados em lote sem buscas quadráticas. A animação do herói montado permanece no controlador do personagem, sem um segundo override Fenrir para Unicon/DarkHorse. Ganho de tempo/FPS no hardware do usuário ainda não foi medido.

FIX22 acrescenta os passes PC de World95: oceano Type1/mesh0 com scroll e navio Type5 com treze passes adicionais diffuse/chrome. Chrome01 ausente permanece ausente. Materiais com callbacks (pulsos e UV de World75) conservam renderer/update por placement mesmo quando o BMD não contém animação de ossos. Nenhuma paridade visual completa dessas cenas foi homologada.

FIX23 compartilha a BufferGeometry imutável por identidade de mesh BMD parseada enquanto houver renderers vivos. Skeleton, bones, mixer e materiais continuam por instância. Cada renderer libera sua referência; somente o último libera a geometria GPU. O inventário não grava capturas feitas durante perda de contexto WebGL no cache. A taxa de FPS e a latência de mapas no hardware do usuário ainda precisam medição.

FIX24 preserva texturas publicadas por URL/origem e impede que cargas assíncronas de uma geração antiga substituam a autoridade atual. FIX25 restaura os retângulos NewUI de amuleto/anéis e elimina o deslocamento horizontal duplo nos slots equipados.

FIX26 aplica antes do owner customizado os ModelIDs alternativos que `RenderItem3D` escolhe por tipo/nível no PC. Caixas/eventos, Beer02, DarkLordSleeve, LifeStone, armas do helper 13:19, anéis 13:20 e os pergaminhos 14:47/48 passam a usar o modelo alternativo correto. Itens sem remap continuam sob a autoridade do `LoadItens.lua` atual.

FIX27 liga as flags ATT ao mesh visual: `TW_NOGROUND` remove células, `TW_HEIGHT` usa altura especial 1200 e a triangulação segue o fan Index1→Index3 do PC. A grama respeita as mesmas células ocultas/alturas. Leitura de BMDs começa em paralelo ao terreno e usa o cache inflight existente. A melhora real de latência e a correção integral das cenas precisam de teste no cliente físico.

FIX28 posiciona FPS e coordenadas no HUD inferior, dentro da camada PC 640×480 que já escala junto com a arte. Clique em FPS para escolher limite 30/60/120. Armaduras RF 8:59/60/61 usam os BMDs dedicados de inventário registrados pelo MonkSystem, com sua rotação, escala e posição de RenderObjectScreen. A paridade visual/material/efeitos desses modelos ainda precisa de validação física.

FIX29 usa o tipo do modelo alternativo também nos materiais dos pergaminhos 14:47/48 e das três miniaturas de armas do item 13:19. Para miniaturas, o nível visual é zerado no mesmo ponto lógico do PC. Cores e programas customizados seguem o modelo escolhido. Os materiais de MODEL_EVENT e ARMORINVEN continuam pendentes de auditoria por namespace; a validação visual física permanece necessária.

FIX30 separa o namespace MODEL_EVENT de ITEM_ETC na apresentação de inventário. Os remaps EVENT passam tipo de modelo, índice e nível packed explícitos aos materiais; cores/efeitos Lua do item original não vazam. POTION+12 níveis 0/2 agora carrega Event02/Event03 como o `RenderPartObject` do PC. Itens ETC comuns deixam de executar switches EVENT por coincidência de índice. Sprites/joints e homologação física desses modelos ainda são pendências.

FIX31 separa ARMORINVEN60/61/62 dos owners Lua das armaduras equipadas 8:59/60/61. Conserva a escada de Chrome/Metal por nível e as paletas PC, sem herdar cor custom, transparência, RenderModel ou veto Excellent do item original. Testes estruturais não substituem homologação física de materiais/cores e demais efeitos.
FIX43 HOTFIX1: runtime-config.js e gerado/configuravel no boot e NAO participa do hash imutavel. O launcher valida apenas seu contrato de configuracao; os demais arquivos continuam SHA-256 strict.

