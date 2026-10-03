// ui2/StorageWindow.js — CNewUIStorageInventory real Web port
//
// Authority: clean PC Main 5.2 NewUIStorageInventory.cpp/NewUISystem.cpp,
// current-client NewUICommon.cpp/NewUIMyInventory.cpp asset remaps, and
// GameServer packets 0x24(sub=2), 0x81..0x85. There is no local/offline vault
// state in this owner: the server mirror is the only item/Zen authority.

import { MUWindow } from './MUWindow.js';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { parsePcItemAttributes } from '../data/PcItemAttributes.js';
import { renderIcon3D } from './ItemIconRenderer.js';

export const PC_STORAGE_LOGICAL = Object.freeze({
  width:190, height:429, gridX:15, gridY:40, cols:8, rows:15, cell:20, cellArt:21,
});

const ASSETS = Object.freeze({
  top:'Custom/NewInterface/item_back01_v2.ozj',
  bottom:'Custom/NewInterface/item_back02_v2.ozj',
  grid:'Custom/NewInterface/item_box_v2.ozj',
  money:'Custom/NewInterface/item_money_v2.ozt',
  deposit:'Custom/NewInterface/btn_deposit_v2.ozj',
  withdraw:'Custom/NewInterface/btn_withdraw_v2.ozj',
  unlock:'Custom/NewInterface/btn_lock_v2.ozj',   // 931312 = IMAGE_STORAGE_BTN_UNLOCK
  lock:'Custom/NewInterface/btn_lock2_v2.ozj',   // 931313 = IMAGE_STORAGE_BTN_LOCK
  change:'Custom/NewInterface/btn_reload2.ozj',
  buy:'Custom/NewInterface/btn_shop.ozj',
  previous:'Custom/NewInterface/btn_previous.ozj',
  next:'Custom/NewInterface/btn_next.ozj',
  msgbox:'Interface/newui_msgbox_back.OZJ',
  ok:'Interface/newui_button_ok.OZT',
  cancel:'Interface/newui_button_cancel.OZT',
});

function formatZen(v) { return Number(v || 0).toLocaleString('pt-BR'); }

class PCNumericMessageBox {
  constructor(parent) {
    this.parent=parent || document.body;
    this.root=document.createElement('div');
    this.root.dataset.muPcOwner='CNewUITextInputMsgBox';
    this.root.style.cssText='position:absolute;display:none;width:230px;height:160px;z-index:900;left:285px;top:100px;color:#ddd;font:11px Tahoma,Arial,sans-serif;';
    this.bg=document.createElement('div');
    this.bg.style.cssText='position:absolute;inset:0;background:rgba(7,7,9,.97);border:1px solid #79622e;box-shadow:0 2px 14px #000;';
    this.root.appendChild(this.bg);
    this.text=document.createElement('div');
    this.text.style.cssText='position:absolute;left:18px;right:18px;top:28px;text-align:center;color:#ddd;white-space:pre-line;';
    this.root.appendChild(this.text);
    this.input=document.createElement('input');
    this.input.inputMode='numeric'; this.input.autocomplete='off';
    this.input.style.cssText='position:absolute;left:55px;top:68px;width:120px;height:20px;box-sizing:border-box;background:#090909;color:#fff;border:1px solid #7b6434;text-align:center;font:12px Tahoma;';
    this.root.appendChild(this.input);
    this.ok=this._button(43,112,64,29,'ok');
    this.cancel=this._button(123,112,64,29,'cancel');
    this.parent.appendChild(this.root);
    this._onOk=null;
    this.ok.addEventListener('click',()=>this._commit());
    this.cancel.addEventListener('click',()=>this.hide());
    this.input.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){e.preventDefault();this._commit();} if(e.key==='Escape'){e.preventDefault();this.hide();} });
    void this._loadArt();
  }
  _button(x,y,w,h,kind){
    const b=document.createElement('button'); b.type='button'; b.dataset.muPcButton=`msgbox-${kind}`;
    b.style.cssText=`position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;padding:0;border:0;background:transparent center/100% 300% no-repeat;`;
    const state=n=>b.style.backgroundPosition=`0 ${-h*n}px`;
    b.addEventListener('mouseenter',()=>state(1)); b.addEventListener('mouseleave',()=>state(0));
    b.addEventListener('mousedown',(e)=>{if(e.button===0)state(2)}); b.addEventListener('mouseup',()=>state(1));
    this.root.appendChild(b); return b;
  }
  async _loadArt(){
    const get=async p=>{try{return await RemoteAssets.fetchImageURL(p)}catch{return null}};
    const [bg,ok,cancel]=await Promise.all([get(ASSETS.msgbox),get(ASSETS.ok),get(ASSETS.cancel)]);
    if(bg) this.bg.style.background=`url("${bg}") center/100% 100% no-repeat`;
    if(ok) this.ok.style.backgroundImage=`url("${ok}")`;
    if(cancel) this.cancel.style.backgroundImage=`url("${cancel}")`;
  }
  show({message='',maxLength=10,password=false,onOk=null,value=''}){
    this.text.textContent=message; this.input.maxLength=maxLength; this.input.type=password?'password':'text';
    this.input.style.display='block'; this.input.value=value; this._onOk=onOk; this.root.style.display='block';
    queueMicrotask(()=>{this.input.focus();this.input.select();});
  }
  showConfirm({message='',onOk=null}){
    this.text.textContent=message; this.input.style.display='none'; this._onOk=()=>{onOk?.();return true}; this.root.style.display='block';
  }
  _commit(){ const v=this.input.value; if(this._onOk?.(v) !== false) this.hide(); }
  hide(){this.root.style.display='none';this._onOk=null;this.input.value='';}
  destroy(){this.root.remove();}
}

export class StorageWindow extends MUWindow {
  constructor(opts={}) {
    super({title:'Storage',width:190,height:429,x:opts.x??420,y:0,parent:opts.parent||document.body,
      useRealFrameTexture:false,draggable:false,closable:false,hotkey:null,onVisibilityChange:opts.onVisibilityChange});
    this.mirror=opts.mirror;
    this.serverInventory=opts.serverInventory;
    this.onMove=typeof opts.onMove==='function'?opts.onMove:null;
    this.resolveInventoryTarget=typeof opts.resolveInventoryTarget==='function'?opts.resolveInventoryTarget:null;
    this.onCloseStorage=typeof opts.onCloseStorage==='function'?opts.onCloseStorage:null;
    this.onStorageGold=typeof opts.onStorageGold==='function'?opts.onStorageGold:null;
    this.onChangeWarehouse=typeof opts.onChangeWarehouse==='function'?opts.onChangeWarehouse:null;
    this.onRequestVaultCost=typeof opts.onRequestVaultCost==='function'?opts.onRequestVaultCost:null;
    this.onVaultBuy=typeof opts.onVaultBuy==='function'?opts.onVaultBuy:null;
    this.onStoragePassword=typeof opts.onStoragePassword==='function'?opts.onStoragePassword:null;
    this.getCharacterGold=typeof opts.getCharacterGold==='function'?opts.getCharacterGold:()=>0;
    this.getTotalLevel=typeof opts.getTotalLevel==='function'?opts.getTotalLevel:()=>1;

    this.element.dataset.muPcOwner='CNewUIStorageInventory';
    this.element.style.cssText+=';background:transparent;border:0;box-shadow:none;border-radius:0;overflow:visible;';
    this.header.style.display='none'; this.body.style.cssText='position:absolute;inset:0;padding:0;margin:0;overflow:visible;';
    this.art=document.createElement('div'); this.art.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:0;'; this.body.appendChild(this.art);
    this.titleEl=document.createElement('div'); this.titleEl.style.cssText='position:absolute;left:0;top:9px;width:190px;text-align:center;font:11px Tahoma;color:#d8d8d8;z-index:6;pointer-events:none;text-shadow:1px 1px #000;'; this.body.appendChild(this.titleEl);
    this.pageEl=document.createElement('div'); this.pageEl.style.cssText='position:absolute;left:0;top:20px;width:190px;text-align:center;font:11px Tahoma;color:#f0c60c;z-index:6;pointer-events:none;'; this.body.appendChild(this.pageEl);

    this.grid=[];
    for(let i=0;i<120;i++){
      const c=document.createElement('div'), x=15+(i%8)*20, y=40+Math.floor(i/8)*20;
      c.dataset.storageIndex=String(i); c.style.cssText=`position:absolute;left:${x}px;top:${y}px;width:20px;height:20px;z-index:4;overflow:visible;pointer-events:auto;`;
      c.addEventListener('mousedown',(e)=>this._beginDrag(e,i));
      c.addEventListener('contextmenu',(e)=>{e.preventDefault();this._autoWithdraw(i)});
      this.body.appendChild(c); this.grid.push(c);
    }
    this.goldEl=document.createElement('div'); this.goldEl.style.cssText='position:absolute;left:60px;top:350px;width:108px;text-align:right;color:#f0dc96;font:11px Tahoma;z-index:6;pointer-events:none;';this.body.appendChild(this.goldEl);
    this.taxLabel=document.createElement('div');this.taxLabel.textContent='Taxa';this.taxLabel.style.cssText='position:absolute;left:25px;top:371px;color:#f04040;font:11px Tahoma;z-index:6;pointer-events:none;';this.body.appendChild(this.taxLabel);
    this.taxEl=document.createElement('div');this.taxEl.style.cssText='position:absolute;left:60px;top:371px;width:108px;text-align:right;color:#ffdc96;font:11px Tahoma;z-index:6;pointer-events:none;';this.body.appendChild(this.taxEl);
    const zen=document.createElement('div');zen.textContent='Zen';zen.style.cssText='position:absolute;left:25px;top:350px;color:#f04040;font:11px Tahoma;z-index:6;pointer-events:none;';this.body.appendChild(zen);

    this.btnPrev=this._makeButton('left',20,10,36,29,()=>this._page(-1),{asset:ASSETS.previous,specialPage:true});
    this.btnNext=this._makeButton('right',145,10,36,29,()=>this._page(1),{asset:ASSETS.next,specialPage:true});
    this.btnChange=this._makeButton('change',23,390,36,29,()=>this._changeDialog(),{asset:ASSETS.change});
    this.btnBuy=this._makeButton('buy',53,390,36,29,()=>this.onRequestVaultCost?.(),{asset:ASSETS.buy});
    this.btnDeposit=this._makeButton('deposit',83,390,36,29,()=>this._zenDialog(0),{asset:ASSETS.deposit});
    this.btnWithdraw=this._makeButton('withdraw',113,390,36,29,()=>this._zenDialog(1),{asset:ASSETS.withdraw});
    this.btnLock=this._makeButton('lock',143,390,36,29,()=>this._lockDialog(),{asset:ASSETS.unlock});
    this.closeHit=this._makeButton('top-close',169,7,13,12,()=>this.hide(),{});

    this.dragGhost=document.createElement('div');this.dragGhost.style.cssText='position:absolute;display:none;pointer-events:none;z-index:9998;width:26px;height:26px;transform:translate(-50%,-50%);';this.parent.appendChild(this.dragGhost);
    this._moveHandler=(e)=>this._positionGhost(e);this._upHandler=(e)=>this._endDrag(e);this._blurHandler=()=>this._cancelDrag();
    window.addEventListener('mousemove',this._moveHandler);window.addEventListener('mouseup',this._upHandler);window.addEventListener('blur',this._blurHandler);
    this.dialog=new PCNumericMessageBox(this.parent);
    this._unsub=this.mirror?.onChange?.(()=>this.refresh());
    void this._loadArt();
    void this._ensureItemAttributes(opts.itemAttributeLayout||'main52-byte-skill',opts.itemAttributePath||'Local/Por/item_por.bmd');
    this.refresh();
  }

  async _ensureItemAttributes(layout,path){
    if(this.mirror?.itemAttributes) return;
    try{const b=await RemoteAssets.fetchBinary(path);this.mirror?.setItemAttributes?.(parsePcItemAttributes(b,{layout}));this.refresh();}catch(e){console.warn('[Storage] ItemAttribute indisponível:',e.message)}
  }
  _makeButton(role,x,y,w,h,action,{asset=null,specialPage=false}={}){
    const b=document.createElement('button');b.type='button';b.dataset.muPcButton=`storage-${role}`;
    b.style.cssText=`position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:7;padding:0;border:0;background:transparent no-repeat;cursor:pointer;`;
    const applyState=(n)=>{
      if(specialPage){ b.style.backgroundSize=`${w/0.83}px ${h/0.20}px`; b.style.backgroundPosition=`${-w*(0.008/0.83)}px ${-h*([0.002,0.213,0.429][n]/0.20)}px`; }
      else { b.style.backgroundSize=`${w}px ${h*3}px`; b.style.backgroundPosition=`0 ${-h*n}px`; }
    };
    b.addEventListener('mouseenter',()=>applyState(1));b.addEventListener('mouseleave',()=>applyState(0));b.addEventListener('mousedown',(e)=>{if(e.button===0)applyState(2)});b.addEventListener('mouseup',()=>applyState(1));b.addEventListener('click',(e)=>{e.preventDefault();e.stopPropagation();action?.()});
    this.body.appendChild(b); if(asset) RemoteAssets.fetchImageURL(asset).then(u=>{if(u&&b.isConnected){b.style.backgroundImage=`url("${u}")`;applyState(0)}}).catch(()=>{}); return b;
  }
  async _loadArt(){
    const get=async p=>{try{return await RemoteAssets.fetchImageURL(p)}catch{return null}};
    const [top,bottom,grid,money]=await Promise.all([get(ASSETS.top),get(ASSETS.bottom),get(ASSETS.grid),get(ASSETS.money)]);
    if(top){const i=document.createElement('img');i.src=top;i.style.cssText='position:absolute;left:0;top:0;width:190px;height:254px;';this.art.appendChild(i)}
    if(bottom){const i=document.createElement('img');i.src=bottom;i.style.cssText='position:absolute;left:0;top:253.5px;width:190px;height:175px;';this.art.appendChild(i)}
    if(grid) for(let n=0;n<120;n++){const i=document.createElement('img');i.src=grid;i.style.cssText=`position:absolute;left:${15+(n%8)*20}px;top:${40+Math.floor(n/8)*20}px;width:21px;height:21px;`;this.art.appendChild(i)}
    if(money) for(const y of [342,364]){const i=document.createElement('img');i.src=money;i.style.cssText=`position:absolute;left:60px;top:${y}px;width:114px;height:21px;`;this.art.appendChild(i)}
  }
  _tax(){ let n=Math.floor(Math.max(1,Number(this.getTotalLevel()||1))**2*0.04); if(this.mirror?.locked)n+=Math.floor(Number(this.getTotalLevel()||1))*2; n=Math.max(1,n); if(n>=1000)n=Math.floor(n/100)*100; else if(n>=100)n=Math.floor(n/10)*10; return n; }
  refresh(){
    if(!this.mirror)return;
    this.titleEl.textContent=`Baú (${this.mirror.locked?'Bloqueado':'Desbloqueado'})`;
    this.titleEl.style.color=this.mirror.locked?'rgb(240,32,32)':'rgb(216,216,216)';
    this.pageEl.textContent=`${this.mirror.currentWarehouse} / ${this.mirror.warehouseCount}`;
    this.goldEl.textContent=formatZen(this.mirror.storageGold);this.taxEl.textContent=formatZen(this._tax());
    this.btnLock && RemoteAssets.fetchImageURL(this.mirror.locked?ASSETS.lock:ASSETS.unlock).then(u=>{if(u&&this.btnLock?.isConnected)this.btnLock.style.backgroundImage=`url("${u}")`}).catch(()=>{});
    const proj=this.mirror.projectGrid?.();
    for(let i=0;i<120;i++){
      const c=this.grid[i]; if(!c)continue; c.textContent=''; c.style.visibility='visible'; c.style.width='20px';c.style.height='20px';
      const owner=proj?.valid?proj.cells[i]:-1; if(owner>=0&&owner!==i){c.style.visibility='hidden';continue}
      const item=this.mirror.getDisplayItem?.(i), pl=proj?.placements?.get?.(i); if(!item||!pl)continue;
      c.style.width=`${pl.width*20}px`;c.style.height=`${pl.height*20}px`;
      const host=document.createElement('span');host.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;';c.appendChild(host);
      this._itemIO().then(io=>io&&renderIcon3D(io,item.type,Number.isInteger(item.rawLevel)?item.rawLevel:((item.level||0)<<3),{w:pl.width*20,h:pl.height*20},item)).then(cv=>{if(cv&&host.isConnected){cv.style.cssText='max-width:100%;max-height:100%;';host.appendChild(cv)}});
      if(item.level){const l=document.createElement('span');l.textContent=`+${item.level}`;l.style.cssText='position:absolute;right:1px;bottom:0;color:#ffd24b;font:9px Tahoma;z-index:2;text-shadow:1px 1px #000;';c.appendChild(l)}
    }
  }
  _itemIO(){if(!this._ioPromise)this._ioPromise=(async()=>{const {MUAssets}=await import('../assets/MUAssetLoader.js');return{loadBMD:p=>MUAssets.loadBMD(p),fetchBinary:p=>RemoteAssets.fetchBinary(p)}})().catch(()=>null);return this._ioPromise}
  _beginDrag(e,index){if(e.button!==0)return;const a=this.mirror.resolveAnchor?.(index)??index,item=this.mirror.getDisplayItem?.(a);if(!item)return;e.preventDefault();e.stopPropagation();this.drag={srcIndex:a,item};this.dragGhost.textContent='';this._itemIO().then(io=>io&&renderIcon3D(io,item.type,item.rawLevel,26,item)).then(cv=>{if(cv&&this.drag&&this.dragGhost.isConnected){cv.style.width='26px';cv.style.height='26px';this.dragGhost.appendChild(cv)}});this._positionGhost(e);this.dragGhost.style.display='block'}
  _positionGhost(e){if(!this.drag)return;const r=this.parent.getBoundingClientRect(),w=this.parent.clientWidth||800,h=this.parent.clientHeight||600;this.dragGhost.style.left=`${(e.clientX-r.left)*w/r.width}px`;this.dragGhost.style.top=`${(e.clientY-r.top)*h/r.height}px`}
  _endDrag(e){if(!this.drag)return;const d=this.drag;this._cancelDrag();if(!this.visible)return;const st=this.wireTargetAtClientPoint(e.clientX,e.clientY);if(st){if(st.index!==d.srcIndex)this.onMove?.(2,d.srcIndex,2,st.index);return}const inv=this.resolveInventoryTarget?.(e.clientX,e.clientY);if(inv)this._requestStorageToInventory(d.srcIndex,inv.index)}
  _cancelDrag(){this.drag=null;if(this.dragGhost){this.dragGhost.style.display='none';this.dragGhost.textContent=''}}
  wireTargetAtClientPoint(x,y){if(!this.visible)return null;const n=document.elementFromPoint(x,y)?.closest?.('[data-storage-index]');if(!n||!this.grid.includes(n))return null;const i=Number(n.dataset.storageIndex);return Number.isInteger(i)?{type:2,index:i}:null}
  _requestStorageToInventory(src,dst){if(this.mirror.locked&&!this.mirror.correctPassword){this._unlockFor(()=>this.onMove?.(2,src,0,dst));return}this.onMove?.(2,src,0,dst)}
  _autoWithdraw(index){const src=this.mirror.resolveAnchor?.(index)??index,item=this.mirror.getDisplayItem?.(src);if(!item)return;const dst=this.serverInventory?.findFreeGridSlot?.(item.itemType)??-1;if(dst>=0)this._requestStorageToInventory(src,dst)}
  _page(delta){const t=this.mirror.currentWarehouse+delta;if(t<1||t>this.mirror.warehouseCount)return;this.onChangeWarehouse?.(t)}
  _changeDialog(){this.dialog.show({message:'Número do baú',maxLength:4,onOk:(v)=>{const n=Number.parseInt(v,10);if(!Number.isInteger(n)||n<1||n>this.mirror.warehouseCount||n===this.mirror.currentWarehouse)return false;this.onChangeWarehouse?.(n);return true}})}
  _zenDialog(flag){this.dialog.show({message:flag===0?'Depositar Zen':'Retirar Zen',maxLength:10,onOk:(v)=>{const n=Number.parseInt(v,10);if(!Number.isInteger(n)||n<=0)return false;if(flag===0&&n>Number(this.getCharacterGold()||0))return false;if(flag===1&&(n>this.mirror.storageGold||Number(this.getCharacterGold()||0)+n>2000000000))return false;if(flag===1&&this.mirror.locked&&!this.mirror.correctPassword){this._unlockFor(()=>this.onStorageGold?.(flag,n));return true}this.onStorageGold?.(flag,n);return true}})}
  _unlockFor(next){
    // CPasswordKeyPadMsgBoxLayout: access to a locked storage move/take uses
    // type=0 + the 4-digit warehouse password and an empty 20-byte resident field.
    this.dialog.show({message:'Senha do baú',maxLength:4,password:true,onOk:(v)=>{
      if(!/^\d{4}$/.test(v))return false;this._afterUnlock=next;this.onStoragePassword?.(0,Number.parseInt(v,10),'');return true;
    }});
  }
  _removeLockDialog(){
    // CStorageUnlockMsgBoxLayout: disabling the lock uses type=2, password=0
    // and the authority/resident code as the 20-byte field.
    this.dialog.show({message:'Código de autoridade',maxLength:20,password:true,onOk:(resident)=>{
      if(!resident)return false;this.onStoragePassword?.(2,0,resident);return true;
    }});
  }
  _lockDialog(){if(this.mirror.locked){this._removeLockDialog();return}this.dialog.show({message:'Defina senha de 4 dígitos',maxLength:4,password:true,onOk:(v)=>{if(!/^\d{4}$/.test(v)||new Set(v).size===1)return false;this._lockFirst=v;this.dialog.show({message:'Confirme a senha',maxLength:4,password:true,onOk:(v2)=>{if(v2!==this._lockFirst)return false;const pw=Number.parseInt(v,10);this.dialog.show({message:'Código de autoridade',maxLength:20,password:true,onOk:(resident)=>{if(!resident)return false;this.onStoragePassword?.(1,pw,resident);return true}});return true}});return true}})}
  showVaultCost({coinname='',value=0}={}){
    // GlobalText[3167] is not decoded in this Web tree. Keep the localized text
    // fail-closed; display only the exact cost fields received from 0x84.
    this.dialog.root.dataset.muGlobalText='3167';
    this.dialog.showConfirm({message:`${Number(value)>>>0} ${String(coinname||'')}`.trim(),onOk:()=>this.onVaultBuy?.()});
  }
  onStatus(value){
    if(value===12&&this._afterUnlock){const fn=this._afterUnlock;this._afterUnlock=null;fn()}
    else if(value===10||value===11||value===13){this._afterUnlock=null;}
    this.refresh();
  }
  show(){super.show();this.refresh()}
  hide(){if(!this.visible)return;super.hide();this.dialog.hide();this.onCloseStorage?.()}
  destroy(){this._unsub?.();this._cancelDrag();window.removeEventListener('mousemove',this._moveHandler);window.removeEventListener('mouseup',this._upHandler);window.removeEventListener('blur',this._blurHandler);this.dragGhost?.remove();this.dialog?.destroy();super.destroy()}
}

export default StorageWindow;
