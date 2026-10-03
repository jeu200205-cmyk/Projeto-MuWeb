# Cross-reference — source PC → Web

A tabela abaixo lista owners PC frequentemente citados diretamente em comentários dos módulos de produção. Contagem = número aproximado de referências textuais no runtime atual; serve como mapa de navegação, não como prova de cobertura integral do arquivo PC.

| Owner PC | Referências no runtime Web | Área típica |
|---|---:|---|
| `WSclient.cpp` | 99 | receive/dispatch/protocol/state |
| `wsclientinline.h` | 88 | packet send/helpers |
| `ZzzCharacter.cpp` | 47 | character/movement/equipment/skills |
| `ZzzOpenData.cpp` | 40 | models/textures/data loading |
| `GOBoid.cpp` | 38 | map/object behavior |
| `WSclient.h` | 37 | wire structs/opcodes |
| `PacketManager.cpp` | 29 | packet transport |
| `ZzzObject.cpp` | 23 | map objects/render/effects |
| `_define.h` | 22 | source owner referenced by code/comments |
| `_enum.h` | 19 | source owner referenced by code/comments |
| `ZzzLodTerrain.cpp` | 18 | terrain/object placement |
| `CSPetSystem.cpp` | 17 | pets/helpers |
| `ZzzBMD.cpp` | 12 | BMD/material/animation |
| `ZzzEffect.cpp` | 10 | effects |
| `UIMng.cpp` | 10 | legacy UI |
| `MapManager.cpp` | 9 | map routing/load |
| `GlobalBitmap.cpp` | 8 | bitmap IDs/owners |
| `ZzzScene.cpp` | 8 | scene/world |
| `SkillManager.h` | 8 | skill ownership |
| `CharacterManager.cpp` | 8 | character ownership |
| `ZzzAI.cpp` | 8 | target/path/skill semantics |
| `LoginWin.cpp` | 8 | login UI |
| `ServerSelWin.cpp` | 8 | server selection UI |
| `ZzzInterface.cpp` | 7 | interface owners |
| `ZzzInventory.cpp` | 7 | item render/info |
| `ZzzEffectJoint.cpp` | 7 | joint effects |
| `ZzzEffectParticle.cpp` | 7 | particle effects |
| `Protocol.cpp` | 7 | protocol |
| `Widescreen.cpp` | 6 | viewport/UI scaling |
| `NewUIMainFrameWindow.cpp` | 6 | main frame |
| `LoadData.cpp` | 6 | data loading |
| `ProtocolSend.h` | 6 | send helpers |
| `ZzzLodTerrain.h` | 5 | terrain declarations |
| `ConnectServerProtocol.cpp` | 5 | connect server protocol |
| `ZzzInfomation.cpp` | 5 | item/info presentation |
| `ZzzOpenglUtil.cpp` | 4 | OpenGL utility semantics |
| `ServerListManager.cpp` | 4 | server list |
| `ZzzEffectBlurSpark.cpp` | 4 | blur/spark FX |
| `Packets.h` | 4 | packet structures |
| `ProtocolSend.cpp` | 4 | packet send |
| `CharSelMainWin.cpp` | 4 | character select |
| `ObjectManager.cpp` | 3 | object ownership |
| `EffectManager.cpp` | 3 | effect ownership |
| `ElementSlots.cpp` | 3 | element slots |
| `ZzzEffectPointer.cpp` | 3 | pointer effects |
| `ZzzMathLib.cpp` | 3 | math semantics |
| `UIBaseDef.h` | 3 | UI base definitions |
| `NewUIMyInventory.cpp` | 3 | inventory UI/equipment |
| `NewUIBuffWindow.cpp` | 3 | buff UI |

## Como usar

Ao portar um gap, encontre o owner PC, identifique chamadas auxiliares e estado global que ele depende, depois mapeie para um owner Web único. Não copiar somente o branch visual sem o lifetime/state que o controla.
