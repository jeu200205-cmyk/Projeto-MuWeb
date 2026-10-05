/**
 * RemoteAssets.js — Carregador dos dados originais do cliente (Data/)
 * 
 * Os assets originais do cliente PC (texturas .ozt/.ozj, modelos .bmd,
 * sons .wav, mapas .att) ficam hospedados num servidor remoto
 * (servidor HTTP/CDN controlado pelo projeto). O port baixa sob demanda,
 * faz cache (Cache API / IndexedDB) e FALHA FECHADO quando o arquivo
 * não existe remotamente — sem fallback procedural/visual (R12.4).
 * O manifesto asset-manifest.json decide localmente antes de tocar
 * o asset-server; asset ausente = null + log, nunca textura substituta.
 *
 * Configure a URL base apontando para o asset-server/runtime autorizado
 * que sirva os arquivos da pasta Data/.
 */
function normalizeDataRelativePath(relPath) {
    let normalized = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
    // Source owners frequently author paths as Data\Npc\... while this
    // transport is already rooted at the selected Data/ directory. Preserve
    // the semantic source path at call sites and strip exactly one transport
    // root here; never rewrite deeper path components or guess basenames.
    if (/^data\//i.test(normalized)) normalized = normalized.slice(5);
    return normalized;
}

export { normalizeDataRelativePath };

export class RemoteAssetSystem {
    constructor(baseUrl = null) {
        this.baseUrl = baseUrl;                       // ex.: 'https://cdn.seusite.com/Data/'
        this.memoryCache = new Map();                 // path -> data
        this.binaryInflight = new Map();              // canonical path -> Promise<ArrayBuffer|null>
        // UI first-paint owner: one canonical conversion per asset. OZJ/OZT
        // conversion can allocate Blob/data URLs; recreating them in each scene
        // caused duplicate decode work and late interface appearance.
        this.imageUrlCache = new Map();               // canonical path -> Promise<string|null>
        this.decodedImageCache = new Map();            // canonical path -> Promise<{url,image,w,h}|null>
        this.offline = false;                         // true se baseUrl indisponível
        this.stats = { fetched: 0, cached: 0, failed: 0 };
        this.onProgress = null;
        // FIX44: persistent raw-byte cache is scoped by the selected physical
        // Data authority. The old global v1 name let :8081/:8082 keep bytes
        // from a previous client/Data selection while :8080 happened to be
        // clean, making the same Lorencia source render differently by port.
        this._authorityRevision = null;
        this._cacheName = 'mu-web-assets-v2-unbound';
        // R12.4: índice local do inventário REAL de Data/. Evita dezenas de
        // GET 404 por textura (case/extensão) e resolve o casing exato antes
        // de tocar o asset-server. Se o manifesto não puder ser lido, cai
        // para o comportamento remoto normal — nunca inventa asset.
        this._manifestPromise = null;
        this._manifestIndex = null;
        this._manifestBasenameIndex = null; // R78: only unique basenames; duplicates stay fail-closed
        this._manifestUnavailable = false;
    }

    /** Configura a URL base dos dados do cliente */
    configure(baseUrl, authorityRevision = null) {
        const next = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
        const nextAuthority = authorityRevision == null || authorityRevision === ''
            ? null : String(authorityRevision);
        const authorityChanged = this._authorityRevision !== nextAuthority;
        if ((this.baseUrl && this.baseUrl !== next) || authorityChanged) {
            // Caches AND path inventory belong to one physical Data authority.
            this.memoryCache.clear();
            this.binaryInflight.clear();
            this.imageUrlCache.clear();
            this.decodedImageCache.clear();
            this._manifestPromise = null;
            this._manifestIndex = null;
            this._manifestBasenameIndex = null;
            this._manifestUnavailable = false;
        }
        this.baseUrl = next;
        this._authorityRevision = nextAuthority;
        const safe = nextAuthority && /^[a-f0-9]{16,128}$/i.test(nextAuthority)
            ? nextAuthority.toLowerCase()
            : 'url-' + Array.from(next).reduce((h,ch)=>((h*33)^ch.charCodeAt(0))>>>0,5381).toString(16);
        this._cacheName = `mu-web-assets-v2-${safe}`;
        this.offline = false;
    }

    get authorityRevision() { return this._authorityRevision; }
    get authorityKey() { return `${this.baseUrl || ''}#${this._authorityRevision || 'unbound'}`; }

    /** Verifica se o servidor de assets está acessível */
    async ping() {
        if (!this.baseUrl) return false;
        try {
            const r = await fetch(this.baseUrl, { method: 'HEAD' });
            return r.ok || r.status === 403 || r.status === 301 || r.status === 200;
        } catch (e) {
            // Alguns servidores não implementam HEAD — tenta um arquivo conhecido
            try {
                const r2 = await fetch(this.baseUrl + 'manifest.json');
                return r2.ok;
            } catch (e2) {
                this.offline = true;
                return false;
            }
        }
    }

    /**
     * R55: valida a origem de assets contra um conjunto mínimo de arquivos
     * obrigatórios. Um HEAD na raiz não é suficiente: o browser podia entrar
     * no login com cache antigo e só descobrir no Character Select que
     * World75/TerrainHeight.OZB não existia/servidor :9100 estava morto.
     */
    async pingRequired(paths = []) {
        if (!(await this.ping())) return false;
        for (const raw of paths) {
            const canonical = await this.resolveExistingPath(raw);
            if (!canonical) {
                this.offline = true;
                return false;
            }
            const url = this.url(canonical);
            if (!url) { this.offline = true; return false; }
            try {
                let r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
                // Alguns hostings não implementam HEAD corretamente. Só nesses
                // casos faça GET; no asset-server local HEAD é sempre suportado.
                if (!r.ok && (r.status === 403 || r.status === 405 || r.status === 501)) {
                    r = await fetch(url, { cache: 'no-store' });
                }
                if (!r.ok) { this.offline = true; return false; }
            } catch (_) {
                this.offline = true;
                return false;
            }
        }
        this.offline = false;
        return true;
    }

    /** Carrega uma vez o inventário real de Data/ incluído na source Web. */
    async _ensureManifest() {
        if (this._manifestIndex || this._manifestUnavailable) return this._manifestIndex;
        if (!this._manifestPromise) {
            this._manifestPromise = (async () => {
                try {
                    // R89 physical map recovery: the launcher can point at a
                    // different *official* Data root than the Web ZIP's retained
                    // build-time manifest. Ask the local R89 asset server for the
                    // inventory of the root it actually indexed. This closes the
                    // gap where a real ObjectNN/player texture existed on disk but
                    // the stale browser manifest returned null before any HTTP
                    // request could reach the server. Remote/CDN deployments keep
                    // the retained manifest as the fallback authority.
                    let j = null;
                    let manifestSource = 'retained';
                    if (this.baseUrl && /^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?\//i.test(this.baseUrl)) {
                        try {
                            const live = await fetch(this.baseUrl + '__muweb_asset_manifest.json', { cache: 'no-store' });
                            if (live.ok) {
                                j = await live.json();
                                if (this._authorityRevision && j?.authorityRevision !== this._authorityRevision) {
                                    throw new Error(`asset authority mismatch runtime=${this._authorityRevision} server=${j?.authorityRevision || 'missing'}`);
                                }
                                manifestSource = 'live-data-root';
                            }
                        } catch (_) { /* fallback below */ }
                    }
                    if (!j) {
                        const manifestURL = new URL('../public/asset-manifest.json', import.meta.url);
                        const r = await fetch(manifestURL, { cache: 'no-store' });
                        if (!r.ok) throw new Error(`HTTP ${r.status}`);
                        j = await r.json();
                    }
                    const files = Array.isArray(j?.files) ? j.files : [];
                    const index = new Map();
                    const basenameIndex = new Map();
                    for (const raw of files) {
                        if (typeof raw !== 'string') continue;
                        const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
                        index.set(normalized.toLowerCase(), normalized);
                        // The Windows asset-server already has this exact safe rescue:
                        // only a basename that occurs once in the entire official Data
                        // may be redirected. R77's browser-side manifest rejected the
                        // request before it could reach that owner, causing real textures
                        // such as Object64/sp_bri02.OZJ to stay hidden even though the
                        // official Data proved a single canonical source. Never choose
                        // between duplicate basenames: store null and fail closed.
                        const base = normalized.split('/').pop().toLowerCase();
                        if (!basenameIndex.has(base)) basenameIndex.set(base, normalized);
                        else if (basenameIndex.get(base) !== normalized) basenameIndex.set(base, null);
                    }
                    this._manifestIndex = index;
                    this._manifestBasenameIndex = basenameIndex;
                    console.info(`[RemoteAssets] manifest indexado (${manifestSource}): ${index.size} assets reais`);
                    return index;
                } catch (e) {
                    this._manifestUnavailable = true;
                    console.warn('[RemoteAssets] asset-manifest indisponível; usando resolução remota direta:', e?.message || e);
                    return null;
                }
            })();
        }
        return this._manifestPromise;
    }

    /**
     * Resolve caminho case-insensitive para o casing/extensão EXATOS do Data real.
     * Retorna null somente quando o manifesto foi carregado e prova que o path
     * não existe; se o manifesto estiver indisponível, preserva o path pedido.
     */
    async resolveExistingPath(relPath, { exactOnly = false } = {}) {
        const normalized = normalizeDataRelativePath(relPath);
        if (!normalized) return null;
        const index = await this._ensureManifest();
        if (!index) return exactOnly ? null : normalized;
        const exact = index.get(normalized.toLowerCase());
        if (exact) return exact;
        if (exactOnly) return null;
        // R78: mirror asset-server.cjs' no-guess unique-basename contract in
        // the browser resolver. This is required because callers resolve
        // against the manifest before fetchBinary(), so previously the server's
        // safe basename owner was unreachable. Ambiguous names remain null.
        const base = normalized.split('/').pop().toLowerCase();
        return this._manifestBasenameIndex?.get(base) || null;
    }

    /**
     * FIX50: lista arquivos reais de um diretório do Data usando o mesmo
     * manifesto autoritativo/case-insensitive do restante do loader. Necessário
     * para portar LuaOpenFolder.cpp sem inventar módulos nem depender de IO do
     * browser. Retorna somente filhos diretos e preserva o path canônico.
     */
    async listFolder(relFolder, { suffix = null } = {}) {
        const folder = normalizeDataRelativePath(relFolder || '');
        if (!folder) return [];
        const prefix = folder.replace(/\/+$/, '') + '/';
        const index = await this._ensureManifest();
        if (!index) return [];
        const out = [];
        for (const canonical of index.values()) {
            if (!canonical.toLowerCase().startsWith(prefix.toLowerCase())) continue;
            const tail = canonical.slice(prefix.length);
            if (!tail || tail.includes('/')) continue;
            if (suffix && !tail.toLowerCase().endsWith(String(suffix).toLowerCase())) continue;
            out.push(canonical);
        }
        out.sort((a,b)=>a.localeCompare(b, undefined, {sensitivity:'base'}));
        return out;
    }

    /** URL completa de um asset */
    url(relPath) {
        if (!this.baseUrl) return null;
        return this.baseUrl + relPath.split('\\').join('/');
    }

    /**
     * Busca no Cache API (persistente entre sessões)
     */
    async _fromCache(url) {
        try {
            const cache = await caches.open(this._cacheName);
            const resp = await cache.match(url);
            return resp ? resp : null;
        } catch (e) {
            return null;
        }
    }

    async _toCache(url, resp) {
        try {
            const cache = await caches.open(this._cacheName);
            await cache.put(url, resp);
        } catch (e) { /* quota cheia etc — ignora */ }
    }

    /**
     * Baixa bytes de um asset remoto (ArrayBuffer) com cache
     * @param {string} relPath - caminho relativo (ex: 'Interface/newui_message_box.jpg')
     * @returns {ArrayBuffer|null}
     */
    async fetchBinary(relPath) {
        const requested = normalizeDataRelativePath(relPath);
        const canonical = await this.resolveExistingPath(requested);
        if (canonical == null) {
            this.stats.failed++;
            return null;
        }
        if (this.memoryCache.has(canonical)) {
            this.stats.cached++;
            return this.memoryCache.get(canonical);
        }
        // R77: de-duplicate simultaneous requests. Terrain prefetch + real load,
        // repeated ObjectN model references and parallel render owners must share
        // the same network/CacheAPI read instead of downloading/decoding twice.
        if (this.binaryInflight.has(canonical)) {
            this.stats.cached++;
            return await this.binaryInflight.get(canonical);
        }
        const pending = this._fetchBinaryCanonical(canonical);
        this.binaryInflight.set(canonical, pending);
        try { return await pending; }
        finally { if (this.binaryInflight.get(canonical) === pending) this.binaryInflight.delete(canonical); }
    }

    async _fetchBinaryCanonical(canonical) {
        const url = this.url(canonical);
        if (!url) return null;
        let resp = await this._fromCache(url);
        if (resp) {
            const buf = await resp.arrayBuffer();
            this.memoryCache.set(canonical, buf);
            this.stats.cached++;
            return buf;
        }
        try {
            const r = await fetch(url);
            if (!r.ok) { this.stats.failed++; return null; }
            await this._toCache(url, r.clone());
            const buf = await r.arrayBuffer();
            this.memoryCache.set(canonical, buf);
            this.stats.fetched++;
            return buf;
        } catch (e) {
            this.stats.failed++;
            return null;
        }
    }

    /**
     * Buscar como imagem HTMLImageElement (para texturas UI)
     * OZJ: JPEG renomeado — a maioria é JPEG puro, mas OZJs de World/mapa
     *      deste cliente têm header custom MuPromax (ex. FF 4B 6D 4B...) com
     *      o JPEG real (FFD8) começando em offset variável → detecta e remove.
     * OZT: formato custom do MU (GlobalBitmap.cpp::OpenTga) → decodeOZT
     * TGA padrão → decodeTGA (fallback)
     */
    async fetchImageURL(relPath, options = {}) {
        const canonical = await this.resolveExistingPath(relPath, options);
        if (canonical == null) return null;
        let pending = this.imageUrlCache.get(canonical);
        if (!pending) {
            pending = this._fetchImageURLCanonical(canonical).then((url) => {
                if (!url) this.imageUrlCache.delete(canonical); // transient/offline miss may recover
                return url;
            }).catch((e) => {
                this.imageUrlCache.delete(canonical);
                throw e;
            });
            this.imageUrlCache.set(canonical, pending);
        }
        return pending;
    }

    async fetchDecodedImage(relPath) {
        const canonical = await this.resolveExistingPath(relPath);
        if (canonical == null) return null;
        let pending = this.decodedImageCache.get(canonical);
        if (!pending) {
            pending = (async () => {
                const url = await this.fetchImageURL(canonical);
                if (!url) return null;
                if (typeof Image === 'undefined') return { url, image: null, w: 0, h: 0 };
                const image = new Image();
                image.decoding = 'async';
                image.src = url;
                try {
                    if (typeof image.decode === 'function') await image.decode();
                    else await new Promise((resolve, reject) => {
                        image.onload = resolve; image.onerror = reject;
                    });
                } catch (_) { return null; }
                return { url, image, w: image.naturalWidth || image.width || 0, h: image.naturalHeight || image.height || 0 };
            })().then((v) => { if (!v) this.decodedImageCache.delete(canonical); return v; })
              .catch((e) => { this.decodedImageCache.delete(canonical); throw e; });
            this.decodedImageCache.set(canonical, pending);
        }
        return pending;
    }

    async _fetchImageURLCanonical(relPath) {
        const ext = relPath.split('.').pop().toLowerCase();

        if (ext === 'ozj' || ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
            if (ext !== 'ozj') return this.url(relPath); // jpg/jpeg/png: direto, path já canônico
            // OZJ: precisa verificar o magic — header custom exige fetch + strip
            const buf = await this.fetchBinary(relPath);
            if (!buf) return null;
            const u8 = new Uint8Array(buf);
            // Alguns OZJ MuPromax possuem uma capa JPEG e um SEGUNDO SOI real.
            // Preferir o segundo FFD8 quando aparece cedo (<=128 bytes), igual
            // ao decoder custom do cliente PC que tolera o envelope.
            const sois = [];
            for (let i = 0; i < Math.min(128, u8.length - 1); i++) {
                if (u8[i] === 0xFF && u8[i + 1] === 0xD8) sois.push(i);
            }
            let soi = -1;
            if (sois.length >= 2 && sois[0] === 0) soi = sois[1];
            else if (sois.length >= 1) soi = sois[0];
            if (soi >= 0) {
                const blob = new Blob([u8.subarray(soi)], { type: 'image/jpeg' });
                return URL.createObjectURL(blob);
            }
            return null; // fail-closed: não entregar bytes não-JPEG ao browser
        }

        if (ext === 'ozt') {
            const buf = await this.fetchBinary(relPath);
            if (!buf) return null;
            const canvas = decodeOZT(new Uint8Array(buf));
            if (canvas) return canvas.toDataURL();
            const canvas2 = decodeTGA(new Uint8Array(buf));
            return canvas2 ? canvas2.toDataURL() : null;
        }

        if (ext === 'tga') {
            const buf = await this.fetchBinary(relPath);
            if (!buf) return null;
            const canvas = decodeTGA(new Uint8Array(buf));
            return canvas ? canvas.toDataURL() : null;
        }

        return this.url(relPath);
    }

    /**
     * Pré-carrega uma lista de arquivos com progresso
     */
    async preload(list, onOne) {
        let done = 0;
        const results = [];
        for (const p of list) {
            const buf = await this.fetchBinary(p);
            results.push({ path: p, ok: !!buf, size: buf ? buf.byteLength : 0 });
            done++;
            if (this.onProgress) this.onProgress(done, list.length, p);
            if (onOne) onOne(p, buf);
        }
        return results;
    }
}

/* ============================================================
 * Decodificador OZT — formato custom do cliente MuPromax.
 * Port fiel de CGlobalBitmap::OpenTga (GlobalBitmap.cpp):
 *   [0..7]   opcional FileProtect header (68 A2 D2 20 A4 43 41 DE)
 *            → payload duplo-transform com XorTable[16] + PrivateCode
 *              (sem PrivateCode não é possível decifrar; retorna null)
 *   [0..15]  header ignorado
 *   [16-17]  width  (uint16 LE) — nx
 *   [18-19]  height (uint16 LE) — ny
 *   [20]     bpp    (DEVE ser 32)
 *   [21]     pad
 *   [22..]   pixels BGRA, linhas bottom-up, conversão:
 *            dst[0]=src[2] (R), dst[1]=src[1] (G), dst[2]=src[0] (B), dst[3]=src[3] (A)
 * O cliente ainda arredonda p/ potência de 2 p/ a textura GL —
 * no canvas usamos nx×ny direto (não precisa de pow2).
 * ============================================================ */
export function decodeOZT(data) {
    if (!data || data.length < 22) return null;

    // FileProtect header (criptografia Astra-like) — sem a PrivateCode não
    // é possível decifrar; sinaliza falha p/ o caller usar fallback.
    const PROTECT_HEADER = [0x68, 0xA2, 0xD2, 0x20, 0xA4, 0x43, 0x41, 0xDE];
    if (data.length >= 8) {
        let match = true;
        for (let i = 0; i < 8; i++) if (data[i] !== PROTECT_HEADER[i]) { match = false; break; }
        if (match) {
            console.warn('[decodeOZT] Arquivo protegido (FileProtect) — PrivateCode indisponível');
            return null;
        }
    }

    // Header custom: w/h/bpp conforme o C++ (index=12+4=16; nx; ny; bit)
    const nx = data[16] | (data[17] << 8);   // largura real
    const ny = data[18] | (data[19] << 8);   // altura real
    const bit = data[20];                    // bpp — o cliente exige 32
    if (bit !== 32 || nx <= 0 || ny <= 0 || nx > 4096 || ny > 4096) return null;

    const PIXEL_OFFSET = 22; // 12 + 4 (header) + 2 (w) + 2 (h) + 1 (bpp) + 1 (pad)
    if (data.length < PIXEL_OFFSET + nx * ny * 4) {
        console.warn(`[decodeOZT] Truncado: tem ${data.length - PIXEL_OFFSET} bytes de pixel, precisa ${nx * ny * 4}`);
        return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = nx;
    canvas.height = ny;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(nx, ny);
    const out = imageData.data;

    // Linhas bottom-up no arquivo → canvas com flip vertical (igual ao loop C++:
    // dst = Buffer[(ny-1-y)*Width*4])
    for (let y = 0; y < ny; y++) {
        let src = PIXEL_OFFSET + y * nx * 4;
        let dst = (ny - 1 - y) * nx * 4;
        for (let x = 0; x < nx; x++) {
            out[dst]     = data[src + 2]; // R <- src[2] (BGRA→RGBA)
            out[dst + 1] = data[src + 1]; // G
            out[dst + 2] = data[src];     // B
            out[dst + 3] = data[src + 3]; // A
            src += 4;
            dst += 4;
        }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

/* ============================================================
 * Decodificador TGA (Uncompressed + RLE, 24/32-bit) para .tga
 * Baseado no formato TGA padrão (fallback p/ OZT sem header custom).
 * ============================================================ */
export function decodeTGA(data) {
    if (data.length < 18) return null;

    const idLength = data[0];
    const colorMapType = data[1];
    const imageType = data[2];
    if (colorMapType !== 0) return null; // só imagem sem colormap

    const width = data[12] | (data[13] << 8);
    const height = data[14] | (data[15] << 8);
    const bpp = data[16] >> 3; // bytes per pixel
    if (bpp !== 3 && bpp !== 4) return null;
    if (width <= 0 || height <= 0 || width > 4096 || height > 4096) return null;

    const descriptor = data[17];
    const topOrigin = (descriptor & 0x20) !== 0;

    let offset = 18 + idLength;
    const pixels = new Uint8ClampedArray(width * height * 4);

    const readPixel = (idx) => {
        const b = data[offset], g = data[offset + 1], r = data[offset + 2];
        const a = bpp === 4 ? data[offset + 3] : 255;
        offset += bpp;
        pixels[idx] = r; pixels[idx + 1] = g; pixels[idx + 2] = b; pixels[idx + 3] = a;
    };

    try {
        if (imageType === 2) {            // uncompressed true-color
            for (let i = 0; i < width * height; i++) readPixel(i * 4);
        } else if (imageType === 10) {    // RLE true-color
            let i = 0;
            while (i < width * height) {
                const header = data[offset++];
                const count = (header & 0x7F) + 1;
                if (header & 0x80) { // run-length
                    const b = data[offset], g = data[offset + 1], r = data[offset + 2];
                    const a = bpp === 4 ? data[offset + 3] : 255;
                    offset += bpp;
                    for (let j = 0; j < count && i < width * height; j++, i++) {
                        pixels[i * 4] = r; pixels[i * 4 + 1] = g;
                        pixels[i * 4 + 2] = b; pixels[i * 4 + 3] = a;
                    }
                } else { // raw
                    for (let j = 0; j < count && i < width * height; j++, i++) {
                        readPixel(i * 4);
                    }
                }
            }
        } else {
            return null; // type 1/9 (colormap) não usado no MU
        }
    } catch (e) {
        return null;
    }

    // Flip vertical se origem for bottom-left (padrão TGA)
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);

    if (topOrigin) {
        imageData.data.set(pixels);
    } else {
        const rowBytes = width * 4;
        for (let y = 0; y < height; y++) {
            const src = (height - 1 - y) * rowBytes;
            imageData.data.set(pixels.subarray(src, src + rowBytes), y * rowBytes);
        }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

// Singleton
export const RemoteAssets = new RemoteAssetSystem();
