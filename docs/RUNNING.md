# Executando e configurando

## 1. Dependências

```bash
npm install
```

Dependências principais:

- `three`: WebGL/render;
- `ws`: gateway WebSocket.

## 2. Data do cliente

A pasta Data não é distribuída neste repositório. Use sua própria Data compatível.

```bash
node tools/asset-server.cjs "C:\MU\Client\Data" 9100
```

Esse servidor fornece BMD, texturas, mapas, sons e configurações para o browser em `127.0.0.1:9100`.

## 3. Gateway de rede

```bash
npm run gateway
```

O gateway principal está em `gateway-server.cjs` e, por padrão, trabalha em loopback.

Portas usadas pela base atual:

| Serviço | Padrão |
|---|---:|
| Web | 8080 |
| Assets | 9100 |
| WebSocket gateway | 9091 |
| ConnectServer | 44405 |
| GameServer clássico | 55901 |
| Lane alternativa usada por esta base | 55902 |

As portas do servidor MU dependem da sua configuração real.

## 4. Web

```bash
npm run serve
```

Abra `http://127.0.0.1:8080/`.

## 5. Configuração

`runtime-config.js` define URLs que o browser usa. `network/.env.example` e `network/config.json` mostram a estrutura de configuração de rede.

Nunca coloque senhas reais, tokens ou chaves privadas no Git.
