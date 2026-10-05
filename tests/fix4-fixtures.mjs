// Minimal valid BMD v10 input for deterministic regressions, never game data.
export function fixturePartBmd({empty=false} = {}) {
 if(empty) {
  const bytes=new Uint8Array(77);bytes.set([66,77,68,10]);const d=new DataView(bytes.buffer);d.setInt16(38,1,true);d.setInt16(75,-1,true);return bytes;
 }
 const bytes=new Uint8Array(4+38+10+48+20+8+64+32+35);const d=new DataView(bytes.buffer);let p=0;
 const text=(s,n)=>{for(let i=0;i<Math.min(s.length,n);i++)bytes[p+i]=s.charCodeAt(i);p+=n;};
 const i16=v=>{d.setInt16(p,v,true);p+=2;};const f32=v=>{d.setFloat32(p,v,true);p+=4;};
 text('BMD',3);bytes[p++]=10;text('isolated-regression',32);i16(1);i16(1);i16(0);
 for(const v of [3,1,1,1,0])i16(v);
 for(const v of [[0,0,0],[1,0,0],[0,1,0]]){i16(0);i16(0);for(const x of v)f32(x);}
 i16(0);i16(0);f32(0);f32(0);f32(1);i16(0);i16(0);f32(0);f32(0);
 const t=p;bytes[p++]=3;bytes[p++]=0;for(const v of [0,1,2,0,0,0,0,0,0,0,0,0])i16(v);p=t+64;
 text('fixture.jpg',32);bytes[p++]=0;text('root',32);i16(-1);
 if(p!==bytes.length)throw new Error('fixture byte layout');return bytes;
}
export const EMPTY_CHARSET=[0,255,255,255,255,255,0,0,0,248,0,0,240,255,255,255,0,0];
