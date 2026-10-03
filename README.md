# Projeto MuWeb

Base experimental de uma engine/client Web inspirada no **MU Online Main 5.2**.

> **Estado do projeto:** muito inicial. Esta publicação deve ser tratada como uma base de estudo e continuação, **não como um cliente completo**. Pelo escopo de paridade com o Main 5.2, o projeto ainda está abaixo de 10% de conclusão.

O objetivo é permitir que outras pessoas estudem e continuem a adaptação de sistemas do cliente para JavaScript/WebGL, mantendo o Main 5.2 como referência de comportamento. A presença de um módulo na árvore não significa que aquele sistema esteja completo ou fiel ao PC.

## O que está neste repositório

- código da engine Web e do cliente;
- parser e renderização de modelos BMD;
- carregamento de terrain e objetos de mapa;
- personagem, monstros, NPCs, viewport e movimento;
- base de inventário/equipamento e renderização de itens;
- base de skills, buffs e efeitos;
- UI/HUD em desenvolvimento;
- protocolo MU, gateway WebSocket↔TCP e roteamento de pacotes;
- suporte a leitura de dados/configurações usados pelo cliente;
- utilitários mínimos para servir a aplicação e os assets localmente.

## O que NÃO está incluído

- Data completa do cliente MU;
- executáveis/servidores MU;
- banco de dados pronto;
- garantia de compatibilidade com qualquer Season/Data;
- paridade completa com Main 5.2.

Você precisa fornecer sua própria pasta `Data` compatível e seu próprio ambiente de servidor, se quiser testar conexão real.

## Requisitos

- Node.js 18+;
- navegador com WebGL;
- pasta `Data` do cliente compatível com o projeto;
- opcionalmente, ConnectServer/GameServer local para testes de rede.

## Executando a base

```bash
npm install
node tools/asset-server.cjs "C:\caminho\para\Data" 9100
npm run gateway
npm run serve
```

Abra `http://127.0.0.1:8080/`.

Por padrão, `runtime-config.js` aponta os assets para `http://127.0.0.1:9100/` e o gateway para `ws://127.0.0.1:9091`.

## Documentação

- [Engine e fluxo principal](docs/ENGINE.md)
- [Mapa dos sistemas](docs/SYSTEMS.md)
- [Como executar e configurar](docs/RUNNING.md)
- [Portabilidade Main 5.2 → Web](docs/PORTING.md)
- [O que falta](docs/ROADMAP.md)
- [Estrutura da source](docs/SOURCE_LAYOUT.md)

## Aviso de segurança

Os serviços de desenvolvimento devem permanecer em `127.0.0.1` até que autenticação, autorização, rate-limit e configuração de produção sejam revisados. Não publique gateway, banco ou serviços internos diretamente na Internet.
