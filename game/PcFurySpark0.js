// PcFurySpark0.js — verified Main 5.2 Fury impact JOINT_SPARK subtype-0 authoring contract.
// This is intentionally a pure authoring kernel. Rendering stays fail-closed until
// BITMAP_JOINT_SPARK texture mapping + retained RenderJoints strip semantics are verified.
export const FURY_SPARK_COUNT = 8;
export const FURY_SPARK_SUBTYPE = 0;
export const FURY_SPARK_SCALE = 1;
export const FURY_SPARK_LIGHT = Object.freeze([1,1,1]);
export const FURY_SPARK_VELOCITY_MIN = 6;
export const FURY_SPARK_VELOCITY_SPAN = 20;
export const FURY_SPARK_LIFE_MIN = 8;
export const FURY_SPARK_LIFE_SPAN = 8;
export const FURY_SPARK_MAX_TAIL_SPAN = 2;

export function furySparkImpactAuthor(explosion, sparkBaseYaw, rand = {}) {
  const posRand = rand.position || (() => 0);
  const angleRand = rand.angle || (() => 0);
  const ctorRand = rand.constructor || (() => 0);
  const out=[];
  for(let i=0;i<FURY_SPARK_COUNT;i++) {
    const hp=posRand(i)>>>0, ha=angleRand(i)>>>0;
    const cr0=ctorRand(i*2)>>>0, cr1=ctorRand(i*2+1)>>>0;
    out.push({
      position:[explosion[0]+(hp%20)-10, explosion[1]+((hp>>>8)%20)-10, explosion[2]],
      anglePC:[-60+(ha%60),0,sparkBaseYaw+90+((ha>>>8)%30)],
      subtype:FURY_SPARK_SUBTYPE, scale:FURY_SPARK_SCALE, light:[...FURY_SPARK_LIGHT],
      velocity:FURY_SPARK_VELOCITY_MIN+(cr0%FURY_SPARK_VELOCITY_SPAN),
      lifeTicks:FURY_SPARK_LIFE_MIN+(cr1%FURY_SPARK_LIFE_SPAN), maxTailSpan:FURY_SPARK_MAX_TAIL_SPAN,
    });
  }
  return out;
}
