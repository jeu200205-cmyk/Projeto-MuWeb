/**
 * MUSoundManager.js — Audio Manager for MU Online (Web Audio API)
 *
 * Features:
 *  - Web Audio API based (replaces DirectSound)
 *  - 3D Positional Audio (PannerNode with HRTF)
 *  - AudioBuffer Pool for frequent sounds
 *  - Streaming for music/long sounds
 *  - Effects: Reverb (ConvolverNode), Pitch, Volume, Filters
 *  - Sound categories (BGM, SFX, UI, Ambient, Voice) with independent volume
 *  - Crossfade between BGM tracks
 *  - MU-specific sound mapping (iButtonClick, iLevelUp, etc.)
 *  - Missing authored sounds fail closed (no procedural production substitute)
 */

// ============================================================
// Configuration
// ============================================================

const MAX_POOL_SIZE = 32; // Max concurrent voices per sound
const DEFAULT_DISTANCE_MODEL = 'inverse';
const DEFAULT_ROLLOFF_FACTOR = 1.0;
const DEFAULT_REF_DISTANCE = 100; // MU world units
const DEFAULT_MAX_DISTANCE = 10000;

export const SoundCategory = {
    MASTER: 'master',
    BGM: 'bgm',
    SFX: 'sfx',
    UI: 'ui',
    AMBIENT: 'ambient',
    VOICE: 'voice',
};

export const MU_SOUNDS = {
    // UI Sounds
    'ui.click': 'Sound/iButtonClick.wav',
    'ui.error': 'Sound/iButtonError.wav',
    'ui.move': 'Sound/iButtonMove.wav',
    'ui.repair': 'Sound/iRepair.wav',
    'ui.create': 'Sound/iCreateWindow.wav',
    'ui.duel': 'Sound/iDuelStart.wav',
    'ui.whisper': 'Sound/iWhisper.wav',
    'ui.mail': 'Sound/iFMailAlert.wav',
    'ui.msg': 'Sound/iFMSGAlert.wav',
    'ui.levelup': 'Sound/pLevelUp.wav',
    'ui.jewel': 'Sound/Jewel_Sound.wav',
    'ui.mix': 'Sound/nMix.wav',
    'ui.drop': 'Sound/pDropItem.wav',
    'ui.getitem': 'Sound/pGetItem.wav',
    'ui.dropmoney': 'Sound/pDropMoney.wav',
    'ui.eat': 'Sound/pEatApple.wav',
    'ui.drink': 'Sound/pDrink.wav',
    'ui.energy': 'Sound/pEnergy.wav',
    
    // Combat Sounds
    'combat.swing1': 'Sound/eSwingWeapon1.wav',
    'combat.swing2': 'Sound/eSwingWeapon2.wav',
    'combat.swing_light': 'Sound/eSwingLightSword.wav',
    'combat.bow': 'Sound/eBow.wav',
    'combat.crossbow': 'Sound/eCrossbow.wav',
    'combat.hit1': 'Sound/eMeleeHit1.wav',
    'combat.hit2': 'Sound/eMeleeHit2.wav',
    'combat.hit3': 'Sound/eMeleeHit3.wav',
    'combat.hit4': 'Sound/eMeleeHit4.wav',
    'combat.hit5': 'Sound/eMeleeHit5.wav',
    'combat.cristal': 'Sound/eHitCristal.wav',
    'combat.blow': 'Sound/eBlow.wav',
    'combat.blow1': 'Sound/eBlow1.wav',
    'combat.blow2': 'Sound/eBlow2.wav',
    'combat.blow3': 'Sound/eBlow3.wav',
    'combat.blow4': 'Sound/eBlow4.wav',
    'combat.combo': 'Sound/eCombo.wav',
    'combat.missile1': 'Sound/eMissileHit1.wav',
    'combat.missile2': 'Sound/eMissileHit2.wav',
    'combat.missile3': 'Sound/eMissileHit3.wav',
    'combat.missile4': 'Sound/eMissileHit4.wav',
    'combat.piercing': 'Sound/ePiercing.wav',
    'combat.rage1': 'Sound/eRageBlow_1.wav',
    'combat.rage2': 'Sound/eRageBlow_2.wav',
    'combat.rage3': 'Sound/eRageBlow_3.wav',
    'combat.multishot': 'Sound/multi_shot.wav',
    'combat.infinity': 'Sound/infinityArrow.wav',
    
    // Magic Sounds
    'magic.firebust': 'Sound/eFirebust.wav',
    'magic.firebustboom': 'Sound/eFirebustBoom.wav',
    'magic.ice': 'Sound/sIce.wav',
    'magic.lightning': 'Sound/sTornado.wav',
    'magic.poison': 'Sound/eBlastPoison_1.wav',
    'magic.greatpoison': 'Sound/eGreatPoison.wav',
    'magic.telekinesis': 'Sound/eTelekinesis.wav',
    'magic.meteorite': 'Sound/eMeteorite.wav',
    'magic.explosion': 'Sound/eExplosion.wav',
    'magic.hellfire': 'Sound/sHellFire.wav',
    'magic.flame': 'Sound/sFlame.wav',
    'magic.knight1': 'Sound/sKnightSkill1.wav',
    'magic.knight2': 'Sound/sKnightSkill2.wav',
    'magic.knight3': 'Sound/sKnightSkill3.wav',
    'magic.knight4': 'Sound/sKnightSkill4.wav',
    'magic.dark_critical': 'Sound/sDarkCritical.wav',
    'magic.dark_earth': 'Sound/sDarkEarthQuake.wav',
    'magic.dark_spike': 'Sound/sDarkElecSpike.wav',
    'magic.dark_spear': 'Sound/sDarkSpear.wav',
    'magic.summoner_lightning': 'Sound/SE_Ch_summoner_skill01_lightningof.wav',
    'magic.summoner_sleep': 'Sound/SE_Ch_summoner_skill03_sleep.wav',
    'magic.summoner_blind': 'Sound/SE_Ch_summoner_skill04_blind.wav',
    'magic.summoner_explosion': 'Sound/SE_Ch_summoner_skill05_explosion01.wav',
    'magic.summoner_requiem': 'Sound/SE_Ch_summoner_skill06_requiem01.wav',
    'magic.summoner_lifedrain': 'Sound/SE_Ch_summoner_skill07_lifedrain.wav',
    'magic.summoner_chain': 'Sound/SE_Ch_summoner_skill08_chainlightning.wav',
    
    // Player Sounds
    'player.walk_grass': 'Sound/pWalk(Grass).wav',
    'player.walk_snow': 'Sound/pWalk(Snow).wav',
    'player.walk_soil': 'Sound/pWalk(Soil).wav',
    'player.run1': 'Sound/pW_run-01.wav',
    'player.run2': 'Sound/pW_run-02.wav',
    'player.run3': 'Sound/pW_run-03.wav',
    'player.step1': 'Sound/pW_step-01.wav',
    'player.step2': 'Sound/pW_step-02.wav',
    'player.death': 'Sound/pMaleDie.wav',
    'player.fdeath': 'Sound/pFemaleScream1.wav',
    'player.pain1': 'Sound/pMaleScream1.wav',
    'player.fpain1': 'Sound/pFemaleScream2.wav',
    'player.swim': 'Sound/pSwim.wav',
    'player.horse1': 'Sound/pHorseStep1.wav',
    'player.horse2': 'Sound/pHorseStep2.wav',
    'player.horse3': 'Sound/pHorseStep3.wav',
    'player.heartbeat': 'Sound/pHeartBeat.wav',
    
    // Monster Sounds (generic)
    'monster.die': 'Sound/death1.wav',
    'monster.attack1': 'Sound/blood_attack1.wav',
    'monster.attack2': 'Sound/blood_attack2.wav',
    'monster.pain': 'Sound/blood_die.wav',
    'monster.idle': 'Sound/mBudge1.wav',
    
    // Environment
    'env.wind': 'Sound/aWind.wav',
    'env.rain': 'Sound/aRain.wav',
    'env.thunder1': 'Sound/aThunder01.wav',
    'env.thunder2': 'Sound/aThunder02.wav',
    'env.thunder3': 'Sound/aThunder03.wav',
    'env.water': 'Sound/aWater.wav',
    'env.forest': 'Sound/aForest.wav',
    'env.dungeon': 'Sound/aDungeon.wav',
    'env.cave': 'Sound/aKalima.wav',
    'env.bird1': 'Sound/aBird1.wav',
    'env.bird2': 'Sound/aBird2.wav',
};

// ============================================================
// Sound Instance (Playing Voice)
// ============================================================

export class SoundInstance {
    constructor(manager, buffer, options = {}) {
        this.manager = manager;
        this.buffer = buffer;
        this.options = { ...options };
        this.source = null;
        this.gainNode = null;
        this.pannerNode = null;
        this.filterNode = null;
        this.isPlaying = false;
        this.isPaused = false;
        this.startTime = 0;
        this.pauseTime = 0;
        this.id = SoundInstance._nextId++;
        
        // 3D
        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.is3D = options.is3D !== false;
        this.refDistance = options.refDistance || DEFAULT_REF_DISTANCE;
        this.maxDistance = options.maxDistance || DEFAULT_MAX_DISTANCE;
        this.rolloffFactor = options.rolloffFactor || DEFAULT_ROLLOFF_FACTOR;
        this.coneInnerAngle = options.coneInnerAngle || 360;
        this.coneOuterAngle = options.coneOuterAngle || 360;
        this.coneOuterGain = options.coneOuterGain || 0;
    }

    play() {
        if (!this.manager.context || this.manager.muted) return this;
        
        this.source = this.manager.context.createBufferSource();
        this.source.buffer = this.buffer;
        this.source.loop = this.options.loop || false;
        this.source.playbackRate.value = this.options.pitch || 1.0;
        
        // Gain
        this.gainNode = this.manager.context.createGain();
        this.gainNode.gain.value = (this.options.volume !== undefined ? this.options.volume : 1.0) * this.manager.categoryVolumes[this.options.category || SoundCategory.SFX];
        
        // Filter (optional)
        if (this.options.lowpass) {
            this.filterNode = this.manager.context.createBiquadFilter();
            this.filterNode.type = 'lowpass';
            this.filterNode.frequency.value = this.options.lowpass;
        }
        
        // 3D Panner
        if (this.is3D) {
            this.pannerNode = this.manager.context.createPanner();
            this.pannerNode.panningModel = 'HRTF';
            this.pannerNode.distanceModel = this.options.distanceModel || DEFAULT_DISTANCE_MODEL;
            this.pannerNode.refDistance = this.refDistance;
            this.pannerNode.maxDistance = this.maxDistance;
            this.pannerNode.rolloffFactor = this.rolloffFactor;
            this.pannerNode.coneInnerAngle = this.coneInnerAngle;
            this.pannerNode.coneOuterAngle = this.coneOuterAngle;
            this.pannerNode.coneOuterGain = this.coneOuterGain;
            this.pannerNode.positionX.value = this.position.x;
            this.pannerNode.positionY.value = this.position.y;
            this.pannerNode.positionZ.value = this.position.z;
        }
        
        // Connect chain
        let lastNode = this.source;
        if (this.filterNode) {
            lastNode.connect(this.filterNode);
            lastNode = this.filterNode;
        }
        if (this.pannerNode) {
            lastNode.connect(this.pannerNode);
            lastNode = this.pannerNode;
        }
        lastNode.connect(this.gainNode);
        this.gainNode.connect(this.manager.categoryGains[this.options.category || SoundCategory.SFX]);
        
        this.source.start(0, this.options.offset || 0);
        this.isPlaying = true;
        this.startTime = this.manager.context.currentTime - (this.pauseTime || 0);
        
        this.source.onended = () => {
            this.isPlaying = false;
            this._cleanup();
            if (this.options.onEnded) this.options.onEnded(this);
        };
        
        return this;
    }

    pause() {
        if (!this.isPlaying || this.isPaused) return this;
        
        this.pauseTime = this.manager.context.currentTime - this.startTime;
        this.source.stop();
        this.source.disconnect();
        this.isPaused = true;
        this.isPlaying = false;
        return this;
    }

    resume() {
        if (!this.isPaused) return this;
        this.options.offset = this.pauseTime;
        this.pauseTime = 0;
        return this.play();
    }

    stop() {
        if (this.source) {
            try { this.source.stop(); } catch (e) {}
            this._cleanup();
        }
        this.isPlaying = false;
        this.isPaused = false;
        return this;
    }

    setPosition(x, y, z) {
        this.position.set(x, y, z);
        if (this.pannerNode) {
            this.pannerNode.positionX.value = x;
            this.pannerNode.positionY.value = y;
            this.pannerNode.positionZ.value = z;
        }
        return this;
    }

    setVelocity(x, y, z) {
        this.velocity.set(x, y, z);
        if (this.pannerNode) {
            // Web Audio doesn't have velocity directly on PannerNode in all browsers
        }
        return this;
    }

    setVolume(volume) {
        if (this.gainNode) {
            this.gainNode.gain.value = volume * this.manager.categoryVolumes[this.options.category || SoundCategory.SFX];
        }
        this.options.volume = volume;
        return this;
    }

    setPitch(pitch) {
        if (this.source) this.source.playbackRate.value = pitch;
        this.options.pitch = pitch;
        return this;
    }

    fadeOut(duration) {
        if (!this.gainNode) return this;
        const ctx = this.manager.context;
        const currentGain = this.gainNode.gain.value;
        this.gainNode.gain.setValueAtTime(currentGain, ctx.currentTime);
        this.gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        setTimeout(() => this.stop(), duration * 1000 + 50);
        return this;
    }

    fadeIn(duration, targetVolume = 1.0) {
        if (!this.gainNode) return this;
        const ctx = this.manager.context;
        this.gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
        this.gainNode.gain.exponentialRampToValueAtTime(targetVolume, ctx.currentTime + duration);
        return this;
    }

    _cleanup() {
        if (this.source) {
            try { this.source.disconnect(); } catch (e) {}
            this.source = null;
        }
        if (this.gainNode) {
            try { this.gainNode.disconnect(); } catch (e) {}
            this.gainNode = null;
        }
        if (this.pannerNode) {
            try { this.pannerNode.disconnect(); } catch (e) {}
            this.pannerNode = null;
        }
        if (this.filterNode) {
            try { this.filterNode.disconnect(); } catch (e) {}
            this.filterNode = null;
        }
    }

    get currentTime() {
        if (!this.isPlaying || !this.manager.context) return this.pauseTime || 0;
        return this.manager.context.currentTime - this.startTime;
    }

    get duration() {
        return this.buffer ? this.buffer.duration : 0;
    }
}

SoundInstance._nextId = 0;

// ============================================================
// Sound Pool for Frequent Sounds
// ============================================================

class SoundPool {
    constructor(manager, buffer, maxSize = MAX_POOL_SIZE) {
        this.manager = manager;
        this.buffer = buffer;
        this.maxSize = maxSize;
        this.available = [];
        this.inUse = [];
        this.category = SoundCategory.SFX;
    }

    acquire(options = {}) {
        let instance;
        if (this.available.length > 0) {
            instance = this.available.pop();
            instance.options = { ...instance.options, ...options };
        } else if (this.inUse.length < this.maxSize) {
            instance = new SoundInstance(this.manager, this.buffer, { ...options, category: this.category });
        } else {
            // Steal oldest
            instance = this.inUse.shift();
            instance.stop();
            instance.options = { ...instance.options, ...options };
        }
        
        this.inUse.push(instance);
        instance.play();
        return instance;
    }

    release(instance) {
        const idx = this.inUse.indexOf(instance);
        if (idx > -1) {
            this.inUse.splice(idx, 1);
            if (!instance.isPlaying) {
                this.available.push(instance);
            }
        }
    }

    stopAll() {
        for (const inst of this.inUse) inst.stop();
        for (const inst of this.available) inst.stop();
        this.inUse = [];
        this.available = [];
    }

    update() {
        // Move finished instances back to available
        for (let i = this.inUse.length - 1; i >= 0; i--) {
            if (!this.inUse[i].isPlaying) {
                const inst = this.inUse.splice(i, 1)[0];
                this.available.push(inst);
            }
        }
    }
}

// ============================================================
// BGM Controller (Crossfade, Playlist)
// ============================================================

export class BGMController {
    constructor(manager) {
        this.manager = manager;
        this.currentSource = null;
        this.nextSource = null;
        this.currentGain = null;
        this.nextGain = null;
        this.currentBuffer = null;
        this.isPlaying = false;
        this.isPaused = false;
        this.playlist = [];
        this.playlistIndex = 0;
        this.loop = true;
        this.shuffle = false;
        this.fadeTime = 2.0;
    }

    async play(buffer, fadeTime = 2.0) {
        if (!this.manager.context) await this.manager.init();
        
        this.fadeTime = fadeTime;
        
        if (this.currentSource && this.isPlaying) {
            // Crossfade
            this.nextSource = this.manager.context.createBufferSource();
            this.nextSource.buffer = buffer;
            this.nextSource.loop = this.loop;
            
            this.nextGain = this.manager.context.createGain();
            this.nextGain.gain.value = 0;
            
            this.nextSource.connect(this.nextGain);
            this.nextGain.connect(this.manager.categoryGains[SoundCategory.BGM]);
            
            this.nextSource.start(0);
            
            // Fade out current, fade in next
            const ctx = this.manager.context;
            const now = ctx.currentTime;
            this.currentGain.gain.setValueAtTime(this.currentGain.gain.value, now);
            this.currentGain.gain.exponentialRampToValueAtTime(0.0001, now + fadeTime);
            this.nextGain.gain.setValueAtTime(0.0001, now);
            this.nextGain.gain.exponentialRampToValueAtTime(this.manager.categoryVolumes[SoundCategory.BGM], now + fadeTime);
            
            // Swap after fade
            setTimeout(() => {
                this.currentSource.stop();
                this.currentSource.disconnect();
                this.currentGain.disconnect();
                
                this.currentSource = this.nextSource;
                this.currentGain = this.nextGain;
                this.currentBuffer = buffer;
                this.nextSource = null;
                this.nextGain = null;
            }, fadeTime * 1000 + 100);
        } else {
            // First play
            this.currentSource = this.manager.context.createBufferSource();
            this.currentSource.buffer = buffer;
            this.currentSource.loop = this.loop;
            
            this.currentGain = this.manager.context.createGain();
            this.currentGain.gain.value = this.manager.categoryVolumes[SoundCategory.BGM];
            
            this.currentSource.connect(this.currentGain);
            this.currentGain.connect(this.manager.categoryGains[SoundCategory.BGM]);
            
            this.currentSource.start(0);
            this.currentBuffer = buffer;
            this.isPlaying = true;
        }
        
        this.currentSource.onended = () => {
            if (this.loop) {
                // Restart
                this.currentSource.start(0);
            } else if (this.playlist.length > 0) {
                this.next();
            } else {
                this.isPlaying = false;
            }
        };
    }

    pause() {
        if (this.currentSource && this.isPlaying) {
            this.manager.context.suspend();
            this.isPaused = true;
            this.isPlaying = false;
        }
    }

    resume() {
        if (this.isPaused) {
            this.manager.context.resume();
            this.isPaused = false;
            this.isPlaying = true;
        }
    }

    stop(fadeTime = 1.0) {
        if (this.currentSource) {
            const ctx = this.manager.context;
            const now = ctx.currentTime;
            this.currentGain.gain.setValueAtTime(this.currentGain.gain.value, now);
            this.currentGain.gain.exponentialRampToValueAtTime(0.0001, now + fadeTime);
            setTimeout(() => {
                this.currentSource.stop();
                this.currentSource.disconnect();
                this.currentGain.disconnect();
                this.currentSource = null;
                this.currentGain = null;
                this.isPlaying = false;
            }, fadeTime * 1000 + 50);
        }
    }

    setLoop(loop) {
        this.loop = loop;
        if (this.currentSource) this.currentSource.loop = loop;
    }

    setPlaylist(buffers, startIndex = 0) {
        this.playlist = buffers;
        this.playlistIndex = startIndex;
    }

    next() {
        if (this.playlist.length === 0) return;
        if (this.shuffle) {
            this.playlistIndex = Math.floor(Math.random() * this.playlist.length);
        } else {
            this.playlistIndex = (this.playlistIndex + 1) % this.playlist.length;
        }
        this.play(this.playlist[this.playlistIndex], this.fadeTime);
    }

    prev() {
        if (this.playlist.length === 0) return;
        this.playlistIndex = (this.playlistIndex - 1 + this.playlist.length) % this.playlist.length;
        this.play(this.playlist[this.playlistIndex], this.fadeTime);
    }
}

// ============================================================
// Reverb / Environment Effects
// ============================================================

export class ReverbEffect {
    constructor(context) {
        this.context = context;
        this.convolver = context.createConvolver();
        this.gain = context.createGain();
        this.gain.gain.value = 0.3;
        this.enabled = false;
        this.preset = 'hall';
        
        // Create impulse responses for common spaces
        this._createImpulses();
    }

    _createImpulses() {
        const sampleRate = this.context.sampleRate;
        const length = sampleRate * 2; // 2 seconds
        
        this.impulses = {};
        
        // Hall
        this.impulses.hall = this._generateImpulse(length, (i, n) => {
            const t = i / n;
            return (Math.random() * 2 - 1) * Math.pow(1 - t, 2) * 0.5;
        });
        
        // Room
        this.impulses.room = this._generateImpulse(length, (i, n) => {
            const t = i / n;
            return (Math.random() * 2 - 1) * Math.pow(1 - t, 3) * 0.3;
        });
        
        // Cave
        this.impulses.cave = this._generateImpulse(length * 2, (i, n) => {
            const t = i / n;
            return (Math.random() * 2 - 1) * Math.pow(1 - t, 1.5) * 0.7;
        });
        
        // Outdoor
        this.impulses.outdoor = this._generateImpulse(length, (i, n) => {
            const t = i / n;
            return (Math.random() * 2 - 1) * Math.exp(-t * 5) * 0.2;
        });
    }

    _generateImpulse(length, generator) {
        const buffer = this.context.createBuffer(2, length, this.context.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                data[i] = generator(i, length);
            }
        }
        return buffer;
    }

    setPreset(name) {
        if (this.impulses[name]) {
            this.convolver.buffer = this.impulses[name];
            this.preset = name;
        }
    }

    connect(input, output) {
        if (this.enabled) {
            input.connect(this.convolver);
            this.convolver.connect(this.gain);
            this.gain.connect(output);
        } else {
            input.connect(output);
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }

    setWetLevel(level) {
        this.gain.gain.value = level;
    }

    dispose() {
        this.convolver.disconnect();
        this.gain.disconnect();
    }
}

// ============================================================
// Main Sound Manager
// ============================================================

export class MUSoundManager {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || (typeof window !== 'undefined' && window.__MU_ASSET_BASE__) || 'http://localhost:9100/';
        this.remoteAssets = new RemoteAssets();
        this.remoteAssets.configure(this.baseUrl);
        
        // Audio Context
        this.context = null;
        this.masterGain = null;
        this.categoryGains = {};
        this.categoryVolumes = {};
        this.muted = false;
        this._unlocked = false;
        
        // Buffers & Pools
        this.buffers = new Map(); // id -> AudioBuffer
        this.pools = new Map(); // id -> SoundPool
        this.loadingPromises = new Map();
        
        // BGM
        this.bgm = new BGMController(this);
        
        // Reverb
        this.reverb = null;
        
        // Listener (for 3D audio)
        this.listenerPosition = new THREE.Vector3();
        this.listenerOrientation = { front: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) };
        
        // Default volumes
        this._defaultVolumes = {
            [SoundCategory.MASTER]: 1.0,
            [SoundCategory.BGM]: 0.7,
            [SoundCategory.SFX]: 1.0,
            [SoundCategory.UI]: 0.8,
            [SoundCategory.AMBIENT]: 0.5,
            [SoundCategory.VOICE]: 1.0,
        };
    }

    /**
     * Initialize AudioContext (must be called after user interaction)
     */
    async init() {
        if (this.context) return;
        
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.context = new AudioContext({ latencyHint: 'interactive' });
        
        // Master gain
        this.masterGain = this.context.createGain();
        this.masterGain.connect(this.context.destination);
        this.masterGain.gain.value = this._defaultVolumes[SoundCategory.MASTER];
        
        // Category gains
        for (const cat of Object.values(SoundCategory)) {
            if (cat === SoundCategory.MASTER) continue;
            const gain = this.context.createGain();
            gain.gain.value = this._defaultVolumes[cat];
            gain.connect(this.masterGain);
            this.categoryGains[cat] = gain;
            this.categoryVolumes[cat] = this._defaultVolumes[cat];
        }
        
        // Reverb
        this.reverb = new ReverbEffect(this.context);
        
        this._unlocked = true;
        
        // Resume if suspended (browser policy)
        if (this.context.state === 'suspended') {
            await this.context.resume();
        }
        
        console.log('[MUSoundManager] AudioContext initialized', this.context.sampleRate);
    }

    /**
     * Load sound buffer by ID (from MU_SOUNDS map or direct path)
     * @param {string} id - Sound identifier
     * @param {string} [path] - Optional custom path
     * @returns {Promise<AudioBuffer>}
     */
    async load(id, path = null) {
        if (this.buffers.has(id)) return this.buffers.get(id);
        
        // Check if already loading
        if (this.loadingPromises.has(id)) {
            return this.loadingPromises.get(id);
        }
        
        const loadPath = path || MU_SOUNDS[id] || `Sound/${id}.wav`;
        
        const promise = (async () => {
            if (!this.context) await this.init();
            
            try {
                const buf = await this.remoteAssets.fetchBinary(loadPath);
                if (!buf) throw new Error(`Failed to fetch: ${loadPath}`);
                
                const audioBuffer = await this.context.decodeAudioData(buf.slice(0));
                this.buffers.set(id, audioBuffer);
                
                // Create pool for UI/SFX sounds
                if (id.startsWith('ui.') || id.startsWith('combat.') || id.startsWith('magic.')) {
                    this.pools.set(id, new SoundPool(this, audioBuffer, 8));
                }
                
                return audioBuffer;
            } catch (e) {
                console.warn(`[MUSoundManager] Failed to load "${id}" (${loadPath}):`, e.message);
                return null;
            } finally {
                this.loadingPromises.delete(id);
            }
        })();
        
        this.loadingPromises.set(id, promise);
        return promise;
    }

    /**
     * Preload multiple sounds
     */
    async preload(ids, onProgress) {
        const results = [];
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            try {
                await this.load(id);
                results.push({ id, success: true });
            } catch (e) {
                results.push({ id, success: false, error: e.message });
            }
            if (onProgress) onProgress(i + 1, ids.length, id);
        }
        return results;
    }

    /**
     * Play sound by ID
     * @param {string} id - Sound ID
     * @param {Object} options - { volume, loop, pitch, category, is3D, position, onEnded }
     * @returns {SoundInstance}
     */
    play(id, options = {}) {
        if (!this.context) this.init();
        if (this.muted) return null;
        
        const buffer = this.buffers.get(id);
        if (!buffer) {
            // Try to load on demand
            this.load(id).then(buf => {
                if (buf) this.play(id, options);
            });
            return null;
        }
        
        // Use pool for frequent sounds
        const pool = this.pools.get(id);
        if (pool && !options.is3D) {
            return pool.acquire(options);
        }
        
        // Create new instance
        const instance = new SoundInstance(this, buffer, options);
        return instance.play();
    }

    /**
     * Play 3D positional sound
     * @param {string} id 
     * @param {THREE.Vector3} position 
     * @param {Object} options 
     */
    play3D(id, position, options = {}) {
        return this.play(id, { ...options, is3D: true, position: position.clone() });
    }

    /** Diagnostic-only legacy hook. Production never synthesizes MU audio. */
    _playProcedural(_id, _options = {}) { return null; }

    // ---------- Convenience Methods ----------

    uiClick() { return this.play('ui.click'); }
    uiHover() { return null; }
    uiError() { return this.play('ui.error'); }
    uiSuccess() { return this.play('ui.jewel'); }
    uiLevelUp() { return this.play('ui.levelup'); }
    uiJewel() { return this.play('ui.jewel'); }

    combatSwing() { return this.play('combat.swing1'); }
    combatHit() { return this.play('combat.hit1'); }
    combatBow() { return this.play('combat.bow'); }
    combatMagic(type = 'fire') { return this.play(`magic.${type}`); }

    playerWalk(surface = 'grass') { return this.play(`player.walk_${surface}`); }
    playerRun() { return this.play('player.run1'); }
    playerDeath() { return this.play('player.death'); }
    playerPain() { return this.play('player.pain1'); }

    monsterDie() { return this.play('monster.die'); }
    monsterAttack() { return this.play('monster.attack1'); }

    envWind() { return this.play('env.wind', { category: SoundCategory.AMBIENT, loop: true, volume: 0.3 }); }
    envRain() { return this.play('env.rain', { category: SoundCategory.AMBIENT, loop: true, volume: 0.4 }); }
    envThunder() { return this.play(`env.thunder${Math.floor(Math.random()*3)+1}`, { category: SoundCategory.AMBIENT, volume: 0.6 }); }

    // ---------- BGM Control ----------

    async playBGM(id, fadeTime = 2.0) {
        const buffer = await this.load(id, `Music/${id}.mp3`);
        if (buffer) {
            this.bgm.play(buffer, fadeTime);
        }
    }

    stopBGM(fadeTime = 2.0) { this.bgm.stop(fadeTime); }
    pauseBGM() { this.bgm.pause(); }
    resumeBGM() { this.bgm.resume(); }

    // ---------- Listener (3D Audio) ----------

    setListenerPosition(position, front = null, up = null) {
        if (!this.context?.listener) return;
        
        this.listenerPosition.copy(position);
        if (front) this.listenerOrientation.front.copy(front);
        if (up) this.listenerOrientation.up.copy(up);
        
        const listener = this.context.listener;
        if (listener.positionX) {
            // Modern API
            listener.positionX.setValueAtTime(position.x, this.context.currentTime);
            listener.positionY.setValueAtTime(position.y, this.context.currentTime);
            listener.positionZ.setValueAtTime(position.z, this.context.currentTime);
            listener.forwardX.setValueAtTime(this.listenerOrientation.front.x, this.context.currentTime);
            listener.forwardY.setValueAtTime(this.listenerOrientation.front.y, this.context.currentTime);
            listener.forwardZ.setValueAtTime(this.listenerOrientation.front.z, this.context.currentTime);
            listener.upX.setValueAtTime(this.listenerOrientation.up.x, this.context.currentTime);
            listener.upY.setValueAtTime(this.listenerOrientation.up.y, this.context.currentTime);
            listener.upZ.setValueAtTime(this.listenerOrientation.up.z, this.context.currentTime);
        } else {
            // Deprecated API
            listener.setPosition(position.x, position.y, position.z);
            listener.setOrientation(
                this.listenerOrientation.front.x, this.listenerOrientation.front.y, this.listenerOrientation.front.z,
                this.listenerOrientation.up.x, this.listenerOrientation.up.y, this.listenerOrientation.up.z
            );
        }
    }

    // ---------- Volume Control ----------

    setCategoryVolume(category, volume) {
        volume = Math.max(0, Math.min(1, volume));
        this.categoryVolumes[category] = volume;
        if (this.categoryGains[category]) {
            this.categoryGains[category].gain.value = volume;
        }
        // Update playing instances
        for (const pool of this.pools.values()) {
            for (const inst of [...pool.inUse, ...pool.available]) {
                if (inst.options.category === category && inst.gainNode) {
                    inst.gainNode.gain.value = inst.options.volume * volume;
                }
            }
        }
    }

    getCategoryVolume(category) {
        return this.categoryVolumes[category] || 1.0;
    }

    setMasterVolume(volume) {
        volume = Math.max(0, Math.min(1, volume));
        this._defaultVolumes[SoundCategory.MASTER] = volume;
        if (this.masterGain) this.masterGain.gain.value = volume;
    }

    getMasterVolume() {
        return this._defaultVolumes[SoundCategory.MASTER];
    }

    setMuted(muted) {
        this.muted = muted;
        if (this.masterGain) {
            this.masterGain.gain.value = muted ? 0 : this._defaultVolumes[SoundCategory.MASTER];
        }
    }

    // ---------- Reverb ----------

    enableReverb(preset = 'hall', wetLevel = 0.3) {
        if (!this.reverb) return;
        this.reverb.setPreset(preset);
        this.reverb.setWetLevel(wetLevel);
        this.reverb.setEnabled(true);
    }

    disableReverb() {
        if (this.reverb) this.reverb.setEnabled(false);
    }

    // ---------- Pool Management ----------

    getPool(id) {
        return this.pools.get(id);
    }

    createPool(id, maxSize = 16) {
        const buffer = this.buffers.get(id);
        if (!buffer) return null;
        const pool = new SoundPool(this, buffer, maxSize);
        this.pools.set(id, pool);
        return pool;
    }

    // ---------- Update Loop ----------

    update() {
        // Update pools
        for (const pool of this.pools.values()) {
            pool.update();
        }
    }

    // ---------- Cleanup ----------

    stopAll() {
        for (const pool of this.pools.values()) pool.stopAll();
        this.bgm.stop();
    }

    dispose() {
        this.stopAll();
        for (const buffer of this.buffers.values()) {
            // AudioBuffers don't need explicit disposal
        }
        this.buffers.clear();
        this.pools.clear();
        
        if (this.reverb) this.reverb.dispose();
        
        if (this.context) {
            this.context.close();
            this.context = null;
        }
    }
}

// Singleton
export const MUSounds = new MUSoundManager();

export default MUSoundManager;