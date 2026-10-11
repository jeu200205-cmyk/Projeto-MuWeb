# MU Online Network Infrastructure

Infraestrutura de rede completa para conectar clientes Web (WebSocket) aos servidores MU Online reais (ConnectServer, GameServer, JoinServer, DataServer).

## 📋 Visão Geral

Esta implementação fornece:

- **MUGateway.js** - Gateway WebSocket ↔ TCP bidirecional com suporte ao protocolo MU (C1/C2)
- **MUServerManager.js** - Gerenciador dos 4 servidores reais com health checks e auto-restart
- **MUConfig.js** - Configuração centralizada via config.json + variáveis de ambiente
- **ServerLauncher.js** - Inicializador de processos com monitoramento
- **index.js** - Ponto de entrada unificado com CLI

## 🏗️ Arquitetura

```
┌─────────────┐     WebSocket      ┌──────────────────┐
│  Web Client │ ◄────────────────► │   MUGateway      │
│  (Browser)  │     (ws://:9091)   │  (WebSocket↔TCP) │
└─────────────┘                    └────────┬─────────┘
                                            │
         ┌──────────────────────────────────┼──────────────────────────────────┐
         │                                  │                                  │
         ▼                                  ▼                                  ▼
┌──────────────────┐              ┌──────────────────┐              ┌──────────────────┐
│  ConnectServer   │              │   GameServers    │              │   JoinServer     │
│   (TCP: 44405)   │              │   (TCP: 55901+)  │              │   (TCP: 55970)   │
│  - Server List   │              │  - Game Logic    │              │  - Auth/Account  │
│  - Client Proxy  │              │  - Load Balance  │              │  - Char Select   │
└──────────────────┘              └──────────────────┘              └──────────────────┘
                                                                                 │
                                                                                 ▼
                                                                        ┌──────────────────┐
                                                                        │   DataServer     │
                                                                        │   (TCP: 55960)   │
                                                                        │  - Char Data     │
                                                                        │  - Inventory     │
                                                                        │  - Warehouse     │
                                                                        └──────────────────┘
```

## 📦 Instalação

```bash
cd web-port/network
npm install
```

## ⚙️ Configuração

### 1. Configuração Principal (`config.json`)

```json
{
  "gateway": { "host": "0.0.0.0", "port": 9091 },
  "connectServer": { "host": "127.0.0.1", "port": 44405 },
  "gameServers": [{ "id": 1, "host": "127.0.0.1", "port": 55901 }],
  "joinServer": { "host": "127.0.0.1", "port": 55970 },
  "dataServer": { "host": "127.0.0.1", "port": 55960 },
  "processManager": {
    "workingDirectory": "C:\\path\\to\\mu-server",
    "servers": {
      "connectServer": { "executable": "ConnectServer.exe" },
      "gameServer": { "executable": "GameServer.exe" },
      "joinServer": { "executable": "JoinServer.exe" },
      "dataServer": { "executable": "DataServer.exe" }
    }
  }
}
```

### 2. Variáveis de Ambiente (`.env`)

```bash
cp .env.example .env
# Edite .env com seus valores
```

## 🚀 Uso

### Modo Daemon (Produção)
```bash
npm start
# ou
node index.js
```

### CLI - Comandos de Controle
```bash
# Status geral
npm run status
node index.js status

# Estatísticas do Gateway
npm run gateway
node index.js gateway

# Status dos Servidores
npm run servers
node index.js servers

# Métricas
npm run metrics
node index.js metrics

# Reiniciar servidor
node index.js restart connectServer
node index.js restart gameServer

# Parar/Iniciar servidor
node index.js stop gameServer
node index.js start gameServer

# Gerenciar GameServers
node index.js add-gs "GameServer-02" 127.0.0.1 55902
node index.js remove-gs 2

# Ver configuração
npm run config
node index.js config
```

## 🔌 Protocolo MU Online

### Headers de Pacote
- **C1** (0xC1) - Pacote pequeno: `[C1][size][head][data...]`
- **C2** (0xC2) - Pacote grande: `[C2][sizeHi][sizeLo][head][data...]`

### Comandos Principais

| Comando | Hex | Descrição |
|---------|-----|-----------|
| SERVER_INFO_REQUEST | 0xF4/0x03 | Cliente solicita info do servidor |
| SERVER_LIST_REQUEST | 0xF4/0x06 | Cliente solicita lista de servidores |
| SERVER_INIT | 0x00 | Inicialização da conexão |
| JS_CONNECT_ACCOUNT | 0x01 | Autenticação de conta (JoinServer) |
| JS_MAP_SERVER_MOVE | 0x03 | Mudança de servidor (JoinServer) |
| DS_CHARACTER_LIST | 0x01 | Lista de personagens (DataServer) |
| DS_CHARACTER_INFO | 0x04 | Info detalhada do personagem |

## 📊 Métricas Prometheus

Disponível em `http://localhost:9092/metrics`

```prometheus
# HELP mu_gateway_ws_connections_total Total WebSocket connections
# TYPE mu_gateway_ws_connections_total gauge
mu_gateway_ws_connections_total 42

# HELP mu_gateway_packets_received_total Total packets received
# TYPE mu_gateway_packets_received_total counter
mu_gateway_packets_received_total 12345

# HELP mu_gateway_game_server_connected GameServer connection status
# TYPE mu_gateway_game_server_connected gauge
mu_gateway_game_server_connected{server_id="1"} 1
```

## 🏥 Health Checks

Endpoints monitorados automaticamente:
- ConnectServer: TCP 44405
- JoinServer: TCP 55970
- DataServer: TCP 55960

Intervalo padrão: 10 segundos

## 🔒 Segurança

- IP Whitelist/Blacklist
- Rate limiting por IP
- Anti-DDoS (limite de pacotes/segundo)
- Máximo de conexões por IP

## 📁 Estrutura de Arquivos

```
web-port/network/
├── index.js              # Entry point + CLI
├── MUConfig.js           # Configuração centralizada
├── MUGateway.js          # WebSocket ↔ TCP Gateway
├── MUServerManager.js    # Gerenciador de servidores
├── ServerLauncher.js     # Launcher de processos
├── config.json           # Configuração padrão
├── .env.example          # Exemplo de variáveis de ambiente
├── package.json
├── utils/
│   └── logger.js         # Logger (winston/console)
└── logs/                 # Diretório de logs (criado automaticamente)
```

## 🔧 Desenvolvimento

```bash
# Modo watch para desenvolvimento
npm run dev

# Testes
npm test

# Lint
npm run lint
```

## 📝 Logs

Logs estruturados em JSON no diretório `logs/`:
- `mu-network.log` - Logs gerais
- `mu-gateway.log` - Logs do gateway
- `mu-server-manager.log` - Logs do server manager
- `packets/` - Logs de pacotes para debug

## 🎮 Fluxo de Conexão do Cliente

1. Cliente Web conecta via WebSocket em `ws://localhost:9091`
2. Gateway envia pacote INIT (0x00) com resultado=1
3. Cliente envia SERVER_LIST_REQUEST (0xF4/0x06)
4. Gateway encaminha para ConnectServer (TCP 44405)
5. ConnectServer responde com lista de GameServers
6. Gateway encaminha resposta para cliente Web
7. Cliente escolhe servidor e envia credenciais
8. Gateway roteia para JoinServer (autenticação)
9. Após auth, roteia para GameServer selecionado
10. GameServer comunica com DataServer para dados do personagem

## 🐛 Debug

### Log de Pacotes
Ative em `config.json`:
```json
"gateway": { "packetLogEnabled": true }
```

### Conexão Direta para Teste
```bash
# Testa ConnectServer
telnet 127.0.0.1 44405

# Testa JoinServer
telnet 127.0.0.1 55970

# Testa DataServer
telnet 127.0.0.1 55960
```

## 📌 Requisitos

- Node.js 18+
- Servidores MU compilados (ConnectServer.exe, GameServer.exe, JoinServer.exe, DataServer.exe)
- SQL Server com database MuOnline
- Windows (para executáveis .exe) ou Wine/Linux

## 🤝 Integração com Cliente Web

```javascript
// Cliente JavaScript
const ws = new WebSocket('ws://localhost:9091');

ws.binaryType = 'arraybuffer';

ws.onopen = () => {
    console.log('Conectado ao Gateway MU');
};

ws.onmessage = (event) => {
    const data = new Uint8Array(event.data);
    const header = data[0];
    const head = header === 0xC1 ? data[2] : data[3];
    
    // Processa resposta do servidor
    handlePacket(head, data);
};

// Envia pacote MU
function sendPacket(packet) {
    ws.send(packet.buffer);
}
```

## 📄 Licença

MIT License - Veja LICENSE para detalhes.

## 🙏 Créditos

Baseado na arquitetura do **MuEMU** (ConnectServer, GameServer, JoinServer, DataServer).