// ui/MUWindow.js — Base window class for MU Online Season 6 UI
// Faithful recreation of original MU window system
// Features: draggable, hotkey toggle, z-index management, real frame texture support

export let zCounter = 500;
let stylesInjected = false;
let frameTexturePromise = null;
let frameTextureUrl = null;

// MU Original color palette
export const MU_COLORS = {
    bg: '#0a0a0f',
    panel: '#1a1a24',
    panelDark: '#14100a',
    gold: '#c9a227',
    goldBright: '#e8c853',
    goldDark: '#8a6d2f',
    border: '#8a6d2f',
    borderLight: '#4a3d22',
    text: '#e8dcc0',
    textBright: '#f0d98c',
    textDim: '#9a8a6a',
    red: '#c03030',
    redBright: '#e84040',
    green: '#30c030',
    greenBright: '#40e840',
    blue: '#4080ff',
    blueBright: '#60a0ff',
    excellent: '#6fe86f',
    ancient: '#ffd24b',
    socket: '#ff8800',
    zen: '#ffd24b',
    hp: '#e84040',
    mp: '#4080ff',
    sd: '#ffd24b',
    exp: '#6fe86f',
};

function injectMUStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const css = `
/* Base MU Window */
.mu-window {
    position: fixed;
    background: rgba(10, 10, 18, 0.92);
    border: 1px solid #8a6d2f;
    box-shadow: 
        0 0 20px rgba(0,0,0,0.9), 
        inset 0 0 30px rgba(138,109,47,0.08),
        inset 1px 1px 0 rgba(255,210,75,0.1);
    border-radius: 4px;
    color: #e8dcc0;
    font-family: Georgia, 'Times New Roman', Times, serif;
    font-size: 12px;
    line-height: 1.4;
    z-index: 500;
    user-select: none;
    backdrop-filter: blur(4px);
}
.mu-window * {
    font-family: inherit;
}
.mu-header {
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    background: linear-gradient(180deg, #2a2010 0%, #1a140a 100%);
    border-bottom: 1px solid #8a6d2f;
    cursor: move;
    border-radius: 3px 3px 0 0;
    position: relative;
}
.mu-header::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, #f0d98c, transparent);
    opacity: 0.3;
}
.mu-title { 
    font-weight: bold; 
    color: #f0d98c; 
    letter-spacing: 1px; 
    text-transform: uppercase; 
    font-size: 11px; 
    font-family: Georgia, serif;
    text-shadow: 1px 1px 2px #000, 0 0 8px rgba(201,162,39,0.3);
}
.mu-close {
    width: 18px; height: 18px; line-height: 16px; text-align: center;
    color: #f0d98c; border: 1px solid #8a6d2f; border-radius: 2px;
    cursor: pointer; font-size: 11px; background: #241d10;
    transition: all 0.15s ease;
    font-family: Georgia, serif;
}
.mu-close:hover { 
    background: linear-gradient(180deg, #802020 0%, #601010 100%); 
    color: #fff; 
    border-color: #ff6060;
    box-shadow: 0 0 8px rgba(255,80,80,0.4);
}
.mu-close:active { transform: scale(0.92); }
.mu-body { 
    padding: 10px; 
    background: rgba(10,10,18,0.6);
}

/* Buttons */
.mu-btn {
    display: inline-flex; 
    align-items: center; 
    justify-content: center;
    padding: 6px 14px; 
    cursor: pointer; 
    text-align: center;
    background: linear-gradient(180deg, #3a2f1a 0%, #1c150a 100%);
    border: 1px solid #8a6d2f; 
    border-radius: 3px; 
    color: #f0d98c; 
    font-size: 11px;
    font-weight: bold;
    font-family: Georgia, serif;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 2px;
    transition: all 0.1s ease;
    text-shadow: 1px 1px 2px #000;
}
.mu-btn:hover { 
    background: linear-gradient(180deg, #54401e 0%, #2a200e 100%);
    border-color: #f0d98c;
    box-shadow: 0 0 10px rgba(201,162,39,0.3), inset 0 1px 0 rgba(255,210,75,0.2);
    color: #fff;
}
.mu-btn:active { 
    transform: scale(0.96); 
    background: linear-gradient(180deg, #2a200e 0%, #1c150a 100%);
}
.mu-btn.disabled { 
    opacity: 0.4; 
    cursor: not-allowed; 
    border-color: #4a3d22;
    color: #7a6a4a;
}
.mu-btn.small { padding: 3px 8px; font-size: 10px; }
.mu-btn.large { padding: 8px 20px; font-size: 12px; }

/* Inputs */
.mu-input {
    background: rgba(0,0,0,0.75);
    border: 1px solid #4a3d22;
    border-radius: 2px;
    color: #f0d98c;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 12px;
    padding: 4px 8px;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    width: 100%;
    box-sizing: border-box;
}
.mu-input:focus {
    border-color: #c9a227;
    box-shadow: 0 0 8px rgba(201,162,39,0.3), inset 0 0 4px rgba(201,162,39,0.1);
}
.mu-input::placeholder { color: #5a4a2a; }
.mu-input:disabled { opacity: 0.5; cursor: not-allowed; }

/* Scrollbars */
.mu-scrollbar::-webkit-scrollbar { width: 10px; }
.mu-scrollbar::-webkit-scrollbar-thumb { 
    background: linear-gradient(180deg, #c9a227 0%, #8a6d2f 100%); 
    border-radius: 5px; 
    border: 1px solid #2a2010;
}
.mu-scrollbar::-webkit-scrollbar-track { background: #14100a; border-radius: 5px; }
.mu-scrollbar::-webkit-scrollbar-corner { background: #14100a; }

/* Tooltip */
.mu-tooltip {
    position: fixed; 
    pointer-events: none; 
    z-index: 10000; 
    display: none;
    background: rgba(12,10,6,0.98); 
    border: 1px solid #8a6d2f; 
    border-radius: 4px;
    padding: 8px 10px; 
    color: #e8dcc0; 
    font-size: 11px; 
    max-width: 260px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.9), 0 0 0 1px rgba(201,162,39,0.1);
    line-height: 1.6;
    backdrop-filter: blur(2px);
}
.mu-tooltip .tooltip-name { color: #9ecbff; font-weight: bold; font-size: 13px; margin-bottom: 4px; }
.mu-tooltip .tooltip-name.excellent { color: #6fe86f; }
.mu-tooltip .tooltip-name.ancient { color: #ffd24b; }
.mu-tooltip .tooltip-stat { color: #c8c8ff; margin: 2px 0; }
.mu-tooltip .tooltip-excellent { color: #6fe86f; margin-top: 6px; }
.mu-tooltip .tooltip-price { color: #ffd24b; margin-top: 6px; font-weight: bold; }
.mu-tooltip .tooltip-desc { color: #aaa; margin-top: 8px; font-style: italic; font-size: 10px; }

/* Slot */
.mu-slot {
    width: 38px; height: 38px; box-sizing: border-box;
    background: rgba(40,34,22,0.6); 
    border: 1px solid #4a3d22;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; cursor: pointer; position: relative; overflow: hidden;
    transition: border-color 0.1s, box-shadow 0.1s;
}
.mu-slot:hover { border-color: #f0d98c; box-shadow: inset 0 0 8px rgba(201,162,39,0.2); }
.mu-slot.drag-over { border-color: #6fe86f; box-shadow: inset 0 0 12px rgba(111,232,111,0.3); }
.mu-slot.has-item { border-color: #8a6d2f; }
.mu-slot.equip { background: rgba(30,24,14,0.8); }
.mu-slot.equip.empty { border-style: dashed; border-color: #4a3d22; opacity: 0.6; }

/* Drag Ghost */
.mu-drag-ghost {
    position: fixed; pointer-events: none; z-index: 9999; display: none;
    font-size: 28px; opacity: 0.9; transform: translate(-50%,-50%);
    text-shadow: 0 0 8px #000, 0 0 16px #000;
    pointer-events: none;
}

/* Grid */
.mu-grid {
    display: grid;
    gap: 1px;
    background: #0c0a06;
    border: 1px solid #8a6d2f;
    border-radius: 3px;
}

/* Tab */
.mu-tabs { display: flex; gap: 1px; margin-bottom: 8px; border-bottom: 1px solid #8a6d2f; }
.mu-tab {
    padding: 6px 16px; cursor: pointer;
    background: linear-gradient(180deg, #2a2010 0%, #1a140a 100%);
    border: 1px solid #8a6d2f; border-bottom: none;
    border-radius: 3px 3px 0 0;
    color: #9a8a6a; font-size: 11px; font-weight: bold;
    font-family: Georgia, serif; text-transform: uppercase; letter-spacing: 0.5px;
    transition: all 0.1s;
}
.mu-tab:hover { color: #f0d98c; background: linear-gradient(180deg, #3a2f1a 0%, #1c150a 100%); }
.mu-tab.active { 
    color: #f0d98c; 
    background: linear-gradient(180deg, #1c150a 0%, #0f0a05 100%);
    border-color: #c9a227;
    box-shadow: inset 0 -2px 0 #c9a227;
}

/* Panel */
.mu-panel {
    background: rgba(20,16,10,0.8);
    border: 1px solid #4a3d22;
    border-radius: 3px;
    padding: 8px;
    margin: 4px 0;
}

/* Checkbox */
.mu-checkbox { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; color: #e8dcc0; }
.mu-checkbox input { width: 14px; height: 14px; accent-color: #c9a227; cursor: pointer; }

/* Select */
.mu-select {
    background: rgba(0,0,0,0.75);
    border: 1px solid #4a3d22;
    border-radius: 2px;
    color: #f0d98c;
    font-family: Georgia, serif;
    font-size: 11px;
    padding: 4px 8px;
    outline: none;
    cursor: pointer;
}
.mu-select:focus { border-color: #c9a227; }

/* Slider */
.mu-slider { width: 100%; accent-color: #c9a227; cursor: pointer; }

/* Separator */
.mu-separator { height: 1px; background: linear-gradient(90deg, transparent, #8a6d2f, transparent); margin: 8px 0; }

/* Animation */
@keyframes mu-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
}
@keyframes mu-glow {
    0%, 100% { box-shadow: 0 0 8px rgba(201,162,39,0.3); }
    50% { box-shadow: 0 0 20px rgba(201,162,39,0.6), 0 0 30px rgba(201,162,39,0.4); }
}
@keyframes mu-shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
}
.mu-pulse { animation: mu-pulse 2s ease-in-out infinite; }
.mu-glow { animation: mu-glow 1.5s ease-in-out infinite; }
.mu-shake { animation: mu-shake 0.4s ease-in-out; }

/* Fade */
.mu-fade-in { animation: mu-fade-in 0.2s ease-out; }
@keyframes mu-fade-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.mu-fade-out { animation: mu-fade-out 0.15s ease-in forwards; }
@keyframes mu-fade-out { from { opacity: 1; } to { opacity: 0; transform: translateY(-4px); } }

/* Scrollbar for firefox */
.mu-scrollbar { scrollbar-width: thin; scrollbar-color: #8a6d2f #14100a; }
`;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
}

async function loadFrameTexture() {
    if (frameTexturePromise) return frameTexturePromise;
    frameTexturePromise = (async () => {
        try {
            // Try to load the original frame texture
            const response = await fetch('/assets/textures/Interface/frame.png');
            if (response.ok) {
                const blob = await response.blob();
                frameTextureUrl = URL.createObjectURL(blob);
                return frameTextureUrl;
            }
        } catch (e) {
            console.debug('Frame texture not available, using CSS borders');
        }
        return null;
    })();
    return frameTexturePromise;
}

export class MUWindow extends EventTarget {
    /**
     * @param {object} opts
     * @param {string} opts.title - Window title
     * @param {number} opts.width - Window width
     * @param {number} [opts.height] - Window height (auto if omitted)
     * @param {number} [opts.x] - Initial X position
     * @param {number} [opts.y] - Initial Y position
     * @param {string} [opts.hotkey] - Hotkey to toggle window (e.g., 'i', 'c')
     * @param {boolean} [opts.visible=false] - Start visible
     * @param {boolean} [opts.closable=true] - Show close button
     * @param {boolean} [opts.resizable=false] - Allow resize
     * @param {boolean} [opts.modal=false] - Modal window (blocks background)
     * @param {Function} [opts.onClose] - Called when window closes
     */
    constructor(opts = {}) {
        super();
        injectMUStyles();
        
        this.title = opts.title || 'Window';
        this.width = opts.width || 300;
        this.height = opts.height || null;
        this.x = opts.x !== undefined ? opts.x : 100;
        this.y = opts.y !== undefined ? opts.y : 100;
        this.hotkey = opts.hotkey || null;
        this.visible = opts.visible === true;
        this.closable = opts.closable !== false;
        this.resizable = opts.resizable === true;
        this.modal = opts.modal === true;
        this.onCloseCallback = opts.onClose || null;
        
        this.minWidth = opts.minWidth || 200;
        this.minHeight = opts.minHeight || 150;
        this.maxWidth = opts.maxWidth || window.innerWidth * 0.9;
        this.maxHeight = opts.maxHeight || window.innerHeight * 0.9;
        
        this._dragging = false;
        this._dragOffset = { x: 0, y: 0 };
        this._resizing = false;
        this._resizeHandle = null;
        this._keyHandler = null;
        this._modalOverlay = null;
        
        this._createElements();
        this._bindEvents();
        this._applyFrameTexture();
        
        if (this.hotkey) this._registerHotkey();
        if (this.modal) this._createModalOverlay();
    }
    
    _createElements() {
        this.element = document.createElement('div');
        this.element.className = 'mu-window';
        this.element.style.width = `${this.width}px`;
        if (this.height) this.element.style.height = `${this.height}px`;
        this.element.style.left = `${this.x}px`;
        this.element.style.top = `${this.y}px`;
        this.element.style.display = this.visible ? 'block' : 'none';
        
        // Header
        this.header = document.createElement('div');
        this.header.className = 'mu-header';
        
        this.titleSpan = document.createElement('span');
        this.titleSpan.className = 'mu-title';
        this.titleSpan.textContent = this.title;
        this.header.appendChild(this.titleSpan);
        
        if (this.closable) {
            this.closeBtn = document.createElement('div');
            this.closeBtn.className = 'mu-close';
            this.closeBtn.innerHTML = '&#10006;'; // ✕
            this.closeBtn.title = 'Close (Esc)';
            this.closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hide();
            });
            this.header.appendChild(this.closeBtn);
        }
        this.element.appendChild(this.header);
        
        // Body
        this.body = document.createElement('div');
        this.body.className = 'mu-body';
        this.element.appendChild(this.body);
        
        // Resize handle
        if (this.resizable) {
            this._resizeHandle = document.createElement('div');
            this._resizeHandle.style.cssText = `
                position: absolute; right: 0; bottom: 0; width: 16px; height: 16px;
                cursor: se-resize; opacity: 0.4;
                background: linear-gradient(-45deg, transparent 50%, #8a6d2f 50%);
                border-radius: 0 0 3px 0;
            `;
            this.element.appendChild(this._resizeHandle);
        }
        
        document.body.appendChild(this.element);
    }
    
    _bindEvents() {
        // Drag
        this.header.addEventListener('mousedown', (e) => {
            if (e.target === this.closeBtn || e.target === this._resizeHandle) return;
            if (e.button !== 0) return;
            this._dragging = true;
            this._dragOffset.x = e.clientX - this.x;
            this._dragOffset.y = e.clientY - this.y;
            this.bringToFront();
            e.preventDefault();
        });
        
        window.addEventListener('mousemove', (e) => {
            if (this._dragging) {
                this.setPosition(e.clientX - this._dragOffset.x, e.clientY - this._dragOffset.y);
            } else if (this._resizing) {
                this._doResize(e);
            }
        });
        
        window.addEventListener('mouseup', () => {
            this._dragging = false;
            this._resizing = false;
        });
        
        // Resize
        if (this._resizeHandle) {
            this._resizeHandle.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                this._resizing = true;
                this._resizeStart = { x: e.clientX, y: e.clientY, w: this.width, h: this.height };
                e.preventDefault();
                e.stopPropagation();
            });
        }
        
        // Click to front
        this.element.addEventListener('mousedown', () => this.bringToFront());
        
        // Prevent context menu on header
        this.header.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    
    _doResize(e) {
        if (!this._resizeStart) return;
        const newW = Math.max(this.minWidth, Math.min(this.maxWidth, this._resizeStart.w + (e.clientX - this._resizeStart.x)));
        const newH = Math.max(this.minHeight, Math.min(this.maxHeight, this._resizeStart.h + (e.clientY - this._resizeStart.y)));
        this.width = newW;
        this.height = newH;
        this.element.style.width = `${this.width}px`;
        this.element.style.height = `${this.height}px`;
        this.dispatchEvent(new CustomEvent('resize', { detail: { width: this.width, height: this.height } }));
    }
    
    async _applyFrameTexture() {
        const url = await loadFrameTexture();
        if (!url || !this.element) return;
        
        this.element.style.border = '4px solid transparent';
        this.element.style.borderImage = `url("${url}") 12 / 4px / 0 stretch`;
        this.element.style.borderRadius = '0';
        
        this.header.style.backgroundImage = `linear-gradient(rgba(20,16,8,0.55), rgba(20,16,8,0.85)), url("${url}")`;
        this.header.style.backgroundSize = 'auto 100%';
        this.header.style.backgroundRepeat = 'repeat-x';
        this.header.style.borderBottom = 'none';
    }
    
    _createModalOverlay() {
        this._modalOverlay = document.createElement('div');
        this._modalOverlay.style.cssText = `
            position: fixed; inset: 0; z-index: 499;
            background: rgba(0,0,0,0.6); backdrop-filter: blur(2px);
            display: none;
        `;
        document.body.appendChild(this._modalOverlay);
    }
    
    _registerHotkey() {
        this._keyHandler = (e) => {
            if (e.repeat) return;
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
            if (e.key.toLowerCase() === this.hotkey.toLowerCase()) {
                e.preventDefault();
                this.toggle();
            }
        };
        window.addEventListener('keydown', this._keyHandler);
    }
    
    bringToFront() {
        this.element.style.zIndex = String(++zCounter);
        if (this._modalOverlay) this._modalOverlay.style.zIndex = String(zCounter - 1);
        this.dispatchEvent(new CustomEvent('focus'));
    }
    
    setPosition(x, y) {
        // Keep window on screen
        const maxX = window.innerWidth - this.width - 10;
        const maxY = window.innerHeight - (this.height || 150) - 10;
        this.x = Math.max(10, Math.min(maxX, x));
        this.y = Math.max(10, Math.min(maxY, y));
        this.element.style.left = `${this.x}px`;
        this.element.style.top = `${this.y}px`;
    }
    
    setSize(width, height) {
        this.width = Math.max(this.minWidth, Math.min(this.maxWidth, width));
        this.height = Math.max(this.minHeight, Math.min(this.maxHeight, height));
        this.element.style.width = `${this.width}px`;
        this.element.style.height = `${this.height}px`;
    }
    
    center() {
        this.setPosition(
            (window.innerWidth - this.width) / 2,
            (window.innerHeight - (this.height || 300)) / 2
        );
    }
    
    show() {
        if (this.visible) return;
        this.visible = true;
        this.element.style.display = 'block';
        this.element.classList.add('mu-fade-in');
        setTimeout(() => this.element.classList.remove('mu-fade-in'), 200);
        this.bringToFront();
        if (this._modalOverlay) this._modalOverlay.style.display = 'block';
        this.dispatchEvent(new CustomEvent('show'));
    }
    
    hide() {
        if (!this.visible) return;
        this.visible = false;
        this.element.classList.add('mu-fade-out');
        setTimeout(() => {
            this.element.style.display = 'none';
            this.element.classList.remove('mu-fade-out');
        }, 150);
        if (this._modalOverlay) this._modalOverlay.style.display = 'none';
        this.dispatchEvent(new CustomEvent('hide'));
        if (this.onCloseCallback) this.onCloseCallback();
    }
    
    toggle() {
        if (this.visible) this.hide(); else this.show();
    }
    
    setTitle(title) {
        this.title = title;
        this.titleSpan.textContent = title;
    }
    
    setContent(htmlOrElement) {
        this.body.innerHTML = '';
        if (typeof htmlOrElement === 'string') {
            this.body.innerHTML = htmlOrElement;
        } else if (htmlOrElement instanceof Node) {
            this.body.appendChild(htmlOrElement);
        }
    }
    
    appendContent(element) {
        this.body.appendChild(element);
    }
    
    destroy() {
        if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
        if (this._modalOverlay && this._modalOverlay.parentNode) {
            this._modalOverlay.parentNode.removeChild(this._modalOverlay);
        }
        if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
        this.dispatchEvent(new CustomEvent('destroy'));
    }
}

// Utility functions for creating common UI elements
export function createMUButton(text, onClick, opts = {}) {
    const btn = document.createElement('button');
    btn.className = 'mu-btn' + (opts.className ? ' ' + opts.className : '');
    btn.textContent = text;
    if (opts.disabled) btn.classList.add('disabled');
    btn.addEventListener('click', (e) => {
        if (!btn.classList.contains('disabled')) onClick(e);
    });
    return btn;
}

export function createMUInput(placeholder, value, onChange) {
    const input = document.createElement('input');
    input.className = 'mu-input';
    input.type = 'text';
    input.placeholder = placeholder || '';
    input.value = value || '';
    input.addEventListener('input', (e) => onChange(e.target.value));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.stopPropagation(); });
    return input;
}

export function createMUPasswordInput(placeholder, onChange) {
    const input = document.createElement('input');
    input.className = 'mu-input';
    input.type = 'password';
    input.placeholder = placeholder || '';
    input.addEventListener('input', (e) => onChange(e.target.value));
    return input;
}

export function createMUSelect(options, value, onChange) {
    const select = document.createElement('select');
    select.className = 'mu-select';
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
    });
    select.value = value;
    select.addEventListener('change', (e) => onChange(e.target.value));
    return select;
}

export function createMUCheckbox(label, checked, onChange) {
    const wrapper = document.createElement('label');
    wrapper.className = 'mu-checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', (e) => onChange(e.target.checked));
    wrapper.appendChild(input);
    wrapper.appendChild(document.createTextNode(label));
    return wrapper;
}

export function createMUSlider(min, max, value, onChange, step = 1) {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'mu-slider';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = value;
    slider.addEventListener('input', (e) => onChange(parseInt(e.target.value, 10)));
    return slider;
}

export function createMUTab(labels, activeIndex, onChange) {
    const container = document.createElement('div');
    container.className = 'mu-tabs';
    const tabs = labels.map((label, i) => {
        const tab = document.createElement('div');
        tab.className = 'mu-tab' + (i === activeIndex ? ' active' : '');
        tab.textContent = label;
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            onChange(i);
        });
        container.appendChild(tab);
        return tab;
    });
    return { container, tabs, setActive: (i) => { tabs.forEach((t, j) => t.classList.toggle('active', j === i)); } };
}

export function createMUSeparator() {
    const sep = document.createElement('div');
    sep.className = 'mu-separator';
    return sep;
}

export function createMUPanel() {
    const panel = document.createElement('div');
    panel.className = 'mu-panel';
    return panel;
}