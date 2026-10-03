import * as THREE from 'three';

/**
 * ClickToMove.js - movimento por clique do cliente MU.
 *
 * R79: o controller pode trabalhar sem listener próprio (`autoBind:false`).
 * O GameApp passa a ser o ÚNICO owner do mouse no mundo para decidir, na ordem:
 * item -> actor -> movimento (LMB) / skill selecionada (RMB). Isso elimina a
 * corrida antiga em que o mesmo clique primeiro criava targetPos e depois atacava.
 */
export const ClickToMove = {
    attach(scene, char, camera, opts = {}) {
        return new ClickToMoveController(scene, char, camera, opts);
    }
};

class ClickToMoveController {
    constructor(scene, char, camera, opts) {
        this.scene = scene;
        this.char = char;
        this.camera = camera;
        this.domElement = opts.domElement || window;
        this.terrain = opts.terrain || null;
        this.autoBind = opts.autoBind !== false;
        this.phantomDuration = opts.phantomDuration !== undefined ? opts.phantomDuration : 0;
        this.phantomColor = opts.phantomColor !== undefined ? opts.phantomColor : 0x00ff00;

        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();

        this._phantom = null;
        this._phantomTime = 0;
        this._wasTargetActive = false;

        this._onMouseDown = (e) => this._handleClick(e);
        if (this.autoBind) this.domElement.addEventListener('mousedown', this._onMouseDown);
    }

    _getTerrainTargets() {
        if (this.terrain) return [this.terrain];
        const candidates = [];
        this.scene.traverse(o => {
            if (o.isMesh && o.geometry &&
                (o.geometry.type === 'PlaneGeometry' || o.name === 'terrain')) {
                candidates.push(o);
            }
        });
        return candidates;
    }

    _setPointer(clientX, clientY) {
        const rect = (this.domElement && this.domElement.getBoundingClientRect)
            ? this.domElement.getBoundingClientRect()
            : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        const width = Math.max(1, rect.width || window.innerWidth || 1);
        const height = Math.max(1, rect.height || window.innerHeight || 1);
        this.pointer.x = ((clientX - rect.left) / width) * 2 - 1;
        this.pointer.y = -((clientY - rect.top) / height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, this.camera);
    }

    /** Raycast do ponteiro sem alterar estado do personagem. */
    pointFromPointer(clientX, clientY) {
        this._setPointer(clientX, clientY);
        const targets = this._getTerrainTargets();
        if (targets.length > 0) {
            const hits = this.raycaster.intersectObjects(targets, false);
            if (hits.length > 0) return hits[0].point.clone();
        }
        // Apenas fallback geométrico do plano do mundo, sem VFX/marker fake.
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const p = new THREE.Vector3();
        return this.raycaster.ray.intersectPlane(plane, p) ? p : null;
    }

    /** Aplica somente movimento. O GameApp decide antes se item/actor consumiu o clique. */
    moveFromPointer(clientX, clientY) {
        const point = this.pointFromPointer(clientX, clientY);
        if (!point) return false;
        this.char.targetPos = point.clone();
        this._wasTargetActive = true;
        if (this.phantomDuration > 0) this._spawnPhantom(point);
        return true;
    }

    _handleClick(e) {
        if (e.button !== 0) return;
        this.moveFromPointer(e.clientX, e.clientY);
    }

    _spawnPhantom(point) {
        this._clearPhantom();
        // Legacy debug-only marker. Production GameApp uses phantomDuration=0
        // until the exact PC click-position effect owner is ported.
        const geo = new THREE.RingGeometry(1.2, 2.0, 24);
        const mat = new THREE.MeshBasicMaterial({
            color: this.phantomColor,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const ring = new THREE.Mesh(geo, mat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(point);
        ring.position.y += 0.3;
        this.scene.add(ring);
        this._phantom = ring;
        this._phantomTime = this.phantomDuration;
    }

    _clearPhantom() {
        if (this._phantom) {
            this.scene.remove(this._phantom);
            this._phantom.geometry.dispose();
            this._phantom.material.dispose();
            this._phantom = null;
        }
        this._phantomTime = 0;
    }

    update(dt) {
        if (this._wasTargetActive && !this.char.targetPos) {
            this._clearPhantom();
            this._wasTargetActive = false;
        }
        if (this._phantom) {
            this._phantomTime -= dt;
            const m = this._phantom.material;
            m.opacity = (Math.sin(this._phantomTime * 18) * 0.5 + 0.5) * 0.8 + 0.1;
            if (this._phantomTime <= 0) this._clearPhantom();
        }
    }

    detach() {
        if (this.autoBind) this.domElement.removeEventListener('mousedown', this._onMouseDown);
        this._clearPhantom();
    }
}

export default ClickToMove;
