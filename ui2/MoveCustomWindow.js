import { loadMoveCustomLua } from '../data/MoveCustomLua.js';

let cssReady=false;
function injectCss(){if(cssReady)return;cssReady=true;const style=document.createElement('style');style.textContent=`
.mu-movecustom-root{position:absolute;inset:0;z-index:760;display:none;pointer-events:none;font-family:Arial,sans-serif;font-size:11px;user-select:none}
.mu-movecustom-panel{position:absolute;background:rgba(0,0,0,.8);pointer-events:auto}
.mu-movecustom-title{position:absolute;height:16px;line-height:16px;text-align:center;color:rgb(217,135,25);font-weight:bold;pointer-events:none;white-space:nowrap;overflow:hidden}
.mu-movecustom-btn{position:absolute;box-sizing:border-box;border:0;background:rgba(128,128,128,.60);color:rgb(217,135,25);font:11px Arial,sans-serif;text-align:center;padding:0;cursor:pointer;pointer-events:auto;overflow:hidden;white-space:nowrap}
.mu-movecustom-btn:hover{background:rgba(128,128,128,.90);color:rgb(52,184,0)}
`;document.head.appendChild(style);}

export class MoveCustomWindow {
  constructor(opts={}){
    injectCss();
    this.parent=opts.parent||document.body;
    this.onMove=typeof opts.onMove==='function'?opts.onMove:null;
    this.onPrefetch=typeof opts.onPrefetch==='function'?opts.onPrefetch:null;
    this.onVisibilityChange=typeof opts.onVisibilityChange==='function'?opts.onVisibilityChange:null;
    this.canToggle=typeof opts.canToggle==='function'?opts.canToggle:()=>true;
    this.visible=false;this.ready=false;this._destroyed=false;this._selected='';this._owner=null;
    this.root=document.createElement('div');this.root.className='mu-movecustom-root';this.root.dataset.muPcOwner='MoveCustomInterface.lua';this.parent.appendChild(this.root);
    this.panel=document.createElement('div');this.panel.className='mu-movecustom-panel';this.root.appendChild(this.panel);
    this.title=document.createElement('div');this.title.className='mu-movecustom-title';this.root.appendChild(this.title);
    this._key=(e)=>{if(this._destroyed||e.code!=='KeyM'||e.repeat)return;const t=e.target;if(t&&(/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable))return;if(!this.visible&&!this.canToggle())return;e.preventDefault();e.stopPropagation();this.toggle();};
    window.addEventListener('keydown',this._key,true);
    this._loadPromise=this._load();
  }
  async _load(){try{const owner=await loadMoveCustomLua();if(this._destroyed)return false;this._owner=owner;const p=owner.contract.panel;Object.assign(this.panel.style,{left:`${p.x}px`,top:`${p.y}px`,width:`${p.w}px`,height:`${p.h}px`});Object.assign(this.title.style,{left:`${p.x}px`,top:`${p.y}px`,width:`${p.w}px`});this.root.dataset.muMoveCustomConfig=owner.configPath;this.root.dataset.muMoveCustomInterface=owner.interfacePath;this.ready=true;this._render();return true;}catch(e){this.root.dataset.muMoveCustom='owner-unavailable';console.warn('[MoveCustom] owner real indisponível; janela não publicada:',e?.message||e);return false;}}
  whenReady(){return this._loadPromise;}
  _clearButtons(){for(const el of [...this.root.querySelectorAll('.mu-movecustom-btn')])el.remove();}
  _prefetch(def){const mapNumber=Number(def?.mapNumber);if(Number.isInteger(mapNumber)&&mapNumber>=0)this.onPrefetch?.(mapNumber);}
  _button(def,label,action,{prefetch=true}={}){const b=document.createElement('button');b.type='button';b.className='mu-movecustom-btn';b.textContent=label;Object.assign(b.style,{left:`${def.IX??def.x}px`,top:`${def.IY??def.y}px`,width:`${def.wdth??def.w}px`,height:`${def.heigth??def.h}px`});b.dataset.muMoveIndex=String(def.index??'');if(prefetch){b.addEventListener('mouseenter',()=>this._prefetch(def),{passive:true});b.addEventListener('focus',()=>this._prefetch(def),{passive:true});}b.addEventListener('click',(e)=>{e.preventDefault();e.stopPropagation();action();});this.root.appendChild(b);return b;}
  _render(){if(!this.ready||!this._owner)return;this._clearButtons();this.title.textContent=this._selected?`Move | ${this._selected}`:'Moves';if(!this._selected){for(const map of this._owner.config.maps){this._button(map,map.name,()=>{if(map.listMove){this._selected=map.name;this._render();}else{this._send(map.name,'nil',map);}});}}else{const list=this._owner.config.moves.get(this._selected)||[];for(const move of list)this._button(move,move.title,()=>this._send(this._selected,move.title,move));const back=this._owner.contract.back;this._button({...back,index:200},'Voltar',()=>{this._selected='';this._render();},{prefetch:false});}const close=this._owner.contract.close;this._button({...close,index:100},'Fechar',()=>this.hide(),{prefetch:false});}
  async _send(map,destination,def){if(!this.onMove)return;this._prefetch(def);const move=Object.freeze({map,destination,mapNumber:def.mapNumber,cx:def.cdX,cy:def.cdY});try{const accepted=await this.onMove(move);if(accepted!==false)this.hide();}catch(e){console.warn('[MoveCustom] envio recusado:',e?.message||e);}}
  show(){if(!this.ready||this.visible||!this.canToggle())return false;this.visible=true;this.root.style.display='block';this._render();this.onVisibilityChange?.(true);return true;}
  hide(){if(!this.visible)return false;this.visible=false;this._selected='';this.root.style.display='none';this.onVisibilityChange?.(false);return true;}
  toggle(){return this.visible?this.hide():this.show();}
  destroy(){if(this._destroyed)return;this._destroyed=true;window.removeEventListener('keydown',this._key,true);this.root.remove();this.visible=false;}
}
export default MoveCustomWindow;
