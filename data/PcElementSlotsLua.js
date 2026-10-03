// PcElementSlotsLua.js — parser restrito do owner real ElementSlots.lua.
// Autoridade PC: ElementSlots.cpp registra SetElementSlot(stack,x,y,width,height,active,pet),
// executa Data/Configs/Lua/Configs/ElementSlots.lua e chama StartLoadElementSlots().
// O Data atual usa ELEMENT_SLOTS_CONFIG + loop sobre a tabela. Este parser NÃO
// inventa defaults ativos: só retorna linhas que o Lua realmente declara.

function stripLuaComments(input) {
  let s=String(input ?? '');
  // block comments used by the shipped ElementSlots.lua
  s=s.replace(/--\[\[[\s\S]*?\]\]/g,'');
  // line comments; quoted strings are irrelevant to the numeric owner table.
  s=s.replace(/--[^\r\n]*/g,'');
  return s;
}

function luaLiteral(token) {
  const t=String(token ?? '').trim();
  if (/^true$/i.test(t)) return 1;
  if (/^false$/i.test(t)) return 0;
  if (/^[+-]?0x[0-9a-f]+$/i.test(t)) return Number.parseInt(t,16);
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(t)) return Number(t);
  return NaN;
}

function balancedBlock(text, openIndex, open='{', close='}') {
  if (openIndex < 0 || text[openIndex] !== open) return null;
  let depth=0, quote=null, esc=false;
  for(let i=openIndex;i<text.length;i++){
    const c=text[i];
    if(quote){
      if(esc){esc=false;continue;}
      if(c==='\\'){esc=true;continue;}
      if(c===quote)quote=null;
      continue;
    }
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c===open)depth++;
    else if(c===close){
      depth--;
      if(depth===0)return {start:openIndex,end:i,text:text.slice(openIndex,i+1)};
      if(depth<0)return null;
    }
  }
  return null;
}

function parseDirectCalls(text, out) {
  const re=/\bSetElementSlot\s*\(([^)]*)\)/g;
  let m;
  while((m=re.exec(text))){
    const parts=m[1].split(',').map((x)=>luaLiteral(x));
    if(parts.length!==7 || parts.some((v)=>!Number.isFinite(v))) continue;
    const [index,x,y,width,height,active,pet]=parts.map(Number);
    if(!Number.isInteger(index)||index<0||index>3)continue;
    out.set(index,Object.freeze({index,x,y,width,height,active,pet}));
  }
}

function parseConfigTable(text, out) {
  const decl=/\bELEMENT_SLOTS_CONFIG\s*=\s*\{/g.exec(text);
  if(!decl)return;
  const open=text.indexOf('{',decl.index);
  const table=balancedBlock(text,open);
  if(!table)return;
  const body=table.text.slice(1,-1);
  let i=0;
  while(i<body.length){
    const rowOpen=body.indexOf('{',i); if(rowOpen<0)break;
    const row=balancedBlock(body,rowOpen); if(!row)break;
    const fields={};
    const re=/\b(index|x|y|width|height|active|pet)\s*=\s*([^,}\r\n]+)/gi;
    let m;
    while((m=re.exec(row.text))){
      const v=luaLiteral(m[2]);
      if(Number.isFinite(v))fields[m[1].toLowerCase()]=Number(v);
    }
    const keys=['index','x','y','width','height','active','pet'];
    if(keys.every((k)=>Number.isFinite(fields[k])) && Number.isInteger(fields.index) && fields.index>=0 && fields.index<=3){
      out.set(fields.index,Object.freeze({...fields}));
    }
    i=row.end+1;
  }
}

export function parsePcElementSlotsLua(input) {
  const text=stripLuaComments(input);
  const out=new Map();
  // Literal calls are valid Lua owner statements and take first pass.
  parseDirectCalls(text,out);
  // Current-client owner is table-driven. Require the exact StartLoadElementSlots
  // callback contract before consuming its table; otherwise fail closed.
  const fn=/\bfunction\s+StartLoadElementSlots\s*\([^)]*\)[\s\S]*?\bend\b/i.test(text);
  const call=/\bSetElementSlot\s*\(\s*(?:element|ELEMENT_SLOTS_CONFIG\s*\[[^\]]+\])\.(?:index|Index)\s*,/i.test(text);
  if(fn && call)parseConfigTable(text,out);
  if(!out.size)throw new Error('ElementSlots.lua: contrato StartLoadElementSlots/SetElementSlot não reconhecido');
  return out;
}
