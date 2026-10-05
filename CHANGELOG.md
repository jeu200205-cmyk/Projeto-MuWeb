# Changelog

Histórico público acumulativo do Projeto MuWeb.

Base do projeto: **MU Online Main 5.2 do Dinho**.

---

## 05/10/2026 01:22 BRT

### Estado acumulado do projeto

Esta atualização consolida o estado público atual da source e organiza o changelog por sistemas, sem expor nomes internos de builds, checkpoints ou correções privadas.

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
- codificação/decodificação de itens de protocolo;
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
- integração com dados de preview e apresentação definidos pelo cliente/servidor.

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
- geradores de mapas/tabelas de dados usados pela source;
- utilitários para dados reais, itens, monstros e skills;
- ferramentas auxiliares necessárias para preparar ou validar recursos da engine.

### Inicialização no Windows

A publicação pública mantém somente os launchers necessários para uso da source:

- `INICIAR_MUWEB.bat`;
- `INSTALAR_DEPENDENCIAS.bat`;
- `PARAR_MUWEB.bat`.

Os launchers públicos representam a versão operacional mais recente disponível na source publicada.

### Organização pública

A publicação pública não acumula arquivos temporários, relatórios internos, hashes de checkpoints, históricos privados de desenvolvimento, launchers antigos ou artefatos de teste desnecessários para executar, estudar ou continuar o projeto.
