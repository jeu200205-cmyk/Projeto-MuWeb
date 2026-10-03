// ui2/Scoreboard.js — Placar para duelos/eventos PvP.
// Tabela jogador/kills/deaths/dano com update em tempo real via updateRows(rows),
// toggle show/hide com animação de escala/fade.

import { MUWindow } from './MUWindow.js';

let sbStylesInjected = false;
function injectSbStyles() {
    if (sbStylesInjected) return;
    sbStylesInjected = true;
    const css = `
.scoreboard { overflow: hidden; transition: opacity .22s ease, transform .22s ease; transform-origin: top center; }
.scoreboard.sb-hidden { opacity: 0; transform: scale(0.92); pointer-events: none; }
.sb-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.sb-table th {
    text-align: left; padding: 4px 6px; color: #d4af37;
    border-bottom: 1px solid #8a6d2f; text-transform: uppercase; font-size: 10px;
    letter-spacing: 1px;
}
.sb-table td { padding: 4px 6px; color: #e8dcc0; border-bottom: 1px solid rgba(138,109,47,0.25); }
.sb-table tr.sb-row { transition: background .3s; }
.sb-table tr.sb-row:hover { background: rgba(138,109,47,0.15); }
.sb-table tr.sb-top td { color: #ffe9b0; font-weight: bold; }
.sb-table tr.sb-flash { animation: sb-flash .5s; }
@keyframes sb-flash {
    0% { background: rgba(212,175,55,0.5); }
    100% { background: transparent; }
}
.sb-empty { text-align: center; color: #9a8a5a; padding: 12px; font-style: italic; }
.sb-sub { font-size: 10px; color: #9a8a5a; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 1px; }
`;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
}

/**
 * Scoreboard — placar PvP em tempo real.
 *
 * API:
 *   new Scoreboard({ title, subtitle, x, y, hotkey, visible })
 *   updateRows(rows)  — rows: [{ name, kills, deaths, dmg }]  (setter realtime)
 *   show() / hide() / toggle()  — com animação
 *   clear()
 *   destroy()
 */
export class Scoreboard extends MUWindow {
    constructor(opts = {}) {
        super({
            title: opts.title || 'Placar',
            width: opts.width || 340,
            x: opts.x !== undefined ? opts.x : 40,
            y: opts.y !== undefined ? opts.y : 80,
            hotkey: opts.hotkey || 'tab',
            visible: false,
            parent: opts.parent || document.body,
            closable: opts.closable,
        });
        injectSbStyles();
        this.element.classList.add('scoreboard', 'sb-hidden');
        this.rows = [];

        this.sub = document.createElement('div');
        this.sub.className = 'sb-sub';
        this.sub.textContent = opts.subtitle || 'Evento PvP';

        this.table = document.createElement('table');
        this.table.className = 'sb-table';
        this.table.innerHTML =
            '<thead><tr><th>#</th><th>Jogador</th><th>Kills</th><th>Deaths</th><th>Dano</th></tr></thead>';
        this.tbody = document.createElement('tbody');
        this.table.appendChild(this.tbody);

        this.emptyMsg = document.createElement('div');
        this.emptyMsg.className = 'sb-empty';
        this.emptyMsg.textContent = 'Aguardando jogadores...';

        this.body.appendChild(this.sub);
        this.body.appendChild(this.table);
        this.body.appendChild(this.emptyMsg);
        this._render();

        if (opts.visible) this.show();
    }

    /** Atualização em tempo real: substitui todas as linhas e anima mudanças. */
    updateRows(rows) {
        const prevTop = this.rows.length ? this.rows[0].name : null;
        this.rows = Array.isArray(rows) ? rows.slice() : [];
        // Ordena por kills desc, depois dano desc
        this.rows.sort((a, b) => (b.kills - a.kills) || (b.dmg - a.dmg));
        this._render();
        const newTop = this.rows.length ? this.rows[0].name : null;
        if (newTop && newTop !== prevTop && this.tbody.firstChild) {
            this.tbody.firstChild.classList.add('sb-flash');
        }
    }

    setSubtitle(text) { this.sub.textContent = text; }

    clear() { this.updateRows([]); }

    _render() {
        this.tbody.innerHTML = '';
        this.emptyMsg.style.display = this.rows.length ? 'none' : 'block';
        this.rows.forEach((r, i) => {
            const tr = document.createElement('tr');
            tr.className = 'sb-row' + (i === 0 ? ' sb-top' : '');
            const cells = [
                String(i + 1),
                String(r.name || '???'),
                String(r.kills | 0),
                String(r.deaths | 0),
                this._fmtDmg(r.dmg | 0),
            ];
            for (const c of cells) {
                const td = document.createElement('td');
                td.textContent = c;
                tr.appendChild(td);
            }
            this.tbody.appendChild(tr);
        });
    }

    _fmtDmg(n) {
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return String(n);
    }

    show() {
        this.visible = true;
        this.element.style.display = 'block';
        this.bringToFront();
        // força reflow para a transição de entrada rodar
        void this.element.offsetWidth;
        this.element.classList.remove('sb-hidden');
    }

    hide() {
        this.visible = false;
        this.element.classList.add('sb-hidden');
        setTimeout(() => {
            if (!this.visible) this.element.style.display = 'none';
        }, 230);
        if (this.onClose) this.onClose();
    }
}
