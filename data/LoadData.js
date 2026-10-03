/**
 * LoadData.js - Port de LoadData.cpp + sistema de persistência
 * Substituí arquivos locais por fetch/cache + localStorage (save data)
 */

/**
 * Carregador de assets com cache e progresso
 */
export class AssetLoader {
    constructor() {
        this.cache = new Map();
        this.onProgress = null;
        this._loaded = 0;
        this._total = 0;
    }

    /**
     * Carrega um arquivo como texto
     */
    async loadText(url) {
        if (this.cache.has(url)) return this.cache.get(url);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
        const text = await response.text();
        this.cache.set(url, text);
        this._reportProgress();
        return text;
    }

    /**
     * Carrega arquivo JSON
     */
    async loadJSON(url) {
        const text = await this.loadText(url);
        return JSON.parse(text);
    }

    /**
     * Carrega imagem (textura)
     */
    loadImage(url) {
        if (this.cache.has(url)) return Promise.resolve(this.cache.get(url));
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                this.cache.set(url, img);
                this._reportProgress();
                resolve(img);
            };
            img.onerror = () => reject(new Error(`Falha ao carregar: ${url}`));
            img.src = url;
        });
    }

    /**
     * Carrega arquivos binários (ex: .bmd, .ozt do MU)
     */
    async loadBinary(url) {
        if (this.cache.has(url)) return this.cache.get(url);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
        const buffer = await response.arrayBuffer();
        this.cache.set(url, buffer);
        this._reportProgress();
        return buffer;
    }

    /**
     * Pré-carrega uma lista de assets
     * @param {Array<{type, url}>} list
     */
    async preload(list) {
        this._total = list.length;
        this._loaded = 0;
        const results = [];
        for (const item of list) {
            try {
                let data;
                switch (item.type) {
                    case 'json': data = await this.loadJSON(item.url); break;
                    case 'image': data = await this.loadImage(item.url); break;
                    case 'binary': data = await this.loadBinary(item.url); break;
                    default: data = await this.loadText(item.url);
                }
                results.push({ url: item.url, data, ok: true });
            } catch (err) {
                results.push({ url: item.url, error: err, ok: false });
            }
            this._loaded++;
            this._reportProgress();
        }
        return results;
    }

    _reportProgress() {
        if (this.onProgress) {
            this.onProgress(this._loaded, this._total);
        }
    }
}

/**
 * Persistência de dados do jogador (save/load)
 * Substitui os arquivos .cfg/.dat do cliente por localStorage
 */
export class SaveSystem {
    constructor(prefix = 'muweb_') {
        this.prefix = prefix;
    }

    save(key, data) {
        try {
            localStorage.setItem(this.prefix + key, JSON.stringify({
                data: data,
                version: 1,
                timestamp: Date.now()
            }));
            return true;
        } catch (e) {
            console.error('[SaveSystem] Erro ao salvar:', e);
            return false;
        }
    }

    load(key, defaultValue = null) {
        try {
            const raw = localStorage.getItem(this.prefix + key);
            if (!raw) return defaultValue;
            const parsed = JSON.parse(raw);
            return parsed.data !== undefined ? parsed.data : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    }

    remove(key) {
        localStorage.removeItem(this.prefix + key);
    }

    clear() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(this.prefix)) keys.push(k);
        }
        keys.forEach(k => localStorage.removeItem(k));
    }

    // ===== Gerenciamento de personagens (esperado por CharSelectScene) =====

    /**
     * Lista personagens de uma conta
     * @param {string} accountId
     * @returns {Array<{name, level, classId, className}>}
     */
    getChars(accountId) {
        return this.load(`chars_${accountId}`, []);
    }

    /**
     * Adiciona ou atualiza personagem da conta
     */
    saveChar(accountId, charData) {
        const chars = this.getChars(accountId);
        const idx = chars.findIndex(c => c.name === charData.name);
        if (idx >= 0) chars[idx] = charData;
        else chars.push(charData);
        return this.save(`chars_${accountId}`, chars);
    }

    /**
     * Remove personagem pelo nome
     */
    deleteChar(accountId, name) {
        const chars = this.getChars(accountId).filter(c => c.name !== name);
        return this.save(`chars_${accountId}`, chars);
    }

    /**
     * Exporta todos os saves como JSON (para backup)
     */
    exportAll() {
        const out = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(this.prefix)) {
                out[k] = localStorage.getItem(k);
            }
        }
        return JSON.stringify(out, null, 2);
    }
}

// Singletons
export const Assets = new AssetLoader();
export const Saves = new SaveSystem();
