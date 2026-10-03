# 12 — Backlog do que falta portar/fechar

## P0 — problemas físicos atuais

1. **Inventário/equipado:** itens invisíveis, posição/escala errada, recorte e white/solid effects. Fechar por item/família usando `RenderObjectScreen`, HideSkin, NewUI3D camera e material owner exatos.
2. **Mapas:** geometrias voando/gigantes, objetos que deveriam ser ocultos/emissores, terrain/grass/alpha e child effects. Continuar varredura `ZzzObject.cpp` + GM*/world-specific owners.
3. **MoveCustom/world entry:** reduzir cold load e stalls sem esconder conteúdo; medir por mapa.
4. **FPS durante edição de item/map change:** localizar p95/p99 spikes, uploads/GC/rebuilds e resolver ownership duplicado.
5. **Sets/itens com cor diferente do PC:** fechar BodyLight/material/texture bitmap/alpha/chrome por pass.

## P1 — portabilidade funcional/visual incompleta

- RenderItemInfo completo;
- NewUI3DRenderMng/CreateScreenVector exato;
- Custom item SizeInventory/PosX/PosY universal;
- CharacterEffectItens/CharacterSetEffect stages completos;
- todos os NPCs MODEL_PLAYER e multipart recipes;
- remaining current-client bitmap Lua dynamic owners;
- full map/object/effect families e event maps;
- skill/VFX all classes + masters + MG/DL/Summoner;
- pets/helpers/mounts/fenrir/dark horse edge cases;
- social systems wire/UI end-to-end;
- quest/event systems e janelas faltantes;
- F3/subcode parsers conhecidos ainda pendentes;
- guild storage e fluxos especiais de item/jewel.

## P2 — fechamento de engenharia

- benchmark 80/200 actors;
- 60/90/120 frame pacing físico;
- GPU matrix Chrome/Edge e GPUs diferentes;
- reconnect/timeout/loss real;
- catálogo item × classe × mapa × local/remoto;
- screenshot/golden comparison automatizada quando houver captura PC pareada;
- reduzir histórico empacotado e mover releases antigas para artifacts/tags, preservando reprodutibilidade.

## Critério para chamar 100%

Não basta “não crashar”. É necessário: wire correto, owner PC correto, Data real, todos stages, visual/material/timing equivalentes, local/remoto, cold/steady, equip/unequip, map re-entry, e benchmark físico sem remover conteúdo.
