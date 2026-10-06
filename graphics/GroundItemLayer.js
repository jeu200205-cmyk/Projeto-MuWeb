/**
 * GroundItemLayer.js — visual/interaction owner for server-driven 0x20/0x21/0x22 items.
 *
 * Authority split:
 *   - ServerGroundItems owns lifetime/key/tile/wire state.
 *   - This layer owns only the BMD presentation and pointer hit-test.
 *   - requestPickup(key) is the ONLY mutation-producing action; visual removal
 *     waits for 0x21 or successful 0x22 reconciliation in ServerGroundItems.
 *
 * PC evidence ported from ZzzObject.cpp::ItemObjectAttribute + ItemAngle via the
 * audited Main 5.2 Android portability. No cube/ring/sprite fallback is used.
 * CustomItemFloor remains injectable and has final authority when supplied.
 */
import * as THREE from 'three';
import { MUAssets } from '../assets/MUAssetLoader.js';
import { MUModelRenderer } from '../assets/MUModelRenderer.js';
import { itemModelPath } from '../ui2/ItemIconRenderer.js';
import { angleQuaternion } from './BmdParser.js';
import { TERRAIN_SCALE, MAP_SIZE } from '../world/TerrainWorld.js';
import { applyPcStockItemPresentation } from './ItemMaterialPresentation.js';
import { currentClientItemModelForType } from '../data/CurrentClientItemOwners.js';
import { createPcGroundItemEffectOwner } from './PcGroundItemEffects.js';

const MAX_ITEM_INDEX = 512;
const DEG = Math.PI / 180;

export function groundItemWorldPosition(tileX, tileY, height = 0) {
    return {
        x: (tileX + 0.5) * TERRAIN_SCALE - MAP_SIZE / 2,
        y: height,
        z: MAP_SIZE / 2 - (tileY + 0.5) * TERRAIN_SCALE,
    };
}

/** CreateItem CreateFlag drop-rise from the audited PC-derived port. */
export function groundItemCreateRise(createFlag, ageMs) {
    if (!createFlag) return 0;
    return Math.max(0, 180 - Math.max(0, ageMs) * 0.30);
}

/**
 * RenderItem3D/CreateItem has a small set of Level>>3 visual remaps. These paths
 * are present in the real client manifest and mirror the audited desktop branches.
 */
export function groundItemModelPath(itemType, rawLevel = 0) {
    if (!Number.isInteger(itemType) || itemType < 0 || itemType === 0x1FFF) return null;
    const group = Math.floor(itemType / MAX_ITEM_INDEX);
    const index = itemType % MAX_ITEM_INDEX;
    const level = (rawLevel >> 3) & 0x0F;

    if (group === 14 && index === 11) {
        if (level === 1) return 'Item/MagicBox02.bmd';
        if (level === 2 || level === 14 || level === 15) return 'Item/MagicBox03.bmd';
        if (level === 3 || level === 13) return 'Item/MagicBox05.bmd';
        if (level === 5) return 'Item/MagicBox06.bmd';
        if (level === 6) return 'Item/MagicBox07.bmd';
        if (level >= 8 && level <= 12) return 'Item/MagicBox08.bmd';
    }
    if (group === 13 && index === 14 && level === 1) return 'Item/DarkLordSleeve.bmd';
    if (group === 14 && index === 9 && level === 1) return 'Item/Beer02.bmd';
    if (group === 14 && index === 21 && (level === 1 || level === 2)) return 'Item/EventBloodCastle03.bmd';
    if (group === 14 && index === 32 && level === 1) return 'Item/p03box.bmd';
    if (group === 14 && index === 33 && level === 1) return 'Item/obox02.bmd';
    if (group === 14 && index === 34 && level === 1) return 'Item/blue01.bmd';
    if (group === 14 && index === 23 && level === 1) return 'Item/QuestItem3rd00.bmd';
    if (group === 14 && index === 24 && level === 1) return 'Item/QuestItem3rd01.bmd';
    if (group === 13 && index === 20) {
        if (level === 0) return 'Item/MagicRing00.bmd';
        if (level >= 1 && level <= 3) return 'Item/RingOfLordEvent00.bmd';
    }
    if (group === 13 && index === 11 && level === 1) return 'Item/LifestoneItem.bmd';
    if (group === 13 && index === 19) {
        if (level === 0) return 'Item/Staff11.bmd';
        if (level === 1) return 'Item/Sword20.bmd';
        if (level === 2) return 'Item/Bow19.bmd';
    }
    return itemModelPath(itemType);
}

/**
 * Exact ordering of the stock ItemObjectAttribute/ItemAngle transform subset
 * audited from the desktop source. Angles are degrees in MU Z-up space.
 * customRule: { ax, ay, az, size } mirrors CustomItemFloor final override.
 */
export function pcGroundItemTransform(itemType, rawLevel = 0, customRule = null) {
    if (customRule) {
        return {
            angle: [Number(customRule.ax) || 0, Number(customRule.ay) || 0, Number(customRule.az) || 0],
            scale: Number(customRule.size) || 0.8,
            custom: true,
        };
    }

    const group = Math.floor(itemType / MAX_ITEM_INDEX);
    const index = itemType % MAX_ITEM_INDEX;
    const visualLevel = (rawLevel >> 3) & 0x0F;
    let angle = [0, 0, -45];
    let scale = 0.8;

    if (group === 3 || group === 4 || (group === 5 && index <= 13)) scale = 0.7;
    if (group === 15 && index === 0) scale = 0.7;
    if (group === 14 && index === 1) scale = 1.0;
    if (group === 14 && index === 21) scale = 0.5;
    if (group === 12 && index === 3) scale = 0.5;

    const ret = () => ({ angle, scale, custom: false });

    if (group === 14 && index === 11) {
        if ([1, 2, 14, 15].includes(visualLevel)) { angle[0] = 90; return ret(); }
        if ([3, 13].includes(visualLevel)) return ret();
        if ([5, 6].includes(visualLevel)) { angle[0] = 270; angle[2] = 45; return ret(); }
        if (visualLevel >= 8 && visualLevel <= 12) { scale = 0.2; return ret(); }
    }
    if (group === 14 && index >= 32 && index <= 34 && visualLevel === 1) {
        scale = 0.7; angle[0] = 0; angle[2] = 90; return ret();
    }
    if (group === 14 && index === 21 && (visualLevel === 1 || visualLevel === 2)) {
        angle = [115, 75, 8]; scale = 0.4; return ret();
    }
    if (group === 14 && index === 23 && visualLevel === 1) {
        angle = [160, -183, 198]; scale = 0.38; return ret();
    }
    if (group === 14 && index === 24 && visualLevel === 1) {
        angle = [160, -183, 198]; scale = 0.54; return ret();
    }
    if (group === 13 && index === 19) {
        if (visualLevel === 0) { scale = 0.7; angle[0] = 0; angle[1] = 270; return ret(); }
        if (visualLevel === 1) { scale = 0.7; angle[0] = 60; return ret(); }
        if (visualLevel === 2) { scale = 0.7; angle[0] = 90; angle[1] = 0; return ret(); }
    }
    if (group === 13 && index === 20) { angle[0] = 0; return ret(); }
    if (group === 14 && index === 9 && visualLevel === 1) { angle[2] = 45; return ret(); }
    if (group === 13 && index === 14 && visualLevel === 1) { scale = 0.5; angle[2] = 45; return ret(); }
    if (group === 13 && index === 11 && visualLevel === 1) { angle[0] = 0; return ret(); }

    if (group === 0 || group === 1) {
        angle[0] = 60;
        if (group === 0 && index === 19) scale = 0.7;
    } else if (group === 4 && (index === 20 || index === 21 || index === 22)) {
        angle[0] = 0; angle[1] = 0;
    } else if (group === 4 && ((index >= 8 && index < 17) || (index >= 18 && index < 20))) {
        angle[0] = 90; angle[1] = 0;
    } else if (group >= 2 && group <= 5) {
        angle[0] = 0; angle[1] = 270;
    } else if (group === 6) {
        angle[1] = 270; angle[2] = 225;
    } else if (group === 7 && index >= 39 && index <= 44) {
        scale = 1.5; angle[2] = 45;
    } else if (group >= 8 && group <= 10) {
        angle[0] = 270;
    } else if (group === 12 && index >= 32 && index <= 34) {
        scale = 0.3; angle[0] = 0; angle[2] = 90;
    } else if (group === 12 && ((index >= 60 && index <= 65) || (index >= 70 && index <= 74) || (index >= 100 && index <= 129))) {
        angle[0] = 0; scale = 0.6;
    } else if (group === 12 && index === 49) {
        angle = [270, 180, 45]; scale = 0.7;
    } else if (group === 12 && index === 50) {
        angle = [250, 180, 45];
    } else if (group === 14 && index === 45) {
        scale = 0.9; angle[0] = 0; angle[2] = 90;
    } else if (group === 14 && index >= 46 && index <= 48) {
        scale = 0.7; angle[0] = 90;
    } else if (group === 14 && index === 49) {
        scale = 0.9; angle[0] = 0; angle[2] = 90;
    } else if (group === 14 && index === 50) {
        scale = 0.26; angle[0] = 0; angle[2] = 90;
    } else if (group === 14 && index >= 32 && index <= 34) {
        scale = 0.7; angle[0] = 0; angle[2] = 90;
    } else if (group === 13 && index >= 46 && index <= 48) {
        scale = 0.5; angle[0] = 90;
    } else if (group === 14 && index === 54) {
        scale = 0.5; angle[0] = 90;
    } else if (group === 14 && index === 58) {
        scale = 0.3; angle[2] = 90;
    } else if (group === 14 && (index === 59 || index === 60)) {
        scale = 0.3; angle[0] = 90; angle[1] = 90;
    } else if (group === 14 && (index === 61 || index === 62)) {
        scale = 0.3; angle[0] = 90;
    } else if (group === 14 && index === 53) {
        scale = 0.2; angle[2] = 90;
    } else if (group === 13 && index >= 43 && index <= 45) {
        scale = 0.5; angle[0] = 90;
    } else if (group === 14 && index >= 70 && index <= 71) {
        scale = 0.6; angle[2] = 90;
    } else if (group === 14 && index >= 72 && index <= 77) {
        scale = 0.5; angle[2] = 90;
    } else if (group === 13 && index === 59) {
        scale = 0.2; angle[2] = 90;
    } else if (group === 13 && index >= 54 && index <= 58) {
        scale = 0.7; angle[2] = 90;
    } else if (group === 14 && index >= 78 && index <= 82) {
        scale = 0.5; angle[2] = 90;
    } else if (group === 13 && index === 60) {
        scale = 1.5; angle[2] = 90;
    } else if (group === 13 && index === 61) {
        scale = 0.5; angle[0] = 90;
    } else if (group === 14 && index === 83) {
        scale = 0.3; angle[0] = 90;
    } else if (group === 14 && index >= 145 && index <= 150) {
        scale = 0.3; angle[0] = 90;
    } else if (group === 13 && index >= 125 && index <= 127) {
        scale = 0.5; angle[0] = 90;
    } else if (group === 14 && [91, 92, 93, 95].includes(index)) {
        scale = 0.5; angle[0] = 90;
    } else if (group === 14 && index === 94) {
        scale = 0.6; angle[2] = 90;
    } else if (group === 14 && index === 84) {
        scale = 0.8; angle[2] = 90;
    } else if (group === 14 && index === 85) {
        scale = 0.9; angle[2] = 90;
    } else if (group === 14 && index === 86) {
        scale = 0.7; angle[2] = 90;
    } else if (group === 14 && index === 87) {
        scale = 1.3; angle[2] = 90;
    } else if (group === 14 && index === 88) {
        scale = 0.7; angle[0] = 180; angle[1] = 180;
    } else if (group === 14 && (index === 89 || index === 90)) {
        scale = 0.7; angle[0] = 30; angle[2] = 90;
    } else if (group === 13 && index >= 62 && index <= 63) {
        scale = 0.5; angle[0] = 90;
    } else if (group === 14 && index >= 97 && index <= 98) {
        scale = 0.5; angle[2] = 90;
    } else if (group === 14 && index === 140) {
        scale = 0.5; angle[2] = 90;
    } else if (group === 14 && index === 96) {
        scale = 0.2; angle[2] = 90;
    } else if (group === 13 && (index === 64 || index === 65)) {
        scale = index === 64 ? 0.21 : 0.5; angle[2] = 70;
    } else if (group === 13 && index === 49) {
        angle[0] = 90; angle[1] = 0; scale = 0.3;
    } else if (group === 13 && index === 50) {
        angle[0] = 0; scale = 0.6;
    } else if (group === 13 && index === 51) {
        angle[0] = 90; scale = 0.45;
    } else if (group === 14 && index === 64) {
        angle[0] = 0; scale = 0.8;
    } else if (group === 13 && (index === 52 || index === 53)) {
        angle[0] = 0; scale = 1.2;
    } else if (group === 14 && index === 65) {
        angle[0] = 90; scale = 0.6;
    } else if (group === 14 && index === 66) {
        angle[0] = 90; scale = 0.8;
    } else if (group === 14 && index === 67) {
        angle[0] = 270; scale = 0.8;
    } else if (group === 14 && index === 68) {
        angle[2] = -135; scale = 0.6;
    } else if (group === 14 && index === 23) {
        angle[1] = 45; angle[2] = 45;
    } else if (group === 14 && index === 24) {
        angle[2] = 45;
    } else if ((group === 14 && index >= 25 && index < 27) || (group === 13 && index === 14)) {
        angle[2] = 45;
    } else if (group === 14 && index === 17) {
        angle[0] = 90;
    } else if (group === 14 && index === 63) {
        angle[0] = 70; scale = 1.5;
    } else if (group === 14 && index === 99) {
        angle[0] = 70; angle[2] = 0; scale = 1.0;
    } else if (group === 14 && index === 52) {
        angle[2] = -10; scale = 0.4;
    } else if (group === 14 && index === 18) {
        angle[0] = 270; angle[2] = 270;
    } else if (group === 14 && index === 19) {
        angle[0] = 270; angle[2] = 90;
    } else if (group === 14 && index === 29) {
        angle[0] = 90; angle[2] = 70;
    } else if (group === 13 && (index === 16 || index === 17)) {
        angle = [-45, -5, 18]; scale = 0.48;
    } else if (group === 13 && index === 18) {
        angle = [165, -168, 198]; scale = 0.48;
    } else if (group === 13 && index === 30) {
        angle = [-45, 0, 45]; scale = 0.5;
    } else if (group === 14 && index === 21) {
        angle[0] = 270; angle[2] = 90;
    } else if (group === 14 && index === 20) {
        angle[2] = 45;
    } else if (group === 13 && index >= 21 && index <= 24) {
        angle[2] = 20;
    } else if (group === 13 && index === 33) {
        angle[2] = 45; scale = 1.2;
    } else if (group === 13 && index === 34) {
        angle[0] = 90;
    } else if (group === 13 && index === 35) {
        angle[2] = 90;
    } else if (group === 13 && index === 36) {
        angle[2] = 90; scale = 1.3;
    } else if (group === 13 && index === 37) {
        angle[2] = 180;
    } else if (group === 14 && index === 16) {
        angle[0] = 270; angle[2] = 45;
    } else if (group === 14 && index === 42) {
        angle[0] = 270; angle[2] = -15; scale = 1.3;
    } else if (group === 14 && (index === 43 || index === 44)) {
        angle[0] = 270; angle[2] = -15; scale = 1.0;
    } else if (group === 15 && index >= 19 && index <= 27) {
        angle[0] = 270; scale = 0.8;
    } else if (group === 13 && index === 66) {
        angle[0] = 270; scale = 1.0;
    } else if (group === 14 && index === 100) {
        angle[0] = 180; scale = 1.0;
    } else if (group === 13 && (index === 97 || index === 98 || index === 99 || index === 103 || index === 104 || index === 105 || index === 107 || (index >= 109 && index <= 115))) {
        angle[0] = index === 103 ? 0 : 270; scale = 1.0;
    } else if (group === 14 && (index === 110 || index === 111 || index === 112 || index === 113 || index === 133)) {
        angle[0] = 270; scale = 1.0;
    } else if (group === 13 && (index === 116 || index === 121)) {
        scale = 0.5; angle[0] = 90;
    } else if (group === 13 && index === 123) {
        scale = 0.4; angle[0] = 30;
    } else if (group === 7 && index >= 59 && index <= 61) {
        scale = 1.0; angle[2] = 45;
    } else if (group === 15 && index >= 30 && index <= 36) {
        angle[0] = 270; scale = 0.8;
    } else if (group === 12) {
        angle[0] = 270; angle[2] = 45;
    } else if (group === 13 && index >= 135 && index <= 145) {
        scale = 0.2; angle[0] = 90;
    } else if (group === 14 && (index === 160 || index === 161)) {
        scale = 0.2; angle[0] = 90;
    } else {
        angle[0] = 0;
    }
    return ret();
}

export function pcGroundMaterialPolicy(itemType, timeMs = 0) {
    const group = Math.floor(itemType / MAX_ITEM_INDEX);
    const index = itemType % MAX_ITEM_INDEX;
    let hiddenMesh = -1;
    let blendMesh = -1;
    let blendLight = 1;
    const wave = (amp, base) => Math.sin(timeMs * 0.004) * amp + base;

    if (group === 4 && index === 16) { blendMesh = -2; blendLight = wave(0.2, 0.9); }
    else if (group === 5 && index === 8) { blendMesh = -2; blendLight = wave(0.2, 0.9); }
    else if (group === 5 && index === 7) { blendMesh = 1; blendLight = ((Math.floor(timeMs / 17) % 11) * 0.1); }
    else if (group === 5 && index === 6) { blendMesh = -2; blendLight = wave(0.3, 0.7); }
    else if (group === 4 && [6, 13, 14].includes(index)) { blendMesh = -2; blendLight = wave(0.3, 0.7); }
    else if (group === 5 && index === 11) { blendMesh = 2; blendLight = wave(0.3, 0.7); }
    else if (group === 2 && index === 4) { blendMesh = 1; blendLight = wave(0.2, 0.8); }
    else if (group === 2 && index === 5) blendMesh = 0;
    else if (group === 2 && index === 6) { blendMesh = 1; blendLight = wave(0.3, 0.7); }
    else if (group === 6 && index === 16) hiddenMesh = 2;
    else if (group === 2 && index === 7) hiddenMesh = 2;
    else if (group === 0 && index === 31) hiddenMesh = 2;
    else if (group === 3 && index === 10) hiddenMesh = 1;
    else if (group === 5 && index === 9) blendMesh = 1;
    else if (group === 5 && index === 5) blendMesh = 2;
    else if (group === 0 && index === 14) { blendMesh = 1; blendLight = wave(0.3, 0.7); }
    else if ((group === 0 && index === 10) || (group === 3 && index === 0)) { blendMesh = 1; blendLight = wave(0.3, 0.7); }
    else if (group === 0 && [5, 13].includes(index)) blendMesh = 1;
    else if (group === 5 && index === 0) blendMesh = 2;
    else if (group === 13 && index === 0) blendMesh = 1;
    else if (group === 12 && index === 3) blendMesh = 0;
    else if (group === 12 && [0, 8, 9, 10, 11, 20, 132].includes(index)) blendMesh = 0;
    else if (group === 6 && [11, 12, 13].includes(index)) { blendMesh = 1; blendLight = wave(0.3, 0.7); }
    return { hiddenMesh, blendMesh, blendLight };
}

function applyMuQuaternion(object3D, angleDeg) {
    const q = angleQuaternion(angleDeg.map(v => v * DEG));
    object3D.quaternion.set(q[0], q[1], q[2], q[3]);
}

export class GroundItemLayer {
    constructor({
        gameScene,
        state,
        requestPickup,
        loadBMD = (path) => MUAssets.loadBMD(path),
        rendererFactory = () => new MUModelRenderer({ scene: gameScene?.scene, camera: gameScene?.camera?.threeCamera }),
        modelPathResolver = groundItemModelPath,
        customFloorRules = null,
    } = {}) {
        if (!gameScene?.scene || !state) throw new Error('GroundItemLayer requer GameScene + ServerGroundItems');
        this.gameScene = gameScene;
        this.state = state;
        this.requestPickup = requestPickup || (() => false);
        this.loadBMD = loadBMD;
        this.rendererFactory = rendererFactory;
        this.modelPathResolver = modelPathResolver;
        this.customFloorRules = customFloorRules;
        this.root = new THREE.Group();
        this.root.name = 'serverGroundItems';
        this.gameScene.scene.add(this.root);
        this.visuals = new Map(); // key -> { serial, renderer, outer, axis, orient, itemType, path }
        this.loading = new Map(); // key -> { serial, promise }
        this._warned = new Set();
        this._raycaster = new THREE.Raycaster();
        this._pointer = new THREE.Vector2();
        this.disposed = false;
    }

    _customRule(itemType) {
        if (!this.customFloorRules) return null;
        if (typeof this.customFloorRules.get === 'function') return this.customFloorRules.get(itemType) || null;
        return this.customFloorRules[itemType] || null;
    }

    async _ensureVisual(item) {
        if (this.disposed || !item) return null;
        const current = this.visuals.get(item.key);
        if (current?.serial === item.runtimeSerial) return current;
        const inFlight = this.loading.get(item.key);
        if (inFlight?.serial === item.runtimeSerial) return inFlight.promise;
        if (current) this._removeVisual(item.key);

        const rawLevel = item.item?.[1] || 0;
        const path = this.modelPathResolver(item.itemType, rawLevel);
        if (!path) {
            const warnKey = `model:${item.itemType}:${rawLevel}`;
            if (!this._warned.has(warnKey)) {
                this._warned.add(warnKey);
                console.warn(`[GroundItem] sem BMD PC para Type=${item.itemType} rawLevel=${rawLevel} — fail-closed`);
            }
            return null;
        }

        const serial = item.runtimeSerial;
        const promise = (async () => {
            let renderer = null, effectOwner = null;
            try {
                const bmd = await this.loadBMD(path);
                if (!bmd || !Array.isArray(bmd.meshes) || !bmd.meshes.length) throw new Error('BMD sem meshes');
                renderer = this.rendererFactory();
                await renderer.initFromBMD(bmd);
                // ItemObjectAttribute: ground items begin with Light=(.3,.3,.3)
                // and LightEnable=true, then run the same item material owner.
                renderer.setBodyLight?.(new THREE.Color(0.3, 0.3, 0.3));
                renderer.setLightEnabled?.(true);
                const currentOwner = currentClientItemModelForType(item.itemType);
                await applyPcStockItemPresentation(renderer, {
                    type: item.itemType,
                    rawLevel,
                    option1: item.item?.[3] || 0,
                    extOption: item.item?.[4] || 0,
                    customColor: currentOwner?.color || null,
                    effectType: currentOwner?.effectType || 0,
                });

                // Async fence: an 0x21/0x22 or replacement using the same key may
                // have happened while BMD/textures were loading.
                const live = this.state.get(item.key);
                if (this.disposed || !live || live.runtimeSerial !== serial) {
                    effectOwner?.dispose?.();
                    renderer.dispose?.();
                    return null;
                }

                const outer = new THREE.Group();
                outer.name = `groundItem_${item.key}`;
                outer.userData.groundItemKey = item.key;
                outer.userData.groundItemSerial = serial;
                const axis = new THREE.Group();
                axis.rotation.x = -Math.PI / 2; // MU Z-up -> Three Y-up
                const orient = new THREE.Group();
                const tf = pcGroundItemTransform(item.itemType, rawLevel, this._customRule(item.itemType));
                applyMuQuaternion(orient, tf.angle);
                orient.scale.setScalar(tf.scale);
                orient.add(renderer.group);
                axis.add(orient);
                outer.add(axis);
                // EffectManager.cpp::LoadEffect belongs to settled world drops.
                // Keep the effect group outside the BMD orientation axis: CreateShiny/
                // CreateThunderBolt rotate their spawn offset explicitly by OBJECT::Angle.
                effectOwner = await createPcGroundItemEffectOwner(item.itemType, tf.angle).catch((e) => {
                    const warnKey=`itemfx:${item.itemType}`;
                    if(!this._warned.has(warnKey)){this._warned.add(warnKey);console.warn(`[GroundItem] ItemEffects owner indisponível Type=${item.itemType}: ${e?.message||e}`);}
                    return null;
                });
                if(effectOwner?.group) outer.add(effectOwner.group);

                const policy = pcGroundMaterialPolicy(item.itemType, (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now());
                renderer.meshes?.forEach((mesh, meshIndex) => {
                    mesh.userData.groundItemKey = item.key;
                    mesh.userData.groundItemSerial = serial;
                    if (policy.hiddenMesh === meshIndex) mesh.visible = false;
                });
                renderer.playAction?.('action_0');
                this.root.add(outer);

                const visual = { serial, renderer, outer, axis, orient, effectOwner, itemType: item.itemType, rawLevel, path };
                this.visuals.set(item.key, visual);
                this._place(item, visual, Date.now());
                return visual;
            } catch (e) {
                try { effectOwner?.dispose?.(); } catch { /* noop */ }
                try { renderer?.dispose?.(); } catch { /* noop */ }
                const warnKey = `load:${path}`;
                if (!this._warned.has(warnKey)) {
                    this._warned.add(warnKey);
                    console.warn(`[GroundItem] ${path} indisponível — sem placeholder: ${e.message || e}`);
                }
                return null;
            } finally {
                const cur = this.loading.get(item.key);
                if (cur?.serial === serial) this.loading.delete(item.key);
            }
        })();
        this.loading.set(item.key, { serial, promise });
        return promise;
    }

    _place(item, visual, nowMs) {
        const p0 = groundItemWorldPosition(item.x, item.y, 0);
        const groundY = this.gameScene?.heights ? this.gameScene.terrainHeightAt(p0.x, p0.z) : this.gameScene.terrainHeightAt?.(p0.x, p0.z) || 0;
        const age = nowMs - (item.createdAt || nowMs);
        const rise = groundItemCreateRise(item.createFlag, age);
        visual.outer.position.set(p0.x, groundY + rise, p0.z);
        return rise;
    }

    async sync() {
        if (this.disposed) return [];
        const active = new Set();
        const pending = [];
        for (const item of this.state.items) {
            if (!item) continue;
            active.add(item.key);
            const visual = this.visuals.get(item.key);
            if (visual && visual.serial !== item.runtimeSerial) this._removeVisual(item.key);
            pending.push(this._ensureVisual(item));
        }
        for (const key of Array.from(this.visuals.keys())) {
            if (!active.has(key)) this._removeVisual(key);
        }
        return Promise.all(pending);
    }

    update(dt, elapsed) {
        if (this.disposed) return;
        const now = Date.now();
        for (const [key, visual] of Array.from(this.visuals.entries())) {
            const item = this.state.get(key);
            if (!item || item.runtimeSerial !== visual.serial) {
                this._removeVisual(key);
                continue;
            }
            const rise = this._place(item, visual, now);
            visual.renderer.update?.(dt, elapsed);
            visual.effectOwner?.update?.(dt, rise <= 0);
        }
    }

    _removeVisual(key) {
        const visual = this.visuals.get(key);
        if (!visual) return false;
        this.visuals.delete(key);
        try { this.root.remove(visual.outer); } catch { /* noop */ }
        try { visual.effectOwner?.dispose?.(); } catch { /* noop */ }
        try { visual.renderer.dispose?.(); } catch { /* noop */ }
        return true;
    }

    clear() {
        for (const key of Array.from(this.visuals.keys())) this._removeVisual(key);
        // In-flight loads are fenced by runtimeSerial/state and disposed on completion.
    }

    /**
     * Real BMD mesh raycast. This is a Web interaction owner, not a claim of
     * exact desktop screen-picking parity. A 3.5-tile reach guard prevents
     * remote pickup while the exact PC cursor owner remains a physical gate.
     */
    pickFromPointer(clientX, clientY, heroPosition = null, maxDistance = 3.5 * TERRAIN_SCALE) {
        const camera = this.gameScene?.camera?.threeCamera;
        const canvas = this.gameScene?.renderer?.domElement;
        if (!camera || !canvas || !this.visuals.size) return null;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        this._pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this._pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        this._raycaster.setFromCamera(this._pointer, camera);
        const hits = this._raycaster.intersectObject(this.root, true);
        for (const hit of hits) {
            let obj = hit.object;
            let key = null;
            while (obj && obj !== this.root) {
                if (Number.isInteger(obj.userData?.groundItemKey)) { key = obj.userData.groundItemKey; break; }
                obj = obj.parent;
            }
            if (!Number.isInteger(key)) continue;
            const item = this.state.get(key);
            const visual = this.visuals.get(key);
            if (!item || !visual || visual.serial !== item.runtimeSerial) continue;
            if (heroPosition) {
                const dx = visual.outer.position.x - heroPosition.x;
                const dz = visual.outer.position.z - heroPosition.z;
                if (dx * dx + dz * dz > maxDistance * maxDistance) continue;
            }
            return key;
        }
        return null;
    }

    pickupNear(heroPosition, range) {
        if (!heroPosition || !Number.isFinite(range) || range <= 0) return false;
        let best = null;
        let bestD2 = range * range;
        for (const [key, visual] of this.visuals) {
            const item = this.state.get(key);
            if (!item || item.runtimeSerial !== visual.serial) continue;
            const dx = visual.outer.position.x - heroPosition.x;
            const dz = visual.outer.position.z - heroPosition.z;
            const d2 = dx * dx + dz * dz;
            if (d2 <= bestD2) { bestD2 = d2; best = key; }
        }
        if (!Number.isInteger(best)) return false;
        return this.requestPickup(best);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.clear();
        this.root.parent?.remove(this.root);
    }
}

export default GroundItemLayer;
