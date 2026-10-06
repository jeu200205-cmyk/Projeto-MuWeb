import fs from 'node:fs';
const pack=fs.readFileSync(new URL('../../game/PCSkillEffectsPackA.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../../core/GameApp.js',import.meta.url),'utf8');
for (const tok of ["['pc-skill-defense','sKnightDefense.wav']","playPcElfSupportReceiveSound(sourceMonsterIndex = -1)","Number(sourceMonsterIndex) === 77","this._playExact('pc-skill-defense')"]) if(!pack.includes(tok)) throw new Error('missing '+tok);
for (const tok of ["source.kind === 'monster' ? source.monster?.typeId : -1","this.skillFx.playPcElfSupportReceiveSound?.(sourceMonsterIndex)"]) if(!app.includes(tok)) throw new Error('missing '+tok);
const branch=app.split('const elfSupportSubtype =',2)[1].split('// Fail-closed por tipo:',1)[0];
if(branch.indexOf('playPcElfSupportReceiveSound') > branch.indexOf('elfSupportSubtype !== 2 || success')) throw new Error('sound incorrectly success-gated');
console.log('PASS FIX66 Elf support SOUND_SKILL_DEFENSE owner + MonsterIndex 77 suppression');
