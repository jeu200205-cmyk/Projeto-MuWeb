// ui2/StatusBars.js — CNewUIMainFrameWindow PC Main 5.2 owner for Web.
// R16: geometry/UV contract is taken from the clean NewUIMainFrameWindow.cpp.
// Missing authored assets fail closed; no CSS gradient/placeholder HUD exists.

import { RemoteAssets } from '../data/RemoteAssets.js';

const ASSETS = Object.freeze({
    left: 'Custom/NewInterface/main_frame_left.ozt',
    right: 'Custom/NewInterface/main_frame_right.ozt',
    hp: 'Custom/NewInterface/main_frame_life.ozt',
    mp: 'Custom/NewInterface/main_frame_mana.ozt',
    venom: 'Custom/NewInterface/main_frame_venom.ozt',
    // Clean PC RenderGuageSD -> IMAGE_GAUGE_SD = Interface\\newui_menu_sd.jpg.
    sd: 'Interface/newui_menu_SD.OZJ',
    ag: 'Custom/NewInterface/main_frame_stamina.ozj',
    exp: 'Interface/newui_Exbar.OZJ',
    digits: 'Custom/NewInterface/fonttest.OZT',
    btnShop: 'Custom/NewInterface/btn_shop.ozj',
    btnCharacter: 'Custom/NewInterface/main_frame_btn_character.ozj',
    btnInventory: 'Custom/NewInterface/main_frame_btn_inventory.ozj',
    btnGuild: 'Custom/NewInterface/main_frame_btn_guild.ozj',
    btnParty: 'Custom/NewInterface/main_frame_btn_party.ozj',
});

const PC_W = 640, PC_H = 480, WEB_SCALE = 1.25; // common Web board is 800x600
// NewUIMainFrameWindow::RenderFrame, in the same 640x480 space as artwork.
export const PC_MAINFRAME_FPS_RECT = Object.freeze({x:555,y:466,w:35,h:12});
export const PC_MAINFRAME_COORD_RECTS = Object.freeze([
    Object.freeze({x:55,y:467,w:6,h:6}), Object.freeze({x:76.5,y:467,w:6,h:6}),
]);
function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
function div(cls, css = '') { const e=document.createElement('div'); e.className=cls; e.style.cssText=css; return e; }

export class StatusBars {
    constructor(opts = {}) {
        this.max = { hp: 100, mp: 100, sd: 100, ag: 100 };
        this.target = { hp: 100, mp: 100, sd: 0, ag: 0 };
        this.display = { ...this.target };
        this.serverExp = { level: null, experience: null, nextExperience: null };
        this.actions = opts.actions || {};
        this._ready = false;
        this._destroyed = false;
        this._autoReveal = opts.autoReveal !== false;
        this._parent = opts.parent || document.body;
        this._numberCache = new Map();
        this._gaugeCache = new Map();

        this.root = div('mu-pc-mainframe-root', 'position:absolute;inset:0;z-index:600;pointer-events:none;user-select:none;visibility:hidden;');
        this.root.id = 'mu-pc-mainframe-status';
        this.root.dataset.muPcOwner = 'CNewUIMainFrameWindow';
        this._parent.appendChild(this.root);

        this.pcLayer = div('mu-pc-mainframe-640', `position:absolute;left:0;top:0;width:${PC_W}px;height:${PC_H}px;transform:scale(${WEB_SCALE});transform-origin:0 0;pointer-events:none;`);
        this.root.appendChild(this.pcLayer);

        this.leftFrame = div('mu-mainframe-left', 'position:absolute;left:0;top:420px;width:320px;height:60px;background-repeat:no-repeat;background-size:100% 100%;');
        this.rightFrame = div('mu-mainframe-right', 'position:absolute;left:320px;top:420px;width:320px;height:60px;background-repeat:no-repeat;background-size:100% 100%;');
        this.pcLayer.append(this.leftFrame, this.rightFrame);

        this.hp = this._mkGauge('hp', 144, 431, 45.5, 43, 102, 96);
        this.mp = this._mkGauge('mp', 451, 431, 45.5, 43, 102, 96);
        this.sd = this._mkGauge('sd', 118, 433, 16, 41, 16, 41);
        this.ag = this._mkGauge('ag', 506, 438, 16, 38.5, 36, 86);
        this.exp = this._mkHorizontalGauge('exp', 221, 438, 200, 5, 6, 4);

        this.numberLayer = div('mu-mainframe-number-layer', 'position:absolute;inset:0;pointer-events:none;');
        this.buttonLayer = div('mu-mainframe-button-layer', 'position:absolute;inset:0;pointer-events:none;');
        this.buttonLayer.dataset.muPcButtonSpace = '640x480';
        this.pcLayer.append(this.numberLayer, this.buttonLayer);
        this.buttons = [];
        this._loadPromise = this._loadRealAssets();
    }

    _mkGauge(key, x, y, w, h, cropW, cropH) {
        const mask = div(`mu-mainframe-${key}-mask`, `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;pointer-events:none;`);
        const fill = div(`mu-mainframe-${key}`, 'position:absolute;left:0;top:0;background-repeat:no-repeat;pointer-events:none;');
        mask.appendChild(fill); this.pcLayer.appendChild(mask);
        return { key, mask, fill, x, y, w, h, cropW, cropH, naturalW:0, naturalH:0 };
    }

    _mkHorizontalGauge(key, x, y, w, h, cropW, cropH) {
        const g=this._mkGauge(key,x,y,w,h,cropW,cropH);
        g.horizontal=true; g.mask.style.width='0px';
        return g;
    }

    async _loadImage(path) {
        // R31: one bounded retry closes transient CDN/decode races before the
        // atomic world-UI barrier decides an authored owner is missing. The
        // canonical decoded cache evicts null/rejections, so retry is real;
        // permanent/manifest-proven absence still fails closed.
        let image = await RemoteAssets.fetchDecodedImage(path).catch(() => null);
        if (!image && !this._destroyed) image = await RemoteAssets.fetchDecodedImage(path).catch(() => null);
        return image;
    }

    async _loadRealAssets() {
        const keys=['left','right','hp','mp','venom','sd','ag','exp','digits','btnShop','btnCharacter','btnInventory','btnGuild','btnParty'];
        const vals=await Promise.all(keys.map(k=>this._loadImage(ASSETS[k])));
        if (this._destroyed) return false;
        const a=Object.fromEntries(keys.map((k,i)=>[k,vals[i]]));
        // R32: the gameplay board is atomic, so every visible MainFrame component
        // promised by this owner must be decoded before publication. R31 only
        // required frame+HP+MP and could publish with SD/AG/EXP/numbers/buttons
        // silently absent, producing a partial HUD on a transient decode failure.
        // Keep venom optional because this adapter does not render that gauge yet.
        const required = ['left','right','hp','mp','sd','ag','exp','digits','btnShop','btnCharacter','btnInventory','btnGuild','btnParty'];
        const missing = required.filter((key) => !a[key]);
        if (missing.length) {
            console.warn(`[UI PC] MainFrame real incompleto (${missing.join(',')}) — atomic HUD bloqueado; placeholder DESATIVADO.`);
            return false;
        }
        this.leftFrame.style.backgroundImage=`url("${a.left.url}")`;
        this.rightFrame.style.backgroundImage=`url("${a.right.url}")`;
        this._bindGaugeImage(this.hp,a.hp);
        this._bindGaugeImage(this.mp,a.mp);
        if (a.sd) this._bindGaugeImage(this.sd,a.sd); else this.sd.mask.style.display='none';
        if (a.ag) this._bindGaugeImage(this.ag,a.ag); else this.ag.mask.style.display='none';
        if (a.exp) this._bindGaugeImage(this.exp,a.exp); else this.exp.mask.style.display='none';
        this._digits=a.digits;

        // Clean PC SetButtonInfo(): y=452, 22x22, exact x owners.
        this._installPcButton('guild', a.btnGuild, 92, 'Guild');
        this._installPcButton('party', a.btnParty, 349, 'Party');
        this._installPcButton('character', a.btnCharacter, 380, 'Character');
        this._installPcButton('inventory', a.btnInventory, 412, 'Inventory');
        this._installPcButton('cashshop', a.btnShop, 489, 'Cash Shop');

        this._ready=true;
        this.update(0);
        if(this._autoReveal)this.reveal();
        console.info('[UI PC] CNewUIMainFrameWindow R16: frame/gauges/EXP/numbers geometry owner ativo.');
        return true;
    }

    _bindGaugeImage(g,img) {
        if(!g||!img)return;
        g.naturalW=img.w;g.naturalH=img.h;
        g.fill.style.backgroundImage=`url("${img.url}")`;
        // RenderBitmap maps cropW×cropH source pixels onto authored destination.
        g.fill.style.width=`${g.w*(img.w/g.cropW)}px`;
        g.fill.style.height=`${g.h*(img.h/g.cropH)}px`;
        g.fill.style.backgroundSize='100% 100%';
    }

    _installPcButton(name,img,pcX,title) {
        if(!img)return;
        const b=document.createElement('button'); b.type='button';b.title=title;b.dataset.muPcButton=name;
        // Button atlas has vertical UP/OVER/DOWN rows; clean owner renders 22x22.
        b.style.cssText=`position:absolute;left:${pcX}px;top:452px;width:22px;height:22px;padding:0;border:0;background-color:transparent;background-image:url("${img.url}");background-repeat:no-repeat;background-size:22px auto;background-position:0 0;pointer-events:auto;cursor:pointer;z-index:604;`;
        const state=n=>{b.style.backgroundPosition=`0 -${n*22}px`;};
        b.addEventListener('mouseenter',()=>state(1)); b.addEventListener('mouseleave',()=>state(0));
        b.addEventListener('mousedown',()=>state(2)); b.addEventListener('mouseup',()=>state(1));
        b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();this.actions?.[name]?.();});
        this.buttonLayer.appendChild(b);this.buttons.push(b);
    }

    setActions(actions={}){this.actions=actions;}

    setPosition(x, y) {
        if (!this._ready) return;
        const values = [x, y];
        PC_MAINFRAME_COORD_RECTS.forEach((r, i) => this._renderNumber(`position${i}`, values[i], r.x, r.y, r.w, r.h, 0.6));
    }

    setStats(stats={}) {
        if(stats.maxHp!==undefined)this.max.hp=Math.max(1,Number(stats.maxHp)||1);
        if(stats.maxMp!==undefined)this.max.mp=Math.max(1,Number(stats.maxMp)||1);
        if(stats.maxSd!==undefined)this.max.sd=Math.max(1,Number(stats.maxSd)||1);
        if(stats.maxAg!==undefined)this.max.ag=Math.max(1,Number(stats.maxAg)||1);
        if(stats.hp!==undefined)this.target.hp=Math.max(0,Number(stats.hp)||0);
        if(stats.mp!==undefined)this.target.mp=Math.max(0,Number(stats.mp)||0);
        if(stats.sd!==undefined)this.target.sd=Math.max(0,Number(stats.sd)||0);
        if(stats.ag!==undefined)this.target.ag=Math.max(0,Number(stats.ag)||0);
        if(Number.isFinite(Number(stats.level)))this.serverExp.level=Number(stats.level);
        if(Number.isFinite(Number(stats.experience)))this.serverExp.experience=Number(stats.experience);
        if(Number.isFinite(Number(stats.nextExperience)))this.serverExp.nextExperience=Number(stats.nextExperience);
    }

    // Compatibility method; actual HP/SD authority is applied by GameApp RX.
    damage(amount){return {hpLoss:Number(amount)||0,sdLoss:0};}
    addExp(){/* EXP is server-authoritative; F3 snapshot/level packets own it. */}

    _setVerticalGauge(g,ratio){
        if(!g?.naturalH)return;
        const r=clamp01(ratio);
        const q=Math.round(r*10000)/10000;
        if(this._gaugeCache.get(g.key)===q)return;
        this._gaugeCache.set(g.key,q);
        const missing=1-r, visible=g.h*r;
        g.mask.style.top=`${g.y+g.h*missing}px`;g.mask.style.height=`${visible}px`;
        g.fill.style.top=`${-g.h*missing}px`;
    }

    _setExperienceGauge(){
        const g=this.exp;if(!g?.naturalH)return;
        const {level,experience,nextExperience}=this.serverExp;
        if(!Number.isFinite(level)||!Number.isFinite(experience)||!Number.isFinite(nextExperience)||nextExperience<=0){g.mask.style.width='0px';return;}
        const priorLevel=Math.max(0,level-1);
        let prior=priorLevel>0?(9+priorLevel)*priorLevel*priorLevel*10:0;
        if(priorLevel>255){const over=priorLevel-255;prior+=(9+over)*over*over*1000;}
        const need=nextExperience-prior;
        const cur=Math.max(0,experience-prior);
        let ten=(need>0&&cur>0)?(cur/need)*10:0;
        if(!Number.isFinite(ten))ten=0;
        const progress=Math.max(0,Math.min(1,ten-Math.floor(ten)));
        const q=Math.round(progress*10000)/10000;
        if(this._gaugeCache.get('exp')===q)return;
        this._gaugeCache.set('exp',q);
        g.mask.style.left=`${g.x}px`;g.mask.style.top=`${g.y}px`;g.mask.style.height=`${g.h}px`;g.mask.style.width=`${g.w*progress}px`;
        g.fill.style.left='0';g.fill.style.top='0';
    }

    _renderNumber(id,value,centerX,y,w=6,h=6,tint=1){
        if(!this._digits||!Number.isFinite(Number(value)))return;
        const text=String(Math.max(0,Math.trunc(Number(value))));
        const cacheKey=`${text}:${centerX}:${y}:${w}:${h}:${tint}`;
        if(this._numberCache.get(id)===cacheKey)return;
        this._numberCache.set(id,cacheKey);
        let group=this.numberLayer.querySelector(`[data-pc-num="${id}"]`);
        if(!group){group=div('mu-mainframe-number','position:absolute;left:0;top:0;');group.dataset.pcNum=id;this.numberLayer.appendChild(group);}
        group.style.filter=tint===1?'none':`brightness(${tint})`;
        group.replaceChildren();
        let x=centerX-text.length*w/2;
        const bgW=w*(this._digits.w/16), bgH=h*2; // PC crop = 16px × half atlas height.
        for(const ch of text){
            const d=Number(ch);const e=div('mu-mainframe-digit',`position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background-image:url("${this._digits.url}");background-repeat:no-repeat;background-size:${bgW}px ${bgH}px;background-position:${-d*w}px 0;`);
            group.appendChild(e);x+=w*0.7;
        }
    }

    update(dt = 1 / 60){
        const frames = Math.max(0, Math.min(6, Number(dt) * 60 || 0));
        const factor = frames ? 1 - Math.pow(1 - 0.18, frames) : 1;
        for(const key of ['hp','mp','sd','ag']){const d=this.display[key],t=this.target[key];const n=d+(t-d)*factor;this.display[key]=Math.abs(n-t)<0.05?t:n;}
        if(!this._ready)return;
        this._setVerticalGauge(this.hp,this.display.hp/this.max.hp);
        this._setVerticalGauge(this.mp,this.display.mp/this.max.mp);
        this._setVerticalGauge(this.sd,this.display.sd/this.max.sd);
        this._setVerticalGauge(this.ag,this.display.ag/this.max.ag);
        this._setExperienceGauge();
        // Exact RenderNumbers callsites in clean NewUIMainFrameWindow.cpp.
        this._renderNumber('hp',this.target.hp,169,462,6,6);
        this._renderNumber('mp',this.target.mp,481,462,6,7);
        this._renderNumber('sd',this.target.sd,130,462,6,6);
        this._renderNumber('ag',this.target.ag,518,466,6,7);
        this._renderNumber('level',this.serverExp.level,429,436,5,6);
    }

    ready(){return this._loadPromise.then(()=>this._ready);}
    reveal(){if(this._ready&&!this._destroyed)this.root.style.visibility='visible';}
    hide(){this.root.style.visibility='hidden';}
    destroy(){this._destroyed=true;this.root.remove();}
}
