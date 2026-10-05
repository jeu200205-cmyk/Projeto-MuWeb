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
| `def.h` | 11 | source owner referenced by code/comments |
| `ZzzEffect.cpp` | 10 | effects |
| `UIMng.cpp` | 10 | legacy UI |
| `MapManager.cpp` | 9 | map routing/load |
| `GlobalBitmap.cpp` | 8 | bitmap IDs/owners |
| `ZzzScene.cpp` | 8 | scene/world |
| `SkillManager.h` | 8 | source owner referenced by code/comments |
| `CharacterManager.cpp` | 8 | source owner referenced by code/comments |
| `ZzzAI.cpp` | 8 | target/path/skill semantics |
| `LoginWin.cpp` | 8 | source owner referenced by code/comments |
| `ServerSelWin.cpp` | 8 | source owner referenced by code/comments |
| `ZzzInterface.cpp` | 7 | source owner referenced by code/comments |
| `ZzzInventory.cpp` | 7 | item render/info |
| `ZzzEffectJoint.cpp` | 7 | source owner referenced by code/comments |
| `ZzzEffectParticle.cpp` | 7 | source owner referenced by code/comments |
| `Protocol.cpp` | 7 | source owner referenced by code/comments |
| `rect.h` | 7 | source owner referenced by code/comments |
| `Widescreen.cpp` | 6 | source owner referenced by code/comments |
| `NewUIMainFrameWindow.cpp` | 6 | source owner referenced by code/comments |
| `LoadData.cpp` | 6 | source owner referenced by code/comments |
| `ProtocolSend.h` | 6 | source owner referenced by code/comments |
| `d.h` | 6 | source owner referenced by code/comments |
| `ZzzLodTerrain.h` | 5 | source owner referenced by code/comments |
| `AndroidLayer.cpp` | 5 | source owner referenced by code/comments |
| `ConnectServerProtocol.cpp` | 5 | source owner referenced by code/comments |
| `ZzzInfomation.cpp` | 5 | source owner referenced by code/comments |
| `g.h` | 5 | source owner referenced by code/comments |
| `ZzzOpenglUtil.cpp` | 4 | source owner referenced by code/comments |
| `node.h` | 4 | source owner referenced by code/comments |
| `_struct.h` | 4 | source owner referenced by code/comments |
| `ServerListManager.cpp` | 4 | source owner referenced by code/comments |
| `ZzzEffectBlurSpark.cpp` | 4 | source owner referenced by code/comments |
| `Packets.h` | 4 | source owner referenced by code/comments |
| `ProtocolSend.cpp` | 4 | source owner referenced by code/comments |
| `CharSelMainWin.cpp` | 4 | source owner referenced by code/comments |
| `decoded.h` | 4 | source owner referenced by code/comments |
| `ObjectManager.cpp` | 3 | source owner referenced by code/comments |
| `EffectManager.cpp` | 3 | source owner referenced by code/comments |
| `ElementSlots.cpp` | 3 | source owner referenced by code/comments |
| `ZzzEffectPointer.cpp` | 3 | source owner referenced by code/comments |
| `ZzzMathLib.cpp` | 3 | source owner referenced by code/comments |
| `UIBaseDef.h` | 3 | source owner referenced by code/comments |
| `NewUIMyInventory.cpp` | 3 | inventory UI/equipment |
| `r.h` | 3 | source owner referenced by code/comments |
| `NewUIBuffWindow.cpp` | 3 | source owner referenced by code/comments |
| `frame.h` | 3 | source owner referenced by code/comments |
| `best.h` | 2 | source owner referenced by code/comments |

## Como usar

Ao portar um gap, encontre o owner PC, identifique chamadas auxiliares e estado global que ele depende, depois mapeie para um owner Web único. Não copiar somente o branch visual sem o lifetime/state que o controla.
