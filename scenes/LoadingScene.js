// scenes/LoadingScene.js — R12.3 MuPromax custom loading authority.
//
// IMPORTANTE:
// - A source PC/mobile possui DOIS conceitos: Title/loading boot e CLoadingScene
//   LSBg01..04 de transição. A R12 trocou o boot pelo LSBg e o usuário confirmou
//   fisicamente que o pergaminho NÃO é a arte desejada deste cliente custom.
// - A referência visual desejada é o FUNDO MuPromax da Title Scene, sem os
//   overlays MU_TITLE/Webzen e sem gauge/logo adicionais.
// - Portanto esta cena usa SOMENTE os assets reais de FUNDO carregados por
//   LoadTitleBitmaps()/LoadingBar_Render do mobile e WebzenScene do PC.
// - Zero imagem fake, zero canvas procedural, zero logo inventada.

import { RemoteAssets } from '../data/RemoteAssets.js';

// Grupo 800x600 (topo/rodapé) — mobile LoadingBar_Render usa sx800/sy600.
const FRAME_PARTS = Object.freeze([
  { asset: 'Interface/New_lo_back_01.OZJ', x: 0,   y: 0,   w: 400, h: 69,  baseW: 800, baseH: 600 },
  { asset: 'Interface/New_lo_back_02.OZJ', x: 400, y: 0,   w: 400, h: 69,  baseW: 800, baseH: 600 },
  { asset: 'Interface/lo_back_s5_03.OZJ',  x: 0,   y: 500, w: 400, h: 100, baseW: 800, baseH: 600 },
  { asset: 'Interface/lo_back_s5_04.OZJ',  x: 400, y: 500, w: 400, h: 100, baseW: 800, baseH: 600 },
]);

// Panorama MuPromax clássico (o PC escolhe esta família em ~70% dos boots).
// O usuário pediu uma imagem/fundo determinístico, sem trocar aleatoriamente
// para a variante season5 e sem logos sobrepostos.
const PANORAMA_PARTS = Object.freeze([
  { asset: 'Interface/lo_back_im01.OZJ', x: 0,    y: 119, w: 512, h: 512, baseW: 1280, baseH: 1024 },
  { asset: 'Interface/lo_back_im02.OZJ', x: 512,  y: 119, w: 512, h: 512, baseW: 1280, baseH: 1024 },
  { asset: 'Interface/lo_back_im03.OZJ', x: 1024, y: 119, w: 256, h: 512, baseW: 1280, baseH: 1024 },
  { asset: 'Interface/lo_back_im04.OZJ', x: 0,    y: 631, w: 512, h: 223, baseW: 1280, baseH: 1024 },
  { asset: 'Interface/lo_back_im05.OZJ', x: 512,  y: 631, w: 512, h: 223, baseW: 1280, baseH: 1024 },
  { asset: 'Interface/lo_back_im06.OZJ', x: 1024, y: 631, w: 256, h: 223, baseW: 1280, baseH: 1024 },
]);

export const MUPROMAX_LOADING_ASSETS = Object.freeze([...FRAME_PARTS, ...PANORAMA_PARTS]);

const cache = { promise: null, urls: null };

async function loadBackgroundUrls() {
  if (cache.urls) return cache.urls;
  if (!cache.promise) {
    cache.promise = Promise.all(MUPROMAX_LOADING_ASSETS.map(async (p) => {
      const url = await RemoteAssets.fetchImageURL(p.asset);
      if (!url) throw new Error(`MuPromax loading: asset obrigatório ausente: ${p.asset}`);
      return url;
    })).then((urls) => {
      cache.urls = urls;
      return urls;
    }).finally(() => { cache.promise = null; });
  }
  return cache.promise;
}

function normalizeDurationMs(v) {
  if (v === undefined || v === null || v === '') return 1600;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 1600;
  if (n === 0) return 0;
  return n < 100 ? n * 1000 : n;
}

export default class LoadingScene {
  constructor() {
    this.el = null;
    this.duration = 1600;
    this.onDone = null;
    this._finished = false;
    this._timer = null;
    this._startTs = 0;
    this.parts = [];
  }

  async mount(container) {
    this.el = container;
    container.style.cssText += 'background:#000;overflow:hidden;pointer-events:none;';

    // Cada imagem usa percentuais do MESMO sistema lógico usado no mobile:
    // frame em 800x600, panorama em 1280x1024. Assim os grupos preenchem o
    // drawable inteiro em qualquer resolução e não ficam como um quadro menor
    // no centro do browser (regressão observada nas versões antigas).
    this.parts = MUPROMAX_LOADING_ASSETS.map((p) => {
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      img.dataset.asset = p.asset;
      img.style.cssText = `
        position:absolute;
        left:${(p.x / p.baseW) * 100}%;
        top:${(p.y / p.baseH) * 100}%;
        width:${(p.w / p.baseW) * 100}%;
        height:${(p.h / p.baseH) * 100}%;
        object-fit:fill;display:block;border:0;margin:0;padding:0;
        user-select:none;pointer-events:none;`;
      container.appendChild(img);
      return img;
    });

    const urls = await loadBackgroundUrls();
    if (!this.el?.isConnected) return;
    urls.forEach((url, i) => { this.parts[i].src = url; });
    console.info('[LoadingScene] R12.3: fundo MuPromax real ativo; overlays MU/Webzen/gauge removidos por requisito do cliente.');
  }

  show(params = {}) {
    this._finished = false;
    this.duration = normalizeDurationMs(params.duration);
    this.onDone = typeof params.onDone === 'function' ? params.onDone : null;
    this._startTs = performance.now();
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this._advance(), 50);
  }

  hide() {}

  dispose() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this.onDone = null;
  }

  update() { this._advance(); }

  _advance() {
    if (this._finished || !this._startTs) return;
    if (performance.now() - this._startTs >= this.duration) this._finish();
  }

  _finish() {
    if (this._finished) return;
    this._finished = true;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    const cb = this.onDone;
    this.onDone = null;
    if (!cb) return;
    // R22: even duration=0 must paint the authored loading owner once before
    // heavy world work starts. requestAnimationFrame gives the browser a present
    // boundary without adding an arbitrary 1.6/2.6s gameplay delay.
    const invoke = () => {
      try {
        const r = cb();
        if (r && typeof r.catch === 'function') r.catch((e) => console.error('[LoadingScene] onDone async FAIL:', e));
      } catch (e) {
        console.error('[LoadingScene] onDone sync FAIL:', e);
      }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(invoke);
    else queueMicrotask(invoke);
  }
}
