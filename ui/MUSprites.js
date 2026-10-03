/**
 * MUSprites.js — Carregador central dos sprites REAIS das telas de login
 * (port fiel dos contratos C++: OpenLogoSceneData, CLoginWin, CServerSelWin,
 * OpenCharacterSceneData, CharSelMainWin, Button.h).
 *
 * Contratos (da source PC):
 *   CButton::Create(w, h, tex, nMaxFrame, nDownFrame, nActiveFrame, nDisableFrame)
 *   → frames EMPILHADOS VERTICALMENTE no bitmap:
 *     frame 0 = UP (normal), 1 = ACTIVE (hover), 2 = DOWN (pressed), 3 = DISABLE
 *   (Button.h: BTN_UP=0, BTN_DOWN=1, BTN_ACTIVE=2, BTN_DISABLE=3 — os números
 *    passados em Create são ÍNDICES de frame no strip)
 *
 * Inventário validado contra o cliente (asset server :9100):
 *   message_ok_b_all.OZT      54×90  = 3× (54×30)  botão OK
 *   loding_cancel_b_all.OZT   54×90  = 3× (54×30)  botão CANCELAR
 *   b_create.OZT              54×120 = 4× (54×30)  CRIAR
 *   b_delete.OZT              54×120 = 4× (54×30)  DELETAR
 *   b_connect.OZT             54×120 = 4× (54×30)  ENTRAR
 *   cha_bt.OZT               108×104 = 4× (108×26) grupo de servidores
 *   server_b2_all.OZT         193×78 = 3× (193×26) botão de servidor
 *   btn_medium.OZJ (JPEG)      156×23              input box
 *   server_b2_loding.OZJ       160×4              gauge de load
 *   server_deco_all.OZT        159×95             deco 68×95 + arrows 23×29 (x=136)
 *   server_ex01.OZT            512×12             borda horizontal (2× 512×6)
 *   server_ex02.OZJ            JPEG               borda vertical 3×4
 *   server_ex03.OZT            4×4                cantos
 *   cr_mu_lo.OZT               290×41             logo MU da janela de login
 *   cha_id.OZT                 346×38             painel do ID da conta
 *   character_ex.OZT           118×54             moldura de slot de personagem
 *   deco.OZT                   189×103            decoração do char select
 *   login_back.OZJ             full               fundo da tela de login
 */

import { RemoteAssets } from '../data/RemoteAssets.js';

// ---- Definição dos sprites (contrato da source) ----
const DEFS = {
  loginBack:     { path: 'Custom/NewInterface/login_back.OZJ', kind: 'image' },
  // Input box REAL do NewUI (NewUIMyInventory.cpp:1687 → id 931316, usado no
  // LoginWin.cpp RenderControls: RenderImageF(931316, ..., 114×21))
  inputBox:      { path: 'Custom/NewInterface/item_money_v2.OZT', kind: 'image' },   // 256×47
  // Botão médio do NewUI (LoginWin.cpp: RenderBitmap(BITMAP_LOG_IN+8, 60×18,
  // UV normal v=0.002→0.20 / hover v=0.213→0.413) — recortes, não frames
  btnMedium:     { path: 'Custom/NewInterface/btn_medium.OZJ', kind: 'image' },      // 122×162
  gauge:         { path: 'Interface/server_b2_loding.OZJ', kind: 'image' },          // 160×4
  borderV:       { path: 'Interface/server_ex02.OZJ', kind: 'image' },                // 3×4
  crMuLo:        { path: 'Interface/cr_mu_lo.OZT', kind: 'image' },                  // 290×41
  chaId:         { path: 'Interface/cha_id.OZT', kind: 'image' },                     // 346×38
  characterEx:   { path: 'Interface/character_ex.OZT', kind: 'image' },               // 118×54
  deco:          { path: 'Interface/deco.OZT', kind: 'image' },                      // 189×103
  borderH:       { path: 'Interface/server_ex01.OZT', kind: 'strip', fw: 512, fh: 6, frames: 2 },   // 512×12
  corner:        { path: 'Interface/server_ex03.OZT', kind: 'image' },                // 4×4
  serverDecoAll: { path: 'Interface/server_deco_all.OZT', kind: 'image' },            // 159×95 (deco 0-68, arrows 136+)
  // Botões CButton — frames verticais UP/ACTIVE/DOWN(/DISABLE)
  btnOk:         { path: 'Interface/message_ok_b_all.OZT', kind: 'btn', fw: 54, fh: 30, frames: 3 },
  btnCancel:     { path: 'Interface/loding_cancel_b_all.OZT', kind: 'btn', fw: 54, fh: 30, frames: 3 },
  btnCreate:     { path: 'Interface/b_create.OZT', kind: 'btn', fw: 54, fh: 30, frames: 4 },
  btnDelete:     { path: 'Interface/b_delete.OZT', kind: 'btn', fw: 54, fh: 30, frames: 4 },
  btnConnect:    { path: 'Interface/b_connect.OZT', kind: 'btn', fw: 54, fh: 30, frames: 4 },
  serverGroupBtn:{ path: 'Interface/cha_bt.OZT', kind: 'btn', fw: 108, fh: 26, frames: 4 },
  serverBtn:     { path: 'Interface/server_b2_all.OZT', kind: 'btn', fw: 193, fh: 26, frames: 3 },
};

const cache = { loaded: false, loading: null, images: {}, btnFrames: {} };

/** Recorta frames verticais de um strip em dataURLs (canvas) */
function sliceFrames(decoded, fw, fh, count) {
  return new Promise((resolve) => {
    const img = decoded?.image;
    if (!img) { resolve(null); return; }
    const run = () => {
      try {
        const frames = [];
        for (let i = 0; i < count; i++) {
          const c = document.createElement('canvas');
          c.width = fw; c.height = fh;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, i * fh, fw, fh, 0, 0, fw, fh);
          frames.push(c.toDataURL());
        }
        resolve(frames);
      } catch (e) { resolve(null); }
    };
    run();
  });
}

export const MUSprites = {
  /** Carrega TODOS os sprites (uma vez por sessão). Não lança — ausentes ficam null. */
  async load() {
    if (cache.loaded) return this;
    // R13: a flag antiga era marcada ANTES do await. Chamadas concorrentes
    // (loading -> server-select -> char-select) viam loaded=true e recebiam
    // cache ainda vazio, exibindo interface cortada/sem sprites até um refresh.
    // Compartilha a MESMA promise e só publica loaded quando tudo terminou.
    if (cache.loading) {
      await cache.loading;
      return this;
    }

    cache.loading = (async () => {
      const entries = Object.entries(DEFS);
      const results = await Promise.all(entries.map(async ([key, def]) => {
        const decoded = await RemoteAssets.fetchDecodedImage(def.path).catch(() => null);
        return decoded ? { key, def, decoded, url: decoded.url } : null;
      }));

      for (const r of results) {
        if (!r) continue;
        cache.images[r.key] = r.url;
        if (r.def.kind === 'btn' || r.def.kind === 'strip') {
          const frames = await sliceFrames(r.decoded, r.def.fw, r.def.fh, r.def.frames);
          if (frames) cache.btnFrames[r.key] = frames;
        }
      }
      cache.loaded = true;
    })();

    try {
      await cache.loading;
      return this;
    } finally {
      cache.loading = null;
    }
  },

  /** URL da imagem completa (ou null se ausente) */
  get(key) { return cache.images[key] || null; },

  /** Frame específico de botão: state = 'up' | 'active' | 'down' | 'disable' */
  btn(key, state = 'up') {
    const frames = cache.btnFrames[key];
    if (!frames) return null;
    const idx = { up: 0, active: 1, down: 2, disable: 3 }[state] ?? 0;
    return frames[Math.min(idx, frames.length - 1)];
  },

  /** Todos os frames de um botão (para clientes que gerenciam estados) */
  frames(key) { return cache.btnFrames[key] || null; },

  /**
   * Frames de um strip por definição key com geometria explícita (fw×fh).
   * Usado quando a cena precisa dos frames crus (ex.: cha_bt 108×26×4).
   */
  async stripFrames(key, fw, fh) {
    const def = DEFS[key];
    if (!def) return null;
    if (cache.btnFrames[key]) return cache.btnFrames[key];
    if (cache.loading) await cache.loading;
    if (cache.btnFrames[key]) return cache.btnFrames[key];
    const decoded = await RemoteAssets.fetchDecodedImage(def.path).catch(() => null);
    if (!decoded) return null;
    cache.images[key] = decoded.url;
    const count = Math.max(1, def.frames || Math.floor(fh > 0 ? fh / fh : 1));
    const frames = await sliceFrames(decoded, fw, fh, def.frames || 3);
    if (frames) cache.btnFrames[key] = frames;
    return frames;
  },

  /** URL de um asset por PATH direto (compatibilidade). */
  async fetchImageURL(path) {
    const decoded = await RemoteAssets.fetchDecodedImage(path).catch(() => null);
    return decoded?.url || null;
  },

  /** Owner decodificado canônico para cenas que precisam recortar UV/retângulos. */
  async fetchDecodedImage(path) {
    return RemoteAssets.fetchDecodedImage(path).catch(() => null);
  },

  /** Recorta retângulos do owner já decodificado — sem segundo Image/onload. */
  slice(decoded, rects) {
    const img = decoded?.image;
    if (!img) return Promise.resolve(rects.map(() => null));
    return Promise.resolve(rects.map((r) => {
      try {
        const c = document.createElement('canvas');
        c.width = r.w; c.height = r.h;
        c.getContext('2d').drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
        return c.toDataURL();
      } catch (e) { return null; }
    }));
  },

  /** Cria <img> de botão com troca de estados UP/ACTIVE/DOWN (contrato CButton) */
  buttonImg(key, { scale = 1, onClick, disabled = false } = {}) {
    const img = document.createElement('img');
    img.alt = '';
    const w = (DEFS[key]?.fw || 54) * scale;
    const h = (DEFS[key]?.fh || 30) * scale;
    img.style.cssText = `width:${w | 0}px;height:${h | 0}px;display:block;cursor:${disabled ? 'default' : 'pointer'};`;
    const has = (s) => !!this.btn(key, s);
    const apply = (s) => {
      const u = this.btn(key, s) || this.btn(key, 'up');
      if (u) img.src = u;
    };
    apply(disabled ? 'disable' : 'up');
    if (!disabled && has('active')) {
      const wrap = document.createElement('button');
      wrap.type = 'button';
      wrap.style.cssText = 'padding:0;border:none;background:transparent;line-height:0;display:block;';
      wrap.appendChild(img);
      wrap.onmouseenter = () => apply('active');
      wrap.onmouseleave = () => apply('up');
      wrap.onmousedown = (e) => { e.preventDefault(); apply('down'); };
      wrap.onmouseup = () => apply(wrap.matches(':hover') ? 'active' : 'up');
      if (onClick) wrap.onclick = () => { apply('down'); onClick(); };
      return wrap;
    }
    if (onClick) img.onclick = onClick;
    return img;
  },
};

export default MUSprites;
