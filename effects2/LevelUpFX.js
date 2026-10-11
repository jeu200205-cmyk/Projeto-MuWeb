// effects2/LevelUpFX.js — Level up FIEL ao cliente PC (Main 5.2).
//
// Autoridade PC:
//   WSclient.cpp:6237-6286 ReceiveLevelUp:
//     for (int i = 0; i < 15; ++i)
//         CreateJoint(BITMAP_FLARE, o->Position, o->Position, o->Angle, 0, o, 40, 2);
//     CreateEffect(BITMAP_MAGIC + 1, o->Position, o->Angle, o->Light, 0, o);
//     PlayBuffer(SOUND_LEVEL_UP);  // "Data\Sound\pLevelUp.wav" (ZzzOpenData.cpp:4759)
//   JOINT BITMAP_FLARE SubType=0 (ZzzEffectJoint.cpp:1630-1654):
//     LifeTime = 100 → 50 (Scale 40 > 10), MaxTails = 20, Velocity = 40,
//     Direction[2] = rand()%150/100, Direction[1] = rand()%500-250,
//     Light = Light do herói.
//   Movimento do flare (ZzzEffectJoint.cpp:5348-5382, SubType 0):
//     count = (Direction[1] + LifeTime) / PKKey (=2)
//     pos.x = target.x + cos(count) * Velocity(40)
//     pos.y = target.y − sin(count) * Velocity(40)   [MU X-Y chão]
//     pos.z += Direction[2] por frame (sobe)
//   BITMAP_FLARE = "Effect\Flare.jpg" (ZzzOpenData.cpp:5221)
//   BITMAP_MAGIC+1 = "Effect\Magic_Ground2.jpg" (ZzzOpenData.cpp:5121);
//   CreateEffect case (ZzzEffect.cpp:1298-1311): LifeTime=20, sprite no chão.
//
// Política zero-placeholder: texturas reais via RemoteAssets.fetchImageURL
// (strip SOI OZJ). Se a textura não carregar, o flare/ground simplesmente
// não renderiza (ausência transparente) — nunca geometria inventada.
import * as THREE from 'three';
import { RemoteAssets } from '../data/RemoteAssets.js';

/** Cache path → THREE.Texture | null (fail-closed, sem retry storm). */
const flareTexCache = new Map();

async function loadEffectTexture(relPath) {
    if (flareTexCache.has(relPath)) return flareTexCache.get(relPath);
    const p = (async () => {
        try {
            const url = await RemoteAssets.fetchImageURL(relPath);
            if (!url) return null;
            const tex = await new Promise((resolve, reject) => {
                new THREE.TextureLoader().load(url, resolve, undefined, reject);
            });
            tex.colorSpace = THREE.SRGBColorSpace;
            return tex;
        } catch {
            return null; // fail-closed
        }
    })();
    flareTexCache.set(relPath, p);
    const tex = await p;
    flareTexCache.set(relPath, tex);
    return tex;
}

/** Pré-carrega as texturas do level-up (chamar no boot do mundo). */
export async function preloadLevelUpTextures() {
    await Promise.all([
        loadEffectTexture('Effect/Flare.OZJ'),
        loadEffectTexture('Effect/Magic_Ground2.OZJ'),
    ]);
}

/**
 * Level up fiel ao PC: 15 flares orbitando + círculo mágico no chão + som real.
 *
 * @param {THREE.Object3D} charMesh herói (posição de origem dos flares)
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} _camera (não usado — PC não mexe na câmera aqui)
 * @param {object} opts { effectManager, sound, heroLight:[r,g,b], masterLevel:boolean }
 * @returns {object} efeito { update(dt)->bool, dispose() } (contrato SkillEffects)
 */
export function playLevelUp(charMesh, scene, _camera, opts = {}) {
    // Master Level (WSclient.cpp:6262-6269 IsMasterLevelExpCheck):
    //   1× joint 45 + 19× joint 46 (Scale arg 80 — o case sobrescreve p/ 30)
    //   + NO final: CreateEffect(MODEL_CHANGE_UP_EFF + CYLINDER) quando o 45 morre
    if (opts.masterLevel) return playMasterLevelUp(charMesh, scene, opts);

    const sound = opts.sound || (typeof window !== 'undefined' && window.Sound) || null;
    const heroLight = opts.heroLight || [1, 1, 1]; // o->Light do herói (PC: VectorCopy do target)
    const t0 = performance.now();

    // ---- Som REAL: Sound/pLevelUp.wav (WSclient.cpp:6279 PlayBuffer(SOUND_LEVEL_UP))
    try {
        if (sound && sound.buffers && sound.buffers.has('sfx-levelup-pc')) {
            sound.play('sfx-levelup-pc');
        } else if (sound && typeof sound.loadWav === 'function') {
            sound.loadWav('sfx-levelup-pc', 'pLevelUp.wav')
                .then((buf) => { if (buf && sound.play) sound.play('sfx-levelup-pc'); })
                .catch(() => {});
        }
    } catch { /* som é degradação, não hardfail */ }

    // ---- 15× CreateJoint(BITMAP_FLARE, SubType=0, Scale=40, PKKey=2)
    // Cada joint vira um billboard aditivo com a textura real Effect/Flare.OZJ.
    const origin = charMesh.position.clone();
    const flares = []; // { sprite, dir1, dir2, life, dead }
    let flareMat = null;
    let groundMat = null;
    let ground = null;
    let texPending = true;

    // Estado dos 15 joints segundo ZzzEffectJoint.cpp:1630-1654:
    //   LifeTime 100 (clamp 50 pois Scale 40>10), Velocity 40,
    //   Direction[1] = rand()%500-250 (fase orbital), Direction[2] = rand()%150/100 (sobe)
    // A textura chega async: os sprites nascem invisíveis e aparecem quando
    // a textura real resolve (nunca textura procedural inventada).
    const jointStates = [];
    for (let i = 0; i < 15; i++) {
        jointStates.push({
            dir1: (Math.random() * 500 - 250),          // Direction[1]
            dir2: (Math.random() * 150) / 100,          // Direction[2]
            life: 50,                                    // LifeTime (Scale>10 → 50)
            velocity: 40,                                // Velocity
            maxTails: 20,                                // MaxTails (fade por cauda)
        });
    }

    const build = async () => {
        const tex = await loadEffectTexture('Effect/Flare.OZJ');
        const groundTex = await loadEffectTexture('Effect/Magic_Ground2.OZJ');
        texPending = false;
        if (!tex) return; // fail-closed: sem textura real, efeito não existe

        flareMat = new THREE.SpriteMaterial({
            map: tex,
            color: new THREE.Color(heroLight[0], heroLight[1], heroLight[2]),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        // Tail quad do PC (ZzzEffectJoint.cpp:147-158): corners ±Scale*0.5
        // → quad de Scale 40 tem 40×40 unidades MU de largura. O web usa as
        // MESMAS unidades de mundo (TERRAIN_SCALE=100) — escala direta.
        for (const js of jointStates) {
            const sprite = new THREE.Sprite(flareMat.clone());
            sprite.material.color.setRGB(heroLight[0], heroLight[1], heroLight[2]);
            sprite.scale.set(40, 40, 1);
            sprite.position.copy(origin);
            sprite.visible = true;
            scene.add(sprite);
            flares.push({ sprite, js });
        }

        // ---- CreateEffect(BITMAP_MAGIC+1) — círculo Magic_Ground2 no chão
        if (groundTex) {
            groundMat = new THREE.MeshBasicMaterial({
                map: groundTex,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), groundMat);
            ground.rotation.x = -Math.PI / 2;
            // CreateEffect case BITMAP_MAGIC+1 (ZzzEffect.cpp:1301-1305):
            // Scale = ((rand()%50)+50)/100 * 4  → 2.0..4.0
            // RenderTerrainAlphaBitmap: Size em TILES (SizeX/SizeY direto,
            // ZzzLodTerrain.cpp:1899-1913) → unidades de mundo = tiles*100.
            const scale = ((Math.random() * 50 + 50) / 100) * 4;
            ground.scale.set(scale * 100, scale * 100, 1);
            ground.position.set(origin.x, origin.y + 1, origin.z);
            scene.add(ground);
        }
    };
    build().catch(() => { texPending = false; });

    // FPS_ANIMATION_FACTOR: o PC roda a 25fps lógicos; dt em segundos.
    const LOGIC_DT = 1 / 25;

    return {
        update(dt) {
            const all = flares.length > 0;
            // Avança cada joint na frequência lógica do PC (acumulador).
            let alive = flares.length > 0;
            let acc = dt;
            // sub-steps de até 1/25s p/ estabilidade
            while (acc > 0) {
                const step = Math.min(acc, LOGIC_DT);
                for (let i = flares.length - 1; i >= 0; i--) {
                    const f = flares[i];
                    const js = f.js;
                    js.life -= step * 25; // LifeTime em frames lógicos
                    if (js.life <= 0) {
                        scene.remove(f.sprite);
                        f.sprite.material.dispose();
                        flares.splice(i, 1);
                        continue;
                    }
                    // MoveJoint BITMAP_FLARE SubType=0 (5348-5382):
                    const count = (js.dir1 + js.life) / 2; // PKKey=2
                    f.sprite.position.x = origin.x + Math.cos(count) * js.velocity;
                    f.sprite.position.z = origin.z - Math.sin(count) * js.velocity;
                    f.sprite.position.y += js.dir2 * step * 25; // z MU (altura) sobe
                    // Fade final (PC: LifeTime<5 → Light *= 1/1.3 por frame)
                    if (js.life < 5) {
                        const k = Math.pow(1 / 1.3, step * 25);
                        f.sprite.material.color.setRGB(
                            heroLight[0] * k, heroLight[1] * k, heroLight[2] * k);
                    }
                }
                acc -= step;
            }
            // Ground circle: LifeTime=20 frames → fade linear
            if (ground && groundMat) {
                const t = (performance.now() - t0) / 1000;
                const lifeFrames = t * 25;
                if (lifeFrames >= 20) {
                    scene.remove(ground);
                    groundMat.dispose();
                    ground.geometry.dispose();
                    ground = null;
                } else {
                    groundMat.opacity = Math.max(0, 1 - lifeFrames / 20);
                }
            }
            alive = flares.length > 0 || (ground != null);
            return alive || texPending;
        },
        dispose() {
            for (const f of flares) {
                scene.remove(f.sprite);
                f.sprite.material.dispose();
            }
            flares.length = 0;
            if (ground) {
                scene.remove(ground);
                groundMat.dispose();
                ground.geometry.dispose();
                ground = null;
            }
            if (flareMat) flareMat.dispose();
        },
    };
}

// =====================================================================
// MASTER LEVEL UP — WSclient.cpp:6262-6269 (IsMasterLevelExpCheck true):
//   CreateJoint(BITMAP_FLARE, o->Position, o->Position, o->Angle, 45, o, 80, 2);
//   for (int i = 0; i < 19; ++i)
//       CreateJoint(BITMAP_FLARE, ..., 46, o, 80, 2);
// Joint 45/46 creation (ZzzEffectJoint.cpp:1996-2004):
//   Light=(0.2,0.2,1.0), MultiUse=rand%10, LifeTime=30+MultiUse,
//   MaxTails=15, Direction[0]=rand%3000, Scale=30 (arg 80 sobrescrito).
// Joint 45/46 movement (ZzzEffectJoint.cpp:5584-5678):
//   iFrame = WorldTime/40 (+iIndex*53731, par ímpar inverte sinal)
//   vDir = Lissajous 3D: sin((iFrame+55555)*0.048)*cos(iFrame*0.0613),
//          sin((iFrame+55555)*0.048)*sin(iFrame*0.0613),
//          cos((iFrame+55555)*0.048), girado por fSinAdd/fCosAdd (0.1113)
//   fLife = LifeTime*40/30; fCircle = min(max(0,40-fLife)*15, 150)
//           → parte de 150 e converge p/ 0 (espiral para dentro)
//   fPos = fLife<10 ? fLife*7 : fLife+60; fPos = fPos/(30+MultiUse)*30
//   Position = Target + vDir*fCircle; Position = (fPos*Pos+fLastTarget)*0.01
//             + 100 z (sobe); fLastTarget=(100-fPos)*(Target+25cos(...))
//   Light render = (0.5, 0.5, 1.0) (L5680)
//   LifeTime==30 → PlayBuffer(SOUND_METEORITE01) (L5647-5650, eMeteorite.wav
//   ZzzOpenData.cpp:4709)
//   45 morrendo (life<=1): CreateEffect(MODEL_CHANGE_UP_EFF + CYLINDER)
//   (L5700-5703) — BMDs reais Effect/Change_Up_Eff.bmd + clinderlight.bmd
//   (ZzzOpenData.cpp:4377/4383, PlaySpeed 0.005), LifeTime 100 (ZzzEffect.cpp:2096-2136)
//   Trail de morte (ZzzEffectJoint.cpp:3355-3364): 46 → SMOKE (0.4,1.0,0.4);
//   45 → FLARE_RED sprite.
// =====================================================================
const MASTER_LIGHT = [0.2, 0.2, 1.0];   // L1998
const MASTER_TRAIL_LIGHT = [0.5, 0.5, 1.0]; // L5680
const F_SPEED = [0.048, 0.0613, 0.1113]; // L5602

function playMasterLevelUp(charMesh, scene, opts = {}) {
    const sound = opts.sound || (typeof window !== 'undefined' && window.Sound) || null;
    const origin = charMesh.position.clone();
    const t0 = performance.now();

    // ---- Som: pLevelUp.wav (o master-level também toca SOUND_LEVEL_UP no
    //      PC — ReceiveLevelUp chama PlayBuffer fora do if/else, L6279)
    try {
        if (sound && sound.buffers && sound.buffers.has('sfx-levelup-pc')) {
            sound.play('sfx-levelup-pc');
        } else if (sound && typeof sound.loadWav === 'function') {
            sound.loadWav('sfx-levelup-pc', 'pLevelUp.wav')
                .then((buf) => { if (buf && sound.play) sound.play('sfx-levelup-pc'); })
                .catch(() => {});
        }
    } catch { /* degradação silenciosa */ }

    // ---- 20 joints: 1× subtype 45 + 19× subtype 46 (WSclient.cpp:6264/6267)
    const flares = [];
    let flareMat = null;
    let texPending = true;
    const meteoritePlayed = { done: false };

    const jointStates = [];
    for (let k = 0; k < 20; k++) {
        const sub = k === 0 ? 45 : 46;
        const multiUse = Math.floor(Math.random() * 10); // MultiUse=rand%10
        jointStates.push({
            sub,
            index: k,                       // iIndex (fase da Lissajous)
            multiUse,
            life: 30 + multiUse,            // LifeTime=30+MultiUse
            dir0: Math.random() * 3000,     // Direction[0]=rand%3000 (fase extra)
            scale: 30,                      // Scale=30 (L2003)
        });
    }

    const build = async () => {
        const tex = await loadEffectTexture('Effect/Flare.OZJ');
        texPending = false;
        if (!tex) return; // fail-closed

        flareMat = new THREE.SpriteMaterial({
            map: tex,
            color: new THREE.Color(MASTER_LIGHT[0], MASTER_LIGHT[1], MASTER_LIGHT[2]),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        for (const js of jointStates) {
            const sprite = new THREE.Sprite(flareMat.clone());
            sprite.material.color.setRGB(MASTER_LIGHT[0], MASTER_LIGHT[1], MASTER_LIGHT[2]);
            sprite.scale.set(js.scale, js.scale, 1); // Scale 30 = 30 units (tail ±15)
            sprite.position.copy(origin);
            scene.add(sprite);
            flares.push({ sprite, js });
        }
    };
    build().catch(() => { texPending = false; });

    const LOGIC_DT = 1 / 25;
    const changeUp = { eff: null, cyl: null, t: 0, started: false };

    // CreateEffect(MODEL_CHANGE_UP_EFF/CYLINDER) quando o 45 morre (L5700-5703):
    // BMDs reais, fail-closed — carregados sob demanda via MUAssets.loadBMD.
    const spawnChangeUp = async () => {
        try {
            const { MUAssets } = await import('../assets/MUAssetLoader.js');
            const { MUModelRenderer } = await import('../assets/MUModelRenderer.js');
            const { applyMuUpAxis } = await import('../graphics/BmdAdapter.js');
            // LifeTime=100 (ZzzEffect.cpp:2098/2126); Scale 0.7/0.9
            const mk = async (path, scale, yOffset) => {
                const bmd = await MUAssets.loadBMD(path);
                const r = new MUModelRenderer();
                await r.initFromBMD(bmd);
                applyMuUpAxis(r.group);
                r.group.scale.setScalar(scale);
                r.group.position.set(origin.x, origin.y + yOffset, origin.z);
                r.playAction('action_0'); // PlaySpeed 0.005 (ZzzOpenData.cpp:4379)
                scene.add(r.group);
                return r;
            };
            changeUp.eff = await mk('Effect/Change_Up_Eff.bmd', 0.7, 22);   // +22 z (L2102)
            changeUp.cyl = await mk('Effect/clinderlight.bmd', 0.9, 0);      // chão (L2128 Direction(0,0,1))
            changeUp.started = true;
            changeUp.t = 0;
        } catch (e) {
            console.warn('[LevelUpFX] master Change_Up_Eff/clinderlight indisponíveis (fail-closed):', e.message);
            changeUp.started = true; // não repetir tentativa
            changeUp.failed = true;
        }
    };

    return {
        update(dt) {
            let acc = dt;
            const worldTime = (performance.now() - t0) / 1000;
            while (acc > 0) {
                const step = Math.min(acc, LOGIC_DT);
                const frames = step * 25;
                const iFrameF = (worldTime * 25) / 40; // WorldTime/40 (L5596)
                for (let i = flares.length - 1; i >= 0; i--) {
                    const f = flares[i];
                    const js = f.js;

                    // SOUND_METEORITE01 quando LifeTime==30 (L5647-5650)
                    if (!meteoritePlayed.done && Math.round(js.life) === 30) {
                        meteoritePlayed.done = true;
                        try {
                            if (sound && sound.buffers && sound.buffers.has('sfx-meteorite-pc')) {
                                sound.play('sfx-meteorite-pc');
                            } else if (sound && typeof sound.loadWav === 'function') {
                                sound.loadWav('sfx-meteorite-pc', 'eMeteorite.wav')
                                    .then((buf) => { if (buf && sound.play) sound.play('sfx-meteorite-pc'); })
                                    .catch(() => {});
                            }
                        } catch { /* degradação */ }
                    }

                    js.life -= frames;
                    if (js.life <= 0) {
                        // Morte do joint (L5700-5703 p/ 45; smoke/flare-red trail)
                        if (js.sub === 45 && !changeUp.started) spawnChangeUp();
                        scene.remove(f.sprite);
                        f.sprite.material.dispose();
                        flares.splice(i, 1);
                        continue;
                    }

                    // ---- Lissajous 3D (L5596-5617) ----
                    let iFrame = Math.trunc(iFrameF);
                    iFrame = ((js.index % 2) ? iFrame : -iFrame) + js.index * 53731;
                    const fr = iFrame + 55555;
                    const vDirTemp = [
                        Math.sin(fr * F_SPEED[0]) * Math.cos(iFrame * F_SPEED[1]),
                        Math.sin(fr * F_SPEED[0]) * Math.sin(iFrame * F_SPEED[1]),
                        Math.cos(fr * F_SPEED[0]),
                    ];
                    const fSinAdd = Math.sin((iFrame + 11111) * F_SPEED[2]);
                    const fCosAdd = Math.cos((iFrame + 11111) * F_SPEED[2]);
                    // vDir: MU axes [x,y,z] → three [x,z,y] (y MU = altura)
                    const vDir = [
                        fCosAdd * vDirTemp[1] - fSinAdd * vDirTemp[2], // vDir[0]→x
                        fSinAdd * vDirTemp[1] + fCosAdd * vDirTemp[2], // vDir[1]→MU y (chão)
                        vDirTemp[0],                                    // vDir[2]→altura
                    ];

                    // ---- fLife/fCircle/fPos (L5621-5646) ----
                    const fLife = js.life * 40 / 30;
                    const fCircle = Math.min(Math.max(0, 40 - fLife) * 15, 150);
                    let fPos = fLife < 10 ? fLife * 7.0 : fLife * 1.0 + 60;
                    fPos = fPos / (30 + js.multiUse) * 30;

                    // Position = Target + vDir*fCircle (L5661-5663)
                    let px = origin.x + vDir[0] * fCircle;
                    let pz = origin.z + vDir[1] * fCircle;
                    let py = origin.y + vDir[2] * fCircle;
                    // Convergência fLastTarget (L5666-5673):
                    //   (100-fPos)*(Target+25cos(iIndex*51231+k*3711+iFrame/10)*0.01)
                    for (let k = 0; k < 3; k++) {
                        const tgt = k === 1 ? origin.z : (k === 0 ? origin.x : origin.y);
                        const fLastTarget = (100 - fPos) *
                            (tgt + 25 * Math.cos((js.index * 51231 + k * 3711 + iFrame / 10) * 0.01));
                        const cur = k === 1 ? pz : (k === 0 ? px : py);
                        const nv = (fPos * cur + fLastTarget) * 0.01;
                        if (k === 0) px = nv; else if (k === 1) pz = nv; else py = nv;
                    }
                    py += 100 * step * 25 / 25; // +100 z uma vez por ciclo lógico (L5677)
                    // (acima aplicado por step: py += 100 * frames/25 ⇒ ~4/step)

                    f.sprite.position.set(px, py, pz);
                    // Light render (0.5,0.5,1.0) (L5680)
                    f.sprite.material.color.setRGB(MASTER_TRAIL_LIGHT[0], MASTER_TRAIL_LIGHT[1], MASTER_TRAIL_LIGHT[2]);
                }
                acc -= step;
            }

            // ---- Change_Up_Eff/Cylinder: avança animação ~100 frames (L2098)
            if (changeUp.eff || changeUp.cyl) {
                changeUp.t += dt;
                try { changeUp.eff?.update(dt, changeUp.t); } catch { /* noop */ }
                try { changeUp.cyl?.update(dt, changeUp.t); } catch { /* noop */ }
                const life = changeUp.t * 25;
                if (life >= 100) { // LifeTime=100 → remove
                    for (const r of [changeUp.eff, changeUp.cyl]) {
                        if (r) { scene.remove(r.group); try { r.dispose(); } catch { /* noop */ } }
                    }
                    changeUp.eff = null; changeUp.cyl = null;
                }
            }

            return flares.length > 0 || texPending || (changeUp.eff != null) || (changeUp.cyl != null);
        },
        dispose() {
            for (const f of flares) {
                scene.remove(f.sprite);
                f.sprite.material.dispose();
            }
            flares.length = 0;
            for (const r of [changeUp.eff, changeUp.cyl]) {
                if (r) { scene.remove(r.group); try { r.dispose(); } catch { /* noop */ } }
            }
            changeUp.eff = null; changeUp.cyl = null;
            if (flareMat) flareMat.dispose();
        },
    };
}
