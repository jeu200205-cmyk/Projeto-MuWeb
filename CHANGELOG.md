# Changelog

Base do projeto: **MU Online Main 5.2 do Dinho**.

---

## 05/10/2026 01:35 BRT

Atualização da source do Projeto MuWeb com avanços em runtime, inventário, integração Lua, apresentação de monstros, ambiente de Icarus, renderização do personagem e documentação técnica.

### Engine e runtime

- atualizado `core/GameApp.js`;
- ajustes na integração principal do ciclo de execução do cliente;
- atualização da ligação entre estado do jogo, carregamento e sistemas ativos da engine;
- preparação do runtime para os novos consumidores e componentes incorporados nesta atualização.

### Interface e inventário

- atualizado `ui2/InventoryWindow.js`;
- ajustes no fluxo de apresentação e comportamento da janela de inventário;
- integração da interface com as alterações recentes de itens e apresentação do personagem.

### Lua, monstros e dados do cliente

- adicionado `game/PcMonsterLuaPresentation.js`;
- expandida a apresentação de monstros orientada pelos dados e contratos Lua do cliente;
- atualizado `docs/ENGINE/09_DATA_LUA_OWNERS.md` para refletir os owners e consumidores Lua atuais;
- ampliada a documentação da relação entre dados do cliente, Lua e os sistemas que consomem essas informações em runtime.

### Icarus, mapas e efeitos de mundo

- adicionado `world/PcIcarusEnvironment.js`;
- atualizado `world/PcMapParticles.js`;
- atualizado `world/PcThunderJoint.js`;
- ampliada a composição ambiental específica de Icarus;
- ajustes no processamento e apresentação de partículas de mapa;
- evolução do sistema de joints/efeitos de trovão utilizados no mundo;
- melhor separação entre efeitos ambientais específicos e a camada genérica de partículas do mapa.

### Itens e dados de apresentação

- atualizado `data/PcItemInfo.js`;
- refinada a integração das informações de itens com os consumidores da engine;
- atualização da base usada por inventário, apresentação e sistemas relacionados aos itens.

### Renderização e composição do personagem

- atualizado `assets/MUModelRenderer.js`;
- atualizado `graphics/PlayerComposer.js`;
- ajustes na renderização de modelos e na composição visual do personagem;
- evolução da integração entre modelos equipados, apresentação do player e pipeline gráfico.

### Skills e efeitos

- adicionada documentação técnica em `docs/ENGINE/07_SKILLS_EFFECTS.md`;
- documentação dos sistemas de skills e efeitos atualizada para acompanhar a estrutura atual da engine.

### Documentação técnica

- documentação da engine ampliada e reorganizada;
- atualizados índices e referências entre módulos;
- adicionadas páginas de arquitetura, boot/runtime, pipeline de renderização, mapas/objetos, itens/inventário/equipamentos e demais áreas documentadas nesta atualização;
- README atualizado para acompanhar o estado atual da source.

### Inicialização no Windows

- `INICIAR_MUWEB.bat` atualizado para representar o launcher operacional mais recente da source;
- `INSTALAR_DEPENDENCIAS.bat` mantido para preparação do ambiente;
- `PARAR_MUWEB.bat` mantido para encerramento dos processos locais do projeto.

---

## 05/10/2026 01:22 BRT

### Estado acumulado do projeto

Esta atualização consolida o estado atual da source e organiza as principais áreas já implementadas.

### Engine e runtime

- estrutura principal do cliente Web em JavaScript/WebGL;
- bootstrap e ciclo de execução do cliente;
- configuração de runtime e carregamento inicial;
- gerenciamento de tempo, input e estado do jogo;
- integração entre cenas, mundo, interface e sistemas de gameplay;
- suporte a ferramentas locais de desenvolvimento e execução.

### Renderização e gráficos

- parser e adaptação de modelos BMD;
- renderização de modelos, personagens, itens e objetos;
- gerenciamento de texturas e materiais;
- efeitos visuais, sprites, blending e apresentação de materiais;
- câmera 3D e composição de cena;
- renderização de itens no chão, inventário e personagem;
- suporte a elementos visuais específicos de mapas e ambientes.

### Mapas, terrain e mundo

- carregamento de mapas e dados de terrain;
- objetos de cenário e composição do mundo;
- pathfinding e movimentação;
- portais e transições de mapas;
- partículas e elementos ambientais;
- lógica visual específica de Lorencia, Icarus e outros contextos já integrados;
- suporte a visibilidade, interiores e orçamento de carregamento do mundo.

### Personagens, monstros, NPCs e viewport

- classes e composição visual de personagens;
- gerenciamento de personagens visíveis no viewport;
- monstros, modelos e apresentação visual;
- NPCs e integração com interações do cliente;
- sincronização de entidades com dados recebidos do servidor;
- regras de equipamentos e aparência do personagem;
- suporte a previews e apresentação de modelos customizados.

### Itens, inventário e equipamentos

- estrutura de itens e atributos;
- inventário e movimentação de itens;
- codificação e decodificação de itens de protocolo;
- modelos e resolução de apresentação de itens;
- equipamentos no personagem;
- materiais, transparência, efeitos e apresentação visual;
- dados de itens gerados e integração com dados reais do cliente;
- suporte a sistemas avançados de itens já incorporados à engine.

### Lua e dados do cliente

- loaders e consumidores de dados Lua utilizados pelo cliente;
- integração de configurações de itens, efeitos e UI provenientes de Lua;
- resolução de dados de personagens, itens, monstros, mapas e skills;
- integração de textos e atributos do cliente;
- suporte a dados customizados usados pela source atual.

### Pets, helpers e elementos customizados

- sistema de pets integrado ao personagem e viewport;
- lógica de helpers e composição visual associada;
- suporte a apresentação customizada de equipamentos e elementos auxiliares;
- integração com dados de preview e apresentação definidos pelo cliente e servidor.

### Skills, buffs e efeitos de gameplay

- sistema de skills e dados de atributos;
- roteamento de cast e recebimento de magias;
- efeitos de skills e impactos visuais;
- buffs e estados temporários;
- integração de efeitos específicos de classes já portados;
- suporte a efeitos de combate e feedback visual.

### Movimento e controle

- movimentação do personagem;
- click-to-move;
- colisão com o mundo;
- direção e regras de movimentação;
- integração entre input, pathfinding e estado do personagem.

### Interface e HUD

- sistema base de janelas;
- viewport virtual da interface;
- inventário e janela de personagem;
- buffs, barra de skills e ícones;
- minimapa;
- janelas de comandos e notificações;
- storage e NPC Shop;
- Chaos Machine e outras interfaces já integradas;
- elementos de status e atalhos rápidos.

### Social e sistemas de jogo

- party;
- guild;
- trade;
- duel;
- friends;
- PK;
- quests;
- drops;
- floating text;
- opções do jogo;
- progression, mastery e awakening onde integrados pela source atual.

### Rede e protocolo

- WebSocket/TCP bridge;
- gateway do cliente;
- configuração de conexão;
- gerenciamento de servidores;
- opcodes e tipos de pacotes;
- construção, criptografia e roteamento de pacotes;
- implementação de protocolo real utilizada pela source atual.

### Banco e serviços auxiliares

- estruturas para contas e personagens;
- warehouse;
- guild;
- ranking;
- logs de eventos;
- configuração e acesso aos dados utilizados pelo ambiente de desenvolvimento.

### Áudio

- gerenciamento de sons;
- sound board e integração de áudio com o cliente;
- recursos auxiliares de reprodução utilizados pela engine.

### Ferramentas de desenvolvimento

- servidor local de assets;
- servidor web de desenvolvimento;
- geradores de mapas e tabelas de dados usados pela source;
- utilitários para dados reais, itens, monstros e skills;
- ferramentas auxiliares necessárias para preparar ou validar recursos da engine.

### Inicialização no Windows

- `INICIAR_MUWEB.bat`;
- `INSTALAR_DEPENDENCIAS.bat`;
- `PARAR_MUWEB.bat`.
