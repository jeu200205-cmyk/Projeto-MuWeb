# Publicar atualização do Projeto MuWeb

Este arquivo define o fluxo público de atualização do repositório.

## Comando curto para ChatGPT Work

Use:

```text
PUBLICAR MUWEB
```

Ao receber esse comando, o fluxo esperado é:

1. localizar a source MuWeb mais nova e válida fornecida no trabalho;
2. sincronizar a source completa com a branch `main` deste repositório;
3. preservar os arquivos públicos de automação deste repositório;
4. não publicar ZIPs internos, logs, relatórios privados, checkpoints, arquivos temporários ou dados locais;
5. não usar nomes internos como FIX, HOTFIX, checkpoint ou números privados de build em commits, documentação, changelog, tags ou releases;
6. manter os arquivos `.bat` necessários para instalar, iniciar e parar o projeto;
7. executar as validações disponíveis;
8. fazer commit e push da source atualizada;
9. executar o workflow **Publicar atualização MuWeb**;
10. fornecer ao workflow um resumo público das mudanças relevantes;
11. confirmar ao final o commit publicado, a tag/release criada e o resultado das validações.

## Base do projeto

A documentação pública deve informar de forma simples que o Projeto MuWeb utiliza como base o **MU Online Main 5.2 do Dinho**.

## Changelog

O arquivo `CHANGELOG.md` é atualizado automaticamente pelo workflow `.github/workflows/publish-update.yml`.

O changelog público deve descrever mudanças por sistema, por exemplo:

- renderização de mapas e objetos;
- itens, equipamentos, asas, pets e montarias;
- interface, inventário e tooltips;
- skills, animações e efeitos;
- loaders e integração de dados/Lua;
- protocolos, viewport e gateway;
- desempenho, carregamento e correções de estabilidade.

Nunca incluir nomes internos usados durante o desenvolvimento.

## GitHub Release

Quando a opção `create_release` estiver habilitada, o workflow cria automaticamente:

- uma tag no formato `update-AAAA-MM-DD-HHMMSS`;
- um GitHub Release com título público;
- release notes derivadas do changelog.

## Publicação pelo próprio GitHub

Depois que a source já estiver sincronizada na branch `main`, também é possível abrir **Actions → Publicar atualização MuWeb → Run workflow**.

Os campos `title` e `summary` são opcionais. Se ficarem vazios, o workflow gera textos públicos neutros automaticamente.
