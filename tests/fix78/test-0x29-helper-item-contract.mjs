import assert from 'node:assert/strict';
import { routeMUPacket } from '../../protocol/MUPacketRouter.js';
const packet=(body)=>({headcode:0x29,payload:Uint8Array.from(body),opcodeName:'HELPER_ITEM'});
for (const [body,expected] of [
  [[0,1,0],{index:0,time:1,animationTicks:24}],
  [[1,0x34,0x12],{index:1,time:0x1234,animationTicks:0x1234*24}],
  [[2,0xff,0xff],{index:2,time:0xffff,animationTicks:0xffff*24}],
]) { let got; assert.equal(routeMUPacket(packet(body),{onHelperItem:v=>got=v}),'helper_item'); assert.deepEqual(got,expected); }
for (const body of [[],[0],[0,1],[0,1,2,3]]) { let called=false; assert.equal(routeMUPacket(packet(body),{onHelperItem:()=>called=true}),'payload_short'); assert.equal(called,false); }
for (const idx of [3,4,255]) { let called=false; assert.equal(routeMUPacket(packet([idx,1,0]),{onHelperItem:()=>called=true}),'payload_invalid'); assert.equal(called,false); }
console.log('PASS 0x29 ReceiveHelperItem exact 3B/index/time*24 contract');
