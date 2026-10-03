// scenes/CharCreateScene.js — port UI de CCharMakeWin (CharMakeWin.cpp).
//
// Autoridade PC Main 5.2 limpa:
//   CCharMakeWin::Create/SetPosition/RenderControls
//   UIMng.cpp::CreateCharacterScene
// Geometria PC (owner 640/800 logical board preserved through MUVirtualViewport):
//   window 454x406 centered
//   input owner cha_id 346x38 @ (x, y+317), browser IME @ +78,+21
//   stat black alpha143 108x80 @ (x+346, y+24)
//   four authored class buttons cha_bt 108x26 @ (x+346, y+131+i*26)
//   OK 54x30 @ (x+346,y+325), CANCEL @ (x+400,y+325)
//   desc black alpha143 454x51 @ (x,y+355)
//
// R20: o preview 3D agora é um BMD REAL (Player.bmd + peças reais da classe)
// controlado por GameApp/CharacterPreview sobre o World75 real. Nenhuma malha,
// substituto 2D/3D sintético é criado. O recorte/scissor exato específico do
// RenderCreateCharacter PC ainda permanece um gate visual separado.

import { MUSprites } from '../ui/MUSprites.js';
import { attachMuVirtualBoard } from '../ui/MUVirtualViewport.js';

// Enum wire do servidor (CLASS_WIZARD=0, CLASS_KNIGHT=1, ...).
// Mantemos todos exportados para protocolo; a UI da source limpa posiciona
// somente os quatro primeiros owners (Wizard/Knight/Elf/Magic Gladiator).
export const CLASSES = [
  { id: 0, key: 'DW', name: 'Dark Wizard', stats: [18,18,15,30] },
  { id: 1, key: 'DK', name: 'Dark Knight', stats: [28,20,25,10] },
  { id: 2, key: 'ELF', name: 'Fairy Elf', stats: [22,25,20,15] },
  { id: 3, key: 'MG', name: 'Magic Gladiator', stats: [26,26,26,26] },
  { id: 4, key: 'DL', name: 'Dark Lord', stats: null, needsCard: 'darkLord' },
  { id: 5, key: 'SUM', name: 'Summoner', stats: null, needsCard: 'summoner' },
  { id: 6, key: 'RF', name: 'Rage Fighter', stats: null },
];

const DISPLAY_CLASSES = CLASSES.slice(0,4);
const STAT_LABELS = ['STR','AGI','VIT','ENE'];
const WIN_W=454, WIN_H=406;
const INPUT_W=346, INPUT_H=38;
const JOB_W=108, JOB_H=26;
const BTN_W=54, BTN_H=30;
const ALPHA_143=143/255;

function setFrame(el, frames, state) {
  if (!el || !frames?.length) return;
  const idx = state === 'selected' ? 3 : state === 'down' ? 2 : state === 'active' ? 1 : 0;
  const url = frames[Math.min(idx, frames.length-1)];
  if (url) el.style.backgroundImage=`url("${url}")`;
}

export default class CharCreateScene {
  constructor() {
    this._listeners={};
    this.el=null;
    this.selected=CLASSES[1]; // PC m_nSelJob=CLASS_KNIGHT
    this._keyHandler=null;
    this._jobButtons=[];
    this._pending=false;
  }

  on(ev,cb){(this._listeners[ev]=this._listeners[ev]||[]).push(cb);return this;}
  emit(ev,data){(this._listeners[ev]||[]).forEach((cb)=>cb(data));}

  async mount(container) {
    this.el=container;
    container.style.cssText += 'background:transparent;overflow:hidden;font-family:Arial,sans-serif;color:#fff;';
    this._viewport=attachMuVirtualBoard(container);
    const board=this._viewport.board;
    board.style.visibility='hidden';
    board.dataset.muOwner='CCharMakeWin';
    this.board=board;

    // UIMng.cpp centers 454x406 in the scene window. Web logical board=800x600.
    const x=Math.floor((800-WIN_W)/2), y=Math.floor((600-WIN_H)/2);
    this._origin={x,y};

    // Stat panel: CSprite 108x80 alpha143 black.
    this.statPanel=document.createElement('div');
    this.statPanel.dataset.mu='create-stats';
    this.statPanel.style.cssText=`position:absolute;left:${x+346}px;top:${y+24}px;width:108px;height:80px;`+
      `background:rgba(0,0,0,${ALPHA_143});font:12px Arial;color:#fff;box-sizing:border-box;padding:7px 10px;`;
    board.appendChild(this.statPanel);

    // Four PC-authored class buttons only. No icon/gradient/stat-bar placeholders.
    this.jobs=document.createElement('div');
    board.appendChild(this.jobs);
    for(let i=0;i<DISPLAY_CLASSES.length;i++){
      const cls=DISPLAY_CLASSES[i];
      const b=document.createElement('button');
      b.type='button'; b.dataset.mu='create-class'; b.dataset.classId=String(cls.id);
      b.textContent=cls.name;
      b.style.cssText=`position:absolute;left:${x+346}px;top:${y+131+i*JOB_H}px;width:${JOB_W}px;height:${JOB_H}px;`+
        'padding:0;border:0;background:transparent center/108px 26px no-repeat;color:#d8d8d8;'+
        'font:12px Arial;text-shadow:1px 1px #000;cursor:pointer;';
      b.onmouseenter=()=>setFrame(b,this._jobFrames,cls.id===this.selected.id?'selected':'active');
      b.onmouseleave=()=>setFrame(b,this._jobFrames,cls.id===this.selected.id?'selected':'up');
      b.onmousedown=()=>setFrame(b,this._jobFrames,'down');
      b.onmouseup=()=>setFrame(b,this._jobFrames,cls.id===this.selected.id?'selected':'active');
      b.onclick=()=>this._selectClass(cls);
      board.appendChild(b); this._jobButtons.push(b);
    }

    // Input owner BITMAP_LOG_IN == Interface/cha_id.tga in Character Scene.
    this.inputOwner=document.createElement('div');
    this.inputOwner.dataset.mu='create-input-owner';
    this.inputOwner.style.cssText=`position:absolute;left:${x}px;top:${y+317}px;width:${INPUT_W}px;height:${INPUT_H}px;`+
      `background:transparent center/346px 38px no-repeat;`;
    board.appendChild(this.inputOwner);
    this.nameInput=document.createElement('input');
    this.nameInput.maxLength=10; this.nameInput.dataset.mu='create-name';
    this.nameInput.autocomplete='off'; this.nameInput.spellcheck=false;
    // PC CUITextInputBox transparent, x=input+78, y=input+21, InputTextWidth=73.
    this.nameInput.style.cssText=`position:absolute;left:${x+78}px;top:${y+317+17}px;width:158px;height:18px;`+
      'box-sizing:border-box;border:0;outline:0;background:transparent;color:#fff;font:13px Arial;padding:0 2px;';
    board.appendChild(this.nameInput);

    // Description owner exists in PC but localized GlobalText[1705+class] is not
    // shipped as a decoded text owner here. Keep the exact authored vessel empty.
    this.descPanel=document.createElement('div');
    this.descPanel.dataset.mu='create-desc-owner';
    this.descPanel.style.cssText=`position:absolute;left:${x}px;top:${y+355}px;width:454px;height:51px;`+
      `background:rgba(0,0,0,${ALPHA_143});box-sizing:border-box;padding:10px;color:#fff;font:12px Arial;`;
    board.appendChild(this.descPanel);

    this.errEl=document.createElement('div');
    this.errEl.dataset.mu='create-error';
    this.errEl.style.cssText=`position:absolute;left:${x}px;top:${y+388}px;width:346px;height:16px;`+
      'color:#ff8080;font:11px Arial;text-align:center;pointer-events:none;';
    board.appendChild(this.errEl);

    this.createBtn=this._makePCButton('btnOk',x+346,y+325,'create-btn',()=>this._doCreate());
    this.cancelBtn=this._makePCButton('btnCancel',x+400,y+325,'create-cancel',()=>this.emit('cancel'));
    board.appendChild(this.createBtn); board.appendChild(this.cancelBtn);

    this._keyHandler=(e)=>{if(e.key==='Enter')this._doCreate();else if(e.key==='Escape')this.emit('cancel');};
    document.addEventListener('keydown',this._keyHandler);

    await MUSprites.load();
    this._jobFrames=MUSprites.frames('serverGroupBtn');
    const inputUrl=MUSprites.get('chaId');
    if(inputUrl)this.inputOwner.style.backgroundImage=`url("${inputUrl}")`;
    this._applyButtonFrames();
    this._selectClass(this.selected);
    board.style.visibility='visible';
    board.dataset.muFirstPaint='complete';
  }

  _makePCButton(spriteKey,left,top,dataMu,onClick){
    const b=document.createElement('button'); b.type='button'; b.dataset.mu=dataMu;
    b.style.cssText=`position:absolute;left:${left}px;top:${top}px;width:${BTN_W}px;height:${BTN_H}px;`+
      'padding:0;border:0;background:transparent center/54px 30px no-repeat;cursor:pointer;color:transparent;';
    b.onmouseenter=()=>setFrame(b,MUSprites.frames(spriteKey),'active');
    b.onmouseleave=()=>setFrame(b,MUSprites.frames(spriteKey),'up');
    b.onmousedown=()=>setFrame(b,MUSprites.frames(spriteKey),'down');
    b.onmouseup=()=>setFrame(b,MUSprites.frames(spriteKey),'active');
    b.onclick=onClick; b.dataset.spriteKey=spriteKey; return b;
  }

  _applyButtonFrames(){
    for(const b of [this.createBtn,this.cancelBtn]) setFrame(b,MUSprites.frames(b.dataset.spriteKey),'up');
    for(const b of this._jobButtons){
      const id=Number(b.dataset.classId); setFrame(b,this._jobFrames,id===this.selected.id?'selected':'up');
    }
  }

  show(params={}){
    this._cardEnable=params.cardEnable||null;
    setTimeout(()=>this.nameInput?.focus(),60);
  }
  hide(){}
  dispose(){
    if(this._keyHandler)document.removeEventListener('keydown',this._keyHandler);
    this._viewport?.dispose(); this._viewport=null;
  }
  update(){}

  _selectClass(cls){
    if(!DISPLAY_CLASSES.some((x)=>x.id===cls.id))return;
    this.selected=cls;
    this._applyButtonFrames();
    const vals=cls.stats||[];
    this.statPanel.innerHTML='';
    for(let i=0;i<4;i++){
      const row=document.createElement('div');
      row.style.cssText='height:17px;line-height:17px;white-space:nowrap;';
      row.innerHTML=`<span style="display:inline-block;width:54px;color:#fff">${STAT_LABELS[i]}</span>`+
        `<span style="color:#d99b32">${vals[i]??''}</span>`;
      this.statPanel.appendChild(row);
    }
    this.descPanel.textContent=''; // fail-closed until GlobalText owner is decoded
    // O GameApp troca o owner BMD real da classe. O primeiro evento de mount
    // pode ocorrer antes do wiring; GameApp também lê `selected` após switch.
    this.emit('class-selected',{classId:cls.id,className:cls.name});
  }

  getSelectedClassId(){ return Number(this.selected?.id ?? 1); }

  _doCreate(){
    if(this._pending)return;
    const name=(this.nameInput?.value||'').trim();
    if(!/^[a-zA-Z0-9]{4,10}$/.test(name)){
      this.errEl.textContent='Nome inválido (4-10 caracteres alfanuméricos).';
      this.nameInput?.focus(); return;
    }
    this.errEl.textContent='';
    this.emit('created',{name,classId:this.selected.id,className:this.selected.name});
  }

  showError(msg){this.setPending(false);this.errEl.textContent=msg||'Criação recusada pelo servidor.';}
  setPending(pending){
    this._pending=!!pending;
    if(this.createBtn){this.createBtn.disabled=this._pending;this.createBtn.style.opacity=this._pending?'0.55':'1';}
  }
}
