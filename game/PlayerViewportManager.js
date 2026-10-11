/**
 * PlayerViewportManager.js — R12.5: jogadores REMOTOS do viewport 0x12.
 *
 * Antes desta lane, GameApp._applyPlayerViewport só processava o HERÓI (match
 * por nome) e os demais jogadores do 0x12 (co-players REALS, ex.: 'LevelUP',
 * 'idlv400' Mr.FenecoValhalla no runtime vivo) eram simplesmente descartados —
 * mundo parecia vazio apesar do stream correto. Agora cada player do servidor
 * vira um personagem BMD REAL (Player.bmd + peças da classe + equipment real
 * do Equipment×17 → CharSet[18], mesma lança do herói/preview).
 *
 * Autoridade PC:
 * - WSclient.cpp:2239-2275 ReceiveCreatePlayerViewport: entries com
 *   Key/PosX/PosY/Class/Equipment/ID — key = viaKey para add/remove/updates.
 * - CHANGE: NPC/herói boundary: herói fica no pipeline GameApp.playerChar
 *   (match name — bug predatório evita herói duplicado).
 * - DeleteViewport 0x14: PHEADER_DEFAULT count + [KeyH][KeyL] pares
 *   (bit15 = DeleteFlag) — matched contra byKey aqui.
 *
 * Fail-closed: compose fails → log explícito + nada inventado. Nenhum
 * placeholder de visual de personagem é criado.
 *
 * Sistema de posições: convertido tile→three exatamente como o herói:
 *   x=(tile+0.5)×100−12800, z=12800−(tile+0.5)×100, yaw = shared Main-5.2 direction bridge (no lateral mirror)
 */

import * as THREE from 'three';
import { muDirectionToThreeYaw } from './MUDirection.js';
import { composeCharacter, buildEquipmentAttach, buildAccessoryRenderer, buildLinkedWeaponRenderer, buildAnimationControl, setLinkedWeaponSafeZonePresentation, mergeEquipmentBodyRenderData, applyBodyEquipmentPresentation, pcCharacterScale, getPcTextureSkinIndex, playerVisualLoadIssues, unresolvedClassParts } from '../graphics/PlayerComposer.js';
import { attachCapeCloth } from '../graphics/PcCapeCloth.js';
import { applyMuUpAxis } from '../graphics/BmdAdapter.js';
import { MUModelRenderer } from '../assets/MUModelRenderer.js';
import { MUAssets } from '../assets/MUAssetLoader.js';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { serverClassToClientClass } from '../data/CharacterClassMap.js';
import { BuffContainer } from './BuffSystem.js';
import { Movement } from './Movement.js';
import { pcWorldActiveFromAssetWorld, pcInBloodCastle, pcInChaosCastle, pcInSwimLocomotionWorld } from './PcMapContext.js';
import { HelperCompanion, Pet, MountCompanion } from './PetSystem.js';
import { remoteCompanionQueue } from './CompanionLoadQueue.js';
import { resolveCustomPreviewElements } from '../data/CustomPreviewElements.js';


// ---------------------------------------------------------------------------
// R73 — exact PC/Android 0x25 compact CharacterSet patch owner.
// Authority: PC ReceiveChangePlayer / Android Build 15.23, where GCItemChangeSend
// carries key[2] + ItemInfo[12] (+ optional legacy ElementSlot byte). Keep this
// pure so protocol/runtime tests can verify the byte law without WebGL.
// ---------------------------------------------------------------------------
export function decodeChangeCharacterItemType(item) {
    if (!item || item.length < 12) return 0x1FFF;
    return (item[0] | ((item[3] & 0x80) * 2) | ((item[5] & 0xF0) * 32)) >>> 0;
}

function setPackedEquipmentLevel(e, shift, encodedLevel) {
    if (!e || shift < 0 || shift > 18) return;
    let packed = ((e[5] << 16) | (e[6] << 8) | e[7]) >>> 0;
    packed = (packed & ~(7 << shift)) | ((encodedLevel & 7) << shift);
    e[5] = (packed >>> 16) & 0xFF;
    e[6] = (packed >>> 8) & 0xFF;
    e[7] = packed & 0xFF;
}

function setWeaponCharacterSet(e, hand, itemType, empty, level) {
    if (!e || (hand !== 0 && hand !== 1)) return false;
    const extByte = hand === 0 ? 11 : 12;
    if (empty) {
        e[hand] = 0xFF;
        e[extByte] = (e[extByte] & 0x0F) | 0xF0;
    } else {
        e[hand] = itemType & 0xFF;
        e[extByte] = (e[extByte] & 0x0F) | (((itemType >>> 8) & 0x0F) << 4);
    }
    setPackedEquipmentLevel(e, hand === 0 ? 0 : 3, empty ? 0 : level);
    return true;
}

function setBodyCharacterSet(e, slotCode, itemType, empty, level) {
    if (!e || slotCode < 2 || slotCode > 6) return false;
    const index = empty ? 0x1FF : (itemType & 0x1FF);
    const lo = index & 0x0F, mid = (index >>> 4) & 0x01, hi = (index >>> 5) & 0x0F;
    switch (slotCode) {
        case 2: e[2] = (e[2] & 0x0F) | (lo << 4); e[8] = (e[8] & ~0x80) | (mid ? 0x80 : 0); e[12] = (e[12] & 0xF0) | hi; break;
        case 3: e[2] = (e[2] & 0xF0) | lo; e[8] = (e[8] & ~0x40) | (mid ? 0x40 : 0); e[13] = (e[13] & 0x0F) | (hi << 4); break;
        case 4: e[3] = (e[3] & 0x0F) | (lo << 4); e[8] = (e[8] & ~0x20) | (mid ? 0x20 : 0); e[13] = (e[13] & 0xF0) | hi; break;
        case 5: e[3] = (e[3] & 0xF0) | lo; e[8] = (e[8] & ~0x10) | (mid ? 0x10 : 0); e[14] = (e[14] & 0x0F) | (hi << 4); break;
        case 6: e[4] = (e[4] & 0x0F) | (lo << 4); e[8] = (e[8] & ~0x08) | (mid ? 0x08 : 0); e[14] = (e[14] & 0xF0) | hi; break;
        default: return false;
    }
    setPackedEquipmentLevel(e, 6 + (slotCode - 2) * 3, empty ? 0 : level);
    return true;
}

function setWingCharacterSet(e, itemType, empty) {
    if (!e) return false;
    e[4] &= ~0x0C; e[8] &= ~0x07; e[15] &= ~0x1C; e[16] &= ~0xE0;
    if (empty) { e[4] |= 0x0C; return true; }
    const group = Math.floor(itemType / 512), index = itemType % 512;
    if (group === 13 && index === 30) { e[4] |= 0x0C; e[8] |= 5; return true; }
    if (group !== 12) return false;
    if (index >= 0 && index <= 2) { e[4] |= (index & 3) << 2; return true; }
    if (index >= 3 && index <= 6) { e[4] |= 0x0C; e[8] |= index - 2; return true; }
    if (index === 41 || index === 42) { e[4] |= 0x0C; e[8] |= index === 41 ? 6 : 7; return true; }
    if (index >= 36 && index <= 40) { e[15] |= (index - 35) << 2; return true; }
    if (index === 43) { e[15] |= 6 << 2; return true; }
    if (index >= 130 && index <= 134) { e[16] |= (index - 129) << 5; return true; }
    return false;
}

function setHelperCharacterSet(e, itemType, empty, option) {
    if (!e) return false;
    e[4] &= ~0x03; e[9] &= ~0x01; e[11] &= ~0x05; e[15] &= ~0xE3; e[16] &= ~0x01;
    if (empty) { e[4] |= 3; return true; }
    const group = Math.floor(itemType / 512), index = itemType % 512;
    if (group !== 13) return false;
    if (index >= 0 && index <= 2) { e[4] |= index; return true; }
    if (index === 3) { e[4] |= 3; e[9] |= 1; return true; }
    if (index === 4) { e[4] |= 3; e[11] |= 1; return true; }
    if (index === 37) {
        e[4] |= 3; e[11] |= 4;
        if (option === 1) e[15] |= 1; else if (option === 2) e[15] |= 2; else if (option === 4) e[16] |= 1;
        return true;
    }
    const ext = new Map([[64,32],[65,64],[67,128],[80,224],[106,160],[123,96]]).get(index);
    if (ext == null) return false;
    e[15] = (e[15] & 0x1F) | ext;
    return true;
}

export function applyChangeCharacterToEquipment(equipment, change) {
    if (!Array.isArray(equipment) || equipment.length !== 17 || !change) return { applied:false, reason:'equipment_invalid' };
    const item = Array.from(change.item || []);
    if (item.length !== 12) return { applied:false, reason:'item_invalid' };
    const next = Array.from(equipment, (v) => Number(v) & 0xFF);
    const slotCode = Number.isInteger(change.slotCode) ? change.slotCode : (item[1] >>> 4);
    const itemType = Number.isInteger(change.itemType) ? change.itemType : decodeChangeCharacterItemType(item);
    const encodedLevel = Number.isInteger(change.encodedLevel) ? change.encodedLevel : (item[1] & 0x0F);
    const option = Number.isInteger(change.option) ? change.option : (item[3] & 0x3F);
    const elementSlot = Number.isInteger(change.elementSlot) ? change.elementSlot : 0;
    const empty = itemType === 0x1FFF;
    if (elementSlot === 236 || elementSlot === 237)
        return { applied:false, deferred:true, reason:'element_helper', equipment:next, slotCode, itemType, empty, elementSlot };
    let applied = false;
    if (slotCode === 0 || slotCode === 1) applied = setWeaponCharacterSet(next, slotCode, itemType, empty, encodedLevel);
    else if (slotCode >= 2 && slotCode <= 6) applied = setBodyCharacterSet(next, slotCode, itemType, empty, encodedLevel);
    else if (slotCode === 7) applied = setWingCharacterSet(next, itemType, empty);
    else if (slotCode === 8) applied = setHelperCharacterSet(next, itemType, empty, option);
    return { applied, deferred:false, reason:applied?'applied':'unsupported', equipment:next, slotCode, itemType, empty, encodedLevel, option, elementSlot };
}

function equipmentSignature(classByte, equipment) {
    return `${Number(classByte) & 0xFF}:${Array.from(equipment || []).map((v)=>Number(v)&0xFF).join(',')}`;
}

export class PlayerViewportManager {
    /**
     * @param scene scena de GameApp/Scene (tem .scene/TRÊS, .camera.threeCamera,
     *        .terrainHeightAt(x,z), .addObject(obj))
     * @param opts.io  override de IO p/ testes headless (default = produção).
     */
    constructor(scene, opts = {}) {
        this.scene = scene;
        this.io = opts.io || {
            loadBMD: (p) => MUAssets.loadBMD(p),
            fetchBinary: (p) => RemoteAssets.fetchBinary(p),
        };
        /** key → { renderer, outer, extras[], t, id, classId } */
        this.byKey = new Map();
        this.totalCreated = 0;
        this.totalRemoved = 0;
        this._equipmentJobs = new Map();
        this._pendingAppearanceChanges = new Map();
        this._viewportEpoch = 0;
        this._keyVersions = new Map();
        this._appearanceVersions = new Map();
        this._desiredAppearance = new Map();
        this._disposed = false;
        this._missingEquipmentSignatures = new Map();
    }

    poseCullingReport() {
        return { updated:this._poseBmdUpdated||0, skipped:this._poseBmdSkipped||0, retainedActors:this.byKey.size };
    }

    missingEquipmentReport() {
        return [...this._missingEquipmentSignatures.entries()].map(([signature, row]) => ({
            signature,count:row.count,examples:row.examples.slice(),firstAt:row.firstAt,lastAt:row.lastAt
        }));
    }

    /** Verifica se a entrada já está enxergando o nosso herói (não re-spawn) */
    isHeroEntry(player, heroName) {
        if (!heroName || !player?.id) return false;
        return player.id.trim().toLowerCase() === heroName.trim().toLowerCase();
    }

    /**
     * Spawna/atualiza players NÃO-herói do 0x12. Returns created count.
     * Entry: {key, id, classByte, equipment, x, y, dir | path}
     */
    async spawnFromServer(list, heroName = null, { acceptEntry = null } = {}) {
        const epoch = this._viewportEpoch;
        if (this._disposed) return { created:0, updated:0 };
        if (!Array.isArray(list) || list.length === 0) return { created: 0, updated: 0 };
        let created = 0, updated = 0;
        // FIX154: network/IO for dozens of remote BMD models used to run
        // sequentially, delaying the world join by the sum of all waits.
        // A bounded pair prepares independent keys concurrently. If a packet
        // repeats a key, the final snapshot for that SAME packet is authority.
        // The outer GameApp admission barrier still serializes packet order,
        // and each actor is fenced by epoch and 0x14 key-generation.
        const byKeyInPacket = new Map();
        for (const e of list) {
            if (e && Number.isInteger(e.key)) byKeyInPacket.set(e.key,e);
        }
        const uniqueEntries = [...byKeyInPacket.values()];
        let cursor = 0;
        const consume = async () => {
          while (cursor < uniqueEntries.length) {
            const e = uniqueEntries[cursor++];
            if (epoch !== this._viewportEpoch || this._disposed) break;
            if (!e || !Number.isInteger(e.key)) continue;
            // A single 0x12 batch may await BMD for an earlier actor while a
            // later actor in that SAME batch is deleted by 0x14. Recheck the
            // wire-time generation immediately before each actor starts.
            if (typeof acceptEntry === 'function' && !acceptEntry(e)) continue;
            if (this.isHeroEntry(e, heroName)) continue;

            const existing = this.byKey.get(e.key);
            if (existing) {
                const keyVersion = this._keyVersions.get(e.key) || 0;
                // Apply server transform now, while the live graph remains
                // visible. Never replay this old position after async decoding.
                const nx = (e.x + 0.5) * 100 - 12800;
                const nz = 12800 - (e.y + 0.5) * 100;
                existing.outer.position.set(nx, existing.outer.position.y, nz);
                if (this.scene.terrainHeightAt) existing.outer.position.y = this.scene.terrainHeightAt(nx, nz);
                // A fresh GS 0x12 position replaces any in-flight D4 visual
                // destination. Otherwise the next render tick drags the actor
                // back toward a superseded tile after the authoritative snap.
                existing.moveTarget = null;
                if (existing.motionChar) existing.motionChar._muRunProgress = 0;
                existing.outer.rotation.y = muDirectionToThreeYaw(e.dir ?? ((e.path >> 4) & 7));
                existing.buffContainer?.setServerBuffSnapshot?.(e.buffs || []);
                existing.serverBuffSnapshot = Array.from(e.buffs || []);
                existing.serverTileX = e.x; existing.serverTileY = e.y;
                existing.serverDir = e.dir ?? ((e.path >> 4) & 7);
                if (Array.isArray(e.equipment) && e.equipment.length === 17 &&
                    (equipmentSignature(e.classByte, e.equipment) !== existing.appearanceSignature ||
                    playerVisualLoadIssues(existing.renderer, existing.extras, existing.equipment).length > 0)) {
                    await this.applyEquipmentSnapshot(e.key, e.classByte, e.equipment, {source:'0x12'});
                    if (epoch !== this._viewportEpoch || this._disposed) break;
                    if (keyVersion !== (this._keyVersions.get(e.key) || 0)) continue;
                }
                if (this.byKey.has(e.key)) updated++;
                continue;
            }

            // SPAWN NOVO — falha isolada por player (nunca aborta a bateria;
            // somente o player com problema fica de fora, com log real).
            try {
                const fresh = await this._trySpawnRemote(e);
                if (fresh) created++;
            } catch (err) {
                console.error(`[PlayerViewport] spawn de ${e?.id ?? 'desconhecido'} (key=${e?.key}) FALHOU: ${err.message}`);
            }
          }
        };
        await Promise.all(Array.from({length:Math.min(2,uniqueEntries.length)},()=>consume()));
        return { created, updated };
    }

    /** Remove keys enviadas pelo 0x14 (DeleteViewport) */
    removeByServerKeys(keys) {
        let removed = 0;
        for (const { key } of keys ?? []) {
            this._keyVersions.set(key, (this._keyVersions.get(key) || 0) + 1);
            this._appearanceVersions.set(key, (this._appearanceVersions.get(key) || 0) + 1);
            this._desiredAppearance.delete(key);
            this._pendingAppearanceChanges.delete(key);
            const e = this.byKey.get(key);
            if (!e) continue;
            this._disposeEntry(e);
            this.byKey.delete(key);
            this._pendingAppearanceChanges.delete(key);
            removed++;
        }
        this.totalRemoved += removed;
        return removed;
    }

    get size() { return this.byKey.size; }

    /** Invalida todo o viewport remoto em teleport/map-change. */
    clear() {
        this._viewportEpoch++;
        this._equipmentJobs.clear();
        this._desiredAppearance.clear();
        this._pendingAppearanceChanges.clear();
        this._missingEquipmentSignatures.clear();
        return this.removeByServerKeys([...this.byKey.keys()].map((key) => ({ key })));
    }

    /** Lookup O(1) por key do GameServer (ReceiveMagic/Attack/Action). */
    getByServerKey(key) { return this.byKey.get(key) || null; }

    /**
     * ReceiveMoveCharacter (0xD4) presentation owner for remote players.
     * The server owns the destination tile/yaw; Web only interpolates the
     * already-authoritative one-step path instead of teleporting the model to
     * every D4. This mirrors the PC PathFinding2 -> MovePath presentation law
     * for the adjacent-step packets used by this lane and removes the visible
     * stop/side-jump between network updates.
     */
    setMoveTarget(key, x, y, dir = 0) {
        const entry = this.byKey.get(key);
        if (!entry || !Number.isInteger(x) || !Number.isInteger(y)) return false;
        const wx = (x + 0.5) * 100 - 12800;
        const wz = 12800 - (y + 0.5) * 100;
        const wy = this.scene?.terrainHeightAt?.(wx, wz) ?? entry.outer.position.y;
        entry.moveTarget = { x: wx, y: wy, z: wz, tileX: x, tileY: y, dir: dir & 7 };
        // D4 already owns the destination tile. Keep the same authoritative
        // tile in the actor snapshot used by later F3:13/0x25 BMD rebuilds.
        entry.serverTileX = x;
        entry.serverTileY = y;
        entry.serverDir = dir & 7;
        entry.outer.rotation.y = muDirectionToThreeYaw(dir);
        return true;
    }

    /** 0x15/teleport-style correction: snap only when the server explicitly
     * sends a position correction, and retire any visual path in progress. */
    setPositionCorrection(key, x, y) {
        const entry = this.byKey.get(key);
        if (!entry || !Number.isInteger(x) || !Number.isInteger(y)) return false;
        const wx = (x + 0.5) * 100 - 12800;
        const wz = 12800 - (y + 0.5) * 100;
        const wy = this.scene?.terrainHeightAt?.(wx, wz) ?? entry.outer.position.y;
        entry.moveTarget = null;
        // 0x15 is a newer GS-owned correction, not just a renderer snap.
        // Retain its tile for subsequent equipment/preview reconstruction.
        entry.serverTileX = x;
        entry.serverTileY = y;
        entry.outer.position.set(wx, wy, wz);
        entry.motionChar._muRunProgress = 0;
        // 0x15 is a position-only GS correction, not an action packet.
        // The next frame already resolves locomotion idle after a stopped D4;
        // forcing idle here would interrupt a concurrent 0x19/0x1A Player.bmd
        // LoopOnce before its authored animation reaches completion.
        return true;
    }

    /** FIX154 remote physical companions use the same CharSet owner after
     * normal AND staged appearance publication. Non-publication never starts a
     * companion; stale loads are discarded before modifying the live scene. */
    _queueStockCompanions(entry, attach = entry?.equipment) {
        if (!entry || entry.disposed || this._disposed) return;
        const outer = entry.outer;
        const key = entry.key;
        const epoch = this._viewportEpoch;
        const remoteOwner = {position:outer.position,mesh:outer,isAlive:()=>!entry.disposed};
        const safeZone = () => Boolean(this.scene?.terrainWallAt?.(outer.position.x,outer.position.z)&1);
        const stockCompanionSpecs=[];
        if (attach?.darkSpirit?.petModelPath) stockCompanionSpecs.push({
            kind:'dark-spirit',path:attach.darkSpirit.petModelPath,
            make:()=>new Pet(remoteOwner,this.scene.scene,attach.darkSpirit.petModelPath) });
        if (attach?.helperKind==='helper' && !attach?.customHelper) stockCompanionSpecs.push({
            kind:'helper',path:'Player/Helper01.bmd',
            make:()=>new HelperCompanion(remoteOwner,this.scene.scene,1.0,
                {petModelPath:'Player/Helper01.bmd'}) });
        const mountSpec = attach?.rider?.petModelPath ? attach.rider : attach?.fenrir;
        if (mountSpec?.petModelPath) stockCompanionSpecs.push({
            kind:'mount',path:mountSpec.petModelPath,
            make:()=>new MountCompanion(remoteOwner,this.scene.scene,
                mountSpec.petModelPath,mountSpec.option??0,{safeZone}) });
        const valid=()=>!entry.disposed&&!this._disposed&&this._viewportEpoch===epoch&&
            this.byKey.get(key)===entry;
        for (const spec of stockCompanionSpecs) {
            void remoteCompanionQueue.schedule(async()=>{
                const c=spec.make();
                try {await c.init();return c;}
                catch(err){c.dispose?.();throw err;}
            },valid).then(c=>{
                if (!c) return;
                if (!valid()) {c.dispose?.();return;}
                entry.additionalCompanions.push(c);
            });
        }
    }

    _disposeEntry(entry) {
        if (!entry || entry.disposed) return;
        entry.disposed = true;
        // Remove from BOTH Three scene and GameScene update registry. R72 only
        // detached the Object3D, leaving its userData.update in `scene.objects`;
        // repeated viewport/equipment rebuilds accumulated invisible animation
        // work and stale motion callbacks.
        if (entry.outer) {
            if (typeof this.scene?.removeObject === 'function') this.scene.removeObject(entry.outer);
            else {
                if (this.scene?.scene) this.scene.scene.remove(entry.outer);
                const list = this.scene?.objects;
                const i = Array.isArray(list) ? list.indexOf(entry.outer) : -1;
                if (i >= 0) list.splice(i, 1);
            }
            entry.outer.userData.update = null;
        }
        try { entry.renderer?.dispose?.(); } catch (_ignore) { /* noop */ }
        for (const wr of entry.extras || []) { try { wr.dispose?.(); } catch (_ignore) { /* noop */ } }
        try { entry.customHelperCompanion?.dispose?.(); } catch (_ignore) { /* noop */ }
        for (const c of entry.additionalCompanions || []) { try { c?.dispose?.(); } catch (_) { /* noop */ } }
        try { entry.elementCompanions?.first?.dispose?.(); } catch (_ignore) { /* noop */ }
        try { entry.elementCompanions?.second?.dispose?.(); } catch (_ignore) { /* noop */ }
    }

    /** Full authoritative appearance snapshot (0x12 or F3:13). */
    applyEquipmentSnapshot(key, classByte, equipment, meta = {}) {
        const eq = Array.from(equipment || [], (v) => Number(v) & 0xFF);
        if (!Number.isInteger(key) || eq.length !== 17) return Promise.resolve(false);
        if (this._disposed) return Promise.resolve(false);
        const epoch = this._viewportEpoch;
        const revision = (this._appearanceVersions.get(key) || 0) + 1;
        this._appearanceVersions.set(key, revision);
        this._desiredAppearance.set(key, { revision, classByte:Number(classByte)&0xFF, equipment:eq });
        if (!this.byKey.has(key)) {
            // Full truth arriving during initial BMD loading supersedes older
            // pending deltas and is applied after the initial actor publishes.
            this._pendingAppearanceChanges.delete(key);
            return Promise.resolve(false);
        }
        const accepts = () => !this._disposed && epoch === this._viewportEpoch && revision === this._appearanceVersions.get(key);
        const previous = this._equipmentJobs.get(key) || Promise.resolve();
        const job = previous.catch(() => {}).then(async () => {
            if (!accepts()) return false;
            const old = this.byKey.get(key);
            if (!old) return false;
            const sig = equipmentSignature(classByte, eq);
            const requestedPreview = meta.customPreview ?? old.customPreview ?? null;
            const previewChanged = (
                Number(requestedPreview?.wingIndex || 0) !== Number(old.customPreview?.wingIndex || 0) ||
                Number(requestedPreview?.petIndex || 0) !== Number(old.customPreview?.petIndex || 0) ||
                Number(requestedPreview?.secondPetIndex || 0) !== Number(old.customPreview?.secondPetIndex || 0) ||
                Number(requestedPreview?.element?.[0] || 0) !== Number(old.customPreview?.element?.[0] || 0) ||
                Number(requestedPreview?.element?.[1] || 0) !== Number(old.customPreview?.element?.[1] || 0)
            );
            if (!meta.forcePreview && !previewChanged && sig === old.appearanceSignature && playerVisualLoadIssues(old.renderer, old.extras, old.equipment).length === 0) return false;
            const spawnSpec = {
                key, id: old.id, classByte: Number(classByte) & 0xFF, equipment: eq,
                x: Number.isInteger(old.serverTileX) ? old.serverTileX : Math.max(0, Math.min(255, Math.floor((old.outer.position.x + 12800) / 100))),
                y: Number.isInteger(old.serverTileY) ? old.serverTileY : Math.max(0, Math.min(255, Math.floor((12800 - old.outer.position.z) / 100))),
                dir: Number.isInteger(old.serverDir) ? old.serverDir : 0,
                buffs: Array.from(old.serverBuffSnapshot || []),
                customPreview: requestedPreview,
            };
            const fresh = await this._trySpawnRemote(spawnSpec, { publish:false });
            if (!fresh) return false;
            if (!accepts() || this.byKey.get(key) !== old) { this._disposeEntry(fresh); return false; }
            const issues = playerVisualLoadIssues(fresh.renderer, fresh.extras, fresh.equipment);
            if (issues.length) {
                this._disposeEntry(fresh);
                console.warn(`[PlayerViewport] appearance incomplete key=${key}; graph anterior preservado: ${issues.join(', ')}`);
                return false;
            }
            // F3:13/0x25 appearance IO is asynchronous. D4, 0x15 and 0x12
            // can update the still-published actor while its replacement BMD
            // loads. Transfer the newest GS-owned snapshot at the commit
            // boundary, not the pre-await spawnSpec; visual rebuilding must
            // never rewind authoritative position, facing or buff states.
            fresh.serverTileX = old.serverTileX;
            fresh.serverTileY = old.serverTileY;
            fresh.serverDir = old.serverDir;
            fresh.serverBuffSnapshot = Array.from(old.serverBuffSnapshot || []);
            fresh.buffContainer?.setServerBuffSnapshot?.(fresh.serverBuffSnapshot);
            fresh.outer.position.copy(old.outer.position);
            fresh.outer.rotation.copy(old.outer.rotation);
            fresh.moveTarget = old.moveTarget ? { ...old.moveTarget } : null;
            fresh.motionChar._muRunProgress = old.motionChar?._muRunProgress || 0;
            fresh.customPreview = requestedPreview;
            this.scene.addObject(fresh.outer);
            this.byKey.set(key, fresh);
            this._queueStockCompanions(fresh, fresh.equipment);
            this._disposeEntry(old);
            console.info(`[PlayerViewport] appearance rebuild key=${key} source=${meta.source || 'snapshot'} class=0x${(Number(classByte)&0xFF).toString(16)}`);
            return true;
        }).finally(() => {
            if (this._desiredAppearance.get(key)?.revision === revision) this._desiredAppearance.delete(key);
            if (this._equipmentJobs.get(key) === job) this._equipmentJobs.delete(key);
        });
        this._equipmentJobs.set(key, job);
        return job;
    }

    /** Incremental PC ReceiveChangePlayer / head 0x25. */
    async applyChangeCharacter(change) {
        const key = change?.key;
        const entry = Number.isInteger(key) ? this.byKey.get(key) : null;
        if (!entry) {
            if (Number.isInteger(key)) {
                const desired = this._desiredAppearance.get(key);
                if (desired) {
                    const patched = applyChangeCharacterToEquipment(desired.equipment, change);
                    if (patched.applied) return this.applyEquipmentSnapshot(key, desired.classByte, patched.equipment, {source:'pending-0x25'});
                }
                const queue = this._pendingAppearanceChanges.get(key) || [];
                queue.push({ ...change, item:Array.from(change.item || []) });
                while (queue.length > 9) queue.shift();
                this._pendingAppearanceChanges.set(key, queue);
            }
            return false;
        }
        const desired = this._desiredAppearance.get(key);
        const patched = applyChangeCharacterToEquipment(desired?.equipment || entry.equipmentBytes, change);
        if (patched.deferred) {
            console.info(`[PlayerViewport] 0x25 element helper deferred key=${key} element=${patched.elementSlot}`);
            return false;
        }
        if (!patched.applied) {
            console.warn(`[PlayerViewport] 0x25 unsupported key=${key} slot=${patched.slotCode} type=${patched.itemType}`);
            return false;
        }
        const rebuilt = await this.applyEquipmentSnapshot(key, desired?.classByte ?? entry.classByte, patched.equipment, { source:'0x25' });
        console.info(`[PlayerViewport] 0x25 appearance ${rebuilt ? 'rebuilt' : 'retained'} key=${key} slot=${patched.slotCode} type=${patched.itemType} empty=${patched.empty ? 1 : 0}`);
        return rebuilt;
    }

    /**
     * F3:72 state companion. This binds retained custom-preview truth to the
     * current runtime actor without inventing custom model paths. Once the real
     * CustomWings/CustomPets tables are ported, this metadata is the input for
     * a physical accessory rebuild rather than a second protocol parser.
     */
    applyCustomPreviewState(owner) {
        if (!owner?.get) return 0;
        let applied = 0;
        for (const [key, entry] of this.byKey) {
            // PC/custom lineage can associate preview metadata by character name
            // before the runtime viewport key is stable. Prefer key, then exact
            // normalized name; never infer from slot/order.
            const next = owner.get(key) || owner.getByName?.(entry.id) || null;
            const prevWing = Number(entry.customPreview?.wingIndex || 0);
            const nextWing = Number(next?.wingIndex || 0);
            const prevPet = Number(entry.customPreview?.petIndex || 0);
            const nextPet = Number(next?.petIndex || 0);
            const prevElement0 = Number(entry.customPreview?.element?.[0] || 0);
            const nextElement0 = Number(next?.element?.[0] || 0);
            const prevElement1 = Number(entry.customPreview?.element?.[1] || 0);
            const nextElement1 = Number(next?.element?.[1] || 0);
            entry.customPreview = next;
            if (next) applied++;
            // FIX51: F3:72 is not metadata-only. In the PC lineage WingIndex is
            // applied after ChangeCharacterExt, therefore an already-published
            // remote actor must transactionally rebuild its linked wing owner
            // when that authoritative index changes. Body/weapons stay cached.
            if ((prevWing !== nextWing || prevPet !== nextPet || prevElement0 !== nextElement0 || prevElement1 !== nextElement1) && Array.isArray(entry.equipmentBytes) && entry.equipmentBytes.length === 17) {
                this.applyEquipmentSnapshot(key, entry.classByte, entry.equipmentBytes, {
                    source:'F3:72', customPreview:next, forcePreview:true,
                }).catch((err) => console.warn(`[PlayerViewport] F3:72 custom preview key=${key} falhou: ${err?.message || err}`));
            }
        }
        return applied;
    }


    /** === PRIVADO === */
    async _trySpawnRemote(e, opts = {}) {
        const epoch = this._viewportEpoch;
        let keyVersion = this._keyVersions.get(e.key) || 0;
        if (opts.publish !== false) {
            keyVersion++;
            this._keyVersions.set(e.key, keyVersion);
        }
        const classByte = Number.isInteger(e.classByte) ? e.classByte : 0;
        const classId = serverClassToClientClass(classByte);
        // CharSet[18] = [classByte, ...equipment(17)] — mesmo formato F3:00
        const charset = (Array.isArray(e.equipment) && e.equipment.length === 17)
            ? [classByte, ...e.equipment]
            : null;

        const composed = await composeCharacter(classId, {
            loadBMD: (p) => this.io.loadBMD(p),
            fetchBinary: (p) => this.io.fetchBinary(p),
        });
        let renderData = composed.renderData;
        let attach = null;
        if (charset) {
            attach = await buildEquipmentAttach(charset, this.io, renderData.bones, renderData.bones.length, { customPreview: e.customPreview || null, classId });
            if (attach.missing.length || attach.bodyMissing?.length) {
                // Hundreds of server bots can wear the same unavailable set.
                // Keep full physical paths and per-key counts in the diagnostic,
                // rather than printing one expensive JSON stack for each actor.
                const missing={attachments:attach.missing,body:attach.bodyMissing||[]};
                const signature=JSON.stringify(missing);
                const reports=this._missingEquipmentSignatures;
                const report=reports.get(signature)||{count:0,examples:[],firstAt:Date.now(),lastAt:Date.now()};
                report.count++;report.lastAt=Date.now();
                if(report.examples.length<16)report.examples.push({key:e.key,id:e.id});
                reports.set(signature,report);
                if(report.count===1 || report.count%25===0) {
                    console.warn(`[PlayerViewport] equipamento ausente (fail-closed) group=${report.count}, example=${e.id}: ${signature}`);
                }
            }
            renderData = mergeEquipmentBodyRenderData(renderData, attach);
            if (attach.weaponRenderMode !== 'render-link-object' && attach.meshes.length) {
                renderData = {
                    ...renderData,
                    meshes: [...renderData.meshes, ...attach.meshes],
                    textures: [...renderData.textures, ...attach.textures],
                    source: renderData.source + '+equip',
                };
            }
        }

        const renderer = new MUModelRenderer({
            scene: this.scene.scene,
            camera: this.scene.camera?.threeCamera,
            skinIndex: getPcTextureSkinIndex(classId),
        });
        await renderer.initFromBMD(renderData);
        renderer.userData ??= {};
        renderer.userData.muCompositionMissing = unresolvedClassParts(composed, attach);
        await applyBodyEquipmentPresentation(renderer, attach).catch((err) =>
            console.warn(`[PlayerViewport] body presentation ${e.id} incompleta: ${err?.message || err}`));
        applyMuUpAxis(renderer.group);

        const outer = new THREE.Group();
        outer.add(renderer.group);
        outer.scale.setScalar(pcCharacterScale(classId, { characterScene: false, skin: 0 }));
        outer.name = `player_${e.id}_${e.key}`;
        outer.userData.muEquipmentDiagnostics = {
            missing: [...(attach?.missing || [])],
            bodyMissing: [...(attach?.bodyMissing || [])],
        };

        // Wing/helper no bone-parented (mesma bitrate do herói/scene)
        const extras = [];
        for (const spec of [attach?.wing, attach?.helper]) {
            if (!spec) continue;
            try {
                const wr = await buildAccessoryRenderer({
                    scene: this.scene, camera: this.scene.camera?.threeCamera,
                }, spec);
                const bone = renderer.bones?.[wr.userData.bone];
                if (!bone) { wr.dispose(); console.warn(`[PlayerViewport] bone ${wr.userData.bone} ausente p/ ${e.id}`); continue; }
                bone.add(wr.group);
                extras.push(wr);
            } catch (err) {
                console.warn(`[PlayerViewport] acessório ${e.id} falhou (fail-closed): ${err.message}`);
            }
        }

        if (attach?.wing?.itemModelType != null) {
            try {
                await attachCapeCloth(renderer, {
                    itemModelType: attach.wing.itemModelType,
                    classId,
                    custom: Boolean(attach.wing.customWing && attach.wing.isCape),
                });
            } catch (err) { console.warn(`[PlayerViewport] cape cloth ${e.id} falhou: ${err?.message || err}`); }
        }

        const linkedWeapons = [];
        for (const spec of [attach?.weaponRightSpec, attach?.weaponLeftSpec]) {
            if (!spec) continue;
            try {
                const wr = await buildLinkedWeaponRenderer({ scene: this.scene.scene, camera: this.scene.camera?.threeCamera }, spec);
                const bone = renderer.bones?.[spec.linkBone];
                if (!wr || !bone) { wr?.dispose?.(); throw new Error(`bone ${spec.linkBone} inexistente`); }
                bone.add(wr.group); wr.userData.presentation = 'hand';
                linkedWeapons.push({ wr, spec }); extras.push(wr);
            } catch (err) { console.warn(`[PlayerViewport] arma ${e.id} falhou (fail-closed): ${err.message}`); }
        }

        // Posição e yaw do servidor
        const nx = (e.x + 0.5) * 100 - 12800;
        const nz = 12800 - (e.y + 0.5) * 100;
        outer.position.set(nx, 0, nz);
        if (this.scene.terrainHeightAt) {
            outer.position.y = this.scene.terrainHeightAt(nx, nz);
        }
        outer.rotation.y = muDirectionToThreeYaw(e.dir ?? ((e.path >> 4) & 7));

        // FIX52: F3:72 PetIndex is a physical custom helper on remote players,
        // not metadata. CharacterHelper.lua supplies the exact BMD + scale.
        let customHelperCompanion = null;
        if (attach?.customHelper?.petModelPath) {
            try {
                const helperOwner = { position: outer.position, rotation: outer.rotation, isAlive: () => !customHelperCompanion?.disposed, safeZone: () => Boolean(this.scene?.terrainWallAt?.(outer.position.x, outer.position.z) & 0x0001) };
                customHelperCompanion = new HelperCompanion(helperOwner, this.scene.scene, 1.0, attach.customHelper);
                await customHelperCompanion.init();
            } catch (err) {
                customHelperCompanion?.dispose?.(); customHelperCompanion = null;
                console.warn(`[PlayerViewport] custom helper ${e.id} falhou (fail-closed): ${err?.message || err}`);
            }
        }

        // FIX53: F3:72 Element[0]/Element[1] are physical companions in
        // ZzzCharacter.cpp, independent of PetIndex. Resolve only through the
        // real DarkSpirit.lua / CharacterHelper.lua registries.
        const elementCompanions = { first:null, second:null };
        const elementSpec = resolveCustomPreviewElements(e.customPreview || null);
        const elementOwner = { position: outer.position, rotation: outer.rotation, isAlive: () => true, safeZone: () => Boolean(this.scene?.terrainWallAt?.(outer.position.x, outer.position.z) & 0x0001) };
        try {
            if (elementSpec.first?.kind === 'dark-spirit') {
                elementCompanions.first = new Pet(elementOwner, this.scene.scene, elementSpec.first.petModelPath);
                await elementCompanions.first.init();
            } else if (elementSpec.first?.kind === 'helper') {
                elementCompanions.first = new HelperCompanion(elementOwner, this.scene.scene, 1.0, elementSpec.first);
                await elementCompanions.first.init();
            }
        } catch (err) {
            elementCompanions.first?.dispose?.(); elementCompanions.first = null;
            console.warn(`[PlayerViewport] F3:72 Element[0] ${e.id} falhou (fail-closed): ${err?.message || err}`);
        }
        try {
            if (elementSpec.second?.kind === 'helper') {
                elementCompanions.second = new HelperCompanion(elementOwner, this.scene.scene, 1.0, elementSpec.second);
                await elementCompanions.second.init();
            }
        } catch (err) {
            elementCompanions.second?.dispose?.(); elementCompanions.second = null;
            console.warn(`[PlayerViewport] F3:72 Element[1] ${e.id} falhou (fail-closed): ${err?.message || err}`);
        }

        // SetPlayerStop/Walk uses the same real equipment metadata as the hero.
        outer.userData.animationControl = buildAnimationControl(renderer, classId, attach, {
            safeZone: () => Boolean(this.scene?.terrainWallAt?.(outer.position.x, outer.position.z) & 0x0001),
            onSafeZoneChange: (safeZone) => {
                for (const { wr, spec } of linkedWeapons)
                    setLinkedWeaponSafeZonePresentation(renderer, wr, spec, safeZone);
            },
        });
        outer.userData.animationControl.play('idle');

        // One movement-context owner for action, SafeZone and presentation
        // speed. The remote model is never moved by render FPS authority: D4
        // publishes a target tile, then this presentation reaches it at the PC
        // 25 Hz movement rate with dt capped to one reference step.
        outer.userData.muMovementContext = {
            safeZone: () => Boolean(this.scene?.terrainWallAt?.(outer.position.x, outer.position.z) & 0x0001),
            equipment: attach,
            classId,
            worldActive: () => pcWorldActiveFromAssetWorld(this.scene?.mapIndex),
            inBloodCastle: () => pcInBloodCastle(pcWorldActiveFromAssetWorld(this.scene?.mapIndex)),
            inChaosCastle: () => pcInChaosCastle(pcWorldActiveFromAssetWorld(this.scene?.mapIndex)),
            inSwimWorld: () => pcInSwimLocomotionWorld(pcWorldActiveFromAssetWorld(this.scene?.mapIndex)),
        };
        const equipmentBytes = charset ? Array.from(charset.slice(1)) : Array(17).fill(0xFF);
        const entry = {
            renderer, outer, extras, t: 0, poseAccumulator: 0, id: e.id, key: e.key, classId,
            classByte, equipmentBytes, appearanceSignature: equipmentSignature(classByte, equipmentBytes),
            serverTileX: e.x, serverTileY: e.y, serverDir: e.dir ?? ((e.path >> 4) & 7),
            serverBuffSnapshot: Array.from(e.buffs || []),
            customPreview: e.customPreview || null,
            weaponRightSpec: attach?.weaponRightSpec || null, equipment: attach, customHelperCompanion, elementCompanions, additionalCompanions:[],
            moveTarget: null,
            motionChar: { classId, _muRunProgress: 0, mesh: outer },
            bodyLightColor: new THREE.Color(1, 1, 1),
            // Conservative 24-tile visibility margin: the scene's existing
            // camera frustum decides whether a remote skeleton can affect the
            // next frame. This Sphere references the live GS-interpolated
            // position; no per-frame box/Vector allocations.
            poseCullSphere: new THREE.Sphere(outer.position, 2400),
            deferredPoseSeconds: 0,
        };
        // Remote player recebe o mesmo namespace srv_<eBuffState> do herói.
        // O viewport traz somente os estados presentes; não inventamos duração/stats.
        entry.buffContainer = new BuffContainer(entry);
        entry.buffContainer.setServerBuffSnapshot(e.buffs || []);
        outer.userData.buffContainer = entry.buffContainer;
        const initialBodyLight = this.scene?.terrainLightAt?.(outer.position.x, outer.position.z, entry.bodyLightColor);
        if (initialBodyLight) {
            renderer.setBodyLight(initialBodyLight);
            for (const wr of extras) wr?.setBodyLight?.(initialBodyLight);
            entry.lastBodyLightRGB = { r:initialBodyLight.r,g:initialBodyLight.g,b:initialBodyLight.b };
        }
        outer.userData.update = (dt) => {
            // Movement still caps a single presentation step to the authored 40 ms,
            // but the BMD clock must retain wall-clock remainder. At <25 FPS the old
            // simDt-only accumulator permanently lost time and made animation slow.
            const frameDt = Math.min(Math.max(Number(dt) || 0, 0), 0.12);
            const simDt = Math.min(frameDt, 0.04);
            if (entry.moveTarget) {
                const dx = entry.moveTarget.x - outer.position.x;
                const dz = entry.moveTarget.z - outer.position.z;
                const distance = Math.hypot(dx, dz);
                const locomotion = Movement.resolvePcLocomotion(entry.motionChar, simDt);
                const budget = locomotion.speed * simDt;
                if (distance <= Math.max(0.001, budget)) {
                    outer.position.set(entry.moveTarget.x, entry.moveTarget.y, entry.moveTarget.z);
                    entry.moveTarget = null;
                    outer.userData.animationControl?.play?.('idle');
                } else {
                    const ux = dx / distance, uz = dz / distance;
                    outer.position.x += ux * budget;
                    outer.position.z += uz * budget;
                    outer.position.y = this.scene?.terrainHeightAt?.(outer.position.x, outer.position.z) ?? outer.position.y;
                    outer.userData.animationControl?.play?.(locomotion.running ? 'run' : 'walk');
                }
            } else {
                // A remote 0x19/0x1A player skill uses a real Player.bmd
                // one-shot (LoopOnce). Reasserting locomotion idle every render
                // frame used to replace that clip before the 25 Hz BMD clock
                // could finish it. The physical mixer owns completion; do not
                // invent a timer or block D4 movement (handled above).
                const active = renderer.currentAction;
                const bmdOneShotRunning = active?.loop === THREE.LoopOnce &&
                    active.enabled !== false && active._finished !== true;
                if (!bmdOneShotRunning) {
                    // Still evaluate SafeZone via the existing locomotion owner
                    // once the BMD clip completes or no one-shot is active.
                    outer.userData.animationControl?.play?.('idle');
                }
            }
            // BodyLight is position-dependent and must follow interpolation, not
            // only equipment rebuilds. PC samples it every Calc_RenderObject.
            const bodyLight = this.scene?.terrainLightAt?.(outer.position.x, outer.position.z, entry.bodyLightColor);
            if (bodyLight) {
                // Rendering a large server viewport must not rewrite every
                // material uniform on every 60Hz tick when the authoritative
                // terrain light RGB is byte-for-byte unchanged. Dynamic
                // lights still propagate immediately on the next frame.
                const previous=entry.lastBodyLightRGB;
                if (!previous || previous.r !== bodyLight.r || previous.g !== bodyLight.g || previous.b !== bodyLight.b) {
                    renderer.setBodyLight(bodyLight);
                    for (const wr of extras) wr?.setBodyLight?.(bodyLight);
                    if (previous) { previous.r=bodyLight.r;previous.g=bodyLight.g;previous.b=bodyLight.b; }
                    else entry.lastBodyLightRGB={r:bodyLight.r,g:bodyLight.g,b:bodyLight.b};
                }
            }

            // PC BMD authoring is 25 Hz. Keep network/world interpolation on
            // every rAF, but do skeletal pose + linked-item animation only on
            // authored 40 ms ticks. This removes redundant crowd skinning CPU
            // work without deleting actors/effects or changing movement speed.
            // R73: keep the fractional remainder instead of clamping the accumulator
            // to 40 ms and resetting it to zero. At 60 FPS the old code advanced
            // 40 ms every ~50 ms (20 Hz effective), which visibly "kicked" remote
            // characters and also made their BMD animation run ~20% slow. Preserve
            // the authored 25 Hz BMD tick while keeping wall-clock animation time.
            // FIX153: heavy Player.bmd material/skeleton updates were running
            // on hundreds of actors outside the WebGL camera. The exact same
            // frustum used by terrain placement culling is already current
            // when GameScene invokes its object callbacks. A generous 2400u
            // sphere ensures large authored wings/glows are not frozen near
            // the edge. Without a trustworthy frustum, fail open (animate).
            const viewFrustum=this.scene?.worldObjectLayer?._viewFrustum;
            const poseVisible=!viewFrustum || viewFrustum.intersectsSphere(entry.poseCullSphere);
            // FIX154: skipping bone updates is not enough when a BMD mesh has
            // overlarge skinned bounds: Three may still submit hidden remote
            // players to WebGL. The same generous 2400u frustum controls the
            // full REMOTE actor root, not any server/gameplay state.
            if (viewFrustum) outer.visible = poseVisible;
            entry.poseAccumulator += frameDt;
            let poseSteps = 0;
            while (entry.poseAccumulator >= 0.04 - 1e-6 && poseSteps < 3) {
                const poseDt = 0.04;
                entry.poseAccumulator = Math.max(0, entry.poseAccumulator - poseDt);
                entry.t += poseDt;
                if (poseVisible) {
                    // THREE AnimationMixer accepts accumulated delta, so
                    // re-entry resumes the authored phase without replaying
                    // hundreds of invisible 40ms GPU/material updates.
                    const advance=poseDt+entry.deferredPoseSeconds;
                    entry.deferredPoseSeconds=0;
                    renderer.update(advance, entry.t);
                    for (const wr of extras) wr.update(advance, entry.t);
                    this._poseBmdUpdated=(this._poseBmdUpdated||0)+1;
                } else {
                    entry.deferredPoseSeconds+=poseDt;
                    this._poseBmdSkipped=(this._poseBmdSkipped||0)+1;
                }
                // Companion simulation/position remains live and server-owned;
                // only offscreen rigid/skinned BMD presentation is skipped.
                customHelperCompanion?.update?.(poseDt);
                elementCompanions.first?.update?.(poseDt, []);
                elementCompanions.second?.update?.(poseDt);
                // FIX154: stock companions (dark raven/fenrir/riders/Dark Horse)
                // use the exact same MoveBug/Pet BMD renderer as the hero.
                for (const companion of entry.additionalCompanions || []) {
                    if (poseVisible) {
                        if (companion instanceof Pet) companion.update(poseDt, []); // GS owns damage
                        else companion.update(poseDt, null);
                        this._companionBmdUpdated=(this._companionBmdUpdated||0)+1;
                    } else {
                        // Physical mount remains tied to the server-interpolated
                        // owner while its off-camera skinning/mixer is paused.
                        // Do not compute 25Hz bone matrices for unseen riders.
                        if (companion instanceof MountCompanion && companion.root)
                            companion.root.position.copy(outer.position);
                        this._companionBmdSkipped=(this._companionBmdSkipped||0)+1;
                    }
                }
                poseSteps++;
            }
            // ITEMS/LUA FIX127: remote capes use the exact same live Main 5.2
            // WorldTime/GetDoubleRender frame as the hero. Only the published
            // viewport actor may dispatch, and only after an authored 40 ms
            // skeletal pose step; this avoids 60 Hz Lua rebuilds for crowds.
            // The cape BMD (not Player.bmd) owns its dynamic Lua GPU runner.
            const capeFrame=this.scene?._capeLiveFrame;
            if (poseSteps && !entry.disposed && this.byKey.get(entry.key)===entry &&
                Number.isFinite(capeFrame?.worldTime) && typeof capeFrame?.getDoubleRender==='function') {
                for (const wr of entry.extras || []) {
                    if (wr?._disposed || typeof wr?.updateDynamicCustomCape!=='function') continue;
                    try {
                        void wr.updateDynamicCustomCape(capeFrame).catch(e=>
                            console.warn(`[CustomCape] remote key=${entry.key} exact-owner update failed closed:`,e?.message||e));
                    } catch (e) {
                        console.warn(`[CustomCape] remote key=${entry.key} exact-owner dispatch failed closed:`,e?.message||e);
                    }
                }
            }
        };
        if (opts.publish !== false) {
            if (this._disposed || epoch !== this._viewportEpoch || keyVersion !== this._keyVersions.get(e.key)) {
                this._disposeEntry(entry);
                return null;
            }
            this.scene.addObject(outer); // entra na árvore de update do frame
            this.byKey.set(e.key, entry);
            this._queueStockCompanions(entry, attach);
            const pending = this._pendingAppearanceChanges.get(e.key);
            const desired = this._desiredAppearance.get(e.key);
            if (pending?.length || desired) {
                this._pendingAppearanceChanges.delete(e.key);
                queueMicrotask(() => {
                    if (this._disposed || epoch !== this._viewportEpoch || keyVersion !== this._keyVersions.get(e.key)) return;
                    (async () => {
                        if (desired && this._desiredAppearance.get(e.key) === desired) {
                            await this.applyEquipmentSnapshot(e.key, desired.classByte, desired.equipment, {source:'pending-full'});
                        }
                        for (const change of pending || []) {
                            if (epoch !== this._viewportEpoch || keyVersion !== this._keyVersions.get(e.key)) break;
                            await this.applyChangeCharacter(change);
                        }
                    })()
                        .catch((err) => console.warn(`[PlayerViewport] pending 0x25 key=${e.key} falhou: ${err?.message || err}`));
                });
            }
        }
        return entry;
    }

    dispose() {
        this._disposed = true;
        this.clear();
    }
}

export default PlayerViewportManager;
