/**
 * Lifetime owner for real BITMAP_SPARK / BITMAP_SPARK+1 companion sprites.
 * Main 5.2 owns particles in its frame-updated effect pool, not browser timers.
 * The texture is shared and never disposed here; SpriteMaterials are private.
 * No texture/model fallback or invented particle subtype is provided.
 */
export class OwnedPetSparkPool {
    constructor(scene, lifetime = 0.5) {
        this.scene = scene;
        this.lifetime = lifetime;
        this.active = [];
        this.idle = [];
        this.disposed = false;
        this.created = 0;
    }

    spawn(makeSprite) {
        if (this.disposed || !this.scene) return null;
        let entry = this.idle.pop();
        if (!entry) {
            const sprite = makeSprite();
            if (!sprite?.material) return null;
            entry = { sprite, age: 0 };
            this.created++;
        }
        entry.age = 0;
        entry.sprite.material.opacity = 1;
        this.scene.add(entry.sprite);
        this.active.push(entry);
        return entry.sprite;
    }

    tick(dt) {
        if (this.disposed || !Number.isFinite(dt) || dt <= 0) return;
        const active = this.active;
        let write = 0;
        for (let i = 0; i < active.length; i++) {
            const entry = active[i];
            entry.age += dt;
            if (entry.age >= this.lifetime) {
                this.scene?.remove?.(entry.sprite);
                this.idle.push(entry);
            } else {
                entry.sprite.material.opacity = Math.max(0, 1 - entry.age / this.lifetime);
                active[write++] = entry;
            }
        }
        active.length = write;
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        for (const entry of this.active) {
            this.scene?.remove?.(entry.sprite);
            entry.sprite.material?.dispose?.();
        }
        for (const entry of this.idle) entry.sprite.material?.dispose?.();
        this.active.length = 0;
        this.idle.length = 0;
    }
}
