/**
 * BmdParser.js — Parser REAL do formato BMD v12 do cliente MU (Main 5.2).
 *
 * Porte direto da source PC — sem placeholders:
 *   - Decrypt:     ZzzLodTerrain.h:150 MapFileDecrypt (XOR key 16 + rolling key)
 *   - Layout:      ZzzBMD.cpp:2876 BMD::Open2 (header BMD/v12/size, meshes, actions, bones)
 *   - Quaternion:  Math/ZzzMathLib.cpp:312 AngleQuaternion (ordem euler ZYX→quat)
 *
 * Formato (arquivo):
 *   "BMD" (3 bytes) + Version (1 byte; 12 = encriptado)
 *   [v12] LE32 encSize + encData[encSize]  → MapFileDecrypt → payload
 *   [v10] payload LIMPO direto no offset 4 (sem encSize/decrypt) — mesmo
 *         layout de structs do v12 (BMD::Open antigo, ZzzBMD.cpp:2682-2810:
 *         DataPtr=3 lê Version, DataPtr=4 segue Name/counts; Triangle_t
 *         lê 36B mas stride sizeof(Triangle_t2)=64 igual). Peças MG
 *         (Player/*Class04.bmd) são v10.
 *
 * Payload (decriptado, LE, packing MSVC x86):
 *   Name[32]
 *   i16 NumMeshs, i16 NumBones, i16 NumActions
 *   por mesh:  i16 nVertices, nNormals, nTexCoords, nTriangles, Texture
 *              Vertex_t[nV]   (16 B: i16 Node + pad2 + f32[3] Position)
 *              Normal_t[nN]   (20 B: i16 Node + pad2 + f32[3] + i16 BindVertex + pad2)
 *              TexCoord_t[nT] ( 8 B: f32 U + f32 V)
 *              Triangle_t2[nTr] (64 B: i8 Polygon + pad + i16 VI[4] + i16 NI[4] +
 *                                i16 TI[4] + pad2 + f32 LMC[8] + i16 LMI + pad2)
 *              char texFileName[32]
 *   por action: i16 NumAnimationKeys + u8 LockPositions + [vec3 Positions × keys]
 *   por bone:    u8 Dummy; !dummy → char Name[32] + i16 Parent +
 *                por action: f32 Position[keys×3] + f32 Rotation[keys×3]
 */

// ── MapFileDecrypt (ZzzLodTerrain.h:150) ────────────────────────────────────
const MAP_XOR_KEY = new Uint8Array([
    0xD1, 0x73, 0x52, 0xF6, 0xD2, 0x9A, 0xCB, 0x27,
    0x3E, 0xAF, 0x59, 0x31, 0x37, 0xB3, 0xE7, 0xA2,
]);

export function mapFileDecrypt(src) {
    const size = src.length;
    const dst = new Uint8Array(size);
    let mapKey = 0x5E;
    for (let i = 0; i < size; i++) {
        const b = src[i];
        dst[i] = ((b ^ MAP_XOR_KEY[i % 16]) - mapKey) & 0xFF;
        mapKey = (b + 0x3D) & 0xFF;
    }
    return dst;
}

// ── Leitor LE com cursor (payload decriptado) ──────────────────────────────
class Cursor {
    constructor(bytes) { this.buf = bytes; this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.ptr = 0; }
    get remaining() { return this.buf.length - this.ptr; }
    i8()  { return this.dv.getInt8(this.ptr++); }
    u8()  { return this.dv.getUint8(this.ptr++); }
    i16() { const v = this.dv.getInt16(this.ptr, true); this.ptr += 2; return v; }
    i32() { const v = this.dv.getInt32(this.ptr, true); this.ptr += 4; return v; }
    f32() { const v = this.dv.getFloat32(this.ptr, true); this.ptr += 4; return v; }
    bytes(n) { const out = this.buf.subarray(this.ptr, this.ptr + n); this.ptr += n; return out; }
    ascii(n) {
        const b = this.bytes(n);
        let end = b.indexOf(0);
        if (end < 0) end = n;
        return String.fromCharCode.apply(null, b.subarray(0, end));
    }
    skip(n) { this.ptr += n; }
}

// ── Vertex/Normal com packing MSVC (i16 + pad2 + f32×3) ─────────────────────
function readVertexT(c) {
    const node = c.i16();
    c.skip(2); // pad MSVC até align 4
    const x = c.f32(), y = c.f32(), z = c.f32();
    return { node, position: [x, y, z] };
}
function readNormalT(c) {
    const node = c.i16();
    c.skip(2);
    const x = c.f32(), y = c.f32(), z = c.f32();
    const bindVertex = c.i16();
    c.skip(2);
    return { node, normal: [x, y, z], bindVertex };
}
// Triangle_t2 no arquivo = 64 bytes; dados úteis nos primeiros 26
function readTriangleT2(c) {
    const polygon = c.i8();
    c.skip(1);
    const vi = [c.i16(), c.i16(), c.i16(), c.i16()];
    const ni = [c.i16(), c.i16(), c.i16(), c.i16()];
    const ti = [c.i16(), c.i16(), c.i16(), c.i16()];
    c.skip(64 - 26); // LMC (pad2+32) + LMI (2) + pad2 — não usados pelo render Open2
    return { polygon, vertexIndex: vi, normalIndex: ni, texCoordIndex: ti };
}

// ── Parse principal (ZzzBMD.cpp:2876 Open2) ────────────────────────────────
export function parseBMD(arrayBuffer) {
    const raw = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
    if (raw.length < 8) throw new Error('BMD: arquivo curto demais');
    if (raw[0] !== 0x42 || raw[1] !== 0x4D || raw[2] !== 0x44) {
        throw new Error('BMD: assinatura inválida (não é "BMD")');
    }
    const version = raw[3];
    let payload;
    if (version === 12) {
        const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
        const encSize = dv.getInt32(4, true);
        if (8 + encSize > raw.length) throw new Error(`BMD v12: encSize ${encSize} > arquivo ${raw.length}`);
        payload = mapFileDecrypt(raw.subarray(8, 8 + encSize));
    } else if (version === 10) {
        // BMD::Open antigo (ZzzBMD.cpp:2682): payload LIMPO no offset 4,
        // sem MapFileDecrypt. Layout de structs idêntico ao v12 (Vertex_t
        // 16B, Normal_t 20B, TexCoord_t 8B, triangle stride 64B — o loader
        // lê Triangle_t 36B mas avança sizeof(Triangle_t2)=64).
        payload = raw.subarray(4);
    } else {
        // Open2 só trata v12; Open antigo só existe nestes clientes p/ v10.
        throw new Error(`BMD: versão ${version} não suportada (esperada 12 ou 10)`);
    }

    const c = new Cursor(payload);
    const model = { name: '', meshes: [], actions: [], bones: [] };

    model.name = c.ascii(32);
    model.numMeshes = c.i16();
    model.numBones = c.i16();
    model.numActions = c.i16();
    // Bounds fiéis ao PC (ZzzBMD.cpp:2926: assert(NumBones <= MAX_BONES=200));
    // meshes=0 é VÁLIDO (Player.bmd é só esqueleto+ações, ZzzOpenData.cpp:121-126).
    if (model.numMeshes < 0 || model.numMeshes > 1024 ||
        model.numBones < 0 || model.numBones > 200 ||
        model.numActions < 0 || model.numActions > 4096) {
        throw new Error(`BMD: contadores absurdos m=${model.numMeshes} b=${model.numBones} a=${model.numActions} (layout/decrypt errado?)`);
    }

    for (let i = 0; i < model.numMeshes; i++) {
        const m = { vertices: [], normals: [], texCoords: [], triangles: [] };
        const numVertices = c.i16();
        const numNormals = c.i16();
        const numTexCoords = c.i16();
        const numTriangles = c.i16();
        m.texture = c.i16();
        m.numVertices = numVertices;
        m.numNormals = numNormals;
        m.numTexCoords = numTexCoords;
        m.numTriangles = numTriangles;
        if (numVertices > 65535 || numNormals > 65535 || numTexCoords > 65535 || numTriangles > 65535) {
            throw new Error(`BMD mesh ${i}: counts absurdos v=${numVertices} n=${numNormals} t=${numTexCoords} tr=${numTriangles}`);
        }
        for (let v = 0; v < numVertices; v++) m.vertices.push(readVertexT(c));
        for (let n = 0; n < numNormals; n++) m.normals.push(readNormalT(c));
        for (let t = 0; t < numTexCoords; t++) m.texCoords.push({ u: c.f32(), v: c.f32() });
        for (let t = 0; t < numTriangles; t++) m.triangles.push(readTriangleT2(c));
        m.texFileName = c.ascii(32);
        model.meshes.push(m);
    }

    for (let i = 0; i < model.numActions; i++) {
        const a = { numKeys: c.i16(), lockPositions: c.u8() !== 0, positions: null };
        if (a.lockPositions) {
            a.positions = [];
            for (let k = 0; k < a.numKeys; k++) a.positions.push([c.f32(), c.f32(), c.f32()]);
        }
        model.actions.push(a);
    }

    for (let i = 0; i < model.numBones; i++) {
        const dummy = c.u8() !== 0;
        const b = { dummy, name: '', parent: -1, matrices: null };
        if (!dummy) {
            b.name = c.ascii(32);
            b.parent = c.i16();
            b.matrices = [];
            for (let j = 0; j < model.numActions; j++) {
                const keys = model.actions[j].numKeys;
                const positions = [], rotations = [];
                for (let k = 0; k < keys; k++) positions.push([c.f32(), c.f32(), c.f32()]);
                for (let k = 0; k < keys; k++) rotations.push([c.f32(), c.f32(), c.f32()]);
                b.matrices.push({ positions, rotations });
            }
        }
        model.bones.push(b);
    }

    if (c.remaining !== 0) {
        // Save2 tem um overread conhecido (escreve 64B de uma struct de 36B),
        // então arquivos reais podem ter lixo de padding no fim. Tolerar <= 3.
        if (c.remaining > 3) {
            throw new Error(`BMD: ${c.remaining} bytes não consumidos (layout errado)`);
        }
    }
    return model;
}

// ── AngleQuaternion (Math/ZzzMathLib.cpp:312) — euler ZYX MU → quat XYZW ────
export function angleQuaternion(angles) {
    const sy = Math.sin(angles[2] * 0.5), cy = Math.cos(angles[2] * 0.5);
    const sp = Math.sin(angles[1] * 0.5), cp = Math.cos(angles[1] * 0.5);
    const sr = Math.sin(angles[0] * 0.5), cr = Math.cos(angles[0] * 0.5);
    return [
        sr * cp * cy - cr * sp * sy, // X
        cr * sp * cy + sr * cp * sy, // Y
        cr * cp * sy - sr * sp * cy, // Z
        cr * cp * cy + sr * sp * sy, // W
    ];
}
