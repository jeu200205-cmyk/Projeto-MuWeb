// ui2/ItemIconRenderer.js — Ícones de item REAIS por render 3D (paridade PC).
//
// Autoridade PC (ZzzInventory.cpp:10695-11100, RenderItem3D): o inventário
// NÃO usa spritesheet — cada slot renderiza o MODELO 3D REAL do item
// (RenderObjectScreen com Type+MODEL_ITEM → Data\Item\*.bmd resolvido pela
// tabela AccessModel = data/ItemModelMap.js) numa viewport de célula, com
// offsets de centro POR CATEGORIA/ITEM aplicados a sx/sy ANTES do render:
//     sx += Width * fx;  sy += Height * fy;
// A tabela abaixo é o porte COMO DADOS de todos os ramos do if/else PC.
//
// Zero placeholder: sem BMD/registro → slot vazio (fail-closed), nunca emoji.

import * as THREE from 'three';
import { ITEM_MODEL_MAP } from '../data/ItemModelMap.js';
import { customItemModelForType } from '../data/CustomItemModelMap.js';
import { loadCustomItemPresentation, customItemPosition, customItemSize } from '../data/CustomItemPresentation.js';
import { itemAttributeFor } from '../data/ItemAttributeData.js';
import { parseBMD } from '../graphics/BmdParser.js';
import { extractPartMeshes } from '../graphics/BmdAdapter.js';

// ---- categoria por Type 12-bit (_define.h:379-394: cat=floor(Type/512)) ----
const CAT = (t) => Math.floor(t / 512);
const OFF = (t) => t % 512;
const ITEM_SWORD = 0, ITEM_AXE = 1, ITEM_MACE = 2, ITEM_SPEAR = 3, ITEM_BOW = 4,
    ITEM_STAFF = 5, ITEM_SHIELD = 6, ITEM_HELM = 7, ITEM_ARMOR = 8, ITEM_PANTS = 9,
    ITEM_GLOVES = 10, ITEM_BOOTS = 11, ITEM_WING = 12, ITEM_HELPER = 13, ITEM_POTION = 14, ITEM_ETC = 15;
const MAX_ITEM_INDEX = 512; // por família (12-bit domain)


// ---- Main 5.2 item-view camera / absolute presentation --------------------
// Authority: ZzzOpenglUtil.cpp::gluPerspective2/CreateScreenVector and
// ZzzInventory.cpp::RenderObjectScreen. The desktop item pass is NOT an
// orthographic bbox-fit. It uses a 1-degree perspective camera (20..2000),
// casts the authored sx/sy point onto the far plane and places the item at
// 15% of that ray (7.5% only for PickUp), then applies the absolute model
// scale from RenderObjectScreen/CustomItemSize.
export const PC_ITEM_VIEW_FOV = 1.0;
export const PC_ITEM_VIEW_NEAR = 20.0;
export const PC_ITEM_VIEW_FAR = 2000.0;
// R78: CreateScreenVector uses the FULL MU logical render viewport. Inventory
// Width/Height describe only the item rectangle; treating that rectangle as a
// complete projection viewport shrinks an absolute-scale PC model to ~1 px.
// The current Web/NewUI coordinate contract is 800x600 (MUVirtualViewport).
export const PC_ITEM_VIEW_LOGICAL_WIDTH = 800;
export const PC_ITEM_VIEW_LOGICAL_HEIGHT = 600;

export function pcItemViewRect(width, height) {
    const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
    return Object.freeze({
        x: (PC_ITEM_VIEW_LOGICAL_WIDTH - w) * 0.5,
        y: (PC_ITEM_VIEW_LOGICAL_HEIGHT - h) * 0.5,
        w, h,
    });
}

export function renderItem3dUsesAlternateModel(type, rawLevel = 0) {
    const g = CAT(type), i = OFF(type), lv = (rawLevel >> 3) & 0x0F;
    if (g === ITEM_POTION && i === 11 && [1,2,3,5,6,8,9,10,11,12,13,14,15].includes(lv)) return true;
    if (g === ITEM_HELPER && i === 14 && lv === 1) return true;
    if (g === ITEM_POTION && i === 9 && lv === 1) return true;
    if (g === ITEM_POTION && i === 21 && (lv === 1 || lv === 2)) return true;
    if (g === ITEM_POTION && i >= 46 && i <= 48 && i !== 46) return true;
    if (g === ITEM_POTION && i >= 32 && i <= 34 && lv === 1) return true;
    if (g === ITEM_HELPER && i === 19 && lv <= 2) return true;
    if (g === ITEM_POTION && (i === 23 || i === 24) && lv === 1) return true;
    if (g === ITEM_HELPER && i === 20 && lv <= 3) return true;
    if (g === ITEM_HELPER && i === 11 && lv === 1) return true;
    return false;
}

export function customPositionAppliesToInventoryModel(type, rawLevel = 0) {
    // CCustomItemPosition is queried inside RenderObjectScreen using the model
    // Type it receives. RenderItem3D alternates therefore do not consult the
    // original item row. MODEL_SWORD+0 is the one stock branch evaluated BEFORE
    // CheckCustomItemPosition in Main 5.2 and must retain its stock transform.
    if (type === ITEM_SWORD * 512) return false;
    return !renderItem3dUsesAlternateModel(type, rawLevel);
}

export function customSizeAppliesToInventoryModel(type, rawLevel = 0) {
    if (renderItem3dUsesAlternateModel(type, rawLevel)) return false;
    const g = CAT(type), i = OFF(type), lv = (rawLevel >> 3) & 0x0F;
    // RenderObjectScreen rewrites POTION+12 level 0/2 to MODEL_EVENT before
    // CCustomItemSize is checked. Preserve that exact ordering.
    if (g === ITEM_POTION && i === 12 && (lv === 0 || lv === 2)) return false;
    return true;
}

export function pcItemProjectionPosition(width, height, fx, fy, customPosition = null, pickUp = false) {
    const rect = pcItemViewRect(width, height);
    // RenderItem3D owns a rectangle INSIDE the full screen. For an offscreen
    // thumbnail we place an equivalent rectangle at screen center and crop the
    // full 800x600 PC perspective to that rectangle with setViewOffset below.
    // Centering is mathematically equivalent to the real absolute slot x/y:
    // both the screen ray and the sub-viewport move by the same amount.
    const sx = rect.x + rect.w * Number(fx || 0);
    const sy = rect.y + rect.h * Number(fy || 0);
    const perspectivePerPixel = (2 * Math.tan((PC_ITEM_VIEW_FOV * Math.PI / 180) * 0.5)) / PC_ITEM_VIEW_LOGICAL_HEIGHT;
    const farX = (sx - PC_ITEM_VIEW_LOGICAL_WIDTH * 0.5) * PC_ITEM_VIEW_FAR * perspectivePerPixel;
    const farY = -(sy - PC_ITEM_VIEW_LOGICAL_HEIGHT * 0.5) * PC_ITEM_VIEW_FAR * perspectivePerPixel;
    const rayFactor = pickUp ? 0.075 : 0.15; // RenderObjectScreen exact
    let x = farX * rayFactor, y = farY * rayFactor, z = -PC_ITEM_VIEW_FAR * rayFactor;
    if (customPosition) {
        if (Number.isFinite(customPosition.posX)) x += customPosition.posX;
        if (Number.isFinite(customPosition.posY)) y += customPosition.posY;
    }
    return [x, y, z];
}

/** Absolute ObjectSelect.Scale from desktop RenderObjectScreen.
 * CustomItemSize.lua is the first owner and therefore overrides every stock
 * branch exactly like CCustomItemSize::CheckCustomItemSize/GetSizeItem.
 */

/**
 * Literal Position[] deltas from Main 5.2 ZzzInventory.cpp::RenderObjectScreen.
 *
 * These are MODEL-SPACE presentation offsets, not slot/CSS centering.  The PC
 * applies them after CreateScreenVector/VectorMA and before RenderPartObject /
 * RenderObject.  FIX7 already ported the authored angles/scales, but omitted
 * these Position[] branches; that made valid BMDs look displaced, clipped or
 * effectively invisible in the small inventory/equipment viewports.
 *
 * `customPosition` owns the first RenderObjectScreen branch, so stock deltas in
 * that branch must not be stacked on top of Configs/lua/CustomItemPosition.
 */
export function inventoryItemPositionOffset(type, rawLevel = 0, customPosition = null) {
    const group = CAT(type), index = OFF(type), level = (rawLevel >> 3) & 0x0F;
    if (customPosition) return [0, 0, 0];
    let x = 0, y = 0, z = 0;

    // Primary weapon/body branches, in the exact else-if priority used by PC.
    if (group === ITEM_SWORD && index === 0) { x -= 0.02; y += 0.03; return [x,y,z]; }
    if (group === ITEM_SPEAR && index === 0) { y += 0.05; return [x,y,z]; }
    if (group === ITEM_HELM && index === 31) { x += 0.03; y -= 0.06; return [x,y,z]; }
    if (group === ITEM_HELM && index === 30) { x -= 0.03; y += 0.07; return [x,y,z]; }
    if (group === ITEM_ARMOR && index === 30) { y += 0.10; return [x,y,z]; }
    if (group === ITEM_ARMOR && index === 29) { y += 0.07; return [x,y,z]; }
    if (group === ITEM_BOW && index === 21) { y += 0.12; return [x,y,z]; }
    if (group === ITEM_STAFF && index === 12) { x += 0.025; y -= 0.10; return [x,y,z]; }
    if (group === ITEM_MACE && index === 14) { x -= 0.01; y += 0.10; return [x,y,z]; }
    if (group === ITEM_ARMOR && index === 34) { y += 0.03; return [x,y,z]; }
    if (group === ITEM_HELM && index === 35) { x -= 0.02; y += 0.05; return [x,y,z]; }
    if (group === ITEM_ARMOR && index === 35) { y += 0.05; return [x,y,z]; }
    if (group === ITEM_ARMOR && (index === 36 || index === 37)) { y -= 0.05; return [x,y,z]; }
    if (group === ITEM_HELM && index >= 39 && index <= 44) { y -= 0.05; return [x,y,z]; }
    if (group === ITEM_ARMOR && index >= 38 && index <= 44) { y -= 0.08; return [x,y,z]; }
    if (group === ITEM_SWORD && index === 24) { x -= 0.02; y += 0.03; return [x,y,z]; }
    if (group === ITEM_MACE && index === 15) { y += 0.05; return [x,y,z]; }
    if (group === ITEM_BOW && (index === 22 || index === 23)) { x -= 0.10; y += 0.08; return [x,y,z]; }
    if (group === ITEM_STAFF && index === 13) { x += 0.02; y += 0.02; return [x,y,z]; }
    if (group === ITEM_STAFF) {
        if (index === 14) y += 0.04;
        else if (index === 17) { x += 0.02; y += 0.03; }
        else if (index === 18) x += 0.02;
        else if (index === 19) { x -= 0.02; y -= 0.02; }
        else if (index === 20) { x += 0.01; y -= 0.01; }
        else if (index === 33) { x += 0.02; y -= 0.06; }
        else if (index === 34) y -= 0.05;
    }
    if (group === ITEM_SPEAR && index === 11) y += 0.02;
    if (group === ITEM_MACE && index === 18) { x -= 0.03; y += 0.06; }
    if (group === ITEM_BOW && index === 24) { x -= 0.07; y += 0.07; }

    // Later source switches run after the primary else-if chain and therefore
    // ADD to the coordinates above. These were still absent in FIX8.
    if (group === ITEM_SWORD && index === 26) { x -= .02; y += .04; }
    else if (group === ITEM_SWORD && index === 28) y += .02;
    else if (group === ITEM_MACE && index === 16) x -= .02;
    else if (group === ITEM_MACE && index === 17) { x -= .02; y += .04; }
    if (group === ITEM_WING && index >= 8 && index <= 11) { x += .005; y -= .02; }
    if (group === ITEM_POTION && index === 21) { x += .005; y -= .005; }
    if (group === ITEM_POTION && (index === 13 || index === 14 || index === 22)) { x += .005; y += .015; }

    // PBG/LEM compiled source branches.
    if (group === ITEM_WING && index === 49) { x += .015; y += .01; }
    if (group === ITEM_WING && index === 50) y += .15;
    if (group === ITEM_ETC && index >= 30 && index <= 36) { x += .03; y += .03; }
    if (group === ITEM_WING && index === 135) { x += .005; y += .05; }
    if (group === ITEM_HELM && (index === 65 || index === 70)) x += .04;

    // Helper / pet / charm presentation offsets from the same source chain.
    if (group === ITEM_HELPER) {
        if (index >= 135 && index <= 145) return [0,.02,0]; // LEM_ADD_LUCKYITEM
        const exact = new Map([
            [32,[ .01,-.03,0]],[33,[0,.02,0]],[34,[.01,.02,0]],[35,[.01,.02,0]],
            [36,[.01,.05,0]],[37,[.01,.04,0]],[38,[0,.02,0]],[43,[.005,-.027,0]],
            [44,[.005,-.03,0]],[45,[.005,-.02,0]],[46,[0,-.04,0]],[47,[0,-.04,0]],
            [48,[0,-.04,0]],[49,[0,-.04,0]],[50,[0,-.03,0]],[51,[0,-.02,0]],
            [52,[0,.045,0]],[53,[0,.04,0]],[59,[.01,.02,0]],[60,[0,-.06,0]],
            [61,[0,-.04,0]],[62,[.01,-.03,0]],[63,[.01,.082,0]],[64,[0,-.05,0]],
            [65,[0,-.02,0]],[66,[.01,-.05,0]],[67,[0,-.05,0]],[68,[.02,-.02,0]],
            [69,[.005,-.05,0]],[70,[.04,0,0]],[71,[0,.07,0]],[72,[0,.07,0]],
            [73,[0,.07,0]],[74,[0,.07,0]],[75,[0,.07,0]],[76,[0,-.02,0]],
            [80,[0,-.05,0]],[81,[.005,.035,0]],[82,[.005,.035,0]],[93,[.005,0,0]],
            [94,[.005,0,0]],[97,[.002,-.04,0]],[98,[.002,-.04,0]],[99,[.002,.025,0]],
            [103,[.01,.01,0]],[104,[.01,-.03,0]],[105,[.01,-.03,0]],[106,[.01,-.05,0]],
            [109,[.025,-.035,0]],[110,[.025,-.035,0]],[111,[.025,-.035,0]],[112,[.025,-.035,0]],
            [113,[.005,0,0]],[114,[.005,0,0]],[115,[.005,0,0]],[116,[.005,-.03,0]],
            [121,[0,-.04,0]],[122,[.01,-.035,0]],[123,[0,-.05,0]],[124,[0,-.04,0]],
            [125,[.007,-.035,0]],[126,[.007,-.035,0]],[127,[.007,-.035,0]],
            [128,[.017,-.053,0]],[129,[.012,-.045,0]],[130,[.007,.005,0]],
            [131,[.017,-.053,0]],[132,[.007,.045,0]],[133,[.017,-.053,0]],[134,[.005,-.033,0]],
        ]);
        if (exact.has(index)) return exact.get(index).slice();
    }

    // Wings and COMGEM compiled jewels. Check_Jewel_Com executes before the
    // generic WING scale branch on PC. These are the net Position[] deltas
    // after the COMGEM position branch plus its scale branch.
    if (group === ITEM_WING) {
        const compiledGemOffset = new Map([
            [136,[0,-.025,0]],[137,[0,0,0]],[138,[0,.05,0]],[139,[0,0,0]],
            [140,[0,0,0]],[141,[0,.025,0]],[142,[-.05,0,0]],[143,[-.05,0,0]],
        ]);
        if (compiledGemOffset.has(index)) return compiledGemOffset.get(index).slice();
        const yMap = new Map([[37,.05],[38,.05],[39,.08],[40,.05],[42,.05],[44,-.015],[45,-.015],[46,-.015],[47,-.015]]);
        if (yMap.has(index)) { y += yMap.get(index); if ([44,45,46,47].includes(index)) x += .005; }
        if (index >= 32 && index <= 34) y -= .05; // scale branch mutates Position too
    }
    if (group === ITEM_POTION) {
        const exact = new Map([
            [41,[0,.02,0]],[42,[0,.02,0]],[43,[-.04,.015,.02]],[44,[-.04,.015,.02]],
            [53,[0,.042,0]],[58,[0,.07,0]],[59,[0,.06,0]],[60,[0,.06,0]],[61,[0,.06,0]],[62,[0,.06,0]],
            [64,[0,.02,0]],[65,[0,.05,0]],[66,[0,.11,0]],[67,[0,.11,0]],[70,[.01,0,0]],[71,[.01,0,0]],
            [72,[0,.08,0]],[73,[0,.08,0]],[74,[0,.08,0]],[75,[0,.08,0]],[76,[0,.08,0]],[77,[0,.08,0]],
            [78,[0,.01,0]],[79,[0,.01,0]],[80,[0,.01,0]],[81,[0,.01,0]],[82,[0,.01,0]],[83,[0,.06,0]],
            [84,[0,.01,0]],[85,[0,-.01,0]],[86,[0,.01,0]],[87,[0,.01,0]],[88,[0,.015,0]],[89,[0,.015,0]],[90,[0,.015,0]],
            [94,[.01,0,0]],[96,[.003,-.013,0]],[97,[0,.09,0]],[98,[0,.09,0]],[99,[.02,-.03,0]],[100,[.01,-.05,0]],
            [101,[.005,0,0]],[102,[.005,.05,0]],[103,[.005,.05,0]],[104,[.005,.05,0]],[105,[.005,.05,0]],
            [106,[.005,.05,0]],[107,[.005,.05,0]],[108,[.005,.05,0]],[109,[.005,.05,0]],
            [110,[.005,-.02,0]],[111,[.01,-.02,0]],[112,[.05,.009,0]],[113,[.05,.009,0]],[120,[.01,.05,0]],
            [133,[.01,0,0]],[140,[0,.09,0]],
        ]);
        if (exact.has(index)) return exact.get(index).slice();
        if (index >= 32 && index <= 34) return level === 1 ? [0,index === 32 ? .08 : .06,0] : [0,.05,0];
        if (index === 160 || index === 161) return [0,.05,0];
        if ((index >= 114 && index <= 119) || (index >= 126 && index <= 132)) return [0,.06,0];
        if (index >= 134 && index <= 139) return [0,.05,0];
        if (index >= 145 && index <= 150) return [.01,.04,0];
    }

    // Inventory-only HideSkin body offsets that sit late in RenderObjectScreen.
    // These four rows were still falling through to the generic 270/-10 body
    // presentation in FIX8, which visibly shifted early Elf armor/pants icons.
    if (group === ITEM_ARMOR && (index === 10 || index === 11)) y -= 0.10;
    if (group === ITEM_PANTS && (index === 10 || index === 11)) y -= 0.08;

    // Monk/Rage Fighter stock branches compiled in this client.
    if (group === ITEM_HELM && index === 59) y += 0.04;
    if (group === ITEM_SWORD && index === 32) { x += .005; y += .015; }
    if (group === ITEM_SWORD && (index === 33 || index === 34)) { x += .002; y += .02; }
    return [x, y, z];
}

export function pcInventoryModelScale(type, rawLevel = 0, customSize = null) {
    if (Number.isFinite(customSize) && customSize > 0) return customSize;
    const g = CAT(type), i = OFF(type), lv = (rawLevel >> 3) & 0x0F;

    // RenderItem3D remaps whose RenderObjectScreen Type is MODEL_EVENT/etc.
    if (g === ITEM_POTION && i === 11) {
        if (lv === 3 || lv === 13) return 0.0039; // EVENT+6
        if (lv === 5) return 0.0015;             // EVENT+8
        if (lv === 6) return 0.0019;             // EVENT+9
        if (lv >= 8 && lv <= 12) return 0.0010;  // EVENT+10
        return 0.0025;                           // EVENT+4/+5/default
    }
    if (g === ITEM_HELPER && i === 14 && lv === 1) return 0.0020; // EVENT+16
    if (g === ITEM_POTION && i === 21 && (lv === 1 || lv === 2)) return 0.0015; // EVENT+11
    if (g === ITEM_POTION && i === 23 && lv === 1) return 0.0012; // EVENT+12
    if (g === ITEM_POTION && i === 24 && lv === 1) return 0.0025; // EVENT+13
    if (g === ITEM_HELPER && i === 20) return lv === 0 ? 0.0023 : 0.0028; // EVENT+15/+14
    if (g === ITEM_HELPER && i === 19) {
        if (lv === 0) return 0.0010; // STAFF+10 with ItemLevel=-1
        if (lv === 1) return 0.0010; // SWORD+19 with ItemLevel=-1
        if (lv === 2) return 0.0015; // BOW+18 with ItemLevel=-1
    }
    if (g === ITEM_POTION && i >= 32 && i <= 34 && lv === 1) return 0.0020; // EVENT+21..23

    // Compiled jewels live in the WING type range but COMGEM owns their scale
    // before the generic WING branch. Bless_C/Soul_C use COMGEM's 0.004 default.
    if (g === ITEM_WING) {
        const compiledGemScale = new Map([
            [30,0.0040],[31,0.0040],[136,0.0035],[137,0.0025],[138,0.0036],
            [139,0.0035],[140,0.0050],[141,0.0020],[142,0.0030],[143,0.0040],
        ]);
        if (compiledGemScale.has(i)) return compiledGemScale.get(i);
    }

    // LEM lucky-helm inventory scale is a late source override before the
    // generic HELM body branch.  These four types are intentionally much
    // smaller in RenderObjectScreen (Main 5.2).
    if (g === ITEM_HELM && [62,63,65,70].includes(i)) return 0.0010;

    // Body equipment branch (MODEL_PLAYER skeleton + RenderPartObject on PC).
    if (g >= ITEM_HELM && g <= ITEM_BOOTS) {
        if (g === ITEM_HELM) {
            if ((i >= 39 && i <= 44) || i === 31) return 0.0070;
            return 0.0039;
        }
        if (g === ITEM_ARMOR) return (i === 34 || i === 35) ? 0.0032 : 0.0039;
        if (g === ITEM_GLOVES) return i === 38 ? 0.0032 : 0.0038;
        if (g === ITEM_PANTS) return 0.0033;
        if (g === ITEM_BOOTS) return 0.0032;
    }

    if (g === ITEM_WING) {
        if (i === 6) return 0.0015;
        if (i >= 32 && i <= 34) return 0.0010;
        if (i >= 60 && i <= 65) return 0.0022;
        if (i >= 70 && i <= 74) return 0.0017;
        if (i >= 100 && i <= 129) return 0.0017;
        if (i === 130 || i === 135) return 0.0012;
        return 0.0020;
    }

    if (g === ITEM_SPEAR) {
        if (i === 10) return 0.0018;
        if (i === 11) return 0.0025;
        return 0.0021;
    }
    if (g === ITEM_STAFF) {
        if (i === 10) return 0.0019;
        if (i >= 14 && i <= 20) return 0.0028;
        if (i >= 21 && i <= 29) return 0.0040;
        if (i === 33 || i === 34) return 0.0028;
        return 0.0022;
    }
    if (g === ITEM_BOW) {
        if (i === 7) return 0.0012;
        if (i === 15) return 0.0011;
        if (i === 18) return 0.0025;
        if (i === 19) return 0.0020;
        if (i === 21) return 0.0022;
        if (i === 22) return 0.0020;
        if (i === 23) return 0.0032;
        if (i === 24) return 0.0023;
        return 0.0025;
    }
    if (g === ITEM_MACE) {
        if (i >= 8 && i <= 11) return 0.0030;
        if (i === 12) return 0.0025;
        if (i === 18) return 0.0024;
        return 0.0025;
    }
    if (g === ITEM_SWORD) {
        if (i === 19) return 0.0025;
        if (i === 24) return 0.0028;
        if (i >= 32 && i <= 34) return 0.0035;
        return 0.0025;
    }

    if (g === ITEM_HELPER) {
        if (i >= 135 && i <= 145) return 0.0010; // LEM_ADD_LUCKYITEM
        const exact = new Map([
            [4,0.0015],[5,0.0050],[14,0.0030],[15,0.0030],[16,0.0020],[17,0.0018],[18,0.0018],
            [30,0.0020],[32,0.0019],[33,0.0040],[34,0.0040],[35,0.0040],
            [36,0.0070],[37,0.0050],[38,0.0025],[43,0.0021],[44,0.0021],
            [45,0.0021],[46,0.0018],[47,0.0018],[48,0.0018],[49,0.0013],
            [50,0.0030],[51,0.0030],[52,0.0050],[53,0.0050],[59,0.0008],
            [60,0.0050],[61,0.0018],[62,0.0020],[63,0.0020],[64,0.0005],
            [65,0.0016],[66,0.0020],[67,0.0015],[68,0.0026],[69,0.0023],
            [70,0.0018],[76,0.0026],[80,0.0020],[81,0.0012],[82,0.0012],
            [93,0.0021],[94,0.0021],[97,0.0028],[98,0.0028],[99,0.0025],
            [105,0.0020],[106,0.0015],[107,0.0034],[121,0.0018],[122,0.0033],
            [116,0.0021],[123,0.0009],[124,0.0018],[128,0.0035],[129,0.0035],[130,0.0032],
            [131,0.0033],[132,0.0025],[133,0.0033],[134,0.0033],
        ]);
        if (i >= 54 && i <= 58) return 0.0040;
        if (i >= 71 && i <= 75) return 0.0019;
        if (i >= 109 && i <= 112) return 0.0045;
        if (i >= 113 && i <= 115) return 0.0018;
        if (i >= 125 && i <= 127) return 0.0013;
        return exact.get(i) ?? 0.0025;
    }

    if (g === ITEM_POTION) {
        if (i === 160 || i === 161) return 0.0010; // LEM_ADD_LUCKYITEM
        const exact = new Map([
            [7,0.0025],[21,0.0020],[41,0.0035],[42,0.0050],[43,0.0035],
            [44,0.0040],[45,0.0030],[49,0.0030],[50,0.0010],[52,0.0014],
            [53,0.00078],[54,0.0024],[58,0.0012],[59,0.0010],[60,0.0010],
            [61,0.0009],[62,0.0009],[63,0.0070],[64,0.0030],[65,0.0030],
            [66,0.0035],[67,0.0035],[68,0.0030],[83,0.0009],[84,0.0031],
            [85,0.0044],[86,0.0031],[87,0.0061],[88,0.0035],[89,0.0035],
            [90,0.0035],[91,0.0034],[92,0.0024],[93,0.0024],[94,0.0022],
            [95,0.0024],[96,0.0028],[99,0.0025],[100,0.0040],[109,0.0030],
            [110,0.0040],[133,0.0030],[140,0.0026],
        ]);
        if (i >= 46 && i <= 48) return 0.0025;
        if (i >= 70 && i <= 71) return 0.0028;
        if (i >= 72 && i <= 82) return 0.0025;
        if (i >= 97 && i <= 98) return 0.0030;
        if (i >= 101 && i <= 109) return i === 102 ? 0.0050 : (i === 109 ? 0.0030 : 0.0040);
        if (i >= 112 && i <= 113) return 0.0032;
        if ((i >= 114 && i <= 119) || (i >= 126 && i <= 132)) return 0.0038;
        if (i >= 134 && i <= 139) return 0.0050;
        if (i >= 145 && i <= 150) return 0.0018;
        return exact.get(i) ?? 0.0035;
    }

    if (g === ITEM_ETC && ((i >= 19 && i <= 27) || (i >= 30 && i <= 36))) return 0.0023;

    return 0.0025;
}

/**
 * Offsets (fx, fy) do RenderItem3D PC — literal por ramo.
 * @returns {[number, number]} fatores aplicados como sx+=W*fx, sy+=H*fy
 */
export function renderItem3dOffset(type, level = 0) {
    const W = 1, H = 1; // fatores (multiplicam Width/Height no destino)
    const t = type, lv3 = level >> 3;
    // Bornes em TYPE-SPACE (categoria*512): no PC os enums ITEM_* já são
    // type-space (ITEM_MACE=2*512=1024); aqui as constantes são categorias,
    // então todo borne usa *512 explicitamente.
    // PBG_ADD_NEWCHAR_MONK_ITEM applies an additional -0.25W/-0.25H
    // after the ordinary sword-family offset.
    if (t >= ITEM_SWORD * 512 + 32 && t <= ITEM_SWORD * 512 + 34) return [0.55, 0.60];
    if (t >= ITEM_SWORD * 512 && t < ITEM_SWORD * 512 + MAX_ITEM_INDEX) return [0.8, 0.85];
    if (t >= ITEM_AXE * 512 && t < ITEM_MACE * 512 + MAX_ITEM_INDEX) {
        // PC: a exceção ITEM_MACE+13 está DENTRO deste ramo (else interno) —
        // mantendo a ordem PC, senão o genérico AXE/MACE a engoliria.
        if (t === ITEM_MACE * 512 + 13) return [0.6, 0.5];
        return [0.8, 0.7];
    }
    if (t >= ITEM_SPEAR * 512 && t < ITEM_SPEAR * 512 + MAX_ITEM_INDEX) return [0.6, 0.65];
    if (t === ITEM_BOW * 512 + 17) return [0.5, 0.5];
    if (t === ITEM_BOW * 512 + 19) return [0.7, 0.75];
    if (t === ITEM_BOW * 512 + 20) return [0.5, 0.55];
    if (t >= ITEM_BOW * 512 + 8 && t < ITEM_BOW * 512 + MAX_ITEM_INDEX) return [0.7, 0.7];
    if (t >= ITEM_STAFF * 512 && t < ITEM_STAFF * 512 + MAX_ITEM_INDEX) return [0.6, 0.55];
    if (t >= ITEM_SHIELD * 512 && t < ITEM_SHIELD * 512 + MAX_ITEM_INDEX) {
        if (t === ITEM_SHIELD * 512 + 15) return [0.5, 0.7];
        if (t === ITEM_SHIELD * 512 + 16) return [0.5, 0.9];
        if (t === ITEM_SHIELD * 512 + 21) return [0.05, 0.5];
        return [0.5, 0.6];
    }
    if (t >= ITEM_HELM * 512 && t < ITEM_HELM * 512 + MAX_ITEM_INDEX) return [0.5, 0.8];
    if (t >= ITEM_ARMOR * 512 && t < ITEM_ARMOR * 512 + MAX_ITEM_INDEX) {
        const o = OFF(t);
        if (o === 2 || o === 4 || o === 6) return [0.5, 1.05];
        if (o === 3 || o === 8) return [0.5, 1.1];
        if (o === 17 || o === 18 || o === 20) return [0.5, 0.8];
        if (o === 15) return [0.5, 1.0];
        return [0.5, 0.8];
    }
    if (t >= ITEM_PANTS * 512 && t < ITEM_BOOTS * 512 + MAX_ITEM_INDEX) return [0.5, 0.9];
    if (t === ITEM_HELPER * 512 + 14 && lv3 === 1) return [0.55, 0.85];
    if (t === ITEM_HELPER * 512 + 14 || t === ITEM_HELPER * 512 + 15) return [0.6, 1.0];
    if (t === ITEM_HELPER * 512 + 16 || t === ITEM_HELPER * 512 + 17) return [0.5, 0.9];
    if (t === ITEM_HELPER * 512 + 18) return [0.5, 0.75];
    if (t === ITEM_HELPER * 512 + 19) return lv3 === 0 ? [0.5, 0.5] : lv3 === 1 ? [0.7, 0.8] : [0.7, 0.7];
    if (t === ITEM_HELPER * 512 + 20) return lv3 === 0 ? [0.5, 0.65] : [0.5, 0.8];
    if (t === ITEM_HELPER * 512 + 29) return [0.5, 0.5];
    if (t === ITEM_HELPER * 512 + 4) return [0.5, 0.6];
    if (t === ITEM_HELPER * 512 + 30) return [0.5, 0.5];
    if (t === ITEM_HELPER * 512 + 31) return [0.5, 0.9];
    if (t === ITEM_POTION * 512 + 7) return [0.5, 0.5];
    if (t === ITEM_HELPER * 512 + 7) return [0.5, 0.9];
    if (t === ITEM_HELPER * 512 + 11) return lv3 === 0 ? [0.5, 0.8] : [0.5, 0.5];
    if (t === ITEM_HELPER * 512 + 32) return [0.5, 0.5];
    // PC L10907+: MODEL_HELPER+33..37 (mesmo type-space: 13*512+33..37)
    if (t >= ITEM_HELPER * 512 + 33 && t <= ITEM_HELPER * 512 + 37) return [0.5, 0.5];
    if (t >= ITEM_HELPER * 512 && t < ITEM_HELPER * 512 + MAX_ITEM_INDEX) return [0.5, 0.7];
    if (t === ITEM_POTION * 512 + 12) return [0.5, 0.5];
    if (t === ITEM_POTION * 512 + 11 && (lv3 === 3 || lv3 === 13)) return [0.5, 0.5];
    if (t === ITEM_POTION * 512 + 11 && (lv3 === 14 || lv3 === 15)) return [0.5, 0.8];
    if (t === ITEM_POTION * 512 + 9 && lv3 === 1) return [0.5, 0.8];
    if (t === ITEM_POTION * 512 + 17 || t === ITEM_POTION * 512 + 18 || t === ITEM_POTION * 512 + 19) return [0.5, 0.5];
    if (t === ITEM_POTION * 512 + 21) return lv3 === 0 ? [0.5, 0.5] : lv3 === 3 ? [0.5, 0.5] : [0.4, 0.8];
    if (t >= ITEM_POTION * 512 + 22 && t < ITEM_POTION * 512 + 25) {
        if (t === ITEM_POTION * 512 + 24 && lv3 === 1) return [0.5, 0.8];
        return [0.5, 0.95];
    }
    if (t >= ITEM_POTION * 512 + 46 && t <= ITEM_POTION * 512 + 48) return [0.5, 0.5];
    if (t >= ITEM_POTION * 512 + 25 && t < ITEM_POTION * 512 + 27) return [0.5, 0.9];
    if (t === ITEM_POTION * 512 + 31) return [0.5, 0.5];
    if (t === ITEM_WING * 512 + 30 || t === ITEM_WING * 512 + 31) return [0.55, 0.8];
    if (t >= ITEM_WING * 512 + 136 && t <= ITEM_WING * 512 + 143) return [0.55, 0.82];
    if (t === ITEM_WING * 512 + 3) return [0.5, 0.45];
    if (t === ITEM_WING * 512 + 4) return [0.5, 0.4];
    if (t === ITEM_WING * 512 + 5) return [0.5, 0.75];
    if (t === ITEM_WING * 512 + 6) return [0.5, 0.55];
    if (t === ITEM_POTION * 512 + 100) return [0.49, 0.28];
    if (t >= ITEM_POTION * 512 && t < ITEM_POTION * 512 + MAX_ITEM_INDEX) return [0.5, 0.95];
    if ((t >= ITEM_WING * 512 + 12 && t <= ITEM_WING * 512 + 14) || (t >= ITEM_WING * 512 + 16 && t <= ITEM_WING * 512 + 19)) return [0.5, 0.75];
    if (t === ITEM_HELPER * 512 + 66) return [1.5, 1.5];
    if (t === ITEM_WING * 512 + 49) return [0.5, 0.5]; // Monk ifdef
    if (t === ITEM_WING * 512 + 50) return [0.5, 0.5]; // Monk ifdef
    return [0.5, 0.6]; // default PC
}


/**
 * Ângulo de apresentação do RenderObjectScreen/RenderItem3D do PC.
 * `rawLevel` é o byte ItemInfo original; retorna [X,Y,Z] em graus MU.
 * CustomItemPosition é carregado do Lua real do cliente e tem precedência
 * exatamente antes dos branches built-in, como RenderObjectScreen no PC.
 */
export function inventoryItemAngles(type, rawLevel = 0, twoHand = null, customPosition = null) {
    const group = CAT(type), index = OFF(type), level = (rawLevel >> 3) & 0x0F;
    let a = [270, -10, 0]; // fallback desktop
    if (customPosition && Number.isFinite(customPosition.angleX) && Number.isFinite(customPosition.angleY) && Number.isFinite(customPosition.angleZ)) return [customPosition.angleX, customPosition.angleY, customPosition.angleZ];

    // Alternate MODEL_EVENT presentations selected by RenderItem3D.
    if (type === ITEM_HELPER * 512 + 14 && level === 1) return [-90, 0, 0];
    if (type === ITEM_POTION * 512 + 9 && level === 1) return [270, 0, 0];
    if (type === ITEM_POTION * 512 + 21 && (level === 1 || level === 2)) return [-90, -20, -20];
    if (type === ITEM_POTION * 512 + 23 && level === 1) return [250, 140, 0];
    if (type === ITEM_POTION * 512 + 24 && level === 1) return [270, 0, 0];
    if (type === ITEM_HELPER * 512 + 20) return level === 0 ? [270, 0, 0] : [255, 160, 0];
    if (type === ITEM_HELPER * 512 + 11 && level === 1) return [270, 0, 0];
    if (type === ITEM_POTION * 512 + 11) {
        if (level === 2 || level === 14 || level === 15) return [270, 180, 0];
        if (level === 3 || level === 13) return [270, 90, 0];
        if (level === 1 || level === 5 || level === 6 || (level >= 8 && level <= 12)) return [270, 0, 0];
    }

    // Weapons.
    if (type === ITEM_SWORD * 512) return [180, 270, 15];
    if (type === ITEM_BOW * 512 + 7 || type === ITEM_BOW * 512 + 15) return [0, 270, 15];
    if (type === ITEM_SPEAR * 512) return [0, 90, 20];
    if (type === ITEM_BOW * 512 + 17) return [0, 90, 15];
    if ([20,21,22,23,24].includes(index) && group === ITEM_BOW) return [180, -90, 15];
    if (group === ITEM_BOW && index >= 8) return [90, 180, 20];
    if (group === ITEM_SPEAR && index === 10) return [180, 270, 20];
    if (group === ITEM_SPEAR && index === 11) return [180, 90, 15];
    if (group === ITEM_MACE && (index === 14 || index === 15)) return [180, 90, 13];
    if (group === ITEM_MACE && (index === 16 || index === 17)) return [180, 270, 15];
    if (group === ITEM_MACE && index === 18) return [180, 90, 2];
    if (group === ITEM_SWORD && (index === 26 || index === 28)) return [180, 270, 10];
    if (group === ITEM_SWORD && index === 27) return [180, 270, 15];
    if (group === ITEM_STAFF && index === 7) return [0, 0, 205];
    if (group === ITEM_STAFF && index === 12) return [180, 0, 8];
    if (group === ITEM_STAFF && index === 13) return [180, 90, 8];
    if (group === ITEM_STAFF && index >= 21 && index <= 29) return [0, 0, 0];
    if (group === ITEM_STAFF && index >= 30 && index <= 32) return [180, 90, 10];
    if (group >= ITEM_SWORD && group <= ITEM_STAFF) return [180, 270, twoHand === true ? 25 : 15];
    if (group === ITEM_SHIELD) return [270, 270, 0];

    // Armour exceptions; remaining body pieces use fallback 270/-10.
    if (group === ITEM_HELM) {
        if ([30,31,35].includes(index)) return [-90, 0, 0];
        if (index >= 39 && index <= 44) return [-90, 25, 0];
    }
    if (group === ITEM_ARMOR) {
        if ([29,30,34,35,36,37].includes(index) || (index >= 38 && index <= 44)) return [-90, 0, 0];
        if (index === 10 || index === 11) return [270, 0, 0];
    }
    if (group === ITEM_PANTS && (index === 10 || index === 11)) return [270, 0, 0];

    if (group === ITEM_WING && [30,31,136,137,138,139,140,141,142,143].includes(index)) {
        if (index === 139) return [270, 90, 0];
        if (index === 142 || index === 143) return [270, -10, -45];
        return [270, -10, 0];
    }

    if (group === ITEM_WING) {
        if (index === 49) return [-90, 0, 0];
        if (index === 50) return [270, -10, 0];
        if (index >= 60 && index <= 65) return [10, -10, 10];
        if ((index >= 70 && index <= 74) || (index >= 100 && index <= 129)) return [0, 0, 0];
        if ([37,38,39,40].includes(index)) return [270, -10, 0];
        if (index === 42) return [270, 0, 2];
        if ([7,44,45,46,47].includes(index)) return [270, 0, 0];
        return a;
    }

    if (group === ITEM_HELPER) {
        if (index >= 135 && index <= 145) return [270, 0, 0];
        if (index === 3 || index === 4) return [-90, -90, 0];
        if (index === 5) return [-90, -35, 0];
        if (index === 16 || index === 17) return [270, -10, 0];
        if (index === 18 || index === 29) return [290, 0, 0];
        if ([21,22,23,24].includes(index)) return [270, 160, 20];
        if (index === 30) return [-90, 0, 0];
        if (index === 31) return [-90, -90, 0];
        if ([32,33,34,35,36,37,39,40,41,42,51,46,47,48,49,50,52,54,55,56,57,58,60,61,62,66,76,97,98,104,105,121,124,125,126,127].includes(index)) return [270, 0, 0];
        if (index === 38) return [-198, 0, 0];
        if (index === 43) return [90, 0, 180];
        if (index === 44 || index === 45) return [90, 0, 0];
        if (index === 53) return [270, 120, 0];
        if (index === 59 || index === 63) return [90, 0, 0];
        if (index === 64 || index === 65) return [270, -10, 0];
        if (index === 67 || index === 80 || index === 123) return [270, 40, 0];
        if (index === 68) return [300, 10, 20];
        if (index === 69) return [270, -30, 0];
        if (index === 70) return [270, 0, 70];
        if ([71,72,73,74,75].includes(index)) return [270, 180, 0];
        if ([81,82,93,94].includes(index)) return [-90, 0, 0];
        if (index === 99) return [270, 180, 45];
        if (index === 103) return [0, 0, 0];
        if (index === 106) return [255, 45, 0];
        if (index === 107) return [90, 225, 45];
        if ([109,110,111,112].includes(index)) return [270, 25, 25];
        if ([113,114,115,116].includes(index)) return [270, 0, 0];
        if (index >= 128 && index <= 134) return [270, -20, 0];
        return [0, 0, 0];
    }

    if (group === ITEM_POTION) {
        if (index === 12) {
            if (level === 0) return [180, 0, 0];
            if (level === 1) return [270, 90, 0];
            if (level === 2) return [90, 0, 0];
        }
        if (index === 41) return [270, 90, 0];
        if (index === 42) return [270, -10, 0];
        if (index === 43 || index === 44) return [270, -10, -45];
        if (index === 52) return [270, -25, 0];
        if (index === 53) return [180, 0, 0];
        if (index === 63) return [-50, -60, 0];
        if ([72,73,74,75,76,77,97,98,140].includes(index)) return [0, 0, 0];
        if (index === 99) return [290, -40, 0];
        if (index === 100 || index === 109) return [0, 0, 0];
        if (index >= 101 && index <= 108) return [0, 0, 30];
        if (index === 112 || index === 113) return [270, 180, 45];
        return [270, 0, 0];
    }

    if (group === ITEM_ETC && index >= 30 && index <= 36) return [270, 0, 0];
    return a;
}

/** ZzzMathLib::AngleMatrix — matrix=(Z*Y)*X, degrees. */
function muAngleMatrix4([x, y, z]) {
    const k = Math.PI / 180;
    const sy = Math.sin(z*k), cy = Math.cos(z*k);
    const sp = Math.sin(y*k), cp = Math.cos(y*k);
    const sr = Math.sin(x*k), cr = Math.cos(x*k);
    const m00=cp*cy, m10=cp*sy, m20=-sp;
    const m01=sr*sp*cy + cr*-sy, m11=sr*sp*sy + cr*cy, m21=sr*cp;
    const m02=cr*sp*cy + -sr*-sy, m12=cr*sp*sy + -sr*cy, m22=cr*cp;
    return new THREE.Matrix4().set(
        m00,m01,m02,0,
        m10,m11,m12,0,
        m20,m21,m22,0,
        0,0,0,1,
    );
}

/**
 * Modelo real do item pela tabela AccessModel + remaps verificados do
 * RenderItem3D/CreateItem que dependem de Level>>3. `rawLevel` é o byte
 * Attribute1 do ItemInfo[12], não o +level já reduzido.
 */
export function itemModelPath(type, rawLevel = 0) {
    if (!Number.isInteger(type) || type < 0 || type === 0x1FFF) return null;
    const group = CAT(type), index = OFF(type), level = (rawLevel >> 3) & 0x0F;

    // Same owner/order as ItemModelResolver: retained current-client
    // LoadItens.lua is appended after the stock AccessModel table, so an exact
    // custom item type owns the BMD path before the stock family fallback.
    const custom = customItemModelForType(type);
    if (custom?.path) return custom.path;

    // Body equipment uses an explicit AccessModel table in ZzzOpenData.cpp.
    // Do NOT synthesize Player/<Part>MaleNN for holes in that table: FIX7 did
    // so for 47/48 helms, 54..58 and arbitrary >61 indices, which can resolve a
    // real-but-WRONG BMD and is worse than a fail-closed empty slot.
    if (group >= ITEM_HELM && group <= ITEM_BOOTS) {
        const part = ['Helm','Armor','Pant','Glove','Boot'][group - ITEM_HELM];
        const path = (family, number) => `Player/${family}${String(number).padStart(2, '0')}.bmd`;
        if (index >= 0 && index <= 9) return path(`${part}Male`, index + 1);
        if (index >= 10 && index <= 14) return path(`${part}Elf`, index - 9);
        if (index === 15) return group === ITEM_HELM ? null : path(`${part}Male`, 16);
        if (index === 16) return path(`${part}Male`, 17);
        if (index >= 17 && index <= 20) {
            if (index === 19) return path(`${part}MaleTest`, 20);
            if (group === ITEM_HELM && index === 20) return null;
            if (group === ITEM_PANTS && index === 18) return path('t_PantMale', 19);
            return path(`${part}Male`, index + 1);
        }
        if (index >= 21 && index <= 24) {
            if (group === ITEM_HELM && index === 23) return null;
            return path(`${part}Male`, index + 1);
        }
        if (index >= 25 && index <= 28) return path(`${part}Male`, index + 1);
        if (index >= 29 && index <= 33) {
            if (group === ITEM_HELM && index === 32) return null;
            return path(`HDK_${part}Male`, index - 28);
        }
        if (index >= 34 && index <= 38) {
            if (group === ITEM_HELM && index === 37) return null;
            return path(`CW_${part}Male`, index - 33);
        }
        if (index >= 39 && index <= 44) return path(`${part}Male`, index + 1);
        if (index >= 45 && index <= 53) {
            if (group === ITEM_HELM && (index === 47 || index === 48)) return null;
            return path(`${part}Male`, index + 1);
        }
        // PBG_ADD_NEWCHAR_MONK_ITEM appends only these base families. Gloves
        // intentionally have no MODEL_GLOVES+59..61 AccessModel row.
        if (index >= 59 && index <= 61 && group !== ITEM_GLOVES)
            return path(`${part}Male`, index + 1);
        return null;
    }

    if (group === ITEM_POTION && index === 11) {
        if (level === 1) return 'Item/MagicBox02.bmd';
        if (level === 2 || level === 14 || level === 15) return 'Item/MagicBox03.bmd';
        if (level === 3 || level === 13) return 'Item/MagicBox05.bmd';
        if (level === 5) return 'Item/MagicBox06.bmd';
        if (level === 6) return 'Item/MagicBox07.bmd';
        if (level >= 8 && level <= 12) return 'Item/MagicBox08.bmd';
    }
    if (group === ITEM_HELPER && index === 14 && level === 1) return 'Item/DarkLordSleeve.bmd';
    if (group === ITEM_POTION && index === 9 && level === 1) return 'Item/Beer02.bmd';
    if (group === ITEM_POTION && index === 21 && (level === 1 || level === 2)) return 'Item/EventBloodCastle03.bmd';
    if (group === ITEM_POTION && index === 32 && level === 1) return 'Item/p03box.bmd';
    if (group === ITEM_POTION && index === 33 && level === 1) return 'Item/obox02.bmd';
    if (group === ITEM_POTION && index === 34 && level === 1) return 'Item/blue01.bmd';
    if (group === ITEM_POTION && index === 23 && level === 1) return 'Item/QuestItem3rd00.bmd';
    if (group === ITEM_POTION && index === 24 && level === 1) return 'Item/QuestItem3rd01.bmd';
    if (group === ITEM_HELPER && index === 20) {
        if (level === 0) return 'Item/MagicRing00.bmd';
        if (level >= 1 && level <= 3) return 'Item/RingOfLordEvent00.bmd';
    }
    if (group === ITEM_HELPER && index === 11 && level === 1) return 'Item/LifestoneItem.bmd';
    if (group === ITEM_HELPER && index === 19) {
        if (level === 0) return 'Item/Staff11.bmd';
        if (level === 1) return 'Item/Sword20.bmd';
        if (level === 2) return 'Item/Bow19.bmd';
    }

    // R46 physical inventory closure. These are NOT filename guesses: the
    // current client manifest contains these exact BMDs and retained PC/mobile
    // project evidence binds the server types to the same authored models.
    // R45.2 physically logged these three types as missing in ItemIconRenderer.
    if (group === ITEM_WING && index === 144) return 'Item/Wing144.bmd'; // 6288 Wings of Conqueror
    if (group === ITEM_WING && index === 145) return 'Item/Wing145.bmd'; // 6289 Cloak of Death
    if (group === ITEM_HELPER && index === 200) return 'Item/icon_horse_abbadon.bmd'; // 6856 Abaddon Horse

    const fams = ['SWORD', 'AXE', 'MACE', 'SPEAR', 'BOW', 'STAFF', 'SHIELD',
        'HELM', 'ARMOR', 'PANTS', 'GLOVES', 'BOOTS', 'WING', 'HELPER', 'POTION', 'ETC'];
    const key = `${fams[group]}:${index}`;
    return ITEM_MODEL_MAP[key] || null;
}

/**
 * Render 3D do item num canvas de slot — paridade RenderItem3D:
 * modelo BMD real + offsets da tabela + câmera perspectiva PC de 1 grau.
 * Cache por type+level (o PC cacheia AccessModel/RenderObject).
 *
 * @param {object} io { loadBMD, fetchBinary } (MUAssets/RemoteAssets)
 * @param {number} type Type 12-bit do item (F3:10: item[1]|item[2]<<8)
 * @param {number} level nível do item (switches Level>>3 do PC)
 * @returns {Promise<HTMLCanvasElement|null>} canvas do ícone ou null (fail-closed)
 */
const _iconCache = new Map();
const _warned = new Set();
const _inventoryRenderDataCache = new Map();
const _iconInflight = new Map();
const _iconQueue = [];
let _iconQueueActive = 0;
const ICON_COLD_CONCURRENCY = 2;
function nextUiFrame(){return new Promise((resolve)=>{if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>resolve());else setTimeout(resolve,0);});}
function scheduleColdIcon(job){
    return new Promise((resolve,reject)=>{
        _iconQueue.push({job,resolve,reject});
        pumpColdIconQueue();
    });
}
function pumpColdIconQueue(){
    while(_iconQueueActive<ICON_COLD_CONCURRENCY&&_iconQueue.length){
        const task=_iconQueue.shift();_iconQueueActive++;
        Promise.resolve().then(task.job).then(task.resolve,task.reject).finally(async()=>{
            _iconQueueActive--;
            // R82 keeps at most two cold BMD/material compositions in flight.  This
            // overlaps asset decode/texture fetch without creating extra WebGL contexts;
            // the single shared GL render itself remains synchronous on the main thread.
            // Yield a frame after each completion so world presentation stays responsive.
            await nextUiFrame();
            pumpColdIconQueue();
        });
    }
}

export function pcInventoryBodyHeight(type) {
    const g = CAT(type), i = OFF(type);
    const lucky = i >= 62 && i <= 72; // Check_LuckyItem(type): Main 5.2 LEM branch
    if (g === ITEM_HELM) return lucky ? -170 : -160;
    if (g === ITEM_ARMOR) return lucky ? -113 : -100;
    if (g === ITEM_GLOVES) return -70;
    if (g === ITEM_PANTS) return -50;
    return 0; // boots and non-body items
}

/**
 * PC RenderObjectScreen does not render HELM..BOOTS as standalone skeletons.
 * It sets ObjectSelect.Type=MODEL_PLAYER, animates Player.bmd action 0 and
 * RenderPartObject skins exactly the requested part against that player bone
 * palette. Rebuild the same render-data here instead of treating Armor*.bmd
 * as an independent model. No placeholder geometry is created.
 */
function pcInventoryHideSkinMeshSet(type) {
    const g = CAT(type), i = OFF(type);
    // RenderPartObject(... HideSkin=true ...) inventory-only mesh selection.
    if (g === ITEM_ARMOR && i === 31) return new Set([0,1]);
    if (g === ITEM_PANTS && i === 31) return new Set([0,1]);
    if (g === ITEM_ARMOR && i === 36) return new Set([2]);
    if (g === ITEM_PANTS && i === 36) return new Set([0]);
    if (g === ITEM_GLOVES && i === 36) return new Set([0]);
    if (g === ITEM_HELM && i >= 39 && i <= 44) return new Set([[2,1,0,2,1,2][i-39]]);
    if (g === ITEM_GLOVES && i === 44) return new Set([0]);
    if (g === ITEM_HELM && i === 49) return new Set([0]);
    if (g === ITEM_ARMOR && i === 49) return new Set([2]);
    if (g === ITEM_HELM && i === 50) return new Set([1]);
    if (g === ITEM_HELM && i === 53) return new Set([2]);
    if (g === ITEM_HELM && (i === 59 || i === 60)) return new Set([1]);
    if (g === ITEM_HELM && i === 61) return new Set([0]);
    if (g === ITEM_HELM && i === 65) return new Set([2]);
    if (g === ITEM_HELM && i === 70) return new Set([1]);
    return null;
}

export function pcInventoryHideSkinMeshIndices(type) {
    const s = pcInventoryHideSkinMeshSet(type);
    return s ? [...s].sort((a,b)=>a-b) : null;
}

function splitTextureOwner(path) {
    const clean=String(path||'').replace(/\\/g,'/');
    const slash=clean.lastIndexOf('/');
    return { FileName: slash >= 0 ? clean.slice(slash+1) : clean, Dir: slash >= 0 ? clean.slice(0,slash) : 'Player' };
}

export function pcInventoryHideSkinTextureOverride(type) {
    const g=CAT(type), i=OFF(type);
    if (g === ITEM_ARMOR && i >= 39 && i <= 44) return splitTextureOwner(`Player/InvenArmorMale${40+i-39}.tga`);
    if (g === ITEM_PANTS && i >= 39 && i <= 44) return splitTextureOwner(`Player/InvenPantsMale${40+i-39}.tga`);
    if (g === ITEM_ARMOR && i === 50) return splitTextureOwner('Player/Item312_Armoritem.tga');
    if (g === ITEM_PANTS && i === 50) return splitTextureOwner('Player/Item312_Pantitem.tga');
    if (g === ITEM_ARMOR && i === 53) return splitTextureOwner('Player/SkinClass706_upperitem.tga');
    if (g === ITEM_PANTS && i === 53) return splitTextureOwner('Player/SkinClass706_loweritem.tga');
    if (g === ITEM_ARMOR && i === 65) return splitTextureOwner('Player/LuckyItem/65/InvenArmorMale40_luck.tga');
    if (g === ITEM_PANTS && i === 65) return splitTextureOwner('Player/LuckyItem/65/InvenPantsMale40_luck.tga');
    if (g === ITEM_ARMOR && i === 70) return splitTextureOwner('Player/LuckyItem/70/InvenArmorMale41_luck.tga');
    if (g === ITEM_PANTS && i === 70) return splitTextureOwner('Player/LuckyItem/70/InvenPantsMale41_luck.tga');
    return null;
}

async function loadInventoryRenderData(io, type, path) {
    const g = CAT(type);
    if (g < ITEM_HELM || g > ITEM_BOOTS) return io.loadBMD(path);
    const key = `body:${type}:${path}`;
    if (_inventoryRenderDataCache.has(key)) return _inventoryRenderDataCache.get(key);
    const job = (async()=>{
        const [player, raw] = await Promise.all([io.loadBMD('Player/Player.bmd'), io.fetchBinary(path)]);
        if (!player?.bones?.length || !raw) throw new Error(`body-part owner incompleto: ${path}`);
        const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
        const part = parseBMD(u8);
        const tag = ['helm','armor','pants','gloves','boots'][g - ITEM_HELM];
        const meshes = extractPartMeshes(part, `inventory_${tag}`, player.bones.length, player.bones);
        if (!meshes.length) throw new Error(`body-part sem meshes: ${path}`);
        const h = pcInventoryBodyHeight(type);
        const bones = player.bones.map((b, i)=>{
            if (i !== 0 || !(Array.isArray(b.bindPosition) || ArrayBuffer.isView(b.bindPosition))) return b;
            const bp = Array.from(b.bindPosition); bp[2] = (bp[2] || 0) + h;
            return {...b, bindPosition:bp};
        });
        const textures=meshes.map(m=>({FileName:m.texFileName,Dir:'Player'}));
        // RenderPartObject receives HideSkin=true from RenderObjectScreen.
        // Several body families replace mesh0 with dedicated inventory textures;
        // using the raw Player skin is source-wrong and produced white/mismatched
        // set pieces in the physical FIX8 capture.
        const skinOverride=pcInventoryHideSkinTextureOverride(type);
        if (skinOverride && textures.length) textures[0]={...skinOverride};
        return {
            ...player,
            source:`inventory:Player.bmd+${path}`,
            meshes, bones, textures,
        };
    })();
    _inventoryRenderDataCache.set(key, job);
    try {
        const data = await job; _inventoryRenderDataCache.set(key, data); return data;
    } catch (e) { _inventoryRenderDataCache.delete(key); throw e; }
}

function cloneIconCanvas(source) {
    if (!source) return null;
    const cv = document.createElement('canvas');
    cv.width = source.width;
    cv.height = source.height;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(source, 0, 0);
    return cv;
}
// R46: ONE shared offscreen WebGL context for every item icon. R45.2 created
// a new THREE.WebGLRenderer per inventory slot and physical Chrome reported
// "Too many active WebGL contexts" followed by loss/restoration of the MAIN
// world context. That destroyed frame pacing and could blank the world.
let _sharedIconGL = null;
let _sharedIconContextLost = false;
function sharedIconRenderer(width, height = width) {
    if (!_sharedIconGL || _sharedIconContextLost) {
        try { _sharedIconGL?.dispose?.(); } catch {}
        _sharedIconContextLost = false;
        _sharedIconGL = new THREE.WebGLRenderer({
            antialias: false, alpha: true, preserveDrawingBuffer: true,
            powerPreference: 'high-performance',
        });
        _sharedIconGL.setPixelRatio(1);
        _sharedIconGL.domElement.addEventListener('webglcontextlost', (ev) => {
            ev.preventDefault(); _sharedIconContextLost = true;
            console.warn('[ItemIcon] shared offscreen WebGL context lost; será recriado no próximo ícone.');
        });
    }
    _sharedIconGL.setSize(width, height, false);
    _sharedIconGL.setViewport(0, 0, width, height);
    _sharedIconGL.setScissorTest(false);
    _sharedIconGL.setClearColor(0x000000, 0);
    _sharedIconGL.clear(true, true, true);
    return _sharedIconGL;
}

export async function renderIcon3D(io, type, level = 0, size = 40, presentation = {}) {
    const iconW = Math.max(8, Math.round(typeof size === 'object' ? Number(size?.w || size?.width || 40) : Number(size || 40)));
    const iconH = Math.max(8, Math.round(typeof size === 'object' ? Number(size?.h || size?.height || iconW) : Number(size || 40)));
    const option1 = Number(presentation?.option1) || 0;
    const extOption = Number(presentation?.extOption) || 0;
    if (typeof io?.fetchBinary === 'function') await loadCustomItemPresentation(io.fetchBinary.bind(io));
    const authoredPosition = customPositionAppliesToInventoryModel(type, level) ? customItemPosition(type) : null;
    const authoredSize = customSizeAppliesToInventoryModel(type, level) ? customItemSize(type) : null;
    let twoHand = presentation?.twoHand === true ? true : (presentation?.twoHand === false ? false : null);
    if (twoHand === null && typeof io?.fetchBinary === 'function') {
        const attr = await itemAttributeFor(io.fetchBinary.bind(io), type);
        if (attr) twoHand = attr.twoHand === true;
    }
    const custom = customItemModelForType(type);
    const customColor = Array.isArray(presentation?.customColor)
        ? presentation.customColor
        : (Array.isArray(custom?.color) ? custom.color : null);
    const effectType = Number.isFinite(Number(presentation?.effectType)) && Number(presentation?.effectType) !== 0
        ? Number(presentation.effectType)
        : Number(custom?.effectType || 0);
    const colorKey = customColor ? customColor.slice(0, 3).map((v) => Number(v) || 0).join(',') : '';
    const cacheKey = `${type}:${level}:${iconW}x${iconH}:${option1}:${extOption}:${effectType}:${colorKey}:th=${twoHand===null?'?':twoHand?1:0}:cp=${authoredPosition?`${authoredPosition.posX},${authoredPosition.posY},${authoredPosition.angleX},${authoredPosition.angleY},${authoredPosition.angleZ}`:''}:cs=${authoredSize??''}`;
    if (_iconCache.has(cacheKey)) return cloneIconCanvas(_iconCache.get(cacheKey));
    if (_iconInflight.has(cacheKey)) {
        const cached=await _iconInflight.get(cacheKey);
        return cloneIconCanvas(cached);
    }

    const path = itemModelPath(type, level);
    if (!path) {
        if (!_warned.has(`t:${type}`)) {
            _warned.add(`t:${type}`);
            console.warn(`[ItemIcon] sem registro PC p/ Type=${type} — slot vazio (fail-closed)`);
        }
        return null;
    }

    const job=scheduleColdIcon(async()=>{
        try {
            const { MUModelRenderer } = await import('../assets/MUModelRenderer.js');
            // loadBMD devolve renderData pronto (meshes/textures/bones); o
            // contrato real do renderer é initFromBMD(renderData) (o load(path)
            // é atalho p/ MUAssets.loadBMD + initFromBMD — MUModelRenderer:393).
            const bmd = await loadInventoryRenderData(io, type, path);
            if (!bmd || !Array.isArray(bmd.meshes) || !bmd.meshes.length) throw new Error('BMD sem meshes');

            // Cena offscreen mínima (1 luz + fundo transparente), como o
            // RenderObjectScreen do PC (janela ortho da célula do slot).
            const scene = new THREE.Scene();
            const renderer = new MUModelRenderer();
            await renderer.initFromBMD(bmd);
            const hideSkinSet = pcInventoryHideSkinMeshSet(type);
            const inventoryMeshFilter = hideSkinSet
                ? (mesh) => hideSkinSet.has(Number(mesh?.userData?.muMeshIndex))
                : null;
            if (inventoryMeshFilter) for (const mesh of renderer.meshes || []) {
                if (!inventoryMeshFilter(mesh)) mesh.visible = false;
            }

            // Inventory must use the same stock Main 5.2 item-material owner as the
            // in-world item/equipment path. Static mode freezes the authored tint/
            // overlay for the thumbnail and does not add a per-frame UI animation loop.
            const { applyPcStockItemPresentation } = await import('../graphics/ItemMaterialPresentation.js');
            await applyPcStockItemPresentation(renderer, {
                type, rawLevel: level, option1, extOption, customColor, effectType, dynamic: false,
                meshFilter: inventoryMeshFilter,
            });
            // ZzzInventory::RenderObjectScreen creates OBJECT Armor and sets
            // o->LightEnable=false immediately before RenderPartObject. Keeping
            // the generic world-light law here multiplies many bright textures
            // up to 1.6x and is the source-backed cause of the white inventory
            // previews seen in the R81 physical screenshots.
            renderer.setLightEnabled?.(false);

            const group = renderer.group;

            // RenderObjectScreen applies an authored per-item angle BEFORE fitting
            // the model into the slot. Without it axes/swords/wings were often
            // edge-on or looked like a wrong texture/model even with a valid BMD.
            group.applyMatrix4(muAngleMatrix4(inventoryItemAngles(type, level, twoHand, authoredPosition)));
            group.updateMatrixWorld(true);

            // R67: port literal do pipeline PC. Não há mais bbox-fit/OrthographicCamera.
            // RenderItem3D escolhe sx/sy, CreateScreenVector projeta esse pixel sob
            // FOV=1°, RenderObjectScreen avança 15% no raio e então soma PosX/Y.
            const [fx, fy] = renderItem3dOffset(type, level);
            const [px, py, pz] = pcItemProjectionPosition(iconW, iconH, fx, fy, authoredPosition, false);
            const [ox, oy, oz] = inventoryItemPositionOffset(type, level, authoredPosition);
            group.position.set(px + ox, py + oy, pz + oz);
            const pcScale = pcInventoryModelScale(type, level, authoredSize);
            group.scale.setScalar(pcScale);
            group.updateMatrixWorld(true);
            scene.add(group);

            const light = new THREE.DirectionalLight(0xffffff, 1.6);
            light.position.set(300, 800, 500);
            scene.add(light);
            scene.add(new THREE.AmbientLight(0xffffff, 0.9));

            // PC item view keeps the full game projection and clips to the item
            // rectangle. Rendering the whole 1-degree frustum directly into a
            // 20x20/46x66 canvas was the R77 root cause of nearly invisible items.
            const view = pcItemViewRect(iconW, iconH);
            const cam = new THREE.PerspectiveCamera(
                PC_ITEM_VIEW_FOV,
                PC_ITEM_VIEW_LOGICAL_WIDTH / PC_ITEM_VIEW_LOGICAL_HEIGHT,
                PC_ITEM_VIEW_NEAR,
                PC_ITEM_VIEW_FAR,
            );
            cam.position.set(0, 0, 0);
            cam.up.set(0, 1, 0);
            cam.lookAt(0, 0, -1);
            cam.setViewOffset(
                PC_ITEM_VIEW_LOGICAL_WIDTH, PC_ITEM_VIEW_LOGICAL_HEIGHT,
                view.x, view.y, view.w, view.h,
            );
            cam.updateProjectionMatrix();

            const cv = document.createElement('canvas');
            cv.width = iconW; cv.height = iconH;
            const ctx = cv.getContext('2d');
            // Render em UM contexto offscreen compartilhado → copia 2D. Never
            // create/dispose a WebGL context per slot: Chrome caps active contexts
            // and was evicting the main GameScene renderer during F3:10 inventory.
            const gl = sharedIconRenderer(iconW, iconH);
            gl.render(scene, cam);
            ctx.clearRect(0, 0, iconW, iconH);
            ctx.drawImage(gl.domElement, 0, 0, iconW, iconH);
            renderer.dispose?.();

            cv.dataset.muCustomItemPosition = authoredPosition ? '1' : '0';
            cv.dataset.muCustomItemSize = Number.isFinite(authoredSize) ? String(authoredSize) : '';
            _iconCache.set(cacheKey, cv);
            return cv;
        } catch (e) {
            if (!_warned.has(`e:${path}`)) {
                _warned.add(`e:${path}`);
                console.warn(`[ItemIcon] render falhou p/ ${path} — slot vazio (fail-closed): ${e.message}`);
            }
            return null;
        }
    });
    _iconInflight.set(cacheKey,job);
    try {
        const canonical=await job;
        return cloneIconCanvas(canonical);
    } finally {
        if(_iconInflight.get(cacheKey)===job)_iconInflight.delete(cacheKey);
    }
}
