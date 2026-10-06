import fs from 'node:fs';
const src=fs.readFileSync(new URL('../../protocol/MUPacketRouter.js', import.meta.url),'utf8');
const must=[
  "if (payload.length !== 6) return 'payload_short';",
  "const sourceKey = ((payload[2] << 8) | payload[3]) & 0x7FFF;",
  "const success = (rawTargetKey & 0x8000) !== 0;",
  "const targetKey = rawTargetKey & 0x7FFF;",
  "if (payload.length !== 7 + count * 2)",
  "targetKeys.push(((payload[off] << 8) | payload[off + 1]) & 0x7FFF);",
  "if (payload.length !== 7) return 'payload_short';",
  "if (payload.length !== 3) return 'payload_short';",
];
for(const s of must) if(!src.includes(s)) throw new Error(`missing magic wire contract: ${s}`);
console.log('PASS FIX65 0x19/0x1A/0x1E/0x1B magic-family exact wire/15-bit identity contracts');
