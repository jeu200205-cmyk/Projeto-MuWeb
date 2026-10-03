// ui2/CommandWindow.js — Janela de comandos estilo MU clássico.
// Hotkey 'x'. Grid de botões (Post, Add Point, PK Clear, ...).
// Clique dispara evento 'command' com detail { cmd, args } (EventTarget).
// Input de chat no rodapé envia para a instância de Chat injetada.

import { MUWindow } from './MUWindow.js';

export const COMMANDS = [
    { cmd: '/post',     label: 'Post',      hint: 'Mensagem global para todos' },
    { cmd: '/addpoint', label: 'Add Point', hint: 'Distribuir pontos: /addpoint <str|agi|vit|ene|cmd> <qtd>' },
    { cmd: '/pkclear',  label: 'PK Clear',  hint: 'Limpar status de PK' },
    { cmd: '/quest',    label: 'Quest Info',hint: 'Informações da quest atual' },
    { cmd: '/store',    label: 'Store',     hint: 'Abrir loja pessoal' },
    { cmd: '/guild',    label: 'Guild',     hint: 'Painel da guild' },
    { cmd: '/duel',     label: 'Duel',      hint: 'Desafiar para duelo: /duel <nick>' },
    { cmd: '/arena',    label: 'Arena',     hint: 'Entrar na arena PvP' },
    { cmd: '/help',     label: 'Help',      hint: 'Lista de comandos' },
];

let cmdStylesInjected = false;
function injectCmdStyles() {
    if (cmdStylesInjected) return;
    cmdStylesInjected = true;
    const css = `
.cmd-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 8px; }
.cmd-btn {
    padding: 8px 4px; cursor: pointer; text-align: center;
    background: linear-gradient(180deg, #3a2f1a 0%, #1c150a 100%);
    border: 1px solid #8a6d2f; border-radius: 3px;
    color: #f0d98c; font-size: 11px; font-weight: bold;
    letter-spacing: 0.5px; text-transform: uppercase;
    transition: filter .12s, transform .08s;
}
.cmd-btn:hover { filter: brightness(1.35); }
.cmd-btn:active { transform: scale(0.95); }
.cmd-input-row { display: flex; gap: 4px; }
.cmd-input {
    flex: 1; padding: 5px 8px;
    background: rgba(0,0,0,0.6); border: 1px solid #8a6d2f; border-radius: 3px;
    color: #ffe9b0; font-size: 12px; outline: none;
    font-family: Consolas, monospace;
}
.cmd-input:focus { border-color: #d4af37; }
.cmd-send {
    padding: 5px 12px; cursor: pointer;
    background: linear-gradient(180deg, #54401e 0%, #2a200e 100%);
    border: 1px solid #8a6d2f; border-radius: 3px; color: #f0d98c;
}
.cmd-send:hover { filter: brightness(1.3); }
.cmd-hint { min-height: 14px; color: #9a8a5a; font-size: 10px; margin-bottom: 6px; font-style: italic; }
`;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
}

/**
 * CommandWindow — painel de comandos rápidos + chat.
 *
 * API:
 *   new CommandWindow({ chat, x, y })
 *     chat — instância de ChatSystem (sendMessage) ou null.
 *   EventTarget: window.addEventListener('command', e => { cmd, args } = e.detail)
 *   openCommandPicker(cmd)  — foca o input com o comando pronto p/ completar args.
 *   destroy()
 */
export class CommandWindow extends MUWindow {
    constructor(opts = {}) {
        super({
            title: 'Comandos',
            width: 300,
            x: opts.x !== undefined ? opts.x : 200,
            y: opts.y !== undefined ? opts.y : 140,
            hotkey: 'x',
            visible: opts.visible,
            parent: opts.parent || document.body,
        });
        injectCmdStyles();
        this.chat = opts.chat || null;
        this._events = new EventTarget();
        this._buildBody();
    }

    // Encaminha add/removeEventListener para o bus interno.
    addEventListener(...a) { this._events.addEventListener(...a); }
    removeEventListener(...a) { this._events.removeEventListener(...a); }

    _emit(cmd, args = []) {
        this._events.dispatchEvent(new CustomEvent('command', { detail: { cmd, args } }));
    }

    _buildBody() {
        // Grid de botões
        this.grid = document.createElement('div');
        this.grid.className = 'cmd-grid';
        for (const def of COMMANDS) {
            const btn = document.createElement('div');
            btn.className = 'cmd-btn';
            btn.textContent = def.label;
            btn.title = def.hint;
            btn.addEventListener('mouseenter', () => { this.hint.textContent = def.hint; });
            btn.addEventListener('mouseleave', () => { this.hint.textContent = ''; });
            btn.addEventListener('click', () => this._onCommand(def));
            this.grid.appendChild(btn);
        }

        this.hint = document.createElement('div');
        this.hint.className = 'cmd-hint';

        // Input de chat
        const row = document.createElement('div');
        row.className = 'cmd-input-row';
        this.input = document.createElement('input');
        this.input.className = 'cmd-input';
        this.input.placeholder = 'Chat ou /comando...';
        this.input.maxLength = 120;
        const sendBtn = document.createElement('button');
        sendBtn.className = 'cmd-send';
        sendBtn.textContent = '➤';

        const send = () => {
            const text = this.input.value.trim();
            if (!text) return;
            if (text.startsWith('/')) {
                const parts = text.slice(1).split(/\s+/);
                this._emit('/' + parts[0].toLowerCase(), parts.slice(1));
            }
            if (this.chat && typeof this.chat.sendMessage === 'function') {
                this.chat.sendMessage(text);
            }
            this.input.value = '';
        };
        sendBtn.addEventListener('click', send);
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') send();
            e.stopPropagation();
        });
        this.input.addEventListener('keyup', (e) => e.stopPropagation());
        this.input.addEventListener('keypress', (e) => e.stopPropagation());

        row.appendChild(this.input);
        row.appendChild(sendBtn);

        this.body.appendChild(this.grid);
        this.body.appendChild(this.hint);
        this.body.appendChild(row);
    }

    _onCommand(def) {
        // Comandos sem args disparam direto; os demais preparam o input.
        const needsArgs = def.hint.includes('<');
        if (needsArgs) {
            this.openCommandPicker(def.cmd);
        } else {
            this._emit(def.cmd, []);
            if (this.chat && typeof this.chat.sendMessage === 'function') {
                this.chat.sendMessage(def.cmd);
            }
        }
    }

    openCommandPicker(cmd) {
        this.show();
        this.input.value = cmd + ' ';
        this.input.focus();
        this._emit(cmd, []); // avisa que o picker foi aberto
    }
}
