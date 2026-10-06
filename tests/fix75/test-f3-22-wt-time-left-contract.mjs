import assert from 'node:assert/strict';
import { routeMUPacket } from '../../protocol/MUPacketRouter.js';
const packet = (payload) => ({headcode:0xF3, subcode:0x22, payload:Uint8Array.from(payload), opcodeName:'CHARACTER'});
let got=null;
assert.equal(routeMUPacket(packet([2,0xA5,0x34,0x12]), {onWTTimeLeft:m=>got=m}), 'wt_time_left');
assert.deepEqual(got,{type:2,time:0x1234});
for (const n of [0,1,2,3,5,8,16]) {
  let called=false;
  assert.equal(routeMUPacket(packet(new Array(n).fill(0)), {onWTTimeLeft:()=>called=true}), 'payload_short');
  assert.equal(called,false,`callback must stay atomic for ${n}B`);
}
console.log('PASS F3:22 ReceiveWTTimeLeft exact 4B contract');
