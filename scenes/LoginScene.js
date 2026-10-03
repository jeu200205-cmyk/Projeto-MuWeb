// scenes/LoginScene.js — Tela de login FIEL ao cliente PC (CLoginWin).
//
// PORT FIEL DA SOURCE (LoginWin.cpp + UIMng.cpp:200-233):
//   Janela 329×245 @ ((W-329)/2, (H-245)*2/3) — coordenadas lógicas 800×600,
//   escala visual 1.6 (mesma da ServerSelectScene).
//   RenderControls (LoginWin.cpp:381+):
//     - Painel: RenderBitmap(BITMAP_LOG_IN+7 [login_back], winX+64, winY+30,
//       200×137, UV 0,0→0.649,0.895)
//     - Nome do servidor: centrado 200 wide @ winY+60
//     - Inputs: RenderImageF(931316 [item_money_v2], winX+124, winY+101/142,
//       114×21) — textura 256×47 inteira
//     - Labels: GlobalText[450]/[451] ("Conta"/"Senha") BRANCOS @ +45,+110/+149
//     - Botões: RenderBitmap(BITMAP_LOG_IN+8 [btn_medium], 60×18 @ +94/+176,
//       +186; UV normal (0.002,0.002→0.95,0.20), hover (0.002,0.213→0.95,0.413))
//       + texto dourado RGB(237,214,161) centrado
//     - "Salvar Conta" 156×25 com borda (LoginWin.cpp RenderControls)
//     - Botão lista de contas 25×23 (m_btnAccountList)
//   Fundo da tela: mosaico do title scene (mesmas artes lo_back_im01-06 do PC).
//
// R46: restore the previously validated R13 browser presentation repair. The
// custom PC base itself overlaps password and Save Account; reproducing that bug
// in a browser made the physical R45.2 layout unreadable. Assets/protocol remain
// PC-authored; only control presentation spacing is repaired on the 800x600 board.
// Lógica de login: 100% preservada (event-driven GameNet, sem simulação).
// Eventos: 'login' { accountId, account, remember }, 'join-server'.

import { RemoteAssets } from '../data/RemoteAssets.js';
import { attachMuVirtualBoard } from '../ui/MUVirtualViewport.js';

const GOLD = '#c9a227';

// Recorta pixels de uma imagem (slicing UV do RenderBitmap do PC)
function slicePx(decoded, sx, sy, sw, sh) {
  return new Promise((resolve) => {
    const img = decoded?.image;
    if (!img) { resolve(null); return; }
    try {
      const c = document.createElement('canvas');
      c.width = Math.max(1, sw | 0); c.height = Math.max(1, sh | 0);
      c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      resolve(c.toDataURL());
    } catch (e) { resolve(null); }
  });
}

export default class LoginScene {
  constructor() {
    this._listeners = {};
    this.el = null;
    this.net = null;
    this.selectedServer = null; // vem do server-select via show({ server })
    this._keyHandler = null;
    this._raf = 0;
    this._sprites = {}; // painel/input/botões recortados
    this._destroyed = false;
  }

  on(ev, cb) { (this._listeners[ev] || (this._listeners[ev] = [])).push(cb); return this; }
  emit(ev, data) { (this._listeners[ev] || []).forEach((cb) => cb(data)); }

  async mount(container) {
    this._destroyed = false;
    this.el = container;
    // TRANSPARENTE — o World95 3D real (oceano/ilha, câmera SceneLogin)
    // renderiza atrás; esta cena só tem a janela CLoginWin (CreateLoginScene)
    container.style.background = 'transparent';

    // Coordenadas lógicas originais 800×600; a escala física é aplicada uma
    // única vez pelo MUVirtualViewport para não deformar a UI em widescreen.
    this._viewport = attachMuVirtualBoard(container);
    const board = this._viewport.board;
    board.style.visibility = 'hidden'; // R15.3 atomic first paint: no half-loaded PC UI
    const W = 329, H = 245;
    const winX = Math.floor((800 - W) / 2);
    const winY = Math.floor((600 - H) * 2 / 3);
    const win = document.createElement('div');
    win.style.cssText = `position:absolute;width:${W}px;height:${H}px;left:${winX}px;top:${winY}px;`;
    this.winEl = win;

    // ---- painel 200×137 (login_back recorte UV 0,0→64.9%,89.5%) ----
    this.panelEl = document.createElement('div');
    this.panelEl.style.cssText = `position:absolute;left:${64}px;top:${30}px;
      width:${200}px;height:${137}px;
      background-size:154% 112%;background-position:top left;`;
    win.appendChild(this.panelEl);

    // ---- nome do servidor (topo do painel, centrado) ----
    this.serverNameEl = document.createElement('div');
    this.serverNameEl.style.cssText = `position:absolute;left:${64}px;top:${52}px;
      width:${200}px;text-align:center;color:#fff;font-size:13px;
      font-family:Georgia,serif;letter-spacing:1px;text-shadow:0 1px 2px #000;`;
    win.appendChild(this.serverNameEl);

    // ---- labels "Conta"/"Senha" (GlobalText[450]/[451], BRANCOS) ----
    const mkLabel = (txt, top) => {
      const l = document.createElement('div');
      l.textContent = txt;
      l.style.cssText = `position:absolute;left:${45}px;top:${top}px;
        color:#fff;font-size:13px;font-family:Georgia,serif;text-shadow:0 1px 2px #000;`;
      return l;
    };
    win.appendChild(mkLabel('Conta', 104));
    win.appendChild(mkLabel('Senha', 134));

    // ---- inputs (PC RenderControls LoginWin.cpp:397-401: visual do campo =
    //      RenderImageF(931316, WinW/2-40, YPos+101/142, 114×21) → rel. janela
    //      329: x=124.5, y=101/142 — o port original estava correto. As
    //      InputBox hitboxes (156×23 @109) são de foco, não visual) ----
    const mkField = (top, placeholder, type) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = `position:absolute;left:${124}px;top:${top}px;
        width:${114}px;height:${21}px;
        background-size:100% 100%;`;
      const inp = document.createElement('input');
      inp.type = type; inp.placeholder = placeholder; inp.maxLength = 20;
      inp.style.cssText = `position:absolute;inset:0;width:100%;height:100%;
        border:none;outline:none;background:transparent;padding:0 14px;
        color:#ffe6d2;font-size:13px;font-family:Georgia,serif;`;
      wrap.appendChild(inp);
      return { wrap, inp };
    };
    // Clean LoginWin.cpp RenderControls owner: y=101 / y=142.
    const fUser = mkField(98, 'Conta', 'text');
    const fPass = mkField(128, 'Senha', 'password');
    this.userInput = fUser.inp; this.userInput.dataset.mu = 'login-user';
    this.passInput = fPass.inp; this.passInput.dataset.mu = 'login-pass';
    win.appendChild(fUser.wrap);
    win.appendChild(fPass.wrap);

    // R37: the former 25x23 CSS rectangle + '▾' glyph was Web-authored, not a
    // decoded PC owner. Keep the account-list feature fail-closed until its exact
    // clean-PC artwork/UV is available; do not publish a cosmetic substitute.
    this.acctBtn = null;

    // ---- botões Conectar/Cancelar (btn_medium 60×18 + texto dourado) ----
    const mkBtn = (left, label) => {
      const b = document.createElement('div');
      b.style.cssText = `position:absolute;left:${left}px;top:${188}px;
        width:${60}px;height:${18}px;cursor:pointer;
        background-size:100% 100%;`;
      const t = document.createElement('span');
      t.textContent = label;
      t.style.cssText = `position:absolute;inset:0;text-align:center;line-height:${18}px;
        color:rgb(237,214,161);font-size:12px;font-family:Georgia,serif;
        text-shadow:0 1px 1px #000;`;
      b.appendChild(t);
      return b;
    };
    this.connectBtn = mkBtn(94, 'Conectar');
    this.connectBtn.dataset.mu = 'login-btn';
    this.cancelBtn = mkBtn(176, 'Cancelar');
    this.connectBtn.onclick = () => this._doLogin();
    this.cancelBtn.onclick = () => { this.userInput.value = ''; this.passInput.value = ''; };
    win.appendChild(this.connectBtn);
    win.appendChild(this.cancelBtn);

    // ---- "Salvar Conta" 156×25: R13/R46 browser correction avoids the
    //      custom-PC password overlap while retaining the same real artwork. ----
    const saveWrap = document.createElement('label');
    saveWrap.style.cssText = `position:absolute;left:${109}px;top:${155}px;
      width:${156}px;height:${25}px;border:1px solid rgba(179,179,179,0.7);
      cursor:pointer;display:flex;align-items:center;gap:8px;padding:0 10px;
      color:#fff;font-size:12px;font-family:Georgia,serif;user-select:none;`;
    this.rememberChk = document.createElement('input');
    this.rememberChk.type = 'checkbox';
    this.rememberChk.checked = true;
    this.rememberChk.style.accentColor = GOLD;
    saveWrap.appendChild(this.rememberChk);
    saveWrap.appendChild(document.createTextNode('Salvar Conta'));
    win.appendChild(saveWrap);

    // ---- status hook: test/diagnostic only; not a rendered Web-authored UI owner. ----
    this.statusEl = document.createElement('div');
    this.statusEl.style.cssText = 'display:none;';
    this.statusEl.dataset.mu = 'login-status';
    win.appendChild(this.statusEl);

    board.appendChild(win);

    // usuário lembrado
    try {
      const saved = localStorage.getItem('muweb.remember');
      if (saved) { this.userInput.value = saved; this.rememberChk.checked = true; }
    } catch (e) { /* sem localStorage */ }

    // Enter loga (foco: senha se ID preenchido, senão ID — como o C++)
    this._keyHandler = (e) => { if (e.key === 'Enter') this._doLogin(); };
    document.addEventListener('keydown', this._keyHandler);

    // ---- assets reais. R13 aguarda o primeiro paint completo; os bytes já
    // foram pré-aquecidos pelo GameApp durante a loading scene. ----
    let assetsReady = await this._loadRealAssets();
    // R26: one bounded retry joins RemoteAssets retryable decode cache. A transient
    // fetch/decode failure must not strand Login hidden for the whole session.
    if (!assetsReady && !this._destroyed) assetsReady = await this._loadRealAssets();
    if (this._destroyed) return false;
    if (assetsReady) {
      board.style.visibility = 'visible';
      board.dataset.muFirstPaint = 'complete';
    } else {
      board.dataset.muFirstPaint = 'blocked-missing-owner';
      console.warn('[LoginScene] atomic first paint BLOQUEADO: owner PC real ausente.');
    }

    // ---- net client (protocolo REAL via GameApp.muProtocol; erro explícito
    // se indisponível — modo demo REMOVIDO, política 0 simulação) ----
    try {
      const mod = await import('../protocol/NetClient.js');
      this.net = mod.GameNet || null;
    } catch (e) {
      this.net = null;
    }
    // Protocolo REAL (RealMUProtocol do GameApp — WS gateway → MU real):
    // o login é enviado como BOTH_CONNECT_LOGIN (Main 5.2, olc::net) quando o
    // GameApp já fez o handoff CS→GS (F4:03); o resultado chega como packet
    // both=BOTH_LOGIN_RESULT no handleMUPacket.
    this.muProtocol = (typeof window !== 'undefined' && window.muApp && window.muApp.muProtocol) || null;
  }

  show(params) {
    if (params && params.server) this.selectedServer = params.server;
    if (this.serverNameEl && this.selectedServer) {
      this.serverNameEl.textContent = this.selectedServer.name || String(this.selectedServer);
    }
    const target = this.userInput.value ? this.passInput : this.userInput;
    setTimeout(() => { if (!this._destroyed) target?.focus?.(); }, 60);
  }

  hide() { /* transição gerenciada pelo SceneManager */ }

  dispose() {
    this._destroyed = true;
    if (this.board) this.board.style.visibility = 'hidden';
    if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
    this._viewport?.dispose();
    this._viewport = null;
  }

  update() { /* sem partículas — o PC não tem */ }

  // --- internos ---

  _setStatus(msg, color = '#c96f6f') {
    this.statusEl.textContent = msg;
    this.statusEl.style.color = color;
  }

  async _loadRealAssets() {
    try {
      // painel: login_back recorte UV(0,0→64.9%,89.5%) de 160×110
      const panel = await RemoteAssets.fetchDecodedImage('Custom/NewInterface/login_back.OZJ').catch(() => null);
      const img = panel?.image;
      if (img && this.panelEl.isConnected) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, img.width * 0.649 | 0);
        c.height = Math.max(1, img.height * 0.895 | 0);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height, 0, 0, c.width, c.height);
        this.panelEl.style.backgroundImage = `url("${c.toDataURL()}")`;
      }

      // inputs: item_money_v2 inteira (256×47 → 114×21)
      const input = await RemoteAssets.fetchDecodedImage('Custom/NewInterface/item_money_v2.OZT').catch(() => null);
      if (input?.url) {
        for (const el of this.el.querySelectorAll('[data-mu="login-user"], [data-mu="login-pass"]')) {
          el.parentElement.style.backgroundImage = `url("${input.url}")`;
        }
      }

      // botões: recortes do btn_medium (122×162) — normal/hover
      const btn = await RemoteAssets.fetchDecodedImage('Custom/NewInterface/btn_medium.OZJ').catch(() => null);
      let buttonFramesReady = false;
      if (btn?.image) {
        const [normal, hover] = await Promise.all([
          slicePx(btn, 0, 0, 116, 32),           // UV v 0.002→0.20
          slicePx(btn, 0, 34.5, 116, 32.4),      // UV v 0.213→0.413
        ]);
        for (const [btn, n, h] of [[this.connectBtn, normal, hover], [this.cancelBtn, normal, hover]]) {
          if (n) btn.style.backgroundImage = `url("${n}")`;
          if (n && h) {
            buttonFramesReady = true;
            btn.onmouseenter = () => { btn.style.backgroundImage = `url("${h}")`; };
            btn.onmouseleave = () => { btn.style.backgroundImage = `url("${n}")`; };
          }
        }
      }
      return Boolean(img && input?.url && buttonFramesReady);
    } catch (e) {
      // Fail closed: never publish a transparent/half-authored login vessel.
      return false;
    }
  }

  async _doLogin() {
    const user = this.userInput.value.trim();
    const pass = this.passInput.value;

    // PARIDADE PC (LoginWin.cpp:503-506 RequestLogin): o Main 5.2 NÃO valida
    // comprimento — só exige ID e senha NÃO VAZIOS (PopUpMsgWin
    // MESSAGE_INPUT_ID / MESSAGE_INPUT_PASSWORD). Os limites de 10/20 são do
    // BUFFER (MAX_ID_SIZE/MAX_PASSWORD_SIZE), aplicados no writeString do
    // pacote, não como gate de UI. Conta real de teste tem senha '1' — o gate
    // antigo (4-20) bloqueava login que o PC aceita (violação de paridade).
    if (user.length <= 0) {
      this._setStatus('Digite o ID da conta.');
      this.userInput.focus();
      return;
    }
    if (pass.length <= 0) {
      this._setStatus('Digite a senha.');
      this.passInput.focus();
      return;
    }

    // LOGIN REAL (BOTH_CONNECT — Main 5.2, ProtocolSend.h): quando o GameApp
    // tem muProtocol conectado ao GS (handoff F4:03), envia o pacote REAL
    // olc::net [u32 size][u16 id=4][acc10][pass20][tick][ver5][serial16] e
    // aguarda a resposta BOTH (SERVER_CONNECT/BOTH_CONNECT_LOGIN result).
    if (this.muProtocol && this.muProtocol.isConnected) {
      this._setStatus('Autenticando no servidor...', '#c9a227');
      try {
        const res = await this._loginBoth(user, pass);
        if (!res || res.code !== 1) {
          this._setStatus(`Falha no login: ${res && res.message ? res.message : 'sem resposta do servidor'}.`);
          return;
        }
        this._persistRemember(user);
        this._setStatus('Login aceito.', '#6fc46f');
        this.emit('login', { accountId: user, account: user, remember: this.rememberChk.checked });
        this.emit('join-server', { accountId: user, server: this.selectedServer });
      } catch (err) {
        this._setStatus('Erro de conexão: ' + (err.message || err), '#c96f6f');
      }
      return;
    }

    // Sem protocolo real conectado → ERRO EXPLÍCITO (política 0 simulação:
    // nunca fingir sucesso — igual o PC: "Cannot connect to server").
    if (!this.net) {
      this._setStatus('Não conectado ao servidor MU. Verifique o GameServer (login real requer conexão).');
      return;
    }

    // login ONLINE event-driven legado (GameNet): envia pacote e aguarda loginResult
    this._setStatus('Conectando...', '#c9a227');
    try {
      const res = await this._loginOnline(user, pass);
      if (!res || res.code !== 1) {
        this._setStatus(`Falha no login: ${res && res.message ? res.message : 'resposta inválida'}.`);
        return;
      }
      this._persistRemember(user);
      this._setStatus('Login aceito.', '#6fc46f');
      this.emit('login', { accountId: user, account: res.account || user, remember: this.rememberChk.checked });
      this.emit('join-server', { accountId: user, server: this.selectedServer });
    } catch (err) {
      this._setStatus('Erro de conexão: ' + (err.message || err), '#c96f6f');
    }
  }

  /**
   * Login pelo protocolo REAL BOTH_CONNECT (Main 5.2 — olc::net).
   * Envia loginBothConnect e aguarda o packet both={id:4} (BOTH_CONNECT_LOGIN
   * result) ou both={id:2} (SERVER_CONNECT) no hook de pacotes do GameApp.
   */
  _loginBoth(user, pass) {
    return new Promise((resolve) => {
      // TIMEOUT: o GS real pode demorar >10s quando o stack está sob carga
      // (wire: result=1 chegou ~15s em e2e com 6 agentes ativos). O PC não
      // tem timer agressivo aqui — o erro vem do protocolo (PopUpMsgWin
      // "Cannot connect" via PacketError), não de um relógio de UI.
      const TIMEOUT = 30000;
      let done = false;
      const finish = (res) => { if (!done) { done = true; clearTimeout(timer); off(); resolve(res); } };
      const onPacket = (packet) => {
        if (packet && packet.both && (packet.both.id === 4 || packet.both.id === 2)) {
          const result = packet.both.result != null ? packet.both.result : packet.payload[0];
          finish({ code: result === 1 ? 1 : 0, account: user, message: result === 1 ? 'ok' : 'conta/senha/recusadas (result=' + result + ')' });
        }
      };
      const app = (typeof window !== 'undefined' && window.muApp) || null;
      const off = app && app.onMUPacket ? app.onMUPacket(onPacket) : (() => {});
      const timer = setTimeout(() => finish({ code: 0, message: 'tempo esgotado aguardando o GameServer' }), TIMEOUT);
      this.muProtocol.loginBothConnect(user, pass).catch((e) => finish({ code: 0, message: e.message }));
    });
  }

  /** Login pelo protocolo real: C1 [F1][01]; aguarda loginResult. NUNCA pende. */
  _loginOnline(user, pass) {
    return new Promise((resolve) => {
      if (!this.net.isOnline()) {
        resolve({ code: 0, message: 'servidor não conectado (gateway MU offline)' });
        return;
      }

      const LOGIN_TIMEOUT_MS = 8000;
      let done = false;

      const cleanup = () => {
        clearTimeout(timer);
        this.net.off('loginResult', onResult);
        this.net.off('error', onError);
      };
      const finish = (res) => {
        if (done) return;
        done = true;
        cleanup();
        resolve(res);
      };

      const timer = setTimeout(() => {
        finish({ code: 0, message: 'tempo esgotado aguardando o servidor' });
      }, LOGIN_TIMEOUT_MS);

      const onResult = ({ success }) => {
        finish(success
          ? { code: 1, account: user }
          : { code: 0, message: 'usuário ou senha inválidos' });
      };
      const onError = (e) => {
        finish({ code: 0, message: e && e.message ? e.message : 'erro de rede' });
      };

      this.net.on('loginResult', onResult);
      this.net.on('error', onError);
      this.net.login(user, pass);
    });
  }

  _persistRemember(user) {
    try {
      if (this.rememberChk.checked) localStorage.setItem('muweb.remember', user);
      else localStorage.removeItem('muweb.remember');
    } catch (e) { /* noop */ }
  }

  _delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
}
