/**
 * MUAssetLoader.js — Universal Asset Loader for MU Online Client Assets
 *
 * Handles parsing/loading of ALL original client asset formats:
 *  - .bmd  : 3D Models (vertices, faces, UV, bones, animations) — both legacy (S1-S5) and encrypted (S6+)
 *  - .ozj  : JPEG-embedded textures (24-byte header + JPEG data, optional XOR3 encryption)
 *  - .ozt  : TGA textures (18-byte header + pixel data, optional XOR3 encryption)
 *  - .wav  : PCM/ADPCM audio via Web Audio API decodeAudioData
 *  - .mp3  : MP3 audio via Web Audio API
 *  - .att  : Terrain attribute maps (collision, water, safezone, etc.)
 *  - .ter  : Terrain heightmaps (OZB format)
 *  - .lst/.txt : Data lists (items, monsters, skills, quests, shops, gates)
 *
 * Architecture:
 *  - Uses RemoteAssets for fetching (Cache API + memory cache)
 *  - Web Workers for heavy parsing (BMD, OZJ/OZT) via OffscreenCanvas
 *  - IndexedDB for persistent caching of parsed assets
 *  - Returns Three.js ready objects (SkinnedMesh, Texture, AudioBuffer, etc.)
 */

import { RemoteAssets } from '../data/RemoteAssets.js';
// REAL: parser BMD v12 do Main 5.2 (decrypt MapFileDecrypt + layout BMD::Open2)
import { parseBMD } from '../graphics/BmdParser.js';
import { bmdToRenderData } from '../graphics/BmdAdapter.js';

// ============================================================
// Configuration & Constants
// ============================================================

const ASSET_BASE_URL = (typeof window !== 'undefined' && window.__MU_ASSET_BASE__) || 'http://localhost:9100/';
const INDEXEDB_NAME = 'mu-asset-cache';
const INDEXEDB_VERSION = 4; // FIX44: purge stale parsed records and scope by physical Data authority // R12.5 purge v3 (t-mugt0lc4-j): stores v1 E v2
// receberam payloads parseados por decoders PRE-fix (strip 2o-SOI errado /
// TGA offsets errados w=0) servidos para sempre pelo idbGet sem revalidacao —
// causa raiz do flood "JPEG decode falhou" persistir no runtime fisico mesmo
// com o decoder ja corrigido. Cada bump = purge total do store.
const INDEXEDB_STORE = 'assets';

// XOR3 key used by MU client for encryption (legacy S1-S5)
const XOR3_KEY = new Uint8Array([0xFC, 0xCF, 0xAB]);

// BMD Magic bytes
const BMD_MAGIC_OLD = new Uint8Array([0x42, 0x4D, 0x44, 0x1A, 0x00, 0x00, 0x00]); // "BMD\x1A\0\0\0"
const BMD_MAGIC = [0x42, 0x4D, 0x44]; // "BMD"

// Asset type enum
export const AssetType = {
    BMD: 'bmd',
    OZJ: 'ozj',
    OZT: 'ozt',
    WAV: 'wav',
    MP3: 'mp3',
    ATT: 'att',
    TER: 'ter',
    LST: 'lst',
    TXT: 'txt',
    UNKNOWN: 'unknown'
};

// ============================================================
// IndexedDB Cache (Persistent)
// ============================================================

let _idbPromise = null;

function getIDB() {
    if (_idbPromise) return _idbPromise;
    // Guard R12.5 (snippet 471d): fora de browser (Node probes/tests que
    // importam este módulo), indexedDB não existe — resolve null UMA vez
    // (idempotente) em vez de ReferenceError; idbGet/idbSet tratam null.
    if (typeof indexedDB === 'undefined') {
        _idbPromise = Promise.resolve(null);
        return _idbPromise;
    }
    _idbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(INDEXEDB_NAME, INDEXEDB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            // R12.5 hotfix: o store v1 continha bytes brutos pré-strip do OZJ
            // (capa 24B) e TGA wrong-offset (w=0/h=0). onupgradeneeded só cria
            // o store; entradas antigas persistem. deleteObjectStore para
            // limpeza definitiva no upgrade — o cache rebuilding acontece
            // na primeira leitura subsequente.
            // R12.5 purge v3 (t-mugt0lc4-j): o purge condicionado a
            // oldVersion < 2 nunca disparava para o DB do usuário JÁ EM v2
            // (2→2 não é upgrade) — o store envenenado ficava vivo para
            // sempre, mantendo o flood "JPEG decode falhou" mesmo com o
            // decoder corrigido. Purge em QUALQUER upgrade de versão
            // (oldVersion < INDEXEDB_VERSION): registros são payloads
            // parseados, não dados de origem — rebuild no próximo fetch.
            if (e.oldVersion < INDEXEDB_VERSION && db.objectStoreNames.contains(INDEXEDB_STORE)) {
                db.deleteObjectStore(INDEXEDB_STORE);
            }
            if (!db.objectStoreNames.contains(INDEXEDB_STORE)) {
                db.createObjectStore(INDEXEDB_STORE, { keyPath: 'url' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return _idbPromise;
}

async function idbGet(url) {
    const db = await getIDB();
    if (!db) return null;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(INDEXEDB_STORE, 'readonly');
        const store = tx.objectStore(INDEXEDB_STORE);
        const req = store.get(url);
        req.onsuccess = () => resolve(req.result?.data ?? null);
        req.onerror = () => reject(req.error);
    });
}

async function idbSet(url, data, type) {
    const db = await getIDB();
    if (!db) return;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(INDEXEDB_STORE, 'readwrite');
        const store = tx.objectStore(INDEXEDB_STORE);
        const req = store.put({ url, data, type, timestamp: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

/**
 * Validador anti-poison de textura parseada em cache (R12.5, t-mugt0lc4-j).
 * Contrato dos decoders ATUAIS (main e worker, paridade 9/9):
 *   OZJ → { format:'jpeg', needsDecode:true, data:Uint8Array com FF D8 FF no
 *          offset 0 pós-strip (stripOzJEnvelope escolhe SOI@24 quando existe) }
 *   OZT → { format:'rgba', data:Uint8ClampedArray(w*h*4), width>0, height>0 }
 * Registros pré-fix (strip errado = data sem SOI; TGA lixo = w/h 0) são
 * rejeitados no read-path e re-decodados do servidor; o write-path também
 * valida (fail-closed: nunca persistir payload inválido de novo).
 * Estrutural — não aceita/rejeita por propriedades extras (forward-compat).
 */
export function isValidParsedTexture(parsed) {
    if (!parsed || typeof parsed !== 'object') return false;
    if (parsed.format === 'jpeg' && parsed.needsDecode) {
        const d = parsed.data;
        if (!d || !d.byteLength || d.byteLength < 4) return false;
        const u = d instanceof Uint8Array ? d : new Uint8Array(d.buffer || d);
        return u[0] === 0xFF && u[1] === 0xD8 && u[2] === 0xFF;
    }
    if (parsed.format === 'rgba') {
        const d = parsed.data;
        return !!(d && d.byteLength >= 16
            && Number.isInteger(parsed.width) && parsed.width > 0
            && Number.isInteger(parsed.height) && parsed.height > 0
            && d.byteLength === parsed.width * parsed.height * 4);
    }
    return false;
}

// ============================================================
// Utility Functions
// ============================================================

function xor3Decrypt(bytes, offset = 0) {
    const len = bytes.length - offset;
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        out[i] = bytes[offset + i] ^ XOR3_KEY[i % 3];
    }
    return out;
}

function detectAssetType(path) {
    const ext = path.split('.').pop().toLowerCase();
    switch (ext) {
        case 'bmd': return AssetType.BMD;
        case 'ozj': return AssetType.OZJ;
        case 'ozt': return AssetType.OZT;
        case 'wav': return AssetType.WAV;
        case 'mp3': return AssetType.MP3;
        case 'att': return AssetType.ATT;
        case 'ter': return AssetType.TER;
        case 'lst': return AssetType.LST;
        case 'txt': return AssetType.TXT;
        default: return AssetType.UNKNOWN;
    }
}

function detectBMDFormat(buf) {
    if (!buf || buf.byteLength < 8) return 'invalid';
    const u8 = buf instanceof Uint8Array ? buf.subarray(0, 8) : new Uint8Array(buf, 0, 8);
    if (u8[0] !== 0x42 || u8[1] !== 0x4D || u8[2] !== 0x44) return 'invalid';
    if (u8[3] === 0x0C) return 'v12'; // Main 5.2: BMD\0C + LE32 size + MapFileDecrypt
    if (u8[3] === 0x0A) return 'v10'; // Main 5.2: BMD\0A payload LIMPO após offset 4 (ZzzBMD.cpp:17924-17932)
    let isOld = true;
    for (let i = 0; i < BMD_MAGIC_OLD.length; i++) {
        if (u8[i] !== BMD_MAGIC_OLD[i]) { isOld = false; break; }
    }
    return isOld ? 'old' : 'invalid';
}

// ============================================================
// Web Worker for Heavy Parsing (BMD, Textures)
// ============================================================

/**
 * OZJ MuPromax: alguns arquivos levam envelope/capa antes do JPEG real.
 * Autoridade PC: GlobalBitmap.cpp::OpenJpeg (mu_source) L605-608 faz strip
 * FIXO de 24 bytes (DataBytes -= 24; Data = CData + 24). R12.4 generalizou:
 * se ha SOI em 0 E outro SOI cedo (capa), usar o segundo; senao o primeiro
 * SOI valido. Confirmado no Data real: ship01/05/07.OZJ tem SOIs em
 * 0/24/454 e o correto e 24 (coincide com o strip PC). Scan ate 256B.
 * R12.5: esta funcao passou a ser COMPARTILHADA — exportada no modulo e
 * injetada no worker (que antes entregava OZJ cru: causa do flood
 * "JPEG decode falhou" no runtime fisico, ~50 falhas por boot).
 */
export function stripOzJEnvelope(data) {
    const limit = Math.min(256, data.length - 1);
    const sois = [];
    for (let i = 0; i < limit; i++) {
        if (data[i] === 0xFF && data[i + 1] === 0xD8 && data[i + 2] === 0xFF) sois.push(i);
    }
    if (sois.length === 0) throw new Error('OZJ sem JPEG SOI valido');
    // PC GlobalBitmap.cpp::OpenJpeg L605-608: strip FIXO 24B. OZJs com capa têm
    // FFD8@0 (capa) + FFD8@24 (JPEG real). JPEG puro com thumbnail EXIF tem
    // SOI@0 válido e SEGUNDOS SOIs internos (@96+). Só strip se 24 estiver na lista.
    let soi;
    if (sois.includes(24)) soi = 24;
    else soi = sois[0];
    return data.subarray(soi);
}

/**
 * OZT custom MuPromax (GlobalBitmap.cpp::OpenTga): header de 22 bytes -
 * [16-17]=W LE, [18-19]=H LE, [20]=bpp (32), [22..]=pixels BGRA bottom-up.
 * Evidencia fisica: Object95/fairy2RHMakers.ozt = 22+32*32*4 = 4118 exatos;
 * Object75/grass2.OZT idem. O parser TGA-padrao lia offsets errados (W=0/H=0)
 * e o erro virava "textura nao encontrada" no loadModelTexture. Retorna
 * {data,width,height,format:"rgba"} ou null se a assinatura nao bater.
 */
export function decodeOZTCustom(u8) {
    if (!u8 || u8.length < 22 || u8[20] !== 32) return null;
    const w = u8[16] | (u8[17] << 8);
    const h = u8[18] | (u8[19] << 8);
    if (!(w > 0 && h > 0 && w <= 4096 && h <= 4096)) return null;
    if (u8.length < 22 + w * h * 4) return null;
    // R12.5 fix após o relatório do console do usuário (peer 999 auditou TODOS
    // os 1738 OZT reais do disco: size = 22+W*H*4+{0,26,30,34B
    // "TRUEVISION-XFILE." / TGA-2.0 ext}; pixels SEMPRE começam no offset 22,
    // como prova PC CGlobalBitmap::OpenTga + RemoteAssets.decodeOZT l280).
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        let src = 22 + y * w * 4;
        let dst = (h - 1 - y) * w * 4;
        for (let x = 0; x < w; x++) {
            pixels[dst]     = u8[src + 2];
            pixels[dst + 1] = u8[src + 1];
            pixels[dst + 2] = u8[src];
            pixels[dst + 3] = u8[src + 3];
            src += 4;
            dst += 4;
        }
    }
    return { data: pixels, width: w, height: h, format: 'rgba' };
}

const _workerCode = `
// Worker-side parsers
${stripOzJEnvelope.toString()}
${decodeOZTCustom.toString()}
const XOR3_KEY = new Uint8Array([0xFC, 0xCF, 0xAB]);
function xor3(bytes, offset=0) {
    const len = bytes.length - offset;
    const out = new Uint8Array(len);
    for(let i=0;i<len;i++) out[i] = bytes[offset+i] ^ XOR3_KEY[i%3];
    return out;
}

self.onmessage = async function(e) {
    // R12.6: ecoa key (chave única por request p/ o _pending do main),
    // compat com mensagens legadas sem key.
    const {task, data, path, key} = e.data;
    try {
        let result;
        switch(task) {
            case 'parseBMD': result = parseBMD(data); break;
            case 'decodeOZJ': result = decodeOZJ(data); break;
            case 'decodeOZT': result = decodeOZT(data); break;
            case 'parseATT': result = parseATT(data); break;
            default: throw new Error('Unknown task: '+task);
        }
        self.postMessage({success: true, result, path, key});
    } catch(err) {
        self.postMessage({success: false, error: err.message, path, key});
    }
};

function parseBMD(buf) {
    const u8 = new Uint8Array(buf);
    const dv = new DataView(buf);
    let off = 0;
    const rdU8 = () => dv.getUint8(off++);
    const rdI16 = () => { const v = dv.getInt16(off, true); off += 2; return v; };
    const rdU16 = () => { const v = dv.getUint16(off, true); off += 2; return v; };
    const rdF32 = () => { const v = dv.getFloat32(off, true); off += 4; return v; };
    const rdStr = (n) => { let s=''; for(let i=0;i<n;i++){const c=u8[off++]; if(c!==0)s+=String.fromCharCode(c);} return s; };

    // Check magic
    if(u8[0]!==0x42||u8[1]!==0x4D||u8[2]!==0x44) throw new Error('Not a BMD file');
    
    // Try old format
    let isOld = true;
    for(let i=0;i<7;i++) if(u8[i]!==[0x42,0x4D,0x44,0x1A,0x00,0x00,0x00][i]){isOld=false;break;}
    
    if(isOld) off = 4;
    else off = 3; // New format starts at byte 3 (after BMD)
    
    const version = rdU16(); off += 2; // padding
    const numMeshes = rdU16();
    const numBones = rdU16();
    const numActions = rdU16();
    
    if(numMeshes > 256 || numBones > 256 || numActions > 128) throw new Error('Invalid counts');
    
    const meshes = [];
    for(let m=0; m<numMeshes; m++) {
        const name = rdStr(32);
        const numVerts = rdU16();
        const numNorms = rdU16();
        const numTris = rdU16();
        if(numVerts > 65535 || numTris > 65535) throw new Error('Too many verts/tris');
        
        const positions = new Float32Array(numVerts * 3);
        const normals = new Float32Array(numVerts * 3);
        const uvs = new Float32Array(numVerts * 2);
        const skinIndices = new Uint16Array(numVerts * 4);
        const skinWeights = new Float32Array(numVerts * 4);
        
        for(let v=0; v<numVerts; v++) {
            positions[v*3] = rdF32(); positions[v*3+1] = rdF32(); positions[v*3+2] = rdF32();
            normals[v*3] = rdF32(); normals[v*3+1] = rdF32(); normals[v*3+2] = rdF32();
            uvs[v*2] = rdF32(); uvs[v*2+1] = rdF32();
            const bone = rdU8();
            skinIndices[v*4] = bone; skinWeights[v*4] = 1.0;
        }
        const indices = new Uint16Array(numTris * 3);
        for(let t=0; t<numTris*3; t++) indices[t] = rdU16();
        
        // Texture filename
        const texName = rdStr(32);
        
        meshes.push({ name, positions, normals, uvs, indices, skinIndices, skinWeights, texture: texName });
    }
    
    // Bones
    const bones = [];
    for(let b=0; b<numBones; b++) {
        const dummy = rdU8();
        const name = rdStr(32);
        const parent = rdI16();
        const matrix = new Float32Array(12);
        for(let i=0;i<12;i++) matrix[i] = rdF32();
        bones.push({ dummy, name, parent, matrix });
    }
    
    // Actions (simplified - just frame counts)
    const actions = [];
    for(let a=0; a<numActions; a++) {
        const numFrames = rdU16();
        const playFlag = rdU16();
        actions.push({ numFrames, playFlag });
    }
    
    return { version, numMeshes, numBones, numActions, meshes, bones, actions };
}

function decodeOZJ(buf) {
    let u8 = new Uint8Array(buf);
    // FileProtect header (GlobalBitmap.cpp::OpenJpeg L590-603) + XOR3
    if(u8.length > 24 && u8[0]===0x68 && u8[1]===0xA2 && u8[2]===0xD2 && u8[3]===0x20 &&
       u8[4]===0xA4 && u8[5]===0x43 && u8[6]===0x41 && u8[7]===0xDE) {
        u8 = xor3(u8, 8);
    }
    // Envelope MuPromax (~24B de capa antes do JPEG real) — strip compartilhado.
    u8 = stripOzJEnvelope(u8);
    return { data: u8, width: 0, height: 0, format: 'jpeg', needsDecode: true };
}

function decodeOZT(buf) {
    const u8 = new Uint8Array(buf);
    // OZT custom MuPromax (22B header W/H/bpp) — compartilhado com o main.
    const custom = decodeOZTCustom(u8);
    if (custom) return custom;
    // Check for XOR3 encryption (MuPromax style: 3 byte junk + data)
    let data = u8;
    if(u8.length === 3 + 256*256*4) { // Typical TGA with 3 junk bytes
        data = xor3(u8, 3);
    } else if(u8.length > 18) {
        // Try decrypting whole thing
        const dec = xor3(u8, 0);
        // Check TGA header
        if(dec[2] === 2 || dec[2] === 10) data = dec;
    }
    
    if(data.length < 18) throw new Error('Invalid TGA');
    
    const idLength = data[0];
    const colorMapType = data[1];
    const imageType = data[2];
    if(colorMapType !== 0) throw new Error('Colormap TGA not supported');
    
    const width = data[12] | (data[13] << 8);
    const height = data[14] | (data[15] << 8);
    const bpp = data[16] >> 3;
    if(bpp !== 3 && bpp !== 4) throw new Error('Only 24/32-bit TGA supported');
    
    const descriptor = data[17];
    const topOrigin = (descriptor & 0x20) !== 0;
    
    let offset = 18 + idLength;
    const pixels = new Uint8ClampedArray(width * height * 4);
    
    if(imageType === 2) { // Uncompressed
        for(let i=0; i<width*height; i++) {
            const b = data[offset], g = data[offset+1], r = data[offset+2];
            const a = bpp === 4 ? data[offset+3] : 255;
            offset += bpp;
            pixels[i*4] = r; pixels[i*4+1] = g; pixels[i*4+2] = b; pixels[i*4+3] = a;
        }
    } else if(imageType === 10) { // RLE
        let i = 0;
        while(i < width*height) {
            const header = data[offset++];
            const count = (header & 0x7F) + 1;
            if(header & 0x80) {
                const b = data[offset], g = data[offset+1], r = data[offset+2];
                const a = bpp === 4 ? data[offset+3] : 255;
                offset += bpp;
                for(let j=0; j<count && i<width*height; j++, i++) {
                    pixels[i*4] = r; pixels[i*4+1] = g; pixels[i*4+2] = b; pixels[i*4+3] = a;
                }
            } else {
                for(let j=0; j<count && i<width*height; j++, i++) {
                    const b = data[offset], g = data[offset+1], r = data[offset+2];
                    const a = bpp === 4 ? data[offset+3] : 255;
                    offset += bpp;
                    pixels[i*4] = r; pixels[i*4+1] = g; pixels[i*4+2] = b; pixels[i*4+3] = a;
                }
            }
        }
    } else {
        throw new Error('Unsupported TGA type: '+imageType);
    }
    
    // Flip if bottom-origin
    if(!topOrigin) {
        const rowBytes = width * 4;
        for(let y=0; y<height/2; y++) {
            const src1 = y * rowBytes;
            const src2 = (height - 1 - y) * rowBytes;
            for(let x=0; x<rowBytes; x++) {
                const tmp = pixels[src1+x];
                pixels[src1+x] = pixels[src2+x];
                pixels[src2+x] = tmp;
            }
        }
    }
    
    return { data: pixels, width, height, format: 'rgba' };
}

function parseATT(buf) {
    const u8 = new Uint8Array(buf);
    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const candidates = [];
    
    // Header 12: u32 + u32w + u32h + data
    if(u8.length >= 12) {
        const w = view.getUint32(4, true);
        const h = view.getUint32(8, true);
        if(w>0 && h>0 && w<=1024 && h<=1024 && u8.length === 12 + w*h) {
            candidates.push({w,h,cells:u8.slice(12),fmt:'h12-plain'});
            candidates.push({w,h,cells:xor3(u8,12),fmt:'h12-xor3'});
        }
    }
    // Header 4: u32 + w*h data (square)
    if(u8.length >= 4) {
        const n = u8.length - 4;
        const side = Math.sqrt(n);
        if(Number.isInteger(side) && side>=16 && side<=1024) {
            candidates.push({w:side,h:side,cells:u8.slice(4),fmt:'h4-plain'});
            candidates.push({w:side,h:side,cells:xor3(u8,4),fmt:'h4-xor3'});
        }
    }
    // MuPromax: 3 junk + 256*256 xor3
    if(u8.length === 3 + 256*256) {
        candidates.push({w:256,h:256,cells:xor3(u8,3),fmt:'mupromax'});
    }
    // Raw square
    {
        const side = Math.sqrt(u8.length);
        if(Number.isInteger(side) && side>=16 && side<=1024) {
            candidates.push({w:side,h:side,cells:u8.slice(),fmt:'raw-plain'});
            candidates.push({w:side,h:side,cells:xor3(u8,0),fmt:'raw-xor3'});
        }
    }
    
    // Score candidates
    function score(cells) {
        if(!cells.length) return -1;
        const freq = new Map();
        for(const v of cells) freq.set(v, (freq.get(v)||0)+1);
        if(freq.size > 64) return -1;
        const zeros = freq.get(0)||0;
        if(zeros < cells.length * 0.2) return -1;
        let s = freq.size <= 16 ? 50 : 20;
        s += Math.min(100, (zeros/cells.length)*200);
        return s;
    }
    
    let best = null, bestScore = -1;
    for(const c of candidates) {
        const s = score(c.cells);
        if(s > bestScore) { best = c; bestScore = s; }
    }
    return best ? {width:best.w, height:best.h, cells:best.cells, format:best.fmt} : null;
}
`;

let _worker = null;
let _workerSeq = 0;
function getWorker() {
    if (_worker) return Promise.resolve(_worker);
    return new Promise((resolve) => {
        const blob = new Blob([_workerCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        _worker = new Worker(url);
        _worker.onmessage = (e) => {
            // R12.6 (t-muhggfq5-u): match pela key única por request — eco
            // `key`, com fallback a `path` p/ workers antigos (paridade).
            const { path, key, success, result, error } = e.data;
            const id = key ?? path;
            const pending = _worker._pending?.get(id);
            if (pending) {
                if (success) pending.resolve(result);
                else pending.reject(new Error(error));
                _worker._pending.delete(id);
            }
        };
        _worker._pending = new Map();
        resolve(_worker);
    });
}

function runWorker(task, data, path) {
    return getWorker().then(w => new Promise((resolve, reject) => {
        // R12.6 (t-muhggfq5-u) DOIS bugs reais do build físico:
        // (1) CHAVE: _pending era Map POR PATH. Com 41 placements de árvore
        //     carregando a MESMA textura (Object1/tree_07.OZT) em rajada, cada
        //     set() sobrescrevia — só o último caller resolvia, os demais
        //     nunca concluíam/rejeitavam. Agora key = seq::task::path, ecoada
        //     pelo worker.
        // (2) TRANSFER DETACH: `[data]` transferia o ArrayBuffer — o MESMO
        //     objeto guardado no memoryCache do fetchBinary. Após o primeiro
        //     decode, o cache ficava com buffer detacado (0 bytes) e TODO
        //     re-request do asset recebia payload vazio → decodeOZJ/OZT
        //     throw → catch silencioso → flood "textura não encontrada"
        //     (41× no console físico, árvores da Lorencia ocultadas).
        //     Cópia barata por decode; cache nunca é corrompido.
        const key = `${_workerSeq++}::${task}::${path}`;
        w._pending.set(key, { resolve, reject });
        const payload = data.slice(0);
        w.postMessage({ task, data: payload, path, key }, [payload]);
    }));
}

// ============================================================
// Main MUAssetLoader Class
// ============================================================

export class MUAssetLoader {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || ASSET_BASE_URL;
        this.useWorkers = options.useWorkers !== false;
        this.useIDB = options.useIDB !== false;
        // RemoteAssets é um SINGLETON (export const RemoteAssets = new
        // RemoteAssetSystem() em data/RemoteAssets.js:335) — usar direto,
        // nunca `new RemoteAssets()` (quebra boot: "not a constructor").
        this.remoteAssets = RemoteAssets;
        this.remoteAssets.configure(this.baseUrl);
        
        // In-memory caches
        this._bmdCache = new Map();
        this._bmdInflight = new Map();
        this._bmdAuthority = this.remoteAssets.authorityKey;
        this._bmdEpoch = 0;
        this._textureCache = new Map();
        this._textureInflight = new Map();
        this._textureAuthority = this.remoteAssets.authorityKey;
        this._textureEpoch = 0;
        this._audioCache = new Map();
        this._attCache = new Map();
        this._attAuthority = this.remoteAssets.authorityKey;
        this._dataCache = new Map();
        // R13: CanvasImageSource cache para UI 2D (skills/buffs). loadTexture()
        // retorna um descriptor lazy, não uma THREE.Texture pronta; consumidores
        // 2D não podem ler descriptor.image. Este cache mantém o decode real
        // aguardado uma vez por asset, sem duplicar fetch/parse.
        this._imageSourceCache = new Map();
        // R12.6: dedup de logs de erro de textura (candidato resolvido mas
        // falho + miss final) — evita o flood 41× por rajada de placements.
        this._texErrLogged = new Set();
    }

    // ---------- Public API ----------

    /**
     * Load any asset by path. Auto-detects type from extension.
     * @param {string} relPath - Relative path from Data/ (e.g., 'Player/Knight.bmd')
     * @returns {Promise<any>} Parsed asset ready for Three.js / Web Audio
     */
    async load(relPath) {
        const type = detectAssetType(relPath);
        switch (type) {
            case AssetType.BMD: return this.loadBMD(relPath);
            case AssetType.OZJ: return this.loadTexture(relPath);
            case AssetType.OZT: return this.loadTexture(relPath);
            case AssetType.WAV:
            case AssetType.MP3: return this.loadAudio(relPath);
            case AssetType.ATT: return this.loadAttMap(relPath);
            case AssetType.TER: return this.loadTerrain(relPath);
            case AssetType.LST:
            case AssetType.TXT: return this.loadDataList(relPath);
            default: throw new Error(`Unsupported asset type: ${relPath}`);
        }
    }

    /**
     * Load and parse a .bmd model file
     * @param {string} relPath - e.g. 'Player/Knight.bmd' or 'Monster/bullfighter01.bmd'
     * @returns {Promise<Object>} { meshes, bones, actions, version, source }
     */
    async loadBMD(relPath) {
        const authority = this.remoteAssets.authorityKey;
        if (authority !== this._bmdAuthority) {
            this._bmdAuthority = authority;
            this._bmdEpoch++;
            this._bmdCache.clear();
            this._bmdInflight.clear();
        }
        // Check memory cache
        if (this._bmdCache.has(relPath)) return this._bmdCache.get(relPath);
        if (this._bmdInflight.has(relPath)) return this._bmdInflight.get(relPath);
        const epoch = this._bmdEpoch;
        const job = this._loadBMDUncached(relPath, authority, epoch);
        this._bmdInflight.set(relPath, job);
        try { return await job; }
        finally {
            if (this._bmdInflight.get(relPath) === job) this._bmdInflight.delete(relPath);
        }
    }

    async _loadBMDUncached(relPath, authority, epoch) {
        const assertCurrent = () => {
            if (epoch !== this._bmdEpoch || authority !== this.remoteAssets.authorityKey) {
                const error = new Error(`BMD load superseded: ${relPath}`);
                error.code = 'MUWEB_STALE_ASSET_LOAD';
                throw error;
            }
        };
        // Parsed records from another Data root (including legacy unscoped
        // records) must never become the new authority's skeleton/geometry.
        const storageKey = `bmd:${authority}:${relPath}`;

        // Check IndexedDB
        if (this.useIDB) {
            const cached = await idbGet(storageKey);
            assertCurrent();
            if (cached) {
                this._bmdCache.set(relPath, cached);
                return cached;
            }
        }

        // Fetch binary
        const buf = await this.remoteAssets.fetchBinary(relPath);
        assertCurrent();
        if (!buf) throw new Error(`Failed to fetch BMD: ${relPath}`);

        // Detect format
        const fmt = detectBMDFormat(buf);
        let parsed;

        if (fmt === 'v12' || fmt === 'v10') {
            // REAL — Main 5.2 BMD v12: decrypt MapFileDecrypt
            // (ZzzLodTerrain.h:150) + layout BMD::Open2 (ZzzBMD.cpp:2876).
            // v10: MESMO layout, payload LIMPO do offset 4 (sem decrypt) —
            // ZzzBMD.cpp:17924-17932; provado em Monster01/03/10 + peças MG
            // Class04 (probe .port_scratch/probe-bmd-v10-layout.mjs).
            const model = parseBMD(buf);
            parsed = bmdToRenderData(model, relPath);
        } else if (fmt === 'old') {
            parsed = this.useWorkers ? await runWorker('parseBMD', buf, relPath)
                                     : this._parseOldBMD(buf);
        } else {
            // Fail-closed: formato desconhecido é erro, nunca placeholder.
            throw new Error(`BMD formato inválido (${fmt}): ${relPath}`);
        }

        // A worker may finish after Data/cache authority changed during parse.
        assertCurrent();
        // Cache
        this._bmdCache.set(relPath, parsed);
        if (this.useIDB) await idbSet(storageKey, parsed, AssetType.BMD);
        assertCurrent();

        return parsed;
    }

    /**
     * Load texture (.ozj or .ozt) and return Three.js Texture
     * @param {string} relPath - e.g. 'Interface/back1.OZJ' or 'Player/Armor01.ozt'
     * @returns {Promise<THREE.Texture>}
     */
    _invalidateTextureGeneration() {
        this._textureEpoch++;
        this._textureCache.clear();
        this._textureInflight.clear();
        for (const v of this._imageSourceCache.values()) {
            Promise.resolve(v).then((img) => { try { img?.close?.(); } catch (_) {} }).catch(() => {});
        }
        this._imageSourceCache.clear();
        this._texErrLogged.clear();
        // Published scene textures remain owned by their existing consumers.
        // Invalidation prevents reuse/publication, not a premature GPU disposal.
    }

    _syncTextureAuthority() {
        // FIX49: compare the exact same identity that is stored/published.
        // authorityKey = baseUrl + physical Data revision. Comparing the stored
        // authorityKey against baseUrl made every texture request look like a
        // Data-root change, incrementing the epoch and superseding concurrent
        // loads. The renderer then fail-closed those stale jobs as invisible
        // meshes, making terrain objects, player parts, weapons and items vanish.
        const authority = this.remoteAssets.authorityKey;
        if (this._textureAuthority !== authority) {
            this._textureAuthority = authority;
            this._invalidateTextureGeneration();
        }
        return { authority: this._textureAuthority, epoch: this._textureEpoch };
    }

    _assertTextureGeneration({ authority, epoch }, relPath) {
        if (authority !== this.remoteAssets.authorityKey || epoch !== this._textureEpoch) {
            const error = new Error(`Texture load superseded: ${relPath}`);
            error.code = 'MUWEB_STALE_ASSET_LOAD';
            throw error;
        }
    }

    async loadTexture(relPath) {
        const generation = this._syncTextureAuthority();
        if (this._textureCache.has(relPath)) return this._textureCache.get(relPath);
        if (this._textureInflight.has(relPath)) return this._textureInflight.get(relPath);
        const job = this._loadTextureUncached(relPath, generation);
        this._textureInflight.set(relPath, job);
        try { return await job; }
        finally { if (this._textureInflight.get(relPath) === job) this._textureInflight.delete(relPath); }
    }

    async _loadTextureUncached(relPath, generation) {
        const assertCurrent = () => this._assertTextureGeneration(generation, relPath);
        const storageKey = `texture:${generation.authority}:${relPath}`;

        if (this.useIDB) {
            const cached = await idbGet(storageKey);
            assertCurrent();
            // R12.5 anti-poison (t-mugt0lc4-j): registros pré-fix não são
            // servidos — self-healing: registro inválido → re-fetch + re-decode
            // (e o novo payload válido sobrescreve o veneno no idbSet abaixo).
            if (cached && isValidParsedTexture(cached)) {
                cached._path = relPath;
                const tex = this._createThreeTexture(cached);
                this._textureCache.set(relPath, tex);
                return tex;
            }
            if (cached) {
                console.warn(`[MUAssetLoader] registro de cache inválido rejeitado (re-decodando): ${relPath}`);
            }
        }

        const buf = await this.remoteAssets.fetchBinary(relPath);
        assertCurrent();
        if (!buf) throw new Error(`Failed to fetch texture: ${relPath}`);

        const ext = relPath.split('.').pop().toLowerCase();
        let parsed;

        if (['jpg', 'jpeg', 'png', 'bmp'].includes(ext)) {
            parsed = { format: ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : 'image', needsDecode: true,
                data: new Uint8Array(buf), mimeType: ext === 'png' ? 'image/png' : ext === 'bmp' ? 'image/bmp' : 'image/jpeg' };
        } else if (this.useWorkers) {
            parsed = await runWorker(ext === 'ozj' ? 'decodeOZJ' : 'decodeOZT', buf, relPath);
        } else {
            parsed = ext === 'ozj' ? this._decodeOZJ(buf) : this._decodeOZT(buf);
        }

        assertCurrent();
        // Cache parsed pixel data
        parsed._path = relPath; // diagnóstico: o TextureLoader async-fail deve saber qual arquivo
        // Write-path anti-poison: nunca persistir payload que o validador
        // rejeitaria no read — fail-closed na origem, não só no consumo.
        if (this.useIDB) {
            if (isValidParsedTexture(parsed)) {
                await idbSet(storageKey, parsed, ext === 'ozj' ? AssetType.OZJ : AssetType.OZT);
            } else {
                console.warn(`[MUAssetLoader] payload pós-decode inválido NÃO cacheado: ${relPath}`);
            }
        }

        assertCurrent();
        const tex = this._createThreeTexture(parsed);
        this._textureCache.set(relPath, tex);
        return tex;
    }

    /**
     * Carrega uma textura MU como CanvasImageSource REAL e AGUARDA os pixels.
     *
     * R13: loadTexture() devolve um descriptor lazy com createThreeTexture().
     * SkillIcons/BuffIcons tratavam esse descriptor como THREE.Texture e liam
     * `tex.image`, que é inexistente; por isso os sheets presentes no manifest
     * apareciam como "sem pixels" no console. Este caminho reutiliza o MESMO
     * decoder OZJ/OZT e entrega ImageBitmap/HTMLImageElement/Canvas somente
     * depois do decode concluído. Nenhum placeholder é criado.
     */
    async loadImageSource(relPath) {
        const generation = this._syncTextureAuthority();
        const assertCurrent = () => this._assertTextureGeneration(generation, relPath);
        if (this._imageSourceCache.has(relPath)) return this._imageSourceCache.get(relPath);

        const pending = (async () => {
            const desc = await this.loadTexture(relPath);
            assertCurrent();
            if (!desc) throw new Error(`Texture descriptor ausente: ${relPath}`);

            if (desc.format === 'rgba' && desc.data && desc.width > 0 && desc.height > 0) {
                if (typeof document === 'undefined') throw new Error('Canvas DOM indisponível');
                const canvas = document.createElement('canvas');
                canvas.width = desc.width;
                canvas.height = desc.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('Canvas 2D indisponível');
                const imageData = ctx.createImageData(desc.width, desc.height);
                imageData.data.set(desc.data);
                ctx.putImageData(imageData, 0, 0);
                return canvas;
            }

            if ((desc.format === 'jpeg' || desc.format === 'image') && desc.needsDecode && desc.data?.byteLength) {
                const blob = new Blob([desc.data], { type: desc.mimeType || 'image/jpeg' });
                // createImageBitmap é o caminho preferido: decode assíncrono real,
                // sem depender do TextureLoader/RAF do Three.
                if (typeof createImageBitmap === 'function') {
                    const bitmap = await createImageBitmap(blob);
                    if (!bitmap || bitmap.width <= 0 || bitmap.height <= 0) {
                        try { bitmap?.close?.(); } catch (_) {}
                        throw new Error('ImageBitmap JPEG sem pixels');
                    }
                    try { assertCurrent(); } catch (e) { bitmap.close?.(); throw e; }
                    return bitmap;
                }
                if (typeof Image === 'undefined') throw new Error('Decoder de imagem do browser indisponível');
                const url = URL.createObjectURL(blob);
                try {
                    const img = await new Promise((resolve, reject) => {
                        const i = new Image();
                        i.onload = () => resolve(i);
                        i.onerror = () => reject(new Error('JPEG decode falhou'));
                        i.src = url;
                    });
                    if (!img || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
                        throw new Error('HTMLImageElement JPEG sem pixels');
                    }
                    assertCurrent();
                    return img;
                } finally {
                    URL.revokeObjectURL(url);
                }
            }

            throw new Error(`Textura sem formato 2D utilizável: ${relPath}`);
        })();

        this._imageSourceCache.set(relPath, pending);
        try {
            return await pending;
        } catch (e) {
            if (this._imageSourceCache.get(relPath) === pending) this._imageSourceCache.delete(relPath);
            throw e;
        }
    }

    /**
     * Resolve o FileName interno do BMD (ex: "skin_barbarian_01.jpg") para o
     * arquivo real do cliente, testando as convenções (Dir + .OZJ/.OZT/.jpg),
     * e devolve a THREE.Texture. Fail-closed: null se nenhum existir.
     * @param {string} fileName nome dentro do BMD
     * @param {string} modelDir pasta do modelo ('Player' | 'Monster' | ...)
     */
    async loadModelTexture(fileName, modelDir = 'Player') {
        if (!fileName) return null;
        const generation = this._syncTextureAuthority();
        const assertCurrent = () => this._assertTextureGeneration(generation, fileName);
        const rawName = String(fileName).trim();
        const extMatch = rawName.match(/^(.*)\.([^.\\/]+)$/);
        let extHint = (extMatch?.[2] || '').toLowerCase();
        // BMD texture names are fixed 32-byte fields. Real custom Player BMDs
        // can therefore contain a visibly truncated suffix such as `.jp` when
        // the authored `.jpg` reached the field boundary (the physical client
        // resolves the basename through its global texture namespace). Treat
        // these fixed-field truncations as their intended image family instead
        // of probing `name.jp.ozj`, which can never exist.
        if (extHint === 'j' || extHint === 'jp' || extHint === 'jpe') extHint = 'jpg';
        if (extHint === 't' || extHint === 'tg') extHint = 'tga';
        const stripExt = Boolean(extMatch) && ['jpg','jpeg','tga','png','bmp','ozj','ozt','jpg','tga'].includes(extHint);
        const base = stripExt ? extMatch[1] : rawName.replace(/\.(jpg|jpeg|tga|png|bmp|ozj|ozt)$/i, '');
        // PC usa o tipo de textura referenciado pelo BMD. Quando existem
        // foo.OZJ E foo.OZT, escolher OZJ primeiro para um FileName .tga perde
        // o canal alpha e produz os grandes quads pretos vistos no World1.
        // Mantemos fallback cruzado, mas a extensão original define prioridade.
        const preferredExts = extHint === 'tga'
            ? ['ozt', 'ozj']
            : (extHint === 'jpg' || extHint === 'jpeg')
                ? ['ozj', 'ozt']
                : ['ozj', 'ozt'];
        const texVariants = (dir) => preferredExts.flatMap((ext) => [
            `${dir}/${base}.${ext}`, `${dir}/${base}.${ext.toUpperCase()}`
        ]);
        // Mantém os spellings literais legados para auditorias/contratos R12.3;
        // Set dedup preserva a prioridade definida em texVariants acima.
        const legacyLowercaseCandidates = [`${modelDir}/${base}.ozj`, `${modelDir}/${base}.ozt`];
        // O Data real mistura extensão maiúscula/minúscula por mapa
        // (ex.: Object95/ship07.ozj + ship07.ozt e fairy2RHMakers.ozt).
        // O asset-server usa manifest/paths case-sensitive; tentar somente
        // .OZJ/.OZT fazia 404 mesmo com o arquivo presente.
        const candidates = [...new Set([
            ...texVariants(modelDir),
            ...legacyLowercaseCandidates,
            `${modelDir}/${fileName}`,
            `${modelDir}/${String(fileName).toLowerCase()}`,
            // Main 5.2 Bitmaps é um namespace global: BMDs custom podem
            // referenciar só o basename embora a textura física esteja em outro
            // diretório padrão. Espelhar a mesma ordem de fallback da porta PC.
            ...texVariants('Item'),
            ...texVariants('Player'),
            ...texVariants('Effect'),
            ...texVariants('Skill'),
            ...texVariants('Logo'),
            ...texVariants('Npc'),
            ...texVariants('Monster'),
        ])];
        for (const cand of candidates) {
            try {
                const canonical = await this.remoteAssets.resolveExistingPath(cand);
                assertCurrent();
                if (!canonical) continue;
                // loadTexture fará o único fetch/cache necessário no path canônico.
                const texture = await this.loadTexture(canonical);
                assertCurrent();
                return texture;
            } catch (e) {
                if (e?.code === 'MUWEB_STALE_ASSET_LOAD') throw e;
                // R12.6 (t-muhggfq5-u) OBSERVABILIDADE: candidato que RESOLVEU
                // no manifest mas falhou no fetch/decode é BUG REAL (ex.: o
                // flood físico tree_07 — buffer detacado por transfer antigo
                // do worker). Engolir o erro aqui impedia o diagnóstico.
                // Dedup por candidato+erro para não spammar a console.
                const k = `${cand}::${e?.message || e}`;
                if (!this._texErrLogged.has(k)) {
                    this._texErrLogged.add(k);
                    console.warn(`[MUAssetLoader] candidato resolvido falhou: ${cand} — ${e?.message || e}`);
                }
            }
        }
        // Dedup do miss final: a mesma textura ausente é pedida por dezenas
        // de placements (ex.: 41 árvores Object07) — 1 log basta.
        const missKey = `${modelDir}/${fileName}`;
        if (!this._texErrLogged.has(missKey)) {
            this._texErrLogged.add(missKey);
            console.warn(`[MUAssetLoader] textura não encontrada: ${fileName} (dir=${modelDir})`);
        }
        return null;
    }

    /**
     * Load audio (.wav or .mp3) and return AudioBuffer
     * @param {string} relPath - e.g. 'Sound/iButtonClick.wav'
     * @returns {Promise<AudioBuffer>}
     */
    async loadAudio(relPath) {
        if (this._audioCache.has(relPath)) return this._audioCache.get(relPath);

        const buf = await this.remoteAssets.fetchBinary(relPath);
        if (!buf) throw new Error(`Failed to fetch audio: ${relPath}`);

        // Need AudioContext to decode
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        const audioBuffer = await ctx.decodeAudioData(buf.slice(0));

        this._audioCache.set(relPath, audioBuffer);
        return audioBuffer;
    }

    /**
     * Load terrain attribute map (.att)
     * @param {string} relPath - e.g. 'World1/Terrain1.att'
     * @returns {Promise<Object>} { width, height, cells: Uint8Array, format }
     */
    async loadAttMap(relPath) {
        const currentAuthority = this.remoteAssets.authorityKey;
        if (this._attAuthority !== currentAuthority) {
            this._attAuthority = currentAuthority;
            this._attCache.clear();
        }
        if (this._attCache.has(relPath)) return this._attCache.get(relPath);

        const attStorageKey = `att:${currentAuthority}:${relPath}`;
        if (this.useIDB) {
            const cached = await idbGet(attStorageKey);
            if (cached) {
                this._attCache.set(relPath, cached);
                return cached;
            }
        }

        const buf = await this.remoteAssets.fetchBinary(relPath);
        if (!buf) throw new Error(`Failed to fetch ATT: ${relPath}`);

        let parsed;
        if (this.useWorkers) {
            parsed = await runWorker('parseATT', buf, relPath);
        } else {
            parsed = this._parseATT(buf);
        }

        if (!parsed) throw new Error(`Failed to parse ATT: ${relPath}`);

        this._attCache.set(relPath, parsed);
        if (this.useIDB) await idbSet(attStorageKey, parsed, AssetType.ATT);

        return parsed;
    }

    /**
     * Load terrain heightmap (.ter / .ozb)
     * @param {string} relPath - e.g. 'World1/TerrainHeight.ozb'
     * @returns {Promise<Object>} { width, height, heights: Float32Array }
     */
    async loadTerrain(relPath) {
        // .ter files are typically OZB (BMP with header) or raw height data
        const buf = await this.remoteAssets.fetchBinary(relPath);
        if (!buf) throw new Error(`Failed to fetch terrain: ${relPath}`);

        // Try to parse as OZB (BMP with 1078-byte header)
        const u8 = new Uint8Array(buf);
        if (u8[0] === 0x42 && u8[1] === 0x4D) { // BMP signature
            const width = u8[18] | (u8[19] << 8) | (u8[20] << 16) | (u8[21] << 24);
            const height = u8[22] | (u8[23] << 8) | (u8[24] << 16) | (u8[25] << 24);
            const dataOffset = u8[10] | (u8[11] << 8) | (u8[12] << 16) | (u8[13] << 24);
            const pixelData = u8.slice(dataOffset);
            
            // BMP is bottom-up, 24-bit or 32-bit
            const bpp = u8[28] | (u8[29] << 8);
            const rowSize = Math.floor((bpp * width + 31) / 32) * 4;
            const heights = new Float32Array(width * height);
            
            for (let y = 0; y < height; y++) {
                const rowStart = y * rowSize;
                for (let x = 0; x < width; x++) {
                    const pixelOffset = rowStart + x * (bpp / 8);
                    // Use red channel as height (grayscale)
                    heights[(height - 1 - y) * width + x] = pixelData[pixelOffset] / 255 * 255; // Scale as needed
                }
            }
            return { width, height, heights };
        }

        // Fallback: assume raw float32 heightmap
        const floats = new Float32Array(buf);
        const side = Math.sqrt(floats.length);
        if (Number.isInteger(side)) {
            return { width: side, height: side, heights: floats };
        }

        throw new Error(`Unknown terrain format: ${relPath}`);
    }

    /**
     * Load data list (.lst or .txt) - items, monsters, skills, etc.
     * @param {string} relPath - e.g. 'Item/Item.txt' or 'Monster/Monster.txt'
     * @returns {Promise<Array<Object>>} Parsed rows
     */
    async loadDataList(relPath) {
        if (this._dataCache.has(relPath)) return this._dataCache.get(relPath);

        const buf = await this.remoteAssets.fetchBinary(relPath);
        if (!buf) throw new Error(`Failed to fetch data list: ${relPath}`);

        const text = new TextDecoder('euc-kr').decode(buf); // MU uses Korean encoding
        const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('//') && !l.startsWith('#'));
        
        // Try to parse as CSV/tab-separated
        const parsed = lines.map(line => {
            const parts = line.split(/\t|,|\s+/).filter(p => p);
            return parts;
        }).filter(p => p.length > 0);

        this._dataCache.set(relPath, parsed);
        return parsed;
    }

    /**
     * Preload multiple assets with progress callback
     * @param {string[]} paths - Array of relative paths
     * @param {Function} onProgress - Callback(done, total, currentPath)
     * @returns {Promise<Array<{path, success, error}>>}
     */
    async preload(paths, onProgress) {
        const results = [];
        for (let i = 0; i < paths.length; i++) {
            const path = paths[i];
            try {
                await this.load(path);
                results.push({ path, success: true });
            } catch (e) {
                results.push({ path, success: false, error: e.message });
            }
            if (onProgress) onProgress(i + 1, paths.length, path);
        }
        return results;
    }

    // ---------- Internal Parsers (Main Thread Fallback) ----------

    _parseOldBMD(buf) {
        const u8 = new Uint8Array(buf);
        const dv = new DataView(buf);
        let off = 4; // Skip "BMD\x1A"
        const rdU8 = () => dv.getUint8(off++);
        const rdI16 = () => { const v = dv.getInt16(off, true); off += 2; return v; };
        const rdU16 = () => { const v = dv.getUint16(off, true); off += 2; return v; };
        const rdF32 = () => { const v = dv.getFloat32(off, true); off += 4; return v; };
        const rdStr = (n) => { let s = ''; for (let i = 0; i < n; i++) { const c = u8[off++]; if (c !== 0) s += String.fromCharCode(c); } return s; };

        const version = rdU16(); off += 2;
        const numMeshes = rdU16();
        const numBones = rdU16();
        const numActions = rdU16();

        const meshes = [];
        for (let m = 0; m < numMeshes; m++) {
            const name = rdStr(32);
            const numVerts = rdU16();
            const numNorms = rdU16();
            const numTris = rdU16();
            const vSize = 3 * 4 + 3 * 4 + 2 * 4 + 1;
            
            const positions = new Float32Array(numVerts * 3);
            const normals = new Float32Array(numVerts * 3);
            const uvs = new Float32Array(numVerts * 2);
            const skinIndices = new Uint16Array(numVerts * 4);
            const skinWeights = new Float32Array(numVerts * 4);

            for (let v = 0; v < numVerts; v++) {
                positions[v * 3] = rdF32(); positions[v * 3 + 1] = rdF32(); positions[v * 3 + 2] = rdF32();
                normals[v * 3] = rdF32(); normals[v * 3 + 1] = rdF32(); normals[v * 3 + 2] = rdF32();
                uvs[v * 2] = rdF32(); uvs[v * 2 + 1] = rdF32();
                const bone = rdU8();
                skinIndices[v * 4] = bone; skinWeights[v * 4] = 1.0;
            }
            const indices = new Uint16Array(numTris * 3);
            for (let t = 0; t < numTris * 3; t++) indices[t] = rdU16();

            const texName = rdStr(32);
            meshes.push({ name, positions, normals, uvs, indices, skinIndices, skinWeights, texture: texName });
        }

        const bones = [];
        for (let b = 0; b < numBones; b++) {
            const dummy = rdU8();
            const name = rdStr(32);
            const parent = rdI16();
            const matrix = new Float32Array(12);
            for (let i = 0; i < 12; i++) matrix[i] = rdF32();
            bones.push({ dummy, name, parent, matrix });
        }

        const actions = [];
        for (let a = 0; a < numActions; a++) {
            const numFrames = rdU16();
            const playFlag = rdU16();
            // Skip frame data for now (too large for main thread)
            const frameSize = numBones * 12 * 4;
            off += numFrames * frameSize;
            actions.push({ numFrames, playFlag, frames: [] });
        }

        return { version, numMeshes, numBones, numActions, meshes, bones, actions, source: relPath };
    }

    _decodeOZJ(buf) {
        let data = new Uint8Array(buf);
        if (data.length > 24 && data[0] === 0x68 && data[1] === 0xA2 && data[2] === 0xD2 && data[3] === 0x20 &&
            data[4] === 0xA4 && data[5] === 0x43 && data[6] === 0x41 && data[7] === 0xDE) {
            data = xor3Decrypt(data, 8);
        }
        // R12.4/R12.5: strip de envelope MuPromax, compartilhado main+worker,
        // com validação de marcador (01 não basta; exige FF D8 FF).
        data = stripOzJEnvelope(data);
        return { data, format: 'jpeg', needsDecode: true };
    }

    _decodeOZT(buf) {
        const u8 = new Uint8Array(buf);
        let data = u8;

        // R12.5: OZT custom MuPromax (22B header). A maioria das texturas de
        // Object75/Object95 NÃO é TGA padrão — sem este caminho, o parser lia
        // offsets TGA nos bytes errados (w=0/h=0) e caía no
        // "Textura MU inválida/sem pixels" + mesh ocultado mesmo com o arquivo
        // perfeitamente válido no Data do usuário. Compartilhado com worker.
        const custom = decodeOZTCustom(u8);
        if (custom) return custom;

        // MuPromax style: 3 junk bytes + XOR3
        if (u8.length === 3 + 256 * 256 * 4) {
            data = xor3Decrypt(u8, 3);
        } else if (u8.length > 18) {
            const dec = xor3Decrypt(u8, 0);
            if (dec[2] === 2 || dec[2] === 10) data = dec;
        }

        const idLength = data[0];
        const colorMapType = data[1];
        const imageType = data[2];
        if (colorMapType !== 0) throw new Error('Colormap TGA not supported');

        const width = data[12] | (data[13] << 8);
        const height = data[14] | (data[15] << 8);
        const bpp = data[16] >> 3;
        if (bpp !== 3 && bpp !== 4) throw new Error('Only 24/32-bit TGA supported');

        const descriptor = data[17];
        const topOrigin = (descriptor & 0x20) !== 0;

        let offset = 18 + idLength;
        const pixels = new Uint8ClampedArray(width * height * 4);

        if (imageType === 2) {
            for (let i = 0; i < width * height; i++) {
                const b = data[offset], g = data[offset + 1], r = data[offset + 2];
                const a = bpp === 4 ? data[offset + 3] : 255;
                offset += bpp;
                pixels[i * 4] = r; pixels[i * 4 + 1] = g; pixels[i * 4 + 2] = b; pixels[i * 4 + 3] = a;
            }
        } else if (imageType === 10) {
            let i = 0;
            while (i < width * height) {
                const header = data[offset++];
                const count = (header & 0x7F) + 1;
                if (header & 0x80) {
                    const b = data[offset], g = data[offset + 1], r = data[offset + 2];
                    const a = bpp === 4 ? data[offset + 3] : 255;
                    offset += bpp;
                    for (let j = 0; j < count && i < width * height; j++, i++) {
                        pixels[i * 4] = r; pixels[i * 4 + 1] = g; pixels[i * 4 + 2] = b; pixels[i * 4 + 3] = a;
                    }
                } else {
                    for (let j = 0; j < count && i < width * height; j++, i++) {
                        const b = data[offset], g = data[offset + 1], r = data[offset + 2];
                        const a = bpp === 4 ? data[offset + 3] : 255;
                        offset += bpp;
                        pixels[i * 4] = r; pixels[i * 4 + 1] = g; pixels[i * 4 + 2] = b; pixels[i * 4 + 3] = a;
                    }
                }
            }
        } else {
            throw new Error(`Unsupported TGA type: ${imageType}`);
        }

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

        return { data: pixels, width, height, format: 'rgba' };
    }

    _parseATT(buf) {
        const u8 = new Uint8Array(buf);
        const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        const candidates = [];

        if (u8.length >= 12) {
            const w = view.getUint32(4, true);
            const h = view.getUint32(8, true);
            if (w > 0 && h > 0 && w <= 1024 && h <= 1024 && u8.length === 12 + w * h) {
                candidates.push({ w, h, cells: u8.slice(12), fmt: 'h12-plain' });
                candidates.push({ w, h, cells: xor3Decrypt(u8, 12), fmt: 'h12-xor3' });
            }
        }
        if (u8.length >= 4) {
            const n = u8.length - 4;
            const side = Math.sqrt(n);
            if (Number.isInteger(side) && side >= 16 && side <= 1024) {
                candidates.push({ w: side, h: side, cells: u8.slice(4), fmt: 'h4-plain' });
                candidates.push({ w: side, h: side, cells: xor3Decrypt(u8, 4), fmt: 'h4-xor3' });
            }
        }
        if (u8.length === 3 + 256 * 256) {
            candidates.push({ w: 256, h: 256, cells: xor3Decrypt(u8, 3), fmt: 'mupromax' });
        }
        {
            const side = Math.sqrt(u8.length);
            if (Number.isInteger(side) && side >= 16 && side <= 1024) {
                candidates.push({ w: side, h: side, cells: u8.slice(), fmt: 'raw-plain' });
                candidates.push({ w: side, h: side, cells: xor3Decrypt(u8, 0), fmt: 'raw-xor3' });
            }
        }

        function score(cells) {
            if (!cells.length) return -1;
            const freq = new Map();
            for (const v of cells) freq.set(v, (freq.get(v) || 0) + 1);
            if (freq.size > 64) return -1;
            const zeros = freq.get(0) || 0;
            if (zeros < cells.length * 0.2) return -1;
            let s = freq.size <= 16 ? 50 : 20;
            s += Math.min(100, (zeros / cells.length) * 200);
            return s;
        }

        let best = null, bestScore = -1;
        for (const c of candidates) {
            const s = score(c.cells);
            if (s > bestScore) { best = c; bestScore = s; }
        }
        return best ? { width: best.w, height: best.h, cells: best.cells, format: best.fmt } : null;
    }

    _createThreeTexture(parsed) {
        // Descriptor lazy: cada asset mantém a própria instância THREE.Texture.
        // R12.3: FAIL-CLOSED. Nunca devolver Texture vazia e nunca marcar
        // needsUpdate antes de existir image/data — isso gerava milhares de:
        // "Texture marked for update but no image data found" e contaminava
        // World95/World75 com materiais vazios.
        const owner = this;
        const desc = { ...parsed, _threeTexture: null, _pcBmdTexture: null };
        desc.createThreeTexture = function(THREE, options = {}) {
            // GlobalBitmap.cpp uploads JPEG scanlines and decoded OZT rows
            // verbatim as GL_RGB/GL_RGBA. BMD UVs remain verbatim too: no
            // browser Y-flip or sRGB transfer is part of the PC pipeline.
            // A separate shared view leaves standard UI/Sprite consumers intact.
            if (options.pcBmd === true) {
                if (desc._pcBmdTexture) return desc._pcBmdTexture;
                const source = desc.createThreeTexture(THREE);
                const view = source.clone();
                // Texture.clone shares THREE.Source. Use a separate source so
                // PC power-of-two padding never changes UI image dimensions.
                view.source = new THREE.Source(null);
                view.flipY = false;
                view.colorSpace = THREE.NoColorSpace;
                view.userData = { ...source.userData, muSharedAsset: true, muPcByteTexture: true };
                const publish = () => {
                    const image = source.image;
                    const w = Number(image?.naturalWidth || image?.width);
                    const h = Number(image?.naturalHeight || image?.height);
                    if (!(w > 0 && h > 0)) throw new Error('PC texture sem dimensões válidas');
                    const width = 2 ** Math.ceil(Math.log2(w));
                    const height = 2 ** Math.ceil(Math.log2(h));
                    if (width !== w || height !== h) {
                        // GlobalBitmap pads the upload stride, never stretches
                        // authored pixels to the allocation's Width/Height.
                        const canvas = document.createElement('canvas');
                        canvas.width = width; canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) throw new Error('Canvas 2D indisponível para padding PC');
                        ctx.drawImage(image, 0, 0);
                        view.image = canvas;
                    } else view.image = image;
                    view.userData.muImageReady = true;
                    view.needsUpdate = true;
                    return view;
                };
                if (source.userData?.muImageReady === true) publish();
                if (source.userData?.muImageReadyPromise) {
                    view.userData.muImageReadyPromise = source.userData.muImageReadyPromise.then(() =>
                        view.userData.muImageReady === true ? view : publish());
                    view.userData.muImageReadyPromise.catch(() => {});
                }
                desc._pcBmdTexture = view;
                return view;
            }
            if (desc._threeTexture) return desc._threeTexture;

            let texture;
            if ((parsed.format === 'jpeg' || parsed.format === 'image') && parsed.needsDecode && parsed.data?.byteLength) {
                const blob = new Blob([parsed.data], { type: parsed.mimeType || 'image/jpeg' });
                const url = URL.createObjectURL(blob);
                const loader = new THREE.TextureLoader();
                let resolveReady, rejectReady;
                const readyPromise = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
                texture = loader.load(
                    url,
                    (loaded) => {
                        // R90: publishing a model/icon before this callback means
                        // the BMD material exists but its JPEG has no image yet.
                        // World characters then flash white/black and inventory
                        // permanently caches that first bad offscreen frame.
                        applySettings(loaded, THREE);
                        loaded.userData ??= {};
                        loaded.userData.muImageReady = true;
                        resolveReady(loaded);
                        URL.revokeObjectURL(url);
                    },
                    undefined,
                    (err) => {
                        URL.revokeObjectURL(url);
                        // Decode errors must be retryable, never sticky cache poison.
                        if (owner._textureCache.get(parsed._path) === desc) owner._textureCache.delete(parsed._path);
                        desc._threeTexture = null;
                        desc._pcBmdTexture = null;
                        rejectReady(err instanceof Error ? err : new Error('JPEG decode falhou'));
                        // R12.4.13: logar o path real — o console do usuário
                        // no runtime físico tinha dezenas de 'JPEG decode falhou
                        // Event' sem dizer QUAL arquivo, o que impedia a
                        // investigação e exigia repetição do teste no PC dele.
                        console.error(`[MUAssetLoader] JPEG decode falhou (${parsed._path || 'desconhecido'})`, err);
                    },
                );
                texture.userData ??= {};
                texture.userData.muImageReady = false;
                texture.userData.muImageReadyPromise = readyPromise;
                // Avoid an unhandled rejection when a consumer intentionally
                // stays fail-closed and never awaits this texture.
                readyPromise.catch(() => {});
                applySettings(texture, THREE);
            } else if (parsed.format === 'rgba' && parsed.data && parsed.width > 0 && parsed.height > 0) {
                const canvas = document.createElement('canvas');
                canvas.width = parsed.width;
                canvas.height = parsed.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('Canvas 2D indisponível para textura RGBA MU');
                const imgData = ctx.createImageData(parsed.width, parsed.height);
                imgData.data.set(parsed.data);
                ctx.putImageData(imgData, 0, 0);
                texture = new THREE.CanvasTexture(canvas);
                applySettings(texture, THREE);
                texture.userData ??= {};
                texture.userData.muImageReady = true;
                texture.userData.muImageReadyPromise = Promise.resolve(texture);
                // CanvasTexture já nasce com image válida e update pendente.
            } else {
                throw new Error(`Textura MU inválida/sem pixels: format=${parsed?.format || 'null'}`);
            }

            texture.userData ??= {};
            texture.userData.muSharedAsset = true;
            desc._threeTexture = texture;
            return texture;
        };

        function applySettings(texture, THREE) {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = true;
            texture.colorSpace = THREE.SRGBColorSpace;
            // r160: Texture.channel precisa ser inteiro para MAP_UV.
            if (!Number.isInteger(texture.channel)) texture.channel = 0;
        }
        return desc;
    }

    // ---------- Cache Management ----------

    clearCache(type = null) {
        if (!type || type === AssetType.BMD) {
            this._bmdEpoch++;
            this._bmdCache.clear();
            this._bmdInflight.clear();
        }
        if (!type || type === AssetType.OZJ || type === AssetType.OZT) this._invalidateTextureGeneration();
        if (!type || type === AssetType.WAV || type === AssetType.MP3) this._audioCache.clear();
        if (!type || type === AssetType.ATT) this._attCache.clear();
        if (!type || type === AssetType.LST || type === AssetType.TXT) this._dataCache.clear();
    }

    getCacheStats() {
        return {
            bmd: this._bmdCache.size,
            textures: this._textureCache.size,
            audio: this._audioCache.size,
            att: this._attCache.size,
            data: this._dataCache.size
        };
    }
}

// Singleton instance
export const MUAssets = new MUAssetLoader();

export default MUAssetLoader;
