// MUWEB R90 — Physical render / map / inventory recovery.
// Direct base: canonical MUWEB R88 FULL; retains R88 protocol/skills/item-owner gates.
// R90 retains the R89 physical recovery and closes additional runtime P0 failures: invalid skinning shader, stock Player armour ownership,
// inventory runtime crash, same-WorldN MoveCustom staging race and hidden animated scene traversal.
// Direct base: canonical MUWEB R88 FULL. Earlier physical map/inventory/equipment/camera fixes retained.
// Implementation authority remains the user-supplied clean PC Main 5.2 source.zip;
// B101 is secondary for engine/performance only. Public/GitHub sources are not authority.
// Official MuPromax 1.0.1 Data lock.
// Retains R76 visual/particle/BlendMesh owners and adds no simulated production game data.
// Goal: never silently bind this Web build to a different MU Data tree.
// The R55 physical log proved that a generic "valid Data" can still contain
// World75 while missing the current-client MainFrame/C/I/item owners and even a
// different World1 EncTerrain. R90 scores every candidate while preserving the retained physical
// client-data profile before opening the browser.
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TOOLS = path.join(ROOT, 'tools');
const DATA_ROOT_FILE = path.join(ROOT, '.muweb-data-root-r90');
const OFFICIAL_CLIENT_ROOT = 'C:\\clientepromax\\Nova pasta\\MuPromax 1.0.1';
const OFFICIAL_DATA_ROOT = path.join(OFFICIAL_CLIENT_ROOT, 'Data');
// USER AUTHORITY LOCK: do not allow remembered/env/discovered Data trees to override this client.
// If this exact path is unavailable, boot must fail instead of binding another MU client.
const EXPECTED_WORLD1_OBJECT_COUNT = 2987; // retained physical client capture
const EXPECTED_ITEM_ATTR_STRIDE = 84;       // retained physical client: 8192 records, stride 84
const EXPECTED_ITEM_ATTR_SIZE = 4 + 8192 * EXPECTED_ITEM_ATTR_STRIDE;
const MAP_XOR_KEY = [0xD1,0x73,0x52,0xF6,0xD2,0x9A,0xCB,0x27,0x3E,0xAF,0x59,0x31,0x37,0xB3,0xE7,0xA2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = p => path.resolve(p || '').replace(/[\\/]+$/, '').toLowerCase();
const relParts = rel => String(rel).split('/');
const joinRel = (root, rel) => path.join(root, ...relParts(rel));

// Everything in HARD_PROFILE is present in the R53 package's retained
// public/asset-manifest.json and is directly exercised by the user's R53 run.
const CORE_PROFILE = Object.freeze([
  'Interface/New_lo_back_01.OZJ',
  'World95/TerrainHeight.OZB',
  'World75/TerrainHeight.OZB',
  'World75/EncTerrain75.att',
  'World1/TerrainHeight.OZB',
  'World1/EncTerrain1.map',
  'World1/EncTerrain1.att',
  'World1/EncTerrain1.obj',
  // R90: current MoveCustom target worlds retain the four authoritative
  // terrain/object owners before the browser is opened. No wrong-map fallback.
  'World2/TerrainHeight.OZB','World2/EncTerrain2.map','World2/EncTerrain2.att','World2/EncTerrain2.obj',
  'World3/TerrainHeight.OZB','World3/EncTerrain3.map','World3/EncTerrain3.att','World3/EncTerrain3.obj',
  'World4/TerrainHeight.OZB','World4/EncTerrain4.map','World4/EncTerrain4.att','World4/EncTerrain4.obj',
  'World5/TerrainHeight.OZB','World5/EncTerrain5.map','World5/EncTerrain5.att','World5/EncTerrain5.obj',
  'World7/TerrainHeight.OZB','World7/EncTerrain7.map','World7/EncTerrain7.att','World7/EncTerrain7.obj',
  'World8/TerrainHeight.OZB','World8/EncTerrain8.map','World8/EncTerrain8.att','World8/EncTerrain8.obj',
  'World9/TerrainHeight.OZB','World9/EncTerrain9.map','World9/EncTerrain9.att','World9/EncTerrain9.obj',
  'World11/TerrainHeight.OZB','World11/EncTerrain11.map','World11/EncTerrain11.att','World11/EncTerrain11.obj',
]);

const HARD_PROFILE = Object.freeze([
  'Interface/New_lo_back_01.OZJ',
  'World95/TerrainHeight.OZB',
  'World75/TerrainHeight.OZB',
  'World75/EncTerrain75.att',
  'World1/TerrainHeight.OZB',
  'World1/EncTerrain1.map',
  'World1/EncTerrain1.att',
  'World1/EncTerrain1.obj',
  'Local/Eng/item_eng.bmd',
  'Custom/NewInterface/main_frame_left.ozt',
  'Custom/NewInterface/main_frame_right.ozt',
  'Custom/NewInterface/main_frame_life.ozt',
  'Custom/NewInterface/main_frame_mana.ozt',
  'Custom/NewInterface/main_frame_stamina.ozj',
  'Custom/NewInterface/fonttest.OZT',
  'Custom/NewInterface/btn_shop.ozj',
  'Custom/NewInterface/main_frame_btn_character.ozj',
  'Custom/NewInterface/main_frame_btn_inventory.ozj',
  'Custom/NewInterface/main_frame_btn_guild.ozj',
  'Custom/NewInterface/main_frame_btn_party.ozj',
  'Custom/NewInterface/stats_v2.ozj',
  'Custom/NewInterface/points_v2.ozj',
  'Custom/NewInterface/btn_plus_v2.ozj',
  'Custom/NewInterface/item_back01_v2.ozj',
  'Custom/NewInterface/item_back02_v2.ozj',
  'Custom/NewInterface/item_box_v2.ozj',
  'Custom/NewInterface/item_money_v2.ozt',
  'Custom/NewInterface/btn_close_v2.ozj',
  'Custom/NewInterface/btn_repair_v2.ozj',
  'Custom/NewInterface/btn_openstore_v2.ozj',
  'Custom/NewInterface/item_weapon01_v2.ozj',
  'Custom/NewInterface/item_weapon02_v2.ozj',
  'Custom/NewInterface/item_cap_v2.ozj',
  'Custom/NewInterface/item_upper_v2.ozj',
  'Custom/NewInterface/item_lower_v2.ozj',
  'Custom/NewInterface/item_gloves_v2.ozj',
  'Custom/NewInterface/item_boots_v2.ozj',
  'Custom/NewInterface/item_wing_v2.ozj',
  'Custom/NewInterface/item_helper_v2.ozj',
  'Custom/NewInterface/item_necklace_v2.ozj',
  'Custom/NewInterface/item_ring_v2.ozj',
  // R90 physical character-material recovery: these are exact Main 5.2
  // OpenPlayers/OpenPlayerTextures owners observed by the current CharSet.
  // They are not substitutes; if the official Data tree lacks them the
  // character/equipment presentation cannot be considered exact.
  'Player/Player.bmd',
  'Player/ArmorMale18.bmd',
  'Player/PantMale18.bmd',
  'Player/BootMale18.bmd',
  'Player/HelmMale18.bmd',
  'Player/HDK_ArmorMale01.bmd',
  'Player/HDK_PantMale01.bmd',
  'Player/HDK_BootMale01.bmd',
  'Player/HDK_HelmMale01.bmd',
  'Player/skin_barbarian_01.OZJ',
  'Player/level_man022.OZJ',
  'Player/skin_wizard_01.OZJ',
  'Player/level_man01.OZJ',
  'Player/skin_archer_01.OZJ',
  'Player/level_man033.OZJ',
  'Player/skin_special_01.OZJ',
  'Player/level_man02.OZJ',
  'Player/hair_R.OZJ',
  'Configs/lua/Configs/CustomItemPosition.lua',
  'Configs/lua/Configs/CustomItemSize.lua',
  'Configs/lua/Configs/CustomItemFloor.lua',
  'Configs/lua/Configs/CustomItemForce.lua',
  'Configs/lua/Monster/CustomMonster.lua',
  'Configs/lua/Monster/CustomMonsterGlow.lua',
  'Configs/lua/Monster/CustomMonsterEffect.lua',
  'Configs/lua/EffectSystem/CharacterEffectItens.lua',
  'Configs/lua/EffectSystem/CharacterSetEffect.lua',
  'Configs/lua/Configs/DisableExcellent.lua',
  'Configs/lua/Configs/bordas.lua',
  'Configs/lua/Configs/CustomJewelStack.lua',
  'Configs/lua/Configs/ElementSlots.lua',
  'Configs/lua/Configs/ItemEffects.lua',
  'Configs/lua/Configs/LoadItens.lua',
  'Configs/lua/Configs/CustomWings.lua',
  'Configs/lua/CharacterSystem/CharacterCreateCape.lua',
  'Skill/gmmzine.OZJ',
  'Configs/lua/Manager/Interface/MoveCustomInterface.lua',
  'Configs/lua/Manager/Interface/MoveCustomInterfaceConfig.lua',
  'Local/Por/Text_por.bmd',
  'Local/Por/item_por.bmd',
  'Local/ItemAddOption.bmd',
  'Local/Por/JewelOfHarmonyOption_por.bmd',
  'Local/Por/socketitem_por.bmd',
  'Local/ItemSetType.bmd',
  'Local/Por/ItemSetOption_Por.bmd',
  'Custom/NewInterface/Main_Skillbox.ozt',
  'Custom/NewInterface/skill_render.ozt',
  'Custom/NewInterface/main_frame_chat_button.ozt',
  'Interface/newui_menu_SD.OZJ',
  'Interface/newui_Exbar.OZJ',
  'Skill/flareBlue.ozj',
  'Item/Wing144.bmd',
  'Item/Wing145.bmd',
  'Item/icon_horse_abbadon.bmd',
]);
const OPTIONAL_PROFILE = Object.freeze([
  'Configs/lua/Configs/LoadItemEffects.lua',
  'Configs/lua/EffectSystem/CharacterEffectItens.lua',
  'Configs/lua/EffectSystem/CharacterSetEffect.lua',
  'Skill/flareBlue.ozj',
  'Interface/newui_menu_SD.OZJ',
]);

function existsDir(p){try{return fs.statSync(p).isDirectory();}catch{return false;}}
function existsFile(p){try{return fs.statSync(p).isFile();}catch{return false;}}
function fileSize(p){try{return fs.statSync(p).size;}catch{return -1;}}
function firstExisting(root, variants){for(const rel of variants){const p=joinRel(root,rel);if(existsFile(p))return p;}return null;}
function assetVariants(rel){
  const n=String(rel||'').replace(/\\/g,'/'); const ext=path.extname(n).toLowerCase(); const base=n.slice(0,-ext.length); const out=[n];
  if(ext==='.ozt')out.push(base+'.tga',base+'.TGA');
  else if(ext==='.ozj')out.push(base+'.jpg',base+'.JPG',base+'.jpeg',base+'.JPEG');
  else if(ext==='.ozb')out.push(base+'.bmp',base+'.BMP');
  if(n.toLowerCase()==='local/eng/item_eng.bmd') out.push('Local/Eng/Item_Eng.bmd','Local/Eng/2item_eng.bmd','Local/Eng/orgn-item_eng.bmd','Local/Eng/--item_eng.bmd','Local/Por/item_por.bmd');
  if(n.toLowerCase()==='custom/newinterface/fonttest.ozt')out.push('Interface/FontTest.OZT','Interface/FontTest.tga');
  return [...new Set(out)];
}
function compatibleFile(root,rel){return firstExisting(root,assetVariants(rel));}

function computeDataAuthorityRevision(root){
  const base=path.resolve(root||'');
  const h=crypto.createHash('sha256');
  h.update('MUWEB_FIX44_DATA_AUTHORITY\0');h.update(norm(base));h.update('\0');
  let files=0;
  const stack=[base];
  while(stack.length){
    const d=stack.pop();let ents=[];
    try{ents=fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en',{sensitivity:'base'}));}
    catch{continue;}
    for(const e of ents){
      const full=path.join(d,e.name);
      if(e.isDirectory()){stack.push(full);continue;}
      if(!e.isFile())continue;
      let st;try{st=fs.statSync(full);}catch{continue;}
      const rel=path.relative(base,full).replace(/\\/g,'/').toLowerCase();
      h.update(rel);h.update('\0');h.update(String(st.size));h.update('\0');h.update(String(Math.trunc(st.mtimeMs)));h.update('\0');
      files++;
    }
  }
  return {revision:h.digest('hex'),files};
}

function decryptEncTerrainHeader(buf){
  const out=Buffer.alloc(Math.min(4,buf.length)); let w=0x5E;
  for(let i=0;i<out.length;i++){out[i]=((buf[i]^MAP_XOR_KEY[i%16])-w)&0xFF;w=(buf[i]+0x3D)&0xFF;}
  return out;
}
function encTerrainObjectCountFromBuffer(buf){
  if(!buf || buf.length<4) return null;
  const h=decryptEncTerrainHeader(buf);
  return h[2] | (h[3]<<8);
}
function encTerrainObjectCount(root){
  try { return encTerrainObjectCountFromBuffer(fs.readFileSync(joinRel(root,'World1/EncTerrain1.obj'))); }
  catch { return null; }
}
function itemAttributeProfile(root){
  const p=firstExisting(root,assetVariants('Local/Eng/item_eng.bmd'));
  if(!p)return {ok:false,path:null,size:-1,stride:null};
  const size=fileSize(p); const stride=(size>4 && (size-4)%8192===0)?(size-4)/8192:null;
  return {ok:stride!==null && stride>=31,path:p,size,stride,exactStride:stride===EXPECTED_ITEM_ATTR_STRIDE};
}
function inspectDataRoot(root){
  root=path.resolve(root||'');
  const coreMissing=CORE_PROFILE.filter(rel=>!compatibleFile(root,rel));
  const visualMissing=HARD_PROFILE.filter(rel=>!compatibleFile(root,rel));
  const optionalPresent=OPTIONAL_PROFILE.filter(rel=>compatibleFile(root,rel));
  const worldCount=encTerrainObjectCount(root);
  const itemAttr=itemAttributeProfile(root);
  const compatible=existsDir(root) && coreMissing.length===0;
  const exact=compatible && visualMissing.length===0 && worldCount===EXPECTED_WORLD1_OBJECT_COUNT && itemAttr.exactStride;
  const score=(CORE_PROFILE.length-coreMissing.length)*100 + (HARD_PROFILE.length-visualMissing.length)*5 + optionalPresent.length + (itemAttr.ok?25:0) + (worldCount===EXPECTED_WORLD1_OBJECT_COUNT?20:0);
  return {root,compatible,exact,score,coreMissing,missing:visualMissing,optionalPresent,worldCount,itemAttr};
}
function profileSummary(p){
  const wc=p.worldCount==null?'?':p.worldCount;
  const ia=p.itemAttr?.stride==null?'?':p.itemAttr.stride;
  return `score=${p.score} core=${CORE_PROFILE.length-p.coreMissing.length}/${CORE_PROFILE.length} visual=${HARD_PROFILE.length-p.missing.length}/${HARD_PROFILE.length} World1=${wc} (captura-fisica=${EXPECTED_WORLD1_OBJECT_COUNT}) ItemAttrStride=${ia}`;
}
function hasExactR53Profile(root){return inspectDataRoot(root).exact;}
function hasCompatibleDataProfile(root){return inspectDataRoot(root).compatible;}

function addCandidate(out,p){if(!p)return;try{p=path.resolve(p);}catch{return;}if(!out.some(x=>norm(x)===norm(p)))out.push(p);}
function rememberedCandidates(){
  const out=[];
  for(const file of [DATA_ROOT_FILE,path.join(ROOT,'.muweb-data-root')]){
    try{addCandidate(out,fs.readFileSync(file,'utf8').trim());}catch{}
  }
  return out;
}
function siblingRememberedCandidates(){
  const out=[]; const parent=path.dirname(ROOT); let ents=[]; try{ents=fs.readdirSync(parent,{withFileTypes:true});}catch{return out;}
  for(const e of ents){
    if(!e.isDirectory() || !/^MUWEB_/i.test(e.name))continue;
    const d=path.join(parent,e.name);
    let files=[];try{files=fs.readdirSync(d);}catch{continue;}
    for(const n of files){
      if(/^\.muweb-data-root/i.test(n)) {try{addCandidate(out,fs.readFileSync(path.join(d,n),'utf8').trim());}catch{}}
      if(/^\.muweb-assets.*\.log$/i.test(n)) {try{const t=fs.readFileSync(path.join(d,n),'utf8'); for(const m of t.matchAll(/(?:root:|Data real encontrado:?)[ \t]*([^\r\n]+)/gi))addCandidate(out,m[1].trim());}catch{}}
    }
  }
  return out;
}
function userCandidates(){
  // Strict user authority: diagnostics may inspect only the exact official Data.
  return [path.resolve(OFFICIAL_DATA_ROOT)];
}
function shallowCollectData(base,maxDepth=5,maxDirs=12000){
  const out=[]; if(!existsDir(base))return out; const q=[[base,0]];let seen=0;
  while(q.length&&seen++<maxDirs){const [d,depth]=q.shift();
    if(path.basename(d).toLowerCase()==='data' && existsDir(path.join(d,'Interface')))addCandidate(out,d);
    if(depth>=maxDepth)continue;let ents=[];try{ents=fs.readdirSync(d,{withFileTypes:true});}catch{continue;}
    for(const e of ents){if(!e.isDirectory())continue;const low=e.name.toLowerCase();
      if(['node_modules','$recycle.bin','windows','program files','program files (x86)','appdata','.git','system volume information'].includes(low))continue;
      q.push([path.join(d,e.name),depth+1]);}
  }return out;
}
function collectAutomaticCandidates(){
  // Kept for diagnostics/tests, but discovery is intentionally disabled.
  return [path.resolve(OFFICIAL_DATA_ROOT)];
}
function chooseBestDataRoot(){
  const profiles=collectAutomaticCandidates().filter(existsDir).map(inspectDataRoot).sort((a,b)=>b.score-a.score);
  if(profiles.length){
    console.log('[R90] Candidatos Data encontrados:');
    for(const p of profiles.slice(0,8)) console.log(`  ${p.exact?'[R53-EXATA]':p.compatible?'[COMPAT]   ':'[NO]       '} ${profileSummary(p)} :: ${p.root}`);
  }
  return {exact:profiles.find(p=>p.exact)||null,compatible:profiles.find(p=>p.compatible)||null,best:profiles[0]||null,profiles};
}
function persistDataRoot(p){try{fs.writeFileSync(DATA_ROOT_FILE,path.resolve(p)+'\n');}catch(e){console.warn('[R90] não consegui persistir Data:',e.message);}}
function pickFolderWindows(){
  if(process.platform!=='win32'||process.env.MUWEB_NO_PROMPT==='1')return null;
  const ps=['Add-Type -AssemblyName System.Windows.Forms;','$d=New-Object System.Windows.Forms.FolderBrowserDialog;',
    "$d.Description='Selecione a pasta Data do cliente MU (World1/World75/World95). R90 resolve TGA/JPG/OZT/OZJ automaticamente'",'$d.ShowNewFolderButton=$false;',
    'if($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){[Console]::Write($d.SelectedPath)}'].join(' ');
  try{const r=spawnSync('powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-Command',ps],{encoding:'utf8'});return (r.stdout||'').trim()||null;}catch{return null;}
}

function httpGet(url,timeout=1600,method='GET'){
  return new Promise(resolve=>{const req=http.request(url,{timeout,method},res=>{const bufs=[];res.on('data',d=>bufs.push(d));res.on('end',()=>resolve({ok:true,status:res.statusCode,body:Buffer.concat(bufs)}));});
    req.on('timeout',()=>{req.destroy();resolve({ok:false,error:'timeout'});});req.on('error',e=>resolve({ok:false,error:e.message}));req.end();});
}
function portFree(port){return new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.once('listening',()=>s.close(()=>resolve(true)));s.listen(port,'127.0.0.1');});}
async function remoteHas(port,rel){const r=await httpGet(`http://127.0.0.1:${port}/${rel}`,1400,'HEAD');return r.ok&&r.status===200;}
async function remoteDataProfile(port){
  for(const rel of CORE_PROFILE){if(!(await remoteHas(port,rel)))return {compatible:false,reason:`missing ${rel}`};}
  const obj=await httpGet(`http://127.0.0.1:${port}/World1/EncTerrain1.obj`,1800,'GET');
  const count=(obj.ok&&obj.status===200)?encTerrainObjectCountFromBuffer(obj.body):null;
  let visual=0; for(const rel of HARD_PROFILE){if(await remoteHas(port,rel))visual++;}
  return {compatible:true,reason:'ok',worldCount:count,visual};
}
async function assetServerIdentity(port){
  const r=await httpGet(`http://127.0.0.1:${port}/`,800,'GET');
  if(!(r.ok&&r.status===200))return null;
  const body=r.body.toString();
  if(!body.includes('MUWEB ASSET SERVER R56.2')&&!body.includes('MUWEB ASSET SERVER R56.1'))return null;
  // GET helper does not expose headers, so ask a tiny identity endpoint.
  const id=await httpGet(`http://127.0.0.1:${port}/__muweb_asset_root`,800,'GET');
  if(!(id.ok&&id.status===200))return {root:null};
  try{return JSON.parse(id.body.toString());}catch{return {root:null};}
}
async function assetServerMatchesRoot(port,dataRoot,dataRevision){const id=await assetServerIdentity(port);if(!(id&&id.root&&norm(id.root)===norm(dataRoot)))return false;if(dataRevision&&id.authorityRevision!==dataRevision)return false;return await remoteHas(port,'__muweb_asset_manifest.json');}
async function pickAssetPort(dataRoot,dataRevision){
  for(let p=9100;p<=9110;p++){
    if(await assetServerMatchesRoot(p,dataRoot,dataRevision))return {port:p,reuse:true};
    if(await portFree(p))return {port:p,reuse:false};
  }
  throw new Error('Nenhuma porta de assets livre 9100..9110.');
}
async function waitRemoteProfile(port,dataRoot,tries=60){
  for(let i=0;i<tries;i++){const r=await remoteDataProfile(port);if(r.compatible && await assetServerMatchesRoot(port,dataRoot))return r;await sleep(150);}return null;
}

function startDetached(script,args,logName){const fd=fs.openSync(path.join(ROOT,logName),'a');const c=spawn(process.execPath,[script,...args.map(String)],{cwd:ROOT,detached:true,windowsHide:true,stdio:['ignore',fd,fd]});c.unref();fs.closeSync(fd);return c.pid;}
function tcpProbe(port,host='127.0.0.1',timeout=800){return new Promise(resolve=>{const s=net.createConnection({host,port});let done=false;const f=ok=>{if(done)return;done=true;try{s.destroy();}catch{}resolve(ok)};s.setTimeout(timeout);s.once('connect',()=>f(true));s.once('timeout',()=>f(false));s.once('error',()=>f(false));});}
async function ensureGateway(){if(await tcpProbe(9091)){console.log('[R90] Gateway 9091 já ativo.');return;}
  const pid=startDetached(path.join(ROOT,'gateway-server.cjs'),[],'.muweb-gateway.log');console.log(`[R90] Gateway iniciado PID ${pid}.`);for(let i=0;i<40;i++){if(await tcpProbe(9091,'127.0.0.1',250))return;await sleep(125);}throw new Error('Gateway 9091 não abriu.');}
function isOurHttp(port){return httpGet(`http://127.0.0.1:${port}/__muweb_runtime.json`).then(r=>{if(!r.ok||r.status!==200)return false;try{return norm(JSON.parse(r.body.toString()).root)===norm(ROOT);}catch{return false;}});}
async function pickHttpPort(){if(await isOurHttp(8080))return{port:8080,reuse:true};if(await portFree(8080))return{port:8080,reuse:false};for(let p=8081;p<=8099;p++)if(await portFree(p))return{port:p,reuse:false};throw new Error('Sem porta HTTP 8080..8099');}
async function waitOurHttp(port){for(let i=0;i<50;i++){if(await isOurHttp(port))return true;await sleep(125);}return false;}
function writeRuntimeConfig(assetPort,dataRevision){fs.writeFileSync(path.join(ROOT,'runtime-config.js'),`// auto R90 FIX44\nwindow.MUWEB_CONFIG=Object.assign({},window.MUWEB_CONFIG||{},{ASSETS_URL:'http://127.0.0.1:${assetPort}/',ASSET_AUTHORITY:'${dataRevision}',GATEWAY_URL:'ws://127.0.0.1:9091',GATEWAY_ADMIN_URL:'ws://127.0.0.1:9090'});\n`);}
function ensureRuntimeScriptInIndex(){const p=path.join(ROOT,'index.html');let s=fs.readFileSync(p,'utf8');if(!s.includes('runtime-config.js')){s=s.replace('<script type="importmap">','<script src="./runtime-config.js"></script>\n\n    <script type="importmap">');fs.writeFileSync(p,s);}}
function openBrowser(url){if(process.env.MUWEB_NO_BROWSER==='1')return;try{if(process.platform==='win32')spawn('cmd.exe',['/c','start','',url],{detached:true,stdio:'ignore'}).unref();}catch{}}
function assertRuntime(){for(const rel of ['node_modules/three/build/three.module.js','node_modules/ws/index.js','gateway-server.cjs','public/asset-manifest.json','tools/verify-runtime-source.mjs','tools/dev-web-server.cjs','tools/asset-server.cjs','tools/web-runtime-control-r90.ps1'])if(!existsFile(joinRel(ROOT,rel)))throw new Error(`runtime R90 incompleto: ${rel}`);}

async function main(){
  console.log('================================================================');
  console.log(' MUWEB R90 - STRICT DATA AUTHORITY / OFFICIAL MuPromax 1.0.1 ONLY');
  console.log('================================================================');
  console.log(`[R90] Source root: ${ROOT}`); assertRuntime();
  console.log(`[R90] Cliente oficial: ${OFFICIAL_CLIENT_ROOT}`);
  console.log(`[R90] Data oficial: ${OFFICIAL_DATA_ROOT}`);

  if(!existsDir(OFFICIAL_DATA_ROOT)){
    throw new Error(`DATA OFICIAL OBRIGATORIA NAO ENCONTRADA: ${OFFICIAL_DATA_ROOT}. Nenhum outro cliente/Data sera aceito.`);
  }
  const selected=inspectDataRoot(OFFICIAL_DATA_ROOT);
  console.log(`[R90] Data oficial encontrada: ${profileSummary(selected)} :: ${selected.root}`);
  if(!selected.compatible){
    throw new Error(`DATA OFICIAL INVALIDA/INCOMPLETA: ${OFFICIAL_DATA_ROOT}; CORE faltando: ${selected.coreMissing.join(', ')}`);
  }
  console.log('[R90] DATA AUTHORITY LOCK: discovery/fallback/picker desativados; somente MuPromax 1.0.1 oficial.');

  persistDataRoot(selected.root);
  console.log(`[R90] DATA SELECIONADA ${norm(selected.root)===norm(OFFICIAL_DATA_ROOT)?'[OFICIAL MuPromax 1.0.1]':selected.exact?'[R53 EXATA]':'[COMPATÍVEL]'}: ${selected.root}`);
  console.log(`[R90] ${profileSummary(selected)}`);
  const dataAuthority=computeDataAuthorityRevision(selected.root);
  console.log(`[R90] Data authority=${dataAuthority.revision.slice(0,16)}... files=${dataAuthority.files}`);
  if(!selected.exact){
    console.warn(`[R90] AVISO: Data é variante do cliente. World1=${selected.worldCount ?? '?'}; captura fisica tinha ${EXPECTED_WORLD1_OBJECT_COUNT}. Isso NÃO bloqueia o boot.`);
    if(selected.missing.length){
      console.warn(`[R90] Visual compiled paths ausentes (${selected.missing.length}); resolver tentará .TGA/.JPG/.BMP, aliases e basename único.`);
      console.warn(`[R90 FIX44] Visual paths não resolvidos: ${selected.missing.join(', ')}`);
    }
  }
  const ap=await pickAssetPort(selected.root,dataAuthority.revision); let assetPort=ap.port;
  if(!ap.reuse){const pid=startDetached(path.join(TOOLS,'asset-server.cjs'),[selected.root,assetPort,dataAuthority.revision],'.muweb-assets-r90.log');console.log(`[R90] Asset server official-root PID ${pid} -> :${assetPort}`);}
  const remote=await waitRemoteProfile(assetPort,selected.root);
  if(!remote)throw new Error(`Asset server :${assetPort} não publicou os assets críticos.`);
  console.log(`[R90] ASSETS CRÍTICOS OK em :${assetPort}; World1=${remote.worldCount ?? '?'}; visual-resolved=${remote.visual}/${HARD_PROFILE.length}.`);

  ensureRuntimeScriptInIndex(); writeRuntimeConfig(assetPort,dataAuthority.revision); await ensureGateway();
  const hp=await pickHttpPort();
  if(!hp.reuse){const pid=startDetached(path.join(TOOLS,'dev-web-server.cjs'),[hp.port],'.muweb-http-r90.log');console.log(`[R90] HTTP PID ${pid} -> :${hp.port}`);if(!(await waitOurHttp(hp.port)))throw new Error('HTTP R90 não respondeu como esta raiz.');}
  fs.writeFileSync(path.join(ROOT,'.muweb-http-port'),String(hp.port)+'\n');
  console.log('[R90] Verificando source servida...');
  const v=spawnSync(process.execPath,[path.join(TOOLS,'verify-runtime-source.mjs'),`http://127.0.0.1:${hp.port}`],{cwd:ROOT,stdio:'inherit'});if(v.status!==0)throw new Error(`verify-runtime-source exit ${v.status}`);
  console.log(`[R90] PRONTO: http://127.0.0.1:${hp.port}/  assets=:${assetPort}`);openBrowser(`http://127.0.0.1:${hp.port}/`);
}
module.exports={ROOT,OFFICIAL_CLIENT_ROOT,OFFICIAL_DATA_ROOT,CORE_PROFILE,HARD_PROFILE,OPTIONAL_PROFILE,EXPECTED_WORLD1_OBJECT_COUNT,EXPECTED_ITEM_ATTR_STRIDE,EXPECTED_ITEM_ATTR_SIZE,assetVariants,computeDataAuthorityRevision,encTerrainObjectCountFromBuffer,encTerrainObjectCount,itemAttributeProfile,inspectDataRoot,profileSummary,hasExactR53Profile,hasCompatibleDataProfile,chooseBestDataRoot,remoteDataProfile,main};
if(require.main===module)main().catch(e=>{console.error('\n[R90] FALHA:',e.message);process.exitCode=1;});
