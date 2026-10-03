// PcFuryStrikeCore.js — retained Main 5.2 Fury Strike finite-owner math.
// R28 closes only the evidence-backed tail + core impact BMD owners. TerrainWall-
// gated spokes/travel and bitmap/particle/water children stay fail-closed.

export const FURY_PC_HZ = 25;
export const FURY_TICK = 1 / FURY_PC_HZ;
export const FURY_TAIL_SECONDS = 0.40;
export const FURY_IMPACT_SECONDS = 0.48;
export const FURY_TRAVEL_SECONDS = 0.52;
export const FURY_ROOT_LIFE_TICKS = 20;
export const FURY_TAIL_BMD_LIFE_TICKS = 6;
export const FURY_FLASHING_LIFE_TICKS = 15;

export function furyHash(serial, sequence) {
  let x = (Math.imul(serial >>> 0, 747796405) + Math.imul(sequence >>> 0, 2891336453) + 0x9E3779B9) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13; x = Math.imul(x, 3266489917) >>> 0;
  x ^= x >>> 16; return x >>> 0;
}

export function pcAngleMatrix(angles) {
  const d = Math.PI / 180;
  const yaw = angles[2] * d, pitch = angles[1] * d, roll = angles[0] * d;
  const sy=Math.sin(yaw), cy=Math.cos(yaw), sp=Math.sin(pitch), cp=Math.cos(pitch), sr=Math.sin(roll), cr=Math.cos(roll);
  return [
    [cp*cy, sr*sp*cy-cr*sy, cr*sp*cy+sr*sy],
    [cp*sy, sr*sp*sy+cr*cy, cr*sp*sy-sr*cy],
    [-sp,   sr*cp,            cr*cp],
  ];
}
export function pcVectorRotate(v,m) {
  return [
    v[0]*m[0][0]+v[1]*m[0][1]+v[2]*m[0][2],
    v[0]*m[1][0]+v[1]*m[1][1]+v[2]*m[1][2],
    v[0]*m[2][0]+v[1]*m[2][1]+v[2]*m[2][2],
  ];
}
export function webToPc(p){ return [p[0], -p[2], p[1]]; }
export function pcToWeb(p){ return [p[0], p[2], -p[1]]; }
export function webYawToPcDeg(threeYaw){ return (Math.PI-threeYaw)*180/Math.PI; }
export function pcYawDegToWeb(pcYawDeg){ return Math.PI-pcYawDeg*Math.PI/180; }

export function furyRootAfterLifeWeb(sourceWeb, threeYaw, throughLife) {
  const start=webToPc(sourceWeb);
  const pcYaw=webYawToPcDeg(threeYaw);
  let gravity=50;
  const m=pcAngleMatrix([80,0,pcYaw+180]);
  let out=[...start];
  for(let life=20;life>=throughLife;life--){
    let count=life, addAngle=15;
    if(life>9 && life<16){count=12.5;addAngle=18;if(life===15)gravity=-gravity;}
    const a=(20-count)*addAngle*Math.PI/180;
    const direction=[0,Math.sin(a)*260,0];
    if(count<12.5 || count>12.5) gravity+=8; else gravity-=8;
    const rot=pcVectorRotate(direction,m);
    out=[start[0]+rot[0],start[1]+rot[1],start[2]+rot[2]+gravity+200];
  }
  return pcToWeb(out);
}

function rotatePcLocal(local, pcYawDeg){ return pcVectorRotate(local,pcAngleMatrix([0,0,pcYawDeg])); }

export function furyImpactWeb(sourceWeb, threeYaw, terrainHeightAt) {
  const rootWeb=furyRootAfterLifeWeb(sourceWeb,threeYaw,12);
  const rootPc=webToPc(rootWeb);
  const pcYaw=webYawToPcDeg(threeYaw);
  const rot=rotatePcLocal([-25,-80,0],pcYaw);
  const floorX=rootPc[0]+rot[0], floorY=rootPc[1]+rot[1];
  const wx=floorX, wz=-floorY;
  const terrainWebY=Number.isFinite(terrainHeightAt?.(wx,wz)) ? terrainHeightAt(wx,wz) : sourceWeb[1];
  return {
    root:rootWeb,
    floor:[wx,terrainWebY-2,wz],
    explosion:[wx,terrainWebY+25,wz],
  };
}

export function furyTailOwnersWeb(sourceWeb, threeYaw, serial=1) {
  const rootWeb=furyRootAfterLifeWeb(sourceWeb,threeYaw,14);
  const rootPc=webToPc(rootWeb), pcYaw=webYawToPcDeg(threeYaw);
  const r=rotatePcLocal([-25,-40,0],pcYaw);
  let p0=[rootPc[0]+r[0],rootPc[1]+r[1],rootPc[2]+r[2]];
  const owners=[];
  const yaw=pcYawDegToWeb(45);
  for(let i=0;i<4;i++) owners.push({path:'Skill/tail.bmd',position:pcToWeb([p0[0],p0[1],p0[2]-i*50]),yaw,scale:1,life:FURY_TAIL_BMD_LIFE_TICKS*FURY_TICK,tag:`tail-a-${i}`,kind:'tail',lifeTicks:FURY_TAIL_BMD_LIFE_TICKS});
  const h=furyHash(serial,19);
  p0=[p0[0]+20+(h%30),p0[1],p0[2]+((h>>>8)%500)-250];
  for(let i=0;i<4;i++) owners.push({path:'Skill/tail.bmd',position:pcToWeb([p0[0],p0[1],p0[2]-i*30]),yaw,scale:1,life:FURY_TAIL_BMD_LIFE_TICKS*FURY_TICK,tag:`tail-b-${i}`,kind:'tail',lifeTicks:FURY_TAIL_BMD_LIFE_TICKS});
  return owners;
}

export function furyImpactCoreOwnersWeb(sourceWeb, threeYaw, serial, terrainHeightAt) {
  const impact=furyImpactWeb(sourceWeb,threeYaw,terrainHeightAt);
  const owners=[];
  const eq=(n,lifeTicks,scale)=>owners.push({path:`Skill/EarthQuake0${n}.bmd`,position:[...impact.floor],yaw:pcYawDegToWeb(0),scale,life:lifeTicks*FURY_TICK,tag:`earthquake-${n}`,kind:'earthquake',number:n,lifeTicks});
  // Main LifeTime==11 core: 3,1,2 at the same authored floor owner.
  eq(3,35,1.5); eq(1,35,1.5); eq(2,20,1.5);
  // MODEL_WAVE / flashing is Kind=0 only. R28's network Fury owner is Kind 0.
  owners.push({path:'Skill/flashing.bmd',position:[impact.explosion[0],impact.explosion[1]-15,impact.explosion[2]],yaw:pcYawDegToWeb(0),scale:.5,life:FURY_FLASHING_LIFE_TICKS*FURY_TICK,tag:'flashing',kind:'flashing',lifeTicks:FURY_FLASHING_LIFE_TICKS});
  return {impact,owners};
}

export function furyWallAllows(wall, travelBranch=false) {
  if (!Number.isInteger(wall)) return false;
  const move=(wall&0x0004)!==0x0004, ground=(wall&0x0008)!==0x0008, water=(wall&0x0010)!==0x0010;
  // Desktop literal: impact spokes use AND; travelling 7/8 uses OR.
  return travelBranch ? (move||ground||water) : (move&&ground&&water);
}

function furyEqOwner(number, position, yawDeg, lifeTicks) {
  return {path:`Skill/EarthQuake0${number}.bmd`,position:[...position],yaw:pcYawDegToWeb(yawDeg),scale:1.5,life:lifeTicks*FURY_TICK,tag:`earthquake-${number}`,kind:'earthquake',number,lifeTicks};
}

export function furyTerrainWallOwnersWeb(sourceWeb, threeYaw, serial, terrainHeightAt, terrainWallAt) {
  if (typeof terrainHeightAt!=='function' || typeof terrainWallAt!=='function') return {impact:[],travel:[],gated:true};
  const {floor:impact}=furyImpactWeb(sourceWeb,threeYaw,terrainHeightAt);
  const impactOwners=[], travelOwners=[];
  const subtype=furyHash(serial,0)%100;
  for(let i=0;i<5;i++){
    const h=furyHash(serial,i+1), radius=100+(h%150), degrees=subtype+i*72, a=degrees*Math.PI/180;
    const x=impact[0]+Math.sin(a)*radius, z=impact[2]-Math.cos(a)*radius;
    const wall=terrainWallAt(x,z);
    if(furyWallAllows(wall,false)){
      const y=terrainHeightAt(x,z), yaw=45+((h>>>8)%30)-15;
      impactOwners.push(furyEqOwner(4,[x,y,z],yaw,35),furyEqOwner(5,[x,y,z],yaw,40));
    }
  }
  const lane=Array.from({length:5},()=>[impact[0],impact[1],impact[2]]), laneAngle=[0,0,0,0,0]; let sequence=32;
  for(let step=0;step<4;step++){
    const length=85+(furyHash(serial,sequence++)%15);
    for(let i=0;i<5;i++){
      const h=furyHash(serial,sequence++); let turn=50+(h%30); if((h&0x100)!==0)turn=-turn; laneAngle[i]+=turn;
      const degrees=laneAngle[i]+i*(62+((h>>>9)%10)), a=degrees*Math.PI/180;
      lane[i][0]+=Math.sin(a)*length; lane[i][2]-=Math.cos(a)*length;
      if(furyWallAllows(terrainWallAt(lane[i][0],lane[i][2]),true)){
        lane[i][1]=terrainHeightAt(lane[i][0],lane[i][2])+3;
        travelOwners.push(furyEqOwner(7,lane[i],degrees+270,35),furyEqOwner(8,lane[i],degrees+270,40));
      }
    }
  }
  return {impact:impactOwners,travel:travelOwners,gated:false};
}

function earthquakeBlend(number, remaining){
  let b=1;
  if(number===1||number===4||number===7)b=(remaining*.1)/3;
  else if(number===3||number===6)b=(remaining*.1)/10;
  else if(number===2)b=remaining>=10?((20-remaining)*.1):(remaining*.1);
  else if(number===5||number===8)b=remaining>=30?((40-remaining)*.1):(remaining*.1);
  return Math.max(0,Math.min(1.35,b));
}
export function furyOwnerState(spec, localAge) {
  const t=Math.max(0,localAge/FURY_TICK);
  if(spec.kind==='tail'){
    const whole=Math.floor(t),frac=t-whole;
    let fall=0,g=80;
    for(let i=0;i<whole;i++){fall+=g;g+=60;}
    fall+=g*frac;
    const remaining=Math.max(0,spec.lifeTicks-t);
    return {position:[spec.position[0],spec.position[1]-fall,spec.position[2]],scale:1,light:Math.max(0,remaining/20)};
  }
  if(spec.kind==='earthquake'){
    const remaining=Math.max(0,spec.lifeTicks-t);
    let threshold=0;
    if(spec.number===1||spec.number===4||spec.number===7)threshold=10;
    else if(spec.number===3||spec.number===6)threshold=13;
    else if(spec.number===2)threshold=5;
    else if(spec.number===5||spec.number===8)threshold=15;
    // Position drops 0.5 MU-Z per authored tick only after remaining life is below threshold.
    const moved=Math.max(0,threshold-Math.min(threshold,remaining));
    return {position:[spec.position[0],spec.position[1]-.5*moved,spec.position[2]],scale:spec.scale,light:earthquakeBlend(spec.number,remaining)};
  }
  if(spec.kind==='flashing'){
    const whole=Math.floor(t),frac=t-whole;
    let scale=.5,x=spec.position[0],y=spec.position[1],alpha=1.5;
    const stepOnce=(s=1)=>{
      const remaining=Math.max(0,spec.lifeTicks-(Math.floor(t))); // display-only interpolation; branch uses current scale
      if(scale>2){scale+=.1*s;x-=1*s;y-=1.5*s;alpha=remaining/30;}
      else{scale+=1.2*s;x-=1.2*s;y-=1.8*s;}
    };
    for(let i=0;i<whole;i++) stepOnce(1);
    if(frac>0) stepOnce(frac);
    return {position:[x,y,spec.position[2]],scale,light:Math.max(0,alpha)};
  }
  return {position:[...spec.position],scale:spec.scale,light:1};
}
