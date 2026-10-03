// game/GameOptions.js — Configurações globais do jogo (janela estilo MU, hotkey ESC)
// Persiste tudo via Saves.save('options').
//
// Uso:
//   import { GameOptions } from './game/GameOptions.js';
//   GameOptions.init({ canvas, renderer? });
//   GameOptions.applyAll();          // aplica o que estava salvo
//   GameOptions.toggleWindow();      // abre/fecha a janela (ESC também faz isso)
//
// Expostos no singleton:
//   musicVolume, sfxVolume (0-10) -> Sound.setVolume / opcional Sound.music.setVolume
//   showEffects, showFps, autoPickup (flag global consultada por outros sistemas)
//   resolution ('1024x768' etc.) -> GameOptions.resolution / applyResolution()
//   keybindings { INVENTORY, CHARACTER, QUEST } e GameOptions.actionFor(key)

import { MUWindow } from '../ui2/MUWindow.js';
import { Saves } from '../data/LoadData.js';
import { Sound } from '../audio/SoundManager.js';

const SAVE_KEY = 'options';

const DEFAULTS = {
    musicVolume: 7,
    sfxVolume: 8,
    showEffects: true,
    showFps: false,
    autoPickup: false,
    resolution: null, // null = resolução atual do canvas
    keybindings: { INVENTORY: 'i', CHARACTER: 'c', QUEST: 't' },
};

class GameOptionsClass {
    constructor() {
        this._values = structuredClone(DEFAULTS);
        this._ctx = { canvas: null };
        this._win = null;
        this._listeners = { changed: [], fpsChanged: [] };
        this._rebindingAction = null;

        Object.defineProperties(this, {
            musicVolume: { get: () => this._values.musicVolume },
            sfxVolume: { get: () => this._values.sfxVolume },
            showEffects: { get: () => this._values.showEffects },
            showFps: { get: () => this._values.showFps },
            autoPickup: { get: () => this._values.autoPickup },
            resolution: { get: () => this._values.resolution },
            keybindings: { get: () => this._values.keybindings },
        });
    }

    /** @param {{canvas: HTMLCanvasElement}} ctx */
    init(ctx = {}) {
        Object.assign(this._ctx, ctx);
        this.load();
        return this;
    }

    on(event, cb) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(cb);
        return this;
    }

    _emit(event, ...args) {
        for (const cb of this._listeners[event] || []) {
            try { cb(...args); } catch (e) { console.error('[GameOptions] listener error:', e); }
        }
    }

    // ---- persistência ----

    save() {
        Saves.save(SAVE_KEY, this._values);
    }

    load() {
        const saved = Saves.load(SAVE_KEY, null);
        if (saved && typeof saved === 'object') {
            this._values = {
                ...structuredClone(DEFAULTS),
                ...saved,
                keybindings: { ...DEFAULTS.keybindings, ...(saved.keybindings || {}) },
            };
        }
        return this.onChange ? this : this;
    }

    onChange(key, value) {
        this._emit('changed', key, value);
        this.save();
    }

    /** Aplica todas as opções salvas (volumes, resolução, keybindings). */
    applyAll() {
        this.setMusicVolume(this._values.musicVolume, false);
        this.setSfxVolume(this._values.sfxVolume, false);
        this.applyResolution();
        this._bindKeys();
        return this;
    }

    // ---- áudio ----

    setMusicVolume(v, persist = true) {
        v = Math.max(0, Math.min(10, v));
        this._values.musicVolume = v;
        if (Sound.music && typeof Sound.music.setVolume === 'function') {
            Sound.music.setVolume(v / 10);
        } else if (typeof Sound.setVolume === 'function' && this._values.sfxVolume !== null) {
            // fallback: um único canal
        }
        if (persist) this.onChange('musicVolume', v);
    }

    setSfxVolume(v, persist = true) {
        v = Math.max(0, Math.min(10, v));
        this._values.sfxVolume = v;
        if (typeof Sound.setVolume === 'function') Sound.setVolume(v / 10);
        if (persist) this.onChange('sfxVolume', v);
    }

    // ---- toggles ----

    setShowEffects(v) {
        this._values.showEffects = !!v;
        this.onChange('showEffects', this._values.showEffects);
    }

    setShowFps(v) {
        this._values.showFps = !!v;
        this._emit('fpsChanged', this._values.showFps);
        this.onChange('showFps', this._values.showFps);
    }

    setAutoPickup(v) {
        this._values.autoPickup = !!v;
        this.onChange('autoPickup', this._values.autoPickup);
    }

    // ---- resolução ----

    applyResolution() {
        const canvas = this._ctx.canvas;
        const res = this._values.resolution;
        if (!canvas || !res) return;
        const [w, h] = res.split('x').map(Number);
        if (w > 0 && h > 0) {
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            canvas.width = w;
            canvas.height = h;
        }
    }

    setResolution(res) {
        this._values.resolution = res;
        this.applyResolution();
        this.onChange('resolution', res);
    }

    // ---- keybindings ----

    /** Ação para a tecla pressionada, ou null. */
    actionFor(key) {
        const k = String(key).toLowerCase();
        for (const [action, bound] of Object.entries(this._values.keybindings)) {
            if (bound.toLowerCase() === k) return action;
        }
        return null;
    }

    rebind(action, key) {
        if (action in this._values.keybindings) {
            this._values.keybindings[action] = String(key).toLowerCase();
            this._bindKeys();
            this.onChange('keybindings', this._values.keybindings);
        }
    }

    /** Liga os atalhos reconfiguráveis a janelas registradas via bindAction(). */
    _bindKeys() {
        if (!this._actions) return;
        if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
        this._keyHandler = (e) => {
            if (e.repeat || this._rebindingAction) return;
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
            const action = this.actionFor(e.key);
            if (action && this._actions[action]) this._actions[action]();
        };
        window.addEventListener('keydown', this._keyHandler);
    }

    /**
     * Registra o que cada ação faz, ex.:
     *   GameOptions.bindAction('INVENTORY', () => inventoryWindow.toggle());
     */
    bindAction(action, fn) {
        if (!this._actions) this._actions = {};
        this._actions[action] = fn;
        this._bindKeys();
        return this;
    }

    // ---- janela ----

    getWindow() {
        if (!this._win) this._win = new GameOptionsWindow(this);
        return this._win;
    }

    toggleWindow() { this.getWindow().toggle(); }
}

class GameOptionsWindow {
    constructor(opts) {
        this.opts = opts;
        this.win = new MUWindow({ title: 'Options', width: 280, hotkey: 'Escape', x: 260, y: 120 });
        this._build();
    }

    _build() {
        const body = this.win.body;
        body.innerHTML = '';
        const o = this.opts;
        const v = o._values;

        const row = (labelText, control) => {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin:5px 0;gap:8px;';
            const label = document.createElement('span');
            label.textContent = labelText;
            div.appendChild(label);
            div.appendChild(control);
            body.appendChild(div);
        };

        const slider = (min, max, value, onInput) => {
            const wrap = document.createElement('span');
            wrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
            const s = document.createElement('input');
            s.type = 'range'; s.min = min; s.max = max; s.value = value;
            s.style.width = '90px';
            const val = document.createElement('span');
            val.textContent = String(value);
            val.style.cssText = 'min-width:20px;text-align:right;color:#f0d98c;';
            s.addEventListener('input', () => { val.textContent = s.value; onInput(+s.value); });
            wrap.appendChild(s); wrap.appendChild(val);
            return wrap;
        };

        const checkbox = (checked, onChange) => {
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.checked = checked;
            cb.addEventListener('change', () => onChange(cb.checked));
            return cb;
        };

        // Sliders de volume (0-10)
        row('Música', slider(0, 10, v.musicVolume, (x) => o.setMusicVolume(x)));
        row('Efeitos (SFX)', slider(0, 10, v.sfxVolume, (x) => o.setSfxVolume(x)));

        // Toggles
        row('Renderizar efeitos', checkbox(v.showEffects, (x) => o.setShowEffects(x)));
        row('Mostrar FPS', checkbox(v.showFps, (x) => o.setShowFps(x)));
        row('Auto pickup', checkbox(v.autoPickup, (x) => o.setAutoPickup(x)));

        // Resolução
        const sel = document.createElement('select');
        sel.style.cssText = 'background:#1c150a;color:#f0d98c;border:1px solid #8a6d2f;';
        const resolutions = ['800x600', '1024x768', '1280x720', '1366x768', '1600x900', '1920x1080'];
        for (const r of resolutions) {
            const opt = document.createElement('option');
            opt.value = r; opt.textContent = r;
            if (v.resolution === r) opt.selected = true;
            sel.appendChild(opt);
        }
        if (!v.resolution) {
            const cur = document.createElement('option');
            const c = o._ctx.canvas;
            cur.value = ''; cur.textContent = c ? `${c.width}x${c.height} (atual)` : 'Atual';
            cur.selected = true;
            sel.insertBefore(cur, sel.firstChild);
        }
        sel.addEventListener('change', () => { if (sel.value) o.setResolution(sel.value); });
        row('Resolução', sel);

        // Keybindings
        const sep = document.createElement('div');
        sep.style.cssText = 'border-top:1px solid #8a6d2f;margin:8px 0 4px;padding-top:4px;color:#f0d98c;font-weight:bold;';
        sep.textContent = 'Teclas (clique para trocar)';
        body.appendChild(sep);

        const captions = { INVENTORY: 'Inventário', CHARACTER: 'Personagem', QUEST: 'Quests' };
        for (const action of Object.keys(o.keybindings)) {
            const btn = document.createElement('span');
            btn.className = 'mu-btn';
            btn.dataset.action = action;
            btn.textContent = o.keybindings[action].toUpperCase();
            btn.style.minWidth = '32px';
            btn.addEventListener('click', () => {
                btn.textContent = '...';
                o._rebindingAction = action;
                const onKey = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    o._rebindingAction = null;
                    o.rebind(action, e.key);
                    btn.textContent = e.key.toUpperCase();
                    window.removeEventListener('keydown', onKey, true);
                };
                window.addEventListener('keydown', onKey, true);
            });
            row(captions[action] || action, btn);
        }

        // Botão restaurar padrões
        const reset = document.createElement('span');
        reset.className = 'mu-btn';
        reset.textContent = 'Restaurar padrões';
        reset.style.cssText = 'display:block;text-align:center;margin-top:8px;';
        reset.addEventListener('click', () => {
            o._values = structuredClone(DEFAULTS);
            o.applyAll();
            o.save();
            this._build();
        });
        body.appendChild(reset);
    }

    show() { this.win.show(); }
    hide() { this.win.hide(); }
    toggle() { this.win.toggle(); }
}

export const GameOptions = new GameOptionsClass();
export default GameOptions;
