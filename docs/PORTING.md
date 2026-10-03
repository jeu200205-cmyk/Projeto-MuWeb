# Portabilidade Main 5.2 → Web

Este projeto foi construído usando o **Main 5.2** como referência principal para comportamento do cliente.

A ideia não é apenas reproduzir a aparência: cada subsistema precisa ser reinterpretado para o ambiente do navegador, mantendo os contratos importantes do cliente PC.

## O que precisa ser traduzido

- modelos, bones, animações e transforms;
- materials, blend, alpha, chrome e efeitos;
- terrain, objetos e regras específicas por mapa;
- composição visual de personagens/equipamentos;
- inventário e preview 3D;
- skills e seus estágios visuais;
- protocolos, lifecycle de conexão e viewport;
- UI/HUD/input;
- áudio;
- regras dependentes de Data/Lua;
- performance para WebGL/browser.

## Método recomendado para continuar

1. localizar o owner da lógica no Main 5.2;
2. localizar Data/configuração consumida por aquela lógica;
3. portar o contrato completo, não só o branch que aparece em um teste;
4. comparar PC e Web com o mesmo personagem/mapa/item/skill;
5. medir performance e corrigir sem remover conteúdo visual necessário;
6. só marcar como completo quando o comportamento estiver reproduzível.

## Estado atual

O repositório é uma **base inicial, abaixo de 10% do objetivo de paridade total**. Há várias áreas parcialmente iniciadas, mas nenhuma porcentagem por módulo deve ser interpretada como garantia de fidelidade.
