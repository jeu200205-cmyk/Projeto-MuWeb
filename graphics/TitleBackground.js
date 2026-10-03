/**
 * TitleBackground.js — Mosaico de fundo do title scene do PC (compartilhado
 * por loading → server-select → login, como no cliente).
 *
 * Porte de UIMng.cpp::CreateTitle / RenderTitleSceneUI (Main 5.2):
 *   - Grid fixo 1280×854 (base do cliente) com os sprites REAIS:
 *     New_lo_back_01/02 (topo), lo_back_s5_03/04 (base),
 *     lo_back_im01-06 (panorama central + rodapé, os navios)
 *   - Logo bitmap oficial: New_lo_mu_logo.OZT
 *   - Logo Webzen: New_lo_webzen_logo.OZT
 * Escala proporcional à viewport (fit contain), centrado.
 */

import { RemoteAssets } from '../data/RemoteAssets.js';

const BASE_W = 1280, BASE_H = 854;

// [asset, w, h, x, y] — espelha m_asprTitle[UIM_TS_*] do UIMng.cpp
export const TITLE_LAYOUT = [
    ['Interface/New_lo_back_01.jpg', 400, 69, 0, 0],
    ['Interface/New_lo_back_02.jpg', 400, 69, 400, 0],
    ['Interface/lo_back_s5_03.jpg', 400, 100, 0, 500],
    ['Interface/lo_back_s5_04.jpg', 400, 100, 400, 500],
    ['Interface/lo_back_im01.jpg', 512, 512, 0, 119],
    ['Interface/lo_back_im02.jpg', 512, 512, 512, 119],
    ['Interface/lo_back_im03.jpg', 256, 512, 1024, 119],
    ['Interface/lo_back_im04.jpg', 512, 223, 0, 631],
    ['Interface/lo_back_im05.jpg', 512, 223, 512, 631],
    ['Interface/lo_back_im06.jpg', 256, 223, 1024, 631],
];
export const ASSET_MU_LOGO = 'Interface/New_lo_mu_logo.OZT';
export const ASSET_WEBZEN_LOGO = 'Interface/New_lo_webzen_logo.OZT';

// Cache de módulo (cada cena é recriada a cada switchTo — os assets são da sessão)
const cache = { ready: false, parts: [], muLogo: null, webzen: null };

async function ensureAssets() {
    if (cache.ready) return;
    cache.ready = true; // um único voo por sessão
    const [parts, muLogo, webzen] = await Promise.all([
        Promise.all(TITLE_LAYOUT.map(([p]) => RemoteAssets.fetchImageURL(p).catch(() => null))),
        RemoteAssets.fetchImageURL(ASSET_MU_LOGO).catch(() => null),
        RemoteAssets.fetchImageURL(ASSET_WEBZEN_LOGO).catch(() => null),
    ]);
    cache.parts = parts;
    cache.muLogo = muLogo;
    cache.webzen = webzen;
}

/**
 * Monta o mosaico dentro de `container`. Retorna o handle com dispose().
 * O container recebe background #050509 (bordas fora do mosaico no fit).
 */
export async function mountTitleBackground(container) {
    container.style.background = '#050509';

    const board = document.createElement('div');
    board.style.cssText = `
      position:absolute;left:50%;top:50%;width:${BASE_W}px;height:${BASE_H}px;
      transform:translate(-50%,-50%);
      transform-origin:center;overflow:hidden;`;
    container.appendChild(board);

    const partEls = [];
    for (const [asset, w, h, x, y] of TITLE_LAYOUT) {
        const part = document.createElement('div');
        part.dataset.asset = asset;
        part.style.cssText = `
          position:absolute;width:${w}px;height:${h}px;left:${x}px;top:${y}px;
          background-position:center;background-size:cover;background-repeat:no-repeat;
          opacity:0;transition:opacity .35s;`;
        board.appendChild(part);
        partEls.push(part);
    }

    // Fit responsivo (contain): escala o mosaico 1280×854 p/ viewport
    let fitScale = null;
    const applyFit = () => {
        const s = Math.max(
            Math.min((container.clientWidth || window.innerWidth) / BASE_W,
                     (container.clientHeight || window.innerHeight) / BASE_H),
            0.3);
        board.style.transform = `translate(-50%,-50%) scale(${s})`;
    };
    applyFit();
    window.addEventListener('resize', fitScale = applyFit);

    await ensureAssets();
    if (!board.isConnected) {
        window.removeEventListener('resize', fitScale);
        return { dispose() {} }; // cena trocou durante o load
    }

    partEls.forEach((el, i) => {
        if (cache.parts[i]) {
            el.style.backgroundImage = `url("${cache.parts[i]}")`;
            el.style.opacity = '1';
        }
    });

    return {
        dispose() { window.removeEventListener('resize', fitScale); },
    };
}
