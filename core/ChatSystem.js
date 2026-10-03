import { Input } from './Input.js';
import { RemoteAssets } from '../data/RemoteAssets.js';

// Clean Main 5.2 owners (NewUIChatInputBox.cpp / NewUIChatLogWindow.cpp).
const CHAT_ATLAS = 'Custom/NewInterface/main_frame_chat_button.ozt';
const PC = Object.freeze({
    w: 640, h: 480, scale: 1.25,
    wndX: 0, wndY: 415,
    logHeight: 100, lineH: 15, showLines: 6,
    inputX: 252, inputY: 417, inputW: 176, inputH: 14,
    whisperX: 382, whisperY: 417, whisperW: 50, whisperH: 14,
    frameX: 254, frameY: 415,
    menuToggleX: 492, menuToggleY: 415,
});

async function loadImage(path) {
    let image = await RemoteAssets.fetchDecodedImage(path).catch(() => null);
    if (!image) image = await RemoteAssets.fetchDecodedImage(path).catch(() => null);
    return image;
}


/** CNewUIChatLogWindow + CNewUIChatInputBox browser adapter. */
export class ChatSystem {
    constructor(maxMessages = 50, opts = {}) {
        if (typeof maxMessages === 'object') { opts = maxMessages; maxMessages = opts.maxMessages || 50; }
        this.messages = [];
        this.maxMessages = maxMessages;
        this.parent = opts.parent || document.body;
        this.autoReveal = opts.autoReveal !== false;
        this.onSend = typeof opts.onSend === 'function' ? opts.onSend : null;
        this.onWhisper = typeof opts.onWhisper === 'function' ? opts.onWhisper : null;
        this.getLocalSender = typeof opts.getLocalSender === 'function' ? opts.getLocalSender : (() => '');
        this._pendingLocalEcho = [];
        this.whisperSend = true; // clean owner Init(): m_bWhisperSend=true
        this.mode = 'normal';
        this._ready = false;
        this._destroyed = false;
        this._inputOpen = false;
        this._buildUI();
        this._bindEvents();
        this._loadPromise = this._loadOwnerAssets();
    }

    _buildUI() {
        this.container = document.createElement('div');
        this.container.id = 'chat-system';
        this.container.dataset.muPcOwner = 'CNewUIChatLogWindow+CNewUIChatInputBox';
        this.container.dataset.muPcSpace = '640x480';
        this.container.style.cssText = 'position:absolute;left:0;top:0;width:640px;height:480px;transform:scale(1.25);transform-origin:0 0;z-index:620;visibility:hidden;pointer-events:none;font-family:Arial,sans-serif;';

        // CNewUIChatLogWindow::Create(..., 0, setPosDown(415), 6).
        this.logDiv = document.createElement('div');
        this.logDiv.id = 'chat-log';
        this.logDiv.style.cssText = `position:absolute;left:4px;top:${PC.wndY-PC.logHeight+7}px;width:245px;height:90px;overflow:hidden;font-size:12px;line-height:${PC.lineH}px;color:rgb(205,220,239);text-shadow:1px 1px 1px #000;pointer-events:none;`;

        // CNewUIChatInputBox::RenderFrame uses two source-authored RenderColor
        // rectangles. These are PC geometry, not a Web placeholder card.
        this.inputShell = document.createElement('div');
        this.inputShell.dataset.muPcOwner = 'CNewUIChatInputBox::RenderFrame';
        this.inputShell.style.cssText = 'position:absolute;inset:0;display:none;pointer-events:none;';
        const chatBg = document.createElement('div');
        chatBg.style.cssText = `position:absolute;left:${PC.frameX}px;top:${PC.frameY}px;width:184px;height:16px;background:rgba(0,0,0,.8);`;
        const whisperBg = document.createElement('div');
        whisperBg.style.cssText = `position:absolute;left:${PC.frameX+188}px;top:${PC.frameY}px;width:46px;height:16px;background:rgba(0,0,0,.8);`;
        this.inputShell.append(chatBg, whisperBg);

        this.input = document.createElement('input');
        this.input.type = 'text'; this.input.maxLength = 120; this.input.setAttribute('aria-label', 'MU chat');
        this.input.dataset.muFunctionalAdapter = 'CUITextInputBox-IME-adapter';
        this.input.style.cssText = `position:absolute;left:${PC.inputX}px;top:${PC.inputY}px;width:${PC.inputW}px;height:${PC.inputH}px;box-sizing:border-box;padding:0;background:rgba(0,0,0,.10);border:0;color:rgba(255,255,230,.82);font:12px Arial,sans-serif;outline:none;pointer-events:auto;`;
        this.whisperInput = document.createElement('input');
        this.whisperInput.type = 'text'; this.whisperInput.maxLength = 10; this.whisperInput.setAttribute('aria-label', 'MU whisper ID');
        this.whisperInput.style.cssText = `position:absolute;left:${PC.whisperX}px;top:${PC.whisperY}px;width:${PC.whisperW}px;height:${PC.whisperH}px;box-sizing:border-box;padding:0;background:rgba(0,0,0,.10);border:0;color:rgba(255,200,200,.78);font:12px Arial,sans-serif;outline:none;pointer-events:auto;display:none;`;
        this.inputShell.append(this.input, this.whisperInput);

        this.menuToggle = document.createElement('button');
        this.menuToggle.type='button'; this.menuToggle.title='Chat mode';
        this.menuToggle.style.cssText=`position:absolute;left:${PC.menuToggleX}px;top:${PC.menuToggleY}px;width:16px;height:16px;padding:0;border:0;background:transparent;pointer-events:auto;cursor:pointer;`;
        this.menuToggleCanvas=document.createElement('canvas'); this.menuToggleCanvas.width=16;this.menuToggleCanvas.height=16;
        this.menuToggle.appendChild(this.menuToggleCanvas); this.inputShell.appendChild(this.menuToggle);

        this.modeMenu=document.createElement('div');
        this.modeMenu.style.cssText='position:absolute;inset:0;display:none;pointer-events:none;';
        this.inputShell.appendChild(this.modeMenu);
        this.modeButtons=new Map();
        const entries=[['normal',0,399],['system',1,381],['party',5,345],['guild',6,327]];
        for(const [mode,index,y] of entries){
            const b=document.createElement('button'); b.type='button'; b.title=mode; b.dataset.mode=mode;
            b.style.cssText=`position:absolute;left:510px;top:${y}px;width:40px;height:16px;padding:0;border:0;background:transparent;pointer-events:auto;cursor:pointer;`;
            const c=document.createElement('canvas');c.width=40;c.height=16;b.appendChild(c);b._canvas=c;b._atlasIndex=index;
            b.addEventListener('click',(e)=>{e.preventDefault();e.stopPropagation();this.mode=mode;this._drawModeButtons();this._showModeMenu(false);});
            this.modeMenu.appendChild(b);this.modeButtons.set(mode,b);
        }

        this.container.append(this.logDiv,this.inputShell);
        this.parent.appendChild(this.container);
    }

    async _loadOwnerAssets(){
        const atlas=await loadImage(CHAT_ATLAS);
        if(this._destroyed)return false;
        this._atlas=atlas;
        if(!this._atlas){console.warn('[UI PC] ChatInput atlas real ausente — chat owner fail-closed.');return false;}
        this._ready=true;this._drawToggle(0);this._drawModeButtons();
        if(this.autoReveal)this.reveal();
        console.info('[UI PC] CNewUIChatInputBox atlas/geometry exatos ativos (640x480 owner).');
        return true;
    }

    _drawCrop(canvas,su,sv,sw,sh){
        if(!this._atlas?.image||!canvas)return;
        const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(this._atlas.image,su,sv,sw,sh,0,0,canvas.width,canvas.height);
    }
    _drawToggle(state){
        // RenderButtonProcess: sv=78 UP, 40 hover, 2 down; source 34x34.
        this._drawCrop(this.menuToggleCanvas,646,state===2?2:(state===1?40:78),34,34);
    }
    _drawModeButtons(){
        for(const [mode,b] of this.modeButtons){
            // RenderButtonProcess(msg): sv=38 normal, 76 active; source 88.5x34.
            const sv=mode===this.mode?76:38;this._drawCrop(b._canvas,2+b._atlasIndex*92,sv,88.5,34);
        }
    }
    _showModeMenu(show){this.modeMenu.style.display=show?'block':'none';}

    ready(){return this._loadPromise;}
    reveal(){if(this._ready&&!this._destroyed)this.container.style.visibility='visible';}
    hide(){this.container.style.visibility='hidden';this._closeInput();}
    toggle(){if(!this._ready)return;this._inputOpen?this._closeInput():this._openInput();}
    _openInput(){if(!this._ready)return;this._inputOpen=true;this.inputShell.style.display='block';queueMicrotask(()=>this.input.focus());}
    _closeInput(){this._inputOpen=false;this.inputShell.style.display='none';this._showModeMenu(false);this.input.blur();this.whisperInput.blur();}

    _bindEvents(){
        this.menuToggle.addEventListener('mouseenter',()=>this._drawToggle(1));
        this.menuToggle.addEventListener('mouseleave',()=>this._drawToggle(0));
        this.menuToggle.addEventListener('mousedown',()=>this._drawToggle(2));
        this.menuToggle.addEventListener('mouseup',()=>{this._drawToggle(1);this._showModeMenu(this.modeMenu.style.display==='none');});
        const send=()=>{const text=this.input.value.trim();if(!text)return;const target=this.whisperInput.value.trim();if(this.whisperSend&&target)this.sendWhisper(target,text);else this.sendMessage(text);this.input.value='';this._closeInput();};
        this.input.addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();send();}else if(e.key==='Escape'){e.preventDefault();this._closeInput();}e.stopPropagation();});
        for(const ev of ['keyup','keypress'])this.input.addEventListener(ev,e=>e.stopPropagation());
        this.whisperInput.addEventListener('keydown',(e)=>e.stopPropagation());
        this._windowKey=(e)=>{
            if(e.key==='F3'&&!e.repeat){
                e.preventDefault();
                this.whisperSend=!this.whisperSend;
                this.whisperInput.style.display=this.whisperSend?'block':'none';
                if(this._inputOpen){(this.whisperSend?this.whisperInput:this.input).focus();}
                return;
            }
            if(e.key==='Enter'&&!e.repeat&&document.activeElement!==this.input&&document.activeElement!==this.whisperInput){e.preventDefault();this._openInput();}
        };
        window.addEventListener('keydown',this._windowKey);
    }

    sendMessage(text){
        const plain=String(text||'');
        const isCommand=plain.startsWith('/');
        const prefix=this.mode==='party'?'~':this.mode==='guild'?'@':'';
        const wire=isCommand?plain:prefix+plain;
        if(!wire)return false;
        if(!this.onSend){console.warn('[Chat] transporte GS ausente — mensagem não enviada.');return false;}
        const ok=this.onSend(wire,this.mode) !== false;
        // GS builds are not required to echo the sender's own normal chat.  The
        // desktop client still shows what the user sent.  Echo only after the
        // real transport accepted it; commands remain server-owned.
        if(ok&&!isCommand){
            const sender=String(this.getLocalSender?.()||'').trim();
            if(sender){
                const now=performance.now();
                this._pendingLocalEcho=this._pendingLocalEcho.filter((v)=>now-v.at<3000);
                this._pendingLocalEcho.push({sender,text:plain,kind:this.mode,at:now});
                const localColors={normal:'#cddcef',party:'#001018',guild:'#001008',system:'#66ff99'};
                this._addChat(sender,plain,localColors[this.mode]||localColors.normal,this.mode);
            }
        }
        return ok;
    }

    sendWhisper(target,text){
        const id=String(target||'').trim().slice(0,10), msg=String(text||'');
        if(!id||!msg)return false;
        if(!this.onWhisper){console.warn('[Chat] transporte whisper GS ausente — mensagem não enviada.');return false;}
        const ok=this.onWhisper(id,msg)!==false;
        if(ok)this._addChat('Eu',msg,'#ffc8c8','whisper');
        return ok;
    }

    setWhisperTarget(id){
        this.whisperInput.value=String(id||'').slice(0,10);
        this.whisperSend=true;this.whisperInput.style.display='block';
    }

    receiveMessage(sender,text,color=null,kind='normal'){
        const colors={normal:'#cddcef',party:'#001018',guild:'#001008',union:'#101000',gens:'#102000',gm:'#fac832',system:'#66ff99',whisper:'#ffc8c8'};
        const now=performance.now(),s=String(sender||''),t=String(text||'');
        const hit=this._pendingLocalEcho.findIndex((v)=>now-v.at<3000&&v.sender===s&&v.text===t);
        if(hit>=0){this._pendingLocalEcho.splice(hit,1);return;}
        this._pendingLocalEcho=this._pendingLocalEcho.filter((v)=>now-v.at<3000);
        this._addChat(sender,text,color||colors[kind]||colors.normal,kind);
    }
    _addChat(sender,text,color,kind='normal'){
        const line=document.createElement('div');line.dataset.kind=kind;
        line.style.cssText=`height:${PC.lineH}px;overflow:hidden;white-space:nowrap;color:${color};`;
        line.textContent=sender?`${sender} : ${text}`:String(text);
        this.logDiv.appendChild(line);this.messages.push(line);
        while(this.messages.length>this.maxMessages)this.messages.shift().remove();
        while(this.logDiv.children.length>PC.showLines)this.logDiv.firstElementChild?.remove();
    }
    _addSystem(text){this._addChat('',text,'#66ff99','system');}
    destroy(){this._destroyed=true;this._ready=false;if(this._windowKey)window.removeEventListener('keydown',this._windowKey);this.container?.remove();}
}
