import fs from 'node:fs';
const s=fs.readFileSync(new URL('./world/AttMapLoader.js',import.meta.url),'utf8');
const must=[
  'function unavailableAtt(size = MU_GRID)',
  'cells.fill(ATT_FLAG.NOMOVE | ATT_FLAG.NOGROUND)',
  "format: 'unavailable-authority-blocked'",
  'authorityMissing: true',
  'att = unavailableAtt();'
];
for(const x of must) if(!s.includes(x)) throw new Error(`missing ${x}`);
if(s.includes('fallback-all-walkable')||s.includes('att = fallbackAtt()')) throw new Error('walkable ATT fabrication remains');
console.log('PASS MAPS_ENGINE M64 authoritative ATT fail-closed');
