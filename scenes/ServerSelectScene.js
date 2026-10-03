// scenes/ServerSelectScene.js — Tela de seleção de servidores FIEL ao cliente PC.
//
// Port de CServerSelWin (ServerSelWin.cpp/.h) + UIMng.cpp:229-233 + ReceiveServerList
// (WSclient.cpp:310) + CServerListManager (ServerListManager.cpp).
//
// CONTRATOS (source PC):
//   Janela: CWin::Create(0,0,-2); SetSize((108+28)*2+193+150, 26*16+5*2+26+descH)
//   (ServerSelWin.cpp:87) → 615×504, centralizada (UIMng.cpp:231-233).
//   Grupos (cha_bt.OZT 108×104 = 4 frames de 108×26):
//     Create(108,26,BITMAP_LOG_IN,4,2,1,-1,3) — frames UP=0/ACTIVE=1/DOWN=2/DISABLE=3.
//     Coluna esquerda ×10, direita ×10 (SSW_*_SERVER_G_MAX), botão central = test server.
//   Servidores (server_b2_all.OZT 193×78 = 3 frames de 193×26): Create(193,26,+1,3,2,1).
//   Gauge (server_b2_loding.OZJ 160×4) em +16/+19 dentro do botão (SSW_GB_POS_X/Y).
//   Deco (server_deco_all.OZT 159×95): 2 sprites 68×95 (x=0 e x=68) nos grupos
//     extremos; setas 23×29 em x=136 (y=0 aponta →, y=30 aponta ←).
//   Descrição (WinEx): server_ex03 4×4 tile centro, server_ex01 512×6 topo/fundo,
//     server_ex02 3×4 laterais ×10 linhas → 512×52.
//   Registrar: BITMAP_BUTTON (message_ok_b_all.OZT) esticado 100×25, texto central
//   (ServerSelWin.cpp RenderControls:511-528 — hover amarelo, normal branco).
//   Cores (UIBaseDef.h:10-16): BR_GRAY 226,226,226 | WHITE | YELLOW 255,255,121 |
//     BR_YELLOW 255,238,193 | ORANGE 255,180,0 | BR_ORANGE 255,217,39.
//   Nome do servidor: "%s-%d %s" (ServerListManager.cpp InsertServer — grupo,
//     índice + GlobalText[560-562] status; sufixo textual PENDENTE — GlobalText
//     560-562 não encontrado nos Text_*.bmd do cliente; o load segue visível no
//     gauge como no PC). NonPvP=2/3: "[%s-%d(PvP Ouro) Servidor]" / "(Ouro)"
//     (Text_por.bmd keys 58/59 — EXTRAÍDOS DO CLIENTE REAL, decodificados BuxCode).
//
// DADOS REAIS (ZERO placeholders):
//   - Grupos: Data/Local/ServerList.bmd decodificado (BuxCode XOR fc cf ab, struct
//     53B — verificado byte a byte: Trade-bau/Sala-Spot/Midgard LEFT, TEST CENTER).
//   - Servidores: pacote F4:06 do ConnectServer REAL via gateway (CS 127.0.0.1:44405
//     respondido com lista real em teste). Fiel ao PC: sem F4:06 a janela não aparece
//     (ReceiveServerList → ShowWin; UpdateDisplay: m_icntServerGroup<1 → vazio).
//
// Eventos:
//   'request-server-list' {} — click em grupo → SendRequestServerList (C1 04 F4 06)
//   'server-selected' {server, group} — click em servidor (percent<100) → F4:03 → login

import { ServerListData } from '../data/ServerListData.js';
import { MUSprites } from '../ui/MUSprites.js';
import { attachMuVirtualBoard } from '../ui/MUVirtualViewport.js';

// ---- Geometria do contrato C++ (ServerSelWin.cpp/.h) ----
const GB_W = 108, GB_H = 26;                    // SERVER_GROUP_BTN_*
const SB_W = 193, SB_H = 26;                    // SERVER_BTN_*
const GAUGE_W = 160, GAUGE_H = 4;
const GAP_W = 28, GAP_H = 5;                    // SSW_GAP_*
const GB_POS_X = 16, GB_POS_Y = 19;              // SSW_GB_POS_* (gauge no botão)
const DESC_LINES = 10, DESC_W = 512;
const DESC_TOP_H = 6, DESC_BOT_H = 6, DESC_SIDE_W = 3, DESC_SIDE_H = 4;
const DESC_H = DESC_TOP_H + DESC_BOT_H + DESC_LINES * DESC_SIDE_H; // 52
const WIN_W = (GB_W + GAP_W) * 2 + SB_W + 150;  // 615 (ServerSelWin.cpp:87)
const WIN_H = SB_H * 16 + GAP_H * 2 + GB_H + DESC_H; // 504

export function computeServerSelectColumns(winX = 0) {
  // A source PC atual e o port mobile copiam literalmente duas fórmulas que
  // se contradizem geometricamente: leftX=centro da janela, rightX calculado
  // desde winX e serverX calculado desde leftX. Com 108/193/28 isso produz
  // server=481..674 e right=449..557 em 800x600 — overlap físico comprovado.
  // O usuário também reproduziu esse overlap no browser. Aqui corrigimos o
  // BUG DA BASE mantendo os mesmos sprites/gaps/ordem, apenas encaixando as
  // três colunas dentro dos 615 px sem interseção. Não é coordenada inventada:
  // deriva exclusivamente de GB_W/SB_W/GAP_W/WIN_W da própria CServerSelWin.
  const contentW = GB_W * 2 + SB_W + GAP_W * 2;
  const margin = Math.floor((WIN_W - contentW) / 2);
  const leftX = winX + margin;
  const serverX = leftX + GB_W + GAP_W;
  const rightX = serverX + SB_W + GAP_W;
  return { leftX, serverX, rightX, winRight: winX + WIN_W };
}

// ---- Cores reais (UIBaseDef.h:10-16) ----
const C = {
  brGray: 'rgb(226,226,226)',
  white: 'rgb(255,255,255)',
  yellow: 'rgb(255,255,121)',
  brYellow: 'rgb(255,238,193)',
  orange: 'rgb(255,180,0)',
  brOrange: 'rgb(255,217,39)',
};
// adwServerBtnClr (ServerSelWin.cpp:209-215) por m_byNonPvP — [UP, DOWN, ACTIVE]
const BTN_TEXT = [
  [C.brGray, C.brGray, C.white],      // 0: PvP normal
  [C.yellow, C.yellow, C.brYellow],   // 1: Non-PVP
  [C.orange, C.orange, C.brOrange],   // 2: PvP Ouro
  [C.orange, C.orange, C.brOrange],  // 3: Ouro
];
// adwServerGBtnClr (ServerSelWin.cpp:88) — [UP, DOWN, ACTIVE, DISABLE]
const GB_TEXT = [C.brGray, C.brGray, C.white, null];

// Cache de módulo (cena recriada a cada switch — assets/estado preservados)
const cache = { loaded: false, loading: null, frames: null };

export default class ServerSelectScene {
  constructor() {
    this._listeners = {};
    this.el = null;
    this.selectedGroup = null;   // grupo com SetCheck(true)
    this._groupEls = [];         // [{el, group, kind}]
    this._serverEls = [];        // [{el, gauge, server, group}]
    this._statusEl = null;
    this._destroyed = false;
  }

  on(ev, cb) { (this._listeners[ev] = this._listeners[ev] || []).push(cb); return this; }
  emit(ev, data) { (this._listeners[ev] || []).forEach((cb) => cb(data)); }

  async mount(container) {
    this._destroyed = false;
    this.el = container;
    // TRANSPARENTE — o 3D real (World95 + câmera SceneLogin) renderiza atrás,
    // igual ao PC: CServerSelWin não tem sprite de fundo (CWin::Create(0,0,-2)).
    container.style.cssText += `
      background:transparent;
      font-family:Georgia,'Times New Roman',serif;
      overflow:hidden;`;

    // Contrato único 800×600, aspect-preserving. O stretch X/Y antigo
    // distorcia e deslocava os controles em 16:9.
    this._viewport = attachMuVirtualBoard(container);
    const board = this._viewport.board;
    board.style.visibility = 'hidden'; // R15.3 atomic first paint: no half-loaded PC UI
    this.board = board;

    // Janela CServerSelWin centralizada (UIMng.cpp:231-233)
    const winX = Math.floor((800 - WIN_W) / 2);   // 92
    const winY = Math.floor((600 - WIN_H) / 2);   // 48
    this.winX = winX; this.winY = winY;
    const win = document.createElement('div');
    win.style.cssText = `position:absolute;left:${winX}px;top:${winY}px;width:${WIN_W}px;height:${WIN_H}px;`;
    board.appendChild(win);
    this.winEl = win;

    // Janela de descrição (WinEx 512×52)
    this._buildDescription(win);

    // Botão Registrar (100×25 — RenderControls 511-528)
    this._buildRegister(win);

    // Status (antes do F4:06 chegar — fiel: janela só surge com lista real)
    this._statusEl = document.createElement('div');
    this._statusEl.style.cssText =
      `position:absolute;left:0;top:0;width:800px;text-align:center;color:${C.brGray};
       font-size:12px;letter-spacing:1px;text-shadow:1px 1px 2px #000;`;
    board.appendChild(this._statusEl);

    // Assets reais: R13 aguarda o preload compartilhado antes do primeiro
    // paint da janela. Evita grupos/botões vazios na transição rápida.
    const assetsReady = this._loadAssets();

    // Dados reais: script ServerList.bmd (grupos) — servidores vêm do F4:06
    let [, ownersReady] = await Promise.all([ServerListData.loadScript(), assetsReady]);
    // R26: bounded retry only after a failed atomic owner join. RemoteAssets drops
    // rejected decode promises, so a transient first fetch can recover here.
    if (!ownersReady && !this._destroyed) ownersReady = await this._loadAssets();
    if (this._destroyed) return false;
    this._render();
    if (ownersReady) {
      board.style.visibility = 'visible';
      board.dataset.muFirstPaint = 'complete';
    } else {
      board.dataset.muFirstPaint = 'blocked-missing-owner';
      console.warn('[ServerSelect] atomic first paint BLOQUEADO: owner PC real ausente.');
    }
  }

  show() { if (!this._destroyed) this._render(); }
  dispose() {
    this._destroyed = true;
    if (this.board) this.board.style.visibility = 'hidden';
    this._viewport?.dispose();
    this._viewport = null;
  }

  /** F4:06 chegou (GameApp.onServerList chama) — UpdateDisplay. */
  onServerList() { if (!this._destroyed) this._render(); }

  setConnectionStatus(text = '') {
    if (!this._destroyed && this._statusEl) this._statusEl.textContent = text;
  }

  // ------------------------------------------------------------------
  // Assets reais (uma vez por sessão)
  // ------------------------------------------------------------------
  async _loadAssets() {
    if (cache.loaded) { this._applyFrames(); return this._ownersReady(); }
    if (cache.loading) { await cache.loading; this._applyFrames(); return this._ownersReady(); }
    cache.loading = (async () => {
    try {
      // Junta o preload global para que os strips canônicos já estejam prontos.
      await MUSprites.load();
      const [groupFrames, serverFrames, gauge, deco, regBtn, ex03, ex02] = await Promise.all([
        MUSprites.stripFrames('serverGroupBtn', GB_W, GB_H), // cha_bt 4 frames
        MUSprites.stripFrames('serverBtn', SB_W, SB_H),      // server_b2_all 3 frames
        MUSprites.fetchDecodedImage('Interface/server_b2_loding.OZJ'),
        MUSprites.fetchDecodedImage('Interface/server_deco_all.OZT'),
        MUSprites.stripFrames('btnOk', 54, 30),               // message_ok 3 frames
        MUSprites.fetchDecodedImage('Interface/server_ex03.OZT'), // 4×4 tile
        MUSprites.fetchDecodedImage('Interface/server_ex02.OZJ'), // 3×4 lateral
      ]);
      // Slices do server_deco_all (159×95): deco L/R (68×95) + setas (23×29)
      const decoSlices = deco ? await MUSprites.slice(deco, [
        { x: 0, y: 0, w: 68, h: 95 },
        { x: 68, y: 0, w: 68, h: 95 },
        { x: 136, y: 0, w: 23, h: 29 },
        { x: 136, y: 30, w: 23, h: 29 },
      ]) : [];
      // server_ex01 (512×12): topo/fundo de 512×6
      const ex01 = await MUSprites.fetchDecodedImage('Interface/server_ex01.OZT');
      const ex01slices = ex01 ? await MUSprites.slice(ex01, [
        { x: 0, y: 0, w: 512, h: 6 }, { x: 0, y: 6, w: 512, h: 6 },
      ]) : [];
      cache.frames = {
        group: groupFrames, server: serverFrames, gauge: gauge?.url || null,
        deco0: decoSlices[0], deco1: decoSlices[1],
        arrow0: decoSlices[2], arrow1: decoSlices[3],
        regBtn, ex03: ex03?.url || null, ex01top: ex01slices[0], ex01bot: ex01slices[1], ex02: ex02?.url || null,
      };
      cache.loaded = this._ownersReady();
    } catch (e) {
      console.warn('[ServerSelect] assets reais incompletos:', e?.message || e);
      cache.loaded = false; // retryable by the bounded first-paint join; never per-frame
    }
    })();
    try { await cache.loading; } finally { cache.loading = null; }
    this._applyFrames();
    return this._ownersReady();
  }

  _ownersReady() {
    const f = cache.frames;
    return Boolean(f && f.group?.[0] && f.server?.[0] && f.gauge &&
      f.deco0 && f.deco1 && f.arrow0 && f.arrow1 && f.regBtn?.[0] &&
      f.ex03 && f.ex01top && f.ex01bot && f.ex02);
  }

  _applyFrames() {
    if (!cache.frames || !this.winEl) return;
    const f = cache.frames;
    const set = (sel, url, rep) => {
      const el = this.winEl.querySelector(sel);
      if (el && url) { el.style.backgroundImage = `url("${url}")`; el.style.backgroundRepeat = rep || 'no-repeat'; }
    };
    set('.desc-center', f.ex03, 'repeat');
    set('.desc-top', f.ex01top); set('.desc-bottom', f.ex01bot);
    set('.desc-left', f.ex02, 'repeat-y'); set('.desc-right', f.ex02, 'repeat-y');
    if (f.regBtn && f.regBtn[0]) {
      const b = this.winEl.querySelector('.reg-btn');
      if (b) b.style.backgroundImage = `url("${f.regBtn[0]}")`;
    }
    this._render(true);
  }

  // ------------------------------------------------------------------
  // Janela de descrição (CWinEx)
  // ------------------------------------------------------------------
  _buildDescription(win) {
    const x = Math.floor((WIN_W - DESC_W) / 2);       // centrada na win
    const y = WIN_H - DESC_H;                         // bottom
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;left:${x}px;top:${y}px;
      width:${DESC_W}px;height:${DESC_H}px;pointer-events:none;`;
    const mk = (cls, css) => {
      const e = document.createElement('div');
      e.className = cls;
      e.style.cssText = css + ';background-size:100% 100%;';
      d.appendChild(e); return e;
    };
    mk('desc-top', `position:absolute;left:0;top:0;width:${DESC_W}px;height:${DESC_TOP_H}px;`);
    mk('desc-bottom', `position:absolute;left:0;bottom:0;width:${DESC_W}px;height:${DESC_BOT_H}px;`);
    mk('desc-left', `position:absolute;left:0;top:${DESC_TOP_H}px;width:${DESC_SIDE_W}px;height:${DESC_LINES * DESC_SIDE_H}px;background-size:100% 4px;`);
    mk('desc-right', `position:absolute;right:0;top:${DESC_TOP_H}px;width:${DESC_SIDE_W}px;height:${DESC_LINES * DESC_SIDE_H}px;background-size:100% 4px;`);
    mk('desc-center', `position:absolute;left:3px;top:3px;width:${DESC_W - 6}px;height:${DESC_H - 6}px;background-size:4px 4px;`);
    this.descText = document.createElement('div');
    this.descText.style.cssText =
      `position:absolute;left:10px;top:7px;width:${DESC_W - 20}px;height:${DESC_H - 12}px;
       color:${C.white};font-size:11px;line-height:15px;text-shadow:1px 1px 1px #000;white-space:pre;`;
    d.appendChild(this.descText);
    win.appendChild(d);
  }

  // ------------------------------------------------------------------
  // Botão Registrar
  // ------------------------------------------------------------------
  _buildRegister(win) {
    const x = 10;
    const y = WIN_H - DESC_H - 25 - 20;
    const b = document.createElement('div');
    b.className = 'reg-btn';
    b.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:100px;height:25px;
      cursor:pointer;display:flex;align-items:center;justify-content:center;
      font-size:11px;color:${C.white};text-shadow:1px 1px 2px #000;background-size:100% 100%;`;
    b.textContent = 'Registrar';
    b.onmouseenter = () => { b.style.color = 'rgb(255,255,0)'; };
    b.onmouseleave = () => { b.style.color = C.white; };
    b.onclick = () => this.emit('register', {});
    win.appendChild(b);
  }

  // ------------------------------------------------------------------
  // UpdateDisplay — grupos/servidores/gauges/setas/deco
  // ------------------------------------------------------------------
  _render(assetsOnly = false) {
    if (!this.winEl) return;
    for (const { el } of this._groupEls) el.remove();
    for (const { el } of this._serverEls) el.remove();
    this._groupEls = []; this._serverEls = [];
    for (const k of ['_arrow0', '_arrow1', '_deco0', '_deco1']) {
      if (this[k]) { this[k].remove(); this[k] = null; }
    }

    const disp = ServerListData.buildDisplay();
    const hasGroups = disp.all.length > 0;

    if (this._statusEl) {
      this._statusEl.textContent = hasGroups ? '' : (ServerListData.online
        ? 'Nenhum servidor respondendo no ConnectServer (lista vazia — igual cliente PC).'
        : 'Aguardando ConnectServer (44405)… a janela de servidores surge quando a lista real (F4:06) chega.');
      this._statusEl.style.top = `${Math.floor(this.winY + WIN_H / 2)}px`;
    }

    if (!hasGroups) { if (this.descText) this.descText.textContent = ''; return; }

    const f = cache.frames || {};
    // ---- Geometria literal (CServerSelWin::SetPosition/SetServerBtnPosition) ----
    // Nao reorganizar "para ficar bonito": estas coordenadas sao as formulas
    // reais do Main 5.2 e tambem do port mobile atual.
    const { leftX, serverX, rightX } = computeServerSelectColumns(this.winX);
    const leftBaseY = this.winY + WIN_H - (GB_H * 11 + GAP_H * 2 + DESC_H) + 25;
    const centerY = this.winY + WIN_H - GB_H - GAP_H - DESC_H;

    const win = this.winEl;

    // ---- Deco sprites (ShowDecoSprite) ----
    if (f.deco0) {
      this._deco0 = imgEl(f.deco0, leftX - this.winX, leftBaseY - this.winY, 68, 95);
      win.appendChild(this._deco0);
      this._deco1 = imgEl(f.deco1, rightX + GB_W - this.winX, leftBaseY - this.winY, 68, 95);
      win.appendChild(this._deco1);
    }

    // ---- Botões de grupo (ShowServerGBtns) ----
    const mkGroupBtn = (group, x, y, kind) => {
      const e = document.createElement('div');
      e.style.cssText = `position:absolute;left:${x - this.winX}px;top:${y - this.winY}px;
        width:${GB_W}px;height:${GB_H}px;cursor:pointer;user-select:none;background-size:100% 100%;`;
      const label = document.createElement('span');
      label.textContent = group.name;
      label.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;
        justify-content:center;font-size:11px;letter-spacing:1px;
        text-shadow:1px 1px 2px #000;`;
      e.appendChild(label);
      const applyState = (state) => {
        if (f.group) {
          const idx = state === 'down' ? 2 : state === 'active' ? 1 : 0;
          if (f.group[idx]) e.style.backgroundImage = `url("${f.group[idx]}")`;
        }
        label.style.color = state === 'up' ? GB_TEXT[0]
          : state === 'down' ? GB_TEXT[1] : GB_TEXT[2];
      };
      applyState(this.selectedGroup === group.index ? 'down' : 'up');
      e.onmouseenter = () => applyState(this.selectedGroup === group.index ? 'down' : 'active');
      e.onmouseleave = () => applyState(this.selectedGroup === group.index ? 'down' : 'up');
      e.onclick = () => {
        // UpdateWhileActive (ServerSelWin.cpp:428): SetCheck + SendRequestServerList
        this.selectedGroup = group.index;
        this.emit('request-server-list', {});
        this._render();
      };
      win.appendChild(e);
      this._groupEls.push({ el: e, group, kind });
    };

    disp.leftGroups.forEach((g, i) => mkGroupBtn(g, leftX, leftBaseY + GB_H * i, 'left'));
    disp.rightGroups.forEach((g, i) => mkGroupBtn(g, rightX, leftBaseY + GB_H * i, 'right'));
    if (disp.centerGroup) mkGroupBtn(disp.centerGroup, leftX, centerY, 'center');

    // ---- Setas no grupo selecionado (SetArrowSpritePosition) ----
    const sel = this.selectedGroup;
    if (sel != null && (f.arrow0 || f.arrow1)) {
      const selInfo = this._groupEls.find((x) => x.group.index === sel);
      if (selInfo) {
        const gx = parseFloat(selInfo.el.style.left), gy = parseFloat(selInfo.el.style.top);
        if (selInfo.kind === 'right' && f.arrow1) {
          this._arrow1 = imgEl(f.arrow1, gx - 23, gy - 2, 23, 29);
          win.appendChild(this._arrow1);
        } else if (selInfo.kind !== 'right' && f.arrow0) {
          this._arrow0 = imgEl(f.arrow0, gx + GB_W - 1, gy - 2, 23, 29);
          win.appendChild(this._arrow0);
        }
      }
    }

    // ---- Botões de servidor do grupo selecionado (ShowServerBtns) ----
    const groupObj = disp.all.find((g) => g.index === sel);
    if (groupObj && groupObj.servers.length) {
      const nSrv = groupObj.servers.length;
      const serversH = nSrv * SB_H;
      const baseH = GB_H * 10;
      let y0 = leftBaseY;
      if (serversH > baseH) y0 -= (serversH - baseH);
      groupObj.servers.forEach((s, i) => {
        const y = y0 + SB_H * i;
        const e = document.createElement('div');
        e.style.cssText = `position:absolute;left:${serverX - this.winX}px;top:${y - this.winY}px;
          width:${SB_W}px;height:${SB_H}px;cursor:pointer;user-select:none;background-size:100% 100%;`;
        const label = document.createElement('span');
        // Nome real (InsertServer): "%s-%d" — NonPvP 2/3 (Text_por.bmd 58/59)
        const srvIdx = s.serverCode % 20 + 1;
        const nonPvP = (groupObj.nonPvp && groupObj.nonPvp[s.serverCode % 20]) || 0;
        const name = nonPvP === 2 ? `[${groupObj.name}-${srvIdx}(PvP Ouro) Servidor]`
          : nonPvP === 3 ? `[${groupObj.name}-${srvIdx}(Ouro) Servidor]`
          : `${groupObj.name}-${srvIdx}`;
        label.textContent = name;
        const pal = BTN_TEXT[Math.min(nonPvP, 3)];
        label.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;
          padding-left:14px;font-size:11px;letter-spacing:1px;
          text-shadow:1px 1px 2px #000;color:${pal[0]};`;
        e.appendChild(label);
        // Gauge real (server_b2_loding 160×4 @ +16/+19) — largura = percent
        const gauge = document.createElement('div');
        const pct = Math.max(0, Math.min(100, s.percent));
        gauge.style.cssText = `position:absolute;left:${GB_POS_X}px;top:${GB_POS_Y}px;
          width:${Math.floor(GAUGE_W * pct / 100)}px;height:${GAUGE_H}px;
          background-size:${GAUGE_W}px ${GAUGE_H}px;`;
        if (f.gauge) gauge.style.backgroundImage = `url("${f.gauge}")`;
        e.appendChild(gauge);
        const applyState = (state) => {
          if (f.server) {
            const idx = state === 'down' ? 2 : state === 'active' ? 1 : 0;
            if (f.server[idx]) e.style.backgroundImage = `url("${f.server[idx]}")`;
          }
          label.style.color = state === 'active' ? pal[2] : pal[0];
        };
        applyState('up');
        e.onmouseenter = () => applyState('active');
        e.onmouseleave = () => applyState('up');
        e.onclick = () => this._pickServer(s, groupObj);
        win.appendChild(e);
        this._serverEls.push({ el: e, gauge, server: s, group: groupObj });
      });
    }

    // ---- Descrição (SeparateTextIntoLines 2×83) ----
    if (this.descText) {
      const g = groupObj || disp.all[0];
      this.descText.textContent = g ? splitDesc(g.description || '', 2, 83).join('\n') : '';
    }
  }

  /**
   * UpdateWhileActive (server click): percent<100 → SendRequestServerAddress
   * (C1 F4 03 code) → login. 100-127 → busy → re-request. ≥128 → Full.
   */
  _pickServer(server, group) {
    if (server.percent >= 128) return;
    if (server.percent >= 100) { this.emit('request-server-list', {}); return; }
    this.emit('server-selected', { server, group });
  }
}

// ---- Helpers ----
function imgEl(url, x, y, w, h, pointerEvents = 'none') {
  const e = document.createElement('div');
  e.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;
    background-image:url("${url}");background-size:100% 100%;pointer-events:${pointerEvents};`;
  return e;
}

function splitDesc(text, lines, maxChars) {
  const out = [];
  let rest = (text || '').replace(/\s+/g, ' ').trim();
  while (rest.length && out.length < lines) {
    if (rest.length <= maxChars) { out.push(rest); rest = ''; break; }
    let cut = rest.lastIndexOf(' ', maxChars);
    if (cut < 0) cut = maxChars;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trim();
  }
  return out;
}
