// Preflight the Web source currently deployed by LIGAR_WEB_R90_FIX154.bat.
// Does not replace the existing official Data-root/verifier in serve.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const required=[
  ['core/GameApp.js','MUWEB_FIX154_MODELS_COMPANIONS_LAUNCHER_2026-10-11'],
  ['game/PetSystem.js','StableCompanionLane'],
  ['game/PlayerViewportManager.js','remoteCompanionQueue'],
  ['game/StableCompanionLane.js','export class StableCompanionLane'],
  ['game/CompanionLoadQueue.js','export class CompanionLoadQueue'],
  ['ui2/InventoryWindow.js','enableHiddenBmdPrewarm'],
  ['ui2/ItemIconRenderer.js','recentSlowJobs'],
  ['data/ModelPortabilityAudit.js','auditModelCoverage'],
  ['index.html','FIX154'],
  ['tools/serve.mjs','start-r90-safe.cjs'],
];
let failed=0;
for(const [relative,needle] of required){
  const absolute=path.join(dir,relative);
  if(!fs.existsSync(absolute)||!fs.readFileSync(absolute,'utf8').includes(needle)){
    console.error('[FIX154] FAIL: arquivo ausente/incompatível:',relative);failed++;
  }
}
if(failed){console.error('[FIX154] Falha de consistência:',failed);process.exit(3);}
console.info('[FIX154] Source/runtime verificados:',required.length,'arquivos; Data oficial será verificado pelo launcher original.');
