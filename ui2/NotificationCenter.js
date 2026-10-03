// ui2/NotificationCenter.js — Toasts no topo-centro da tela.
// notify(text, type, durationMs): tipos success/error/info/epic.
// notifyAchievement(title, desc): conquista com borda dourada animada.
// Fila com máx. 3 visíveis; desliza + fade na entrada e saída.

let notifStylesInjected = false;
function injectNotifStyles() {
    if (notifStylesInjected) return;
    notifStylesInjected = true;
    const css = `
.notif-container {
    position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    z-index: 2000; pointer-events: none;
    font-family: 'Segoe UI', Arial, sans-serif;
}
.notif {
    display: flex; align-items: center; gap: 10px;
    min-width: 260px; max-width: 420px;
    padding: 10px 16px; border-radius: 6px;
    background: rgba(10, 10, 18, 0.92);
    color: #e8e8e8; font-size: 13px;
    box-shadow: 0 4px 18px rgba(0,0,0,0.6);
    border-left: 4px solid #888;
    opacity: 0; transform: translateY(-16px);
    transition: opacity .28s ease, transform .28s ease;
}
.notif.notif-in { opacity: 1; transform: translateY(0); }
.notif.notif-out { opacity: 0; transform: translateY(-16px); }
.notif-icon { font-size: 16px; flex-shrink: 0; }
.notif-text { line-height: 1.35; }
.notif-success { border-left-color: #58d68d; }
.notif-success .notif-icon { color: #58d68d; }
.notif-error { border-left-color: #e74c3c; }
.notif-error .notif-icon { color: #e74c3c; }
.notif-info { border-left-color: #5dade2; }
.notif-info .notif-icon { color: #5dade2; }
.notif-epic { border-left-color: #f0c040; }
.notif-epic .notif-icon { color: #f0c040; }
.notif-epic .notif-text { color: #ffe9b0; }
.notif-achievement {
    flex-direction: column; align-items: flex-start; gap: 2px;
    border: 2px solid #d4af37; border-left-width: 2px;
    background: linear-gradient(180deg, rgba(50,38,12,0.95), rgba(16,12,4,0.95));
    animation: notif-gold-pulse 1.4s ease-in-out infinite;
    padding: 12px 18px;
}
.notif-achievement .notif-title {
    color: #ffd700; font-weight: bold; font-size: 14px; letter-spacing: 1px;
    text-transform: uppercase;
}
.notif-achievement .notif-desc { color: #e8dcc0; font-size: 12px; }
.notif-achievement .notif-crown { font-size: 20px; align-self: center; }
@keyframes notif-gold-pulse {
    0%, 100% { box-shadow: 0 0 8px rgba(212,175,55,0.35); border-color: #d4af37; }
    50%      { box-shadow: 0 0 22px rgba(255,215,0,0.75); border-color: #ffe680; }
}
`;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
}

const ICONS = { success: '✔', error: '✖', info: 'ℹ', epic: '★' };
const DEFAULT_DURATIONS = { success: 3000, error: 4500, info: 3500, epic: 5000 };

/**
 * NotificationCenter — singleton de toasts.
 *
 * API:
 *   NotificationCenter.notify(text, type = 'info', durationMs?)
 *       type: 'success' | 'error' | 'info' | 'epic'
 *   NotificationCenter.notifyAchievement(title, desc, durationMs = 6000)
 */
export class NotificationCenter {
    static maxVisible = 3;
    static _container = null;
    static _queue = [];
    static _active = 0;

    static _getContainer() {
        if (!this._container) {
            injectNotifStyles();
            this._container = document.createElement('div');
            this._container.className = 'notif-container';
            document.body.appendChild(this._container);
        }
        return this._container;
    }

    static notify(text, type = 'info', durationMs) {
        if (!ICONS[type]) type = 'info';
        this._enqueue({ kind: 'toast', text, type, duration: durationMs || DEFAULT_DURATIONS[type] });
    }

    static notifyAchievement(title, desc, durationMs = 6000) {
        this._enqueue({ kind: 'achievement', title, desc, duration: durationMs });
    }

    static clearAll() {
        this._queue.length = 0;
        const c = this._getContainer();
        c.innerHTML = '';
        this._active = 0;
    }

    static _enqueue(item) {
        this._queue.push(item);
        this._pump();
    }

    static _pump() {
        while (this._active < this.maxVisible && this._queue.length) {
            const item = this._queue.shift();
            this._show(item);
        }
    }

    static _show(item) {
        this._active++;
        const c = this._getContainer();
        const el = document.createElement('div');

        if (item.kind === 'achievement') {
            el.className = 'notif notif-achievement';
            const crown = document.createElement('div');
            crown.className = 'notif-crown';
            crown.textContent = '🏆';
            const title = document.createElement('div');
            title.className = 'notif-title';
            title.textContent = item.title;
            const desc = document.createElement('div');
            desc.className = 'notif-desc';
            desc.textContent = item.desc;
            el.appendChild(crown);
            el.appendChild(title);
            el.appendChild(desc);
        } else {
            el.className = `notif notif-${item.type}`;
            const icon = document.createElement('span');
            icon.className = 'notif-icon';
            icon.textContent = ICONS[item.type];
            const text = document.createElement('span');
            text.className = 'notif-text';
            text.textContent = item.text;
            el.appendChild(icon);
            el.appendChild(text);
        }

        c.appendChild(el);
        void el.offsetWidth; // força reflow p/ animação de entrada
        el.classList.add('notif-in');

        setTimeout(() => {
            el.classList.remove('notif-in');
            el.classList.add('notif-out');
            setTimeout(() => {
                el.remove();
                this._active--;
                this._pump();
            }, 300);
        }, item.duration);
    }
}
