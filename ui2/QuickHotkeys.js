// ui2/QuickHotkeys.js — Registro global dos hotkeys padrão do MU Online
//
// Responsabilidades:
//  1. Hotkeys comprovadas desta árvore: i=inventário, c=character, m=mail.
//     Storage/Warehouse NÃO possui hotkey B no clean PC owner; abre somente por 0x30 Talk Value=2.
//  2. Shift+click no nome do autor de uma mensagem no chat = abrir whisper.
//  3. Movimento WASD/setas NÃO é mutado aqui. O owner autoritativo é
//     game/Movement.js + caminho de rede do GameApp (evita movimento duplo).
//  4. Barra de espaço = pick up de item próximo.
//
// Uso:
//   import { QuickHotkeys } from '../ui2/QuickHotkeys.js';
//   QuickHotkeys.install({
//       windows: { i: this._ui.inventoryWin, c: this._ui.charWindow, ... },
//       getPlayer: () => this.playerChar,
//       getDrops: () => this.drops,
//       chat: this.chat,
//       onMove: (dx, dz) => { ... } // opcional, override do movimento
//   });

// R38 evidence closure: only bindings with retained clean-PC/callsite evidence are
// exposed here. Do not turn generic Web window names into keyboard behavior.
// I/C/M remain registered here. Warehouse is server/NPC-owned, not a keyboard window.
const DEFAULT_BINDINGS = Object.freeze({
    i: 'inventory',
    c: 'character',
    m: 'mail'
});

function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
           el.isContentEditable === true;
}

class QuickHotkeysClass {
    constructor() {
        this._installed = false;
        this._windows = {};       // { hotkeyNome: MUWindow-ish }
        this._byHotkey = {};      // tecla -> objeto janela
        this._getPlayer = null;
        this._getDrops = null;
        this._chat = null;
        this._onMove = null;
        this._keysDown = new Set();
        this._moveTimer = null;
    }

    /**
     * @param {object} opts
     * @param {Object<string,object>} [opts.windows] - mapa nome→janela
     *        (qualquer objeto com show/hide/toggle/visible). As chaves são
     *        os nomes em DEFAULT_BINDINGS ('inventory', 'character', ...).
     * @param {Function} [opts.getPlayer] - retorna o Character do jogador
     * @param {Function} [opts.getDrops]  - retorna o DropManager
     * @param {object}   [opts.chat]      - ChatSystem (para whisper)
     * @param {Function} [opts.onMove]    - (dx, dz) movimento customizado
     */
    install(opts = {}) {
        this._windows = opts.windows || {};
        this._getPlayer = opts.getPlayer || null;
        this._getDrops = opts.getDrops || null;
        this._chat = opts.chat || null;
        this._onMove = opts.onMove || null;

        // Indexa janelas por tecla: para cada binding, se existir janela
        // registrada com o nome associado, essa tecla a controla.
        this._byHotkey = {};
        for (const [key, winName] of Object.entries(DEFAULT_BINDINGS)) {
            const win = this._windows[winName];
            if (win) {
                win.adoptExternalHotkeyOwner?.();
                this._byHotkey[key.toLowerCase()] = win;
            }
        }
        // Também indexa janelas que declarem .hotkey próprio (MUWindow)
        for (const win of Object.values(this._windows)) {
            if (win && win.hotkey) this._byHotkey[win.hotkey.toLowerCase()] = win;
        }

        if (this._installed) return;
        this._installed = true;

        this._keyDownHandler = (e) => this._onKeyDown(e);
        this._keyUpHandler = (e) => this._keysDown.delete(e.key.toLowerCase());
        this._clickHandler = (e) => this._onClick(e);

        window.addEventListener('keydown', this._keyDownHandler);
        window.addEventListener('keyup', this._keyUpHandler);
        // Shift+click no chat (captura antes dos handlers internos)
        document.addEventListener('click', this._clickHandler, true);
    }

    /** Registra/atualiza uma janela após carregamento tardio (import dinâmico). */
    registerWindow(nameOrKey, win) {
        this._windows[nameOrKey] = win;
        // Registered windows have one keyboard authority: QuickHotkeys. This
        // prevents the MUWindow listener and this listener toggling twice on the
        // same I/C/B/M key event.
        win?.adoptExternalHotkeyOwner?.();
        for (const [key, winName] of Object.entries(DEFAULT_BINDINGS)) {
            if (winName === nameOrKey) this._byHotkey[key.toLowerCase()] = win;
        }
        if (win && win.hotkey) this._byHotkey[win.hotkey.toLowerCase()] = win;
        if (this._byHotkey[nameOrKey.toLowerCase()] === undefined &&
            DEFAULT_BINDINGS[nameOrKey.toLowerCase()]) {
            this._byHotkey[nameOrKey.toLowerCase()] = win;
        }
    }

    /** Remove uma janela somente se ela ainda for o owner registrado.
     *  Evita que teardown tardio de uma geração antiga apague a janela nova. */
    unregisterWindow(nameOrKey, win = null) {
        const current = this._windows[nameOrKey];
        if (win && current && current !== win) return false;
        const owner = win || current || this._byHotkey[String(nameOrKey).toLowerCase()] || null;
        if (current && (!win || current === win)) delete this._windows[nameOrKey];
        for (const [key, candidate] of Object.entries(this._byHotkey)) {
            if (candidate === owner) delete this._byHotkey[key];
        }
        return !!owner;
    }

    /** Atualiza explicitamente o owner de chat entre gerações de world UI. */
    setChat(chat) { this._chat = chat || null; }

    uninstall() {
        if (!this._installed) return;
        window.removeEventListener('keydown', this._keyDownHandler);
        window.removeEventListener('keyup', this._keyUpHandler);
        document.removeEventListener('click', this._clickHandler, true);
        this._installed = false;
    }

    // ---------------------------------------------------------------
    _onKeyDown(e) {
        if (e.repeat) return;
        const key = e.key.toLowerCase();
        this._keysDown.add(key);

        // Hotkeys de janela NÃO disparam enquanto digita no chat/input
        if (!isTypingTarget(e.target)) {
            const win = this._byHotkey[key === 'escape' ? 'Escape'.toLowerCase() : key];
            const bindingKey = key === 'escape' ? 'escape' : key;
            const target = this._byHotkey[bindingKey];
            if (target) {
                // Toggle: se visível → fecha; se fechada → abre
                if (typeof target.toggle === 'function') target.toggle();
                else if (target.visible) target.hide?.();
                else target.show?.();
                e.preventDefault();
                return;
            }

            // Espaço = pick up de item
            if (e.code === 'Space') {
                e.preventDefault();
                this._pickupNearest();
                return;
            }

            // R45: WASD/setas pertencem exclusivamente a Movement/Input.
            // QuickHotkeys não altera posição nem envia passo: duas authorities
            // concorrentes causavam aceleração, drift e A/D aparentemente invertido.
        }
    }

    _onClick(e) {
        // Shift+click em autor de mensagem do chat → whisper
        if (!e.shiftKey || !this._chat) return;
        const el = e.target.closest?.('[data-author], .chat-author, .chat-name');
        if (!el) return;
        const name = el.dataset?.author || el.textContent.trim().replace(/:$/, '');
        if (!name) return;
        e.preventDefault();
        e.stopPropagation();
        this._openWhisper(name);
    }

    _openWhisper(name) {
        // Compatível com ChatSystem: tenta prefixar o input com /w nome
        const input = document.querySelector('#chat-input, .chat-input input, input.chat-input');
        if (input) {
            input.value = `/w ${name} `;
            input.focus();
        } else if (typeof this._chat.whisper === 'function') {
            this._chat.whisper(name);
        }
    }

    // Movimento removido deste owner em R45; ver game/Movement.js.

    _pickupNearest() {
        const drops = this._getDrops?.();
        const player = this._getPlayer?.();
        if (!drops || !player) return;

        // DropManager: tenta API comum de pickup do mais próximo
        if (typeof drops.pickupNearest === 'function') {
            drops.pickupNearest(player.position);
        } else if (typeof drops.tryPickup === 'function') {
            drops.tryPickup(player.position);
        } else if (Array.isArray(drops.items)) {
            // Fallback: menor distância dentro do pickupRadius
            const radius = drops.pickupRadius || 1.5;
            let best = null, bestD = Infinity;
            for (const it of drops.items) {
                const d = it.position ? it.position.distanceTo(player.position) : Infinity;
                if (d < radius && d < bestD) { bestD = d; best = it; }
            }
            if (best && typeof drops.pickup === 'function') drops.pickup(best);
        }
    }
}

export const QuickHotkeys = new QuickHotkeysClass();
export { DEFAULT_BINDINGS };
