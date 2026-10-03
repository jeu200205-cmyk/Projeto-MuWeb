// ui2/MUWindow.js — base compartilhada para janelas avançadas (ui2)
// Estilo MU: fundo escuro translúcido, borda dourada sutil, header arrastável,
// botão X e tecla de atalho para toggle.

import { RemoteAssets } from '../data/RemoteAssets.js';

let stylesInjected = false;

// Textura de frame real do cliente (Interface/frame.OZT no manifest).
// Carregada uma única vez; se falhar, as janelas mantêm a borda dourada.
let frameTexturePromise = null;
function getFrameTextureURL() {
    if (!frameTexturePromise) {
        frameTexturePromise = (async () => {
            try {
                if (!RemoteAssets.baseUrl || RemoteAssets.offline) return null;
                return await RemoteAssets.fetchImageURL('Interface/frame.OZT');
            } catch (e) {
                return null;
            }
        })();
    }
    return frameTexturePromise;
}

export function injectMUStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const css = `
.mu-window {
    position: fixed;
    background: rgba(10, 10, 18, 0.88);
    border: 1px solid #8a6d2f;
    box-shadow: 0 0 12px rgba(0,0,0,0.8), inset 0 0 24px rgba(138,109,47,0.12);
    border-radius: 4px;
    color: #e8dcc0;
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 12px;
    z-index: 500;
    user-select: none;
}
.mu-header {
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    background: linear-gradient(180deg, #2a2418 0%, #17130c 100%);
    border-bottom: 1px solid #8a6d2f;
    cursor: move;
    border-radius: 4px 4px 0 0;
}
.mu-title { font-weight: bold; color: #f0d98c; letter-spacing: 1px; text-transform: uppercase; font-size: 11px; }
.mu-close {
    width: 16px; height: 16px; line-height: 14px; text-align: center;
    color: #f0d98c; border: 1px solid #8a6d2f; border-radius: 2px;
    cursor: pointer; font-size: 11px; background: #241d10;
}
.mu-close:hover { background: #6e1a1a; color: #fff; }
.mu-body { padding: 8px; }
.mu-btn {
    display: inline-block; padding: 4px 10px; cursor: pointer; text-align: center;
    background: linear-gradient(180deg, #3a2f1a 0%, #1c150a 100%);
    border: 1px solid #8a6d2f; border-radius: 3px; color: #f0d98c; font-size: 11px;
    margin: 2px;
}
.mu-btn:hover { background: linear-gradient(180deg, #54401e 0%, #2a200e 100%); }
.mu-btn:active { transform: scale(0.96); }
.mu-btn.disabled { opacity: 0.4; cursor: not-allowed; }
.mu-scrollbar::-webkit-scrollbar { width: 8px; }
.mu-scrollbar::-webkit-scrollbar-thumb { background: #8a6d2f; border-radius: 4px; }
.mu-scrollbar::-webkit-scrollbar-track { background: #14100a; }
`;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
}

let zCounter = 500;

export class MUWindow {
    /**
     * @param {object} opts
     * @param {string} opts.title
     * @param {number} opts.width
     * @param {number} [opts.height]   - se omitido, altura automática
     * @param {number} [opts.x]
     * @param {number} [opts.y]
     * @param {string} [opts.hotkey]   - tecla para toggle (ex.: 'i', 'c')
     * @param {boolean} [opts.visible] - inicia visível (default false)
     * @param {boolean} [opts.closable] (default true)
     */
    constructor(opts = {}) {
        injectMUStyles();
        this.title = opts.title || 'Window';
        this.width = opts.width || 300;
        this.height = opts.height || null;
        this.x = opts.x !== undefined ? opts.x : 100;
        this.y = opts.y !== undefined ? opts.y : 100;
        this.hotkey = opts.hotkey || null;
        this.visible = opts.visible === true;
        this.closable = opts.closable !== false;
        this.onClose = opts.onClose || null;
        this.onVisibilityChange = typeof opts.onVisibilityChange === 'function' ? opts.onVisibilityChange : null;
        this.parent = opts.parent || document.body;
        this.draggable = opts.draggable !== false;
        this.useRealFrameTexture = opts.useRealFrameTexture !== false;

        this.element = document.createElement('div');
        this.element.className = 'mu-window';
        // Windows mounted on the 800x600 virtual board use logical absolute
        // coordinates. Body-mounted windows preserve the legacy fixed layout.
        this.element.style.position = this.parent === document.body ? 'fixed' : 'absolute';
        this.element.style.pointerEvents = 'auto';
        this.element.style.width = `${this.width}px`;
        if (this.height) this.element.style.height = `${this.height}px`;

        this.header = document.createElement('div');
        this.header.className = 'mu-header';
        this.titleSpan = document.createElement('span');
        this.titleSpan.className = 'mu-title';
        this.titleSpan.textContent = this.title;
        this.header.appendChild(this.titleSpan);
        if (this.closable) {
            this.closeBtn = document.createElement('div');
            this.closeBtn.className = 'mu-close';
            this.closeBtn.textContent = '✕';
            this.closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hide();
            });
            this.header.appendChild(this.closeBtn);
        }
        this.element.appendChild(this.header);

        this.body = document.createElement('div');
        this.body.className = 'mu-body';
        this.element.appendChild(this.body);

        this.element.style.left = `${this.x}px`;
        this.element.style.top = `${this.y}px`;
        this.element.style.display = this.visible ? 'block' : 'none';
        this.parent.appendChild(this.element);

        this._frontHandler = () => this.bringToFront();
        this.element.addEventListener('mousedown', this._frontHandler);
        if (this.useRealFrameTexture) this._applyRealFrameTexture();
        if (this.draggable) this._bindDrag();
        if (this.hotkey) {
            this._keyHandler = (e) => {
                if (e.repeat) return;
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
                if (e.key.toLowerCase() === this.hotkey.toLowerCase()) this.toggle();
            };
            window.addEventListener('keydown', this._keyHandler);
        }
    }

    _pointerInParent(e) {
        // R43: e.clientX/Y live in physical CSS pixels while board-mounted NewUI
        // windows live in the logical 800x600 coordinate space. Convert through
        // the actual parent rect so drag direction/distance remains exact at any
        // virtual-board scale, letterbox or browser zoom.
        if (this.parent === document.body) return { x: e.clientX, y: e.clientY };
        const rect = this.parent?.getBoundingClientRect?.();
        if (!rect || !(rect.width > 0) || !(rect.height > 0)) return { x: e.clientX, y: e.clientY };
        const logicalW = this.parent.clientWidth || parseFloat(this.parent.style.width) || 800;
        const logicalH = this.parent.clientHeight || parseFloat(this.parent.style.height) || 600;
        return {
            x: (e.clientX - rect.left) * logicalW / rect.width,
            y: (e.clientY - rect.top) * logicalH / rect.height,
        };
    }

    _bindDrag() {
        let dragging = false, offX = 0, offY = 0;
        this._dragDownHandler = (e) => {
            if (e.target === this.closeBtn) return;
            const pt = this._pointerInParent(e);
            dragging = true;
            offX = pt.x - this.x;
            offY = pt.y - this.y;
            e.preventDefault();
        };
        this._dragMoveHandler = (e) => {
            if (!dragging) return;
            const pt = this._pointerInParent(e);
            this.setPosition(pt.x - offX, pt.y - offY);
        };
        this._dragUpHandler = () => { dragging = false; };
        this.header.addEventListener('mousedown', this._dragDownHandler);
        window.addEventListener('mousemove', this._dragMoveHandler);
        window.addEventListener('mouseup', this._dragUpHandler);
    }

    // Se a textura de frame do cliente estiver disponível, usa-a como borda
    // da janela (border-image + acabamento no header). Caso contrário, mantém
    // intacta a borda dourada definida em .mu-window.
    async _applyRealFrameTexture() {
        const url = await getFrameTextureURL();
        if (!url || !this.element) return;

        this.element.style.border = '4px solid transparent';
        this.element.style.borderImage = `url("${url}") 12 / 4px / 0 stretch`;
        this.element.style.borderRadius = '0';

        this.header.style.backgroundImage =
            `linear-gradient(rgba(20,16,8,0.55), rgba(20,16,8,0.85)), url("${url}")`;
        this.header.style.backgroundSize = 'auto 100%';
        this.header.style.backgroundRepeat = 'repeat-x';
    }

    bringToFront() {
        this.element.style.zIndex = String(++zCounter);
    }

    _logicalParentSize() {
        if (this.parent === document.body) {
            return { width: window.innerWidth || this.width, height: window.innerHeight || (this.height || 0) };
        }
        const baseWidth = this.parent?.clientWidth || parseFloat(this.parent?.style?.width) || 800;
        const baseHeight = this.parent?.clientHeight || parseFloat(this.parent?.style?.height) || 600;
        // Widescreen.cpp positions CNewUI windows from the physical render edge.
        // The retained NewUI board is only 800x600 and intentionally overflows on
        // 16:9.  Clamping against clientWidth=800 therefore forced x1/x2 back to
        // 610 and made Character/Inventory overlap near the centre.  Convert the
        // *visible* CSS viewport back into logical board coordinates instead.
        if (this.parent?.dataset?.muVirtualBoard) {
            const rect = this.parent.getBoundingClientRect?.();
            const scale = Number(this.parent.dataset.muScale)
                || (rect?.height ? rect.height / baseHeight : 1) || 1;
            const vv = window.visualViewport;
            const visibleLeft = Number(vv?.offsetLeft) || 0;
            const visibleTop = Number(vv?.offsetTop) || 0;
            const visibleRight = visibleLeft + (Number(vv?.width) || window.innerWidth || rect?.right || 0);
            const visibleBottom = visibleTop + (Number(vv?.height) || window.innerHeight || rect?.bottom || 0);
            if (rect && scale > 0) {
                return {
                    width: Math.max(baseWidth, (visibleRight - rect.left) / scale),
                    height: Math.max(baseHeight, (visibleBottom - rect.top) / scale),
                };
            }
        }
        return { width: baseWidth, height: baseHeight };
    }

    _clampPosition(x, y) {
        const bounds = this._logicalParentSize();
        const elementW = this.element?.offsetWidth || this.width || 0;
        const elementH = this.element?.offsetHeight || this.height || 0;
        return {
            x: Math.max(0, Math.min(Number(x) || 0, Math.max(0, bounds.width - elementW))),
            y: Math.max(0, Math.min(Number(y) || 0, Math.max(0, bounds.height - elementH))),
        };
    }

    setPosition(x, y) {
        const p = this._clampPosition(x, y);
        this.x = p.x;
        this.y = p.y;
        this.element.style.left = `${this.x}px`;
        this.element.style.top = `${this.y}px`;
    }

    /** QuickHotkeys may become the single keyboard owner for I/C/B/M. */
    adoptExternalHotkeyOwner() {
        if (!this._keyHandler) return false;
        window.removeEventListener('keydown', this._keyHandler);
        this._keyHandler = null;
        return true;
    }

    show() {
        this.visible = true;
        this.element.style.display = 'block';
        // Re-clamp after display so offsetHeight is real, including auto-height windows.
        this.setPosition(this.x, this.y);
        this.bringToFront();
        try { this.onVisibilityChange?.(true, this); } catch (_) { /* layout owner fail-closed */ }
    }

    hide() {
        this.visible = false;
        this.element.style.display = 'none';
        try { this.onVisibilityChange?.(false, this); } catch (_) { /* layout owner fail-closed */ }
        if (this.onClose) this.onClose();
    }

    toggle() {
        if (this.visible) this.hide(); else this.show();
    }

    setTitle(t) {
        this.titleSpan.textContent = t;
    }

    destroy() {
        if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
        if (this._dragDownHandler) this.header?.removeEventListener('mousedown', this._dragDownHandler);
        if (this._dragMoveHandler) window.removeEventListener('mousemove', this._dragMoveHandler);
        if (this._dragUpHandler) window.removeEventListener('mouseup', this._dragUpHandler);
        if (this._frontHandler) this.element?.removeEventListener('mousedown', this._frontHandler);
        if (this.element?.parentNode) this.element.parentNode.removeChild(this.element);
        this._dragDownHandler = this._dragMoveHandler = this._dragUpHandler = this._frontHandler = null;
    }
}
