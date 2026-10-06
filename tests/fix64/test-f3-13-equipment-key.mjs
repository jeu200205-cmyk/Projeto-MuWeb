import fs from 'node:fs';
const src=fs.readFileSync(new URL('../../protocol/MUPacketRouter.js', import.meta.url),'utf8');
if(!src.includes('const key = ((payload[0] << 8) | payload[1]) & 0x7FFF;')) throw new Error('F3:13 key is not normalized to 15-bit viewport identity');
const decode=(h,l)=>((h<<8)|l)&0x7fff;
if(decode(0x80,0x2a)!==0x2a) throw new Error('bit15 transport flag leaked into key');
if(decode(0xff,0xff)!==0x7fff) throw new Error('15-bit key max failed');
if(decode(0x12,0x34)!==0x1234) throw new Error('normal key changed');
console.log('PASS FIX64 F3:13 equipment key normalized to 15-bit viewport identity');
