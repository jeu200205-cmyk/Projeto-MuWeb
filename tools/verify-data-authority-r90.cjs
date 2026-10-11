'use strict';
// Verify-only: never changes generated files. All provenance is cryptographic.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const OFFICIAL='C:\\clientepromax\\Nova pasta\\MuPromax 1.0.1\\Data';
const SOURCES=['Local/Por/item_por.bmd','Local/Por/Npcname_por.txt','Local/Por/movereq_por.bmd','Local/Por/skill_por.bmd'];
const OUTPUTS=['data/RealData.js','data/generated/RealItems.js','data/generated/RealMaps.js','data/generated/RealMonsters.js','skills/SkillAttributeData.js'];
const GENERATORS=['tools/generateRealData.mjs','tools/gen-skill-attribute-table.mjs'];
const MANIFEST='data/OFFICIAL_DATA_AUTHORITY.json';
function sha256(buffer){return crypto.createHash('sha256').update(buffer).digest('hex');}
function fingerprint(file){const bytes=fs.readFileSync(file);return {bytes:bytes.length,sha256:sha256(bytes)};}
function officialSourcePath(rel){return path.join(OFFICIAL,...rel.split('/'));}
function localPath(rel){return path.join(ROOT,...rel.split('/'));}
// Verify that an input is one of the enumerated official sources, and that
// neither the source nor its intermediate directories redirect outside Data.
// This is also used by direct generator invocations, not only the boot wrapper.
function validateOfficialSource(rel){
  if(!SOURCES.includes(rel))throw Error(`Fonte fora da allowlist oficial: ${rel}`);
  canonicalRoot();
  const parts=rel.split('/');let current=OFFICIAL;
  for(const part of parts){
    current=path.join(current,part);
    if(fs.lstatSync(current).isSymbolicLink())throw Error(`Link nao autorizado na fonte oficial: ${rel}`);
  }
  const actual=fs.realpathSync.native(current);
  const expected=path.win32.normalize(current).toLowerCase();
  if(path.win32.normalize(actual).toLowerCase()!==expected)
    throw Error(`Fonte oficial redirecionada: ${rel}`);
  if(!fs.statSync(current).isFile())throw Error(`Fonte oficial invalida: ${rel}`);
  return current;
}
function canonicalRoot(){
  if(process.platform!=='win32') throw Error('Data oficial Windows nao montado neste ambiente; verify-only bloqueado.');
  const actual=fs.realpathSync.native(OFFICIAL);
  const expected=path.win32.normalize(OFFICIAL).replace(/[\\/]+$/,'').toLowerCase();
  if(path.win32.normalize(actual).replace(/[\\/]+$/,'').toLowerCase()!==expected)
    throw Error('Data oficial e redirecionado por symlink/junction; proibido.');
  if(!fs.statSync(OFFICIAL).isDirectory())throw Error('Data oficial nao e diretorio.');
}
function dataInventory(){
  // Full official-tree metadata revision (source files additionally have byte SHA-256).
  // Symlinks/junction entries are rejected to prevent escaping the official tree.
  const h=crypto.createHash('sha256');let fileCount=0,totalBytes=0;
  const dirs=[OFFICIAL];
  while(dirs.length){const dir=dirs.pop();const entries=fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'));
    for(const entry of entries){const full=path.join(dir,entry.name);
      if(entry.isSymbolicLink())throw Error(`Link externo nao autorizado em Data oficial: ${entry.name}`);
      if(entry.isDirectory()){dirs.push(full);continue;}
      if(!entry.isFile())continue;
      const stat=fs.statSync(full);
      const rel=path.relative(OFFICIAL,full).replace(/\\/g,'/');
      h.update(rel.toLowerCase()+'\0'+stat.size+'\0'+Math.trunc(stat.mtimeMs)+'\n');
      fileCount++;totalBytes+=stat.size;
    }
  }
  if(!fileCount)throw Error('Data oficial vazio');
  return {fileCount,totalBytes,metadataSha256:h.digest('hex')};
}
function collect(){
  canonicalRoot();
  const sources={};
  for(const rel of SOURCES){const p=validateOfficialSource(rel);if(!fs.statSync(p).isFile())throw Error(`Fonte oficial ausente: ${rel}`);sources[rel]=fingerprint(p);}
  if(sources['Local/Por/skill_por.bmd'].bytes!==600*80+4)throw Error('skill_por.bmd stride/count/checksum fisico invalido.');
  const outputs={};
  for(const rel of OUTPUTS){const p=localPath(rel);const contents=fs.readFileSync(p,'utf8');
    if(/MuPromax\s*1\.0\.2|NoxyDEV/i.test(contents))throw Error(`Tabela contaminada: ${rel}`);
    outputs[rel]=fingerprint(p);
  }
  const generators={};for(const rel of GENERATORS)generators[rel]=fingerprint(localPath(rel));
  return {sources,outputs,generators,dataInventory:dataInventory()};
}
function lineage(evidence){
  const src=(name)=>evidence.sources[name]?.sha256;
  return {
    'data/generated/RealItems.js':{source:'Local/Por/item_por.bmd',sourceSha256:src('Local/Por/item_por.bmd')},
    'data/generated/RealMaps.js':{source:'Local/Por/movereq_por.bmd',sourceSha256:src('Local/Por/movereq_por.bmd')},
    'data/generated/RealMonsters.js':{source:'Local/Por/Npcname_por.txt',sourceSha256:src('Local/Por/Npcname_por.txt')},
    'skills/SkillAttributeData.js':{source:'Local/Por/skill_por.bmd',sourceSha256:src('Local/Por/skill_por.bmd')},
    'data/RealData.js':{bridgeInputs:['data/generated/RealItems.js','data/generated/RealMaps.js','data/generated/RealMonsters.js']}
  };
}
function verify(){
  // Diagnose all stale outputs before reading the manifest. Never call them clean
  // simply because an old comment was changed or an output file exists.
  const contaminated=OUTPUTS.filter(rel=>{
    try{return /MuPromax\s*1\.0\.2|NoxyDEV/i.test(fs.readFileSync(localPath(rel),'utf8'));}
    catch{return true;}
  });
  if(contaminated.length)throw Error('Tabelas nao regeneradas da autoridade oficial: '+contaminated.join(', '));
  const manifest=JSON.parse(fs.readFileSync(localPath(MANIFEST),'utf8'));
  if(manifest.schema!=='MUWEB_DATA_AUTHORITY_V1'||manifest.canonicalDataRoot!==OFFICIAL)
    throw Error('Manifesto ausente, de outra autoridade ou com schema invalido.');
  const actual=collect();
  for(const group of ['sources','outputs','generators'])for(const [name,fp] of Object.entries(actual[group])){
    const old=manifest[group]?.[name];
    if(!old||old.sha256!==fp.sha256||old.bytes!==fp.bytes)throw Error(`Proveniencia fisica divergente ${group}/${name}`);
  }
  for(const group of ['sources','outputs','generators'])if(Object.keys(manifest[group]||{}).length!==Object.keys(actual[group]).length)
    throw Error(`Manifesto com entradas extras em ${group}`);
  if(JSON.stringify(manifest.dataInventory)!==JSON.stringify(actual.dataInventory))
    throw Error('Inventario/revisao fisica do Data oficial divergente');
  if(JSON.stringify(manifest.lineage)!==JSON.stringify(lineage(actual)))throw Error('Lineage de fonte por modulo gerado divergente');
  return manifest;
}
if(require.main===module){try{const m=verify();console.log(`[DATA AUTHORITY] PASS: ${m.schema}; 4 fontes oficiais + 5 outputs hashados. Nenhum fallback.`);}catch(e){console.error('[DATA AUTHORITY] FAIL:',e.message);console.error('Unico Data permitido:',OFFICIAL);process.exitCode=2;}}
module.exports={ROOT,OFFICIAL,SOURCES,OUTPUTS,GENERATORS,MANIFEST,sha256,fingerprint,officialSourcePath,localPath,canonicalRoot,validateOfficialSource,dataInventory,lineage,collect,verify};
