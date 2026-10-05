# Changelog

Base do projeto: **MU Online Main 5.2 do Dinho**.

---

## 05/10/2026 01:35 BRT

Atualização da source do Projeto MuWeb.

### Engine e runtime

- 1 alterado(s).
- Principais arquivos: `core/GameApp.js`.

### Inicializacao

- 1 alterado(s).
- Principais arquivos: `INICIAR_MUWEB.bat`.

### Interface e HUD

- 1 alterado(s).
- Principais arquivos: `ui2/InventoryWindow.js`.

### Lua e dados

- 1 adicionado(s); 1 alterado(s).
- Principais arquivos: `game/PcMonsterLuaPresentation.js`, `docs/ENGINE/09_DATA_LUA_OWNERS.md`.

### Mapas e mundo

- 1 adicionado(s); 2 alterado(s).
- Principais arquivos: `world/PcIcarusEnvironment.js`, `world/PcMapParticles.js`, `world/PcThunderJoint.js`.

### Outros

- 16 adicionado(s); 3 alterado(s).
- Principais arquivos: `README.md`, `docs/ENGINE/00_INDEX.md`, `docs/ENGINE/12_REMAINING_PORTS.md`, `docs/ENGINE/01_ARCHITECTURE.md`, `docs/ENGINE/02_RUNTIME_BOOT_FLOW.md`, `docs/ENGINE/03_RENDERING_PIPELINE.md`, `docs/ENGINE/04_MAP_TERRAIN_OBJECTS.md`, `docs/ENGINE/05_ITEMS_INVENTORY_EQUIPMENT.md`.
- Outros 11 arquivo(s) dessa área também foram atualizados.

### Personagens, itens e gameplay

- 1 alterado(s).
- Principais arquivos: `data/PcItemInfo.js`.

### Renderizacao e efeitos

- 2 alterado(s).
- Principais arquivos: `assets/MUModelRenderer.js`, `graphics/PlayerComposer.js`.

### Skills e combate

- 1 adicionado(s).
- Principais arquivos: `docs/ENGINE/07_SKILLS_EFFECTS.md`.

### Inicialização no Windows

- `INICIAR_MUWEB.bat` atualizado ou preservado como launcher público atual.
- `INSTALAR_DEPENDENCIAS.bat` atualizado ou preservado como launcher público atual.
- `PARAR_MUWEB.bat` atualizado ou preservado como launcher público atual.

---

## 05/10/2026 01:22 BRT

### Estado acumulado do projeto

Esta atualizaÃ§Ã£o consolida o estado atual da source e organiza as principais Ã¡reas jÃ¡ implementadas.

### Engine e runtime

- estrutura principal do cliente Web em JavaScript/WebGL;
- bootstrap e ciclo de execuÃ§Ã£o do cliente;
- configuraÃ§Ã£o de runtime e carregamento inicial;
- gerenciamento de tempo, input e estado do jogo;
- integraÃ§Ã£o entre cenas, mundo, interface e sistemas de gameplay;
- suporte a ferramentas locais de desenvolvimento e execuÃ§Ã£o.

### RenderizaÃ§Ã£o e grÃ¡ficos

- parser e adaptaÃ§Ã£o de modelos BMD;
- renderizaÃ§Ã£o de modelos, personagens, itens e objetos;
- gerenciamento de texturas e materiais;
- efeitos visuais, sprites, blending e apresentaÃ§Ã£o de materiais;
- cÃ¢mera 3D e composiÃ§Ã£o de cena;
- renderizaÃ§Ã£o de itens no chÃ£o, inventÃ¡rio e personagem;
- suporte a elementos visuais especÃ­ficos de mapas e ambientes.

### Mapas, terrain e mundo

- carregamento de mapas e dados de terrain;
- objetos de cenÃ¡rio e composiÃ§Ã£o do mundo;
- pathfinding e movimentaÃ§Ã£o;
- portais e transiÃ§Ãµes de mapas;
- partÃ­culas e elementos ambientais;
- lÃ³gica visual especÃ­fica de Lorencia, Icarus e outros contextos jÃ¡ integrados;
- suporte a visibilidade, interiores e orÃ§amento de carregamento do mundo.

### Personagens, monstros, NPCs e viewport

- classes e composiÃ§Ã£o visual de personagens;
- gerenciamento de personagens visÃ­veis no viewport;
- monstros, modelos e apresentaÃ§Ã£o visual;
- NPCs e integraÃ§Ã£o com interaÃ§Ãµes do cliente;
- sincronizaÃ§Ã£o de entidades com dados recebidos do servidor;
- regras de equipamentos e aparÃªncia do personagem;
- suporte a previews e apresentaÃ§Ã£o de modelos customizados.

### Itens, inventÃ¡rio e equipamentos

- estrutura de itens e atributos;
- inventÃ¡rio e movimentaÃ§Ã£o de itens;
- codificaÃ§Ã£o e decodificaÃ§Ã£o de itens de protocolo;
- modelos e resoluÃ§Ã£o de apresentaÃ§Ã£o de itens;
- equipamentos no personagem;
- materiais, transparÃªncia, efeitos e apresentaÃ§Ã£o visual;
- dados de itens gerados e integraÃ§Ã£o com dados reais do cliente;
- suporte a sistemas avanÃ§ados de itens jÃ¡ incorporados Ã  engine.

### Lua e dados do cliente

- loaders e consumidores de dados Lua utilizados pelo cliente;
- integraÃ§Ã£o de configuraÃ§Ãµes de itens, efeitos e UI provenientes de Lua;
- resoluÃ§Ã£o de dados de personagens, itens, monstros, mapas e skills;
- integraÃ§Ã£o de textos e atributos do cliente;
- suporte a dados customizados usados pela source atual.

### Pets, helpers e elementos customizados

- sistema de pets integrado ao personagem e viewport;
- lÃ³gica de helpers e composiÃ§Ã£o visual associada;
- suporte a apresentaÃ§Ã£o customizada de equipamentos e elementos auxiliares;
- integraÃ§Ã£o com dados de preview e apresentaÃ§Ã£o definidos pelo cliente e servidor.

### Skills, buffs e efeitos de gameplay

- sistema de skills e dados de atributos;
- roteamento de cast e recebimento de magias;
- efeitos de skills e impactos visuais;
- buffs e estados temporÃ¡rios;
- integraÃ§Ã£o de efeitos especÃ­ficos de classes jÃ¡ portados;
- suporte a efeitos de combate e feedback visual.

### Movimento e controle

- movimentaÃ§Ã£o do personagem;
- click-to-move;
- colisÃ£o com o mundo;
- direÃ§Ã£o e regras de movimentaÃ§Ã£o;
- integraÃ§Ã£o entre input, pathfinding e estado do personagem.

### Interface e HUD

- sistema base de janelas;
- viewport virtual da interface;
- inventÃ¡rio e janela de personagem;
- buffs, barra de skills e Ã­cones;
- minimapa;
- janelas de comandos e notificaÃ§Ãµes;
- storage e NPC Shop;
- Chaos Machine e outras interfaces jÃ¡ integradas;
- elementos de status e atalhos rÃ¡pidos.

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
- opÃ§Ãµes do jogo;
- progression, mastery e awakening onde integrados pela source atual.

### Rede e protocolo

- WebSocket/TCP bridge;
- gateway do cliente;
- configuraÃ§Ã£o de conexÃ£o;
- gerenciamento de servidores;
- opcodes e tipos de pacotes;
- construÃ§Ã£o, criptografia e roteamento de pacotes;
- implementaÃ§Ã£o de protocolo real utilizada pela source atual.

### Banco e serviÃ§os auxiliares

- estruturas para contas e personagens;
- warehouse;
- guild;
- ranking;
- logs de eventos;
- configuraÃ§Ã£o e acesso aos dados utilizados pelo ambiente de desenvolvimento.

### Ãudio

- gerenciamento de sons;
- sound board e integraÃ§Ã£o de Ã¡udio com o cliente;
- recursos auxiliares de reproduÃ§Ã£o utilizados pela engine.

### Ferramentas de desenvolvimento

- servidor local de assets;
- servidor web de desenvolvimento;
- geradores de mapas e tabelas de dados usados pela source;
- utilitÃ¡rios para dados reais, itens, monstros e skills;
- ferramentas auxiliares necessÃ¡rias para preparar ou validar recursos da engine.

### InicializaÃ§Ã£o no Windows

- `INICIAR_MUWEB.bat`;
- `INSTALAR_DEPENDENCIAS.bat`;
- `PARAR_MUWEB.bat`.

