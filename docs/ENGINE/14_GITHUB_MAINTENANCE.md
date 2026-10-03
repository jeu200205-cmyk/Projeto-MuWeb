# 14 — Fluxo GitHub e manutenção

## Estrutura recomendada do repositório

- `main`: checkpoints que passaram gates e foram testados fisicamente quando aplicável;
- `develop`: integração corrente;
- `fix/r90-fixNN-*`: correções focadas;
- tags `r90-fix9`, `r90-fix10`, ... para releases;
- GitHub Releases para ZIP FULL/LEAN, patches e hashes em vez de manter todos os ZIPs dentro do Git history.

## O que deve ficar versionado

Código fonte, launchers, configs sem segredo, generators, testes, manifests necessários, documentação e pequenos fixtures.

## O que não deve ir para Git

`node_modules`, logs locais, caches, dumps, credenciais, `.env`, senhas reais, Data proprietária completa e ZIPs históricos duplicados.

## Commit padrão

`fix(items): port PC inventory presentation owners`

Body: parent/checkpoint, source PC owners comparados, changed paths, gates e limitações físicas.

## CI recomendado

- npm install/ci;
- syntax check;
- FIX gate corrente;
- regressões selecionadas;
- generator determinism;
- secret scan;
- artifact SHA-256.

## Atualização automática futura

Depois que o repositório estiver conectado com permissão de escrita, o fluxo pode ser repetido a cada FIX: atualizar código, regenerar docs/status, criar branch/commit/PR, registrar hashes e abrir issues para gaps ainda abertos.
