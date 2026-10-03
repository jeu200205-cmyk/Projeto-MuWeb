// ui2/SkillIcons.js — Ícones de skill REAIS do cliente (paridade PC Main 5.2).
//
// Autoridade PC (NewUIMainFrameWindow.cpp):
//   L1310-1319  LoadBitmap("Interface\\newui_skill.jpg", IMAGE_SKILL1)
//              LoadBitmap("Interface\\newui_skill2.jpg", IMAGE_SKILL2)
//              LoadBitmap("Interface\\newui_skill3.jpg", IMAGE_SKILL3)  [ifdef MONK]
//              + enum IMAGE_LIST (NewUIMainFrameWindow.h:95-111):
//                SKILL1=0, SKILL2=1, COMMAND=2, SKILL3=3(Monk), SKILLBOX=4,
//                SKILLBOX_USE=5, NON_SKILL1=6, NON_SKILL2=7, NON_COMMAND=8,
//                NON_SKILL3=9(Monk)
//   L2108+ RenderSkillIcon(bySkillType,x,y,w,h):
//              Skill_Icon = SkillAttribute[bySkillType].Magic_Icon
//   L2446-2505 seleção de sheet/UV:
//              - bySkillUseType==4 → SKILL2, UV=(Magic_Icon%12, Magic_Icon/12+4)
//              - bySkillType >= 260 (Monk/RF) → SKILL3, UV=((t-260)%12, (t-260)/12)
//              - bySkillType >= 57 → SKILL2, UV=((t-57)%8, (t-57)/8)
//              - else → SKILL1, UV=((t-1)%8, (t-1)/8)
//              - bCantSkill → iSkillIndex += 6 (com ifdef Monk: SKILL1→NON_SKILL1
//                etc. — versões dessaturadas newui_non_skill*.jpg)
//   L2506/2510 RenderBitmap(sheet, x,y,w,h, fU,fV, w/256, h/256) — sub-retângulo
//              do sheet 256×256; chamadas do hotkey list usam w=20,h=28.
//
// Sheets reais deste cliente (disco MuPromax Data/Interface): newui_skill.OZJ,
// newui_skill2.OZJ, newui_non_skill.OZJ, newui_non_skill2.OZJ — skill3 não
// existe neste disco (só com PBG_ADD_NEWCHAR_MONK_SKILL). Zero placeholder:
// sheet ausente → ícone vazio + warn 1× (nunca glifo/inventado).

const SHEET_W = 256, SHEET_H = 256;
const CELL_W = 20, CELL_H = 28; // RenderSkillIcon(x+6,y+6,20,28) no hotkey list PC

const SHEET_PATHS = {
    skill1: 'Interface/newui_skill.OZJ',     // AT 1-56,  8 col
    skill2: 'Interface/newui_skill2.OZJ',     // AT 57+,   8 col
    non1:   'Interface/newui_non_skill.OZJ',  // SKILL1 dessaturado (bCantSkill +6)
    non2:   'Interface/newui_non_skill2.OZJ', // SKILL2 dessaturado (bCantSkill +6)
    command: 'Interface/newui_command.OZJ',
    nonCommand: 'Interface/newui_non_command.OZJ',
};

/**
 * Computa o sub-retângulo (px) do ícone de um skillType AT_SKILL_*.
 * Réplica do bloco L2446-2505 do PC (branch principal; casos especiais
 * com UV hardcoded no PC caem nas mesmas fórmulas genéricas).
 * @returns {{sheet:'skill1'|'skill2', sx,sy,sw,sh, disabledSheet:'non1'|'non2'}|null}
 */
export function skillIconRect(skillType, magicIcon = 0, skillUseType = 0) {
    if (!Number.isInteger(skillType) || skillType < 1) return null;

    function rect(sheet, col, row) {
        const disabledSheet = sheet === 'skill1' ? 'non1'
            : sheet === 'skill2' ? 'non2'
            : sheet === 'command' ? 'nonCommand' : null;
        return { sheet, sx: col * CELL_W, sy: row * CELL_H, sw: CELL_W, sh: CELL_H, disabledSheet };
    }

    // Exact Main 5.2 special cells retained by the Android PC-parity owner.
    // SkillManager.h IDs: pet commands 120..123; Summoner/Alice 214..225;
    // Season skills 230/232..238. These branches precede the generic formula
    // in CNewUISkillList::RenderSkillIcon.
    if (skillType >= 120 && skillType < 124) {
        return rect('command', (skillType - 120) % 8, ((skillType - 120) / 8) | 0);
    }
    if (skillType === 76) return rect('command', 4, 0); // Plasma Storm Fenrir

    if (skillType >= 214 && skillType <= 217) return rect('skill2', (skillType - 214) % 8, 3);
    if (skillType >= 219 && skillType <= 220) return rect('skill2', (skillType - 219 + 4) % 8, 3);
    if (skillType === 218) return rect('skill2', 10, 3); // Berserker
    if (skillType >= 221 && skillType <= 222) return rect('skill2', skillType - 221 + 8, 3);
    if (skillType >= 223 && skillType <= 224) return rect('skill2', (skillType - 223 + 6) % 8, 3);
    if (skillType === 225) return rect('skill2', 11, 3); // Pollution
    if (skillType === 232) return rect('skill2', 7, 2);  // Blow of Destruction
    if (skillType === 233) return rect('skill2', 8, 2);  // Swell of Magic Power
    if (skillType === 234) return rect('skill2', 9, 2);  // Recover
    if (skillType === 235) return rect('skill2', 0, 8);  // Multi Shot
    if (skillType === 236) return rect('skill2', 1, 8);  // Flame Strike
    if (skillType === 237) return rect('skill2', 2, 8);  // Gigantic Storm
    if (skillType === 230) return rect('skill2', 2, 3);  // Lightning Shock
    if (skillType === 238) return rect('skill2', 3, 8);  // Gaotic

    // PC master/brand rule: even Magic_Icon==0 is a valid first cell.
    if (skillUseType === 4) {
        return rect('skill2', (magicIcon % 12), (((magicIcon / 12) | 0) + 4));
    }
    // AT_SKILL_THRUST(260)+ → SKILL3 (12 col). This client Data does not
    // contain newui_skill3/newui_non_skill3, therefore fail closed.
    if (skillType >= 260) return null;
    if (skillType >= 57) return rect('skill2', ((skillType - 57) % 8), (((skillType - 57) / 8) | 0));
    return rect('skill1', ((skillType - 1) % 8), (((skillType - 1) / 8) | 0));
}

/** Carrega os sheets PC reais como THREE.Texture (via MUAssets) e devolve
 *  {skill1,skill2,non1,non2,command,nonCommand} — CanvasImageSource (.image). Fail-closed.
 *  Import LAZY de MUAssetLoader: mantém skillIconRect puro/testável em node
 *  e não puxa THREE no boot do SkillBar. */
export async function loadSkillIconSheets() {
    const out = { skill1: null, skill2: null, non1: null, non2: null, command: null, nonCommand: null };
    const warned = new Set();
    const { MUAssets } = await import('../assets/MUAssetLoader.js');
    await Promise.all(Object.entries(SHEET_PATHS).map(async ([key, rel]) => {
        try {
            // R31: MUAssetLoader evicts rejected image-source promises. Retry once
            // before the atomic SkillBar barrier fails closed, so a transient
            // decode/fetch error cannot leave skill artwork late/hidden forever.
            let img = null;
            let lastError = null;
            for (let attempt = 0; attempt < 2 && !img; attempt++) {
                try {
                    const candidate = await MUAssets.loadImageSource(rel);
                    const w = candidate?.width || candidate?.naturalWidth || candidate?.videoWidth || 0;
                    const h = candidate?.height || candidate?.naturalHeight || candidate?.videoHeight || 0;
                    if (candidate && w > 0 && h > 0) img = candidate;
                    else throw new Error('sem pixels');
                } catch (e) { lastError = e; }
            }
            if (!img) throw lastError || new Error('sem pixels');
            out[key] = img;
        } catch (e) {
            if (!warned.has(key)) {
                warned.add(key);
                console.warn(`[SkillIcons] sheet real ausente/inválido: ${rel} — ícones dessa faixa ficam vazios (fail-closed): ${e.message}`);
            }
        }
    }));
    return out;
}

/**
 * Desenha o ícone real do skillType no canvas do slot.
 * @param {CanvasRenderingContext2D} ctx ctx 2D do slot
 * @param {object} sheets sheets PC reais (skill1/skill2/non + command)
 * @param {number} skillType AT_SKILL_* (autoridade F3:11 do servidor)
 * @param {object} [opts] { magicIcon, skillUseType, disabled, destWidth, destHeight, size }
 * @returns {boolean} true se desenhou (fail-closed: false = slot vazio)
 */
export function drawSkillIcon(ctx, sheets, skillType, opts = {}) {
    const r = skillIconRect(skillType, opts.magicIcon || 0, opts.skillUseType || 0);
    if (!r) return false;
    const sheet = opts.disabled ? (r.disabledSheet ? sheets?.[r.disabledSheet] : null) : sheets?.[r.sheet];
    if (!sheet) return false;
    const dw = opts.destWidth || opts.size || ctx.canvas.width;
    const dh = opts.destHeight || opts.size || ctx.canvas.height;
    // PC desenha o sub-retângulo exato no destino w×h; hotkey list is 20×28.
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(sheet, r.sx, r.sy, r.sw, r.sh, 0, 0, dw, dh);
    return true;
}
