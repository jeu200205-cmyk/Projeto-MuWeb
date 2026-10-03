/**
 * MUVirtualViewport.js — contrato único de coordenadas lógicas 800x600.
 * Mantém proporção 4:3 da UI original e centraliza dentro do viewport real.
 * Evita o stretch independente X/Y que deslocava/sobrepunha widgets em 16:9.
 */
export const MU_LOGICAL_WIDTH = 800;
export const MU_LOGICAL_HEIGHT = 600;

export function computeMuVirtualViewport(width, height) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const scale = Math.min(w / MU_LOGICAL_WIDTH, h / MU_LOGICAL_HEIGHT);
  const renderWidth = MU_LOGICAL_WIDTH * scale;
  const renderHeight = MU_LOGICAL_HEIGHT * scale;
  return {
    width: w, height: h, scale,
    renderWidth, renderHeight,
    offsetX: (w - renderWidth) * 0.5,
    offsetY: (h - renderHeight) * 0.5,
  };
}

export function attachMuVirtualBoard(container) {
  const board = document.createElement('div');
  board.dataset.muVirtualBoard = '800x600';
  board.style.cssText = `position:absolute;left:0;top:0;width:${MU_LOGICAL_WIDTH}px;height:${MU_LOGICAL_HEIGHT}px;transform-origin:0 0;`;
  container.appendChild(board);

  const fit = () => {
    const rect = container.getBoundingClientRect();
    // Browser UI/IME can resize visualViewport without firing a reliable window
    // resize (notably Android/iOS). Use the actually visible CSS viewport when
    // this board is fullscreen; retain container dimensions for embedded owners.
    const vv = window.visualViewport;
    const fullscreen = rect.left === 0 && rect.top === 0 && Math.abs(rect.width - window.innerWidth) < 2;
    const fitW = fullscreen && vv?.width ? Math.min(rect.width || vv.width, vv.width) : (rect.width || window.innerWidth);
    const fitH = fullscreen && vv?.height ? Math.min(rect.height || vv.height, vv.height) : (rect.height || window.innerHeight);
    const m = computeMuVirtualViewport(fitW, fitH);
    // R25: visualViewport may be panned by the browser chrome/IME without moving
    // the layout viewport. Anchor fullscreen PC UI to the actually visible origin.
    // Embedded owners intentionally remain container-relative.
    const originX = fullscreen && vv ? Number(vv.offsetLeft) || 0 : 0;
    const originY = fullscreen && vv ? Number(vv.offsetTop) || 0 : 0;
    board.style.transform = `translate(${originX + m.offsetX}px,${originY + m.offsetY}px) scale(${m.scale})`;
    board.dataset.muViewportX = String(originX);
    board.dataset.muViewportY = String(originY);
    board.dataset.muScale = String(m.scale);
    board.dataset.muOffsetX = String(m.offsetX);
    board.dataset.muOffsetY = String(m.offsetY);
    return m;
  };

  fit();
  let raf = 0;
  const resize = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; fit(); });
  };
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  window.visualViewport?.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('scroll', resize);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(container);

  return {
    board,
    fit,
    dispose() {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('scroll', resize);
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
    },
  };
}
