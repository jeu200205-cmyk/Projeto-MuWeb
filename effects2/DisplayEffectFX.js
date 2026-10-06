// effects2/DisplayEffectFX.js — exact PC 0x48 viewport effect owners.
// Main 5.2 source contract used here:
//   type 0x11 -> CreateEffect(MODEL_SHIELD_CRASH, owner pos/angle/light, 0, owner)
// MODEL_SHIELD_CRASH constructor:
//   LifeTime=24 logical ticks, Scale=1.1, Light=(0.5,0.5,1.0), and subtype 0
//   immediately creates MODEL_SHIELD_CRASH2 at the same owner transform.
// MODEL_SHIELD_CRASH2 constructor: LifeTime=24, Scale=1.1, same Light.
// Models are Data/Effect/atshild.bmd + atshild2.bmd. No substitute assets.
import * as THREE from 'three';
import { MUAssets } from '../assets/MUAssetLoader.js';
import { MUModelRenderer } from '../assets/MUModelRenderer.js';
import { applyMuUpAxis } from '../graphics/BmdAdapter.js';

const PC_TICK = 1 / 25;
const SHIELD_LIFETIME_TICKS = 24;
const SHIELD_SCALE = 1.1;
const SHIELD_LIGHT = new THREE.Color(0.5, 0.5, 1.0);

async function createBmdOwner(path, scene, origin, yaw) {
    const bmd = await MUAssets.loadBMD(path);
    if (!bmd) return null;
    const renderer = new MUModelRenderer();
    await renderer.initFromBMD(bmd);
    applyMuUpAxis(renderer.group);
    renderer.group.scale.setScalar(SHIELD_SCALE);
    renderer.group.position.copy(origin);
    renderer.group.rotation.y = Number.isFinite(yaw) ? yaw : 0;
    renderer.setBodyLight?.(SHIELD_LIGHT);
    renderer.playAction?.('action_0');
    scene.add(renderer.group);
    return renderer;
}

/**
 * PC MODEL_SHIELD_CRASH + immediate MODEL_SHIELD_CRASH2 child.
 * The constructor snapshots the owner's position/angle; this owner intentionally
 * does not parent to / chase the actor after creation.
 */
export function playDisplayShieldCrash(actorRoot, scene) {
    if (!actorRoot || !scene) return null;
    const origin = actorRoot.position?.clone?.() || new THREE.Vector3();
    const yaw = Number(actorRoot.rotation?.y || 0);
    let elapsedTicks = 0;
    let disposed = false;
    let pending = 2;
    const renderers = [];

    const spawn = async (path) => {
        try {
            const r = await createBmdOwner(path, scene, origin, yaw);
            if (disposed) {
                if (r) { scene.remove(r.group); r.dispose?.(); }
                return;
            }
            if (r) renderers.push(r);
        } catch (e) {
            console.warn(`[DisplayEffect] ${path} indisponível (fail-closed): ${e?.message || e}`);
        } finally {
            pending--;
        }
    };
    spawn('Effect/atshild.bmd');
    spawn('Effect/atshild2.bmd');

    return {
        update(dt) {
            if (disposed) return false;
            const safeDt = Math.max(0, Number(dt) || 0);
            elapsedTicks += safeDt / PC_TICK;
            for (const r of renderers) r.update?.(safeDt);
            return elapsedTicks < SHIELD_LIFETIME_TICKS || pending > 0;
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const r of renderers) {
                scene.remove(r.group);
                r.dispose?.();
            }
            renderers.length = 0;
        },
    };
}
