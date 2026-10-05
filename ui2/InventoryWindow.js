// ui2/InventoryWindow.js — CNewUIMyInventory Web owner
//
// R18 ports the proven Main 5.2 NewUI logical geometry instead of a generic
// browser inventory card. Wire mutation remains server-authoritative through
// ServerInventoryMirror; this class owns only NewUI presentation/interaction.

import { decodePcLuaText } from '../data/PcLuaCrypt.js';
import { parsePcItemAttributes, pcMaxDurability } from '../data/PcItemAttributes.js';
import { loadPcGlobalText } from '../data/PcGlobalText.js';
import { pcItemTooltip, PC_TOOLTIP_CSS_COLOR, PC_TOOLTIP_CSS_BG } from '../data/PcItemInfo.js';
import { loadPcAdvancedItemOwners } from '../data/PcAdvancedItemOwners.js';
import { loadPcItemSetOwners } from '../data/PcItemSetOwners.js';
import { parsePcElementSlotsLua } from '../data/PcElementSlotsLua.js';
import { MUWindow } from './MUWindow.js';
import { Inventory } from '../data/Inventory.js';
import { ITEM_TYPES } from '../data/ItemTypes.js';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { renderIcon3D } from './ItemIconRenderer.js';
import { loadItemUiLuaConfig, itemBorderFor, isJewelStackType } from '../data/ItemUiLuaConfig.js';
import { pcInventoryOverlayMoveAllowed } from '../game/PcInventoryMoveRules.js';

export const PC_INVENTORY_LOGICAL = Object.freeze({
    width: 190,
    height: 429,
    x800: 610,
    y600: 0,
    gridX: 15,
    gridY: 200,
    gridCols: 8,
    gridRows: 8,
    cell: 20,
    cellArt: 21,
});

export const PC_INVENTORY_ASSETS = Object.freeze({
    center: 'Interface/newui_msgbox_back.OZJ',
    top: 'Interface/newui_item_back01.OZT',
    left: 'Interface/newui_item_back02-L.OZT',
    right: 'Interface/newui_item_back02-R.OZT',
    bottom: 'Interface/newui_item_back03.OZT',
    grid: 'Interface/newui_item_box.OZT',
    money: 'Interface/newui_item_money.OZT',
    exit: 'Interface/newui_exit_00.OZT',
    repair: 'Interface/newui_repair_00.OZT',
    openStore: 'Interface/newui_Bt_openshop.OZT',
});

// Current-client NewUICommon remaps the stock CNewUIMyInventory owner to this
// authored v2 skin.  Keep the logical 190x429 PC geometry; only the source art
// changes.  The two background bitmaps MUST be treated as one coherent owner —
// drawing the stock frame under them recreates the doubled/misaligned window
// seen in earlier Web builds.
export const PC_INVENTORY_CUSTOM_ASSETS = Object.freeze({
    top: 'Custom/NewInterface/item_back01_v2.ozj',       // 931300, 420x566 -> logical 190x254
    bottom: 'Custom/NewInterface/item_back02_v2.ozj',    // 931301, 420x391 -> logical 190x175.5
    grid: 'Custom/NewInterface/item_box_v2.ozj',          // 931315
    money: 'Custom/NewInterface/item_money_v2.ozt',       // 931316
    close: 'Custom/NewInterface/btn_close_v2.ozj',        // 931306, 3-state strip
    repair: 'Custom/NewInterface/btn_repair_v2.ozj',      // 931307, 3-state strip
    openStore: 'Custom/NewInterface/btn_openstore_v2.ozj',// 931308, 3-state strip
    slots: Object.freeze({
        weapon1: 'Custom/NewInterface/item_weapon01_v2.ozj',
        weapon2: 'Custom/NewInterface/item_weapon02_v2.ozj',
        helm: 'Custom/NewInterface/item_cap_v2.ozj',
        armor: 'Custom/NewInterface/item_upper_v2.ozj',
        pants: 'Custom/NewInterface/item_lower_v2.ozj',
        gloves: 'Custom/NewInterface/item_gloves_v2.ozj',
        boots: 'Custom/NewInterface/item_boots_v2.ozj',
        wings: 'Custom/NewInterface/item_wing_v2.ozj',
        helper: 'Custom/NewInterface/item_helper_v2.ozj',
        amulet: 'Custom/NewInterface/item_necklace_v2.ozj',
        ring1: 'Custom/NewInterface/item_ring_v2.ozj',
        ring2: 'Custom/NewInterface/item_ring_v2.ozj',
    }),
});

// Protocol/PC order from CNewUIMyInventory::SetEquipmentSlotInfo():
// right weapon, left weapon, helm, armor, pants, gloves, boots, wing,
// helper, amulet, right ring, left ring.
export const PC_EQUIPMENT_SLOTS = Object.freeze([
    { key:'weapon1', serverIndex:0,  x:15,  y:87,  w:46, h:66, asset:'Interface/newui_item_weapon(L).OZT', types:[ITEM_TYPES.WEAPON] },
    { key:'weapon2', serverIndex:1,  x:135, y:87,  w:46, h:66, asset:'Interface/newui_item_weapon(R).OZT', types:[ITEM_TYPES.WEAPON, ITEM_TYPES.SHIELD] },
    { key:'helm',    serverIndex:2,  x:75,  y:44,  w:46, h:46, asset:'Interface/newui_item_cap.OZT', types:[ITEM_TYPES.HELM] },
    { key:'armor',   serverIndex:3,  x:75,  y:87,  w:46, h:66, asset:'Interface/newui_item_upper.OZT', types:[ITEM_TYPES.ARMOR] },
    { key:'pants',   serverIndex:4,  x:75,  y:150, w:46, h:46, asset:'Interface/newui_item_lower.OZT', types:[ITEM_TYPES.PANTS] },
    { key:'gloves',  serverIndex:5,  x:15,  y:150, w:46, h:46, asset:'Interface/newui_item_gloves.OZT', types:[ITEM_TYPES.GLOVES] },
    { key:'boots',   serverIndex:6,  x:135, y:150, w:46, h:46, asset:'Interface/newui_item_boots.OZT', types:[ITEM_TYPES.BOOTS] },
    { key:'wings',   serverIndex:7,  x:120, y:44,  w:61, h:46, asset:'Interface/newui_item_wing.OZT', types:[ITEM_TYPES.WINGS] },
    { key:'helper',  serverIndex:8,  x:15,  y:44,  w:46, h:46, asset:'Interface/newui_item_fairy.OZT', types:[] },
    // CNewUIMyInventory::SetEquipmentSlotInfo uses the authored 20x20
    // accessory rectangles.  The former 28x28 values came from the older
    // ZzzInventory layout and made the NewUI previews oversized/offset.
    { key:'amulet',  serverIndex:9,  x:59,  y:88,  w:20, h:20, asset:'Interface/newui_item_necklace.OZT', types:[] },
    { key:'ring1',   serverIndex:10, x:59,  y:151, w:20, h:20, asset:'Interface/newui_item_ring.OZT', types:[ITEM_TYPES.RING] },
    { key:'ring2',   serverIndex:11, x:119, y:151, w:20, h:20, asset:'Interface/newui_item_ring.OZT', types:[ITEM_TYPES.RING] },
]);

// Exact current-client ElementSlots.cpp extension. The Lua owner may activate
// any of these four slots at runtime; defaults are deliberately inactive.
export const PC_ELEMENT_EQUIPMENT_SLOTS = Object.freeze([
    { key:'elementHelperSp', serverIndex:236, x:59,  y:44,  w:20, h:20, active:0, isPet:1, asset:'Custom/NewInterface/item_elementslot2_v2.ozj' },
    { key:'elementHelperSup',serverIndex:237, x:119, y:175, w:20, h:20, active:0, isPet:1, asset:'Custom/NewInterface/item_elementslot3_v2.ozj' },
    { key:'earringLeft',    serverIndex:238, x:59,  y:115, w:20, h:20, active:0, isPet:1, asset:'Custom/NewInterface/item_earring_v2.ozj' },
    { key:'earringRight',   serverIndex:239, x:119, y:115, w:20, h:20, active:0, isPet:1, asset:'Custom/NewInterface/item_earring_v2.ozj' },
]);

export function pcEquipmentIconRect(def) {
    return {
        // The slot host is already created at SetEquipmentSlotInfo.x + 1.
        // Adding another local +1 shifted every rendered item two pixels from
        // the source viewport.  Only armor owns the PC's authored y-10.
        x: 0, y: def.key === 'armor' && !def.extended ? -10 : 0,
        w: Math.max(8, Number(def.w) - 4), h: Math.max(8, Number(def.h) - 4),
    };
}

export function pcEquipmentSlotHostRect(def) {
    return {
        x: Number(def.x) + 1,
        y: Number(def.y),
        w: Math.max(8, Number(def.w) - 4),
        h: Math.max(8, Number(def.h) - 4),
    };
}

const EQUIP_SLOTS = PC_EQUIPMENT_SLOTS;

export class InventoryWindow extends MUWindow {
    /**
     * @param {object} opts
     * @param {Inventory} [opts.inventory] compatibility container; server mirror owns production state
     * @param {HTMLElement} [opts.parent] 800x600 virtual NewUI board
     */
    constructor(opts = {}) {
        super({
            title: 'Inventário',
            width: PC_INVENTORY_LOGICAL.width,
            height: PC_INVENTORY_LOGICAL.height,
            hotkey: opts.hotkey || 'i',
            x: opts.x !== undefined ? opts.x : 610,
            y: opts.y !== undefined ? opts.y : 0,
            parent: opts.parent || document.body,
            onVisibilityChange: opts.onVisibilityChange,
            // CNewUIMyInventory paints its own NewUI frame; the generic MUWindow
            // header/frame would be a second, false owner.
            useRealFrameTexture: false,
            draggable: false,
        });

        this.inventory = opts.inventory || new Inventory();
        this.authoritativeOwner = opts.authoritativeOwner || null;
        this._refreshScheduled = false;
        this._refreshRaf = 0;
        this.getCharacterTooltipState = typeof opts.getCharacterTooltipState === 'function' ? opts.getCharacterTooltipState : (() => null);
        this._globalText = null;
        this._advancedItemOwners = null;
        this._itemSetOwners = null;
        this.onServerMove = typeof opts.onServerMove === 'function' ? opts.onServerMove : null;
        this.onServerDrop = typeof opts.onServerDrop === 'function' ? opts.onServerDrop : null;
        this.isWorldDropTarget = typeof opts.isWorldDropTarget === 'function' ? opts.isWorldDropTarget : () => false;
        this.onWorldDropGesture = typeof opts.onWorldDropGesture === 'function' ? opts.onWorldDropGesture : null;
        this.onRepairToggle = typeof opts.onRepairToggle === 'function' ? opts.onRepairToggle : null;
        this.onMyShopToggle = typeof opts.onMyShopToggle === 'function' ? opts.onMyShopToggle : null;
        this.onExternalDrop = typeof opts.onExternalDrop === 'function' ? opts.onExternalDrop : null;
        this.onServerContextMove = typeof opts.onServerContextMove === 'function' ? opts.onServerContextMove : null;
        this.element.dataset.muPcOwner = 'CNewUIMyInventory';
        this.element.dataset.muLogicalRect = '610,0,190,429';
        this.element.style.cssText += ';background:transparent;border:0;box-shadow:none;border-radius:0;overflow:visible;';
        this.header.style.display = 'none';
        this.body.style.cssText = 'position:absolute;inset:0;padding:0;margin:0;overflow:visible;';

        this._pcArt = document.createElement('div');
        this._pcArt.dataset.muPcOwner = 'CNewUIMyInventory::RenderFrame';
        this._pcArt.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:0;';
        this.body.appendChild(this._pcArt);

        this.gridEl = document.createElement('div');
        this.gridEl.dataset.muPcOwner = 'CNewUIInventoryCtrl';
        this.gridEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3;';
        this.body.appendChild(this.gridEl);

        // Main 5.2 CNewUIInventoryCtrl drag-footprint color owner.
        this.dragFootprint = document.createElement('div');
        this.dragFootprint.dataset.muPcOwner = 'CNewUIInventoryCtrl::RenderPickedFootprint';
        this.dragFootprint.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:8;display:none;';
        this.body.appendChild(this.dragFootprint);

        this.gridSlots = [];
        for (let i = 0; i < 64; i++) {
            const col = i % PC_INVENTORY_LOGICAL.gridCols;
            const row = Math.floor(i / PC_INVENTORY_LOGICAL.gridCols);
            const cell = this._createSlot(
                { kind:'grid', index:i },
                {
                    x: PC_INVENTORY_LOGICAL.gridX + col * PC_INVENTORY_LOGICAL.cell,
                    y: PC_INVENTORY_LOGICAL.gridY + row * PC_INVENTORY_LOGICAL.cell,
                    w: PC_INVENTORY_LOGICAL.cell,
                    h: PC_INVENTORY_LOGICAL.cell,
                    iconSize: PC_INVENTORY_LOGICAL.cell,
                }
            );
            this.gridEl.appendChild(cell);
            this.gridSlots.push(cell);
        }

        this._equipDefs = [...EQUIP_SLOTS, ...PC_ELEMENT_EQUIPMENT_SLOTS.map((d) => ({...d, extended:true}))];
        this.equipSlots = {};
        for (const def of this._equipDefs) {
            // PC mouse hitbox is x+1/y/(w-4)/(h-4); artwork remains the full rect.
            const host = pcEquipmentSlotHostRect(def);
            const cell = this._createSlot(
                { kind:'equip', key:def.key },
                { ...host, iconSize:Math.max(18, Math.min(def.w, def.h)) }
            );
            cell.dataset.pcFullRect = `${def.x},${def.y},${def.w},${def.h}`;
            if (def.extended) {
                cell.dataset.muExtendedEquipment = String(def.serverIndex);
                cell.style.display = def.active ? 'flex' : 'none';
            }
            this.gridEl.appendChild(cell);
            this.equipSlots[def.key] = cell;
        }

        // Money owner is serverInventory.zen. The retained PC-derived chrome
        // positions this row at 34,365 / 130x21; the exact desktop button strip
        // below it remains a documented gate rather than guessed geometry.
        this.zenEl = document.createElement('div');
        this.zenEl.dataset.muPcOwner = 'CNewUIMyInventory::Money';
        this.zenEl.style.cssText = 'position:absolute;left:34px;top:365px;width:130px;height:21px;z-index:4;display:flex;align-items:center;justify-content:center;color:#f6dc7d;font-size:11px;text-shadow:1px 1px #000;pointer-events:none;';
        this.body.appendChild(this.zenEl);

        // Exact Main 5.2 CNewUIMyInventory button/hitbox owner. The top-right
        // 13x12 close area is part of the background; the bottom strip owns
        // Exit/Repair/MyShop at 13/45/77,392 with 36x29 buttons.
        this.topCloseHit = this._makePcButton('inventory-top-close', 169, 7, 13, 12, () => this.hide());
        this.exitButton = this._makePcButton('inventory-exit', 13, 392, 36, 29, () => this.hide());
        this.repairButton = this._makePcButton('inventory-repair', 45, 392, 36, 29, () => {
            if (this.onRepairToggle) this.onRepairToggle();
        });
        this.shopButton = this._makePcButton('inventory-myshop', 77, 392, 36, 29, () => {
            if (this.onMyShopToggle) this.onMyShopToggle();
        });
        this.repairButton.disabled = !this.onRepairToggle;
        this.shopButton.disabled = !this.onMyShopToggle;

        // Main 5.2 does NOT use browser drag-and-drop semantics.  A released
        // left click creates CNewUIPickedItem, that picked item remains attached
        // to the cursor with no mouse button held, and a later released left
        // click chooses the destination.  Keep the historical `dragItem` member
        // name for compatibility with the rest of the Web code, but its lifetime
        // is now the persistent PC picked-item lifetime.
        this.dragItem = null;
        this._dragGeneration = 0;
        this.dragGhost = document.createElement('div');
        this.dragGhost.dataset.muPcOwner = 'CNewUIInventoryCtrl::RenderItem3DDrag';
        this.dragGhost.style.cssText = `
            position: absolute; pointer-events: none; z-index: 9998; display: none;
            width: 20px; height: 20px; transform: translate(-50%,-50%);
        `;
        // Keep the real BMD drag owner in the same logical 800x600 board as the
        // inventory. Physical client coordinates are converted below.
        this.parent.appendChild(this.dragGhost);
        this._mouseMoveHandler = (e) => {
            this._positionDragGhost(e);
            if (this.dragItem) this._updateDragFootprint(e);
        };
        this._pickedClickHandler = (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            if (!this.dragItem) return;
            this._endDrag(e);
        };
        window.addEventListener('mousemove', this._mouseMoveHandler);
        // Destination processing is click/release based, matching
        // CNewUIMyInventory::{Inventory,EquipmentWindow}Process.  `click` fires
        // after the second release and, unlike `mouseup`, cannot terminate the
        // picked item created by the first click.
        window.addEventListener('click', this._pickedClickHandler);
        this._blurHandler = () => this._cancelDrag();
        window.addEventListener('blur', this._blurHandler);

        // R70 — RenderTipTextList owner: stock + exact 380/Harmony/Socket/Period
        // plus CSItemOption ItemSetType/ItemSetOption. No synthetic tooltip path.
        this.tooltip = document.createElement('div');
        this.tooltip.dataset.muPcOwner = 'RenderItemInfo::RenderTipTextList';
        this.tooltip.style.cssText = 'position:absolute;display:none;z-index:9999;pointer-events:none;box-sizing:border-box;background:#000;border:1px solid #000;padding:1px 3px;font:11px Arial,sans-serif;line-height:12px;text-align:center;white-space:nowrap;color:#fff;';
        this.parent.appendChild(this.tooltip);

        this._loadPcOwnerArt();
        this._loadGlobalText(opts.globalTextPath || 'Local/Por/Text_por.bmd');
        this._loadAdvancedItemOwners(opts.advancedItemOwnerPaths || null);
        this._loadItemSetOwners(opts.itemSetOwnerPaths || null);
        this._loadItemUiLuaConfig();
        this._loadElementSlots(opts.elementSlotsPath || 'Configs/lua/Configs/ElementSlots.lua');
        this._loadItemAttributes(opts.itemAttributeLayout || 'main52-byte-skill', opts.itemAttributePath || 'Local/Por/item_por.bmd');
        this.refresh();
    }

    _makePcButton(role, x, y, w, h, action) {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.dataset.muPcButton = role;
        // Current-client buttons are three vertical source states. The previous
        // `background-size:auto h` squeezed the WHOLE 3-state strip into h px,
        // visibly drawing three tiny duplicated icons. Scale the strip to 3*h
        // and select exactly one state, matching GWidescreen::RenderButtons.
        btn.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:6;padding:0;border:0;background-color:transparent;background-repeat:no-repeat;background-position:0 0;background-size:${w}px ${h*3}px;cursor:pointer;`;
        const state = (n) => { btn.style.backgroundPosition = `0 ${-h*n}px`; };
        btn.addEventListener('mouseenter', () => { if (!btn.disabled) state(1); });
        btn.addEventListener('mouseleave', () => state(0));
        btn.addEventListener('mousedown', (e) => { if (e.button === 0 && !btn.disabled) state(2); });
        btn.addEventListener('mouseup', () => { if (!btn.disabled) state(1); });
        btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); action?.(); });
        this.body.appendChild(btn);
        return btn;
    }

    _createSlot(ref, rect) {
        const cell = document.createElement('div');
        cell.style.cssText = `position:absolute;left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;box-sizing:border-box;background:transparent;border:0;display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:visible;pointer-events:auto;`;
        cell.dataset.pcRect = `${rect.x},${rect.y},${rect.w},${rect.h}`;
        cell._iconRenderSize = rect.iconSize || Math.min(rect.w, rect.h);
        cell.addEventListener('click', (e) => {
            if (e.button !== 0) return;
            // When CNewUIPickedItem already exists this click is the destination
            // release.  Let it bubble to the global PC picked-item processor.
            if (this.dragItem) return;
            const item = this._itemAt(ref);
            if (!item) return;
            const sourceDef = ref.kind === 'equip' ? this._equipDefs?.find((d) => d.key === ref.key) : null;
            if (sourceDef?.extended) return; // visual/server-owned until extended move wire owner is ported
            e.preventDefault();
            e.stopPropagation();
            const from = ref.kind === 'grid' && this.authoritativeOwner?.itemAttributes
                ? {kind:'grid',index:this.authoritativeOwner.resolveGridAnchor(12+ref.index)-12} : ref;
            const dim = this._itemDimensions(item);
            // Duplicate/capture the ITEM exactly at pickup time.  The production
            // mirror remains server authoritative; only presentation is removed
            // locally until the second click, same contract as DuplicateItem +
            // RemoveItem in CNewUIInventoryCtrl::UpdateMouseEvent().
            this.dragItem = { item, from, width:dim.width, height:dim.height };
            const dragGeneration = ++this._dragGeneration;
            this._beginPickedVisual(from, cell);
            const ghostW = dim.width * PC_INVENTORY_LOGICAL.cell;
            const ghostH = dim.height * PC_INVENTORY_LOGICAL.cell;
            this.dragGhost.style.width = `${ghostW}px`;
            this.dragGhost.style.height = `${ghostH}px`;
            this.dragGhost.textContent = '';
            this._itemIO()
                .then((io) => io && renderIcon3D(io, Number(item.itemType ?? item.type), Number.isInteger(item.rawLevel) ? item.rawLevel : ((item.level || 0) << 3), {w:ghostW,h:ghostH}, item))
                .then((cv) => {
                    if (cv && !this._destroyed && dragGeneration === this._dragGeneration && this.dragItem?.item === item) {
                        cv.style.width = `${ghostW}px`; cv.style.height = `${ghostH}px`;
                        this.dragGhost.textContent = ''; this.dragGhost.appendChild(cv);
                    }
                });
            this._positionDragGhost(e);
            this._updateDragFootprint(e);
            this.dragGhost.style.display = 'block';
        });
        cell.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const currentItem = this._itemAt(ref);
            if (currentItem && this.authoritativeOwner && this.onServerContextMove) {
                const src = this._wireIndex(ref.kind === 'grid'
                    ? {kind:'grid', index:(this.authoritativeOwner.resolveGridAnchor?.(12+ref.index) ?? (12+ref.index))-12}
                    : ref);
                if (src >= 0 && this.onServerContextMove({ srcType:0, srcIndex:src, item:currentItem, ref, event:e }) === true) return;
            }
            if (ref.kind !== 'equip') return;
            const sourceDef = this._equipDefs?.find((d) => d.key === ref.key);
            if (sourceDef?.extended) return;
            if (this.authoritativeOwner && this.onServerMove) {
                const src = this._wireIndex(ref);
                const dst = this.authoritativeOwner.findFreeGridSlot?.(this._itemAt(ref)?.itemType) ?? -1;
                if (src >= 0 && dst >= 0 && this._itemAt(ref)) void this.onServerMove(src, dst);
                return;
            }
            const item = this.inventory.unequip(ref.key);
            if (item) this.refresh();
        });
        const showTip = () => {
            const item = this._itemAt(ref);
            if (!item || !this.tooltip) { this._hideItemTooltip(); return; }
            this._showItemTooltip(item, ref, cell);
        };
        cell.addEventListener('mouseenter', showTip);
        cell.addEventListener('mousemove', showTip);
        cell.addEventListener('mouseleave', () => this._hideItemTooltip());
        cell.dataset.ref = ref.kind === 'grid' ? `g${ref.index}` : `e${ref.key}`;
        return cell;
    }

    _hideItemTooltip() {
        if (this.tooltip?.style) this.tooltip.style.display = 'none';
    }

    async _loadGlobalText(path) {
        try {
            const table = await loadPcGlobalText(RemoteAssets.fetchBinary.bind(RemoteAssets), path);
            if (this._destroyed) return false;
            this._globalText = table;
            this.element.dataset.muGlobalText = `owner:${table.size}`;
            return true;
        } catch (error) {
            this._globalText = null;
            this.element.dataset.muGlobalText = 'unavailable';
            console.warn('[Inventory] Text_por.bmd indisponível/inválido; RenderItemInfo fica fail-closed:', error.message);
            return false;
        }
    }

    async _loadAdvancedItemOwners(paths=null) {
        try {
            const owners = await loadPcAdvancedItemOwners(RemoteAssets.fetchBinary.bind(RemoteAssets), paths || {});
            if (this._destroyed) return false;
            this._advancedItemOwners = owners;
            const ok=['itemAdd','harmony','socket'].filter((k)=>owners[k]);
            this.element.dataset.muAdvancedItemOwners = ok.length ? ok.join(',') : 'unavailable';
            if (Object.keys(owners.errors||{}).length) console.warn('[Inventory] owners avançados parciais:', owners.errors);
            return ok.length > 0;
        } catch (error) {
            this._advancedItemOwners = null;
            this.element.dataset.muAdvancedItemOwners = 'unavailable';
            console.warn('[Inventory] owners avançados indisponíveis; branches ficam fail-closed:', error.message);
            return false;
        }
    }

    async _loadItemSetOwners(paths=null) {
        try {
            const owners=await loadPcItemSetOwners(RemoteAssets.fetchBinary.bind(RemoteAssets),paths||{});
            if(this._destroyed)return false;
            this._itemSetOwners=owners;
            const ok=!!(owners.type&&owners.option);
            this.element.dataset.muItemSetOwners=ok?`owner:${owners.maxClass}class`:'unavailable';
            if(Object.keys(owners.errors||{}).length)console.warn('[Inventory] CSItemOption owners parciais:',owners.errors);
            return ok;
        }catch(error){
            this._itemSetOwners=null;
            this.element.dataset.muItemSetOwners='unavailable';
            console.warn('[Inventory] CSItemOption indisponível; Ancient/Set fica fail-closed:',error.message);
            return false;
        }
    }

    _showItemTooltip(item, ref, cell) {
        if (!this._globalText || !this.authoritativeOwner?.itemAttributes) { this._hideItemTooltip(); return; }
        const attr = this.authoritativeOwner.itemAttributes.get(item.itemType ?? item.type);
        const character = this.getCharacterTooltipState?.() || null;
        const equipment = this.authoritativeOwner
            ? Array.from({length:12},(_,i)=>this.authoritativeOwner.getDisplayItem?.(i)||null)
            : null;
        const setRuntime = {owners:this._itemSetOwners,equipment,itemAttributes:this.authoritativeOwner?.itemAttributes||null,selectedSlotIndex:ref?.kind==='equip'?this._wireIndex(ref):0};
        const lines = pcItemTooltip(item, attr, this._globalText, character, this._advancedItemOwners, setRuntime);
        if (!lines?.length) { this._hideItemTooltip(); return; }
        const tip=this.tooltip;
        tip.textContent='';
        for (const line of lines) {
            if (line.empty) {
                const gap=document.createElement('div'); gap.style.height='6px'; tip.appendChild(gap); continue;
            }
            const row=document.createElement('div');
            row.textContent=line.text;
            row.style.color=PC_TOOLTIP_CSS_COLOR[line.color] || '#fff';
            row.style.fontWeight=line.bold?'700':'400';
            const bg=PC_TOOLTIP_CSS_BG[line.color]; if(bg) row.style.background=bg;
            row.style.minHeight='12px'; row.style.lineHeight='12px';
            tip.appendChild(row);
        }
        // NewUIInventoryCtrl::RenderItemToolTip / CNewUIMyInventory::RenderItemToolTip:
        // anchor = slot center X, grid-top Y (+10 for 1-row item), then
        // RenderItemInfo advances sy by INVENTORY_SCALE (20) and clamps to 420.
        const rectText=cell?.dataset?.pcRect || cell?.dataset?.pcFullRect || '';
        const n=rectText.split(',').map(Number);
        let x=Number.isFinite(n[0])?n[0]+(n[2]||20)/2:95;
        let y=Number.isFinite(n[1])?n[1]+(n[3]||20)/2:214;
        if (ref?.kind==='grid') {
            const wire=this._wireIndex(ref);
            const anchor=this.authoritativeOwner.resolveGridAnchor?.(wire) ?? wire;
            const g=Math.max(0,anchor-12), col=g%8,row=Math.floor(g/8);
            const w=Math.max(1,Number(attr?.width)||1), h=Math.max(1,Number(attr?.height)||1);
            x=PC_INVENTORY_LOGICAL.gridX+col*20+w*10;
            y=PC_INVENTORY_LOGICAL.gridY+row*20+(h===1?10:0);
        }
        y+=20;
        // `tooltip` is mounted on the shared NewUI board, while x/y above are
        // local to CNewUIMyInventory.  Add the window origin exactly once.  The
        // previous code omitted it, so a right-edge inventory produced a tooltip
        // around x~95 on the far left of the screen.
        x += Number(this.x) || 0;
        y += Number(this.y) || 0;
        tip.style.display='block'; tip.style.left='0px'; tip.style.top='0px';
        const w=tip.offsetWidth||100,h=tip.offsetHeight||20;
        const bounds=this._logicalParentSize?.() || {width:this.parent?.clientWidth||800,height:this.parent?.clientHeight||600};
        const boardW=Math.max(1,Number(bounds.width)||800);
        let left=x-w/2; if(left<0)left=0; if(left+w>boardW)left=Math.max(0,boardW-w-1);
        // Main 5.2 clamps RenderItemInfo to y=420 in its owner space.  Keep the
        // same owner clamp, translated by this window's logical Y.
        let top=y; const screenH=(Number(this.y)||0)+420; if(top+h>screenH) top+=screenH-(top+h);
        tip.style.left=`${Math.round(left)}px`; tip.style.top=`${Math.round(top)}px`;
        tip.dataset.muTooltipCoverage='pc-stock-groups-0-12-wings-plus-custom-wings-excellent-ancient-set-380-harmony-socket-period';
    }

    wireTargetAtClientPoint(clientX, clientY) {
        if (!this.visible || this._destroyed) return null;
        const node = document.elementFromPoint(clientX, clientY)?.closest?.('[data-ref]');
        if (!node || (!this.gridSlots.includes(node) && !Object.values(this.equipSlots).includes(node))) return null;
        const a=node.dataset.ref || '';
        const ref=a[0]==='g' ? {kind:'grid',index:Number.parseInt(a.slice(1),10)} : (a[0]==='e' ? {kind:'equip',key:a.slice(1)} : null);
        if (!ref) return null;
        if (ref.kind === 'equip' && this._equipDefs?.find((d)=>d.key===ref.key)?.extended) return null;
        const index=this._wireIndex(ref);
        return index >= 0 ? { type:0, index, ref } : null;
    }

    _appendPcImage(url, rect, tag) {
        if (!url || !this._pcArt?.isConnected) return null;
        const img = document.createElement('img');
        img.alt = '';
        img.draggable = false;
        img.dataset.pcArt = tag || '';
        img.src = url;
        img.style.cssText = `position:absolute;left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;pointer-events:none;z-index:${rect.z ?? 1};`;
        this._pcArt.appendChild(img);
        return img;
    }

    async _loadPcOwnerArt() {
        const generation = (this._artGeneration = (this._artGeneration || 0) + 1);
        const get = async (p) => {
            try { return await RemoteAssets.fetchImageURL(p); } catch (_) { return null; }
        };

        // NewUICommon in this exact client replaces the stock frame with the
        // 931300/931301 v2 pair. Probe that pair first. It is atomic: if either
        // half is missing we fall back to the complete stock CNewUIMyInventory
        // frame instead of mixing two incompatible skins.
        const [customTop, customBottom, customGrid, customMoney, customClose, customRepair, customStore] = await Promise.all([
            get(PC_INVENTORY_CUSTOM_ASSETS.top),
            get(PC_INVENTORY_CUSTOM_ASSETS.bottom),
            get(PC_INVENTORY_CUSTOM_ASSETS.grid),
            get(PC_INVENTORY_CUSTOM_ASSETS.money),
            get(PC_INVENTORY_CUSTOM_ASSETS.close),
            get(PC_INVENTORY_CUSTOM_ASSETS.repair),
            get(PC_INVENTORY_CUSTOM_ASSETS.openStore),
        ]);
        if (generation !== this._artGeneration || !this._pcArt?.isConnected) return false;

        const customFrame = !!(customTop && customBottom);
        this.element.dataset.muInventorySkin = customFrame ? 'current-client-v2-931300-931301' : 'stock-newui';
        this._pcArt.textContent = '';

        if (customFrame) {
            // PC source: RenderImages(931300, x,y,width,254,...420,566) and
            // RenderImages(931301, x,y+253.5,width,height-254,...420,vh).
            // The 0.5 logical overlap closes the seam without inventing a third
            // browser panel layer.
            this._appendPcImage(customTop, {x:0,y:0,w:190,h:254,z:1}, PC_INVENTORY_CUSTOM_ASSETS.top);
            this._appendPcImage(customBottom, {x:0,y:253.5,w:190,h:175.5,z:1}, PC_INVENTORY_CUSTOM_ASSETS.bottom);
        } else {
            const [center, top, left, right, bottom] = await Promise.all([
                get(PC_INVENTORY_ASSETS.center), get(PC_INVENTORY_ASSETS.top),
                get(PC_INVENTORY_ASSETS.left), get(PC_INVENTORY_ASSETS.right),
                get(PC_INVENTORY_ASSETS.bottom),
            ]);
            if (generation !== this._artGeneration || !this._pcArt?.isConnected) return false;
            if (center) {
                const host = document.createElement('div');
                host.dataset.pcArt = PC_INVENTORY_ASSETS.center;
                host.style.cssText = `position:absolute;left:21px;top:64px;width:148px;height:320px;background-image:url("${center}");background-repeat:repeat;pointer-events:none;z-index:0;`;
                this._pcArt.appendChild(host);
            }
            this._appendPcImage(top,    {x:0,y:0,w:190,h:64,z:1}, PC_INVENTORY_ASSETS.top);
            this._appendPcImage(left,   {x:0,y:64,w:21,h:320,z:1}, PC_INVENTORY_ASSETS.left);
            this._appendPcImage(right,  {x:169,y:64,w:21,h:320,z:1}, PC_INVENTORY_ASSETS.right);
            this._appendPcImage(bottom, {x:0,y:384,w:190,h:45,z:1}, PC_INVENTORY_ASSETS.bottom);
        }

        const gridPath = customFrame ? PC_INVENTORY_CUSTOM_ASSETS.grid : PC_INVENTORY_ASSETS.grid;
        const moneyPath = customFrame ? PC_INVENTORY_CUSTOM_ASSETS.money : PC_INVENTORY_ASSETS.money;
        const grid = customFrame ? customGrid : await get(PC_INVENTORY_ASSETS.grid);
        const money = customFrame ? customMoney : await get(PC_INVENTORY_ASSETS.money);
        if (generation !== this._artGeneration || !this._pcArt?.isConnected) return false;
        if (grid) {
            for (let i=0; i<64; i++) {
                const col=i%8, row=Math.floor(i/8);
                this._appendPcImage(grid, {
                    x:PC_INVENTORY_LOGICAL.gridX + col*20,
                    y:PC_INVENTORY_LOGICAL.gridY + row*20,
                    w:PC_INVENTORY_LOGICAL.cellArt,
                    h:PC_INVENTORY_LOGICAL.cellArt,
                    z:2,
                }, gridPath);
            }
        }
        if (money) this._appendPcImage(money, {x:34,y:365,w:130,h:21,z:2}, moneyPath);

        // Button art is clipped to the 36x29 CNewUIButton viewport. Prefer the
        // retained current-client v2 sprites when that skin owns the frame;
        // otherwise use the stock NewUI images loaded by NewUIMyInventory.cpp.
        const [stockExit, stockRepair, stockStore] = customFrame ? [null, null, null] : await Promise.all([
            get(PC_INVENTORY_ASSETS.exit), get(PC_INVENTORY_ASSETS.repair), get(PC_INVENTORY_ASSETS.openStore),
        ]);
        if (generation !== this._artGeneration || !this._pcArt?.isConnected) return false;
        const buttonArts = [
            [this.exitButton, customFrame ? customClose : stockExit],
            [this.repairButton, customFrame ? customRepair : stockRepair],
            [this.shopButton, customFrame ? customStore : stockStore],
        ];
        for (const [btn, url] of buttonArts) if (btn && url) btn.style.backgroundImage = `url("${url}")`;

        await Promise.all(this._equipDefs.map(async (def) => {
            const path = def.extended ? def.asset : (customFrame ? PC_INVENTORY_CUSTOM_ASSETS.slots[def.key] : def.asset);
            const url = await get(path);
            if (generation !== this._artGeneration || !url || (def.extended && !def.active)) return;
            this._appendPcImage(url, {x:def.x,y:def.y,w:def.w,h:def.h,z:2}, path);
        }));
        return true;
    }

    async _loadItemUiLuaConfig() {
        try {
            const status = await loadItemUiLuaConfig((p) => RemoteAssets.fetchBinary(p));
            if (this._destroyed) return false;
            this.element.dataset.muItemBorders = String(status?.borders || 0);
            this.element.dataset.muJewelStacks = String(status?.stacks || 0);
            this.refresh();
            return true;
        } catch (error) {
            console.warn('[Inventory] current-client item UI Lua unavailable:', error.message);
            return false;
        }
    }

    async _loadElementSlots(path) {
        try {
            const candidates=[...new Set([
                path,
                'Configs/lua/Configs/ElementSlots.lua',
                'Configs/Lua/Configs/ElementSlots.lua',
                'Configs/crypt/Configs/ElementSlots.lua',
            ].filter(Boolean))];
            let slots=null, ownerPath=null, lastError=null;
            for(const candidate of candidates){
                try{
                    const bytes=await RemoteAssets.fetchBinary(candidate);
                    if(!bytes)continue;
                    const text=decodePcLuaText(bytes);
                    // ElementSlots.cpp owner: register SetElementSlot(), execute Lua,
                    // then StartLoadElementSlots().  A lane that exists but is only a
                    // wrapper/encrypted variant is not authoritative until it parses.
                    const parsed=parsePcElementSlotsLua(text);
                    if(parsed?.size){slots=parsed;ownerPath=candidate;break;}
                }catch(e){lastError=e;}
            }
            if(!slots?.size) throw lastError || new Error('nenhuma lane ElementSlots reconhecida');
            const ext = this._equipDefs.filter((d) => d.extended);
            ext.forEach((def, stack) => {
                const v=slots.get(stack); if (!v) return;
                def.x=v.x; def.y=v.y; def.w=v.width; def.h=v.height; def.active=v.active; def.isPet=v.pet;
                const cell=this.equipSlots[def.key];
                if (cell) {
                    cell.style.left=`${def.x+1}px`; cell.style.top=`${def.y}px`;
                    cell.style.width=`${Math.max(1,def.w-4)}px`; cell.style.height=`${Math.max(1,def.h-4)}px`;
                    cell.style.display=def.active ? 'flex' : 'none';
                    cell.dataset.pcFullRect=`${def.x},${def.y},${def.w},${def.h}`;
                }
            });
            // Re-render art atomically so only Lua-active extended backgrounds appear.
            await this._loadPcOwnerArt();
            this.refresh();
            this.element.dataset.muElementSlots=`lua-owner:${slots.size}:${ownerPath}`;
            console.info(`[Inventory] ElementSlots owner=${ownerPath} slots=${slots.size}`);
            return true;
        } catch (error) {
            this.element.dataset.muElementSlots='inactive-default';
            console.info('[Inventory] ElementSlots.lua indisponível/inativo:', error.message);
            return false;
        }
    }

    async _loadItemAttributes(layout, path) {
        try {
            const bytes=await RemoteAssets.fetchBinary(path);
            const attributes=parsePcItemAttributes(bytes,{layout});
            if(this._destroyed) return false;
            this.authoritativeOwner?.setItemAttributes?.(attributes);
            this.refresh();
            return true;
        } catch(error) {
            console.warn('[Inventory] ItemAttribute indisponível; geometria multicélula não validada:',error.message);
            return false;
        }
    }

    _wireIndex(ref) {
        if (ref?.kind === 'grid') return Number.isInteger(ref.index) && ref.index >= 0 && ref.index < 64
            ? 12 + ref.index : -1; // MAX_EQUIPMENT_INDEX + grid
        if (ref?.kind === 'equip') return (this._equipDefs || EQUIP_SLOTS).find(s => s.key === ref.key)?.serverIndex ?? -1;
        return -1;
    }

    _itemAt(ref) {
        if (this.authoritativeOwner) {
            let wire = this._wireIndex(ref);
            if (ref.kind === 'grid' && wire >= 0) wire = this.authoritativeOwner.resolveGridAnchor?.(wire) ?? wire;
            return wire >= 0 ? this.authoritativeOwner.getDisplayItem?.(wire) || null : null;
        }
        if (ref.kind === 'grid') return this.inventory.grid[ref.index] || null;
        return this.inventory.equipment[ref.key] || null;
    }

    _pointerInBoard(e) {
        const rect = this.parent?.getBoundingClientRect?.();
        if (!rect || !(rect.width > 0) || !(rect.height > 0)) return { x: e.clientX, y: e.clientY };
        const logicalW = this.parent.clientWidth || parseFloat(this.parent.style.width) || 800;
        const logicalH = this.parent.clientHeight || parseFloat(this.parent.style.height) || 600;
        return {
            x: (e.clientX - rect.left) * logicalW / rect.width,
            y: (e.clientY - rect.top) * logicalH / rect.height,
        };
    }

    _itemDimensions(item) {
        const type = Number(item?.itemType ?? item?.type);
        const dim = this.authoritativeOwner?.getItemDimensions?.(type);
        if (dim) return dim;
        const attr = this.authoritativeOwner?.itemAttributes?.get?.(type);
        const width = Number.isInteger(attr?.width) && attr.width > 0 ? attr.width : 1;
        const height = Number.isInteger(attr?.height) && attr.height > 0 ? attr.height : 1;
        return { width:Math.min(8,width), height:Math.min(8,height) };
    }

    _pcGridTargetFromPointer(e, drag = this.dragItem) {
        if (!drag) return null;
        const pt = this._pointerInBoard(e);
        const w = Number(drag.width) || 1, h = Number(drag.height) || 1;
        const pickedX = pt.x - ((w - 1) * PC_INVENTORY_LOGICAL.cell / 2);
        const pickedY = pt.y - ((h - 1) * PC_INVENTORY_LOGICAL.cell / 2);
        const dx = pickedX - (this.x + PC_INVENTORY_LOGICAL.gridX);
        const dy = pickedY - (this.y + PC_INVENTORY_LOGICAL.gridY);
        // C++ integer division truncates toward zero, then the PC subtracts 1
        // for negative coordinates when GetSquarePosAtPt failed.
        const gridCoord = (d) => {
            let q = Math.trunc(d / PC_INVENTORY_LOGICAL.cell);
            if (d < 0) q -= 1;
            return q;
        };
        return { col:gridCoord(dx), row:gridCoord(dy), point:pt };
    }

    _pcGridDropDecision(e, drag = this.dragItem) {
        if (!drag || !this.authoritativeOwner) return { valid:false, reason:'no-owner' };
        const pos = this._pcGridTargetFromPointer(e, drag);
        if (!pos) return { valid:false, reason:'no-target' };
        const w=drag.width||1, h=drag.height||1;
        if (pos.col < 0 || pos.row < 0 || pos.col + w > 8 || pos.row + h > 8)
            return { valid:false, reason:'clipped', pos };
        const projection=this.authoritativeOwner.getGridProjection?.();
        if (!projection?.valid) return { valid:false, reason:'projection', pos, projection };
        const src=this._wireIndex(drag.from);
        const occupied=new Set();
        for(let dy=0;dy<h;dy++) for(let dx=0;dx<w;dx++) {
            const owner=projection.cells[(pos.row+dy)*8+(pos.col+dx)];
            if(owner!==-1 && owner!==src) occupied.add(owner);
        }
        const freeDst=12+pos.row*8+pos.col;
        if (!occupied.size) return { valid:true, kind:'free', dst:freeDst, pos, projection };

        // Exact CNewUIMyInventory::InventoryProcess owner: GetTargetLinealPos()
        // is the picked-item TOP-LEFT cell. FindItem(iTargetIndex) resolves that
        // cell to an ITEM for IsOverlayItem, but SendRequestEquipmentItem keeps
        // iTargetIndex itself as the wire destination. Do not rewrite it to the
        // target item's base anchor.
        const topLeftOwner=projection.cells[pos.row*8+pos.col];
        if (topLeftOwner !== -1 && topLeftOwner !== src) {
            const targetItem=this.authoritativeOwner.getDisplayItem?.(topLeftOwner) || null;
            if (pcInventoryOverlayMoveAllowed(drag.item, targetItem))
                return { valid:true, kind:'overlay', dst:freeDst, targetAnchor:topLeftOwner, targetItem, pos, projection };
        }
        return { valid:false, reason:'occupied', occupied:[...occupied], pos, projection };
    }

    _clearDragFootprint() {
        if (!this.dragFootprint) return;
        this.dragFootprint.textContent = '';
        this.dragFootprint.style.display = 'none';
    }

    _updateDragFootprint(e) {
        const drag = this.dragItem;
        if (!drag || !this.visible || !this.authoritativeOwner) { this._clearDragFootprint(); return; }
        const target = this._pcGridTargetFromPointer(e, drag);
        if (!target) { this._clearDragFootprint(); return; }
        const w = drag.width || 1, h = drag.height || 1;
        const src = this._wireIndex(drag.from);
        const decision = this._pcGridDropDecision(e, drag);
        const boardLeft = this.x + PC_INVENTORY_LOGICAL.gridX;
        const boardTop = this.y + PC_INVENTORY_LOGICAL.gridY;
        const pt = target.point;
        const pickLeft = pt.x - w * 20 / 2, pickTop = pt.y - h * 20 / 2;
        const pickRight = pickLeft + w * 20, pickBottom = pickTop + h * 20;
        const gridRight = boardLeft + 8 * 20, gridBottom = boardTop + 8 * 20;
        if (pickRight <= boardLeft || pickLeft >= gridRight || pickBottom <= boardTop || pickTop >= gridBottom) {
            this._clearDragFootprint(); return;
        }
        this.dragFootprint.textContent = '';
        this.dragFootprint.style.display = 'block';
        const clipped = target.col < 0 || target.row < 0 || target.col + w > 8 || target.row + h > 8;
        const projection = this.authoritativeOwner.getGridProjection?.();
        for (let dy=0; dy<h; dy++) for (let dx=0; dx<w; dx++) {
            const col=target.col+dx, row=target.row+dy;
            if (col < 0 || col >= 8 || row < 0 || row >= 8) continue;
            const cellIndex=row*8+col;
            const owner=projection?.valid ? projection.cells[cellIndex] : -2;
            const occupied = owner !== -1 && owner !== src;
            // RenderColor evaluates every covered square independently. Green
            // means the item covering THIS square accepts IsOverlayItem; the
            // actual release packet is still gated by the picked top-left cell.
            const overlayTarget = occupied ? this.authoritativeOwner.getDisplayItem?.(owner) : null;
            const overlay = occupied && pcInventoryOverlayMoveAllowed(drag.item, overlayTarget);
            const warning = clipped || (occupied && !overlay) || !projection?.valid;
            const marker=document.createElement('span');
            marker.dataset.muPcOwner='CNewUIInventoryCtrl::RenderColor';
            marker.dataset.muPlacement=overlay?'overlay':(warning?'warning':'normal');
            // PC defaults: normal=(0.1,0.4,0.8), warning=(1,0.2,0.2),
            // successful occupied overlay warning=(0.2,0.4,0.2), alpha=.4.
            const bg = overlay ? 'rgba(51,102,51,.4)' : (warning ? 'rgba(255,51,51,.4)' : 'rgba(26,102,204,.4)');
            marker.style.cssText = `position:absolute;left:${PC_INVENTORY_LOGICAL.gridX+col*20}px;top:${PC_INVENTORY_LOGICAL.gridY+row*20}px;width:20px;height:20px;box-sizing:border-box;background:${bg};`;
            this.dragFootprint.appendChild(marker);
        }
    }

    _beginPickedVisual(from, cell) {
        this._restoreDragCells();
        this._dragCellStyles=[];
        if (from.kind === 'grid') {
            const anchor=this._wireIndex(from);
            const grid=this.authoritativeOwner?.getGridProjection?.();
            if (grid?.valid && grid.placements.has(anchor)) {
                const anchorCell=this.gridSlots[anchor-12];
                if(anchorCell){
                    this._dragCellStyles.push({cell:anchorCell,visibility:anchorCell.style.visibility,pointerEvents:anchorCell.style.pointerEvents});
                    anchorCell.style.visibility='hidden';
                    anchorCell.style.pointerEvents='none';
                }
            }
        } else if (cell) {
            this._dragCellStyles.push({cell,visibility:cell.style.visibility,pointerEvents:cell.style.pointerEvents});
            cell.style.visibility='hidden';
            cell.style.pointerEvents='none';
        }
    }

    _positionDragGhost(e) {
        const pt = this._pointerInBoard(e);
        this.dragGhost.style.left = `${pt.x}px`;
        this.dragGhost.style.top = `${pt.y}px`;
    }

    _endDrag(e) {
        if (e.button !== undefined && e.button !== 0) return;
        if (!this.dragItem) return;
        const drag = this.dragItem;
        const target = this.visible && !this._destroyed ? document.elementFromPoint(e.clientX, e.clientY) : null;
        this._restoreDragCells();
        this._clearDragFootprint();
        this.dragItem = null;
        ++this._dragGeneration;
        this.dragGhost.style.display = 'none';
        this.dragGhost.textContent = '';
        if (!this.visible || this._destroyed) return;

        if (!target) return;
        // Only the renderer canvas supplied by the scene owner may receive a
        // world drop. Preview/minimap/foreign canvases stay fail-closed.
        if (this.authoritativeOwner && this.isWorldDropTarget?.(target)) {
            this.onWorldDropGesture?.();
            e.preventDefault?.();
            const current = this._itemAt(drag.from);
            if (!this._sameDraggedItem(current, drag.item)) return;
            const src = this._wireIndex(drag.from);
            if (src >= 0 && this.onServerDrop) {
                void this.onServerDrop(src, Uint8Array.from(drag.item.raw));
            }
            return; // 0x23 owns removal; 0x20 owns ground creation.
        }

        // Grid destination is computed from CNewUIPickedItem::GetTargetPos, not
        // from a browser child element. This matters for 2x2/2x3/etc items and
        // also keeps the original source cell hidden while the item is picked.
        if (this.authoritativeOwner && this.onServerMove) {
            const decision=this._pcGridDropDecision(e,drag);
            if(decision.valid){
                const current=this._itemAt(drag.from);
                if(!this._sameDraggedItem(current,drag.item)) return;
                const src=this._wireIndex(drag.from), dst=decision.dst;
                if(src>=0 && dst>=0 && src!==dst) void this.onServerMove(src,dst);
                return;
            }
        }
        const slotNode = target.closest?.('[data-ref]') || target;
        if (!this.gridSlots.includes(slotNode) && !Object.values(this.equipSlots).includes(slotNode)) {
            if (this.authoritativeOwner && this.onExternalDrop) {
                const current=this._itemAt(drag.from);
                if (!this._sameDraggedItem(current, drag.item)) return;
                const src=this._wireIndex(drag.from);
                if (src >= 0 && this.onExternalDrop({srcType:0,srcIndex:src,item:current,event:e}) === true) e.preventDefault?.();
            }
            return;
        }
        const refAttr = slotNode.dataset && slotNode.dataset.ref;
        if (!refAttr) return;

        if (this.authoritativeOwner && this.onServerMove) {
            const current = this._itemAt(drag.from);
            if (!this._sameDraggedItem(current, drag.item)) return;
            let dstRef;
            if (refAttr[0] === 'g') {
                const decision=this._pcGridDropDecision(e,drag);
                if(!decision.valid) return;
                // PC packet destination remains GetTargetLinealPos(): the
                // centered picked-item top-left grid cell, even for overlay.
                dstRef={kind:'grid',index:decision.dst-12};
            } else {
                dstRef={kind:'equip',key:refAttr.slice(1)};
            }
            if (dstRef.kind === 'equip' && this._equipDefs?.find((d) => d.key === dstRef.key)?.extended) return;
            const src = this._wireIndex(drag.from), dst = this._wireIndex(dstRef);
            if (src >= 0 && dst >= 0 && src !== dst) void this.onServerMove(src, dst);
            return; // response 0x24 is the only UI mutation owner
        }

        if (refAttr[0] === 'g') {
            const idx = parseInt(refAttr.slice(1), 10);
            this._dropOnGrid(drag, idx);
        } else if (refAttr[0] === 'e') {
            this._dropOnEquip(drag, refAttr.slice(1));
        }
    }

    _beginGridDrag(anchor) {
        const cell = Number.isInteger(anchor) ? this.gridSlots[anchor-12] : null;
        this._beginPickedVisual({kind:'grid',index:(anchor||12)-12}, cell);
    }

    _restoreDragCells() {
        for(const old of this._dragCellStyles || []) {
            old.cell.style.visibility=old.visibility;
            old.cell.style.pointerEvents=old.pointerEvents;
        }
        this._dragCellStyles=null;
    }

    _sameDraggedItem(current, captured) {
        return current?.raw?.length === 12 && captured?.raw?.length === 12
            && current.raw.every((byte, i) => byte === captured.raw[i]);
    }

    _dropOnGrid(drag, idx) {
        const inv = this.inventory;
        if (drag.from.kind === 'grid') {
            if (drag.from.index === idx) { this.refresh(); return; }
            // swap simples
            const a = inv.grid[drag.from.index];
            const b = inv.grid[idx];
            inv.grid[idx] = a;
            inv.grid[drag.from.index] = b || null;
        } else {
            // do equipamento para o grid
            if (inv.grid[idx]) { this.refresh(); return; }
            if (inv.unequip(drag.from.key)) {
                inv.grid[idx] = drag.item;
            }
        }
        this.refresh();
    }

    _dropOnEquip(drag, key) {
        const inv = this.inventory;
        const def = this._equipDefs?.find(s => s.key === key);
        if (!def) return;
        if (!def.types.includes(Number(drag.item.itemType ?? drag.item.type)) &&
            !(inv.canEquip && inv.canEquip(drag.item, key))) {
            if (!(inv.canEquip && inv.canEquip(drag.item, key))) { this.refresh(); return; }
        }
        if (drag.from.kind === 'grid') {
            const old = inv.equipment[key];
            if (inv.equip(drag.item, key)) {
                const gi = inv.grid.indexOf(drag.item);
                if (gi >= 0) inv.grid[gi] = null;
                if (old && drag.from.kind === 'grid') {
                    // volta o equipado anterior para o slot de origem do grid
                    if (!inv.grid[drag.from.index]) inv.grid[drag.from.index] = old;
                }
            }
        } else if (drag.from.key !== key) {
            // troca entre slots de equipamento (raro) — ignora
        }
        this.refresh();
    }

    requestRefresh() {
        if (this._destroyed || this._refreshScheduled) return;
        this._refreshScheduled = true;
        const run = () => {
            this._refreshRaf = 0;
            this._refreshScheduled = false;
            if (!this._destroyed) this.refresh();
        };
        // F3:10/F3:14/0x24/0x28 edit commands can emit dozens of mutations in
        // one browser frame. The PC mutates state immediately but paints NewUI
        // once per frame; coalesce the DOM/icon rebuild to that same ownership.
        if (typeof requestAnimationFrame === 'function') this._refreshRaf = requestAnimationFrame(run);
        else queueMicrotask(run);
    }

    refresh() {
        this._cancelDrag(); // server/catalog updates invalidate captured hit targets
        const inv = this.inventory;
        // Hidden NewUI inventory is state-only.  R70 rendered every real BMD icon
        // during world construction even though the window was display:none;
        // physical logs then showed the first world frame stalling.  Main 5.2
        // RenderItem3D only runs when INTERFACE_INVENTORY is actually rendered.
        const renderVisuals = this.visible === true;
        const projection = this.authoritativeOwner?.getGridProjection?.();
        const grid = projection?.valid ? projection : null;
        for (let i = 0; i < 64; i++) {
            const item = this.authoritativeOwner ? this._itemAt({ kind: 'grid', index: i }) : inv.grid[i];
            const cell = this.gridSlots[i];
            cell.innerHTML = '';
            const owner = grid?.cells[i];
            const placement = grid?.placements.get(12+i);
            cell.style.width = `${(placement?.width || 1)*20}px`;
            cell.style.height = `${(placement?.height || 1)*20}px`;
            cell.style.zIndex = placement ? '5' : '3';
            cell.style.visibility = grid && owner >= 0 && owner !== 12+i ? 'hidden' : 'visible';
            if (renderVisuals && item && (!grid || placement)) cell.appendChild(this._iconNode(item, placement ? {w:placement.width*20,h:placement.height*20} : {w:cell.clientWidth||cell._iconRenderSize||20,h:cell.clientHeight||cell._iconRenderSize||20}));
        }
        this.body?.querySelectorAll?.('[data-mu-item-border]').forEach((n) => n.remove());
        for (const def of (this._equipDefs || EQUIP_SLOTS)) {
            const cell = this.equipSlots[def.key];
            if (!cell || (def.extended && !def.active)) { if (cell?.style) cell.style.display='none'; continue; }
            if (cell.style) cell.style.display='flex';
            const item = this.authoritativeOwner ? this._itemAt({ kind: 'equip', key: def.key }) : inv.equipment[def.key];
            cell.innerHTML = '';
            if (renderVisuals && item) {
                const rect = pcEquipmentIconRect(def);
                const icon=this._iconNode(item, {w:rect.w,h:rect.h});
                icon.style.position = 'absolute';
                icon.style.left = `${rect.x}px`;
                icon.style.top = `${rect.y}px`;
                icon.style.width = `${rect.w}px`;
                icon.style.height = `${rect.h}px`;
                // CNewUIMyInventory::Render3D offsets only EQUIPMENT_ARMOR by
                // -10px while retaining the exact slot width-4/height-4 viewport.
                // Armor offset is already part of pcEquipmentIconRect; do not
                // center/shrink the whole-slot image or apply the shift twice.
                cell.appendChild(icon);
                const attr = this.authoritativeOwner?.itemAttributes?.get?.(item.itemType ?? item.type);
                const maxDurability = pcMaxDurability(item, attr);
                const durability = Number(item.durability);
                let rgba = null;
                if (Number.isFinite(maxDurability) && maxDurability > 0 && Number.isFinite(durability)) {
                    if (durability <= 0) rgba='rgba(255,0,0,.25)';
                    else if (durability <= maxDurability*.2) rgba='rgba(255,38,0,.25)';
                    else if (durability <= maxDurability*.3) rgba='rgba(255,128,0,.25)';
                    else if (durability <= maxDurability*.5) rgba='rgba(255,255,0,.25)';
                }
                if (rgba) {
                    const overlay=document.createElement('span');
                    overlay.dataset.muPcOwner='CNewUIMyInventory::RenderEquippedItemDurability';
                    overlay.style.cssText=`position:absolute;inset:0;background:${rgba};pointer-events:none;z-index:8;`;
                    cell.appendChild(overlay);
                }
                const border=itemBorderFor(item.itemType ?? item.type);
                if (border) this._appendPcEquipmentBorder(def, border);
            }
        }
        const zen = this.authoritativeOwner ? (this.authoritativeOwner.zen || 0) : (inv.zen || 0);
        this.zenEl.textContent = Number(zen || 0).toLocaleString();
        if (!renderVisuals) this._scheduleHiddenIconPrewarm(grid);
    }

    _scheduleHiddenIconPrewarm(grid = null) {
        // R81: keep Main's "do not RenderItem3D while the inventory is hidden"
        // presentation rule, but warm the exact BMD/material thumbnail cache in
        // browser idle slices. Opening I then clones already-rendered canvases
        // instead of compiling every item shader serially on the click frame.
        if (this.visible || this._destroyed || !this.authoritativeOwner?.hasSnapshot || !this.authoritativeOwner?.itemAttributes) return;
        const generation = (this._prewarmGeneration = (this._prewarmGeneration || 0) + 1);
        const jobs = [];
        const projection = grid || this.authoritativeOwner.getGridProjection?.();
        if (projection?.valid) {
            for (const [anchor, placement] of projection.placements) {
                const item = this.authoritativeOwner.getDisplayItem?.(anchor);
                if (item) jobs.push({ item, size:{ w:placement.width*20, h:placement.height*20 } });
            }
        }
        for (const def of (this._equipDefs || EQUIP_SLOTS)) {
            if (def.extended && !def.active) continue;
            const item = this._itemAt({kind:'equip',key:def.key});
            if (item) jobs.push({ item, size:{ w:Math.max(8,(Number(def.w)||20)-4), h:Math.max(8,(Number(def.h)||20)-4) } });
        }
        if (!jobs.length) return;
        const waitIdle = () => new Promise((resolve) => {
            if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), {timeout:250});
            else setTimeout(resolve, 24);
        });
        void this._itemIO().then(async (io) => {
            if (!io) return;
            // Two idle workers feed the shared ItemIconRenderer queue.  The
            // queue itself is capped at two cold jobs, so this overlaps BMD /
            // texture fetch+decode without creating extra WebGL contexts or a
            // burst that would steal the gameplay frame.  R81 awaited every
            // item serially here, so a full bag could still be cold when I was
            // opened immediately after world entry.
            let cursor = 0;
            const worker = async () => {
                while (cursor < jobs.length) {
                    if (this._destroyed || this.visible || generation !== this._prewarmGeneration) return;
                    const job = jobs[cursor++];
                    await waitIdle();
                    if (this._destroyed || this.visible || generation !== this._prewarmGeneration) return;
                    const { item, size } = job;
                    try {
                        await renderIcon3D(io, Number(item.itemType ?? item.type), Number.isInteger(item.rawLevel) ? item.rawLevel : ((item.level || 0) << 3), size, {...item, iconPadding:32});
                    } catch (_) { /* fail-closed: visible render will report the same missing owner */ }
                }
            };
            await Promise.all([worker(), worker()]);
        });
    }

    _appendPcEquipmentBorder(def, rule) {
        if (!def || !rule) return;
        const node=document.createElement('span');
        node.dataset.muItemBorder=def.key;
        node.dataset.thickness=String(rule.thickness);
        node.dataset.r=String(rule.r); node.dataset.g=String(rule.g); node.dataset.b=String(rule.b); node.dataset.alpha=String(rule.alpha);
        node.style.cssText=`position:absolute;left:${def.x+3}px;top:${def.y+3}px;width:${Math.max(0,def.w-6)}px;height:${Math.max(0,def.h-6)}px;box-sizing:border-box;pointer-events:none;z-index:9;`;
        this.body.appendChild(node);
        this._ensurePcBorderPulse();
    }

    _ensurePcBorderPulse() {
        if (this._borderPulseRaf || this._destroyed) return;
        const tick=(now)=>{
            this._borderPulseRaf=0;
            if (this._destroyed || !this.body?.isConnected) return;
            const nodes=this.body.querySelectorAll('[data-mu-item-border]');
            if (!nodes.length) return;
            const pulse=(Math.sin(Number(now||0)*0.002)+1)*0.5;
            nodes.forEach((n)=>{
                const base=Number(n.dataset.thickness)||0;
                const alpha=(Number(n.dataset.alpha)||0)*(0.8+pulse*0.2);
                const r=Number(n.dataset.r)||0,g=Number(n.dataset.g)||0,b=Number(n.dataset.b)||0;
                n.style.borderStyle='solid'; n.style.borderWidth=`${base+pulse*0.5}px`;
                n.style.borderColor=`rgba(${r},${g},${b},${alpha})`;
            });
            this._borderPulseRaf=requestAnimationFrame(tick);
        };
        this._borderPulseRaf=requestAnimationFrame(tick);
    }

    _pcItemNumber(item) {
        const type=Number(item?.itemType ?? item?.type), durability=Number(item?.durability);
        if (!Number.isInteger(type)) return null;
        const group=Math.floor(type/512), index=type%512;
        if (Number.isFinite(durability) && durability>1 && group===14 && (
            (index>=0&&index<=8)||(index>=46&&index<=50)||(index>=35&&index<=40)||
            (index>=70&&index<=71)||index===94||(index>=78&&index<=82)||
            (index>=85&&index<=90)||index===133)) return Math.trunc(durability);
        if (Number.isFinite(durability) && durability>1 && isJewelStackType(type)) return Math.trunc(durability);
        if (group===12 && ([30,31,136,137,138,139,140,141,142,143].includes(index))) {
            const raw=Number.isInteger(item?.rawLevel)?item.rawLevel:((Number(item?.level)||0)<<3);
            return ((((raw>>3)&15)+1)*10);
        }
        return null;
    }

    _appendPcItemNumber(span, value) {
        if (!span || !Number.isFinite(value)) return;
        const text=String(Math.trunc(value));
        const host=document.createElement('canvas');
        host.dataset.muPcOwner='CNewUIInventoryCtrl::RenderNumberOfItem';
        const dw=8.4, dh=11.2, advance=dw*0.8;
        const outW=Math.max(1,Math.ceil(dw+(text.length-1)*advance));
        host.width=Math.ceil(outW); host.height=Math.ceil(dh);
        host.style.cssText=`position:absolute;right:1px;top:1px;width:${outW}px;height:${dh}px;z-index:7;pointer-events:none;`;
        span.appendChild(host);
        RemoteAssets.fetchDecodedImage('Interface/newui_number1.OZT').then((res)=>{
            if (!res?.image || !host.isConnected) return;
            const ctx=host.getContext('2d'); if(!ctx)return;
            ctx.clearRect(0,0,host.width,host.height);
            for(let i=0;i<text.length;i++){
                const d=text.charCodeAt(i)-48;if(d<0||d>9)continue;
                ctx.drawImage(res.image,d*12,0,12,14,i*advance,0,dw,dh);
            }
            ctx.globalCompositeOperation='source-atop'; ctx.fillStyle='rgb(255,230,179)'; ctx.fillRect(0,0,host.width,host.height); ctx.globalCompositeOperation='source-over';
        }).catch(()=>{});
    }

    _iconNode(item, iconSize = 20) {
        const iconW = Math.max(8, Math.round(typeof iconSize === 'object' ? Number(iconSize.w || iconSize.width || 20) : Number(iconSize || 20)));
        const iconH = Math.max(8, Math.round(typeof iconSize === 'object' ? Number(iconSize.h || iconSize.height || iconW) : Number(iconSize || 20)));
        // R12.6 (t-muhjlq66-8): ícone REAL por render 3D do BMD do item —
        // paridade RenderItem3D (ZzzInventory.cpp:10695). O emoji era
        // placeholder e FOI REMOVIDO. Fail-closed: sem BMD/registro →
        // slot vazio; overlays (+level, quantity) permanecem (são dados
        // reais do item, não decoração).
        const span = document.createElement('span');
        span.style.cssText = 'position:relative;display:inline-flex;width:100%;height:100%;align-items:center;justify-content:center;';
        const itemType = Number(item?.itemType ?? item?.type);
        if (Number.isInteger(itemType)) {
            const cvHost = document.createElement('span');
            cvHost.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;';
            span.appendChild(cvHost);
            const load=async()=>{
                const io=await this._itemIO();if(!io)return null;
                for(let attempt=0;attempt<3;attempt++){
                    if(this._destroyed||!cvHost.isConnected)return null;
                    const cv=await renderIcon3D(io, Number(item.itemType ?? item.type), Number.isInteger(item.rawLevel) ? item.rawLevel : ((item.level || 0) << 3), {w:iconW,h:iconH}, {...item,iconPadding:32});
                    if(cv)return cv;
                    if(attempt<2)await new Promise(r=>setTimeout(r,150*(attempt+1)));
                }
                return null;
            };
            load().then((cv) => {
                if (cv && cvHost.isConnected) {
                    // PC renders items in the whole item-view viewport. Keep
                    // pixels extending past the slot without scaling the icon.
                    const pad=Number(cv.dataset.muIconPadding)||0;
                    cv.style.cssText = `position:absolute;left:${-pad}px;top:${-pad}px;width:${cv.width}px;height:${cv.height}px;max-width:none;max-height:none;pointer-events:none;image-rendering:auto;`;
                    cvHost.appendChild(cv);
                }
            }).catch(e=>console.warn('[Inventory] ícone indisponível:',e.message));
        }
        // Main 5.2 does not draw a generic +level label or generic Excellent
        // text glow over every inventory icon. RenderNumberOfItem is selective.
        const pcNumber=this._pcItemNumber(item);
        if (pcNumber !== null) this._appendPcItemNumber(span, pcNumber);
        return span;
    }

    /** io p/ o renderIcon3D (MUAssets/RemoteAssets reais) — Promise em cache. */
    _itemIO() {
        if (!this._ioPromise) {
            this._ioPromise = (async () => {
                const { MUAssets } = await import('../assets/MUAssetLoader.js');
                const { RemoteAssets } = await import('../data/RemoteAssets.js');
                return {
                    loadBMD: (p) => MUAssets.loadBMD(p),
                    fetchBinary: (p) => RemoteAssets.fetchBinary(p),
                };
            })().catch(() => null); // fail-closed: io null = slot vazio
        }
        return this._ioPromise;
    }

    _cancelDrag() {
        this._restoreDragCells();
        this._clearDragFootprint();
        this.dragItem = null;
        ++this._dragGeneration;
        if (this.dragGhost) {
            this.dragGhost.style.display = 'none';
            this.dragGhost.textContent = '';
        }
        this._hideItemTooltip();
    }

    show() {
        this._prewarmGeneration = (this._prewarmGeneration || 0) + 1;
        super.show();
        // Render real 3D item owners only once the PC inventory is visible.
        this.refresh();
    }

    hide() {
        this._cancelDrag();
        super.hide();
    }

    destroy() {
        this._destroyed = true;
        this._artGeneration = (this._artGeneration || 0) + 1;
        this._cancelDrag();
        if (this._mouseMoveHandler) window.removeEventListener('mousemove', this._mouseMoveHandler);
        if (this._pickedClickHandler) window.removeEventListener('click', this._pickedClickHandler);
        if (this._blurHandler) window.removeEventListener('blur', this._blurHandler);
        if (this._borderPulseRaf) cancelAnimationFrame(this._borderPulseRaf);
        this._borderPulseRaf=0;
        if (this._refreshRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._refreshRaf);
        this._refreshRaf=0; this._refreshScheduled=false;
        this.dragGhost?.remove?.();
        this.tooltip?.remove?.();
        super.destroy();
    }
}
