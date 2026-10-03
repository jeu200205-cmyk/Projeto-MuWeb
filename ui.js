// UI System ported from Win.cpp, Button.h, etc.
// Simplified web version using HTML/CSS for UI elements

// CSS class for UI elements (added to index.html style)
// This creates the UI overlay for windows/buttons
/*
.ui-window {
    position: absolute;
    background: rgba(0, 0, 0, 0.7);
    border: 1px solid #333;
    border-radius: 4px;
    overflow: hidden;
    z-index: 100;
}
.ui-window-header {
    background: #1a1a24;
    color: #e0e0e0;
    padding: 8px 12px;
    cursor: move;
    user-select: none;
    border-bottom: 1px solid #333;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.ui-window-body {
    padding: 12px;
    color: #e0e0e0;
}
.ui-button {
    display: inline-block;
    padding: 6px 12px;
    background: #2a2a34;
    color: #e0e0e0;
    border: 1px solid #444;
    border-radius: 3px;
    cursor: pointer;
    text-align: center;
    text-decoration: none;
    font-size: 12px;
    margin: 4px;
    transition: all 0.2s;
}
.ui-button:hover {
    background: #3a3a44;
    border-color: #555;
}
.ui-button:active {
    background: #ff6b35;
    color: #0a0a0f;
}
*/

export class CButton {
    /**
     * @param {object} options - Button options
     * @param {number} options.x - X position
     * @param {number} options.y - Y position
     * @param {number} options.width - Width
     * @param {number} options.height - Height
     * @param {string} options.text - Button text
     * @param {Function} options.onClick - Click handler
     */
    constructor(options = {}) {
        this.x = options.x || 0;
        this.y = options.y || 0;
        this.width = options.width || 80;
        this.height = options.height || 24;
        this.text = options.text || 'Button';
        this.onClick = options.onClick || (() => {});
        
        this.enabled = true;
        this.visible = true;
        this.hovered = false;
        this.pressed = false;
        
        this.element = null;
        this.createElement();
    }
    
    createElement() {
        this.element = document.createElement('div');
        this.element.className = 'ui-button';
        this.element.textContent = this.text;
        this.element.style.position = 'absolute';
        this.element.style.left = `${this.x}px`;
        this.element.style.top = `${this.y}px`;
        this.element.style.width = `${this.width}px`;
        this.element.style.height = `${this.height}px`;
        this.element.style.lineHeight = `${this.height}px`;
        
        // Event listeners
        this.element.addEventListener('mouseenter', () => {
            if (this.enabled && this.visible) {
                this.hovered = true;
                this.updateStyle();
            }
        });
        
        this.element.addEventListener('mouseleave', () => {
            this.hovered = false;
            this.updateStyle();
        });
        
        this.element.addEventListener('mousedown', (e) => {
            if (this.enabled && this.visible) {
                e.preventDefault();
                this.pressed = true;
                this.updateStyle();
            }
        });
        
        this.element.addEventListener('mouseup', (e) => {
            if (this.enabled && this.visible) {
                e.preventDefault();
                this.pressed = false;
                this.updateStyle();
                if (this.hovered) {
                    this.onClick();
                }
            }
        });
        
        document.body.appendChild(this.element);
    }
    
    updateStyle() {
        if (!this.element) return;
        
        if (!this.enabled) {
            this.element.style.opacity = '0.5';
            this.element.style.cursor = 'not-allowed';
        } else if (this.pressed) {
            this.element.style.opacity = '0.8';
            this.element.style.transform = 'scale(0.95)';
        } else if (this.hovered) {
            this.element.style.opacity = '1';
            this.element.style.transform = 'scale(1.05)';
        } else {
            this.element.style.opacity = '1';
            this.element.style.transform = 'scale(1)';
        }
    }
    
    setPosition(x, y) {
        this.x = x;
        this.y = y;
        if (this.element) {
            this.element.style.left = `${x}px`;
            this.element.style.top = `${y}px`;
        }
    }
    
    setSize(width, height) {
        this.width = width;
        this.height = height;
        if (this.element) {
            this.element.style.width = `${width}px`;
            this.element.style.height = `${height}px`;
            this.element.style.lineHeight = `${height}px`;
        }
    }
    
    setEnabled(enabled) {
        this.enabled = enabled;
        this.updateStyle();
    }
    
    setVisible(visible) {
        this.visible = visible;
        if (this.element) {
            this.element.style.display = visible ? 'block' : 'none';
        }
    }
    
    setText(text) {
        this.text = text;
        if (this.element) {
            this.element.textContent = text;
        }
    }
    
    /**
     * Check if point is inside button
     * @param {number} mouseX - Mouse X position
     * @param {number} mouseY - Mouse Y position
     * @returns {boolean}
     */
    containsPoint(mouseX, mouseY) {
        if (!this.enabled || !this.visible) return false;
        return mouseX >= this.x && 
               mouseX <= this.x + this.width &&
               mouseY >= this.y && 
               mouseY <= this.y + this.height;
    }
    
    release() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}

export class CSprite {
    /**
     * @param {object} options - Sprite options
     * @param {number} options.x - X position
     * @param {number} options.y - Y position
     * @param {number} options.width - Width
     * @param {number} options.height - Height
     * @param {string} options.color - Background color (CSS)
     * @param {number} options.alpha - Opacity (0-1)
     */
    constructor(options = {}) {
        this.x = options.x || 0;
        this.y = options.y || 0;
        this.width = options.width || 100;
        this.height = options.height || 100;
        this.color = options.color || '#000000';
        this.alpha = options.alpha !== undefined ? options.alpha : 1.0;
        this.visible = true;
        this.angle = 0; // degrees
        
        this.element = null;
        this.createElement();
    }
    
    createElement() {
        this.element = document.createElement('div');
        this.element.style.position = 'absolute';
        this.element.style.left = `${this.x}px`;
        this.element.style.top = `${this.y}px`;
        this.element.style.width = `${this.width}px`;
        this.element.style.height = `${this.height}px`;
        this.element.style.backgroundColor = this.color;
        this.element.style.opacity = this.alpha;
        this.element.style.transformOrigin = 'center';
        this.element.style.borderRadius = '4px';
        this.element.style.pointerEvents = 'none'; // Let clicks pass through
        
        document.body.appendChild(this.element);
    }
    
    setPosition(x, y) {
        this.x = x;
        this.y = y;
        if (this.element) {
            this.element.style.left = `${x}px`;
            this.element.style.top = `${y}px`;
        }
    }
    
    setSize(width, height) {
        this.width = width;
        this.height = height;
        if (this.element) {
            this.element.style.width = `${width}px`;
            this.element.style.height = `${height}px`;
        }
    }
    
    setColor(color) {
        this.color = color;
        if (this.element) {
            this.element.style.backgroundColor = color;
        }
    }
    
    setAlpha(alpha) {
        this.alpha = alpha;
        if (this.element) {
            this.element.style.opacity = alpha;
        }
    }
    
    setVisible(visible) {
        this.visible = visible;
        if (this.element) {
            this.element.style.display = visible ? 'block' : 'none';
        }
    }
    
    setAngle(angle) {
        this.angle = angle;
        if (this.element) {
            this.element.style.transform = `rotate(${angle}deg)`;
        }
    }
    
    release() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}

export class CWin {
    /**
     * @param {object} options - Window options
     * @param {number} options.width - Width
     * @param {number} options.height - Height
     * @param {number} options.texID - Texture ID (-1 for semi-transparent black bg)
     * @param {boolean} options.bTile - Whether to tile background
     */
    constructor(options = {}) {
        this.width = options.width || 300;
        this.height = options.height || 200;
        this.texID = options.texID !== undefined ? options.texID : -1;
        this.bTile = options.bTile || false;
        
        this.x = 0;
        this.y = 0;
        this.visible = false;
        this.active = false;
        this.docking = false;
        this.state = 'NORMAL'; // NORMAL, MOVE
        
        this.heldPoint = { x: 0, y: 0 };
        this.tempPoint = { x: 0, y: 0 };
        
        this.backgroundSprite = null;
        this.buttons = [];
        
        this.createBackground();
    }
    
    createBackground() {
        const color = this.texID === -1 ? 'rgba(0,0,0,0.5)' : '#1a1a24';
        this.backgroundSprite = new CSprite({
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            color: color,
            alpha: this.texID === -1 ? 0.5 : 1.0
        });
        
        // Make window draggable by header
        this.backgroundSprite.element.style.cursor = 'move';
        this.backgroundSprite.element.style.userSelect = 'none';
        
        // Add header
        this.createHeader();
    }
    
    createHeader() {
        this.header = document.createElement('div');
        this.header.style.position = 'absolute';
        this.header.style.left = `${this.x}px`;
        this.header.style.top = `${this.y}px`;
        this.header.style.width = `${this.width}px`;
        this.header.style.height = '26px';
        this.header.style.backgroundColor = '#1a1a24';
        this.header.style.borderBottom = '1px solid #333';
        this.header.style.display = 'flex';
        this.header.style.alignItems = 'center';
        this.header.style.padding = '0 8px';
        this.header.style.cursor = 'move';
        this.header.style.userSelect = 'none';
        this.header.style.zIndex = '101';
        
        // Title
        this.titleSpan = document.createElement('span');
        this.titleSpan.style.color = '#e0e0e0';
        this.titleSpan.style.fontWeight = 'bold';
        this.titleSpan.textContent = 'Window';
        this.header.appendChild(this.titleSpan);
        
        // Close button
        this.closeBtn = document.createElement('div');
        this.closeBtn.style.width = '20px';
        this.header.style.height = '20px';
        this.closeBtn.style.backgroundColor = '#ff6b35';
        this.closeBtn.style.borderRadius = '3px';
        this.closeBtn.style.display = 'flex';
        this.closeBtn.style.alignItems = 'center';
        this.closeBtn.style.justifyContent = 'center';
        this.closeBtn.style.cursor = 'pointer';
        this.closeBtn.innerHTML = '✕';
        this.closeBtn.style.fontSize = '14px';
        this.closeBtn.style.marginLeft = 'auto';
        this.closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.Show(false);
        });
        this.header.appendChild(this.closeBtn);
        
        document.body.appendChild(this.header);
        
        // Make header draggable
        let isDragging = false;
        let dragStartX, dragStartY;
        
        this.header.addEventListener('mousedown', (e) => {
            if (!this.visible || !this.active) return;
            isDragging = true;
            dragStartX = e.clientX - this.x;
            dragStartY = e.clientY - this.y;
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            this.x = e.clientX - dragStartX;
            this.y = e.clientY - dragStartY;
            this.updatePosition();
            e.preventDefault();
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }
    
    updatePosition() {
        if (this.backgroundSprite) {
            this.backgroundSprite.setPosition(this.x, this.y);
        }
        if (this.header) {
            this.header.style.left = `${this.x}px`;
            this.header.style.top = `${this.y}px`;
        }
        
        // Update buttons position
        this.buttons.forEach((btn, index) => {
            // Position buttons vertically in the window
            btn.setPosition(
                this.x + 10,
                this.y + 30 + index * 30
            );
        });
    }
    
    Create(width, height, texID, bTile) {
        this.Release();
        
        this.width = width;
        this.height = height;
        this.texID = texID;
        this.bTile = bTile;
        
        if (texID > -2) { // -1 and above are valid
            this.backgroundSprite = new CSprite({
                x: this.x,
                y: this.y,
                width: width,
                height: height,
                color: texID === -1 ? 'rgba(0,0,0,0.5)' : '#1a1a24',
                alpha: texID === -1 ? 0.5 : 1.0
            });
            
            if (texID === -1) {
                this.backgroundSprite.setColor('rgba(0,0,0,0.5)');
                // Black background with 50% opacity
            }
        }
        
        this.updatePosition();
        this.Show(false); // Start hidden
    }
    
    Release() {
        this.PreRelease();
        
        // Release all buttons
        this.buttons.forEach(btn => {
            btn.release();
        });
        this.buttons = [];
        
        // Release background
        if (this.backgroundSprite) {
            this.backgroundSprite.release();
            this.backgroundSprite = null;
        }
        
        // Release header
        if (this.header && this.header.parentNode) {
            this.header.parentNode.removeChild(this.header);
            this.header = null;
        }
        
        if (this.titleSpan) {
            this.titleSpan = null;
        }
        if (this.closeBtn) {
            this.closeBtn = null;
        }
    }
    
    PreRelease() {
        // Placeholder for any pre-release logic
    }
    
    SetPosition(nXCoord, nYCoord) {
        this.x = nXCoord;
        this.y = nYCoord;
        if (this.backgroundSprite) {
            this.backgroundSprite.SetPosition(nXCoord, nYCoord);
        }
        if (this.header) {
            this.header.style.left = `${nXCoord}px`;
            this.header.style.top = `${nYCoord}px`;
        }
        
        // Reposition buttons
        this.buttons.forEach((btn, index) => {
            btn.setPosition(
                this.x + 10,
                this.y + 30 + index * 30
            );
        });
    }
    
    SetSize(nWidth, nHeight, eChangedPram) {
        // Simplified - just set size
        if (eChangedPram & 1) { // X flag
            this.width = nWidth;
        }
        if (eChangedPram & 2) { // Y flag  
            this.height = nHeight;
        }
        
        if (this.backgroundSprite) {
            this.backgroundSprite.SetSize(this.width, this.height);
        }
        if (this.header) {
            this.header.style.width = `${this.width}px`;
        }
        
        // Reposition buttons based on new size
        this.buttons.forEach((btn, index) => {
            btn.setPosition(
                this.x + 10,
                this.y + 30 + index * 30
            );
        });
    }
    
    CursorInWin(nArea) {
        if (!this.visible) return false;
        
        // Simplified implementation for web
        const mouseX = window.mouseX || 0;
        const mouseY = window.mouseY || 0;
        
        switch (nArea) {
            case 0: // WA_ALL - entire window
                return mouseX >= this.x && 
                       mouseX <= this.x + this.width &&
                       mouseY >= this.y && 
                       mouseY <= this.y + this.height;
                       
            case 1: // WA_MOVE - title bar area
                return mouseX >= this.x && 
                       mouseX <= this.x + this.width &&
                       mouseY >= this.y && 
                       mouseY <= this.y + 26;
                       
            case 2: // WA_BUTTON - button areas
                return this.buttons.some(btn => btn.containsPoint(mouseX, mouseY));
                
            default:
                return false;
        }
    }
    
    ActiveBtns(bActive) {
        this.buttons.forEach(btn => {
            btn.setEnabled(bActive);
        });
    }
    
    Show(bShow) {
        if (this.backgroundSprite) {
            this.backgroundSprite.setVisible(bShow);
        }
        if (this.header) {
            this.header.style.display = bShow ? 'block' : 'none';
        }
        
        this.visible = bShow;
        if (!bShow) {
            this.active = false;
        }
        
        // Show/hide buttons
        this.buttons.forEach(btn => {
            btn.setVisible(bShow);
        });
    }
    
    Update(dDeltaTick) {
        if (!this.visible) return;
        
        // Update button states
        this.buttons.forEach(btn => {
            // Button update logic would go here
        });
        
        this.UpdateWhileShow(dDeltaTick);
        
        if (!this.active) return;
        
        // Handle mouse input for window dragging/state
        if (window.isLBtnUp === true) {
            this.state = 'NORMAL';
            window.isLBtnUp = false;
        }
        
        if (this.state === 'NORMAL') {
            this.buttons.forEach(btn => {
                // Button update
            });
        }
        
        this.UpdateWhileActive(dDeltaTick);
        
        if (window.isLBtnDn === true) {
            if (this.CursorInWin(1)) { // WA_MOVE
                this.heldPoint = { x: window.mouseX || 0, y: window.mouseY || 0 };
                this.tempPoint = { x: this.x, y: this.y };
                this.state = 'MOVE';
                window.isLBtnDn = false;
            }
        }
        
        if (this.state === 'MOVE') {
            const currentX = window.mouseX || 0;
            const currentY = window.mouseY || 0;
            this.tempPoint.x += currentX - this.heldPoint.x;
            this.tempPoint.y += currentY - this.heldPoint.y;
            
            if (!this.docking) {
                this.SetPosition(this.tempPoint.x, this.tempPoint.y);
            }
            
            this.heldPoint = { x: currentX, y: currentY };
        }
        
        this.CheckAdditionalState();
    }
    
    UpdateWhileShow(dDeltaTick) {
        // Override in subclasses for custom update logic while shown
    }
    
    UpdateWhileActive(dDeltaTick) {
        // Override in subclasses for custom update logic while active
    }
    
    CheckAdditionalState() {
        // Additional state checking logic
    }
    
    Render() {
        if (this.visible) {
            if (this.backgroundSprite) {
                // Background sprite is already rendered via DOM
            }
            
            this.RenderControls();
        }
    }
    
    RegisterButton(pBtn) {
        this.buttons.push(pBtn);
    }
    
    RenderButtons() {
        this.buttons.forEach(btn => {
            // Buttons are already rendered via DOM
        });
    }
    
    // Helper methods for creating common UI elements
    createButton(text, onClick, relativeX, relativeY) {
        const btn = new CButton({
            x: this.x + (relativeX || 10),
            y: this.y + (relativeY || 30 + this.buttons.length * 30),
            width: 80,
            height: 24,
            text: text,
            onClick: onClick
        });
        
        this.RegisterButton(btn);
        return btn;
    }
    
    setTitle(title) {
        if (this.titleSpan) {
            this.titleSpan.textContent = title;
        }
    }
    
    // State constants (matching original)
    static get WS_NORMAL() { return 'NORMAL'; }
    static get WS_MOVE() { return 'MOVE'; }
    static get WS_DISABLED() { return 'DISABLED'; }
}

// Global state for mouse tracking (would be updated by main loop)
window.mouseX = 0;
window.mouseY = 0;
window.isLBtnDown = false;
window.isLBtnUp = false;
window.isLBtnDn = false;

// Update mouse position on mousemove
document.addEventListener('mousemove', (e) => {
    window.mouseX = e.clientX;
    window.mouseY = e.clientY;
});

// Update mouse button states
document.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Left button
        window.isLBtnDown = true;
        window.isLBtnDn = true;
    }
});

document.addEventListener('mouseup', (e) => {
    if (e.button === 0) { // Left button
        window.isLBtnDown = false;
        window.isLBtnUp = true;
    }
});

// Reset button states each frame (call from main loop)
export function resetMouseStates() {
    window.isLBtnUp = false;
    window.isLBtnDn = false;
}