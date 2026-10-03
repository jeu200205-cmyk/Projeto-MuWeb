// FloatingText.js — Textos flutuantes mundo→tela (dano, cura, exp, crítico)
// Projeta posição 3D para coordenadas de tela e anima divs DOM subindo e sumindo.
import * as THREE from 'three';

export const TEXT_STYLES = {
  damage_taken: { color: '#ff4444', size: 14, bold: false }, // dano recebido
  damage:       { color: '#ff9933', size: 14, bold: false }, // dano causado
  heal:         { color: '#44ff66', size: 14, bold: false }, // cura
  exp:          { color: '#4499ff', size: 13, bold: false }, // experiência
  crit:         { color: '#ffdd22', size: 20, bold: true },  // crítico
};

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
.floating-text {
  position: fixed;
  pointer-events: none;
  font-family: 'Segoe UI', Arial, sans-serif;
  text-shadow: 1px 1px 2px #000, -1px -1px 2px #000;
  z-index: 900;
  will-change: transform, opacity;
  white-space: nowrap;
}`;
  document.head.appendChild(style);
}

/**
 * class FloatingText — gerencia o stack de textos flutuantes simultâneos.
 * Uso:
 *   const ft = new FloatingText(camera);
 *   ft.show(monsterWorldPos, '123', 'damage');
 *   ...no loop: ft.update(dt);
 */
export class FloatingText {
  /**
   * @param {THREE.Camera} camera
   * @param {HTMLElement} [container] — default document.body
   */
  constructor(camera, container) {
    injectStyles();
    this.camera = camera;
    this.container = container || document.body;
    this.texts = [];           // { el, worldPos, age, life, riseSpeed }
    this.maxStack = 40;        // limite de textos simultâneos
    this._v = new THREE.Vector3(); // scratch p/ projeção
  }

  /**
   * Cria um texto flutuante.
   * @param {THREE.Vector3} worldPos — posição 3D de origem
   * @param {string|number} text
   * @param {string} type — damage_taken | damage | heal | exp | crit
   * @param {object} [opts] — { life, riseSpeed, offsetY }
   * @returns {HTMLElement} elemento criado
   */
  show(worldPos, text, type = 'damage', opts = {}) {
    // Remove o mais antigo se o stack estourou
    while (this.texts.length >= this.maxStack) {
      const oldest = this.texts.shift();
      oldest.el.remove();
    }

    const st = TEXT_STYLES[type] || TEXT_STYLES.damage;
    const el = document.createElement('div');
    el.className = 'floating-text';
    el.textContent = String(text);
    el.style.color = st.color;
    el.style.fontSize = `${opts.size || st.size}px`;
    if (st.bold) el.style.fontWeight = 'bold';
    this.container.appendChild(el);

    this.texts.push({
      el,
      worldPos: worldPos.clone(),
      age: 0,
      life: opts.life || 1.2,
      riseSpeed: opts.riseSpeed !== undefined ? opts.riseSpeed : 1.2,
      offsetY: opts.offsetY || 0,
      driftX: (Math.random() - 0.5) * 20,
    });
    return el;
  }

  // ---------- Atalhos tipados ----------
  damage(pos, amount, crit = false) {
    return this.show(pos, crit ? `${amount}!` : String(amount), crit ? 'crit' : 'damage');
  }
  damageTaken(pos, amount) { return this.show(pos, `-${amount}`, 'damage_taken'); }
  heal(pos, amount) { return this.show(pos, `+${amount}`, 'heal'); }
  exp(pos, amount) { return this.show(pos, `+${amount} exp`, 'exp'); }

  /**
   * Atualiza posições/animações. Chamar a cada frame.
   * @param {number} dt — segundos desde o último frame
   */
  update(dt) {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.age += dt;
      if (t.age >= t.life) {
        t.el.remove();
        this.texts.splice(i, 1);
        continue;
      }

      // Projeta mundo → tela
      this._v.copy(t.worldPos);
      this._v.y += t.offsetY;
      this._v.project(this.camera);

      const behind = this._v.z > 1; // atrás da câmera
      const x = (this._v.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-this._v.y * 0.5 + 0.5) * window.innerHeight;

      const rise = t.age * t.riseSpeed * 60;          // sobe com o tempo
      const fade = 1 - Math.max(0, (t.age / t.life - 0.6) / 0.4); // fade final 40%

      t.el.style.opacity = behind ? '0' : String(Math.max(0, fade));
      t.el.style.transform =
        `translate(${Math.round(x + t.driftX * t.age)}px, ${Math.round(y - rise)}px) translate(-50%, -100%)`;
    }
  }

  /** Remove todos os textos */
  clear() {
    for (const t of this.texts) t.el.remove();
    this.texts = [];
  }

  dispose() { this.clear(); }
}

export default FloatingText;
