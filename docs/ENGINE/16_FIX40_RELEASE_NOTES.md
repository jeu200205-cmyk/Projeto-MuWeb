# 16 — Notas da publicação R90 FIX40 HOTFIX1

Data: **04/10/2026**.

## Autoridade

- Release pública: `MUWEB R90 FIX40 HOTFIX1`.
- Build lógico FIX40: `MUWEB_R90_FIX40_ICARUS_CLOUD_CONTROLLERS_2026-10-04_A`.
- Parent: `MUWEB_R90_FIX39_POTION17_BLEND_SCROLL_2026-10-04_FULL.zip`.
- Source semântica PC: Main 5.2 limpa.

A HOTFIX1 modifica o pacote/bootstrap, não a lógica de jogo/render da FIX40. Os launchers FIX39 herdados foram retirados para impedir que o verificador antigo rejeite corretamente arquivos já modificados pela FIX40.

## Mudança principal da FIX40 — Icarus

No PC, `WD_10HEAVEN` / `Object11` tipos 0–5 são controladores de efeito, não cenário comum. No primeiro `RenderObjectVisual`, enquanto ainda não ocultos, eles emitem `BITMAP_CLOUD` e passam a `HiddenMesh=-2`.

A Web agora:

- classifica tipos 0–5 como controladores Icarus;
- oculta o BMD bruto do cenário;
- usa `Effect/clouds.OZJ`;
- preserva o subtipo 0–5;
- preserva luz `(0.1, 0.1, 0.1)`;
- usa posição/ângulo/escala do objeto;
- cria 20 partículas nos tipos 0–2 e 10 nos tipos 3–5.

## O que permanece aberto

FIX40 **não** declara Icarus 100% concluído. Permanecem, entre outros:

- `MoveObjectOnEffect` e seus `BITMAP_CLOUD+1` / `BITMAP_JOINT_THUNDER` subtype 6;
- `MoveHeavenThunder`;
- owner `BITMAP_LIGHT` do tipo 10;
- demais owners map-specific;
- Lorencia/bridge e outros defeitos visuais ainda relatados;
- SelectChar e montarias/pets/custom items;
- inventário/equipamento/materials em casos ainda divergentes;
- famílias gerais de skills/FX e validação física completa.

## Validação registrada

- `node tools/start-r90-fix40-safe.cjs --verify-only`: **258 arquivos / PASS**;
- syntax set registrado no pacote: **307 arquivos**;
- contrato Icarus: **39 checks / PASS**;
- visual físico e latência física: **não medidos nesta entrega**.

## Bootstrap correto

Use apenas:

- `INSTALAR_DEPENDENCIAS_R90.bat`
- `LIGAR_WEB_R90_FIX40.bat`
- `DESLIGAR_WEB_R90_FIX40.bat`

O manifesto ativo é `R90_FIX40_SOURCE_HASHES.json` e o verificador ativo é `tools/start-r90-fix40-safe.cjs`.
