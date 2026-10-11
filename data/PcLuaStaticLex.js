import { lua,lauxlib,core } from '../vendor/fengari-bitmap-0.1.4.mjs';
/** Static lexical gate for current-client Lua 5.2 authored data.
 * It never evaluates expressions or creates fallback rows. */
// Lua lexical mask: retain only executable tokens at their original offsets.
// Main's CharacterHelper loader invokes global SetHelper; text in strings or
// comments is not executable and must never publish a helper/model row.
function luaMask(input='',maskStrings=true) {
  const source=String(input??'');
  const chars=source.split('');
  const blank=(from,to)=>{for(let j=from;j<to;j++)if(chars[j]!=='\n'&&chars[j]!=='\r')chars[j]=' ';};
  const longOpen=(at)=>/^\[(=*)\[/.exec(source.slice(at));
  let i=0;
  while(i<source.length){
    const ch=source[i], next=source[i+1];
    if(ch==='-' && next==='-'){
      const opening=longOpen(i+2);
      if(opening){
        const close=']'+opening[1]+']';
        const from=i+2+opening[0].length;
        const at=source.indexOf(close,from);
        const end=at<0?source.length:at+close.length;
        blank(i,end);i=end;continue;
      }
      let end=source.indexOf('\n',i+2);
      if(end<0)end=source.length;
      blank(i,end);i=end;continue;
    }
    if(ch==='"'||ch==="'"){
      let j=i+1;
      while(j<source.length){
        if(source[j]==='\\'){j+=2;continue;}
        if(source[j++]===ch)break;
      }
      if(maskStrings)blank(i,Math.min(j,source.length));i=Math.min(j,source.length);continue;
    }
    if(ch==='['){
      const opening=longOpen(i);
      if(opening){
        const close=']'+opening[1]+']';
        const from=i+opening[0].length;
        const at=source.indexOf(close,from);
        const end=at<0?source.length:at+close.length;
        if(maskStrings)blank(i,end);i=end;continue;
      }
    }
    i++;
  }
  return chars.join('');
}
export function luaCodeMask(input){return luaMask(input,true);}
// Keep authored string tokens while excluding Lua comments. This is used only
// for conservative detection of computed _G["worldTime"] clock lookups;
// it does not execute or reinterpret Lua data.
export function luaCommentsMask(input){return luaMask(input,false);}
function luaCommentsOnly(input){return luaCommentsMask(input);}
export function splitArgsMasked(body='',mask='') {
  const out=[];let start=0,depth=0;
  for(let i=0;i<mask.length;i++){
    const c=mask[i];
    if(c==='('||c==='{'||c==='[')depth++;
    else if(c===')'||c==='}'||c===']')depth--;
    if(c===','&&depth===0){const raw=luaCommentsOnly(body.slice(start,i)).trim();out.push(/^(?:[\"']|\[=*\[)/.test(raw)?raw:mask.slice(start,i).trim());start=i+1;}
  }
  const tail=luaCommentsOnly(body.slice(start)).trim();if(tail)out.push(/^(?:[\"']|\[=*\[)/.test(tail)?tail:mask.slice(start).trim());
  return out;
}
export function scanLuaGlobalCalls(text,name){
  const code=luaCodeMask(text),out=[];
  let p=0;
  for(;;){
    p=code.indexOf(name,p);if(p<0)break;
    let b=p-1;while(b>=0 && /\s/.test(code[b]))b--;
    const before=p>0?code[p-1]:'';
    const methodPrefix=b>=0 && (code[b]==='.' || code[b]===':');
    const after=code[p+name.length]||'';
    // Only bare global calls own rows; methods and aliases are different Lua functions.
    if(/[A-Za-z0-9_]/.test(before)||methodPrefix||/[A-Za-z0-9_]/.test(after)){
      p+=name.length;continue;
    }
    let i=p+name.length;
    while(/\s/.test(code[i]||''))i++;
    if(code[i]!=='('){p=i;continue;}
    const start=++i;let depth=1;
    for(;i<code.length;i++){
      if(code[i]==='(')depth++;
      else if(code[i]===')'&&--depth===0)break;
    }
    if(depth===0)out.push(splitArgsMasked(text.slice(start,i),code.slice(start,i)));
    p=i+1;
  }
  return out;
}
// FIX131: read ONE Lua 5.2 string literal, not a greedy "first quote to last
// quote" regex.  In particular "A" .. "B" is an expression, not a model path.
// The production loader is strict about invalid Lua escapes.  The exported
// fixture parser defaults to compatibility for legacy test fixtures that used
// non-Lua single backslashes ("Player\\Pet" in JS source -> "Player\Pet").
export function parseLuaStringLiteral(v,{strictLuaStrings=false}={}){
  const s=String(v??'').trim();
  const longOpen=/^\[(=*)\[/.exec(s);
  if(longOpen){
    const close=']'+longOpen[1]+']',start=longOpen[0].length;
    const end=s.indexOf(close,start);
    if(end<0 || end+close.length!==s.length)return null;
    // Lua discards one initial newline immediately after the opening long bracket.
    return s.slice(start,end).replace(/^(?:\r\n|\n\r|\r|\n)/,'');
  }
  const quote=s[0];
  if(quote!=="'" && quote!=='"')return null;
  let out='',i=1;
  const escapes={a:'\x07',b:'\b',f:'\f',n:'\n',r:'\r',t:'\t',v:'\v','\\':'\\','"':'"',"'":"'"};
  while(i<s.length){
    const ch=s[i++];
    if(ch===quote)return i===s.length?out:null;
    if(ch==='\n'||ch==='\r')return null; // short strings cannot contain raw newlines
    if(ch!=='\\'){out+=ch;continue;}
    if(i>=s.length)return null;
    const esc=s[i++];
    if(Object.prototype.hasOwnProperty.call(escapes,esc)){out+=escapes[esc];continue;}
    if(esc==='\n'||esc==='\r'){
      if((esc==='\n'&&s[i]==='\r')||(esc==='\r'&&s[i]==='\n'))i++;
      out+='\n';continue;
    }
    if(esc==='z'){
      while(i<s.length && /[ \t\v\f\r\n]/.test(s[i]))i++;
      continue;
    }
    if(esc==='x'){
      const h=s.slice(i,i+2);
      if(!/^[0-9a-fA-F]{2}$/.test(h))return null;
      out+=String.fromCharCode(parseInt(h,16));i+=2;continue;
    }
    if(/[0-9]/.test(esc)){
      let digits=esc;
      while(digits.length<3 && i<s.length && /[0-9]/.test(s[i]))digits+=s[i++];
      const code=Number(digits);
      if(code>255)return null;
      out+=String.fromCharCode(code);continue;
    }
    if(strictLuaStrings)return null;
    // Historical synthetic fixtures are not valid Lua 5.2; retain their
    // literal path separator in fixture mode only. Never use in production.
    out+='\\'+esc;
  }
  return null;
}

// Compile-only gate: malformed Lua cannot publish a partial visual owner table.
// No script execution, guessed globals, or data fallbacks are involved.
export function assertPcLuaScriptCompiles(text,path='current-client.lua'){
  const L=lauxlib.luaL_newstate();
  try{
    if(lauxlib.luaL_loadbuffer(L,core.to_luastring(text),null,core.to_luastring(path))!==lua.LUA_OK){
      throw Error('Current-client Lua syntax: '+core.to_jsstring(lua.lua_tostring(L,-1)));
    }
  }finally{lua.lua_close(L);}
}
