// ui2/CharacterWindow.js — CNewUICharacterInfoWindow owner (tecla C), R50.
//
// The current client ships a custom CharacterInfo skin. This browser port keeps
// the exact 190x429 logical PC surface and the retained NewUI assets instead of
// drawing a generic web panel. Gameplay values remain server/model owned; this
// class never invents derived formulas and never mutates stats locally.

import { MUWindow } from './MUWindow.js';
import { RemoteAssets } from '../data/RemoteAssets.js';

export const PC_CHARACTER_WINDOW = Object.freeze({
    width: 190,
    height: 429,
    assets: Object.freeze({
        back: 'Interface/newui_msgbox_back.OZJ',
        stats: 'Custom/NewInterface/stats_v2.ozj',      // 931304
        points: 'Custom/NewInterface/points_v2.ozj',   // 931303
        plus: 'Custom/NewInterface/btn_plus_v2.ozj',   // 931305
        exit: 'Interface/newui_exit_00.OZT',
    }),
    statY: Object.freeze([120, 175, 240, 295, 350]),
});

const ATTRS = Object.freeze([
    { key: 'str', name: 'Força' },
    { key: 'agi', name: 'Agilidade' },
    { key: 'vit', name: 'Vitalidade' },
    { key: 'ene', name: 'Energia' },
    { key: 'cmd', name: 'Comando' },
]);

function place(el, x, y, w = null, h = null) {
    el.style.position = 'absolute';
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    if (w !== null) el.style.width = `${w}px`;
    if (h !== null) el.style.height = `${h}px`;
}

function makeText(parent, x, y, w, h, css = '') {
    const el = document.createElement('div');
    place(el, x, y, w, h);
    el.style.cssText += `;overflow:hidden;white-space:nowrap;pointer-events:none;${css}`;
    parent.appendChild(el);
    return el;
}

export class CharacterWindow extends MUWindow {
    constructor(opts = {}) {
        super({
            title: 'Personagem',
            width: PC_CHARACTER_WINDOW.width,
            height: PC_CHARACTER_WINDOW.height,
            hotkey: opts.hotkey || 'c',
            x: opts.x !== undefined ? opts.x : 610,
            y: opts.y !== undefined ? opts.y : 0,
            parent: opts.parent || document.body,
            onVisibilityChange: opts.onVisibilityChange,
            draggable: false,
            useRealFrameTexture: false,
        });
        this.char = opts.character || {};
        this.onAddPoint = typeof opts.onAddPoint === 'function' ? opts.onAddPoint : null;
        this.element.dataset.muPcOwner = 'CNewUICharacterInfoWindow';
        this.element.dataset.muCurrentClientSkin = '931303-931304-931305';
        this.element.style.cssText += ';background:transparent;border:0;box-shadow:none;border-radius:0;overflow:hidden;';

        // The stock MUWindow header is not part of CNewUICharacterInfoWindow.
        this.header.style.display = 'none';
        if (this.closeBtn) this.closeBtn.style.display = 'none';
        this.body.style.cssText = 'position:absolute;inset:0;padding:0;margin:0;width:190px;height:429px;overflow:hidden;font-family:Tahoma,Arial,sans-serif;font-size:11px;line-height:1;';

        this.art = document.createElement('div');
        this.art.dataset.muRole = 'pc-character-art';
        this.art.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0;';
        this.body.appendChild(this.art);

        // Exact current mobile/PC CharacterInfo port uses narrow dark table
        // strips at these authored rows; they are part of the presentation and
        // prevent the background art from swallowing the white/blue text.
        this.tableShade = document.createElement('div');
        this.tableShade.dataset.muRole = 'pc-character-table-shades';
        this.tableShade.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;';
        for (const [i, y] of [75,88,101,144,158,199,212,225,264,319,332].entries()) {
            const strip = document.createElement('div');
            place(strip, 15, y, i < 3 ? 150 : 129, 12);
            strip.style.background = 'rgba(0,0,0,.48)';
            this.tableShade.appendChild(strip);
        }
        this.body.appendChild(this.tableShade);

        this.nameEl = makeText(this.body, 0, 12, 190, 14, 'z-index:3;text-align:center;color:#dabda0;font-weight:bold;');
        this.classEl = makeText(this.body, 0, 27, 190, 13, 'z-index:3;text-align:center;color:#fff;');
        this.serverEl = makeText(this.body, 0, 27, 190, 13, 'z-index:3;text-align:center;color:#fff;');
        this.serverEl.style.opacity = '0';
        this.levelEl = makeText(this.body, 18, 58, 82, 13, 'z-index:3;color:#f4f0e6;');
        this.pointsEl = makeText(this.body, 110, 58, 62, 13, 'z-index:3;color:#f4f0e6;');
        this.expEl = makeText(this.body, 18, 75, 150, 12, 'z-index:3;color:#f4f0e6;');
        this.pointProbabilityEl = makeText(this.body, 18, 88, 150, 12, 'z-index:3;color:#6496ff;');
        this.addMinusEl = makeText(this.body, 18, 101, 150, 12, 'z-index:3;color:#6496ff;');
        this.attackEl = makeText(this.body, 20, 145, 148, 12, 'z-index:3;color:#f4f0e6;');
        this.attackPvpEl = makeText(this.body, 20, 158, 148, 12, 'z-index:3;color:#f4f0e6;');
        this.defenseEl = makeText(this.body, 20, 199, 148, 12, 'z-index:3;color:#f4f0e6;');
        this.speedEl = makeText(this.body, 20, 212, 148, 12, 'z-index:3;color:#f4f0e6;');
        this.defenseRateEl = makeText(this.body, 20, 225, 148, 12, 'z-index:3;color:#f4f0e6;');
        this.hpEl = makeText(this.body, 20, 264, 148, 12, 'z-index:3;color:#f4f0e6;');
        this.mpEl = makeText(this.body, 18, 319, 150, 12, 'z-index:3;color:#f4f0e6;');
        this.magicEl = makeText(this.body, 18, 332, 150, 12, 'z-index:3;color:#f4f0e6;');
        this.spiritEl = makeText(this.body, 18, 363, 150, 12, 'z-index:3;color:#f4f0e6;');

        this.attrRows = {};
        ATTRS.forEach((a, row) => {
            const y = PC_CHARACTER_WINDOW.statY[row];
            const label = makeText(this.body, 22, y + 6, 55, 14, 'z-index:3;color:#dabda0;');
            const val = makeText(this.body, 76, y + 6, 43, 14, 'z-index:3;color:#f4f0e6;text-align:right;font-variant-numeric:tabular-nums;');
            label.textContent = a.name;
            const btn = document.createElement('button');
            btn.type = 'button'; btn.dataset.muAttribute = a.key; btn.setAttribute('aria-label', `Adicionar ${a.name}`);
            place(btn, 120, y + 2, 24, 24);
            btn.style.cssText += ';z-index:4;padding:0;border:0;background:transparent center/24px 24px no-repeat;color:#e7cf85;font:bold 13px Tahoma;cursor:pointer;';
            btn.textContent = '+';
            btn.addEventListener('click', (e) => { e.stopPropagation(); this._requestAddPoint(a.key); });
            this.body.appendChild(btn);
            this.attrRows[a.key] = { label, val, btn };
        });

        // Main 5.2 has TWO close interactions:
        //  1) tiny top-right background hitbox: x+169,y+7, 13x12;
        //  2) CNewUIButton exit owner: x+13,y+392, 36x29.
        // Keep both, rather than stretching a 21x21 Web-only hitbox over the art.
        this.closeHit = document.createElement('button');
        this.closeHit.type = 'button'; this.closeHit.setAttribute('aria-label', 'Fechar');
        place(this.closeHit, 169, 7, 13, 12);
        this.closeHit.style.cssText += ';z-index:5;padding:0;border:0;background:transparent center/21px 21px no-repeat;cursor:pointer;';
        this.closeHit.addEventListener('click', (e) => { e.stopPropagation(); this.hide(); });
        this.body.appendChild(this.closeHit);

        this.bottomExit = document.createElement('button');
        this.bottomExit.type = 'button'; this.bottomExit.setAttribute('aria-label', 'Fechar personagem (C)');
        place(this.bottomExit, 13, 392, 36, 29);
        this.bottomExit.style.cssText += ';z-index:5;padding:0;border:0;background:transparent;cursor:pointer;';
        this.bottomExit.addEventListener('click', (e) => { e.stopPropagation(); this.hide(); });
        this.body.appendChild(this.bottomExit);

        this._loadPcOwnerAssets();
        this.refresh();
        this._startSubjectPulse();
    }

    _addArt(asset, x, y, w, h, role) {
        const url = typeof asset === 'string' ? asset : asset?.url;
        if (!url || !this.art) return null;
        const el = document.createElement('div');
        el.dataset.muRole = role;
        place(el, x, y, w, h);
        el.style.cssText += `;background-image:url("${url}");background-repeat:no-repeat;background-position:center;background-size:100% 100%;`;
        this.art.appendChild(el);
        return el;
    }

    _addCroppedArt(asset, x, y, w, h, role, srcX = 0, srcY = 0, srcW = 160, srcH = 40) {
        const url = asset?.url || asset;
        if (!url || !this.art) return null;
        const aw = Math.max(srcW, Number(asset?.w || srcW));
        const ah = Math.max(srcH, Number(asset?.h || srcH));
        const sx = w / srcW, sy = h / srcH;
        const el = document.createElement('div');
        el.dataset.muRole = role;
        place(el, x, y, w, h);
        el.style.cssText += `;overflow:hidden;background-image:url("${url}");background-repeat:no-repeat;` +
            `background-size:${aw * sx}px ${ah * sy}px;background-position:${-srcX * sx}px ${-srcY * sy}px;`;
        this.art.appendChild(el);
        return el;
    }

    _bindVerticalSprite(button, asset, frameW, frameH, visualOffsetY = 0) {
        const url = asset?.url || asset;
        if (!button || !url) return;
        const srcW = Math.max(1, Number(asset?.w || frameW));
        const srcH = Math.max(1, Number(asset?.h || frameH));
        const scale = frameW / srcW;
        const atlasH = Math.max(frameH, Math.round(srcH * scale));
        const frames = Math.max(1, Math.floor((atlasH + 0.5) / frameH));
        let visual = button._muSpriteVisual;
        if (!visual) {
            visual = document.createElement('span');
            visual.setAttribute('aria-hidden', 'true');
            visual.style.cssText = 'position:absolute;left:0;pointer-events:none;background-repeat:no-repeat;';
            button.replaceChildren(visual);
            button._muSpriteVisual = visual;
        }
        visual.style.top = `${visualOffsetY}px`;
        visual.style.width = `${frameW}px`; visual.style.height = `${frameH}px`;
        visual.style.backgroundImage = `url("${url}")`;
        visual.style.backgroundSize = `${frameW}px ${atlasH}px`;
        const setFrame = (index) => {
            const i = Math.max(0, Math.min(frames - 1, index));
            visual.style.backgroundPosition = `0px ${-i * frameH}px`;
        };
        button._muSetSpriteFrame = setFrame;
        setFrame(0);
        if (!button.dataset.muSpriteEvents) {
            button.dataset.muSpriteEvents = '1';
            button.addEventListener('mouseenter', () => { if (!button.disabled) setFrame(Math.min(1, frames - 1)); });
            button.addEventListener('mouseleave', () => setFrame(button.disabled ? 0 : 0));
            button.addEventListener('mousedown', () => { if (!button.disabled) setFrame(Math.min(2, frames - 1)); });
            button.addEventListener('mouseup', () => { if (!button.disabled) setFrame(Math.min(1, frames - 1)); });
        }
    }

    async _loadPcOwnerAssets() {
        const A = PC_CHARACTER_WINDOW.assets;
        const [back, stats, points, plus, exit] = await Promise.all([
            RemoteAssets.fetchDecodedImage(A.back).catch(() => null),
            RemoteAssets.fetchDecodedImage(A.stats).catch(() => null),
            RemoteAssets.fetchDecodedImage(A.points).catch(() => null),
            RemoteAssets.fetchDecodedImage(A.plus).catch(() => null),
            RemoteAssets.fetchDecodedImage(A.exit).catch(() => null),
        ]);
        if (!this.element?.isConnected) return;
        this.art.replaceChildren();
        this._addArt(back, 0, 0, 190, 429, 'newui_msgbox_back');
        if (stats) {
            this._addCroppedArt(stats, 11, 53, 71, 18, 'stats-header-931304');
            const rows = Number(this.char?.classId) === 4 || String(this.char?.className || '').toLowerCase().includes('dark lord') ? 5 : 4;
            for (let i = 0; i < rows; i++) this._addCroppedArt(stats, 11, PC_CHARACTER_WINDOW.statY[i], 71, 18, `stats-row-${i}`);
        }
        if (points && Number(this.char?.points || 0) > 0) this._addCroppedArt(points, 100, 53, 71, 18, 'points-931303');
        if (exit && this.bottomExit) this._bindVerticalSprite(this.bottomExit, exit, 36, 29, 0);
        if (plus) {
            for (const { btn } of Object.values(this.attrRows)) {
                this._bindVerticalSprite(btn, plus, 24, 24, -4);
                btn.textContent = '';
            }
        }
        this._assets = { back, stats, points, plus, exit };
        this.element.dataset.muPcArtwork = back ? 'ready' : 'fallback-transparent';
    }

    _startSubjectPulse() {
        if (this._subjectPulseRaf) return;
        const tick = (timeMs) => {
            if (this._destroyed) { this._subjectPulseRaf = 0; return; }
            // NewUICharacterInfoWindow.cpp: fAlpha=sin(WorldTime*.001)+1,
            // class alpha=127*(2-fAlpha), server alpha=127*fAlpha.
            const fAlpha=Math.sin(Number(timeMs)*.001)+1;
            this.classEl.style.opacity=String(Math.max(0,Math.min(1,(2-fAlpha)/2)));
            this.serverEl.style.opacity=String(Math.max(0,Math.min(1,fAlpha/2)));
            this._subjectPulseRaf=requestAnimationFrame(tick);
        };
        this._subjectPulseRaf=requestAnimationFrame(tick);
    }

    _requestAddPoint(attr) {
        if (!this.onAddPoint || Number(this.char.points || 0) <= 0) return;
        // No optimistic mutation. F3:06 request + authoritative response owns it.
        try { this.onAddPoint(attr); } catch (_) { /* fail-closed */ }
    }

    _syncDynamicArt(points) {
        if (!this._assets || !this.art) return;
        const existing = this.art.querySelector('[data-mu-role="points-931303"]');
        if (points > 0 && this._assets.points && !existing)
            this._addCroppedArt(this._assets.points, 100, 53, 71, 18, 'points-931303');
        else if (points <= 0 && existing) existing.remove();
    }

    _pointProbability(current, maximum) {
        const value = Math.max(0, Number(current || 0));
        const max = Math.max(0, Number(maximum || 0));
        if (value <= 10) return 100;
        const pct = max > 0 ? Math.floor((value * 100) / max) : 0;
        if (pct <= 10) return 70;
        if (pct <= 30) return 60;
        if (pct <= 50) return 50;
        return 40;
    }

    refresh() {
        const c = this.char || {};
        const points = Math.max(0, Number(c.points || 0));
        this.nameEl.textContent = String(c.name || 'MU');
        this.classEl.textContent = `(${String(c.className || '')})`;
        this.serverEl.textContent = String(c.serverName || '');
        this.levelEl.textContent = `Nível ${Number(c.level || 0)}`;
        this.pointsEl.textContent = points > 0 ? `Pontos ${points}` : '';
        this.expEl.textContent = (c.experience !== undefined && c.nextExperience !== undefined)
            ? `EXP ${Number(c.experience || 0)} / ${Number(c.nextExperience || 0)}` : '';

        // Main 5.2 RenderTableTexts: the two blue rows below EXP are sourced
        // directly from F3:03/F3:05 AddPoint/MinusPoint fields. GlobalText is
        // not decoded in Web yet, so keep only the authored numeric semantics
        // instead of inventing localized labels.
        const pointFields = [c.addPoint, c.maxAddPoint, c.minusPoint, c.maxMinusPoint];
        const hasPointTable = pointFields.every((v) => Number.isFinite(Number(v))) &&
            (Number(c.maxAddPoint || 0) > 0 || Number(c.maxMinusPoint || 0) > 0 ||
             Number(c.addPoint || 0) > 0 || Number(c.minusPoint || 0) > 0);
        if (hasPointTable) {
            const add = Math.max(0, Number(c.addPoint || 0));
            const addMax = Math.max(0, Number(c.maxAddPoint || 0));
            const minus = Math.max(0, Number(c.minusPoint || 0));
            const minusMax = Math.max(0, Number(c.maxMinusPoint || 0));
            const addProb = this._pointProbability(add, addMax);
            const minusProb = this._pointProbability(minus, minusMax);
            this.pointProbabilityEl.textContent = `+${addProb}% / -${minusProb}%`;
            // Desktop source stores wMinusPoint as a positive magnitude but
            // renders both the current and maximum subtraction values negated.
            this.addMinusEl.textContent = Number(c.level || 0) > 9
                ? `+ ${add}/${addMax}  |  - ${minus}/-${minusMax}`
                : '+ 0/0  |  - 0/0';
        } else {
            this.pointProbabilityEl.textContent = '';
            this.addMinusEl.textContent = '';
        }

        const isDarkLord = Number(c.classId) === 4 || String(c.className || '').toLowerCase().includes('dark lord');
        for (const a of ATTRS) {
            const row = this.attrRows[a.key];
            const visible = a.key !== 'cmd' || isDarkLord;
            row.label.style.display = visible ? '' : 'none';
            row.val.style.display = visible ? '' : 'none';
            row.btn.style.display = (visible && points > 0) ? '' : 'none';
            if (!visible) continue;
            const bonusKey = ({str:'addStr',agi:'addAgi',vit:'addVit',ene:'addEne',cmd:'addCmd'})[a.key];
            const base = Number(c[a.key] || 0), bonus = Number(c[bonusKey] || 0);
            // PC RenderAttribute prints the combined authoritative stat value
            // (base + Add*) and changes only its color when a bonus is active.
            // Showing "base +bonus" made 5-digit MuPromax stats overflow the
            // 190px authored panel and visually collide with the label/button.
            row.val.textContent = String(base + bonus);
            row.val.style.color = bonus > 0 ? '#6496ff' : '#dabda0';
            const enabled = Boolean(this.onAddPoint && points > 0);
            row.btn.disabled = !enabled;
            row.btn.style.opacity = enabled ? '1' : '.62';
            row.btn._muSetSpriteFrame?.(0);
            row.btn.title = enabled ? 'Adicionar ponto' : 'Aguardando owner F3:06 autoritativo';
        }

        // Only values already present on the game/server adapter are displayed.
        const hp = `${Number(c.hp || 0)}/${Number(c.maxHp || 0)}`;
        const mp = `${Number(c.mp || 0)}/${Number(c.maxMp || 0)}`;
        const bp = `${Number(c.bp || 0)}/${Number(c.maxBp || 0)}`;
        const sd = `${Number(c.sd || 0)}/${Number(c.maxSd || 0)}`;
        this.hpEl.textContent = `HP ${hp}  SD ${sd}`;
        this.mpEl.textContent = `MP ${mp}  BP ${bp}`;
        const combatAuth = c.combatStatsAuthoritative === true;
        const fields = c.combatFields || {};
        const hasAttack = combatAuth && fields.damage !== false && Number.isFinite(Number(c.attackMin)) && Number.isFinite(Number(c.attackMax));
        this.attackEl.textContent = hasAttack ? `Dano ${Number(c.attackMin)}-${Number(c.attackMax)}` : '';
        this.attackPvpEl.textContent = combatAuth && fields.attackSuccess === true ? `Taxa PvP ${Number(c.attackRatePvp || 0)}` : '';
        this.defenseEl.textContent = combatAuth && fields.defense === true ? `Defesa ${Number(c.defense || 0)}` : '';
        this.speedEl.textContent = combatAuth && fields.speed === true ? `Velocidade ${Number(c.physicalSpeed || 0)}/${Number(c.magicSpeed || 0)}` : '';
        this.defenseRateEl.textContent = combatAuth && fields.defensePvp === true ? `Taxa def PvP ${Number(c.defenseRatePvp || 0)}` : '';
        this.magicEl.textContent = combatAuth && fields.magic !== false ? `Magia ${Number(c.magicMin || 0)}-${Number(c.magicMax || 0)}` : '';
        const isLord = Number(c.classId) === 4 || String(c.className || '').toLowerCase().includes('lord');
        this.spiritEl.textContent = combatAuth && fields.darkSpirit === true && isLord ? `Espírito ${Number(c.darkSpiritMin || 0)}-${Number(c.darkSpiritMax || 0)}  Taxa ${Number(c.darkSpiritSuccess || 0)}` : '';
        this._syncDynamicArt(points);
    }

    show() { super.show(); this.refresh(); }
    destroy() {
        this._destroyed = true;
        if (this._subjectPulseRaf) cancelAnimationFrame(this._subjectPulseRaf);
        this._subjectPulseRaf = 0;
        super.destroy();
    }
}
