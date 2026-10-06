import * as THREE from 'three';
import { Input } from '../core/Input.js';
import { worldVectorToThreeYaw } from './MUDirection.js';

/**
 * Movement.js - Integrador WASD + mouse-walk (MU Online style)
 *
 * API:
 *   Movement.integrate(char, camera, dt)
 *   Movement.setCollisionWorld(collisionWorld)   // instância de CollisionWorld
 *   Movement.setTerrainHeightFn(fn)              // fn(x, z) => alturaY  (ex: mapManager.getHeightAt)
 *
 * Comportamento:
 *  - WASD move relativo à rotação da câmera (W = frente da câmera)
 *  - RUN não é uma tecla Web: o estado real depende de SafeZone/equipamento/Run do PC.
 *  - NÃO cria pulo local/procedural: ações especiais dependem da lógica real do cliente/servidor.
 *  - Colisão com terreno: se step-up > 0.5, bloqueia o movimento
 *  - Colisão com colliders do mundo (CollisionWorld) se registrado
 *  - Rotação automática do personagem na direção do movimento
 *  - Animação de caminhar: usa SOMENTE mesh.userData.animationControl real.
 *    Sem action BMD válida, não inventa arm-swing/procedural.
 */
export const PC_REFERENCE_FPS = 25.0;
export const Movement = {
    // PC Main 5.2: CharacterMoveSpeed normal=12, run=15 UNIDADES POR frame
    // de referência; ZzzAI.h fixa REFERENCE_FPS=25. Conversão contínua:
    // 12*25=300 u/s e 15*25=375 u/s. O antigo 6 u/s era ~50x lento.
    walkSpeed: 12.0 * PC_REFERENCE_FPS,
    runMultiplier: 15.0 / 12.0, // reservado ao estado RUN autoritativo; teclado não o força
    maxStepUp: Infinity,      // PC não bloqueia por slope local arbitrário; ATT/path decide
    jumpVelocity: 8.0,
    gravity: 20.0,
    turnLerp: 12.0,          // velocidade de suavização da rotação

    collisionWorld: null,
    terrainHeightFn: null,
    walkableFn: null,

    /** Configura a fonte de colisão com objetos do mundo */
    setCollisionWorld(cw) { this.collisionWorld = cw; },

    /** Configura a função de altura do terreno: fn(x, z) => y */
    setTerrainHeightFn(fn) { this.terrainHeightFn = fn; },

    /** Célula caminhável do mapa (ATT NO_MOVE/NO_GROUND), paridade PC path grid. */
    setWalkableFn(fn) { this.walkableFn = fn; },

    _getCameraYaw(camera) {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        dir.y = 0;
        if (dir.lengthSq() < 1e-6) return 0;
        return Math.atan2(dir.x, dir.z);
    },

    _terrainY(x, z, fallback) {
        if (this.terrainHeightFn) {
            try { return this.terrainHeightFn(x, z); } catch (_e) { /* ignora */ }
        }
        return fallback;
    },

    /**
     * Source-backed CHARACTER::Run presentation subset shared with the retained
     * Android PC-port. It never turns Shift into run. SafeZone resets Run;
     * ordinary MG/DL or +5 boots accumulate Run for 40 reference steps
     * (~1.6 s at the 25 Hz PC clock); wings/riders use their authored movement
     * speed immediately. Unknown mounts/buffs stay at WALK rather than guessed.
     */
    resolvePcLocomotion(char, dtSeconds = 0) {
        const ctx = char?.mesh?.userData?.muMovementContext || char?.model?.userData?.muMovementContext || null;
        const readBool = (v) => { try { return Boolean(typeof v === 'function' ? v() : v); } catch (_) { return false; } };
        const safeZone = readBool(ctx?.safeZone);
        const inSwimWorld = readBool(ctx?.inSwimWorld);
        const equipment = ctx?.equipment || null;
        const classId = Number.isInteger(ctx?.classId) ? ctx.classId : Number(char?.classId ?? 0);
        const baseClass = classId & 0x7;
        let runProgress = Number(char?._muRunProgress || 0);
        const dtMs = Math.min(Math.max(Number(dtSeconds) || 0, 0), 0.04) * 1000;

        if (safeZone) runProgress = 0;
        let unitsPerRefFrame = 12;
        let running = false;

        if (!safeZone) {
            const hasWing = Boolean(equipment?.wing);
            const hasFenrir = Boolean(equipment?.fenrir);
            const rider = equipment?.rider?.species || null;

            if (hasFenrir) {
                runProgress = Math.min(40, runProgress + dtMs / 40);
                if (runProgress < 10) unitsPerRefFrame = 15;
                else if (runProgress < 20) unitsPerRefFrame = 16;
                else unitsPerRefFrame = Number(equipment?.fenrir?.option || 0) > 0 ? 19 : 17;
                running = runProgress >= 20;
            } else if (rider === 'dark-horse') {
                runProgress = 40;
                unitsPerRefFrame = 17;
                running = true;
            } else if (hasWing || rider === 'unicon' || rider === 'pegasus') {
                // CharacterMoveSpeed source: these movement families do not
                // wait on the ordinary +5 equipment 40-frame transition.
                runProgress = 40;
                unitsPerRefFrame = (equipment?.wing?.viaCacheKey === 'WING:5' || equipment?.wing?.viaCacheKey === 'WING:36') ? 16 : 15;
                running = true;
            } else {
                // SetPlayerWalk switches the run-equipment owner by map:
                // ordinary worlds use boots, Atlans/Hellas/DG3 use gloves.
                const body = equipment?.bodySpecs || {};
                const boostPart = inSwimWorld
                    ? (body.glove || body.gloves)
                    : (body.boot || body.boots);
                const boostLevel = Number(boostPart?.visualLevel ?? -1);
                const eligible = baseClass === 3 || baseClass === 4 || boostLevel >= 5;
                if (eligible) runProgress = Math.min(40, runProgress + dtMs / 40);
                else runProgress = 0;
                running = runProgress >= 40;
                unitsPerRefFrame = running ? 15 : 12;
            }
        }

        if (char) char._muRunProgress = runProgress;
        return { safeZone, running, runProgress, speed: unitsPerRefFrame * PC_REFERENCE_FPS };
    },

    // R16 network movement owner: reads WASD/camera intent without mutating the
    // authoritative character position. The caller may turn this intent into
    // the exact PC BOTH_MOVE tile packet.
    readDirectionalInput(camera) {
        let ix=0, iz=0;
        if (Input.isKeyDown('KeyW')) iz += 1;
        if (Input.isKeyDown('KeyS')) iz -= 1;
        if (Input.isKeyDown('KeyA')) ix -= 1;
        if (Input.isKeyDown('KeyD')) ix += 1;
        const hasInput=ix!==0||iz!==0, running=false;
        if (!hasInput || !camera) return { hasInput:false, running, dx:0, dz:0 };
        const yaw=this._getCameraYaw(camera), sin=Math.sin(yaw), cos=Math.cos(yaw);
        // Three camera forward uses -Z at yaw=0; MU world/tile projection has
        // the opposite handedness on the lateral basis. Build the camera-right
        // vector explicitly: right=(-cos,+sin). The former +cos/-sin basis
        // made D move visually left and A right.
        let dx=-ix*cos+iz*sin, dz=ix*sin+iz*cos;
        const len=Math.hypot(dx,dz); if(len>0){dx/=len;dz/=len;}
        return { hasInput:true, running, dx, dz };
    },

    // Port of the same deliberate-diagonal rule used by the Android PC-parity
    // movement owner. Web world Z is inverse of MU tile Y. Returns one of the
    // exact PC DIR_TABLE steps or null when neutral.
    quantizeWorldIntent(dx, dz) {
        const tileDx=dx<0?-1:(dx>0?1:0);
        const worldDy=-dz;
        const tileDy=worldDy<0?-1:(worldDy>0?1:0);
        const ax=Math.abs(dx), ay=Math.abs(worldDy);
        if(ax<1e-4&&ay<1e-4)return null;
        const major=Math.max(ax,ay), minor=Math.min(ax,ay), ratio=major>0?minor/major:0;
        let sx=tileDx, sy=tileDy;
        if(!(sx!==0&&sy!==0&&ratio>=0.84)){ if(ax>=ay)sy=0; else sx=0; }
        return { dx:sx, dy:sy };
    },

    /**
     * Integra o movimento do personagem neste frame.
     * @param {Character} char  - instância de game/Character.js
     * @param {THREE.Camera} camera
     * @param {number} dt - delta time em segundos
     */
    integrate(char, camera, dt) {
        if (!char || !char.isAlive || !char.isAlive()) return;

        // ---- Entrada de direção (WASD relativo à câmera) ----
        let ix = 0, iz = 0;
        if (Input.isKeyDown('KeyW')) iz += 1;
        if (Input.isKeyDown('KeyS')) iz -= 1;
        if (Input.isKeyDown('KeyA')) ix -= 1;
        if (Input.isKeyDown('KeyD')) ix += 1;

        const hasInput = (ix !== 0 || iz !== 0);
        // Não fabricar PLAYER_RUN a partir de Shift. A apresentação usa a
        // máquina PC evidence-backed de SafeZone/classe/+5 boots/wing/rider.
        const locomotion = this.resolvePcLocomotion(char, dt);
        const running = hasInput && locomotion.running;
        const speed = hasInput ? locomotion.speed : this.walkSpeed;
        // PC Run is character state, not keyboard-edge state. Network-authoritative
        // movement can have neutral input frames between tile acks; resetting Run
        // here made WALK/RUN alternate and looked like the leg was being pulled
        // backward. SafeZone/eligibility already reset it in resolvePcLocomotion().

        if (hasInput) {
            // Movimento manual cancela o click-to-move
            char.targetPos = null;

            const yaw = this._getCameraYaw(camera);
            // Rotaciona o vetor de entrada pelo yaw da câmera
            const sin = Math.sin(yaw), cos = Math.cos(yaw);
            // Same camera-right basis as readDirectionalInput(); keep local
            // fallback and network-authoritative movement direction identical.
            let dx = -ix * cos + iz * sin;
            let dz = ix * sin + iz * cos;
            const len = Math.hypot(dx, dz);
            if (len > 0) { dx /= len; dz /= len; }

            const curGroundY = this._terrainY(char.position.x, char.position.z, char.position.y);
            const step = speed * dt;
            const nx = char.position.x + dx * step;
            const nz = char.position.z + dz * step;
            const newY = this._terrainY(nx, nz, curGroundY);

            // PC Main 5.2 MoveCharacterPosition apenas aplica velocidade e
            // RequestTerrainHeight; a proibição vem do path/terrain ATT. O gate
            // antigo de 0.57 unidade bloqueava praticamente qualquer slope MU
            // (1 tile = 100 unidades) e fazia o herói "não andar".
            let blocked = false;
            if (this.walkableFn) {
                try { blocked = !this.walkableFn(nx, nz); } catch (_e) { blocked = false; }
            }

            // Colliders adicionais (NPC/decoração) continuam depois do ATT.
            if (!blocked && this.collisionWorld && this.collisionWorld.isBlocked({ x: nx, z: nz })) {
                blocked = true;
            }

            if (!blocked) {
                char.position.x = nx;
                char.position.z = nz;
                char.position.y = newY + (char._jumpOffset || 0);
                char.velocity.set(dx * speed, 0, dz * speed);
            } else {
                char.velocity.set(0, 0, 0);
            }

            // Rotação automática suave para a direção do movimento
            const targetRotY = worldVectorToThreeYaw(dx, dz, char.rotation.y);
            char.rotation.y = this._lerpAngle(char.rotation.y, targetRotY, Math.min(1, this.turnLerp * dt));
        } else if (!char.targetPos) {
            char.velocity.set(0, 0, 0);
        } else {
            // Mouse-walk ativo: segue a altura do terreno enquanto o Character.update move
            const gy = this._terrainY(char.position.x, char.position.z, char.position.y);
            char.position.y = gy + (char._jumpOffset || 0);
        }

        // ---- Animação de caminhada ----
        const moving = hasInput || !!char.targetPos;
        const animSpeed = moving ? (running ? 10 : 5) : 0;
        this._animate(char, dt, moving, animSpeed);
    },

    _lerpAngle(a, b, t) {
        let d = (b - a) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        return a + d * t;
    },

    /**
     * Animação de caminhada: somente actions reais do Player.bmd expostas por
     * mesh.userData.animationControl. Ausência da action = fail-closed.
     */
    _animate(char, dt, moving, animSpeed) {
        const mesh = char.mesh || char.model || null;
        if (!mesh) return;

        const control = mesh.userData && mesh.userData.animationControl;
        if (!control || typeof control.play !== 'function') return;
        // FIX92 Main 5.2 MOVEMENT_OPERATE: Sit/Pose is a persistent local SetAction,
        // not an idle locomotion clip. Preserve it until the player actually moves.
        if (Number.isInteger(char._pcOperateAction)) {
            if (!moving) return;
            char._pcOperateAction = null;
        }
        const name = moving ? (animSpeed > 7 ? 'run' : 'walk') : 'idle';
        // Chame todo frame: buildAnimationControl é idempotente no clip, mas
        // precisa reavaliar SafeZone/equipamento mesmo quando o estado lógico
        // continua 'walk'. O gate antigo por _current deixava a pose de fora da
        // cidade presa ao cruzar a borda da SafeZone.
        try { control.play(name); } catch (_e) { /* action inválida: fail-closed */ }
    }
};

export default Movement;
