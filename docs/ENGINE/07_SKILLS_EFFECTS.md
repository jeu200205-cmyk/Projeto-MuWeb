# 07 — Skills e efeitos

## Arquitetura

- `skills/ServerMagicList.js` mantém a lista real do servidor.
- `skills/SkillAttributeData.js` lê atributos/Delay sem inventar floor.
- `skills/PcSkillCastRouter.js` decide a família wire e target semantics.
- `game/SkillEffects.js`, `game/PCSkillEffectsPackA.js` e módulos `game/Pc*.js` implementam efeitos/stages específicos.

## Famílias com trabalho já materializado

Há owners específicos para BK/Warrior (Twisting/Wheel, Vitality, Blow, Death Stab, Fury e stages auxiliares), Wizard (basic target skills, Fireball, Ice, Energy Ball, Flash e impactos), e Elf (support/self/direct target families e cast semantics). O projeto também retém trabalho histórico para MG/DL/Summoner e pets/helpers, mas não declara fechamento visual integral dessas famílias no Web atual.

## Timing

A linha de portabilidade preserva o contrato de simulação/FX e `SkillAttribute.Delay` em milissegundos. Efeitos específicos possuem lifetimes e stage graphs distintos; não devem ser comprimidos num efeito genérico.

## Gaps atuais

- cobertura completa de todas as classes/evoluções/master skills;
- stage graphs completos para sprite/particle/joint/effect children;
- RNG/terrain-light/water/spark stages ainda explicitamente abertos em algumas skills;
- CustomMonsterEffect e CharacterEffectItens/CharacterSetEffect child renderers;
- validação física contra PC de cores, blend, alpha, escala, bones, timing e hit/facing;
- nenhuma família deve ser declarada 100% só porque o packet de cast funciona.

## WHEEL2: pose da arma

`game/PcWheelWeaponPose.js` transpõe o deslocamento de MoveParticle e a pose temporária de RenderWheelWeapon: órbita 150 (180 para spear), avanço de -18 graus por tick de 25 Hz, altura de render +70, inclinação MU Y=90 e yaw de render +(30+2×FPS_ANIMATION_FACTOR), +32 no passo de referência. `PCSkillEffectsPackA` aplica isso ao BMD real da arma. Essa correção não fecha o scheduling dos cinco subtypes, materiais por nível, light/water/RNG nem todos children da skill; esses owners continuam pendentes.

## Atualização FIX17

WHEEL2 aplica o pipeline existente de materiais da arma com tipo/nível/opções reais antes da publicação. OBJECT::Alpha chega ao uniform opacity do MU shader e multiplica a opacidade authored do pass. Falha de textura/material impede publicar a arma incompleta e descarta o renderer preparado. Scheduling dos subtypes, luz/água/RNG e children restantes continuam parciais.


`graphics/PcItemChromeColors.js` contém as paletas item-domain de PartObjectColor/2 do PC. O pipeline stock usa esses RGBs para chrome/metal e respeita a ordem dos passes por nível; RenderModel.lua permanece com precedência.
## FIX99 — ItemEffects e limites de lifecycle

`LoadEffect` de `ItemEffects.lua` foi conectado ao owner de item no chão, não ao personagem equipado. `LoadRunneEffect` continua no `PcRuneAura`. `LoadCustomLightEffect` permanece parseado, porém o source PC o usa no `BITMAP_JOINT_SPIRIT` de Evil Spirit (subtypes 0/3); não é equivalente ao emitter genérico de skill e fica fail-closed até esse joint ser portado. CharacterSet `CreateSkill` continua com o child `CreateEffect` nativo explicitamente pendente.

