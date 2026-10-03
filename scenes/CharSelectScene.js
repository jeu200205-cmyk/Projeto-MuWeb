// scenes/CharSelectScene.js — Seleção de personagem FIEL ao cliente PC.
//
// Port de CCharSelMainWin (CharSelMainWin.cpp) + CharacterList.lua (S13 real,
// Data/Configs/Lua/CharacterSystem/) + OpenCharacterSceneData (ZzzOpenData.cpp):
//   cha_id.OZT 346×38, deco.OZT 189×103, b_create/b_connect/b_delete 54×120
//   (4 frames de 54×30), server_menu_b_all 54×90 (3 frames).
//
// CONTRATOS (source PC):
//   CCharSelMainWin::Create (CharSelMainWin.cpp:38-62):
//     deco 189×103 (BITMAP_LOG_IN+2) | INFO bar (ScreenW-266)×21 preta alpha 143
//     CREATE b_create 54×30 4frames | MENU server_menu_b_all 54×30 3frames
//     CONNECT b_connect 54×30 4f | DELETE b_delete 54×30 4f
//     Win: 54*4 + infoW + 6 de largura × 30
//   CCharSelMainWin::SetPosition (CharSelMainWin.cpp):
//     CREATE (x,y) | MENU (x+55,y) | INFO (x+111,y+5)
//     DELETE (winR-54,y) | CONNECT (winR-109,y) | DECO (winR-167,y-59)
//     Win pos (UIMng.cpp): (22, 567/600*screenH - 41)
//   UpdateDisplay: CREATE enabled sse slot vazio; CONNECT/DELETE sse SelectedHero>-1
//   Slots (CharacterList.lua): 150×35 @ x=470+frame_cx, y=50+i*37;
//     sprites CharacterSelect_Button01/02/03.ozt 225×52, UV (0,0,0.878,0.82)
//     → fonte 197×42 esticada p/ 150×35; estados 01=normal 02=hover 03=selected.
//     Nome ouro (255,189,25) +18/+10 | Lv branco direita | Classe branca +18/+23
//     | Guild direita | vazio = "Sem personagem" (sort 3).
//   Personagem 3D real: CharactersClient renderizado pela engine na plataforma
//     (selected em (8590,18785,75) scale 1.15, demais (0,19210,175)).
//     Aqui é a UI 2D; o 3D vem da GameScene/PlayerComposer por trás (transparente).
//
// DADOS REAIS (ZERO placeholders): chars vêm de params.chars (lista real do
// GameServer — packet de char list, wiring do login real). Conta vazia = slots
// vazios "Sem personagem" (comportamento PC real). NADA de localStorage/fake.
//
// Eventos: 'enter-game' {char} | 'new-char' {} | 'delete-char' {char} | 'menu' {}
// Hooks E2E: [data-mu=char-slot][data-mu-char], botões por dataset.mu

import { MUSprites } from '../ui/MUSprites.js';
import { attachMuVirtualBoard } from '../ui/MUVirtualViewport.js';

// ---- Geometria dos contratos ----
const BTN_W = 54, BTN_H = 30;
const SLOT_W = 150, SLOT_H = 35, SLOT_X = 470, SLOT_Y0 = 50, SLOT_DY = 37;
const DEFAULT_MAX_SLOTS = 5;
const HARD_MAX_SLOTS = 10;
const PC_VISIBLE_CHARACTER_SLOTS = 5; // CreateCharacterScene/preview PC: slots físicos 0..4          // servidor real desta base reporta maxCharacter=10
const ID_W = 346, ID_H = 38;
const DECO_W = 189, DECO_H = 103;
const INFO_ALPHA = 143;            // SetAlpha(143)

// Cores (UIBaseDef.h + CharacterList.lua)
const COL_NAME = 'rgb(255,189,25)';
const COL_TEXT = 'rgb(255,255,255)';

// Cache de módulo
const cache = { loaded: false, loading: null, slotFrames: null };

export default class CharSelectScene {
  constructor() {
    this._listeners = {};
    this.el = null;
    this.chars = [];
    this.selected = -1;
    this._deletePending = false;
    this._deletePendingName = '';
    this._statusMessage = '';
    this._keyHandler = null;
    this.modal = null;
    this._slotEls = [];
    this.maxSlots = DEFAULT_MAX_SLOTS;
    this.listReceived = false;
    this._destroyed = false;
  }

  on(ev, cb) { (this._listeners[ev] = this._listeners[ev] || []).push(cb); return this; }
  emit(ev, data) { (this._listeners[ev] || []).forEach((cb) => cb(data)); }

  async mount(container) {
    this._destroyed = false;
    this.el = container;
    // TRANSPARENTE — o mundo 3D + personagens reais renderizam atrás (como no
    // PC: o preview É o modelo 3D na plataforma da cena de personagem)
    container.style.cssText += `
      background:transparent;
      font-family:Georgia,'Times New Roman',serif;color:#d8cfae;overflow:hidden;`;

    // Contrato único 800×600 sem distorção X/Y.
    this._viewport = attachMuVirtualBoard(container);
    const board = this._viewport.board;
    board.style.visibility = 'hidden'; // R15.3 atomic first paint: no half-loaded PC UI
    this.board = board;

    // ---- cha_id.OZT 346×38 topo central (ID da conta) ----
    const idPanel = document.createElement('div');
    idPanel.className = 'cha-id';
    idPanel.style.cssText = `position:absolute;left:${(800 - ID_W) / 2}px;top:2px;
      width:${ID_W}px;height:${ID_H}px;background-size:100% 100%;
      display:flex;align-items:center;justify-content:center;text-shadow:1px 1px 2px #000;`;
    this.idText = document.createElement('span');
    this.idText.style.cssText = `font-size:13px;color:#ffe6b0;letter-spacing:1px;`;
    idPanel.appendChild(this.idText);
    board.appendChild(idPanel);

    // ---- Slots (CharacterList.lua) ----
    this.slotCol = document.createElement('div');
    this.slotCol.style.cssText = `position:absolute;left:${SLOT_X}px;top:${SLOT_Y0}px;`;
    board.appendChild(this.slotCol);

    // ---- Barra inferior (CCharSelMainWin) ----
    const winX = 22;                                 // UIMng.cpp
    const winY = Math.floor(567 / 600 * 600) - 41;   // (567/600*screenH)-41
    this.mainWin = { x: winX, y: winY };
    const infoW = 800 - 266;                         // CSMW_SPR_INFO (ScreenW-266)
    const winW = BTN_W * 4 + infoW + 6;              // CWin width
    const winR = winX + winW;
    this._buildMainWin(board, winX, winY, infoW, winR);

    this._keyHandler = (e) => this._onKey(e);
    document.addEventListener('keydown', this._keyHandler);

    // Assets reais: aguarda antes do primeiro paint para não mostrar slots e
    // botões sem textura durante a chegada simultânea do F3:00.
    let assetsReady = await this._loadAssets();
    // R26: retry once because rejected canonical decodes are intentionally not
    // poison-cached. Hard-missing authored owners still remain fail-closed.
    if (!assetsReady && !this._destroyed) assetsReady = await this._loadAssets();
    if (this._destroyed) return false;
    if (assetsReady) {
      board.style.visibility = 'visible';
      board.dataset.muFirstPaint = 'complete';
    } else {
      board.dataset.muFirstPaint = 'blocked-missing-owner';
      console.warn('[CharSelect] atomic first paint BLOQUEADO: owner PC real ausente.');
    }
  }

  _buildMainWin(board, winX, winY, infoW, winR) {
    const mkBtn = (key, x, y, title, onClick) => {
      const b = document.createElement('div');
      b.dataset.mu = key;
      b.title = title;
      // z-index 3: paridade painter-order do PC (CharSelMainWin.cpp
      // RenderControls desenha a deco 189×103 PRIMEIRO e os botões por
      // cima). No DOM a deco é appendada depois dos botões (ordem de
      // criação), então sem z-index ela cobria Conectar/Deletar —
      // vision 8faad932: "decorative flourish renders on top of buttons".
      b.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${BTN_W}px;height:${BTN_H}px;
        cursor:pointer;background-size:100% 100%;user-select:none;z-index:3;`;
      b.onmouseenter = () => this._applyBtnState(b, key, 'active');
      b.onmouseleave = () => this._applyBtnState(b, key, 'up');
      b.onclick = onClick;
      board.appendChild(b);
      this._applyBtnState(b, key, 'up');
      return b;
    };

    // CREATE (x,y) | MENU (x+55,y) | INFO (x+111,y+5) — SetPosition
    this.btnCreate = mkBtn('btnCreate', winX, winY, 'Criar personagem', () => this.emit('new-char', {}));
    this.btnMenu = mkBtn('btnMenu', winX + BTN_W + 1, winY, 'Menu', () => this.emit('menu', {}));
    const info = document.createElement('div');
    info.className = 'info-bar';
    info.style.cssText = `position:absolute;left:${winX + BTN_W * 2 + 2}px;top:${winY + 5}px;
      width:${infoW}px;height:21px;background:rgba(0,0,0,${INFO_ALPHA / 255});
      display:flex;align-items:center;padding:0 10px;font-size:12px;color:#cfc29c;
      letter-spacing:1px;overflow:hidden;white-space:nowrap;`;
    this.infoBar = info;
    board.appendChild(info);
    // DELETE (winR-54,y) | CONNECT (winR-109,y) | DECO (winR-167,y-59)
    this.btnDelete = mkBtn('btnDelete', winR - BTN_W, winY, 'Deletar personagem', () => this._askDelete());
    this.btnConnect = mkBtn('btnConnect', winR - (BTN_W * 2 + 1), winY, 'Entrar no jogo', () => this._enterGame());
    const deco = document.createElement('div');
    deco.className = 'deco';
    deco.style.cssText = `position:absolute;left:${winR - (DECO_W - 22)}px;top:${winY - 59}px;
      width:${DECO_W}px;height:${DECO_H}px;background-size:100% 100%;pointer-events:none;`;
    board.appendChild(deco);
    this.decoEl = deco;
  }

  _applyBtnState(el, key, state) {
    const frames = MUSprites.frames(key);
    if (!frames) return;
    const idx = state === 'down' ? 2 : state === 'active' ? 1 : 0;
    const url = frames[Math.min(idx, frames.length - 1)];
    if (url) el.style.backgroundImage = `url("${url}")`;
  }

  async _loadAssets() {
    await MUSprites.load().catch(() => {});
    if (cache.loaded) { this._applyAssets(); return this._ownersReady(); }
    if (cache.loading) { await cache.loading; this._applyAssets(); return this._ownersReady(); }
    cache.loading = (async () => {
      try {
        // CharacterSelect_Button01/02/03.ozt 225×52, UV (0,0,0.878,0.82)
        // → recorte fonte 197×42 exibido em 150×35 (CharacterList.lua)
        const states = ['Custom/Interface/CharacterSelect_Button01.ozt',
          'Custom/Interface/CharacterSelect_Button02.ozt',
          'Custom/Interface/CharacterSelect_Button03.ozt'];
        const decodedOwners = await Promise.all(states.map((p) => MUSprites.fetchDecodedImage(p)));
        cache.slotFrames = await Promise.all(decodedOwners.map(async (owner) => {
          if (!owner) return null;
          const sliced = await MUSprites.slice(owner, [{ x: 0, y: 0, w: 197, h: 42 }]);
          return sliced[0];
        }));
      } catch (e) {
        console.warn('[CharSelect] slot sprites incompletos:', e?.message || e);
        cache.slotFrames = [null, null, null];
      }
      cache.loaded = this._ownersReady();
    })();
    try { await cache.loading; } finally { cache.loading = null; }
    this._applyAssets();
    return this._ownersReady();
  }

  _ownersReady() {
    return Boolean(
      cache.slotFrames?.length === 3 && cache.slotFrames.every(Boolean) &&
      MUSprites.get('chaId') && MUSprites.get('deco') &&
      MUSprites.frames('btnCreate')?.[0] && MUSprites.frames('btnDelete')?.[0] &&
      MUSprites.frames('btnConnect')?.[0]
    );
  }

  _applyAssets() {
    if (!this.el || !this.el.isConnected) return;
    const chaId = MUSprites.get('chaId');
    const idEl = this.board.querySelector('.cha-id');
    if (chaId && idEl) idEl.style.backgroundImage = `url("${chaId}")`;
    const deco = MUSprites.get('deco');
    if (deco) this.decoEl.style.backgroundImage = `url("${deco}")`;
    for (const [el, key] of [[this.btnCreate, 'btnCreate'], [this.btnMenu, 'btnMenu'],
      [this.btnConnect, 'btnConnect'], [this.btnDelete, 'btnDelete']]) {
      if (el) this._applyBtnState(el, key, 'up');
    }
    this._render();
  }

  async show(params = {}) {
    this._accountId = params.accountId || '';
    this.idText.textContent = this._accountId ? 'ID: ' + this._accountId : '';
    // Dados REAIS: lista de chars do GameServer (via GameApp após login real).
    // Conta sem chars (ou login offline) = slots vazios "Sem personagem".
    this.accountMaxSlots = Math.max(1, Math.min(HARD_MAX_SLOTS, Number(params.maxCharacter) || DEFAULT_MAX_SLOTS));
    this.maxSlots = Math.min(PC_VISIBLE_CHARACTER_SLOTS, this.accountMaxSlots);
    this.listReceived = Boolean(params.listReceived);
    this._setCharsFromServer(params.chars || []);
  }

  /** Lista atualizada pelo GameApp quando o packet real do GS chega. */
  setChars(chars, maxCharacter = this.maxSlots) {
    this.accountMaxSlots = Math.max(1, Math.min(HARD_MAX_SLOTS, Number(maxCharacter) || DEFAULT_MAX_SLOTS));
    this.maxSlots = Math.min(PC_VISIBLE_CHARACTER_SLOTS, this.accountMaxSlots);
    this.listReceived = true;
    this._setCharsFromServer(chars || []);
  }

  _setCharsFromServer(chars) {
    const normalized = Array(this.maxSlots).fill(null);
    for (const c of (Array.isArray(chars) ? chars : [])) {
      const slot = Number.isInteger(c?.slot) ? c.slot : normalized.findIndex((v) => v == null);
      if (slot >= 0 && slot < normalized.length) normalized[slot] = c;
    }
    this.chars = normalized;
    // R73: server list reception must NOT manufacture a UI selection. The PC
    // CharacterList window only marks a slot selected after an explicit click.
    // If the previously selected slot disappeared (delete/list refresh), clear it.
    if (this.selected < 0 || !this.chars[this.selected]) this.selected = -1;
    this._render();
  }

  hide() {}
  dispose() {
    this._destroyed = true;
    if (this.board) this.board.style.visibility = 'hidden';
    this._stopRotate();
    if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
    this._viewport?.dispose();
    this._viewport = null;
  }
  update() {}

  _render() {
    if (this._destroyed || !this.slotCol) return;
    this.slotCol.innerHTML = '';
    this._slotEls = [];
    const [normal, hover, sel] = cache.slotFrames || [null, null, null];
    for (let i = 0; i < this.maxSlots; i++) {
      const c = this.chars[i];
      const active = i === this.selected;
      const slot = document.createElement('div');
      slot.dataset.mu = 'char-slot';
      slot.dataset.muChar = c ? c.name : '';
      slot.style.cssText = `position:absolute;left:0;top:${i * SLOT_DY}px;
        width:${SLOT_W}px;height:${SLOT_H}px;background-size:100% 100%;
        cursor:${c ? 'pointer' : 'default'};user-select:none;`;
      const bg = active ? (sel || normal) : normal;
      if (bg) slot.style.backgroundImage = `url("${bg}")`;
      if (c) {
        const inner = document.createElement('div');
        inner.style.cssText = `position:absolute;inset:0;font-size:11px;
          text-shadow:1px 1px 2px #000;line-height:1;`;
        // Nome ouro +18/+10 (CharacterList.lua)
        const name = document.createElement('div');
        name.textContent = c.name;
        name.style.cssText = `position:absolute;left:18px;top:10px;color:${COL_NAME};`;
        // Lv branco à direita
        const lv = document.createElement('div');
        lv.textContent = 'Lv ' + (c.level || 1);
        lv.style.cssText = `position:absolute;right:8px;top:10px;color:${COL_TEXT};`;
        // Classe branca +18/+23
        const cls = document.createElement('div');
        cls.textContent = c.className || '';
        cls.style.cssText = `position:absolute;left:18px;top:23px;color:${COL_TEXT};`;
        // Guild à direita +23
        const guild = document.createElement('div');
        guild.textContent = c.guild || '';
        guild.style.cssText = `position:absolute;right:8px;top:23px;color:${COL_TEXT};`;
        inner.append(name, lv, cls, guild);
        slot.appendChild(inner);
        // PC (CharacterList.lua UpdateProc): clique seleciona + SetCharacterAction(207);
        // segurar LButton no slot → CharacterRotate (+5°/frame).
        slot.onclick = () => this._select(i);
        slot.onpointerdown = (e) => { e.preventDefault(); this._startRotate(i); };
        slot.onpointerup = () => this._stopRotate();
        slot.onpointerleave = () => this._stopRotate();
        if (!active && hover) {
          slot.onmouseenter = () => { slot.style.backgroundImage = `url("${hover}")`; };
          slot.onmouseleave = () => { slot.style.backgroundImage = `url("${normal}")`; };
        }
      } else {
        // "Sem personagem" central (RenderText3 sort 3)
        const empty = document.createElement('div');
        empty.textContent = this.listReceived ? 'Sem personagem' : 'Aguardando servidor…';
        empty.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;
          justify-content:center;color:${COL_TEXT};opacity:.85;text-shadow:1px 1px 2px #000;`;
        slot.appendChild(empty);
      }
      this.slotCol.appendChild(slot);
      this._slotEls.push(slot);
    }

    // UpdateDisplay: CREATE sse slot vazio; CONNECT/DELETE sse hero selecionado
    const hasEmpty = this.listReceived && this.chars.some((c) => !c);
    const hasSel = this.selected > -1 && Boolean(this.chars[this.selected]);
    const busy = this._deletePending === true;
    this._setEnabled(this.btnCreate, hasEmpty && !busy);
    this._setEnabled(this.btnConnect, hasSel && !busy);
    this._setEnabled(this.btnDelete, hasSel && !busy);
    if (this.infoBar) {
      const c = this.chars[this.selected];
      this.infoBar.textContent = this._statusMessage || (busy
        ? `Excluindo ${this._deletePendingName || 'personagem'}… aguardando servidor`
        : (hasSel && c
          ? `${c.name} — ${c.className || ''} Lv ${c.level || 1}`
          : 'Selecione um personagem'));
    }
  }

  _setEnabled(el, enabled) {
    if (!el) return;
    el.style.opacity = enabled ? 1 : 0.4;
    el.style.pointerEvents = enabled ? 'auto' : 'none';
  }

  // --- ações ---
  /** Seleção de slot (UpdateProc ClickedButton): UI + evento p/ preview 3D. */
  _select(i) {
    if (!this.chars[i]) return;
    this.selected = i;
    this._render();
    this.emit('select', { index: i, slot: this.chars[i].slot ?? i, char: this.chars[i] });
  }

  // CharacterRotate: enquanto segura o ponteiro no slot, +5°/frame no modelo
  _startRotate(i) {
    this._stopRotate();
    this._rotating = { i, timer: setInterval(() => {
      if (this.chars[this._rotating.i]) this.emit('rotate', { index: this._rotating.i, slot: this.chars[this._rotating.i]?.slot ?? this._rotating.i, delta: 5 });
    }, 1000 / 30) }; // ~30fps como o UpdateProc por frame
  }
  _stopRotate() {
    if (this._rotating) { clearInterval(this._rotating.timer); this._rotating = null; }
  }

  _enterGame() {
    const c = this.chars[this.selected];
    if (!c) return;
    this.emit('enter-game', { char: c });
  }

  _askDelete() {
    const c = this.chars[this.selected];
    if (!c || this.modal) return;
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:absolute;inset:0;background:rgba(0,0,0,0.7);z-index:100;
      display:flex;align-items:center;justify-content:center;`;
    const box = document.createElement('div');
    box.style.cssText = `width:320px;padding:22px 26px;background:rgba(10,8,20,0.95);
      border:1px solid #c9a22785;text-align:center;font-size:14px;`;
    box.innerHTML = `
      <div style="color:#c96f6f;font-size:16px;letter-spacing:2px;margin-bottom:10px">DELETAR PERSONAGEM</div>
      <div style="color:#cfc29c;margin-bottom:10px">Apagar <b>${this._esc(c.name)}</b> permanentemente?</div>
      <div style="color:#a99f82;font-size:11px;margin-bottom:5px">Código de segurança / senha do servidor</div>`;
    const security = document.createElement('input');
    security.type = 'password';
    security.maxLength = 20;
    security.autocomplete = 'off';
    security.spellcheck = false;
    security.dataset.mu = 'delete-security';
    security.style.cssText = 'width:210px;height:24px;margin:0 auto 14px;display:block;background:#090b10;color:#eee;border:1px solid #806f46;padding:0 7px;box-sizing:border-box;';
    box.appendChild(security);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;justify-content:center;';
    const mk = (key, fn) => {
      const el = document.createElement('div');
      el.style.cssText = 'width:54px;height:30px;background-size:100% 100%;cursor:pointer;';
      const frames = MUSprites.frames(key);
      if (frames && frames[0]) el.style.backgroundImage = `url("${frames[0]}")`;
      el.onclick = fn;
      return el;
    };
    row.appendChild(mk('btnOk', () => this._doDelete(c, security.value)));
    row.appendChild(mk('btnCancel', () => this._closeModal()));
    box.appendChild(row);
    overlay.appendChild(box);
    this.el.appendChild(overlay);
    this.modal = overlay;
    requestAnimationFrame(() => security.focus());
  }

  _doDelete(c, security = '') {
    if (this._deletePending) return;
    this._deletePending = true;
    this._deletePendingName = String(c?.name || '');
    this._statusMessage = '';
    // Never log/store the security field. It is forwarded only into the exact
    // F3:02 request field (20 bytes max) by GameApp.
    this.emit('delete-char', { char: c, security: String(security || '').slice(0, 20) });
    // Não remover localmente antes da resposta autoritativa; a próxima F3:00
    // recompõe os slots reais e evita deslocar índices/slots com buracos.
    this._closeModal();
    this._render();
  }

  setDeletePending(pending, name = '') {
    this._deletePending = Boolean(pending);
    this._deletePendingName = this._deletePending ? String(name || this._deletePendingName || '') : '';
    this._render();
  }

  showDeleteResult(result, name = '') {
    const code = Number(result);
    const target = String(name || this._deletePendingName || 'personagem');
    this._deletePending = false;
    this._deletePendingName = '';
    if (code === 1) {
      this.selected = -1;
      this._statusMessage = `${target} deletado com sucesso. Atualizando lista…`;
      this._render();
      return;
    }
    this._statusMessage = '';
    this._render();
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:absolute;inset:0;background:rgba(0,0,0,0.7);z-index:101;display:flex;align-items:center;justify-content:center;`;
    const box = document.createElement('div');
    box.style.cssText = `width:340px;padding:22px 26px;background:rgba(10,8,20,0.97);border:1px solid #c9a22785;text-align:center;font-size:13px;color:#cfc29c;`;
    const reason = code === 2
      ? 'Código de segurança/senha incorreto.'
      : 'O servidor recusou a exclusão do personagem.';
    box.innerHTML = `<div style="color:#c96f6f;font-size:15px;letter-spacing:1px;margin-bottom:10px">NÃO FOI POSSÍVEL DELETAR</div><div>${this._esc(reason)}</div><div style="opacity:.7;margin-top:8px">Código do servidor: ${Number.isFinite(code) ? code : '?'}</div>`;
    const ok = document.createElement('button');
    ok.textContent = 'OK';
    ok.style.cssText = 'margin-top:16px;min-width:70px;height:28px;background:#17130d;color:#d7c899;border:1px solid #806f46;cursor:pointer;';
    ok.onclick = () => this._closeModal();
    box.appendChild(ok); overlay.appendChild(box); this.el.appendChild(overlay); this.modal = overlay;
  }

  showDeleteTransportError(message = '') {
    this._deletePending = false;
    this._deletePendingName = '';
    this._statusMessage = message ? `Falha ao enviar delete: ${message}` : 'Falha ao enviar delete ao servidor.';
    this._render();
  }

  _closeModal() {
    if (this.modal) { this.modal.remove(); this.modal = null; }
  }

  _esc(s) {
    const A = String.fromCharCode(38);
    const map = { '&': A + 'amp;', '<': A + 'lt;', '>': A + 'gt;', '"': A + 'quot;' };
    return String(s).replace(/[&<>"]/g, (ch) => map[ch]);
  }

  _onKey(e) {
    if (this.modal) { if (e.key === 'Escape') this._closeModal(); return; }
    if (e.key === 'ArrowUp') {
      for (let i = this.selected - 1; i >= 0; i--) { if (this.chars[i]) { this._select(i); break; } }
    }
    else if (e.key === 'ArrowDown') {
      for (let i = this.selected + 1; i < this.chars.length; i++) { if (this.chars[i]) { this._select(i); break; } }
    }
    else if (e.key === 'Enter') this._enterGame();
    else if (e.key === 'Delete') this._askDelete();
  }
}
