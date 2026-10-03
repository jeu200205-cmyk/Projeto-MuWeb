# 13 — Validação e testes

## Estado desta preparação

- `test-r90-fix9-pc-hidden-item-presentation.mjs`: **12/12 PASS**.
- `node --check` em todos os módulos de produção considerados: **184/184 PASS**.
- produção analisada: **184 módulos**.

## Estrutura de testes existente

- **372** arquivos `test-*.mjs` no root, cobrindo uma longa cadeia R11→R90;
- **15** arquivos em `tests/`;
- **34** arquivos em `validation/`;
- **97** scripts de tooling JS/MJS/CJS.

## Classes de gate

1. **syntax:** módulos parseiam em Node.
2. **contract/static:** strings/branches/owners esperados estão presentes.
3. **unit/data parser:** Lua/BMD/packet parser com fixtures.
4. **integration:** combina estado/wire/renderer em ambiente controlado.
5. **physical:** Windows + browser + Data + GameServer + GPU real.

Só o nível 5 prova problemas como cor final, blend, clipping, hitch de driver e frame pacing real.

## Regra de release

Toda nova FIX deve registrar parent, changed paths, patch reproduzível, hashes, gates executados, gates não executados e limitações. Não promover uma release somente por teste textual.
