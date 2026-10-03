// social/Trade.js — Janela de trade 1x1 estilo MU Online: dois painéis de
// grid (minha oferta x oferta do outro), drag de itens do Inventory, zen,
// confirm/cancel e anti-scam (mudança do outro lado reseta meu confirm).
import { MUWindow } from '../ui2/MUWindow.js';
import { GRID_WIDTH, GRID_SIZE } from '../data/Inventory.js';

const TRADE_COLS = 4;
const TRADE_ROWS = 4;
const SLOT = 30; // px

export class TradeWindow extends MUWindow {
  /**
   * @param {Inventory} myInventory inventário local (fonte do drag)
   * @param {object} opts { selfName, partnerName, onComplete, onCancel }
   */
  constructor(myInventory, opts = {}) {
    super({ title: 'Trade', width: 2 * (TRADE_COLS * SLOT + 16) + 24, hotkey: null, x: 200, y: 80, ...opts });
    this.inventory = myInventory;
    this.selfName = opts.selfName || 'Você';
    this.partnerName = opts.partnerName || 'Parceiro';

    this.myOffer = new Array(TRADE_COLS * TRADE_ROWS).fill(null); // Item refs
    this.partnerOffer = new Array(TRADE_COLS * TRADE_ROWS).fill(null);
    this.myZen = 0;
    this.partnerZen = 0;
    this.myConfirmed = false;
    this.partnerConfirmed = false;

    this._listeners = {};
    this._build();
    this.inventory.on('change', () => this._renderInventoryStrip());
  }

  on(event, fn) { (this._listeners[event] = this._listeners[event] || []).push(fn); return () => this.off(event, fn); }
  off(event, fn) { const l = this._listeners[event]; if (l) this._listeners[event] = l.filter((f) => f !== fn); }
  emit(event, data) { for (const fn of (this._listeners[event] || []).slice()) fn(data); }

  _gridEl(items) {
    const g = document.createElement('div');
    g.style.cssText = `display:grid;grid-template-columns:repeat(${TRADE_COLS},${SLOT}px);gap:2px;background:#14100a;padding:4px;border:1px solid #4a3a1a;`;
    items.forEach((item, i) => {
      const cell = document.createElement('div');
      cell.style.cssText = `width:${SLOT}px;height:${SLOT}px;background:#221a10;border:1px solid #3a2e18;display:flex;align-items:center;justify-content:center;font-size:9px;color:#e8dcc0;text-align:center;`;
      cell.textContent = item ? (item.name || '?') : '';
      cell.title = item ? (item.name || '') : '';
      cell.dataset.slot = String(i);
      g.appendChild(cell);
    });
    return g;
  }

  _build() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:12px;';

    // Painel esquerdo: minha oferta
    const left = document.createElement('div');
    const lt = document.createElement('div');
    lt.textContent = this.selfName; lt.style.cssText = 'color:#f0d98c;margin-bottom:3px;';
    left.appendChild(lt);
    this.myGrid = this._gridEl(this.myOffer);
    left.appendChild(this.myGrid);
    const lz = document.createElement('div');
    lz.style.marginTop = '4px';
    lz.innerHTML = 'Zen: ';
    this.zenInput = document.createElement('input');
    this.zenInput.type = 'number'; this.zenInput.min = '0'; this.zenInput.value = '0';
    this.zenInput.style.cssText = 'width:90px;background:#1a140c;color:#f0d98c;border:1px solid #8a6d2f;padding:2px;';
    this.zenInput.onchange = () => this.setMyZen(parseInt(this.zenInput.value, 10) || 0);
    lz.appendChild(this.zenInput);
    left.appendChild(lz);
    wrap.appendChild(left);

    // Painel direito: oferta do outro
    const right = document.createElement('div');
    const rt = document.createElement('div');
    rt.textContent = this.partnerName; rt.style.cssText = 'color:#9ab;margin-bottom:3px;';
    right.appendChild(rt);
    this.partnerGrid = this._gridEl(this.partnerOffer);
    right.appendChild(this.partnerGrid);
    this.partnerZenLabel = document.createElement('div');
    this.partnerZenLabel.style.marginTop = '4px';
    this.partnerZenLabel.textContent = 'Zen: 0';
    right.appendChild(this.partnerZenLabel);
    wrap.appendChild(right);

    this.body.appendChild(wrap);

    // Faixa do inventário (fonte de drag)
    const invTitle = document.createElement('div');
    invTitle.textContent = 'Inventário (arraste p/ oferta):';
    invTitle.style.cssText = 'margin-top:8px;color:#9a8;';
    this.body.appendChild(invTitle);
    this.invStrip = document.createElement('div');
    this.body.appendChild(this.invStrip);
    this._renderInventoryStrip();

    // Botões
    const bar = document.createElement('div');
    bar.style.cssText = 'margin-top:8px;text-align:center;';
    this.confirmBtn = document.createElement('span');
    this.confirmBtn.className = 'mu-btn'; this.confirmBtn.textContent = 'Confirm';
    this.confirmBtn.onclick = () => this.confirm();
    const cancelBtn = document.createElement('span');
    cancelBtn.className = 'mu-btn'; cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => this.cancel();
    this.statusEl = document.createElement('div');
    this.statusEl.style.cssText = 'margin-top:4px;color:#9a8;min-height:14px;';
    bar.append(this.confirmBtn, cancelBtn);
    this.body.append(bar, this.statusEl);
  }

  _renderInventoryStrip() {
    this.invStrip.innerHTML = '';
    const strip = document.createElement('div');
    strip.style.cssText = 'display:grid;grid-template-columns:repeat(8,26px);gap:2px;background:#14100a;padding:4px;border:1px solid #4a3a1a;';
    this.inventory.grid.forEach((item, idx) => {
      const cell = document.createElement('div');
      cell.style.cssText = 'width:26px;height:26px;background:#221a10;border:1px solid #3a2e18;font-size:8px;color:#e8dcc0;display:flex;align-items:center;justify-content:center;text-align:center;';
      if (item) {
        cell.textContent = item.name || '?';
        cell.title = item.name || '';
        cell.draggable = true;
        cell.style.cursor = 'grab';
        cell.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', String(idx));
        });
      }
      strip.appendChild(cell);
    });
    // drop target: meu grid remove do inventário e põe na oferta
    this.myGrid.ondragover = (e) => e.preventDefault();
    this.myGrid.ondrop = (e) => {
      e.preventDefault();
      const idx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (!Number.isNaN(idx)) this.offerFromInventory(idx);
    };
    this.invStrip.innerHTML = '';
    this.invStrip.appendChild(strip);
  }

  /** Move item do inventário (por índice) para o primeiro slot livre da oferta. */
  offerFromInventory(invIndex) {
    if (this.myConfirmed) return false;
    const item = this.inventory.grid[invIndex];
    if (!item) return false;
    const slot = this.myOffer.indexOf(null);
    if (slot === -1) return false;
    this.inventory.removeItem(invIndex);
    this.myOffer[slot] = item;
    this._refreshGrids();
    this.emit('offerChanged', { side: 'self' });
    return true;
  }

  /** Devolve um item da oferta ao inventário. */
  unoffer(slot) {
    if (this.myConfirmed || !this.myOffer[slot]) return false;
    const item = this.myOffer[slot];
    if (this.inventory.addItem(item) === -1) return false;
    this.myOffer[slot] = null;
    this._refreshGrids();
    this.emit('offerChanged', { side: 'self' });
    return true;
  }

  setMyZen(amount) {
    if (this.myConfirmed) { this.zenInput.value = String(this.myZen); return false; }
    const v = Math.max(0, Math.min(amount, this.inventory.zen));
    this.myZen = v;
    this.zenInput.value = String(v);
    this.emit('offerChanged', { side: 'self' });
    return true;
  }

  /** Atualização remota da oferta do parceiro (rede). */
  setPartnerOffer(items, zen) {
    this.partnerOffer = items.slice(0, TRADE_COLS * TRADE_ROWS);
    this.partnerZen = Math.max(0, zen | 0);
    // ANTI-SCAM: outro lado mudou depois de eu confirmar -> reseta meu confirm
    if (this.myConfirmed) {
      this.myConfirmed = false;
      this._setStatus('Oferta do parceiro mudou — confirmação resetada.');
    }
    this._refreshGrids();
    this.emit('partnerChanged', {});
  }

  confirm() {
    if (this.myConfirmed) return;
    this.myConfirmed = true;
    this.confirmBtn.classList.add('disabled');
    this._setStatus('Você confirmou. Aguardando parceiro...');
    this.emit('confirmed', {});
    this._maybeComplete();
  }

  partnerConfirm() {
    this.partnerConfirmed = true;
    this._setStatus(`${this.partnerName} confirmou.`);
    this._maybeComplete();
  }

  _maybeComplete() {
    if (!this.myConfirmed || !this.partnerConfirmed) return;
    // Troca efetiva: meus itens/zen vão embora, os do parceiro entram.
    if (this.myZen > 0 && !this.inventory.spendZen(this.myZen)) {
      this._setStatus('Zen insuficiente! Trade cancelado.');
      this.cancel();
      return;
    }
    for (const item of this.partnerOffer) {
      if (item) this.inventory.addItem(item);
    }
    if (this.partnerZen > 0) this.inventory.addZen(this.partnerZen);
    const result = { given: this.myOffer.filter(Boolean), givenZen: this.myZen,
      received: this.partnerOffer.filter(Boolean), receivedZen: this.partnerZen };
    this.myOffer = []; this.partnerOffer = [];
    this.emit('tradeComplete', result);
    this._setStatus('Trade concluído!');
    this.hide();
  }

  cancel() {
    // Devolve meus itens ao inventário
    for (const item of this.myOffer) if (item) this.inventory.addItem(item);
    this.myOffer = new Array(TRADE_COLS * TRADE_ROWS).fill(null);
    this.myZen = 0;
    this.myConfirmed = false;
    this.partnerConfirmed = false;
    this.emit('tradeCancel', {});
    this._setStatus('Trade cancelado.');
    this.hide();
  }

  _refreshGrids() {
    const refresh = (gridEl, items) => {
      [...gridEl.children].forEach((cell, i) => {
        const item = items[i];
        cell.textContent = item ? (item.name || '?') : '';
        cell.title = item ? (item.name || '') : '';
      });
    };
    refresh(this.myGrid, this.myOffer);
    refresh(this.partnerGrid, this.partnerOffer);
    this.partnerZenLabel.textContent = `Zen: ${this.partnerZen}`;
  }

  _setStatus(msg) { this.statusEl.textContent = msg; }
}

export default TradeWindow;
