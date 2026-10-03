// game/PetSystem.js — Pet Dark Raven + Mount Companion FIEL ao PC (Main 5.2).
//
// Autoridade PC (Dark Raven):
//   CSPetSystem.cpp:276-291 (CSPetDarkSpirit::Create):
//     Weapon[1].Type → gDarkSpirit.getDarkSpirit(...) → Type = MODEL_DARK_SPIRIT
//   ZzzOpenData.cpp:4144: AccessModel(MODEL_DARK_SPIRIT, "Data\Skill\", "DarkSpirit")
//     → Skill/darkspirit.bmd (probe real: 4 actions, 77 bones, 5 meshes)
//   CSPetSystem.cpp:382-395 (MovePet → PlayAnimation switch por AI):
//     PET_FLY=0, PET_FLYING=1, PET_STAND=2, PET_STAND_START=1, PET_ATTACK/ESCAPE=3
//     (probe darkspirit.bmd: EXATAMENTE 4 actions — casa com o enum)
//   CSPetSystem.cpp:397-497 (MovePet fly):
//     FlyRange = 150; hover Height = owner.z + 250 (CharacterHeight);
//     pitch clamp ±15°; dentro do range: Speed = −(rand%8+32)*0.1 (idle-fly
//     deriva), fora: Speed = −(rand%64+128)*0.1 (aproxima); dirZ rand±3.2
//     (wander vertical); Angle[2] += rand%60 quando perto.
//   CSPetSystem.cpp:417-429: spark trail 1×/frame:
//     CreateParticleFpsChecked(BITMAP_SPARK+1, bonePos, angle, Light(0.3,0.4,0.7), 5, 0.8)
//     BITMAP_SPARK+1 = "Effect\Spark03.jpg" (ZzzOpenData.cpp:5128)
//   CSPetSystem.cpp:498-534 (PET_ATTACK/ESCAPE): MoveHumming ao alvo,
//     ao chegar: ESCAPE com pitch −45°, volta FLYING quando > (FlyRange+100)².
//   GIPetManager.cpp:351: pet Eff_LevelUp quando o dono soba de nível.
//   CSPetSystem.cpp:649: CSPetDarkSpirit::Eff_LevelUp (flash de level do pet).
//
// MOUNT COMPANION (fenrir) — R12.5 junction com a lane 3cf4 (resolver):
//   PlayerComposer out.fenrir = {option, petModelPath} (L214) → aqui vira o
//   companion CreateBug do PC:
//   GOBoid.cpp:131-143 CreateBug(MODEL_FENRIR_*): companion NO MUNDO que copia
//     Position/Angle/HeadAngle do owner (MoveBug L193-194) — NÃO é anexo no
//     bone; Chaos Castle guard (L133); owner morto → companion some (L153-157).
//   GOBoid.cpp:170-270 MoveBug fenrir: mapeia action do PLAYER → action do
//     fenrir (BMD 6 actions, probe real; _define.h:516-521):
//     PLAYER_FENRIR_ATTACK*→FENRIR_ATTACK(3, vel .4), SKILL*→ATTACK_SKILL(4),
//     DAMAGE*→DAMAGE(5), STAND*→STAND(0), DIE1→STAND, WALK*→WALK(1, vel 1.0),
//     RUN*→RUN(2, vel 0.6).
//   ZzzOpenData.cpp:4125-4135: MODEL_FENRIR_{BLACK,RED,BLUE,GOLD} →
//     "Data\Skill\fenril_{black,red,blue,gold}" — Option1 (ZzzCharacter.cpp:
//     L12677-12701): 1=BLACK, 2=BLUE, 4=GOLD, 0=RED (junction 3cf4).
//
// RIDER COMPANIONS (HELPER:2 UNICON / HELPER:3 PEGASUS) — R12.5:
//   ZzzCharacter.cpp:12638-12648: HelperType 2 → CreateBug(MODEL_UNICON),
//     3 → CreateBug(MODEL_PEGASUS) (e[9]&1=1 discrimina pegasus, senão unicon).
//   ZzzOpenData.cpp:4121-4122: AccessModel(MODEL_UNICON,"Data\Skill\","Rider",1)
//     / MODEL_PEGASUS,"Rider",2 → Skill/Rider01.bmd / Rider02.bmd (padStart-2
//     no nome do arquivo — probe real: Rider01 unicon.smd 4 actions/24 bones,
//     Rider02 pegasus.smd 8 actions/73 bones, ambos v10 parse OK).
//   CreateBugSub (GOBoid.cpp:109-111): Scale 0.9 p/ ambos.
//   MoveBug (GOBoid.cpp:495-601): copiam Position/Angle do owner; mapa normal:
//     UNICON idle→0, walk/run→2, attack→3, skill-rider→6;
//     PEGASUS idle→0, walk/run→2/3 (TARKAN/HEAVEN/Maya variantes 1/3), attack→4
//     (variante 5), skill-rider→6 (variante 7); Velocity 0.34 todos;
//     safezone alpha 0 (L497-502); dono morto → some (L600 o->Live=Owner->Live).
//   OpenTexture(MODEL_PEGASUS,"Skill\") (ZzzOpenData.cpp:4285) — texturas
//     unicon.jpg/unicon01.tga/RDgon.jpg/RDgonW.tga resolvem em Skill/.
//   NOTA: DarkHorse (HELPER:4) fica fail-closed — Skill/DarkHorse.bmd é v12
//   encriptado (não suportado pelo parser v10 atual; sem fake).
//
// HELPER COMPANION (HELPER:0 — fairy/Angel/Dino etc.) — R12.5 t-muhgu6qw-1:
//   ZzzCharacter.cpp:12633-12649: HelperType 0 → CreateBug(MODEL_HELPER, pos, o).
//   AccessModel(MODEL_HELPER, "Data\Player\", "Helper", 1) (ZzzOpenData.cpp:748)
//     → Player/Helper01.bmd (probe real: 6253B, fairy.smd, 2 meshes
//       fairy.jpg/fairy2.jpg, 8 bones, 1 action).
//   CreateBugSub spawn (GOBoid.cpp:86-118): pos = owner.xy ± rand(512-256),
//     z = owner.z + rand(128)+128; Scale 0.7; Light(3,3,3); Velocity 0.5;
//     Alpha 0 → AlphaTarget 1 (fade-in); BlendMesh=1 (L114).
//   MoveBug MODEL_HELPER (GOBoid.cpp:608-661): FlyRange 150; sparks
//     BITMAP_SPARK = "Effect\Spark02.jpg" (ZzzOpenData.cpp:5127 — NÃO é o
//     Spark03 do Dark Raven) 4× por frame-check Light(0.4,0.4,0.4);
//     fora do range: TurnAngle2 20°/s para o dono + approach Speed
//     =−(rand%64+128)*0.1; dentro: drift Speed=−(rand%64+16)*0.1 e
//     Angle=rand(360) a cada rand(32); Direction[2]=(rand%64−32)*0.1;
//     hover band z ∈ [owner.z+100, owner.z+200] (re-center ±1.5/s, L659-660).
//   RenderBug (GOBoid.cpp:690-695): CHARACTER_SCENE → Scale 1.2 (o PC MOSTRA
//     o bug no preview do char-select).
//
// Política zero-placeholder: o mesh é SEMPRE o BMD real via MUAssets.loadBMD
// (fail-closed — sem modelo procedural inventado). Se o asset não carregar,
// summon falha com log e NÃO cria pet fake.
import * as THREE from 'three';
import { MUAssets } from '../assets/MUAssetLoader.js';
import { MUModelRenderer } from '../assets/MUModelRenderer.js';
import { applyMuUpAxis } from '../graphics/BmdAdapter.js';
import { decodeCharacterEquipment } from '../data/CharacterEquipmentCodec.js';
import { serverClassToClientClass, CLASS } from '../data/CharacterClassMap.js';

/** Actions do darkspirit.bmd — enum AI do PC (CSPetSystem.cpp:387-393). */
export const PET_ACTIONS = { FLY: 0, FLYING: 1, STAND: 2, ATTACK: 3 };

/** Actions do fenril_*.bmd — _define.h:516-521 (probe: 6 actions exatas). */
export const FENRIR_ACTIONS = {
    STAND: 0, WALK: 1, RUN: 2, ATTACK: 3, ATTACK_SKILL: 4, DAMAGE: 5,
};

/** Actions dos Rider01/02.bmd (probe real: UNICON 4 actions, PEGASUS 8).
 *  Mapa PC MoveBug (GOBoid.cpp:495-601, mapa normal):
 *  UNICON: idle 0, walk/run 2, attack 3, skill-rider 6.
 *  PEGASUS: idle 0, walk 2, run 3, attack 4, skill-rider 6. */
export const RIDER_ACTIONS = {
    UNICON: { IDLE: 0, WALK: 2, RUN: 2, ATTACK: 3, SKILL: 6 },
    PEGASUS: { IDLE: 0, WALK: 2, RUN: 3, ATTACK: 4, SKILL: 6 },
};

/** Actions do DarkHorse.bmd (probe real: 7 actions) — MoveBug MODEL_DARK_HORSE
 *  (GOBoid.cpp:324-494): ATTACK_DARKHORSE→3, RUN_RIDE_HORSE→1 (walk run),
 *  ATTACK_RIDE_*→2, IDLE1_DARKHORSE→5, IDLE2_DARKHORSE→6, senão STAND 0. */
export const DARKHORSE_ACTIONS = {
    IDLE: 0, WALK: 1, RUN: 1, ATTACK: 3, ATTACK_RIDE: 2, IDLE1: 5, IDLE2: 6,
};

/** BMD real por espécie de rider (ZzzOpenData.cpp:4121-4122, padStart-2). */
export const RIDER_MODEL = {
    unicon: 'Skill/Rider01.bmd',   // MODEL_UNICON (AccessModel "Rider",1)
    pegasus: 'Skill/Rider02.bmd',  // MODEL_PEGASUS (AccessModel "Rider",2)
    'dark-horse': 'Skill/DarkHorse.bmd', // MODEL_DARK_HORSE (ZzzOpenData.cpp:4123; v12 decrypt OK)
};

/** Constantes de voo — CSPetSystem.cpp:398,444. */
const FLY_RANGE = 150;        // FlyRange
const HOVER_HEIGHT = 250;     // CharacterHeight sobre o dono
const SPARK_TEX = 'Effect/Spark03.OZJ'; // BITMAP_SPARK+1 (ZzzOpenData.cpp:5128)
const PET_BMD = 'Skill/darkspirit.bmd';  // AccessModel (ZzzOpenData.cpp:4144)

/** Helper companion (MODEL_HELPER) — GOBoid.cpp:608-661. */
const HELPER_FLY_RANGE = 150;               // FlyRange (L611)
const HELPER_HOVER_MIN = 100;                // z > owner.z+100 (L659)
const HELPER_HOVER_MAX = 200;                // z < owner.z+200 (L660)
const HELPER_SPARK_TEX = 'Effect/Spark02.OZJ'; // BITMAP_SPARK base (ZzzOpenData.cpp:5127)
const HELPER_BMD = 'Player/Helper01.bmd';   // AccessModel "Helper",1 (ZzzOpenData.cpp:748)
const HELPER_SPARK_LIGHT = [0.4, 0.4, 0.4];  // Vector(0.4,0.4,0.4) (L613)
const HELPER_LIGHT = [3, 3, 3];              // CreateBugSub (GOBoid.cpp:92)

/** Light do spark trail — CSPetSystem.cpp:418. */
const SPARK_LIGHT = [0.3, 0.4, 0.7];

let sparkTexture = undefined; // undefined=não carregado | THREE.Texture | null
let helperSparkTexture = undefined; // BITMAP_SPARK base (Spark02) do MODEL_HELPER

async function _loadHelperSparkTexture() {
    if (helperSparkTexture !== undefined) return helperSparkTexture;
    try {
        const { RemoteAssets } = await import('../data/RemoteAssets.js');
        const url = await RemoteAssets.fetchImageURL(HELPER_SPARK_TEX);
        if (!url) { helperSparkTexture = null; return null; }
        helperSparkTexture = await new Promise((resolve, reject) => {
            new THREE.TextureLoader().load(url, resolve, undefined, reject);
        });
        if (helperSparkTexture) helperSparkTexture.colorSpace = THREE.SRGBColorSpace;
    } catch {
        helperSparkTexture = null; // fail-closed: sparks simplesmente não renderizam
    }
    return helperSparkTexture;
}

async function _loadSparkTexture() {
    if (sparkTexture !== undefined) return sparkTexture;
    try {
        const { RemoteAssets } = await import('../data/RemoteAssets.js');
        const url = await RemoteAssets.fetchImageURL(SPARK_TEX);
        if (!url) { sparkTexture = null; return null; }
        sparkTexture = await new Promise((resolve, reject) => {
            new THREE.TextureLoader().load(url, resolve, undefined, reject);
        });
        if (sparkTexture) sparkTexture.colorSpace = THREE.SRGBColorSpace;
    } catch {
        sparkTexture = null; // fail-closed: trail simplesmente não renderiza
    }
    return sparkTexture;
}

/**
 * Pet Dark Raven com modelo BMD REAL.
 * @param {object} owner personagem dono (precisa de .position THREE)
 * @param {THREE.Scene} scene
 */
export class Pet {
    constructor(owner, scene) {
        this.owner = owner;
        this.scene = scene;
        this.level = 1;
        this.experience = 0;
        this.attackCooldown = 0;
        this.attackInterval = 2.0;       // intervalo de ataque do jogo web
        this.def = { name: 'Dark Raven', dmgPct: 0.25, range: 6, expToLevel: 120 };
        // AI/ação PC (MovePet): FLYING é o hover padrão fora de safezone
        this.ai = 'PET_FLYING';
        this.renderer = null;
        this.root = null;
        this.sparkSprites = [];
        this.sparkTimer = 0;
        this._elapsed = 0;
    }

    /** Carrega o BMD real e monta o visual (fail-closed). */
    async init() {
        const bmd = await MUAssets.loadBMD(PET_BMD); // throw se ausente
        this.renderer = new MUModelRenderer();
        await this.renderer.initFromBMD(bmd);        // throw se 0 meshes
        applyMuUpAxis(this.renderer.group);
        this.root = new THREE.Group();
        this.root.add(this.renderer.group);
        this.root.position.copy(this.owner.position)
            .add(new THREE.Vector3(FLY_RANGE * 0.5, HOVER_HEIGHT, 0));
        this.setAction(PET_ACTIONS.FLYING);
        _loadSparkTexture().catch(() => {});
        return this;
    }

    /** SetAction PC (CSPetSystem.cpp:387-393) — índice = action do BMD. */
    setAction(idx) {
        if (!this.renderer) return;
        const act = this.renderer.playAction(`action_${idx}`);
        if (!act) console.warn(`[PetSystem] action_${idx} ausente em ${PET_BMD}`);
    }

    /**
     * Update fiel ao MovePet (CSPetSystem.cpp:299-534), simplificado ao
     * caso do jogo web atual: FLYING hover + ATTACK quando há alvo.
     * @param {number} dt segundos
     * @param {Monster[]} monsters
     * @returns {{monster, damage}|null} evento de ataque p/ o jogo resolver
     */
    update(dt, monsters = []) {
        if (!this.renderer || !this.root) return null;
        this.attackCooldown = Math.max(0, this.attackCooldown - dt);
        this._elapsed += dt;
        this.renderer.update(dt, this._elapsed);

        const ownerPos = this.owner.position;

        // Target = dono (m_bActionStart=false — CSPetSystem.cpp:409)
        const dx = ownerPos.x - this.root.position.x;
        const dz = ownerPos.z - this.root.position.z;
        const dist2 = dx * dx + dz * dz;
        const hoverY = ownerPos.y + HOVER_HEIGHT; // Height (CSPetSystem.cpp:451)

        // Pet AI attack: alvo vivo no range do jogo web (equivalente do
        // TargetCharacter do PC — o gerenciador escolhe, aqui o mais próximo)
        let target = null;
        if (this.attackCooldown <= 0) {
            let best = this.def.range * 100; // range em unidades MU
            for (const m of monsters) {
                // R24 authority fence: entidades de viewport do GS nunca são
                // escolhidas pela IA local do pet. O ataque/dano/EXP real
                // pertence ao servidor e será apresentado por packets próprios.
                if (!m || m.serverDriven || (m.isAlive && !m.isAlive())) continue;
                const d = m.position.distanceTo(ownerPos);
                if (d < best) { best = d; target = m; }
            }
        }

        if (target) {
            // PET_ATTACK (CSPetSystem.cpp:498-523): MoveHumming ao alvo
            this.setAction(PET_ACTIONS.ATTACK);
            const t = target.position;
            const dir = new THREE.Vector3(t.x - this.root.position.x, 0, t.z - this.root.position.z);
            const d = dir.length() || 1;
            const speed = 30; // Velocity típica do attack dive do PC
            this.root.position.addScaledVector(dir.normalize(), Math.min(speed * dt, d));
            this.root.position.y += THREE.MathUtils.clamp(
                (t.y + HOVER_HEIGHT * 0.6 - this.root.position.y), -60 * dt, 60 * dt);
            this.root.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI; // facing MU→three
            this.attackCooldown = this.attackInterval;
            const base = (this.owner.attackDamageMax ?? this.owner.attackDamage ?? 10);
            return {
                monster: target,
                damage: Math.floor(base * this.def.dmgPct * (1 + 0.1 * (this.level - 1))),
            };
        }

        // FLY/FLYING hover (CSPetSystem.cpp:413-497)
        if (this.ai !== 'PET_FLYING') { this.ai = 'PET_FLYING'; this.setAction(PET_ACTIONS.FLYING); }

        // Vertical: aproxima do hover Height com pitch clamp ±15° visual
        const dy = hoverY - this.root.position.y;
        this.root.position.y += THREE.MathUtils.clamp(dy, -40 * dt, 40 * dt);

        if (dist2 >= FLY_RANGE * FLY_RANGE) {
            // Fora do range: aproxima (Speed=−(rand%64+128)*0.1 ~ −16 u/s)
            const d = Math.sqrt(dist2) || 1;
            const speed = 16;
            this.root.position.x += (dx / d) * speed * dt;
            this.root.position.z += (dz / d) * speed * dt;
            this.root.rotation.y = Math.atan2(dx, dz) + Math.PI;
        } else {
            // Dentro do range: deriva (Speed=−(rand%8+32)*0.1) + wander
            const wander = 3.5; // ~Speed médio do PC dentro do range
            this.root.position.x += (Math.random() - 0.5) * wander * dt * 10;
            this.root.position.z += (Math.random() - 0.5) * wander * dt * 10;
            this.root.position.y += (Math.random() - 3.2) * dt * 6; // dirZ rand±3.2
            this.root.rotation.y += (Math.random() - 0.5) * dt * 6; // Angle+=rand%60
        }

        // Spark trail (CSPetSystem.cpp:423-429): 1 partícula/frame, life curto
        this._sparkTrail(dt);

        return null;
    }

    /** CreateParticleFpsChecked(BITMAP_SPARK+1, ...) — 1/frame do PC. */
    _sparkTrail(dt) {
        this.sparkTimer += dt;
        if (this.sparkTimer < 0.04) return; // ~25fps lógico do PC
        this.sparkTimer = 0;
        if (sparkTexture == null || !sparkTexture) {
            if (sparkTexture === undefined) _loadSparkTexture().catch(() => {});
            return; // fail-closed: sem textura real, sem trail
        }
        const mat = new THREE.SpriteMaterial({
            map: sparkTexture,
            color: new THREE.Color(SPARK_LIGHT[0], SPARK_LIGHT[1], SPARK_LIGHT[2]),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const s = new THREE.Sprite(mat);
        // scale 5 (CreateParticleFpsChecked arg) → 5×5 unidades mundo? O PC
        // usa partícula pequena: Scale 0.8 → ~5×0.8*10 visual; aqui 6 units.
        s.scale.setScalar(6);
        s.position.copy(this.root.position);
        this.scene.add(s);
        const born = performance.now();
        const iv = setInterval(() => {
            const t = (performance.now() - born) / 1000;
            s.material.opacity = Math.max(0, 1 - t / 0.5);
            if (t >= 0.5) {
                clearInterval(iv);
                this.scene.remove(s);
                s.material.dispose();
            }
        }, 50);
    }

    /** GIPetManager.cpp:351: dono level up → pet Eff_LevelUp (flash). */
    effLevelUp() {
        if (!this.renderer) return;
        // CSPetSystem.cpp:649 Eff_LevelUp — replay da action FLYING (flash
        // visual equivalente; sem autoridade de partícula específica aqui).
        const act = this.renderer.playAction(`action_${PET_ACTIONS.FLYING}`, 0.1);
        if (act) { act.reset(); }
    }

    gainExp(amount) {
        this.experience += amount;
        const needed = this.def.expToLevel * this.level;
        if (this.experience >= needed && this.level < 50) {
            this.experience -= needed;
            this.level++;
            return true;
        }
        return false;
    }

    get damageMultiplier() { return 1 + 0.1 * (this.level - 1); }

    serialize() {
        return { petKey: 'dark_raven', level: this.level, experience: this.experience };
    }

    dispose() {
        if (this.root && this.scene) this.scene.remove(this.root);
        try { this.renderer?.dispose(); } catch { /* noop */ }
        this.renderer = null;
        this.root = null;
    }
}

/**
 * MountCompanion — port de CreateBug/MoveBug (GOBoid.cpp:131-290) para o
 * fenrir. Companion NO MUNDO que copia posição/ângulo do dono e mapeia a
 * action do player (via animationControl tags) → action do fenrir BMD.
 *
 * @param {object} owner personagem dono (com .position e .mesh)
 * @param {THREE.Scene} scene
 * @param {string} petModelPath Skill/fenril_{red|black|blue|gold}.bmd
 * @param {number} option Option1 do codec (0=red,1=black,2=blue,4=gold)
 */
export class MountCompanion {
    constructor(owner, scene, petModelPath, option) {
        this.owner = owner;
        this.scene = scene;
        this.petModelPath = petModelPath;
        this.option = option ?? 0;
        // Espécie: fenrir (default histórico) ou rider unicon/pegasus
        // (HELPER:2/3 — MoveBug próprio GOBoid.cpp:495-601).
        this.species = /Rider0?1\.bmd$/i.test(petModelPath) ? 'unicon'
            : /Rider0?2\.bmd$/i.test(petModelPath) ? 'pegasus'
            : /DarkHorse\.bmd$/i.test(petModelPath) ? 'dark-horse'
            : 'fenrir';
        this.renderer = null;
        this.root = null;
        this._elapsed = 0;
        this._currentFenrirAction = -1;
        this._ownerAnimState = null;
        this._riderActionIdx = null;
    }

    async init() {
        const bmd = await MUAssets.loadBMD(this.petModelPath); // fail-closed
        this.renderer = new MUModelRenderer();
        await this.renderer.initFromBMD(bmd); // fenrir 6 actions/58 bones; Rider01 4/24; Rider02 8/73 (probes)
        applyMuUpAxis(this.renderer.group);
        this.root = new THREE.Group();
        this.root.add(this.renderer.group);
        this.root.position.copy(this.owner.position);
        this.root.rotation.copy(this.owner.mesh?.rotation ?? new THREE.Euler());
        this.scene.add(this.root);
        // Scale CreateBugSub (GOBoid.cpp:104-111): fenrir 0.9, riders 0.9,
        // DARK_HORSE 1.0 (L106-107 — explícito e distinto dos riders).
        this.root.scale.setScalar(this.species === 'dark-horse' ? 1.0 : 0.9);
        this.setAction(FENRIR_ACTIONS.STAND, 0.4);
        return this;
    }

    /**
     * SetAction do fenrir (_define.h:516-521) com Velocity/PlaySpeed do
     * MoveBug (GOBoid.cpp:203-258): ATTACK/SKILL/DAMAGE/STAND=0.4,
     * WALK=1.0, RUN=0.6.
     */
    setAction(idx, playSpeed) {
        if (!this.renderer || idx === this._currentFenrirAction) return;
        this._currentFenrirAction = idx;
        const act = this.renderer.playAction(`action_${idx}`);
        if (act) {
            act.timeScale = playSpeed;
        } else {
            console.warn(`[PetSystem] fenrir action_${idx} ausente em ${this.petModelPath}`);
        }
    }

    /**
     * MoveBug + rider ride-state juntos: companion copia pos/yaw do dono,
     * mapeia a action do creature, e aplica a action PLAYER_FENRIR_* no
     * renderer do HERÓI (o rider anda com as actions de montado enquanto
     * o fenrir está invocado — ZzzAI.cpp:302-448).
     * @param {number} dt
     * @param {MUModelRenderer} [heroRenderer] renderer do Player.bmd (opcional —
     *        Scene._playerRenderer; se ausente, ride-state é no-op fail-closed)
     */
    update(dt, heroRenderer = null) {
        if (!this.renderer || !this.root) return;

        // Owner morto → companion some (GOBoid.cpp:153-157)
        if (this.owner.isAlive && !this.owner.isAlive()) {
            this.dispose();
            return;
        }

        // Copia Position/Angle (GOBoid.cpp:192-194)
        this.root.position.copy(this.owner.position);
        const ownerYaw = this.owner.mesh?.rotation?.y ?? 0;
        this.root.rotation.y = ownerYaw;

        // Avança animação própria (PlayAnimation com Velocity do SetAction)
        this._elapsed += dt;
        this.renderer.update(dt, this._elapsed);

        // Mapeamento action player → action fenrir (GOBoid.cpp:196-258)
        const control = this.owner.mesh?.userData?.animationControl;
        const state = control?._current ?? 'idle';

        // Rider: herói toca PLAYER_FENRIR_* enquanto montado (ZzzAI.cpp:302-448)
        if (heroRenderer) this.applyRiderAction(heroRenderer, state);

        if (state === this._ownerAnimState) return;
        this._ownerAnimState = state;
        // Riders (unicon/pegasus) — MoveBug GOBoid.cpp:562-598: attack/skill
        // mapeiam por espécie (UNICON attack=3/skill=6; PEGASUS attack=4/
        // skill=6), walk/run análogo; Velocity 0.34 todos (L599).
        // DarkHorse — MoveBug GOBoid.cpp:338-428: PLAYER_ATTACK_DARKHORSE→3
        // vel 0.34, RUN_RIDE_HORSE→1 vel 0.34, ATTACK_RIDE_*→2, IDLE1/2→5/6,
        // default STAND 0 vel 0.3 (L425-427).
        if (this.species === 'dark-horse') {
            const A = DARKHORSE_ACTIONS;
            if (state === 'attack') { this.setAction(A.ATTACK, 0.34); }
            else if (state === 'walk' || state === 'run') { this.setAction(A.WALK, 0.34); }
            else { this.setAction(A.IDLE, 0.3); }
            return;
        }
        if (this.species !== 'fenrir') {
            const A = RIDER_ACTIONS[this.species === 'pegasus' ? 'PEGASUS' : 'UNICON'];
            if (state === 'attack' || state === 'skill') {
                this.setAction(state === 'skill' ? A.SKILL : A.ATTACK, 0.34);
            } else if (state === 'walk') {
                this.setAction(A.WALK, 0.34);
            } else if (state === 'run') {
                this.setAction(A.RUN, 0.34);
            } else {
                this.setAction(A.IDLE, 0.34);
            }
            return;
        }
        if (state === 'attack' || state === 'skill') {
            // GOBoid.cpp:196-209: ATTACK*→FENRIR_ATTACK(3) vel .4, SKILL*→ATTACK_SKILL(4)
            this.setAction(state === 'skill' ? FENRIR_ACTIONS.ATTACK_SKILL : FENRIR_ACTIONS.ATTACK, 0.4);
        } else if (state === 'walk') {
            this.setAction(FENRIR_ACTIONS.WALK, 1.0); // L252-253
        } else if (state === 'run') {
            this.setAction(FENRIR_ACTIONS.RUN, 0.6); // L257-258
        } else {
            this.setAction(FENRIR_ACTIONS.STAND, 0.4); // L218/223/244 default
        }
    }

    /**
     * RIDER ride-state: actions PLAYER_FENRIR_* do HERÓI montado, escolhidas
     * POR ARMA/classe como o PC (ZzzAI.cpp:360-448 SetAction_Fenrir_Run/Walk;
     * calibração enum==BMD-action: ATTACK=90, RUN=110..121, STAND=122..125,
     * WALK=126..129 — cache player-bmd-action-index-calibration):
     *   both weapons → *_TWO_SWORD (110/126; ELF→118 _ELF, DARK/MAGOM→114)
     *   only right   → *_ONE_RIGHT (112/128; ELF→120, MAGOM→116)
     *   only left    → *_ONE_LEFT (113/129; ELF→121, MAGOM→117)
     *   bare         → base (110/126; ELF→118 _ELF, MAGOM→114)
     * MVP: variantes por classe base ELF/DARK(MAGOM) e RAGEFIGHTER mapeadas;
     * o PC usa GetBaseClass(c->Class).
     * @param {'idle'|'walk'|'run'} state movimento atual
     * @param {{weaponRightEmpty:boolean, weaponLeftEmpty:boolean, baseClass?:number}} hero
     */
    static rideActionFor(state, hero = {}) {
        const rightEmpty = hero.weaponRightEmpty ?? false;
        const leftEmpty = hero.weaponLeftEmpty ?? false;
        const isElf = hero.baseClass === CLASS.ELF;    // 2 (Fairy/ Muse/ High Elf)
        const isMagom = hero.baseClass === CLASS.DARK;  // 3 (Magic Gladiator — MAGOM)
        const twoSword = !rightEmpty && !leftEmpty;
        const oneRight = !rightEmpty && leftEmpty;
        const oneLeft = rightEmpty && !leftEmpty;
        if (state === 'walk') {
            // PC L437-448: WALK NÃO tem variantes ELF/MAGOM
            if (twoSword) return 127;  // PLAYER_FENRIR_WALK_TWO_SWORD
            if (oneRight) return 128;  // PLAYER_FENRIR_WALK_ONE_RIGHT
            if (oneLeft) return 129;    // PLAYER_FENRIR_WALK_ONE_LEFT
            return 126;                 // PLAYER_FENRIR_WALK
        }
        if (state === 'run') {
            // PC L360-417: RUN tem variantes ELF/MAGOM por classe base
            if (twoSword) return isElf ? 119 : (isMagom ? 115 : 111); // RUN_TWO_SWORD{,_ELF,_MAGOM}
            if (oneRight) return isElf ? 120 : (isMagom ? 116 : 112); // RUN_ONE_RIGHT{,_ELF,_MAGOM}
            if (oneLeft) return isElf ? 121 : (isMagom ? 117 : 113);  // RUN_ONE_LEFT{,_ELF,_MAGOM}
            return isElf ? 118 : (isMagom ? 114 : 110);               // RUN{,_ELF,_MAGOM}
        }
        // idle: PLAYER_FENRIR_STAND* (enum 122-125; o rider parado usa o
        // mesmo padrão por arma do RUN/WALK — sem variantes de classe)
        if (twoSword) return 123;  // STAND_TWO_SWORD
        if (oneRight) return 124;  // STAND_ONE_RIGHT
        if (oneLeft) return 125;   // STAND_ONE_LEFT
        return 122;                // STAND bare
    }

    /**
     * Attack MONTADO por arma — SetPlayerAttack com Helper+37
     * (ZzzCharacter.cpp:925-952): SPEAR→99 (L927-928), BOW→101 (L929-931),
     * CROSSBOW→98 (L933-935), TWO_SWORD→97 (L939-940), ONE_SWORD→100 (uma
     * arma em qualquer mão, L941-944), bare→90 (L945-946); DARK_LORD
     * override→93 (L949-952).
     * @param {{weaponRightEmpty:boolean, weaponLeftEmpty:boolean, baseClass?:number,
     *          weaponRightExtType?:number}} hero
     */
    static rideAttackActionFor(hero = {}) {
        const rightEmpty = hero.weaponRightEmpty ?? false;
        const leftEmpty = hero.weaponLeftEmpty ?? false;
        const w0 = hero.weaponRightExtType;
        if (hero.baseClass === CLASS.DARK_LORD) return 93; // ATTACK_DARKLORD_SWORD override (L951)
        // SPEAR: extType [1536, 1541) — L927: MODEL_SPEAR..MODEL_SPEAR+4
        if (w0 != null && w0 >= 3 * 512 && w0 < 3 * 512 + 5) return 99;
        // GetEquipedBowType (CharacterManager.cpp:334-346): BOW = ITEM_BOW
        // (4*512) + [0-6, 17, 20-24]; CROSSBOW = ITEM_BOW + [8-14, 16, 18-19]
        if (w0 != null && w0 >= 4 * 512 && w0 < 5 * 512) {
            const off = w0 - 4 * 512;
            const isBow = (off >= 0 && off <= 6) || off === 17 || (off >= 20 && off <= 24);
            const isCrossbow = (off >= 8 && off <= 14) || off === 16 || off === 18 || off === 19;
            if (isBow) return 101;       // ATTACK_BOW (L929-931)
            if (isCrossbow) return 98;   // ATTACK_CROSSBOW (L933-935)
            // offsets 7/15/25: BOWTYPE_NONE no PC → cai no melee (else L937)
        }
        if (!rightEmpty && !leftEmpty) return 97;  // TWO_SWORD (L939-940)
        if ((!rightEmpty && leftEmpty) || (rightEmpty && !leftEmpty)) return 100; // ONE_SWORD (L941-944)
        return 90;                                  // bare ATTACK (L945-946)
    }

    /**
     * Aplica a action do rider no renderer do herói (o PC: CurrentAction do
     * OBJECT passa a ser PLAYER_FENRIR_* enquanto montado). Idempotente.
     * A escolha da action é por ARMA do herói (ZzzAI.cpp:360-448): as
     * weapons vêm do charset decodificado do owner (playerChar.charset →
     * decodeCharacterEquipment) quando disponível.
     */
    applyRiderAction(heroRenderer, state) {
        if (!heroRenderer?.playAction) return;
        // Armas do herói: decode do charset atual do owner (se existir) —
        // PC usa c->Weapon[0]/[1].Type != -1 (mão direita/esquerda).
        let weaponRightEmpty = false;
        let weaponLeftEmpty = false;
        let baseClass = 0;
        let weaponRightExtType = null;
        try {
            const cs = this.owner?.charset;
            if (Array.isArray(cs) && cs.length >= 18) {
                const decoded = decodeCharacterEquipment(cs);
                weaponRightEmpty = decoded.weaponRight?.empty ?? false;
                weaponLeftEmpty = decoded.weaponLeft?.empty ?? false;
                baseClass = serverClassToClientClass(decoded.classByte) & 7;
                weaponRightExtType = decoded.weaponRight?.empty ? null : (decoded.weaponRight?.extType ?? null);
            }
        } catch { /* fail-closed: sem charset válido = bare-hand */ }
        const heroInfo = { weaponRightEmpty, weaponLeftEmpty, baseClass, weaponRightExtType };
        const idx = state === 'attack'
            ? MountCompanion.rideAttackActionFor(heroInfo) // ZzzCharacter.cpp:925-952
            : MountCompanion.rideActionFor(state, heroInfo); // ZzzAI.cpp:360-448
        if (this._riderActionIdx === idx) return;
        this._riderActionIdx = idx;
        const act = heroRenderer.playAction(`action_${idx}`);
        if (!act) {
            console.warn(`[PetSystem] rider action_${idx} (PLAYER_FENRIR_*) ausente no Player.bmd`);
            this._riderActionIdx = null;
        }
    }

    /**
     * Rider foi atingido → creature toca FENRIR_DAMAGE (action 5) —
     * GOBoid.cpp:211-215: CurrentAction ∈ [PLAYER_FENRIR_DAMAGE,
     * PLAYER_FENRIR_DAMAGE_ONE_LEFT] → SetAction(o, FENRIR_DAMAGE),
     * Velocity 0.4. No web o gatilho é o onDamageTaken do router
     * (F3:07 ReceiveDamage, WSclient.cpp:13194) — o GameApp chama
     * PetSystem.notifyHeroDamage() no hook. Volta ao estado normal no
     * próximo update (o mapeamento por animação do dono re-prevalece).
     */
    notifyDamage() {
        this.setAction(FENRIR_ACTIONS.DAMAGE, 0.4); // GOBoid.cpp:213-214
        this._ownerAnimState = null; // força re-mapeamento no próximo update
    }

    dispose() {
        if (this.root && this.scene) this.scene.remove(this.root);
        try { this.renderer?.dispose(); } catch { /* noop */ }
        this.renderer = null;
        this.root = null;
    }
}

/**
 * HelperCompanion — port de CreateBug/MoveBug MODEL_HELPER (GOBoid.cpp
 * :608-661 + CreateBugSub :86-118) para o HELPER:0 (fairy/Angel/Dino...).
 * Companion voador do char: spawna a ±rand(512-256) do dono com fade-in
 * (Alpha 0→1), orbita/drifta dentro do FlyRange 150, aproxima quando
 * fora (TurnAngle2 20°/s, Speed −(rand%64+128)*0.1), solta sparks
 * BITMAP_SPARK (Spark02 — diferente do Spark03 do Dark Raven) e mantém
 * hover entre owner.z+100 e owner.z+200 (re-center ±1.5/s, L659-660).
 *
 * Fail-closed: BMD ausente → init() throw (o caller não cria fake).
 * No preview (CHARACTER_SCENE) o PC usa Scale 1.2 (RenderBug L690-695).
 */
export class HelperCompanion {
    /** @param {number} [previewScale] 1.0 mundo | 1.2 preview (RenderBug L692) */
    constructor(owner, scene, previewScale = 1.0) {
        this.owner = owner;
        this.scene = scene;
        this.previewScale = previewScale;
        this.renderer = null;
        this.root = null;
        this._elapsed = 0;
        this._sparkTimer = 0;
        this._sparkEvery = 1 / 25;      // rand_fps_check(1) @ ~25fps lógico do PC
        this._driftTimer = 0;
        this._driftEvery = 32 * (1 / 25); // rand_fps_check(32) (GOBoid.cpp:645)
        this._driftSpeed = 0;
        this._dirZ = 0;
        this._yaw = 0;
        this._alpha = 0;               // CreateBugSub: Alpha 0 → AlphaTarget 1
    }

    async init() {
        const bmd = await MUAssets.loadBMD(HELPER_BMD); // throw se ausente (fail-closed)
        this.renderer = new MUModelRenderer();
        await this.renderer.initFromBMD(bmd);          // throw se 0 meshes
        applyMuUpAxis(this.renderer.group);
        this.root = new THREE.Group();
        this.root.add(this.renderer.group);
        // Spawn CreateBugSub (GOBoid.cpp:115-117): owner.xy ± rand(512-256),
        // z = owner.z + rand(128)+128 — dentro da hover band do MoveBug.
        const ox = this.owner.position.x, oz = this.owner.position.z;
        this.root.position.set(
            ox + (Math.random() * 512 - 256),
            this.owner.position.y + (Math.random() * 128 + 128),
            oz + (Math.random() * 512 - 256),
        );
        // Scale: 0.7 do CreateBugSub × 1.0 mundo / 1.2 CHARACTER_SCENE (RenderBug)
        this.root.scale.setScalar(0.7 * this.previewScale);
        this.renderer.playAction('action_0'); // 1 action (probe fairy.smd)
        _loadHelperSparkTexture().catch(() => {});
        return this;
    }

    /**
     * MoveBug MODEL_HELPER (GOBoid.cpp:608-661): approach por TurnAngle2
     * quando fora do FlyRange, drift lento dentro, sparks e hover band.
     */
    update(dt) {
        if (!this.renderer || !this.root) return;
        // Owner morto → companion some (GOBoid.cpp:153-157, MoveBug geral)
        if (this.owner.isAlive && !this.owner.isAlive()) { this.dispose(); return; }
        this._elapsed += dt;
        this.renderer.update(dt, this._elapsed);

        // Alpha fade-in (CreateBugSub L88-89: Alpha 0 → AlphaTarget 1)
        if (this._alpha < 1) {
            this._alpha = Math.min(1, this._alpha + dt * 2);
            this.root.traverse((o) => {
                if (o.material) {
                    o.material.transparent = true;
                    o.material.opacity = this._alpha;
                }
            });
        }

        const ownerPos = this.owner.position;
        const dx = ownerPos.x - this.root.position.x;
        const dz = ownerPos.z - this.root.position.z;
        const dist2 = dx * dx + dz * dz;

        // Drift re-roll a cada rand_fps_check(32) (GOBoid.cpp:645-658):
        // fora: Speed=−(rand%64+128)*0.1 | dentro: Speed=−(rand%64+16)*0.1 e
        // Angle[2]=rand%360 (L653).
        this._driftTimer += dt;
        if (this._driftTimer >= this._driftEvery) {
            this._driftTimer = 0;
            if (dist2 >= HELPER_FLY_RANGE * HELPER_FLY_RANGE) {
                this._driftSpeed = -((Math.random() * 64 + 128) * 0.1);
            } else {
                this._driftSpeed = -((Math.random() * 64 + 16) * 0.1);
                this._yaw = Math.random() * Math.PI * 2;
            }
            this._dirZ = (Math.random() * 64 - 32) * 0.1;  // Direction[2] (L657)
        }

        // Fora do range: TurnAngle2 20°/s na direção do dono (L637-638) —
        // yaw persegue o ângulo ao owner antes de avançar.
        if (dist2 >= HELPER_FLY_RANGE * HELPER_FLY_RANGE) {
            const targetYaw = Math.atan2(dx, dz);
            let diff = targetYaw - this._yaw;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            this._yaw += THREE.MathUtils.clamp(diff, -20 * dt, 20 * dt);
        }

        // Movimento no heading local (VectorRotate Direction, L640-643).
        // O Speed do PC é negativo (avanço no frame local) — magnitude/s.
        const speed = Math.abs(this._driftSpeed) * 10; // escala MU p/ unidade/s web
        this.root.position.x += Math.sin(this._yaw) * speed * dt;
        this.root.position.z += Math.cos(this._yaw) * speed * dt;
        this.root.rotation.y = this._yaw;
        // Position[2] += rand%16-8 por tick (L644) + hover band (L659-660)
        this.root.position.y += (Math.random() * 16 - 8) * dt * 2.5;
        if (this.root.position.y < ownerPos.y + HELPER_HOVER_MIN) this._dirZ += 1.5 * dt;
        if (this.root.position.y > ownerPos.y + HELPER_HOVER_MAX) this._dirZ -= 1.5 * dt;
        this.root.position.y += this._dirZ * dt * 10;

        // Sparks BITMAP_SPARK 4×/frame-check (L614-621) — fail-closed sem textura
        this._sparks(dt);
    }

    _sparks(dt) {
        this._sparkTimer += dt;
        if (this._sparkTimer < this._sparkEvery) return;
        this._sparkTimer = 0;
        if (helperSparkTexture == null || !helperSparkTexture) {
            if (helperSparkTexture === undefined) _loadHelperSparkTexture().catch(() => {});
            return;
        }
        for (let j = 0; j < 4; j++) {
            const mat = new THREE.SpriteMaterial({
                map: helperSparkTexture,
                color: new THREE.Color(HELPER_SPARK_LIGHT[0], HELPER_SPARK_LIGHT[1], HELPER_SPARK_LIGHT[2]),
                transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
            });
            const s = new THREE.Sprite(mat);
            s.scale.setScalar(4);
            // Position = o->Position + rand(±8) por eixo (L618-619)
            s.position.set(
                this.root.position.x + (Math.random() * 16 - 8),
                this.root.position.y + (Math.random() * 16 - 8),
                this.root.position.z + (Math.random() * 16 - 8),
            );
            this.scene.add(s);
            const born = performance.now();
            const iv = setInterval(() => {
                const t = (performance.now() - born) / 1000;
                s.material.opacity = Math.max(0, 1 - t / 0.5);
                if (t >= 0.5) {
                    clearInterval(iv);
                    this.scene.remove(s);
                    s.material.dispose();
                }
            }, 50);
        }
    }

    dispose() {
        if (this.root && this.scene) this.scene.remove(this.root);
        try { this.renderer?.dispose(); } catch { /* noop */ }
        this.renderer = null;
        this.root = null;
    }
}

export class PetSystem {
    constructor(scene = null) {
        this.scene = scene;
        this.pets = new Map(); // character -> Pet (dark raven)
        this.mounts = new Map(); // character -> MountCompanion (fenrir)
        this.helpers = new Map(); // character -> HelperCompanion (HELPER:0)
    }

    /**
     * Summon com modelo REAL (fail-closed: BMD ausente → null + log).
     * Anteriormente criava esfera/cone procedural — removido (zero-fake).
     */
    async summon(character, _petKey = 'dark_raven') {
        const old = this.pets.get(character);
        if (old) { old.dispose(); this.pets.delete(character); }
        if (!this.scene) return null;
        try {
            const pet = new Pet(character, this.scene);
            await pet.init(); // throw = sem pet fake
            this.pets.set(character, pet);
            character.calculateStats?.();
            return pet;
        } catch (e) {
            console.warn('[PetSystem] summon falhou (fail-closed, sem pet fake):', e.message);
            return null;
        }
    }

    /**
     * Summon do MOUNT companion (fenrir) — CreateBug(MODEL_FENRIR_*) do PC
     * (GOBoid.cpp:131-143 via ZzzCharacter.cpp:12677-12701). Consome o
     * junction da lane 3cf4: out.fenrir = {option, petModelPath} do
     * buildEquipmentAttach (PlayerComposer L214).
     * @returns {Promise<MountCompanion|null>} null = fail-closed (sem mount fake)
     */
    async summonMount(character, fenrirInfo) {
        if (!this.scene) return null;
        if (!fenrirInfo?.petModelPath) {
            console.warn('[PetSystem] summonMount sem petModelPath (fail-closed):', fenrirInfo);
            return null;
        }
        const old = this.mounts.get(character);
        if (old) { old.dispose(); this.mounts.delete(character); }
        try {
            const mount = new MountCompanion(character, this.scene, fenrirInfo.petModelPath, fenrirInfo.option);
            await mount.init(); // throw = sem mount fake
            this.mounts.set(character, mount);
            return mount;
        } catch (e) {
            console.warn('[PetSystem] summonMount falhou (fail-closed):', e.message);
            return null;
        }
    }

    /** Dismount/ removal do companion (DeleteBug — ThePetProcess().DeletePet). */
    dismissMount(character) {
        const m = this.mounts.get(character);
        if (m) {
            m.dispose();
            this.mounts.delete(character);
        }
    }

    /**
     * Summon do HELPER companion (HELPER:0 — fairy/Angel/Dino...):
     * CreateBug(MODEL_HELPER) do PC (ZzzCharacter.cpp:12646 via
     * CreateBugSub GOBoid.cpp:86-118). Fail-closed: BMD ausente → null.
     * @param {object} character dono (com .position)
     * @param {number} [previewScale] 1.0 mundo | 1.2 preview CHARACTER_SCENE
     * @returns {Promise<HelperCompanion|null>}
     */
    async summonHelper(character, previewScale = 1.0) {
        if (!this.scene) return null;
        const old = this.helpers.get(character);
        if (old) { old.dispose(); this.helpers.delete(character); }
        try {
            const helper = new HelperCompanion(character, this.scene, previewScale);
            await helper.init(); // throw = sem helper fake
            this.helpers.set(character, helper);
            return helper;
        } catch (e) {
            console.warn('[PetSystem] summonHelper falhou (fail-closed, sem helper fake):', e.message);
            return null;
        }
    }

    /** DeleteBug do helper (RemoveBug — GOBoid DeleteBug por Owner). */
    dismissHelper(character) {
        const h = this.helpers.get(character);
        if (h) {
            h.dispose();
            this.helpers.delete(character);
        }
    }

    getHelper(character) { return this.helpers.get(character) || null; }

    getMount(character) { return this.mounts.get(character) || null; }

    /**
     * Herói tomou dano (F3:07 ReceiveDamage via router onDamageTaken) →
     * o fenrir companion dele toca FENRIR_DAMAGE (GOBoid.cpp:211-215).
     * Fail-closed: sem mount = noop.
     */
    notifyHeroDamage(character) {
        const mount = this.mounts.get(character);
        if (mount) mount.notifyDamage();
    }

    dismiss(character) {
        const pet = this.pets.get(character);
        if (pet) {
            pet.dispose();
            this.pets.delete(character);
        }
    }

    get(character) { return this.pets.get(character); }

    update(dt, monsters, onPetAttack = null, { serverAuthoritative = false } = {}) {
        const localTargets = serverAuthoritative ? [] : (Array.isArray(monsters) ? monsters : []);
        for (const [owner, pet] of this.pets) {
            if (!owner.isAlive()) continue;
            // Connected GS lane: o pet continua com hover/animação/trail real,
            // mas não escolhe alvo nem fabrica dano/EXP local. Até o packet de
            // ação/ataque do pet ser comprovado, a apresentação fica fail-closed.
            const result = pet.update(dt, localTargets);
            if (result) {
                // Hard fence independente do estado da conexão: um actor
                // serverDriven jamais aceita dano vindo da simulação local.
                if (serverAuthoritative || result.monster?.serverDriven) continue;
                const res = result.monster.takeDamage(result.damage, owner);
                pet.gainExp(res.dealt);
                owner.gainExp?.(Math.floor(res.dealt * 0.3));
                if (onPetAttack) onPetAttack({ pet, owner, ...result, result: res });
            }
        }
        // Mounts (fenrir): MoveBug — copiam pos/action do dono (GOBoid.cpp:170-270)
        // + rider ride-state: heroRenderer opcional do GameApp (Scene
        // ._playerRenderer) — herói toca PLAYER_FENRIR_* enquanto montado.
        for (const [owner, mount] of this.mounts) {
            mount.update(dt, this.heroRenderer || null);
            if (!mount.renderer) this.mounts.delete(owner); // disposed (dono morreu)
        }
        // Helpers (HELPER:0 — MODEL_HELPER): MoveBug GOBoid.cpp:608-661
        // (approach/drift/sparks/hover-band próprios — não seguem o dono
        // rigidamente como os mounts).
        for (const [owner, helper] of this.helpers) {
            helper.update(dt);
            if (!helper.renderer) this.helpers.delete(owner); // disposed (dono morreu)
        }
    }

    /**
     * Renderer do herói para o ride-state dos mounts (PLAYER_FENRIR_*).
     * Setado pelo GameApp (Scene._playerRenderer) — opcional fail-closed.
     */
    setHeroRenderer(renderer) {
        this.heroRenderer = renderer || null;
    }

    serialize() {
        const out = [];
        for (const [char, pet] of this.pets) out.push({ owner: char.name, ...pet.serialize() });
        return out;
    }
}
