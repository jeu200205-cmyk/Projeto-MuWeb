// ui2/SkillBar.js — exact retained Main 5.2 CNewUISkillList owner.
// Authority: clean PC NewUIMainFrameWindow.cpp. The hot-skill strip loop is
// disabled (i < 0); only Hero->CurrentSkill and the authored list are visible.
import { loadSkillIconSheets, drawSkillIcon } from './SkillIcons.js';
import { RemoteAssets } from '../data/RemoteAssets.js';
import { AT_SKILL } from '../data/SkillNames.js';

const PC_W=640, PC_H=480, WEB_SCALE=1.25;
const ICON_W=20, ICON_H=28, LIST_COLUMNS=10, LIST_VISIBLE=20;
const CELL_W=24, CELL_H=29.5;
const CURRENT_X=310.5, CURRENT_Y=448;
const LIST_X=191.3, LIST_Y=350, LIST_W=243.5, LIST_H=60;
const ASSETS=Object.freeze({
  list:'Custom/NewInterface/skill_render.ozt',
  selected:'Custom/NewInterface/Main_Skillbox.ozt',
});

async function imageAsset(path){let image=await RemoteAssets.fetchDecodedImage(path).catch(()=>null);if(!image)image=await RemoteAssets.fetchDecodedImage(path).catch(()=>null);return image;}
function element(tag,css=''){const node=document.createElement(tag);node.style.cssText=css;return node;}

export class SkillBar {
  constructor(opts={}){
    this.slots=new Array(LIST_VISIBLE).fill(null);
    this.cooldowns=new Array(LIST_VISIBLE).fill(0);
    this.selected=-1;
    this.onUse=opts.onUse||(()=>{});
    this.onSelect=opts.onSelect||(()=>{});
    this.getMp=opts.getMp||(()=>Infinity);
    this.checkAttack=opts.checkAttack||(()=>true);
    this._destroyed=false;
    this._autoReveal=opts.autoReveal!==false;
    this._parent=opts.parent||document.body;
    this._ready=false;
    this._listOpen=false;

    this.root=element('div','position:absolute;inset:0;z-index:603;visibility:hidden;user-select:none;pointer-events:none;');
    this.root.id='mu-pc-skill-owner';
    this.root.dataset.muPcOwner='CNewUIMainFrameWindow::RenderSkill::CNewUISkillList';
    this._parent.appendChild(this.root);
    this.pcLayer=element('div',`position:absolute;left:0;top:0;width:${PC_W}px;height:${PC_H}px;transform:scale(${WEB_SCALE});transform-origin:0 0;pointer-events:none;`);
    this.root.appendChild(this.pcLayer);

    // PC UpdateMouseEvent: 310,447.05,20x28. Render: 310.5,448,20x28.
    this.currentCell=element('button',`position:absolute;left:${CURRENT_X}px;top:${CURRENT_Y}px;width:${ICON_W}px;height:${ICON_H}px;padding:0;border:0;background:transparent;pointer-events:auto;cursor:pointer;overflow:hidden;`);
    this.currentCell.type='button';
    this.currentCell.dataset.muPcCurrentSkill='true';
    this.currentIcon=element('canvas',`display:block;width:${ICON_W}px;height:${ICON_H}px;pointer-events:none;`);
    this.currentIcon.width=ICON_W;this.currentIcon.height=ICON_H;
    this.currentCtx=this.currentIcon.getContext('2d');
    this.currentCell.appendChild(this.currentIcon);
    this.currentDelay=element('div','position:absolute;left:0;bottom:0;width:20px;height:0;background:rgba(255,128,128,0.5);pointer-events:none;display:none;');
    this.currentDelay.dataset.muPcSkillDelay='current';
    this.currentCell.appendChild(this.currentDelay);
    this.currentCell.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();if(this._ready&&this._hasSkills())this._setListOpen(!this._listOpen);});
    this.pcLayer.appendChild(this.currentCell);

    // One clean-PC list owner. R48's eight repeated Main_Skillbox frames were not
    // present in the retained client and are deliberately removed.
    this.listRoot=element('div',`position:absolute;left:${LIST_X}px;top:${LIST_Y}px;width:${LIST_W}px;height:${LIST_H+3}px;display:none;background-repeat:no-repeat;background-position:0 0;background-size:${LIST_W}px ${LIST_H}px;pointer-events:auto;overflow:visible;`);
    this.listRoot.dataset.muPcSkillList='true';
    this.pcLayer.appendChild(this.listRoot);
    this.slotEls=[];
    for(let i=0;i<LIST_VISIBLE;i++){
      const row=Math.floor(i/LIST_COLUMNS),col=i%LIST_COLUMNS;
      // Source begins cells at 191,349, then +24 X and +29.5 for row two.
      const cell=element('button',`position:absolute;left:${-0.3+col*CELL_W}px;top:${-1+row*CELL_H}px;width:${CELL_W}px;height:${CELL_H}px;padding:0;border:0;background:transparent;pointer-events:auto;cursor:pointer;overflow:visible;`);
      cell.type='button';cell.dataset.muPcSkillCell=String(i);
      const selected=element('div','position:absolute;left:4px;top:4px;width:20px;height:24px;display:none;pointer-events:none;background-repeat:no-repeat;');
      const icon=element('canvas',`position:absolute;left:6px;top:6px;width:${ICON_W}px;height:${ICON_H}px;pointer-events:none;`);
      icon.width=ICON_W;icon.height=ICON_H;
      const delay=element('div','position:absolute;left:6px;bottom:1.5px;width:20px;height:0;background:rgba(255,128,128,0.5);pointer-events:none;display:none;');
      delay.dataset.muPcSkillDelay=String(i);
      cell.append(selected,icon,delay);
      cell.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();if(this.slots[i])this.select(i);});
      this.listRoot.appendChild(cell);
      this.slotEls.push({cell,selected,icon,delay,iconCtx:icon.getContext('2d')});
    }

    this._assetsReady=Promise.all([imageAsset(ASSETS.list),imageAsset(ASSETS.selected)]).then(([list,selected])=>{
      if(this._destroyed||!list||!selected){console.warn('[UI PC] CNewUISkillList owner incompleto (skill_render/Main_Skillbox) — placeholder DESATIVADO.');return false;}
      this.listRoot.style.backgroundImage=`url("${list.url}")`;
      // Exact selected-cell UV from the PC RenderBitmap call.
      const bgW=20/0.6397998333,bgH=24/0.4179990888;
      for(const slot of this.slotEls){
        slot.selected.style.backgroundImage=`url("${selected.url}")`;
        slot.selected.style.backgroundSize=`${bgW}px ${bgH}px`;
        slot.selected.style.backgroundPosition=`${-0.1600000411*bgW}px ${-0.1000000089*bgH}px`;
      }
      this._ready=true;this._renderAll();if(this._autoReveal)this.reveal();return true;
    });
    // R30: join skill-sheet decode into atomic world-UI first paint. The R49
    // owner changes geometry, not the requirement that artwork is complete.
    this._sheetsReady=loadSkillIconSheets().then((sheets)=>{if(this._destroyed)return false;this._sheets=sheets;this._renderAll();return true;}).catch(()=>{this._sheets=null;return false;});
    if(opts.skills)opts.skills.forEach((skill,i)=>i<LIST_VISIBLE&&this.assign(i,skill));
  }

  _hasSkills(){return this.slots.some(Boolean);}
  _setListOpen(open){this._listOpen=Boolean(open&&this._hasSkills());this.listRoot.style.display=this._listOpen?'block':'none';}
  clear(){this.slots.fill(null);this.cooldowns.fill(0);this.selected=-1;this._setListOpen(false);this._renderAll();this._renderDelays(performance.now());}
  assign(i,skill){
    if(!Number.isInteger(i)||i<0||i>=LIST_VISIBLE)return;
    this.slots[i]=skill||null;
    if(!skill&&this.selected===i)this.selected=this.slots.findIndex(Boolean);
    if(skill&&this.selected<0)this.selected=i;
    this._renderSlot(i);this._renderCurrent();this._renderSelection();
  }
  _draw(ctx,skill){ctx.clearRect(0,0,ICON_W,ICON_H);if(!skill)return;drawSkillIcon(ctx,this._sheets,skill.skillType,{magicIcon:skill.magicIcon,skillUseType:skill.skillUseType,destWidth:ICON_W,destHeight:ICON_H});}
  _renderSlot(i){const slot=this.slotEls[i];if(!slot)return;this._draw(slot.iconCtx,this.slots[i]);slot.cell.style.display=this.slots[i]?'block':'none';}
  _renderCurrent(){this._draw(this.currentCtx,this.slots[this.selected]||null);this.currentCell.style.display=this._hasSkills()?'block':'none';}
  _renderSelection(){this.slotEls.forEach((slot,i)=>{slot.selected.style.display=(this.slots[i]&&i===this.selected)?'block':'none';});}
  _renderAll(){for(let i=0;i<LIST_VISIBLE;i++)this._renderSlot(i);this._renderCurrent();this._renderSelection();this._renderDelays(performance.now());}
  select(i){if(!Number.isInteger(i)||i<0||i>=LIST_VISIBLE||!this.slots[i])return false;this.selected=i;this._renderCurrent();this._renderSelection();this._setListOpen(false);this.onSelect(this.slots[i],i);return true;}
  // Gameplay may explicitly invoke use(); list clicks only select, as in PC.
  use(i=this.selected,context=null){const skill=this.slots[i];if(!skill)return false;const now=performance.now();if(now<this.cooldowns[i])return false;if(skill.mpCost&&this.getMp()<skill.mpCost)return false;const accepted=this.onUse(skill,i,context);if(accepted===false)return false;this.cooldowns[i]=now+(skill.cooldown||0);this._renderDelays(now);return true;}
  _delayFraction(i,now){
    const skill=this.slots[i];if(!skill)return 0;
    const type=Number(skill.skillType);
    // PC NewUIMainFrameWindow.cpp skips these two permanent-buff skills.
    if(type===AT_SKILL.INFINITY_ARROW||type===AT_SKILL.SWELL_OF_MAGICPOWER)return 0;
    // Fenrir Plasma Storm delay is drawn only while CheckAttack() accepts it.
    if(type===AT_SKILL.PLASMA_STORM_FENRIR&&!this.checkAttack())return 0;
    const max=Math.max(0,Number(skill.cooldown)||0);if(max<=0)return 0;
    const remaining=Math.max(0,(Number(this.cooldowns[i])||0)-now);
    return Math.min(1,remaining/max);
  }
  _applyDelay(el,fraction,height){
    if(!el)return;const h=Math.max(0,height*fraction);
    el.style.height=`${h}px`;el.style.display=h>0?'block':'none';
  }
  _renderDelays(now=performance.now()){
    for(let i=0;i<LIST_VISIBLE;i++)this._applyDelay(this.slotEls[i]?.delay,this._delayFraction(i,now),ICON_H);
    const i=this.selected;this._applyDelay(this.currentDelay,Number.isInteger(i)&&i>=0?this._delayFraction(i,now):0,ICON_H);
  }
  update(){
    // Exact Main 5.2 RenderSkillDelay: translucent (1,.5,.5,.5) rectangle grows
    // from the icon bottom with SkillDelay/SkillAttribute.Delay. No radial wedge.
    this._renderDelays(performance.now());
  }
  ready(){return Promise.all([this._assetsReady,this._sheetsReady]).then(([ownerReady,sheetsReady])=>Boolean(ownerReady&&sheetsReady&&this._ready));}
  reveal(){if(this._ready&&!this._destroyed)this.root.style.visibility='visible';}
  hide(){this.root.style.visibility='hidden';this._setListOpen(false);}
  destroy(){this._destroyed=true;this.root.remove();}
}
