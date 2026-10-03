/**
 * Scene.js — Port de ZzzScene.cpp / ZzzLodTerrain.cpp / Widescreen.cpp
 *
 * Cenas 3D REAIS do cliente:
 *   Login/Server scene  : World95 (CreateLogInScene: gMapManager.WorldActive=94
 *                         → LoadWorld → "World95") + câmera SceneLogin
 *                         (Widescreen.cpp:116: pos (24475.8, 7581.6, 1834.5)
 *                         ângulos (-84, 0, -45), FOV 35, far 33000)
 *   Character scene     : WorldActive=74 → assets World75/Object75 + câmera
 *                         (9758.9, 18913.1, 500),
 *                         ângulos (-82, 0, -90), far 3500
 *   Main (jogo)         : mapa real do personagem (loadRealMap) + câmera
 *                         orbital do herói (pitch -48.5, yaw -45, dist 1000)
 *
 * Terreno REAL (TerrainWorld.js): alturas do TerrainHeight.OZB (×1.5),
 * tiles L1/L2/alpha do EncTerrain{N}.map DESCRIPTOGRAFADO (MapFileDecrypt),
 * colisão do EncTerrain{N}.att (decrypt+bux; sonda Lorencia wall[123,135]=5 ✓).
 */
import * as THREE from 'three';
import { Camera3D } from './Camera3D.js';
import {
    buildWorldTerrain, applyMuCamera, LOGIN_CAMERA, CHAR_CAMERA,
    MAP_SIZE, TERRAIN_SCALE, TERRAIN_SIZE, TW,
} from '../world/TerrainWorld.js';
import { composeCharacter, buildAnimationControl, buildEquipmentAttach, buildAccessoryRenderer, buildLinkedWeaponRenderer, setLinkedWeaponSafeZonePresentation, mergeEquipmentBodyRenderData, applyBodyEquipmentPresentation, pcCharacterScale, getPcTextureSkinIndex, playerVisualLoadIssues, unresolvedClassParts } from './PlayerComposer.js';
import { applyMuUpAxis, bmdToRenderData } from './BmdAdapter.js';
import { MUModelRenderer } from '../assets/MUModelRenderer.js';
import { MUAssets } from '../assets/MUAssetLoader.js';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { TerrainObjectLayer } from '../world/TerrainObjectWorld.js';
import { pcWorldActiveFromAssetWorld, pcInBloodCastle, pcInChaosCastle, pcInSwimLocomotionWorld } from '../game/PcMapContext.js';
import { loadItemEffectsLuaConfig, resolveRuneAuraForEquipment } from '../data/ItemEffectsLuaConfig.js';
import { PcRuneAura } from './PcRuneAura.js';

// Paridade PC (t-muhklmi5-a): Winmain.cpp:2142-2170 — clear color POR MAPA.
// Convenção de pasta↔WorldActive documentada no header (World95↔94,
// World75↔74): WorldActive = número da pasta − 1. Tabela da fonte:
//   WD_0LORENCIA (pasta World1)  → (10,20,14)/256  (verde-escuro sutil)
//   WD_2DEVIAS  (pasta World3)   → (0,0,10)/256
//   WD_10HEAVEN (pasta World11)  → (3,25,44)/256
//   CursedTemple WD_45..LV6      → (9,8,33)/256
//   InChaosCastle/InHellas/else  → (0,0,0)/256
// FogEnable=false default (ZzzOpenglUtil.cpp:33) — nenhum fog nestes mapas.
function pcClearColorForWorld(worldNumber) {
    // glClearColor do PC é valor LITERAL de framebuffer (pipeline
    // fixed-function, sem color management). O three r160+ gerencia cor:
    // new THREE.Color(r,g,b) assume linear e o renderer re-clareia para
    // sRGB na saída (#384f42 no lugar de #0a140e). setRGB com SRGBColorSpace
    // marca os valores como sRGB → working; a conversão de saída devolve
    // o byte exato da fonte no framebuffer (paridade byte-a-byte).
    const pc = (r, g, b) => new THREE.Color().setRGB(r / 256, g / 256, b / 256, THREE.SRGBColorSpace);
    if (worldNumber === 1) return pc(10, 20, 14);        // WD_0LORENCIA
    if (worldNumber === 3) return pc(0, 0, 10);          // WD_2DEVIAS
    if (worldNumber === 11) return pc(3, 25, 44);         // WD_10HEAVEN
    if (worldNumber >= 46 && worldNumber <= 51) return pc(9, 8, 33); // CursedTemple LV1-6
    return pc(0, 0, 0);                                    // default (preto)
}

export class GameScene {
    constructor(container) {
        this.container = container;
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.mainObject = null;
        this.objects = [];
        this._initialized = false;
        this.cameraMode = 'none';   // 'login' | 'char' | 'game'
        this.worldObjectLayer = null;
        this._renderSize = new THREE.Vector2();
        // R21: identidade explícita dos owners de mundo. Sem isso, voltar de
        // Character Create disparava outro build de World75/Object75 apesar de
        // os mesmos owners já estarem ativos, causando pop/black-gap e uploads
        // GPU repetidos.
        this._terrainWorldNumber = null;
        this._objectsWorldNumber = null;
        this._charWorldPromise = null;
        this._charWorldLoading = false;
        this._charWorldReady = false;
        this._bodyLightColor = new THREE.Color(1, 1, 1);
        // R90: PC ReceiveTeleport performs LoadWorld synchronously, so no frame
        // can expose the previous map while a different WorldN is loading. The
        // Web loader is cooperative/async; this transition owner hides only the
        // old real world graph (terrain/ObjectN/hero) until the destination is
        // atomically committed. No placeholder geometry is created.
        this._realMapTransition = null;
    }

    beginRealMapTransition(targetWorld = null) {
        if (!this._realMapTransition) {
            this._playerVisualGeneration = (this._playerVisualGeneration || 0) + 1;
            this._realMapTransition = {
                targetWorld: Number.isInteger(targetWorld) ? targetWorld : null,
                terrain: this.terrain || null,
                terrainVisible: this.terrain?.visible ?? false,
                layer: this.worldObjectLayer || null,
                layerVisible: this.worldObjectLayer?.root?.visible ?? false,
                mainObject: this.mainObject || null,
                mainVisible: this.mainObject?.visible ?? false,
            };
        } else if (Number.isInteger(targetWorld)) {
            this._realMapTransition.targetWorld = targetWorld;
        }
        // Capture actual current world pixels once, before hiding its owners.
        // Cooperative loading can then present this frozen frame, never the
        // exposed clear color. No substitute terrain or simulated destination.
        if (!this._realMapTransition.frozenFrame) {
            this._realMapTransition.frozenFrame = this._captureTransitionFrame();
        }
        this._enforceRealMapTransitionHidden();
        return true;
    }

    _captureTransitionFrame() {
        const renderer = this.renderer;
        const camera = this.camera?.threeCamera;
        if (!renderer || !camera || !this.scene) return null;
        const savedTarget = renderer.getRenderTarget();
        const savedViewport = renderer.getViewport(new THREE.Vector4());
        const savedScissor = renderer.getScissor(new THREE.Vector4());
        const savedScissorTest = renderer.getScissorTest();
        const savedAutoClear = renderer.autoClear;
        let target, material, geometry;
        try {
            const size = renderer.getDrawingBufferSize(new THREE.Vector2());
            target = new THREE.FramebufferTexture(Math.max(1, size.x), Math.max(1, size.y));
            target.colorSpace = THREE.NoColorSpace;
            // Render to the actual canvas and copy its final framebuffer bytes
            // immediately. No readback, no render-target transfer mismatch,
            // and no dependence on preserveDrawingBuffer across browser frames.
            renderer.setRenderTarget(null);
            renderer.setScissorTest(false);
            renderer.autoClear = true;
            renderer.render(this.scene, camera);
            renderer.copyFramebufferToTexture(new THREE.Vector2(0, 0), target);
            geometry = new THREE.PlaneGeometry(2, 2);
            material = new THREE.ShaderMaterial({
                uniforms: { map: { value: target } },
                vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
                fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main(){gl_FragColor=texture2D(map,vUv);}',
                depthTest: false, depthWrite: false, toneMapped: false,
            });
            const scene = new THREE.Scene();
            scene.add(new THREE.Mesh(geometry, material));
            return { target, geometry, material, scene, camera: new THREE.Camera() };
        } catch (e) {
            target?.dispose?.(); geometry?.dispose?.(); material?.dispose?.();
            console.warn('[World FIX2] snapshot de transição indisponível:', e?.message || e);
            return null;
        } finally {
            renderer.setRenderTarget(savedTarget);
            renderer.setViewport(savedViewport);
            renderer.setScissor(savedScissor);
            renderer.setScissorTest(savedScissorTest);
            renderer.autoClear = savedAutoClear;
        }
    }

    _enforceRealMapTransitionHidden() {
        if (!this._realMapTransition) return false;
        if (this.terrain) this.terrain.visible = false;
        if (this.worldObjectLayer?.root) this.worldObjectLayer.root.visible = false;
        if (this.mainObject) this.mainObject.visible = false;
        return true;
    }

    finishRealMapTransition({ commit = true } = {}) {
        const t = this._realMapTransition;
        if (!t) return false;
        if (commit) {
            if (this.terrain) this.terrain.visible = true;
            if (this.worldObjectLayer?.root) this.worldObjectLayer.root.visible = true;
            if (this.mainObject) this.mainObject.visible = (this.cameraMode === 'game');
        } else {
            // Restore only owners that are still the same graph. If an atomic
            // commit already replaced them, never resurrect disposed old owners.
            if (t.terrain && t.terrain === this.terrain) t.terrain.visible = t.terrainVisible;
            if (t.layer?.root && t.layer === this.worldObjectLayer) t.layer.root.visible = t.layerVisible;
            if (t.mainObject && t.mainObject === this.mainObject) t.mainObject.visible = t.mainVisible;
        }
        t.frozenFrame?.target?.dispose?.();
        t.frozenFrame?.geometry?.dispose?.();
        t.frozenFrame?.material?.dispose?.();
        this._realMapTransition = null;
        return true;
    }

    hasRealMapTransition() {
        return Boolean(this._realMapTransition);
    }

    initialize() {
        if (this._initialized) return;
        this._initialized = true;

        this.renderer = new THREE.WebGLRenderer({
            // PC Main 5.2: MSAA existe apenas dentro de #ifdef
            // LDS_ADD_MULTISAMPLEANTIALIASING (ZzzOpenglUtil.cpp:722) —
            // DESATIVADO no build real do cliente. O MSAA 4x ligado custava
            // caro em todo frame (console físico: ~9fps nas cenas de
            // login/char). Paridade PC = false.
            antialias: false,
            alpha: false,
            depth: true,
            stencil: false,
            powerPreference: 'high-performance',
        });
        // R89: keep Three's LINK/COMPILE validation enabled. It runs when a
        // program is compiled, not once per draw. R88 disabled it and the
        // physical browser could only report hundreds of `useProgram: program
        // not valid` messages without the actual shader compiler diagnostic.
        // This has no steady-frame shader check loop and makes regressions
        // fail with the real GLSL source error instead of silently stuttering.
        this.renderer.debug.checkShaderErrors = true;
        const initialRect = this.container.getBoundingClientRect();
        this.renderer.setSize(initialRect.width || window.innerWidth, initialRect.height || window.innerHeight, false);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        // PC Main 5.2 OpenGL fixed-function NÃO tem shadow-map pass: sombra
        // do terreno vem do lightmap real TerrainLight.OZJ (ZzzLodTerrain.cpp
        // OpenTerrainLight → terreno shader já amostra uLight; MuTerrain.js
        // desativa receiveShadow por esse motivo). shadowMap PCFSoft 2048²
        // custava 1 render-pass extra inteiro por frame. Paridade PC =
        // enabled:false.
        this.renderer.shadowMap.enabled = false;
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.inset = '0';
        this.renderer.domElement.style.zIndex = '0';
        this.renderer.domElement.dataset.muRenderer = 'webgl';
        this.container.appendChild(this.renderer.domElement);

        // Contexto WebGL: nunca tratar render.frame crescente como prova de
        // apresentação. Context loss e canvas invisível precisam ser explícitos.
        const canvas = this.renderer.domElement;
        const gl = this.renderer.getContext();
        const glName = gl?.constructor?.name || 'unknown';
        console.info(`[Render] contexto=${glName} drawingBuffer=${gl?.drawingBufferWidth || 0}x${gl?.drawingBufferHeight || 0}`);
        canvas.addEventListener('webglcontextlost', (ev) => {
            ev.preventDefault();
            console.error('[Render] WEBGL CONTEXT LOST — recursos GPU precisam ser reconstruídos.');
        });
        canvas.addEventListener('webglcontextrestored', () => {
            console.warn('[Render] WEBGL CONTEXT RESTORED — recarregue/recrie recursos GPU antes de confiar no frame.');
        });

        this.scene = new THREE.Scene();
        // ZzzScene.cpp limpa Login/Character com preto e força FogEnable=false.
        // Sky/água/ambiente precisam vir dos assets/objects reais, nunca de
        // background/fog inventados pelo port.
        this.scene.background = new THREE.Color(0x000000);
        this.scene.fog = null;

        this.camera = new Camera3D();

        // Main 5.2 fixed-function BMD/terrain lighting is supplied by each
        // source owner (BodyLight/PrimaryTerrainLight), not by scene-global
        // Three.js lamps. R73 deliberately mounts no invented sun/hemisphere.
        // Terreno REAL entra via loadLoginWorld/loadRealMap (pipeline OZB+tiles+att
        // decrypt) — NENHUM terreno procedural (política: 0 placeholder/0 simulação).
        // mainObject (herói) só existe com o personagem BMD real (PlayerComposer).

        window.addEventListener('resize', () => this._onResize());
    }

    // ------------------------------------------------------------------
    // MUNDO DE LOGIN (CreateLogInScene: WorldActive=94 → World95 real)
    // ------------------------------------------------------------------
    async loadLoginWorld() {
        // Qualquer World75 ainda em background deixa de ter autoridade assim
        // que o fluxo retorna ao login. O resultado assíncrono será descartado.
        this._invalidateCharacterWorldLoad('login');
        try {
            this._reportWorldStatus?.('Carregando mundo de login (World95 real: oceano + ilha)...');
            const built = await buildWorldTerrain(95, { loginScene: true });
            this._applyBuiltTerrain(built, 95);
            // R12.3: o boot não pode ficar preso esperando TODOS os Object95 BMD
            // + texturas. O PC já apresenta a UI enquanto a cena termina seu
            // trabalho. Terreno+câmera são o gate crítico; objetos reais entram
            // em background. Zero fake: não desenhamos substituto, apenas não
            // bloqueamos a navegação por uma carga pesada/ausente.
            this._loginObjectsPromise = this._replaceWorldObjects(95)
                .then((r) => { this._loginWorldObjectsReady = Boolean(r || this._objectsWorldNumber === 95); return r; })
                .catch((e) => { console.warn('[WorldObjects] World95 background FAIL:', e); return null; });
            // R22 LATENCY: terrain + authored camera are the interactive first-paint
            // gate. Object95 (ships/masts/fairies) keeps loading from the same real
            // owner in background; GameApp may join it for a short atomic budget via
            // waitLoginWorldReady(), but a slow BMD can no longer stall UI for 8s.
            // Zero placeholders: missing objects remain absent until their real owner
            // is ready.
            // NewRenderLogInScene(): FogEnable=false + glClearColor preto.
            // A composição (oceano/sky/barcos) é responsabilidade de World95.
            this.scene.background = new THREE.Color(0x000000);
            this.scene.fog = null;
            this.cameraMode = 'login';
            applyMuCamera(this.camera.threeCamera, LOGIN_CAMERA);
            this._reportWorldStatus?.('World95 aplicado (oceano/ilha reais, câmera SceneLogin -84°/-45°).');
            return true;
        } catch (e) {
            this._reportWorldStatus?.(`Mundo de login indisponível: ${e.message}`);
            return false;
        }
    }

    async waitLoginWorldReady(timeoutMs = 350) {
        if (this._terrainWorldNumber === 95 && this._objectsWorldNumber === 95) return true;
        const p = this._loginObjectsPromise;
        if (!p) return false;
        if (!(timeoutMs > 0)) return Boolean(await this._loginObjectsPromise);
        let timer = null;
        try {
            return Boolean(await Promise.race([
                p.then((r) => Boolean(r || this._objectsWorldNumber === 95)),
                new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); }),
            ]));
        } finally { if (timer) clearTimeout(timer); }
    }

    /** Câmera da cena de personagem (SceneFlag == CHARACTER_SCENE). */
    applyCharacterSceneCamera() {
        this.cameraMode = 'char';
        this.charFocus = this.charFocus || null; // alvo do lookAt (setado pelo preview)
        applyMuCamera(this.camera.threeCamera, CHAR_CAMERA);
    }

    // ------------------------------------------------------------------
    // MUNDO DA CENA DE PERSONAGENS: WorldActive=74 é o ID lógico, mas
    // MapManager::LoadWorld usa iMapWorld=WorldActive+1. Portanto os assets
    // autoritativos são Data/World75 + Data/Object75 (PC e mobile confirmam).
    // ------------------------------------------------------------------
    async loadCharacterWorld() {
        // PC CreateCharacterScene calls LoadWorld(World75) before opening the
        // Character Select UI. R84 mirrors that owner: terrain + Object75 are
        // fully staged and published together; no frame may observe half World95
        // / half World75 and callers awaiting this method now wait for the real
        // world instead of receiving an immediate synthetic success.
        this.scene.background = new THREE.Color(0x000000);
        this.scene.fog = null;
        this.cameraMode = 'char';
        applyMuCamera(this.camera.threeCamera, CHAR_CAMERA);

        if (this._terrainWorldNumber === 75 && this.terrain
            && this._objectsWorldNumber === 75 && this.worldObjectLayer) {
            this._charWorldReady = true;
            this._reportWorldStatus?.('World75/Object75 já ativos — owner reutilizado sem rebuild.');
            return true;
        }

        if (this._charWorldLoading && this._charWorldPromise) {
            this._reportWorldStatus?.('World75/Object75 já carregando — join no owner existente.');
            return Boolean(await this._charWorldPromise);
        }

        const epoch = (this._charWorldEpoch || 0) + 1;
        this._charWorldEpoch = epoch;
        this._charWorldLoading = true;
        this._charWorldReady = false;
        this._bodyLightColor = new THREE.Color(1, 1, 1);
        this._reportWorldStatus?.('Carregando Character Select PC (World75 + Object75 staged, commit atômico)...');

        this._charWorldPromise = (async () => {
            let built = null;
            let stagedLayer = null;
            try {
                built = await buildWorldTerrain(75, { loginScene: true });
                if (epoch !== this._charWorldEpoch || this.cameraMode !== 'char') {
                    this._disposeBuiltTerrain(built);
                    built = null;
                    return false;
                }

                stagedLayer = new TerrainObjectLayer(this);
                const objects = await stagedLayer.load(75, {
                    cooperative: true,
                    idleMs: 16,
                    staged: true,
                    terrainLightMesh: built.mesh,
                });
                if (epoch !== this._charWorldEpoch || this.cameraMode !== 'char') {
                    stagedLayer.dispose();
                    stagedLayer = null;
                    this._disposeBuiltTerrain(built);
                    built = null;
                    return false;
                }

                // Single synchronous publication boundary. The old terrain and
                // object owner remain visible until BOTH destination owners have
                // completed; _applyBuiltTerrain retires old terrain only here.
                const priorObjects = this.worldObjectLayer;
                this._applyBuiltTerrain(built, 75);
                built = null;
                this.worldObjectLayer = stagedLayer;
                this._objectsWorldNumber = 75;
                this._activeWorldObjectsPromise = Promise.resolve(objects);
                this._activeWorldObjectsNumber = 75;
                stagedLayer.activate();
                // R90 async adaptation of PC's synchronous LoadWorld: keep the
                // newly committed graph concealed until GameApp applies the
                // authoritative teleport position / viewport transaction.
                this._enforceRealMapTransitionHidden();
                stagedLayer = null;
                priorObjects?.dispose?.();
                this._recordWorldObjectDiagnostics(75, objects);
                this._charWorldReady = true;
                this._reportWorldStatus?.('World75/Object75 REAL publicados atomicamente (WorldActive=74).');
                return true;
            } catch (e) {
                if (stagedLayer) { try { stagedLayer.dispose(); } catch (_) {} }
                if (built) this._disposeBuiltTerrain(built);
                this._reportWorldStatus?.(`World75/Object75 indisponível: ${e.message}; owner anterior preservado, sem placeholder.`);
                console.warn('[CharacterWorld R84] staged load FAIL:', e);
                return false;
            } finally {
                if (epoch === this._charWorldEpoch) this._charWorldLoading = false;
            }
        })();

        return Boolean(await this._charWorldPromise);
    }

    async waitCharacterWorldReady(timeoutMs = 8000) {
        if (this._terrainWorldNumber === 75 && this._objectsWorldNumber === 75) return true;
        const p = this._charWorldPromise;
        if (!p) return false;
        if (!(timeoutMs > 0)) return Boolean(await p);
        let timer = null;
        try {
            return Boolean(await Promise.race([
                p,
                new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); }),
            ]));
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    _invalidateCharacterWorldLoad(reason = 'scene-change') {
        this._charWorldEpoch = (this._charWorldEpoch || 0) + 1;
        this._charWorldLoading = false;
        this._charWorldReady = false;
        this._bodyLightColor = new THREE.Color(1, 1, 1);
        if (reason) console.info(`[CharacterWorld] invalidate: ${reason}`);
    }

    /** Volta à câmera de jogo (orbital do herói — MuCamera.swift). */
    applyGameCamera() {
        this.cameraMode = 'game';
        if (this.mainObject) this.mainObject.visible = true; // heroi visivel no mundo
        // Camera3D owns gameplay FOV/near/far and the source orbit. R81 forced
        // far=2800 here, clipping real map objects well before Main 5.2's
        // default BuildMVP far (~4841.7 at CameraZoom=0).
        this.camera.update();
    }

    // ------------------------------------------------------------------
    // MUNDO DO JOGO — pipeline REAL (alturas OZB + tiles + colisão att)
    // ------------------------------------------------------------------

    /**
     * Herói do jogador no mundo — BMD REAL composto:
     * Player.bmd (esqueleto 60 bones/284 actions) + peças da classe
     * (PlayerComposer.composeCharacter — mesma pipeline validada do
     * CharacterPreview) → MUModelRenderer → mainObject.
     *
     * mainObject.userData.animationControl expõe play('idle'|'walk'|'run')
     * — contrato do Movement._animate (game/Movement.js:164).
     *
     * Fail-closed: peça ausente/BMD v10 (MG) não vira placeholder —
     * attachPlayerCharacter lança e o chamador decide.
     *
     * @param {number} classId byte de classe do servidor
     * @param {THREE.Vector3|null} spawnPos posição inicial three (Y-up);
     *        se null, usa (0, terreno, 0)
     */
    async attachPlayerCharacter(classId, spawnPos = null, opts = {}) {
        const initialObject = this.mainObject;
        const initialRevision = opts.deferPublish === true ? null :
            (this._playerVisualGeneration = (this._playerVisualGeneration || 0) + 1);
        const _heroBuildT0 = performance.now();
        const _heroPhases = {};
        let _heroLast = _heroBuildT0;
        const _heroMark = (name) => { const now=performance.now(); _heroPhases[name]=now-_heroLast; _heroLast=now; };
        // composeCharacter() retorna { renderData, skinIndex, parts }.
        // R11 tratava o wrapper como se ele já fosse o render-data e então
        // acessava `.meshes` no objeto errado. Isso interrompia a criação do
        // herói real assim que o MAIN_SCENE era montado.
        const composed = await composeCharacter(classId, {
            loadBMD: (p) => MUAssets.loadBMD(p),
            fetchBinary: (p) => RemoteAssets.fetchBinary(p),
        });
        _heroMark('composeCharacter');
        const renderDataBase = composed?.renderData;
        if (!renderDataBase || !Array.isArray(renderDataBase.meshes) || !renderDataBase.meshes.length) {
            throw new Error(`attachPlayerCharacter: composição vazia p/ classId=${classId} (peças ausentes/BMD) — sem placeholder`);
        }

        // R12.5 (P3): equipamento REAL do CharSet (selecionado no char select).
        // Weapons → meshes skinned nos bones 33/42; wing/helper → renderers
        // próprios (skeleton/actions próprios) como filhos do herói.
        let renderData = renderDataBase;
        let heroAttach = null;
        if (Array.isArray(opts.charset) && opts.charset.length >= 18) {
            try {
                heroAttach = await buildEquipmentAttach(opts.charset, { fetchBinary: (p) => RemoteAssets.fetchBinary(p) }, renderDataBase.bones, renderDataBase.bones.length);
                renderData = mergeEquipmentBodyRenderData(renderDataBase, heroAttach);
                if (heroAttach.weaponRenderMode !== 'render-link-object' && heroAttach.meshes.length) {
                    renderData = {
                        ...renderData,
                        meshes: [...renderData.meshes, ...heroAttach.meshes],
                        textures: [...renderData.textures, ...heroAttach.textures],
                        source: renderData.source + '+equip',
                    };
                }
                if (heroAttach.missing.length || heroAttach.bodyMissing?.length) {
                    console.info('[World] herói: equipamento ausente (fail-closed, nada inventado):', {
                        attachments: heroAttach.missing, body: heroAttach.bodyMissing || [],
                    });
                }
            } catch (e) {
                console.warn('[World] herói: charset attach falhou (fail-closed):', e.message);
                heroAttach = null;
            }
        }
        _heroMark('equipmentAttach');

        const renderer = new MUModelRenderer({
            scene: this.scene,
            camera: this.camera.threeCamera,
            skinIndex: getPcTextureSkinIndex(classId),
        });
        await renderer.initFromBMD(renderData);
        renderer.userData ??= {};
        renderer.userData.muCompositionMissing = unresolvedClassParts(composed, heroAttach);
        _heroMark('rendererInit');
        await applyBodyEquipmentPresentation(renderer, heroAttach).catch((e) =>
            console.warn('[World] body item presentation incompleta (fail-closed):', e?.message || e));
        _heroMark('bodyPresentation');

        // Externo: posição+yaw (Y-up, mundo) | Interno: up-axis MU→three
        applyMuUpAxis(renderer.group);
        const outer = new THREE.Group();
        outer.add(renderer.group);
        // ZzzCharacter.cpp::SetCharacterScale, ordinary Skin==0 world player.
        // Earlier Web builds left Three's implicit 1.0 and made body/equipment
        // 5–14% too large depending on class.
        outer.scale.setScalar(pcCharacterScale(classId, { characterScene: false, skin: 0 }));
        outer.name = 'playerCharacter';
        outer.userData.muEquipmentDiagnostics = {
            missing: [...(heroAttach?.missing || [])],
            bodyMissing: [...(heroAttach?.bodyMissing || [])],
        };
        outer.visible = false;
        this.scene.add(outer);

        // Wing/helper REAIS (skeleton/actions próprios): attach bone-parented
        // no bone do herói (PC RenderCharacterBackItem/ChangeCharacterExt —
        // authority pack mesh pc-attach-authority-main52). O frame do bone
        // é MU-space dentro do inner (rot -90X já aplicada acima dele) —
        // por isso o grupo do acessório entra SEM applyMuUpAxis: os dados do
        // BMD seguem a mesma convenção MU da cadeia óssea. Nascem ocultos até
        // a textura real resolver (zero-fake R12.3).
        const playerExtras = [];
        for (const [model, tag] of [
            [heroAttach?.wing, 'wing'],
            [heroAttach?.helper, 'helper'],
        ]) {
            if (!model) continue;
            try {
                const wr = await buildAccessoryRenderer({ scene: this.scene, camera: this.camera.threeCamera }, model);
                const bone = renderer.bones?.[wr?.userData?.bone];
                if (!wr || !bone) { wr?.dispose?.(); throw new Error(`bone ${wr?.userData?.bone} inexistente no esqueleto (${renderer.bones?.length ?? 0} bones)`); }
                bone.add(wr.group); // bone-parented: segue o osso animado (PC BoneTransform)
                playerExtras.push(wr);
                console.info(`[World] herói ${tag} REAL anexado: ${model.path} @bone${wr.userData.bone}`);
            } catch (e) {
                console.warn(`[World] herói ${tag} falhou (fail-closed): ${e.message}`);
            }
        }

        // Held weapons/shields use their OWN BMD hierarchy under the authored
        // player hand bone (RenderLinkObject semantics). The old Web shortcut
        // remapped item vertices into Player.bmd and produced the visibly wrong
        // sword/axe/shield orientation seen in physical R45.2 captures.
        const linkedWeapons = [];
        for (const spec of [heroAttach?.weaponRightSpec, heroAttach?.weaponLeftSpec]) {
            if (!spec) continue;
            try {
                const wr = await buildLinkedWeaponRenderer({ scene: this.scene, camera: this.camera.threeCamera }, spec);
                const bone = renderer.bones?.[spec.linkBone];
                if (!wr || !bone) { wr?.dispose?.(); throw new Error(`bone ${spec.linkBone} inexistente`); }
                bone.add(wr.group);
                wr.userData.presentation = 'hand';
                linkedWeapons.push({ wr, spec });
                playerExtras.push(wr);
                console.info(`[World] arma ${spec.side} RenderLinkObject REAL: ${spec.path} type=${spec.extType} twoHand=${spec.twoHand}`);
            } catch (e) { console.warn(`[World] arma ${spec.side} falhou (fail-closed): ${e.message}`); }
        }

        _heroMark('accessoriesWeapons');
        // Spawn: posição + altura REAL do terreno
        if (spawnPos) outer.position.copy(spawnPos);
        outer.position.y = this.terrainHeightAt(outer.position.x, outer.position.z);
        const initialBodyLight = this.terrainLightAt(outer.position.x, outer.position.z, this._bodyLightColor);
        if (initialBodyLight) {
            renderer.setBodyLight(initialBodyLight);
            for (const wr of playerExtras) wr?.setBodyLight?.(initialBodyLight);
        }

        // Contrato do Movement: SetPlayerStop/SetPlayerWalk evidence-backed
        // subset (weapon/wing/rider); safe-zone comes from the real ATT wall.
        const heroSafeZone = () => {
            // Movement owns a logical/predicted Character.position and copies it
            // to `outer` later in Scene.update(). Reading `outer` here made the
            // SafeZone branch one render frame stale exactly while crossing the
            // city border, so WALK/FLY could alternate while the body moved.
            const p = this._playerLogicalPosition || outer.position;
            const mx = Math.floor((p.x + MAP_SIZE / 2) / TERRAIN_SCALE);
            const my = Math.floor((MAP_SIZE / 2 - p.z) / TERRAIN_SCALE);
            const w = this.walls?.[(my & 255) * TERRAIN_SIZE + (mx & 255)] || 0;
            return (w & TW.SAFE_ZONE) !== 0;
        };
        // Single terrain/equipment source of truth for both clip selection and
        // physical presentation speed. This prevents SafeZone from changing the
        // weapon pose while Movement keeps an unrelated Web-only run state.
        outer.userData.muMovementContext = {
            safeZone: heroSafeZone,
            equipment: heroAttach,
            classId,
            worldActive: () => pcWorldActiveFromAssetWorld(this.mapIndex),
            inBloodCastle: () => pcInBloodCastle(pcWorldActiveFromAssetWorld(this.mapIndex)),
            inChaosCastle: () => pcInChaosCastle(pcWorldActiveFromAssetWorld(this.mapIndex)),
            inSwimWorld: () => pcInSwimLocomotionWorld(pcWorldActiveFromAssetWorld(this.mapIndex)),
        };
        outer.userData.animationControl = buildAnimationControl(renderer, classId, heroAttach, {
            safeZone: heroSafeZone,
            onSafeZoneChange: (safeZone) => {
                for (const { wr, spec } of linkedWeapons)
                    setLinkedWeaponSafeZonePresentation(renderer, wr, spec, safeZone);
            },
        });
        outer.userData.animationControl.play('idle');

        // Keep every owner local until the graph is complete. R80 wrote
        // `this.mainObject` / `_playerRenderer` in the middle of a deferred
        // rebuild, so a 200–800ms equipment load temporarily replaced the live
        // hero with the hidden staged graph. That is the concrete source of the
        // large hitch/wing disappearance during F3:13 equipment snapshots.
        const playerOwner = {
            object: outer,
            renderer,
            extras: playerExtras,
            weaponRight: heroAttach?.weaponRightSpec || null,
            weaponLeft: heroAttach?.weaponLeftSpec || null,
            darkSpirit: heroAttach?.darkSpirit || null,
            fenrir: heroAttach?.fenrir || null,
            rider: heroAttach?.rider || null,
            helper: heroAttach?.helperKind === 'helper' ? { kind: 'helper' } : null,
            runeAura: null,
            t: 0,
        };

        // Current-client ItemEffects.lua authority. PC CItemEffectManager checks
        // BodyPart -> weapons -> wing -> helper and renders BITMAP_GM_AURORA only
        // for the first LoadRunneEffect(..., EffectType=0) match. Unknown/missing
        // Lua or gmmzine.OZJ fails closed; no generic aura is substituted.
        let playerRuneAura = null;
        try {
            const itemFx = await loadItemEffectsLuaConfig((path) => RemoteAssets.fetchBinary(path));
            const runeInfo = resolveRuneAuraForEquipment(heroAttach, itemFx);
            if (runeInfo) {
                playerRuneAura = await PcRuneAura.create({
                    scene: this.scene,
                    terrainHeightAt: (x,z) => this.terrainHeightAt(x,z),
                    getPosition: () => outer?.position || null,
                    info: runeInfo,
                });
                playerRuneAura?.setVisible?.(false);
                if (playerRuneAura) console.info(`[World] Runne REAL ItemEffects.lua: item=${runeInfo.itemType} scale=${runeInfo.scale}`);
            }
        } catch (e) {
            console.warn('[World] ItemEffects.lua/Runne indisponível — fail-closed:', e?.message || e);
        }
        playerOwner.runeAura = playerRuneAura;
        if (opts.deferPublish === true) {
            outer.userData.muStagedPlayerOwner = playerOwner;
        } else {
            if (initialRevision !== this._playerVisualGeneration || this.mainObject !== initialObject) {
                outer.parent?.remove(outer);
                renderer.dispose();
                for (const wr of playerExtras) wr.dispose?.();
                playerRuneAura?.dispose?.();
                return null;
            }
            this.mainObject = outer;
            this._playerRenderer = renderer;
            this._playerExtras = playerExtras;
            this._playerWeaponRightSpec = playerOwner.weaponRight;
            this._playerWeaponLeftSpec = playerOwner.weaponLeft;
            this._playerDarkSpirit = playerOwner.darkSpirit;
            this._playerFenrir = playerOwner.fenrir;
            this._playerRider = playerOwner.rider;
            this._playerHelper = playerOwner.helper;
            this._playerRuneAura = playerRuneAura;
            this._playerT = 0;
            outer.visible = true;
            playerRuneAura?.setVisible?.(true);
        }
        _heroMark('itemEffectsRune');
        _heroMark('publish');
        console.info('[PERF] hero-build phases(ms): ' + Object.entries(_heroPhases).map(([k,v])=>`${k}=${Math.round(v)}`).join(' | ') + ` | total=${Math.round(performance.now()-_heroBuildT0)}`);
        return outer;
    }

    /**
     * R62 staged equipment rebuild: build/publish the replacement graph while the
     * current hero remains visible, then retire the old GPU graph only after the
     * new Player+body+wing/helper/weapons owner is complete. This removes the
     * multi-second visual disappearance observed on unequip/re-equip.
     */
    async replacePlayerCharacter(classId, spawnPos = null, opts = {}) {
        const revision = this._playerVisualGeneration = (this._playerVisualGeneration || 0) + 1;
        const oldObject = this.mainObject;
        const oldRenderer = this._playerRenderer;
        const oldExtras = Array.isArray(this._playerExtras) ? [...this._playerExtras] : [];
        const oldRuneAura = this._playerRuneAura || null;
        const oldYaw = oldObject?.rotation?.y ?? 0;
        const accepts = () => revision === this._playerVisualGeneration && this.mainObject === oldObject &&
            this._playerRenderer === oldRenderer && (typeof opts.acceptPublish !== 'function' || opts.acceptPublish() === true);
        let next = null;
        let staged = null;
        try {
            next = await this.attachPlayerCharacter(classId, spawnPos, { ...opts, deferPublish: true });
            staged = next?.userData?.muStagedPlayerOwner || null;
            if (!next || next === oldObject || !staged?.renderer) throw new Error('replacement graph staged inválido');
            next.rotation.y = oldObject?.rotation?.y ?? oldYaw;

            // Latest-wins F3:13 owner. If a newer authoritative equipment
            // snapshot arrived while BMD/textures were loading, discard this
            // complete-but-stale graph BEFORE it ever becomes visible.
            if (!accepts()) {
                try { next.parent?.remove(next); } catch (_) {}
                try { staged.renderer?.dispose?.(); } catch (_) {}
                for (const wr of staged.extras || []) { try { wr?.dispose?.(); } catch (_) {} }
                try { staged.runeAura?.dispose?.(); } catch (_) {}
                next.userData.muStagedPlayerOwner = null;
                console.info('[World R81] staged equipment graph stale descartado antes do publish');
                return null;
            }
            const issues = playerVisualLoadIssues(staged.renderer, staged.extras, next.userData?.muMovementContext?.equipment);
            if (issues.length) throw new Error(`replacement assets incompletos: ${issues.join(', ')}`);
            if (oldObject?.position) next.position.copy(oldObject.position);

            // Publish atomically only after every accessory/effect owner has resolved.
            this.mainObject = next;
            this._playerRenderer = staged.renderer;
            this._playerExtras = staged.extras || [];
            this._playerWeaponRightSpec = staged.weaponRight;
            this._playerWeaponLeftSpec = staged.weaponLeft;
            this._playerDarkSpirit = staged.darkSpirit;
            this._playerFenrir = staged.fenrir;
            this._playerRider = staged.rider;
            this._playerHelper = staged.helper;
            this._playerRuneAura = staged.runeAura || null;
            this._playerT = staged.t || 0;
            next.userData.muStagedPlayerOwner = null;
            next.visible = true;
            this._playerRuneAura?.setVisible?.(true);

            if (oldObject?.parent) oldObject.parent.remove(oldObject);
            try { oldRenderer?.dispose?.(); } catch (_) {}
            for (const wr of oldExtras) { try { wr?.dispose?.(); } catch (_) {} }
            try { oldRuneAura?.dispose?.(); } catch (_) {}
            return next;
        } catch (e) {
            // Deferred attach no longer changes authoritative owner pointers.
            // Dispose only a staged graph created by this call, then keep the
            // previous graph alive exactly as it was.
            if (next && next !== oldObject) {
                try { next.parent?.remove(next); } catch (_) {}
                const owner = staged || next.userData?.muStagedPlayerOwner;
                try { owner?.renderer?.dispose?.(); } catch (_) {}
                for (const wr of owner?.extras || []) { try { wr?.dispose?.(); } catch (_) {} }
                try { owner?.runeAura?.dispose?.(); } catch (_) {}
            }
            // Deferred construction never changed these pointers. An obsolete
            // failure must not restore a retired hero over a newer live graph.
            if (!accepts()) return null;
            throw e;
        }
    }

    /**
     * R81 fast equipment path. The PC does not recreate Player.bmd when only a
     * held weapon/wing/helper changes; ChangeCharacterExt updates those linked
     * owners around the existing character skeleton. Preserve that ownership in
     * Web: if body-part presentation is byte-for-byte unchanged, rebuild only
     * changed linked item owners and keep the live base renderer/skeleton.
     *
     * Returns {status:'applied'|'requires-full'|'stale', object?}.
     */
    async replacePlayerEquipmentAccessories(classId, charset, opts = {}) {
        const outer = this.mainObject;
        const renderer = this._playerRenderer;
        if (!outer || !renderer || !Array.isArray(charset) || charset.length < 18) {
            return { status: 'requires-full' };
        }
        const currentAttach = outer.userData?.muMovementContext?.equipment || null;
        if (!currentAttach) return { status: 'requires-full' };
        const revision = this._playerVisualGeneration = (this._playerVisualGeneration || 0) + 1;
        const accepts = () => revision === this._playerVisualGeneration && this.mainObject === outer &&
            this._playerRenderer === renderer && (typeof opts.acceptPublish !== 'function' || opts.acceptPublish() === true);

        const bodySig = (a) => JSON.stringify({
            replaced: [...(a?.replacedBodyKeys || [])].sort(),
            specs: a?.bodySpecs || {},
            missing: [...(a?.bodyMissing || [])].sort(),
        });
        const specSig = (x) => x ? JSON.stringify({
            path:x.path || '', extType:x.extType ?? null, effectType:x.effectType ?? 0,
            customColor:x.customColor || null, rawLevel:x.rawLevel ?? null,
            option1:x.option1 ?? null, extOption:x.extOption ?? null,
            side:x.side || null, linkBone:x.linkBone ?? null, attach:x.attach || null,
            viaCacheKey:x.viaCacheKey || null,
        }) : 'null';
        const sameSpec = (a,b) => specSig(a) === specSig(b);

        const nextAttach = await buildEquipmentAttach(
            charset,
            { fetchBinary: (p) => RemoteAssets.fetchBinary(p) },
            renderer.bones,
            renderer.bones?.length || 0,
        );
        if (!accepts()) return { status:'stale' };
        if (nextAttach.missing.length || nextAttach.bodyMissing.length || bodySig(currentAttach) !== bodySig(nextAttach)) return { status:'requires-full', attach:nextAttach };

        const oldExtras = Array.isArray(this._playerExtras) ? [...this._playerExtras] : [];
        const oldRuneAura = this._playerRuneAura || null;
        const newExtras = [];
        const newlyBuilt = [];
        const linkedWeapons = [];
        let nextRuneAura = null;

        const oldByPath = (path, side = null) => oldExtras.find((wr) =>
            wr?.userData?.path === path && (side == null || wr?.userData?.side === side));
        const retainOrBuildAccessory = async (nextSpec, currentSpec, tag) => {
            if (!nextSpec) return null;
            if (sameSpec(nextSpec, currentSpec)) {
                const retained = oldByPath(nextSpec.path);
                if (retained) { newExtras.push(retained); return retained; }
            }
            const wr = await buildAccessoryRenderer({ scene:this.scene, camera:this.camera.threeCamera }, nextSpec);
            if (wr) newlyBuilt.push(wr);
            const bone = renderer.bones?.[wr?.userData?.bone];
            if (!wr || !bone) throw new Error(`${tag}: bone ${wr?.userData?.bone} inexistente`);
            wr.userData.kind = tag;
            wr.group.visible = false;
            bone.add(wr.group);
            newExtras.push(wr);
            return wr;
        };
        const retainOrBuildWeapon = async (nextSpec, currentSpec) => {
            if (!nextSpec) return null;
            if (sameSpec(nextSpec, currentSpec)) {
                const retained = oldByPath(nextSpec.path, nextSpec.side);
                if (retained) { newExtras.push(retained); linkedWeapons.push({wr:retained,spec:nextSpec}); return retained; }
            }
            const wr = await buildLinkedWeaponRenderer({ scene:this.scene, camera:this.camera.threeCamera }, nextSpec);
            if (wr) newlyBuilt.push(wr);
            const bone = renderer.bones?.[nextSpec.linkBone];
            if (!wr || !bone) throw new Error(`weapon ${nextSpec.side}: bone ${nextSpec.linkBone} inexistente`);
            wr.group.visible = false;
            bone.add(wr.group);
            wr.userData.presentation = 'hand';
            newExtras.push(wr); linkedWeapons.push({wr,spec:nextSpec});
            return wr;
        };

        try {
            await retainOrBuildAccessory(nextAttach.wing, currentAttach.wing, 'wing');
            await retainOrBuildAccessory(nextAttach.helper, currentAttach.helper, 'helper');
            await retainOrBuildWeapon(nextAttach.weaponRightSpec, currentAttach.weaponRightSpec);
            await retainOrBuildWeapon(nextAttach.weaponLeftSpec, currentAttach.weaponLeftSpec);

            const itemFx = await loadItemEffectsLuaConfig((path) => RemoteAssets.fetchBinary(path)).catch(() => null);
            const runeInfo = itemFx ? resolveRuneAuraForEquipment(nextAttach, itemFx) : null;
            if (runeInfo) {
                nextRuneAura = await PcRuneAura.create({
                    scene:this.scene,
                    terrainHeightAt:(x,z)=>this.terrainHeightAt(x,z),
                    getPosition:()=>outer.position,
                    info:runeInfo,
                });
                nextRuneAura?.setVisible?.(false);
            }

            if (!accepts()) {
                for (const wr of newlyBuilt) { try { wr.group?.parent?.remove?.(wr.group); wr.dispose?.(); } catch (_) {} }
                try { nextRuneAura?.dispose?.(); } catch (_) {}
                return { status:'stale' };
            }
            const issues = playerVisualLoadIssues(renderer, newExtras, nextAttach);
            if (issues.length) throw new Error(`accessory assets incompletos: ${issues.join(', ')}`);

            const bodyLight = this.terrainLightAt(outer.position.x, outer.position.z, this._bodyLightColor);
            if (bodyLight) for (const wr of newExtras) wr?.setBodyLight?.(bodyLight);

            const movementCtx = outer.userData.muMovementContext || {};
            const priorControl = outer.userData.animationControl;
            const priorLogical = priorControl?._current;
            const nextControl = buildAnimationControl(renderer, classId, nextAttach, {
                safeZone: movementCtx.safeZone,
                onSafeZoneChange:(safeZone)=>{
                    for (const {wr,spec} of linkedWeapons) setLinkedWeaponSafeZonePresentation(renderer,wr,spec,safeZone);
                },
            });
            if (['idle','walk','run'].includes(priorLogical)) nextControl.play(priorLogical);

            // Publish changed linked owners, then retire only superseded extras.
            for (const wr of newlyBuilt) if (wr?.group) wr.group.visible = true;
            for (const old of oldExtras) {
                if (newExtras.includes(old)) continue;
                try { old.group?.parent?.remove?.(old.group); old.dispose?.(); } catch (_) {}
            }
            this._playerExtras = newExtras;
            try { oldRuneAura?.dispose?.(); } catch (_) {}
            this._playerRuneAura = nextRuneAura;
            this._playerRuneAura?.setVisible?.(true);
            this._playerWeaponRightSpec = nextAttach.weaponRightSpec || null;
            this._playerWeaponLeftSpec = nextAttach.weaponLeftSpec || null;
            this._playerDarkSpirit = nextAttach.darkSpirit || null;
            this._playerFenrir = nextAttach.fenrir || null;
            this._playerRider = nextAttach.rider || null;
            this._playerHelper = nextAttach.helperKind === 'helper' ? {kind:'helper'} : null;
            outer.userData.muEquipmentDiagnostics = {
                missing:[...(nextAttach.missing || [])], bodyMissing:[...(nextAttach.bodyMissing || [])],
            };
            movementCtx.equipment = nextAttach;
            movementCtx.classId = classId;
            outer.userData.muMovementContext = movementCtx;
            outer.userData.animationControl = nextControl;

            console.info(`[World R81] equipment incremental publish: reused=${newExtras.length-newlyBuilt.length} rebuilt=${newlyBuilt.length} body=unchanged`);
            return { status:'applied', object:outer, attach:nextAttach };
        } catch (e) {
            for (const wr of newlyBuilt) { try { wr.group?.parent?.remove?.(wr.group); wr.dispose?.(); } catch (_) {} }
            try { nextRuneAura?.dispose?.(); } catch (_) {}
            if (!accepts()) return { status:'stale' };
            console.warn('[World R81] incremental accessory rebuild falhou; full rebuild será usado:', e?.message || e);
            return { status:'requires-full', attach:nextAttach };
        }
    }

    /** Remove o herói (troca de mapa/char) — dispose real de GPU. */
    hasCompletePlayerVisual() {
        if (!this.mainObject || !this._playerRenderer) return false;
        return playerVisualLoadIssues(this._playerRenderer, this._playerExtras || [],
            this.mainObject.userData?.muMovementContext?.equipment).length === 0;
    }

    detachPlayerCharacter() {
        this._playerVisualGeneration = (this._playerVisualGeneration || 0) + 1;
        if (!this.mainObject) return;
        this.scene.remove(this.mainObject);
        try { this._playerRenderer?.dispose(); } catch (e) { /* noop */ }
        for (const wr of this._playerExtras || []) { try { wr.dispose(); } catch (e) { /* noop */ } }
        try { this._playerRuneAura?.dispose?.(); } catch (e) { /* noop */ }
        this._playerRuneAura = null;
        this._playerExtras = [];
        this.mainObject = null;
        this._playerRenderer = null;
        this._playerWeaponRightSpec = null;
        this._playerWeaponLeftSpec = null;
        this._playerDarkSpirit = null; // companion é disposed pelo PetSystem (GameApp)
        this._playerFenrir = null; // companion é disposed pelo PetSystem (GameApp)
        this._playerRider = null;  // idem riders unicon/pegasus (CreateBug)
        this._playerHelper = null;  // idem HelperCompanion (CreateBug MODEL_HELPER)
    }

    /** True only when immutable terrain + object owners for WorldN are fully published. */
    hasStableRealMap(worldNumber) {
        return this._terrainWorldNumber === worldNumber
            && this._objectsWorldNumber === worldNumber
            && Boolean(this.terrain)
            && Boolean(this.worldObjectLayer)
            && !this.worldObjectLayer?._disposed;
    }

    async loadRealMap(worldNumber = 1, options = {}) {
        // Uma carga World75 ainda pendente não pode reaparecer depois do mapa
        // de jogo. O epoch descarta terrain/objects atrasados antes do commit.
        this._invalidateCharacterWorldLoad(`game-world-${worldNumber}`);
        // PERF world-entry / map-change physical diagnostics.
        const _t = { start: performance.now() };
        const _phase = (name) => {
            const now = performance.now();
            const ms = Math.round(now - (_t.last ?? _t.start));
            _t.last = now;
            console.info(`[PERF] loadRealMap World${worldNumber}: ${name}=${ms}ms (total ${Math.round(now - _t.start)}ms)`);
        };
        let built = null;
        let builtCommitted = false;
        let stagedLayer = null;
        const atomic = options?.atomic === true;
        try {
            this._reportWorldStatus?.(`Carregando World${worldNumber} real (OZB alturas + tiles decrypt)...`);
            built = await buildWorldTerrain(worldNumber);
            const worldState = built;
            _phase('terrain(OZB+att+tiles)');

            if (atomic) {
                // R81 map-change: keep the previously published map intact while
                // every real ObjectN/BMD/material owner of the destination is
                // prepared. R80 published terrain first and disposed old objects
                // immediately, exposing the user to a terrain-only/partial scene
                // for several seconds and to "objects disappeared" during MoveCustom.
                stagedLayer = new TerrainObjectLayer(this);
                const r = await stagedLayer.load(worldNumber, {
                    cooperative: options?.cooperativeObjects !== false,
                    idleMs: Number.isFinite(Number(options?.objectIdleMs)) ? Math.max(0, Number(options.objectIdleMs)) : 8,
                    sliceMs: Number.isFinite(Number(options?.objectSliceMs)) ? Math.max(0, Number(options.objectSliceMs)) : 0,
                    staged: true,
                    // R89: do not spend tens of seconds finishing a destination
                    // that a newer server teleport has already superseded. The
                    // same-world case is intentionally allowed by GameApp so
                    // Bar/Mago/Ferreiro moves can share one World1 build.
                    shouldContinue: typeof options?.acceptContinue === 'function'
                        ? options.acceptContinue : options?.acceptPublish,
                    // Object BodyLight/instance colors must come from the NEW
                    // terrain while it is staged, not from the still-visible old map.
                    terrainLightMesh: built.mesh,
                });
                _phase('objects-staged-complete');

                // Latest server teleport wins. If GameApp received a newer 0x1C
                // while this destination was staging, discard the complete staged
                // graph before it can replace the currently visible world.
                if (typeof options?.acceptPublish === 'function' && options.acceptPublish() !== true) {
                    stagedLayer.dispose();
                    stagedLayer = null;
                    this._disposeBuiltTerrain(built);
                    built = null;
                    console.info(`[Scene R81] World${worldNumber} staged map stale descartado antes do publish`);
                    return false;
                }

                // Atomic publish: no animation frame can observe half old/half
                // new owners between these synchronous operations.
                const prior = this.worldObjectLayer;
                this._applyBuiltTerrain(built, worldNumber);
                builtCommitted = true;
                built = null;
                this.worldObjectLayer = stagedLayer;
                this._objectsWorldNumber = worldNumber;
                this._activeWorldObjectsPromise = Promise.resolve(r);
                this._activeWorldObjectsNumber = worldNumber;
                stagedLayer.activate();
                stagedLayer = null;
                prior?.dispose?.();
                this._recordWorldObjectDiagnostics(worldNumber, r);
                _phase('atomic-publish');
            } else {
                this._applyBuiltTerrain(built, worldNumber);
                builtCommitted = true;
                _phase('applyTerrain(geom+upload)');
                const objectBudgetMs = Number.isFinite(Number(options?.objectBudgetMs))
                    ? Math.max(0, Number(options.objectBudgetMs)) : Infinity;
                const objectsPromise = this._replaceWorldObjects(worldNumber, {
                    cooperative: options?.cooperativeObjects !== false,
                    idleMs: Number.isFinite(Number(options?.objectIdleMs)) ? Math.max(0, Number(options.objectIdleMs)) : 16,
                    sliceMs: Number.isFinite(Number(options?.objectSliceMs)) ? Math.max(0, Number(options.objectSliceMs)) : 0,
                });
                this._activeWorldObjectsPromise = objectsPromise;
                this._activeWorldObjectsNumber = worldNumber;
                let objectsReady = false;
                if (Number.isFinite(objectBudgetMs)) {
                    let timer = null;
                    try {
                        objectsReady = (await Promise.race([
                            objectsPromise.then(() => true),
                            new Promise((resolve) => { timer = setTimeout(() => resolve(false), objectBudgetMs); }),
                        ])) === true;
                    } finally { if (timer) clearTimeout(timer); }
                } else {
                    await objectsPromise;
                    objectsReady = true;
                }
                if (!objectsReady) {
                    console.info(`[PERF] World${worldNumber}: object layer excedeu budget ${objectBudgetMs}ms; continua progressivo em background sem placeholder.`);
                }
                _phase(objectsReady ? 'objects-ready' : 'objects-budget-yield');
            }

            // colisão REAL p/ pathfinding (walls com flags TW)
            this.walls = worldState.walls;
            this.heights = worldState.heights;
            this.cellSize = TERRAIN_SCALE;
            this.mapIndex = worldNumber;
            this.attGrid = worldState.walls ? {
                width: TERRAIN_SIZE, height: TERRAIN_SIZE,
                cells: worldState.walls, format: 'att-decrypt-bux (real)',
            } : null;

            this.applyGameCamera();
            _phase('camera');
            // Paridade PC: clear color POR MAPA; fog global não é inventado.
            this.scene.background = pcClearColorForWorld(worldNumber);
            this.scene.fog = null;

            this._reportWorldStatus?.(
                `World${worldNumber} REAL aplicado (mapNumber=${worldState.mapNumber}, ` +
                `alturas OZB ×1.5, tiles L1/L2, walls=${worldState.walls ? 'OK' : 'ausentes'}${atomic ? ', commit atômico' : ''}).`);
            return true;
        } catch (e) {
            if (stagedLayer) { try { stagedLayer.dispose(); } catch (_) {} }
            if (built && !builtCommitted) this._disposeBuiltTerrain(built);
            if (e?.code === 'MUWEB_STALE_WORLD_LOAD') {
                console.info(`[Scene R89] World${worldNumber} staging cancelado por destino mais novo`);
                return false;
            }
            this._reportWorldStatus?.(`Mapa real indisponível: ${e.message} (sem fallback procedural — política 0 simulação)`);
            return false;
        }
    }

    async waitWorldObjectsReady(worldNumber = this._activeWorldObjectsNumber, timeoutMs = 0) {
        if (this._objectsWorldNumber === worldNumber && this.worldObjectLayer) return true;
        const p = this._activeWorldObjectsPromise;
        if (!p || this._activeWorldObjectsNumber !== worldNumber) return false;
        if (!(timeoutMs > 0)) { await p; return this._objectsWorldNumber === worldNumber; }
        let timer = null;
        try {
            return Boolean(await Promise.race([
                p.then(() => this._objectsWorldNumber === worldNumber),
                new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); }),
            ]));
        } finally { if (timer) clearTimeout(timer); }
    }

    _recordWorldObjectDiagnostics(worldNumber, r) {
        this._worldObjectDiagnostics = {
            worldNumber, placements:Number(r?.count)||0, rendered:Number(r?.rendered)||0,
            missing:Number(r?.missing)||0, missingSerials:Array.from(r?.missingSerials || []),
            complete:(Number(r?.missing)||0)===0 && !(r?.missingSerials?.length),
        };
        if (this._worldObjectDiagnostics.complete) {
            this._reportWorldStatus?.(`World${worldNumber}: objetos EncTerrain COMPLETOS ${this._worldObjectDiagnostics.rendered}/${this._worldObjectDiagnostics.placements} missing=0`);
        } else {
            const ids=this._worldObjectDiagnostics.missingSerials.slice(0,32).map((n)=>`Object${String(n).padStart(2,'0')}`).join(',');
            this._reportWorldStatus?.(`World${worldNumber}: objetos INCOMPLETOS rendered=${this._worldObjectDiagnostics.rendered}/${this._worldObjectDiagnostics.placements} missingPlacements=${this._worldObjectDiagnostics.missing}${ids ? ` missingModels=${ids}` : ''}`);
            console.warn(`[WorldObjects] World${worldNumber} INCOMPLETO rendered=${this._worldObjectDiagnostics.rendered}/${this._worldObjectDiagnostics.placements} missing=${this._worldObjectDiagnostics.missing} missingModels=${this._worldObjectDiagnostics.missingSerials.join(',')}`);
        }
        return this._worldObjectDiagnostics;
    }

    async _replaceWorldObjects(worldNumber, loadOptions = {}) {
        const epoch = (this._worldObjectEpoch || 0) + 1;
        this._worldObjectEpoch = epoch;
        const prior = this.worldObjectLayer;
        prior?.dispose();
        this._objectsWorldNumber = null;
        const layer = new TerrainObjectLayer(this);
        this.worldObjectLayer = layer;
        try {
            const r = await layer.load(worldNumber, loadOptions);
            // Se outra troca de mapa começou enquanto BMD/texturas carregavam,
            // nunca deixar o World antigo reaparecer por uma Promise atrasada.
            if (epoch !== this._worldObjectEpoch || this.worldObjectLayer !== layer) {
                layer.dispose();
                console.info(`[WorldObjects] World${worldNumber}: resultado stale descartado (epoch ${epoch})`);
                return null;
            }
            this._objectsWorldNumber = worldNumber;
            this._recordWorldObjectDiagnostics(worldNumber, r);
            return r;
        } catch (e) {
            layer.dispose();
            if (this.worldObjectLayer === layer) this.worldObjectLayer = null;
            if (this._objectsWorldNumber === worldNumber) this._objectsWorldNumber = null;
            this._worldObjectDiagnostics = { worldNumber, placements:0, rendered:0, missing:0, missingSerials:[], complete:false, error:String(e?.message || e) };
            // Terreno continua visível, mas o gate visual NÃO é considerado completo.
            this._reportWorldStatus?.(`World${worldNumber}: objetos de cenário FALHARAM: ${e.message}`);
            console.warn(`[WorldObjects] World${worldNumber} FAIL:`, e);
            return null;
        }
    }

    _disposeTerrainMesh(mesh) {
        if (!mesh) return;
        try { this.scene?.remove(mesh); } catch (_) {}
        // MuTerrain owns atlas + L1/L2/alpha/light textures through this hook.
        // material.map is not enough for ShaderMaterial and leaked GPU owners
        // on every old Character Create -> Select rebuild.
        try { mesh.userData?.dispose?.(); } catch (_) {}
        try { mesh.geometry?.dispose?.(); } catch (_) {}
        try { mesh.material?.map?.dispose?.(); } catch (_) {}
        try { mesh.material?.dispose?.(); } catch (_) {}
    }

    _disposeBuiltTerrain(built) {
        if (!built?.mesh) return;
        this._disposeTerrainMesh(built.mesh);
    }

    _applyBuiltTerrain(built, worldNumber = null) {
        if (this.terrain && this.terrain !== built?.mesh) this._disposeTerrainMesh(this.terrain);
        this.scene.add(built.mesh);
        this.terrain = built.mesh;
        if (this._realMapTransition) this.terrain.visible = false;
        this._terrainWorldNumber = Number.isInteger(worldNumber) ? worldNumber : null;
        if (built.heights) this.heights = built.heights;
        if (built.walls) this.walls = built.walls;
        // personagem de demo não aparece nas cenas cinematográficas
        if (this.mainObject) this.mainObject.visible = (this.cameraMode === 'game');
    }

    /** Altura real do terreno numa posição do mundo.
     *  PC Main 5.2 ZzzLodTerrain.cpp::RequestTerrainHeight: bilinear over
     *  BackTerrainHeight[Index1..4], with TW_HEIGHT returning g_fSpecialHeight=1200.
     *  Web world X = MU-X - 12800 and Web Z = 12800 - MU-Y.
     */
    terrainHeightAt(x, z) {
        if (!this.heights) return 0;

        const xf = (Number(x) + MAP_SIZE / 2) / TERRAIN_SCALE;
        const yf = (MAP_SIZE / 2 - Number(z)) / TERRAIN_SCALE;
        // PC RequestTerrainHeight does not wrap an out-of-map coordinate:
        // it returns g_fSpecialHeight before the TERRAIN_INDEX_REPEAT reads.
        if (!Number.isFinite(xf) || !Number.isFinite(yf)) return 1200;
        if (xf < 0 || yf < 0 || xf >= TERRAIN_SIZE || yf >= TERRAIN_SIZE) return 1200;

        const xi = Math.floor(xf);
        const yi = Math.floor(yf);
        const baseIndex = (yi & 255) * TERRAIN_SIZE + (xi & 255);
        if (this.walls && (this.walls[baseIndex] & TW.HEIGHT)) return 1200;

        const xd = xf - xi;
        const yd = yf - yi;
        const i1 = (yi & 255) * TERRAIN_SIZE + (xi & 255);
        const i2 = ((yi + 1) & 255) * TERRAIN_SIZE + (xi & 255);
        const i3 = (yi & 255) * TERRAIN_SIZE + ((xi + 1) & 255);
        const i4 = ((yi + 1) & 255) * TERRAIN_SIZE + ((xi + 1) & 255);

        const h1 = Number(this.heights[i1]) || 0;
        const h2 = Number(this.heights[i2]) || 0;
        const h3 = Number(this.heights[i3]) || 0;
        const h4 = Number(this.heights[i4]) || 0;
        const left = h1 + (h2 - h1) * yd;
        const right = h3 + (h4 - h3) * yd;
        return left + (right - left) * xd;
    }

    /** Main 5.2 RequestTerrainLight at a Three-world X/Z position.
     *  Returns `target` (THREE.Color) or null while no real terrain-light owner
     *  is active. Web X = MU-X-12800, Web Z = 12800-MU-Y.
     */
    terrainLightAt(x, z, target = null) {
        const sample = this.terrain?.userData?.sampleTerrainLight;
        if (typeof sample !== 'function') return null;
        const muX = Number(x) + MAP_SIZE / 2;
        const muY = MAP_SIZE / 2 - Number(z);
        if (!Number.isFinite(muX) || !Number.isFinite(muY)) return null;
        const rgb = sample(muX, muY);
        const color = target || new THREE.Color();
        color.setRGB(Number(rgb?.[0]) || 0, Number(rgb?.[1]) || 0, Number(rgb?.[2]) || 0);
        return color;
    }

    /** Begin Main 5.2 dynamic PrimaryTerrainLight frame (InitTerrainLight). */
    beginDynamicTerrainLightFrame() {
        return this.terrain?.userData?.beginDynamicLightFrame?.() || 0;
    }

    /** AddTerrainLight in MU coordinates, preserving the mutable float grid. */
    addDynamicTerrainLightMu(muX, muY, light, range) {
        return this.terrain?.userData?.addDynamicTerrainLight?.(muX, muY, light, range) || 0;
    }

    /** Publish touched PrimaryTerrainLight cells to the GPU terrain lightmap. */
    commitDynamicTerrainLightFrame() {
        return this.terrain?.userData?.commitDynamicLightFrame?.() || 0;
    }

    /** TerrainWall real na posição — owner PC usado por skills/colisão. */
    terrainWallAt(x, z) {
        if (!this.walls) return 0;
        const mx = Math.floor((x + MAP_SIZE / 2) / TERRAIN_SCALE);
        const my = Math.floor((MAP_SIZE / 2 - z) / TERRAIN_SCALE);
        return this.walls[(my & 255) * TERRAIN_SIZE + (mx & 255)] || 0;
    }

    /** Célula andável? (walls: NO_MOVE|NO_GROUND bloqueiam) */
    isWalkable(x, z) {
        if (!this.walls) return true;
        const mx = Math.floor((x + MAP_SIZE / 2) / TERRAIN_SCALE);
        const my = Math.floor((MAP_SIZE / 2 - z) / TERRAIN_SCALE);
        const w = this.walls[(my & 255) * TERRAIN_SIZE + (mx & 255)];
        return !(w & (TW.NO_MOVE | TW.NO_GROUND));
    }

    // ------------------------------------------------------------------
    // Update / render
    // ------------------------------------------------------------------
    update(dt, elapsed) {
        // PC InitTerrainLight happens before dynamic world-object lighting each
        // frame. Restore BackTerrainLight first, then let source visual owners
        // add their authored RGB falloff before actor BodyLight samples it.
        this.beginDynamicTerrainLightFrame();

        if (this.cameraMode === 'char') {
            // PC CharacterScene owner: CWideScreen::SceneLogin() is reapplied
            // EVERY CHARACTER_SCENE frame immediately before BuildMVP.
            applyMuCamera(this.camera.threeCamera, CHAR_CAMERA);
        } else if (this.cameraMode === 'login') {
            // World95 camera is installed on scene entry.
        } else if (this.cameraMode === 'game') {
            this.camera.processInput();
            // Position must be authoritative before terrain-light prepass and
            // BodyLight sampling, but renderer animation is advanced after the
            // world visual owners publish AddTerrainLight for this frame.
            if (this.mainObject && this._playerSync) this._playerSync(this.mainObject);
        }

        // R63: animated terrain props use explicit world-space frustum bounds.
        this.worldObjectLayer?.updateVisibility?.(this.camera?.threeCamera);

        // Source visual owners (Lorencia CreateFire/StreetLight/etc.) publish
        // AddTerrainLight from their update callbacks here. Remote actors and
        // effects also advance before the local hero draw, which is safe because
        // presentation ownership remains single-threaded and frame-local.
        for (const obj of this.objects) {
            if (obj.userData.update) obj.userData.update(dt, obj);
        }
        this.commitDynamicTerrainLightFrame();

        if (this.cameraMode === 'game' && this.mainObject) {
            if (this._playerRenderer) {
                const bodyLight = this.terrainLightAt(this.mainObject.position.x, this.mainObject.position.z, this._bodyLightColor);
                if (bodyLight) {
                    this._playerRenderer.setBodyLight(bodyLight);
                    for (const wr of this._playerExtras || []) wr?.setBodyLight?.(bodyLight);
                }
                this._playerT += dt;
                this._playerRenderer.update(dt, this._playerT);
                for (const wr of this._playerExtras || []) wr.update(dt, this._playerT);
            }
            this._playerRuneAura?.update?.((Number(elapsed) || this._playerT || 0) * 1000);
        }
    }

    addObject(mesh, updateFn = null) {
        // R73: many production owners (remote players/effects) prepare their
        // update callback before publication. The old helper unconditionally
        // assigned the default `null` here and silently erased that callback,
        // freezing interpolation/animation immediately after spawn. Only
        // override when the caller explicitly supplies a function.
        if (typeof updateFn === 'function') mesh.userData.update = updateFn;
        if (!this.objects.includes(mesh)) this.objects.push(mesh);
        this.scene.add(mesh);
        return mesh;
    }

    removeObject(mesh) {
        if (!mesh) return false;
        const i = this.objects.indexOf(mesh);
        if (i >= 0) this.objects.splice(i, 1);
        try { this.scene?.remove(mesh); } catch (_) {}
        return i >= 0;
    }

    async warmupCurrentScene() {
        const renderer = this.renderer;
        const camera = this.camera?.threeCamera;
        if (!renderer || !camera || !this.scene) return { ms: 0, mode: 'none' };
        const t0 = performance.now();
        try {
            // R78 physical root cause: Three r160 compileAsync() polls each
            // material's internal currentProgram from a timer. If a program failed
            // to link, that timer can throw while reading `isReady` and leave the
            // Promise pending forever. GameApp then never reaches Loading->World.
            // Compile synchronously under the already-visible LoadingScene. This
            // preserves every shader/material and, unlike a Promise timeout, does
            // not leave the broken r160 polling callback armed in the background.
            // Parallel warmup remains an explicit diagnostic opt-in only.
            const allowParallel = typeof window !== 'undefined' && window.__MU_R160_PARALLEL_SHADER_WARMUP === true;
            if (allowParallel && typeof renderer.compileAsync === 'function') {
                await renderer.compileAsync(this.scene, camera);
                return { ms: performance.now() - t0, mode: 'compileAsync-optin' };
            }
            renderer.compile(this.scene, camera);
            return { ms: performance.now() - t0, mode: 'compile-r160-safe' };
        } catch (e) {
            console.warn('[Render] warmup de shaders falhou; primeiro frame fará compile:', e?.message || e);
            return { ms: performance.now() - t0, mode: 'failed', error: e };
        }
    }

    render() {
        const renderer = this.renderer;
        const camera = this.camera.threeCamera;
        if (!renderer || !camera) return;

        const size = renderer.getSize(this._renderSize);
        const width = Math.max(1, Math.round(size.x));
        const height = Math.max(1, Math.round(size.y));

        if (this._realMapTransition) {
            const frozen = this._realMapTransition.frozenFrame;
            if (frozen) {
                renderer.setScissorTest(false);
                renderer.setViewport(0, 0, width, height);
                renderer.render(frozen.scene, frozen.camera);
            }
            // Even capture failure must not repaint an empty/partial world.
            return;
        }

        if (this.cameraMode === 'char') {
            // PC NewRenderCharacterScene(): BeginOpengl(0, 25, W, H-50).
            // O cliente mobile preserva os 25px do design-height 480 e escala
            // essa margem para o drawable físico. Three usa origem inferior no
            // viewport, então a margem é simétrica no topo/rodapé.
            const margin = Math.max(0, Math.round(25 * (height / 480)));
            const vpH = Math.max(1, height - margin * 2);

            // Limpa o framebuffer inteiro antes de restringir o draw 3D. A UI
            // 2D da CharacterScene ocupa a tela cheia acima do WebGL.
            renderer.setScissorTest(false);
            renderer.setViewport(0, 0, width, height);
            renderer.setClearColor(0x000000, 1);
            renderer.clear(true, true, true);

            renderer.setViewport(0, margin, width, vpH);
            const charAspect = width / vpH;
            if (Math.abs(camera.aspect - charAspect) > 1e-7) {
                camera.aspect = charAspect;
                camera.updateProjectionMatrix();
            }
            const priorAutoClear = renderer.autoClear;
            renderer.autoClear = false;
            renderer.render(this.scene, camera);
            renderer.autoClear = priorAutoClear;
            renderer.setViewport(0, 0, width, height);
            return;
        }

        const frameAspect = width / height;
        if (Math.abs(camera.aspect - frameAspect) > 1e-7) {
            camera.aspect = frameAspect;
            camera.updateProjectionMatrix();
        }
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, width, height);
        renderer.render(this.scene, camera);
    }

    logFramebufferProbe(label = 'frame') {
        if (!this.renderer) return null;
        const gl = this.renderer.getContext();
        const canvas = this.renderer.domElement;
        const rect = canvas.getBoundingClientRect();
        const style = getComputedStyle(canvas);
        const px = new Uint8Array(4);
        let readError = null;
        try {
            gl.readPixels(
                gl.drawingBufferWidth >> 1,
                gl.drawingBufferHeight >> 1,
                1, 1,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                px,
            );
        } catch (e) {
            readError = e.message || String(e);
        }
        const glError = gl.getError();
        // Compositor DOM: readPixels enxerga somente o canvas. Uma DIV preta
        // por cima pode produzir "tela preta" mesmo com framebuffer correto.
        let domStack = [];
        try {
            const cx = Math.max(0, Math.floor(window.innerWidth / 2));
            const cy = Math.max(0, Math.floor(window.innerHeight / 2));
            domStack = document.elementsFromPoint(cx, cy).slice(0, 8).map((el) => {
                const cs = getComputedStyle(el);
                const id = el.id ? `#${el.id}` : '';
                const cls = el.className && typeof el.className === 'string'
                    ? '.' + el.className.trim().split(/\s+/).filter(Boolean).join('.') : '';
                return `${el.tagName.toLowerCase()}${id}${cls}{z=${cs.zIndex},op=${cs.opacity},bg=${cs.backgroundColor},pe=${cs.pointerEvents}}`;
            });
        } catch (e) { domStack = ['ERRO:' + (e.message || e)]; }
        const fade = this.container?.querySelector?.('[data-mu-fade-overlay="1"]');
        const fadeStyle = fade ? getComputedStyle(fade) : null;
        const info = {
            label,
            pixel: Array.from(px),
            glError,
            contextLost: !!gl.isContextLost?.(),
            drawingBuffer: `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`,
            canvasBuffer: `${canvas.width}x${canvas.height}`,
            cssRect: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            zIndex: style.zIndex,
            fade: fadeStyle ? { opacity: fadeStyle.opacity, display: fadeStyle.display, pointerEvents: fadeStyle.pointerEvents } : null,
            domStack,
            calls: this.renderer.info.render.calls,
            triangles: this.renderer.info.render.triangles,
            sceneChildren: this.scene?.children?.length ?? -1,
            terrain: !!this.terrain,
            terrainVisible: this.terrain?.visible ?? null,
            cameraMode: this.cameraMode,
            camera: this.camera ? {
                pos: this.camera.threeCamera.position.toArray().map((v) => Math.round(v * 10) / 10),
                near: this.camera.threeCamera.near,
                far: this.camera.threeCamera.far,
                fov: this.camera.threeCamera.fov,
            } : null,
            background: this.scene?.background?.isColor ? '#' + this.scene.background.getHexString() : String(this.scene?.background),
            readError,
        };
        console.info('[RenderProbe]', info);
        return info;
    }

    _onResize() {
        const rect = this.container.getBoundingClientRect();
        const width = Math.max(1, rect.width || window.innerWidth);
        const height = Math.max(1, rect.height || window.innerHeight);
        // CharacterScene usa viewport 0,25,W,H-50 no contrato PC; o aspect
        // efetivo é reaplicado em render(). Nos demais modos usa o drawable todo.
        const margin = this.cameraMode === 'char' ? Math.max(0, Math.round(25 * (height / 480))) : 0;
        const renderHeight = Math.max(1, height - margin * 2);
        this.camera.onResize(width / renderHeight);
        this.renderer.setSize(width, height, false);
    }

    get raycaster() { return this._raycaster; }
}
