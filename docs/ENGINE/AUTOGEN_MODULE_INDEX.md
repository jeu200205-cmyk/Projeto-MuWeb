# Índice de módulos de produção desta SOURCE

| Módulo | Linhas | Imports | Exports detectados |
|---|---:|---:|---|
| `assets/MUAssetLoader.js` | 1463 | 3 | AssetType, isValidParsedTexture, stripOzJEnvelope, decodeOZTCustom, MUAssetLoader, RemoteAssets, MUAssets |
| `assets/MUModelRenderer.js` | 1788 | 2 | PC_REFERENCE_FPS, RenderFlags, SpecialTextures, pcChromeMode, pcRenderMeshPassState, MUAnimationClip, MUAnimationMixer, MUAnimationAction, MUModelRenderer, createCharacterModel, createMonsterModel, createEquipmentModel |
| `assets/MUSoundManager.js` | 1012 | 0 | SoundCategory, MU_SOUNDS, SoundInstance, BGMController, ReverbEffect, MUSoundManager, MUSounds |
| `assets/MUTextureManager.js` | 1094 | 2 | MUTextureIndex, MUTexture, TextureAtlas, MUTextureManager, MUTextures |
| `audio/SoundBoard.js` | 39 | 1 | playHpLow, startHpLowLoop, stopHpLowLoop, playLevelUp, playQuestComplete, playDead, playPetAttack |
| `audio/SoundManager.js` | 183 | 0 | SoundManager, Sound |
| `core/ChatSystem.js` | 213 | 2 | ChatSystem |
| `core/Config.js` | 56 | 0 | Config, saveConfig, resetConfig |
| `core/Game.js` | 150 | 8 | Game |
| `core/GameApp.js` | 4890 | 78 | MUWEB_ANCESTOR_REVISION, MUWEB_GRANDPARENT_REVISION, MUWEB_R20_REVISION, MUWEB_R21_REVISION, MUWEB_R22_REVISION, MUWEB_R23_REVISION, MUWEB_R24_REVISION, MUWEB_R25_REVISION, MUWEB_R26_REVISION, MUWEB_PARENT_REVISION, MUWEB_SOURCE_PARENT_REVISION, MUWEB_SOURCE_REVISION, MUWEB_PREVIOUS_SOURCE_REVISION, MUWEB_R77_BASE_REVISION, GameApp |
| `core/Input.js` | 153 | 0 | Input |
| `core/Timer.js` | 91 | 0 | Timer, TimCheck, GameTimer |
| `data/CharacterClassMap.js` | 131 | 0 | CLASS, serverEncodeCharSet0, serverClassToClientClass, getCharacterClass, characterClassName, clientClassToLocalBase, serverClassToName |
| `data/CharacterEquipmentCodec.js` | 130 | 0 | NO_EQUIPMENT_12BIT, NO_BODY_ITEM_9BIT, levelConvert, decodeCharacterEquipment |
| `data/CurrentClientItemOwners.js` | 217 | 2 | ITEM_MODEL_BASE, LOAD_ITENS_PATHS, CUSTOM_WINGS_PATHS, CUSTOM_CAPE_PATHS, parseLoadItensLua, parseCustomWingsLua, parseCharacterCreateCapeLua, currentClientItemModelForType, currentClientItemOwnerSnapshot, currentClientItemOwnerMeta, loadCurrentClientItemOwners, resetCurrentClientItemOwnersForTests |
| `data/CurrentClientMonsterOwners.js` | 40 | 2 | parseCustomMonsterLua, parseCustomMonsterGlowLua, parseCustomMonsterEffectLua, customMonsterRule, customMonsterGlow, customMonsterEffects, customMonsterType, customMonsterStatus, loadCurrentClientMonsterOwners, resetCurrentClientMonsterOwnersForTests |
| `data/CustomItemFloorLua.js` | 85 | 2 | CUSTOM_ITEM_FLOOR_PATHS, parseCustomItemFloorLua, loadCustomItemFloorLua, resetCustomItemFloorLuaForTests |
| `data/CustomItemForceLua.js` | 94 | 3 | CUSTOM_ITEM_FORCE_PATHS, parseCustomItemForceLua, customItemForceRule, customItemForceStatus, customItemForceSnapshot, loadCustomItemForceLua, resetCustomItemForceLuaForTests, pcApplyCustomItemForce |
| `data/CustomItemModelMap.js` | 21 | 1 | customItemModelForType, getCustomItemModelCount, getCustomItemModelSnapshot |
| `data/CustomItemPresentation.js` | 210 | 1 | parseCustomItemPositionLua, parseCustomItemSizeLua, loadCustomItemPresentation, customItemPosition, customItemSize, customItemPresentationStatus, CUSTOM_ITEM_PRESENTATION_MAX_ITEM |
| `data/DisableExcellentLua.js` | 58 | 2 | DISABLE_EXCELLENT_PATHS, parseDisableExcellentLua, isExcellentDisabledForItemType, disableExcellentSnapshot, disableExcellentStatus, loadDisableExcellentLua, resetDisableExcellentLuaForTests |
| `data/Inventory.js` | 240 | 2 | GRID_WIDTH, GRID_HEIGHT, GRID_SIZE, Inventory |
| `data/Item.js` | 139 | 1 | EXCELLENT_OPTIONS, Item |
| `data/ItemAttributeData.js` | 118 | 0 | generateCheckSum2, parseItemAttributeBmd, loadItemAttributes, itemAttributeFor, ITEM_ATTRIBUTE_MAX_ITEM |
| `data/ItemEffectsLuaConfig.js` | 195 | 1 | ITEM_MODEL_BASE, ITEM_EFFECTS_PATHS, parseItemEffectsLua, loadItemEffectsLuaConfig, resetItemEffectsLuaConfigCacheForTests, itemTypeToModelType, groundItemEffectRuntimeContract, resolveRuneAuraForEquipment |
| `data/ItemModelMap.js` | 540 | 0 | ITEM_MODEL_MAP |
| `data/ItemModelResolver.js` | 176 | 5 | resolveWeaponModel, FENRIR_MODEL_BY_OPTION, FENRIR_KIND_BY_OPTION, resolveAccessoryModel, resolveCharacterModels |
| `data/ItemTransparencyLua.js` | 54 | 2 | ITEM_TRANSPARENCY_PATHS, parseItemTransparencyLua, itemTransparencyForType, itemTransparencyStatus, itemTransparencySnapshot, loadItemTransparencyLua, resetItemTransparencyLuaForTests |
| `data/ItemTypes.js` | 110 | 1 | ITEM_TYPES, ITEM_DB, ITEM_BY_ID, ITEM_BY_NAME, getItemDef, getItemDefByName, EQUIP_SLOTS |
| `data/ItemUiLuaConfig.js` | 41 | 1 | parseItemBordersLua, parseJewelStackLua, loadItemUiLuaConfig, itemBorderFor, isJewelStackType, itemUiLuaStatus |
| `data/LoadData.js` | 197 | 0 | AssetLoader, SaveSystem, Assets, Saves |
| `data/MagicFinishBuffMap.js` | 84 | 0 | PC_BUFF_STATE, magicFinishBuffState |
| `data/MixSystem.js` | 221 | 2 | MIX_RECIPES, MixSystem, mixSystem |
| `data/MoveCustomLua.js` | 56 | 2 | parseMoveCustomConfigLua, parseMoveCustomInterfaceContract, loadMoveCustomLua, clearMoveCustomLuaCache |
| `data/PacketItemCodec.js` | 23 | 0 | PACKET_ITEM_LENGTH, copyPacketItem, decodePacketItemType, packetItemLevelByte |
| `data/PcAdvancedItemOwners.js` | 149 | 0 | parsePcItemAddOption, parsePcHarmonyOptions, parsePcSocketOptions, loadPcAdvancedItemOwners, pcHarmonyItemType, pcIsSocketItemType, pcDecodeSocketFields, PC_ADVANCED_ITEM_CONSTANTS |
| `data/PcBitmapLuaOwners.js` | 156 | 5 | PC_BITMAP_LUA_SOURCES, pcBitmapPhysicalPath, parsePcBitmapLuaOwners, resetPcBitmapLuaOwners, pcBitmapOwner, loadPcBitmapLuaOwners, pcBitmapTexture |
| `data/PcBitmapLuaVM.js` | 100 | 2 | executePcBitmapLua |
| `data/PcElementSlotsLua.js` | 97 | 0 | parsePcElementSlotsLua |
| `data/PcGlobalText.js` | 77 | 0 | parsePcGlobalText, loadPcGlobalText, pcGlobalTextGet, pcSprintf |
| `data/PcItemAttributes.js` | 82 | 0 | ITEM_ATTRIBUTE_LAYOUTS, pcItemChecksum, parsePcItemAttributes, pcMaxDurability |
| `data/PcItemInfo.js` | 816 | 6 | PC_TEXT_COLOR, decodePcPacketItemFlags, isPcTooltipCommonStockItem, decodePcCommonSpecials, pcConvertCommonItem, pcCommonItemTooltip, pcItemTooltip, PC_TOOLTIP_CSS_COLOR, PC_TOOLTIP_CSS_BG |
| `data/PcItemSetOwners.js` | 89 | 1 | PC_SET_MAX_ITEM, PC_SET_MAX_OPTION, PC_SET_TYPE_RECORD, parsePcItemSetType, parsePcItemSetOption, loadPcItemSetOwners, pcResolveSetItem, PC_SET_CONSTANTS |
| `data/PcLuaCrypt.js` | 90 | 0 | PC_LUA_CRYPT_HEADER, PC_LUA_XOR_TABLE, PC_LUA_PRIVATE_CODE_MOD16, isPcEncryptedLua, decodePcLuaBytes, decodePcLuaText |
| `data/PcPlayerBodyModelMap.js` | 110 | 0 | pcPlayerBodyModelPath, resolvePcPlayerBodyModel |
| `data/RealData.js` | 103 | 6 | preloadRealData, getRealItemList, getRealMonsterList, getRealMapList |
| `data/RemoteAssets.js` | 550 | 0 | RemoteAssetSystem, decodeOZT, decodeTGA, RemoteAssets |
| `data/RenderModelNativeOracle.js` | 1805 | 0 | RENDER_MODEL_ORACLE_COUNTS, R50_RENDER_MODEL_STATIC_COVERAGE, R51_RENDER_MODEL_STATIC_COVERAGE, nativeRenderModelRange, nativeRenderModelPass, nativeRenderTextureOverride |
| `data/ServerListData.js` | 228 | 1 | decodeServerListScript, SBP, parseServerListPacket, parseServerAddressPacket, groupIndexOf, ServerListData |
| `data/SkillNames.js` | 266 | 0 | AT_SKILL, AT_SKILL_NAMES, skillTypeName |
| `data/generated/MonsterModelMap.js` | 339 | 0 | CLASS_TO_MODEL, CLASS_SCALE, RAND2_CLASSES, monsterBmdPath |
| `data/generated/RealItems.js` | 21371 | 0 | REAL_ITEMS |
| `data/generated/RealMaps.js` | 266 | 0 | REAL_MAPS |
| `data/generated/RealMonsterStats.js` | 15258 | 0 | REAL_MONSTER_STATS, STATS_BY_CLASS |
| `data/generated/RealMonsters.js` | 2075 | 0 | REAL_MONSTERS |
| `data/generated/RealSkills.js` | 2354 | 0 | REAL_SKILLS |
| `database/AccountSystem.js` | 809 | 0 |  |
| `database/CharacterDB.js` | 1506 | 0 |  |
| `database/EventLogDB.js` | 827 | 0 |  |
| `database/GuildDB.js` | 1172 | 0 |  |
| `database/MUDatabase.js` | 572 | 0 |  |
| `database/RankingSystem.js` | 622 | 0 |  |
| `database/WarehouseSystem.js` | 849 | 0 |  |
| `database/config/database.js` | 77 | 0 |  |
| `database/index.js` | 246 | 0 |  |
| `effects2/CritFX.js` | 44 | 0 | playCrit |
| `effects2/DeathFX.js` | 222 | 2 | onRespawn, PLAYER_DIE1_ACTION, PLAYER_HEAD_BONE, createBlood, onPlayerDeath |
| `effects2/LevelUpFX.js` | 470 | 2 | preloadLevelUpTextures, playLevelUp |
| `game/BuffSystem.js` | 263 | 0 | BuffDatabase, ActiveBuff, BuffContainer |
| `game/Character.js` | 169 | 2 | Classes, Character |
| `game/ClickToMove.js` | 141 | 1 | ClickToMove |
| `game/CollisionWithWorld.js` | 141 | 2 | CollisionWorld |
| `game/DropSystem.js` | 317 | 3 | DROP_LIFETIME, BLINK_TIME, PICKUP_RADIUS, DropManager |
| `game/FloatingText.js` | 137 | 1 | TEXT_STYLES, FloatingText |
| `game/GameOptions.js` | 336 | 3 | GameOptions |
| `game/InventoryGrid.js` | 27 | 0 | projectInventoryGrid, canPlaceInventoryItem |
| `game/MUDirection.js` | 37 | 0 | muDirectionToPcDegrees, pcDegreesToThreeYaw, muDirectionToThreeYaw, worldVectorToThreeYaw |
| `game/Monster.js` | 330 | 7 | resolveMonsterType, Monster |
| `game/MonsterManager.js` | 283 | 6 | MonsterManager |
| `game/MonsterModel.js` | 109 | 5 | MONSTER_ACTIONS, MONSTER_PLAY_SPEED, classToModel, classScale, createMonsterVisual |
| `game/Movement.js` | 275 | 3 | PC_REFERENCE_FPS, Movement |
| `game/MuHelper.js` | 271 | 1 | MuHelperSystem, MuHelper, MuHelperWindow |
| `game/NpcModel.js` | 103 | 6 | createNpcVisual |
| `game/PCSkillEffectsPackA.js` | 718 | 16 | PCSkillEffectsPackA |
| `game/PcBlowDestruction232.js` | 107 | 0 | BLOW_ROOT_LIFE_TICKS, BLOW_IMPACT_TICK, BLOW_IMPACT_SECONDS, BLOW_PC_HZ, BLOW_BLUE_LIGHT, BLOW_ROOT_LOCAL, BLOW_SUBTYPE1_MU_Z, blowHash32, blowRootWeb, blowSubtype1Web, blowCrackCount, blowCrackDistance, blowCrackYawDeltaDeg, blowPlanCrackAScale, blowStoneCount, blowImpactOwnersWeb |
| `game/PcBlowSecondary.js` | 45 | 0 | BLOW_SECONDARY_PC_HZ, BLOW_TERRAIN_FIRST_TICK, BLOW_TERRAIN_LIFE_TICKS, BLOW_TERRAIN_INITIAL_LIGHT, BLOW_TERRAIN_DECAY, BLOW_SWORD_Z, BLOW_SWORD_LIGHT, BLOW_SUB1_LIGHT_Z, BLOW_SUB1_LIGHT_SCALE, BLOW_SUB1_PARTICLE_COUNT, BLOW_IMPACT_AUTHORED_TICK, blowSecondaryImpactAuthor, blowTerrainLightForRenderedTick, blowTerrainAuraAuthor |
| `game/PcDeathCannonForce4.js` | 66 | 0 | DEATH_CANNON_LIFE_TICKS, DEATH_CANNON_MAX_TAILS, DEATH_CANNON_SCALE, DEATH_CANNON_HALF_WIDTH, DEATH_CANNON_MULTI_USE, DEATH_CANNON_LIGHT, DEATH_CANNON_DISTANCES, deathCannonDistance, deathCannonPointWeb, deathCannonFadeForTick, deathCannonTrailWeb |
| `game/PcEnergyBallImpact.js` | 18 | 0 | energyBallImpactAuthor |
| `game/PcFireballImpact.js` | 24 | 0 | FIREBALL_STONE_COUNT, FIREBALL_STONE_MODELS, FIREBALL_EXPLOSION_BITMAP, fireballImpactAuthor |
| `game/PcFlashImpact.js` | 13 | 0 | flashImpactAuthor |
| `game/PcFurySpark0.js` | 31 | 0 | FURY_SPARK_COUNT, FURY_SPARK_SUBTYPE, FURY_SPARK_SCALE, FURY_SPARK_LIGHT, FURY_SPARK_VELOCITY_MIN, FURY_SPARK_VELOCITY_SPAN, FURY_SPARK_LIFE_MIN, FURY_SPARK_LIFE_SPAN, FURY_SPARK_MAX_TAIL_SPAN, furySparkImpactAuthor |
| `game/PcFuryStrikeCore.js` | 186 | 0 | FURY_PC_HZ, FURY_TICK, FURY_TAIL_SECONDS, FURY_IMPACT_SECONDS, FURY_TRAVEL_SECONDS, FURY_ROOT_LIFE_TICKS, FURY_TAIL_BMD_LIFE_TICKS, FURY_FLASHING_LIFE_TICKS, furyHash, pcAngleMatrix, pcVectorRotate, webToPc, pcToWeb, webYawToPcDeg, pcYawDegToWeb, furyRootAfterLifeWeb, furyImpactWeb, furyTailOwnersWeb, furyImpactCoreOwnersWeb, furyWallAllows, furyTerrainWallOwnersWeb, furyOwnerState |
| `game/PcIceImpact.js` | 32 | 0 | ICE_MODEL_PATH, ICE_SMOKE_TEXTURE, ICE_LIFETIME_TICKS, ICE_SCALE, ICE_PITCH_DEG, ICE_GRAVITY, ICE_BLEND_MESH_LIGHT, ICE_SMOKE_COUNT, iceImpactAuthor |
| `game/PcInventoryMoveRules.js` | 42 | 1 | PC_MAX_ITEM_INDEX, PC_ITEM_BOW, PC_ITEM_HELPER, PC_ITEM_POTION, pcInventoryOverlayMoveAllowed |
| `game/PcMapContext.js` | 41 | 0 | PC_WORLD, pcWorldActiveFromAssetWorld, pcInBloodCastle, pcInChaosCastle, pcInHellas, pcInSwimLocomotionWorld |
| `game/PcVitalitySecondary.js` | 53 | 0 | VITALITY_MAGIC_PULSE_INDICES, VITALITY_MAGIC_SUBTYPE, VITALITY_MAGIC_LIFE_TICKS, VITALITY_MAGIC_LIGHT, VITALITY_FLARE_SUBTYPE, VITALITY_FLARE_LIFE_TICKS, VITALITY_FLARE_STATIONARY_TICKS, VITALITY_FLARE_MOVE_TICKS, VITALITY_FLARE_MAX_TAILS, VITALITY_FLARE_SCALE, vitalityMagicScaleFromRand50, vitalityMagicPulseDescriptor, vitalityFlareDescriptor, vitalityFlareVerticalDistance |
| `game/PcVitalitySpirit2.js` | 68 | 0 | VITALITY_SPIRIT_COUNT, VITALITY_LIFE_TICKS, VITALITY_SCALE, VITALITY_HALF_WIDTH, VITALITY_MAX_TAILS, VITALITY_PITCH_DEG, VITALITY_LIGHT, vitalitySpiritDistance, vitalitySpiritPointWeb, vitalitySpiritTrailWeb, vitalitySpiritFadeForRemainingTicks, vitalitySpiritSideWeb |
| `game/PcWheelWeaponPose.js` | 30 | 0 | pcWheelWeaponPose, applyPcWheelWeaponAlpha |
| `game/PcWizardBasicImpact.js` | 31 | 0 | poisonImpactAuthor, meteorImpactAuthor, powerWaveTravelAuthor |
| `game/PetSystem.js` | 969 | 6 | PET_ACTIONS, FENRIR_ACTIONS, RIDER_ACTIONS, DARKHORSE_ACTIONS, RIDER_MODEL, Pet, MountCompanion, HelperCompanion, PetSystem |
| `game/PlayerViewportManager.js` | 658 | 11 | decodeChangeCharacterItemType, applyChangeCharacterToEquipment, PlayerViewportManager |
| `game/QuestSystem.js` | 285 | 2 | QUEST_DB, QuestManager, QuestWindow |
| `game/ServerCustomPreviewMirror.js` | 68 | 0 | ServerCustomPreviewMirror |
| `game/ServerGroundItems.js` | 121 | 1 | WORLD_ITEM_CAPACITY, PICKUP_PENDING_TIMEOUT_MS, ServerGroundItems |
| `game/ServerInventoryMirror.js` | 340 | 3 | EQUIPMENT_SLOT_COUNT, INVENTORY_GRID_WIDTH, INVENTORY_GRID_HEIGHT, INVENTORY_GRID_COUNT, MY_INVENTORY_SLOT_COUNT, SERVER_INVENTORY_CAPACITY, EQUIPMENT_SLOT_NAMES, decodeServerItemInfo, serverItemView, ServerInventoryMirror |
| `game/ServerStorageMirror.js` | 201 | 1 | STORAGE_WIDTH, STORAGE_HEIGHT, STORAGE_CAPACITY, ServerStorageMirror |
| `game/SkillEffects.js` | 535 | 5 | SkillEffects |
| `game/ViewportActorSemantics.js` | 65 | 0 | VIEWPORT_KIND, classifyViewportActor, isCombatViewportKind, getPcNpcVisualRule |
| `graphics/BmdAdapter.js` | 369 | 1 | applyMuUpAxis, buildBindWorldTransforms, extractPartMeshes, extractRigidAttachment, bmdToRenderData, resolveTexturePath |
| `graphics/BmdParser.js` | 206 | 0 | mapFileDecrypt, parseBMD, angleQuaternion |
| `graphics/Camera3D.js` | 217 | 2 | Camera3D |
| `graphics/CharacterPreview.js` | 508 | 7 | PC_CHARACTER_SCENE_RENDER_Z, PC_CHARACTER_SCENE_PEGASUS_RENDER_Z, PC_CHARACTER_SCENE_PREVIEW_SLOTS, CharacterPreview |
| `graphics/CwsParser.js` | 54 | 0 | parseCWS |
| `graphics/Effects.js` | 433 | 1 | ParticleEmitter, EffectManager, SKILL_TEXTURE_MAP, skillTextureCache, loadSkillTexture, getSkillTexture, getSkillTextureByName, preloadSkillTextures |
| `graphics/GroundItemLayer.js` | 604 | 8 | groundItemWorldPosition, groundItemCreateRise, groundItemModelPath, pcGroundItemTransform, pcGroundMaterialPolicy, GroundItemLayer |
| `graphics/ItemMaterialPresentation.js` | 667 | 8 | applyPcNativeRenderModelPresentation, pcIsStandardEquipment, pcRenderPartObjectLevel, pcRenderedItemLevel, pcEquipmentBaseTint, pcExcellentTint, pcIsSetExtOption, pcSetTint, pcImplicitMaterialTextureKind, pcMaterialTexture, pcStockMaterialPassPlan, applyPcRenderPartObjectSolidPresentation, applyPcStockItemPresentation |
| `graphics/MuTerrain.js` | 1110 | 1 | TILE_SLOTS_LOGIN, TILE_SLOTS_NORMAL, tileFileCandidates, pcTerrainGrassEnabled, terrainGrassFileCandidates, pcTerrainGrassWind, createTerrainGrassQuarterOffsets, pcTerrainGrassQuad, parseTerrainMap, parseTerrainHeights, heightAt, buildPrimaryTerrainLight, samplePrimaryTerrainLight, addPrimaryTerrainLight, collectTerrainTileSlots, createMuTerrainMesh, buildMuTerrain |
| `graphics/PcRuneAura.js` | 195 | 3 | PC_GM_AURORA_PATH, planTerrainAlphaBitmap, PcTerrainAlphaPass, PcRuneAura, resetPcRuneAuraTextureForTests |
| `graphics/PcGroundItemEffects.js` | 159 | 4 | PC_GROUND_ITEM_EFFECT_BITMAPS, pcGroundItemEffectRuntimeContract, createPcGroundItemEffectOwner |
| `graphics/PlayerComposer.js` | 1048 | 8 | PLAYER_WEAPON_LINK_BONE, accessoryAttachRule, MAX_CLASS, CLASS, pcCharacterScale, PLAYER_ACTIONS, getSkinModelIndex, getPcTextureSkinIndex, partFileName, idleActionFor, isFemaleClass, buildEquipmentAttach, mergeEquipmentBodyRenderData, playerVisualLoadIssues, unresolvedClassParts, applyBodyEquipmentPresentation, buildLinkedWeaponRenderer, weaponBackTransformFor, setLinkedWeaponSafeZonePresentation, buildAccessoryRenderer, clearComposedCharacterCache, composeCharacter, playerActionPlaySpeed, worldActionFor, buildAnimationControl |
| `graphics/Scene.js` | 1590 | 12 | GameScene |
| `graphics/TitleBackground.js` | 104 | 1 | TITLE_LAYOUT, ASSET_MU_LOGO, ASSET_WEBZEN_LOGO, mountTitleBackground |
| `math.js` | 198 | 0 | VectorCompare, QuaternionCompare, VectorSubtract, VectorAdd, VectorScale, DotProduct, VectorFill, VectorLength, VectorNormalize, CrossProduct, LInterpolationF, RAD_TO_ANGLE, ANGLE_TO_RAD, SETLIMITS, QuaternionCopy, VectorCopy, VectorMA |
| `net/WSClient.js` | 146 | 0 | WSClient, Net |
| `network/MUConfig.js` | 415 | 0 |  |
| `network/MUGateway.js` | 1035 | 0 |  |
| `network/MUServerManager.js` | 454 | 0 |  |
| `network/ServerLauncher.js` | 363 | 0 |  |
| `network/index.js` | 300 | 0 |  |
| `network/utils/logger.js` | 132 | 0 |  |
| `progression/Awakening.js` | 118 | 0 | AWAKEN_MIN_LEVEL, AWAKEN_STAT_BONUS, AWAKEN_BASE_CHANCE, AWAKEN_GLOW, awakenChance, awaken, applyAwaken, cleanse, AwakeningSystem |
| `progression/Mastery.js` | 185 | 0 | LEVEL_CAP, REBORN_LEVEL_REQ, MASTERY_TREE, MasterySystem, RESETA_COMMAND, ResetaCommand, REBORN_EFFECT |
| `progression/Priority.js` | 157 | 0 | BOSS_AURA, WORLD_RANKS, worldRankOf, PriorityMonster, PriorityBoard, MOST_WANTED_CSS |
| `protocol/Crypto.js` | 68 | 0 | DEFAULT_XOR_KEY, xorCrypt, crc32, selfTest |
| `protocol/MUCrypto.js` | 463 | 0 | CRC32, XOR_FILTER, SAVE_LOAD_XOR, BitPacking, createENCDECData, BlockCipher, xorData, buxConvert, HEADER_TYPE, parseHeader, createHeader, createSimpleHeader |
| `protocol/MUOpCodes.js` | 766 | 0 | MAIN_OPCODE, F1_SUBCODE, LOGIN_RESULT, F3_SUBCODE, F4_SUBCODE, F6_SUBCODE, F7_SUBCODE, F8_SUBCODE, F9_SUBCODE, FA_SUBCODE, FB_SUBCODE, SHOP_SUBCODE, DUEL_SUBCODE, EB_SUBCODE, EF_SUBCODE, BC_SUBCODE, MOVE_MAP_SUBCODE, SEND_OPCODE, HEADER_TYPE, DIR_TABLE, ACTION_CODE, ITEM_TYPE, CHAR_CLASS, getSubcodeName, getOpcodeName |
| `protocol/MUPacketManager.js` | 538 | 1 | MUPacketManager |
| `protocol/MUPacketRouter.js` | 1435 | 2 | routeMUPacket, isLoginSuccess |
| `protocol/MUProtocol.js` | 1283 | 3 | PSBMSG_HEAD, PBMSG_HEAD, NEW_PSWMSG_HEAD, PMSG_ANTI_CLIENT_KEY_SEND, PMSG_CONNECT_ACCOUNT_SEND, PMSG_SIMPLE_RESULT_RECV, PMSG_CHARACTER_LIST_RECV, createCharacterListRequest, createCharacterCreateRequest, createCharacterDeleteRequest, createCharacterSelectRequest, createPositionPacket, createMovePacket, encodeMovePath, createAttackPacket, createMagicPacket, createCancelMagicPacket, createMagicAttackPacket, createMagicContinuePacket, createTeleportPacket, createChatPacket, createWhisperPacket, createGetItemPacket, createDropItemPacket, createEquipmentItemPacket, createUseItemPacket, createAddPointPacket, createTradeRequestPacket, createTradeAnswerPacket, createTradeGoldPacket, createTradeResultPacket, createTradeXResultPacket, createTradeExitPacket, createPartyRequestPacket, createPartyAnswerPacket, createPartyListPacket, createPartyLeavePacket, createGuildRequestPacket, createGuildAnswerPacket, createGuildCreatePacket, createGuildListPacket, createVaultCostPacket, createStorageGoldPacket, createStorageExitPacket, createStoragePasswordPacket, createQuestHistoryPacket, createQuestStatePacket, createQuestSelectionPacket, createQuestCompletePacket, createTalkPacket, createBuyPacket, createSellPacket, createRepairPacket, createServerListRequestPacket, createServerAddressRequestPacket, createPingPacket, createCheckPacket, createEventChipPacket, createMutoNumberPacket, createGensJoiningPacket, createGensSecessionPacket, createDuelRequestPacket, PacketParser, PROTOCOL_CONSTANTS |
| `protocol/NetClient.js` | 175 | 3 | GameNetClient, GameNet |
| `protocol/PacketBuilder.js` | 83 | 0 | buildChat, buildLogin, buildMove, buildAttack, buildCharSelect, buildAddStats, buildWarp, buildPing |
| `protocol/PacketTypes.js` | 64 | 0 | PacketTypes, CHAT, CHAR_LIST, CHAR_SELECT, MOVE, ATTACK, SKILL, USE_ITEM, DROP_ITEM, TALK_NPC, BUY_ITEM, SELL_ITEM, ADD_STATS, WARP, TRADE_REQ, PARTY_REQ, LOGIN_REQ, LOGIN_RES, ENTER_WORLD, ENTITY_SPAWN, ENTITY_DESPAWN, ENTITY_MOVE, HP_UPDATE, PING, PONG, PacketNames |
| `protocol/RealMUProtocol.js` | 1206 | 3 |  |
| `protocol/index.js` | 277 | 4 | VERSION, PROTOCOL_VERSION, PROTOCOL_DATE, defaultPacketManager, createLoginSequence, MUProtocolStream |
| `protocol/test-protocol.js` | 854 | 1 |  |
| `runtime-config.js` | 6 | 0 |  |
| `scenes/CharCreateScene.js` | 213 | 2 | CLASSES |
| `scenes/CharSelectScene.js` | 518 | 3 |  |
| `scenes/LoadingScene.js` | 150 | 1 | MUPROMAX_LOADING_ASSETS |
| `scenes/LoginScene.js` | 437 | 2 |  |
| `scenes/SceneManager.js` | 161 | 0 |  |
| `scenes/ServerSelectScene.js` | 493 | 4 | computeServerSelectColumns |
| `scenes/WorldScene.js` | 20 | 0 |  |
| `skills/PcSkillCastRouter.js` | 430 | 1 | webPointToPcTile, pcCreateAngleDegrees, pcAngleByte256, pcAngleByte255, pcRearAngleByte255, pcFacingDirection8, pcGetDestValue, pcCalcTargetPos, buildPcSkillCastRequest, isPcWarriorApproachSkill, isPcWizardApproachSkill, isPcElfApproachSkill, pcSkillApproachPolicy, hasPcSkillCastOwner, pcSkillCastFamily |
| `skills/ServerMagicList.js` | 130 | 1 | MAX_SKILLS, SKILL_ATTRIBUTE, resolveSkillByType, applyMagicList, barOrderFromState |
| `skills/SkillAttributeData.js` | 5051 | 0 | SKILL_ATTRIBUTE_STRIDE, SKILL_ATTRIBUTE_COUNT, decodeSkillAttributeRecord, decodeSkillAttributeScript, SKILL_ATTRIBUTE_TABLE, loadSkillAttributes |
| `skills/SkillData.js` | 114 | 0 | SKILLS, SKILL_BY_ID, getSkillsForClass |
| `skills/SkillSystem.js` | 234 | 2 | SkillSystem |
| `social/Duel.js` | 163 | 0 | DUEL_STATE, DuelSystem |
| `social/Friends.js` | 224 | 3 | charExistsInSaves, FriendsList, FriendsWindow |
| `social/GuildSystem.js` | 632 | 2 | GUILD_CREATE_COST, MARK_SIZE, WAR_MIN_ALIVE, GuildRank, Guild, GuildWar, GuildMarkEditor, GuildWindow |
| `social/PK.js` | 140 | 0 | PK_LEVELS, PK_NAME_COLORS, PKSystem |
| `social/Party.js` | 164 | 1 | Party, PartyWindow |
| `social/Trade.js` | 252 | 2 | TradeWindow |
| `ui/MUSprites.js` | 230 | 1 | MUSprites |
| `ui/MUVirtualViewport.js` | 78 | 0 | MU_LOGICAL_WIDTH, MU_LOGICAL_HEIGHT, computeMuVirtualViewport, attachMuVirtualBoard |
| `ui/MUWindow.js` | 718 | 0 | zCounter, MU_COLORS, MUWindow, createMUButton, createMUInput, createMUPasswordInput, createMUSelect, createMUCheckbox, createMUSlider, createMUTab, createMUSeparator, createMUPanel |
| `ui/events.js` | 73 | 0 | EventEmitter, makeEventTarget |
| `ui.js` | 735 | 0 | CButton, CSprite, CWin, resetMouseStates |
| `ui2/BuffBar.js` | 358 | 2 | SchoolColors, getBuffSchool, getBuffSchoolColor, BuffBar, attachBuffEffects |
| `ui2/BuffIcons.js` | 95 | 0 | BUFF_CELL, buffIconRect, loadBuffIconSheets, drawBuffIcon |
| `ui2/ChaosMachineWindow.js` | 368 | 4 | findMatch, ChaosMachineWindow |
| `ui2/CharacterWindow.js` | 366 | 2 | PC_CHARACTER_WINDOW, CharacterWindow |
| `ui2/CommandWindow.js` | 168 | 1 | COMMANDS, CommandWindow |
| `ui2/InventoryWindow.js` | 1283 | 14 | PC_INVENTORY_LOGICAL, PC_INVENTORY_ASSETS, PC_INVENTORY_CUSTOM_ASSETS, PC_EQUIPMENT_SLOTS, PC_ELEMENT_EQUIPMENT_SLOTS, pcEquipmentIconRect, InventoryWindow |
| `ui2/ItemIconRenderer.js` | 1105 | 8 | PC_ITEM_VIEW_FOV, PC_ITEM_VIEW_NEAR, PC_ITEM_VIEW_FAR, PC_ITEM_VIEW_LOGICAL_WIDTH, PC_ITEM_VIEW_LOGICAL_HEIGHT, pcItemViewRect, renderItem3dUsesAlternateModel, customPositionAppliesToInventoryModel, customSizeAppliesToInventoryModel, pcItemProjectionPosition, inventoryItemPositionOffset, pcInventoryModelScale, renderItem3dOffset, inventoryItemAngles, itemModelPath, pcInventoryBodyHeight, pcInventoryHideSkinMeshIndices, pcInventoryHideSkinTextureOverride, applyInventoryBodyPose, inventoryIconLoadIssues, renderIcon3D |
| `ui2/MUWindow.js` | 306 | 1 | injectMUStyles, MUWindow |
| `ui2/Minimap.js` | 31 | 1 | Minimap |
| `ui2/MoveCustomWindow.js` | 40 | 1 | MoveCustomWindow |
| `ui2/NotificationCenter.js` | 164 | 0 | NotificationCenter |
| `ui2/NpcShop.js` | 182 | 2 | NpcShop |
| `ui2/QuickHotkeys.js` | 218 | 0 | QuickHotkeys |
| `ui2/Scoreboard.js` | 148 | 1 | Scoreboard |
| `ui2/SkillBar.js` | 113 | 2 | SkillBar |
| `ui2/SkillIcons.js` | 147 | 0 | skillIconRect, loadSkillIconSheets, drawSkillIcon |
| `ui2/StatusBars.js` | 242 | 1 | StatusBars |
| `ui2/StorageWindow.js` | 229 | 4 | PC_STORAGE_LOGICAL, StorageWindow |
| `world/AttMapLoader.js` | 382 | 2 | ATT_FLAG, parseAtt, loadAttMap, attToPathGrid, detectZones, getHeightAt, applyRealMap |
| `world/CooperativeLoadBudget.js` | 18 | 0 | createCooperativeLoadBudget |
| `world/MapData.js` | 46 | 2 | MAPS, getMapById, getMapByNumber, getMapByServerId, getMapsForLevel |
| `world/MapManager.js` | 111 | 2 | MapManager |
| `world/Pathfinding.js` | 199 | 0 | PathGrid |
| `world/PcLorenciaVisuals.js` | 251 | 3 | PC_LORENCIA_RUNTIME_VISUAL_SERIALS, PC_LORENCIA_HIDDEN_EMITTER_SERIALS, PC_LORENCIA_BITMAP_PATHS, pcLorenciaVisualContract, createPcLorenciaVisualOwner, createPcLorenciaBoneVisualOwner |
| `world/PcMapObjectVisuals.js` | 248 | 3 | pcMapBoneVisualContract, hasPcMapBoneVisual, createPcMapBoneVisualOwner, createPcMapWorldVisualOwner, pcMapRuntimePresentationContract, hasPcMapRuntimePresentation, installPcMapRuntimePresentation, pcMapHideBaseBmd, createPcMapDynamicTerrainLightOwner, PC_MAP_VISUAL_BITMAP_PATHS |
| `world/PcMapParticles.js` | 115 | 4 | pcMapParticleContract, hasPcMapParticleVisual, createPcMapParticleOwner, PC_MAP_PARTICLE_BITMAP_PATHS |
| `world/PcParticleBudget.js` | 26 | 0 | PC_MAX_PARTICLES, tryAcquirePcParticle, releasePcParticle, getPcParticleBudgetState |
| `world/PcWorld75LightTexture.js` | 26 | 2 | WORLD75_LIGHT_SPRITE_PATH, loadWorld75LightTexture |
| `world/PcWorld75Particles.js` | 373 | 3 | PC_WORLD75_BITMAP_PATHS, PC_WORLD75_PARTICLE_SERIALS, pcWorld75EmitterContract, createPcWorld75ParticleOwner |
| `world/PcWorldRegistry.js` | 82 | 0 | normalizePcServerMap, pcAssetWorldForServerMap, getPcWorldDescriptor, PC_WORLD_ROWS, CURRENT_MOVE_REQ_SERVER_MAP_BY_NAME, serverMapForMoveReqName |
| `world/Portal.js` | 156 | 2 | Portal |
| `world/TerrainObjectWorld.js` | 1730 | 12 | pcWorld75VisualSpriteSpec, parseTerrainObjects, muObjectPositionToThree, muObjectQuaternion, bakeStaticSkinnedGeometry, staticPlacementMatrix, staticMaterialKey, mergeStaticGeometries, spatialBatchKey, partitionSpatialPlacements, partitionAdaptiveSpatialPlacements, staticGeometryLayoutKey, compactStaticInstancedTransport, compactStaticInstancedFallbackMerge, prefetchWorldTerrainObjects, pcWorld75ObjectRule, applyPcWorld75ObjectMaterialPresentation, TerrainObjectLayer |
| `world/TerrainWorld.js` | 271 | 3 | TERRAIN_SIZE, TERRAIN_SCALE, CELL_COUNT, MAP_SIZE, TW, mapFileDecrypt, buxConvert, parseAtt, parseMapping, parseHeightsOld, tileFiles, prefetchWorldTerrainCore, buildWorldTerrain, applyMuCamera, LOGIN_CAMERA, CHAR_CAMERA |

## Módulo acrescentado na FIX18

`graphics/PcItemChromeColors.js`: `pcPartObjectColor`, `pcPartObjectColor2`; paleta e multiplicadores das funções homônimas do PC no domínio dos itens. Consumido por `ItemMaterialPresentation.js`.

FIX19: world/PcIndoorVisibility.js exporta pcIndoorObject, pcIndoorAlphaTarget, pcTerrainTileAt, stepPcIndoorAlpha. Graphics/MuTerrain.js acrescenta splitPcGrassGeometry.
