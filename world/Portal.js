import * as THREE from 'three';
import { getMapById } from './MapData.js';

/**
 * Portal.js - Gates cristalinos de viagem entre mapas
 * Anel torus + partículas; ao pisar no raio emite onTeleport(mapId)
 */

export class Portal {
    /**
     * @param {object} opts - { destinations: [{mapId, zenCost?}], x, z, color, radius, autoTeleport }
     */
    constructor(opts = {}) {
        this.destinations = opts.destinations || [];
        this.radius = opts.radius || 60;
        this.color = opts.color || 0x44aaff;
        this.onTeleport = opts.onTeleport || null;
        this.onPrompt = opts.onPrompt || null;

        this.group = new THREE.Group();
        this.group.position.set(opts.x || 0, 0, opts.z || 0);
        this._time = 0;
        this._playerInside = false;

        this._build();
        this.group.userData.portal = this;
    }

    _build() {
        // Anel torus principal
        const ringGeo = new THREE.TorusGeometry(45, 6, 12, 40);
        const ringMat = new THREE.MeshStandardMaterial({
            color: this.color,
            emissive: this.color,
            emissiveIntensity: 0.7,
            transparent: true,
            opacity: 0.9
        });
        this.ring = new THREE.Mesh(ringGeo, ringMat);
        this.ring.position.y = 55;
        this.group.add(this.ring);

        // Cristais flutuantes ao redor
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            const crystalGeo = new THREE.OctahedronGeometry(8);
            const crystalMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                emissive: this.color,
                emissiveIntensity: 0.8,
                transparent: true,
                opacity: 0.85
            });
            const crystal = new THREE.Mesh(crystalGeo, crystalMat);
            crystal.userData.baseAngle = angle;
            this.group.add(crystal);
        }
        this._crystals = this.group.children.slice(1);

        // Sistema de partículas subindo
        const count = 120;
        const posArray = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * this.radius;
            posArray[i * 3] = Math.cos(a) * r;
            posArray[i * 3 + 1] = Math.random() * 120;
            posArray[i * 3 + 2] = Math.sin(a) * r;
        }
        const pGeo = new THREE.BufferGeometry();
        pGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        const pMat = new THREE.PointsMaterial({
            color: this.color, size: 4, transparent: true, opacity: 0.7,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        this.particles = new THREE.Points(pGeo, pMat);
        this.group.add(this.particles);

        // Luz suave
        const light = new THREE.PointLight(this.color, 1.5, 300);
        light.position.y = 60;
        this.group.add(light);
    }

    /**
     * Destinos disponíveis para um nível (filtra levelReq e lista custos)
     */
    getAvailableDestinations(playerLevel) {
        return this.destinations
            .map(d => ({
                mapId: d.mapId,
                zenCost: d.zenCost || 0,
                map: getMapById(d.mapId)
            }))
            .filter(d => d.map);
    }

    /**
     * Verifica se o jogador está dentro do raio do portal.
     * Se sim, chama onPrompt (se houver múltiplos destinos) ou onTeleport automático.
     */
    checkPlayer(playerPos, playerLevel) {
        const dx = playerPos.x - this.group.position.x;
        const dz = playerPos.z - this.group.position.z;
        const inside = (dx * dx + dz * dz) < this.radius * this.radius;

        if (inside && !this._playerInside) {
            this._playerInside = true;
            const available = this.getAvailableDestinations(playerLevel)
                .filter(d => playerLevel >= d.map.levelReq);

            if (available.length === 0) {
                if (this.onPrompt) this.onPrompt({ portal: this, destinations: [], reason: 'level' });
            } else if (available.length === 1) {
                if (this.onTeleport) this.onTeleport(available[0].mapId, available[0]);
            } else {
                if (this.onPrompt) this.onPrompt({ portal: this, destinations: available });
            }
        } else if (!inside) {
            this._playerInside = false;
        }
    }

    /** teleport direto para um destino (usado por prompt de UI) */
    teleportTo(mapId) {
        const dest = this.destinations.find(d => d.mapId === mapId);
        if (dest && this.onTeleport) this.onTeleport(mapId, dest);
    }

    update(dt) {
        this._time += dt;
        this.ring.rotation.y += dt * 0.5;
        this.ring.position.y = 55 + Math.sin(this._time * 1.5) * 4;

        this._crystals.forEach((c) => {
            const a = c.userData.baseAngle + this._time * 0.6;
            c.position.set(Math.cos(a) * 55, 55 + Math.sin(this._time + a * 3) * 10, Math.sin(a) * 55);
            c.rotation.y += dt * 2;
        });

        const posAttr = this.particles.geometry.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            let y = posAttr.getY(i) + dt * 30;
            if (y > 130) y = 0;
            posAttr.setY(i, y);
        }
        posAttr.needsUpdate = true;
    }

    dispose() {
        this.group.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
    }
}
