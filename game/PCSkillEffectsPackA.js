// PCSkillEffectsPackA.js — source-evidenced MU Main 5.2 skill presentation lane.
// No generic fallback: missing authored asset/owner => fail-closed.
import * as THREE from 'three';
import { angleQuaternion } from '../graphics/BmdParser.js';
import { pcWheelWeaponPose, applyPcWheelWeaponAlpha } from './PcWheelWeaponPose.js';
import { applyPcStockItemPresentation } from '../graphics/ItemMaterialPresentation.js';
import { playerVisualLoadIssues } from '../graphics/PlayerComposer.js';
import { loadSkillTexture } from '../graphics/Effects.js';
import { Sound } from '../audio/SoundManager.js';
import {
  DEATH_CANNON_HALF_WIDTH, DEATH_CANNON_LIGHT, DEATH_CANNON_LIFE_TICKS,
  DEATH_CANNON_MAX_TAILS, deathCannonFadeForTick, deathCannonTrailWeb,
} from './PcDeathCannonForce4.js';
import {
  VITALITY_HALF_WIDTH, VITALITY_LIGHT, VITALITY_LIFE_TICKS, VITALITY_MAX_TAILS,
  VITALITY_SPIRIT_COUNT, vitalitySpiritFadeForRemainingTicks, vitalitySpiritSideWeb,
  vitalitySpiritTrailWeb,
} from './PcVitalitySpirit2.js';
import { VITALITY_MAGIC_PULSE_INDICES, VITALITY_MAGIC_SUBTYPE, VITALITY_MAGIC_LIFE_TICKS, VITALITY_MAGIC_LIGHT, VITALITY_FLARE_SUBTYPE, VITALITY_FLARE_LIFE_TICKS, VITALITY_FLARE_STATIONARY_TICKS, VITALITY_FLARE_MOVE_TICKS, VITALITY_FLARE_MAX_TAILS, VITALITY_FLARE_SCALE } from './PcVitalitySecondary.js';
import {
  BLOW_BLUE_LIGHT, BLOW_IMPACT_SECONDS, BLOW_ROOT_LIFE_TICKS, blowImpactOwnersWeb,
} from './PcBlowDestruction232.js';
import { blowSecondaryImpactAuthor, blowTerrainAuraAuthor } from './PcBlowSecondary.js';
import {
  FURY_IMPACT_SECONDS, FURY_TAIL_SECONDS, FURY_TRAVEL_SECONDS, furyImpactCoreOwnersWeb, furyOwnerState,
  furyTailOwnersWeb, furyTerrainWallOwnersWeb,
} from './PcFuryStrikeCore.js';
import { furySparkImpactAuthor } from './PcFurySpark0.js';
import { PcTerrainAlphaPass } from '../graphics/PcRuneAura.js';
import { MAP_SIZE } from '../world/TerrainWorld.js';

const PC_HZ = 25;
const TICK = 1 / PC_HZ;

export class PCSkillEffectsPackA {
  constructor(scene, register) {
    this.scene = scene;
    this.register = register;
    this._warned = new Set();
    this._blowSerial = 0;
    this._blowBmd = new Map();
    this._furySerial = 0;
    this._furyBmd = new Map();
    this._prewarm();
  }

  _warnOnce(key, text) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.info(text);
  }

  _loadBlowBmd(path) {
    let promise = this._blowBmd.get(path);
    if (!promise) {
      promise = import('../assets/MUAssetLoader.js')
        .then(({ MUAssets }) => MUAssets.loadBMD(path))
        .catch((e) => { this._blowBmd.delete(path); throw e; });
      this._blowBmd.set(path, promise);
    }
    return promise;
  }

  _loadFuryBmd(path) {
    let promise = this._furyBmd.get(path);
    if (!promise) {
      promise = import('../assets/MUAssetLoader.js')
        .then(({ MUAssets }) => MUAssets.loadBMD(path))
        .catch((e) => { this._furyBmd.delete(path); throw e; });
      this._furyBmd.set(path, promise);
    }
    return promise;
  }

  _prewarm() {
    // Exact retained client assets used by the cases implemented below.
    loadSkillTexture('Effect/JointSpirit01.OZJ').catch(() => {});
    loadSkillTexture('Effect/hole.OZJ').catch(() => {});
    loadSkillTexture('Effect/Magic_Ground2.OZJ').catch(() => {});
    for (const path of ['Effect/nightwater01.bmd','Effect/knight_plancrack_a.bmd','Effect/knight_plancrack_b.bmd','Effect/knight_plancrack_grand.bmd']) this._loadBlowBmd(path).catch(() => {});
    for (const path of ['Skill/tail.bmd','Skill/flashing.bmd','Skill/EarthQuake01.bmd','Skill/EarthQuake02.bmd','Skill/EarthQuake03.bmd','Skill/combo.bmd']) this._loadFuryBmd(path).catch(() => {});
    if (typeof Sound.loadWav === 'function') {
      const exactWavs = [
        ['pc-vitality','eSwellLife.wav'], ['pc-blow232','BLOW_OF_DESTRUCTION.wav'],
        ['pc-sword1','sKnightSkill1.wav'], ['pc-sword2','sKnightSkill2.wav'],
        ['pc-sword3','sKnightSkill3.wav'], ['pc-sword4','sKnightSkill4.wav'],
        ['pc-combo','eCombo.wav'],
        ['pc-fury1','eRageBlow_1.wav'], ['pc-fury2','eRageBlow_2.wav'], ['pc-fury3','eRageBlow_3.wav'],
      ];
      for (const [id,wav] of exactWavs) if (!Sound.buffers?.has?.(id)) Sound.loadWav(id,wav).catch(() => {});
    }
  }

  _playExact(id) {
    try { if (Sound.buffers?.has?.(id)) return Sound.play(id); } catch (_) {}
    return null;
  }

  /** WSclient.cpp::ReceiveMagic exact Sword1..5 audio owner. */
  playPcSwordReceiveSound(skillType) {
    const type=Number(skillType)|0;
    const id = type===19?'pc-sword1':type===20?'pc-sword2':type===21?'pc-sword3':(type===22||type===23)?'pc-sword4':null;
    return id ? this._playExact(id) : null;
  }

  // Main 5.2: WHEEL1 lives 5 ticks and owns WHEEL2 subtypes 0..4; each WHEEL2
  // lives 25 ticks and renders the owner's RIGHT weapon. We refuse to replace
  // that weapon-owned graph with a ring/plane approximation.
  createTwistingSlashEffect(position, facing = 0, opts = {}) {
    // ZzzCharacter AttackStage WHEEL: SOUND_SKILL_SWORD4 is independent of
    // whether the right-hand RenderPartObject owner can be materialized.
    this._playExact('pc-sword4');
    const spec = opts.ownerWeaponSpec || null;
    if (!spec?.model || !spec?.path) {
      this._warnOnce('wheel-owner', '[PCSkillFX] Twisting Slash: PC requires the caster right-hand weapon owner; no resolved weapon spec; owner weapon was not supplied — fail-closed.');
      return null;
    }
    const root = new THREE.Group();
    root.position.copy(position);
    this.scene.add(root);
    const alphas = [1.0, 0.6, 0.5, 0.4, 0.3];
    const owners = [];
    let alive = true;
    (async () => {
      let pendingRenderer = null;
      try {
        const { MUModelRenderer } = await import('../assets/MUModelRenderer.js');
        const { bmdToRenderData, applyMuUpAxis } = await import('../graphics/BmdAdapter.js');
        for (let i = 0; i < 5 && alive; i++) {
          const wr = new MUModelRenderer({ scene: this.scene });
          pendingRenderer = wr;
          await wr.initFromBMD(bmdToRenderData(spec.model, spec.path));
          if (Number.isInteger(spec.extType)) {
            await applyPcStockItemPresentation(wr, {
              type: spec.extType, rawLevel: spec.rawLevel || 0,
              option1: spec.option1 || 0, extOption: spec.extOption || 0,
              customColor: spec.customColor || null, effectType: spec.effectType || 0,
            });
          }
          const issues = playerVisualLoadIssues(wr);
          if (issues.length) throw new Error(`weapon presentation incomplete: ${issues.join(', ')}`);
          if (!alive) { wr.dispose?.(); break; }
          applyMuUpAxis(wr.group);
          wr.group.userData.pcWheelSubtype = i;
          wr.group.userData.pcWheelAlpha = alphas[i];
          applyPcWheelWeaponAlpha(wr, alphas[i]);
          const pose = pcWheelWeaponPose(facing, 0, spec.category === 3);
          wr.group.position.fromArray(pose.position);
          wr.group.quaternion.multiply(new THREE.Quaternion(...angleQuaternion(pose.angles)));
          root.add(wr.group); owners.push(wr); pendingRenderer = null;
        }
      } catch (e) {
        pendingRenderer?.dispose?.();
        this._warnOnce('wheel-owner-build', `[PCSkillFX] Twisting Slash weapon owner failed (${spec.path}): ${e.message}`);
      }
    })();
    let age = 0;
    const wheel1Life = 5 * TICK, life = 25 * TICK;
    root.userData.pcWheel1LifeTicks = 5;
    this.register({
      update: (dt) => {
        age += dt;
        if (opts.ownerPosition?.isVector3) root.position.copy(opts.ownerPosition);
        const tick = age / TICK;
        // WHEEL1 is the 5-tick controller; WHEEL2 owners persist for 25 ticks.
        root.userData.pcWheel1Alive = age < wheel1Life;
        const pose = pcWheelWeaponPose(facing, tick, spec.category === 3, dt / TICK);
        for (const wr of owners) {
          wr.group.position.fromArray(pose.position);
          wr.group.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
            .multiply(new THREE.Quaternion(...angleQuaternion(pose.angles)));
          wr.update?.(dt, age);
        }
        return age < life;
      },
      dispose: () => { alive = false; for (const wr of owners) try { wr.dispose?.(); } catch {} root.parent?.remove(root); },
    });
    return root;
  }

  // Main 5.2 Vitality / Greater Life. Verified contract: 36 JOINT_SPIRIT subtype 2,
  // MAGIC+1 subtype 4 pulses at i=0/20. R26 ports the primary JOINT_SPIRIT/2
  // owner itself from retained PC-derived math: 36 joints born in one event,
  // angle {-10,0,i*10}, caster +100 Z, Scale 60, LifeTime 20, MaxTails 3,
  // neutral .5/.5/.5 light and /1.2 fade in the final ten authored ticks.
  // The BITMAP_FLARE/2 child and MAGIC+1/4 ground pulses remain fail-closed
  // until their RNG/scale and physical ground-render acceptance are closed.
  createVitalityEffect(position, opts = {}) {
    if (opts.serverAuthoritative !== true) {
      this._warnOnce('vitality-authority', '[PCSkillFX] Vitality SPIRIT/2 is server-routed; refusing non-authoritative production spawn.');
      return null;
    }

    try { if (Sound.buffers?.has?.('pc-vitality')) Sound.play('pc-vitality'); } catch {}

    // MU Z is Web Y. ZzzCharacter authors the joint start at caster +100 Z.
    const origin = [position.x, position.y + 100, position.z];
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.userData.pcOwner = 'JOINT_SPIRIT';
    mesh.userData.pcJointSubtype = 2;
    mesh.userData.pcJointCount = VITALITY_SPIRIT_COUNT;
    mesh.userData.pcLifeTicks = VITALITY_LIFE_TICKS;
    mesh.userData.pcMaxTails = VITALITY_MAX_TAILS;
    mesh.userData.pcScale = VITALITY_HALF_WIDTH * 2;
    this.scene.add(mesh);

    let alive = true;
    let age = 0;
    let textureReady = false;
    const trail = [];
    const side = [0, 0, 0];

    // No solid-color/ring fallback: the real owner becomes visible only after
    // the retained JointSpirit01 texture has resolved.
    material.visible = false;
    loadSkillTexture('Effect/JointSpirit01.OZJ').then((tex) => {
      if (!alive || !tex) return;
      material.map = tex;
      material.needsUpdate = true;
      material.visible = true;
      textureReady = true;
    }).catch(() => {});

    const rebuild = (ticks) => {
      const positions = [];
      const uvs = [];
      const colors = [];
      const remaining = Math.max(0, VITALITY_LIFE_TICKS - ticks);
      const fade = vitalitySpiritFadeForRemainingTicks(remaining);

      const emitVertex = (p, sideSign, v, sx, sy, sz) => {
        positions.push(p[0] + sx * sideSign, p[1] + sy * sideSign, p[2] + sz * sideSign);
        uvs.push(sideSign < 0 ? 0 : 1, v);
        colors.push(VITALITY_LIGHT[0] * fade, VITALITY_LIGHT[1] * fade, VITALITY_LIGHT[2] * fade);
      };

      for (let joint = 0; joint < VITALITY_SPIRIT_COUNT; joint++) {
        const yawDeg = joint * 10;
        vitalitySpiritTrailWeb(origin, yawDeg, ticks, trail);
        if (trail.length < 2) continue;
        vitalitySpiritSideWeb(yawDeg, side);
        const history = trail.length - 1;
        // Retained RenderJoints maps the newest three authored samples over
        // MaxTails-1 (=2) longitudinal texture units, even before history fills.
        for (let i = 0; i < history; i++) {
          const a = trail[i], b = trail[i + 1];
          const vA = i / Math.max(1, VITALITY_MAX_TAILS - 1);
          const vB = (i + 1) / Math.max(1, VITALITY_MAX_TAILS - 1);
          emitVertex(a, -1, vA, side[0], side[1], side[2]);
          emitVertex(a, +1, vA, side[0], side[1], side[2]);
          emitVertex(b, +1, vB, side[0], side[1], side[2]);
          emitVertex(a, -1, vA, side[0], side[1], side[2]);
          emitVertex(b, +1, vB, side[0], side[1], side[2]);
          emitVertex(b, -1, vB, side[0], side[1], side[2]);
        }
      }

      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeBoundingSphere();
      geometry.setDrawRange(0, positions.length / 3);
    };

    rebuild(0);
    this.register({
      update: (dt) => {
        age += Math.max(0, Number.isFinite(dt) ? dt : 0);
        // Display interpolation samples the authored 25-Hz path continuously;
        // lifetime and trail span remain the exact 20/3 PC tick domains.
        const ticks = Math.min(VITALITY_LIFE_TICKS, age / TICK);
        rebuild(ticks);
        return age < VITALITY_LIFE_TICKS * TICK;
      },
      dispose: () => {
        alive = false;
        geometry.dispose();
        material.dispose();
        mesh.parent?.remove(mesh);
      },
    });
    mesh.userData.pcTextureReady = () => textureReady;
    // R33: retain the proved secondary owner graph on the authoritative root.
    // Rendering remains fail-closed until legacy rand() ordering and the exact
    // terrain-alpha / FLARE ribbon presentation are accepted in Web.
    mesh.userData.pcVitalitySecondaryAuthoring = Object.freeze({
      magic: Object.freeze({ owner: 'BITMAP_MAGIC+1', subtype: VITALITY_MAGIC_SUBTYPE, indices: VITALITY_MAGIC_PULSE_INDICES, lifeTicks: VITALITY_MAGIC_LIFE_TICKS, light: VITALITY_MAGIC_LIGHT, scaleDomain: '((50 + rand()%50)/100)*4' }),
      flare: Object.freeze({ owner: 'BITMAP_FLARE', subtype: VITALITY_FLARE_SUBTYPE, lifeTicks: VITALITY_FLARE_LIFE_TICKS, stationaryTicks: VITALITY_FLARE_STATIONARY_TICKS, moveTicks: VITALITY_FLARE_MOVE_TICKS, maxTails: VITALITY_FLARE_MAX_TAILS, scale: VITALITY_FLARE_SCALE, spawn: 'first authored SPIRIT/2 tick; XY rand()%200-100; MU Z-200' }),
      visible: false, reason: 'legacy-rand-order-and-renderer-pending',
    });
    this._warnOnce('vitality-secondary-debt', '[PCSkillFX] Vitality primary JOINT_SPIRIT/2 owner active; BITMAP_FLARE/2 child and MAGIC+1/4 pulses remain fail-closed pending exact RNG/physical acceptance.');
    return mesh;
  }

  // Fury Strike exact finite-owner subset recovered from retained Main-derived
  // Android evidence. R28 closes the LifeTime-13 tail event (0.40 s) and the
  // LifeTime-11 core impact event (0.48 s): 8 tail.bmd owners, EarthQuake03/01/02
  // and the Kind-0 flashing.bmd wave. TerrainWall-gated 4/5 spokes, 7/8 travel,
  // spark/water/terrain-light children remain fail-closed rather than bypassing
  // their PC gates.
  createFuryStrikeEffect(position, facing = 0, opts = {}) {
    if (opts.serverAuthoritative !== true) {
      this._warnOnce('fury-authority', '[PCSkillFX] Fury Strike is server-routed; refusing non-authoritative production spawn.');
      return null;
    }
    // AttackStage creates MODEL_SKILL_FURY_STRIKE then immediately plays RageBlow_1.
    this._playExact('pc-fury1');
    const serial = (++this._furySerial) >>> 0;
    const source = [position.x, position.y, position.z];
    const terrainHeightAt = typeof opts.terrainHeightAt === 'function' ? opts.terrainHeightAt : null;
    const tailSpecs = furyTailOwnersWeb(source, facing, serial);
    const impactGraph = furyImpactCoreOwnersWeb(source, facing, serial, terrainHeightAt);
    const wallGraph = furyTerrainWallOwnersWeb(source, facing, serial, terrainHeightAt, opts.terrainWallAt);
    const root = new THREE.Group();
    root.userData.pcOwner = 'MODEL_SKILL_FURY_STRIKE';
    root.userData.pcTailSeconds = FURY_TAIL_SECONDS;
    root.userData.pcImpactSeconds = FURY_IMPACT_SECONDS;
    root.userData.pcTailOwnerCount = tailSpecs.length;
    root.userData.pcCoreImpactOwnerCount = impactGraph.owners.length;
    root.userData.pcTerrainWallImpactOwnerCount = wallGraph.impact.length;
    root.userData.pcTerrainWallTravelOwnerCount = wallGraph.travel.length;
    root.userData.pcOpenStages = wallGraph.gated ? ['EarthQuake04/05 + 07/08 (TerrainWall unavailable)','JOINT_SPARK render','BITMAP_SPARK','water wave','terrain light'] : ['JOINT_SPARK render','BITMAP_SPARK','water wave','terrain light'];
    // R30: exact Fury impact JOINT_SPARK/0 call-site + constructor authoring is retained,
    // but presentation remains closed until the real joint texture/strip renderer is proven.
    root.userData.pcFurySparkAuthoring = furySparkImpactAuthor(impactGraph.impact?.explosion || source, facing, { position:(i)=>i, angle:(i)=>i, constructor:(i)=>i }).length;
    this.scene.add(root);

    let alive = true, age = 0, tailSpawned = false, impactSpawned = false;
    let furySound2=false, furySound3=false;
    const live = [];

    const setIntensity = (r, intensity) => {
      const k = Math.max(0, Number.isFinite(intensity) ? intensity : 1);
      r.setBodyLight?.(new THREE.Color(k, k, k));
      r.group?.traverse?.((o) => {
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) if (m?.color?.setRGB) m.color.setRGB(k, k, k);
      });
      if (r.group) r.group.userData.pcBlendMeshLight = k;
    };

    const spawn = async (spec, bornAge) => {
      try {
        const [{ MUModelRenderer }, { applyMuUpAxis }, bmd] = await Promise.all([
          import('../assets/MUModelRenderer.js'),
          import('../graphics/BmdAdapter.js'),
          this._loadFuryBmd(spec.path),
        ]);
        const r = new MUModelRenderer({ scene: this.scene });
        await r.initFromBMD(bmd);
        if (!alive || age >= bornAge + spec.life) { r.dispose?.(); return; }
        applyMuUpAxis(r.group);
        r.group.position.set(...spec.position);
        r.group.rotation.y = spec.yaw;
        r.group.scale.setScalar(spec.scale);
        r.group.userData.pcFuryTag = spec.tag;
        r.group.userData.pcAuthoredLife = spec.life;
        r.playAction?.('action_0');
        root.add(r.group);
        const st = { r, spec, bornAge, dead:false };
        live.push(st);
        const localAge = Math.max(0, age-bornAge);
        const state = furyOwnerState(spec, localAge);
        r.group.position.set(...state.position); r.group.scale.setScalar(state.scale); setIntensity(r,state.light);
      } catch (e) {
        this._warnOnce(`fury-r28-${spec.path}`, `[PCSkillFX] Fury owner ${spec.path} unavailable — that authored BMD stage is omitted fail-closed: ${e.message}`);
      }
    };
    const spawnTail = () => { if (tailSpawned) return; tailSpawned=true; for (const s of tailSpecs) void spawn(s,FURY_TAIL_SECONDS); };
    const spawnImpact = () => { if (impactSpawned) return; impactSpawned=true; for (const s of [...impactGraph.owners,...wallGraph.impact]) void spawn(s,FURY_IMPACT_SECONDS); };
    let travelSpawned=false;
    const spawnTravel = () => { if (travelSpawned) return; travelSpawned=true; for (const s of wallGraph.travel) void spawn(s,FURY_TRAVEL_SECONDS); };

    const maxLife = Math.max(...tailSpecs.map(s=>FURY_TAIL_SECONDS+s.life), ...[...impactGraph.owners,...wallGraph.impact].map(s=>FURY_IMPACT_SECONDS+s.life), ...wallGraph.travel.map(s=>FURY_TRAVEL_SECONDS+s.life), FURY_TRAVEL_SECONDS);
    this.register({
      update: (dt) => {
        const step=Math.max(0,Number.isFinite(dt)?dt:0), prev=age; age+=step;
        if (!tailSpawned && prev < FURY_TAIL_SECONDS && age + 1e-9 >= FURY_TAIL_SECONDS) spawnTail();
        // MoveEffect root LifeTime 13 / 10 owns RageBlow_2 / RageBlow_3.
        // The existing parity constants map those exact authored root events.
        if (!furySound2 && prev < FURY_TAIL_SECONDS && age + 1e-9 >= FURY_TAIL_SECONDS) { furySound2=true; this._playExact('pc-fury2'); }
        if (!impactSpawned && prev < FURY_IMPACT_SECONDS && age + 1e-9 >= FURY_IMPACT_SECONDS) spawnImpact();
        if (!travelSpawned && prev < FURY_TRAVEL_SECONDS && age + 1e-9 >= FURY_TRAVEL_SECONDS) spawnTravel();
        if (!furySound3 && prev < FURY_TRAVEL_SECONDS && age + 1e-9 >= FURY_TRAVEL_SECONDS) { furySound3=true; this._playExact('pc-fury3'); }
        for (const st of live) {
          if (st.dead) continue;
          const localAge=age-st.bornAge;
          if (localAge >= st.spec.life) { st.dead=true; try { st.r.dispose?.(); } catch {} continue; }
          const state=furyOwnerState(st.spec,Math.max(0,localAge));
          st.r.group.position.set(...state.position); st.r.group.scale.setScalar(state.scale); setIntensity(st.r,state.light);
          st.r.update?.(step,Math.max(0,localAge));
        }
        return age < maxLife;
      },
      dispose: () => { alive=false; for(const st of live) if(!st.dead){st.dead=true;try{st.r.dispose?.();}catch{}} root.parent?.remove(root); },
    });
    this._warnOnce('fury-r28-open-stages', '[PCSkillFX] Fury tail/core plus TerrainWall-gated 4/5 and 7/8 BMD lanes active when .att walls are resident; sparks/water/terrain-light remain fail-closed.');
    return root;
  }

  // Main 5.2 Death Cannon (AT_SKILL_DEATH_CANNON=73): caster +130 Z,
  // JOINT_FORCE subtype 4, scale 40, LifeTime 20; constructor resolves subtype 4
  // to Effect/hole.OZJ. ZzzCharacter.cpp places this owner ONLY in the
  // AT_SKILL_DEATH_CANNON branch. The historical Web method name below is
  // retained only for regression/API compatibility; production dispatch uses
  // createDeathCannonEffect().
  // R25 ports the retained FORCE/4 owner itself: deterministic 25-Hz motion,
  // 13-tail history, authored width and the last-ten-tick /1.3 light fade.
  // Secondary FLARE_BLUE/LIGHT/SHINY children remain fail-closed until their
  // exact Web billboard/ribbon scale mapping is accepted from physical capture.
  createDeathStabEffect(position, facing = 0, opts = {}) {
    if (opts.serverAuthoritative !== true) {
      this._warnOnce('death-cannon-authority', '[PCSkillFX] Death Cannon FORCE/4 is server-routed; refusing non-authoritative production spawn.');
      return null;
    }

    // MU vertical Z maps to Three Y. The retained constructor is caster +130 Z.
    const origin = [position.x, position.y + 130, position.z];
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.userData.pcOwner = 'JOINT_FORCE';
    mesh.userData.pcJointSubtype = 4;
    mesh.userData.pcLifeTicks = DEATH_CANNON_LIFE_TICKS;
    mesh.userData.pcMaxTails = DEATH_CANNON_MAX_TAILS;
    mesh.userData.pcScale = DEATH_CANNON_HALF_WIDTH * 2;
    this.scene.add(mesh);

    let alive = true;
    let age = 0;
    let textureReady = false;
    const trail = [];

    // The owner is real only with the authored BITMAP_HOLE texture. Until it
    // resolves, geometry stays invisible instead of substituting a color/plane.
    material.visible = false;
    loadSkillTexture('Effect/hole.OZJ').then((tex) => {
      if (!alive || !tex) return;
      material.map = tex;
      material.needsUpdate = true;
      material.visible = true;
      textureReady = true;
    }).catch(() => {});

    const rebuild = (ticks) => {
      deathCannonTrailWeb(origin, facing, ticks, trail);
      if (trail.length < 2) {
        geometry.setDrawRange(0, 0);
        return;
      }

      const positions = [];
      const uvs = [];
      const colors = [];
      const history = trail.length - 1;
      const authoredTick = Math.max(1, Math.min(DEATH_CANNON_LIFE_TICKS, Math.floor(ticks)));
      const fade = deathCannonFadeForTick(authoredTick);
      // Web mapping of the retained MU horizontal ribbon offset.
      const ox = Math.cos(facing) * DEATH_CANNON_HALF_WIDTH;
      const oz = Math.sin(facing) * DEATH_CANNON_HALF_WIDTH;

      const emitVertex = (p, side, u, brightness) => {
        positions.push(p[0] + ox * side, p[1], p[2] + oz * side);
        uvs.push(side < 0 ? 0 : 1, u);
        colors.push(
          DEATH_CANNON_LIGHT[0] * fade * brightness,
          DEATH_CANNON_LIGHT[1] * fade * brightness,
          DEATH_CANNON_LIGHT[2] * fade * brightness,
        );
      };

      for (let i = 0; i < history; i++) {
        const a = trail[i], b = trail[i + 1];
        // Audited FORCE/4 renderer calls appendSegment() with its default
        // longitudinal UV 0..1 for every tail span, and alpha is
        // (newest-relative-tail-index)/(MaxTails-1). With additive blending,
        // folding that authored alpha into RGB preserves the same contribution.
        const brightness = Math.max(0, (i + 1) / Math.max(1, DEATH_CANNON_MAX_TAILS - 1));
        emitVertex(a, -1, 0, brightness); emitVertex(a, +1, 0, brightness); emitVertex(b, +1, 1, brightness);
        emitVertex(a, -1, 0, brightness); emitVertex(b, +1, 1, brightness); emitVertex(b, -1, 1, brightness);
      }
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeBoundingSphere();
      geometry.setDrawRange(0, positions.length / 3);
    };

    rebuild(1);
    this.register({
      update: (dt) => {
        age += Math.max(0, Number.isFinite(dt) ? dt : 0);
        // Continuous interpolation only samples the deterministic 25-Hz owner;
        // it never advances gameplay or changes the authored 20-tick lifetime.
        const ticks = Math.min(DEATH_CANNON_LIFE_TICKS, age / TICK + 1);
        rebuild(ticks);
        return age < DEATH_CANNON_LIFE_TICKS * TICK;
      },
      dispose: () => {
        alive = false;
        geometry.dispose();
        material.dispose();
        mesh.parent?.remove(mesh);
      },
    });
    mesh.userData.pcTextureReady = () => textureReady;
    // R33: retain the proved secondary owner graph on the authoritative root.
    // Rendering remains fail-closed until legacy rand() ordering and the exact
    // terrain-alpha / FLARE ribbon presentation are accepted in Web.
    mesh.userData.pcVitalitySecondaryAuthoring = Object.freeze({
      magic: Object.freeze({ owner: 'BITMAP_MAGIC+1', subtype: VITALITY_MAGIC_SUBTYPE, indices: VITALITY_MAGIC_PULSE_INDICES, lifeTicks: VITALITY_MAGIC_LIFE_TICKS, light: VITALITY_MAGIC_LIGHT, scaleDomain: '((50 + rand()%50)/100)*4' }),
      flare: Object.freeze({ owner: 'BITMAP_FLARE', subtype: VITALITY_FLARE_SUBTYPE, lifeTicks: VITALITY_FLARE_LIFE_TICKS, stationaryTicks: VITALITY_FLARE_STATIONARY_TICKS, moveTicks: VITALITY_FLARE_MOVE_TICKS, maxTails: VITALITY_FLARE_MAX_TAILS, scale: VITALITY_FLARE_SCALE, spawn: 'first authored SPIRIT/2 tick; XY rand()%200-100; MU Z-200' }),
      visible: false, reason: 'legacy-rand-order-and-renderer-pending',
    });
    return mesh;
  }

  /**
   * Elf Heal/Defense/Attack primary ground owner.
   * ZzzCharacter.cpp creates BITMAP_MAGIC+1 subtypes 1/2/3 on the target.
   * ZzzEffect.cpp gives LifeTime=20; RenderEffect uses
   *   Scale=(20-LifeTime)*0.15
   *   final-five-tick luminosity fade
   *   subtype colors blue/green/orange
   * and RenderTerrainAlphaBitmap(Magic_Ground2,-Angle[2]).
   * Random CreateHealing joints and DEFENSE MODEL_SPEARSKILL/4 are deliberately
   * not synthesized here; they remain separate fail-closed owners.
   */
  createElfSupportGroundEffect(position, targetFacing = 0, subtype = 1, opts = {}) {
    if (opts.serverAuthoritative !== true) {
      this._warnOnce('elf-support-ground-authority-r87', '[PCSkillFX] Elf support ground requires server-authoritative RX.');
      return null;
    }
    if (![1,2,3].includes(Number(subtype))) return null;
    if (Number(subtype) === 2 && opts.success === false) return null; // DEFENSE exact gate
    const terrainHeightAt = typeof opts.terrainHeightAt === 'function' ? opts.terrainHeightAt : null;
    if (!terrainHeightAt || !position) return null;

    const root = new THREE.Group();
    root.userData.pcOwner = 'BITMAP_MAGIC+1';
    root.userData.pcAsset = 'Effect/Magic_Ground2.OZJ';
    root.userData.pcSubtype = Number(subtype);
    root.userData.pcLifeTicks = 20;
    root.userData.pcOpenChildren = Number(subtype) === 2
      ? ['CreateHealing/BITMAP_JOINT_HEALING-random', 'MODEL_SPEARSKILL/subtype4-defense-buff']
      : ['CreateHealing/BITMAP_JOINT_HEALING-random'];
    this.scene.add(root);

    const pcX = Number(position.x) + MAP_SIZE / 2;
    const pcY = MAP_SIZE / 2 - Number(position.z);
    const rotationDeg = -(Number(targetFacing) || 0) * 180 / Math.PI;
    const base = Number(subtype) === 1 ? new THREE.Color(0.4,0.6,1.0)
      : Number(subtype) === 2 ? new THREE.Color(0.4,1.0,0.6)
      : new THREE.Color(1.0,0.6,0.4);
    let age=0, alive=true, pass=null;
    void loadSkillTexture('Effect/Magic_Ground2.OZJ').then((texture) => {
      if (!alive || !texture) return;
      pass = new PcTerrainAlphaPass(this.scene, texture, terrainHeightAt);
      // Root is metadata only; terrain pass is world-space like the PC draw.
    }).catch(() => {});

    this.register({
      update: (dt) => {
        age += Math.max(0, Number.isFinite(dt) ? dt : 0);
        const ticks = Math.min(20, age / TICK);
        const remaining = Math.max(0, 20 - ticks);
        const scale = ticks * 0.15;
        const luminosity = remaining < 5 ? Math.max(0, 1 - (5 - remaining) * 0.2) : 1;
        if (pass) {
          const light = base.clone().multiplyScalar(luminosity);
          pass.update(pcX, pcY, scale, scale, rotationDeg, light);
          pass.mesh.visible = scale > 0 && luminosity > 0;
        }
        return age < 20 * TICK;
      },
      dispose: () => {
        alive=false;
        pass?.dispose?.();
        root.parent?.remove(root);
      },
    });
    return root;
  }

  /** Correct production owner for wire skill 73 (Death Cannon). */
  createDeathCannonEffect(position, facing = 0, opts = {}) {
    return this.createDeathStabEffect(position, facing, opts);
  }

  /**
   * Death Stab is AT_SKILL_ONETOONE=43, not SWORD5 and not FORCE/4.
   * AttackStage() proves its authored stages are MODEL_SPEARSKILL subtype 2
   * plus MODEL_SPEAR subtype 1 around the weapon link-bone across AttackTime.
   * Exact joint/effect update ownership is not yet fully ported, so R85 records
   * the source graph and intentionally renders no substitute.
   */
  createDeathStabAuthoring(position, facing = 0, opts = {}) {
    if (opts.serverAuthoritative !== true) {
      this._warnOnce('death-stab-authority-r85', '[PCSkillFX] Death Stab 43 requires server-authoritative RX; refusing local synthetic spawn.');
      return null;
    }
    const authoring = Object.freeze({
      skillType: 43,
      owner: 'ZzzCharacter.cpp::AttackStage/AT_SKILL_ONETOONE',
      action: 'PLAYER_ATTACK_ONETOONE',
      sound: 'SOUND_SKILL_SWORD2@AttackTime8',
      gather: Object.freeze({ model: 'MODEL_SPEARSKILL', modelPath: 'Skill/RidingSpear01.bmd', subtype: 2, countPerAuthoredTick: 3, attackTime: '2..8', scale: 40 }),
      stab: Object.freeze({ model: 'MODEL_SPEAR', subtype: 1, countPerAuthoredTick: 2, attackTime: '6..12', weaponLinkBone: true }),
      renderer: 'fail-closed-until-exact-SPEARSKILL-joint-and-MODEL_SPEAR-effect-update-contracts',
      position: position?.clone ? position.clone() : position,
      facing,
    });
    this._lastPcDeathStabAuthoring = authoring;
    // AttackTime starts at 1 on ReceiveMagic. CheckAttackTime(8) therefore
    // reaches SOUND_SKILL_SWORD2 after seven authored 40-ms ticks. Keep this
    // independent from the still fail-closed SPEARSKILL visual renderer.
    let age=0,played=false;
    this.register({
      update:(dt)=>{ age+=Math.max(0,Number(dt)||0); if(!played&&age+1e-9>=7*TICK){played=true;this._playExact('pc-sword2');} return age<9*TICK; },
      dispose:()=>{},
    });
    this._warnOnce('death-stab-r85-owner', '[PCSkillFX] Death Stab 43 owner corrected; old Death Cannon FORCE/4 substitution removed from production. Exact SPEARSKILL/SPEAR visual update remains fail-closed; AttackTime8 sound is source-owned.');
    return authoring;
  }

  /** Main 5.2 AT_SKILL_RIDER release owner: BITMAP_SHOTGUN + Sword3 sound.
   *  The SHOTGUN child graph (40 JOINT_SPARK + FIRE+2 + Bomb2) remains
   *  fail-closed until its joint/fire renderers are exact; never substitute a ring. */
  createRiderAuthoring(position, opts = {}) {
    if (opts.serverAuthoritative !== true) return null;
    this._playExact('pc-sword3');
    const authoring=Object.freeze({
      skillType:49, owner:'ZzzCharacter.cpp::AT_SKILL_RIDER', effect:'BITMAP_SHOTGUN',
      lifeTicks:10, initialVelocity:1, direction:[0,-30,0],
      initialOffset:[0,-20,50], sparkJoints:40, sound:'SOUND_SKILL_SWORD3',
      visible:false, reason:'BITMAP_JOINT_SPARK/FIRE+2/Bomb2 renderer parity pending',
      position:position?.clone?position.clone():position,
    });
    this._lastPcRiderAuthoring=authoring;
    this._warnOnce('rider-shotgun-fix43','[PCSkillFX] Rider action + Sword3 sound closed; BITMAP_SHOTGUN children remain fail-closed until exact joint/fire renderers.');
    return authoring;
  }

  /** Main 5.2 ReceiveMagic AT_SKILL_COMBO -> MODEL_COMBO + SOUND_COMBO. */
  createComboEffect(position, opts = {}) {
    if (opts.serverAuthoritative !== true) {
      this._warnOnce('combo-authority-fix43','[PCSkillFX] Combo requires server-authoritative ReceiveMagic owner.');
      return null;
    }
    this._playExact('pc-combo');
    const root=new THREE.Group();
    root.name='PC_MODEL_COMBO';
    root.position.copy(position); root.position.y += 50;
    root.userData.pcOwner='WSclient::AT_SKILL_COMBO -> ZzzEffect::MODEL_COMBO';
    root.userData.pcLifeTicks=20; root.userData.pcInitialScale=.9; root.userData.pcInitialGravity=.1;
    root.userData.pcSecondaryLightJoints=60; root.userData.pcSecondaryLightJointsVisible=false;
    root.userData.pcSecondaryOpenReason='BITMAP_LIGHT joint renderer remains fail-closed';
    this.scene.add(root);
    let alive=true,age=0,acc=0,life=20,scale=.9,gravity=.1,blendLight=1,renderer=null;
    (async()=>{
      try {
        const [{MUModelRenderer},{applyMuUpAxis},bmd]=await Promise.all([
          import('../assets/MUModelRenderer.js'),import('../graphics/BmdAdapter.js'),this._loadFuryBmd('Skill/combo.bmd')]);
        const r=new MUModelRenderer({scene:this.scene}); await r.initFromBMD(bmd);
        if(!alive){r.dispose?.();return;} renderer=r; applyMuUpAxis(r.group); r.group.scale.setScalar(scale);
        r.group.userData.pcBlendMesh=-2; r.group.userData.pcBlendMeshLight=blendLight; r.playAction?.('action_0'); root.add(r.group);
      } catch(e){ this._warnOnce('combo-bmd-fix43',`[PCSkillFX] Skill/combo.bmd unavailable — Combo BMD omitted fail-closed: ${e.message}`); }
    })();
    const tick=()=>{
      // ZzzEffect MoveEffect MODEL_COMBO subtype0. LifeTime is the authored
      // remaining-tick state; scale grows only while >4 and light decays /1.4.
      if(life>4){scale+=gravity;gravity+=.1;} blendLight/=1.4; life--;
      if(renderer){renderer.group.scale.setScalar(scale);renderer.setBodyLight?.(new THREE.Color(blendLight,blendLight,blendLight));renderer.group.userData.pcBlendMeshLight=blendLight;}
    };
    this.register({update:(dt)=>{const d=Math.max(0,Number(dt)||0);age+=d;acc+=d;let guard=0;while(acc+1e-9>=TICK&&life>0&&guard++<8){acc-=TICK;tick();}renderer?.update?.(d,age);return life>0;},
      dispose:()=>{alive=false;try{renderer?.dispose?.();}catch{}root.parent?.remove(root);}});
    return root;
  }

  // Regression contract: terrain BITMAP_FLARE_BLUE, sword/light one-frame owners, quake and waterfall/smoke window remain fail-closed where their renderer families are unresolved.
  // Main 5.2 Blow of Destruction (wire skill 232). R27 ports the exact BMD
  // impact owner graph that fires on authored tick 17 (LifeTime 23) of the two
  // finite MODEL_BLOW_OF_DESTRUCTION roots. The terrain aura, one-frame bitmap
  // owners, quake and waterfall/smoke particle window remain fail-closed until
  // their dedicated PC renderer families are accepted on Web. No plane/ring or
  // borrowed effect substitutes those still-open stages.
  createBlowOfDestructionEffect(position, facing = 0, opts = {}) {
    if (opts.serverAuthoritative !== true) {
      this._warnOnce('blow232-authority', '[PCSkillFX] Blow of Destruction 232 is server-routed; refusing non-authoritative production spawn.');
      return null;
    }
    const target = opts.target?.clone?.() || position.clone();
    const sourceA = [position.x, position.y, position.z];
    const targetA = [target.x, target.y, target.z];
    const serial = (++this._blowSerial) >>> 0;
    const graph = blowImpactOwnersWeb(sourceA, targetA, facing, serial);
    const owner = new THREE.Group();
    owner.userData.pcOwner = 'MODEL_BLOW_OF_DESTRUCTION';
    owner.userData.pcWireSkill = 232;
    owner.userData.pcRootLifeTicks = BLOW_ROOT_LIFE_TICKS;
    owner.userData.pcImpactTick = Math.round(BLOW_IMPACT_SECONDS * PC_HZ);
    owner.userData.pcZeroScaleStoneCount = graph.zeroScaleStoneCount;
    owner.userData.pcImpactOwnerCount = graph.owners.length;
    // R31 retains the exact secondary terrain authoring contract without
    // fabricating a Web renderer. Two FLARE_BLUE terrain owners begin at PC
    // authored tick 16 (LifeTime 24), decay 1.2/1.05 before first render, and
    // remain metadata/fail-closed until RenderTerrainAlphaBitmap parity exists.
    owner.userData.pcBlowTerrainAuthoring = blowTerrainAuraAuthor(graph.root, graph.sub1, facing);
    owner.userData.pcBlowSecondaryImpactAuthoring = blowSecondaryImpactAuthor(graph.root, graph.sub1);
    this.scene.add(owner);

    try { if (Sound.buffers?.has?.('pc-blow232')) Sound.play('pc-blow232'); } catch {}

    let alive = true;
    let age = 0;
    let impactSpawned = false;
    const live = [];

    const tintRenderer = (r) => {
      const c = new THREE.Color(BLOW_BLUE_LIGHT[0], BLOW_BLUE_LIGHT[1], BLOW_BLUE_LIGHT[2]);
      r.setBodyLight?.(c);
      r.group?.traverse?.((o) => {
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of mats) {
          if (m?.color?.setRGB) m.color.setRGB(BLOW_BLUE_LIGHT[0], BLOW_BLUE_LIGHT[1], BLOW_BLUE_LIGHT[2]);
        }
      });
    };

    const spawnOwner = async (spec, bornAge) => {
      try {
        const [{ MUModelRenderer }, { applyMuUpAxis }, bmd] = await Promise.all([
          import('../assets/MUModelRenderer.js'),
          import('../graphics/BmdAdapter.js'),
          this._loadBlowBmd(spec.path),
        ]);
        const r = new MUModelRenderer({ scene: this.scene });
        await r.initFromBMD(bmd);
        if (!alive || age >= bornAge + spec.life) { r.dispose?.(); return; }
        applyMuUpAxis(r.group);
        r.group.position.set(spec.position[0], spec.position[1], spec.position[2]);
        r.group.rotation.y = spec.yaw;
        r.group.scale.setScalar(spec.scale);
        r.group.userData.pcBlow232Tag = spec.tag;
        r.group.userData.pcAuthoredLife = spec.life;
        tintRenderer(r);
        r.playAction?.('action_0');
        owner.add(r.group);
        live.push({ r, bornAge, life: spec.life, dead: false });
      } catch (e) {
        this._warnOnce(`blow232-${spec.path}`, `[PCSkillFX] Blow 232 owner ${spec.path} unavailable — that authored BMD stage is omitted fail-closed: ${e.message}`);
      }
    };

    const spawnImpact = () => {
      if (impactSpawned) return;
      impactSpawned = true;
      for (const spec of graph.owners) void spawnOwner(spec, BLOW_IMPACT_SECONDS);
      this._warnOnce('blow232-open-secondary', '[PCSkillFX] Blow 232 real impact BMD graph active; terrain BITMAP_FLARE_BLUE plus sword/light/waterfall call-site authoring are retained exactly where evidenced, but their unresolved renderer/update families remain fail-closed; quake/smoke also remain gated pending exact Web contracts.');
    };

    const maxOwnerLife = graph.owners.reduce((m, s) => Math.max(m, s.life), 0);
    const totalLife = Math.max(BLOW_ROOT_LIFE_TICKS * TICK, BLOW_IMPACT_SECONDS + maxOwnerLife);
    this.register({
      update: (dt) => {
        const prev = age;
        age += Math.max(0, Number.isFinite(dt) ? dt : 0);
        if (!impactSpawned && prev < BLOW_IMPACT_SECONDS && age + 1e-9 >= BLOW_IMPACT_SECONDS) spawnImpact();
        for (const st of live) {
          if (st.dead) continue;
          const localAge = age - st.bornAge;
          if (localAge >= st.life) {
            st.dead = true;
            try { st.r.dispose?.(); } catch {}
            continue;
          }
          st.r.update?.(Math.max(0, Number.isFinite(dt) ? dt : 0), Math.max(0, localAge));
        }
        return age < totalLife;
      },
      dispose: () => {
        alive = false;
        for (const st of live) if (!st.dead) { st.dead = true; try { st.r.dispose?.(); } catch {} }
        owner.parent?.remove(owner);
      },
    });
    return owner;
  }

}
