// ui2/BuffBar.js — barra de buffs fixa no topo direito da tela.
// Componente NÃO-janela: container DOM independente (não estende MUWindow).
//
// Funcionalidades:
//  - Ícone REAL por eBuffState do servidor (sheets Interface/newui_statusicon
//    (.2).OZJ, paridade NewUIBuffWindow.cpp RenderBuffIcon) — buffs sem
//    serverBuffState real ficam com ícone VAZIO (fail-closed, zero emoji)
//  - Borda colorida pela "school" (escola do buff)
//  - Contador regressivo radial desenhado em canvas (arco sobre o ícone)
//  - Tooltip com nome / descrição / "restam Xs"
//  - Flash vermelho quando um buff expira
//  - Atualização via subscription aos eventos 'apply'/'expire' do BuffContainer
//
// Também exporta attachBuffEffects(buffContainer, scene, effectManager) que
// reage a 'apply' criando uma aura na cena (effectManager.createAura com a
// cor da escola) e a remove quando o buff expira.
//
// Uso:
//   import { BuffBar, attachBuffEffects } from './ui2/BuffBar.js';
//   const bar = new BuffBar(character.buffs);              // container BuffContainer
//   // ... no loop do jogo: bar.update(dt)  (chame também character.buffs.update(dt))
//   attachBuffEffects(character.buffs, scene, effectManager, () => mesh.position);

import { BuffDatabase } from '../game/BuffSystem.js';
import { drawBuffIcon, loadBuffIconSheets } from './BuffIcons.js';

// ── Escolas / cores ──────────────────────────────────────────────────────────
// BuffDatabase não define "school", então ela é inferida aqui por id.
export const SchoolColors = {
    defensive: 0x4d8dff, // azul — escudos / defesa
    offensive: 0xff6a3d, // laranja — ataque
    holy: 0xffe08a,      // dourado — cura / regeneração
    poison: 0x7dff5a,    // verde — antídotos / veneno
    utility: 0xc58aff,   // roxo — utilidade / poções
};

// Mapeamento buff -> escola (fallback: 'utility')
const BuffSchools = {
    mana_shield: 'defensive',
    greater_defense: 'defensive',
    soul_barrier: 'defensive',
    greater_attack: 'offensive',
    elf_heal: 'holy',
    passive_heal: 'holy',
    potion_hp: 'holy',
    potion_mp: 'utility',
    potion_antidote: 'poison',
};

// Pequenas descrições para tooltip (fallback: nome)
const BuffDescriptions = {
    mana_shield: 'Converte parte do dano recebido em consumo de mana.',
    greater_defense: 'Aumenta a defesa temporariamente.',
    soul_barrier: 'Barreira espiritual: aumenta a taxa de defesa.',
    greater_attack: 'Aumenta o dano causado temporariamente.',
    elf_heal: 'Restaura HP instantaneamente.',
    passive_heal: 'Regenera HP continuamente.',
    potion_hp: 'Recupera HP instantaneamente.',
    potion_mp: 'Recupera MP instantaneamente.',
    potion_antidote: 'Remove efeitos de veneno.',
};

export function getBuffSchool(buffId) {
    return BuffSchools[buffId] || 'utility';
}

export function getBuffSchoolColor(buffId) {
    return SchoolColors[getBuffSchool(buffId)];
}

function hex(color) {
    return '#' + color.toString(16).padStart(6, '0');
}

let stylesInjected = false;
function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const css = `
.mu-buffbar {
    position: fixed; top: 8px; right: 8px;
    display: flex; flex-direction: row-reverse; gap: 6px;
    z-index: 600; pointer-events: none;
    font-family: 'Segoe UI', Arial, sans-serif;
}
.mu-buff {
    position: relative; width: 40px; height: 40px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(10, 10, 18, 0.85);
    border: 2px solid #555; border-radius: 4px;
    box-shadow: 0 0 6px rgba(0,0,0,0.7);
    pointer-events: auto; cursor: default;
    font-size: 20px; line-height: 1;
}
.mu-buff canvas { position: absolute; inset: 0; pointer-events: none; }
.mu-buff .mu-buff-sec {
    position: absolute; right: 1px; bottom: 0;
    font-size: 9px; font-weight: bold; color: #fff;
    text-shadow: 0 0 2px #000, 0 0 2px #000;
    pointer-events: none;
}
.mu-buff.flash { animation: muBuffFlash 0.6s ease-out; }
@keyframes muBuffFlash {
    0%   { box-shadow: 0 0 0 0 rgba(255, 80, 80, 1); filter: brightness(2.2); }
    60%  { box-shadow: 0 0 14px 6px rgba(255, 80, 80, 0.6); filter: brightness(1.6); }
    100% { box-shadow: 0 0 6px rgba(0,0,0,0.7); filter: brightness(1); }
}
.mu-buff-tooltip {
    position: fixed; z-index: 800; max-width: 220px;
    background: rgba(10, 10, 18, 0.95);
    border: 1px solid #8a6d2f; border-radius: 4px;
    padding: 6px 8px; color: #e8dcc0; font-size: 11px;
    pointer-events: none; box-shadow: 0 0 12px rgba(0,0,0,0.8);
}
.mu-buff-tooltip .t-name { font-weight: bold; color: #f0d98c; margin-bottom: 2px; }
.mu-buff-tooltip .t-rem  { color: #9fd0ff; margin-top: 3px; }
`;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
}

const ICON_SIZE = 40;

export class BuffBar {
    /**
     * @param {BuffContainer} buffContainer - container de buffs (game/BuffSystem.js)
     */
    constructor(buffContainer) {
        injectStyles();
        this.container = buffContainer;
        /** Map<buffId, {el, canvas, ctx, secEl}> */
        this.slots = new Map();

        this.element = document.createElement('div');
        this.element.className = 'mu-buffbar';
        document.body.appendChild(this.element);

        // Sheets reais assíncronos (Interface/newui_statusicon(.2).OZJ) —
        // assign antes do load redesenha após pronto (mesmo padrão SkillBar).
        this._sheetsReady = loadBuffIconSheets().then((sheets) => {
            this._sheets = sheets;
            for (const [id, slot] of this.slots) this._renderIcon(id, slot);
            return sheets;
        }).catch(() => { this._sheets = null; });

        // Tooltip único compartilhado
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'mu-buff-tooltip';
        this.tooltip.style.display = 'none';
        document.body.appendChild(this.tooltip);
        this._tooltipBuffId = null;

        // Subscription: reage a apply/expire
        buffContainer.on('apply', (buff) => this._onApply(buff));
        buffContainer.on('expire', (buff) => this._onExpire(buff));

        // Sincroniza com buffs já ativos (ex.: restore de save)
        for (const buff of buffContainer.buffs.values()) this._addSlot(buff);
    }

    _onApply(buff) {
        // 'apply' emite ActiveBuff ou a def (para instants) — só renders com duração
        const def = buff.def || buff;
        if (!def.duration || def.duration <= 0) return;
        this._removeSlot(def.id); // refresh: recria para resetar o arco
        this._addSlot(buff);
    }

    _onExpire(buff) {
        const slot = this.slots.get(buff.id);
        if (slot) {
            // Flash visual antes de remover
            slot.el.classList.add('flash');
            const el = slot.el;
            this.slots.delete(buff.id);
            setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 600);
            if (this._tooltipBuffId === buff.id) this._hideTooltip();
        }
    }

    _addSlot(buff) {
        const id = buff.id || buff.def.id;
        if (this.slots.has(id)) return;
        const def = buff.def || BuffDatabase[id];
        if (!def) return;

        const el = document.createElement('div');
        el.className = 'mu-buff';
        el.style.borderColor = hex(getBuffSchoolColor(id));
        el.style.boxShadow = `0 0 8px ${hex(getBuffSchoolColor(id))}44, 0 0 6px rgba(0,0,0,0.7)`;

        const icon = document.createElement('canvas');
        icon.width = ICON_SIZE; icon.height = ICON_SIZE;
        icon.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
        el.appendChild(icon);
        const iconCtx = icon.getContext('2d');

        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = ICON_SIZE;
        el.appendChild(canvas);

        const sec = document.createElement('span');
        sec.className = 'mu-buff-sec';
        el.appendChild(sec);

        el.addEventListener('mouseenter', () => this._showTooltip(id, el));
        el.addEventListener('mouseleave', () => this._hideTooltip());

        this.element.appendChild(el);
        const slot = { el, canvas, ctx: canvas.getContext('2d'), secEl: sec, iconCtx, def };
        this.slots.set(id, slot);
        this._renderIcon(id, slot);
    }

    /**
     * Ícone REAL por eBuffState do wire (RenderBuffIcon PC: sheets
     * newui_statusicon). Buffs server-driven (srv_N) usam o N real; buffs
     * locais antigos sem serverBuffState ficam vazios (fail-closed, zero
     * emoji/placeholder — política do cliente).
     */
    _renderIcon(id, slot) {
        if (!slot?.iconCtx) return;
        const state = slot.def?.serverBuffState
            ?? this.container?.buffs.get(id)?.def?.serverBuffState;
        const drew = Number.isInteger(state) && state > 0
            ? drawBuffIcon(slot.iconCtx, this._sheets, state)
            : false;
        if (!drew) slot.iconCtx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
    }

    _removeSlot(id) {
        const slot = this.slots.get(id);
        if (slot && slot.el.parentNode) slot.el.parentNode.removeChild(slot.el);
        this.slots.delete(id);
    }

    _showTooltip(buffId, el) {
        const def = BuffDatabase[buffId];
        if (!def) return;
        this._tooltipBuffId = buffId;
        this.tooltip.innerHTML =
            `<div class="t-name">${def.icon || ''} ${def.name}</div>` +
            `<div>${BuffDescriptions[buffId] || def.name}</div>` +
            `<div class="t-rem"></div>`;
        const r = el.getBoundingClientRect();
        this.tooltip.style.display = 'block';
        // posiciona abaixo do ícone, alinhado à direita
        this.tooltip.style.top = `${r.bottom + 6}px`;
        this.tooltip.style.left = '0px';
        const tw = this.tooltip.offsetWidth;
        this.tooltip.style.left = `${Math.max(4, r.right - tw)}px`;
        this._updateTooltipRemaining();
    }

    _hideTooltip() {
        this._tooltipBuffId = null;
        this.tooltip.style.display = 'none';
    }

    _updateTooltipRemaining() {
        if (!this._tooltipBuffId) return;
        const buff = this.container.buffs.get(this._tooltipBuffId);
        const el = this.tooltip.querySelector('.t-rem');
        if (!el) return;
        el.textContent = buff ? `restam ${Math.ceil(buff.remaining)}s` : '';
    }

    _drawRadial(slot, buff) {
        const ctx = slot.ctx;
        const r = ICON_SIZE / 2;
        ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
        const dur = buff.def.duration;
        if (!dur || dur <= 0) return;
        const frac = Math.max(0, Math.min(1, buff.remaining / dur));
        const color = hex(getBuffSchoolColor(buff.id));
        // fundo escuro do arco restante
        ctx.beginPath();
        ctx.moveTo(r, r);
        ctx.arc(r, r, r - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fill();
        // anel de progresso
        ctx.beginPath();
        ctx.arc(r, r, r - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }

    /**
     * Deve ser chamado no loop do jogo (após buffContainer.update(dt)).
     * Redesenha arcos radiais e segundos restantes.
     * @param {number} dt delta-time em segundos (reservado; timers vivem no container)
     */
    update(dt) {
        for (const [id, slot] of this.slots) {
            const buff = this.container.buffs.get(id);
            if (!buff) continue; // remoção é tratada pelo evento 'expire'
            this._drawRadial(slot, buff);
            slot.secEl.textContent = `${Math.ceil(buff.remaining)}`;
        }
        this._updateTooltipRemaining();
    }

    destroy() {
        if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
        if (this.tooltip.parentNode) this.tooltip.parentNode.removeChild(this.tooltip);
        this.slots.clear();
    }
}

/**
 * Conecta buffs a efeitos visuais na cena 3D.
 *
 * Reage a 'apply' criando uma aura (effectManager.createAura) com a cor da
 * escola do buff, na posição do personagem; reage a 'expire' removendo-a.
 *
 * @param {BuffContainer} buffContainer
 * @param {THREE.Scene} scene
 * @param {EffectManager} effectManager
 * @param {() => import('three').Vector3} [getPosition] - posição da aura
 *        (default: origem). Tipicamente () => characterMesh.position.
 * @returns {{ dispose(): void }} handle para desligar os efeitos
 */
export function attachBuffEffects(buffContainer, scene, effectManager, getPosition = null) {
    /** Map<buffId, ParticleEmitter> auras ativas por buff */
    const auras = new Map();
    const origin = getPosition || (() => null);

    buffContainer.on('apply', (buff) => {
        const def = buff.def || buff;
        if (!def.duration || def.duration <= 0) return; // instants sem aura
        // Refresh: mantém a aura existente
        if (auras.has(def.id)) return;
        const pos = origin();
        const aura = effectManager.createAura(pos, getBuffSchoolColor(def.id));
        auras.set(def.id, aura);
    });

    buffContainer.on('expire', (buff) => {
        const aura = auras.get(buff.id);
        if (aura) {
            aura.loop = false;
            aura.duration = Math.min(aura.duration, aura.elapsed + 0.5); // fade-out
            setTimeout(() => aura.dispose(), 800);
            auras.delete(buff.id);
        }
    });

    return {
        dispose() {
            for (const aura of auras.values()) aura.dispose();
            auras.clear();
        },
    };
}
