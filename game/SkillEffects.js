// SkillEffects.js — owners visuais PC-parity já portados; dispatch server-authoritative fica em GameApp._handleServerMagic.
// Usa ParticleEmitter de Effects.js e números de dano via FloatingText.
import * as THREE from 'three';
import { ParticleEmitter, getSkillTexture, getSkillTextureByName, preloadSkillTextures } from '../graphics/Effects.js';
import { FloatingText } from './FloatingText.js';
import { Sound } from '../audio/SoundManager.js';
import { PCSkillEffectsPackA } from './PCSkillEffectsPackA.js';

/**
 * class SkillEffects
 * Uso:
 *   const fx = new SkillEffects(scene, floatingText?);
 *   fx.createSlashEffect(pos, dir);
 *   ...no loop: fx.update(dt);
 */
export class SkillEffects {
  /**
   * @param {THREE.Scene} scene
   * @param {FloatingText} [floatingText] — para números de dano no impacto
   */
  constructor(scene, floatingText = null) {
    this.scene = scene;
    this.floatingText = floatingText;
    this.effects = []; // { tick(dt)->bool, dispose() }
    this.pcPackA = new PCSkillEffectsPackA(scene, (fx) => this._register(fx));

    // Aquece o cache de texturas reais de skill (Data/Skill/*) sem
    // hardfail: se RemoteAssets faltar, os fallbacks procedurais seguem.
    preloadSkillTextures().catch(() => {});
    // Pré-carrega o som real do Fireball (SOUND_METEORITE01 =
    // Sound/eMeteorite.wav, ZzzCharacter.cpp:4953) para que o PRIMEIRO
    // cast já toque (PC PlayBuffer é imediato; sem pré-load, o load
    // on-demand atrasaria o som do primeiro cast). Fail-closed silencioso.
    if (typeof Sound.loadWav === 'function' && !Sound.buffers?.has?.('sfx-meteorite-pc')) {
      Sound.loadWav('sfx-meteorite-pc', 'eMeteorite.wav').catch(() => {});
    }
  }

  _register(effect) {
    this.effects.push(effect);
    return effect;
  }

  createTwistingSlashEffect(position, facing = 0, opts = {}) { return this.pcPackA.createTwistingSlashEffect(position, facing, opts); }
  createFuryStrikeEffect(position, facing = 0, opts = {}) { return this.pcPackA.createFuryStrikeEffect(position, facing, opts); }
  createVitalityEffect(position, opts = {}) { return this.pcPackA.createVitalityEffect(position, opts); }
  // Legacy compatibility method keeps the old PackA symbol; production Death Stab uses the audited authoring method below.
  createDeathStabEffect(position, facing = 0, opts = {}) { return this.pcPackA.createDeathStabEffect(position, facing, opts); }
  createDeathCannonEffect(position, facing = 0, opts = {}) { return this.pcPackA.createDeathCannonEffect(position, facing, opts); }
  createDeathStabAuthoring(position, facing = 0, opts = {}) { return this.pcPackA.createDeathStabAuthoring(position, facing, opts); }
  createBlowOfDestructionEffect(position, facing = 0, opts = {}) { return this.pcPackA.createBlowOfDestructionEffect(position, facing, opts); }
  createComboEffect(position, opts = {}) { return this.pcPackA.createComboEffect(position, opts); }
  createRiderAuthoring(position, opts = {}) { return this.pcPackA.createRiderAuthoring(position, opts); }
  playPcSwordReceiveSound(skillType) { return this.pcPackA.playPcSwordReceiveSound(skillType); }
  createElfSupportGroundEffect(position, facing = 0, subtype = 1, opts = {}) { return this.pcPackA.createElfSupportGroundEffect(position, facing, subtype, opts); }

  /** Exibe número de dano flutuante no ponto de impacto */
  _damageNumber(pos, amount, crit = false) {
    if (this.floatingText) this.floatingText.damage(pos.clone(), amount, crit);
  }

  // ------------------------------------------------------------------
  // Slash — arco cintilante na frente do caster
  // ------------------------------------------------------------------
  /**
   * @param {THREE.Vector3} position — posição do caster
   * @param {number} facing — rotação Y (rad) do caster
   * @param {object} [opts] — { damage, crit, hitPos }
   */
  createSlashEffect(position, facing = 0, opts = {}) {
    const origin = position.clone();
    origin.y += 1.2;
    const dir = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));

    // Faixa de partículas em arco
    const emitter = new ParticleEmitter({
      position: origin.clone().addScaledVector(dir, 1),
      color: 0xcceeff,
      count: 40, life: 0.35, speed: 4, size: 6,
      blending: 'additive', gravity: 0, loop: false, duration: 0.35,
    });
    this.scene.add(emitter.points);

    // Lâmina (mesh fino que gira num arco) — sprite de corte texturizado
    const slashTex = getSkillTexture('Skill/motion_blur.OZJ')
      || getSkillTexture('Skill/combo2.OZJ')
      || getSkillTextureByName('Twisting Slash');
    const blade = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 0.25),
      new THREE.MeshBasicMaterial({
        color: slashTex ? 0xffffff : 0xddffff,
        map: slashTex || null,
        transparent: true, opacity: 0.9,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    blade.position.copy(origin);
    this.scene.add(blade);

    Sound.playBeep(1200, 0.08, 'sawtooth', 0.12);

    let t = 0;
    const dur = 0.3;
    this._register({
      update: (dt) => {
        t += dt;
        const k = Math.min(1, t / dur);
        // arco de -70° a +70° em torno do facing
        const ang = facing + (-1.2 + k * 2.4);
        blade.position.copy(origin).addScaledVector(
          new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)), 1.1);
        blade.rotation.y = ang + Math.PI / 2;
        blade.material.opacity = 0.9 * (1 - k);
        const alive = emitter.update(dt) && k < 1;
        return alive;
      },
      dispose: () => {
        emitter.dispose();
        blade.material.dispose(); blade.geometry.dispose();
        if (blade.parent) blade.parent.remove(blade);
      },
    });

    if (opts.damage && opts.hitPos) {
      this._damageNumber(opts.hitPos, opts.damage, opts.crit);
    }
  }

  // ------------------------------------------------------------------
  // Fireball — projétil com trail, explosão no impacto
  // ------------------------------------------------------------------
  /**
   * @param {THREE.Vector3} from
   * @param {THREE.Vector3} to
   * @param {object} [opts] — { speed, damage, crit, onHit(pos) }
   */
  createFireballEffect(from, to, opts = {}) {
    const start = from.clone(); start.y += 1.2;
    const end = to.clone(); end.y += 1.0;
    const dist = start.distanceTo(end);

    // PC ZzzCharacter.cpp:4951-4953 (AT_SKILL_FIREBALL):
    //   CreateEffect(MODEL_FIRE, o->Position, Angle, o->Light, 1, to)
    //   + PlayBuffer(SOUND_METEORITE01)
    // = BMD de efeito Data\Skill\Fire (ZzzOpenData.cpp:4076 → Skill/Fire01.bmd,
    // CONFIRMADO no manifest; probe: 1 action/6 bones/2 meshes).
    // ZzzEffect.cpp:2719-2818 (case MODEL_FIRE, SubType 1 → else L2812-2818):
    //   BlendMesh 1, LifeTime 60, Scale (rand%4+8)*0.1, spawn Position z+120,
    //   Direction (0,-50,0) rotacionada pelo Angle do caster.
    // ZzzEffect.cpp:12333-12462 (MoveEffect SubType 1 → else L12386-12408):
    //   move por Direction até a altura do terreno no ponto do alvo → explode
    //   L12452-12459: 6× CreateEffect(MODEL_STONE1+rand%2 = Skill/Stone01.bmd
    //   ou Stone02.bmd, ZzzOpenData.cpp:4079) + CreateParticle(BITMAP_EXPLOTION
    //   = Effect/Explotion01.OZJ, ZzzOpenData.cpp:5121-family).
    // O sprite billboard + trail + beep procedural eram INVENTADOS —
    // FAIL-CLOSED: sem BMD, o projétil é invisível (a lógica do voo/impacto
    // avança no tempo PC-fiel; ausência transparente).
    let fireRenderer = null;
    const fireScale = (Math.floor(Math.random() * 4) + 8) * 0.1; // (rand%4+8)*0.1
    (async () => {
      try {
        const { MUAssets } = await import('../assets/MUAssetLoader.js');
        const { MUModelRenderer } = await import('../assets/MUModelRenderer.js');
        const { applyMuUpAxis } = await import('../graphics/BmdAdapter.js');
        const bmd = await MUAssets.loadBMD('Skill/Fire01.bmd'); // fail-closed
        const r = new MUModelRenderer();
        await r.initFromBMD(bmd);
        applyMuUpAxis(r.group);
        r.group.scale.setScalar(fireScale);
        r.group.position.copy(start);
        r.playAction('action_0'); // BMD de efeito: action única
        fireRenderer = r;
        this.scene.add(r.group);
      } catch (e) {
        console.warn('[SkillEffects] fireball sem BMD real (Skill/Fire01.bmd) — projétil invisível (fail-closed):', e.message);
      }
    })();

    // PlayBuffer(SOUND_METEORITE01) no cast — Sound/eMeteorite.wav real
    try {
      if (Sound.buffers && Sound.buffers.has && Sound.buffers.has('sfx-meteorite-pc')) {
        Sound.play('sfx-meteorite-pc');
      } else if (Sound.loadWav) {
        Sound.loadWav('sfx-meteorite-pc', 'eMeteorite.wav')
          .then((buf) => { if (buf && Sound.play) Sound.play('sfx-meteorite-pc'); })
          .catch(() => {});
      }
    } catch { /* degradação silenciosa — sem beep inventado */ }

    // Voo: Direction (0,-50,0) no espaço do Angle do caster → no web, direção
    // normalizada ao alvo com a MESMA velocidade escalar (50 u/frame-lógico
    // do PC @25fps ≈ dist/2s máximo; LifeTime 60 frames = 2.4s de teto).
    const dir = end.clone().sub(start).normalize();
    // Direction tem magnitude 50 por tick lógico; o cliente base trabalha
    // em ~25 ticks/s. Conversão temporal: 50 * 25 = 1250 world-units/s.
    const speed = opts.speed || (50 * 25);
    const dur = Math.max(0.05, dist / speed);
    let t = 0;
    let hit = false;
    const projPos = start.clone();
    this._register({
      update: (dt) => {
        t += dt;
        const k = Math.min(1, t / dur);
        projPos.lerpVectors(start, end, k);
        if (fireRenderer) {
          fireRenderer.group.position.copy(projPos);
          fireRenderer.update(dt, t);
        }
        if (k >= 1 && !hit) {
          hit = true;
          this._fireballExplosion(end, opts); // PC L12452-12459
          return false; // projétil morre no impacto (o->Live=false L12461)
        }
        // LifeTime 60 frames-lógicos (L2814) — teto de voo PC-fiel
        return t < 60 / 25;
      },
      dispose: () => {
        if (fireRenderer) { try { fireRenderer.dispose(); } catch { /* noop */ } }
      },
    });
  }

  /**
   * Explosão do Fireball — PC ZzzEffect.cpp:12452-12459 (SubType 1, else do
   * shock-AOE): 6× CreateEffect(MODEL_STONE1+rand%2) + 1× CreateParticle
   * (BITMAP_EXPLOTION). As pedras BMD reais (Skill/Stone01.bmd/Stone02.bmd)
   * sobem e caem; a partícula de explosão usa a textura real Explotion01.
   */
  _fireballExplosion(pos) {
    const opts = arguments[1] || {};
    // Main 5.2 verified call-site is retained as authoring metadata only:
    // 6x MODEL_STONE1+rand%2 + 1x BITMAP_EXPLOTION. Previous Web code
    // invented ballistic velocity/gravity/rotation, a 25-particle emitter,
    // particle speed/size/lifetime and a 2-second cleanup. Those values are
    // not PC evidence, so R34 removes that presentation rather than masking
    // the remaining MoveEffect/MoveParticle gap with a plausible generic FX.
    const bits = Array.from({ length: 6 }, () => Math.floor(Math.random() * 2));
    import('./PcFireballImpact.js').then(({ fireballImpactAuthor }) => {
      const graph = fireballImpactAuthor(bits);
      if (graph) {
        this._lastPcFireballImpactAuthoring = graph;
        this._warnOnce?.('fireball-impact-r34', '[SkillEffects] FIREBALL impact call-site authored exactly (6x Stone01/02 + BITMAP_EXPLOTION); renderer/update remains fail-closed pending exact PC MoveEffect/MoveParticle contracts.');
      }
    }).catch(() => {});
    if (opts.damage) this._damageNumber(pos, opts.damage, opts.crit);
    if (opts.onHit) opts.onHit(pos);
  }

  // ------------------------------------------------------------------
  // Lightning — raio jagged do céu/caster ao alvo + flash
  // ------------------------------------------------------------------
  /**
   * @param {THREE.Vector3} target
   * @param {object} [opts] — { damage, crit }
   */
  // R37 — AT_SKILL_ENERGYBALL exact PC call-site identity.
  // ZzzCharacter.cpp:5060 creates BITMAP_ENERGY; ZzzOpenData.cpp:5208 maps it
  // to Effect/Thunder01.jpg (real client asset: Effect/Thunder01.OZJ). The
  // bitmap-effect constructor/update/lifetime/cleanup is not yet evidenced, so
  // do NOT substitute Lightning, particles, lines, sprites or beeps.
  // R38 — AT_SKILL_FLASH exact PC effect-family identity.
  // Clean Main 5.2 audit proves FLASH is BITMAP_BOSS_LASER-driven and explicitly
  // disproves the old ArrowThunder substitution. The bitmap asset/update contract
  // is not resident/proven in this Web snapshot, so presentation is fail-closed.
  createFlashEffect(target, opts = {}) {
    const pos = target?.clone ? target.clone() : target;
    this._pcFlashLastAuthoring = Object.freeze({
      skill: 'AT_SKILL_FLASH',
      effect: Object.freeze({ model: 'BITMAP_BOSS_LASER', owner: null }),
      position: pos,
      actorKind: opts.actorKind || null,
      serverAuthoritative: opts.serverAuthoritative === true,
      renderer: 'fail-closed-until-boss-laser-asset-and-update-contract',
    });
    return this._pcFlashLastAuthoring;
  }

  createEnergyBallEffect(target, opts = {}) {
    const pos = target?.clone ? target.clone() : target;
    this._pcEnergyBallLastAuthoring = Object.freeze({
      skill: 'AT_SKILL_ENERGYBALL',
      effect: Object.freeze({ model: 'BITMAP_ENERGY', texture: 'Effect/Thunder01.OZJ', owner: null }),
      position: pos,
      actorKind: opts.actorKind || null,
      serverAuthoritative: opts.serverAuthoritative === true,
      renderer: 'fail-closed-until-bitmap-energy-update-contract',
    });
    return this._pcEnergyBallLastAuthoring;
  }

  createLightningEffect(target, opts = {}) {
    const top = target.clone(); top.y += 8;
    const end = target.clone(); end.y += 0.5;

    // Linha "zigue-zague"
    const points = [];
    const segments = 10;
    for (let i = 0; i <= segments; i++) {
      const p = top.clone().lerp(end, i / segments);
      if (i > 0 && i < segments) {
        p.x += (Math.random() - 0.5) * 0.8;
        p.z += (Math.random() - 0.5) * 0.8;
      }
      points.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const bolt = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: 0x99ccff, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending,
      })
    );
    this.scene.add(bolt);

    // "Espessura" com emissão: plano aditivo texturizado ao longo do raio
    // (THREE.Line tem 1px; o plano dá corpo/glow à descarga)
    // Autoridade: BITMAP_LIGHTNING+1 = "Effect\lightning2.jpg" (ZzzOpenData.
    // cpp:5207; cliente: Effect/lightning2.ozj — no manifest) usado pelos
    // CreateSprite(BITMAP_LIGHTNING+1, ±Rotation) do raio (ZzzObject.cpp:
    // 2882-2883/2956-2957/3018-3019).
    const boltTex = getSkillTexture('Effect/lightning2.OZJ')
      || getSkillTexture('Skill/eff_lightinga03.OZJ')
      || getSkillTextureByName('Lightning');
    const boltPlanes = [];
    if (boltTex) {
      const mid = top.clone().lerp(end, 0.5);
      const len = top.distanceTo(end);
      for (const ry of [0, Math.PI / 2]) {
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(1.1, len),
          new THREE.MeshBasicMaterial({
            map: boltTex, color: 0xffffff, transparent: true, opacity: 0.9,
            blending: THREE.AdditiveBlending, depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        plane.position.copy(mid);
        plane.rotation.y = ry;
        this.scene.add(plane);
        boltPlanes.push(plane);
      }
    }

    // Faíscas no ponto de impacto
    const sparks = new ParticleEmitter({
      position: end, color: boltTex ? 0xffffff : 0xaaddff, count: 50, life: 0.6,
      speed: 5, size: boltTex ? 8 : 4, blending: 'additive', gravity: -8,
      loop: false, duration: 0.6,
    });
    if (boltTex) {
      sparks.material.map = boltTex;
      sparks.material.needsUpdate = true;
    }
    this.scene.add(sparks.points);

    Sound.playBeep(1800, 0.06, 'square', 0.18);
    Sound.playBeep(200, 0.25, 'sawtooth', 0.12);

    let t = 0;
    const dur = 0.45;
    this._register({
      update: (dt) => {
        t += dt;
        const k = t / dur;
        bolt.material.opacity = k < 0.5 ? 1 : 1 - (k - 0.5) * 2;
        for (const plane of boltPlanes) {
          // flicker + fade sincronizado com a linha do raio
          plane.material.opacity = bolt.material.opacity * (0.7 + Math.random() * 0.3);
        }
        // re-jag a cada frame (flicker)
        if (Math.random() < 0.6) {
          const pos = geo.attributes.position;
          for (let i = 1; i < segments; i++) {
            pos.setX(i, THREE.MathUtils.lerp(top.x, end.x, i / segments) + (Math.random() - 0.5) * 0.8);
            pos.setZ(i, THREE.MathUtils.lerp(top.z, end.z, i / segments) + (Math.random() - 0.5) * 0.8);
          }
          pos.needsUpdate = true;
        }
        return sparks.update(dt) && t < dur + 0.3;
      },
      dispose: () => {
        sparks.dispose();
        geo.dispose(); bolt.material.dispose();
        if (bolt.parent) bolt.parent.remove(bolt);
        for (const plane of boltPlanes) {
          plane.material.dispose(); plane.geometry.dispose();
          if (plane.parent) plane.parent.remove(plane);
        }
      },
    });

    this._explosion(end, 0x88bbff, opts, 0.35);
  }

  // ------------------------------------------------------------------
  // Ice — cristais de gelo + névoa azulada
  // ------------------------------------------------------------------
  /**
   * @param {THREE.Vector3} target
   * @param {object} [opts] — { damage, crit }
   */
  createIceEffect(target, opts = {}) {
    const base = target.clone();
    // Main 5.2 MODEL_ICE SubType 1/2: LifeTime 20, Scale .8, Angle[0] -20,
    // BlendMeshLight .5, Gravity 5, HeadAngle rand()%360 and exactly 3
    // BITMAP_SMOKE children with rand-derived offsets. R35 keeps those call-site
    // values but removes the previous generic ParticleEmitter approximation.
    const head = Math.floor(Math.random() * 0x7fffffff);
    const smokeResidues = Array.from({ length: 3 }, () => ({
      x: Math.floor(Math.random() * 0x7fffffff),
      y: Math.floor(Math.random() * 0x7fffffff),
      z: Math.floor(Math.random() * 0x7fffffff),
    }));
    import('./PcIceImpact.js').then(({ iceImpactAuthor }) => {
      const graph = iceImpactAuthor({ headAngleResidue: head, smokeResidues });
      if (!graph) return;
      this._lastPcIceImpactAuthoring = Object.freeze({ ...graph, subtype: opts.subtype === 2 ? 2 : 1 });
      this._warnOnce?.('ice-smoke-r35', '[SkillEffects] ICE MODEL_ICE owner active; 3x BITMAP_SMOKE call-sites authored, smoke MoveParticle remains fail-closed.');
    }).catch(() => {});

    let iceRenderer = null;
    (async () => {
      try {
        const { MUAssets } = await import('../assets/MUAssetLoader.js');
        const { MUModelRenderer } = await import('../assets/MUModelRenderer.js');
        const { applyMuUpAxis } = await import('../graphics/BmdAdapter.js');
        const bmd = await MUAssets.loadBMD('Skill/Ice01.bmd');
        const r = new MUModelRenderer();
        await r.initFromBMD(bmd);
        applyMuUpAxis(r.group);
        r.group.scale.setScalar(0.8);
        r.group.rotation.x = -20 * Math.PI / 180;
        r.group.rotation.z = (head % 360) * Math.PI / 180;
        r.group.position.copy(base);
        r.playAction('action_0');
        iceRenderer = r;
        this.scene.add(r.group);
      } catch (e) {
        console.warn('[SkillEffects] ice sem BMD real (Skill/Ice01.bmd) — fail-closed:', e.message);
      }
    })();

    let t = 0;
    const dur = 20 / 25;
    this._register({
      update: (dt) => { t += dt; iceRenderer?.update?.(dt, t); return t < dur; },
      dispose: () => { if (iceRenderer) { try { iceRenderer.dispose(); } catch { /* noop */ } } },
    });
    if (opts.damage) this._damageNumber(base, opts.damage, opts.crit);
  }

  // AT_SKILL_SLOW — PC ZzzCharacter: 1x MODEL_ICE subtype 1 + exactly
  // 5x MODEL_ICE_SMALL/subtype 2 at target, followed by SOUND_ICE.
  // Both model subtypes use the real Ice01 BMD constructor path; their smoke
  // children remain authored/fail-closed rather than ParticleEmitter stand-ins.
  // R36: exact Main 5.2 basic wizard call-site owners. The BMD owner is
  // rendered only where its constructor contract is already known; smoke/update
  // stages stay authored/fail-closed rather than becoming generic emitters.
  createPoisonEffect(target, opts = {}) {
    import('./PcWizardBasicImpact.js').then(({ poisonImpactAuthor }) => {
      this._lastPcPoisonAuthoring = poisonImpactAuthor({ casterIsPlayer: opts.actorKind === 'hero' || opts.actorKind === 'remote' });
    }).catch(() => {});
    // SOUND_HEART is independently mapped to pHeartBeat.wav in the PC sound table.
    try { if (Sound.buffers?.has?.('sfx-heart')) Sound.play('sfx-heart'); } catch { /* fail-closed */ }
    if (opts.damage) this._damageNumber(target, opts.damage, opts.crit);
  }

  createMeteorEffect(target, opts = {}) {
    import('./PcWizardBasicImpact.js').then(({ meteorImpactAuthor }) => { this._lastPcMeteorAuthoring = meteorImpactAuthor(); }).catch(() => {});
    // MODEL_FIRE subtype 0 update semantics are not yet closed; do not reuse Fireball subtype 1.
    try { if (Sound.buffers?.has?.('sfx-meteorite-pc')) Sound.play('sfx-meteorite-pc'); } catch { /* fail-closed */ }
    if (opts.damage) this._damageNumber(target, opts.damage, opts.crit);
  }

  createPowerWaveEffect(from, to, opts = {}) {
    import('./PcWizardBasicImpact.js').then(({ powerWaveTravelAuthor }) => {
      this._lastPcPowerWaveAuthoring = powerWaveTravelAuthor({ iceQueen: opts.iceQueen === true });
    }).catch(() => {});
    // MODEL_MAGIC2 MoveEffect is still open, therefore visible travel is fail-closed.
    try {
      if (Sound.buffers?.has?.('magic.powerwave')) Sound.play('magic.powerwave');
      else if (Sound.loadWav) Sound.loadWav('magic.powerwave', 'sMagic.wav').then((buf) => { if (buf && Sound.play) Sound.play('magic.powerwave'); }).catch(() => {});
    } catch { /* fail-closed */ }
  }

  createSlowEffect(target, opts = {}) {
    this.createIceEffect(target, { ...opts, damage: 0, subtype: 1 });
    for (let i = 0; i < 5; i++) this.createIceEffect(target, { ...opts, damage: 0, subtype: 2 });
    try {
      if (Sound.buffers?.has?.('magic.ice')) Sound.play('magic.ice');
      else if (Sound.loadWav) Sound.loadWav('magic.ice', 'sIce.wav').then((buf) => { if (buf && Sound.play) Sound.play('magic.ice'); }).catch(() => {});
    } catch { /* no synthetic beep */ }
    if (opts.damage) this._damageNumber(target, opts.damage, opts.crit);
  }

  // ------------------------------------------------------------------
  // Explosão genérica de impacto (compartilhada)
  // ------------------------------------------------------------------
  _explosion(pos, color, opts = {}, life = 0.7) {
    const boom = new ParticleEmitter({
      position: pos, color, count: 70, life, speed: 6, size: 6,
      blending: 'additive', gravity: -4, loop: false, duration: life,
    });
    this.scene.add(boom.points);
    Sound.playBeep(90, 0.2, 'sine', 0.25);

    let done = false;
    this._register({
      update: (dt) => boom.update(dt),
      dispose: () => boom.dispose(),
    });

    if (opts.onHit) opts.onHit(pos);
    if (opts.damage) this._damageNumber(pos, opts.damage, opts.crit);
    return done;
  }

  // ------------------------------------------------------------------
  /** Atualiza todos os efeitos ativos. */
  update(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      if (!fx.update(dt)) {
        fx.dispose();
        this.effects.splice(i, 1);
      }
    }
  }

  clear() {
    for (const fx of this.effects) fx.dispose();
    this.effects = [];
  }
}

export default SkillEffects;
