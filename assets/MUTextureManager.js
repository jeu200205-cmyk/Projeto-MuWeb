/**
 * MUTextureManager.js — Texture Manager for MU Online Client Textures
 *
 * Handles:
 *  - .ozj (JPEG embedded with 24-byte header, optional XOR3 encryption)
 *  - .ozt (TGA format with 18-byte header, optional XOR3 encryption)
 *  - Texture atlasing for UI elements
 *  - Mipmap generation
 *  - LRU cache with size limits
 *  - Preloading & streaming
 *  - Three.js Texture integration
 *  - WebGL 2 / WebGPU ready (compressed formats support)
 */

import * as THREE from 'three';
import { RemoteAssets } from '../data/RemoteAssets.js';

// ============================================================
// Configuration
// ============================================================

const MAX_CACHE_SIZE = 200 * 1024 * 1024; // 200MB max texture memory
const MAX_TEXTURE_SIZE = 2048; // Max dimension
const DEFAULT_FILTER = THREE.LinearMipmapLinearFilter;
const DEFAULT_WRAP = THREE.RepeatWrapping;

// MU Special texture indices (from ZzzBMD.h / ZzzTexture.h)
export const MUTextureIndex = {
    // Special
    UNKNOWN:        0xFFFFFFFF,
    HIDE:           0xFFFFFFFE,
    SKIN:           0xFFFFFFFD,
    WATER:          0xFFFFFFFC,
    HAIR:           0xFFFFFFFB,
    CHROME:         0xFFFFFFFA,
    CHROME2:        0xFFFFFFF9,
    SHINY:          0xFFFFFFF8,
    
    // Player textures start
    PLAYER_BEGIN:   10000,
    PLAYER_END:     19999,
    
    // Monster textures
    MONSTER_BEGIN:  20000,
    MONSTER_END:    29999,
    
    // Item textures
    ITEM_BEGIN:     30000,
    ITEM_END:       39999,
    
    // Effect textures
    EFFECT_BEGIN:   40000,
    EFFECT_END:     49999,
    
    // Interface textures
    INTERFACE_BEGIN: 50000,
    INTERFACE_END:   59999,
    
    // Map/Terrain textures
    MAPTILE_BEGIN:   60000,
    MAPTILE_END:     69999,
    MAPGRASS_BEGIN:  70000,
    MAPGRASS_END:    79999,
    WATER_BEGIN:     80000,
    WATER_END:       89999,
    
    // Cursor
    CURSOR_BEGIN:    90000,
    CURSOR_END:      90999,
    
    // Font
    FONT_BEGIN:      91000,
    FONT_END:        91999,
    
    // Dynamic/Nonamed
    NONAMED_BEGIN:   100000,
    NONAMED_END:     200000,
};

// ============================================================
// Texture Descriptor
// ============================================================

export class MUTexture {
    constructor(options = {}) {
        this.index = options.index || MUTextureIndex.UNKNOWN;
        this.name = options.name || '';
        this.path = options.path || '';
        this.width = options.width || 0;
        this.height = options.height || 0;
        this.format = options.format || 'rgba'; // 'rgba', 'jpeg', 'compressed'
        this.pixels = options.pixels || null; // Uint8ClampedArray for RGBA
        this.jpegData = options.jpegData || null; // Uint8Array for JPEG
        this.mipmaps = options.mipmaps || [];
        this.threeTexture = null;
        this.isLoaded = false;
        this.isLoading = false;
        this.lastUsed = Date.now();
        this.useCount = 0;
        this.memorySize = options.memorySize || 0;
        
        // MU-specific
        this.components = options.components || 4; // 3=RGB, 4=RGBA
        this.wrapS = options.wrapS || DEFAULT_WRAP;
        this.wrapT = options.wrapT || DEFAULT_WRAP;
        this.minFilter = options.minFilter || DEFAULT_FILTER;
        this.magFilter = options.magFilter || THREE.LinearFilter;
        this.generateMipmaps = options.generateMipmaps !== false;
        this.anisotropy = options.anisotropy || 4;
        this.colorSpace = options.colorSpace || THREE.SRGBColorSpace;
    }

    createThreeTexture(renderer = null) {
        if (this.threeTexture) return this.threeTexture;
        
        let tex = new THREE.Texture();
        
        if (this.format === 'jpeg' && this.jpegData) {
            // JPEG assíncrono: manter A MESMA instância retornada pelo loader.
            // A implementação antiga devolvia um Texture vazio e depois trocava
            // `this.threeTexture` por outro objeto no callback; materiais que já
            // seguravam a instância vazia ficavam permanentemente sem imagem.
            const blob = new Blob([this.jpegData], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            const loader = new THREE.TextureLoader();
            tex = loader.load(url,
                (loadedTex) => {
                    // TextureLoader já sinaliza upload quando a imagem existe.
                    // Não forçar needsUpdate: em r160 isso só é correto após
                    // image/data válidos e já é tratado pelo loader.
                    this._applyTextureSettings(loadedTex);
                    this.isLoaded = true;
                    URL.revokeObjectURL(url);
                },
                undefined,
                (err) => {
                    URL.revokeObjectURL(url);
                    console.error(`[MUTexture] JPEG decode falhou: ${this.path || this.name}`, err);
                });
            this._applyTextureSettings(tex);
            this.threeTexture = tex;
            return tex;
        } else if (this.format === 'rgba' && this.pixels) {
            // Raw RGBA - create from canvas
            const canvas = document.createElement('canvas');
            canvas.width = this.width;
            canvas.height = this.height;
            const ctx = canvas.getContext('2d');
            const imgData = ctx.createImageData(this.width, this.height);
            imgData.data.set(this.pixels);
            ctx.putImageData(imgData, 0, 0);
            
            tex.image = canvas;
            this._applyTextureSettings(tex);
            tex.needsUpdate = true;
        } else if (this.format === 'compressed' && this.mipmaps.length > 0) {
            // Compressed texture (WebGL 2)
            tex.mipmaps = this.mipmaps;
            tex.image = { width: this.width, height: this.height };
            this._applyTextureSettings(tex);
        } else {
            // Fail-closed: não devolver THREE.Texture vazia. Uma textura sem
            // image/data era aceita pelos materiais e gerava warning por frame.
            throw new Error(`MUTexture sem image/data: ${this.path || this.name || this.format}`);
        }
        
        this.threeTexture = tex;
        return tex;
    }

    _applyTextureSettings(tex) {
        tex.wrapS = this.wrapS;
        tex.wrapT = this.wrapT;
        tex.minFilter = this.minFilter;
        tex.magFilter = this.magFilter;
        tex.generateMipmaps = this.generateMipmaps;
        tex.anisotropy = this.anisotropy;
        tex.colorSpace = this.colorSpace;
        tex.flipY = false; // MU textures are already correct orientation
        tex.premultiplyAlpha = false;
        tex.unpackAlignment = 1;
    }

    dispose() {
        if (this.threeTexture) {
            this.threeTexture.dispose();
            this.threeTexture = null;
        }
        this.pixels = null;
        this.jpegData = null;
        this.mipmaps = [];
        this.isLoaded = false;
    }

    getMemorySize() {
        if (this.memorySize) return this.memorySize;
        // Estimate: width * height * components (no mipmaps counted)
        return this.width * this.height * this.components;
    }
}

// ============================================================
// LRU Cache
// ============================================================

class LRUCache {
    constructor(maxSize = MAX_CACHE_SIZE) {
        this.maxSize = maxSize;
        this.currentSize = 0;
        this.map = new Map(); // key -> { texture, prev, next }
        this.head = null; // Most recently used
        this.tail = null; // Least recently used
    }

    get(key) {
        const entry = this.map.get(key);
        if (!entry) return null;
        
        this._moveToHead(entry);
        entry.texture.lastUsed = Date.now();
        entry.texture.useCount++;
        return entry.texture;
    }

    set(key, texture) {
        // Remove existing if present
        if (this.map.has(key)) {
            this.delete(key);
        }
        
        const size = texture.getMemorySize();
        
        // Evict if needed
        while (this.currentSize + size > this.maxSize && this.tail) {
            this._evictTail();
        }
        
        const entry = { texture, prev: null, next: this.head };
        this.map.set(key, entry);
        
        if (this.head) this.head.prev = entry;
        this.head = entry;
        if (!this.tail) this.tail = entry;
        
        this.currentSize += size;
    }

    delete(key) {
        const entry = this.map.get(key);
        if (!entry) return false;
        
        if (entry.prev) entry.prev.next = entry.next;
        if (entry.next) entry.next.prev = entry.prev;
        if (this.head === entry) this.head = entry.next;
        if (this.tail === entry) this.tail = entry.prev;
        
        this.currentSize -= entry.texture.getMemorySize();
        entry.texture.dispose();
        this.map.delete(key);
        return true;
    }

    clear() {
        for (const entry of this.map.values()) {
            entry.texture.dispose();
        }
        this.map.clear();
        this.head = null;
        this.tail = null;
        this.currentSize = 0;
    }

    has(key) {
        return this.map.has(key);
    }

    getStats() {
        return {
            count: this.map.size,
            currentSize: this.currentSize,
            maxSize: this.maxSize,
            usagePercent: (this.currentSize / this.maxSize * 100).toFixed(1) + '%'
        };
    }

    _moveToHead(entry) {
        if (entry === this.head) return;
        
        if (entry.prev) entry.prev.next = entry.next;
        if (entry.next) entry.next.prev = entry.prev;
        if (this.tail === entry) this.tail = entry.prev;
        
        entry.prev = null;
        entry.next = this.head;
        this.head.prev = entry;
        this.head = entry;
    }

    _evictTail() {
        if (!this.tail) return;
        const key = this._findKey(this.tail);
        this.delete(key);
    }

    _findKey(entry) {
        for (const [key, val] of this.map) {
            if (val === entry) return key;
        }
        return null;
    }
}

// ============================================================
// Texture Atlas for UI
// ============================================================

export class TextureAtlas {
    constructor(maxWidth = 2048, maxHeight = 2048, padding = 2) {
        this.maxWidth = maxWidth;
        this.maxHeight = maxHeight;
        this.padding = padding;
        this.nodes = [{ x: 0, y: 0, w: maxWidth, h: maxHeight }]; // Free rectangles
        this.textures = new Map(); // name -> { x, y, w, h, texture }
        this.canvas = document.createElement('canvas');
        this.canvas.width = maxWidth;
        this.canvas.height = maxHeight;
        this.ctx = this.canvas.getContext('2d');
        this.threeTexture = null;
        this.dirty = true;
    }

    add(name, texture) {
        const w = texture.width + this.padding * 2;
        const h = texture.height + this.padding * 2;
        
        // Find best fit (simple shelf packing)
        let bestNode = null;
        let bestScore = Infinity;
        
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            if (node.w >= w && node.h >= h) {
                const score = Math.max(node.w - w, node.h - h);
                if (score < bestScore) {
                    bestScore = score;
                    bestNode = { node, index: i };
                }
            }
        }
        
        if (!bestNode) return false; // No space
        
        const { node, index } = bestNode;
        const x = node.x + this.padding;
        const y = node.y + this.padding;
        
        // Draw to canvas
        if (texture.threeTexture?.image) {
            this.ctx.drawImage(texture.threeTexture.image, x, y, texture.width, texture.height);
        } else if (texture.pixels) {
            const imgData = this.ctx.createImageData(texture.width, texture.height);
            imgData.data.set(texture.pixels);
            this.ctx.putImageData(imgData, x, y);
        }
        
        // Split node
        this.nodes.splice(index, 1);
        
        // Right remainder
        if (node.w - w > 0) {
            this.nodes.push({ x: node.x + w, y: node.y, w: node.w - w, h: h });
        }
        // Bottom remainder
        if (node.h - h > 0) {
            this.nodes.push({ x: node.x, y: node.y + h, w: node.w, h: node.h - h });
        }
        
        this.textures.set(name, { x, y, w: texture.width, h: texture.height, texture });
        this.dirty = true;
        return true;
    }

    getUV(name) {
        const entry = this.textures.get(name);
        if (!entry) return null;
        return {
            u1: entry.x / this.maxWidth,
            v1: entry.y / this.maxHeight,
            u2: (entry.x + entry.w) / this.maxWidth,
            v2: (entry.y + entry.h) / this.maxHeight,
            width: entry.w,
            height: entry.h
        };
    }

    getThreeTexture() {
        if (!this.threeTexture || this.dirty) {
            if (!this.threeTexture) {
                this.threeTexture = new THREE.CanvasTexture(this.canvas);
            }
            this.threeTexture.needsUpdate = true;
            this.dirty = false;
        }
        return this.threeTexture;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.maxWidth, this.maxHeight);
        this.nodes = [{ x: 0, y: 0, w: this.maxWidth, h: this.maxHeight }];
        this.textures.clear();
        this.dirty = true;
    }
}

// ============================================================
// Main Texture Manager
// ============================================================

export class MUTextureManager {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || (typeof window !== 'undefined' && window.__MU_ASSET_BASE__) || 'http://localhost:9100/';
        this.remoteAssets = new RemoteAssets();
        this.remoteAssets.configure(this.baseUrl);
        
        // Caches
        this.lruCache = new LRUCache(options.maxCacheSize || MAX_CACHE_SIZE);
        this.indexMap = new Map(); // textureIndex -> MUTexture
        this.pathMap = new Map(); // path -> textureIndex
        
        // Atlases
        this.uiAtlas = new TextureAtlas();
        this.iconAtlas = new TextureAtlas(1024, 1024);
        this.effectAtlas = new TextureAtlas(1024, 1024);
        
        // Loading queue
        this.loadingQueue = [];
        this.isProcessingQueue = false;
        this.concurrentLoads = options.concurrentLoads || 4;
        
        // Special textures (pre-created)
        this._createSpecialTextures();
    }

    _createSpecialTextures() {
        // CHROME - environment map style
        const chromeTex = this._createChromeTexture();
        this._registerSpecial(MUTextureIndex.CHROME, chromeTex);
        
        const chrome2Tex = this._createChrome2Texture();
        this._registerSpecial(MUTextureIndex.CHROME2, chrome2Tex);
        
        // SHINY - metal
        const shinyTex = this._createShinyTexture();
        this._registerSpecial(MUTextureIndex.SHINY, shinyTex);
        
        // WATER - animated
        // Created on demand
    }

    _registerSpecial(index, texture) {
        this.indexMap.set(index, texture);
        this.lruCache.set(`special_${index}`, texture);
    }

    _createChromeTexture() {
        // Procedural chrome texture
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // Create sphere map for chrome
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const nx = (x / size) * 2 - 1;
                const ny = (y / size) * 2 - 1;
                const r2 = nx * nx + ny * ny;
                if (r2 > 1) {
                    ctx.fillStyle = '#000';
                } else {
                    const nz = Math.sqrt(1 - r2);
                    const h = Math.atan2(ny, nx) / (2 * Math.PI) + 0.5;
                    const s = nz * 0.5 + 0.5;
                    ctx.fillStyle = `hsl(${h * 360}, ${s * 100}%, 50%)`;
                }
                ctx.fillRect(x, y, 1, 1);
            }
        }
        
        const tex = new MUTexture({
            index: MUTextureIndex.CHROME,
            name: 'chrome',
            width: size,
            height: size,
            format: 'rgba',
        });
        tex.threeTexture = new THREE.CanvasTexture(canvas);
        tex.threeTexture.wrapS = tex.threeTexture.wrapT = THREE.ClampToEdgeWrapping;
        tex.threeTexture.minFilter = THREE.LinearMipmapLinearFilter;
        tex.threeTexture.generateMipmaps = true;
        tex.isLoaded = true;
        return tex;
    }

    _createChrome2Texture() {
        // Different chrome variant
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.5, '#88aacc');
        gradient.addColorStop(1, '#002244');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        
        const tex = new MUTexture({
            index: MUTextureIndex.CHROME2,
            name: 'chrome2',
            width: size,
            height: size,
            format: 'rgba',
        });
        tex.threeTexture = new THREE.CanvasTexture(canvas);
        tex.threeTexture.wrapS = tex.threeTexture.wrapT = THREE.ClampToEdgeWrapping;
        tex.isLoaded = true;
        return tex;
    }

    _createShinyTexture() {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // Metallic noise
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const noise = Math.random() * 0.3 + 0.7;
                ctx.fillStyle = `rgb(${noise*255},${noise*255},${noise*255})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        
        const tex = new MUTexture({
            index: MUTextureIndex.SHINY,
            name: 'shiny',
            width: size,
            height: size,
            format: 'rgba',
        });
        tex.threeTexture = new THREE.CanvasTexture(canvas);
        tex.threeTexture.wrapS = tex.threeTexture.wrapT = THREE.RepeatWrapping;
        tex.isLoaded = true;
        return tex;
    }

    // ---------- Public API ----------

    /**
     * Get or load texture by MU index
     * @param {number} index - MU texture index
     * @returns {Promise<MUTexture>}
     */
    async getTexture(index) {
        // Check special
        if (this.indexMap.has(index)) {
            return this.indexMap.get(index);
        }
        
        // Check cache
        const cached = this.lruCache.get(index);
        if (cached) return cached;
        
        // Need to load - find path from manifest or guess
        const path = this._indexToPath(index);
        if (path) {
            return this.loadTexture(path, index);
        }
        
        console.warn(`[MUTextureManager] Unknown texture index: ${index}`);
        return this.indexMap.get(MUTextureIndex.UNKNOWN);
    }

    /**
     * Load texture by path
     * @param {string} relPath - Relative path from Data/ (e.g., 'Interface/back1.OZJ')
     * @param {number} [index] - Optional MU texture index to assign
     * @returns {Promise<MUTexture>}
     */
    async loadTexture(relPath, index = null) {
        // Check path cache
        if (this.pathMap.has(relPath)) {
            return this.getTexture(this.pathMap.get(relPath));
        }
        
        // Assign index if not provided
        if (index === null) {
            index = this._generateIndex(relPath);
        }
        
        // Check if already loading
        if (this._loadingPaths.has(relPath)) {
            return new Promise((resolve) => {
                this._loadingPaths.get(relPath).push(resolve);
            });
        }
        
        this._loadingPaths.set(relPath, []);
        
        try {
            const texture = await this._fetchAndParseTexture(relPath, index);
            
            // Register
            this.pathMap.set(relPath, index);
            this.indexMap.set(index, texture);
            this.lruCache.set(index, texture);
            
            // Resolve waiters
            const waiters = this._loadingPaths.get(relPath) || [];
            waiters.forEach(r => r(texture));
            this._loadingPaths.delete(relPath);
            
            return texture;
        } catch (e) {
            const waiters = this._loadingPaths.get(relPath) || [];
            waiters.forEach(r => r(null));
            this._loadingPaths.delete(relPath);
            throw e;
        }
    }

    /**
     * Load texture and return Three.js Texture directly
     * @param {string} relPath 
     * @returns {Promise<THREE.Texture>}
     */
    async loadThreeTexture(relPath) {
        const muTex = await this.loadTexture(relPath);
        return muTex.createThreeTexture();
    }

    /**
     * Preload multiple textures
     * @param {string[]} paths 
     * @param {Function} onProgress 
     */
    async preload(paths, onProgress) {
        const results = [];
        for (let i = 0; i < paths.length; i++) {
            try {
                await this.loadTexture(paths[i]);
                results.push({ path: paths[i], success: true });
            } catch (e) {
                results.push({ path: paths[i], success: false, error: e.message });
            }
            if (onProgress) onProgress(i + 1, paths.length, paths[i]);
        }
        return results;
    }

    /**
     * Add texture to UI atlas
     * @param {string} name - Unique name
     * @param {string} relPath - Path to texture
     * @returns {Promise<Object>} UV coordinates
     */
    async addToUIAtlas(name, relPath) {
        const texture = await this.loadTexture(relPath);
        const success = this.uiAtlas.add(name, texture);
        if (!success) {
            // Atlas full, create new one or expand
            console.warn('[MUTextureManager] UI Atlas full, creating new');
            this.uiAtlas = new TextureAtlas();
            this.uiAtlas.add(name, texture);
        }
        return this.uiAtlas.getUV(name);
    }

    /**
     * Get UI atlas texture
     * @returns {THREE.Texture}
     */
    getUIAtlasTexture() {
        return this.uiAtlas.getThreeTexture();
    }

    // ---------- Internal Parsing ----------

    _loadingPaths = new Map();

    async _fetchAndParseTexture(relPath, index) {
        const buf = await this.remoteAssets.fetchBinary(relPath);
        if (!buf) throw new Error(`Failed to fetch: ${relPath}`);
        
        const ext = relPath.split('.').pop().toLowerCase();
        
        if (ext === 'ozj' || ext === 'jpg') {
            return this._parseOZJ(buf, relPath, index);
        } else if (ext === 'ozt' || ext === 'tga') {
            return this._parseOZT(buf, relPath, index);
        } else {
            throw new Error(`Unsupported texture format: ${ext}`);
        }
    }

    _parseOZJ(buf, path, index) {
        const u8 = new Uint8Array(buf);
        
        // Check for protection header (8 bytes) + XOR3
        if (u8.length > 24 && u8[0] === 0x68 && u8[1] === 0xA2 && u8[2] === 0xD2 && u8[3] === 0x20 &&
            u8[4] === 0xA4 && u8[5] === 0x43 && u8[6] === 0x41 && u8[7] === 0xDE) {
            // Decrypt XOR3 after 8-byte header
            const data = this._xor3Decrypt(u8, 8);
            // Skip 24-byte OZJ header
            const jpegData = data.slice(24);
            return new MUTexture({
                index, name: path, path,
                width: 0, height: 0, // Will be determined by JPEG decoder
                format: 'jpeg',
                jpegData,
                components: 3,
            });
        }
        
        // Plain JPEG with 24-byte header
        if (u8.length > 24) {
            const jpegData = u8.slice(24);
            return new MUTexture({
                index, name: path, path,
                width: 0, height: 0,
                format: 'jpeg',
                jpegData,
                components: 3,
            });
        }
        
        throw new Error('Invalid OZJ file');
    }

    _parseOZT(buf, path, index) {
        const u8 = new Uint8Array(buf);
        let data = u8;
        
        // Check for MuPromax encryption (3 junk bytes + XOR3)
        if (u8.length === 3 + 256 * 256 * 4) {
            data = this._xor3Decrypt(u8, 3);
        } else if (u8.length > 18) {
            // Try full decrypt
            const dec = this._xor3Decrypt(u8, 0);
            if (dec[2] === 2 || dec[2] === 10) { // TGA image type
                data = dec;
            }
        }
        
        // Parse TGA header
        if (data.length < 18) throw new Error('Invalid TGA: too small');
        
        const idLength = data[0];
        const colorMapType = data[1];
        const imageType = data[2];
        
        if (colorMapType !== 0) throw new Error('Colormap TGA not supported');
        if (imageType !== 2 && imageType !== 10) throw new Error(`Unsupported TGA type: ${imageType}`);
        
        const width = data[12] | (data[13] << 8);
        const height = data[14] | (data[15] << 8);
        const bpp = data[16] >> 3; // bytes per pixel
        
        if (bpp !== 3 && bpp !== 4) throw new Error(`Unsupported TGA bpp: ${bpp * 8}`);
        if (width > MAX_TEXTURE_SIZE || height > MAX_TEXTURE_SIZE) {
            throw new Error(`Texture too large: ${width}x${height}`);
        }
        
        const descriptor = data[17];
        const topOrigin = (descriptor & 0x20) !== 0;
        
        let offset = 18 + idLength;
        const pixels = new Uint8ClampedArray(width * height * 4);
        
        if (imageType === 2) {
            // Uncompressed
            for (let i = 0; i < width * height; i++) {
                const b = data[offset], g = data[offset + 1], r = data[offset + 2];
                const a = bpp === 4 ? data[offset + 3] : 255;
                offset += bpp;
                pixels[i * 4] = r;
                pixels[i * 4 + 1] = g;
                pixels[i * 4 + 2] = b;
                pixels[i * 4 + 3] = a;
            }
        } else {
            // RLE compressed
            let i = 0;
            while (i < width * height) {
                const header = data[offset++];
                const count = (header & 0x7F) + 1;
                if (header & 0x80) {
                    // Run-length packet
                    const b = data[offset], g = data[offset + 1], r = data[offset + 2];
                    const a = bpp === 4 ? data[offset + 3] : 255;
                    offset += bpp;
                    for (let j = 0; j < count && i < width * height; j++, i++) {
                        pixels[i * 4] = r;
                        pixels[i * 4 + 1] = g;
                        pixels[i * 4 + 2] = b;
                        pixels[i * 4 + 3] = a;
                    }
                } else {
                    // Raw packet
                    for (let j = 0; j < count && i < width * height; j++, i++) {
                        const b = data[offset], g = data[offset + 1], r = data[offset + 2];
                        const a = bpp === 4 ? data[offset + 3] : 255;
                        offset += bpp;
                        pixels[i * 4] = r;
                        pixels[i * 4 + 1] = g;
                        pixels[i * 4 + 2] = b;
                        pixels[i * 4 + 3] = a;
                    }
                }
            }
        }
        
        // Flip vertically if bottom-origin (standard TGA)
        if (!topOrigin) {
            const rowBytes = width * 4;
            for (let y = 0; y < height / 2; y++) {
                const src1 = y * rowBytes;
                const src2 = (height - 1 - y) * rowBytes;
                for (let x = 0; x < rowBytes; x++) {
                    const tmp = pixels[src1 + x];
                    pixels[src1 + x] = pixels[src2 + x];
                    pixels[src2 + x] = tmp;
                }
            }
        }
        
        const memorySize = width * height * 4;
        
        return new MUTexture({
            index, name: path, path,
            width, height,
            format: 'rgba',
            pixels,
            components: 4,
            memorySize,
        });
    }

    _xor3Decrypt(bytes, offset = 0) {
        const XOR3_KEY = new Uint8Array([0xFC, 0xCF, 0xAB]);
        const len = bytes.length - offset;
        const out = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            out[i] = bytes[offset + i] ^ XOR3_KEY[i % 3];
        }
        return out;
    }

    // ---------- Index/Path Mapping ----------

    _indexToPath(index) {
        // Reverse lookup from pathMap
        for (const [path, idx] of this.pathMap) {
            if (idx === index) return path;
        }
        
        // Try to guess from index ranges
        if (index >= MUTextureIndex.PLAYER_BEGIN && index <= MUTextureIndex.PLAYER_END) {
            return `Player/Texture${index - MUTextureIndex.PLAYER_BEGIN}.ozj`;
        }
        if (index >= MUTextureIndex.MONSTER_BEGIN && index <= MUTextureIndex.MONSTER_END) {
            return `Monster/Texture${index - MUTextureIndex.MONSTER_BEGIN}.ozj`;
        }
        if (index >= MUTextureIndex.ITEM_BEGIN && index <= MUTextureIndex.ITEM_END) {
            return `Item/Texture${index - MUTextureIndex.ITEM_BEGIN}.ozj`;
        }
        if (index >= MUTextureIndex.INTERFACE_BEGIN && index <= MUTextureIndex.INTERFACE_END) {
            return `Interface/Texture${index - MUTextureIndex.INTERFACE_BEGIN}.ozj`;
        }
        if (index >= MUTextureIndex.MAPTILE_BEGIN && index <= MUTextureIndex.MAPTILE_END) {
            return `Map/Tile${index - MUTextureIndex.MAPTILE_BEGIN}.ozj`;
        }
        if (index >= MUTextureIndex.FONT_BEGIN && index <= MUTextureIndex.FONT_END) {
            return `Interface/Font.ozj`;
        }
        if (index >= MUTextureIndex.CURSOR_BEGIN && index <= MUTextureIndex.CURSOR_END) {
            return `Interface/Cursor${index - MUTextureIndex.CURSOR_BEGIN}.ozt`;
        }
        
        return null;
    }

    _generateIndex(relPath) {
        // Generate deterministic index from path
        let hash = 0;
        for (let i = 0; i < relPath.length; i++) {
            hash = ((hash << 5) - hash) + relPath.charCodeAt(i);
            hash |= 0;
        }
        return MUTextureIndex.NONAMED_BEGIN + (Math.abs(hash) % (MUTextureIndex.NONAMED_END - MUTextureIndex.NONAMED_BEGIN));
    }

    // ---------- Water Animation ----------

    async getWaterTexture(frame = 0) {
        const index = MUTextureIndex.WATER + frame;
        if (this.indexMap.has(index)) return this.indexMap.get(index);
        
        const path = `Water/Water${String(frame).padStart(2, '0')}.ozj`;
        try {
            const tex = await this.loadTexture(path, index);
            return tex;
        } catch {
            // Return procedural water
            return this._createProceduralWater(frame);
        }
    }

    _createProceduralWater(frame) {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // Animated water
        const t = frame * 0.1;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const n = Math.sin(x * 0.05 + t) * Math.cos(y * 0.05 + t * 0.7);
                const c = Math.floor(128 + n * 60);
                ctx.fillStyle = `rgb(0, ${Math.min(255, c + 40)}, ${Math.min(255, c + 80)})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        
        const tex = new MUTexture({
            index, name: `water_${frame}`, path: '',
            width: size, height: size, format: 'rgba',
        });
        tex.threeTexture = new THREE.CanvasTexture(canvas);
        tex.threeTexture.wrapS = tex.threeTexture.wrapT = THREE.RepeatWrapping;
        tex.isLoaded = true;
        this.indexMap.set(index, tex);
        return tex;
    }

    // ---------- Cache Management ----------

    evict(index) {
        this.lruCache.delete(index);
        this.indexMap.delete(index);
        // Find and remove from pathMap
        for (const [path, idx] of this.pathMap) {
            if (idx === index) {
                this.pathMap.delete(path);
                break;
            }
        }
    }

    clear() {
        this.lruCache.clear();
        this.indexMap.clear();
        this.pathMap.clear();
        this.uiAtlas.clear();
        this.iconAtlas.clear();
        this.effectAtlas.clear();
        this._createSpecialTextures();
    }

    getCacheStats() {
        return {
            ...this.lruCache.getStats(),
            indexedTextures: this.indexMap.size,
            uiAtlasItems: this.uiAtlas.textures.size,
            iconAtlasItems: this.iconAtlas.textures.size,
            effectAtlasItems: this.effectAtlas.textures.size,
        };
    }

    // ---------- Font Texture Support ----------

    async loadFontTexture() {
        const index = MUTextureIndex.FONT_BEGIN;
        if (this.indexMap.has(index)) return this.indexMap.get(index);
        
        try {
            const tex = await this.loadTexture('Interface/Font.ozt', index);
            return tex;
        } catch {
            // Create procedural font atlas
            return this._createProceduralFont();
        }
    }

    _createProceduralFont() {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, size, size);
        ctx.font = '16px "Malgun Gothic", "Microsoft YaHei", sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'top';
        
        // Draw ASCII 32-126 + Korean syllables (common)
        const charsPerRow = 32;
        const charW = size / charsPerRow;
        const charH = 20;
        
        for (let i = 32; i < 127; i++) {
            const col = (i - 32) % charsPerRow;
            const row = Math.floor((i - 32) / charsPerRow);
            ctx.fillText(String.fromCharCode(i), col * charW, row * charH);
        }
        
        const tex = new MUTexture({
            index: MUTextureIndex.FONT_BEGIN,
            name: 'font_procedural', path: '',
            width: size, height: size, format: 'rgba',
        });
        tex.threeTexture = new THREE.CanvasTexture(canvas);
        tex.threeTexture.minFilter = THREE.LinearFilter;
        tex.threeTexture.magFilter = THREE.LinearFilter;
        tex.isLoaded = true;
        this.indexMap.set(MUTextureIndex.FONT_BEGIN, tex);
        return tex;
    }

    // ---------- Cursor Textures ----------

    async loadCursor(name) {
        const cursorMap = {
            'default': 'Interface/Cursor.ozt',
            'attack': 'Interface/CursorAttack.ozt',
            'attack2': 'Interface/CursorAttack2.OZT',
            'dontmove': 'Interface/CursorDontMove.OZT',
            'eye': 'Interface/CursorEye.ozt',
            'get': 'Interface/CursorGet.ozt',
            'id': 'Interface/Cursorid.OZT',
            'lean': 'Interface/CursorLeanAgainst.ozt',
            'push': 'Interface/CursorPush.ozt',
            'repair': 'Interface/CursorRepair.OZT',
            'sit': 'Interface/CursorSitDown.ozt',
            'talk': 'Interface/CursorTalk.ozt',
        };
        
        const path = cursorMap[name] || cursorMap['default'];
        const index = MUTextureIndex.CURSOR_BEGIN + Object.keys(cursorMap).indexOf(name);
        
        try {
            return await this.loadTexture(path, index);
        } catch (e) {
            console.warn(`[MUTextureManager] cursor PC ausente ${path} (fail-closed):`, e?.message || e);
            return null;
        }
    }

    _createProceduralCursor(name) {
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0000';
        ctx.fillRect(0, 0, size, size);
        
        // Simple arrow
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(4, 4);
        ctx.lineTo(16, 16);
        ctx.lineTo(4, 20);
        ctx.stroke();
        
        const tex = new MUTexture({
            index: MUTextureIndex.CURSOR_BEGIN,
            name: `cursor_${name}`, path: '',
            width: size, height: size, format: 'rgba',
        });
        tex.threeTexture = new THREE.CanvasTexture(canvas);
        tex.isLoaded = true;
        return tex;
    }
}

// Singleton
export const MUTextures = new MUTextureManager();

export default MUTextureManager;