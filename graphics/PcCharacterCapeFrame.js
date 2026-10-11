/**
 * ITEMS/LUA FIX128 — live CharacterScene cape frame and its preview owner.
 * Uses the same GameTimer.elapsed sample and Main 5.2 LuaObject.cpp
 * GetDoubleRender expression already consumed by GameApp's world runner.
 * No independent timer, fake particle/effect, or speculative Lua argument.
 */
export function createPcCharacterCapeFrame(elapsed) {
    if (typeof elapsed!=='number' || !Number.isFinite(elapsed))
        throw Error('CharacterScene cape requires finite GameTimer.elapsed (numeric)');
    const worldTime=Math.fround(elapsed*1000.0);
    if (!Number.isFinite(worldTime)) throw Error('CharacterScene cape requires finite GameTimer.elapsed (numeric)');
    const getDoubleRender=(a1,a2)=>{
        const A1=Math.fround(Number(a1)), A2=Math.fround(Number(a2));
        if (!Number.isFinite(A1) || !Number.isFinite(A2) || A1===0) {
            throw Error('GetDoubleRender requires finite non-zero a1 and finite a2');
        }
        const phaseBase=Math.fround(Math.fround(Math.fround(A2*Math.fround(0.01745))*Math.fround(1000.0))/A1);
        const phaseInt=(Math.trunc(Math.fround(phaseBase+worldTime))|0);
        const periodInt=(Math.trunc(Math.fround(Math.fround(6283.185546875)/A1))|0);
        if (periodInt===0) throw Error('GetDoubleRender period collapsed to zero');
        const init=Math.fround(Math.fround(phaseInt%periodInt)*Math.fround(0.001)*A1);
        const wave=init>=Math.fround(3.14) ? Math.cos(init) : -Math.cos(init);
        return Math.fround(Math.fround(wave+Math.fround(1.0))*Math.fround(0.5));
    };
    return Object.freeze({worldTime,getDoubleRender});
}

/**
 * Live LuaBMD light/OBJECT::Alpha handoff from the accessory BMD itself.
 * The static RenderCharacter analysis defaults are not authoritative for a
 * frame where terrain lighting changed. Keep missing physical inputs closed.
 */
export function resolvePcCapeBmdLiveInputs(renderer, {objectState=null,bodyLight=null}={}) {
    const rgb=bodyLight ?? (renderer?.bodyLight &&
        [renderer.bodyLight.r,renderer.bodyLight.g,renderer.bodyLight.b]);
    if (!Array.isArray(rgb) || rgb.length<3 ||
        !rgb.slice(0,3).every(v=>typeof v==='number'&&Number.isFinite(v))) {
        throw Error('Dynamic CustomCape requires finite accessory BMD BodyLight owner');
    }
    const alpha=renderer?.alpha;
    if (objectState==null && !(typeof alpha==='number'&&Number.isFinite(alpha))) {
        throw Error('Dynamic CustomCape requires finite accessory OBJECT Alpha owner');
    }
    if (objectState!=null && !(typeof objectState.alpha==='number' && Number.isFinite(objectState.alpha))) {
        throw Error('Dynamic CustomCape requires finite accessory OBJECT Alpha owner');
    }
    return Object.freeze({
        bodyLight:Object.freeze(rgb.slice(0,3)),
        objectState:objectState ?? Object.freeze({alpha}),
    });
}

/**
 * Main-world hero accessories: each committed BMD renderer is an independent
 * RenderCapeModel owner. Sample only after GameScene.update() has advanced its
 * bones/BodyLight. Per-renderer cadence state makes an equipment replacement
 * immediately eligible without forcing other accessories to rebuild.
 *
 * This is an exact-owner dispatch only; no particle/effect/joint approximation.
 */
export function updatePcWorldHeroCapes(scene, frame) {
    if (scene?.cameraMode!=='game' || scene?._capeLiveFrame!==frame ||
        !Number.isFinite(frame?.worldTime) || typeof frame?.getDoubleRender!=='function') return 0;
    let dispatched=0;
    for (const wr of scene._playerExtras || []) {
        if (!wr || wr._disposed || typeof wr.updateDynamicCustomCape!=='function') continue;
        const last=wr._muCapeHeroLastWorldTime;
        let accumulator=Number.isFinite(wr._muCapeHeroAccumulatorMs)?wr._muCapeHeroAccumulatorMs:0;
        if (Number.isFinite(last) && frame.worldTime>=last) {
            accumulator+=frame.worldTime-last;
            wr._muCapeHeroLastWorldTime=frame.worldTime;
            if (accumulator < 40-1e-3) {
                wr._muCapeHeroAccumulatorMs=accumulator;
                continue;
            }
            accumulator%=40;
        } else {
            // New renderer or timer epoch: sample the actual current frame.
            accumulator=0;
            wr._muCapeHeroLastWorldTime=frame.worldTime;
        }
        wr._muCapeHeroAccumulatorMs=accumulator;
        try {
            const pending=wr.updateDynamicCustomCape(frame);
            if (pending && typeof pending.catch==='function') {
                void pending.catch(e=>console.warn(
                    '[CustomCape] hero exact-owner update failed closed:',e?.message||e));
            }
            dispatched++;
        } catch (e) {
            console.warn('[CustomCape] hero exact-owner dispatch failed closed:',e?.message||e);
        }
    }
    return dispatched;
}

/**
 * Consume the *published* CharacterPreview BMD wing/cape owners after
 * Scene.update has advanced the current animated skeleton. Sample Lua on the
 * 40 ms visual cadence (25 Hz), preserving the remainder at 60/90/120 FPS.
 * The persistent renderer itself serializes GPU rebuilds and reuses signatures.
 */
export function updatePcCharacterPreviewCapes(preview, frame) {
    if (preview?._disposed || preview?.gameScene?.cameraMode!=='char' ||
        !Number.isFinite(frame?.worldTime) || typeof frame?.getDoubleRender!=='function') return 0;
    const scene=preview.gameScene.scene;
    let dispatched=0;
    for (const slot of preview.slots || []) {
        // Only committed, current CharacterPreview slots may draw. setChars()
        // can have stale async candidates still resolving in the background.
        if (slot?.outer?.parent!==scene || slot.outer?.userData?.update!==slot.update) continue;
        const capes=(slot.extras || []).filter(wr=>
            wr && !wr._disposed && typeof wr.updateDynamicCustomCape==='function');
        if (!capes.length) continue;
        const last=slot._capeLastFrameWorldTime;
        let accumulator=Number.isFinite(slot._capeFrameAccumulatorMs)?slot._capeFrameAccumulatorMs:0;
        if (Number.isFinite(last) && frame.worldTime>=last) {
            accumulator+=frame.worldTime-last;
            slot._capeLastFrameWorldTime=frame.worldTime;
            if (accumulator < 40-1e-3) {
                slot._capeFrameAccumulatorMs=accumulator;
                continue;
            }
            // One current authored Lua phase, never N catch-up GPU rebuilds.
            accumulator%=40;
        } else {
            // First sample or a genuine timer epoch reset.
            accumulator=0;
            slot._capeLastFrameWorldTime=frame.worldTime;
        }
        slot._capeFrameAccumulatorMs=accumulator;
        for (const wr of capes) {
            try {
                const pending=wr.updateDynamicCustomCape(frame);
                if (pending && typeof pending.catch==='function') {
                    void pending.catch(e=>console.warn(
                        `[CustomCape] preview slot=${slot.char?.slot} exact-owner failed closed:`,e?.message||e));
                }
                dispatched++;
            } catch (e) {
                console.warn(`[CustomCape] preview slot=${slot.char?.slot} dispatch failed closed:`,e?.message||e);
            }
        }
    }
    return dispatched;
}
