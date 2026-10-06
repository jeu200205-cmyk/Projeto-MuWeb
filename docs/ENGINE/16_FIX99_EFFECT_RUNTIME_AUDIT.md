# 16 — FIX99 Effect Runtime / Maps Audit

## Goal

Continue the PC→Web port after FIX98 without duplicating the already-closed raw-BMD equipment lane. This audit distinguishes **parsed**, **consumed**, **partially consumed** and **unresolved** effect owners.

## Owner matrix

| Owner | Parse/data | Runtime consumer | State |
|---|---|---|---|
| RenderModel.lua | generated native oracle | ItemMaterialPresentation | consumed structurally; physical parity still open |
| LoadItens.lua | CurrentClientItemOwners | item model resolver/loaders | consumed as model owner; no invented effect semantics |
| CharacterEffectItens.lua | PcCharacterLuaEffects | PlayerComposer body/linked/accessory paths | body/weapon/wing/helper covered |
| CharacterSetEffect.lua | PcCharacterLuaEffects | PlayerComposer boot path | sprite/particle covered; generic CreateEffect child open |
| ItemEffects LoadRunneEffect | ItemEffectsLuaConfig | Scene/PcRuneAura | active |
| ItemEffects LoadEffect | ItemEffectsLuaConfig | **PcGroundItemEffects/GroundItemLayer** | **new active FIX99** |
| ItemEffects LoadCustomLightEffect | ItemEffectsLuaConfig | native Evil-Spirit joint equivalent | parsed only; lifecycle open |
| CharacterCreateCape/CustomCape | cape parser | PcCustomCapePresentation | RenderMesh/sprite/particle partial; effect/joint/shadow open |
| CharacterHelper.lua | helper parser | PcCharacterHelperPresentation | stable rows partial; dynamic/action/black/effect/shadow/foot debt explicit |

## Ground item source contract

`LoadEffect` is not an equipped-character effect. PC source registers it in `CItemEffectManager::m_EffectInfo`, and `MoveItems` dispatches `CreateShiny` or `CreateThunderBolt` for dropped/settled items. FIX99 mirrors that location.

For Thunder, source emits 500 iterations and each iteration owns an energy + light visual. FIX99 stores the same 500+500 points in retained buffer slots to avoid 1,000 object/material allocations per burst.

## Map optimization contract

The optimization target is allocation/resource churn, not content. Therefore the following are forbidden in this lane:

- reducing source spawn gates;
- reducing logical particle count;
- shortening authored lifetime;
- swapping to a cheaper unrelated bitmap;
- disabling map effects under load;
- replacing source blend/owner with a placeholder.

Retained pools can keep dormant renderer objects/materials, but every active particle still participates in the normal active particle budget and is released from that budget when it dies.

## Explicit debt preserved

`CreateEffect-native-lifecycle-unresolved`, CustomCape CreateEffect/CreateJoint, helper shadow/foot/black/dynamic rows and Evil-Spirit custom-light joints remain explicit. Any future port must start from the exact source branch and external official Data row, not from the generic Web skill emitter.
