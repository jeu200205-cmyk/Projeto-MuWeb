# Executando e configurando

## Dependências

```bash
npm install
```

## Data do cliente

A pasta Data não é distribuída no repositório. Use sua própria Data compatível:

```bash
node tools/asset-server.cjs "C:\MU\Client\Data" 9100
```

## Gateway

```bash
npm run gateway
```

## Web

```bash
npm run serve
```

Abra `http://127.0.0.1:8080/`.

Portas padrão da base: Web `8080`, assets `9100`, WebSocket gateway `9091`, ConnectServer `44405`, GameServer `55901`; a configuração também contém uma lane alternativa `55902`.

Mantenha os serviços em loopback durante desenvolvimento e nunca versione senhas/tokens reais.
