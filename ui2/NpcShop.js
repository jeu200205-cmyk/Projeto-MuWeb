// ui2/NpcShop.js — janela de loja de NPC com abas Comprar/Vender.
//
// Contrato de ShopItem: { id, name, type?, icon, level?, price /* zen */, stock? }
// Reutiliza o contrato de Inventory (../data/Inventory.js): addItem, removeItem, grid, zen,
// addZen(n) / spendZen(n) -> bool.

import { MUWindow } from './MUWindow.js';
import { Inventory } from '../data/Inventory.js';

export class NpcShop extends MUWindow {
    /**
     * @param {object} opts
     * @param {string}  [opts.npcName]
     * @param {ShopItem[]} [opts.stock]
     * @param {Inventory} [opts.inventory] - inventário do jogador (zen + itens para vender)
     * @param {number} [opts.sellRate]  - fração do preço ao vender (default 0.3)
     * @param {Function} [opts.getTooltip] - (item) => string HTML (opcional)
     */
    constructor(opts = {}) {
        super({
            title: opts.npcName || 'Loja',
            width: 320,
            x: opts.x !== undefined ? opts.x : 200,
            y: opts.y !== undefined ? opts.y : 100,
            parent: opts.parent || document.body,
        });
        this.stock = opts.stock || [];
        this.inventory = opts.inventory || new Inventory();
        this.sellRate = opts.sellRate !== undefined ? opts.sellRate : 0.3;
        this.getTooltip = opts.getTooltip || null;
        this.tab = 'buy';

        // Abas
        const tabs = document.createElement('div');
        tabs.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
        this.tabBuy = document.createElement('div');
        this.tabSell = document.createElement('div');
        for (const [el, id, txt] of [[this.tabBuy, 'buy', 'Comprar'], [this.tabSell, 'sell', 'Vender']]) {
            el.className = 'mu-btn';
            el.textContent = txt;
            el.style.flex = '1';
            el.addEventListener('click', () => { this.tab = id; this.refresh(); });
            tabs.appendChild(el);
        }
        this.body.appendChild(tabs);

        this.zenEl = document.createElement('div');
        this.zenEl.style.cssText = 'color:#ffd24b;font-weight:bold;margin-bottom:4px;font-size:11px;';
        this.body.appendChild(this.zenEl);

        this.listEl = document.createElement('div');
        this.listEl.className = 'mu-scrollbar';
        this.listEl.style.cssText = 'max-height:280px;overflow-y:auto;display:grid;grid-template-columns:repeat(5,44px);gap:4px;padding:2px;';
        this.body.appendChild(this.listEl);

        // Tooltip
        this.tooltip = document.createElement('div');
        this.tooltip.style.cssText = `
            position: fixed; pointer-events: none; z-index: 9999; display: none;
            background: rgba(8,8,14,0.95); border: 1px solid #8a6d2f; border-radius: 4px;
            padding: 8px 10px; color: #e8dcc0; font-size: 11px; max-width: 220px;
        `;
        document.body.appendChild(this.tooltip);

        this.refresh();
    }

    _tile(item, mode) {
        const cell = document.createElement('div');
        cell.style.cssText = `
            width:44px;height:44px;position:relative;cursor:pointer;
            background:rgba(30,24,14,0.9);border:1px solid #4a3d22;border-radius:3px;
            display:flex;align-items:center;justify-content:center;font-size:22px;
        `;
        const icon = document.createElement('span');
        icon.textContent = item.icon || '❔';
        cell.appendChild(icon);

        const price = document.createElement('div');
        const val = mode === 'buy' ? (item.price || 0) : Math.floor((item.price || 0) * this.sellRate);
        price.textContent = this._fmtZen(val);
        price.style.cssText = 'position:absolute;bottom:0;left:0;right:0;text-align:center;font-size:8px;color:#ffd24b;background:rgba(0,0,0,0.6);';
        cell.appendChild(price);

        cell.addEventListener('mouseenter', (e) => {
            cell.style.borderColor = '#f0d98c';
            const tip = this.getTooltip ? this.getTooltip(item)
                : `<b style="color:#9ecbff">${item.icon || ''} ${item.name}${item.level ? ' +' + item.level : ''}</b>` +
                  `<br><span style="color:#ffd24b">${val.toLocaleString()} Zen</span>` +
                  (mode === 'sell' ? '<br><span style="color:#aaa">Preço de venda</span>' : '');
            this.tooltip.innerHTML = tip;
            this.tooltip.style.display = 'block';
            this.tooltip.style.left = `${Math.min(e.clientX + 12, window.innerWidth - 240)}px`;
            this.tooltip.style.top = `${e.clientY + 12}px`;
        });
        cell.addEventListener('mouseleave', () => {
            cell.style.borderColor = '#4a3d22';
            this.tooltip.style.display = 'none';
        });
        cell.addEventListener('mouseenter', () => cell.style.borderColor = '#f0d98c');
        cell.addEventListener('click', () => {
            if (mode === 'buy') this.buy(item);
            else this.sell(item);
        });
        return cell;
    }

    _fmtZen(n) {
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return Math.round(n / 1e3) + 'K';
        return String(n);
    }

    buy(item) {
        const inv = this.inventory;
        const price = item.price || 0;
        if (inv.spendZen && !inv.spendZen(price)) { this._toast('Zen insuficiente'); return; }
        if (!inv.spendZen) {
            if ((inv.zen || 0) < price) { this._toast('Zen insuficiente'); return; }
            inv.zen -= price;
        }
        const copy = { ...item };
        delete copy.stock;
        const free = inv.grid ? inv.grid.indexOf(null) : -1;
        if (inv.grid) {
            if (free < 0) {
                // devolve o zen se não coube
                if (inv.addZen) inv.addZen(price); else inv.zen += price;
                this._toast('Inventário cheio');
                return;
            }
            inv.grid[free] = copy;
        }
        if (item.stock !== undefined && item.stock !== Infinity) {
            item.stock = Math.max(0, item.stock - 1);
        }
        this.refresh();
    }

    sell(item) {
        const inv = this.inventory;
        const gain = Math.floor((item.price || 0) * this.sellRate);
        if (inv.grid) {
            const i = inv.grid.indexOf(item);
            if (i >= 0) inv.grid[i] = null;
            else return;
        }
        if (inv.addZen) inv.addZen(gain); else inv.zen = (inv.zen || 0) + gain;
        this.refresh();
    }

    _toast(msg) {
        const t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = `
            position: absolute; left: 50%; bottom: 6px; transform: translateX(-50%);
            background: rgba(120,20,20,0.9); color: #fff; padding: 3px 10px; font-size: 10px;
            border-radius: 3px; pointer-events: none;
        `;
        this.body.appendChild(t);
        setTimeout(() => t.remove(), 1500);
    }

    refresh() {
        const inv = this.inventory;
        this.zenEl.textContent = `Seu Zen: ${(inv.zen || 0).toLocaleString()}`;
        this.tabBuy.style.background = this.tab === 'buy'
            ? 'linear-gradient(180deg,#54401e,#2a200e)' : '';
        this.tabSell.style.background = this.tab === 'sell'
            ? 'linear-gradient(180deg,#54401e,#2a200e)' : '';
        this.listEl.innerHTML = '';
        if (this.tab === 'buy') {
            for (const item of this.stock) {
                if (item.stock === 0) continue;
                this.listEl.appendChild(this._tile(item, 'buy'));
            }
        } else {
            const items = inv.grid ? inv.grid.filter(Boolean) : [];
            for (const item of items) this.listEl.appendChild(this._tile(item, 'sell'));
        }
    }
}
