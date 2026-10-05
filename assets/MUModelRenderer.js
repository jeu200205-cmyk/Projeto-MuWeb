/**
 * MUModelRenderer.js — BMD Model Renderer for MU Online
 *
 * Features:
 *  - Full BMD parsing integration (via MUAssetLoader)
 *  - GPU Skinning via Vertex Shader (4 bone influences per vertex)
 *  - Skeletal Animation with interpolation (SLERP for rotation, LERP for position)
 *  - Animation Blending & Cross-fade (multiple animation layers)
 *  - Shadow Mapping support
 *  - Outline/Shader Effects (chrome, metal, oil, wave)
 *  - Level of Detail (LOD) - auto-switch meshes by distance
 *  - Attachment system (weapons, wings, pets on bone hierarchy)
 *  - MU-specific render flags (RENDER_CHROME, RENDER_METAL, etc.)
 */

import * as THREE from 'three';
import { MUAssets, AssetType } from './MUAssetLoader.js';
import {acquireBmdGeometry,isSharedBmdGeometry} from './BmdGeometryPool.js';

// PC Main 5.2 authority: ZzzAI.h REFERENCE_FPS = 25.0.
// BMD::PlayAnimation advances Speed * FPS_ANIMATION_FACTOR against this base.
export const PC_REFERENCE_FPS = 25.0;

// ============================================================
// MU Render Flags (matching ZzzBMD.h)
// ============================================================
export const RenderFlags = {
    COLOR:        0x00000001,
    TEXTURE:      0x00000002,
    CHROME:       0x00000004,
    METAL:        0x00000008,
    LIGHTMAP:     0x00000010,
    SHADOWMAP:    0x00000020,
    BRIGHT:       0x00000040,
    DARK:         0x00000080,
    EXTRA:        0x00000100,
    CHROME2:      0x00000200,
    WAVE:         0x00000400,
    CHROME3:      0x00000800,
    CHROME4:      0x00001000,
    NODEPTH:      0x00002000,
    CHROME5:      0x00004000,
    OIL:          0x00008000,
    CHROME6:      0x00010000,
    CHROME7:      0x00020000,
    DOPPELGANGER: 0x00040000,
    WAVE_EXT:     0x10000000,
    BYSCRIPT:     0x80000000,
};

export const SpecialTextures = {
    HIDE:   0xFFFFFFFF,
    SKIN:   0xFFFFFFFE,
    WATER:  0xFFFFFFFD,
    HAIR:   0xFFFFFFFC,
    CHROME: 0xFFFFFFFB,
    CHROME2: 0xFFFFFFFA,
    SHINY:  0xFFFFFFF9,
};

// Same priority as BMD::RenderMesh when a caller combines flags.
export function pcChromeMode(flags) {
    for (const [flag, mode] of [[RenderFlags.CHROME2,2],[RenderFlags.CHROME3,3],
        [RenderFlags.CHROME4,4],[RenderFlags.CHROME5,5],[RenderFlags.CHROME6,6],
        [RenderFlags.CHROME7,7],[RenderFlags.OIL,9],[RenderFlags.CHROME,1],[RenderFlags.METAL,8]]) {
        if (flags & flag) return mode;
    }
    return 0;
}

function configurePcChromeBasis(mesh) {
    mesh.onBeforeRender = () => {
        const uniform = mesh.material?.uniforms?.pcChromeUpAxis;
        if (!uniform) return;
        let pcUpAxis = false;
        for (let parent = mesh; parent; parent = parent.parent) {
            if (parent.userData?.muPcUpAxis) { pcUpAxis = true; break; }
        }
        uniform.value = pcUpAxis ? 1 : 0;
    };
}

function pcChromeAdditive(flags) {
    return Boolean(flags & (RenderFlags.CHROME3 | RenderFlags.CHROME4 | RenderFlags.CHROME5 | RenderFlags.CHROME7 | RenderFlags.BRIGHT));
}

/** Fixed-function RenderMesh state, before BlendMesh/StreamMesh overrides.
 * Source: ZzzBMD.cpp + ZzzOpenglUtil.cpp. COLOR has priority over chrome;
 * LIGHTMAP is a chrome-branch blend, not a standalone texture blend. */
export function pcRenderMeshPassState(flags, alpha = 1, rgba = false) {
    const color = Boolean(flags & RenderFlags.COLOR);
    const chrome = !color && pcChromeMode(flags) !== 0;
    const brightOnly = !color && !chrome && !(flags & RenderFlags.TEXTURE) && Boolean(flags & RenderFlags.BRIGHT);
    let blend = 'opaque';
    if (color || chrome || (flags & RenderFlags.TEXTURE)) {
        if ((chrome && pcChromeAdditive(flags)) || (flags & RenderFlags.BRIGHT)) blend = 'additive';
        else if (flags & RenderFlags.DARK) blend = 'dark';
        else if (chrome && (flags & RenderFlags.LIGHTMAP)) blend = 'lightmap';
        else if (alpha < 0.99 || (!color && !chrome && rgba)) blend = 'alpha';
    } else if (brightOnly) blend = 'additive';
    if (color && alpha < 0.99) blend = 'alpha';
    return { color, chrome, brightOnly, skip:brightOnly && rgba, blend,
        textured:!color && !brightOnly,
        // DisableTexture restores the depth mask in COLOR. Bare BRIGHT then
        // explicitly disables it. LightMap and AlphaTest keep depth writes.
        depthWrite:color || !['additive','dark'].includes(blend),
        depthTest:!(flags & RenderFlags.NODEPTH),
        cull:blend === 'opaque' || blend === 'lightmap',
        alphaTest:blend === 'alpha', scaleAlpha:chrome && blend === 'additive' };
}

function applyPcRenderMeshPassState(material, flags, alpha, rgba, ordered = false) {
    const state = pcRenderMeshPassState(flags, alpha, rgba);
    material.opacity = alpha;
    if (material.uniforms?.opacity) material.uniforms.opacity.value = alpha;
    if (material.uniforms?.pcScaleAdditiveAlpha) material.uniforms.pcScaleAdditiveAlpha.value = state.scaleAlpha;
    material.depthWrite = state.depthWrite;
    material.depthTest = state.depthTest;
    material.side = state.cull ? THREE.FrontSide : THREE.DoubleSide;
    material.transparent = ordered || state.blend !== 'opaque';
    material.blending = state.blend === 'opaque' && !ordered ? THREE.NormalBlending : THREE.CustomBlending;
    material.blendEquation = material.blendEquationAlpha = THREE.AddEquation;
    const factors = { opaque:[THREE.OneFactor,THREE.ZeroFactor],
        additive:[THREE.OneFactor,THREE.OneFactor], dark:[THREE.ZeroFactor,THREE.OneMinusSrcColorFactor],
        lightmap:[THREE.ZeroFactor,THREE.SrcColorFactor], alpha:[THREE.SrcAlphaFactor,THREE.OneMinusSrcAlphaFactor] };
    [material.blendSrc, material.blendDst] = factors[state.blend];
    // OpenGL glBlendFunc applies the same factors to RGBA; do not use Three's
    // default separate alpha equation for these authored fixed-function draws.
    const alphaFactor = factor => factor === THREE.SrcColorFactor ? THREE.SrcAlphaFactor :
        factor === THREE.OneMinusSrcColorFactor ? THREE.OneMinusSrcAlphaFactor : factor;
    material.blendSrcAlpha = alphaFactor(material.blendSrc);
    material.blendDstAlpha = alphaFactor(material.blendDst);
    material.alphaTest = state.alphaTest ? 0.25 : 0;
    if (material.uniforms?.alphaCutoff) material.uniforms.alphaCutoff.value = material.alphaTest;
    if (material.uniforms?.hasMap) material.uniforms.hasMap.value = state.textured && Boolean(material.map);
    if ((state.color || state.brightOnly) && material.uniforms?.enableLight) material.uniforms.enableLight.value = false;
    material.needsUpdate = true;
    return state;
}

// Main 5.2 OpenPlayerTextures() BITMAP_SKIN+n owners. BMD::OpenTexture does
// not encode these as negative texture slots in the .bmd; it recognizes the
// authored texture FileName prefix (ski* or level*/hid*/hair*) and substitutes
// these runtime bitmap owners. The old Web SpecialTextures numeric checks were
// therefore unreachable for parsed BMD meshes and caused wrong skin/hair maps.
const PC_SKIN_TEXTURE_PATH = Object.freeze({
    0: 'Player/skin_barbarian_01.jpg',
    1: 'Player/level_man022.jpg',
    2: 'Player/skin_wizard_01.jpg',
    3: 'Player/level_man01.jpg',
    4: 'Player/skin_archer_01.jpg',
    5: 'Player/level_man033.jpg',
    6: 'Player/skin_special_01.jpg',
    8: 'Player/level_man02.jpg',
    12: 'Player/LevelClass107.jpg',
    13: 'Player/LevelClass207.jpg',
    14: 'Player/LevelClass207_1.jpg',
});
const PC_HAIR_TEXTURE_PATH = 'Player/hair_r.jpg';

function pcBmdSpecialTextureKind(fileName) {
    const n = String(fileName || '').toLowerCase();
    if (n.startsWith('ski') || n.startsWith('level')) return 'skin';
    if (n.startsWith('hid')) return 'hide';
    if (n.startsWith('hair')) return 'hair';
    return null;
}

// ============================================================
// GPU Skinning Shader
// ============================================================

const SkinningVertexShader = `
    uniform int chromeMode;
    uniform float chromeTime;
    uniform float pcChromeUpAxis;
    uniform vec2 uvOffset;
    // R53 recovery: use the exact Three r160 SkinnedMesh owner instead of a
    // fixed mat4[200] uniform array. The renderer binds bindMatrix,
    // bindMatrixInverse and boneTexture for SkinnedMesh automatically; this
    // avoids exceeding MAX_VERTEX_UNIFORM_VECTORS on drivers where 200 mat4
    // cannot link and used to spam invalid WebGL program errors.
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying vec3 vInstanceBodyLight;
    varying vec3 vVertexBodyLight;
    // Three r160 BatchedMesh does NOT inject its matrix helpers into a custom
    // ShaderMaterial. Built-in materials include these chunks explicitly.
    // R88's R15.8 transport created BatchedMesh groups but this shader only
    // applied instanceMatrix, so batched world props could collapse onto their
    // untransformed template position (map looked incomplete/wrong despite the
    // EncTerrain placements being correct).
    #include <batching_pars_vertex>
    #include <skinning_pars_vertex>
    #ifdef USE_SKINNING
        attribute float normalSkinIndex;
    #endif

    void main() {
        #include <batching_vertex>
        vec3 transformed = position;
        vec3 objectNormal = normal;

        #include <skinbase_vertex>
        #include <skinning_vertex>
        #ifdef USE_SKINNING
            // PC Normal_t.Node is independent of Vertex_t.Node. Position
            // skinning remains unchanged; lighting follows the normal's bone.
            mat4 normalBone = boneMatX;
            if (normalSkinIndex != skinIndex.x) normalBone = getBoneMatrix(normalSkinIndex);
            mat4 normalSkin = bindMatrixInverse * normalBone * bindMatrix;
            objectNormal = (normalSkin * vec4(objectNormal, 0.0)).xyz;
        #endif

        // R73: the base BMD shader is also reused by TerrainObjectWorld's
        // InstancedMesh transport. MeshStandardMaterial previously handled
        // instanceMatrix implicitly; a custom ShaderMaterial must apply it
        // explicitly or every static map object collapses onto the template
        // origin despite correct EncTerrain.obj placements.
        vec4 localPos = vec4(transformed, 1.0);
        vec3 localNormal = objectNormal;
        #ifdef USE_BATCHING
            localPos = batchingMatrix * localPos;
            mat3 bm = mat3(batchingMatrix);
            localNormal /= vec3(dot(bm[0], bm[0]), dot(bm[1], bm[1]), dot(bm[2], bm[2]));
            localNormal = bm * localNormal;
        #endif
        #ifdef USE_INSTANCING
            localPos = instanceMatrix * localPos;
            mat3 im = mat3(instanceMatrix);
            localNormal /= vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
            localNormal = im * localNormal;
        #endif

        vec4 worldPos = modelMatrix * localPos;
        vWorldPosition = worldPos.xyz;
        vNormal = normalize(mat3(modelMatrix) * localNormal);
        vUv = uv;
        // PC g_chrome is calculated per normal before rasterization, not
        // from a camera reflection in the fragment stage.
        vec3 pcNormal = vNormal;
        if (pcChromeUpAxis > 0.5) pcNormal = vec3(vNormal.x, -vNormal.z, vNormal.y);
        float timeMs = max(chromeTime * 1000.0, 0.0);
        float ticks = floor(timeMs);
        float wave = mod(ticks, 10000.0) * 0.0001;
        float wave2 = mod(ticks, 5000.0) * 0.00024 - 0.4;
        vec3 L = vec3(cos(timeMs * 0.001), sin(timeMs * 0.002), 1.0);
        if (chromeMode == 2) {
            vUv = vec2((pcNormal.z + pcNormal.x) * 0.8 + wave2 * 2.0,
                       pcNormal.y + pcNormal.x + wave2 * 3.0);
        } else if (chromeMode == 3) {
            float d = dot(pcNormal, vec3(0.0, -0.1, -0.8));
            vUv = vec2(d, 1.0 - d);
        } else if (chromeMode == 4) {
            float d = dot(pcNormal, L);
            vUv = vec2(d + pcNormal.y * 0.5 + L.y * 3.0,
                       1.0 - d - pcNormal.z * 0.5 - wave * 3.0) + uvOffset;
        } else if (chromeMode == 5) {
            float d = dot(pcNormal, L);
            vUv = vec2(d + pcNormal.y * 3.0 + L.y * 5.0,
                       1.0 - d - pcNormal.z * 2.5 - wave);
        } else if (chromeMode == 6) {
            float d = (pcNormal.z + pcNormal.x) * 0.8 + wave2 * 2.0;
            vUv = vec2(d);
        } else if (chromeMode == 7) {
            float d = (pcNormal.z + pcNormal.x) * 0.8 + timeMs * 0.00006;
            vUv = vec2(d);
        } else if (chromeMode == 9) {
            vUv = pcNormal.xy * uv + uvOffset;
        } else if (chromeMode == 1) {
            vUv = vec2(pcNormal.z * 0.5 + wave, pcNormal.y * 0.5 + wave * 2.0);
        } else if (chromeMode == 8) {
            vUv = vec2(pcNormal.z * 0.5 + 0.2, pcNormal.y * 0.5 + 0.5);
        } else vUv += uvOffset;
        #ifdef USE_INSTANCING_COLOR
            vInstanceBodyLight = instanceColor;
        #else
            vInstanceBodyLight = vec3(1.0);
        #endif
        #ifdef USE_COLOR
            vVertexBodyLight = color;
        #else
            vVertexBodyLight = vec3(1.0);
        #endif

        gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
`;

const SkinningFragmentShader = `
    uniform vec3 diffuse;
    uniform vec3 emissive;
    uniform float opacity;
    uniform bool pcScaleAdditiveAlpha;
    uniform sampler2D map;
    uniform bool hasMap;
    uniform bool useVertexColors;
    uniform bool enableLight;
    uniform vec3 lightPosition;
    uniform float alphaCutoff;
    
    varying vec3 vNormal;
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying vec3 vInstanceBodyLight;
    varying vec3 vVertexBodyLight;
    
    // Chrome/metal effect uniforms
    uniform bool isChrome;
    uniform bool isMetal;
    uniform bool isOil;
    uniform float chromeTime;
    uniform vec2 uvOffset;
    uniform vec3 viewPosition;
    
    void main() {
        vec3 normal = normalize(vNormal);
        // For ordinary SkinnedMesh vInstanceBodyLight=1. For static map
        // InstancedMesh it carries per-placement PC BodyLight sampled from
        // PrimaryTerrainLight, preserving batching without flattening color.
        vec3 color = diffuse * vInstanceBodyLight * vVertexBodyLight;
        // RenderMesh scales BodyLight by alpha for additive chrome families.
        // ONE/ONE blend does not multiply RGB by the output alpha itself.
        if (pcScaleAdditiveAlpha && opacity < 0.99) color *= opacity;
        
        vec2 texCoord = vUv;
        
        // PC chrome/oil UVs and authored scroll were calculated per vertex.
        // Interpolate those values exactly as the desktop triangle pipeline.

        float outputAlpha = opacity;
        if (hasMap) {
            vec4 texColor = texture2D(map, texCoord);
            color *= texColor.rgb;
            outputAlpha *= texColor.a;
            
        }

        // PC alpha test is GL_GREATER on the final modulated alpha.
        if (alphaCutoff > 0.0 && outputAlpha <= alphaCutoff) discard;

        // Main 5.2 BMD::Transform / RenderMesh exact base-light law:
        // Luminosity = dot(transformedNormal, LightPosition) * 0.8 + 0.4;
        // clamp minimum to 0.2. Chrome/metal/oil passes use BodyLight directly
        // and consume normals for UV generation instead of this diffuse term.
        float luminosity = 1.0;
        if (enableLight && !(isChrome || isMetal || isOil)) {
            luminosity = max(dot(normal, lightPosition) * 0.8 + 0.4, 0.2);
        }
        color *= luminosity;
        color += emissive;
        
        gl_FragColor = vec4(color, outputAlpha);

        // MU PC GL_RGB/GL_RGBA + GL_MODULATE works in source byte space.
        // The model texture view has NoColorSpace. Do not gamma-encode the
        // authored BodyLight/tint a second time on the way to the framebuffer.
    }
`;

// ============================================================
// Animation Clip / Track System
// ============================================================

export class MUAnimationClip {
    constructor(name, duration, tracks = []) {
        this.name = name;
        this.duration = duration;
        this.tracks = tracks; // Array of { boneIndex, times[], positions[], rotations[], scales[] }
        // Main 5.2 BMD::PlayAnimation advances AnimationFrame on the 25 Hz
        // reference clock, then BMD::Animation blends PriorAnimationFrame ->
        // CurrentAnimationFrame.  These fields preserve that exact sampling
        // contract instead of treating BMD keys like ordinary forward lerp keys.
        this.muReferenceFps = PC_REFERENCE_FPS;
        this.muLoopKeyCount = 0;
    }
}

export class MUAnimationMixer {
    constructor(renderer) {
        this.renderer = renderer;
        this.clips = new Map(); // name -> MUAnimationClip
        this.activeActions = []; // Currently playing actions
        this.timeScale = 1.0;
    }

    addClip(clip) {
        this.clips.set(clip.name, clip);
        return clip;
    }

    clipAction(name) {
        const clip = this.clips.get(name);
        if (!clip) return null;
        return new MUAnimationAction(this, clip);
    }

    update(deltaTime) {
        const dt = deltaTime * this.timeScale;
        let poseChanged = false;
        for (const action of this.activeActions) {
            if (action._update(dt)) poseChanged = true;
        }
        // PERF R15.19: compact in place. filter() allocated a new actions array
        // every animated renderer/frame, adding avoidable GC pressure in crowds.
        let write = 0;
        for (let read = 0; read < this.activeActions.length; read++) {
            const action = this.activeActions[read];
            if (!action._finished) this.activeActions[write++] = action;
        }
        this.activeActions.length = write;
        return poseChanged;
    }

    stopAll() {
        for (const action of this.activeActions) {
            action.stop();
        }
        this.activeActions = [];
    }
}

export class MUAnimationAction {
    constructor(mixer, clip) {
        this.mixer = mixer;
        this.clip = clip;
        this.enabled = false;
        this.paused = false;
        this.loop = THREE.LoopRepeat;
        this.clampWhenFinished = false;
        this.time = 0;
        this.timeScale = 1.0;
        this.weight = 1.0;
        this._finished = false;
        this._fadeWeight = 0;
        this._fadeTarget = 0;
        this._fadeDuration = 0;
        this._fadeStartTime = 0;
    }

    play() {
        this.enabled = true;
        this.paused = false;
        this._finished = false;
        this._fadeWeight = this.weight;
        this._fadeTarget = this.weight;
        if (!this.mixer.activeActions.includes(this)) {
            this.mixer.activeActions.push(this);
        }
        return this;
    }

    stop() {
        this.enabled = false;
        this._finished = true;
        return this;
    }

    fadeIn(duration) {
        this._fadeDuration = duration;
        this._fadeStartTime = this.mixer.renderer ? this.mixer.renderer._elapsedTime : 0;
        this._fadeTarget = this.weight;
        this._fadeWeight = 0;
        this.play();
        return this;
    }

    fadeOut(duration) {
        this._fadeDuration = duration;
        this._fadeStartTime = this.mixer.renderer ? this.mixer.renderer._elapsedTime : 0;
        this._fadeTarget = 0;
        return this;
    }

    crossFadeFrom(otherAction, duration, warp) {
        otherAction.fadeOut(duration);
        this.fadeIn(duration);
        return this;
    }

    _update(dt) {
        if (!this.enabled || this.paused) return;

        // Handle fade
        if (this._fadeDuration > 0) {
            const elapsed = (this.mixer.renderer ? this.mixer.renderer._elapsedTime : 0) - this._fadeStartTime;
            const progress = Math.min(elapsed / this._fadeDuration, 1);
            this._fadeWeight = THREE.MathUtils.lerp(this._fadeWeight, this._fadeTarget, progress);
            if (progress >= 1) {
                this._fadeDuration = 0;
                // PERF/CORRECTNESS R15.23: a fully faded-out action must retire.
                // Previously it remained in activeActions forever at weight 0,
                // so every historical state transition was still visited by the
                // mixer on every frame. The mixer already compacts _finished
                // actions in place after update().
                if (this._fadeTarget <= 0) {
                    this._fadeWeight = 0;
                    this.enabled = false;
                    this._finished = true;
                    return;
                }
            }
        }

        const effectiveWeight = this._fadeWeight;
        if (effectiveWeight <= 0) return;

        // Update time
        this.time += dt * this.timeScale;
        
        if (this.time >= this.clip.duration) {
            if (this.loop === THREE.LoopRepeat) {
                this.time = this.time % this.clip.duration;
            } else if (this.loop === THREE.LoopOnce) {
                this.time = this.clip.duration;
                if (this.clampWhenFinished) {
                    this._finished = true;
                    return;
                }
            } else {
                this._finished = true;
                return;
            }
        }

        // Apply animation to renderer's bones
        this.mixer.renderer._applyAnimation(this.clip, this.time, effectiveWeight);
        return true;
    }
}

// ============================================================
// MUModelRenderer - Main Class
// ============================================================

export class MUModelRenderer {
    constructor(options = {}) {
        this.scene = options.scene || null;
        this.camera = options.camera || null;
        this.renderer = options.renderer || null;
        
        // Model data
        this.bmdData = null;
        this.group = new THREE.Group();
        this.group.name = 'MUModel';
        
        // Meshes
        this.meshes = []; // THREE.SkinnedMesh[]
        // PERF R15.26/R73: only materials that consume time/view uniforms belong in
        // this compact registry. R73 base BMD meshes are ShaderMaterial too, but
        // ordinary TEXTURE passes do not need chromeTime/viewPosition updates.
        this._animatedShaderMaterials = [];
        // R50 item presentation: overlay passes share this renderer/skeleton.
        // They are registered once per item appearance and updated without
        // allocating a second WebGL context or a second animation owner.
        this._overlayMeshes = [];
        // Main 5.2 CreateSprite owners attached to animated BMD bones.  These
        // are persistent Web objects (instead of one-frame entries in the PC
        // Sprites[] pool), so this renderer must own their material lifetime.
        this._boneSprites = [];
        this._presentationUpdates = [];
        this.meshData = []; // Original mesh data for LOD
        this.currentLOD = 0;
        
        // Skeleton
        this.skeleton = null;
        this.bones = []; // THREE.Bone[]
        this.boneMatrices = new Float32Array(200 * 16); // MAX_BONES * 16
        // PERF R15.27: GPU skinning is owned by THREE.SkinnedMesh/Skeleton.
        // Do not maintain a second MUModelRenderer DataTexture: no material or
        // shader consumes it, while Three updates skeleton.boneMatrices / its
        // own boneTexture during render.
        
        // Animation
        this.mixer = new MUAnimationMixer(this);
        this.currentAction = null;
        this.priorAction = null;
        this.animationFrame = 0;
        this.priorAnimationFrame = 0;
        this._playSpeed = 1.0;
        
        // Transform
        this.bodyOrigin = new THREE.Vector3();
        this.bodyAngle = new THREE.Euler();
        this.bodyScale = 1.0;
        this.bodyHeight = 0;
        this.bodyLight = new THREE.Color(1, 1, 1);
        
        // Render state
        this.renderFlags = RenderFlags.TEXTURE;
        this.alpha = 1.0;
        this.hideSkin = false;
        this.skinIndex = Number.isInteger(options.skinIndex) ? options.skinIndex : 0;
        this.lightEnable = false;
        this.contrastEnable = false;
        
        // Effects
        this.chromeTime = 0;
        this.waveTime = 0;
        this.shadowBias = 0.005;
        
        // LOD
        
        // Attachments (weapons, wings, etc.)
        this.attachments = new Map(); // boneName -> { mesh, offset, rotation }
        
        // Internal
        this._elapsedTime = 0;
        this._initialized = false;
        this._materialCache = new Map();
        this._geometryLeases = [];

        // PERF R15.19: animation interpolation scratch. These objects are reused
        // across tracks because _applyAnimation consumes each result before the
        // next track. This removes six Vector/Quaternion allocations per track/frame.
        // PERF R15.20: renderers used without a camera (monsters, pets, ground
        // items and several effects) must not allocate a fallback Vector3 for
        // every shader material on every frame. The zero view position is an
        // immutable semantic fallback and can be shared for this renderer.
        this._zeroViewPosition = new THREE.Vector3();

        this._animScratch = {
            pos0: new THREE.Vector3(),
            pos1: new THREE.Vector3(),
            quat0: new THREE.Quaternion(),
            quat1: new THREE.Quaternion(),
            scale0: new THREE.Vector3(),
            scale1: new THREE.Vector3(),
            delta: new THREE.Vector3(),
            // PERF R15.21: legacy MU animation path scratch. updateMUAnimation
            // is kept allocation-free per bone/frame as well as mixer animation.
            legacyQ0: new THREE.Quaternion(),
            legacyQ1: new THREE.Quaternion(),
            legacyQResult: new THREE.Quaternion(),
            legacyP0: new THREE.Vector3(),
            legacyP1: new THREE.Vector3(),
            legacyPResult: new THREE.Vector3(),
            legacyMatrix: new THREE.Matrix4(),
            headQuat: new THREE.Quaternion(),
            headEuler: new THREE.Euler(0, 0, 0, 'XYZ'),
            zeroHeadAngle: new THREE.Vector3(),
        };
    }

    /**
     * Initialize from parsed BMD data
     * @param {Object} bmdData - Parsed BMD from MUAssetLoader.loadBMD()
     * @returns {Promise<MUModelRenderer>}
     */
    async initFromBMD(bmdData) {
        if (!bmdData || !Array.isArray(bmdData.meshes) || bmdData.meshes.length === 0) {
            // Fail-closed: dado ausente é erro de pipeline, nunca placeholder.
            throw new Error('[MUModelRenderer] BMD sem meshes — recusando render fake');
        }
        this.bmdData = bmdData;

        await this._buildSkeleton(bmdData);
        await this._buildMeshes(bmdData);
        this._buildAnimations(bmdData);
        
        this._initialized = true;
        return this;
    }

    /**
     * Load and initialize from file path
     * @param {string} relPath - Relative path (e.g. 'Player/Knight.bmd')
     */
    async load(relPath) {
        const bmdData = await MUAssets.loadBMD(relPath);
        return this.initFromBMD(bmdData);
    }

    // ---------- Skeleton Building ----------

    async _buildSkeleton(bmdData) {
        const { bones } = bmdData;
        this.bones = [];
        
        // Create bone hierarchy
        const boneObjects = bones.map((bd, i) => {
            const bone = new THREE.Bone();
            bone.name = bd.name || `bone_${i}`;
            bone.userData.muIndex = i;
            bone.userData.muParent = bd.parent;
            bone.userData.muDummy = bd.dummy;
            bone.userData.muBindPosition = Array.from(bd.bindPosition || [0,0,0]);
            bone.userData.muBindQuaternion = Array.from(bd.bindQuaternion || [0,0,0,1]);
            if (bd.matrix) bone.userData.bindMatrix = new THREE.Matrix4().fromArray(bd.matrix).transpose();
            // Bind pose REAL (key 0 da action 0) — sem isso o bind() captura
            // identity e o skinning despedaça o modelo.
            if (bd.bindPosition) bone.position.fromArray(bd.bindPosition);
            if (bd.bindQuaternion) bone.quaternion.fromArray(bd.bindQuaternion);
            return bone;
        });
        
        // Build hierarchy
        bones.forEach((bd, i) => {
            if (bd.parent >= 0 && bd.parent < boneObjects.length && !bd.dummy) {
                boneObjects[bd.parent].add(boneObjects[i]);
            }
        });
        
        // Find roots (bones sem parent válido ou dummies)
        const roots = boneObjects.filter((_, i) => !(bones[i].parent >= 0 && bones[i].parent < boneObjects.length) || bones[i].dummy);
        roots.forEach(r => this.group.add(r));
        
        this.bones = boneObjects;
        
        // P0 skinning (t-muhkguc2-9): os vértices chegam PRÉ-TRANSFORMADOS em
        // MODEL-space (BmdAdapter.buildMeshBuffers L164-171 aplica bindWorld do
        // Node — equivalente estático do BMD::Transform do PC). Logo
        // boneInverses DEVE ser (bindWorld)⁻¹. calculateInverses() lê
        // bone.matrixWorld — que fica STALE=identity até um updateMatrixWorld:
        // position/quaternion setados acima não recomputam a world matrix.
        // Com inverses=identity, o offsetMatrix do three (pose × inverse)
        // vira a POSE COMPLETA aplicada sobre vértices já em model-space =
        // transform dobrado = monstro/herói/cordame explodindo em slivers
        // (prova física: 4 screenshots :8090 in-world). Um único
        // updateMatrixWorld(true) no group (raiz da hierarquia de bones)
        // legitima os matrixWorld ANTES do construtor do Skeleton E do
        // bind() posterior — ambos passam a capturar a bind-pose real.
        this.group.updateMatrixWorld(true);
        
        // Create skeleton
        this.skeleton = new THREE.Skeleton(this.bones);
        this.skeleton.calculateInverses();
    }

    // ---------- Mesh Building ----------

    async _buildMeshes(bmdData) {
        const { meshes, textures } = bmdData;
        this.meshData = meshes;
        
        for (let i = 0; i < meshes.length; i++) {
            const md = meshes[i];
            const skinnedMesh = this._createSkinnedMesh(md, i);
            this.meshes.push(skinnedMesh);
            this.group.add(skinnedMesh);
        }
        
        // Load textures for meshes
        await this._loadMeshTextures(bmdData);
    }

    _createSkinnedMesh(meshData, index) {
        const lease=acquireBmdGeometry(meshData);
        this._geometryLeases.push(lease);
        this.userData ??= {};
        const metric=lease.reused?'muBmdGeometryReuses':'muBmdGeometryBuilds';
        this.userData[metric]=(this.userData[metric]||0)+1;
        const geometry=lease.geometry;
        
        // Store original for LOD
        meshData._geometry = geometry;
        meshData._originalIndexCount = meshData.indices.length;
        
        const material = this._getMaterial(meshData);
        const skinnedMesh = new THREE.SkinnedMesh(geometry, material);
        skinnedMesh.name = meshData.name || `mesh_${index}`;
        skinnedMesh.frustumCulled = false;
        skinnedMesh.castShadow = true;
        skinnedMesh.receiveShadow = true;
        configurePcChromeBasis(skinnedMesh);
        // R12.3 zero-fake: BMD textured mesh nasce invisível e só é promovido
        // quando a textura REAL foi resolvida. O comportamento antigo deixava
        // MeshStandardMaterial bege visível quando a textura dava 404, criando
        // exatamente os blocos/placas marrons observados no World75.
        skinnedMesh.visible = false;
        skinnedMesh.userData.textureReady = false;
        // Preserve the original BMD texture slot as well.  Main 5.2 RenderMesh
        // compares m->Texture against BlendMesh for BlendMeshLight ownership,
        // while UV wave ownership compares the BMD mesh index.  Losing this
        // distinction made several map ports look close but remain logically
        // wrong (notably Tarkan/NewTown).
        skinnedMesh.userData.textureIndex = Number(meshData.texture);
        // Preserve the BMD-local mesh index across composed body models. The
        // generated RenderModel.lua oracle addresses meshes by this local index,
        // not by the renderer-wide array position after Player+equipment merge.
        const localMatch = String(skinnedMesh.name).match(/_(\d+)$/);
        skinnedMesh.userData.muMeshIndex = localMatch ? Number(localMatch[1]) : index;
        
        // Bind skeleton
        skinnedMesh.bind(this.skeleton);
        
        return skinnedMesh;
    }

    _getMaterial(meshData) {
        const cacheKey = `mat_${meshData.texture}_${meshData.name}`;
        if (this._materialCache.has(cacheKey)) return this._materialCache.get(cacheKey);

        // R73 QUALITY: the Main 5.2 BMD base pass is NOT PBR. Previous Web
        // releases used MeshStandardMaterial plus invented Hemisphere/Directional
        // scene lighting, which recolored armor/skin and changed contrast. Use the
        // same skinned shader owner as chrome overlays, but leave special flags
        // off for the ordinary RENDER_TEXTURE pass. `diffuse` is BodyLight.
        const material = new THREE.ShaderMaterial({
            vertexShader: SkinningVertexShader,
            fragmentShader: SkinningFragmentShader,
            uniforms: {
                diffuse: { value: new THREE.Color(1, 1, 1) },
                emissive: { value: new THREE.Color(0, 0, 0) },
                opacity: { value: 1.0 },
                pcScaleAdditiveAlpha: { value: false },
                map: { value: null },
                hasMap: { value: false },
                useVertexColors: { value: false },
                enableLight: { value: true },
                // Default Main light vector (0,-1.5,0) in MU Z-up converted by
                // applyMuUpAxis(-90deg X) into Three world coordinates. Do NOT
                // normalize: the desktop dot product uses the 1.5 magnitude.
                lightPosition: { value: new THREE.Vector3(0, 0, 1.5) },
                alphaCutoff: { value: 0.0 },
                isChrome: { value: false },
                isMetal: { value: false },
                isOil: { value: false },
                chromeTime: { value: 0 },
                chromeMode: { value: 0 },
                pcChromeUpAxis: { value: 0 },
                uvOffset: { value: new THREE.Vector2(0, 0) },
                viewPosition: { value: new THREE.Vector3() },
            },
            transparent: false,
            depthWrite: true,
            depthTest: true,
            side: THREE.DoubleSide,
        });
        // Compatibility mirrors used by the existing presentation/batching code.
        // The actual shader values remain the uniforms above.
        material.color = material.uniforms.diffuse.value;
        material.map = null;
        material.alphaTest = 0;
        material.metalness = 0;
        material.roughness = 1;
        material.userData.muPcBaseBmdShader = true;

        this._materialCache.set(cacheKey, material);
        return material;
    }

    async _loadMeshTextures(bmdData) {
        const { textures } = bmdData;
        if (!textures) return;

        // PC LoadData::OpenTexture special ownership is selected by FileName,
        // not by the BMD mesh Texture ordinal. Resolve those names first.
        await Promise.all(this.meshes.map(async (mesh, i) => {
            const texInfo = textures[i];
            if (!texInfo || !texInfo.FileName) return;
            const special = pcBmdSpecialTextureKind(texInfo.FileName);
            mesh.userData.muSpecialTexture = special;

            if (special === 'hide') {
                // BITMAP_HIDE returns from BMD::RenderMesh. Keep the authored
                // mesh present in the model/skeleton but never publish pixels.
                mesh.userData.textureReady = true;
                mesh.userData.pcBitmapHide = true;
                mesh.visible = false;
                return;
            }

            let loadPath = null;
            let loadName = texInfo.FileName;
            let loadDir = texInfo.Dir || 'Player';
            if (special === 'skin') {
                loadPath = PC_SKIN_TEXTURE_PATH[this.skinIndex] || null;
                if (!loadPath) {
                    // FIX51 recovery for server class encodings whose second+third
                    // bits produce a BITMAP_SKIN slot not populated by
                    // OpenPlayerTextures (observed +9 on Lord Emperor lineage).
                    // Do NOT hide real geometry. Use the exact authored BMD
                    // FileName as a physical texture owner; this is a real Data
                    // asset, not a placeholder or a guessed neighbouring skin.
                    mesh.userData.pcSkinOwnerMissing = `BITMAP_SKIN+${this.skinIndex}`;
                    mesh.userData.pcTextureOwnerFallback = `${loadDir}/${loadName}`;
                    console.warn(`[MUModelRenderer] BITMAP_SKIN+${this.skinIndex} sem OpenPlayerTextures; usando textura física autorada ${loadDir}/${loadName}`);
                } else {
                    const slash = loadPath.lastIndexOf('/');
                    loadDir = slash >= 0 ? loadPath.slice(0, slash) : 'Player';
                    loadName = slash >= 0 ? loadPath.slice(slash + 1) : loadPath;
                }
            } else if (special === 'hair') {
                loadPath = PC_HAIR_TEXTURE_PATH;
                loadDir = 'Player';
                loadName = 'hair_r.jpg';
            }

            try {
                const loaded = await MUAssets.loadModelTexture(loadName, loadDir);
                const texture = loaded?.isTexture ? loaded : loaded?.createThreeTexture?.(THREE, { pcBmd: true });
                if (texture?.isTexture) {
                    // R90 atomic texture publish: JPEG descriptors create their
                    // THREE.Texture before browser image decode is complete.
                    // Wait for real pixels before making the mesh visible/cachable.
                    if (texture.userData?.muImageReadyPromise) await texture.userData.muImageReadyPromise;
                    if (!texture.image && texture.userData?.muImageReady !== true) throw new Error('textura ainda sem pixels');
                    if (!Number.isInteger(texture.channel)) texture.channel = 0;
                    const mat = mesh.material;
                    mat.map = texture;
                    mesh.userData.originalMap = texture;
                    mesh.userData.pcTextureOwner = special === 'skin'
                        ? (loadPath ? `BITMAP_SKIN+${this.skinIndex}` : `BMD_FILE:${loadDir}/${loadName}`)
                        : special === 'hair' ? 'BITMAP_HAIR' : `${loadDir}/${loadName}`;
                    const hasSourceAlpha = loaded?.format === 'rgba';
                    mesh.userData.muSourceHasAlpha = hasSourceAlpha;
                    mat.transparent = false;
                    mat.alphaTest = hasSourceAlpha ? 0.25 : 0.0;
                    mat.depthWrite = true;
                    mat.needsUpdate = true;
                    mat.side = THREE.DoubleSide;
                    if (mat.uniforms?.map) mat.uniforms.map.value = texture;
                    if (mat.uniforms?.hasMap) mat.uniforms.hasMap.value = true;
                    if (mat.uniforms?.alphaCutoff) mat.uniforms.alphaCutoff.value = mat.alphaTest;
                    if (mat.color?.set) mat.color.set(0xffffff);
                    if (mat.uniforms?.diffuse?.value?.set) mat.uniforms.diffuse.value.set(0xffffff);
                    mat.metalness = 0;
                    mat.roughness = 1;
                    mesh.userData.textureReady = true;
                    mesh.visible = true;
                } else {
                    mesh.visible = false;
                    mesh.userData.textureMissing = loadPath || texInfo.FileName;
                    console.warn(`[MUModelRenderer] Textura REAL ausente; mesh ocultado (sem material placeholder): ${loadPath || texInfo.FileName}`);
                }
            } catch (e) {
                mesh.visible = false;
                mesh.userData.textureMissing = loadPath || texInfo.FileName;
                console.warn(`[MUModelRenderer] Textura ${loadPath || texInfo.FileName}: ${e.message} — mesh ocultado (zero fake)`);
            }
        }));
    }

    // ---------- Animation Building ----------

    _buildAnimations(bmdData) {
        const { actions, bones } = bmdData;
        
        // Parse action data from BMD (frames with bone matrices)
        for (let a = 0; a < actions.length; a++) {
            const action = actions[a];
            if (!action.frames || action.frames.length === 0) continue;
            
            const tracks = [];
            const numBones = bones.length;
            
            for (let b = 0; b < numBones; b++) {
                if (bones[b].dummy) continue;
                
                const times = [];
                const positions = [];
                const rotations = [];
                const scales = [];
                
                for (let f = 0; f < action.frames.length; f++) {
                    times.push(f / PC_REFERENCE_FPS); // PC Main 5.2 reference tick = 25 FPS
                    
                    const mat = action.frames[f];
                    const boneOffset = b * 12;
                    
                    // Extract position (translation from matrix column 3).
                    // PC BMD::Animation special-case for bone 0 + LockPositions:
                    // X/Y are locked to key 0 while Z keeps animating (+BodyHeight).
                    // The Web previously only shortened the loop but still replayed
                    // root X/Y translation, effectively adding BMD root-motion on
                    // top of network/world movement and causing periodic leg/fly
                    // hitches. Bake the exact root lock into the generated clip.
                    if (b === 0 && action.lockPositions) {
                        const first = action.frames[0];
                        positions.push(first[3] || 0);
                        positions.push(first[7] || 0);
                        positions.push(mat[boneOffset + 11] || 0);
                    } else {
                        positions.push(mat[boneOffset + 3] || 0);
                        positions.push(mat[boneOffset + 7] || 0);
                        positions.push(mat[boneOffset + 11] || 0);
                    }
                    
                    // Extract rotation from 3x3 matrix
                    const m = new THREE.Matrix4().fromArray([
                        mat[boneOffset], mat[boneOffset+1], mat[boneOffset+2], 0,
                        mat[boneOffset+4], mat[boneOffset+5], mat[boneOffset+6], 0,
                        mat[boneOffset+8], mat[boneOffset+9], mat[boneOffset+10], 0,
                        0, 0, 0, 1
                    ]);
                    const quat = new THREE.Quaternion().setFromRotationMatrix(m);
                    rotations.push(quat.x, quat.y, quat.z, quat.w);
                    
                    // Scale (approximate from matrix)
                    const sx = Math.sqrt(mat[boneOffset]*mat[boneOffset] + mat[boneOffset+1]*mat[boneOffset+1] + mat[boneOffset+2]*mat[boneOffset+2]);
                    const sy = Math.sqrt(mat[boneOffset+4]*mat[boneOffset+4] + mat[boneOffset+5]*mat[boneOffset+5] + mat[boneOffset+6]*mat[boneOffset+6]);
                    const sz = Math.sqrt(mat[boneOffset+8]*mat[boneOffset+8] + mat[boneOffset+9]*mat[boneOffset+9] + mat[boneOffset+10]*mat[boneOffset+10]);
                    scales.push(sx, sy, sz);
                }
                
                if (times.length > 1) {
                    tracks.push({
                        boneIndex: b,
                        boneName: this.bones[b]?.name || `bone_${b}`,
                        times: new Float32Array(times),
                        positions: new Float32Array(positions),
                        rotations: new Float32Array(rotations),
                        scales: new Float32Array(scales)
                    });
                }
            }
            
            if (tracks.length > 0) {
                // Main 5.2 PlayAnimation wraps LockPositions actions at
                // NumAnimationKeys-1. Using all keys in Web replays the terminal
                // root pose once per loop and causes a periodic character hitch
                // (especially visible on fly/walk cycles).
                const loopKeys = action.lockPositions
                    ? Math.max(1, action.frames.length - 1)
                    : action.frames.length;
                const clip = new MUAnimationClip(`action_${a}`, loopKeys / PC_REFERENCE_FPS, tracks);
                clip.muLockPositions = Boolean(action.lockPositions);
                clip.muNumAnimationKeys = action.frames.length;
                clip.muLoopKeyCount = loopKeys;
                this.mixer.addClip(clip);
            }
        }
    }

    // ---------- Bone Texture for GPU Skinning ----------

    // PERF R15.27: no parallel custom bone texture. THREE.SkinnedMesh owns
    // skeleton upload at render time; keeping a second CPU matrix walk/upload
    // duplicated work without a consumer.

    // ---------- Animation Application ----------

    _applyAnimation(clip, time, weight) {
        // Main 5.2 parity (BMD::PlayAnimation + BMD::Animation): animation is
        // sampled as PRIOR key -> CURRENT key on a fixed 25 Hz reference clock.
        // The former Web path sampled CURRENT -> NEXT.  On every loop it then
        // held the terminal key for a whole 25 Hz interval because there was no
        // "next" key, producing the visible periodic pause on wings/idle/walk.
        // Keep the authored period exactly the same; only fix which two keys are
        // interpolated.  For LockPositions, PlayAnimation uses N-1 as its Key,
        // so the terminal root-motion key remains intentionally excluded.
        const referenceFps = Number(clip.muReferenceFps) || PC_REFERENCE_FPS;
        const declaredLoopKeys = Number(clip.muLoopKeyCount) || 0;

        for (const track of clip.tracks) {
            const bone = this.bones[track.boneIndex];
            if (!bone) continue;

            const times = track.times;
            const availableKeys = times.length;
            if (availableKeys <= 0) continue;
            const loopKeys = Math.max(1, Math.min(
                declaredLoopKeys > 0 ? declaredLoopKeys : availableKeys,
                availableKeys,
            ));

            let currentFrame = 0;
            let priorFrame = 0;
            let lerpFactor = 0;

            // LoopOnce reaches clip.duration exactly before _applyAnimation.
            // Preserve its authored final pose instead of wrapping to key 0.
            if (time >= clip.duration && clip.duration > 0) {
                currentFrame = loopKeys - 1;
                priorFrame = Math.max(0, currentFrame - 1);
                lerpFactor = 1;
            } else if (loopKeys > 1) {
                const sample = Math.max(0, time) * referenceFps;
                const whole = Math.floor(sample);
                currentFrame = whole % loopKeys;
                priorFrame = (currentFrame + loopKeys - 1) % loopKeys;
                lerpFactor = sample - whole;
            }

            const scratch = this._animScratch;

            // BMD::Animation Position1=PriorAnimationFrame,
            // Position2=CurrentAnimationFrame, s1=fractional AnimationFrame.
            const pos = scratch.pos0.fromArray(track.positions, priorFrame * 3);
            const pos1 = scratch.pos1.fromArray(track.positions, currentFrame * 3);
            pos.lerp(pos1, lerpFactor);

            const quat = scratch.quat0.fromArray(track.rotations, priorFrame * 4);
            const quat1 = scratch.quat1.fromArray(track.rotations, currentFrame * 4);
            quat.slerp(quat1, lerpFactor);

            const scale = scratch.scale0.fromArray(track.scales, priorFrame * 3);
            const scale1 = scratch.scale1.fromArray(track.scales, currentFrame * 3);
            scale.lerp(scale1, lerpFactor);

            // Multiple actions can overlap briefly during state transitions.
            // Rotations must participate in the same weighted blend as position
            // and scale; skipping quaternion blending made bones visually hold
            // their previous rotation until the fade completed.
            if (weight >= 1.0) {
                bone.position.copy(pos);
                bone.quaternion.copy(quat);
                bone.scale.copy(scale);
            } else {
                const delta = scratch.delta;
                delta.copy(pos).sub(bone.position);
                bone.position.addScaledVector(delta, weight);
                bone.quaternion.slerp(quat, weight);
                delta.copy(scale).sub(bone.scale);
                bone.scale.addScaledVector(delta, weight);
            }
        }
    }

    // ---------- Public Animation API ----------

    // Main 5.2 authors BMD animation speed independently from browser FPS.
    // Preserve the R45 timeScale bridge while keeping the R15.27 mixer/GC work.
    get playSpeed() {
        return Number.isFinite(this._playSpeed) ? this._playSpeed : 1.0;
    }

    set playSpeed(value) {
        const v = Number(value);
        this._playSpeed = Number.isFinite(v) && v >= 0 ? v : 1.0;
        if (this.currentAction) this.currentAction.timeScale = this._playSpeed;
    }

    playAction(name, fadeDuration = 0.3) {
        const action = this.mixer.clipAction(name);
        if (!action) {
            console.warn(`[MUModelRenderer] Animation not found: ${name}`);
            return null;
        }
        
        action.timeScale = this.playSpeed;

        const previous = this.currentAction;
        if (previous && previous !== action) {
            // PERF/CORRECTNESS R15.23: crossFadeFrom belongs to the incoming
            // action. The old order re-faded the current action IN and faded the
            // incoming action OUT before immediately playing it, leaving every
            // historical action resident in activeActions. Correct direction:
            // incoming fades in FROM outgoing; outgoing reaches zero and retires.
            action.crossFadeFrom(previous, fadeDuration, true);
        }
        
        this.priorAction = previous;
        this.currentAction = action;
        action.fadeIn(fadeDuration).play();
        
        return action;
    }

    stopAction(fadeDuration = 0.2) {
        if (this.currentAction) {
            this.currentAction.fadeOut(fadeDuration);
            this.currentAction = null;
        }
    }

    setAnimationFrame(frame) {
        this.animationFrame = frame;
    }

    // ---------- MU-Specific Animation (from ZzzBMD.cpp) ----------

    /**
     * MU-style animation with blending between current and prior action
     * Port of BMD::Animation from ZzzBMD.cpp
     */
    updateMUAnimation(deltaTime, headAngle = null) {
        // PERF R15.21: default argument used to allocate a Vector3 on every call.
        headAngle ||= this._animScratch.zeroHeadAngle;
        if (!this.bmdData || !this.bmdData.actions?.length) return;
        
        const actions = this.bmdData.actions;
        if (this.currentAction >= actions.length) this.currentAction = 0;
        if (this.priorAction >= actions.length) this.priorAction = 0;
        
        this.copy(headAngle, this.bodyAngle);
        
        this.animationFrame += this.playSpeed * deltaTime * PC_REFERENCE_FPS; // Main 5.2 base
        const currentFrame = Math.floor(this.animationFrame);
        const s1 = this.animationFrame - currentFrame;
        const s2 = 1.0 - s1;
        const priorFrame = Math.floor(this.priorAnimationFrame);
        
        // Clamp frames
        const clampFrame = (frame, actionIdx) => {
            const maxFrame = actions[actionIdx]?.numAnimationKeys || 1;
            return Math.max(0, Math.min(frame, maxFrame - 1));
        };
        
        const currFrameClamped = clampFrame(currentFrame, this.currentAction);
        const priorFrameClamped = clampFrame(priorFrame, this.priorAction);
        
        // Update bone transforms (simplified - using Three.js bone hierarchy)
        for (let i = 0; i < this.bones.length; i++) {
            const boneData = this.bmdData.bones[i];
            if (boneData.dummy) continue;
            
            const bm1 = boneData.BoneMatrixes?.[this.priorAction];
            const bm2 = boneData.BoneMatrixes?.[this.currentAction];
            if (!bm1 || !bm2) continue;
            
            // Get quaternions for SLERP
            const scratch = this._animScratch;
            const q1 = this._getQuaternion(bm1, priorFrameClamped, scratch.legacyQ0);
            const q2 = this._getQuaternion(bm2, currFrameClamped, scratch.legacyQ1);
            
            const resultQuat = scratch.legacyQResult;
            if (!q1.equals(q2)) {
                THREE.Quaternion.slerp(q1, q2, s1, resultQuat);
            } else {
                resultQuat.copy(q1);
            }
            
            // Get positions for LERP
            const pos1 = this._getPosition(bm1, priorFrameClamped, scratch.legacyP0);
            const pos2 = this._getPosition(bm2, currFrameClamped, scratch.legacyP1);
            const resultPos = scratch.legacyPResult.lerpVectors(pos1, pos2, s1);
            
            // Apply to bone
            const bone = this.bones[i];
            if (i === this.bmdData.BoneHead) {
                // Head bone gets head angle offset
                const headQuat = scratch.headQuat.setFromEuler(
                    scratch.headEuler.set(-headAngle.x, -headAngle.y, 0, 'XYZ')
                );
                resultQuat.premultiply(headQuat);
            }
            
            bone.quaternion.copy(resultQuat);
            bone.position.copy(resultPos);
        }
        
        // PERF R15.27: no custom bone-texture upload here. The modified Bone
        // transforms are consumed by THREE.SkinnedMesh/Skeleton during render.
        
        this.priorAnimationFrame = this.animationFrame;
    }

    _getQuaternion(boneMatrix, frame, out = null) {
        // PERF R15.21: no temporary JS array, Matrix4 or Quaternion in the
        // per-bone path. Matrix4.set() uses the same row-major arguments as the
        // previous fromArray payload and setFromRotationMatrix preserves math.
        const r = boneMatrix.Rotation[frame];
        const m = this._animScratch.legacyMatrix;
        m.set(
            r[0], r[1], r[2], 0,
            r[3], r[4], r[5], 0,
            r[6], r[7], r[8], 0,
            0, 0, 0, 1
        );
        return (out || this._animScratch.legacyQ0).setFromRotationMatrix(m);
    }

    _getPosition(boneMatrix, frame, out = null) {
        const p = boneMatrix.Position[frame];
        return (out || this._animScratch.legacyP0).set(p[0], p[1], p[2]);
    }

    // ---------- Rendering / Update ----------

    update(deltaTime, elapsedTime) {
        this._elapsedTime = elapsedTime;
        this.chromeTime = elapsedTime;
        this.waveTime = elapsedTime;
        
        // PERF R15.27: apply animation transforms only. THREE.SkinnedMesh owns
        // skeleton matrix/texture synchronization during renderer.render(); a
        // second custom hierarchy walk + DataTexture upload had no consumer.
        this.mixer.update(deltaTime);
        
        // Update materials with time uniforms
        this._updateMaterialUniforms();
        for (let i = 0; i < this._presentationUpdates.length; i++) {
            try { this._presentationUpdates[i](elapsedTime * 1000); } catch (_) { /* presentation fail-closed */ }
        }
    }

    _updateMaterialUniforms() {
        // PERF R15.26: do not scan/branch across every model mesh every frame.
        // Only materials promoted to the MU chrome shader consume these uniforms.
        for (let i = 0; i < this._animatedShaderMaterials.length; i++) {
            const mat = this._animatedShaderMaterials[i];
            mat.uniforms.chromeTime.value = this.chromeTime;
            mat.uniforms.viewPosition.value = this.camera?.position || this._zeroViewPosition;
        }
    }

    // ---------- MU Render Flags Support ----------

    setRenderFlags(flags, options = {}) {
        this.renderFlags = flags;
        this.alpha = options.alpha ?? 1.0;
        
        for (const mesh of this.meshes) {
            let mat = mesh.material;
            const texIndex = mesh.userData.textureIndex;
            
            // Handle special textures
            if ((flags & RenderFlags.COLOR) === RenderFlags.COLOR) {
                if (mat.color?.copy) mat.color.copy(this.bodyLight);
                if (mat.uniforms?.diffuse?.value?.copy) mat.uniforms.diffuse.value.copy(this.bodyLight);
                mat.map = null;
                if (mat.uniforms?.map) mat.uniforms.map.value = null;
                if (mat.uniforms?.hasMap) mat.uniforms.hasMap.value = false;
            } else if ((flags & RenderFlags.CHROME) || (flags & RenderFlags.CHROME2) || 
                       (flags & RenderFlags.CHROME3) || (flags & RenderFlags.CHROME4) ||
                       (flags & RenderFlags.CHROME5) || (flags & RenderFlags.CHROME6) || (flags & RenderFlags.CHROME7) ||
                       (flags & RenderFlags.METAL) || (flags & RenderFlags.OIL)) {
                this._applyChromeEffect(mesh, flags);
            } else if ((flags & RenderFlags.TEXTURE) === RenderFlags.TEXTURE) {
                // Normal textured rendering
                mat.map = mesh.userData.originalMap;
                if (mat.uniforms?.map) mat.uniforms.map.value = mesh.userData.originalMap || null;
                if (mat.uniforms?.hasMap) mat.uniforms.hasMap.value = Boolean(mesh.userData.originalMap);
                if (mat.uniforms?.isChrome) mat.uniforms.isChrome.value = false;
                if (mat.uniforms?.isMetal) mat.uniforms.isMetal.value = false;
                if (mat.uniforms?.isOil) mat.uniforms.isOil.value = false;
                if (mat.uniforms?.chromeMode) mat.uniforms.chromeMode.value = 0;
            }
            mat = mesh.material;
            
            const state = applyPcRenderMeshPassState(mat, flags, this.alpha, mesh.userData.muSourceHasAlpha === true);
            if (!state.chrome && mat.uniforms?.chromeMode) {
                mat.uniforms.chromeMode.value = 0;
                mat.uniforms.isChrome.value = mat.uniforms.isMetal.value = mat.uniforms.isOil.value = false;
            }
            if (state.textured && !state.chrome && mat.uniforms?.enableLight) {
                mat.uniforms.enableLight.value = this.userData?.muLightEnable !== false;
            }
            mesh.userData.muRenderFlagsSkip = state.skip;
            mesh.visible = !state.skip && mesh.userData.textureReady !== false && !mesh.userData.pcBitmapHide && !mesh.userData.muRenderModelHidden;

        }
    }

    get hasPresentationUpdates() {
        return this._presentationUpdates.length > 0;
    }

    /** Register a per-frame presentation callback owned by this model. */
    addPresentationUpdate(fn) {
        if (typeof fn !== 'function') return false;
        this._presentationUpdates.push(fn);
        return true;
    }

    /** Main 5.2 OBJECT::LightEnable owner. Inventory previews and linked
     * equipment explicitly set LightEnable=false before RenderPartObject; world
     * terrain/body owners may keep the normal transformed-normal light law. */
    setLightEnabled(enabled) {
        const value = Boolean(enabled);
        const apply = (mesh) => {
            const mat = mesh?.material;
            if (mat?.uniforms?.enableLight) mat.uniforms.enableLight.value = value;
        };
        for (const mesh of this.meshes || []) apply(mesh);
        for (const mesh of this._overlayMeshes || []) apply(mesh);
        this.userData ??= {};
        this.userData.muLightEnable = value;
        return this;
    }

    /** Apply the persistent BMD::StreamMesh state to one source mesh.
     * StreamMesh consumes OBJECT::BlendMeshTexCoord U/V on the ordinary body
     * draw and bypasses transformed-normal lighting for that mesh. Mutating a
     * shared Texture.offset would leak the scroll into other actors/icons, so
     * the offset stays in this renderer's per-material shader uniform. */
    setBaseStreamMesh(meshIndex, u = 0, v = 0) {
        const target = Number(meshIndex);
        let updated = 0;
        for (const mesh of this.meshes || []) {
            if (Number(mesh?.userData?.muMeshIndex) !== target) continue;
            const uniforms = mesh.material?.uniforms;
            if (!uniforms?.uvOffset?.value?.set) continue;
            uniforms.uvOffset.value.set(Number(u) || 0, Number(v) || 0);
            if (uniforms.enableLight) uniforms.enableLight.value = false;
            updated++;
        }
        this.userData ??= {};
        this.userData.muStreamMesh = { index:target, u:Number(u)||0, v:Number(v)||0, updated };
        return updated;
    }

    /** Apply OBJECT::BlendMesh to base BMD draws selected by m->Texture.
     * The PC compares the BMD texture slot, not the local mesh index. Matching
     * draws become textured ONE/ONE passes with depth writes/culling disabled,
     * and use BodyLight*BlendMeshLight without transformed-normal lighting. */
    setBaseBlendTexture(textureIndex, blendMeshLight = 1, options = {}) {
        const target = Number(textureIndex);
        const light = Number.isFinite(Number(blendMeshLight)) ? Number(blendMeshLight) : 1;
        const alpha = Number.isFinite(Number(options.alpha)) ? Number(options.alpha) : 1;
        const bodyLight = options.bodyLight?.isColor ? options.bodyLight : null;
        const scrollMeshIndex = Number.isFinite(Number(options.scrollMeshIndex))
            ? Number(options.scrollMeshIndex) : null;
        const uvU = Number(options.u) || 0;
        const uvV = Number(options.v) || 0;
        let updated = 0;
        for (const mesh of this.meshes || []) {
            const material = mesh.material;
            if (bodyLight && material) {
                if (material.color?.copy) material.color.copy(bodyLight);
                if (material.uniforms?.diffuse?.value?.copy) material.uniforms.diffuse.value.copy(bodyLight);
            }
            if (scrollMeshIndex !== null && Number(mesh?.userData?.muMeshIndex) === scrollMeshIndex) {
                material?.uniforms?.uvOffset?.value?.set?.(uvU, uvV);
            }
            if (Number(mesh?.userData?.textureIndex) !== target) continue;
            if (!material) continue;
            const base = bodyLight || (mesh.userData?.muAuthoredBaseColor?.isColor
                ? mesh.userData.muAuthoredBaseColor
                : material.uniforms?.diffuse?.value);
            const color = base?.isColor ? base.clone().multiplyScalar(light) : new THREE.Color(light,light,light);
            if (material.color?.copy) material.color.copy(color);
            if (material.uniforms?.diffuse?.value?.copy) material.uniforms.diffuse.value.copy(color);
            if (material.uniforms?.enableLight) material.uniforms.enableLight.value = false;
            applyPcRenderMeshPassState(material, RenderFlags.TEXTURE|RenderFlags.BRIGHT, alpha,
                mesh.userData?.muSourceHasAlpha === true);
            mesh.userData ??= {};
            mesh.userData.muBlendMeshTexture = target;
            updated++;
        }
        this.userData ??= {};
        this.userData.muBlendMesh = { textureIndex:target, light, updated };
        if (Object.keys(options).length) Object.assign(this.userData.muBlendMesh, {
            alpha, bodyLight:bodyLight?.toArray?.() || null, scrollMeshIndex, u:uvU, v:uvV,
        });
        return updated;
    }

    /**
     * Creates a stock Main-style material draw over selected meshes.
     * The overlay reuses the same geometry + Skeleton, so glow follows the exact
     * animated item/body pose and creates no extra WebGL context.
     */
    createOverlayPass(flags, options = {}) {
        if (this._disposed) return null;
        const color = options.color?.isColor ? options.color : new THREE.Color(options.color ?? 0xffffff);
        const alpha = Number.isFinite(options.alpha) ? options.alpha : 1;
        const map = options.map?.isTexture ? options.map : null;
        const filter = typeof options.meshFilter === 'function' ? options.meshFilter : (() => true);
        const overlays = [];
        for (const source of this.meshes) {
            if (!filter(source)) continue;
            const baseMap = map || source.userData?.originalMap || source.material?.map || null;
            // R89 physical item recovery: a missing/not-yet-resident base
            // texture must NEVER be resurrected as a white additive overlay.
            // R88 correctly kept the base SkinnedMesh fail-closed while its
            // BMD texture was absent, but createOverlayPass() still created a
            // brand-new visible MeshBasicMaterial with map=null.  Excellent /
            // Ancient / RenderModel passes could therefore turn an otherwise
            // hidden item into the large white weapons/armour seen in the
            // physical screenshots.  The desktop has no "white fallback";
            // child passes only exist after their source texture owner exists.
            if (source.userData?.textureReady !== true || source.userData?.pcBitmapHide || !baseMap?.isTexture) {
                continue;
            }
            const hasSourceAlpha = map?.userData?.muPcBitmapHasAlpha ?? (source.userData?.muSourceHasAlpha === true);
            const material = this._getMaterial({ texture: -1, name: `${source.name}__pass_${this._overlayMeshes.length}` });
            material.uniforms.diffuse.value.copy(color);
            material.uniforms.map.value = baseMap;
            material.uniforms.hasMap.value = true;
            material.uniforms.opacity.value = alpha;
            const chromeMode = pcChromeMode(flags);
            material.uniforms.pcScaleAdditiveAlpha.value = chromeMode !== 0 && pcChromeAdditive(flags);
            material.uniforms.enableLight.value = options.lightEnabled === true;
            material.map = baseMap;
            const state = applyPcRenderMeshPassState(material, flags, alpha, hasSourceAlpha, true);
            if (state.skip) { material.dispose(); continue; }
            const overlay = new THREE.SkinnedMesh(source.geometry, material);
            configurePcChromeBasis(overlay);
            overlay.name = `${source.name || 'mesh'}__mu_overlay`;
            overlay.frustumCulled = false;
            overlay.renderOrder = (source.renderOrder || 0) + (options.passOrder ?? 1);
            overlay.userData.originalMap = baseMap;
            overlay.userData.muSourceHasAlpha = hasSourceAlpha;
            overlay.bind(source.skeleton || this.skeleton, source.bindMatrix);
            overlay.bindMode = source.bindMode;
            // CHROME/METAL/OIL need the existing MU reflection shader instead
            // of treating Chrome01/02 as ordinary diffuse UVs.
            if (!state.color && flags & (RenderFlags.CHROME | RenderFlags.CHROME2 | RenderFlags.CHROME3 | RenderFlags.CHROME4 | RenderFlags.CHROME5 | RenderFlags.CHROME6 | RenderFlags.CHROME7 | RenderFlags.METAL | RenderFlags.OIL)) {
                this._applyChromeEffect(overlay, flags);
                if (overlay.material?.uniforms?.map) overlay.material.uniforms.map.value = baseMap;
                if (overlay.material?.uniforms?.hasMap) overlay.material.uniforms.hasMap.value = Boolean(baseMap);
                if (overlay.material?.uniforms?.diffuse) overlay.material.uniforms.diffuse.value.copy(color);
                // Preserve the selected PC blend/depth owner after chrome setup.
                applyPcRenderMeshPassState(overlay.material, flags, alpha, hasSourceAlpha, true);
                overlay.material.needsUpdate = true;
            }
            this.group.add(overlay);
            this._overlayMeshes.push(overlay);
            overlays.push(overlay);
        }
        if (!overlays.length) return null;
        return {
            meshes: overlays,
            setColor: (c) => {
                const next = c?.isColor ? c : new THREE.Color(c ?? 0xffffff);
                for (const mesh of overlays) {
                    if (mesh.material?.color) mesh.material.color.copy(next);
                    if (mesh.material?.uniforms?.diffuse?.value?.copy) mesh.material.uniforms.diffuse.value.copy(next);
                }
            },
            setOpacity: (v) => { for (const mesh of overlays) if (mesh.material) {
                mesh.material.opacity = v;
                if (mesh.material.uniforms?.opacity) mesh.material.uniforms.opacity.value = v;
                applyPcRenderMeshPassState(mesh.material, flags, v, mesh.userData.muSourceHasAlpha === true, true);
            } },
            setUvOffset: (u = 0, v = 0) => {
                for (const mesh of overlays) {
                    const uniform = mesh.material?.uniforms?.uvOffset?.value;
                    if (uniform?.set) uniform.set(Number(u) || 0, Number(v) || 0);
                }
            },
        };
    }

    /** Create one camera-facing Main sprite in the local frame of a BMD bone.
     * PC RenderSprite multiplies the bitmap's physical width/height by Scale;
     * THREE.Sprite is already camera-facing, while parenting it to the bone
     * reproduces TransformPosition(BoneTransform[n], offset, Position).
     * The texture remains MUAssets-owned; only this private SpriteMaterial is
     * disposed with the model. */
    createBoneSprite({ boneIndex = 0, map = null, offset = null, scale = 1, color = null } = {}) {
        if (this._disposed || !map?.isTexture) return null;
        const rootOwned = boneIndex === null;
        const anchor = rootOwned ? this.group : this.bones?.[Number(boneIndex)];
        const image = map.image || map.source?.data;
        const width = Number(image?.width || image?.naturalWidth);
        const height = Number(image?.height || image?.naturalHeight);
        if ((!rootOwned && !anchor?.isBone) || (rootOwned && !anchor?.isGroup) || !(width > 0) || !(height > 0)) return null;

        const material = new THREE.SpriteMaterial({
            map,
            color: color?.isColor ? color : new THREE.Color(color ?? 0xffffff),
            transparent: true,
            depthTest: true,
            depthWrite: false,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendEquationAlpha: THREE.AddEquation,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneFactor,
            blendSrcAlpha: THREE.OneFactor,
            blendDstAlpha: THREE.OneFactor,
            toneMapped: false,
            fog: false,
        });
        const sprite = new THREE.Sprite(material);
        sprite.name = rootOwned ? 'mu_model_root_sprite' : `mu_bone_${Number(boneIndex)}_sprite`;
        sprite.frustumCulled = false;
        sprite.position.copy(offset?.isVector3 ? offset : new THREE.Vector3(...(offset || [0, 0, 0])));
        const setScale = (value) => {
            const next = Number(value);
            if (Number.isFinite(next) && next >= 0) sprite.scale.set(width * next, height * next, 1);
        };
        setScale(scale);
        anchor.add(sprite);

        const owner = {
            sprite,
            material,
            boneIndex: rootOwned ? null : Number(boneIndex),
            bitmapSize: [width, height],
            setColor: (next) => material.color.copy(next?.isColor ? next : new THREE.Color(next ?? 0xffffff)),
            setScale,
            dispose: () => {
                if (owner.disposed) return;
                owner.disposed = true;
                sprite.parent?.remove(sprite);
                material.dispose();
            },
            disposed: false,
        };
        this._boneSprites.push(owner);
        return owner;
    }

    _applyChromeEffect(mesh, flags) {
        const mat = mesh.material;
        // Convert to shader material if needed
        if (!mat.isShaderMaterial) {
            const shaderMat = new THREE.ShaderMaterial({
                vertexShader: SkinningVertexShader,
                fragmentShader: SkinningFragmentShader,
                uniforms: {
                    // Skinning uniforms are owned by THREE.WebGLRenderer for
                    // SkinnedMesh (boneTexture + bind matrices). Do not mirror
                    // skeleton.boneMatrices into a giant manual uniform array.
                    diffuse: { value: new THREE.Color(1, 1, 1) },
                    emissive: { value: new THREE.Color(0, 0, 0) },
                    opacity: { value: 1.0 },
                    pcScaleAdditiveAlpha: { value: false },
                    map: { value: mesh.userData.originalMap || null },
                    hasMap: { value: !!mesh.userData.originalMap },
                    useVertexColors: { value: false },
                    // Keep the replacement material contract identical to the
                    // base BMD shader. R80 omitted these declared uniforms from
                    // chrome/metal/oil replacement materials; on the physical
                    // WebGL driver that left an invalid/incomplete program lane
                    // and also changed item lighting/alpha semantics.
                    enableLight: { value: true },
                    lightPosition: { value: new THREE.Vector3(0, 0, 1.5) },
                    alphaCutoff: { value: Number(mat.alphaTest) || 0.0 },
                    // Main 5.2 has CHROME1..7 families. R48 only toggled
                    // the shader for CHROME/CHROME2, so +13 CHROME4 and custom
                    // RenderModel CHROME3/4/5/6/7 overlays were created but
                    // sampled as ordinary diffuse texture (missing glow/chrome).
                    isChrome: { value: Boolean(flags & (RenderFlags.CHROME | RenderFlags.CHROME2 | RenderFlags.CHROME3 | RenderFlags.CHROME4 | RenderFlags.CHROME5 | RenderFlags.CHROME6 | RenderFlags.CHROME7)) },
                    isMetal: { value: (flags & RenderFlags.METAL) !== 0 },
                    isOil: { value: (flags & RenderFlags.OIL) !== 0 },
                    chromeTime: { value: 0 },
                    chromeMode: { value: 0 },
                    pcChromeUpAxis: { value: 0 },
                    uvOffset: { value: new THREE.Vector2(0, 0) },
                    viewPosition: { value: new THREE.Vector3() }
                },
                transparent: this.alpha < 0.99,
                depthWrite: !(flags & RenderFlags.NODEPTH),
                depthTest: mat.depthTest !== false,
                side: THREE.DoubleSide,
            });
            // Compatibility mirrors consumed by presentation/batching code;
            // the shader uniforms above remain the real GPU source of truth.
            shaderMat.color = shaderMat.uniforms.diffuse.value;
            shaderMat.map = shaderMat.uniforms.map.value;
            shaderMat.alphaTest = shaderMat.uniforms.alphaCutoff.value;
            shaderMat.userData.muPcBaseBmdShader = true;
            mesh.material = shaderMat;
            mesh.userData.shaderMaterial = shaderMat;
            this._animatedShaderMaterials.push(shaderMat);
        }
        
        const shaderMat = mesh.material;
        shaderMat.uniforms.chromeMode ??= { value: 0 };
        shaderMat.uniforms.pcChromeUpAxis ??= { value: 0 };
        shaderMat.uniforms.chromeMode.value = pcChromeMode(flags);
        // A pre-existing ShaderMaterial can be supplied/restored by an owner.
        // Registration happens on render-flag changes, not in the frame hotpath.
        if (!this._animatedShaderMaterials.includes(shaderMat)) {
            this._animatedShaderMaterials.push(shaderMat);
        }
        shaderMat.uniforms.isChrome.value = (flags & RenderFlags.CHROME) || (flags & RenderFlags.CHROME2) || (flags & RenderFlags.CHROME3) || (flags & RenderFlags.CHROME4) || (flags & RenderFlags.CHROME5) || (flags & RenderFlags.CHROME6) || (flags & RenderFlags.CHROME7);
        shaderMat.uniforms.isMetal.value = (flags & RenderFlags.METAL) !== 0;
        shaderMat.uniforms.isOil.value = (flags & RenderFlags.OIL) !== 0;
    }

    // ---------- Shadow Rendering ----------

    renderShadow(camera) {
        // Render depth only for shadow mapping
        for (const mesh of this.meshes) {
            mesh.material.depthWrite = true;
            mesh.material.colorWrite = false;
        }
    }

    // ---------- Outline / Silhouette ----------

    renderOutline(color = 0x000000, thickness = 0.02) {
        // Create outline by scaling mesh along normals
        for (const mesh of this.meshes) {
            if (!mesh.userData.outlineMesh) {
                const outlineGeo = mesh.geometry.clone();
                const posAttr = outlineGeo.getAttribute('position');
                const normAttr = outlineGeo.getAttribute('normal');
                
                for (let i = 0; i < posAttr.count; i++) {
                    const x = posAttr.getX(i) + normAttr.getX(i) * thickness;
                    const y = posAttr.getY(i) + normAttr.getY(i) * thickness;
                    const z = posAttr.getZ(i) + normAttr.getZ(i) * thickness;
                    posAttr.setXYZ(i, x, y, z);
                }
                
                const outlineMesh = new THREE.Mesh(outlineGeo, new THREE.MeshBasicMaterial({
                    color: color,
                    side: THREE.BackSide,
                    depthWrite: false,
                    transparent: true,
                    opacity: 0.5
                }));
                outlineMesh.skeleton = mesh.skeleton;
                mesh.add(outlineMesh);
                mesh.userData.outlineMesh = outlineMesh;
            }
        }
    }

    // ---------- Attachment System ----------

    attachToBone(boneName, attachmentMesh, offset = new THREE.Vector3(), rotation = new THREE.Euler()) {
        const bone = this.bones.find(b => b.name === boneName);
        if (!bone) {
            console.warn(`[MUModelRenderer] Bone not found: ${boneName}`);
            return false;
        }
        
        const attachmentGroup = new THREE.Group();
        attachmentGroup.add(attachmentMesh);
        attachmentGroup.position.copy(offset);
        attachmentGroup.rotation.copy(rotation);
        
        bone.add(attachmentGroup);
        this.attachments.set(boneName, { mesh: attachmentMesh, group: attachmentGroup, offset, rotation });
        return true;
    }

    detachFromBone(boneName) {
        const attachment = this.attachments.get(boneName);
        if (attachment) {
            attachment.group.parent?.remove(attachment.group);
            this.attachments.delete(boneName);
            return true;
        }
        return false;
    }

    // ---------- Body Parts (MU-specific) ----------

    setBodyLight(color) {
        this.bodyLight.copy(color);
        // BMD::BodyLight is per actor/model, not a scene-wide PBR light. Push it
        // into every ordinary/chrome shader material owned by this renderer.
        for (const mesh of this.meshes) {
            const mat = mesh?.material;
            const light = mesh.userData?.muAuthoredBaseColor || this.bodyLight;
            if (mat?.uniforms?.diffuse?.value?.copy) mat.uniforms.diffuse.value.copy(light);
            if (mat?.color?.copy) mat.color.copy(light);
        }
    }

    setSkin(index) {
        const next = Number(index);
        if (!Number.isInteger(next) || next < 0 || next === this.skinIndex) return;
        this.skinIndex = next;
        for (const mesh of this.meshes) {
            if (mesh.userData.muSpecialTexture === 'skin') this._loadSkinTexture(next, mesh);
        }
    }

    async _loadSkinTexture(index, mesh) {
        const request = (mesh.userData.muSkinRequest || 0) + 1;
        mesh.userData.muSkinRequest = request;
        const isCurrent = () => !this._disposed && mesh.userData.muSkinRequest === request;
        const texPath = PC_SKIN_TEXTURE_PATH[index];
        if (!texPath) {
            mesh.visible = false;
            mesh.userData.textureMissing = `BITMAP_SKIN+${index}`;
            return;
        }
        const slash = texPath.lastIndexOf('/');
        const dir = slash >= 0 ? texPath.slice(0, slash) : 'Player';
        const name = slash >= 0 ? texPath.slice(slash + 1) : texPath;
        try {
            const loaded = await MUAssets.loadModelTexture(name, dir);
            const texture = loaded?.isTexture ? loaded : loaded?.createThreeTexture?.(THREE, { pcBmd: true });
            if (!texture?.isTexture) throw new Error('texture descriptor inválido');
            if (texture.userData?.muImageReadyPromise) await texture.userData.muImageReadyPromise;
            // An older decode must never overwrite a newer class/skin, or
            // resurrect a mesh retired during an equipment rebuild.
            if (!isCurrent()) return;
            if (!texture.image && texture.userData?.muImageReady !== true) throw new Error('textura ainda sem pixels');
            if (!Number.isInteger(texture.channel)) texture.channel = 0;
            mesh.material.map = texture;
            mesh.userData.originalMap = texture;
            mesh.userData.pcTextureOwner = `BITMAP_SKIN+${index}`;
            if (mesh.material.uniforms?.map) mesh.material.uniforms.map.value = texture;
            if (mesh.material.uniforms?.hasMap) mesh.material.uniforms.hasMap.value = true;
            mesh.material.needsUpdate = true;
            mesh.userData.textureReady = true;
            delete mesh.userData.textureMissing;
            mesh.visible = !mesh.userData.pcBitmapHide && !mesh.userData.muRenderModelHidden && !mesh.userData.muRenderFlagsSkip;
        } catch (e) {
            if (!isCurrent()) return;
            mesh.visible = false;
            mesh.userData.textureMissing = texPath;
            console.warn(`[MUModelRenderer] Failed to load PC skin ${texPath}: ${e.message}`);
        }
    }

    setBodyScale(scale) {
        this.bodyScale = scale;
        this.group.scale.setScalar(scale);
    }

    // ---------- Scene Integration ----------

    addToScene(scene) {
        scene.add(this.group);
        this.scene = scene;
    }

    removeFromScene() {
        if (this.scene) {
            this.scene.remove(this.group);
            this.scene = null;
        }
    }

    // ---------- Disposal ----------

    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        // Overlay geometries are shared with base meshes: dispose only their
        // materials, never the shared geometry/textures here.
        for (const mesh of this._overlayMeshes) {
            try { mesh.parent?.remove(mesh); } catch {}
            if (mesh.material) {
                if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose?.());
                else mesh.material.dispose?.();
            }
        }
        this._overlayMeshes = [];
        for (const owner of this._boneSprites) {
            try { owner.dispose?.(); } catch {}
        }
        this._boneSprites = [];
        this._presentationUpdates = [];
        // RenderModel UV-scroll passes clone only their own texture state so
        // shared BMD textures are never mutated. Dispose those private clones
        // with the same renderer owner.
        for (const tex of this.userData?.muOwnedPresentationTextures || []) {
            try { tex?.dispose?.(); } catch {}
        }
        if (this.userData) this.userData.muOwnedPresentationTextures = [];

        // Dispose geometries
        for (const mesh of this.meshes) {
            if(!isSharedBmdGeometry(mesh.geometry))mesh.geometry.dispose();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.dispose());
                } else {
                    mesh.material.dispose();
                }
            }
        }
        for(const lease of this._geometryLeases)lease.release();
        this._geometryLeases=[];
        
        // Dispose textures
        for (const mat of this._materialCache.values()) {
            // Maps belong to MUAssets and may still be used by another actor,
            // icon or the replacement graph. Only private presentation clones
            // (disposed above) belong to this renderer.
            mat.dispose();
        }
        
        
        // Remove from scene
        this.removeFromScene();
        
        // Clear references
        this.meshes = [];
        this._animatedShaderMaterials = [];
        // R50 item presentation: overlay passes share this renderer/skeleton.
        // They are registered once per item appearance and updated without
        // allocating a second WebGL context or a second animation owner.
        this._overlayMeshes = [];
        this._boneSprites = [];
        this._presentationUpdates = [];
        this.skeleton?.dispose?.();
        this.bones = [];
        this.mixer.stopAll();
    }
}

// ============================================================
// High-level Factory Functions
// ============================================================

/**
 * Create a character model renderer
 * @param {number} classId - Character class (0x00=DW, 0x10=DK, 0x20=ELF, etc.)
 * @param {Object} options - Renderer options
 * @returns {Promise<MUModelRenderer>}
 */
export async function createCharacterModel(classId, options = {}) {
    const renderer = new MUModelRenderer(options);
    
    // Map class ID to model path
    const modelPaths = {
        0x00: 'Player/Knight.bmd',
        0x10: 'Player/Knight.bmd',
        0x20: 'Player/Elf.bmd',
        0x30: 'Player/MagicKnight.bmd',
        0x40: 'Player/DarkLord.bmd',
        0x50: 'Player/Summoner.bmd',
        0x60: 'Player/RageFighter.bmd',
    };
    
    const path = modelPaths[classId] || 'Player/Knight.bmd';
    await renderer.load(path);
    return renderer;
}

/**
 * Create a monster model renderer
 * @param {number} monsterType - Monster type ID
 * @param {Object} options - Renderer options
 * @returns {Promise<MUModelRenderer>}
 */
export async function createMonsterModel(monsterType, options = {}) {
    const renderer = new MUModelRenderer(options);
    
    const modelPaths = {
        0: 'Monster/bullfighter01.bmd',
        1: 'Monster/budge.bmd',
        2: 'Monster/bull.bmd',
        10: 'Monster/ghost_bull.bmd',
        44: 'Monster/dragon.bmd',
    };
    
    const path = modelPaths[monsterType] || `Monster/monster${String(monsterType).padStart(2, '0')}.bmd`;
    await renderer.load(path);
    return renderer;
}

/**
 * Create equipment model (weapon, wing, etc.)
 * @param {string} relPath - Path to BMD file
 * @param {Object} options - Renderer options
 * @returns {Promise<MUModelRenderer>}
 */
export async function createEquipmentModel(relPath, options = {}) {
    const renderer = new MUModelRenderer(options);
    await renderer.load(relPath);
    return renderer;
}

export default MUModelRenderer;
