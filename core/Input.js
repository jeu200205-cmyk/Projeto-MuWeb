/**
 * Input.js - Port de Input.cpp
 * Sistema singleton de entrada de teclado e mouse
 */
class InputSystem {
    constructor() {
        this._mouseX = 0;
        this._mouseY = 0;
        this._prevMouseX = 0;
        this._prevMouseY = 0;
        this._wheel = 0;

        // Estados dos botões do mouse
        this._lBtnDown = false;
        this._lBtnDn = false;   // Pressionado neste frame
        this._lBtnUp = false;   // Solto neste frame
        this._lBtnDbl = false;  // Duplo clique

        this._rBtnDown = false;
        this._rBtnDn = false;
        this._rBtnUp = false;

        this._mBtnDown = false;

        // Teclado
        this._keys = new Map();       // Estado atual
        this._keysPressed = new Map(); // Pressionado neste frame
        this._keysReleased = new Map();// Solto neste frame

        // Buffer de digitação
        this._charBuffer = '';

        this._initialized = false;
    }

    init(target = window) {
        if (this._initialized) return;
        this._initialized = true;

        // Mouse
        target.addEventListener('mousemove', (e) => {
            this._mouseX = e.clientX;
            this._mouseY = e.clientY;
        });

        target.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this._lBtnDown = true;
                this._lBtnDn = true;
            } else if (e.button === 2) {
                this._rBtnDown = true;
                this._rBtnDn = true;
            } else if (e.button === 1) {
                this._mBtnDown = true;
            }
        });

        target.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this._lBtnDown = false;
                this._lBtnUp = true;
            } else if (e.button === 2) {
                this._rBtnDown = false;
                this._rBtnUp = true;
            } else if (e.button === 1) {
                this._mBtnDown = false;
            }
        });

        target.addEventListener('dblclick', (e) => {
            if (e.button === 0) this._lBtnDbl = true;
        });

        target.addEventListener('wheel', (e) => {
            this._wheel += e.deltaY > 0 ? -1 : 1;
        }, { passive: true });

        target.addEventListener('contextmenu', (e) => e.preventDefault());

        // Teclado
        window.addEventListener('keydown', (e) => {
            // F10/F11 are production Camera3D keys in the PC client. Prevent
            // browser fullscreen/menu defaults from stealing them. F12 is NOT
            // claimed here: the PC owner uses it for tray mode and Web keeps it
            // free until that owner is ported.
            if (e.code === 'F10' || e.code === 'F11') e.preventDefault();
            if (!this._keys.get(e.code)) {
                this._keysPressed.set(e.code, true);
            }
            this._keys.set(e.code, true);
        });

        window.addEventListener('keyup', (e) => {
            this._keys.set(e.code, false);
            this._keysReleased.set(e.code, true);
        });

        window.addEventListener('keypress', (e) => {
            this._charBuffer += e.key;
        });
    }

    // ========== Mouse ==========
    get mouseX() { return this._mouseX; }
    get mouseY() { return this._mouseY; }
    get cursorPos() { return { x: this._mouseX, y: this._mouseY }; }
    get wheel() { return this._wheel; }

    isLBtnDown() { return this._lBtnDown; }
    isLBtnDn() { return this._lBtnDn; }
    isLBtnUp() { return this._lBtnUp; }
    isLBtnDblClk() { return this._lBtnDbl; }

    isRBtnDown() { return this._rBtnDown; }
    isRBtnDn() { return this._rBtnDn; }
    isRBtnUp() { return this._rBtnUp; }

    isMBtnDown() { return this._mBtnDown; }

    getMouseDeltaX() { return this._mouseX - this._prevMouseX; }
    getMouseDeltaY() { return this._mouseY - this._prevMouseY; }

    // ========== Teclado ==========
    isKeyDown(code) { return this._keys.get(code) === true; }
    isKeyPressed(code) { return this._keysPressed.get(code) === true; }
    isKeyReleased(code) { return this._keysReleased.get(code) === true; }

    isCtrlPressed() { return this.isKeyDown('ControlLeft') || this.isKeyDown('ControlRight'); }
    isShiftPressed() { return this.isKeyDown('ShiftLeft') || this.isKeyDown('ShiftRight'); }
    isAltPressed() { return this.isKeyDown('AltLeft') || this.isKeyDown('AltRight'); }

    getCharBuffer() { return this._charBuffer; }
    clearCharBuffer() { this._charBuffer = ''; }

    /**
     * Chamar no fim de cada frame para limpar estados transitórios
     */
    update() {
        this._prevMouseX = this._mouseX;
        this._prevMouseY = this._mouseY;
        this._lBtnDn = false;
        this._lBtnUp = false;
        this._lBtnDbl = false;
        this._rBtnDn = false;
        this._rBtnUp = false;
        this._wheel = 0;
        this._keysPressed.clear();
        this._keysReleased.clear();
    }
}

// Singleton - igual ao CInput::Instance() do original
export const Input = new InputSystem();
