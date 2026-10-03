# GitHub security pre-check

## Resultado da preparação

O tree contém arquivos de configuração de rede/database feitos para desenvolvimento. Antes de tornar o repositório público, trate configurações locais como potencialmente sensíveis.

### Pontos encontrados

- `network/.env.example` existe e deve continuar apenas como exemplo.
- configs de network possuem campos de password vazios.
- `database/config/database.js` contém um **default de desenvolvimento** para `DB_PASSWORD`; não é adequado publicar/usar como segredo real. Recomenda-se remover o default e exigir `process.env.DB_PASSWORD` antes de qualquer publicação pública/produção.
- testes/probes usam credenciais fictícias simples (`1`, `teste`) para wire tests; não confundir com credenciais reais.

## .gitignore

O pacote GitHub-ready ignora `.env`, logs, node_modules, caches, dumps e artifacts ZIP.

## Regra

Não subir Data completa/proprietária nem dumps/logs que possam conter account names, IPs públicos, tokens ou credenciais reais.
