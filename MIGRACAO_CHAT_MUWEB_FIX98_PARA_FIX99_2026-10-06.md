# MIGRAÇÃO DE CHAT — MUWEB R90 — FIX98 → FIX99

Data: 06/10/2026 BRT

## Autoridade central nova

`MUWEB_R90_FIX99_EFFECT_RUNTIME_MAP_POOL_2026-10-06_FULL.zip`

Parent direto:

`MUWEB_R90_FIX98_EQUIPMENT_RAW_BMD_REATTACH_2026-10-05_FULL.zip`

Data único autorizado:

`C:\clientepromax\Nova pasta\MuPromax 1.0.1\Data`

## O que a FIX98 já fechou e não deve ser refeito

- `loadBMDRaw()` para extractors/raw triangle structures;
- `loadBMD()` adaptado a partir do mesmo raw cache;
- body/weapon/shield/wing/helper reattach usando contrato raw quando exigido;
- staged F3:13 atômico;
- regressões `m.triangles is not iterable` / `undefined.map` do contrato raw-adaptado.

## O que a FIX99 adiciona

1. `ItemEffects.lua::LoadEffect` passa a ter consumer real de item no chão em `graphics/PcGroundItemEffects.js` + `GroundItemLayer.js`.
2. CreateShiny mantém 24 ticks, duas partículas e RGB/scale/height/angle do owner.
3. CreateThunderBolt mantém 6 ticks e 500 energy + 500 glow lógicos por burst em buffers GPU retidos.
4. Lorencia usa pool de partículas para CreateFire/smoke e waterspout bone smoke.
5. `PcMapParticles` usa pools retidos para famílias Icarus/Devil Square/Tarkan já existentes e remove alocações de array no hot loop.
6. Gates protegem CharacterEffectItens nas 5 body parts, armas e acessórios e mantêm CharacterSetEffect boot-only.
7. Não existe fake closure para CreateEffect/CreateJoint genérico.

## Portabilidade de efeitos — estado preciso

### Ativo/consumido

- RenderModel material oracle;
- LoadItens model owner;
- CharacterEffectItens: body, right/left weapon, wing/helper;
- CharacterSetEffect sprite/particle no owner BOOTS;
- ItemEffects Runne;
- ItemEffects LoadEffect de itens dropados;
- Cape RenderMesh/sprite/particle já portados anteriormente;
- Helper stable render/effect rows já portados anteriormente.

### Ainda precisa continuar

- CharacterSet CreateSkill -> segundo child `CreateEffect` nativo;
- CustomCape CreateEffect/CreateJoint/RenderShadowModel;
- CharacterHelper Timer/RandTime/action/Black/CreateEffect/shadow/foot;
- ItemEffects LoadCustomLightEffect no BITMAP_JOINT_SPIRIT Evil Spirit subtype 0/3;
- restante de efeitos/objetos/map materials de Lorencia/Icarus/outros mapas;
- validação física com Data real e GPU.

## Validação FIX99 antes do selo final

PASS já obtido no workspace:

- gates FIX81, FIX83–FIX89;
- FIX90 dois gates;
- FIX91;
- FIX92;
- FIX93;
- FIX94;
- FIX95 quatro gates;
- FIX96 três gates;
- FIX97;
- FIX98;
- FIX99;
- `node --check` 476 JS/MJS/CJS.
- regressão estrutural cumulativa: 28 gates PASS; guards antigos de revision identity foram tornados forward-compatible (mínimo numérico) para não falhar falsamente em FIX99+.

Fechamento já executado no workspace: patch FIX98→FIX99 reprodutível e replayado com sucesso; manifesto final gerado; `--verify-only` PASS com 674 entradas / 673 arquivos imutáveis verificados; exatamente 3 BATs; sem `node_modules`. O `unzip -t` e SHA-256 do ZIP são o selo externo final da entrega.

## Próxima prioridade

1. Fechar lifecycle genérico `CreateEffect` usando source PC real, começando CharacterSet/CreateSkill.
2. Fechar CustomCape CreateEffect/CreateJoint/Shadow.
3. Fechar CharacterHelper dynamic/action/Black/foot/shadow.
4. Portar Evil-Spirit joint custom light no owner BITMAP_JOINT_SPIRIT, sem reaproveitar o emitter genérico.
5. Continuar Lorencia/Icarus material/object parity e medir p95/p99 em runtime físico.

Não declarar 100% até esses owners e os testes físicos estarem fechados.
