/**
 * GameApp.js — Orquestrador final da portabilidade
 * Encadeia: Login → ServerSelect → CharSelect/Create → Loading → World
 * e liga todos os subsistemas portados (personagem, monstros, efeitos,
 * UI avançada, rede, mundo, assets remotos).
 */
// MUWEB_R90_FIX2_VISUAL_RUNTIME_CORRECTIONS_2026-10-02
// MUWEB_R90_FIX3_NORMAL_CHROME_MATERIAL_CORRECTIONS_2026-10-02
// MUWEB_R90_FIX4_EQUIPMENT_VIEWPORT_LIFETIME_2026-10-02
// MUWEB_R90_FIX5_FIXED_FUNCTION_NATIVE_MATERIAL_2026-10-02
// MUWEB_R90_FIX6_LUA_BITMAP_OWNERS_2026-10-02
// MUWEB_R90_FIX7_DYNAMIC_LUA_BITMAPS_2026-10-02
// MUWEB_R90_FIX8_PC_INVENTORY_MOVE_MAPLOAD_2026-10-02
import * as THREE from 'three';
import { GameTimer } from './Timer.js';
import { Input } from './Input.js';
import { Sound } from '../audio/SoundManager.js';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { MUAssets } from '../assets/MUAssetLoader.js';
import { RealMUProtocol } from '../protocol/RealMUProtocol.js';
import { DIR_TABLE } from '../protocol/MUOpCodes.js';
import { muDirectionToThreeYaw, pcDegreesToThreeYaw } from '../game/MUDirection.js';

import { routeMUPacket, isLoginSuccess } from '../protocol/MUPacketRouter.js';
import { Config } from './Config.js';
import { GameScene } from '../graphics/Scene.js';
import { EffectManager } from '../graphics/Effects.js';
import SceneManager from '../scenes/SceneManager.js';
import ServerSelectScene from '../scenes/ServerSelectScene.js';
import LoginScene from '../scenes/LoginScene.js';
import CharCreateScene, { CLASSES } from '../scenes/CharCreateScene.js';
import CharSelectScene from '../scenes/CharSelectScene.js';
import LoadingScene from '../scenes/LoadingScene.js';
import WorldScene from '../scenes/WorldScene.js';
import { MapManager } from '../world/MapManager.js';
import { Character } from '../game/Character.js';
import { MonsterManager } from '../game/MonsterManager.js';
import { BuffContainer } from '../game/BuffSystem.js';
import { PetSystem } from '../game/PetSystem.js';
import { PlayerViewportManager } from '../game/PlayerViewportManager.js';
import { StatusBars, PC_MAINFRAME_FPS_RECT } from '../ui2/StatusBars.js';
import { SkillBar } from '../ui2/SkillBar.js';
import { attachMuVirtualBoard } from '../ui/MUVirtualViewport.js';
import { ChatSystem } from './ChatSystem.js';
import { InventoryWindow } from '../ui2/InventoryWindow.js';
import { CharacterWindow } from '../ui2/CharacterWindow.js';
import { BuffBar, attachBuffEffects } from '../ui2/BuffBar.js';
import { DropManager } from '../game/DropSystem.js';
import { ServerGroundItems } from '../game/ServerGroundItems.js';
import { ServerInventoryMirror } from '../game/ServerInventoryMirror.js';
import { ServerStorageMirror } from '../game/ServerStorageMirror.js';
import { ServerNpcShopMirror } from '../game/ServerNpcShopMirror.js';
import { ServerCustomPreviewMirror } from '../game/ServerCustomPreviewMirror.js';
import { GroundItemLayer } from '../graphics/GroundItemLayer.js';
import { QuestManager, QuestWindow } from '../game/QuestSystem.js';
import { FloatingText } from '../game/FloatingText.js';
import { SkillEffects } from '../game/SkillEffects.js';
import { StorageWindow } from '../ui2/StorageWindow.js';
import { NpcShop } from '../ui2/NpcShop.js';
import { CharacterPreview } from '../graphics/CharacterPreview.js';
import { serverClassToClientClass, serverClassToName, clientClassToLocalBase } from '../data/CharacterClassMap.js';
import { AT_SKILL, skillTypeName } from '../data/SkillNames.js';
import { magicFinishBuffState } from '../data/MagicFinishBuffMap.js';
import { MuHelper } from '../game/MuHelper.js';
import { GameOptions } from '../game/GameOptions.js';
import { playLevelUp, preloadLevelUpTextures } from '../effects2/LevelUpFX.js';
import { onPlayerDeath, onRespawn, createBlood } from '../effects2/DeathFX.js';
import { playCrit } from '../effects2/CritFX.js';
import { NotificationCenter } from '../ui2/NotificationCenter.js';
import { MoveCustomWindow } from '../ui2/MoveCustomWindow.js';
import { Party, PartyWindow } from '../social/Party.js';
import { DuelSystem } from '../social/Duel.js';
import { PKSystem } from '../social/PK.js';
import { GameNet } from '../protocol/NetClient.js';
import { applyMagicList, barOrderFromState, resolveSkillByType } from '../skills/ServerMagicList.js';
import { buildPcSkillCastRequest, pcSkillApproachPolicy, pcSkillCastFamily } from '../skills/PcSkillCastRouter.js';
import { MasterySystem, ResetaCommand } from '../progression/Mastery.js';
import { QuickHotkeys } from '../ui2/QuickHotkeys.js';
import { startHpLowLoop, playQuestComplete } from '../audio/SoundBoard.js';
import { Movement } from '../game/Movement.js';
import { ClickToMove } from '../game/ClickToMove.js';
import { CollisionWorld } from '../game/CollisionWithWorld.js';
import { TERRAIN_SCALE as TERRAIN_CELL, prefetchWorldTerrainCore } from '../world/TerrainWorld.js'; // célula PC = 100u (_define.h:265)
import { prefetchWorldTerrainObjects } from '../world/TerrainObjectWorld.js';
import { getPcWorldDescriptor } from '../world/PcWorldRegistry.js';
import { decodeCharacterEquipment } from '../data/CharacterEquipmentCodec.js';
import { loadCurrentClientItemOwners, customItemModelForType } from '../data/CustomItemModelMap.js';
import { loadPcBitmapLuaOwners } from '../data/PcBitmapLuaOwners.js';
import { loadCustomItemFloorLua } from '../data/CustomItemFloorLua.js';
import { loadDisableExcellentLua } from '../data/DisableExcellentLua.js';
import { loadItemTransparencyLua } from '../data/ItemTransparencyLua.js';
import { loadCustomItemForceLua } from '../data/CustomItemForceLua.js';
import { loadCurrentClientMonsterOwners } from '../data/CurrentClientMonsterOwners.js';
import { loadCharacterHelperLua, characterHelperRule } from '../data/CharacterHelperLua.js';
import { loadDarkSpiritLua } from '../data/DarkSpiritLua.js';
import { loadCustomBowLua, customBowType } from '../data/CustomBowLua.js';
import { loadCurrentClientLuaAuthority } from '../data/CurrentClientLuaAuthority.js';
import { loadPcCharacterLuaEffects } from '../data/PcCharacterLuaEffects.js';
import { PLAYER_ACTIONS } from '../graphics/PlayerComposer.js';
import { MUSprites } from '../ui/MUSprites.js';

// Identidade explícita da source servida. Se este marcador NÃO aparecer no
// console, o navegador/servidor HTTP está executando outra árvore ou cache.
export const MUWEB_ANCESTOR_REVISION = 'MUWEB_R18_GROUND_INVENTORY_AUTHORITY_2026-09-26_A';
export const MUWEB_GRANDPARENT_REVISION = 'MUWEB_R19_INTEGRATED_UI_DECODE_2026-09-26_A';
export const MUWEB_R20_REVISION = 'MUWEB_R20_CHARACTER_CREATE_PREVIEW_2026-09-26_A';
export const MUWEB_R21_REVISION = 'MUWEB_R21_CHARACTER_WORLD_LIFECYCLE_2026-09-26_A';
export const MUWEB_R22_REVISION = 'MUWEB_R22_LATENCY_RENDER_PIPELINE_2026-09-26_A';
export const MUWEB_R23_REVISION = 'MUWEB_R23_LANE_RECOVERY_2026-09-26_A';
export const MUWEB_R24_REVISION = 'MUWEB_R24_PET_SERVER_AUTHORITY_2026-09-27_A';
export const MUWEB_R25_REVISION = 'MUWEB_R25_DEATH_STAB_FORCE4_2026-09-27_A';
export const MUWEB_R26_REVISION = 'MUWEB_R26_VITALITY_SPIRIT2_2026-09-27_A';
export const MUWEB_PARENT_REVISION = 'MUWEB_R27_BLOW232_IMPACT_BMD_2026-09-27_A';
export const MUWEB_SOURCE_PARENT_REVISION = 'MUWEB_R28_FURY_CORE_BMD_2026-09-27_A';
export const MUWEB_R90_FIX15_REVISION = 'MUWEB_R90_FIX15_BMD_INFLIGHT_MAP_CANCEL_2026-10-03_A';
export const MUWEB_R90_FIX46_REVISION = 'MUWEB_R90_FIX46_DARKSPIRIT_MONSTER_LUA_CONTRACTS_2026-10-04_A';
export const MUWEB_R90_FIX47_REVISION = 'MUWEB_R90_FIX47_CHARACTER_LUA_MONSTER_PRESENTATION_2026-10-04_A';
export const MUWEB_SOURCE_REVISION = 'MUWEB_R90_FIX57_CAPE_LINK_MATRIX_WING_PRESENTATION_2026-10-05';
export const MUWEB_PREVIOUS_SOURCE_REVISION = 'MUWEB_R78_ITEMVIEW_WORLDENTRY_ANIMATION_CHARSELECT_RECOVERY_2026-09-30_A';
export const MUWEB_R77_BASE_REVISION = 'MUWEB_R77_CANONICAL_WORLD_ROUTING_CUSTOMMOVE_PREFETCH_UTF8_2026-09-30_A';

function hasServerClassByte(c) {
    return Boolean(c && c.charset && c.charset.length > 0 && Number.isInteger(c.charset[0]));
}

function mapRealCharacter(c) {
    const hasClass = hasServerClassByte(c);
    let equipment = null;
    if (c?.charset?.length >= 18) {
        try { equipment = decodeCharacterEquipment(c.charset); }
        catch (e) { console.warn(`[CharSet] ${c?.name || '?'}: ${e.message}`); }
    }
    return {
        name: c.name,
        level: c.level,
        className: hasClass ? serverClassToName(c.charset[0]) : '',
        classId: hasClass ? serverClassToClientClass(c.charset[0]) : -1,
        slot: Number.isInteger(c.slot) ? c.slot : -1,
        charset: c.charset,
        equipment,
        guildStatus: c.guildStatus,
        map: Number.isInteger(c.map) ? c.map : null,
    };
}

export class GameApp {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.state = 'boot';
        this.accountId = null;
        this.playerChar = null;
        this.currentCharData = null;

        // Subsistemas criados no init
        this.scene = null;
        this.effects = null;
        this.mapManager = null;
        this.monsters = null;
        this.pets = null;
        this.hud = null;
        // R17: estado de itens de chão pertence ao GameServer (0x20/0x21/0x22).
        // Existe desde o boot para aceitar viewport antes do world sem fabricar loot local.
        this.groundItems = new ServerGroundItems();
        this.serverInventory = new ServerInventoryMirror();
        this.serverStorage = new ServerStorageMirror();
        this.serverNpcShop = new ServerNpcShopMirror();
        this.serverCustomPreview = new ServerCustomPreviewMirror();
        this.groundItemLayer = null;
        this._teleportGeneration = 0;
        this._pendingServerTeleport = null;
        this._teleportLoadChain = Promise.resolve();
        this._joinMapWaiters = new Set();
        this._worldPrefetchTarget = null;
        // R83 retained physical trace: remember the exact Lua MoveCustom request until
        // the server's authoritative 0x1C arrives. This is diagnostic only: it
        // never rewrites the GS map/x/y and makes protocol-vs-render mismatches
        // visible instead of guessing a local destination.
        this._lastMoveCustomRequest = null;

        this._ui = {};
        this._realChars = [];
        this._maxCharacters = 5;
        this._charListReceived = false;
        this._charListRetryTimers = [];
        // R46: consumidores que preparam Character Select sob a LoadingScene
        // aguardam a F3:00 real sem polling/sleeps. A resposta do GS acorda
        // imediatamente todos os waiters desta sessão.
        this._charListWaiters = new Set();
        this._pendingCharacterDeleteName = '';
        this._preparingCharSelect = false;
        // Cancela setups 3D assíncronos obsoletos da Character Scene.
        // A charlist real pode chegar enquanto World75/Object75 ainda carrega.
        this._charPreviewSetupEpoch = 0;
    }

    // Helper para reportar progresso real de loading.
    // Null-safe: o overlay #loading é removido após o init — um report
    // posterior JAMAIS pode quebrar a lógica do jogo (bug que travava
    // o fluxo loading→server-select: TypeError em loadBar null).
    _reportProgress(percent, msg) {
        try {
            if (window.onLoadingProgress) window.onLoadingProgress(percent, msg);
        } catch (e) {
            console.log('[progress]', percent, msg); // fallback inofensivo
        }
    }

    async init() {
        // LOG IMEDIATO - prova que init() começou
        this._reportProgress(1, '>>> GameApp.init() INICIADO <<<');
        console.log('[GameApp] >>> init() INICIADO <<<');
        console.info(`[MUWEB SOURCE] ${MUWEB_SOURCE_REVISION} | GameApp.js runtime atual`);
        if (typeof window !== 'undefined') window.__MUWEB_SOURCE_REVISION = MUWEB_SOURCE_REVISION;
        
        // FALLBACK: mostra heartbeat a cada 2s se travar
        const heartbeat = setInterval(() => {
            this._reportProgress(null, '⏳ heartbeat... init() ainda rodando');
        }, 2000);
        
        try {
            this._reportProgress(5, 'Inicializando input...');
            Input.init(window);

            // Cria o gerenciador de cenas ANTES de registrar
            this._reportProgress(8, 'Criando SceneManager...');
            this.scenes = new SceneManager(this.container);

            // Registra cenas
            this.scenes.register('server-select', ServerSelectScene);
            this.scenes.register('login', LoginScene);
            this.scenes.register('char-select', CharSelectScene);
            this.scenes.register('char-create', CharCreateScene);
            this.scenes.register('loading', LoadingScene);
            this.scenes.register('world', WorldScene);
            this._reportProgress(15, 'Cenas registradas');

        this._wireSceneEvents();

        // Áudio desbloqueia no primeiro clique (política dos browsers)
        const unlock = () => {
            Sound.init();
            window.removeEventListener('click', unlock);
        };
        window.addEventListener('click', unlock);

        this._reportProgress(20, 'Inicializando rede...');
        // Rede REAL (gateway WS→TCP); se falhar, _handleServerUnavailable
        // registra erro explícito — política 0 simulação (sem modo demo).
        await this._initNetwork();
        this._reportProgress(30, 'Rede inicializada');

        // R22: o AssetLoader ja usa schema IndexedDB v3 com purge em qualquer
        // upgrade + validacao self-healing no read/write path. O deleteDatabase
        // manual de builds antigas podia bloquear o boot por ate 8s quando outra
        // aba mantinha a DB aberta. Nao bloqueamos mais o init: a autoridade de
        // saneamento fica no proprio MUAssetLoader, antes de servir bytes.

        // R12.6 (cfbeefaf, gap de cache): o purge acima cobre só o IndexedDB;
        // o Cache API 'mu-web-assets-v1' (RemoteAssets.js _fromCache/_toCache)
        // NÃO era purgado — bytes pré-strip de builds antigas sobreviviam a F5
        // normal e re-alimentavam OZJ corrompidos (mesma classe do flood do
        // t-muhggfq5-u; também envenena os sheets de ícone Interface/newui_skill
        // com decode-fail fantasma). Once-per-browser, flag distinta, boot segue.
        try {
            const CS_FLAG = 'muweb-cachestorage-purged-v1';
            if (typeof caches !== 'undefined'
                && typeof localStorage !== 'undefined'
                && !localStorage.getItem(CS_FLAG)) {
                await caches.delete('mu-web-assets-v1'); // RemoteAssets.js CACHE_NAME
                localStorage.setItem(CS_FLAG, String(Date.now()));
                console.info('[GameApp] Cache Storage (mu-web-assets-v1) purgado 1x (bytes stale pré-fix).');
            }
        } catch (e2) { console.warn('[GameApp] purge Cache Storage falhou (seguindo):', e2?.message || e2); }

        // Assets originais do cliente (servidor local de dados)
        this._reportProgress(35, 'Conectando ao servidor de assets...');
        await this._initAssets();
        this._reportProgress(50, 'Assets conectados');
        // R72 current-client authority: rebuild the custom item/wing model
        // registry from the actual encrypted/plain Data Lua before any player,
        // inventory or Character Select composition can resolve custom models.
        // Missing/invalid owners fail closed; stock PC ItemModelMap remains the
        // only fallback. Historical/commented LoadItens rows are never mounted.
        if (this.assetsOnline) {
            try {
                const luaMeta = await loadCurrentClientLuaAuthority((p) => RemoteAssets.fetchBinary(p));
                loadPcCharacterLuaEffects((p)=>RemoteAssets.fetchBinary(p)).catch((e)=>console.warn('[CharacterLuaFX] indisponível:', e.message));
                console.info(`[GameApp] Lua authority READY ${luaMeta.present}/${luaMeta.total} scripts`);
            } catch (e) {
                console.warn('[GameApp] Lua authority inventory unavailable:', e?.message || e);
            }
            try {
                const ownerMeta = await loadCurrentClientItemOwners((p) => RemoteAssets.fetchBinary(p));
                console.info(`[GameApp] Current-client item owners READY count=${ownerMeta.count} LoadItens=${ownerMeta.loadItens} wings=${ownerMeta.wings} capes=${ownerMeta.capes}`);
            } catch (e) {
                console.warn('[GameApp] Current-client item owners unavailable — custom models fail-closed:', e?.message || e);
            }
        }
        if (this.assetsOnline) {
            try {
                const bitmapMeta = await loadPcBitmapLuaOwners();
                console.info('[GameApp FIX7] Lua bitmap owners:', bitmapMeta);
            } catch (e) {
                console.warn('[GameApp FIX7] Lua bitmap owners unavailable:', e?.message || e);
            }
        }
        // Current-client transparente.lua owner. RenderPartObject queries this
        // before every item draw; without it custom semi-transparent items become
        // incorrectly solid/bright in inventory, world and equipped paths.
        if (this.assetsOnline) {
            try {
                const transparencyMeta = await loadItemTransparencyLua((p) => RemoteAssets.fetchBinary(p));
                console.info(`[GameApp] ItemTransparency READY rows=${transparencyMeta.count} path=${transparencyMeta.path}`);
            } catch (e) {
                console.warn('[GameApp] ItemTransparency unavailable — stock opaque PC fallback remains owner:', e?.message || e);
            }
        }

        // Current-client DisableExcellent owner. This is visual-only: it vetoes
        // the Excellent/Ancient additive tails exactly where the PC renderer does.
        if (this.assetsOnline) {
            try {
                const disableMeta = await loadDisableExcellentLua((p) => RemoteAssets.fetchBinary(p));
                console.info(`[GameApp] DisableExcellent READY rows=${disableMeta.count} path=${disableMeta.path}`);
            } catch (e) {
                console.warn('[GameApp] DisableExcellent unavailable — stock PC material tails remain owner:', e?.message || e);
            }
        }

        // Current-client ItemConvert final stat override used by tooltip/stats.
        if (this.assetsOnline) {
            try {
                const forceMeta = await loadCustomItemForceLua((p) => RemoteAssets.fetchBinary(p));
                console.info(`[GameApp] CustomItemForce READY rows=${forceMeta.count} path=${forceMeta.path}`);
            } catch (e) {
                console.warn('[GameApp] CustomItemForce unavailable — stock ItemConvert remains owner:', e?.message || e);
            }
            try {
                const monsterMeta = await loadCurrentClientMonsterOwners((p) => RemoteAssets.fetchBinary(p));
                console.info(`[GameApp] CustomMonster READY models=${monsterMeta.count} glows=${monsterMeta.glows} effects=${monsterMeta.effects}`);
            } catch (e) {
                console.warn('[GameApp] CustomMonster owners unavailable — stock viewport model lane remains owner:', e?.message || e);
            }
            try {
                const helperMeta = await loadCharacterHelperLua((p) => RemoteAssets.fetchBinary(p));
                console.info(`[GameApp] CharacterHelper READY rows=${helperMeta.count} path=${helperMeta.path}`);
            } catch (e) {
                console.warn('[GameApp] CharacterHelper unavailable — stock helper lane remains owner:', e?.message || e);
            }
            try {
                const spiritMeta = await loadDarkSpiritLua((p) => RemoteAssets.fetchBinary(p));
                console.info(`[GameApp] DarkSpiritLua READY rows=${spiritMeta.count} path=${spiritMeta.path}`);
            } catch (e) {
                console.warn('[GameApp] DarkSpiritLua unavailable — stock Skill/darkspirit.bmd remains owner:', e?.message || e);
            }
            try {
                const bowMeta = await loadCustomBowLua((p) => RemoteAssets.fetchBinary(p));
                console.info(`[GameApp] CustomBowCross READY rows=${bowMeta.count} path=${bowMeta.path}`);
            } catch (e) {
                console.warn('[GameApp] CustomBowCross unavailable — stock bow families remain owner:', e?.message || e);
            }
        }

        // Current-client dropped-item transform authority. PC CustomItemFloor.cpp
        // runs this owner after ItemObjectAttribute and falls back to stock ItemAngle
        // when no row exists. Keep the same fail-closed/stock fallback contract.
        this._customItemFloorRules = null;
        if (this.assetsOnline) {
            try {
                const floorOwner = await loadCustomItemFloorLua((p) => RemoteAssets.fetchBinary(p));
                this._customItemFloorRules = floorOwner.rules;
                console.info(`[GameApp] CustomItemFloor READY rows=${floorOwner.rules.size} path=${floorOwner.path}`);
            } catch (e) {
                console.warn('[GameApp] CustomItemFloor unavailable — stock PC ItemAngle remains owner:', e?.message || e);
            }
        }

        // R15.3 protocol lane: as chaves pertencem ao Data real do cliente.
        // Carregar aqui, depois de RemoteAssets.configure/ping, fecha o RX C3/C4
        // inner do BOTH sem embutir segredo/chave inventada na source Web.
        if (this.assetsOnline && this.muProtocol?.loadClientCrypto) {
            try { await this.muProtocol.loadClientCrypto((p) => RemoteAssets.fetchBinary(p)); }
            catch (e) { console.warn('[MU Protocol] SimpleModulus indisponível; C3/C4 permanece fail-closed:', e?.message || e); }
        }

        // R13 UI PREWARM: inicia em paralelo durante World95/loading. Antes,
        // ServerSelect/Login/CharSelect disparavam fetch+decode só no mount e
        // os primeiros frames apareciam sem sprites, além de haver corrida em
        // MUSprites.loaded. Não bloqueia o boot; cada cena aguarda a MESMA
        // promise se ainda estiver em andamento.
        const uiSceneFirstPaintAssets = [
            'Custom/NewInterface/login_back.OZJ',
            'Custom/NewInterface/item_money_v2.OZT',
            'Custom/NewInterface/btn_medium.OZJ',
            'Custom/Interface/CharacterSelect_Button01.ozt',
            'Custom/Interface/CharacterSelect_Button02.ozt',
            'Custom/Interface/CharacterSelect_Button03.ozt',
        ];
        const uiGameFirstPaintAssets = [
            'Custom/NewInterface/main_frame_left.ozt',
            'Custom/NewInterface/main_frame_right.ozt',
            'Custom/NewInterface/main_frame_life.ozt',
            'Custom/NewInterface/main_frame_mana.ozt',
            'Interface/newui_menu_SD.OZJ',
            'Custom/NewInterface/main_frame_stamina.ozj',
            'Interface/newui_Exbar.OZJ',
            'Custom/NewInterface/fonttest.OZT',
            'Custom/NewInterface/Main_Skillbox.ozt',
            'Custom/NewInterface/skill_render.ozt',
            'Custom/NewInterface/main_frame_chat_button.ozt',
        ];
        const predecodeUI = async (path) => {
            // R22: one canonical decoded image owner per asset. The old boot
            // R15 historical acceptance is preserved semantically inside
            // RemoteAssets.fetchDecodedImage(): it performs img.decode(); and
            // decode failure remains equivalent to `catch (_) { return false; }`.
            // prewarm decoded an Image that scenes/HUD decoded again later.
            const decoded = await RemoteAssets.fetchDecodedImage(path).catch(() => null);
            return Boolean(decoded?.image || decoded?.url);
        };
        const summarizePrewarm = (label, jobs) => Promise.allSettled(jobs).then((results) => {
            const ok = results.filter(r => r.status === 'fulfilled' && r.value !== false).length;
            const failed = results.length - ok;
            console.info(`[PERF] UI ${label} first-paint prewarm/decode ${ok}/${results.length} failed=${failed}`);
            return { label, ok, failed, total: results.length };
        });

        // R15.13: split the barrier by consumer. Server/Login/Character Select must
        // never wait for MainFrame/Chat assets; gameplay assets still start
        // immediately in parallel and are joined only by _buildGameUI(). This keeps
        // authored owners race-free without turning an unrelated slow HUD asset into
        // delayed Server Select first-paint.
        this._uiScenePrewarmPromise = summarizePrewarm('scene', [
            MUSprites.load(),
            ...uiSceneFirstPaintAssets.map(predecodeUI),
        ]);
        this._uiGamePrewarmPromise = summarizePrewarm('game', uiGameFirstPaintAssets.map(predecodeUI));
        this._uiPrewarmPromise = Promise.all([this._uiScenePrewarmPromise, this._uiGamePrewarmPromise]).then(([scene, game]) => ({
            ok: scene.ok + game.ok,
            failed: scene.failed + game.failed,
            total: scene.total + game.total,
            scene, game,
        }));

        // Expõe o singleton para cenas/UI (login, janelas, etc.)
        window.RemoteAssets = RemoteAssets;

        // Mundo 3D REAL desde o boot (CreateLogInScene do PC: World95 atrás
        // das janelas de login/servidores/char com câmera SceneLogin).
        // DEPOIS dos assets — RemoteAssets precisa do baseUrl configurado.
        this._reportProgress(51, 'Criando cena 3D (World95 real do login)...');
        this.scene = new GameScene(this.container);
        this.scene.initialize();
        this.scene._reportWorldStatus = (msg) => this._reportProgress(null, '[Mundo] ' + msg);
        this._loginWorldPromise = this.scene.loadLoginWorld();
        // R16 Character Select prewarm: Object75 used to begin only after login
        // succeeded, so its real BMD/textures competed with the five character
        // previews and appeared progressively. Warm authored Object75 while the
        // user is still on Server/Login, at idle cadence and low concurrency.
        this._charWorldPrefetchPromise = Promise.resolve(this._loginWorldPromise)
            .then(() => prefetchWorldTerrainObjects(75, { concurrency: 2, yieldBetween: true, idleTimeout: 80 }))
            .then((r) => { console.info(`[PERF] Character World75 prewarm ${r?.warmed || 0}/${r?.total || 0} models placements=${r?.placements || 0}`); return r; })
            .catch((e) => { console.warn('[PERF] Character World75 prewarm fail-closed:', e?.message || e); return null; });

        // Sons reais do cliente (depois que os assets estão acessíveis)
        this._reportProgress(55, 'Carregando sons reais...');
        this._loadRealSounds();
        this._reportProgress(60, 'Sons carregados');

        // Opções com persistance
        try { GameOptions.init({ canvas: null }); } catch (e) { console.warn('GameOptions:', e); }

        // Fluxo inicial R12.3 usa o FUNDO real da Title Scene MuPromax sem
        // overlays MU/Webzen (requisito visual confirmado pelo usuário). A R12
        // usava LSBg01..04 aqui — esses assets pertencem a outro estágio e a
        // captura física confirmou o pergaminho como loading incorreto.
        this._reportProgress(70, 'Renderizando tela de loading (assets reais)...');
        this.state = 'loading';
        await this._gotoScene('loading', {
            duration: 0,
            onDone: async () => {
                // R12.3: aguarda o terreno/câmera World95, mas NUNCA prende
                // a UI indefinidamente por asset/BMD lento. Object95 continua
                // carregando em background dentro de loadLoginWorld().
                this._reportProgress(90, 'Mundo de login: aguardando World95 real...');
                let timeoutId = null;
                try {
                    // R22: loadLoginWorld resolves at real terrain+camera first-paint;
                    // Object95 continues from the same owner in background. Keep a
                    // short 350ms atomic budget so cached ships appear immediately
                    // without turning one slow BMD into an 8s UI stall.
                    const timeout = new Promise((resolve) => {
                        timeoutId = setTimeout(() => resolve('timeout'), 3000);
                    });
                    const result = await Promise.race([
                        Promise.resolve(this._loginWorldPromise).then(() => 'world'),
                        timeout,
                    ]);
                    if (result === 'timeout') console.warn('[GameApp] World95 terrain excedeu 3s; Server Select seguirá fail-closed.');
                    await this.scene?.waitLoginWorldReady?.(350).catch?.(() => false);
                } catch (e) {
                    console.warn('[GameApp] World95 boot falhou; Server Select seguirá em fail-closed:', e);
                } finally { if (timeoutId) clearTimeout(timeoutId); }
                // R15.12: Server Select is the first interactive UI owner. Join the
                // boot-time UI decode barrier here too, so its first visible frame cannot
                // race login/server sprites while World95 finishes in the background.
                await this._uiScenePrewarmPromise?.catch(() => null);
                this._reportProgress(90, 'Entrando na seleção de servidores...');
                this.state = 'server-select';
                await this._gotoScene('server-select');
                this._reportProgress(100, 'Pronto!');
            }
        });
        this._reportProgress(85, 'Loading concluído');

        // Loop principal
        this._loop = this._loop.bind(this);
        this._frameLimit = Number(localStorage.getItem('muweb.fpsLimit') || 60);
        if (![30,60,120].includes(this._frameLimit)) this._frameLimit = 60;
        this._frameLimitLast = 0;
        this._fpsControl = null;
        requestAnimationFrame(this._loop);

        this._reportProgress(100, 'Pronto!');

        // Para o heartbeat
        clearInterval(heartbeat);

        // Diagnóstico destrutivo (fundo vermelho + terrain oculto) NÃO roda em
        // produção. Só é habilitado explicitamente por ?diag=red.
        this._scheduleRedDiag();
    } catch (err) {
        // Erro durante init — loga no console visível
        this._reportProgress(0, 'ERRO: ' + (err.message || err));
        console.error('[GameApp.init] ERRO:', err);
        throw err;
    } finally {
        // Para o heartbeat
        clearInterval(heartbeat);
    }
}

    // ---------------------------------------------------------------
    // Rede: conecta ao gateway WebSocket real do MU
    // ---------------------------------------------------------------
    async _initNetwork() {
        this._reportProgress(20, 'Conectando ao gateway MU real...');
        
        this.muProtocol = new RealMUProtocol({
            gatewayUrl: Config.GATEWAY_URL,
            onConnect: () => {
                this._reportProgress(30, 'Conectado ao gateway MU!');
                this._loadRealSounds();
            },
            onDisconnect: () => {
                this._resetInventorySession();
                this.chatInfo('Desconectado do servidor MU');
            },
            onError: (err) => {
                console.error('[MU Protocol] Erro:', err);
                this.chatInfo('Erro de conexão: ' + err.message);
                // Gateway/TCP real falhou → erro explícito no chat (PC:
                // "Cannot connect to server" — CUIMng PopUpMsgWin), sem demo
                this._handleServerUnavailable('servidor MU TCP offline: ' + (err.message || ''));
            },
            onPacket: (packet) => this.handleMUPacket(packet)
        });
        
        try {
            await this.muProtocol.connect();
            this._reportProgress(35, 'Conectado ao gateway MU (aguardando TCP real...)');
        } catch (e) {
            console.warn('[GameApp] Falha ao conectar no servidor real:', e);
            this._handleServerUnavailable('gateway inacessível');
        }
    }

    // ---------------------------------------------------------------
    // Servidor indisponível (política do usuário: 0 simulação, 0 placeholder).
    // Porte fiel do PC: falha de conexão = estado de erro visível
    // (nunca fingir sucesso com dados inventados). O fluxo real usa o
    // ConnectServer/GameServer via gateway WS→TCP (rotas reais abaixo).
    // ---------------------------------------------------------------
    _handleServerUnavailable(reason) {
        // Porte do PC: sem servidor = erro explícito, como o Main mostra
        // ("Cannot connect to server" — CUIMng PopUpMsgWin).
        console.warn('[GameApp] Servidor indisponível (modo demo removido): ' + (reason || ''));
        this.chatInfo('Não foi possível conectar ao servidor. Verifique se o servidor MU está online.');
    }

    // ---------------------------------------------------------------
    // B5: Roteamento REAL dos pacotes recebidos do servidor MU
    // (antes referenciado mas não definido → TypeError em qualquer pacote)
    // Lógica pura em protocol/MUPacketRouter.js (testável sem Three/DOM)
    // ---------------------------------------------------------------
    handleMUPacket(packet) {
        const action = routeMUPacket(packet, {
            log: (msg, level) => (level === 'warn' ? console.warn(msg) : console.info(msg)),
            onJoinServer: ({ result, index, version, caps }) => {
                // RecvJoinServerNew: handshake GS real. Mantém metadados do socket
                // corrente e não trata F1:00 como pacote desconhecido/reconnect.
                this._gsJoin = { result, index, version, caps, at: Date.now() };
                if (result === 0) console.info(`[MU] GameServer join OK index=${index} version=${version}${caps ? ` caps=${caps}` : ''}`);
                else console.warn(`[MU] GameServer join recusado result=${result}`);
            },
            onLoginResult: (code) => {
                if (isLoginSuccess(code)) {
                    this.muProtocol.connectionState = 'authenticated';
                    this.chatInfo('Login aceito pelo servidor (código ' + code + ').');
                    // Fluxo PC: login OK → SendRequestCharactersList (C1 F3 00)
                    // (CurrentProtocolState REQUEST_CHARACTERS_LIST).
                    // Fluxo Android/BOTH (comprovado real 16:40): login result=1 →
                    // o cliente pede a char list com frame id=5 (AndroidLayer.cpp:269
                    // 'BOTH_CONNECT_CHARACTER — cliente pede lista após login') →
                    // resposta BOTH_MESSAGE id=11 com C2 F3 00 embutido.
                    this._charListReceived = false;
                    this._requestCharacterList('login-result');
                } else {
                    this.muProtocol.connectionState = 'connected';
                    this.chatInfo('Login RECUSADO pelo servidor (código ' + code + ').');
                }
            },
            onLogout: () => {
                this._resetInventorySession();
                this.chatInfo('Logout confirmado pelo servidor.');
            },
            onCustomSocket: ({subcode, packetName, moveCustom}) => {
                // LuaSocket.cpp -> InterfaceController.ClientProtocol. Retain only
                // the exact owner payload; no synthetic response/state is created.
                if (subcode === 0x48 && packetName === 'GS_MoveCustom') {
                    this._moveCustomNamePlayerStaff = moveCustom?.namePlayerStaff || '';
                    console.info(`[MoveCustom] GS response owner=${packetName} name='${this._moveCustomNamePlayerStaff}'`);
                }
            },
            onLife: ({ index, life, shield }) => {
                // ReceiveLife (WSclient.cpp): Index FF = HP/shield ATUAIS do
                // char no servidor real; FE = máximos (Master Level no PC).
                if (index === 0xFF && this.playerChar) {
                    this.playerChar.hp = life;
                    if (this.playerChar.stats) this.playerChar.stats.shield = shield;
                    this.chatInfo(`Vital real do servidor: HP ${life}, Shield ${shield}.`);
                } else if (index === 0xFE) {
                    this.chatInfo(`HP/Shield máximos reais: ${life}/${shield}.`);
                }
            },
            onMana: ({ index, mana, bp }) => {
                // ReceiveMana (WSclient.cpp case 0x27): Index FF = mana/bp atuais
                if (index === 0xFF && this.playerChar) {
                    this.playerChar.mana = mana;
                    if (this.playerChar.stats) this.playerChar.stats.bp = bp;
                    this.chatInfo(`Mana real do servidor: ${mana}, BP ${bp}.`);
                }
            },
            onBuffState: ({ raw }) => {
                // ReceiveBuffState (0x2D — GCPeriodicEffectSend EffectManager:1763)
                // Payload bruto preservado (decode fino contra mais capturas).
                if (this.playerChar && this.playerChar.buffContainer) {
                    this.playerChar.buffContainer.onServerBuffState?.(raw);
                }
            },
            // D2:11/12 — KJH period-item system. ItemInfo[12] only owns
            // period/expired bits; the absolute expiry date arrives here.
            onPeriodItemCount: (count) => {
                this._periodItemExpectedCount = Number(count) || 0;
                console.info(`[MU] D2:11 period items count=${this._periodItemExpectedCount}`);
            },
            onPeriodItemExpire: ({itemCode,slot,expireTime}) => {
                const applied=this.serverInventory?.applyPeriodExpire?.({slot,expireTime}) || false;
                console.info(`[MU] D2:12 period item code=${itemCode} slot=${slot} expire=${expireTime} applied=${applied?1:0}`);
                if(applied) this.inventory?.emit?.('change',{type:'period-expire',slot,expireTime});
            },
            onNotice: ({ text } = {}) => {
                // ReceiveNotice (0x0D, WSclient.cpp:1614): texto real do servidor
                // (censo wire: 'Welcome MagoX !', 'Account level: Free').
                // Espelha no chat informativo como o console de debug do PC.
                if (text) this.chatInfo(text);
            },
            onWeather: (w) => {
                // ReceiveWeather (0x0F, WSclient.cpp:13300): apenas registra o
                // estado REAL do servidor (chuva/neve render é lane de VFX;
                // sem geometria inventada aqui).
                this._weatherFlag = w;
            },
            onCharacterCard: ({ characterCard, enable }) => {
                // ReceiveCharacterCard_New: classes habilitadas p/ criação
                this.chatInfo(`CharacterCard real: DL=${enable.darkLord}, SUM=${enable.summoner}, MG=${enable.dark}.`);
                this._charCardEnable = enable;
            },
            onServerList: ({ total, entries }) => {
                // ReceiveServerList (WSclient.cpp:310): popula grupos reais
                // (script ServerList.bmd) + servidores do ConnectServer real.
                import('../data/ServerListData.js').then(({ ServerListData }) => {
                    ServerListData.applyServerListEntries(entries, total);
                    // Re-render imediato se a cena de servidores está ativa
                    const scene = this.scenes?.current;
                    if (scene && typeof scene.onServerList === 'function') scene.onServerList();
                }).catch((e) => console.warn('[MU] ServerListData indisponível:', e));
            },
            onServerAddress: ({ ip, port }) => {
                // ReceiveServerConnect (WSclient.cpp:344): endereço do GameServer.
                // Fluxo real do PC: o cliente fecha o socket do CS e conecta no GS
                // ANTES de mostrar o CLoginWin. switchToGame resolve a lane:
                // 'android' (55902, protocolo BOTH comprovado — o F1:01 C3 trava
                // no HackPacketCheck: 'Packet encryption error') | 'game' (55901
                // PC cifrado, target do F4:03). Config.GAME_LANE decide.
                this.chatInfo(`GameServer recebido do ConnectServer: ${ip}:${port}`);
                this.selectedGameServer = { ip, port };
                if (this.muProtocol && this.muProtocol.serverType === 'connect') {
                    this.muProtocol.switchToGame(ip, port).then(() => {
                        this.chatInfo('Conectado ao GameServer (lane '
                            + (this.muProtocol.gameLane || 'android') + ').');
                        const target = this._pendingLoginServer || this.selectedServer;
                        this._pendingLoginServer = null;
                        if (this.scenes?.currentName === 'server-select') {
                            this._gotoScene('login', { server: target });
                        }
                    }).catch((e) => {
                        this.chatInfo(`Falha ao conectar no GameServer: ${e.message}`);
                        this.scenes?.current?.setConnectionStatus?.(`Falha ao conectar: ${e.message}`);
                    });
                } else if (this.muProtocol?.inGameLane?.() && this.muProtocol?.isConnected) {
                    const target = this._pendingLoginServer || this.selectedServer;
                    this._pendingLoginServer = null;
                    if (this.scenes?.currentName === 'server-select') this._gotoScene('login', { server: target });
                }
            },
            onCharacterList: ({ count, maxCharacter, chars }) => {
                // ReceiveCharacterList (WSclient.cpp:11536) — chars REAIS do GS.
                // count=0 também é resposta autoritativa; não confundir com "ainda não chegou".
                this._charListReceived = true;
                this._clearCharacterListRetries();
                // Acorda o barrier oculto Login -> Character Select. Não há
                // timer de render nem frame artificial: a F3:00 real é o evento.
                for (const resolve of this._charListWaiters || []) {
                    try { resolve(true); } catch (_) {}
                }
                this._charListWaiters?.clear?.();
                this._realChars = Array.isArray(chars) ? chars : [];
                this._maxCharacters = Math.max(1, Math.min(10, Number(maxCharacter) || 5));
                this.chatInfo(`Character list recebida: ${count} personagem(ns), max=${this._maxCharacters}.`);
                console.info('[CharList] authoritative', {
                    count, maxCharacter: this._maxCharacters,
                    slots: this._realChars.map((c) => ({ slot: c.slot, name: c.name, class0: c.charset?.[0] }))
                });

                const mapped = this._realChars.map(mapRealCharacter);
                const scene = this.scenes?.current;
                if (scene && this.scenes?.currentName === 'char-select' && typeof scene.setChars === 'function') {
                    scene.setChars(mapped, this._maxCharacters);
                }

                // Preview 3D real: 0x00 é Dark Wizard válido e NÃO pode ser filtrado.
                if (this.charPreview && (this.scenes?.currentName === 'char-select' || this._preparingCharSelect)) {
                    const previewChars = mapped
                        .filter((c) => c.classId >= 0)
                        .map((c) => ({ name: c.name, classId: c.classId, slot: c.slot, charset: c.charset, equipment: c.equipment, customPreview: this.serverCustomPreview?.getByName?.(c.name) || null }));
                    this.charPreview.setChars(previewChars).catch((e) =>
                        console.warn('[CharPreview] setChars:', e));
                }
            },
            onCharacterDelete: ({ result }) => {
                const code = Number(result);
                const name = this._pendingCharacterDeleteName || '';
                this._pendingCharacterDeleteName = '';
                const scene = this.scenes?.currentName === 'char-select' ? this.scenes.current : null;
                scene?.showDeleteResult?.(code, name);
                if (code === 1) {
                    this.chatInfo(name ? `Personagem "${name}" deletado no servidor.` : 'Personagem deletado no servidor.');
                    Sound.uiSuccess();
                    // The server owns the list. Refresh only after confirmed success;
                    // never remove/compact a slot optimistically in the browser.
                    this._requestCharacterList('delete-success');
                } else if (code === 2) {
                    this.chatInfo('Delete recusado: código de segurança/senha incorreto.');
                } else {
                    this.chatInfo(`Delete recusado pelo servidor (código ${Number.isFinite(code) ? code : '?'}).`);
                }
            },
            onCharacterCreate: ({ result, name, slot, level, classByte }) => {
                // ReceiveCreateCharacter (WSclient.cpp:560): Result 1 = criado
                // (PC: CreateHero no slot + CloseMsgWin + UpdateDisplay);
                // 0/2 = PopUpMsgWin(RECEIVE_CREATE_CHARACTER_FAIL/FAIL2).
                const scene = this.scenes?.current;
                if (result === 1) {
                    this.chatInfo(`Personagem "${name}" criado no servidor (slot ${slot}, Lv ${level}).`);
                    Sound.uiSuccess();
                    // PC: UpdateDisplay refresca a lista. Aqui: re-pede a char
                    // list real ao GS (F3 00) — a resposta atualiza cena+preview
                    // (onCharacterList acima). Transita de volta à char-select.
                    if (this.muProtocol.serverType === 'game') {
                        this.muProtocol.requestCharacterList(0).catch(() => {});
                    } else if (this.muProtocol.serverType === 'android'
                        && typeof this.muProtocol.requestBothCharacterList === 'function') {
                        this.muProtocol.requestBothCharacterList().catch(() => {});
                    }
                    if (this.scenes?.currentName === 'char-create') {
                        scene?.setPending?.(false);
                        // Mantém a lista autoritativa atual visível imediatamente;
                        // a F3:00 nova substitui os dados assim que chegar.
                        this._returnToCharacterSelectFromCreate('create-success');
                    }
                } else {
                    // Falha: erro explícito na cena (PopUpMsgWin PC) — sem fake.
                    // Wire real 2026-09-24: result=2 ocorre por CONTA CHEIA
                    // (10/10 chars) — FAIL2 do PC cobre ambos os casos.
                    scene?.showError?.(
                        result === 2
                            ? 'Criação recusada pelo servidor (conta cheia ou nome inválido).'
                            : 'Criação recusada pelo servidor.');
                    this.chatInfo(`Create character recusado (código ${result}).`);
                }
            },
            onChatDetailed: ({ id, msg, kind }) => {
                if (this.chat?.receiveMessage) this.chat.receiveMessage(id, msg, null, kind);
                else this.chatInfo(`${id}: ${msg}`);
            },
            onWhisper: ({ id, msg }) => {
                if (this.chat?.receiveMessage) this.chat.receiveMessage(id, msg, null, 'whisper');
                else this.chatInfo(`${id}: ${msg}`);
                if (Sound.buffers?.has('sfx-whisper')) Sound.play('sfx-whisper');
            },
            onChat: (msg) => this.chatInfo(msg),

            // 0x19/0x1A/0x1E/0x1B — pipeline REAL de skill do GameServer.
            // Antes da R14 estes heads não eram roteados: o cast saía para o
            // GS, mas animação/VFX de herói, co-players e monstros nunca era
            // acionado pelo retorno autoritativo do servidor.
            onMagic: (msg) => this._handleServerMagic(msg),
            onMagicPosition: (msg) => this._handleServerMagicPosition(msg),
            onMagicContinue: (msg) => this._handleServerMagicContinue(msg),
            onMagicFinish: (msg) => this._handleServerMagicFinish(msg),

            // 0x1C ReceiveTeleport (WSclient.cpp:1759) — spawn/movimentação do
            // herói pelo SERVIDOR. PRECEIVE_TELEPORT_POSITION: Flag WORD, Map,
            // PositionX/Y (tile), Angle. PC L1773-1805: Position=(tile+0.5)×100,
            // Z=RequestTerrainHeight, Angle=(a−1)×45°. Flag==0 = fim de teleport
            // (spawn no mapa atual); Flag!=0 = troca de mapa server-driven.
            // R17 executa a transação LoadWorld + F3:12 FinishLoading; payload
            // curto ou layout não comprovado continua fail-closed no router.
            onTeleport: (msg) => {
                // ReceiveTeleport é transacional. Flag==0 reposiciona no mapa atual;
                // Flag!=0 invalida viewport, carrega World(Map+1) e só então envia
                // SendRequestFinishLoading (F3:12) para o GS repovoar 0x12/0x13.
                void this._handleServerTeleport(msg);
            },
            // 0x12 ReceiveCreatePlayerViewport — POSIÇÃO REAL do servidor.
            // No world-entry o GS manda o HERÓI na lista (PC: FindCharacterIndex
            // → CharactersClient[Hero]; WSclient.cpp:2239-2271). Match por ID
            // (MAX_ID_SIZE=10, case-insensitive trim). Tile→three-space:
            // x = (tileX+0.5)×100−12800, z = 12800−(tileY+0.5)×100 (mesh MuTerrain
            // centrado na origem, y=norte). Aplica no playerChar + herói na cena
            // (attachPlayerCharacter(spawnPos) hook) — fail-closed: sem match,
            // mantém erro no chat, NUNCA spawn fake.
            onPlayerViewport: ({ count, players }) => {
                if (this.state !== 'world' || !this.playerChar) {
                    console.info(`[MU] 0x12: ${count} player(s) ANTES do world — buffer`);
                    this._pendingPlayerViewport = players;
                    return;
                }
                this._applyPlayerViewport(players);
            },
            onViewportEnter: (name, payload) =>
                console.info(`[MU] ${name}: entidade no viewport (${payload?.length ?? 0}B) — integração viewport P2`),
            // 0x13 ReceiveCreateMonsterViewport — CHARACTER owner do PC: o
            // pacote pode materializar MONSTER ou NPC conforme Setting_Monster().
            // R80 classifica antes do renderer; NPC nunca cai em Monster01.
            // Primeira leva assume o viewport (descarta os client-side de demo).
            // BUFFERING pré-world (padrão do 0x12/_pendingPlayerViewport): no
            // fluxo real o stream 0x13 chega DURANTE o loading — descartar aqui
            // perdia a leva inicial do servidor (captura e2e 3374e5c1: só cones
            // client-side visíveis). Flush no _buildWorld após o flush do 0x12.
            onMonsterViewport: ({ count, monsters }) => {
                this._serverMonsterTraceSeen = this._serverMonsterTraceSeen || new Set();
                for (const m of monsters || []) {
                    const sig = `${m?.key}:${m?.type}:${m?.x}:${m?.y}`;
                    if (!this._serverMonsterTraceSeen.has(sig)) {
                        this._serverMonsterTraceSeen.add(sig);
                        console.info(`[MU] 0x13 viewport actor REAL key=${m?.key} class=${m?.type} tile=(${m?.x},${m?.y}) dir=${m?.dir}`);
                    }
                }
                if (this.state !== 'world' || !this.monsters) {
                    console.info(`[MU] 0x13: ${monsters.length}/${count} monstros ANTES do world — buffer`);
                    this._pendingMonsterViewport = (this._pendingMonsterViewport || []).concat(monsters);
                    return;
                }
                const created = this.monsters.spawnFromServer(monsters);
                if (created > 0) {
                    this.chatInfo(`${created} actor(es) do servidor entraram no viewport.`);
                }
            },
            // 0x14 DeleteViewport — remoção por key (PC DeleteCharacter)
            onViewportDelete: ({ count, keys }) => {
                if (this.state === 'world' && this.monsters) {
                    const removed = this.monsters.removeByServerKeys(keys);
                    const rp = this.playerViewport?.removeByServerKeys(keys) ?? 0;
                    if (removed + rp > 0) console.info(`[MU] 0x14: ${removed}+${rp}/${count} entidade(s) removida(s) do viewport`);
                }
            },
            onViewportLeave: (name) => console.info(`[MU] ${name}: entidade saiu do viewport`),
            onGroundItemsCreate: (msg) => {
                const accepted = this.groundItems.applyCreate(msg);
                void this.groundItemLayer?.sync?.();
                console.info(`[MU] 0x20 world-items: ${accepted}/${msg.count} registro(s) autoritativo(s)`);
            },
            onGroundItemsDelete: (msg) => {
                const removed = this.groundItems.applyDelete(msg);
                void this.groundItemLayer?.sync?.();
                console.info(`[MU] 0x21 world-items: ${removed}/${msg.count} removido(s)`);
            },
            onGetItem: (msg) => {
                const rec = this.groundItems.reconcileGet(msg);
                this.serverInventory.applyPickupResult(msg);
                this._syncInventoryCacheFromMirror();
                void this.groundItemLayer?.sync?.();
                if (msg.failed) {
                    this.chatInfo('Coleta recusada pelo servidor.');
                    return;
                }
                if (msg.zen != null) {
                    this.serverInventory.setZen(msg.zen, { source: '0x22' });
                    if (this.inventory) {
                        this.inventory.zen = msg.zen >>> 0;
                        this.inventory.emit?.('change', { type: 'zen', zen: this.inventory.zen, source: 'server' });
                    }
                }
                this.chatInfo(rec.matched ? 'Item coletado (confirmado pelo servidor).' : 'Resposta de coleta recebida do servidor.');
            },
            onDropItemResult: ({ result, slot }) => {
                // A response for another slot must not unlock the current drop.
                if (this._inventoryDropPending?.slot === slot) this._inventoryDropPending = null;
                this.serverInventory.applyDropResult({ result, slot });
                this._syncInventoryCacheFromMirror();
                if (result === 1) {
                    this.chatInfo('Item descartado (confirmado pelo servidor).');
                } else {
                    this.chatInfo(`Servidor recusou descarte do slot ${slot}.`);
                }
            },
            // 0x30 ReceiveTalk — exact Main 5.2 service dispatch. Value=2 is
            // storage; default and 0x22 are NPC shop. Explicit special-service
            // cases stay fail-closed until their dedicated NewUI owner is ported.
            onTalk: ({ value }) => {
                const v=value&0xff;
                this._ui?.npcShop?.hide?.();
                if (v === 2) {
                    console.info('[MU] 0x30 talk Value=2: storage server owner');
                    this.serverNpcShop.endSession();
                    this.serverStorage.beginSession();
                    if (this._ui?.storageWin && this._ui?.inventoryWin) this._openServerStorageUI();
                    else this._pendingStorageOpen = true;
                    return;
                }
                const special = new Set([3,4,5,6,7,0x0C,0x0D,0x11,0x12,0x13,0x14,0x15,0x16,0x17,0x18,0x19,0x20,0x21,0x23,0x24,0x25,0x26]);
                if (special.has(v)) {
                    console.info(`[MU] 0x30 talk Value=0x${v.toString(16)}: serviço PC especial ainda sem owner Web; não abrir loja falsa.`);
                    return;
                }
                this.serverStorage.open && this.serverStorage.endSession();
                this.serverNpcShop.beginSession();
                const repairIds=new Set([243,246,251,416,578]);
                this._ui?.npcShop?.setRepairShop?.(repairIds.has(Number(this._lastTalkNpc?.typeId)));
                this._ui?.npcShop?.show?.();
                this._ui?.inventoryWin?.show?.();
                console.info(`[MU] 0x30 talk Value=0x${v.toString(16)}: INTERFACE_NPCSHOP server owner${v===0x22?' gamble':''}`);
            },
            onTradeInventory: ({subCode,count,items}) => {
                // ReceiveTradeInventory routes the same 0x31 list to the visible
                // PC container. Sub 3/5 belong to mix/trainer and are not shop.
                if (subCode===3 || subCode===5) {
                    console.info(`[MU] 0x31 mix container sub=${subCode} count=${count} — dedicated mix owner pending`);
                    return;
                }
                if (this.serverStorage.open) {
                    if (this.serverStorage.applySnapshot({items,count})) this._ui?.storageWin?.refresh?.();
                    console.info(`[MU] 0x31 storage snapshot ${items.length}/${count}`);
                    return;
                }
                if (this.serverNpcShop.open || this._ui?.npcShop?.visible) {
                    if (this.serverNpcShop.applySnapshot({items,count})) this._ui?.npcShop?.refresh?.();
                    console.info(`[MU] 0x31 NPC shop snapshot ${items.length}/${count}`);
                    return;
                }
                console.info(`[MU] 0x31 snapshot sem container visível sub=${subCode} count=${count} — fail-closed`);
            },
            onBuy: ({index,item}) => {
                this._ui?.npcShop?.setPending?.(false);
                if (index===0xFE) { this._ui?.npcShop?.hide?.(); this.chatInfo('Compra recusada pelo servidor.'); return; }
                if (index===0xFF) { this.chatInfo('Compra não concluída pelo servidor.'); return; }
                if (index>=12 && index<76 && this.serverInventory.setItem(index,item,{source:'0x32'})) {
                    this._syncInventoryCacheFromMirror(); this._ui?.inventoryWin?.refresh?.();
                    console.info(`[MU] 0x32 buy success slot=${index}`);
                } else console.warn(`[MU] 0x32 buy index fora do inventário pessoal: ${index}`);
            },
            onSell: ({flag,gold}) => {
                const slot=this._npcShopPendingSellSlot; this._npcShopPendingSellSlot=null;
                this._ui?.npcShop?.setPending?.(false);
                if (flag!==0 && flag!==0xFE && flag!==0xFF && Number.isInteger(slot)) {
                    this.serverInventory.clearItem(slot,{source:'0x33'});
                    this.serverInventory.setZen(gold,{source:'0x33'});
                    if(this.playerChar)this.playerChar.gold=gold>>>0;
                    this._syncInventoryCacheFromMirror();
                    console.info(`[MU] 0x33 sell success slot=${slot} zen=${gold}`);
                } else {
                    console.info(`[MU] 0x33 sell reject flag=0x${flag.toString(16)} slot=${slot ?? -1}`);
                    if(flag===0xFE)this._ui?.npcShop?.hide?.();
                }
            },
            onRepair: ({gold}) => {
                this._ui?.npcShop?.setPending?.(false);
                if(gold!==0){this.serverInventory.setZen(gold,{source:'0x34'});if(this.playerChar)this.playerChar.gold=gold>>>0;}
                this._ui?.inventoryWin?.refresh?.();
                console.info(`[MU] 0x34 repair result zen=${gold}`);
            },
            onStorageGold: (msg) => {
                this.serverStorage.applyGold(msg);
                if (msg.result) {
                    this.serverInventory.setZen(msg.gold, {source:'0x81'});
                    if (this.playerChar) this.playerChar.gold = msg.gold >>> 0;
                }
                this._ui?.storageWin?.refresh?.();
                this._ui?.inventoryWin?.refresh?.();
                console.info(`[MU] 0x81 storage gold result=${msg.result?1:0} ware=${msg.currentWarehouse}/${msg.warehouseCount}`);
            },
            onStorageExit: () => {
                console.info('[MU] 0x82 storage exit recebido');
            },
            onStorageStatus: ({value}) => {
                this.serverStorage.applyStatus(value);
                this._ui?.storageWin?.onStatus?.(value);
                console.info(`[MU] 0x83 storage status=${value}`);
            },
            onStorageCost: (msg) => {
                this._ui?.storageWin?.showVaultCost?.(msg);
                console.info(`[MU] 0x84 storage cost=${msg.value} coin='${msg.coinname}'`);
            },
            // F3:10 inventory real (R12.5): entries puras 13B; o parse fino do item
            // (12B PACKET_ITEM_LENGTH, WSclient.h:544) fica com o sistema de itens web.
            onInventory: ({ count, items }) => {
                console.info(`[MU] F3:10 inventory real: ${items.length}/${count} entries (stride 13B, auth PC WSclient.cpp:1279)`);
                if (count !== items.length) return;
                if (this.serverInventory.applySnapshot({ items }) === false) return;
                this._syncInventoryCacheFromMirror();
            },
            onInventoryModify: ({ index, item }) => {
                this.serverInventory.applyModify({ index, item });
                this._syncInventoryCacheFromMirror();
                console.info(`[MU] F3:14 inventory modify: slot=${index} ItemInfo[12] aplicado`);
            },
            onInventoryDelete: ({ index, flag }) => {
                this.serverInventory.applyDelete({ index, flag });
                this._syncInventoryCacheFromMirror();
                console.info(`[MU] 0x28 inventory delete: slot=${index} flag=${flag}`);
            },
            // F3:11 magicList real: skills do char vindas do servidor (resolve o
            // "[Skills] 0 skills" do console físico — só catálogo local era usado).
            // R12.6: entries têm {index, type (AT_SKILL_* real, SkillManager.h),
            // level} — porto o RenderSkillIcon do PC: cada slot recebe skillType
            // real (ícone dos spritesheets newui_skill) + nome do enum real
            // (data/SkillNames.js). ListType=0 substitui a lista inteira (WSclient
            // zera tudo antes no caso base); value=0xFF remove skill[Index];
            // 0xFE seta UM (bits dos 8 hotkeys — ignora, é máscara de slot).
            // F3:20 ReceiveSummonLife exact PC global owner. The byte is
            // server-authoritative and is retained even before UI/world consumers exist.
            onSummonLife: ({ value }) => {
                this._summonLife = value & 0xff;
                console.info(`[MU] F3:20 SummonLife=${this._summonLife}`);
            },
            onMagicList: ({ value, listType, entries }) => {
                console.info(`[MU] F3:11 magicList real: ${entries.length} skills (listType=${listType}, value=${value})`);
                this._serverSkillEntries = entries;
                // Estado canônico PC (Skill[] do WSclient.cpp:1175-1245) —
                // sobrevive à chegada ANTES do _buildGameUI e é a fonte do
                // replay tardio da barra (skills/ServerMagicList.js).
                if (!this._serverSkillState) this._serverSkillState = new Map();
                const { skillNumber } = applyMagicList(this._serverSkillState, { value, listType, entries });
                this._serverSkillNumber = skillNumber;
                this._renderServerSkillBar();
            },
            // F3:50 — master-level snapshot. Retain exact server state;
            // master EXP gauge formula remains a separate UI parity gate.
            onMasterLevelInfo: (msg) => {
                if (!this.playerChar) { this._pendingMasterLevelInfo = msg; return; }
                Object.assign(this.playerChar, { ...msg, masterValid: true });
                console.info(`[MU] F3:50 master level=${msg.masterLevel} points=${msg.masterPoints} exp=${msg.masterExperience}/${msg.nextMasterExperience}`);
            },
            // F3:E0/E1 — exact same-current-client character panel owners
            // ported from AndroidPcGameplayProtocol.h. They replace the old Web
            // placeholder formulas with server-authoritative CharacterMachine view.
            onNewCharacterInfo: (msg) => {
                if (!this.playerChar) { this._pendingNewCharacterInfo = msg; return; }
                this._applyNewCharacterInfo(msg);
            },
            onCharacterCalculation: (msg) => {
                if (!this.playerChar) { this._pendingCharacterCalculation = msg; return; }
                this._applyCharacterCalculation(msg);
            },
            // F3:72 — custom wing/helper/element preview baseline. Wire/state is
            // retained now; visual mapping stays fail-closed until real custom
            // tables (CustomWings/CustomPets) resolve each custom index to BMD.
            onCustomPreview: (msg) => {
                const count = this.serverCustomPreview.applySnapshot(msg, this._heroServerKey);
                this.playerViewport?.applyCustomPreviewState?.(this.serverCustomPreview);
                // PC applies WingIndex after ChangeCharacterExt. If the hero is
                // already published, queue the same transactional visual refresh
                // used by F3:13 instead of waiting for another equipment packet.
                const heroPreview = this._effectiveHeroCustomPreview?.() || this.serverCustomPreview?.get?.(this._heroServerKey) || this.serverCustomPreview?.getByName?.(this.playerChar?.name);
                if (Array.isArray(this._heroEquipCharset) && this._heroEquipCharset.length >= 18) {
                    // Always re-key from the authoritative preview snapshot so a
                    // WingIndex/PetIndex transition back to zero removes the old
                    // custom owner instead of leaving it latched.
                    this._syncWings?.();
                }
                // Character Scene receives the same post-ChangeCharacterExt wing
                // override. Re-stage only when F3:72 changes; CharacterPreview's
                // signature includes the preview wing so unaffected slots retain
                // their already-resident renderer.
                if (this.charPreview && (this.scenes?.currentName === 'char-select' || this._preparingCharSelect)) {
                    this.charPreview.setChars(this._characterPreviewRows()).catch((err) =>
                        console.warn(`[CharPreview] F3:72 refresh falhou: ${err?.message || err}`));
                }
                console.info(`[MU] F3:${(msg.opcode ?? 0x72).toString(16)} custom preview: ${count}/${msg.count} retained, viewport=${msg.viewport ? 1 : 0}`);
            },
            // 0x25 ReceiveChangePlayer: incremental visual update sent to
            // viewport observers after equip/unequip. The remote manager patches
            // the exact 17-byte compact CharacterSet then transactionally rebuilds
            // real body/weapon/wing/helper BMDs. Hero continues to use F3:13.
            onChangeCharacter: (msg) => {
                if (Number.isInteger(this._heroServerKey) && msg.key === this._heroServerKey) {
                    console.info(`[MU] 0x25 hero key=0x${msg.key.toString(16)} ignorado; F3:13 permanece owner do snapshot local`);
                    return;
                }
                this.playerViewport?.applyChangeCharacter?.(msg)
                    ?.catch?.((err) => console.warn(`[MU] 0x25 remote appearance key=0x${msg.key.toString(16)} falhou: ${err?.message || err}`));
            },
            // 0x24 ReceiveEquipmentItem real (auth WSclient.cpp:5820-5900,
            // dispatcher L13342-13348; PACKET_ITEM_LENGTH=12, SubCode 255=cancel).
            // R83: NÃO derivar CharSet visual aqui — 0x24 traz ItemInfo[12]
            // para o container. A aparência do personagem é ownership separado
            // de F3:13. O listener de inventário não chama mais _syncWings; isso
            // removia/recriava apresentação durante um move que ainda aguardava
            // o snapshot visual real e causava hitch/asa sumindo.
            onEquipmentItem: ({ subCode, index, item }) => {
                console.info(`[MU] 0x24 equipment-item real: sub=${subCode} slot=${index} item=[${item[0]}...] (auth WSclient.cpp:5820)`);
                const pendingMove = this._equipmentMovePending;
                if (!this._serverEquipmentUpdates) this._serverEquipmentUpdates = [];
                this._serverEquipmentUpdates.push({ subCode, index, item, at: Date.now() });

                let applied=false;
                if (subCode === 0) {
                    applied = this.serverInventory.applyMoveResult({ subCode, index, item }, pendingMove);
                    if (!applied) return;
                    // storage -> personal: 0x24 owns destination; only our matching
                    // single-flight request is allowed to clear the storage source.
                    if (pendingMove?.srcType === 2 && pendingMove.dstType === 0 && pendingMove.dstIndex === index) {
                        this.serverStorage.clearItem(pendingMove.srcIndex, {source:'0x24-cross'});
                    }
                    this._syncInventoryCacheFromMirror();
                    this.inventory?.emit?.('change', { type:'server-equipment', subCode, index });
                } else if (subCode === 2) {
                    // Storage is created by the normal GameApp constructor before network
                    // traffic can arrive. Keep packet handling fail-closed if a partial/test
                    // lifecycle reaches this callback without that owner instead of throwing.
                    if (!this.serverStorage?.applyEquipmentItem) return;
                    applied = this.serverStorage.applyEquipmentItem({ subCode, index, item }, pendingMove);
                    if (!applied) return;
                    // personal -> storage: destination 0x24 confirms the move; clear
                    // personal source only when it matches our exact pending request.
                    if (pendingMove?.srcType === 0 && pendingMove.dstType === 2 && pendingMove.dstIndex === index) {
                        this.serverInventory.clearItem(pendingMove.srcIndex, {source:'0x24-cross'});
                        this._syncInventoryCacheFromMirror();
                        this.inventory?.emit?.('change', { type:'server-equipment', subCode, index });
                    }
                } else {
                    // sub=1 trade and future containers belong to their own owners.
                    return;
                }

                const matchesPending = pendingMove && subCode === pendingMove.dstType && index === pendingMove.dstIndex;
                if (matchesPending && applied) this._equipmentMovePending = null;
                // applyMoveResult/clearItem already emit exactly one authoritative
                // inventory change. Do not render the whole NewUI inventory twice
                // for the same 0x24. Storage has its own mirror/listener; only an
                // open cross-container view needs an explicit refresh fallback.
                if (subCode === 2) this._ui?.storageWin?.refresh?.();
                // FIX55 custom wing local-equipment bridge: slot 7 carries the
                // exact item immediately even when the GS delays/omits a fresh
                // F3:72 custom-preview snapshot. The fast linked-equipment path
                // keeps this targeted refresh from rebuilding Player.bmd.
                if (subCode === 0 && index === 7 && typeof this._syncWings === 'function') this._syncWings();
            },
            onEquipmentItemCancel: () => {
                this._equipmentMovePending = null;
                console.info('[MU] 0x24 equipment-item cancel (SubCode 255): estado local preservado; sem rollback sintético');
            },
            // F3:03 ReceiveJoinMapServer (auth WSclient.cpp:811-1016, struct
            // WSclient.h:470-514). É o pacote autoritativo de world-entry: o GS
            // confirma map, pos e todo o snapshot de atributos. PC também toca
            // SOUND_LEVEL_UP se player de Master — aqui só sync.
            onJoinMapServer: (msg) => {
                // R77: F3:03 is the authoritative initial WorldActive. Wake the
                // hidden world-entry barrier before any WorldN is selected.
                this._pendingJoinMapServer = msg;
                for (const resolve of this._joinMapWaiters || []) { try { resolve(msg); } catch (_) {} }
                this._joinMapWaiters?.clear?.();
                if (!this.playerChar) return;
                this._applyJoinMapServer(msg);
            },
            // F3:13 ReceiveEquipment real (auth WSclient.cpp:1925-1930): snapshot
            // [KeyH][KeyL][Class][Equipment[17]] (PRECEIVE_EQUIPMENT WSclient.h:589-597).
            // PC: ChangeCharacterExt(FindCharacterIndex(Key) ?? Hero, EqList).
            // Web: atualiza o charset visual do hero [class, ...eq17] e força o
            // re-attach das asas/wings que chegaram no equipamento.
            onEquipment: ({ key, classByte, equipment }) => {
                if (!this.playerChar) return;
                // PC ReceiveEquipment applies the snapshot to FindCharacterIndex(Key).
                // R63 incorrectly applied EVERY nearby actor's F3:13 to the hero,
                // which can make the hero lose wing/body when another player changes gear.
                if (Number.isInteger(this._heroServerKey) && key !== this._heroServerKey) {
                    this.playerViewport?.applyEquipmentSnapshot?.(key, classByte, Array.from(equipment), { source:'F3:13' })
                        ?.catch?.((err) => console.warn(`[MU] F3:13 remote rebuild key=0x${key.toString(16)} falhou: ${err?.message || err}`));
                    console.info(`[MU] F3:13 remote equipment aplicado key=0x${key.toString(16)}; hero=0x${this._heroServerKey.toString(16)}`);
                    return;
                }
                this.playerChar.classByte = classByte;
                this.playerChar.visualClassId = serverClassToClientClass(classByte);
                // charset = 18 bytes: [classByte, equipment[17]] (mesmo layout
                // do F3:00 charList/charCreate usado no select, só que aqui é o
                // estado REAL do GS).
                this.playerChar.charset = [classByte, ...equipment];
                console.info(`[MU] F3:13 equipment real: key=0x${key.toString(16)} class=0x${classByte.toString(16)} eq[0..2]=${equipment.slice(0, 3).join(',')} (auth PC)`);
                if (typeof this._syncWings === 'function') this._syncWings();
                if (this.scene?.character?.refreshEquipment) this.scene.character.refreshEquipment();
                this._refreshStatsHud();
            },
            // F3:05 ReceiveLevelUp real (auth WSclient.cpp:13184; struct L924-938).
            // PC: incrementa nível, atualiza stats, toca SOUND_LEVEL_UP (pLevelUp.wav)
            // + FX visual. Som/FX estão em LevelUpFX.js; aqui só o HUD/sync.
            onLevelUp: ({ level, levelUpPoint, maxLife, maxMana, maxShield, maxSkillMana, addPoint, maxAddPoint, minusPoint, maxMinusPoint }) => {
                if (!this.playerChar) return;
                this.playerChar.level = level;
                this.playerChar.levelUpPoint = levelUpPoint;
                this.playerChar.maxHP = maxLife;
                this.playerChar.maxMP = maxMana;
                this.playerChar.maxSD = maxShield;
                this.playerChar.addPoint = addPoint;
                this.playerChar.maxAddPoint = maxAddPoint;
                this.playerChar.minusPoint = minusPoint;
                this.playerChar.maxMinusPoint = maxMinusPoint;
                this.chatInfo(`LEVEL UP! Nível ${level}`);
                this._refreshStatsHud();
            },
            // F3:07 ReceiveDamage real (auth WSclient.cpp:13194; struct L1022-1030):
            // pós-sub [DamageH][DamageL][ShieldDamageH][ShieldDamageL] — dano ao herói.
            // Quando disponível no HUD, faz flash/damage; fail-closed em silêncio.
            onAddPointResult: (msg) => {
                if (!this.playerChar) { this._pendingAddPointResult = msg; return; }
                this._applyAddPointResult(msg);
            },
            onOption: (opt) => {
                // Estado autoritativo de hotkeys/opções vindo do F3:30.
                this._serverOption = opt;
            },
            onServerCommand: (cmd) => {
                // Preserva comando GS para owners de gameplay/UI; efeitos/sons
                // permanecem fora desta lane de protocolo.
                this._serverCommand = cmd;
            },
            onPatent: ({ records, stride }) => {
                // Custom patente é server-authoritative. Só anexa metadado a
                // atores já existentes; nunca cria personagem placeholder.
                this._serverPatents = this._serverPatents || new Map();
                for (const rec of records) {
                    this._serverPatents.set(rec.key, { patent: rec.patent, type: rec.type, stride });
                    const actor = this._findActorByServerKey?.(rec.key);
                    if (actor) { actor.serverPatent = rec.patent; actor.serverPatentType = rec.type; }
                }
            },
            onPkChange: ({ key, pk }) => {
                // WSclient.cpp::ReceivePK mutates exactly the actor already in
                // CharactersClient; never create a viewport placeholder.
                if (key === this._heroServerKey && this.playerChar) {
                    this.playerChar.pk = pk;
                } else {
                    const rp = this.playerViewport?.getByServerKey?.(key);
                    if (rp) { rp.pk = pk; if (rp.outer?.userData) rp.outer.userData.pk = pk; }
                }
                this.pkSystem?.setPkLevel?.(key, pk);
            },
            onDamageTaken: ({ damage, shieldDamage }) => {
                this.hud?.damage?.(damage);
                this._refreshStatsHud();
                // Fenrir do herói toca FENRIR_DAMAGE (GOBoid.cpp:211-215)
                this.pets?.notifyHeroDamage?.(this.playerChar);
            },
            // 0xD4 PMOVE_CHARACTER: confirmação/movimento autoritativo.
            // Clean PC ReceiveMoveCharacter usa PositionX/Y como destino final
            // e Path[0] high nibble como direção. Para o herói, a Web nunca
            // transforma WASD em posição local definitiva: D4 confirma o tile.
            onMove: ({ key, x, y, dir }) => {
                const a = this._resolveServerActor(key);
                if (!a) return;
                const tx = (x + 0.5) * 100 - 12800;
                const tz = 12800 - (y + 0.5) * 100;
                const ty = this.scene?.terrainHeightAt?.(tx, tz) ?? a.position?.y ?? 0;
                const yaw = muDirectionToThreeYaw(dir);
                if (a.kind === 'hero' && this.playerChar?.position) {
                    const now = performance.now();
                    const queue = (this._netMoveUnacked ??= []);
                    const current = this._netMovePending;
                    let matched = false;
                    let sample = null;

                    // Same owner used by the retained mobile PC-port: D4 is a
                    // confirmation of an already-started local PC movement, not
                    // permission to begin the next visual tile. One-node WASD
                    // packets may therefore be in flight while the body keeps
                    // consuming them at the authored 25-Hz movement cadence.
                    if (current && current.x === x && current.y === y) {
                        current.acked = true;
                        current.ackAt = now;
                        sample = Math.max(1, now - current.sentAt);
                        // TCP/order + final D4 means every older one-node packet
                        // in the prediction ledger was accepted as well.
                        queue.length = 0;
                        matched = true;
                    } else {
                        const idx = queue.findIndex((q) => q.x === x && q.y === y);
                        if (idx >= 0) {
                            sample = Math.max(1, now - queue[idx].sentAt);
                            queue.splice(0, idx + 1);
                            matched = true;
                        }
                    }

                    if (sample != null) {
                        const old = Number(this._netMoveRttEwmaMs || 180);
                        const jitter = Number(this._netMoveJitterEwmaMs || 20);
                        const err = Math.abs(sample - old);
                        this._netMoveRttEwmaMs = Math.max(30, Math.min(4000, old * 0.875 + sample * 0.125));
                        this._netMoveJitterEwmaMs = Math.max(0, Math.min(2000, jitter * 0.875 + err * 0.125));
                    }

                    this._heroServerTile = { x, y };
                    this._netMoveFacing = dir;
                    this.playerChar.rotation.y = yaw;
                    if (!matched && !current && queue.length === 0) {
                        // Movement from a different owner/server event.
                        this.playerChar.position.set(tx, ty, tz);
                    } else if (!matched) {
                        // Explicit divergence from our predicted route: GS wins.
                        this.playerChar.position.set(tx, ty, tz);
                        this._netMovePending = null;
                        queue.length = 0;
                    }
                } else if (a.kind === 'monster' && a.monster) {
                    a.monster.serverTileX=x; a.monster.serverTileY=y;
                    a.monster.position.set(tx, ty, tz);
                    a.monster.rotation.y=yaw;
                    a.root?.position?.copy?.(a.monster.position);
                    if (a.root?.rotation) a.root.rotation.y=yaw;
                } else if (a.kind === 'player' && this.playerViewport?.setMoveTarget?.(key, x, y, dir)) {
                    // Remote D4 is an authoritative destination, not a visual
                    // teleport. PlayerViewportManager owns the PC-rate one-step
                    // interpolation and action/SafeZone re-evaluation.
                } else if (a.root?.position) {
                    a.root.position.set(tx, ty, tz);
                    if (a.root.rotation) a.root.rotation.y=yaw;
                }
            },
            // 0x15 PRECEIVE_MOVE_POSITION: correção autoritativa de tile.
            onPosition: ({ key, x, y }) => {
                const a = this._resolveServerActor(key);
                if (!a?.root && a?.kind !== 'hero') return;
                const tx = (x + 0.5) * 100 - 12800;
                const tz = 12800 - (y + 0.5) * 100;
                const ty = this.scene?.terrainHeightAt?.(tx, tz) ?? a.position?.y ?? 0;
                if (a.kind === 'hero' && this.playerChar?.position) {
                    this.playerChar.position.set(tx, ty, tz);
                    this._heroServerTile = { x, y };
                    this._netMovePending=null;
                    this._netMoveUnacked = [];
                } else if (a.kind === 'monster' && a.monster) {
                    a.monster.serverTileX = x;
                    a.monster.serverTileY = y;
                    a.monster.position.set(tx, ty, tz);
                    a.root?.position?.copy?.(a.monster.position);
                } else if (a.kind === 'player' && this.playerViewport?.setPositionCorrection?.(key, x, y)) {
                    // Explicit 0x15 correction snaps/retire path; ordinary D4
                    // remains smoothly presented by the remote movement owner.
                } else if (a.root?.position) {
                    a.root.position.set(tx, ty, tz);
                }
            },
            // 0x11 PRECEIVE_ATTACK: dano/resultado vêm do GS; não calcula hit local.
            onAttack: ({ key, success, damage, damageType, shieldDamage }) => {
                const a = this._resolveServerActor(key);
                if (!a) return;
                if (a.kind === 'hero' && this.playerChar) {
                    if (success) {
                        this.playerChar.hp = Math.max(0, (this.playerChar.hp ?? 0) - damage);
                        this.playerChar.sd = Math.max(0, (this.playerChar.sd ?? 0) - shieldDamage);
                        if (damage > 0) this.hud?.damage?.(damage);
                        this._refreshStatsHud();
                    }
                } else if (a.kind === 'monster' && a.monster) {
                    // Dano/morte visual do monstro deriva SOMENTE do resultado 0x11
                    // do GS. Não dispara drop/EXP/quest local; esses owners são
                    // mantidos para modo offline e packets autoritativos próprios.
                    if (success && damage > 0 && a.monster.isAlive()) {
                        a.monster.takeDamage(damage, null);
                    }
                }
                if (a.kind !== 'hero' && a.root?.userData) {
                    a.root.userData.lastServerDamage = { success, damage, damageType, shieldDamage, at: Date.now() };
                }
            },
            // 0x18 PRECEIVE_ACTION: action/yaw do actor vêm do GS.
            onAction: ({ key, angle, action, targetKey }) => {
                const a = this._resolveServerActor(key);
                if (!a) return;
                const yaw = muDirectionToThreeYaw(angle);
                if (a.kind === 'hero' && this.playerChar?.rotation) this.playerChar.rotation.y = yaw;
                else {
                    if (a.kind === 'monster' && a.monster?.rotation) a.monster.rotation.y = yaw;
                    if (a.root?.rotation) a.root.rotation.y = yaw;
                }
                a.renderer?.playAction?.(`action_${action}`);
                if (a.root?.userData?.animationControl) a.root.userData.animationControl._current = `server:${action}`;
                void targetKey;
            },
            onUnknown: (p) => { /* já logado pelo router */ void p; }
        });

        // Hook p/ extensões ouvirem o fluxo real
        if (this._muPacketHooks && action !== 'null') {
            for (const fn of this._muPacketHooks) {
                try { fn(packet); } catch (e) { console.warn('[MU] hook error:', e); }
            }
        }

        // ReceiveChat (WSclient.cpp:1457-1462) — no LOG_IN_SCENE, o pacote
        // C1:00 do ConnectServer (CCServerInitSend: ConnectServerProtocol.cpp:89)
        // dispara SendRequestServerList (fluxo real do PC: init → F4:06).
        // Guard: SceneFlag == LOG_IN_SCENE no PC cobre boot→login inteiro — aqui
        // o init pode chegar ANTES de state='loading' (rede conecta primeiro),
        // então aceitamos também o estado pré-cena. Idempotente (1 pedido).
        if (packet && packet.headcode === 0x00
            && this.muProtocol && this.muProtocol.serverType === 'connect'
            && (this.state === 'server-select' || this.state === 'loading' || !this.state)
            && !this._requestedServerList) {
            this._requestedServerList = true;
            console.info('[MU] ConnectServer init recebido — pedindo server list (F4:06)');
            this.muProtocol.requestServerList();
        }
    }

    onMUPacket(fn) {
        (this._muPacketHooks = this._muPacketHooks || []).push(fn);
        return () => { this._muPacketHooks = this._muPacketHooks.filter((f) => f !== fn); };
    }

    /**
     * 0x12 CREATE_PLAYER: aplica o spawn REAL do servidor no herói.
     * Match por ID (case-insensitive). Tile→three-space do MuTerrain
     * (mesh centrado na origem, 25600×25600): x=(tileX+0.5)×100−12800,
     * z=12800−(tileY+0.5)×100. Outros players (sem match) ficam para a
     * integração P2 — nada é criado sem decode/asset reais (0 fake).
     */
    _applyPlayerViewport(players) {
        if (!this.playerChar || !Array.isArray(players)) return;
        // R12.5 primeiro: co-players (não-herói) spawn com próprios classByte/
        // equipment (o herói é filtrado no manager por nome); pacotes sem herói
        // ainda spawnam co-players — ponto de entrada DEVE vir antes do return
        // de herói abaixo. Fail-closed, sem placeholder.
        this.playerViewport?.spawnFromServer(players, this.playerChar?.name)
            .then((r) => {
                // F3:72 may arrive before OR after 0x12. Rebind the retained
                // preview baseline after every viewport admission so ordering
                // cannot drop protocol state for a newly-created actor.
                this.playerViewport?.applyCustomPreviewState?.(this.serverCustomPreview);
                if (r.created > 0 || r.updated > 0) {
                    console.info(`[MU] 0x12 co-players: ${r.created} spawn(s) / ${r.updated} atualização(s) — mundo multiplayer visível`);
                }
            })
            .catch((e) => console.warn('[World] playerViewport co-players falhou (fail-closed):', e.message));
        const hero = players.find((p) =>
            p?.id && this.playerChar.name &&
            p.id.trim().toLowerCase() === this.playerChar.name.trim().toLowerCase()
        );
        if (!hero) return;
        // Key autoritativa do herói — usada pelo ReceiveMagic 0x19 para
        // resolver caster/target sem heurística por nome.
        this._heroServerKey = hero.key;
        this._heroServerTile = { x: hero.x, y: hero.y };
        const tx = (hero.x + 0.5) * 100 - 12800;
        const tz = 12800 - (hero.y + 0.5) * 100;
        // PC ReceiveCreatePlayerViewport/ReceiveTeleport places the actor on the
        // terrain height immediately.  Keeping the old y=0 until Movement.tick
        // ran produced the physical symptom seen in R45.2: the hero starts below
        // terrain and only becomes whole after the first movement input.
        const groundY = this.scene?.terrainHeightAt
            ? this.scene.terrainHeightAt(tx, tz)
            : this.playerChar.position.y;
        this.playerChar.position.set(tx, groundY, tz);
        this.playerChar.classByte = hero.classByte;
        this.playerChar.visualClassId = serverClassToClientClass(hero.classByte);
        // R57 physical correction: after applyMuUpAxis the composed Player.bmd
        // visual forward is +Z at outer yaw 0. MUDirection.js is the single
        // facing owner; do not add a second PI offset at spawn or movement.
        this.playerChar.rotation.y = muDirectionToThreeYaw(hero.path >> 4);
        if (this.scene?.attachPlayerCharacter && !this.scene.mainObject) {
            // CharSet preferido: o bloco Equipment×17 do PRÓPRIO 0x12 (mais
            // atual que a lista F3:00 — PC: ChangeCharacterExt usa o Equipment
            // do PCREATE_CHARACTER). CharSet[18] = [classByte, ...equipment]
            // (ZzzCharacter.cpp::ChangeCharacterExt recebe Equipment separado;
            //  o codec R12.4 espera classe em [0] — F3:00 e 0x12 têm o mesmo
            //  layout base, vide WSclient.h:600 PCREATE_CHARACTER).
            const eq = hero.equipment;
            const charset = Array.isArray(eq) && eq.length === 17
                ? [hero.classByte, ...eq]
                : (Array.isArray(this.playerChar.charset) && this.playerChar.charset.length >= 18
                    ? this.playerChar.charset : null);
            this.scene.attachPlayerCharacter(this.playerChar.visualClassId ?? serverClassToClientClass(this.playerChar.classByte ?? 0), [tx, groundY, tz], { charset, customPreview: this.serverCustomPreview?.get?.(hero.key) || this.serverCustomPreview?.getByName?.(hero.id) || null })
                .then(async (published) => {
                    if (!published) return;
                    this.playerChar.mesh = this.scene.mainObject;
                    // Rider: attach de spawn recria o _playerRenderer — atualiza
                    // o ride-state (PLAYER_FENRIR_* enquanto montado).
                    this.pets?.setHeroRenderer?.(this.scene._playerRenderer || null);
                    // R24: um único sincronizador fecha Dark Spirit + fenrir +
                    // helper + riders e também corrige o race em que o 0x12
                    // anexava o herói antes de PetSystem existir.
                    await this._syncHeroPetCompanions({ announce: true });
                })
                .catch((e) => console.warn('[World] spawn herói falhou:', e));
        }
        this.chatInfo?.(`Spawn real do servidor: tile (${hero.x}, ${hero.y}).`);
        console.info(`[MU] 0x12: herói '${hero.id}' spawn tile(${hero.x},${hero.y}) key=${hero.key} class=${hero.classByte}`);
        // Consome qualquer joinMapServer pendente (packet authoritativo pode
        // chegar antes do playerChar ser criado — 0x12 buffer precedeF3:03).
        if (this._pendingJoinMapServer) {
            const pending = this._pendingJoinMapServer;
            this._pendingJoinMapServer = null;
            this._applyJoinMapServer(pending);
        }
    }

    _mergeLowDwordCounter(current, low) {
        const n = Number(current || 0);
        const lo = Number(low >>> 0);
        if (Number.isSafeInteger(n) && n > 0xFFFFFFFF && (n >>> 0) === lo) return n;
        return lo;
    }

    _applyNewCharacterInfo(msg) {
        const p = this.playerChar;
        if (!p || !msg) return;
        p.level = Number(msg.level ?? p.level ?? 0);
        p.levelUpPoint = Number(msg.points ?? p.levelUpPoint ?? 0);
        if (p.stats) {
            p.stats.str = Number(msg.strength ?? p.stats.str ?? 0);
            p.stats.agi = Number(msg.dexterity ?? p.stats.agi ?? 0);
            p.stats.vit = Number(msg.vitality ?? p.stats.vit ?? 0);
            p.stats.ene = Number(msg.energy ?? p.stats.ene ?? 0);
            p.stats.cmd = Number(msg.leadership ?? p.stats.cmd ?? 0);
        }
        p.experience = this._mergeLowDwordCounter(p.experience, msg.experienceLow ?? 0);
        p.nextExperience = this._mergeLowDwordCounter(p.nextExperience, msg.nextExperienceLow ?? 0);
        p.hp = Number(msg.life ?? p.hp ?? 0); p.maxHP = Number(msg.maxLife ?? p.maxHP ?? 0);
        p.mp = Number(msg.mana ?? p.mp ?? 0); p.maxMP = Number(msg.maxMana ?? p.maxMP ?? 0);
        p.bp = p.skillMana = Number(msg.bp ?? p.skillMana ?? 0);
        p.maxBP = p.maxSkillMana = Number(msg.maxBp ?? p.maxSkillMana ?? 0);
        p.sd = Number(msg.shield ?? p.sd ?? 0); p.maxSD = Number(msg.maxShield ?? p.maxSD ?? 0);
        p.fruitAdd = p.addPoint = Number(msg.fruitAdd ?? p.fruitAdd ?? p.addPoint ?? 0);
        p.maxFruitAdd = p.maxAddPoint = Number(msg.maxFruitAdd ?? p.maxFruitAdd ?? p.maxAddPoint ?? 0);
        p.fruitSub = p.minusPoint = Number(msg.fruitSub ?? p.fruitSub ?? p.minusPoint ?? 0);
        p.maxFruitSub = p.maxMinusPoint = Number(msg.maxFruitSub ?? p.maxFruitSub ?? p.maxMinusPoint ?? 0);
        if (msg.resetValid) { p.reset = Number(msg.reset || 0); p.resetValid = true; }
        p.characterInfoValid = true;
        this._refreshStatsHud();
        this._ui?.charWindow?.refresh?.();
    }

    _applyCharacterCalculation(msg) {
        const p = this.playerChar;
        if (!p || !msg) return;
        const keys = [
            'addStrength','addDexterity','addVitality','addEnergy','addLeadership',
            'physicalMin','physicalMax','magicMin','magicMax','curseMin','curseMax',
            'mulPhysical','divPhysical','mulMagic','divMagic','mulCurse','divCurse',
            'magicDamageRate','curseDamageRate','physicalSpeed','magicSpeed',
            'attackSuccess','attackSuccessPvp','defense','defenseSuccess','defenseSuccessPvp',
            'damageMultiplier','rfMultiplierA','rfMultiplierB','rfMultiplierC',
            'darkSpiritMin','darkSpiritMax','darkSpiritSpeed','darkSpiritSuccess'
        ];
        for (const k of keys) if (msg[k] !== undefined) p[k] = Number(msg[k]);
        p.hp = Number(msg.life ?? p.hp ?? 0); p.maxHP = Number(msg.maxLife ?? p.maxHP ?? 0);
        p.mp = Number(msg.mana ?? p.mp ?? 0); p.maxMP = Number(msg.maxMana ?? p.maxMP ?? 0);
        p.bp = p.skillMana = Number(msg.bp ?? p.skillMana ?? 0);
        p.maxBP = p.maxSkillMana = Number(msg.maxBp ?? p.maxSkillMana ?? 0);
        p.sd = Number(msg.shield ?? p.sd ?? 0); p.maxSD = Number(msg.maxShield ?? p.maxSD ?? 0);
        p.attackDamageMin = p.physicalMin;
        p.attackDamageMax = p.physicalMax;
        p.defenseRate = p.defenseSuccess;
        p.calculationValid = true;
        // F3:E1 exists in multiple exact lengths. Preserve which tail blocks
        // were physically present so Character C never fabricates missing
        // speed/PvP/defense fields as zero.
        p.calculationFields = { ...(p.calculationFields || {}), ...(msg.calculationFields || {}) };
        this._refreshStatsHud();
        this._ui?.charWindow?.refresh?.();
    }

    _applyAddPointResult(msg) {
        const p = this.playerChar;
        if (!p || !msg) return;
        if (!msg.accepted) {
            this._ui?.charWindow?.refresh?.();
            return;
        }
        const type = Number(msg.type);
        if (msg.extended) {
            p.levelUpPoint = Number(msg.points ?? p.levelUpPoint ?? 0);
            p.maxHP = Number(msg.maxLife ?? p.maxHP ?? 0);
            p.maxMP = Number(msg.maxMana ?? p.maxMP ?? 0);
            p.maxBP = p.maxSkillMana = Number(msg.maxBp ?? p.maxBP ?? p.maxSkillMana ?? 0);
            p.maxSD = Number(msg.maxShield ?? p.maxSD ?? 0);
            if (p.stats) {
                p.stats.str = Number(msg.strength ?? p.stats.str ?? 0);
                p.stats.agi = Number(msg.dexterity ?? p.stats.agi ?? 0);
                p.stats.vit = Number(msg.vitality ?? p.stats.vit ?? 0);
                p.stats.ene = Number(msg.energy ?? p.stats.ene ?? 0);
                p.stats.cmd = Number(msg.leadership ?? p.stats.cmd ?? 0);
            }
        } else {
            // Legacy PcParseLevelUpPoint mirrors the desktop owner: decrement
            // one available point, increment only the accepted stat, then take
            // the stat-specific max resource plus SD/BP from the response.
            if (Number(p.levelUpPoint || 0) > 0) p.levelUpPoint = Number(p.levelUpPoint) - 1;
            if (p.stats && type >= 0 && type <= 4) {
                const key = ['str','agi','vit','ene','cmd'][type];
                p.stats[key] = Number(p.stats[key] || 0) + 1;
            }
            if (type === 2 && msg.statMax !== undefined) p.maxHP = Number(msg.statMax);
            if (type === 3 && msg.statMax !== undefined) p.maxMP = Number(msg.statMax);
            if (msg.maxShield !== undefined) p.maxSD = Number(msg.maxShield);
            if (msg.maxBp !== undefined) p.maxBP = p.maxSkillMana = Number(msg.maxBp);
        }
        this._refreshStatsHud();
        this._ui?.charWindow?.refresh?.();
    }

    // F3:03 ReceiveJoinMapServer (PC WSclient.cpp:811-1016): aplica o snapshot
    // autoritativo de entrada no mundo (stats + pos). Roda APÓS _applyPlayerViewport
    // (que spawn o herói), porque depende de playerChar existir na cena.
    _applyJoinMapServer(msg) {
        const p = this.playerChar;
        if (!p) return;
        if ([msg.posX, msg.posY].every(v => Number.isInteger(v) && v >= 0 && v <= 255)) {
            this._heroServerTile = { x: msg.posX, y: msg.posY };
        }
        // PC: CharacterAttribute->Strength/Dexterity/Vitality/Energy = Data->*
        if (typeof p.stats === 'object' && p.stats) {
            p.stats.str = msg.strength;
            p.stats.agi = msg.dexterity;
            p.stats.vit = msg.vitality;
            p.stats.ene = msg.energy;
            p.stats.cmd = msg.charisma;
        }
        p.levelUpPoint = msg.levelUpPoint;
        // In the retained current-client owner these F3:03 fields feed the
        // CharacterInfo fruit add/sub rows. Keep legacy aliases for consumers.
        p.addPoint = p.fruitAdd = msg.addPoint;
        p.maxAddPoint = p.maxFruitAdd = msg.maxAddPoint;
        p.minusPoint = p.fruitSub = msg.minusPoint;
        p.maxMinusPoint = p.maxFruitSub = msg.maxMinusPoint;
        p.maxHP = msg.maxLife;
        p.hp = msg.life;
        p.maxMP = msg.maxMana;
        p.mp = msg.mana;
        p.maxSD = msg.maxShield;
        p.sd = msg.shield;
        p.skillMana = msg.skillMana;
        p.maxSkillMana = msg.maxSkillMana;
        // PC: CharacterAttribute->Experience = (int)Data_Exp (ou MasterExp — o
        // branch masterLevel fica para trás até o F3:0xE9).
        if (typeof msg.experience === 'bigint') {
            const n = Number(msg.experience);
            if (Number.isSafeInteger(n)) p.experience = n;
        }
        if (typeof msg.nextExperience === 'bigint') {
            const n = Number(msg.nextExperience);
            if (Number.isSafeInteger(n)) p.nextExperience = n;
        }
        this.goldTracker?.set?.(msg.gold);
        p.gold = msg.gold;
        this.serverInventory?.setZen?.(msg.gold, { source: 'F3:03' });
        if (this._pendingMasterLevelInfo) {
            Object.assign(p, { ...this._pendingMasterLevelInfo, masterValid: true });
            this._pendingMasterLevelInfo = null;
        }
        if (this._pendingNewCharacterInfo) {
            const pending = this._pendingNewCharacterInfo; this._pendingNewCharacterInfo = null;
            this._applyNewCharacterInfo(pending);
        }
        if (this._pendingCharacterCalculation) {
            const pending = this._pendingCharacterCalculation; this._pendingCharacterCalculation = null;
            this._applyCharacterCalculation(pending);
        }
        if (this._pendingAddPointResult) {
            const pending = this._pendingAddPointResult; this._pendingAddPointResult = null;
            this._applyAddPointResult(pending);
        }
        if (this.inventory) {
            this.inventory.zen = Number(msg.gold) >>> 0;
            this.inventory.emit?.('change', { type: 'zen', zen: this.inventory.zen, source: 'F3:03' });
        }
        this._refreshStatsHud();
        // Log info por pacote — world-entry é muito raro por sessão, sem flood.
        console.info(`[MU] F3:03 joinMapServer: map=${msg.map} tile(${msg.posX},${msg.posY}) angle=${msg.angle} xp=${msg.experience} gold=${msg.gold}`);
        this.chatInfo(`O server confirmou entrada no mapa ${msg.map} no tile ${msg.posX}, ${msg.posY}.`);
    }

    // ---------------------------------------------------------------
    // Assets originais do cliente (URL configurável via core/Config.js — B8)
    // ---------------------------------------------------------------
    async _initAssets() {
        this._reportProgress(35, 'Conectando ao servidor de assets...');
        RemoteAssets.configure(Config.ASSETS_URL, Config.ASSET_AUTHORITY || null);
        this._reportProgress(40, 'Verificando servidor de assets...');
        // R56.1: startup validates only the scene-critical owners. Visual/UI/item
        // resources are resolved by the asset server through original-PC source
        // extensions (.tga/.jpg/.bmp), compiled Data extensions (.ozt/.ozj/.ozb)
        // and safe item-table aliases. A different World1 placement count is a
        // Data-content variant, not a reason to prevent the Web client from booting.
        const required = [
            'Interface/New_lo_back_01.OZJ',
            'World95/TerrainHeight.OZB',
            'World75/TerrainHeight.OZB',
            'World75/EncTerrain75.att',
            'World1/TerrainHeight.OZB',
            'World1/EncTerrain1.obj',
            'World1/EncTerrain1.map',
            'World1/EncTerrain1.att',
        ];
        const ok = await RemoteAssets.pingRequired(required);
        console.info(ok
            ? '[GameApp] Assets críticos Login/World95/World75/World1 conectados (R56.1 variant-safe)'
            : `[GameApp] Asset root sem os owners críticos em ${Config.ASSETS_URL} — boot bloqueado`);
        this.assetsOnline = ok;
        this._reportProgress(45, ok ? 'Assets críticos conectados; visual resolver ativo' : 'Assets críticos ausentes — selecione a Data correta');
        if (!ok) {
            throw new Error(`Asset server sem Login/World95/World75/World1 críticos: ${Config.ASSETS_URL}`);
        }
        return true;
    }

    // Pré-carrega efeitos sonoros reais do cliente (wav originais em Data/Sound).
    _loadRealSounds() {
        if (!this.assetsOnline) return;
        // R12.5: load é por-SESSÃO, não por-conexão. Chamado no boot (L219) e
        // em CADA onConnect do gateway (L296 — inclui o re-connect de entrada
        // na cena de login): a 2ª carga era redundante, refazia o fetch dos
        // 6 wavs e mostrava "Carregando N sons reais..." de novo no console
        // físico do usuário. Guarda idempotente aqui.
        if (this._soundsLoadedOnce) return;
        this._soundsLoadedOnce = true;
        const sounds = [
            ['sfx-click',   'iButtonClick.wav'],
            ['sfx-window',  'iCreateWindow.wav'],
            ['sfx-error',   'iButtonError.wav'],
            ['sfx-whisper', 'iWhisper.wav'],
            ['sfx-title',   'iTitle.wav'],
            ['sfx-jewel',   'Jewel_Sound.wav'],
            ['sfx-heart',   'pHeartBeat.wav'],
            ['sfx-levelup', 'pLevelUp.wav'],
        ];
        this._reportProgress(55, `Carregando ${sounds.length} sons reais...`);
        for (let i = 0; i < sounds.length; i++) {
            const [id, rel] = sounds[i];
            const pct = 55 + Math.round((i / sounds.length) * 10);
            this._reportProgress(pct, `Carregando som: Sound/${rel}`);
            Sound.loadWav(id, rel).then((buf) => {
                if (buf) console.info(`[GameApp] Som real carregado: Sound/${rel}`);
            });
        }
    }

    // ---------------------------------------------------------------
    // Eventos das cenas — assinados na instância após cada switchTo
    // ---------------------------------------------------------------
    _wireSceneEvents() {
        // R22: scene hooks are published synchronously by SceneManager after
        // mount/show. The old 200ms polling timer added visible input latency
        // and woke forever even when no scene changed.
        if (this.scenes) this.scenes.onDidSwitch = () => {
            this._hookedScene = null;
            this._hookSceneEvents();
        };
    }

    _hookSceneEvents() {
        const scene = this.scenes.current;
        if (!scene || scene === this._hookedScene) return;
        this._hookedScene = scene;
        const name = this.scenes.currentName;

        if (name === 'server-select') {
            // Servidor escolhido → F4:03 (endereço real) → login (fluxo PC:
            // SendRequestServerAddress → ReceiveServerConnect → CLoginWin)
            scene.on('server-selected', ({ server, group }) => {
                // Normaliza p/ LoginScene: nome real (InsertServer "%s-%d")
                const srvIdx = (server?.serverCode ?? 0) % 20 + 1;
                const norm = {
                    id: server?.serverCode ?? 0,
                    name: `${group?.name || 'Server'}-${srvIdx}`,
                    serverCode: server?.serverCode ?? 0,
                    percent: server?.percent ?? 0,
                };
                this.selectedServer = norm;
                this._pendingLoginServer = norm;
                Sound.uiSuccess();
                // PC authority: F4:03 -> fecha/retarget CS -> conecta GS -> SÓ ENTÃO
                // mostra CLoginWin. R12 mostrava Login imediatamente e o usuário
                // podia autenticar enquanto ainda estava na lane ConnectServer.
                scene.setConnectionStatus?.(`Conectando a ${norm.name}...`);
                if (this.muProtocol && this.muProtocol.serverType === 'connect') {
                    this.muProtocol.requestServerAddress(norm.serverCode).catch((e) => {
                        scene.setConnectionStatus?.(`Falha ao solicitar GameServer: ${e.message}`);
                    });
                }
            });
            // Click em grupo → SendRequestServerList (C1 04 F4 06 — fluxo real)
            scene.on('request-server-list', () => {
                if (this.muProtocol && this.muProtocol.isConnected) {
                    this.muProtocol.requestServerList().catch(() => {});
                }
            });
        }
        else if (name === 'login') {
            scene.on('login', ({ accountId }) => this._onLogin(accountId));
            scene.on('join-server', ({ accountId, server }) => this._onLogin(accountId, server));
        }
        else if (name === 'char-select') {
            scene.on('enter-game', ({ char }) => {
                // Guard anti-duplo: o console físico (:8093) mostrou
                // 'Entrando no mundo...' 2× seguidas — Enter+click no mesmo
                // instante emitiam enter-game duas vezes: requestJoinMapServer
                // 2× ao GS + _buildWorld 2× (World1 = 2985 objetos → demora
                // dobrada de entrar no mundo). PC CharacterList.lua só entra
                // 1× (ClickedButton consome o evento). Latch liberado em
                // falha explícita do _enterWorld (nunca em sucesso).
                if (this._enteringWorld) return;
                this._enteringWorld = true;
                const release = () => { this._enteringWorld = false; };
                this._enterWorld(char).catch(async (e) => {
                    console.error('[WorldEntry] entrada abortada; retornando ao Character Select:', e);
                    this._reportProgress(null, `Falha ao entrar no mundo: ${e?.message || e}`);
                    // Never strand the user under LoadingScene/logo. Rebuild the
                    // exact real World75/Character Select owner so the same char can
                    // be retried after an asset/shader/runtime failure.
                    this.state = 'loading';
                    try { await this._prepareCharacterSelectAfterLogin(this.accountId); } catch (_) { /* method is fail-closed */ }
                }).finally(release);
                this.currentCharData = char;
                // SendRequestJoinMapServer (wsclientinline.h): C1 F3 03 [name]
                // — pedido REAL de entrada no mundo. Na lane android (55902,
                // comprovada funcional) o requestJoinMapServer envia frame id=6
                // BOTH_POSITION com Name[10] (AndroidLayer.cpp:298 — handler
                // que seta LastServerCode e chama CGCharacterInfoRecv).
                if (this.muProtocol && this.muProtocol.inGameLane()
                    && this.muProtocol.isConnected) {
                    this.muProtocol.requestJoinMapServer(char.name).catch(() => {});
                }
            });
            scene.on('delete-char', ({ char, security = '' }) => {
                // SendRequestDeleteCharacter: C1 F3 02 [name 10B][resident/security 20B].
                // R72 sent twenty zero bytes, so any server which validates this
                // field necessarily rejected deletion. R73 forwards the UI value
                // exactly and never logs/persists it.
                if (this.muProtocol && this.muProtocol.inGameLane()
                    && this.muProtocol.isConnected) {
                    const payload = new Uint8Array(30);
                    const name = String(char?.name || '').slice(0, 10);
                    this.muProtocol.writeString(payload, 0, name, 10);
                    this.muProtocol.writeString(payload, 10, String(security || '').slice(0, 20), 20);
                    const pkt = this.muProtocol.buildPacket(0xF3, 0x02, payload);
                    this._pendingCharacterDeleteName = name;
                    scene?.setDeletePending?.(true, name);
                    this.muProtocol.sendPacket(pkt).catch((e) => {
                        this._pendingCharacterDeleteName = '';
                        scene?.showDeleteTransportError?.(e?.message || 'transport error');
                    });
                } else {
                    scene?.showDeleteTransportError?.('GameServer desconectado');
                }
            });
            scene.on('new-char', () => this._enterCharacterCreate());
            // Preview 3D real (CharacterList.lua UpdateProc/CharacterRotate):
            // seleção move o herói p/ (8590,18785,75)+action 207; drag gira +5°
            scene.on('select', ({ index, slot, char }) => {
                this.charPreview?.selectSlot(slot ?? index);
                if (Number.isInteger(char?.map)) this._startWorldPrefetch(char.map);
            });
            scene.on('rotate', ({ index, slot, delta }) => this.charPreview?.rotateSlot(slot ?? index, delta));
            // MENU (CCharSelMainWin): volta ao fluxo — remove o preview 3D
            scene.on('menu', () => {
                this.charPreview?.dispose();
                this.charPreview = null;
            });
        }
        else if (name === 'char-create') {
            scene.on('created', (data) => this._onCharCreated(data));
            scene.on('class-selected', ({ classId }) => this._setCreatePreviewClass(classId));
            scene.on('cancel', () => this._returnToCharacterSelectFromCreate('cancel'));
        }
    }

    async _gotoScene(name, params = {}, options = {}) {
        // R15/PC parity: o cliente original não depende de um fade CSS de
        // 350ms para trocar estado. Em frame pesado esse timer do browser foi
        // observado resolvendo até 12,5s depois (starvation). Por padrão a
        // transição de gameplay é imediata; callers podem pedir fade explícito.
        const sceneOptions = { fadeMs: 0, ...options };
        await this.scenes.switchTo(name, params, sceneOptions);
        // R12.4: a scene DOM/WebGL era trocada, mas GameApp.state continuava
        // 'server-select'. Isso quebrava probes, lógica dependente de estado e
        // tornava o heartbeat enganoso durante login/char-select.
        this.state = name;
        this._hookedScene = null; // força reassinatura na próxima iteração
        this._hookSceneEvents();

        // Probe APÓS a transição/fade terminar. O probe por mudança de state pode
        // ocorrer durante o fade intencional; este é o veredito "settled".
        if (this.scene) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                try {
                    this.scene.render();
                    this.scene.logFramebufferProbe?.(`${name}:settled`);
                } catch (e) {
                    console.warn(`[RenderProbe] settled ${name} falhou:`, e);
                }
            }));
        }
    }

    _requestCharacterList(reason = 'unspecified') {
        if (!this.muProtocol || !this.muProtocol.isConnected || !this.muProtocol.inGameLane()) return false;
        const now = performance.now();
        if (this._lastCharListRequestAt && now - this._lastCharListRequestAt < 800) {
            console.info(`[CharList] request suprimido (debounce) reason=${reason}`);
            return false;
        }
        this._lastCharListRequestAt = now;
        console.info(`[CharList] request reason=${reason} lane=${this.muProtocol.serverType}`);
        const p = this.muProtocol.serverType === 'game'
            ? this.muProtocol.requestCharacterList(0)
            : (typeof this.muProtocol.requestBothCharacterList === 'function'
                ? this.muProtocol.requestBothCharacterList() : null);
        p?.catch((e) => console.warn(`[CharList] request ${reason} falhou:`, e));
        return Boolean(p);
    }

    _clearCharacterListRetries() {
        for (const t of this._charListRetryTimers || []) clearTimeout(t);
        this._charListRetryTimers = [];
    }

    _scheduleCharacterListRetries() {
        this._clearCharacterListRetries();
        for (const [i, delay] of [1500, 4000, 8500].entries()) {
            const t = setTimeout(() => {
                if (this._charListReceived || this.scenes?.currentName !== 'char-select') return;
                this._requestCharacterList(`char-select-retry-${i + 1}`);
            }, delay);
            this._charListRetryTimers.push(t);
        }
    }

    async _waitForCharacterListHidden(timeoutMs = 1000) {
        if (this._charListReceived) return true;
        return await new Promise((resolve) => {
            let settled = false;
            const finish = (ok) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this._charListWaiters?.delete?.(finish);
                resolve(Boolean(ok || this._charListReceived));
            };
            const timer = setTimeout(() => finish(false), Math.max(0, timeoutMs | 0));
            this._charListWaiters?.add?.(finish);
            // Resolve sincronamente caso a resposta tenha chegado entre o
            // primeiro check e a inscrição do waiter.
            if (this._charListReceived) finish(true);
        });
    }

    _characterPreviewRows() {
        return (this._realChars || []).map(mapRealCharacter)
            .filter((c) => c.classId >= 0)
            .map((c) => ({
                name: c.name, classId: c.classId, slot: c.slot,
                charset: c.charset, equipment: c.equipment,
                customPreview: this.serverCustomPreview?.getByName?.(c.name) || null,
            }));
    }

    async _prepareCharacterSelectAfterLogin(accountId) {
        // R46 physical recovery: the old path published CharSelect first and
        // only then started World75 + five BMD previews. The real Windows trace
        // showed exactly that ordering, exposing World95 / giant grass / empty
        // stage for multiple frames. Keep the existing real LoadingScene opaque
        // until World75, Object75 and available real previews are ready.
        const epoch = ++this._charPreviewSetupEpoch;
        this._preparingCharSelect = true;
        try {
            await this._gotoScene('loading', {
                title: 'Carregando personagens...',
                subtitle: 'Preparando Character Scene real...',
            }, { fadeMs: 0 });
            if (epoch !== this._charPreviewSetupEpoch) return false;

            this.scene?.applyCharacterSceneCamera?.();
            await this.scene?.loadCharacterWorld?.();
            const worldReady = await this.scene?.waitCharacterWorldReady?.(8000);
            if (!worldReady || epoch !== this._charPreviewSetupEpoch) {
                throw new Error('World75/Object75 não ficou pronto dentro do barrier de Character Select');
            }

            // A request F3:00 já foi enviada pelo login-result. Aguarde apenas
            // enquanto a LoadingScene cobre a troca; resposta real encerra cedo.
            await this._waitForCharacterListHidden(1200);
            if (epoch !== this._charPreviewSetupEpoch) return false;

            this.charPreview?.dispose();
            const preview = new CharacterPreview(this.scene);
            this.charPreview = preview;
            await preview.setChars(this._characterPreviewRows());
            if (epoch !== this._charPreviewSetupEpoch) {
                preview.dispose();
                if (this.charPreview === preview) this.charPreview = null;
                return false;
            }

            // Compila shaders do palco/personagens ainda sob a tela real de
            // loading. Não cria renderer/context extra.
            const warm = await this.scene?.warmupCurrentScene?.();
            console.info(`[PERF] char-select GPU warmup: ${Math.round(warm?.ms || 0)}ms mode=${warm?.mode || 'none'}`);

            const mapped = (this._realChars || []).map(mapRealCharacter);
            await this._gotoScene('char-select', {
                accountId,
                chars: mapped,
                maxCharacter: this._maxCharacters || 5,
                listReceived: this._charListReceived,
            }, { fadeMs: 0 });

            // R48.1 handoff recovery: F3:00 pode chegar enquanto SceneManager
            // mantém current=null durante mount/show do World75. Reaplique o
            // snapshot autoritativo MAIS RECENTE na instância exata publicada;
            // não faz polling, não cria chars e distingue lista vazia de ausência.
            if (epoch === this._charPreviewSetupEpoch && this.scenes?.currentName === 'char-select') {
                const published = this.scenes.current;
                if (this._charListReceived && published?.setChars) {
                    published.setChars((this._realChars || []).map(mapRealCharacter), this._maxCharacters || 5);
                }
            }
            if (epoch !== this._charPreviewSetupEpoch || this.scenes?.currentName !== 'char-select') return false;

            this.scene?.applyCharacterSceneCamera?.();
            // R77: no hardcoded World1 prefetch. F3:00 has no map field in this
            // protocol layout, so wait for an authoritative map instead of warming
            // the wrong world and stalling Character Select.
            if (!this._charListReceived) this._scheduleCharacterListRetries();
            console.info('[CharSelect] R48 atomic reveal: World75/Object75 + preview owner prontos antes da UI.');
            return true;
        } catch (e) {
            console.error('[CharSelect] preparação atômica falhou:', e);
            // Fail closed visual: não revelar a antiga World95 como se fosse a
            // Character Scene. Mantém LoadingScene e permite retry manual/rede.
            if (!this._charListReceived) this._scheduleCharacterListRetries();
            return false;
        } finally {
            if (epoch === this._charPreviewSetupEpoch) this._preparingCharSelect = false;
        }
    }

    _onLogin(accountId, server = null) {
        if (this._loggedIn) return; // LoginScene emite 'login' e 'join-server';
        this._loggedIn = true;      // evitar transição dupla
        this.accountId = accountId;
        Sound.uiSuccess();
        if (server) this.chatInfo(`Conectando ao servidor ${server.name}...`);
        // R46: não publique CharSelect vazio sobre World95. O barrier prepara
        // World75/Object75 + previews reais sob LoadingScene e só então revela.
        this._prepareCharacterSelectAfterLogin(accountId)
            .catch((e) => console.error('[CharSelect] preparação falhou:', e));
    }

    /**
     * Preview 3D real na cena de personagens (CreateCharacterScene):
     * World74 real + modelos compostos (Player.bmd + peças da classe)
     * atrás da UI transparente do CharSelectScene.
     */
    async _setupCharPreview() {
        const epoch = ++this._charPreviewSetupEpoch;
        try {
            if (!this.scene || this.scenes?.currentName !== 'char-select') return;

            // WorldActive lógico 74 usa assets World75/Object75. loadCharacterWorld
            // apenas dispara/junta o owner; quem publica preview precisa aguardar
            // o commit de terrain+Object75 de verdade.
            await this.scene.loadCharacterWorld?.();
            const worldReady = await this.scene.waitCharacterWorldReady?.(8000);
            if (!worldReady) throw new Error('World75/Object75 não ficou pronto para CharacterPreview');

            // Se outra transição/setup começou, este trabalho está obsoleto.
            if (epoch !== this._charPreviewSetupEpoch
                || this.scenes?.currentName !== 'char-select') return;

            this.charPreview?.dispose();
            const preview = new CharacterPreview(this.scene);
            this.charPreview = preview;

            // CRÍTICO: ler a lista MAIS RECENTE DEPOIS do await. R11 capturava
            // um snapshot antigo (frequentemente vazio); a UI textual recebia
            // os chars enquanto World75 carregava, mas o preview 3D terminava
            // com zero personagens.
            await preview.setChars(this._characterPreviewRows());

            // O carregamento dos BMD também é assíncrono. Não deixar modelos
            // de uma scene abandonada vazarem para a próxima scene.
            if (epoch !== this._charPreviewSetupEpoch
                || this.scenes?.currentName !== 'char-select') {
                preview.dispose();
                if (this.charPreview === preview) this.charPreview = null;
            }
        } catch (e) {
            if (epoch === this._charPreviewSetupEpoch) {
                console.warn('[CharPreview] setup:', e);
            }
        }
    }


    /**
     * R20 Character Create 3D real.
     * Reuses the authoritative World75 Character Scene and swaps the list preview
     * for one real class composition. No local character/protocol entity is
     * created: this is render-only until F3:01 confirms creation.
     */
    async _enterCharacterCreate() {
        // Invalidate a CharSelect setup that may still be resolving in background.
        this._charPreviewSetupEpoch++;
        await this._gotoScene('char-create', {
            accountId: this.accountId,
            // CharacterCard real (ReceiveCharacterCard_New 0xDE): classes
            // habilitadas pelo servidor p/ criação.
            cardEnable: this._charCardEnable || null,
        });
        if (this.scenes?.currentName !== 'char-create') return false;
        this.scene?.applyCharacterSceneCamera?.();

        // CharSelect normally already owns CharacterPreview. If it did not finish,
        // create the same real owner now. World75 loading is idempotent/background.
        if (!this.charPreview) {
            await this.scene?.loadCharacterWorld?.();
            const worldReady = await this.scene?.waitCharacterWorldReady?.(8000);
            if (!worldReady || this.scenes?.currentName !== 'char-create') return false;
            this.charPreview = new CharacterPreview(this.scene);
        }
        const classId = this.scenes?.current?.getSelectedClassId?.()
            ?? this.scenes?.current?.selected?.id ?? 1;
        return this._setCreatePreviewClass(classId);
    }

    async _setCreatePreviewClass(classId) {
        if (this.scenes?.currentName !== 'char-create') return false;
        const preview = this.charPreview || new CharacterPreview(this.scene);
        if (!this.charPreview) this.charPreview = preview;
        try {
            const ok = await preview.setCreateClass(Number(classId));
            // Late BMD/decode result must never publish into another scene.
            if (this.scenes?.currentName !== 'char-create') return false;
            return ok;
        } catch (e) {
            console.warn(`[CharCreatePreview] class ${classId}: ${e.message} — sem placeholder`);
            return false;
        }
    }

    async _returnToCharacterSelectFromCreate(reason = 'return') {
        this._charPreviewSetupEpoch++;
        // Preserve the latest authoritative F3:00 list in the UI immediately;
        // do not show an empty Web-only list while waiting for another packet.
        const mapped = (this._realChars || []).map(mapRealCharacter);
        await this._gotoScene('char-select', {
            accountId: this.accountId,
            chars: mapped,
            maxCharacter: this._maxCharacters || 5,
            listReceived: this._charListReceived,
        });
        if (this.scenes?.currentName !== 'char-select') return false;
        this.scene?.applyCharacterSceneCamera?.();
        await this._setupCharPreview();
        if (!this._charListReceived) this._scheduleCharacterListRetries();
        console.info(`[CharCreate] retorno -> char-select (${reason})`);
        return true;
    }

    _onCharCreated(data) {
        // SendRequestCreateCharacter (wsclientinline.h:318-328): C1 F3 01
        // [name 10B nullpad][byte ((Class<<4)+Skin)] — pedido REAL ao GS
        // (RealMUProtocol.requestCreateCharacter). Antes: salvava no
        // localStorage e fingia sucesso (botão sem protocolo = NÃO portado).
        // Agora: envia e aguarda a resposta F3 01 (onCharacterCreate no
        // handleMUPacket), como o CharMakeWin do PC (que só fecha no Result).
        const scene = this.scenes?.current;
        if (this.muProtocol && this.muProtocol.inGameLane() && this.muProtocol.isConnected) {
            this.muProtocol.requestCreateCharacter(data.name, data.classId, 0)
                .catch((e) => {
                    console.warn('[MU] create send falhou:', e);
                    scene?.showError?.('Falha ao enviar criação: ' + e.message);
                });
            scene?.setPending?.(true); // CharMakeWin aberto até Result (PC)
            return;
        }
        // Sem GameServer: erro explícito — nunca fingir criação (política 0 fake)
        scene?.showError?.('Sem conexão com o GameServer — não é possível criar.');
    }

    // ---------------------------------------------------------------
    // Entrada no mundo 3D
    // ---------------------------------------------------------------
    async _enterWorld(charData) {
        this._charPreviewSetupEpoch++;
        this.charPreview?.dispose();
        this.charPreview = null;
        try { this._worldPrefetchAbort?.abort?.(); } catch (_) {}
        this._worldPrefetchAbort = null;
        this._worldPrefetchTarget = null;
        this._reportProgress(75, 'Entrando no mundo...');
        const knownMap = Number.isInteger(charData?.map) ? charData.map : null;
        const knownDesc = knownMap == null ? null : getPcWorldDescriptor(knownMap);
        // LoadingScene invokes onDone after its own first frame. SceneManager only
        // awaits the LoadingScene mount, not that async callback. Bridge the real
        // _buildWorld Promise here so the enter latch/lifecycle cannot complete
        // early while the logo is still the current scene.
        let settleBuild, rejectBuild;
        const buildDone = new Promise((resolve, reject) => { settleBuild = resolve; rejectBuild = reject; });
        let started = false;
        await this._gotoScene('loading', {
            mapName: knownDesc?.name || 'Aguardando mapa do servidor...',
            duration: 0,
            onDone: () => {
                if (started) return buildDone;
                started = true;
                const job = Promise.resolve().then(() => this._buildWorld(charData));
                job.then(settleBuild, rejectBuild);
                return job;
            }
        }, { fadeMs: 0 });
        await buildDone;
    }

    async _waitForJoinMapHidden(timeoutMs = 1800) {
        if (Number.isInteger(this._pendingJoinMapServer?.map)) return this._pendingJoinMapServer;
        return await new Promise((resolve) => {
            let settled=false;
            const finish=(msg=null)=>{if(settled)return;settled=true;clearTimeout(timer);this._joinMapWaiters?.delete?.(finish);resolve(msg);};
            const timer=setTimeout(()=>finish(this._pendingJoinMapServer || null),Math.max(0,timeoutMs|0));
            this._joinMapWaiters?.add?.(finish);
            if (Number.isInteger(this._pendingJoinMapServer?.map)) finish(this._pendingJoinMapServer);
        });
    }

    // R77 target-aware prefetch. It warms only the exact server-map -> WorldN
    // selected by B101 MapManager::LoadWorld, never a guessed/hardcoded World1.
    _startWorldPrefetch(serverMap, { allowLoading = false, priority = 'idle' } = {}) {
        const d=getPcWorldDescriptor(serverMap);
        if(!d)return;
        const target=JSON.stringify([RemoteAssets.baseUrl,MUAssets._bmdEpoch,d.assetWorld]);
        const completed=this._worldPrefetchCompleted ??= new Set();
        if(completed.has(target))return;
        const movePriority=priority==='move';
        const priorityRank=movePriority?2:1;
        if(this._worldPrefetchTarget===target && (this._worldPrefetchPriorityRank||0)>=priorityRank)return;
        try{this._worldPrefetchAbort?.abort?.();}catch(_){}
        const ctrl=new AbortController();
        this._worldPrefetchAbort=ctrl;
        this._worldPrefetchTarget=target;
        this._worldPrefetchPriorityRank=priorityRank;
        // Hover/focus on an authored MoveCustom destination is an explicit user
        // intent. Start immediately and use modest parallelism; background char
        // select prefetch retains its deliberately idle cadence.
        setTimeout(()=>{
            if(ctrl.signal.aborted)return;
            const sceneName=this.scenes?.currentName;
            if(sceneName!=='char-select' && sceneName!=='world' && !(allowLoading && sceneName==='loading')){
                if(this._worldPrefetchAbort===ctrl)this._worldPrefetchTarget=null;
                return;
            }
            this._worldPrefetchJob=Promise.all([
                prefetchWorldTerrainCore(d.assetWorld,{signal:ctrl.signal}),
                prefetchWorldTerrainObjects(d.assetWorld,{
                    concurrency:movePriority?3:1, signal:ctrl.signal, yieldBetween:true,
                    idleTimeout:movePriority?4:80, warmTextures:false,
                }),
            ]).then(([terrain,objects])=>{
                const current=JSON.stringify([RemoteAssets.baseUrl,MUAssets._bmdEpoch,d.assetWorld]);
                if(!ctrl.signal.aborted && current===target && !terrain.aborted && !objects.aborted && terrain.warmed===terrain.total && terrain.total>0 && objects.warmed===objects.total && objects.total>0){
                    completed.add(target);
                    if(completed.size>16)completed.delete(completed.values().next().value);
                }
                console.info(`[PERF] prefetch[${movePriority?'move':'idle'}] map=${d.serverMap} ${d.name} -> World${d.assetWorld}: terrain=${terrain.warmed}/${terrain.total}, BMD=${objects.warmed}/${objects.total}${objects.aborted?' [ABORTED]':''}`);
            }).catch(()=>{}).finally(()=>{
                // Partial/aborted attempts are retryable; only complete owners memoize.
                if(this._worldPrefetchAbort===ctrl)this._worldPrefetchTarget=null;
            });
        },movePriority?0:80);
    }

    async _buildWorld(charData) {
        this._reportProgress(80, 'Construindo mundo 3D...');
        // Keep state=loading until SceneManager publishes the real world scene.
        // Packet handlers already buffer 0x12/0x13 while not in world and this
        // function flushes those buffers after the hero/managers exist.
        const _tWorld0 = performance.now();
        let _tMapMs = -1;
        const _worldPhases = {};
        let _tPhase = _tWorld0;
        const _markWorldPhase = (name) => {
            const now = performance.now();
            _worldPhases[name] = now - _tPhase;
            _tPhase = now;
        };

        // Reusa a cena 3D criada no boot (não cria um segundo renderer)
        this.effects = new EffectManager(this.scene.scene);
        // MapManager fica somente como autoridade de METADADOS nesta lane.
        // Terrain/objects/NPCs/monstros sintéticos foram removidos do caminho
        // crítico: o visual vem de Scene.loadRealMap e entidades do servidor.
        this.mapManager = new MapManager(this.scene.scene, this.scene);
        this._reportProgress(82, 'Preparando metadados do mapa...');
        // F3:00 character list has no map in this wire layout. The old Web
        // silently defaulted to Lorencia and could render the wrong world before
        // F3:03 arrived. Wait briefly behind LoadingScene for the authoritative
        // initial map; only fall back to an explicit charData.map if one exists.
        const join = Number.isInteger(this._pendingJoinMapServer?.map)
            ? this._pendingJoinMapServer
            : await this._waitForJoinMapHidden(1800);
        const serverMap = Number.isInteger(join?.map) ? join.map
            : (Number.isInteger(charData?.map) ? charData.map : null);
        if (serverMap == null) throw new Error('F3:03 não informou o mapa autoritativo de entrada; world load cancelado para não renderizar Lorencia por chute');
        const worldDesc = getPcWorldDescriptor(serverMap);
        if (!worldDesc) throw new Error(`server map inválido: ${serverMap}`);
        this._startWorldPrefetch(serverMap,{allowLoading:true});
        await this.mapManager.loadMap(worldDesc.serverMap);
        _markWorldPhase('metadata');
        this._reportProgress(85, `${worldDesc.name}: metadados prontos`);

        // B101 MapManager::LoadWorld authority. Most maps are WorldActive+1,
        // but Blood/Chaos/Hellas/CursedTemple share asset worlds and map32
        // redirects to Devil Square. Never use ad-hoc `map + 1` here.
        const realMapIndex = worldDesc.assetWorld;
        this.scene._reportWorldStatus = (msg) => {
            this._reportProgress(null, msg);
            this.chatInfo?.(msg);
        };
        try {
            // Login/CharacterScene remain cooperative. MAIN_SCENE is behind the
            // loading screen, so remove deliberate 16ms-per-batch sleeps and
            // finish real BMD owners instead of revealing holes.
            const worldLoadOptions = { objectBudgetMs: 750, cooperativeObjects: false };
            const _tMap0 = performance.now();
            const applied = await this.scene.loadRealMap(realMapIndex, worldLoadOptions);
            _tMapMs = performance.now() - _tMap0;
            if (applied && this.scene.attGrid) {
                const curMap = this.mapManager.getCurrentMap();
                if (curMap) {
                    curMap.pathGrid = this.scene.attGrid; // walls reais (TW flags)
                }
            }
            if (!applied) {
                throw new Error(`World${realMapIndex} real não pôde ser aplicado`);
            }
        } catch (e) {
            // Fail-closed visual: NÃO gerar terreno/props procedurais para mascarar
            // falha do mapa real. O gate permanece FAIL e o erro fica explícito.
            console.error('[World] mapa real FALHOU (sem fallback procedural):', e);
            this.chatInfo?.('Falha ao carregar o mapa real: ' + (e.message || e));
        }
        _markWorldPhase('realMap');

        // Personagem do jogador (Character espera { classId: 0-6 — Classes DK=0,
        // DW=1, ELF=2... }). normalizeChar devolve o enum PC COMPLETO (0-17,
        // evoluções incluídas — o físico trouxe 25 p/ MagoX e "aprendeu 0
        // skills"); clientClassToLocalBase reduz à base local correta.
        this.playerChar = new Character({
            name: charData.name,
            classId: clientClassToLocalBase(charData.classId ?? 0),
            level: charData.level || 1,
            points: charData.levelUpPoint ?? charData.points ?? 0
        });
        // CharSet REAL do F3:00 (18B: [classByte, ...Equipment×17]) — fonte
        // de equipamento para o spawn tardio via 0x12 (_applyPlayerViewport).
        this.playerChar.charset = charData.charset || null;
        this.playerChar.visualClassId = Number.isInteger(charData.classId) ? charData.classId : 0;
        if (Array.isArray(charData.charset) && Number.isInteger(charData.charset[0])) this.playerChar.classByte = charData.charset[0];
        this.playerChar.buffContainer = new BuffContainer(this.playerChar);
        this._reportProgress(88, 'Personagem criado');

        // Herói REAL: BMD composto via PlayerComposer (esqueleto
        // Player.bmd + peças da classe) → scene.mainObject. Fail-closed: sem
        // composição o mundo entra SEM herói visível e registra erro — nunca
        // cápsula/placeholder (política 0 simulação). A POSIÇÃO vem do 0x12
        // CREATE_PLAYER do servidor (aplicado pelo onPlayerViewport) — sem
        // 0x12 o herói permanece onde o servidor mandar; nunca spawn fake.
        try {
            // R12.5 (P3): passar o CharSet REAL do F3:00 — sem ele o pipeline
            // de equipamento em Scene.attachPlayerCharacter ficava morto
            // (opts.charset nunca preenchido: armas/asas nunca anexavam
            // no mundo; o preview 3D já recebia via setChars).
            await this.scene.attachPlayerCharacter(charData.classId ?? 0, null, { charset: charData.charset });
            this.playerChar.mesh = this.scene.mainObject;
            // SafeZone/SetPlayerWalk must read the same logical/predicted hero
            // position that movement owns, not the outer mesh from the prior
            // render frame. This removes one-frame border pose flips/sliding.
            this.scene._playerLogicalPosition = this.playerChar.position;
            // Sync por frame: mesh ← position/rotation do playerChar
            // (Scene.update 'game' chama este callback antes do mixer)
            this.scene._playerSync = (mesh) => {
                mesh.position.copy(this.playerChar.position);
                mesh.rotation.y = this.playerChar.rotation.y;
            };
            this._reportProgress(88, 'Herói BMD real composto');
        } catch (e) {
            console.warn('[World] herói BMD indisponível (sem placeholder):', e.message);
            this.chatInfo('Modelo do personagem indisponível (classe sem peças BMD v12).');
        }
        _markWorldPhase('hero');

        // Monstros
        this.monsters = new MonsterManager(this.scene.scene, {
            areaSize: this.mapManager.getCurrentMap().size || 100,
            areaCenter: this.mapManager.getCurrentMap().center,
            playerAvoidRadius: 15
        });
        this._reportProgress(90, 'Aguardando viewport de monstros do servidor...');
        // ZERO simulação: não criar 20 monstros locais. O primeiro 0x13/BOTH
        // CREATE_MONSTER recebido do GameServer é a autoridade do viewport.
        this.monsters.setTerrainHeight((x, z) =>
            (this.scene?.heights ? this.scene.terrainHeightAt(x, z) : 0));
        this.monsters.setTerrainLight((x, z, target) => this.scene?.terrainLightAt?.(x, z, target) || null);
        this.monsters.onMonsterDeath = (m, killer) => this._onMonsterKilled(m);
        this.monsters.onMonsterAttack = (m, target, result) => {
            if (result && result.dealt > 0) this._onPlayerHurt(result.dealt);
        };

        // R12.5: outros jogadores do 0x12 (co-players reais do servidor).
        // OBRIGATÓRIO criar ANTES do flush _pendingPlayerViewport abaixo:
        // _applyPlayerViewport chama this.playerViewport?.spawnFromServer()
        // (fail-closed silencioso via optional-chain) — se o manager ainda não
        // existia, TODOS os co-players bufferizados eram descartados sem log
        // (bug de ordem descoberto no console físico pós-F5 R12.5).
        if (!this.playerViewport) {
            this.playerViewport = new PlayerViewportManager(this.scene);
        }

        // 0x12 CREATE_PLAYER buffered ANTES do world: aplica o spawn REAL do
        // servidor agora que playerChar/scene/monsters existem (o handler
        // onPlayerViewport guardou em _pendingPlayerViewport)
        if (this._pendingPlayerViewport?.length) {
            const pending = this._pendingPlayerViewport;
            this._pendingPlayerViewport = null;
            this._applyPlayerViewport(pending);
        }

        // 0x13 CREATE_MONSTER buffered ANTES do world (padrão do 0x12 acima):
        // a leva inicial do servidor chega durante o loading — flush aqui,
        // quando MonsterManager existe. spawnFromServer faz clearClientSide
        // na 1ª leva (servidor autoritativo, 0 simulação).
        if (this._pendingMonsterViewport?.length) {
            const pendingM = this._pendingMonsterViewport;
            this._pendingMonsterViewport = null;
            const created = this.monsters.spawnFromServer(pendingM);
            if (created > 0) {
                this.chatInfo(`${created} actor(es) do servidor entraram no viewport.`);
            }
        }

        // 0x1C pode chegar durante o loading. Reaplica somente quando player/map
        // reais já existem; generation fencing dentro do handler descarta resultado
        // assíncrono obsoleto se outro teleport chegar no meio do load.
        if (this._pendingServerTeleport) {
            const pendingT = this._pendingServerTeleport;
            this._pendingServerTeleport = null;
            void this._handleServerTeleport(pendingT);
        }

        // Pet/helper: sistema preparado, porém NÃO invoca Dark Raven fake.
        // O visual só deve nascer de equipamento/viewport autoritativo do servidor.
        this.pets = new PetSystem(this.scene.scene);
        // Rider ride-state (junction fenrir): PetSystem aplica as actions
        // PLAYER_FENRIR_* no renderer do herói enquanto montado — setter
        // fail-closed (null = ride-state no-op).
        this.pets.setHeroRenderer(this.scene._playerRenderer || null);
        // O 0x12 pode ter anexado o herói enquanto `this.pets` ainda era null.
        // Reaplica os markers autoritativos já decodificados do CharSet agora
        // que o PetSystem existe (R24 fecha esse race sem pet fake).
        try {
            await this._syncHeroPetCompanions({ announce: false });
        } catch (e) {
            // Companion/accessory assets are not allowed to abort the entire real
            // hero/world handoff. The owner remains fail-closed (no fake pet).
            console.warn('[World] sync de helper/pet falhou; mundo continua sem placeholder:', e?.message || e);
        }
        // R12.5: outros jogadores do 0x12 (co-players reais do servidor).
        // Manager DEVE existir antes do flush pré-world (ver bloco 0x12 acima).
        if (!this.playerViewport) {
            this.playerViewport = new PlayerViewportManager(this.scene);
        }
        // Pré-carga das texturas de VFX reais (Effect/Flare.OZJ +
        // Magic_Ground2.OZJ + blood01) — fail-closed silencioso.
        try { preloadLevelUpTextures().catch(() => {}); } catch { /* noop */ }
        this._reportProgress(92, 'Sistema de pets pronto (aguardando estado real)');

        // Sistemas de jogo: drops, quests, efeitos, floating text
        this.drops = new DropManager(this.scene.scene, {
            inventory: null, // wire depois que Inventory carregar
            pickupRadius: 1.5 * TERRAIN_CELL // offline/harness legacy only
        });

        // R18: 0x20/0x21/0x22 agora têm owner visual real. O layer carrega o
        // BMD da tabela PC, usa tile/altura autoritativos e nunca fabrica
        // cube/ring/sprite. Loads assíncronos são fenced por runtimeSerial.
        this.groundItemLayer?.dispose?.();
        this.groundItemLayer = new GroundItemLayer({
            gameScene: this.scene,
            state: this.groundItems,
            requestPickup: (key) => this.requestGroundItemPickup(key),
            customFloorRules: this._customItemFloorRules,
        });
        void this.groundItemLayer.sync(); // também materializa 0x20 buffered pré-world

        this.quests = new QuestManager();
        this.floating = new FloatingText(this.scene.camera.threeCamera);
        this.skillFx = new SkillEffects(this.scene.scene, this.floating);
        this._reportProgress(94, 'Sistemas de jogo criados');

        // Buff bar + auras
        this.buffBar = new BuffBar(this.playerChar.buffContainer);
        this._buffFxHandle = attachBuffEffects(
            this.playerChar.buffContainer, this.scene.scene, this.effects,
            () => this.playerChar.position
        );
        this._reportProgress(96, 'UI de buffs pronta');

        // Monstros vindos do GameServer são autoritativos: morte local nunca
        // fabrica drop/EXP/quest. Owners locais continuam apenas para entidades
        // explicitamente não-serverDriven usadas por harnesses/offline.
        this.monsters.onMonsterDeath = (m, killer) => {
            if (m?.serverDriven) return;
            this.drops.handleMonsterDeath(m);
            this.quests?.onKill?.(m.type?.name || m.name, 1);
            this._onMonsterKilled(m);
        };

        // Quest events
        this.quests.on('complete', (q) => {
            this.chatInfo(`Quest completa: ${q.name}!`);
            Sound.uiSuccess();
        });
        this.quests.on('progress', (q) => {
            this.chatInfo(`${q.name}: ${q.objectives.filter(o=>o.current>=o.count).length}/${q.objectives.length}`);
        });
        // Não auto-injetar quests locais. Quests só devem aparecer quando a
        // porta autoritativa de NPC/protocolo estiver ligada.

        // MuHelper (auto-caça)
        try {
            // Connected GS lane: auto-pickup usa somente os keys de
            // ServerGroundItems. O DropManager local fica restrito a harness/offline.
            const pickupOwner = {
                pickupNear: (pos, range) => {
                    if (this.muProtocol?.isConnected && this.muProtocol?.inGameLane?.()) {
                        return this.groundItemLayer?.pickupNear?.(pos, range) ?? false;
                    }
                    return this.drops?.pickupNear?.(pos, range) ?? false;
                }
            };
            MuHelper.init({
                monsterManager: this.monsters,
                player: this.playerChar,
                skillBar: this.skillBar,
                pickup: pickupOwner
            });
        } catch (e) { console.warn('[MuHelper]', e); }

        // O attach inicial em spawn usa CharSet REAL (F3:00/0x12) via
        // Scene.attachPlayerCharacter → buildEquipmentAttach (body parts,
        // wing/helper/weapons como owners reais). R73 also consumes the
        // authoritative F3:13 full equipment snapshot for the hero and the
        // desktop 0x25 incremental CHANGE_CHARACTER packet for viewport peers;
        // no inventory-local synthetic appearance is published.
        // CharSet sync REAL de wings/helper/weapons do herói.
        // Key = CharSet[18] inteiro; mudou (inventário real) → re-attach com o
        // pipeline bone-parented (Scene.attachPlayerCharacter opts.charset).
        // FIX55: the custom Main uses F3:72 for the post-CharSet custom wing,
        // but the local equipment container (slot 7) is also authoritative for
        // the actual equipped item. Some GS builds update 0x24/F3:13 before the
        // next F3:72 snapshot; without this bridge the CharSet has no way to
        // encode a custom WING+index and the hero appears wingless. Only an
        // exact CustomWings.lua-owned group-12 item may override wingIndex.
        this._effectiveHeroCustomPreview = () => {
            const base = this.serverCustomPreview?.get?.(this._heroServerKey) || this.serverCustomPreview?.getByName?.(this.playerChar?.name) || null;
            const equipped = this.serverInventory?.getDisplayItem?.(7) || null;
            const itemType = Number(equipped?.itemType ?? equipped?.type);
            const owner = Number.isInteger(itemType) ? customItemModelForType(itemType) : null;
            const isCustomWing = Number.isInteger(itemType) && Math.floor(itemType / 512) === 12 && owner?.customWing === true;
            if (isCustomWing) {
                const wingIndex = itemType % 512;
                return Object.freeze({ ...(base || {}), wingIndex, muLocalEquipmentWingOwner:true });
            }
            // A real empty/local stock wing slot must not keep a stale custom
            // F3:72 wing latched on the hero. Stock wings remain CharSet-owned.
            if (!equipped && Number(base?.wingIndex || 0) > 0) {
                return Object.freeze({ ...(base || {}), wingIndex:0, muLocalEquipmentWingOwner:true });
            }
            return base;
        };

        this._syncWings = () => {
            const cs = this.playerChar?.charset;
            if (!this.scene?.mainObject || !Array.isArray(cs) || cs.length < 18) return Promise.resolve(false);
            const preview = this._effectiveHeroCustomPreview?.() || null;
            const key = `${cs.join(',')}|previewWing=${Number(preview?.wingIndex || 0)}|previewPet=${Number(preview?.petIndex || 0)}|previewSecondPet=${Number(preview?.secondPetIndex || 0)}|previewElement=${Number(preview?.element?.[0] || 0)}:${Number(preview?.element?.[1] || 0)}`;
            if (this._heroEquipKey === undefined) {
                this._heroEquipKey = key;
                this._heroEquipCharset = cs.slice();
                this._heroEquipVisualGeneration = 0;
                return Promise.resolve(true);
            }

            // Every authoritative F3:13 snapshot supersedes an older staged
            // visual build. ServerInventory/0x24 calls may also reach here, but
            // because they do not mutate CharSet they simply coalesce to the
            // current authoritative key.
            const generation = (this._heroEquipVisualGeneration || 0) + 1;
            this._heroEquipVisualGeneration = generation;
            this._heroEquipPending = {
                generation,
                key,
                charset: cs.slice(),
                visualClassId: this.playerChar.visualClassId ?? serverClassToClientClass(this.playerChar.classByte ?? cs[0] ?? 0),
            };

            if (key === this._heroEquipKey && !this._heroEquipRebuild && this.scene.hasCompletePlayerVisual?.() !== false) {
                this._heroEquipPending = null;
                return Promise.resolve(true);
            }
            if (this._heroEquipSyncPromise) return this._heroEquipSyncPromise;

            // Coalesce packet/UI notifications that land in the same browser
            // frame. R80 could launch 753ms + 270ms + 200ms rebuilds for a
            // short F3:13 burst; R81 builds only the newest snapshot and keeps
            // the previous complete hero visible while BMD/textures resolve.
            const frameBarrier = () => new Promise((resolve) => {
                if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
                else queueMicrotask(resolve);
            });

            this._heroEquipSyncPromise = (async () => {
                await frameBarrier();
                this._heroEquipRebuild = true;
                try {
                    while (this._heroEquipPending) {
                        const job = this._heroEquipPending;
                        this._heroEquipPending = null;
                        if (job.key === this._heroEquipKey && this.scene.hasCompletePlayerVisual?.() !== false) continue;
                        const pos = this.scene.mainObject?.position?.clone?.();
                        if (!pos) break;
                        try {
                            // Main 5.2 changes linked wing/helper/weapons around the
                            // existing Player skeleton when body pieces did not change.
                            // This avoids rebuilding Player.bmd for a simple inventory
                            // move and reuses unchanged linked renderers.
                            const fast = await this.scene.replacePlayerEquipmentAccessories?.(job.visualClassId, job.charset, {
                                customPreview: this._effectiveHeroCustomPreview?.() || null,
                                acceptPublish: () => job.generation === this._heroEquipVisualGeneration,
                            });
                            if (fast?.status === 'stale') continue;
                            let next = fast?.status === 'applied' ? fast.object : null;
                            if (!next) {
                                next = await this.scene.replacePlayerCharacter(job.visualClassId, [pos.x, pos.y, pos.z], {
                                    charset: job.charset,
                                    customPreview: this._effectiveHeroCustomPreview?.() || null,
                                    acceptPublish: () => job.generation === this._heroEquipVisualGeneration,
                                });
                            }
                            // null means a newer F3:13 arrived while this graph
                            // was loading; Scene discarded it before publication.
                            if (!next) continue;
                            if (job.generation !== this._heroEquipVisualGeneration) continue;
                            this.playerChar.mesh = next;
                            this._heroEquipKey = job.key;
                            this._heroEquipCharset = job.charset.slice();
                            this.pets?.setHeroRenderer?.(this.scene._playerRenderer || null);
                            await this._syncHeroPetCompanions({ announce: false });
                        } catch (e) {
                            console.warn('[World R83] staged reattach de equipamento falhou; graph anterior permaneceu ativo:', e.message);
                            if (this.scene.mainObject) this.playerChar.mesh = this.scene.mainObject;
                            // If a newer snapshot arrived, keep draining it. If
                            // not, the previous complete CharSet remains owner.
                        }
                    }
                    return true;
                } finally {
                    this._heroEquipRebuild = false;
                }
            })().finally(() => {
                this._heroEquipSyncPromise = null;
                // A packet can arrive in the tiny finally window; schedule one
                // more drain instead of losing the newest visual state.
                if (this._heroEquipPending && this._heroEquipPending.key !== this._heroEquipKey) {
                    queueMicrotask(() => this._syncWings?.());
                }
            });
            return this._heroEquipSyncPromise;
        };
        _markWorldPhase('gameplayCore');
        await this._buildGameUI(charData);
        _markWorldPhase('gameUI');

        // Sistemas sociais. R72 does NOT mount the old generic CommandWindow:
        // its hard-coded /post,/pkclear,/arena grid was not owned by the supplied
        // PC/Lua source. MoveCustom now has its real Lua owner; other command
        // surfaces remain fail-closed until their exact source owner is ported.
        try {
            this.chat = this.chat || new ChatSystem();
            this._ui.commandWin = null;
            this.party = new Party(this.playerChar.name);
            this._ui.partyWin = new PartyWindow(this.party, this.playerChar.name, { parent: this._gameUIViewport?.board || document.body });
            this.duels = new DuelSystem({ chat: this.chat, net: GameNet, self: this.playerChar });
            this.pk = new PKSystem({ chat: this.chat, net: GameNet });
        } catch (e) { console.warn('[social init]', e); }

        // Collision + Movement (WASD) + ClickToMove
        try {
            this.collisionWorld = new CollisionWorld(this.mapManager);
            // Altura/target usam somente o terrain real. Sem OZB, fail-closed em
            // Y=0 em vez de inventar sin/cos procedurais.
            Movement.setTerrainHeightFn((x, z) =>
                this.scene.heights ? this.scene.terrainHeightAt(x, z) : 0);
            Movement.setWalkableFn((x, z) => this.scene?.isWalkable?.(x, z) !== false);
            Movement.setCollisionWorld(this.collisionWorld);
            this._attachClickMovement();
        } catch (e) { console.warn('[move]', e); }

        // QuickHotkeys (teclas de UI)
        try {
            QuickHotkeys.install({
                windows: {},
                getPlayer: () => this.playerChar,
                getDrops: () => this.drops,
                chat: this.chat
            });
        } catch (e) { console.warn('[hotkeys]', e); }

        // Loop de HP baixo
        try {
            startHpLowLoop(() => this.playerChar ? this.playerChar.hp / this.playerChar.maxHP : 1);
        } catch (e) { console.warn('[HP loop]', e); }

        // Sons de jogo (hooks)
        try {
            this.quests.on('complete', () => { playQuestComplete(); });
            this.playerChar.onLevelUp ||= null;
        } catch (e) { /* noop */ }

        // Sistemas de progressão
        try {
            this.mastery = new MasterySystem();
            this.reseter = new ResetaCommand();
            // Comando /reset no chat
            if (this.chat) {
                const chatSendOriginal = this.chat.sendMessage.bind(this.chat);
                this.chat.sendMessage = (text) => {
                    if (text === '/reset') {
                        try {
                            const out = this.reseter.execute(this.playerChar);
                            this.chatInfo(out.message || 'Reset executado');
                            this._refreshStatsHud();
                        } catch (e) { this.chatInfo('Erro no reset: ' + e.message); }
                        return;
                    }
                    chatSendOriginal(text);
                };
            }
        } catch (e) { console.warn('[Mastery]', e); }

        // Clique para atacar / interagir
        this._bindWorldInput();

        // Evento mapa carregado
        this.mapManager.onTeleport = (mapId) => this._changeMap(mapId);

        // CRÍTICO R12: desmonta LoadingScene. No R11, _buildWorld terminava
        // sem trocar a scene DOM; a arte de loading ficava em z=10 cobrindo o
        // WebGL mesmo com HUD/chat/minimap já ativos.
        _markWorldPhase('postUISetup');

        // O budget de 750 ms em loadRealMap mantém a tela de loading viva, mas
        // antes o Web podia revelar o mundo enquanto Object1 ainda montava os
        // BMDs reais em background — exatamente os buracos/props tardios vistos
        // fisicamente. Hero/UI/network são montados em paralelo acima; neste
        // ponto fazemos um join final curto do MESMO owner real, sem placeholder.
        const _objectsReadyBeforeReveal = await this.scene.waitWorldObjectsReady?.(realMapIndex, 1500);
        _markWorldPhase('objectsFinalJoin');
        console.info(`[PERF] World${realMapIndex} object owner before reveal=${_objectsReadyBeforeReveal ? 'READY' : 'PROGRESSIVE'} (finalJoin<=1500ms)`);

        this._reportProgress(98, 'Preparando shaders do mundo...');
        const warm = await this.scene.warmupCurrentScene?.() || { ms: 0, mode: 'none' };
        _markWorldPhase('gpuWarmup');
        console.info(`[PERF] world GPU warmup: ${Math.round(warm.ms || 0)}ms mode=${warm.mode || 'none'}`);

        // R63: remove the R62 three-frame prime. Physical R62 evidence showed
        // it increased entry time without fixing the 799-call steady-state cost.
        // shader warmup above remains under LoadingScene; textures/VAOs are still
        // parallelized in MUModelRenderer instead of forcing duplicate full renders.
        _worldPhases.firstFramePrime = 0;

        await this._gotoScene('world', {}, { fadeMs: 0 });
        _markWorldPhase('sceneSwitch');
        this.chatInfo(`Bem-vindo a ${this.mapManager.getCurrentMap().name}, ${charData.name}!`);
        Sound.uiSuccess();
        this._reportProgress(100, 'Mundo pronto!');
        console.info(`[PERF] world-entry: loadRealMap(World${realMapIndex})=${Math.round(_tMapMs)}ms | _buildWorld total=${Math.round(performance.now() - _tWorld0)}ms`);
        console.info('[PERF] world-entry phases(ms): ' + Object.entries(_worldPhases)
            .map(([k, v]) => `${k}=${Math.round(v)}`).join(' | '));
    }

    _layoutCharacterInventoryWindows() {
        const inv = this._ui?.inventoryWin, chr = this._ui?.charWindow, storage = this._ui?.storageWin;
        if (!inv && !chr && !storage) return;
        // PC Main 5.2 / Widescreen.cpp owns these windows from the RIGHT edge
        // of the current render width, not from the center of a fixed 4:3 board:
        //   WidescreenPosX1 = JCWinWidth - 190
        //   WidescreenPosX2 = JCWinWidth - 380
        // The Web board is 800x600 only for retained art coordinates; widescreen
        // adds logical X beyond 800. Convert the actual visible viewport right
        // edge back into board coordinates so the windows stay in the PC corner.
        const board = this._gameUIViewport?.board || inv?.parent || chr?.parent;
        const rect = board?.getBoundingClientRect?.();
        const scale = Number(board?.dataset?.muScale) || (rect?.height ? rect.height / 600 : 1) || 1;
        const visibleRight = rect && scale > 0
            ? (window.innerWidth - rect.left) / scale
            : 800;
        const w = 190;
        const x1 = Math.max(0, visibleRight - w);
        const x2 = Math.max(0, x1 - w);
        const invVisible = Boolean(inv?.visible), chrVisible = Boolean(chr?.visible), storageVisible = Boolean(storage?.visible);
        // PC NewUISystem: storage owns X2 and forces inventory visible at X1.
        // C/I normal pairing keeps Character at X1 and Inventory at X2.
        if (storageVisible) {
            storage.setPosition(x2, 0);
            if (invVisible) inv.setPosition(x1, 0);
        } else if (invVisible && chrVisible) {
            inv.setPosition(x2, 0);
            chr.setPosition(x1, 0);
        } else if (invVisible) {
            inv.setPosition(x1, 0);
        } else if (chrVisible) {
            chr.setPosition(x1, 0);
        }
        if (this._engineDebugState) {
            this._engineDebugState.ui = { x1, x2, visibleRight, scale, invVisible, chrVisible, storageVisible };
        }
    }

    async _buildGameUI(charData) {
        // R36: generation token makes concurrent/re-entrant world UI builds single-owner.
        // A superseded build may finish network/cache awaits later, but it must never
        // publish its old board or continue mounting windows into a stale uiBoard.
        const uiBuildGeneration = (this._gameUIBuildGeneration || 0) + 1;
        this._gameUIBuildGeneration = uiBuildGeneration;
        // R15.12: the prewarm was started during boot but never joined here. That
        // left MainFrame/Chat owners racing their own decode on world entry,
        // causing late character/UI paint on slower browsers. Join the already-running
        // barrier before mounting owners; no protocol/renderer dependency is added.
        const prewarm = await this._uiGamePrewarmPromise?.catch(() => null);
        if (uiBuildGeneration !== this._gameUIBuildGeneration) return false;
        if (prewarm?.failed) console.warn(`[UI PC] prewarm incompleto ${prewarm.ok}/${prewarm.total}; owners faltantes permanecem fail-closed.`);
        // R36: world re-entry must retire the previous authored UI owners before
        // replacing their board. Removing only the parent DOM node left SkillBar's
        // window key listener alive and allowed pending owner decodes to commit into
        // detached roots. Destroy every old owner first; each owner already guards
        // async completion with _destroyed, so stale first-paint work cannot revive.
        this.hud?.destroy?.();
        this.skillBar?.destroy?.();
        // R44: unregister only the exact retiring hotkey owners before destroy.
        // A late teardown from an older generation must never delete the new owner.
        QuickHotkeys.unregisterWindow('inventory', this._ui?.inventoryWin || null);
        QuickHotkeys.unregisterWindow('character', this._ui?.charWindow || null);
        QuickHotkeys.unregisterWindow('mail', this._ui?.mailWin || null);
        QuickHotkeys.setChat(null);
        this.chat?.destroy?.();
        // R42/R43: every board-bound NewUI window retires with the old 800x600 board.
        this._ui?.inventoryWin?.destroy?.();
        this._ui?.charWindow?.destroy?.();
        this._ui?.storageWin?.destroy?.();
        this._ui?.npcShop?.destroy?.();
        this._ui?.mailWin?.destroy?.();
        this._ui?.moveCustomWin?.destroy?.();
        this._moveCustomInputLocked = false;
        if (this._ui) {
            this._ui.inventoryWin = null; this._ui.charWindow = null;
            this._ui.storageWin = null; this._ui.npcShop = null; this._ui.mailWin = null; this._ui.moveCustomWin = null;
        }
        this.hud = null;
        this.skillBar = null;
        this.chat = null;
        this._gameUIViewport?.dispose?.();
        this._gameUIViewport = null;
        this._gameUIRoot?.remove?.();
        this._gameUIRoot = document.createElement('div');
        this._gameUIRoot.id = 'mu-game-ui-viewport';
        this._gameUIRoot.dataset.muPcOwner = 'NewUI::800x600';
        this._gameUIRoot.style.cssText = 'position:fixed;inset:0;z-index:590;pointer-events:none;overflow:hidden;visibility:hidden;';
        document.body.appendChild(this._gameUIRoot);
        this._gameUIViewport = attachMuVirtualBoard(this._gameUIRoot);
        const uiBoard = this._gameUIViewport.board;

        // Barras de status
        this.hud = new StatusBars({ parent: uiBoard, autoReveal: false });
        this.hud.setStats({
            hp: this.playerChar.hp, maxHp: this.playerChar.maxHP,
            mp: this.playerChar.mp, maxMp: this.playerChar.maxMP,
            sd: this.playerChar.sd, maxSd: this.playerChar.maxSD,
            ag: this.playerChar.skillMana ?? this.playerChar.ag ?? 0,
            maxAg: this.playerChar.maxSkillMana ?? this.playerChar.maxAG ?? 1,
            level: this.playerChar.level,
            experience: this.playerChar.experience,
            nextExperience: this.playerChar.nextExperience
        });

        // Skill bar
        this.skillBar = new SkillBar({
            parent: uiBoard, autoReveal: false,
            getMp: () => this.playerChar ? this.playerChar.mp : 0,
            onUse: (skill, slot, context) => this._useSkill(slot, skill, context)
        });
        this._assignDefaultSkills();

        // R50: minimapa removido do owner de produção por requisito do cliente.
        // Nenhum placeholder/overlay substituto é montado. O módulo permanece
        // isolado na source apenas para histórico/testes, sem custo por frame.

        this.chat = new ChatSystem({
            parent: uiBoard, autoReveal: false,
            getLocalSender: () => this.playerChar?.name || '',
            onSend: (wireText) => {
                if (!this.muProtocol?.isConnected || !this.muProtocol?.inGameLane?.() || !this.playerChar?.name) return false;
                this.muProtocol.requestChat(this.playerChar.name, wireText)
                    .catch((e) => console.warn('[Chat] SendChat falhou:', e.message));
                return true;
            },
            onWhisper: (targetId, wireText) => {
                if (!this.muProtocol?.isConnected || !this.muProtocol?.inGameLane?.()) return false;
                this.muProtocol.requestWhisper(targetId, wireText)
                    .catch((e) => console.warn('[Chat] SendChatWhisper falhou:', e.message));
                return true;
            }
        });
        QuickHotkeys.setChat(this.chat);

        // Current-client Lua owner (MoveCustomInterface.lua). Geometry, labels,
        // destinations and 0xFA:48 wire come from the supplied encrypted Lua/Data;
        // if the owner cannot be decoded/parsed, no replacement window is shown.
        this._ui.moveCustomWin = new MoveCustomWindow({
            parent: uiBoard,
            canToggle: () => this.state === 'world' && ![
                this._ui?.inventoryWin, this._ui?.charWindow, this._ui?.storageWin,
                this._ui?.mailWin, this._ui?.commandWin,
            ].some((w) => w?.visible),
            onVisibilityChange: (open) => {
                this._moveCustomInputLocked = Boolean(open);
                if (open && this.playerChar) {
                    this.playerChar.targetPos = null;
                    this.playerChar.velocity?.set?.(0,0,0);
                }
            },
            onPrefetch: (serverMap) => this._startWorldPrefetch(serverMap, { priority:'move' }),
            onMove: async (move) => {
                if (!this.muProtocol?.isConnected || !this.muProtocol?.inGameLane?.()) return false;
                // MoveCustomInterfaceConfig.lua is the exact current-client
                // owner of mapNumber/cdX/cdY.  Never teleport locally: transmit
                // it byte-for-byte through FA:48 and wait for the authoritative
                // 0x1C returned by the GameServer.
                this._lastMoveCustomRequest = Object.freeze({
                    map: String(move?.map || ''),
                    destination: String(move?.destination || ''),
                    mapNumber: Number(move?.mapNumber),
                    cx: Number(move?.cx), cy: Number(move?.cy),
                    sentAt: Date.now(),
                });
                console.info(`[MoveCustom R83] TX ${this._lastMoveCustomRequest.map}/${this._lastMoveCustomRequest.destination} map=${this._lastMoveCustomRequest.mapNumber} tile=(${this._lastMoveCustomRequest.cx},${this._lastMoveCustomRequest.cy})`);
                await this.muProtocol.requestMoveCustom(move);
                return true;
            },
        });
        void this._ui.moveCustomWin.whenReady();

        const ownerReady = await Promise.all([
            this.hud.ready(), this.skillBar.ready(), this.chat.ready()
        ]);
        if (uiBuildGeneration !== this._gameUIBuildGeneration) return false;
        // R15.14: the previous atomic barrier still made the parent visible even
        // when one authored owner returned false. That exposed a partially-mounted
        // Web UI and contradicted the fail-closed contract. Publish the board only
        // after every required PC owner has decoded and mounted successfully.
        const allOwnersReady = ownerReady.every(Boolean);
        if (allOwnersReady) {
            this.hud.reveal(); this.skillBar.reveal(); this.chat.reveal();
            this._gameUIRoot.style.visibility = 'visible';
        } else {
            this._gameUIRoot.style.visibility = 'hidden';
            console.warn(`[UI PC] atomic first paint BLOQUEADO: owner real ausente MainFrame=${ownerReady[0]} SkillBar=${ownerReady[1]} Chat=${ownerReady[2]}`);
        }
        console.info(`[UI PC] atomic first paint: MainFrame=${ownerReady[0]} SkillBar=${ownerReady[1]} Chat=${ownerReady[2]} Minimap=REMOVED_R50 published=${allOwnersReady} scale=${this._gameUIViewport.board.dataset.muScale}`);

        // Janela de inventário (tecla I)
        import('../data/Inventory.js').then(({ Inventory }) => {
            // R42: dynamic imports may resolve after a reconnect has replaced uiBoard.
            // Never mount an old generation into a detached board.
            if (uiBuildGeneration !== this._gameUIBuildGeneration || uiBoard !== this._gameUIViewport?.board) return;
            if (!this.inventory) {
                // Container local vazio até o estado autoritativo do servidor ser
                // portado. Não semear Zen/item fake para fazer a UI parecer cheia.
                this.inventory = new Inventory();
            }
            this.inventory.zen = this.serverInventory?.zen ?? this.inventory.zen ?? 0;
            if (this.drops) this.drops.inventory = this.inventory;
            if (!this._ui.inventoryWin) {
                this._ui.inventoryWin = new InventoryWindow({
                    parent: uiBoard, // CNewUIMyInventory lives in the same 800x600 PC coordinate board
                    inventory: this.inventory, // compatibility container; serverInventory remains production authority
                    authoritativeOwner: this.serverInventory,
                    itemAttributeLayout: Config.ITEM_ATTRIBUTE_LAYOUT,
                    itemAttributePath: Config.ITEM_ATTRIBUTE_PATH,
                    getCharacterTooltipState: () => ({
                        level:Number(this.playerChar?.level ?? 0),
                        strength:Number(this.playerChar?.stats?.str ?? 0), addStrength:Number(this.playerChar?.addStrength ?? 0),
                        dexterity:Number(this.playerChar?.stats?.agi ?? 0), addDexterity:Number(this.playerChar?.addDexterity ?? 0),
                        vitality:Number(this.playerChar?.stats?.vit ?? 0), addVitality:Number(this.playerChar?.addVitality ?? 0),
                        energy:Number(this.playerChar?.stats?.ene ?? 0), addEnergy:Number(this.playerChar?.addEnergy ?? 0),
                        charisma:Number(this.playerChar?.stats?.cmd ?? 0), addCharisma:Number(this.playerChar?.addLeadership ?? 0),
                        maxLife:Number(this.playerChar?.maxHP ?? 0),
                        maxMana:Number(this.playerChar?.maxMP ?? 0),
                        masterValid:!!this.playerChar?.masterValid,
                        masterLevel:Number(this.playerChar?.masterLevel ?? 0),
                        masterMaxLife:Number(this.playerChar?.masterMaxLife ?? 0),
                        masterMaxMana:Number(this.playerChar?.masterMaxMana ?? 0),
                        clientClass:Number.isInteger(this.playerChar?.visualClassId) ? this.playerChar.visualClassId : 0,
                    }),
                    isWorldDropTarget: (target) => target === this.scene?.renderer?.domElement,
                    onWorldDropGesture: () => { this._inventoryWorldRelease = true; },
                    onServerDrop: (srcIndex, capturedRaw) => this.requestInventoryWorldDrop(srcIndex, capturedRaw),
                    onVisibilityChange: () => queueMicrotask(() => this._layoutCharacterInventoryWindows?.()),
                    onServerMove: async (srcIndex, dstIndex) => {
                        const data = this.serverInventory.buildMoveData(srcIndex, dstIndex);
                        if (!data) return false;
                        return this.requestEquipmentMove(data);
                    },
                    // CNewUIStorageInventory::ProcessInventoryCtrl / ProcessMyInvenItemAutoMove.
                    // Cross-container moves exist only while the server-opened storage owner is visible.
                    onExternalDrop: ({srcIndex, event}) => {
                        const dst=this._ui?.storageWin?.wireTargetAtClientPoint?.(event.clientX,event.clientY);
                        if (!this._ui?.storageWin?.visible || !dst) return false;
                        void this.requestStorageEquipmentMove(0,srcIndex,2,dst.index);
                        return true;
                    },
                    onServerContextMove: ({srcIndex,item,ref}) => {
                        if (!this._ui?.storageWin?.visible || !item || ref?.kind !== 'grid') return false;
                        if (item.itemType === (13*512+20)) return true; // clean PC IsStoreBan helper+20 gate
                        const dst=this.serverStorage?.findEmptySlot?.(item.itemType) ?? -1;
                        if (dst < 0) return true;
                        void this.requestStorageEquipmentMove(0,srcIndex,2,dst);
                        return true;
                    },
                });
            }
            // F3:10/F3:14/0x22/0x24/0x28 refresh the real NewUI slots directly.
            if (!this._serverInventoryUiOff) {
                this._serverInventoryUiOff = this.serverInventory.onChange(() => {
                    // Container state only. PC appearance changes arrive on
                    // F3:13 ReceiveEquipment; 0x24/F3:10/F3:14 do not own CharSet.
                    this._ui.inventoryWin?.requestRefresh?.();
                });
            }
            this._ui.inventoryWin.refresh?.();
            this._syncWings?.();
            // R23: owner criado depois de QuickHotkeys.install(); registrar no momento real de criação.
            QuickHotkeys.registerWindow('inventory', this._ui.inventoryWin);
            if (this._pendingStorageOpen && this._ui?.storageWin) {
                this._pendingStorageOpen=false;
                queueMicrotask(()=>this._openServerStorageUI());
            }

        }).catch(err => console.warn('[UI] Inventário não carregou:', err));

        // Warehouse/Storage is NOT a B-hotkey/localStorage window. Clean PC Main 5.2
        // opens INTERFACE_STORAGE only from ReceiveTalk(0x30, Value=2), pairs it
        // with inventory, and uses server 0x24/0x81..0x85 as state authority.
        if (uiBuildGeneration === this._gameUIBuildGeneration && uiBoard === this._gameUIViewport?.board) {
            this._ui.storageWin = new StorageWindow({
                parent: uiBoard,
                mirror: this.serverStorage,
                serverInventory: this.serverInventory,
                itemAttributeLayout: Config.ITEM_ATTRIBUTE_LAYOUT,
                itemAttributePath: Config.ITEM_ATTRIBUTE_PATH,
                onVisibilityChange: () => queueMicrotask(() => this._layoutCharacterInventoryWindows?.()),
                resolveInventoryTarget: (x,y) => this._ui?.inventoryWin?.wireTargetAtClientPoint?.(x,y) || null,
                onMove: (srcType,srcIndex,dstType,dstIndex) => this.requestStorageEquipmentMove(srcType,srcIndex,dstType,dstIndex),
                onCloseStorage: () => this.closeServerStorage(),
                onStorageGold: (flag,gold) => this.muProtocol?.requestStorageGold?.(flag,gold),
                onChangeWarehouse: (target) => this.changeServerWarehouse(target),
                onRequestVaultCost: () => this.muProtocol?.requestVaultCost?.(),
                onVaultBuy: () => this.muProtocol?.requestVaultBuy?.(),
                onStoragePassword: (type,password,resident) => this.muProtocol?.requestStoragePassword?.(type,password,resident),
                getCharacterGold: () => this.serverInventory?.zen ?? this.playerChar?.gold ?? 0,
                getTotalLevel: () => Number(this.playerChar?.level || 0) + Number(this.playerChar?.masterLevel || 0),
            });
            if (this._pendingStorageOpen) {
                this._pendingStorageOpen=false;
                queueMicrotask(()=>this._openServerStorageUI());
            }
        }

        // CNewUINPCShop: state is exclusively 0x30/0x31/0x32/0x33/0x34.
        if (uiBuildGeneration === this._gameUIBuildGeneration && uiBoard === this._gameUIViewport?.board) {
            this._ui.npcShop = new NpcShop({
                parent: uiBoard,
                mirror: this.serverNpcShop,
                serverInventory: this.serverInventory,
                x: 0, y: 0,
                onBuy: (slot) => {
                    if (!this.muProtocol?.requestBuy || this._ui?.npcShop?.pending) return false;
                    this._ui.npcShop.setPending(true);
                    this.muProtocol.requestBuy(slot).catch((e)=>{this._ui?.npcShop?.setPending?.(false);console.warn('[NPCShop] 0x32 send falhou:',e?.message||e);});
                    return true;
                },
                onSell: (slot) => {
                    if (!this.muProtocol?.requestSell || this._ui?.npcShop?.pending || this._npcShopPendingSellSlot!=null) return false;
                    this._npcShopPendingSellSlot=slot; this._ui.npcShop.setPending(true);
                    this.muProtocol.requestSell(slot).catch((e)=>{this._npcShopPendingSellSlot=null;this._ui?.npcShop?.setPending?.(false);console.warn('[NPCShop] 0x33 send falhou:',e?.message||e);});
                    return true;
                },
                onRepair: (slot,addGold=0) => {
                    if (!this.muProtocol?.requestRepair || this._ui?.npcShop?.pending) return false;
                    this._ui.npcShop.setPending(true);
                    this.muProtocol.requestRepair(slot,addGold).catch((e)=>{this._ui?.npcShop?.setPending?.(false);console.warn('[NPCShop] 0x34 send falhou:',e?.message||e);});
                    return true;
                },
                onClose: () => { this.serverNpcShop.endSession(); },
            });
            this._ui.npcShop.hide();
        }

        // Mailbox/MailWindow localStorage simulation removed in R68. Main 5.2
        // mail may only return when its actual server packet/UI owner is ported.
        // No fake hotkey/window is registered in production.

        // Janela de status do personagem (tecla C)
        // CharacterWindow espera objeto plano { str, agi, vit, ene, cmd, points... }
        // então criamos um adapter que lê/escreve direto no Character.
        const pc = this.playerChar;
        const app = this;
        const statsAdapter = {
            get name() { return pc.name; },
            get classId() { return pc.classId; },
            get className() {
                // Current-client CharSet[0] carries ChangeUp. Preserve advanced
                // classes (Blade Master, Grand Master, Lord Emperor...) instead
                // of collapsing the Character C window to the base class.
                if (Number.isInteger(pc.classByte)) return serverClassToName(pc.classByte) || '—';
                const names = ['Dark Knight','Dark Wizard','Fairy Elf','Magic Gladiator','Dark Lord','Summoner','Rage Fighter'];
                return names[pc.classId] || '—';
            },
            get serverName() { return app.selectedServer?.name || ''; },
            get level() { return pc.level; },
            get experience() { return pc.experience; },
            get nextExperience() { return pc.nextExperience; },
            get points() { return pc.levelUpPoint ?? 0; },
            get addPoint() { return pc.fruitAdd ?? pc.addPoint; },
            get maxAddPoint() { return pc.maxFruitAdd ?? pc.maxAddPoint; },
            get minusPoint() { return pc.fruitSub ?? pc.minusPoint; },
            get maxMinusPoint() { return pc.maxFruitSub ?? pc.maxMinusPoint; },
            get reset() { return pc.reset; }, get resetValid() { return pc.resetValid === true; },
            get str() { return pc.stats.str; }, get addStr() { return pc.addStrength || 0; },
            get agi() { return pc.stats.agi; }, get addAgi() { return pc.addDexterity || 0; },
            get vit() { return pc.stats.vit; }, get addVit() { return pc.addVitality || 0; },
            get ene() { return pc.stats.ene; }, get addEne() { return pc.addEnergy || 0; },
            get cmd() { return pc.stats.cmd; }, get addCmd() { return pc.addLeadership || 0; },
            get hp() { return pc.hp; }, get maxHp() { return pc.maxHP; },
            get mp() { return pc.mp; }, get maxMp() { return pc.maxMP; },
            get bp() { return pc.bp ?? pc.skillMana; }, get maxBp() { return pc.maxBP ?? pc.maxSkillMana; },
            get sd() { return pc.sd; }, get maxSd() { return pc.maxSD; },
            get defense() { return pc.defense; }, get defenseRate() { return pc.defenseSuccess; },
            get defenseRatePvp() { return pc.defenseSuccessPvp; },
            get attackMin() { return pc.physicalMin; }, get attackMax() { return pc.physicalMax; },
            get attackRate() { return pc.attackSuccess; }, get attackRatePvp() { return pc.attackSuccessPvp; },
            get damageMultiplier() { return pc.damageMultiplier; },
            get physicalSpeed() { return pc.physicalSpeed; }, get magicSpeed() { return pc.magicSpeed; },
            get magicMin() { return pc.magicMin; }, get magicMax() { return pc.magicMax; },
            get curseMin() { return pc.curseMin; }, get curseMax() { return pc.curseMax; },
            get darkSpiritMin() { return pc.darkSpiritMin; }, get darkSpiritMax() { return pc.darkSpiritMax; },
            get darkSpiritSuccess() { return pc.darkSpiritSuccess; },
            get combatStatsAuthoritative() { return pc.calculationValid === true; },
            get combatFields() { return pc.calculationFields || {}; },
        };
        this._ui.charWindow = new CharacterWindow({
            parent: uiBoard,
            character: statsAdapter,
            onVisibilityChange: () => queueMicrotask(() => this._layoutCharacterInventoryWindows?.()),
            onAddPoint: (attr) => {
                const type = ({ str:0, agi:1, vit:2, ene:3, cmd:4 })[attr];
                if (!Number.isInteger(type) || Number(pc.levelUpPoint || 0) <= 0) return false;
                if (!this.muProtocol?.isConnected || !this.muProtocol?.inGameLane?.()) return false;
                this.muProtocol.requestAddPoint(type).catch((e) =>
                    console.warn('[UI PC] F3:06 add-point falhou:', e?.message || e));
                return true;
            },
        });
        QuickHotkeys.registerWindow('character', this._ui.charWindow);
        this._installFpsControl();
        this._installEngineDebugOverlay();
        if (!this._windowLayoutResizeHandler) {
            this._windowLayoutResizeHandler = () => this._layoutCharacterInventoryWindows?.();
            window.addEventListener('resize', this._windowLayoutResizeHandler);
            window.visualViewport?.addEventListener('resize', this._windowLayoutResizeHandler);
        }
        queueMicrotask(() => this._layoutCharacterInventoryWindows?.());

        // PC MainFrame buttons use the exact NewUIMainFrameWindow.cpp owner positions/art.
        // Resolve windows lazily because Inventory is loaded asynchronously after MainFrame.
        this.hud.setActions({
            inventory: () => this._ui.inventoryWin?.toggle?.(),
            character: () => this._ui.charWindow?.toggle?.(),
            party: () => this._ui.partyWin?.toggle?.(),
            guild: () => this._ui.guildWin?.toggle?.(),
            chat: () => this.chat?.toggle?.(),
        });
    }

    _setFrameLimit(limit) {
        const n = Number(limit);
        this._frameLimit = [30, 60, 120].includes(n) ? n : 60;
        try { localStorage.setItem('muweb.fpsLimit', String(this._frameLimit)); } catch (_) {}
        this._frameLimitLast = 0;
        this._refreshFpsControl?.();
    }

    _installFpsControl() {
        if (this._fpsControl?.isConnected) { this._refreshFpsControl(); return; }
        const root = this.hud?.pcLayer;
        if (!root) return;
        const box = document.createElement('div');
        box.dataset.muRole = 'fps-control';
        const r = PC_MAINFRAME_FPS_RECT;
        box.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;z-index:605;font:10px Tahoma;color:white;user-select:none;pointer-events:auto;`;
        const value = document.createElement('button');
        value.type = 'button';
        value.title = 'FPS — limite 30 / 60 / 120';
        value.setAttribute('aria-expanded', 'false');
        value.dataset.muRole = 'fps-value';
        value.style.cssText = 'display:block;width:100%;height:100%;padding:0;border:0;background:transparent;font:inherit;color:inherit;text-align:center;white-space:nowrap;cursor:pointer;';
        box.appendChild(value);
        const menu = document.createElement('div');
        menu.style.cssText = 'position:absolute;right:0;bottom:14px;display:none;gap:4px;padding:4px;background:rgba(0,0,0,.85);border:1px solid #6f604d;';
        const setOpen = open => { menu.style.display = open ? 'flex' : 'none'; value.setAttribute('aria-expanded', String(open)); };
        value.addEventListener('click', e => { e.stopPropagation(); setOpen(menu.style.display === 'none'); });
        box.addEventListener('keydown', e => { if(e.key==='Escape'){setOpen(false);value.focus();e.stopPropagation();} });
        box.addEventListener('focusout', e => { if(!box.contains(e.relatedTarget))setOpen(false); });
        for (const cap of [30,60,120]) {
            const b=document.createElement('button'); b.type='button'; b.textContent=String(cap);
            b.style.cssText='padding:1px 4px;border:1px solid #6f604d;background:#17130f;color:#e8d7b5;font:10px Tahoma;cursor:pointer;';
            b.addEventListener('click',(e)=>{e.stopPropagation();this._setFrameLimit(cap);setOpen(false);value.focus();});
            b.dataset.fpsCap=String(cap); menu.appendChild(b);
        }
        box.appendChild(menu);
        this._fpsControl = box; root.appendChild(box);
        this._refreshFpsControl = () => {
            if (!this._fpsControl?.isConnected) return;
            const v=this._fpsControl.querySelector('[data-mu-role="fps-value"]');
            const text = `FPS: ${Number(GameTimer.fps || 0).toFixed(1)}`;
            if (v && v.textContent !== text) v.textContent=text;
            const p=this.playerChar?.position;
            if(p)this.hud?.setPosition(Math.floor((p.x+12800)/100),Math.floor((12800-p.z)/100));
            for (const b of this._fpsControl.querySelectorAll('button[data-fps-cap]')) {
                const on=Number(b.dataset.fpsCap)===this._frameLimit;
                b.style.opacity=on?'1':'.55'; b.style.outline=on?'1px solid #daba72':'none';
            }
        };
        this._refreshFpsControl();
    }

    _installEngineDebugOverlay() {
        if (this._engineDebugOverlay?.isConnected) return;
        const root = this._gameUIViewport?.board || document.body;
        const box = document.createElement('pre');
        box.dataset.muRole = 'engine-debug-overlay';
        box.style.cssText = 'position:absolute;left:8px;top:8px;z-index:95;display:none;min-width:260px;max-width:430px;margin:0;padding:6px 8px;background:rgba(0,0,0,.78);border:1px solid #807057;color:#cfe7cf;font:10px/1.35 Consolas,monospace;pointer-events:none;white-space:pre-wrap;';
        root.appendChild(box);
        this._engineDebugOverlay = box;
        this._engineDebugState = this._engineDebugState || {};
        this._engineDebugVisible = false;
        if (!this._engineDebugKeyHandler) {
            this._engineDebugKeyHandler = (e) => {
                // F10/F11 belong to the PC Camera3D owner; F12 is tray mode.
                // Keep diagnostics off those production keys.
                if (e.code !== 'F9' || !e.ctrlKey || !e.shiftKey || e.repeat) return;
                e.preventDefault();
                this._engineDebugVisible = !this._engineDebugVisible;
                if (this._engineDebugOverlay) this._engineDebugOverlay.style.display = this._engineDebugVisible ? 'block' : 'none';
                console.info(`[ENGINE-DEBUG] overlay ${this._engineDebugVisible ? 'ON' : 'OFF'} (Ctrl+Shift+F9)`);
                this._refreshEngineDebugOverlay?.();
            };
            window.addEventListener('keydown', this._engineDebugKeyHandler);
        }
        this._refreshEngineDebugOverlay = () => {
            if (!this._engineDebugOverlay || !this._engineDebugVisible) return;
            const ri = this.scene?.renderer?.info?.render;
            const fp = this._framePerf;
            const wl = this.scene?.worldObjectLayer;
            const inv = this._ui?.inventoryWin, chr = this._ui?.charWindow;
            const heroEq = Array.isArray(this.playerChar?.charset) ? this.playerChar.charset.slice(0,18).join(',') : 'none';
            const lines = [
                `R64 ENGINE DEBUG | state=${this.state} | FPS=${GameTimer.fps || 0} cap=${this._frameLimit || 60}`,
                `draw calls=${ri?.calls ?? -1} tris=${ri?.triangles ?? -1} frame=${ri?.frame ?? -1}`,
                `tick=${fp?.frames ? (fp.tickTotal/fp.frames).toFixed(1) : '-'}ms render=${fp?.frames ? (fp.renderTotal/fp.frames).toFixed(1) : '-'}ms`,
                `world=${this.scene?.mapIndex ?? '-'} objects=${wl?._objects?.length ?? wl?.objects?.length ?? '-'} animVis=${wl?._visibleAnimated ?? '-'}/${wl?._totalAnimated ?? '-'}`,
                `hero key=${Number.isInteger(this._heroServerKey)?'0x'+this._heroServerKey.toString(16):'-'} classByte=${this.playerChar?.classByte ?? '-'} visualClass=${this.playerChar?.visualClassId ?? '-'}`,
                `hero charset=${heroEq}`,
                `equipRebuild=${this._heroEquipRebuild ? 1 : 0} equipKey=${this._heroEquipKey ?? '-'}`,
                `UI I=${inv?.visible?1:0}@${Math.round(inv?.x ?? -1)},${Math.round(inv?.y ?? -1)} C=${chr?.visible?1:0}@${Math.round(chr?.x ?? -1)},${Math.round(chr?.y ?? -1)}`,
                `World75 ready=${this.scene?._charWorldReady?1:0} terrain=${this.scene?._terrainWorldNumber ?? '-'} objects=${this.scene?._objectsWorldNumber ?? '-'}`,
            ];
            this._engineDebugOverlay.textContent = lines.join('\n');
        };
    }

    _attachClickMovement() {
        this._ctm?.detach?.();
        // _updateAuthoritativeMovement consumes playerChar.targetPos.
        // mainObject is only a render group and cannot own this intent.
        this._ctm=ClickToMove.attach(this.scene.scene,this.playerChar,this.scene.camera.threeCamera,{
            terrain:this.scene.terrain,domElement:this.scene.renderer?.domElement||window,
            autoBind:false,phantomDuration:0,
        });
        return this._ctm;
    }

    _bindWorldInput() {
        // R79: um único owner para o mouse do mundo. A versão anterior tinha
        // dois listeners independentes: ClickToMove consumia mousedown e depois
        // GameApp consumia click para atacar o monstro MAIS PRÓXIMO do herói.
        // Resultado: um único clique podia simultaneamente mudar targetPos e
        // atacar outro actor, além de o botão direito estar sequestrado pela
        // câmera. Ordem PC-style aqui: LMB item/actor/movimento; RMB skill atual.
        if (this._worldClickHandler) {
            window.removeEventListener('click', this._worldClickHandler);
            this._worldClickHandler = null;
        }
        if (this._worldPointerDownHandler) {
            window.removeEventListener('mousedown', this._worldPointerDownHandler, true);
            window.removeEventListener('mousedown', this._worldPointerDownHandler);
        }

        this._worldPointerDownHandler = (e) => {
            this._inventoryWorldRelease = false;
            const canvas = this.scene?.renderer?.domElement;
            if (e.target !== canvas || !this.scene || !this.monsters || !this.playerChar) return;
            if (e.button !== 0 && e.button !== 2) return;

            // Left mouse: exact pointer ownership, never nearest-to-hero guess.
            if (e.button === 0) {
                if (this._pendingPcSkillCast) this._cancelPendingPcMovementSkill('left-click');
                const groundKey = this.groundItemLayer?.pickFromPointer?.(
                    e.clientX, e.clientY, this.playerChar.position, 3.5 * TERRAIN_CELL
                );
                if (Number.isInteger(groundKey)) {
                    e.preventDefault();
                    void this.requestGroundItemPickup(groundKey);
                    return;
                }

                const actor = this.monsters.pickFromPointer?.(
                    e.clientX, e.clientY,
                    this.scene.camera.threeCamera, canvas,
                    this.playerChar.position, 3.5 * TERRAIN_CELL,
                );
                if (actor?.serverDriven && actor.isAlive?.()) {
                    e.preventDefault();
                    this.playerChar.targetPos = null;
                    if (actor.isNpc?.()) {
                        this._lastTalkNpc = { key: actor.serverKey, typeId: actor.typeId };
                        if (!Number.isInteger(actor.serverKey) || !this.muProtocol?.requestTalk) {
                            console.info('[NPC] talk fail-closed: key/protocolo indisponível.');
                            return;
                        }
                        this.muProtocol.requestTalk(actor.serverKey)
                            .then(() => console.info(`[NPC] 0x30 SendRequestTalk(key=${actor.serverKey}, type=${actor.typeId}) → GS`))
                            .catch((err) => console.warn('[NPC] talk send falhou:', err?.message || err));
                        return;
                    }
                    if (actor.isAttackable?.()) this._playerAttack(actor);
                    return;
                }

                // Empty terrain click = movement. ClickToMove no longer owns a
                // parallel DOM listener, so this cannot race with attack/skill.
                if (this._ctm?.moveFromPointer?.(e.clientX, e.clientY)) {
                    e.preventDefault();
                }
                return;
            }

            // Right mouse: selected skill, never camera drag. Target is the
            // actor under the cursor; area/no-target skills receive the pointed
            // terrain position. SkillBar remains the cooldown/MP gate owner.
            if (e.button === 2) {
                const selected = Number(this.skillBar?.selected);
                if (!Number.isInteger(selected) || selected < 0) return;
                const skill = this.skillBar?.slots?.[selected];
                if (!skill) return;
                // PC SelectedCharacter can be a monster OR another player. The
                // old Web lane raycasted only MonsterManager, making Elf
                // Heal/Defense/Attack impossible to aim at a real party/player.
                const target = this._pickSkillTargetFromPointer(e.clientX, e.clientY, canvas);
                const groundPoint = this._ctm?.pointFromPointer?.(e.clientX, e.clientY) || null;
                e.preventDefault();
                this.skillBar.use(selected, { source: 'world-rmb', target, groundPoint });
            }
        };
        window.addEventListener('mousedown', this._worldPointerDownHandler);

        // PC RenderCursor owner. CursorTalk is a 2x2 animated atlas:
        // Frame=(WorldTime*.01)%6 and exact quadrant sequence from ZzzInterface.
        // Normal/Get/Attack use their authored full 24x24 bitmap. Mouse-down on
        // empty terrain uses CursorPush, exactly the desktop default branch.
        if (this._worldPointerMoveHandler) window.removeEventListener('mousemove', this._worldPointerMoveHandler);
        if (this._worldPointerUpCursorHandler) window.removeEventListener('mouseup', this._worldPointerUpCursorHandler);
        this._worldCursorOverlay?.remove?.();
        const cursorOverlay=document.createElement('div');
        cursorOverlay.dataset.muPcOwner='ZzzInterface::RenderCursor';
        cursorOverlay.style.cssText='position:fixed;left:0;top:0;width:24px;height:24px;z-index:2147483000;pointer-events:none;display:none;background-repeat:no-repeat;image-rendering:auto;';
        document.body.appendChild(cursorOverlay); this._worldCursorOverlay=cursorOverlay;
        const cursorCache = this._worldCursorUrls || (this._worldCursorUrls = new Map());
        const cursorPath={default:'Interface/Cursor.ozt',push:'Interface/CursorPush.ozt',talk:'Interface/CursorTalk.ozt',attack:'Interface/CursorAttack.ozt',get:'Interface/CursorGet.ozt'};
        const cursorUrl=async(kind)=>{if(cursorCache.has(kind))return cursorCache.get(kind);const owner=await RemoteAssets.fetchDecodedImage(cursorPath[kind]||cursorPath.default).catch(()=>null);const rec=owner?.url?{url:owner.url,width:Number(owner.image?.width)||24,height:Number(owner.image?.height)||24}:null;cursorCache.set(kind,rec);return rec;};
        for(const kind of Object.keys(cursorPath))void cursorUrl(kind);
        const applyCursor=(kind,e)=>{
            const rec=cursorCache.get(kind); const canvas=this.scene?.renderer?.domElement;
            if(!canvas)return; canvas.style.cursor='none'; cursorOverlay.style.display='block';
            cursorOverlay.style.left=`${e.clientX-2}px`;cursorOverlay.style.top=`${e.clientY-2}px`;
            if(!rec){cursorOverlay.style.backgroundImage='none';return;}
            cursorOverlay.style.backgroundImage=`url("${rec.url}")`;
            if(kind==='talk'){
                const frame=Math.floor(performance.now()*0.01)%6; const u=(frame===1||frame===3||frame===5)?1:0; const v=(frame===2||frame===3||frame===4)?1:0;
                cursorOverlay.style.backgroundSize='48px 48px';cursorOverlay.style.backgroundPosition=`${-u*24}px ${-v*24}px`;
            }else{cursorOverlay.style.backgroundSize='24px 24px';cursorOverlay.style.backgroundPosition='0 0';}
            canvas.dataset.muCursorOwner=kind;
        };
        this._worldPointerMoveHandler=(e)=>{
            const canvas=this.scene?.renderer?.domElement;
            if(!canvas||!this.playerChar){if(this._worldCursorOverlay)this._worldCursorOverlay.style.display='none';return;}
            // RenderCursor is a game-client owner, not a canvas owner. Keep the
            // authored MU hand over inventory/UI DOM and hide the browser cursor
            // for every element in the active game root. World-only cursor kinds
            // (Talk/Attack/Get/Push) are selected only when the event targets the
            // actual 3D canvas; UI falls back to the normal MU hand.
            let node=e.target;let gameOwned=false;
            while(node&&node!==document.body){if(node===canvas||node?.dataset?.muPcOwner||node?.closest?.('#mu-ui-root, #mu-overlay-root, .mu-window, [data-mu-ui]')){gameOwned=true;break;}node=node.parentElement;}
            if(!gameOwned && e.target!==canvas){cursorOverlay.style.display='none';return;}
            if(e.target?.style)e.target.style.cursor='none';
            let kind='default';
            if(e.target===canvas){
                if(e.buttons&1) kind='push';
                else { const groundKey=this.groundItemLayer?.pickFromPointer?.(e.clientX,e.clientY,this.playerChar.position,3.5*TERRAIN_CELL);
                    if(Number.isInteger(groundKey))kind='get'; else {const actor=this.monsters?.pickFromPointer?.(e.clientX,e.clientY,this.scene.camera.threeCamera,canvas,this.playerChar.position,3.5*TERRAIN_CELL);if(actor?.serverDriven&&actor.isAlive?.())kind=actor.isNpc?.()?'talk':actor.isAttackable?.()?'attack':'default';}}
            }
            applyCursor(kind,e);
        };
        this._worldPointerUpCursorHandler=(e)=>this._worldPointerMoveHandler?.(e);
        window.addEventListener('mousemove',this._worldPointerMoveHandler);
        window.addEventListener('mouseup',this._worldPointerUpCursorHandler);
    }

    _pickSkillTargetFromPointer(clientX, clientY, canvas) {
        const camera = this.scene?.camera?.threeCamera;
        if (!camera || !canvas?.getBoundingClientRect) return null;
        const roots = [];
        const ownerByRoot = new Map();

        // Server monster/NPC viewport. Skills may target only live attackable
        // actors here; NPC targeting remains owned by the left-click talk lane.
        for (const m of this.monsters?.monsters || []) {
            if (!m?.mesh || !m.serverDriven || !m.isAlive?.() || !m.isAttackable?.()) continue;
            roots.push(m.mesh);
            ownerByRoot.set(m.mesh, {
                kind: 'monster',
                serverKey: m.serverKey,
                serverTileX: m.serverTileX,
                serverTileY: m.serverTileY,
                position: m.position,
                monster: m,
            });
        }

        // ReceiveCreatePlayerViewport 0x12 actors are valid PC SelectedCharacter
        // owners too. This is required by AttackElf support skills.
        for (const [key, entry] of this.playerViewport?.byKey || []) {
            if (!entry?.outer || !Number.isInteger(key)) continue;
            roots.push(entry.outer);
            ownerByRoot.set(entry.outer, {
                kind: 'player',
                isPlayer: true,
                serverKey: key,
                serverTileX: entry.serverTileX,
                serverTileY: entry.serverTileY,
                position: entry.outer.position,
                entry,
            });
        }
        if (!roots.length) return null;

        const rect = canvas.getBoundingClientRect();
        const width = Math.max(1, rect.width || 1);
        const height = Math.max(1, rect.height || 1);
        const pointer = new THREE.Vector2(
            ((clientX - rect.left) / width) * 2 - 1,
            -((clientY - rect.top) / height) * 2 + 1,
        );
        const raycaster = this._skillPointerRaycaster || (this._skillPointerRaycaster = new THREE.Raycaster());
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(roots, true);
        for (const hit of hits) {
            let node = hit.object;
            while (node) {
                const owner = ownerByRoot.get(node);
                if (owner) return owner;
                node = node.parent;
            }
        }
        return null;
    }

    _playerAttack(monster) {
        const char = this.playerChar;
        if (!char || !monster?.serverDriven || !monster?.isAttackable?.() || !Number.isInteger(monster.serverKey)) {
            console.info('[Combat] normal attack fail-closed: alvo sem key/viewport autoritativo do GS.');
            return false;
        }
        if (!this.muProtocol?.isConnected || !this.muProtocol?.inGameLane?.()) return false;

        const dist = char.position.distanceTo(monster.position);
        if (dist > (char.attackRange || 2) * TERRAIN_CELL) return false;

        // Direção usa a mesma tabela 8-way de wsclientinline.h que codifica
        // movimento. Tiles vêm diretamente dos snapshots/correções do GS; não
        // inferimos orientação a partir da câmera/DOM/Three quando autoridade
        // de tile ainda não existe.
        const heroTile = this._heroServerTile;
        if (!heroTile || !Number.isInteger(monster.serverTileX) || !Number.isInteger(monster.serverTileY)) {
            console.info('[Combat] 0x11 não enviado: tiles autoritativos ainda indisponíveis.');
            return false;
        }
        const dx = Math.sign(monster.serverTileX - heroTile.x);
        const dy = Math.sign(monster.serverTileY - heroTile.y);
        if (dx === 0 && dy === 0) return false;
        let dir = -1;
        for (let i = 0; i < 8; i++) {
            if (DIR_TABLE[i * 2] === dx && DIR_TABLE[i * 2 + 1] === dy) { dir = i; break; }
        }
        if (dir < 0) return false;

        this.muProtocol.requestAttack(monster.serverKey, dir)
            .then(() => console.info(`[Combat] 0x11 SendRequestAttack key=${monster.serverKey} dir=${dir} → GS`))
            .catch((e) => console.warn('[Combat] SendRequestAttack falhou:', e.message));

        // Nenhum Math.random/takeDamage/kill/EXP/VFX genérico aqui. 0x11 RX
        // decide dano/sucesso e 0x18 RX decide action/yaw, como no cliente PC.
        return true;
    }

    /**
     * R16 — movimento Web server-authoritative na lane Android/55902.
     *
     * O input WASD produz somente UM passo adjacente no grid MU e transmite o
     * corpo exato PMSG_MOVE_SEND via BOTH_MOVE. A apresentação pode andar até
     * o tile solicitado para esconder RTT, mas _heroServerTile só muda por D4
     * (ou correção 0x15). Isso elimina o antigo Character.update/local integrate
     * como autoridade e impede FPS/GC stalls de acelerar o personagem.
     */
    _updateAuthoritativeMovement(dt) {
        const char=this.playerChar;
        const cam=this.scene?.camera?.threeCamera;
        if (!char || !cam) return false;
        // MoveCustomInterface.Open() on PC calls LockPlayerWalk/SetLockInterfaces.
        // Keep that exact ownership boundary before either local or network move.
        if (this._moveCustomInputLocked) {
            char.targetPos = null;
            char.velocity?.set?.(0,0,0);
            Movement._animate(char,Math.min(Math.max(dt,0),0.04),false,0);
            return true;
        }
        if (!this.muProtocol?.isConnected || !this.muProtocol?.inGameLane?.() ||
            this.muProtocol.serverType !== 'android') return false;

        // R57: same prediction contract already physically used by the retained
        // mobile PC-port. D4 confirms movement; it must not gate every next
        // visual tile. The old Web single-flight path added one network RTT
        // between adjacent steps, producing the reported hold-W delay/slide.
        const queue = (this._netMoveUnacked ??= []);
        const now=performance.now();
        const simDt=Math.min(Math.max(dt,0),0.04);

        // Hard outage guard. Ordinary VPS RTT/jitter is covered by the bounded
        // prediction window below; only a true multi-second confirmation loss
        // snaps back to the last GS-owned tile.
        if (queue.length && now - Number(queue[0].sentAt || now) > 8000) {
            const auth=this._heroServerTile;
            if (auth) {
                const ax=(auth.x+0.5)*100-12800, az=12800-(auth.y+0.5)*100;
                const ay=this.scene?.terrainHeightAt?.(ax,az) ?? char.position.y;
                char.position.set(ax,ay,az);
            }
            char.velocity.set(0,0,0);
            queue.length=0;
            this._netMovePending=null;
            console.warn('[MOVE R58] prediction hard-timeout; reconciled to GS tile');
        }

        // WASD and click-to-move share the same adjacent PC movement owner.
        const input=Movement.readDirectionalInput(cam);
        if (input.hasInput) {
            char.targetPos = null;
            if (this._pendingPcSkillCast) this._cancelPendingPcMovementSkill('manual-movement');
        }
        let intent=input;
        if (!input.hasInput && char.targetPos) {
            const dx=char.targetPos.x-char.position.x, dz=char.targetPos.z-char.position.z;
            const distance=Math.hypot(dx,dz);
            if (distance<=45) char.targetPos=null;
            else intent={hasInput:true,running:false,dx:dx/distance,dz:dz/distance,clickToMove:true};
        }

        // Resolve the PC locomotion state exactly once per rendered frame.
        // R57 could resolve it twice on a tile-boundary frame (finish pending +
        // author next tile), advancing the Run counter twice and making the
        // speed/action transition visibly irregular.
        const locomotion=Movement.resolvePcLocomotion(char,simDt);

        const pending=this._netMovePending;
        if (pending) {
            const target=pending.world;
            const dx=target.x-char.position.x, dz=target.z-char.position.z;
            const distance=Math.hypot(dx,dz);
            const speed=locomotion.speed;
            const budget=speed*simDt;

            if (distance<=Math.max(0.001,budget)) {
                char.position.x=target.x; char.position.z=target.z;
                char.position.y=(this.scene?.terrainHeightAt?.(target.x,target.z) ?? char.position.y);
                char.velocity.set(0,0,0);
                pending.visualDone=true;
                pending.visualDoneAt ??= now;
            } else {
                const ux=dx/distance, uz=dz/distance;
                char.position.x+=ux*budget; char.position.z+=uz*budget;
                char.position.y=(this.scene?.terrainHeightAt?.(char.position.x,char.position.z) ?? char.position.y);
                char.velocity.set(ux*speed,0,uz*speed);
            }

            // Direction was authored at SendMove time; keep locomotion action
            // live while the body physically consumes this adjacent tile.
            // R62 pulsed IDLE for one frame at EVERY 100-unit tile boundary
            // (`visualDone=true`) even while W/A/S/D was still held. That reset
            // the BMD action roughly three times/second and produced the visible
            // "kicking"/leg-pull cadence. Keep the movement action live when a
            // next input/click intent already exists.
            const keepMovingAcrossTile = !pending.visualDone || Boolean(intent?.hasInput);
            Movement._animate(char,simDt,keepMovingAcrossTile,locomotion.running?10:5);

            if (pending.visualDone) {
                if (!pending.acked) queue.push(pending);
                this._netMovePending=null;
                // Do NOT return: if W/A/S/D remains held we can author the next
                // adjacent tile immediately from the predicted tail, exactly as
                // the mobile/PC prediction ledger does. Movement speed remains
                // bounded by the visual tile consumption above, not RTT/FPS.
            } else {
                return true;
            }
        }

        if (!intent.hasInput) {
            char.velocity.set(0,0,0);
            char._muRunProgress=0;
            Movement._animate(char,simDt,false,0);
            return true;
        }

        // RTT/jitter bounded lead, ported from the retained mobile owner.
        const rtt=Number(this._netMoveRttEwmaMs || 180);
        const jitter=Number(this._netMoveJitterEwmaMs || 20);
        // Physical R57 showed periodic stop/go when D4 confirmations were
        // coalesced/sparse: a 3-tile floor is only ~0.8-1.0 s of authored
        // movement and repeatedly exhausted the ledger. Keep the lead bounded,
        // but large enough for the server's confirmation cadence; 0x15/D4 still
        // owns reconciliation and no speed multiplier is introduced.
        const predictionWindow=Math.max(6,Math.min(12,Math.ceil((rtt+jitter*2)/250)+3));
        if (queue.length>=predictionWindow) {
            // Position stays bounded by the authoritative prediction ledger, but
            // do not pulse the BMD back to idle while the user is still holding a
            // movement intent. That idle/run reset was visible as a periodic
            // leg/body "kick" whenever server acknowledgements were sparse.
            char.velocity.set(0,0,0);
            Movement._animate(char,simDt,Boolean(intent?.hasInput),locomotion.running?10:5);
            return true;
        }

        const step=Movement.quantizeWorldIntent(intent.dx,intent.dz);
        // Exact retained Main/mobile contract (HeroMovementV11::EncodePcMoveBody):
        // PositionX/Y is the FIRST TARGET NODE. The origin is used only to
        // validate/derive the adjacent direction before the 10-byte body is built.
        const origin=queue.length
            ? {x:queue[queue.length-1].x,y:queue[queue.length-1].y}
            : this._heroServerTile;
        if (!step || !origin) return true;

        let dir=-1;
        for(let i=0;i<8;i++) if(DIR_TABLE[i*2]===step.dx&&DIR_TABLE[i*2+1]===step.dy){dir=i;break;}
        if(dir<0)return true;
        const x=origin.x+step.dx, y=origin.y+step.dy;
        if(x<0||x>255||y<0||y>255)return true;

        const wx=(x+0.5)*100-12800, wz=12800-(y+0.5)*100;
        let walkable=true;
        if(Movement.walkableFn){try{walkable=!!Movement.walkableFn(wx,wz);}catch{walkable=false;}}
        if(!walkable||(Movement.collisionWorld&&Movement.collisionWorld.isBlocked?.({x:wx,z:wz}))){
            if(intent.clickToMove)char.targetPos=null;
            return true;
        }

        this._netMovePending={
            x,y,originX:origin.x,originY:origin.y,dir,running:locomotion.running,
            acked:false,visualDone:false,visualDoneAt:0,sentAt:now,world:{x:wx,z:wz},
        };
        char.rotation.y=muDirectionToThreeYaw(dir);
        Movement._animate(char,simDt,true,locomotion.running?10:5);

        this.muProtocol.requestBothMoveStep(x,y,dir).catch((e)=>{
            const q=this._netMovePending;
            if(q?.x===x&&q?.y===y&&q?.originX===origin.x&&q?.originY===origin.y)this._netMovePending=null;
            console.warn('[MOVE R58] BOTH_MOVE send failed:',e.message);
        });
        return true;
    }

    _onMonsterKilled(monster) {
        // Real GS actors receive death/EXP/drop/quest authority from server
        // packets. Never manufacture these locally from a render-side death.
        if (monster?.serverDriven) return false;
        const exp = monster.expReward || 0;
        const ups = this.playerChar.gainExp(exp);
        // PC: ReceiveAttack não toca som por kill — só ReceiveLevelUp toca
        // pLevelUp.wav (WSclient.cpp:6279). Som por kill removido (era inventado).
        this.chatInfo(`+${exp} EXP de ${monster.name}`);

        if (ups > 0) {
            // VFX REAL fiel ao PC (WSclient.cpp:6264-6279): 15 flares +
            // Magic_Ground2 + som pLevelUp.wav — efeito com update(dt) próprio
            // registrado no loop principal (ver _loop → _activeLevelFx).
            const levelFx = playLevelUp(this.scene.mainObject, this.scene.scene, this.scene.camera.threeCamera, {
                effectManager: this.effects, sound: Sound
            });
            if (levelFx) {
                this._activeLevelFx = this._activeLevelFx || [];
                this._activeLevelFx.push(levelFx);
            }
            Sound.uiSuccess();
            this.chatInfo(`LEVEL UP! Você é nível ${this.playerChar.level}`);
        }
        this._refreshStatsHud();
    }

    _onPlayerHurt(dmg) {
        if (!this.hud) return;
        this.hud.damage(dmg);
        this._refreshStatsHud();

        // Morte do player → sequência de morte REAL do PC
        if (this.playerChar && !this.playerChar.isAlive() && !this._deathHandled) {
            this._deathHandled = true;
            const pc = this.playerChar;
            // DeathFX fiel ao PC: action PLAYER_DIE1 (BMD 237) + CreateBlood
            // (2 decalques Effect/blood01) — precisa do renderer do herói.
            const deathResult = onPlayerDeath(this.scene.scene, this.scene.mainObject, {
                renderer: this.scene._playerRenderer || null,
            });
            if (deathResult && deathResult.blood) {
                this._activeLevelFx = this._activeLevelFx || [];
                this._activeLevelFx.push(deathResult.blood);
            }
            onRespawn(() => {
                const map = this.mapManager?.getCurrentMap();
                const c = map?.safezone || map?.center || { x: 0, z: 0 };
                pc.position.set(c.x + 2, 0, (c.z ?? 0) + 2);
                pc.hp = pc.maxHP;
                pc.sd = pc.maxSD;
                this._deathHandled = false;
                this._refreshStatsHud();
                this.chatInfo('Você ressuscitou em ' + (map?.name || 'Lorencia'));
            });
        }
    }

    /**
     * Resolve key do GameServer -> ator visual real já existente no viewport.
     * Retorna apenas actors autoritativos; nunca cria placeholder.
     */
    _resolveServerActor(key) {
        if (!Number.isInteger(key)) return null;
        if (this._heroServerKey === key && this.playerChar) {
            return {
                kind: 'hero', key,
                position: this.playerChar.position,
                rotationY: this.playerChar.rotation?.y ?? 0,
                renderer: this.scene?._playerRenderer || null,
                root: this.scene?.mainObject || null,
                classId: this.playerChar.classId,
                weaponRightSpec: this.scene?._playerWeaponRightSpec || null,
                fenrir: this.scene?._playerFenrir || null,
                buffContainer: this.playerChar.buffContainer || null,
            };
        }
        const rp = this.playerViewport?.getByServerKey?.(key);
        if (rp) {
            return {
                kind: 'player', key,
                position: rp.outer?.position || null,
                rotationY: rp.outer?.rotation?.y ?? 0,
                renderer: rp.renderer || null,
                root: rp.outer || null,
                classId: rp.classId,
                weaponRightSpec: rp.weaponRightSpec || null,
                fenrir: rp.equipment?.fenrir || null,
                buffContainer: rp.buffContainer || rp.outer?.userData?.buffContainer || null,
            };
        }
        const m = this.monsters?.getByServerKey?.(key);
        if (m) {
            return {
                kind: 'monster', key,
                position: m.position || m.mesh?.position || null,
                rotationY: m.mesh?.rotation?.y ?? m.rotation?.y ?? 0,
                renderer: m.renderer || null,
                root: m.mesh || null,
                monster: m,
            };
        }
        return null;
    }

    /**
     * Ação do Player.bmd fiel aos cases de ReceiveMagic/SetPlayerMagic do PC.
     * O efeito visual é separado: esta rotina só cuida da animação do caster.
     */
    _pcPlayerActionForSkill(wireType, actor) {
        const inFamily = (type, base) => Number.isInteger(type) && Number.isInteger(base) && type >= base && type <= base + 4;
        if (wireType >= AT_SKILL.SWORD1 && wireType <= AT_SKILL.SWORD4) {
            return PLAYER_ACTIONS.ATTACK_SKILL_SWORD1 + (wireType - AT_SKILL.SWORD1);
        }
        if (wireType === AT_SKILL.SWORD5) {
            // ReceiveMagic exact: even SwordCount -> SKILL_SWORD5, odd ->
            // PLAYER_ATTACK_TWO_HAND_SWORD1+2, then SwordCount++.
            const state=actor?.root?.userData || actor || {};
            const count=Number(state.muPcSwordCount)||0; state.muPcSwordCount=count+1;
            return (count % 2 === 0) ? PLAYER_ACTIONS.ATTACK_SKILL_SWORD5 : PLAYER_ACTIONS.ATTACK_TWO_HAND_SWORD3;
        }
        if (wireType === AT_SKILL.SPEAR) return actor?.fenrir ? PLAYER_ACTIONS.FENRIR_ATTACK_SPEAR : PLAYER_ACTIONS.ATTACK_SKILL_SPEAR;
        if (wireType === AT_SKILL.RIDER) return (this.scene?._terrainWorldNumber === 9 || this.scene?._terrainWorldNumber === 11) ? PLAYER_ACTIONS.SKILL_RIDER_FLY : PLAYER_ACTIONS.SKILL_RIDER;
        if (wireType === AT_SKILL.ONETOONE || inFamily(wireType, AT_SKILL.BLOW_UP)) return PLAYER_ACTIONS.ATTACK_ONETOONE;
        if (wireType === AT_SKILL.WHEEL
            || inFamily(wireType, AT_SKILL.TORNADO_SWORDA_UP)
            || inFamily(wireType, AT_SKILL.TORNADO_SWORDB_UP)) return PLAYER_ACTIONS.ATTACK_SKILL_WHEEL;
        if (wireType === AT_SKILL.FURY_STRIKE || inFamily(wireType, AT_SKILL.ANGER_SWORD_UP)) return PLAYER_ACTIONS.ATTACK_SKILL_FURY_STRIKE;
        if (wireType === AT_SKILL.VITALITY || inFamily(wireType, AT_SKILL.LIFE_UP)) return PLAYER_ACTIONS.SKILL_VITALITY;
        if (wireType === AT_SKILL.BLOW_OF_DESTRUCTION) return PLAYER_ACTIONS.SKILL_BLOW_OF_DESTRUCTION;
        if (wireType === AT_SKILL.DEATH_CANNON) return PLAYER_ACTIONS.ATTACK_DEATH_CANNON;
        if (wireType === AT_SKILL.BLAST_HELL_BEGIN) return PLAYER_ACTIONS.SKILL_HELL_BEGIN;
        if (wireType === AT_SKILL.BLAST_HELL) return PLAYER_ACTIONS.SKILL_HELL_START;
        if (wireType === AT_SKILL.HELL || inFamily(wireType, AT_SKILL.HELL_FIRE_UP)) return PLAYER_ACTIONS.SKILL_HELL;
        if (wireType === AT_SKILL.INFERNO) return PLAYER_ACTIONS.SKILL_INFERNO;
        if (wireType === AT_SKILL.FLASH) return PLAYER_ACTIONS.SKILL_FLASH;
        if (wireType === AT_SKILL.LIGHTNING_SHOCK || inFamily(wireType, AT_SKILL.LIGHTNING_SHOCK_UP)) return PLAYER_ACTIONS.SKILL_LIGHTNING_SHOCK;
        if (wireType === AT_SKILL.RECOVER) return PLAYER_ACTIONS.RECOVER_SKILL;
        // FIX47 — ReceiveMagic branches ported directly from WSclient.cpp.
        if ([AT_SKILL.STRONG_PIER, AT_SKILL.LONGPIER_ATTACK, AT_SKILL.SPACE_SPLIT, AT_SKILL.DARK_SCREAM].includes(wireType)) {
            return actor?.fenrir ? PLAYER_ACTIONS.FENRIR_ATTACK_DARKLORD_STRIKE : PLAYER_ACTIONS.ATTACK_STRIKE;
        }
        if (wireType === AT_SKILL.PARTY_TELEPORT) {
            return actor?.fenrir ? PLAYER_ACTIONS.FENRIR_ATTACK_DARKLORD_TELEPORT : PLAYER_ACTIONS.ATTACK_TELEPORT;
        }
        if (wireType === AT_SKILL.ADD_CRITICAL || wireType === AT_SKILL.BRAND_OF_SKILL) return PLAYER_ACTIONS.SKILL_HAND1;
        if (wireType === AT_SKILL.ONEFLASH) return PLAYER_ACTIONS.ATTACK_ONE_FLASH;
        if ([AT_SKILL.STUN, AT_SKILL.INVISIBLE, AT_SKILL.MANA, AT_SKILL.REMOVAL_BUFF].includes(wireType)) return PLAYER_ACTIONS.SKILL_VITALITY;
        if ([AT_SKILL.REMOVAL_STUN, AT_SKILL.REMOVAL_INVISIBLE].includes(wireType)) return PLAYER_ACTIONS.ATTACK_REMOVAL;
        if (wireType === AT_SKILL.DARK_HORSE) return PLAYER_ACTIONS.ATTACK_DARKHORSE;
        if (wireType === AT_SKILL.SWELL_OF_MAGICPOWER) return PLAYER_ACTIONS.SKILL_SWELL_OF_MP;

        // FIX53 — Summoner/MG ReceiveMagic action ownership from WSclient.cpp.
        // The PC switches only on stock Helper.Type MODEL_HELPER+2/+3/+37 for
        // these Alice animations; unknown/custom helpers deliberately use the
        // unmounted/default action instead of inventing an equivalence.
        const eq = actor?.root?.userData?.muMovementContext?.equipment || actor?.equipment || null;
        const helperAnimKind = actor?.fenrir || eq?.fenrir ? 'fenrir'
            : eq?.rider?.species === 'unicon' ? 'uni'
            : eq?.rider?.species === 'pegasus' ? 'dino' : 'default';
        const aliceAction = (base, uni, dino, fenrir) => helperAnimKind === 'uni' ? uni
            : helperAnimKind === 'dino' ? dino : helperAnimKind === 'fenrir' ? fenrir : base;
        if (wireType === AT_SKILL.ALICE_LIGHTNINGORB) {
            return aliceAction(PLAYER_ACTIONS.SKILL_LIGHTNING_ORB, PLAYER_ACTIONS.SKILL_LIGHTNING_ORB_UNI,
                PLAYER_ACTIONS.SKILL_LIGHTNING_ORB_DINO, PLAYER_ACTIONS.SKILL_LIGHTNING_ORB_FENRIR);
        }
        if (wireType === AT_SKILL.ALICE_DRAINLIFE || inFamily(wireType, AT_SKILL.ALICE_DRAINLIFE_UP)) {
            return aliceAction(PLAYER_ACTIONS.SKILL_DRAIN_LIFE, PLAYER_ACTIONS.SKILL_DRAIN_LIFE_UNI,
                PLAYER_ACTIONS.SKILL_DRAIN_LIFE_DINO, PLAYER_ACTIONS.SKILL_DRAIN_LIFE_FENRIR);
        }
        if ([AT_SKILL.ALICE_SLEEP, AT_SKILL.ALICE_BLIND, AT_SKILL.ALICE_THORNS, AT_SKILL.ALICE_BERSERKER,
             AT_SKILL.ALICE_WEAKNESS, AT_SKILL.ALICE_ENERVATION].includes(wireType)
             || inFamily(wireType, AT_SKILL.ALICE_SLEEP_UP)) {
            return aliceAction(PLAYER_ACTIONS.SKILL_SLEEP, PLAYER_ACTIONS.SKILL_SLEEP_UNI,
                PLAYER_ACTIONS.SKILL_SLEEP_DINO, PLAYER_ACTIONS.SKILL_SLEEP_FENRIR);
        }
        if (wireType === AT_SKILL.FLAME_STRIKE) return PLAYER_ACTIONS.SKILL_FLAMESTRIKE;
        if (wireType === AT_SKILL.GIGANTIC_STORM) return PLAYER_ACTIONS.SKILL_GIGANTICSTORM;
        if (wireType === AT_SKILL.THUNDER_STRIKE) {
            return helperAnimKind === 'fenrir' ? PLAYER_ACTIONS.FENRIR_ATTACK_DARKLORD_FLASH : PLAYER_ACTIONS.SKILL_FLASH;
        }
        if (wireType === AT_SKILL.ICE_BLADE || inFamily(wireType, AT_SKILL.POWER_SLASH_UP)) {
            return PLAYER_ACTIONS.ATTACK_TWO_HAND_SWORD2;
        }

        // WSclient.cpp ReceiveMagic -> SetPlayerMagic para a família básica
        // (THUNDER/FIREBALL/METEO/SLOW/ENERGYBALL/POWERWAVE/POISON/FLAME).
        if ([AT_SKILL.THUNDER, AT_SKILL.FIREBALL, AT_SKILL.METEO, AT_SKILL.SLOW,
             AT_SKILL.ENERGYBALL, AT_SKILL.POWERWAVE, AT_SKILL.POISON, AT_SKILL.FLAME,
             AT_SKILL.BLAST_POISON, AT_SKILL.BLAST_FREEZE, AT_SKILL.HEALING, AT_SKILL.DEFENSE, AT_SKILL.ATTACK].includes(wireType)
             || inFamily(wireType, AT_SKILL.ICE_UP) || inFamily(wireType, AT_SKILL.HEAL_UP)
             || inFamily(wireType, AT_SKILL.DEF_POWER_UP) || inFamily(wireType, AT_SKILL.ATT_POWER_UP)) {
            // CharacterManager::IsFemale — Elf/Summoner são female no Main 5.2.
            const base = (actor?.classId ?? 0) & 0x7;
            return (base === 2 || base === 5) ? PLAYER_ACTIONS.SKILL_ELF1 : PLAYER_ACTIONS.SKILL_HAND1;
        }
        return null;
    }

    _playServerSkillAnimation(actor, wireType) {
        if (!actor || actor.kind === 'monster' || !actor.renderer) return;
        const actionIndex = this._pcPlayerActionForSkill(wireType, actor);
        if (!Number.isInteger(actionIndex)) return;
        const action = actor.renderer.playAction?.(`action_${actionIndex}`, 0.06);
        if (!action) return;
        // Skills/attacks do PC são ações one-shot; depois volta para idle.
        action.loop = THREE.LoopOnce;
        action.clampWhenFinished = true;
        const ms = Math.max(180, Math.min(1800, ((action.clip?.duration || 0.55) * 1000) + 30));
        const root = actor.root;
        const token = (root.userData._serverSkillAnimToken || 0) + 1;
        root.userData._serverSkillAnimToken = token;
        setTimeout(() => {
            if (!root?.userData || root.userData._serverSkillAnimToken !== token) return;
            // buildAnimationControl já conhece o idle correto por classe.
            root.userData.animationControl?._current && (root.userData.animationControl._current = null);
            root.userData.animationControl?.play?.('idle');
        }, ms);
    }

    _playServerSkillVfx(wireType, source, target, success = true) {
        if (!this.skillFx || !source?.position) return;
        const from = source.position.clone ? source.position.clone() : new THREE.Vector3().copy(source.position);
        const to = target?.position
            ? (target.position.clone ? target.position.clone() : new THREE.Vector3().copy(target.position))
            : from.clone();
        const facing = source.rotationY ?? 0;

        // Portes com estágios/asset real já presentes na R13.
        if (wireType === AT_SKILL.FIREBALL) {
            this.skillFx.createFireballEffect(from, to, { serverAuthoritative: true, success });
            return;
        }
        // R36: exact basic-wizard event owners from clean PC ZzzCharacter.
        if (wireType === AT_SKILL.POISON && this.skillFx.createPoisonEffect) {
            this.skillFx.createPoisonEffect(to, { actorKind: source.kind, serverAuthoritative: true, success });
            return;
        }
        if (wireType === AT_SKILL.METEO && this.skillFx.createMeteorEffect) {
            this.skillFx.createMeteorEffect(to, { actorKind: source.kind, serverAuthoritative: true, success });
            return;
        }
        if (wireType === AT_SKILL.POWERWAVE && this.skillFx.createPowerWaveEffect) {
            this.skillFx.createPowerWaveEffect(from, to, { actorKind: source.kind, iceQueen: false, serverAuthoritative: true, success });
            return;
        }
        // R38: FLASH is BITMAP_BOSS_LASER-driven in clean Main 5.2.
        if (wireType === AT_SKILL.FLASH && this.skillFx.createFlashEffect) {
            this.skillFx.createFlashEffect(to, { actorKind: source.kind, serverAuthoritative: true, success });
            return;
        }
        // R37: exact ENERGYBALL call-site owner; visible update stays fail-closed.
        if (wireType === AT_SKILL.ENERGYBALL && this.skillFx.createEnergyBallEffect) {
            this.skillFx.createEnergyBallEffect(to, { actorKind: source.kind, serverAuthoritative: true, success });
            return;
        }
        // R35: exact PC SLOW impact owner: MODEL_ICE subtype 1 + five subtype 2.
        if (wireType === AT_SKILL.SLOW && this.skillFx.createSlowEffect) {
            this.skillFx.createSlowEffect(to, { actorKind: source.kind, serverAuthoritative: true, success });
            return;
        }
        // R13 ainda possui owners aproximados de Lightning/Slow com geometria/áudio
        // procedural. Eles NÃO entram no dispatch autoritativo R14: até portar os
        // stages PC 1:1, o comportamento correto aqui é fail-closed, não mascarar
        // o gap com um efeito que apenas parece semelhante.

        // Main 5.2 ReceiveMagic SWORD1..5 owns action+sound here; no separate
        // CreateEffect/CreateParticle call exists in that switch. Their visual
        // presentation is therefore animation-owned (action_60..64, with SWORD5
        // odd casts using two-hand action_45) rather than a fabricated generic VFX.
        if (wireType >= AT_SKILL.SWORD1 && wireType <= AT_SKILL.SWORD5) {
            this.skillFx.playPcSwordReceiveSound?.(wireType);
            return;
        }
        if (wireType === AT_SKILL.COMBO && this.skillFx.createComboEffect) {
            this.skillFx.createComboEffect(from, { serverAuthoritative:true, success });
            return;
        }
        if (wireType === AT_SKILL.RIDER) {
            this.skillFx.createRiderAuthoring?.(from, { serverAuthoritative:true, success });
            return;
        }

        // Junction para o Pack A paralelo: quando o módulo PC-parity for
        // incorporado, estes métodos passam a ser chamados sem tocar no router.
        const inMasterFamily = (type, base) => Number.isInteger(type) && Number.isInteger(base) && type >= base && type <= base + 4;
        if ((wireType === AT_SKILL.WHEEL
            || inMasterFamily(wireType, AT_SKILL.TORNADO_SWORDA_UP)
            || inMasterFamily(wireType, AT_SKILL.TORNADO_SWORDB_UP))
            && this.skillFx.createTwistingSlashEffect) {
            this.skillFx.createTwistingSlashEffect(from, facing, { target: to, ownerPosition: source.position, ownerWeaponSpec: source.weaponRightSpec || null, serverAuthoritative: true, success });
            return;
        }
        if ((wireType === AT_SKILL.FURY_STRIKE || inMasterFamily(wireType, AT_SKILL.ANGER_SWORD_UP)) && this.skillFx.createFuryStrikeEffect) {
            this.skillFx.createFuryStrikeEffect(from, facing, {
                target: to,
                terrainHeightAt: this.scene?.terrainHeightAt?.bind(this.scene),
                terrainWallAt: this.scene?.terrainWallAt?.bind(this.scene),
                serverAuthoritative: true,
                success,
            });
            return;
        }
        if ((wireType === AT_SKILL.VITALITY || inMasterFamily(wireType, AT_SKILL.LIFE_UP)) && this.skillFx.createVitalityEffect) {
            this.skillFx.createVitalityEffect(from, { source: from, target: to, actorKind: source.kind, serverAuthoritative: true, success });
            return;
        }
        // R85 identity fix: Death Stab is wire 43 (AT_SKILL_ONETOONE). Its
        // true SPEARSKILL/SPEAR graph is recorded fail-closed until those update
        // owners are exact; never substitute Death Cannon FORCE/4 again.
        if ((wireType === AT_SKILL.ONETOONE || inMasterFamily(wireType, AT_SKILL.BLOW_UP)) && this.skillFx.createDeathStabAuthoring) {
            this.skillFx.createDeathStabAuthoring(from, facing, { target: to, serverAuthoritative: true, success });
            return;
        }
        if (wireType === AT_SKILL.DEATH_CANNON && this.skillFx.createDeathCannonEffect) {
            this.skillFx.createDeathCannonEffect(from, facing, { target: to, serverAuthoritative: true, success });
            return;
        }
        // R27: Blow 232 now owns the evidenced LifeTime-23 BMD impact graph.
        // Renderer-specific terrain/particle/one-frame bitmap stages remain
        // fail-closed inside the owner instead of falling back to generic FX.
        if (wireType === AT_SKILL.BLOW_OF_DESTRUCTION && this.skillFx.createBlowOfDestructionEffect) {
            this.skillFx.createBlowOfDestructionEffect(from, facing, { target: to, serverAuthoritative: true, success });
            return;
        }

        // R87 exact primary Elf support ground: BITMAP_MAGIC+1 subtypes 1/2/3.
        // Random healing joints and Defense SPEARSKILL/4 remain separate fail-closed children.
        const elfSupportSubtype = (wireType === AT_SKILL.HEALING || inMasterFamily(wireType, AT_SKILL.HEAL_UP)) ? 1
            : (wireType === AT_SKILL.DEFENSE || inMasterFamily(wireType, AT_SKILL.DEF_POWER_UP)) ? 2
            : (wireType === AT_SKILL.ATTACK || inMasterFamily(wireType, AT_SKILL.ATT_POWER_UP)) ? 3 : 0;
        if (elfSupportSubtype && this.skillFx.createElfSupportGroundEffect) {
            const casterCloaked = source?.buffContainer?.has?.('srv_18') === true; // eBuff_Cloaking
            if (!casterCloaked && (elfSupportSubtype !== 2 || success)) {
                this.skillFx.createElfSupportGroundEffect(to, target?.rotationY ?? 0, elfSupportSubtype, {
                    terrainHeightAt: this.scene?.terrainHeightAt?.bind(this.scene), serverAuthoritative: true, success,
                });
            }
            return;
        }

        // Fail-closed por tipo: não cai mais no slash/beep genérico para uma
        // skill desconhecida. Log único ajuda o census de portabilidade.
        this._missingServerSkillVfx = this._missingServerSkillVfx || new Set();
        if (!this._missingServerSkillVfx.has(wireType)) {
            this._missingServerSkillVfx.add(wireType);
            console.info(`[SkillVFX] AT_SKILL ${wireType} (${skillTypeName(wireType) || 'sem nome'}) ainda sem owner visual PC-parity — sem fallback inventado.`);
        }
    }

    _handleServerMagic({ magicNumber, sourceKey, targetKey, success }) {
        const source = this._resolveServerActor(sourceKey);
        const target = this._resolveServerActor(targetKey);
        // PC ReceiveMagic retorna antes de tocar Source quando TargetKey não está
        // em CharactersClient. Mesma política aqui: não inventar self-target.
        if (!source || !target) {
            console.info(`[Skill] 0x19 actor fora do viewport; source=${sourceKey} target=${targetKey} type=${magicNumber}`);
            return;
        }
        if (target.position && source.kind === 'player' && source.root?.rotation) {
            // PC: apenas caster REMOTO recebe CreateAngle em 0x19 (Hero já virou
            // no caminho TX/local). Converte CreateAngle(x,y) para o yaw usado
            // pelo port: Player.bmd forward=-Z; threeYaw = PI + pcAngle. three.z é -MU-y.
            const dx = target.position.x - source.position.x;
            const dyMU = -(target.position.z - source.position.z);
            let pcDeg = 0;
            if (Math.abs(dx) < 1e-4) pcDeg = dyMU < 0 ? 0 : 180;
            else if (Math.abs(dyMU) < 1e-4) pcDeg = dx < 0 ? 270 : 90;
            else {
                pcDeg = Math.atan(dyMU / dx) * 180 / Math.PI + 90;
                if (dx < 0) pcDeg += 180;
            }
            source.root.rotation.y = pcDegreesToThreeYaw(pcDeg);
            source.rotationY = source.root.rotation.y;
        }
        // ReceiveMagic faz SetPlayerMagic/SetAction somente para remotos na
        // família básica. Vitality é exceção no PC e pode ecoar para Hero; o
        // re-dispatch é inofensivo e mantém o estado visual server-driven.
        if (source.kind !== 'hero' || magicNumber === AT_SKILL.VITALITY) {
            this._playServerSkillAnimation(source, magicNumber);
        }
        this._playServerSkillVfx(magicNumber, source, target, success);
    }

    _handleServerMagicPosition({ sourceKey, magicNumber, x, y, targetKeys }) {
        const source = this._resolveServerActor(sourceKey);
        if (!source) return;
        // PC ReceiveMagicPosition NÃO chama SetPlayerMagic(magicNumber): chama
        // CreateMagicShiny + PLAYER_SKILL_HELL para o caster e então percorre
        // os TargetKey para shock/damage text. Ainda não há owner Web exato de
        // CreateMagicShiny, então anima a action real e deixa VFX fail-closed.
        if (source.renderer) {
            const a = source.renderer.playAction?.(`action_${PLAYER_ACTIONS.SKILL_HELL}`, 0.06);
            if (a) { a.loop = THREE.LoopOnce; a.clampWhenFinished = true; }
        }
        source.root?.userData && (source.root.userData.lastMagicPosition = { magicNumber, x, y, targetKeys: [...(targetKeys || [])] });
    }

    _handleServerMagicContinue({ sourceKey, magicNumber, x, y, angle }) {
        const source = this._resolveServerActor(sourceKey);
        if (!source) return;
        // PRECEIVE_MAGIC_CONTINUE.Angle NÃO é direção 1..8 de teleport.
        // PC: so->Angle[2] = (Angle / 255.f) * 360.f (WSclient.cpp).
        // O renderer web usa Player.bmd forward=-Z: threeYaw = PI + pcAngle.
        const pcDeg = (angle / 255) * 360;
        if (source.root?.rotation) {
            source.root.rotation.y = pcDegreesToThreeYaw(pcDeg);
            source.rotationY = source.root.rotation.y;
        }
        // PC só aplica SetAction do Continue ao caster remoto; Hero já executou
        // a ação no TX local.
        if (source.kind !== 'hero') this._playServerSkillAnimation(source, magicNumber);
        const wx = (x + 0.5) * TERRAIN_CELL - 12800;
        const wz = 12800 - (y + 0.5) * TERRAIN_CELL;
        const wy = this.scene?.heights ? this.scene.terrainHeightAt(wx, wz) : source.position.y;
        this._playServerSkillVfx(magicNumber, source, { position: new THREE.Vector3(wx, wy, wz), rotationY: source.rotationY }, true);
    }

    _handleServerMagicFinish({ magicNumber, targetKey }) {
        // Porte de WSclient.cpp::ReceiveMagicFinish: Value (skill type) mapeia
        // para o eBuffState que o PC passa a UnRegisterBuff. O estado de buff
        // server-driven da Web usa exatamente a key srv_<eBuffState> (0x2D).
        const target = this._resolveServerActor(targetKey);
        if (!target) return;
        const buffState = magicFinishBuffState(magicNumber);
        if (buffState == null) return; // sem case no PC -> sem ação inventada
        if (target.kind === 'hero') {
            this.playerChar?.buffContainer?.removeServerBuffState?.(buffState);
        } else {
            target.buffContainer?.removeServerBuffState?.(buffState);
        }
        if (target.root?.userData) {
            target.root.userData.lastMagicFinish = { magicNumber, buffState, at: Date.now() };
        }
    }

    _refreshStatsHud() {
        if (!this.hud || !this.playerChar) return;
        this.hud.setStats({
            hp: this.playerChar.hp, maxHp: this.playerChar.maxHP,
            mp: this.playerChar.mp, maxMp: this.playerChar.maxMP,
            sd: this.playerChar.sd, maxSd: this.playerChar.maxSD,
            level: this.playerChar.level,
            experience: this.playerChar.experience,
            nextExperience: this.playerChar.nextExperience,
        });
        this._ui?.charWindow?.refresh?.();
    }

    /**
     * Renderiza a SkillBar a partir do estado canônico do servidor
     * (_serverSkillState, mantido por skills/ServerMagicList.js — o Skill[]
     * do PC). A lista authored segue a ordem de índice e publica até 20
     * células na página zero; o rodapé mostra somente CurrentSkill.
     * Sem estado/servidor → barra limpa (fail-closed, zero placeholder).
     */
    _renderServerSkillBar() {
        if (!this.skillBar) return; // pacote chegou ANTES do _buildGameUI — replay ocorre lá
        if (!this._serverSkillState || this._serverSkillState.size === 0) {
            this.skillBar.clear();
            return;
        }
        this.skillBar.clear();
        const levels = new Map((this._serverSkillEntries || []).map((e) => [e.index, e.level]));
        for (const b of barOrderFromState(this._serverSkillState, 20)) {
            // Enriquecimento REAL do skill_por.bmd (SkillAttribute[type]):
            // mana=mpCost, delay=cooldown MS do PC, distance=range em células.
            const attr = resolveSkillByType(b.type);
            this.skillBar.assign(b.slot, {
                id: b.type,
                skillType: b.type, // AT_SKILL_* real do wire (ícone por tipo)
                // PC authority: skill_por.bmd live owner first; enum name is fallback only.
                name: attr?.name || skillTypeName(b.type) || `Skill ${b.type}`,
                level: levels.get(b.index) ?? attr?.level ?? 0,
                mpCost: attr?.mana || 0,
                cooldown: attr?.delay || 0,
                range: attr?.distance || 0,
                // NewUIMainFrameWindow::RenderSkillIcon consumes BOTH fields.
                // Without these, master/brand cells fell through to a wrong atlas.
                skillUseType: attr?.useType || 0,
                magicIcon: attr?.magicIcon || 0,
            });
        }
    }

    _pcElfBowState() {
        // CharacterMachine->Equipment slots: 0 right, 1 left. Item group BOW
        // is 4 (type = 4*512 + index). Mirrors CharacterManager::GetEquipedBowType
        // and ZzzInterface.cpp::CheckArrow for the retained server inventory.
        const right = this.serverInventory?.get?.(0) || null;
        const left = this.serverInventory?.get?.(1) || null;
        const split = (item) => {
            const t = Number(item?.itemType);
            return Number.isInteger(t) ? { group: Math.floor(t / 512), index: t & 0x1FF, durability: Number(item?.durability || 0) } : null;
        };
        const r = split(right), l = split(left);
        let bowType = null;
        const leftCustom = customBowType(Number(left?.itemType));
        const rightCustom = customBowType(Number(right?.itemType));
        if (leftCustom === 'bow') bowType = 'bow';
        else if (rightCustom === 'crossbow') bowType = 'crossbow';
        else if (l?.group === 4 && l.index !== 7) bowType = 'bow';
        else if (r?.group === 4 && r.index >= 8 && r.index !== 15) bowType = 'crossbow';
        const arrowOk = bowType === 'crossbow'
            ? Boolean(l?.group === 4 && l.index === 7 && l.durability > 0)
            : bowType === 'bow'
                ? Boolean(r?.group === 4 && r.index === 15 && r.durability > 0)
                : false;
        return { bowType, arrowOk, right:r, left:l };
    }

    _pcSkillEquipmentGate(skillType) {
        const type = Number(skillType);
        const right = this.scene?._playerWeaponRightSpec || null;
        const category = Number.isInteger(right?.category)
            ? right.category
            : (Number.isInteger(right?.extType) ? Math.floor(right.extType / 512) : -1);
        const inBlowUp = Number.isInteger(AT_SKILL.BLOW_UP) && type >= AT_SKILL.BLOW_UP && type <= AT_SKILL.BLOW_UP + 4;

        // B101 SkillWarrior: Death Stab/BLOW_UP require a right-hand weapon and
        // explicitly reject the MODEL_STAFF category.
        if (type === AT_SKILL.ONETOONE || inBlowUp) {
            return Boolean(right && category >= 0 && category !== 5);
        }
        // B101 SkillWarrior: Impale requires spear weapon and one of the riding
        // helpers (+2/+3/+4/+37). Web's exact attachment owner exposes those as
        // rider or Fenrir rather than a guessed helper numeric.
        if (type === AT_SKILL.SPEAR) {
            const mounted = Boolean(this.scene?._playerRider || this.scene?._playerFenrir);
            return Boolean(right && category === 3 && mounted);
        }
        // UseSkillWizard: Death Cannon requires right-hand MODEL_STAFF.
        if (type === AT_SKILL.DEATH_CANNON) return Boolean(right && category === 5);

        const inManyArrow = Number.isInteger(AT_SKILL.MANY_ARROW_UP)
            && type >= AT_SKILL.MANY_ARROW_UP && type <= AT_SKILL.MANY_ARROW_UP + 4;
        const elfArrowSkill = type === AT_SKILL.CROSSBOW
            || type === AT_SKILL.DEEPIMPACT
            || type === AT_SKILL.PARALYZE
            || type === AT_SKILL.PIERCING
            || type === AT_SKILL.BLAST_CROSSBOW4
            || type === AT_SKILL.MULTI_SHOT
            || inManyArrow;
        if (elfArrowSkill) {
            const bow = this._pcElfBowState();
            if (!bow.bowType || !bow.arrowOk) return false;
            // UseSkillElf::PARALYZE has an additional exact dexterity floor.
            if (type === AT_SKILL.PARALYZE) {
                const dexterity = Number(this.playerChar?.stats?.agi || 0) + Number(this.playerChar?.addDexterity || 0);
                if (dexterity < 646) return false;
            }
        }
        return true;
    }

    _pcCheckSkillWall(target) {
        if (!this.scene?.walls || !this._heroServerTile || !target?.position) return false;
        const targetTile = (Number.isInteger(target.serverTileX) && Number.isInteger(target.serverTileY))
            ? { x: target.serverTileX & 255, y: target.serverTileY & 255 }
            : {
                x: Math.max(0, Math.min(255, Math.floor((Number(target.position.x) + 12800) / TERRAIN_CELL))),
                y: Math.max(0, Math.min(255, Math.floor((12800 - Number(target.position.z)) / TERRAIN_CELL))),
            };
        let sx = this._heroServerTile.x & 255, sy = this._heroServerTile.y & 255;
        const ex = targetTile.x, ey = targetTile.y;
        let px = ex - sx, py = ey - sy;
        const nx = px < 0 ? -1 : 1;
        const ny = py < 0 ? -256 : 256;
        if (px < 0) px = -px;
        if (py < 0) py = -py;
        const len1 = px > py ? px : py;
        const len2 = px > py ? py : px;
        const d1 = px > py ? ny : nx;
        const d2 = px > py ? nx : ny;
        let index = (sy & 255) * 256 + (sx & 255);
        let error = 0, count = 0;
        do {
            const wall = Number(this.scene.walls[index & 0xFFFF] || 0);
            // B101 CheckWall: NOMOVE-or-higher blocks LOS unless ACTION,
            // HEIGHT or CAMERA_UP is present. Special monster-model exemptions
            // 183/184/186/187 remain fail-closed until exact model id is exposed.
            if (wall >= 0x0004 && (wall & 0x0020) === 0 && (wall & 0x0040) === 0 && (wall & 0x0080) === 0) return false;
            error += len2;
            if (error > len1 / 2) { index += d1; error -= len1; }
            index += d2;
        } while (++count <= len1);
        return true;
    }

    _cancelPendingPcMovementSkill(reason = 'cancelled') {
        const pending = this._pendingPcSkillCast;
        if (!pending) return false;
        this._pendingPcSkillCast = null;
        if (this.playerChar?.targetPos && pending.ownsTargetPos) this.playerChar.targetPos = null;
        console.info(`[SkillTX] MOVEMENT_SKILL cancel type=${pending.skillType} key=${pending.targetKey} reason=${reason}`);
        return true;
    }

    _queuePendingPcMovementSkill(slot, skill, target, rangeCells, policy = null) {
        if (!this.playerChar || !target?.position || !Number.isInteger(target?.serverKey)) return false;
        const skillType = Number(skill?.skillType);
        const approach = policy || pcSkillApproachPolicy(skillType);
        if (!approach) return false;
        if (approach.requiresPlayerTarget && target?.kind !== 'player' && target?.isPlayer !== true) return false;
        this._pendingPcSkillCast = {
            skillType,
            slot: Number.isInteger(slot) ? slot : -1,
            skill,
            targetKey: target.serverKey,
            rangeCells: Math.max(0, Number(rangeCells) || 0),
            rangeMultiplier: Number(approach.rangeMultiplier || 1),
            requiresWall: Boolean(approach.requiresWall),
            requiresPlayerTarget: Boolean(approach.requiresPlayerTarget),
            approachFamily: approach.family || 'unknown',
            world: this.scene?.mapIndex ?? null,
            createdAt: performance.now(),
            ownsTargetPos: true,
        };
        // Existing authoritative movement owner converts targetPos into adjacent
        // BOTH_MOVE steps. No local teleport/path completion is introduced.
        this.playerChar.targetPos = target.position.clone?.() || { ...target.position };
        console.info(`[SkillTX] MOVEMENT_SKILL queued type=${skillType} key=${target.serverKey} range=${this._pendingPcSkillCast.rangeCells}`);
        return true;
    }

    _resolvePendingPcSkillTarget(key) {
        if (!Number.isInteger(key)) return null;
        const monster = this.monsters?.getByServerKey?.(key) || null;
        if (monster?.serverDriven && monster?.position && monster?.isAttackable?.() && monster?.isAlive?.()) return monster;
        const remote = this.playerViewport?.getByServerKey?.(key) || null;
        const pos = remote?.outer?.position || null;
        if (pos) {
            return {
                kind: 'player',
                isPlayer: true,
                serverKey: key,
                position: pos,
                serverTileX: Number.isInteger(remote.serverTileX) ? remote.serverTileX : undefined,
                serverTileY: Number.isInteger(remote.serverTileY) ? remote.serverTileY : undefined,
                isAlive: () => true,
                isAttackable: () => true,
            };
        }
        return null;
    }

    _updatePendingPcMovementSkill() {
        const pending = this._pendingPcSkillCast;
        if (!pending) return false;
        if (this.state !== 'world' || !this.playerChar || !this.muProtocol?.isConnected || !this.muProtocol?.inGameLane?.()) {
            return this._cancelPendingPcMovementSkill('lane/world-lost');
        }
        if (pending.world != null && this.scene?.mapIndex != null && pending.world !== this.scene.mapIndex) {
            return this._cancelPendingPcMovementSkill('world-changed');
        }
        const target = this._resolvePendingPcSkillTarget(pending.targetKey);
        if (!target?.position) return this._cancelPendingPcMovementSkill('target-gone');

        const dx = Number(target.position.x) - Number(this.playerChar.position.x);
        const dz = Number(target.position.z) - Number(this.playerChar.position.z);
        const distance = Math.hypot(dx, dz);
        const world = Number(this.scene?.mapIndex);
        const inBloodCastle = (world >= 12 && world <= 18) || world === 53;
        const isSwordSpecial = pending.skillType >= AT_SKILL.SWORD1 && pending.skillType <= AT_SKILL.SWORD5;
        const triggerCells = inBloodCastle && isSwordSpecial && pending.approachFamily === 'warrior'
            ? 1.8
            : pending.rangeCells * Math.max(1, Number(pending.rangeMultiplier || 1));
        const triggerDistance = triggerCells * TERRAIN_CELL; // PC CheckTile owner
        if (distance > triggerDistance) {
            // Follow current authoritative target location; moving monsters may
            // change tile while the hero approaches.
            this.playerChar.targetPos = target.position.clone?.() || { ...target.position };
            pending.ownsTargetPos = true;
            return false;
        }

        // Reached PC MOVEMENT_SKILL trigger range. Stop click-to-move before
        // sending UseSkillWarrior-equivalent packet; if the 300ms SendRequestMagic
        // guard is still active, retain the pending owner and retry next tick.
        if (pending.ownsTargetPos) this.playerChar.targetPos = null;
        // Use the same normalized TerrainWall safe-zone owner consumed by hero
        // animation/presentation. MOVEMENT_SKILL never fires an attack in safe zone.
        const safeZone = Boolean(this.scene?.terrainWallAt?.(this.playerChar.position.x, this.playerChar.position.z) & 0x0001);
        if (safeZone) return false;
        if (pending.requiresWall && !this._pcCheckSkillWall(target)) return false;
        const sent = this._useSkill(pending.slot, pending.skill, {
            source: 'world-rmb',
            target,
            groundPoint: target.position,
            fromPendingPcMovementSkill: true,
        });
        if (sent) {
            this._pendingPcSkillCast = null;
            console.info(`[SkillTX] MOVEMENT_SKILL cast type=${pending.skillType} key=${pending.targetKey} distance=${distance.toFixed(1)}`);
            return true;
        }
        return false;
    }

    _useSkill(slot, skill, context = null) {
        if (!this.playerChar) return false;
        // TX de skill agora é roteado SOMENTE por owners comprovados do PC.
        // O fallback Web antigo mandava 0xDB para qualquer skill sem actor;
        // ZzzEffect.cpp é o único caller auditado de SendRequestMagicAttack,
        // portanto input de usuário nunca mais inventa esse pacote.
        const wireType = skill?.skillType;
        if (!Number.isInteger(wireType) || wireType <= 0 || !this.muProtocol?.sendPacket) {
            this.chatInfo(`Skill ${skill?.name || slot} indisponível: sem skill real do servidor (magicList).`);
            return false;
        }

        if (!this._pcSkillEquipmentGate(wireType)) {
            console.info(`[SkillTX] type=${wireType} bloqueada pelo gate de equipamento/mount do owner PC.`);
            return false;
        }

        // No PC o clique de mundo define SelectedCharacter/CollisionPosition.
        // A SkillBar apenas seleciona; o cast Web também só nasce do RMB de
        // mundo, nunca de um nearest-monster implícito.
        const target = context?.source === 'world-rmb' ? (context?.target || null) : null;
        const groundPoint = context?.source === 'world-rmb' ? (context?.groundPoint || null) : null;
        const attr = resolveSkillByType(wireType);
        // SkillAttribute[type] from the real skill_por.bmd is required. Do not
        // fall back to SkillData/range=3 synthetic values.
        if (!attr) {
            console.info(`[SkillTX] type=${wireType} sem SkillAttribute real — fail-closed.`);
            return false;
        }
        const rangeCells = Math.max(0, Number(attr.distance || 0));
        const castFamily = pcSkillCastFamily(wireType);
        // Self magic ignores the mouse point. Elf support also ignores terrain
        // aiming when no player is selected and therefore targets HeroKey.
        const rawAimPoint = target?.position || groundPoint;
        const aimPoint = castFamily === 'self-magic'
            || castFamily === 'wizard-blast-hell-magic'
            || castFamily === 'wizard-hellfire' || castFamily === 'wizard-inferno'
            || (castFamily === 'elf-support-magic' && target?.kind !== 'player' && target?.isPlayer !== true)
            ? null : rawAimPoint;
        if (aimPoint) {
            const dx = Number(aimPoint.x) - Number(this.playerChar.position.x);
            const dz = Number(aimPoint.z) - Number(this.playerChar.position.z);
            const distance = Math.hypot(dx, dz);
            const approach = pcSkillApproachPolicy(wireType);
            const world = Number(this.scene?.mapIndex);
            const inBloodCastle = (world >= 12 && world <= 18) || world === 53;
            // CastWarriorSkill uses Distance*1.2; Wizard MOVEMENT_SKILL uses
            // Distance exactly. Blood Castle overrides SWORD1..5 to 1.8 cells.
            const isSwordSpecial = wireType >= AT_SKILL.SWORD1 && wireType <= AT_SKILL.SWORD5;
            const castRangeCells = approach
                ? (inBloodCastle && isSwordSpecial && approach.family === 'warrior'
                    ? 1.8 : rangeCells * Number(approach.rangeMultiplier || 1))
                : rangeCells;
            if (distance > castRangeCells * TERRAIN_CELL) {
                // B101 ZzzInterface.cpp MOVEMENT_SKILL: audited warrior/wizard target
                // families path toward SelectedCharacter and dispatch only after
                // their exact CheckTile stop distance. No out-of-range fake packet.
                if (!context?.fromPendingPcMovementSkill
                    && target
                    && approach
                    && this._queuePendingPcMovementSkill(slot, skill, target, rangeCells, approach)) {
                    return true;
                }
                return false;
            }
        }

        const approachNow = pcSkillApproachPolicy(wireType);
        if (approachNow?.requiresWall && target && !this._pcCheckSkillWall(target)) return false;

        // wsclientinline.h SendRequestMagic: 300ms, with the audited bypasses.
        // This guard belongs to the actual send, not the MOVEMENT_SKILL queue.
        const now = Date.now();
        const throttleBypass = wireType === 40 || wireType === 261 || wireType === 263;
        if (!throttleBypass && this._lastMagicTick && Math.abs(now - this._lastMagicTick) < 300) return false;

        const request = buildPcSkillCastRequest({
            skillType: wireType,
            heroKey: this._heroServerKey,
            heroTile: this._heroServerTile,
            heroPosition: this.playerChar.position,
            heroFacingDegrees: Number(this.playerChar.rotation?.y ?? 0) * 180 / Math.PI,
            target,
            groundPoint,
        });
        if (!request) {
            this._missingPcSkillCastOwner = this._missingPcSkillCastOwner || new Set();
            if (!this._missingPcSkillCastOwner.has(wireType)) {
                this._missingPcSkillCastOwner.add(wireType);
                console.info(`[SkillTX] AT_SKILL ${wireType} (${skillTypeName(wireType) || 'sem nome'}) sem owner de cast PC auditado — fail-closed; 0xDB genérico removido.`);
                this.chatInfo(`Skill ${skillTypeName(wireType) || wireType}: lógica de cast PC ainda não portada.`);
            }
            return false;
        }

        this._lastMagicTick = now;
        // Main 5.2 UseSkillWarrior/Wizard/Elf sets the caster action locally
        // before SendRequestMagic/Continue; the Hero RX echo intentionally does
        // not replay it. FIX43 restores that missing local presentation owner.
        const localCaster = this._resolveServerActor(this._heroServerKey);
        if (localCaster) this._playServerSkillAnimation(localCaster, wireType);
        if (request.kind === 'magic') {
            this.muProtocol.requestMagic(request.type, request.key)
                .then(() => console.info(`[Skill] 0x19 ${request.owner} type=${request.type} key=${request.key} → GS`))
                .catch((e) => console.warn('[Skill] 0x19 send falhou:', e?.message || e));
            this._refreshStatsHud();
            return true;
        }
        if (request.kind === 'continue') {
            const sendPcContinue = async () => {
                // Main 5.2 sends a one-node MOVE first for only the audited
                // pre-facing families. Preserve write order exactly.
                if (request.preFacing) {
                    if (Number.isFinite(request.preFacing.angleDegrees)) {
                        this.playerChar.rotation.y = pcDegreesToThreeYaw(request.preFacing.angleDegrees);
                    }
                    await this.muProtocol.requestPcFacingMove(
                        request.preFacing.x, request.preFacing.y, request.preFacing.dir,
                    );
                }
                await this.muProtocol.requestMagicContinue(
                    request.type, request.x, request.y, request.angle,
                    request.dest, request.tpos, request.targetKey, request.skillSerial,
                );
            };
            sendPcContinue()
                .then(() => console.info(`[Skill] 0x1E ${request.owner} type=${request.type} xy=${request.x},${request.y} angle=${request.angle} tpos=${request.tpos} key=${request.targetKey}${request.preFacing ? ' preFacing=1' : ''} → GS`))
                .catch((e) => console.warn('[Skill] 0x1E send falhou:', e?.message || e));
            this._refreshStatsHud();
            return true;
        }
        return false;
    }

    /**
     * R24 — sincroniza companions derivados do CharSet real do herói.
     * Nenhum modelo é inferido aqui: Scene recebeu markers do PlayerComposer,
     * que por sua vez deriva do codec/owner PC. Fail-closed quando ausente.
     */
    async _syncHeroPetCompanions({ announce = false } = {}) {
        if (!this.pets || !this.playerChar || !this.scene) return false;
        this.pets.setHeroRenderer?.(this.scene._playerRenderer || null);

        // Dark Spirit: DL + STAFF:5 -> CSPetSystem MODEL_DARK_SPIRIT.
        const darkSpirit = this.scene._playerDarkSpirit;
        if (darkSpirit?.petModelPath && this.pets.summon) {
            const pet = await this.pets.summon(this.playerChar, 'dark_raven', darkSpirit);
            if (announce && pet) this.chatInfo?.(`Dark Spirit invocado (modelo real ${darkSpirit.petModelPath}).`);
        } else {
            this.pets.dismiss?.(this.playerChar);
        }

        // HELPER:0 companion voador. IMP continua bone-attached, portanto não
        // entra neste owner.
        if (this.scene._playerHelper && this.pets?.summonHelper) {
            const helperInfo = this.scene._playerHelper;
            const helper = await this.pets.summonHelper(this.playerChar, 1.0, helperInfo);
            if (announce && helper) this.chatInfo?.(`Helper companion invocado (${helperInfo?.petModelPath || 'Player/Helper01.bmd'}).`);
        } else {
            this.pets.dismissHelper?.(this.playerChar);
        }

        // Fenrir e riders ocupam a mesma lane de mount/CreateBug. O CharSet
        // autoritativo decide qual spec existe; nenhuma preferência local.
        const rider = this.scene._playerRider;
        const fenrir = this.scene._playerFenrir;
        const safeZone = this.scene.mainObject?.userData?.muMovementContext?.safeZone;
        if (rider?.petModelPath && this.pets?.summonMount) {
            const mount = await this.pets.summonMount(this.playerChar, { ...rider, safeZone });
            if (announce && mount) this.chatInfo?.(`${rider.species} invocado (modelo real ${rider.petModelPath}).`);
        } else if (fenrir?.petModelPath && this.pets?.summonMount) {
            const mount = await this.pets.summonMount(this.playerChar, { ...fenrir, safeZone });
            if (announce && mount) {
                const opt = fenrir.option ?? 0;
                this.chatInfo?.('Fenrir ' + (opt === 1 ? 'Black' : opt === 2 ? 'Blue' : opt === 4 ? 'Gold' : 'Red') + ' invocado (modelo real).');
            }
        } else {
            this.pets.dismissMount?.(this.playerChar);
        }

        // F3:72 Element[0]/Element[1] are independent PC pet lanes
        // (gDarkSpirit/gElementPetFirst/gElementPetSecond). They are not the
        // same owner as PetIndex/helper and therefore must survive alongside it.
        const preview = this.serverCustomPreview?.get?.(this._heroServerKey) || this.serverCustomPreview?.getByName?.(this.playerChar?.name) || null;
        if (preview && ((preview.element?.[0] || 0) > 0 || (preview.element?.[1] || 0) > 0)) {
            await this.pets.syncPreviewElements?.(this.playerChar, preview);
        } else {
            this.pets.dismissPreviewElements?.(this.playerChar);
        }
        return true;
    }

    async _assignDefaultSkills() {
        // R86: F3:11 + SkillAttribute[type] are the only production owners.
        // The legacy SkillSystem/SkillData catalog used to instantiate local
        // damage and nearest-monster simulation even though the visible bar was
        // server-driven. Keep no second gameplay authority alive.
        this.skills = null;
        if (this._serverSkillState && this._serverSkillState.size > 0) {
            this._renderServerSkillBar();
            console.info('[Skills]', this.playerChar.name, 'barra do servidor aplicada:',
                this._serverSkillNumber ?? this._serverSkillState.size, 'skills (F3:11 real; sem SkillSystem local)');
        } else {
            this.skillBar.clear();
            console.info('[Skills]', this.playerChar.name, 'aguardando magicList F3:11 do servidor (barra limpa; sem catálogo/dano local)');
        }
    }


    _applyServerTeleportPosition({ map, x, y, angle }) {
        if (!this.playerChar) return false;
        const tx = (x + 0.5) * 100 - 12800;
        const tz = 12800 - (y + 0.5) * 100;
        const groundY = this.scene?.heights
            ? this.scene.terrainHeightAt(tx, tz)
            : (this.playerChar.position?.y || 0);
        this.playerChar.position.set(tx, groundY, tz);
        this.playerChar.targetPos = null;
        this._pendingPcSkillCast = null;
        this.playerChar.velocity?.set?.(0, 0, 0);
        this._netMovePending = null;
        this._netMoveUnacked = [];
        this._heroServerTile = { x, y };
        this.playerChar.rotation.y = muDirectionToThreeYaw(angle);
        if (this.scene?.mainObject) this.scene.camera.setTarget(tx, groundY + 150, tz);
        console.info(`[MU] 0x1C TELEPORT aplicado: tile(${x},${y}) map=${map} angle=${angle}`);
        return true;
    }

    async _handleServerTeleport(msg) {
        const { flag, map, x, y, angle } = msg || {};
        if (![flag, map, x, y, angle].every(Number.isInteger)) return false;

        const moveReq = this._lastMoveCustomRequest;
        if (moveReq && Date.now() - moveReq.sentAt <= 30000) {
            const mapMatch = moveReq.mapNumber === map;
            const tileMatch = moveReq.cx === x && moveReq.cy === y;
            const verdict = `${mapMatch ? 'map=OK' : 'map=MISMATCH'} ${tileMatch ? 'tile=OK' : 'tile=DIFF'}`;
            console[mapMatch ? 'info' : 'warn'](`[MoveCustom R83] RX 0x1C ${verdict}: requested map=${moveReq.mapNumber} tile=(${moveReq.cx},${moveReq.cy}) -> server map=${map} tile=(${x},${y}) flag=${flag}`);
            // A map mismatch is actionable protocol/server evidence. Coordinate
            // differences can be legitimate server-side safe-position snapping,
            // so they are logged but never overridden by the Web client.
            if (!mapMatch) this.chatInfo?.(`MoveCustom: servidor respondeu mapa ${map}, pedido ${moveReq.mapNumber}; usando autoridade do servidor.`);
            if (flag !== 0) this._lastMoveCustomRequest = null;
        }
        if (!this.playerChar || !this.mapManager || !this.scene) {
            this._pendingServerTeleport = msg;
            console.info(`[MU] 0x1C TELEPORT pré-world — buffer flag=${flag} map=${map}`);
            return false;
        }

        if (flag === 0) return this._applyServerTeleportPosition(msg);
        this._ui?.inventoryWin?._cancelDrag?.();

        // Serialize map loads. Generation alone não basta: loadRealMap aplica
        // buffers na Scene; duas promises concorrentes poderiam terminar fora
        // de ordem e deixar o mapa velho como último writer. Com a fila, o
        // pedido mais novo sempre executa depois do anterior; generation evita
        // ACK/posição do pedido obsoleto.
        const generation = ++this._teleportGeneration;
        // R89: a newer MoveCustom inside the SAME authored WorldN must not
        // invalidate a full terrain/ObjectN stage already in progress. Physical
        // R88 evidence showed Lorencia taking ~40s, then being discarded only
        // because Bar/Mago/Ferreiro teleports incremented the generation while
        // the same World1 assets were staging. Track the latest asset-world
        // intent separately: a newer coordinate/map sharing this asset world
        // may reuse the completed atomic stage; a genuinely different WorldN
        // still cancels publication.
        const requestedWorldDesc = getPcWorldDescriptor(map);
        this._latestTeleportIntent = requestedWorldDesc
            ? { generation, map, assetWorld: requestedWorldDesc.assetWorld, x, y, angle }
            : { generation, map, assetWorld: null, x, y, angle };
        const run = async () => {
            // R90: coalesce queued MoveCustom/map ACKs. The old serialized chain
            // still executed every intermediate destination after it was already
            // superseded, so rapid moves staged World1/World3/World4 one-by-one
            // before the latest target and produced long spikes / an unrelated
            // previously requested map on screen. Latest server 0x1C wins.
            if (generation !== this._teleportGeneration) {
                console.info(`[MU R90] 0x1C queued stale ignorado antes de staging gen=${generation}`);
                return false;
            }
            this._netMovePending = null;
            this._netMoveUnacked = [];
            this.playerChar.targetPos = null;
            this.playerChar.velocity?.set?.(0, 0, 0);

            try {
                const worldDesc=getPcWorldDescriptor(map);
                if(!worldDesc)throw new Error(`server map inválido: ${map}`);
                // R81 keeps the PC logical teleport transaction (clear viewport,
                // authoritative position, F3:12) but reuses immutable WorldN
                // assets when MoveCustom targets another coordinate on the same
                // already-complete map. Re-decoding 2985 placements on every
                // Lorencia move cost ~5s in the physical R80 log and cannot
                // change the authored map content.
                const reuseWorldAssets = this.scene.hasStableRealMap?.(worldDesc.assetWorld) === true;
                let applied = true;
                if (reuseWorldAssets) {
                    console.info(`[MU R83] 0x1C same-world asset reuse World${worldDesc.assetWorld}; sem rebuild terrain/ObjectN`);
                } else {
                    // PC ReceiveTeleport calls LoadWorld synchronously after a
                    // cross-world 0x1C; the native render loop cannot present an
                    // unrelated old map mid-load. Web loading yields to the
                    // browser, so conceal the previous REAL graph until the
                    // destination is atomically committed. No fake/loading map.
                    this.scene.beginRealMapTransition?.(worldDesc.assetWorld);
                    // Different maps publish atomically only after terrain +
                    // ObjectN/BMD owners are complete, so a progressive loader
                    // can no longer expose a disappearing/fragmented scene.
                    applied = await this.scene.loadRealMap(worldDesc.assetWorld, {
                        atomic: true,
                        cooperativeObjects: true,
                        objectIdleMs: 2,
                        objectSliceMs: 12,
                        // Stop expensive ObjectN/BMD staging as soon as a newer
                        // teleport targets another authored WorldN. A newer
                        // coordinate inside the SAME WorldN keeps this build
                        // alive and reuses it when its queued transaction runs.
                        acceptContinue: () => {
                            if (generation === this._teleportGeneration) return true;
                            const latest = this._latestTeleportIntent;
                            return Number.isInteger(latest?.assetWorld)
                                && latest.assetWorld === worldDesc.assetWorld;
                        },
                        // A newer 0x1C can arrive while BMDs are still staging.
                        // Never publish the obsolete destination even for one frame.
                        acceptPublish: () => {
                            if (generation === this._teleportGeneration) return true;
                            const latest = this._latestTeleportIntent;
                            return Number.isInteger(latest?.assetWorld)
                                && latest.assetWorld === worldDesc.assetWorld;
                        },
                    });
                }
                if (generation !== this._teleportGeneration) {
                    console.info(`[MU] 0x1C stale map load concluído sem ACK/posição gen=${generation}`);
                    return false;
                }
                if (!applied) throw new Error(`World${worldDesc.assetWorld} real não aplicado`);

                // Commit logical map/viewport state only after the real destination
                // terrain + ObjectN graph has succeeded. R80 cleared these BEFORE
                // loading, so a missing tile left the player on the old visual map
                // with every NPC/monster/drop already erased.
                await this.mapManager.loadMap(worldDesc.serverMap);
                this._heroServerTile = null;
                this.groundItemLayer?.clear?.();
                this.groundItems.reset();
                this.monsters?.clear?.();
                this.playerViewport?.clear?.();
                this.serverCustomPreview?.clear?.();
                this.drops?.clear?.(); // somente resíduos offline/harness; nunca recria loot.
                if (this.scene.attGrid) {
                    const committedMap = this.mapManager.getCurrentMap();
                    if (committedMap) committedMap.pathGrid = this.scene.attGrid;
                }
                const curMap = this.mapManager.getCurrentMap();
                this._applyServerTeleportPosition(msg);
                // The authoritative map + hero position now refer to one owner.
                // Reveal only at this boundary; this also releases a hidden old
                // graph when a newer request returned to an already-stable map.
                this.scene.finishRealMapTransition?.({ commit: true });

                // Main 5.2 SendRequestFinishLoading(): C1 04 F3 12. O GS só
                // repovoa viewport depois deste ACK em map-change.
                if (this.muProtocol?.isConnected && this.muProtocol?.inGameLane?.()) {
                    await this.muProtocol.requestFinishLoading();
                }
                this.chatInfo?.(`Você entrou em ${curMap?.name || `Mapa ${map}`} (servidor).`);
                console.info(`[MU] 0x1C map-change concluído map=${map}; F3:12 enviado`);
                return true;
            } catch (e) {
                if (generation === this._teleportGeneration) {
                    // Latest destination failed: restore the previous REAL graph
                    // instead of leaving a permanent black transition. A stale
                    // transaction keeps it concealed because its newer successor
                    // owns the next decision.
                    this.scene.finishRealMapTransition?.({ commit: false });
                    console.error('[MU] 0x1C map-change falhou (fail-closed):', e);
                    this.chatInfo?.(`Falha ao carregar mapa ${map}: ${e.message || e}`);
                }
                return false;
            }
        };
        this._teleportLoadChain = this._teleportLoadChain.catch(() => false).then(run);
        return this._teleportLoadChain;
    }

    async requestGroundItemPickup(key) {
        if (!this.muProtocol?.isConnected || !this.muProtocol?.inGameLane?.()) return false;
        const item = this.groundItems.beginPickup(key);
        if (!item) return false;
        const pendingPickup = this.groundItems.pendingPickup;
        try {
            await this.muProtocol.requestGetItem(key);
            return true;
        } catch (e) {
            if (this.groundItems.pendingPickup === pendingPickup) this.groundItems.cancelPickup(key);
            console.warn(`[MU] 0x22 pickup TX falhou key=${key}:`, e.message);
            return false;
        }
    }

    requestInventoryWorldDrop(inventoryIndex, capturedRaw) {
        // Use only server-confirmed Hero tiles, never DOM pixels or predicted
        // render position. The GS validates whether the item may be discarded.
        if (this.state !== 'world' || !this._heroServerTile) return Promise.resolve(false);
        return this.requestInventoryDrop(inventoryIndex, this._heroServerTile.x, this._heroServerTile.y, capturedRaw);
    }

    async requestInventoryDrop(inventoryIndex, x, y, capturedRaw = null) {
        if (!this.muProtocol?.isConnected || !this.muProtocol?.inGameLane?.()) return false;
        if (this.state !== 'world' || !this.serverInventory.hasSnapshot) return false;
        if (this._equipmentMovePending || this._inventoryDropPending) {
            this.chatInfo('Aguarde a confirmação da movimentação anterior.');
            return false;
        }
        if (!Number.isInteger(inventoryIndex) || inventoryIndex < 0 || inventoryIndex >= 76) return false;
        if (![x, y].every(v => Number.isInteger(v) && v >= 0 && v <= 255)) return false;
        if (x !== this._heroServerTile?.x || y !== this._heroServerTile?.y) return false;
        const item = this.serverInventory.get(inventoryIndex);
        if (!item || item.raw.length !== 12) return false;
        if (capturedRaw && (capturedRaw.length !== 12 || !item.raw.every((v, i) => v === capturedRaw[i]))) return false;
        const pending = this._inventoryDropPending = { slot: inventoryIndex, x, y, raw: Uint8Array.from(item.raw) };
        try {
            // Existing PC wire: C1 06 23 X Y SLOT. Do not remove source or spawn
            // local loot here: RX 0x23 and 0x20 are independent authoritative events.
            await this.muProtocol.requestDropItem(inventoryIndex, x, y);
            if (this._inventoryDropPending === pending) this.chatInfo('Descarte solicitado. Aguardando o servidor.');
            return true;
        } catch (e) {
            if (this._inventoryDropPending === pending) {
                this._inventoryDropPending = null;
                this.chatInfo('Não foi possível enviar o descarte. O item foi mantido.');
            }
            console.warn(`[MU] 0x23 drop TX falhou slot=${inventoryIndex}:`, e.message);
            return false;
        }
    }

    _syncInventoryCacheFromMirror() {
        // Compatibility projections only: accepted mirror state is the owner.
        this._serverInventoryBySlot = new Map();
        for (let index = 0; index < this.serverInventory.capacity; index++) {
            const retained = this.serverInventory.get(index);
            if (retained) this._serverInventoryBySlot.set(index, { index, item: Array.from(retained.raw) });
        }
        this._serverInventory = Array.from(this._serverInventoryBySlot.values());
    }

    _resetInventorySession() {
        this._equipmentMovePending = null;
        this._inventoryDropPending = null;
        this._heroServerTile = null;
        this.groundItems?.reset?.();
        void this.groundItemLayer?.sync?.();
        this.serverInventory.reset();
        this.serverStorage?.endSession?.();
        this._syncInventoryCacheFromMirror();
        this._ui?.storageWin?.hide?.();
        this._ui?.inventoryWin?.hide?.();
    }

    _openServerStorageUI() {
        const storage=this._ui?.storageWin, inv=this._ui?.inventoryWin;
        if (!storage || !inv) { this._pendingStorageOpen=true; return false; }
        // NewUISystem::Show(INTERFACE_STORAGE): HideAllGroupA + show inventory.
        for (const key of ['charWindow','mailWin','partyWin','commandWin','questWin']) {
            const win=this._ui?.[key]; if (win?.visible) win.hide?.();
        }
        this.serverStorage.beginSession();
        inv.show?.();
        storage.show?.();
        this._layoutCharacterInventoryWindows();
        return true;
    }

    closeServerStorage() {
        if (!this.serverStorage?.open) return false;
        // CNewUIStorageInventory::ProcessClosing: backup picked item, delete all,
        // SendRequestStorageExit; NewUISystem also hides paired inventory.
        this._ui?.inventoryWin?.hide?.();
        this.serverStorage.endSession();
        this.muProtocol?.requestStorageExit?.().catch?.((e)=>console.warn('[MU] 0x82 storage-exit TX falhou:',e?.message||e));
        this._layoutCharacterInventoryWindows();
        return true;
    }

    changeServerWarehouse(targetWarehouse) {
        const target=Number(targetWarehouse);
        if (!Number.isInteger(target) || target < 1 || target > Number(this.serverStorage?.warehouseCount || 0) || target === this.serverStorage?.currentWarehouse) return false;
        // PC hides/closes the current storage (therefore 0x82) before 0x84 change.
        if (this._ui?.storageWin?.visible) this._ui.storageWin.hide();
        this.muProtocol?.requestChangeWarehouse?.(target).catch?.((e)=>console.warn('[MU] 0x84 warehouse-change TX falhou:',e?.message||e));
        return true;
    }

    async requestStorageEquipmentMove(srcType, srcIndex, dstType, dstIndex) {
        if (!this.serverStorage?.open || !this.muProtocol?.isConnected || !this.muProtocol?.inGameLane?.()) return false;
        if (![srcType,dstType].every((v)=>v===0||v===2)) return false;
        // Only the proven personal inventory (0) and storage (2) owners are accepted.
        const data=this.serverStorage.buildMoveData(srcType,srcIndex,dstType,dstIndex,this.serverInventory);
        if (!data) return false;
        return this.requestEquipmentMove(data);
    }

    async requestEquipmentMove(data) {
        if (!this.muProtocol?.isConnected || !this.muProtocol?.inGameLane?.()) return false;
        if (!this.serverInventory.hasSnapshot) return false;
        // Single-flight igual EquipmentItem do PC. O caller precisa fornecer os
        // campos reais do ITEM; a UI genérica não converte Item Web em wire fake.
        if (this._equipmentMovePending) return false;
        if (this._inventoryDropPending) return false;
        const pending = this._equipmentMovePending = {
            srcType: data?.srcType, srcIndex: data?.srcIndex,
            dstType: data?.dstType, dstIndex: data?.dstIndex,
            at: Date.now(),
        };
        try {
            await this.muProtocol.requestEquipmentItem(data);
            return true;
        } catch (e) {
            // A rejected send from an ended session must not release a newer move.
            if (this._equipmentMovePending === pending) this._equipmentMovePending = null;
            console.warn('[MU] 0x24 equipment TX falhou:', e.message);
            return false;
        }
    }

    _changeMap(mapId) {
        this._gotoScene('loading', {
            mapName: `Mapa ${mapId}`,
            duration: 1200,
            onDone: async () => {
                const worldDesc=getPcWorldDescriptor(mapId);
                if(!worldDesc)throw new Error(`server map inválido: ${mapId}`);
                await this.mapManager.loadMap(worldDesc.serverMap);
                // Mapa real do ATUAL mundo (OZB+tiles+att). Sem fallback fake.
                try {
                    const applied = await this.scene.loadRealMap(worldDesc.assetWorld);
                    if (!applied) throw new Error(`World${worldDesc.assetWorld} real não aplicado`);
                    if (this.scene.attGrid) {
                        const curMap = this.mapManager.getCurrentMap();
                        if (curMap) curMap.pathGrid = this.scene.attGrid;
                    }
                } catch (e) { console.error('[World] mapa real falhou no _changeMap:', e); }
                this.monsters.clear(); // aguarda novo viewport do GameServer
                const map = this.mapManager.getCurrentMap();
                await this._gotoScene('world');
                this.chatInfo(`Você entrou em ${map.name}`);
            }
        });
    }

    // ---------------------------------------------------------------
    // Loop principal
    // ---------------------------------------------------------------
    _scheduleRedDiag() {
        const diag = (typeof location !== 'undefined')
            ? new URLSearchParams(location.search).get('diag') : null;
        if (diag !== 'red') {
            console.info('[DIAG] red test desativado (use ?diag=red explicitamente).');
            return;
        }
        // AUTO-DIAGNÓSTICO COMPLETO em todo boot: o transporte confiável do
        // usuário é "Ctrl+F5 + colar o console" — então o veredito técnico
        // (atlas/geom/uniforms/câmera + pixel lido da GPU) precisa estar NAS
        // LINHAS [DIAG] do log, sem depender de instruções extras (a URL
        // ?diag=red não foi executada pelo usuário). O flash vermelho de 6s
        // se auto-restaura e o banner DOM explica o que está acontecendo.
        // Espera a CONDIÇÃO (server-select + terrain, até 30s) em vez de timer
        // fixo: em boot lento o teste não pode ser pulado — senão "nada apareceu"
        // ficaria ambíguo com o ramo de composição quebrada.
        const t0 = Date.now();
        const poll = () => {
            const s = this.scene;
            if (s && s.terrain && this.state === 'server-select') {
                this._runRedDiag(s);
            } else if (Date.now() - t0 < 30000) {
                setTimeout(poll, 1000);
            } else {
                console.info(`[DIAG] auto-teste vermelho não executou: condição (server-select + terrain) não atingida em 30s — state=${this.state}`);
            }
        };
        setTimeout(poll, 8000);
    }

    _runRedDiag(s) {
        // ---- Suíte de diagnóstico: tudo o que os probes pediam, no log ----
        try {
            const t = s.terrain, u = t.material.uniforms;
            // 1. Conteúdo real do canvas do atlas, linha a linha (pós-fix flipY
            //    os slots {0,1,5} do World95 devem estar na LINHA 3 colorida).
            let atlasInfo = 'sem-canvas';
            try {
                const c = u.uAtlas.value.image;
                const actx2 = c.getContext('2d');
                const rowAvg = (ry) => {
                    const d = actx2.getImageData(0, Math.floor(ry * c.height / 4), c.width, Math.floor(c.height / 4)).data;
                    let r = 0, g = 0, b = 0, n = 0;
                    for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
                    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)].join(',');
                };
                atlasInfo = `${c.width}x${c.height} flipY=${u.uAtlas.value.flipY} ver=${u.uAtlas.value.version} linhas(RGB)=[L0:${rowAvg(0)} L1:${rowAvg(1)} L2:${rowAvg(2)} L3:${rowAvg(3)}]`;
            } catch (e) { atlasInfo = 'ERRO: ' + e.message; }
            console.info('[DIAG] ATLAS: ' + atlasInfo);
            // 2. Geometria: NaN nas alturas (UV NaN → sample preto em GLSL)
            const p = t.geometry.attributes.position;
            let nan = 0, minY = 1e9, maxY = -1e9;
            for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (Number.isNaN(y)) nan++; else { if (y < minY) minY = y; if (y > maxY) maxY = y; } }
            console.info(`[DIAG] GEOM: vertices=${p.count} nanY=${nan} minY=${Math.round(minY)} maxY=${Math.round(maxY)}`);
            // 3. Uniforms: todas as texturas com imagem válida?
            const ui = (x) => x && x.value && x.value.image ? (x.value.image.width + 'x' + x.value.image.height) : (x ? 'SEM-IMAGE' : 'NULL');
            console.info(`[DIAG] UNIFORMS: atlas=${ui(u.uAtlas)} l1=${ui(u.uL1)} l2=${ui(u.uL2)} alpha=${ui(u.uAlpha)} light=${ui(u.uLight)}`);
            // 4. Câmera/mesh/fog: clipping ou fundo errado?
            const cam = s.camera.threeCamera;
            console.info(`[DIAG] CAM: pos=[${[cam.position.x, cam.position.y, cam.position.z].map(v => Math.round(v))}] near=${cam.near} far=${cam.far} fov=${Math.round(cam.fov)} | mesh=[${t.position.x},${t.position.y},${t.position.z}] vis=${t.visible} | bg=#${s.scene.background.getHexString()} fog=${s.scene.fog ? s.scene.fog.near + '-' + s.scene.fog.far : 'null'}`);
        } catch (e) {
            console.info('[DIAG] ERRO na coleta da suíte: ' + (e.message || e));
        }
            console.info('[DIAG] === AUTO-TESTE VERMELHO: escondendo terreno 6s — A TELA DEVE FICAR VERMELHA ===');
            s.terrain.visible = false;
            s.scene.background.set(0xff0000);
            // Banner DOM: o usuário não precisa adivinhar o que está vendo
            const banner = document.createElement('div');
            banner.textContent = 'DIAG: fundo VERMELHO + terreno escondido (6s)';
            banner.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#fff;color:#000;font:bold 14px monospace;padding:8px 14px;z-index:99999;border:2px solid #f00;border-radius:6px';
            document.body.appendChild(banner);
            // Hook síncrono: lê o pixel central do framebuffer NO MESMO TICK
            // do render (única forma válida sem preserveDrawingBuffer).
            const gl = s.renderer.getContext();
            const origRender = s.render.bind(s);
            let read = false;
            s.render = () => {
                origRender();
                if (!read) {
                    read = true;
                    const px = new Uint8Array(4);
                    gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
                    const r = px[0], g = px[1], b = px[2];
                    const veredito = r > 200 ? 'VERMELHO-NO-FRAMEBUFFER (apresentação OK — bug é a pintura do terreno)' :
                        (r < 10 && g < 10 && b < 10 ? 'PRETO-NO-FRAMEBUFFER (apresentação/GPU quebrada)' : 'COR-INESPERADA');
                    console.info(`[DIAG] PIXEL CENTRAL LIDO DA GPU = [${r},${g},${b},${px[3]}] → VEREDITO: ${veredito}`);
                }
            };
            setTimeout(() => {
                s.render = origRender;
                s.terrain.visible = true;
                s.scene.background.set(0x86a8c8);
                banner.remove();
                console.info('[DIAG] === AUTO-TESTE FINALIZADO: terreno e fundo restaurados ===');
            }, 6000);
    }

    _loop(rafNow = performance.now()) {
        const limit = Number(this._frameLimit || 60);
        const minFrameMs = 1000 / Math.max(1, limit);
        const elapsedSinceAccepted = rafNow - Number(this._frameLimitLast || 0);
        if (this._frameLimitLast && elapsedSinceAccepted + 0.2 < minFrameMs) {
            requestAnimationFrame(this._loop);
            return;
        }
        this._frameLimitLast = rafNow - Math.max(0, elapsedSinceAccepted - minFrameMs);
        try {
            this._tick(GameTimer);
            this._refreshFpsControl?.();
            this._refreshEngineDebugOverlay?.();
        } catch (e) {
            // O loop principal NUNCA pode morrer: loga (throttled) e segue
            const now = Date.now();
            if (!this._lastLoopErrAt || now - this._lastLoopErrAt > 1000) {
                this._lastLoopErrAt = now;
                console.error('[GameApp] erro no loop (frame ignorado):', e);
            }
        }
        // Heartbeat de render (1×/5s): prova de vida do loop no console do
        // usuário — se "LOOP VIVO" não aparecer, o rAF está parado (tela preta
        // sem erro é o sintoma clássico). framesAPintar conta _tick's; renders
        // conta scene.render() efetivos (via _renderProbe abaixo).
        this._loopFrames = (this._loopFrames || 0) + 1;
        const now2 = Date.now();
        if (!this._lastBeatAt) this._lastBeatAt = now2;
        if (now2 - this._lastBeatAt >= 5000) {
            const fps = Math.round((this._loopFrames * 1000) / (now2 - this._lastBeatAt));
            const ri = this.scene?.renderer?.info?.render;
            const renders = ri ? ri.frame : -1;
            const fp = this._framePerf || null;
            const worldLayer = this.scene?.worldObjectLayer;
            const animatedCullText = worldLayer && Number.isFinite(worldLayer._totalAnimated)
                ? ` animVis=${worldLayer._visibleAnimated}/${worldLayer._totalAnimated}` : '';
            const perfText = fp && fp.frames > 0
                ? ` cpuTick=${(fp.tickTotal / fp.frames).toFixed(1)}ms(avg)/${fp.tickMax.toFixed(1)}max` +
                  ` renderSubmit=${(fp.renderTotal / fp.frames).toFixed(1)}ms(avg)/${fp.renderMax.toFixed(1)}max` +
                  ` calls=${ri?.calls ?? -1} tris=${ri?.triangles ?? -1}${animatedCullText}`
                : animatedCullText;
            console.info(`[GameApp] LOOP VIVO: ${this._loopFrames} ticks/${Math.round((now2 - this._lastBeatAt) / 1000)}s (~${fps}/s), render.frame=${renders}, state=${this.state}${perfText}`);
            this._loopFrames = 0;
            this._lastBeatAt = now2;
            this._framePerf = null;
        }
        requestAnimationFrame(this._loop);
    }

    _tick(GameTimerRef) {
        const _perfTick0 = performance.now();
        let _perfRenderMs = 0;
        GameTimer.update();
        const dt = GameTimer.deltaTime;
        const elapsed = GameTimer.elapsed;

        if (this.state === 'world' && this.scene && this.playerChar) {
            const p = this.playerChar; // existe sempre neste bloco
            // Input de movimento REAL (WASD/click-to-move → terreno/colisão).
            // Antes o integrate nunca era chamado — WASD não movia o herói.
            let networkOwned = false;
            // PC MOVEMENT_SKILL resolves before the next authored movement step:
            // reaching Distance*1.2f stops approach and sends UseSkillWarrior.
            this._updatePendingPcMovementSkill?.();
            if (this.scene.cameraMode === 'game') {
                networkOwned=this._updateAuthoritativeMovement(dt);
                if(!networkOwned)Movement.integrate(p, this.scene.camera.threeCamera, dt);
            }
            // Character.update owns only offline click-to-move integration. On a
            // connected authoritative lane it must never advance position locally.
            if (!networkOwned) this.playerChar.update(dt);
            this.playerChar.buffContainer?.update(dt);
            const petServerAuthority = !!(this.muProtocol?.isConnected && this.muProtocol?.inGameLane?.());
            this.pets?.update(dt, this.monsters?.monsters, null, { serverAuthoritative: petServerAuthority });
            this.monsters?.updateAll(dt, p.position, p);
            this.mapManager?.update(dt, p.position, p.level);
            this.effects?.update(dt);
            this.groundItemLayer?.update?.(dt, elapsed);
            // DropManager remains an offline/harness owner; connected GS loot is
            // rendered/selected exclusively through groundItemLayer.
            this.drops?.update(dt, p.position);
            this.skillFx?.update(dt);
            this.floating?.update(dt, this.scene?.camera?.threeCamera);
            this.buffBar?.update(dt);
            this.hud?.update?.(dt);
            this.skillBar?.update?.(dt);
            MuHelper?.update?.(dt);
            // Câmera orbital segue o herói (target = posição do playerChar)
            this.scene.camera.setTarget(p.position.x, p.position.y + 150, p.position.z);
            this.scene.update(dt, elapsed);
            { const _r0 = performance.now(); this.scene.render(); _perfRenderMs += performance.now() - _r0; }
            // Efeitos 2/2 com update próprio (LevelUp flares, Death blood):
            // mesmo contrato do skillFx.update — remove quando update()==false.
            if (this._activeLevelFx && this._activeLevelFx.length) {
                for (let i = this._activeLevelFx.length - 1; i >= 0; i--) {
                    const fx = this._activeLevelFx[i];
                    let alive = true;
                    try { alive = fx.update(dt); } catch { alive = false; }
                    if (!alive) {
                        try { fx.dispose?.(); } catch { /* noop */ }
                        this._activeLevelFx.splice(i, 1);
                    }
                }
            }
        } else {
            this.scenes.update(dt);
            if (this.scene) this.scene.update(dt, 0); // câmera cinematográfica (tour)
            if (this.scene) { const _r0 = performance.now(); this.scene.render(); _perfRenderMs += performance.now() - _r0; }
        }

        // Prova visual objetiva por transição de estado. O readPixels ocorre
        // imediatamente após renderer.render(), quando o framebuffer ainda é
        // válido mesmo com preserveDrawingBuffer=false. Isso separa: loop vivo
        // de frame realmente apresentado e detecta contexto perdido/GL error.
        if (this.scene && this._lastFramebufferProbeState !== this.state) {
            this._lastFramebufferProbeState = this.state;
            try { this.scene.logFramebufferProbe?.(this.state); } catch (e) {
                console.warn('[RenderProbe] falhou:', e);
            }
        }

        Input.update();

        // R15 telemetry barata: separa CPU total do frame do tempo gasto na
        // chamada renderer.render (submit CPU; NÃO é timer GPU). A captura
        // física anterior tinha 3–6 fps sem dizer se o gargalo era update ou
        // render. O heartbeat agrega 5s, sem QPC/log por subsistema a cada frame.
        const _tickMs = performance.now() - _perfTick0;
        const fp = this._framePerf || (this._framePerf = {
            frames: 0, tickTotal: 0, tickMax: 0, renderTotal: 0, renderMax: 0,
        });
        fp.frames++;
        fp.tickTotal += _tickMs;
        fp.tickMax = Math.max(fp.tickMax, _tickMs);
        fp.renderTotal += _perfRenderMs;
        fp.renderMax = Math.max(fp.renderMax, _perfRenderMs);
    }

    chatInfo(text) {
        if (this.chat) this.chat._addSystem(text);
    }
}
