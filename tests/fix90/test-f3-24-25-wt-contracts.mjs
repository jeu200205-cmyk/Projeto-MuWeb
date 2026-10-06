import assert from 'node:assert/strict';
import {routeMUPacket} from '../../protocol/MUPacketRouter.js';

const body=new Uint8Array(26);
body[0]=2;
body.set([...Buffer.from('REDTEAM')],1);
body[11]=0xCC; // MSVC alignment byte is wire padding and is intentionally ignored.
body[12]=0x34; body[13]=0x12;
body.set([...Buffer.from('BLUETEAM')],14);
body[24]=0x78; body[25]=0x56;
let got=null;
assert.equal(routeMUPacket({headcode:0xF3,subcode:0x24,payload:body,opcodeName:'F3'}, {onWTMatchResult:v=>got=v}), 'wt_match_result');
assert.deepEqual(got,{type:2,team1:'REDTEAM',score1:0x1234,team2:'BLUETEAM',score2:0x5678});
for(const n of [0,1,25,27,40]){let called=false;assert.equal(routeMUPacket({headcode:0xF3,subcode:0x24,payload:new Uint8Array(n)},{onWTMatchResult:()=>called=true}),'payload_short');assert.equal(called,false);}
for(const type of [3,4,0xff]){const invalid=body.slice();invalid[0]=type;let called=false;assert.equal(routeMUPacket({headcode:0xF3,subcode:0x24,payload:invalid},{onWTMatchResult:()=>called=true}),'wt_match_result_ignored_type');assert.equal(called,false);}
assert.equal(routeMUPacket({headcode:0xF3,subcode:0x25,payload:new Uint8Array([123,77])},{}),'wt_soccer_goal_noop');
for(const n of [0,1,3,20])assert.equal(routeMUPacket({headcode:0xF3,subcode:0x25,payload:new Uint8Array(n)},{}),'payload_short');
console.log('PASS FIX90 F3:24 exact 26B match-result + F3:25 exact 2B desktop no-op');
