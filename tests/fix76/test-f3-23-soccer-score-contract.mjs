import assert from 'node:assert/strict';
import { routeMUPacket } from '../../protocol/MUPacketRouter.js';
const enc=(s)=>Array.from(Buffer.from(s,'latin1'));
const body=new Uint8Array(18); body.set(enc('ALPHA'),0); body[8]=7; body.set(enc('BETA'),9); body[17]=3;
let got=null;
assert.equal(routeMUPacket({headcode:0xF3,subcode:0x23,payload:body,opcodeName:'F3'}, {onSoccerScore:v=>got=v}), 'soccer_score');
assert.deepEqual(got,{team1:'ALPHA',score1:7,team2:'BETA',score2:3,observer:true});
const off=body.slice(); off[8]=0xFF; got=null; routeMUPacket({headcode:0xF3,subcode:0x23,payload:off},{onSoccerScore:v=>got=v}); assert.equal(got.observer,false);
for (const n of [0,1,17,19,20,32]) { let called=false; const r=routeMUPacket({headcode:0xF3,subcode:0x23,payload:new Uint8Array(n)},{onSoccerScore:()=>called=true}); assert.equal(r,'payload_short'); assert.equal(called,false); }
console.log('PASS F3:23 ReceiveSoccerScore exact 18B contract');
