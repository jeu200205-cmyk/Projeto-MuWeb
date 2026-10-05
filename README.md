# Projeto MuWeb

Cliente/engine Web experimental desenvolvido a partir da base **MU Online Main 5.2 do Dinho**, com adaptação progressiva dos sistemas originais para JavaScript/WebGL.

O repositório publica a source de desenvolvimento atual do projeto para estudo e continuação. O projeto ainda está em evolução e não representa uma portabilidade completa do cliente de PC.

## Principais áreas da source

- renderer BMD, materiais e texturas;
- terrain, mapas, objetos e câmera;
- personagens, monstros, NPCs, pets e viewport;
- inventário, equipamentos, itens e apresentação 3D;
- skills, buffs e efeitos;
- UI/HUD e entrada;
- protocolo MU, WebSocket/TCP e gateway;
- loaders de dados e integrações Lua utilizadas pelo cliente;
- ferramentas locais para servir assets e executar o cliente Web.

## Requisitos

- Node.js 18 ou superior;
- navegador com WebGL;
- uma pasta `Data` compatível do cliente, fornecida pelo próprio usuário;
- servidor MU compatível para testes de conexão real.

## Executar no Windows

1. Extraia ou clone o projeto.
2. Execute `INSTALAR_DEPENDENCIAS.bat` na primeira vez.
3. Execute `INICIAR_MUWEB.bat`.
4. Acesse o endereço local informado pelo launcher.
5. Para encerrar os processos iniciados pela source, execute `PARAR_MUWEB.bat`.

A pasta `Data`, GameServer, ConnectServer e demais servidores não fazem parte deste repositório.

## Executar manualmente

```bash
npm ci
node tools/asset-server.cjs "C:\\caminho\\para\\Data" 9100
node gateway-server.cjs
node tools/dev-web-server.cjs 8080
```

Depois abra `http://127.0.0.1:8080/`.

## Atualizações

- [Changelog](CHANGELOG.md)

## Documentação

- [Visão da engine](docs/ENGINE.md)
- [Mapa dos sistemas](docs/SYSTEMS.md)
- [Execução e configuração](docs/RUNNING.md)
- [Portabilidade PC → Web](docs/PORTING.md)
- [Estrutura da source](docs/SOURCE_LAYOUT.md)
- [Roadmap](docs/ROADMAP.md)

## Segurança

Mantenha os serviços de desenvolvimento em `127.0.0.1` até revisar autenticação, autorização, rate-limit e configuração de produção. Não publique diretamente gateway, banco ou serviços internos sem proteção adequada.
