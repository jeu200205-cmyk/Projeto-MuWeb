// game/MuHelper.js — Sistema de auto-caça estilo MU Helper (Season 6+)
// Ataca o monstro mais próximo automaticamente, usa skill selecionada,
// auto-pickup de itens e uso automático de potions de HP/MP.
//
// Uso:
//   import { MuHelper, MuHelperWindow } from './game/MuHelper.js';
//   MuHelper.init({ monsterManager, player, skillBar, pickup });
//   const win = new MuHelperWindow(MuHelper); // hotkey 'h'
//   // no loop: MuHelper.update(dt);
//   MuHelper.on('stateChanged', (active) => { ... });

import { MUWindow } from '../ui2/MUWindow.js';

// Célula do mundo real = 100 unidades (TERRAIN_SCALE PC — _define.h:265,
// MESMAS unidades do Main 5.2: 256×256 células × 100). huntRange/reach do
// helper são configurados em CÉLULAS → converter para unidades no uso.
const CELL = 100;

/**
 * Sistema de auto-caça (singleton de classe).
 * Eventos: on('stateChanged', (active:boolean) => {})
 */
export class MuHelperSystem {
    constructor() {
        this._ctx = {
            monsterManager: null, // MonsterManager (queryNearestMonster)
            player: null,         // { position, hp, maxHp, mp, maxMp, usePotion?('hp'|'mp') }
            skillBar: null,       // SkillBar com .use(index)
            pickup: null,         // opcional: { pickupNear(pos, range) } ou .pickupNear(pos, range)
        };

        this.active = false;

        // Configurações (espelham os controles da janela)
        this.autoAttack = true;          // "Atacar automaticamente"
        this.attackNearest = true;       // "Atacar monstro mais próximo"
        this.skillIndex = 0;             // skill usada no auto-ataque (vai pro SkillBar.use)
        this.autoPickup = true;
        this.huntRange = 8;              // raio de caça (1-15)
        this.hpPotionAt = 50;            // % de HP para usar HP potion (0 = desligado)
        this.mpPotionAt = 30;            // % de MP para usar MP potion (0 = desligado)

        this._attackCooldown = 0;
        this._potionCooldown = 0;
        this._pickupCooldown = 0;
        this._listeners = { stateChanged: [] };
        this._currentTarget = null;
    }

    /** Injeta as dependências do jogo. */
    init(ctx = {}) {
        Object.assign(this._ctx, ctx);
        return this;
    }

    on(event, cb) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(cb);
        return this;
    }

    off(event, cb) {
        const l = this._listeners[event];
        if (l) this._listeners[event] = l.filter((f) => f !== cb);
        return this;
    }

    _emit(event, ...args) {
        for (const cb of this._listeners[event] || []) {
            try { cb(...args); } catch (e) { console.error('[MuHelper] listener error:', e); }
        }
    }

    /** Liga/desliga o helper. Emite 'stateChanged'. */
    setActive(v) {
        v = !!v;
        if (this.active === v) return;
        this.active = v;
        if (!v) this._currentTarget = null;
        this._emit('stateChanged', this.active);
    }

    toggle() { this.setActive(!this.active); }

    /** Monstro alvo atual (ou null). */
    getTarget() { return this._currentTarget; }

    /**
     * Tick do auto-caça; chamar no game loop.
     * @param {number} dt delta time em segundos
     */
    update(dt) {
        if (!this.active) return;
        const { monsterManager, player, skillBar, pickup } = this._ctx;
        if (!monsterManager || !player || !player.position) return;
        if (player.isAlive && !player.isAlive()) return;

        this._attackCooldown = Math.max(0, this._attackCooldown - dt);
        this._potionCooldown = Math.max(0, this._potionCooldown - dt);
        this._pickupCooldown = Math.max(0, this._pickupCooldown - dt);

        // --- Potions automáticas ---
        if (this._potionCooldown <= 0) {
            const hpPct = player.maxHp ? (player.hp / player.maxHp) * 100 : 100;
            const mpPct = player.maxMp ? (player.mp / player.maxMp) * 100 : 100;
            if (this.hpPotionAt > 0 && hpPct <= this.hpPotionAt) {
                this._usePotion('hp');
            } else if (this.mpPotionAt > 0 && mpPct <= this.mpPotionAt) {
                this._usePotion('mp');
            }
        }

        // --- Auto pickup ---
        if (this.autoPickup && this._pickupCooldown <= 0) {
            this._pickupCooldown = 0.5;
            if (pickup && typeof pickup.pickupNear === 'function') {
                // huntRange/pickup em CÉLULAS (slider 1-15) → unidades do mundo
                // real (célula = 100, TERRAIN_SCALE PC _define.h:265)
                pickup.pickupNear(player.position, Math.min(this.huntRange, 3) * CELL);
            }
        }

        // --- Aquisição de alvo ---
        const nearest = monsterManager.queryNearestMonster(player.position, this.huntRange * CELL);
        if (this.attackNearest || !this._currentTarget || !this._currentTarget.isAlive?.()) {
            this._currentTarget = nearest;
        }
        if (!this._currentTarget || !this.autoAttack) return;

        // --- Ataque ---
        if (this._attackCooldown > 0) return;
        const dist = this._currentTarget.position.distanceTo(player.position);
        const reach = 2.5 * CELL; // melee: 2.5 células no mundo real (PC)
        if (dist > reach) {
            // Move na direção do alvo se o player expuser moveTowards
            if (typeof player.moveTowards === 'function') {
                player.moveTowards(this._currentTarget.position, dt);
            }
            return;
        }
        this._attackCooldown = 0.8;
        if (skillBar && typeof skillBar.use === 'function' && this.skillIndex >= 0) {
            skillBar.use(this.skillIndex);
        } else if (typeof player.attack === 'function') {
            player.attack(this._currentTarget);
        }
    }

    _usePotion(kind) {
        const { player } = this._ctx;
        this._potionCooldown = 1.0;
        if (player) {
            if (typeof player.usePotion === 'function') player.usePotion(kind);
            else if (kind === 'hp' && typeof player.heal === 'function') player.heal(50);
            else if (kind === 'mp' && typeof player.restoreMana === 'function') player.restoreMana(50);
        }
    }
}

export const MuHelper = new MuHelperSystem();

/**
 * Janela do MU Helper (MUWindow própria, hotkey 'h').
 */
export class MuHelperWindow {
    /** @param {MuHelperSystem} [helper] - default: singleton MuHelper */
    constructor(helper = MuHelper) {
        this.helper = helper;
        this.win = new MUWindow({ title: 'MU Helper', width: 260, hotkey: 'h', x: 320, y: 140 });
        this._build();
    }

    _build() {
        const body = this.win.body;
        body.innerHTML = '';
        const h = this.helper;

        const row = (labelText, control) => {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin:4px 0;gap:8px;';
            const label = document.createElement('span');
            label.textContent = labelText;
            label.style.flex = '1';
            div.appendChild(label);
            div.appendChild(control);
            body.appendChild(div);
            return div;
        };

        const checkbox = (checked, onChange) => {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = checked;
            cb.addEventListener('change', () => onChange(cb.checked));
            return cb;
        };

        const slider = (min, max, value, onInput, valueSpanId) => {
            const wrap = document.createElement('span');
            wrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
            const s = document.createElement('input');
            s.type = 'range';
            s.min = min; s.max = max; s.value = value;
            s.style.width = '90px';
            const val = document.createElement('span');
            val.textContent = String(value);
            val.style.cssText = 'min-width:22px;text-align:right;color:#f0d98c;';
            if (valueSpanId) val.dataset.role = valueSpanId;
            s.addEventListener('input', () => {
                val.textContent = s.value;
                onInput(parseInt(s.value, 10));
            });
            wrap.appendChild(s);
            wrap.appendChild(val);
            return wrap;
        };

        // Toggle principal: ativa o helper ("Atacar automaticamente" no MU real liga o sistema)
        row('Atacar automaticamente', checkbox(h.active, (v) => h.setActive(v)));

        // Skill selecionada
        const skillSel = document.createElement('select');
        skillSel.style.cssText = 'background:#1c150a;color:#f0d98c;border:1px solid #8a6d2f;width:110px;';
        for (let i = 0; i < 8; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            const skill = h._ctx.skillBar?.skills?.[i];
            opt.textContent = skill?.name ? `${i + 1}: ${skill.name}` : `Slot ${i + 1}`;
            skillSel.appendChild(opt);
        }
        skillSel.value = String(h.skillIndex);
        skillSel.addEventListener('change', () => { h.skillIndex = parseInt(skillSel.value, 10); });
        row('Skill', skillSel);

        row('Atacar monstro mais próximo', checkbox(h.attackNearest, (v) => { h.attackNearest = v; }));
        row('Auto pickup', checkbox(h.autoPickup, (v) => { h.autoPickup = v; }));
        row('Raio de caça', slider(1, 15, h.huntRange, (v) => { h.huntRange = v; }));
        row('HP potion < %', slider(0, 100, h.hpPotionAt, (v) => { h.hpPotionAt = v; }));
        row('MP potion < %', slider(0, 100, h.mpPotionAt, (v) => { h.mpPotionAt = v; }));

        // Botões Start/Stop
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;justify-content:center;margin-top:6px;';
        const startBtn = document.createElement('span');
        startBtn.className = 'mu-btn';
        const refreshBtnLabel = () => {
            startBtn.textContent = h.active ? 'Stop' : 'Start';
            startBtn.style.color = h.active ? '#ff9a6a' : '#9aff8a';
        };
        refreshBtnLabel();
        startBtn.addEventListener('click', () => {
            h.toggle();
            refreshBtnLabel();
            cbToggle.checked = h.active;
        });
        btnRow.appendChild(startBtn);
        body.appendChild(btnRow);

        // mantém UI sincronizada se o estado mudar por fora
        const cbToggle = body.querySelector('input[type=checkbox]');
        h.on('stateChanged', (active) => {
            cbToggle.checked = active;
            refreshBtnLabel();
        });
    }

    show() { this.win.show(); }
    hide() { this.win.hide(); }
    toggle() { this.win.toggle(); }
    destroy() { this.win.destroy(); }
}
