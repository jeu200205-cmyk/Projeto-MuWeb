/**
 * CharacterPreview.js — Personagens 3D REAIS na cena de seleção (GATE 5).
 *
 * Composição base real (0 geometria fake):
 *   Player.bmd (esqueleto-mestre 60 bones/284 actions, 0 meshes)
 *   + peças base/tier da classe (PlayerComposer.composeCharacter)
 *   → MUModelRenderer (SkinnedMesh + skeleton + actions)
 *   → GameScene atrás da UI transparente do CharSelectScene.
 * Equipamento real do CharSet e texturas são preparados antes da publicação.
 * Candidatos incompletos/obsoletos são descartados; o owner anterior é preservado.
 *
 * Contrato PC extraído de CharacterList.lua (S13 real —
 * MOBILE_PROJECT/DeviceData/Data/Configs/Lua/CharacterSystem/, conf. com
 * CharacterList.cpp:87 SetCharacterPosition e ZzzScene.cpp:893
 * CreateCharacterScene → WorldActive=74 → assets World75/Object75 (LoadWorld +1),
 * PJH_NEW_SERVER_SELECT_MAP definido em Defined_Global.h:8):
 *
 *   SetCharacterPosition(index):
 *     index==0 (foreground)  → (8590, 18785, 75), angleZ=75°
 *     demais                 → (0, 19210, 175),   angleZ=75°
 *     TODOS com scale 1.15 (CharacterSetScale 1.15)
 *   RenderProc/ChangeView (clique em slot vivo):
 *     clicado   → ChangeCharacterView(i, 8590, 18785, 75)
 *     demais    → ChangeCharacterView(i, 0, 18785, 75)  [angleX/Y=0.30]
 *     + SetCharacterAction(i, 207)  [PLAYER_CRY1 — _enum.h enum PLAYER_SET=0
 *       contado: 207=PLAYER_CRY1; Player.bmd tem 284 actions, 207<284 ✓]
 *   Segurar botão no slot (CheckRepeatKey LButton) → CharacterRotate:
 *     angleZ += 5° por tick (rotação de inspeção)
 *
 * Espaço: MU é Z-up, mapa [0,25600]². Conversão three (TerrainWorld.js:260):
 *   three.x = mu.x − 12800, three.y = mu.z, three.z = 12800 − mu.y
 * Up-axis: dados permanecem MU (Z-up); o container interno recebe
 * applyMuUpAxis() (rot X −90°) — contrato do BmdAdapter. Yaw MU (angleZ)
 * vira rotação Y no grupo externo (Y-up), mesma inversão de sinal da
 * câmera (applyMuCamera: rotation.y = −az).
 */

import * as THREE from 'three';
import { composeCharacter, buildEquipmentAttach, buildAccessoryRenderer, buildLinkedWeaponRenderer, buildAnimationControl, playerActionPlaySpeed, mergeEquipmentBodyRenderData, applyBodyEquipmentPresentation, pcCharacterScale, getPcTextureSkinIndex, playerVisualLoadIssues, unresolvedClassParts } from './PlayerComposer.js';
import { attachCapeCloth } from './PcCapeCloth.js';
import { applyMuUpAxis, bmdToRenderData } from './BmdAdapter.js';
import { MUModelRenderer } from '../assets/MUModelRenderer.js';
import { MUAssets } from '../assets/MUAssetLoader.js';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { MAP_SIZE } from '../world/TerrainWorld.js';

// Posições oficiais (CharacterList.lua SetCharacterPosition/ChangeCharacterView)
const SEL_POS = [8590, 18785, 75];     // foreground (slot 0 / clicado)
const REST_POS = [0, 19210, 175];      // demais (estado inicial)
const POSTCLICK_REST_POS = [0, 18785, 75]; // demais após 1º clique
const ANGLE_Z = 75;                     // graus (CharacterSetAngleZ)
const ACTION_CRY1 = 207;                // SetCharacterAction(i, 207) = PLAYER_CRY1
// NewRenderCharacterScene() sobrescreve Position[2] de previews normais logo
// antes de RenderCharactersClient(). Usar o Z lógico 75 colocava o modelo
// abaixo da plataforma World75. Helpers/mounts usam 194.5 (ainda pendente).
export const PC_CHARACTER_SCENE_RENDER_Z = 169.5;
export const PC_CHARACTER_SCENE_PEGASUS_RENDER_Z = 194.5;
export const PC_CHARACTER_SCENE_PREVIEW_SLOTS = 5;

/** MU (x,y,z | Z-up) → THREE (x,y,z | Y-up) — mesma conversão de applyMuCamera. */
function muToThree(v, out) {
    out.set(v[0] - MAP_SIZE / 2, v[2], MAP_SIZE / 2 - v[1]);
    return out;
}

// io do composeCharacter: esqueleto via MUAssets (render-data com bones/actions),
// Player.bmd via MUAssets; peças base via fetchBinary + parseBMD bruto para remap ao esqueleto Player
const composerIO = {
    loadBMD: (p) => MUAssets.loadBMD(p),
    fetchBinary: (p) => RemoteAssets.fetchBinary(p),
};

async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(Math.max(1, limit | 0), items.length) }, async () => {
        while (true) {
            const i = next++;
            if (i >= items.length) break;
            out[i] = await fn(items[i], i);
            // O caller controla a concorrência. Não inserir um frame artificial
            // entre personagens: isso tornava o 4º/5º preview visivelmente tardio.
            await Promise.resolve();
        }
    });
    await Promise.all(workers);
    return out;
}

function previewEquipmentSignature(c) {
    const charset = Array.isArray(c?.charset) ? c.charset.join(',') : '';
    return `${String(RemoteAssets.baseUrl || '')}|${String(c?.name || '')}|slot=${Number(c?.slot)}|class=${Number(c?.classId)}|charset=${charset}|previewWing=${Number(c?.customPreview?.wingIndex || 0)}|previewPet=${Number(c?.customPreview?.petIndex || 0)}`;
}

export class CharacterPreview {
    /**
     * @param {import('./Scene.js').GameScene} gameScene cena 3D ativa
     * (scene.threeCamera foca no herói selecionado via gameScene.charFocus)
     */
    constructor(gameScene) {
        this.gameScene = gameScene;
        this.slots = [];          // [{ char, renderer, outer, yawDeg, t }]
        this._clicked = false;    // houve clique (muda posição dos demais)
        this._selectedSlot = -1;  // slot autoritativo clicado/foreground
        this._disposed = false;
        this._syncGeneration = 0;
    }

    /**
     * Sincroniza os modelos com a lista real de chars do GameServer.
     * @param {Array<{name:string, classId:number, slot:number}>} chars
     */
    async setChars(chars) {
        if (this._disposed) return;
        const syncGeneration = ++this._syncGeneration;
        // A UI Lua pode iterar MaxCharactersAccount (até 10), mas a engine 3D
        // usa gCharacterList.MaxCharacters=5 para CharactersClient. Não criar
        // previews 6..10 que o Main não renderiza.
        const list = (chars || [])
            .filter((c) => c && c.name && Number.isInteger(c.classId)
                && Number.isInteger(c.slot) && c.slot >= 0
                && c.slot < PC_CHARACTER_SCENE_PREVIEW_SLOTS)
            .sort((a, b) => a.slot - b.slot);
        const wanted = new Map(list.map((c) => [c.name, previewEquipmentSignature(c)]));

        // Retire departed characters immediately. Changed CharSets keep their live
        // owner until the replacement has completed every awaited dependency.
        for (const s of this.slots) {
            const expected = wanted.get(s.char.name);
            if (!expected) this._removeSlot(s);
        }
        this.slots = this.slots.filter((s) => {
            const expected = wanted.get(s.char.name);
            return Boolean(expected);
        });
        const selectedOwner = this.slots.find(s => s.char.slot === this._selectedSlot);
        if (this._selectedSlot >= 0 && !list.some((c) => c.slot === this._selectedSlot)
            && !(selectedOwner && wanted.has(selectedOwner.char.name))) {
            this._selectedSlot = -1;
            this._clicked = false;
        }

        // A Character Scene do PC publica até 5 previews. Executar as cinco
        // cargas independentes em paralelo evita que o último slot espere a
        // cadeia BMD/textura/equipamento dos anteriores. Continua zero-placeholder
        // e cada slot só aparece quando seu owner real ficou pronto.
        const missingChars = list.filter((c) => !this.slots.some((s) => s.char.name === c.name && s.previewSignature === previewEquipmentSignature(c)));
        await mapLimit(missingChars, Math.min(PC_CHARACTER_SCENE_PREVIEW_SLOTS, missingChars.length || 1), async (c) => {
            let candidate = null;
            let candidateRenderer = null;
            const loadIssues = [];
            const dataAuthority = RemoteAssets.baseUrl;
            try {
                const composed = await composeCharacter(c.classId, composerIO);
                const renderData = composed.renderData;

                // R12.5 (P3 CharSet): equipamento REAL do wire — armas/escudo
                // viram meshes extras no esqueleto (LinkBone 33/42 PC); wing/
                // helper viram renderers próprios (skeleton/actions próprios).
                let finalData = renderData;
                let attach = null;
                if (c.charset) {
                    try {
                        attach = await buildEquipmentAttach(c.charset, composerIO, renderData.bones, renderData.bones.length, { customPreview: c.customPreview || null, classId: c.classId });
                        finalData = mergeEquipmentBodyRenderData(renderData, attach);
                        if (attach.weaponRenderMode !== 'render-link-object' && attach.meshes.length) {
                            finalData = {
                                ...finalData,
                                meshes: [...finalData.meshes, ...attach.meshes],
                                textures: [...finalData.textures, ...attach.textures],
                                source: finalData.source + '+equip',
                            };
                        }
                        if (attach.missing.length || attach.bodyMissing?.length) {
                            // Expose BOTH accessories/weapons and equipped body pieces.
                            // Earlier builds hid bodyMissing, making an equipped set look
                            // silently absent with no physical diagnostic.
                            console.info(`[CharPreview] ${c.name} equipamento ausente (fail-closed, nada inventado): ${JSON.stringify({ attachments:attach.missing, body:attach.bodyMissing || [] })}`);
                        }
                    } catch (e) {
                        loadIssues.push(`charset-attach:${e.message}`);
                        console.warn(`[CharPreview] ${c.name} charset attach falhou (fail-closed): ${e.message}`);
                    }
                }

                const renderer = new MUModelRenderer({
                    scene: this.gameScene.scene,
                    camera: this.gameScene.camera?.threeCamera,
                    skinIndex: getPcTextureSkinIndex(c.classId),
                });
                candidateRenderer = renderer;
                await renderer.initFromBMD(finalData);
                renderer.userData = { ...(renderer.userData || {}),
                    muCompositionMissing: unresolvedClassParts(composed, attach) };
                await applyBodyEquipmentPresentation(renderer, attach).catch((e) => {
                    loadIssues.push(`body-presentation:${e?.message || e}`);
                });

                // externo: posição+yaw (Y-up) | interno: up-axis MU→three
                const inner = renderer.group;
                applyMuUpAxis(inner);
                const outer = new THREE.Group();
                outer.add(inner);
                outer.scale.setScalar(pcCharacterScale(c.classId, { characterScene: true, skin: 0 }));
                outer.visible = true;
                inner.visible = true;
                renderer.group.visible = true;
                outer.name = `CharacterPreview_slot${c.slot}_${c.name}`;
                outer.userData.muCharacter = {
                    slot: c.slot,
                    name: c.name,
                    classId: c.classId,
                    equipment: c.equipment || null,
                };
                outer.userData.muEquipmentDiagnostics = {
                    missing: [...(attach?.missing || [])],
                    bodyMissing: [...(attach?.bodyMissing || [])],
                };
                if (this._disposed || syncGeneration !== this._syncGeneration) {
                    try { renderer.dispose(); } catch (_) {}
                    return null;
                }

                const slot = {
                    char: c, previewSignature: previewEquipmentSignature(c), renderer, outer, yawDeg: ANGLE_Z, t: 0, extras: [],
                    // ZzzScene.cpp::NewRenderCharacterScene: only HELPER+3 /
                    // custom helper type 4 (Dinorant/Pegasus lane) uses 194.5.
                    renderZ: attach?.rider?.species === 'pegasus' ? PC_CHARACTER_SCENE_PEGASUS_RENDER_Z : PC_CHARACTER_SCENE_RENDER_Z,
                    bodyLightColor: new THREE.Color(1, 1, 1),
                    update: (dt) => {
                        const bodyLight = this.gameScene?.terrainLightAt?.(outer.position.x, outer.position.z, slot.bodyLightColor);
                        if (bodyLight) {
                            renderer.setBodyLight(bodyLight);
                            for (const wr of slot.extras) wr?.setBodyLight?.(bodyLight);
                            slot.mount?.renderer?.setBodyLight?.(bodyLight);
                        }
                        slot.t += dt;
                        renderer.update(dt, slot.t);
                        for (const wr of slot.extras) wr.update(dt, slot.t);
                        slot.mount?.update?.(dt, renderer);
                    },
                };

                candidate = slot;
                slot.sceneExtras = [];
                const selectedName = this.slots.find(s => s.char.slot === this._selectedSlot)?.char.name;
                slot._pos = (c.slot === (this._selectedSlot >= 0 ? this._selectedSlot : 0) || c.name === selectedName)
                    ? SEL_POS : (this._clicked ? POSTCLICK_REST_POS : REST_POS);
                this._applyPose(slot);

                // Wing/helper REAIS: skeleton+actions próprios (ex.: Wing42.bmd
                // = 17 bones/1 action). Attach bone-parented nos bones do PC
                // (ZzzCharacter.cpp — wings=47 costas, capas=19 neck+off, imp=34
                // clavícula+off; authority mesh pc-attach-authority-main52).
                // O frame do bone é MU-space: acessório entra SEM applyMuUpAxis
                // (a conversão -90X do inner já cobre a cadeia inteira).
                // Nascem ocultos até textura real resolver (zero-fake).
                for (const [model, tag] of [
                    [attach?.wing, 'wing'],
                    [attach?.helper, 'helper'],
                ]) {
                    if (!model) continue;
                    try {
                        const wr = await buildAccessoryRenderer({ scene: this.gameScene.scene, camera: this.gameScene.camera?.threeCamera }, model);
                        const bone = renderer.bones?.[wr.userData.bone];
                        if (!bone) { wr.dispose(); throw new Error(`bone ${wr.userData.bone} inexistente (${renderer.bones?.length ?? 0} bones)`); }
                        bone.add(wr.group); // bone-parented (PC BoneTransform[LinkBone])
                        slot.extras.push(wr);
                        console.info(`[CharPreview] ${c.name} ${tag} REAL anexado: ${model.path} @bone${wr.userData.bone}`);
                    } catch (e) {
                        loadIssues.push(`accessory:${tag}:${e.message}`);
                        console.warn(`[CharPreview] ${c.name} ${tag} falhou (fail-closed): ${e.message}`);
                    }
                }

                if (attach?.wing?.itemModelType != null) {
                    try {
                        await attachCapeCloth(renderer, {
                            itemModelType: attach.wing.itemModelType,
                            classId: c.classId,
                            custom: Boolean(attach.wing.customWing && attach.wing.isCape),
                        });
                    } catch (e) { loadIssues.push(`cape-cloth:${e.message}`); }
                }

                // Weapons keep their own BMD hierarchy under hand bones, just as
                // RenderLinkObject. This fixes the preview holding pose/geometry
                // instead of baking the weapon into Player.bmd skinning.
                for (const spec of [attach?.weaponRightSpec, attach?.weaponLeftSpec]) {
                    if (!spec) continue;
                    try {
                        const wr = await buildLinkedWeaponRenderer({ scene: this.gameScene.scene, camera: this.gameScene.camera?.threeCamera }, spec);
                        const bone = renderer.bones?.[spec.linkBone];
                        if (!wr || !bone) { wr?.dispose(); throw new Error(`bone ${spec.linkBone} inexistente`); }
                        bone.add(wr.group); slot.extras.push(wr);
                    } catch (e) { loadIssues.push(`weapon:${spec.side}:${e.message}`); console.warn(`[CharPreview] ${c.name} arma ${spec.side} falhou: ${e.message}`); }
                }

                // Preserve the proven class idle timing before the equipment-aware
                // controller selects the exact SetPlayerStop family. The controller
                // may refine this immediately for sword/bow/wand/two-hand clips.
                renderer.playSpeed = playerActionPlaySpeed('idle', c.classId);
                outer.userData.animationControl = buildAnimationControl(renderer, c.classId, attach, { safeZone: false });
                outer.userData.animationControl.play('idle');

                // Mount/rider REAL no Character Select. A FIX40 já decodificava
                // fenrir/unicon/pegasus/dark-horse em buildEquipmentAttach, porém o
                // preview nunca materializava o CreateBug/MoveBug correspondente;
                // resultado: personagem equipado aparecia a pé/invisível na tela.
                // O owner abaixo reutiliza exatamente MountCompanion (mesmo BMD e
                // actions do mundo), com safe-zone=false porque CHARACTER_SCENE não
                // aplica o hide de TW_SAFEZONE. Nada é inferido se petModelPath faltar.
                const previewMount = attach?.rider?.petModelPath ? attach.rider : attach?.fenrir?.petModelPath ? attach.fenrir : null;
                if (previewMount?.petModelPath) {
                    try {
                        const { MountCompanion } = await import('../game/PetSystem.js');
                        const previewOwner = { position: outer.position, mesh: outer, isAlive: () => true };
                        const mount = new MountCompanion(
                            previewOwner, this.gameScene.scene, previewMount.petModelPath, previewMount.option,
                            { safeZone: () => false, species: previewMount.species, behaviorSpecies: previewMount.behaviorSpecies, presentation: previewMount.presentation || null, scale: previewMount.sizeCharList ?? previewMount.size },
                        );
                        await mount.init();
                        slot.mount = mount;
                        slot.sceneExtras.push(mount.root);
                        console.info(`[CharPreview] ${c.name} mount REAL anexado: ${previewMount.petModelPath} species=${mount.species}`);
                    } catch (e) {
                        loadIssues.push(`mount:${e.message}`);
                        console.warn(`[CharPreview] ${c.name} mount falhou (fail-closed): ${e.message}`);
                    }
                }

                // Helper companion (HELPER:0 — fairy/Angel/Dino...): PC
                // CreateBug(MODEL_HELPER) no ChangeCharacterExt do preview
                // (ZzzCharacter.cpp:12646) e RenderBug Scale 1.2 no
                // CHARACTER_SCENE (GOBoid.cpp:690-692). Helper01.bmd real com
                // sparks Spark02 — fail-closed (BMD ausente = sem fake).
                if (attach?.helperKind === 'helper' || attach?.customHelper?.petModelPath) {
                    try {
                        const { HelperCompanion } = await import('../game/PetSystem.js');
                        const previewOwner = {
                            position: outer.position, // referência viva (slot anda → bug segue)
                            isAlive: () => true,
                            safeZone: () => false,
                        };
                        const helperInfo = attach?.customHelper || null;
                        const hc = new HelperCompanion(previewOwner, this.gameScene.scene, 1.2, helperInfo);
                        slot.extras.push({
                            update: (dt) => hc.update(dt), dispose: () => hc.dispose(),
                            get meshes() { return hc.renderer?.meshes; },
                            get userData() { return hc.renderer?.userData; },
                        });
                        await hc.init();
                        slot.sceneExtras.push(hc.root);
                        hc._previewChar = c.name;

                        console.info(`[CharPreview] ${c.name} helper companion REAL (${helperInfo?.petModelPath || 'Player/Helper01.bmd'}, CharacterHelper/stock owner)`);
                    } catch (e) {
                        loadIssues.push(`helper-companion:${e.message}`);
                        console.warn(`[CharPreview] ${c.name} helper companion falhou (fail-closed): ${e.message}`);
                    }
                }

                loadIssues.push(...playerVisualLoadIssues(renderer, slot.extras, attach));
                if (!renderer.meshes?.length) loadIssues.push("empty-player-model");
                if (dataAuthority !== RemoteAssets.baseUrl) loadIssues.push("stale-data-authority");
                if (!this._publishSlot(slot, syncGeneration, loadIssues)) return null;
                candidate = null;
                console.info('[CharPreview] real BMD ready', {
                    slot: c.slot, name: c.name, classId: c.classId,
                    meshes: renderer.meshes?.length ?? 0,
                    weaponsAttached: attach ? attach.meshes.length : 0,
                    wingAttached: slot.extras.length > 0,
                    // R12.DIAG: proporcionar ao usuário triple-space visível
                    // dos chars na cena (evidencia 'sumiram' vs 'off-camera').
                    pos: `mu(${c.slot})→three(${slot.outer.position.x.toFixed(0)},${slot.outer.position.y.toFixed(0)},${slot.outer.position.z.toFixed(0)})`,
                    charSetDecoded: Boolean(c.charset),
                });
                return slot;
            } catch (e) {
                if (candidate) this._removeSlot(candidate);
                else candidateRenderer?.dispose();
                console.warn(`[CharPreview] ${c.name} (class ${c.classId}): ${e.message} — sem modelo placeholder`);
                return null;
            }
        });
        if (this._disposed || syncGeneration !== this._syncGeneration) return;
        this.slots.sort((a, b) => (a.char.slot ?? 0) - (b.char.slot ?? 0));

        // Layout inicial fiel: SOMENTE o slot autoritativo 0 recebe SEL_POS.
        // Se slot 0 estiver vazio, nenhum outro personagem é promovido por
        // conveniência; SetCharacterPosition(lpInfo->slot) do PC preserva os
        // buracos reais. Após clique, o slot clicado vira foreground.
        const fgSlot = this._selectedSlot >= 0 ? this._selectedSlot : 0;
        this._layout(fgSlot);
    }


    /**
     * Character Create preview owner.
     * Uses the same real Player.bmd + class-part composition as Character Select,
     * but with a single server-independent candidate in slot 0. This is an
     * internal render owner only: it never enters protocol state and carries no
     * fake inventory/equipment. Async class switches are fenced by setChars().
     */
    async setCreateClass(classId) {
        const cid = Number(classId);
        if (!Number.isInteger(cid) || cid < 0 || cid > 6) {
            throw new Error(`CharacterPreview.setCreateClass: classId inválido ${classId}`);
        }
        this._clicked = false;
        this._selectedSlot = 0;
        const internalName = `__mu_create_class_${cid}__`;
        await this.setChars([{
            name: internalName,
            classId: cid,
            slot: 0,
            charset: null,
            equipment: null,
            createPreview: true,
        }]);
        if (this._disposed) return false;
        const slot = this.slots.find((x) => (x.char.slot ?? -1) === 0);
        if (!slot) return false;
        slot.outer.userData.muCreatePreview = true;
        if (slot.outer.userData.muCharacter) {
            slot.outer.userData.muCharacter.createPreview = true;
        }
        this._selectedSlot = 0;
        this._layout(0);
        return true;
    }

    _regUpdate(slot) {
        // GameScene.update percorre objects[].userData.update(dt) — registra o
        // grupo externo com o avanço de animação (mixer + boneTexture)
        slot.outer.userData.update = slot.update;
        this.gameScene.objects.push(slot.outer);
    }

    // Publish only a complete, current candidate; replacement is synchronous.
    _publishSlot(slot, generation, issues = []) {
        if (this._disposed || generation !== this._syncGeneration || issues.length) {
            slot.outer.userData.muPreviewLoadIssues = [...issues];
            this.lastLoadIssues = [...issues];
            this._removeSlot(slot);
            if (issues.length) console.warn(`[CharPreview] ${slot.char.name}: candidate incomplete; prior owner retained`, issues);
            return false;
        }
        const prior = this.slots.find(s => s.char.name === slot.char.name);
        if (prior) {
            slot.yawDeg = prior.yawDeg;
            if (this._selectedSlot === prior.char.slot) this._selectedSlot = slot.char.slot;
            this._removeSlot(prior);
            this.slots = this.slots.filter(s => s !== prior);
        }
        this.slots.push(slot);
        this._layout(this._selectedSlot >= 0 ? this._selectedSlot : 0);
        this._regUpdate(slot);
        this.gameScene.scene.add(slot.outer);
        for (const extra of slot.sceneExtras || []) this.gameScene.scene.add(extra);
        this.lastLoadIssues = [];
        return true;
    }

    _removeSlot(slot) {
        const objs = this.gameScene.objects;
        const i = objs.indexOf(slot.outer);
        if (i >= 0) objs.splice(i, 1);
        slot.outer.userData.update = null;
        try { slot.renderer.dispose(); } catch (e) { /* noop */ }
        for (const wr of slot.extras || []) { try { wr.dispose(); } catch (e) { /* noop */ } }
        try { slot.mount?.dispose?.(); } catch (e) { /* noop */ }
        this.gameScene.scene.remove(slot.outer);
    }

    /**
     * Clique/seleção de slot (UpdateProc → ClickedButton).
     * Contrato: clicado → SEL_POS + action 207 (PLAYER_CRY1);
     * demais → POSTCLICK_REST_POS (ChangeCharacterView).
     */
    select(index) {
        if (index < 0 || index >= this.slots.length) return;
        this._clicked = true;
        const slot = this.slots[index];
        this._selectedSlot = Number.isInteger(slot.char.slot) ? slot.char.slot : index;
        // SetCharacterAction(i, 207) — reinicia a action a cada clique (PC)
        const act = slot.renderer.playAction(`action_${ACTION_CRY1}`, 0.25);
        if (act) { act.time = 0; act._fadeWeight = act.weight; }
        this._layout(this._selectedSlot);
    }

    /** Seleciona pelo slot autoritativo do GameServer (não por índice compactado). */
    selectSlot(slotNo) {
        const i = this.slots.findIndex((s) => (s.char.slot ?? -1) === slotNo);
        if (i >= 0) this.select(i);
    }

    /** CharacterRotate pelo slot autoritativo. */
    rotateSlot(slotNo, deltaDeg = 5) {
        const i = this.slots.findIndex((s) => (s.char.slot ?? -1) === slotNo);
        if (i >= 0) this.rotate(i, deltaDeg);
    }

    /** CharacterRotate: angleZ += 5° (drag no slot). */
    rotate(index, deltaDeg = 5) {
        const slot = this.slots[index];
        if (!slot) return;
        slot.yawDeg += deltaDeg;
        this._applyPose(slot);
    }

    _layout(fgSlotNo) {
        this.slots.forEach((s) => {
            const isFg = (s.char.slot ?? -1) === fgSlotNo;
            s._pos = isFg ? SEL_POS : (this._clicked ? POSTCLICK_REST_POS : REST_POS);
            this._applyPose(s);
        });
        const fg = this.slots.find((s) => (s.char.slot ?? -1) === fgSlotNo);
        if (fg) {
            this.gameScene.charFocus = muToThree(fg._pos, new THREE.Vector3());
            this.gameScene.charFocus.y = Number(fg.renderZ || PC_CHARACTER_SCENE_RENDER_Z);
        } else {
            this.gameScene.charFocus = null;
        }
    }

    _applyPose(slot) {
        if (!slot._pos) return;
        muToThree(slot._pos, slot.outer.position);
        // PC NewRenderCharacterScene: Z lógico vindo do Lua (75/175) é
        // sobrescrito para 169.5 imediatamente antes do draw do personagem.
        slot.outer.position.y = Number(slot.renderZ || PC_CHARACTER_SCENE_RENDER_Z);
        // yaw MU (angleZ, Z-up) → rotação Y Three. A base MU→Three já faz a mudança de eixo;
        // aplicar outro sinal invertia os 75° authored da CharacterList.lua e deixava o preview de costas.
        slot.outer.rotation.y = slot.yawDeg * Math.PI / 180;
        const bodyLight = this.gameScene?.terrainLightAt?.(slot.outer.position.x, slot.outer.position.z, slot.bodyLightColor);
        if (bodyLight) {
            slot.renderer?.setBodyLight?.(bodyLight);
            for (const wr of slot.extras || []) wr?.setBodyLight?.(bodyLight);
            slot.mount?.renderer?.setBodyLight?.(bodyLight);
        }
    }

    dispose() {
        this._disposed = true;
        this._syncGeneration++;
        for (const s of [...this.slots]) this._removeSlot(s);
        this.slots = [];
        this.gameScene.charFocus = null;
    }
}
