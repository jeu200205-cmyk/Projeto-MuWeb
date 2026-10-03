/**
 * SoundManager.js - Port de DSplaysound.cpp e DSwaveIO.cpp
 * Usa Web Audio API em vez de DirectSound
 */
export class SoundManager {
    constructor() {
        this.context = null;
        this.masterGain = null;
        this.buffers = new Map();    // Cache de áudio carregado
        this.playing = new Map();    // Sons tocando atualmente
        this._volume = 1.0;
        this._muted = false;
        this._unlocked = false;
        // Portability rule: synthetic oscillator audio is NOT a production
        // substitute for missing PC samples. It stays disabled unless a
        // developer explicitly enables the diagnostic fallback.
        this.allowProceduralFallback = false;
    }

    /**
     * Deve ser chamado após interação do usuário (política dos browsers)
     */
    init() {
        if (this.context) return;

        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.context.createGain();
        this.masterGain.connect(this.context.destination);
        this.masterGain.gain.value = this._volume;

        this._unlocked = true;
    }

    /**
     * Carrega e decodifica um arquivo de áudio
     * @param {string} id - identificador
     * @param {string} url - URL do arquivo (wav, mp3, ogg)
     */
    async load(id, url) {
        if (!this.context) this.init();
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
            this.buffers.set(id, audioBuffer);
            return audioBuffer;
        } catch (err) {
            console.warn(`[SoundManager] Falha ao carregar "${id}" (${url}):`, err);
            return null;
        }
    }

    /**
     * Carrega um .wav real do cliente via RemoteAssets (Data/Sound/<rel>)
     * @param {string} id - identificador do buffer
     * @param {string} relPath - caminho relativo dentro de Sound/ (ex.: 'iButtonClick.wav')
     * @returns {AudioBuffer|null}
     */
    async loadWav(id, relPath) {
        if (!this.context) this.init();
        try {
            const { RemoteAssets } = await import('../data/RemoteAssets.js');
            const buf = await RemoteAssets.fetchBinary('Sound/' + relPath);
            if (!buf) return null;
            // decodeAudioData DETACHA o ArrayBuffer de entrada (spec Web Audio).
            // fetchBinary devolve o MESMO buffer cacheado a cada chamada — sem a
            // cópia, toda re-decodificação (reconexão → _loadRealSounds de novo)
            // explode com "DataCloneError: Cannot decode detached ArrayBuffer".
            // slice(0) = cópia barata; o cache original permanece intacto.
            const audioBuffer = await this.context.decodeAudioData(buf.slice(0));
            this.buffers.set(id, audioBuffer);
            return audioBuffer;
        } catch (err) {
            console.warn(`[SoundManager] Falha ao carregar wav "${id}" (Sound/${relPath}):`, err);
            return null;
        }
    }

    /**
     * Toca um som carregado
     * @param {string} id - id do buffer carregado
     * @param {object} options - {volume, loop, pitch}
     */
    play(id, options = {}) {
        if (!this.context || this._muted) return null;
        const buffer = this.buffers.get(id);
        if (!buffer) return null;

        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.loop = options.loop || false;
        if (options.pitch) source.playbackRate.value = options.pitch;

        const gain = this.context.createGain();
        gain.gain.value = options.volume !== undefined ? options.volume : 1.0;

        source.connect(gain);
        gain.connect(this.masterGain);
        source.start(0);

        const handle = { source, gain, id };
        if (!this.playing.has(id)) this.playing.set(id, []);
        this.playing.get(id).push(handle);

        source.onended = () => {
            const list = this.playing.get(id);
            if (list) {
                const idx = list.indexOf(handle);
                if (idx > -1) list.splice(idx, 1);
            }
        };

        return handle;
    }

    /**
     * Gera um efeito sonoro proceduralmente (bleep) — substitui samples faltantes
     * @param {number} freq - frequência em Hz
     * @param {number} duration - duração em segundos
     * @param {string} type - 'sine', 'square', 'sawtooth', 'triangle'
     */
    playBeep(freq = 440, duration = 0.1, type = 'sine', volume = 0.3) {
        const debugOverride = typeof window !== 'undefined' && window.__MU_ALLOW_PROCEDURAL_AUDIO === true;
        if (!this.allowProceduralFallback && !debugOverride) return null;
        if (!this.context || this._muted) return null;

        const osc = this.context.createOscillator();
        const gain = this.context.createGain();

        osc.type = type;
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(volume, this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.context.currentTime + duration);
    }

    /**
     * Efeitos de UI pré-definidos
     */
    // Usa somente sons reais do cliente quando carregados. Missing owner is
    // fail-closed in production; procedural oscillator is diagnostic-only.
    uiClick() { return this.buffers.has('sfx-click') ? this.play('sfx-click') : null; }
    uiHover() { return null; } // exact PC hover sample owner not evidenced here
    uiError() { return this.buffers.has('sfx-error') ? this.play('sfx-error') : null; }
    uiSuccess() { return this.buffers.has('sfx-jewel') ? this.play('sfx-jewel') : null; }

    stop(id) {
        const list = this.playing.get(id);
        if (list) {
            list.forEach(h => { try { h.source.stop(); } catch (e) {} });
            list.length = 0;
        }
    }

    stopAll() {
        for (const [id] of this.playing) this.stop(id);
    }

    setVolume(v) {
        this._volume = Math.max(0, Math.min(1, v));
        if (this.masterGain) this.masterGain.gain.value = this._volume;
    }

    get volume() { return this._volume; }

    setMuted(muted) {
        this._muted = muted;
        if (this.masterGain) {
            this.masterGain.gain.value = muted ? 0 : this._volume;
        }
    }

    get muted() { return this._muted; }
    get unlocked() { return this._unlocked; }
}

// Singleton
export const Sound = new SoundManager();
