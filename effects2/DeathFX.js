// effects2/DeathFX.js — Morte FIEL ao cliente PC (Main 5.2).
//
// Autoridade PC:
//   ZzzCharacter.cpp:1336: SetAction(&c->Object, PLAYER_DIE1) — o herói toca
//     a action REAL de morte do Player.bmd (índice enum _enum.h:1357;
//     BMD action 237 — mesmo off-by-one validado com CRY1=207).
//   ZzzCharacter.cpp:3334-3341 (PlayerStopAnimationSetting):
//     if (CurrentAction == PLAYER_DIE1 || PLAYER_DIE2) { CreateBlood(o); return; }
//   ZzzEffectBlurSpark.cpp:386-408 (CreateBlood):
//     2× CreatePointer(BITMAP_BLOOD, headBonePos + rand±50 XY,
//                      rot=rand%360, o->Light, Scale=(rand%4+8)*0.1)
//   ZzzEffectPointer.cpp:19-102 (CreatePointer/Move/Render):
//     LifeTime = 50 + rand%32; BITMAP_BLOOD: Scale += 0.004/frame (espalha),
//     Light = (0.1, 0, 0), Alpha = LifeTime*0.02 quando LifeTime<50
//     (fade final); renderiza DEITADO no terreno (RenderTerrainAlphaBitmap
//     — ZzzLodTerrain.cpp:1886, Size em tiles: Scale≈1 → ~1 tile).
//   ZzzOpenData.cpp:5132: BITMAP_BLOOD = "Effect\blood01.tga".
//
//   PC NÃO tem: blink vermelho do assassino, fade-to-black de tela,
//   colapso por rotation.x (a queda é a ANIMAÇÃO REAL do BMD).
//   O modal de respawn é UI do web-client (equivalente do diálogo de
//   morte do PC — mantido como fluxo de UX, não é VFX).
import * as THREE from 'three';
import { RemoteAssets } from '../data/RemoteAssets.js';

let respawnCallback = null;
export function onRespawn(cb) { respawnCallback = cb; }

export const PLAYER_DIE1_ACTION = 237; // _enum.h PLAYER_DIE1 (= CRY1 207 + enum)
export const PLAYER_HEAD_BONE = 20;     // "Bip01 Head" (probe Player.bmd real)

/** Cache path → THREE.Texture | null (fail-closed). */
const texCache = new Map();

async function loadBloodTexture() {
    if (texCache.has('blood')) return texCache.get('blood');
    const p = (async () => {
        try {
            const url = await RemoteAssets.fetchImageURL('Effect/blood01.ozt');
            if (!url) return null;
            const tex = await new Promise((resolve, reject) => {
                new THREE.TextureLoader().load(url, resolve, undefined, reject);
            });
            tex.colorSpace = THREE.SRGBColorSpace;
            return tex;
        } catch {
            return null;
        }
    })();
    texCache.set('blood', p);
    const tex = await p;
    texCache.set('blood', tex);
    return tex;
}

/**
 * CreateBlood — 2 decalques de sangue no chão perto da cabeça do alvo.
 * Port de ZzzEffectBlurSpark.cpp:386-408 + ZzzEffectPointer.cpp:19-102.
 * Reutilizável para morte de MONSTRO também (ZzzCharacter.cpp:3389-3396 —
 * MONSTER01_DIE → CreateBlood igual).
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Vector3} headWorldPos posição de referência (cabeça)
 * @param {object} [opts] { terrainHeightAt:(x,z)=>number } — snap ao chão real
 * @returns {object} efeito { update(dt)->bool, dispose() }
 */
export function createBlood(scene, headWorldPos, opts = {}) {
    const decals = [];
    let texPending = true;

    const build = async () => {
        const tex = await loadBloodTexture();
        texPending = false;
        if (!tex) return; // fail-closed: sem textura real, sem sangue fake

        // 2× CreatePointer (ZzzEffectBlurSpark.cpp:400-405)
        for (let i = 0; i < 2; i++) {
            const mat = new THREE.MeshBasicMaterial({
                map: tex,
                transparent: true,
                depthWrite: false,
                // Light=(0.1, 0, 0) (ZzzEffectPointer.cpp:78) — tinta vermelho-escuro
                color: new THREE.Color(0.35, 0.02, 0.02),
                opacity: 1.0,
            });
            const scale0 = (Math.floor(Math.random() * 4) + 8) * 0.1; // 0.8-1.2
            const geo = new THREE.PlaneGeometry(1, 1);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.x = -Math.PI / 2; // deitado no chão (terrain decal)
            mesh.rotation.z = Math.random() * Math.PI * 2; // rot=rand%360
            const offset = new THREE.Vector3(
                Math.random() * 100 - 50,  // rand±50 XY (unidades MU — ZzzEffectBlurSpark.cpp:402)
                0,
                Math.random() * 100 - 50,
            );
            const pos = headWorldPos.clone().add(offset);
            mesh.position.set(pos.x, pos.y + 2, pos.z); // +2: acima do chão p/ decal
            const tile = 100; // RenderTerrainAlphaBitmap Size em tiles → ×100 unidades
            mesh.scale.set(scale0 * tile, scale0 * tile, 1);
            scene.add(mesh);
            decals.push({
                mesh, mat, geo,
                life: 50 + Math.floor(Math.random() * 32), // LifeTime frames
                scale0, tile,
            });
        }
    };
    build().catch(() => { texPending = false; });

    return {
        update(dt) {
            if (!decals.length) return texPending;
            let alive = false;
            const frames = dt * 25; // lógica a 25fps como o PC
            for (let i = decals.length - 1; i >= 0; i--) {
                const d = decals[i];
                d.life -= frames;
                if (d.life <= 0) {
                    scene.remove(d.mesh);
                    d.mat.dispose(); d.geo.dispose();
                    decals.splice(i, 1);
                    continue;
                }
                // Scale += 0.004/frame (MovePointers:76)
                d.mesh.scale.x += 0.004 * frames * d.tile;
                d.mesh.scale.y += 0.004 * frames * d.tile;
                // Alpha = LifeTime*0.02 quando <50 (fade final)
                d.mat.opacity = d.life < 50 ? Math.max(0, d.life * 0.02) : 1;
                alive = true;
            }
            return alive;
        },
        dispose() {
            for (const d of decals) {
                scene.remove(d.mesh);
                d.mat.dispose(); d.geo.dispose();
            }
            decals.length = 0;
        },
    };
}

/**
 * Morte do herói: action REAL PLAYER_DIE1 + CreateBlood + modal de respawn.
 * PC: ZzzCharacter.cpp:1336 (SetAction DIE1) e :3334-3341 (CreateBlood once).
 *
 * @param {THREE.Scene} threeScene
 * @param {THREE.Object3D} charMesh herói (outer group)
 * @param {object} opts { renderer: MUModelRenderer, sceneWrap?: SceneManager,
 *                        animationControl?: controle do herói }
 */
export function onPlayerDeath(threeScene, charMesh, opts = {}) {
    const renderer = opts.renderer || null;

    // 1) SetAction(PLAYER_DIE1) — animação real de morte do BMD.
    //    Sem renderer disponível: ausência transparente (nada inventado).
    if (renderer && typeof renderer.playAction === 'function') {
        const act = renderer.playAction(`action_${PLAYER_DIE1_ACTION}`, 0.1);
        if (act) {
            // A action de morte segura o último frame (PC mantém o corpo
            // no chão — o loop é segurado pelo CurrentAction != STOP).
            act.setLoop(THREE.LoopOnce);
            act.clampWhenFinished = true;
        } else {
            console.warn('[DeathFX] action_' + PLAYER_DIE1_ACTION +
                ' (PLAYER_DIE1) ausente no Player.bmd — sem fallback inventado');
        }
    } else {
        console.warn('[DeathFX] renderer do herói indisponível — action DIE1 não tocada (fail-closed)');
    }

    // Trava o controle idle/walk/run p/ o Movement não sobrepor a action de
    // morte (Movement.js:61 já corta mortos, mas o guard é barato e local).
    const control = charMesh?.userData?.animationControl;
    const origPlay = control ? control.play : null;
    if (control) control.play = () => {};

    // 2) CreateBlood — 2 decalques no chão (cabeça do herói como origem).
    //    Posição da cabeça: bone 20 do renderer (world) ou torso (fallback
    //    documentado: origem do mesh + altura de característica).
    let headPos = null;
    try {
        const headBone = renderer?.bones?.[PLAYER_HEAD_BONE];
        if (headBone) {
            headPos = new THREE.Vector3();
            headBone.getWorldPosition(headPos);
        }
    } catch { /* sem bone → fallback abaixo */ }
    if (!headPos) headPos = charMesh.position.clone().add(new THREE.Vector3(0, 25, 0));
    const blood = createBlood(threeScene, headPos, opts);

    // 3) Modal de respawn (UX web — o PC tem diálogo próprio de morte).
    //    Sem blackout inventado; o herói permanece no chão como no PC.
    setTimeout(() => {
        const modal = document.createElement('div');
        Object.assign(modal.style, {
            position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            background: '#0a0a2a', border: '3px double #5a5aff', padding: '24px 40px',
            fontFamily: 'Courier New, monospace', color: '#c8c8ff', textAlign: 'center',
            zIndex: 9999, boxShadow: '0 0 30px #000'
        });
        modal.innerHTML = '<div style="margin-bottom:16px;font-size:18px">Você morreu!</div>';
        const btn = document.createElement('button');
        btn.textContent = 'Ressuscitar em Lorencia';
        Object.assign(btn.style, {
            fontFamily: 'Courier New, monospace', fontSize: '16px', padding: '8px 20px',
            background: '#1a1a4a', color: '#ffe066', border: '2px solid #8080ff', cursor: 'pointer'
        });
        btn.onclick = () => {
            modal.remove();
            // Restaura o controle de animação e volta ao idle (respawn).
            if (control && origPlay) { control.play = origPlay; control._current = null; }
            const idle = charMesh?.userData?.animationControl;
            try { idle && idle.play && idle.play('idle'); } catch { /* fail-closed */ }
            if (respawnCallback) respawnCallback();
        };
        modal.appendChild(btn);
        document.body.appendChild(modal);
    }, 1200);

    return { blood };
}
