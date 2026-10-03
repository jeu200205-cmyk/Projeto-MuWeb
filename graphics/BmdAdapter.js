/**
 * BmdAdapter.js — Converte o parse puro do BmdParser (estruturas fiéis ao
 * ZzzBMD.cpp:2876) para o contrato flat do MUModelRenderer (attributes Three.js).
 *
 * Regras extraídas da source PC:
 *  - Skinning: cada Vertex_t tem Node (i16) = índice do bone (1 influência).
 *  - Triângulos: Triangle_t2.Polygon = 3 (tri) ou 4 (quad, vira 2 tris).
 *    Vertex/Normal/TexCoord têm index-sets INDEPENDENTES → buffers flat por
 *    triângulo (duplica vértices em costuras de UV — mesmo enfoque de loaders).
 *  - Bind pose: primeiro keyframe da action 0 (position+rotation do bone).
 *  - Frames: posição + euler→quat (AngleQuaternion ZYX, ZzzMathLib.cpp:312) por
 *    bone, layout column-major 3×4 interleaved (12 floats/bone) conforme o
 *    _buildAnimations do renderer espera.
 *  - Eixos: dados mantidos no espaço MU (Z-up). O consumidor aplica
 *    applyMuUpAxis() (rot X −90°) no container do modelo — UM ponto só de
 *    conversão, sem tocar nos dados.
 */

import { angleQuaternion } from './BmdParser.js';

/** Converte espaço MU (Z-up) para Three.js (Y-up). Aplicar no container. */
export function applyMuUpAxis(object3D) {
    object3D.rotation.x = -Math.PI / 2;
    object3D.userData ??= {};
    object3D.userData.muPcUpAxis = true;
    object3D.traverse?.(object => {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) if (material?.uniforms?.pcChromeUpAxis) material.uniforms.pcChromeUpAxis.value = 1;
    });
}

// quat (x,y,z,w) → row-major mat3
function quatToMat3(q) {
    const [x, y, z, w] = q;
    const m = [
        1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
        2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
        2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
    ];
    return m; // [m00,m01,m02, m10,m11,m12, m20,m21,m22] row-major
}

function mulMat3(a, b) {
    return [
        a[0]*b[0] + a[1]*b[3] + a[2]*b[6], a[0]*b[1] + a[1]*b[4] + a[2]*b[7], a[0]*b[2] + a[1]*b[5] + a[2]*b[8],
        a[3]*b[0] + a[4]*b[3] + a[5]*b[6], a[3]*b[1] + a[4]*b[4] + a[5]*b[7], a[3]*b[2] + a[4]*b[5] + a[5]*b[8],
        a[6]*b[0] + a[7]*b[3] + a[8]*b[6], a[6]*b[1] + a[7]*b[4] + a[8]*b[7], a[6]*b[2] + a[7]*b[5] + a[8]*b[8],
    ];
}

function mulMat3Vec3(m, v) {
    return [
        m[0]*v[0] + m[1]*v[1] + m[2]*v[2],
        m[3]*v[0] + m[4]*v[1] + m[5]*v[2],
        m[6]*v[0] + m[7]*v[1] + m[8]*v[2],
    ];
}

/**
 * Matrizes WORLD da bind-pose no espaço MU (Z-up).
 *
 * Por que isto é obrigatório no Three SkinnedMesh:
 * - no BMD legado Vertex_t.Position é LOCAL ao bone Vertex_t.Node;
 * - o PC faz VectorTransform(vertex.Position, BoneMatrix[node]) em TODO frame;
 * - Three.js pressupõe que a posição armazenada no geometry já está no espaço
 *   MODEL da bind-pose e aplica currentBone * inverseBind * bindPosition.
 *
 * R12.2 colocava a posição local crua no SkinnedMesh. Como bind() calcula
 * inverseBind, a bind-pose cancelava o bone e os modelos/objetos ficavam
 * quebrados em placas/blocos. R12.3 pré-transforma cada vertex pela bind-pose
 * uma única vez, tornando a matemática do Three equivalente à do PC.
 *
 * Aceita tanto bones do parse BMD bruto quanto bones já adaptados.
 */
export function buildBindWorldTransforms(bones) {
    const out = new Array(bones.length);
    const visiting = new Set();

    const solve = (i) => {
        if (out[i]) return out[i];
        if (visiting.has(i)) throw new Error(`BMD bone cycle em ${i}`);
        visiting.add(i);
        const b = bones[i] || {};

        let p, q;
        if (b.isBone && b.userData?.muBindPosition) {
            // Use immutable authored bind values, never a live animation pose.
            p = Array.from(b.userData.muBindPosition);
            q = Array.from(b.userData.muBindQuaternion || [0,0,0,1]);
        } else if (Array.isArray(b.bindPosition) || b.bindPosition instanceof Float32Array) {
            p = Array.from(b.bindPosition);
            q = Array.from(b.bindQuaternion || [0,0,0,1]);
        } else {
            const bp = bindPoseOf({ bones }, i);
            p = bp.position;
            q = bp.quaternion;
        }
        const lr = quatToMat3(q);
        let r = lr;
        let wp = p.slice(0, 3);
        const parent = b.isBone ? b.userData.muParent : (Number.isInteger(b.parent) ? b.parent : -1);
        const dummy = b.isBone ? b.userData.muDummy : b.dummy;
        if (!dummy && parent >= 0 && parent < bones.length && parent !== i) {
            const pt = solve(parent);
            r = mulMat3(pt.r, lr);
            const rp = mulMat3Vec3(pt.r, wp);
            wp = [rp[0] + pt.p[0], rp[1] + pt.p[1], rp[2] + pt.p[2]];
        }
        const t = { r, p: wp };
        out[i] = t;
        visiting.delete(i);
        return t;
    };

    for (let i = 0; i < bones.length; i++) solve(i);
    return out;
}

function applyBindPosition(t, v) {
    const r = mulMat3Vec3(t.r, v);
    return [r[0] + t.p[0], r[1] + t.p[1], r[2] + t.p[2]];
}

function applyBindNormal(t, n) {
    const v = mulMat3Vec3(t.r, n);
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
}

function bindPoseOf(model, boneIndex) {
    const b = model.bones[boneIndex];
    if (!b || b.dummy || !b.matrices || b.matrices.length === 0) {
        return { position: [0, 0, 0], quaternion: [0, 0, 0, 1] };
    }
    const first = b.matrices[0]; // action 0
    if (!first.positions || first.positions.length === 0) {
        return { position: [0, 0, 0], quaternion: [0, 0, 0, 1] };
    }
    return {
        position: first.positions[0],
        quaternion: angleQuaternion(first.rotations[0]),
    };
}

/**
 * Constrói buffers flat por triângulo de um mesh BMD.
 * Index-sets independentes (Vertex/Normal/TexCoord) → vértices duplicados em
 * costuras de UV. Vertex_t.Node e Normal_t.Node são independentes.
 * @param {number} boneCount total de bones do SKELETO ALVO (clamp do Node)
 */
function buildMeshBuffers(m, name, boneCount, bindWorld = null) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const skinIndices = [];
    const normalSkinIndices = [];
    const skinWeights = [];
    const indices = [];

    let vcount = 0;
    for (const tri of m.triangles) {
        const poly = tri.polygon === 4 ? 4 : 3;
        const order = poly === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
        for (const k of order) {
            const vi = tri.vertexIndex[k];
            const ni = tri.normalIndex[k];
            const ti = tri.texCoordIndex[k];
            const v = m.vertices[vi];
            const n = m.normals[ni] || null;
            const t = m.texCoords[ti] || null;

            // 1 influência: Node do vértice (clamped ao skeleton alvo)
            let node = v.node;
            if (!(node >= 0 && node < boneCount)) node = 0;
            let normalNode = Number.isInteger(n?.node) ? n.node : node;
            if (!(normalNode >= 0 && normalNode < boneCount)) normalNode = 0;

            // Vertex_t.Position do MU é bone-local. Para THREE.SkinnedMesh a
            // geometry precisa estar na bind-pose MODEL-space; caso contrário
            // bindMatrixInverse cancela a própria bind transform e despedaça
            // a cena. Pré-transformar aqui é o equivalente estático do
            // BMD::Transform(VectorTransform(vertex, BoneMatrix[node])).
            const bt = bindWorld?.[node] || null;
            const pv = bt ? applyBindPosition(bt, v.position) : v.position;
            positions.push(pv[0], pv[1], pv[2]);
            if (n) {
                const normalBind = bindWorld?.[normalNode] || null;
                const nv = normalBind ? applyBindNormal(normalBind, n.normal) : n.normal;
                normals.push(nv[0], nv[1], nv[2]);
            } else normals.push(0, 1, 0);
            if (t) uvs.push(t.u, t.v);
            else uvs.push(0, 0);

            skinIndices.push(node, 0, 0, 0);
            normalSkinIndices.push(normalNode);
            skinWeights.push(1, 0, 0, 0);
            indices.push(vcount++);
        }
    }

    return {
        name,
        texture: m.texture,
        texFileName: m.texFileName,
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        uvs: new Float32Array(uvs),
        skinIndices: new Float32Array(skinIndices),
        normalSkinIndices: new Float32Array(normalSkinIndices),
        skinWeights: new Float32Array(skinWeights),
        indices: new Uint32Array(indices),
    };
}

/**
 * Extrai os meshes de uma PEÇA do player (Helm/Armor/Pant/Glove/Boot) para
 * compor com o esqueleto do Player.bmd.
 *
 * Arquitetura PC (ZzzObject.cpp:10718-10724): RenderPartObject aplica
 * `o->BoneTransform` (matrizes do OBJETO = Player.bmd) às peças — os
 * Vertex_t.Node das peças indexam o esqueleto do PLAYER diretamente; a lista
 * de bones da própria peça é vestigial (nomes diferem: "R Arm1" vs
 * "R UpperArm", mas os índices casam — 41/56 bones com mesmo índice).
 *
 * @param {object} partModel parse de parseBMD() da peça
 * @param {string} key nome da peça ('helm'|'armor'|'pants'|'gloves'|'boots')
 * @param {number} playerBoneCount bones do Player.bmd (60)
 */
export function extractPartMeshes(partModel, key, playerBoneCount, playerBones = null) {
    const bindWorld = playerBones ? buildBindWorldTransforms(playerBones) : null;
    return partModel.meshes.map((m, i) =>
        buildMeshBuffers(m, `${key}_${i}`, playerBoneCount, bindWorld));
}

/**
 * R12.5 (P3 CharSet): extrai mesh de item RÍGIDO (arma/escudo — BMD com 1
 * bone próprio, ex.: Item/Axe01.bmd 'Box06') como attachment skinned ao
 * esqueleto do player.
 *
 * Autoridade PC:
 * - ZzzCharacter.cpp::ChangeCharacterExt entrega Weapon[k].Type; o render do
 *   item acontece com BoneTransform[LinkBone] (LinkBone = 33 mão direita /
 *   42 mão esquerda — confirmado no Player.bmd real deste cliente: bone[33]
 *   "knife_gdf" filho de "Bip01 R Hand"(28), bone[42] "hand_bofdgne01"
 *   filho de "Bip01 L Hand"(37)).
 * - O vertex do item é local ao seu ÚNICO bone rígido; remap Node→LinkBone +
 *   pré-transform bind-pose (mesmo pipeline das peças) reproduz o PC em
 *   Three.SkinnedMesh: o item segue o osso animado em todo frame.
 *
 * @param {object} itemModel parse de parseBMD() do item (rígido)
 * @param {string} key prefixo de nome do mesh ('weaponR'/'weaponL')
 * @param {number} linkBone bone de attach no esqueleto ALVO (33|42)
 * @param {Array}  playerBones bones do Player.bmd (bind pose authority)
 * @param {number} playerBoneCount total de bones do jogador (clamp)
 */
export function extractRigidAttachment(itemModel, key, linkBone, playerBones, playerBoneCount) {
    const bindWorld = buildBindWorldTransforms(playerBones);
    return itemModel.meshes.map((m, i) => {
        const vertices = m.vertices.map((v) => ({ ...v, node: linkBone }));
        const normals = m.normals.map((n) => ({ ...n, node: linkBone }));
        return buildMeshBuffers({ ...m, vertices, normals }, `${key}_${i}`, playerBoneCount, bindWorld);
    });
}

/**
 * @param {object} model saída de parseBMD()
 * @param {string} relPath caminho original do .bmd (para resolver texturas)
 */
export function bmdToRenderData(model, relPath = '') {
    const modelDir = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : 'Player';

    const numBones = model.bones.length;

    // ---- bind poses (antes dos meshes; usado pelo skeleton) ----
    const bones = model.bones.map((b, i) => {
        const bp = bindPoseOf(model, i);
        const q = bp.quaternion, p = bp.position;
        const m3 = quatToMat3(q);
        // row-major 16 (contrato do renderer: fromArray().transpose())
        const matrix = [
            m3[0], m3[1], m3[2], 0,
            m3[3], m3[4], m3[5], 0,
            m3[6], m3[7], m3[8], 0,
            p[0], p[1], p[2], 1,
        ];
        return {
            name: b.name || `bone_${i}`,
            parent: b.dummy ? -1 : b.parent,
            dummy: !!b.dummy,
            bindPosition: p,
            bindQuaternion: q,
            matrix,
        };
    });

    // ---- meshes (buffers flat por triângulo) ----
    const bindWorld = buildBindWorldTransforms(bones);
    const meshes = model.meshes.map((m, meshIdx) =>
        buildMeshBuffers(m, `mesh_${meshIdx}`, numBones, bindWorld));

    // ---- actions (frames 12*numBones column-major interleaved) ----
    model.actions.forEach((a, i) => { a._index = i; });
    const actions = model.actions.map((a) => {
        const frames = [];
        for (let k = 0; k < a.numKeys; k++) {
            const frame = new Float32Array(numBones * 12);
            for (let b = 0; b < numBones; b++) {
                const bone = model.bones[b];
                const off = b * 12;
                if (bone.dummy || !bone.matrices || !bone.matrices[a._index]) continue;
                const mat = bone.matrices[a._index];
                if (k >= mat.positions.length) continue;
                // PC BMD::Animation LockPositions semantics: for the root bone
                // of a locked action, X/Y come from key 0 while only Z is
                // interpolated over time (plus BodyHeight in the native owner).
                // Letting root X/Y animate here double-applies authored root
                // motion on top of the Character world position and produces
                // the visible sideways/sinking hitch reported in Web.
                const srcP = mat.positions[k];
                const firstP = mat.positions[0] || srcP;
                const p = (b === 0 && a.lockPositions)
                    ? [firstP[0], firstP[1], srcP[2]]
                    : srcP;
                const q = angleQuaternion(mat.rotations[k]);
                const m3 = quatToMat3(q);
                // column-major interleaved 3×4: [col0,tx, col1,ty, col2,tz]
                frame[off + 0] = m3[0]; frame[off + 1] = m3[3]; frame[off + 2] = m3[6]; frame[off + 3] = p[0];
                frame[off + 4] = m3[1]; frame[off + 5] = m3[4]; frame[off + 6] = m3[7]; frame[off + 7] = p[1];
                frame[off + 8] = m3[2]; frame[off + 9] = m3[5]; frame[off + 10] = m3[8]; frame[off + 11] = p[2];
            }
            frames.push(frame);
        }
        return { numKeys: a.numKeys, lockPositions: !!a.lockPositions, frames };
    });

    // ---- textures ----
    const textures = model.meshes.map((m) => ({
        FileName: m.texFileName,
        Dir: modelDir,
    }));

    return {
        source: relPath,
        name: model.name,
        upAxis: 'z',
        meshes, bones, actions, textures,
    };
}

/**
 * Resolve o FileName do BMD (ex: "skin_barbarian_01.jpg") para um caminho
 * real do asset-server, tentando as convenções do cliente (Dir/, .ozj/.ozt/.jpg).
 * @returns {string|null}
 */
export function resolveTexturePath(texFileName, modelDir) {
    if (!texFileName) return null;
    // Specials do TextureScriptParsing do PC (skin/hair etc. sem arquivo)
    if (/^(skin_|hair_|face_)/i.test(texFileName)) return `${modelDir}/${texFileName}`;
    const base = texFileName.replace(/\.(jpg|jpeg|tga|png|bmp)$/i, '');
    const candidates = [
        `${modelDir}/${texFileName}`,
        `${modelDir}/${base}.ozj`,
        `${modelDir}/${base}.ozt`,
        `Player/${base}.ozj`,
        `Player/${base}.ozt`,
        texFileName,
    ];
    return candidates[0]; // o MUAssets tenta a lista em paralelo; ver loadTextureWithFallback
}
