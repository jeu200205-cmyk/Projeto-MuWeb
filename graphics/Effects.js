import * as THREE from 'three';

/**
 * Effects.js - Port de ZzzEffectParticle.cpp e EffectManager.cpp
 * Sistema de partículas para efeitos de magia, auras, etc.
 */
export class ParticleEmitter {
    /**
     * @param {object} options
     * @param {THREE.Vector3} options.position
     * @param {number} options.color
     * @param {number} options.count - número de partículas
     * @param {number} options.life - vida de cada partícula (s)
     * @param {number} options.speed - velocidade
     * @param {number} options.size - tamanho das partículas
     * @param {string} options.blending - 'additive' ou 'normal'
     */
    constructor(options = {}) {
        this.count = options.count || 50;
        this.life = options.life || 1.5;
        this.speed = options.speed || 80;
        this.size = options.size || 5;
        this.color = options.color || 0x66ccff;
        this.gravity = options.gravity !== undefined ? options.gravity : -30;
        this.emitRate = options.emitRate || 20; // partículas/segundo
        this.active = true;
        this.loop = options.loop !== undefined ? options.loop : true;
        this.elapsed = 0;
        this.duration = options.duration || Infinity;

        const blending = options.blending === 'additive'
            ? THREE.AdditiveBlending
            : THREE.NormalBlending;

        // Geometria de pontos
        this.geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.count * 3);
        this.particleData = [];

        const center = options.position || new THREE.Vector3();
        for (let i = 0; i < this.count; i++) {
            this.positions[i * 3] = center.x;
            this.positions[i * 3 + 1] = center.y;
            this.positions[i * 3 + 2] = center.z;
            this.particleData.push(this._newParticle(center, Math.random() * this.life));
        }

        this.geometry.setAttribute('position',
            new THREE.BufferAttribute(this.positions, 3));

        // Sprite circular para as partículas
        const texture = this._createParticleTexture();

        this.material = new THREE.PointsMaterial({
            color: this.color,
            size: this.size,
            map: texture,
            blending: blending,
            transparent: true,
            depthWrite: false,
            opacity: 1.0
        });

        this.points = new THREE.Points(this.geometry, this.material);
        this.points.frustumCulled = false;
        this.center = center.clone();
    }

    _createParticleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 32, 32);
        return new THREE.CanvasTexture(canvas);
    }

    _newParticle(center, startAge = 0) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const speed = this.speed * (0.5 + Math.random() * 0.5);

        return {
            vx: Math.sin(phi) * Math.cos(theta) * speed,
            vy: Math.cos(phi) * speed * 0.8,
            vz: Math.sin(phi) * Math.sin(theta) * speed,
            x: center.x,
            y: center.y,
            z: center.z,
            age: startAge,
            alive: true
        };
    }

    update(dt) {
        if (!this.active) return;

        this.elapsed += dt;
        if (this.elapsed >= this.duration && !this.loop) {
            this.active = false;
        }

        let alive = 0;
        for (let i = 0; i < this.count; i++) {
            const p = this.particleData[i];
            if (!p.alive) {
                if (this.loop || this.elapsed < this.duration) {
                    Object.assign(p, this._newParticle(this.center));
                    alive++;
                }
                continue;
            }

            p.age += dt;
            if (p.age >= this.life) {
                p.alive = false;
                if (this.loop) {
                    Object.assign(p, this._newParticle(this.center));
                    alive++;
                }
                continue;
            }

            p.vy += this.gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;

            this.positions[i * 3] = p.x;
            this.positions[i * 3 + 1] = p.y;
            this.positions[i * 3 + 2] = p.z;
            alive++;
        }

        this.geometry.attributes.position.needsUpdate = true;

        // Fade out no fim
        if (this.elapsed > this.duration - 0.5 && !this.loop) {
            this.material.opacity = Math.max(0, (this.duration - this.elapsed) / 0.5);
        }

        return alive > 0 || this.loop;
    }

    setPosition(pos) {
        this.center.copy(pos);
    }

    dispose() {
        this.geometry.dispose();
        this.material.dispose();
        if (this.points.parent) {
            this.points.parent.remove(this.points);
        }
    }
}

/**
 * EffectManager - gerencia todos os efeitos ativos
 */
export class EffectManager {
    constructor(scene) {
        this.scene = scene;
        this.effects = [];
    }

    /**
     * Cria um efeito de magia brilhante
     */
    createMagicEffect(position, color = 0x66ccff) {
        const emitter = new ParticleEmitter({
            position: position.clone().add(new THREE.Vector3(0, 60, 0)),
            color: color,
            count: 60,
            life: 1.2,
            speed: 100,
            size: 7,
            blending: 'additive',
            gravity: -20,
            loop: false,
            duration: 1.5
        });
        this.scene.add(emitter.points);
        this.effects.push(emitter);
        return emitter;
    }

    /**
     * Cria aura permanente ao redor de um objeto
     */
    createAura(position, color = 0xffaa00) {
        const emitter = new ParticleEmitter({
            position: position,
            color: color,
            count: 30,
            life: 2.0,
            speed: 20,
            size: 4,
            blending: 'additive',
            gravity: 30,
            loop: true
        });
        this.scene.add(emitter.points);
        this.effects.push(emitter);
        return emitter;
    }

    update(dt) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const effect = this.effects[i];
            const stillAlive = effect.update(dt);
            if (!stillAlive && !effect.loop) {
                effect.dispose();
                this.effects.splice(i, 1);
            }
        }
    }

    clear() {
        for (const effect of this.effects) effect.dispose();
        this.effects = [];
    }

    // ---------------------------------------------------------------
    // Skill texturizada — usa somente texturas REAIS do cliente (Data/Skill/*)
    // via RemoteAssets.fetchImageURL. Asset frio/ausente permanece fail-closed.
    // ---------------------------------------------------------------
    /**
     * Pré-carrega as texturas de skill do servidor (Data/Skill/*).
     * Guarda THREE.Texture em cache compartilhado (skillTextureCache).
     * @returns {Promise<Map<string, THREE.Texture>>} o cache
     */
    async preloadSkillTextures() {
        return await preloadSkillTextures();
    }

    /**
     * Cria efeito de skill por nome comum somente quando a textura real já
     * está residente. Se ainda estiver fria, dispara o load e retorna null;
     * nunca cria um substituto procedural enquanto espera.
     * @param {string} name - ex.: 'Fireball', 'Lightning', 'Ice Arrow',
     *   'Twisting Slash', 'Dark Phoenix Shot', 'Cometfall', 'Evil Spirit'
     * @param {THREE.Vector3} position - origem (caster/alvo)
     * @param {THREE.Vector3} [targetPosition] - destino (opcional)
     * @param {object} [opts] - { duration, scale, color }
     * @returns {object} o efeito registrado { update, dispose }
     */
    createSkillEffect(name, position, targetPosition = null, opts = {}) {
        const def = SKILL_TEXTURE_MAP[name] || null;
        const color = opts.color !== undefined ? opts.color
            : (def ? def.color : 0x66ccff);
        const scale = opts.scale || 1;
        const duration = opts.duration || 1.2;
        const origin = position.clone();
        origin.y += 0.5;

        const texPath = def ? def.paths[0] : null;
        let texture = texPath ? skillTextureCache.get(texPath) : null;
        if (texture instanceof Promise) texture = null;
        if (!texture) {
            if (texPath) loadSkillTexture(texPath).catch(() => null);
            return null; // zero-placeholder: wait for the real owner
        }

        const emitter = new ParticleEmitter({
            position: origin,
            color: 0xffffff,
            count: 50,
            life: 0.9,
            speed: 3.5,
            size: 24 * scale,
            blending: 'additive',
            gravity: -1.5,
            loop: false,
            duration,
        });
        emitter.material.map = texture;
        emitter.material.color.setHex(0xffffff);
        emitter.material.needsUpdate = true;
        this.scene.add(emitter.points);
        this.effects.push(emitter);

        // Billboard central usa a mesma textura real residente.
        {
            const mat = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            });
            const sprite = new THREE.Sprite(mat);
            sprite.position.copy(targetPosition ? targetPosition.clone() : origin);
            sprite.position.y += 1.0;
            sprite.scale.set(2.2 * scale, 2.2 * scale, 1);
            this.scene.add(sprite);

            let t = 0;
            this.effects.push({
                loop: false,
                update: (dt) => {
                    t += dt;
                    const k = Math.min(1, t / duration);
                    sprite.material.opacity = 1 - k;
                    sprite.rotation += dt * 3;
                    const s = (2.2 + k * 1.5) * scale;
                    sprite.scale.set(s, s, 1);
                    return k < 1;
                },
                dispose: () => {
                    mat.dispose();
                    if (sprite.parent) sprite.parent.remove(sprite);
                },
            });
        }

        return emitter;
    }
}

// =====================================================================
// Skill texture system — texturas REAIS existentes no asset-manifest.json
// (Data/Skill/* da autoridade selecionada; o launcher FIX99 bloqueia o Data oficial MuPromax 1.0.1)
// =====================================================================

/** Caminhos exatos validados contra public/asset-manifest.json */
export const SKILL_TEXTURE_MAP = {
    'Fireball': {
        color: 0xff6622,
        paths: ['Skill/fire01.OZJ', 'Skill/fire02.OZJ', 'Skill/lava.OZJ'],
    },
    'Lightning': {
        color: 0x99ccff,
        paths: ['Skill/eff_lightinga03.OZJ', 'Skill/light01.OZJ'],
    },
    'Ice Arrow': {
        color: 0x88ddff,
        paths: ['Skill/ice.OZJ', 'Skill/flareBlue.ozj'],
    },
    'Twisting Slash': {
        color: 0xcceeff,
        paths: ['Skill/motion_blur.OZJ', 'Skill/combo2.OZJ'],
    },
    'Dark Phoenix Shot': {
        color: 0xff8822,
        paths: ['Skill/phoenix.OZJ'],
    },
    'Cometfall': {
        color: 0xffcc66,
        paths: ['Skill/ffa1.OZJ', 'Skill/ffa2.OZJ'],
    },
    'Evil Spirit': {
        color: 0xbb66ff,
        paths: ['Skill/dark_skill01.OZJ', 'Skill/2line_gost.OZJ'],
    },
};

/** Cache compartilhado: path -> THREE.Texture | Promise<THREE.Texture|null> */
export const skillTextureCache = new Map();

let _remoteAssetsPromise = null;
async function _getRemoteAssets() {
    if (_remoteAssetsPromise) return _remoteAssetsPromise;
    _remoteAssetsPromise = import('../data/RemoteAssets.js')
        .then((m) => m.RemoteAssets || null)
        .catch(() => null); // não hardfail se o módulo não existir/carregar
    return _remoteAssetsPromise;
}

/**
 * Carrega UMA textura real de skill via RemoteAssets.fetchImageURL.
 * Resultado fica em skillTextureCache (THREE.Texture). Retorna null e mantém
 * fail-closed se RemoteAssets faltar ou o fetch falhar.
 */
export async function loadSkillTexture(relPath) {
    const hit = skillTextureCache.get(relPath);
    if (hit instanceof THREE.Texture) return hit;
    if (hit) return await hit; // Promise em andamento

    const p = (async () => {
        try {
            const ra = await _getRemoteAssets();
            if (!ra || !ra.baseUrl) return null;
            const url = await ra.fetchImageURL(relPath);
            if (!url) return null;
            const texture = await new Promise((resolve, reject) => {
                new THREE.TextureLoader().load(url, resolve, undefined, reject);
            });
            texture.colorSpace = THREE.SRGBColorSpace;
            skillTextureCache.set(relPath, texture);
            return texture;
        } catch {
            return null; // fail-closed: asset real indisponível
        }
    })();

    skillTextureCache.set(relPath, p);
    return await p;
}

/** Getter síncrono: textura já em cache ou null (sem disparar rede). */
export function getSkillTexture(relPath) {
    const v = skillTextureCache.get(relPath);
    return (v instanceof THREE.Texture) ? v : null;
}

/** Getter por nome comum de skill ('Fireball' → primeira textura em cache). */
export function getSkillTextureByName(name) {
    const def = SKILL_TEXTURE_MAP[name];
    if (!def) return null;
    for (const p of def.paths) {
        const t = getSkillTexture(p);
        if (t) return t;
    }
    return null;
}

/**
 * Pré-carrega todas as texturas de SKILL_TEXTURE_MAP (todas as skills).
 */
export async function preloadSkillTextures() {
    const uniquePaths = [];
    for (const def of Object.values(SKILL_TEXTURE_MAP)) {
        for (const p of def.paths) {
            if (!skillTextureCache.has(p)) uniquePaths.push(p);
        }
    }
    await Promise.all(uniquePaths.map((p) => loadSkillTexture(p)));
    return skillTextureCache;
}
