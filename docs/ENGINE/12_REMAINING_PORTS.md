# Atualização FIX99 — 06/10/2026

Fechado estruturalmente nesta revisão: `ItemEffects.lua::LoadEffect` agora possui consumer no owner correto de itens dropados (`MoveItems`), incluindo 24-tick CreateShiny e 6-tick CreateThunderBolt com 500 energy + 500 glow lógicos por burst. Lorencia e as famílias existentes em `PcMapParticles` passaram a reciclar sprites/materiais e arrays de hot-loop sem reduzir FX.

Continuam P0/P1 e **não podem ser chamados de completos**: generic `CreateEffect` child de CharacterSet/CreateSkill, CustomCape CreateEffect/CreateJoint/RenderShadowModel, CharacterHelper Timer/RandTime/action/Black/CreateEffect/foot/shadow, Evil-Spirit `BITMAP_JOINT_SPIRIT` custom-light, e paridade física de materiais/objetos/HiddenMesh/BlendMesh dos mapas.

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

FIX40: Icarus `Object11` tipos 0–5 deixa de desenhar BMD controlador e ganha o burst inicial `BITMAP_CLOUD` exato do PC. Isso fecha somente esse ramo de `RenderObjectVisual`; `MoveObjectOnEffect` (cloud+1 + thunder joints), `MoveHeavenThunder`, tipo 10 e demais owners/validação física de Icarus continuam abertos.

FIX36: EVENT12/EVENT13 agora possuem o `BITMAP_SPARK+1` físico (`Effect/Spark03.OZJ`) preso ao bone 0, com offsets, pulso de cor/escala, tamanho do bitmap e blend do PC. Há ownership/dispose e bloqueio do cache para textura/osso ausentes. Isso fecha o ramo estrutural, não a homologação visual no Data/hardware físico nem os demais sprites, joints e VFX.

FIX35: EVENT18 agora aplica `BlendMesh=1` pelo `m->Texture`, com blend ONE/ONE e iluminação desativada somente nos draws correspondentes. Ainda depende de validação física do BMD/Data; os sprites dos EVENT12/13 foram portados na FIX36 e os demais efeitos continuam abertos.

FIX34: EVENT13 agora conserva `StreamMesh=0`, UV-V `((int)-WorldTime % 4000) * .00025` e `LightEnable=false` somente no mesh alvo. O `BITMAP_SPARK+1` preso ao bone 0 foi portado na FIX36; não confundir o fechamento estrutural com homologação visual do EVENT13.

FIX33: EVENT6 nível 13 agora usa a substituição `RENDER_COLOR` + Chrome do PC, com teste no shader real. Scroll EVENT13, BlendMesh EVENT18 e sprites EVENT12/13 foram fechados estruturalmente nas FIX34–36; permanecem a validação física e outros sprites/joints, portanto não tratar estes ramos como fechamento global de itens/efeitos.

FIX32: a continuação stock de cores e passes dos modelos EVENT está implementada e verificada em fixtures. Os sprites EVENT12/13 foram portados na FIX36; permanecem outros sprites/joints, efeitos de skills e seus estágios, owners Lua parciais e comparação física de inventário/SelectChar/Lorencia/Icarus. Medir entrada e CustomMove com Data real em cargas frias e quentes; esta versão não demonstra redução de latência no hardware do usuário.

Não basta “não crashar”. É necessário: wire correto, owner PC correto, Data real, todos stages, visual/material/timing equivalentes, local/remoto, cold/steady, equip/unequip, map re-entry, e benchmark físico sem remover conteúdo.


## Atualização FIX10

FIX10 corrigiu causas concretas de pose/cache/recorte/retry e custo de carregamento; os itens P0 acima continuam abertos para validação universal por família e mapa. Não converter os checks de fixtures em fechamento de todos os bugs relatados.
