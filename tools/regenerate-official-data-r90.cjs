'use strict';
// Atomic-at-command-level physical regeneration from the one official Windows Data.
// No picker, no remembered roots, no env override, no generated data from another client.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const gate=require('./verify-data-authority-r90.cjs');
const ROOT=gate.ROOT;
const manifestPath=gate.localPath(gate.MANIFEST);
function fail(message){throw Error(message);}
function run(){
  if(process.argv.includes('--verify-only')){gate.verify();console.log('[R90] verify-only PASS');return;}
  if(!process.argv.includes('--regenerate'))fail('Use --verify-only ou --regenerate');
  gate.canonicalRoot();
  for(const rel of gate.SOURCES){const p=gate.officialSourcePath(rel);if(!fs.statSync(p).isFile())fail('Fonte oficial ausente: '+rel);}
  try{gate.verify();console.log('[R90] tabelas oficiais verificadas, sem regeneracao.');return;}catch(e){console.log('[R90] manifesto/tabelas ainda nao validados: '+e.message);}
  const targets=[...gate.OUTPUTS,gate.MANIFEST];
  const before=new Map(targets.map(rel=>{const p=gate.localPath(rel);return [rel,fs.existsSync(p)?fs.readFileSync(p):null];}));
  try{
    for(const script of gate.GENERATORS){
      const p=gate.localPath(script);
      const result=spawnSync(process.execPath,[p],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024});
      if(result.stdout)process.stdout.write(result.stdout);
      if(result.stderr)process.stderr.write(result.stderr);
      if(result.error||result.status!==0)fail(`Gerador ${script} falhou (${result.status}): ${result.error?.message||''}`);
    }
    // RealData.js is a bridge, not an offline BMD parser; preserve its logic and
    // change its obsolete provenance comment only AFTER all physical generators pass.
    const bridge=gate.localPath('data/RealData.js');
    const original=fs.readFileSync(bridge,'utf8');
    const updated=original.replace(/MuPromax\s*1\.0\.2/g,'MuPromax 1.0.1');
    fs.writeFileSync(bridge,updated);
    const evidence=gate.collect();
    const manifest={schema:'MUWEB_DATA_AUTHORITY_V1',canonicalDataRoot:gate.OFFICIAL,
      generatedAt:new Date().toISOString(),...evidence,lineage:gate.lineage(evidence)};
    fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
    gate.verify();
    console.log('[R90] regeneracao fisica 1.0.1 concluida e manifesto SHA-256 validado.');
  }catch(e){
    for(const [rel,contents] of before){const p=gate.localPath(rel);if(contents===null)fs.rmSync(p,{force:true});else fs.writeFileSync(p,contents);}
    throw e;
  }
}
try{run();}catch(e){console.error('[R90] DATA FAIL-CLOSED:',e.message);process.exitCode=2;}
