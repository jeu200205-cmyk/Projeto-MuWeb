/**
 * Single-flight owner for an authentic shared pet/helper particle texture.
 * undefined = not attempted, null = verified missing/failed, Texture = loaded.
 * The owner does NOT dispose shared GPU textures; individual pet sprite
 * materials belong to OwnedPetSparkPool and are released per character.
 */
export class SharedPetSparkTexture {
    constructor(loadTexture) {
        if (typeof loadTexture !== 'function') throw new TypeError('loadTexture required');
        this.loadTexture = loadTexture;
        this.value = undefined;
        this.pending = null;
    }

    peek() { return this.value; }

    load() {
        if (this.value !== undefined) return Promise.resolve(this.value);
        if (this.pending) return this.pending;
        this.pending = Promise.resolve()
            .then(() => this.loadTexture())
            .then(value => {
                this.value = value ?? null;
                return this.value;
            }, () => {
                // No synthetic sprite/bitmap if the official asset is missing.
                this.value = null;
                return null;
            })
            .finally(() => { this.pending = null; });
        return this.pending;
    }
}
