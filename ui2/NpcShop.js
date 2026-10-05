// ui2/NpcShop.js — CNewUINPCShop Web presentation, GameServer-authoritative.
// FIX42 removes the old local Inventory/Zen simulation. Every mutation is a
// request (0x32/0x33/0x34) and is committed only by the server RX owner.

import { MUWindow } from './MUWindow.js';
import { renderIcon3D } from './ItemIconRenderer.js';

export class NpcShop extends MUWindow {
    constructor(opts = {}) {
        super({ title: opts.npcName || 'Loja', width: 190, x: opts.x ?? 0, y: opts.y ?? 0,
            parent: opts.parent || document.body, onClose: opts.onClose || null });
        this.mirror = opts.mirror || null;
        this.serverInventory = opts.serverInventory || null;
        this.onBuy = typeof opts.onBuy === 'function' ? opts.onBuy : null;
        this.onSell = typeof opts.onSell === 'function' ? opts.onSell : null;
        this.onRepair = typeof opts.onRepair === 'function' ? opts.onRepair : null;
        this.repairShop = false;
        this.tab = 'buy';
        this.pending = false;
        this.element.dataset.muPcOwner = 'CNewUINPCShop';
        this.body.style.padding = '5px';

        const tabs = document.createElement('div');
        tabs.style.cssText = 'display:flex;gap:2px;margin-bottom:4px;';
        this.tabBuy = this._tab(tabs, 'buy', 'Comprar');
        this.tabSell = this._tab(tabs, 'sell', 'Vender');
        this.tabRepair = this._tab(tabs, 'repair', 'Reparar');
        this.tabRepair.style.display='none';
        this.body.appendChild(tabs);

        this.zenEl=document.createElement('div');
        this.zenEl.style.cssText='height:18px;color:#ffd24b;font:10px Tahoma;text-align:right;padding-right:3px;';
        this.body.appendChild(this.zenEl);
        this.listEl=document.createElement('div');
        this.listEl.style.cssText='height:300px;overflow-y:auto;display:grid;grid-template-columns:repeat(8,20px);grid-auto-rows:20px;gap:1px;padding:2px;background:rgba(0,0,0,.30);';
        this.body.appendChild(this.listEl);
        this.repairAll=document.createElement('button');
        this.repairAll.type='button'; this.repairAll.textContent='Reparar tudo';
        this.repairAll.className='mu-btn'; this.repairAll.style.cssText='display:none;width:100%;margin:4px 0 0;';
        this.repairAll.addEventListener('click',()=>{ if(!this.pending && this.onRepair) this.onRepair(255,0); });
        this.body.appendChild(this.repairAll);

        this._mirrorOff=this.mirror?.onChange?.(()=>this.refresh()) || null;
        this._invOff=this.serverInventory?.onChange?.(()=>this.refresh()) || null;
        this.refresh();
    }
    _tab(parent,id,text){ const b=document.createElement('button'); b.type='button'; b.className='mu-btn'; b.textContent=text; b.style.cssText='flex:1;margin:0;padding:3px 2px;'; b.addEventListener('click',()=>{this.tab=id;this.refresh();}); parent.appendChild(b); return b; }
    setRepairShop(on){ this.repairShop=!!on; this.tabRepair.style.display=this.repairShop?'':'none'; if(!this.repairShop&&this.tab==='repair')this.tab='buy'; this.refresh(); }
    setPending(on){ this.pending=!!on; this.refresh(); }
    _itemIO(){ if(!this._ioPromise)this._ioPromise=Promise.all([import('../assets/MUAssetLoader.js'),import('../data/RemoteAssets.js')]).then(([a,d])=>({loadBMD:p=>a.MUAssets.loadBMD(p),fetchBinary:p=>d.RemoteAssets.fetchBinary(p)})).catch(()=>null); return this._ioPromise; }
    _icon(item){
        const host=document.createElement('span'); host.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:visible;pointer-events:none;';
        const t=Number(item?.itemType ?? item?.type); if(!Number.isInteger(t))return host;
        void this._itemIO().then(io=>io&&renderIcon3D(io,t,Number.isInteger(item.rawLevel)?item.rawLevel:((item.level||0)<<3),{w:20,h:20},{...item,iconPadding:28})).then(cv=>{if(!cv||!host.isConnected)return;const pad=Number(cv.dataset.muIconPadding)||0;cv.style.cssText=`position:absolute;left:${-pad}px;top:${-pad}px;width:${cv.width}px;height:${cv.height}px;max-width:none;max-height:none;pointer-events:none;`;host.appendChild(cv);}).catch(()=>{});
        return host;
    }
    _cell(item,mode){
        const cell=document.createElement('div'); cell.dataset.muPcOwner='CNewUIInventoryCtrl::RenderItem3D';
        cell.style.cssText='position:relative;width:20px;height:20px;border:1px solid rgba(90,75,42,.45);box-sizing:border-box;cursor:pointer;overflow:visible;';
        cell.appendChild(this._icon(item));
        cell.title=`Type ${item.itemType ?? item.type}${Number(item.level)>0?' +'+item.level:''}`;
        cell.addEventListener('mouseenter',()=>cell.style.borderColor='#f0d98c');
        cell.addEventListener('mouseleave',()=>cell.style.borderColor='rgba(90,75,42,.45)');
        cell.addEventListener('click',()=>{
            if(this.pending)return;
            const slot=Number(item.slot);
            if(!Number.isInteger(slot))return;
            if(mode==='buy') this.onBuy?.(slot,item);
            else if(mode==='sell') this.onSell?.(slot,item);
            else if(mode==='repair') this.onRepair?.(slot,0,item);
        });
        return cell;
    }
    refresh(){
        const zen=Number(this.serverInventory?.zen||0)>>>0;
        this.zenEl.textContent=`Zen: ${zen.toLocaleString()}`;
        this.tabBuy.style.opacity=this.tab==='buy'?'1':'.65'; this.tabSell.style.opacity=this.tab==='sell'?'1':'.65'; this.tabRepair.style.opacity=this.tab==='repair'?'1':'.65';
        this.repairAll.style.display=(this.repairShop&&this.tab==='repair')?'block':'none';
        this.listEl.innerHTML=''; this.listEl.style.opacity=this.pending?'.6':'1';
        if(this.tab==='buy'){
            for(let i=0;i<120;i++){const item=this.mirror?.getDisplayItem?.(i);if(item)this.listEl.appendChild(this._cell(item,'buy'));}
        } else {
            for(let i=0;i<76;i++){const item=this.serverInventory?.getDisplayItem?.(i);if(item)this.listEl.appendChild(this._cell(item,this.tab));}
        }
    }
    show(){ this.mirror?.beginSession?.(); super.show(); this.refresh(); }
    hide(){ super.hide(); this.pending=false; }
    destroy(){ this.mirror?.endSession?.();this.pending=false;this._mirrorOff?.();this._invOff?.();this._mirrorOff=null;this._invOff=null;super.destroy?.(); }
}
export default NpcShop;
