// ui2/ChaosMachineWindow.js — Chaos Machine estilo MU Online.
//
// Janela MUWindow com 3 slots de entrada (recebem itens arrastados do grid
// de inventário exibido na janela), detecção automática de receita via
// mixSystem.availableRecipes, botão Mix com taxa % visível, animação de
// resultado (brilho dourado no sucesso / vermelho na falha) e som via
// Sound.playBeep.

import { MUWindow } from './MUWindow.js';
import { Inventory } from '../data/Inventory.js';
import { mixSystem, MIX_RECIPES } from '../data/MixSystem.js';
import { Sound } from '../audio/SoundManager.js';

const CELL = 34;

let chaosStylesInjected = false;
function injectChaosStyles() {
    if (chaosStylesInjected) return;
    chaosStylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
.mu-mix-slot {
    width: ${CELL + 8}px; height: ${CELL + 8}px;
    background: radial-gradient(circle at 50% 40%, #241d10, #120e07);
    border: 1px dashed #8a6d2f; border-radius: 3px;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; cursor: pointer; position: relative;
}
.mu-mix-slot.filled { border-style: solid; }
.mu-mix-slot.hover { border-color: #f0d98c; box-shadow: 0 0 8px rgba(240,217,140,0.4); }
@keyframes muMixGlowSuccess {
    0%   { box-shadow: 0 0 4px rgba(240,217,140,0.2); }
    40%  { box-shadow: 0 0 26px 8px rgba(240,217,140,0.75); }
    100% { box-shadow: 0 0 4px rgba(240,217,140,0); }
}
@keyframes muMixGlowFail {
    0%   { box-shadow: 0 0 4px rgba(220,50,50,0.2); }
    40%  { box-shadow: 0 0 26px 8px rgba(220,50,50,0.8); }
    100% { box-shadow: 0 0 4px rgba(220,50,50,0); }
}
.mu-mix-anim-success { animation: muMixGlowSuccess 1.2s ease-out; }
.mu-mix-anim-fail { animation: muMixGlowFail 1.2s ease-out; }
.mu-mix-result.success { color: #f0d98c; font-weight: bold; }
.mu-mix-result.fail { color: #ff6a5a; font-weight: bold; }
.mu-mix-cell {
    width: ${CELL}px; height: ${CELL}px;
    background: #151019; border: 1px solid #4a3a1e;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; cursor: pointer; position: relative;
}
.mu-mix-cell .qty {
    position: absolute; bottom: 0; right: 1px;
    font-size: 9px; color: #f0d98c; text-shadow: 0 0 2px #000;
}
`;
    document.head.appendChild(style);
}

/**
 * Localiza a receita que casa com o conjunto de itens.
 * @returns {object|null} — entrada de availableRecipes() com ok === true
 */
export function findMatch(items, zen = Infinity) {
    return mixSystem.availableRecipes(items, zen).find((r) => r.ok) || null;
}

export class ChaosMachineWindow extends MUWindow {
    /**
     * @param {object} opts
     * @param {Inventory} opts.inventory — inventário do jogador (fonte de drag e destino do resultado)
     * @param {number} [opts.x] [opts.y]
     */
    constructor(opts = {}) {
        super({
            title: 'Chaos Machine',
            width: 300,
            x: opts.x !== undefined ? opts.x : 240,
            y: opts.y !== undefined ? opts.y : 110,
            parent: opts.parent || document.body,
        });
        injectChaosStyles();
        this.inventory = opts.inventory || new Inventory();
        this.slots = [null, null, null]; // itens colocados na máquina
        this._dragged = null;            // { source: 'inv', index } | { source: 'mix', index }
        this._busy = false;              // trava durante animação de resultado

        this._build();
        this._refreshInv = () => this._renderInv();
        this.inventory.on('change', this._refreshInv);
    }

    _build() {
        this.body.innerHTML = '';

        // --- Slots da máquina ---
        const machine = document.createElement('div');
        machine.style.cssText = 'display:flex;gap:6px;justify-content:center;margin-bottom:8px;';
        this.slotEls = [];
        for (let i = 0; i < 3; i++) {
            const s = document.createElement('div');
            s.className = 'mu-mix-slot';
            s.dataset.index = String(i);
            s.addEventListener('dragover', (e) => { e.preventDefault(); s.classList.add('hover'); });
            s.addEventListener('dragleave', () => s.classList.remove('hover'));
            s.addEventListener('drop', (e) => {
                e.preventDefault();
                s.classList.remove('hover');
                if (this._dragged) this._dropOnSlot(i, this._dragged);
            });
            // Clique com botão direito devolve ao inventário
            s.addEventListener('contextmenu', (e) => { e.preventDefault(); this._returnSlot(i); });
            machine.appendChild(s);
            this.slotEls.push(s);
        }
        this.body.appendChild(machine);

        // --- Receita detectada + taxa ---
        this.recipeEl = document.createElement('div');
        this.recipeEl.style.cssText = 'min-height:18px;text-align:center;color:#9fb8d4;font-size:11px;';
        this.body.appendChild(this.recipeEl);

        this.rateEl = document.createElement('div');
        this.rateEl.style.cssText = 'text-align:center;margin:2px 0 6px 0;font-size:12px;color:#7fd4ff;';
        this.body.appendChild(this.rateEl);

        // --- Botão Mix ---
        const mixWrap = document.createElement('div');
        mixWrap.style.cssText = 'display:flex;justify-content:center;margin-bottom:6px;';
        this.mixBtn = document.createElement('div');
        this.mixBtn.className = 'mu-btn disabled';
        this.mixBtn.textContent = '⚡ MIX';
        this.mixBtn.style.cssText = 'padding:6px 22px;font-weight:bold;';
        this.mixBtn.addEventListener('click', () => this._doMix());
        mixWrap.appendChild(this.mixBtn);
        this.body.appendChild(mixWrap);

        // --- Resultado ---
        this.resultEl = document.createElement('div');
        this.resultEl.className = 'mu-mix-result';
        this.resultEl.style.cssText = 'min-height:18px;text-align:center;margin-bottom:6px;';
        this.body.appendChild(this.resultEl);

        // --- Inventário (origem do drag) ---
        const invTitle = document.createElement('div');
        invTitle.className = 'mu-title';
        invTitle.textContent = 'Inventário — arraste itens para a máquina';
        invTitle.style.marginBottom = '4px';
        this.body.appendChild(invTitle);

        this.invGrid = document.createElement('div');
        this.invGrid.style.cssText = `display:grid;grid-template-columns:repeat(8,${CELL}px);gap:2px;`;
        for (let i = 0; i < this.inventory.grid.length; i++) {
            const c = document.createElement('div');
            c.className = 'mu-mix-cell';
            c.dataset.index = String(i);
            c.addEventListener('dragover', (e) => e.preventDefault());
            c.addEventListener('drop', (e) => {
                e.preventDefault();
                if (this._dragged && this._dragged.source === 'mix') {
                    this._returnSlot(this._dragged.index);
                }
            });
            this.invGrid.appendChild(c);
        }
        this.body.appendChild(this.invGrid);

        // Zen
        this.zenEl = document.createElement('div');
        this.zenEl.style.cssText = 'margin-top:6px;font-size:11px;color:#ffd24b;';
        this.body.appendChild(this.zenEl);

        this._renderSlots();
        this._renderInv();
        this._refreshRecipe();
    }

    // ---------- Render ----------

    _renderSlots() {
        for (let i = 0; i < 3; i++) {
            const el = this.slotEls[i];
            const item = this.slots[i];
            el.textContent = item ? (item.icon || '❔') : '';
            el.classList.toggle('filled', !!item);
            el.title = item ? item.getName() : 'Slot vazio (arraste um item)';
            el.draggable = !!item && !this._busy;
            el.ondragstart = item
                ? () => { this._dragged = { source: 'mix', index: i }; }
                : null;
        }
    }

    _renderInv() {
        const cells = this.invGrid.children;
        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            const item = this.inventory.grid[i];
            cell.textContent = item ? (item.icon || '❔') : '';
            cell.title = item ? item.getName() : '';
            cell.draggable = !!item && !this._busy;
            cell.ondragstart = item
                ? () => { this._dragged = { source: 'inv', index: i }; }
                : null;
            // quantidade empilhada
            let qty = cell.querySelector('.qty');
            if (item && item.isStackable && item.quantity > 1) {
                if (!qty) { qty = document.createElement('span'); qty.className = 'qty'; cell.appendChild(qty); }
                qty.textContent = `x${item.quantity}`;
            } else if (qty) {
                qty.remove();
            }
        }
        this.zenEl.textContent = `Zen: ${this.inventory.zen.toLocaleString()}`;
    }

    // ---------- Drag / drop ----------

    _dropOnSlot(slotIndex, dragged) {
        if (this._busy) return;
        if (this.slots[slotIndex]) return; // slot ocupado

        let item = null;
        if (dragged.source === 'inv') {
            item = this.inventory.grid[dragged.index] || null;
            if (!item) return;
            this.inventory.removeItem(dragged.index);
        } else if (dragged.source === 'mix') {
            item = this.slots[dragged.index];
            if (!item) return;
            if (this.slots[slotIndex]) return;
            this.slots[dragged.index] = null;
        }

        this.slots[slotIndex] = item;
        this._dragged = null;
        Sound.playBeep(680, 0.05, 'sine', 0.12);
        this._renderSlots();
        this._refreshRecipe();
    }

    /** Devolve o item do slot ao inventário. */
    _returnSlot(index) {
        const item = this.slots[index];
        if (!item || this._busy) return;
        const ok = this.inventory.addItem(item);
        if (ok === -1) return; // sem espaço
        this.slots[index] = null;
        this._dragged = null;
        this._renderSlots();
        this._refreshRecipe();
    }

    // ---------- Receita / taxa ----------

    _placedItems() { return this.slots.filter(Boolean); }

    _refreshRecipe() {
        const items = this._placedItems();
        const match = items.length ? findMatch(items, this.inventory.zen) : null;

        if (!items.length) {
            this.recipeEl.textContent = 'Coloque itens na máquina…';
            this.rateEl.textContent = '';
        } else if (!match) {
            this.recipeEl.textContent = '❌ Nenhuma receita compatível';
            this.recipeEl.style.color = '#ff6a5a';
            this.rateEl.textContent = '';
        } else {
            this.recipeEl.style.color = '#9fb8d4';
            this.recipeEl.textContent = `📜 ${match.name}` + (match.zen ? ` — ${match.zen.toLocaleString()} zen` : '');
            const chance = this._recipeChance(match.id, items);
            this.rateEl.textContent = chance == null ? '' : `Taxa de sucesso: ${(chance * 100).toFixed(1)}%`;
        }
        this.mixBtn.classList.toggle('disabled', !match);
        this._currentMatch = match;
    }

    _recipeChance(recipeId, items) {
        const recipe = MIX_RECIPES.find((r) => r.id === recipeId);
        if (!recipe) return null;
        let chance = typeof recipe.chance === 'function' ? recipe.chance(items) : recipe.chance;
        // bônus de luck (mesma regra do MixSystem.mix)
        const isJewel = (i) => i.name && i.name.startsWith('Jewel');
        const target = items.find((i) => !isJewel(i));
        if (target && target.luck && recipe.luckBonus) chance += recipe.luckBonus;
        return Math.min(1, chance);
    }

    // ---------- Mix ----------

    _doMix() {
        if (this._busy || !this._currentMatch) return;
        const items = this._placedItems();
        const res = mixSystem.mix(this._currentMatch.id, items, this.inventory.zen);
        if (res.reason) {
            this.resultEl.className = 'mu-mix-result fail';
            this.resultEl.textContent = `Falhou: ${res.reason}`;
            Sound.playBeep(180, 0.2, 'sawtooth', 0.18);
            return;
        }

        // Paga o zen
        if (res.zenCost > 0) this.inventory.spendZen(res.zenCost);

        // Itens consumidos saem dos slots (o MixSystem já desconta stacks no grid
        // quando possível; os que saíram do inventário estão nos slots)
        this.slots = [null, null, null];

        // Guarda resultado no inventário
        let resultName = 'nada';
        if (res.result && typeof res.result === 'object') {
            if (res.result.name) {
                const idx = this.inventory.addItem(res.result);
                if (idx === -1) {
                    // inventário cheio: aborta a entrega e sinaliza
                    this.resultEl.className = 'mu-mix-result fail';
                    this.resultEl.textContent = 'Inventário cheio!';
                }
                resultName = typeof res.result.getName === 'function' ? res.result.getName() : res.result.name;
            } else if (res.result.id) {
                resultName = res.result.name || 'token';
            }
        }

        // Animação + som
        this._busy = true;
        this._renderSlots();
        this._renderInv();
        const animClass = res.success ? 'mu-mix-anim-success' : 'mu-mix-anim-fail';
        for (const s of this.slotEls) {
            s.classList.remove('mu-mix-anim-success', 'mu-mix-anim-fail');
            void s.offsetWidth; // reinicia a animação
            s.classList.add(animClass);
        }
        if (res.success) {
            this.resultEl.className = 'mu-mix-result success';
            if (this.resultEl.textContent !== 'Inventário cheio!') {
                this.resultEl.textContent = `✨ Sucesso! ${resultName}`;
            }
            Sound.playBeep(1046, 0.12, 'sine', 0.2);
            setTimeout(() => Sound.playBeep(1318, 0.18, 'sine', 0.2), 120);
        } else {
            this.resultEl.className = 'mu-mix-result fail';
            this.resultEl.textContent = `💥 Falhou... ${resultName ? `(${resultName})` : 'itens perdidos'}`;
            Sound.playBeep(140, 0.35, 'sawtooth', 0.22);
        }

        setTimeout(() => {
            this._busy = false;
            this._renderSlots();
            this._renderInv();
            this._refreshRecipe();
        }, 1200);
    }

    /** Ao fechar, devolve os itens dos slots ao inventário. */
    hide() {
        for (let i = 0; i < 3; i++) this._returnSlot(i);
        super.hide();
    }

    destroy() {
        if (this.inventory) this.inventory.off('change', this._refreshInv);
        super.destroy();
    }
}

export default ChaosMachineWindow;
