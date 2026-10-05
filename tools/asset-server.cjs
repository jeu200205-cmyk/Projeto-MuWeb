// MUWEB R56.2 local Data asset server with root identity lock.
// Resolves the current client's original source extensions (.tga/.jpg/.bmp)
// and compiled MU extensions (.ozt/.ozj/.ozb) without inventing assets.
// Usage: node tools/asset-server.cjs "E:\\...\\Data" 9100
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT=path.resolve(process.argv[2]||'');
const PORT=Number(process.argv[3]||9100);
const AUTHORITY_REVISION=String(process.argv[4]||'').trim() || require('crypto').createHash('sha256').update(path.resolve(process.argv[2]||'')).digest('hex');
if(!ROOT || !fs.existsSync(ROOT)){ console.error('[ASSETS] Data root inexistente:',ROOT); process.exitCode=2; return; }
const TYPES={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.bmp':'image/bmp','.tga':'application/octet-stream','.ozt':'application/octet-stream','.ozj':'application/octet-stream','.ozb':'application/octet-stream','.bmd':'application/octet-stream','.obj':'application/octet-stream','.att':'application/octet-stream','.map':'application/octet-stream','.wav':'audio/wav','.mp3':'audio/mpeg'};
function clean(u){try{return decodeURIComponent((u||'/').split('?')[0]);}catch{return '/';}}
function normRel(s){return String(s||'').replace(/\\/g,'/').replace(/^\/+/, '');}
function safeFull(rel){const full=path.resolve(ROOT,...normRel(rel).split('/'));if(full!==ROOT && !full.startsWith(ROOT+path.sep))return null;return full;}
function isFile(p){try{return fs.statSync(p).isFile();}catch{return false;}}

// Build one lightweight index once. The user's physical Data currently has ~22k
// assets, so this is cheap compared with loading a world and prevents repeated
// filesystem walks for every texture request.
const exactIndex=new Map();
const basenameIndex=new Map();
const indexedRelativeFiles=[]; // R89: browser manifest of the selected live Data root.
let indexedFiles=0;
(function buildIndex(){
  const stack=[ROOT];
  while(stack.length){
    const d=stack.pop();let ents=[];try{ents=fs.readdirSync(d,{withFileTypes:true});}catch{continue;}
    for(const e of ents){
      const p=path.join(d,e.name);
      if(e.isDirectory()){stack.push(p);continue;}
      if(!e.isFile())continue;
      indexedFiles++;
      const rel=normRel(path.relative(ROOT,p));
      exactIndex.set(rel.toLowerCase(),p);
      indexedRelativeFiles.push(rel);
      const b=e.name.toLowerCase();
      const prev=basenameIndex.get(b);
      if(prev===undefined)basenameIndex.set(b,p); else if(prev!==p)basenameIndex.set(b,null); // ambiguous basename: never guess
    }
  }
})();

const EXPLICIT_ALIASES=new Map([
  ['local/eng/item_eng.bmd',['Local/Eng/Item_Eng.bmd','Local/Eng/2item_eng.bmd','Local/Eng/orgn-item_eng.bmd','Local/Eng/--item_eng.bmd','Local/Por/item_por.bmd']],
  ['custom/newinterface/fonttest.ozt',['Custom/NewInterface/fonttest.tga','Interface/FontTest.OZT','Interface/FontTest.tga']],
]);
function extVariants(rel){
  const ext=path.extname(rel).toLowerCase(), base=rel.slice(0,-ext.length), out=[];
  if(ext==='.ozt')out.push(base+'.tga',base+'.TGA');
  else if(ext==='.ozj')out.push(base+'.jpg',base+'.JPG',base+'.jpeg',base+'.JPEG');
  else if(ext==='.ozb')out.push(base+'.bmp',base+'.BMP');
  else if(ext==='.tga')out.push(base+'.ozt',base+'.OZT');
  else if(ext==='.jpg'||ext==='.jpeg')out.push(base+'.ozj',base+'.OZJ');
  else if(ext==='.bmp')out.push(base+'.ozb',base+'.OZB');
  return out;
}
function resolveAsset(rel){
  rel=normRel(rel); if(!rel)return null;
  let p=exactIndex.get(rel.toLowerCase()); if(p)return {path:p,mode:'exact'};
  for(const a of EXPLICIT_ALIASES.get(rel.toLowerCase())||[]){p=exactIndex.get(normRel(a).toLowerCase());if(p)return {path:p,mode:'alias'};}
  for(const v of extVariants(rel)){p=exactIndex.get(normRel(v).toLowerCase());if(p)return {path:p,mode:'source-ext'};}
  // Last safe rescue: same basename only if unique in the entire Data tree.
  const b=path.basename(rel).toLowerCase(); p=basenameIndex.get(b); if(p)return {path:p,mode:'unique-basename'};
  for(const v of extVariants(rel)){p=basenameIndex.get(path.basename(v).toLowerCase());if(p)return {path:p,mode:'unique-source-ext'};}
  return null;
}

const server=http.createServer((req,res)=>{
  const rel=clean(req.url).replace(/^\/+/, '');
  if(!rel){res.writeHead(200,{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8','X-MU-Asset-Root':ROOT,'X-MU-Asset-Index':String(indexedFiles)});return res.end('MUWEB ASSET SERVER R56.2\n');}
  if(rel==='__muweb_asset_root'){res.writeHead(200,{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify({revision:'FIX44-live-root',root:ROOT,indexedFiles,authorityRevision:AUTHORITY_REVISION})+'\n');}
  if(rel==='__muweb_asset_manifest.json'){
    // Exact case-preserving inventory of the Data root selected by start-r89.
    // No synthesized aliases are published here; resolution remains fail-closed.
    const body=JSON.stringify({revision:'FIX44-live-root',authorityRevision:AUTHORITY_REVISION,total:indexedRelativeFiles.length,files:indexedRelativeFiles});
    res.writeHead(200,{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body)});
    return req.method==='HEAD'?res.end():res.end(body);
  }
  const direct=safeFull(rel); if(!direct){res.writeHead(403);return res.end('Forbidden');}
  const resolved=resolveAsset(rel);
  if(!resolved){res.writeHead(404,{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});return res.end('Not found');}
  const full=resolved.path; let st;try{st=fs.statSync(full);}catch{st=null;}
  if(!st?.isFile()){res.writeHead(404,{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});return res.end('Not found');}
  const h={'Access-Control-Allow-Origin':'*','Cache-Control':'no-store','Content-Type':TYPES[path.extname(full).toLowerCase()]||'application/octet-stream','Content-Length':st.size,'X-MU-Asset-Root':ROOT,'X-MU-Asset-Resolved':normRel(path.relative(ROOT,full)),'X-MU-Asset-Resolve-Mode':resolved.mode};
  if(req.method==='HEAD'){res.writeHead(200,h);return res.end();}
  res.writeHead(200,h);fs.createReadStream(full).pipe(res);
});
server.on('error',e=>{console.error(`[ASSETS] erro porta ${PORT}:`,e.message);process.exitCode=1;});
server.listen(PORT,'127.0.0.1',()=>{console.log(`[ASSETS R56.2] root: ${ROOT}`);console.log(`[ASSETS R56.2] index: ${indexedFiles} files`);console.log(`[ASSETS R56.2] http://127.0.0.1:${PORT}/`);});

module.exports={ROOT,PORT,resolveAsset,extVariants};
