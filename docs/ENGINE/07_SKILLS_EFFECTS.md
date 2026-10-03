# 07 — Skills e efeitos

## Arquitetura

- `skills/ServerMagicList.js` mantém a lista real do servidor.
- `skills/SkillAttributeData.js` lê atributos/Delay sem inventar floor.
- `skills/PcSkillCastRouter.js` decide a família wire e target semantics.
- `game/SkillEffects.js`, `game/PCSkillEffectsPackA.js` e módulos `game/Pc*.js` implementam efeitos/stages específicos.

## Famílias com trabalho já materializado

Há owners específicos para BK/Warrior, Wizard e Elf. O projeto também retém trabalho histórico para MG/DL/Summoner e pets/helpers, mas não declara fechamento visual integral dessas famílias no Web atual.

## Timing

A linha de portabilidade preserva o contrato de simulação/FX e `SkillAttribute.Delay` em milissegundos. Efeitos específicos possuem lifetimes e stage graphs distintos; não devem ser comprimidos num efeito genérico.

## Gaps atuais

- cobertura completa de todas as classes/evoluções/master skills;
- stage graphs completos para sprite/particle/joint/effect children;
- RNG/terrain-light/water/spark stages ainda abertos em algumas skills;
- CustomMonsterEffect e CharacterEffectItens/CharacterSetEffect child renderers;
- validação física contra PC de cores, blend, alpha, escala, bones, timing e hit/facing;
- nenhuma família deve ser declarada 100% só porque o cast funciona.
