// ui2/BuffIcons.js — Ícones de buff REAIS do cliente (paridade PC Main 5.2).
//
// AUTORIDADE PC (NewUIBuffWindow.cpp):
//   L352-353  LoadBitmap("Interface\\newui_statusicon.jpg", IMAGE_BUFF_STATUS)
//             LoadBitmap("Interface\\newui_statusicon2.jpg", IMAGE_BUFF_STATUS2)
//   L261-287  RenderBuffIcon(eBuffType, x, y, width=20, height=20):
//               t < 81  → sheet1, col=(t-1)%10, row=(t-1)/10
//               t >= 81 → sheet2, col=(t-81)%10, row=(t-81)/10  (eBuff_Berserker)
//               RenderBitmap(sheet, x,y,w,h, u,v, w/256, h/256) — sub-retângulo
//   BUFF_IMG_WIDTH/HEIGHT = 20 (NewUIBuffWindow.h) — células 20×20, 10 col.
//   Enum eBuffState real: _enum.h:2060+ (eBuff_Attack=1 … eBuff_Berserker=81 …).
//
// Sheets reais deste cliente (disco MuPromax Data/Interface):
//   newui_statusicon.OZJ (122461 B) + newui_statusicon2.OZJ (81693 B).
// Zero placeholder: sheet ausente → ícone vazio + warn 1× (nunca emoji/inventado).
//
// O wire (0x12 herói / 0x13 monstros / 0x2D ReceiveBuffState) carrega bytes
// eBuffState reais (MUPacketRouter: buffs[]) — estes são a autoridade do ícone.

const SHEET_W = 256, SHEET_H = 256;
export const BUFF_CELL = 20; // BUFF_IMG_WIDTH/HEIGHT do PC

const SHEET_PATHS = {
    status1: 'Interface/newui_statusicon.OZJ',  // eBuffState 1..80
    status2: 'Interface/newui_statusicon2.OZJ', // eBuffState 81+
};

/**
 * Computa o sub-retângulo (px) do ícone de um eBuffState real.
 * Réplica exata do PC NewUIBuffWindow.cpp:261-287.
 * @param {number} buffState eBuffState real do wire (1-based)
 * @returns {{sheet:'status1'|'status2', sx,sy,sw,sh}|null}
 */
export function buffIconRect(buffState) {
    if (!Number.isInteger(buffState) || buffState < 1) return null;
    const cell = BUFF_CELL;
    let col, row, sheet;
    if (buffState < 81) {
        col = (buffState - 1) % 10;
        row = ((buffState - 1) / 10) | 0;
        sheet = 'status1';
    } else {
        col = (buffState - 81) % 10;
        row = ((buffState - 81) / 10) | 0;
        sheet = 'status2';
    }
    return { sheet, sx: col * cell, sy: row * cell, sw: cell, sh: cell };
}

/** Carrega os 2 sheets como CanvasImageSource (via MUAssets). Fail-closed. */
export async function loadBuffIconSheets() {
    const out = { status1: null, status2: null };
    const warned = new Set();
    const { MUAssets } = await import('../assets/MUAssetLoader.js');
    await Promise.all(Object.entries(SHEET_PATHS).map(async ([key, rel]) => {
        try {
            // R13: loadTexture() retorna descriptor lazy; para UI 2D é
            // obrigatório aguardar um CanvasImageSource com pixels reais.
            const img = await MUAssets.loadImageSource(rel);
            const w = img?.width || img?.naturalWidth || img?.videoWidth || 0;
            const h = img?.height || img?.naturalHeight || img?.videoHeight || 0;
            if (img && w > 0 && h > 0) {
                out[key] = img;
            } else {
                throw new Error('sem pixels');
            }
        } catch (e) {
            if (!warned.has(key)) {
                warned.add(key);
                console.warn(`[BuffIcons] sheet real ausente/inválido: ${rel} — ícones dessa faixa ficam vazios (fail-closed): ${e.message}`);
            }
        }
    }));
    return out;
}

/**
 * Desenha o ícone real de um eBuffState no canvas do slot.
 * @param {CanvasRenderingContext2D} ctx ctx 2D do slot
 * @param {object} sheets {status1,status2}
 * @param {number} buffState eBuffState real do wire
 * @param {object} [opts] { size }
 * @returns {boolean} true se desenhou (fail-closed: false = vazio, nunca emoji)
 */
export function drawBuffIcon(ctx, sheets, buffState, opts = {}) {
    const r = buffIconRect(buffState);
    if (!r) return false;
    const sheet = sheets?.[r.sheet];
    if (!sheet) return false;
    const size = opts.size || ctx.canvas.width;
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(sheet, r.sx, r.sy, r.sw, r.sh, 0, 0, size, size);
    return true;
}
