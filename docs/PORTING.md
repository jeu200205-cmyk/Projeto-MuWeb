# Portabilidade Main 5.2 → Web

O projeto foi construído usando o **Main 5.2** como referência principal de comportamento do cliente.

Para continuar a portabilidade, o fluxo recomendado é: localizar a lógica no Main 5.2, identificar os dados/configurações consumidos, portar o contrato completo para Web, comparar PC e Web com a mesma entrada e só então considerar a área fechada.

Ainda precisam de muito trabalho: modelos/bones/animações, materials e blend, terrain/objetos por mapa, personagem/equipamentos, inventário 3D, skills/FX, protocolo/viewport, UI/HUD, áudio e performance.

**Estado atual:** base inicial, abaixo de 10% do objetivo de paridade total.
