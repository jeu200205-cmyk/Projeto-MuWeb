// PcBlowSecondary.js — verified Main 5.2 Blow 232 secondary-stage authoring.
// Rendering remains fail-closed until Web has the exact terrain-alpha / bitmap
// renderer families. This module intentionally contains no generic visuals.
export const BLOW_SECONDARY_PC_HZ = 25;
export const BLOW_TERRAIN_FIRST_TICK = 16; // desktop LifeTime 24 from root LifeTime 40
export const BLOW_TERRAIN_LIFE_TICKS = 24;
export const BLOW_TERRAIN_INITIAL_LIGHT = 1.2;
export const BLOW_TERRAIN_DECAY = 1 / 1.05;
export const BLOW_SWORD_Z = 65;
export const BLOW_SWORD_LIGHT = Object.freeze([0.5,0.5,1.0]);
export const BLOW_SUB1_LIGHT_Z = 100;
export const BLOW_SUB1_LIGHT_SCALE = 5;
export const BLOW_SUB1_PARTICLE_COUNT = 15;
export const BLOW_IMPACT_AUTHORED_TICK = 17; // desktop LifeTime 23

// Main-derived one-frame/particle call-site metadata. The exact bitmap/particle
// renderer/update families are intentionally not guessed here. These specs let
// the runtime preserve timing, offsets, light, scale and multiplicity while the
// still-unclosed presentation owners remain fail-closed.
export function blowSecondaryImpactAuthor(root, sub1) {
  return {
    authoredTick: BLOW_IMPACT_AUTHORED_TICK,
    sword: { position:[root[0],root[1]+BLOW_SWORD_Z,root[2]], light:[...BLOW_SWORD_LIGHT], oneFrame:true },
    sub1Light: { position:[sub1[0],sub1[1]+BLOW_SUB1_LIGHT_Z,sub1[2]], scale:BLOW_SUB1_LIGHT_SCALE, oneFrame:true },
    waterfall: { ownerSubtype:1, count:BLOW_SUB1_PARTICLE_COUNT, position:[...sub1], failClosedRenderer:true },
  };
}


export function blowTerrainLightForRenderedTick(renderedTick = 0) {
  const n = Math.max(0, Math.floor(Number.isFinite(renderedTick) ? renderedTick : 0));
  // MoveEffect decays before RenderObject on the first visible authored frame.
  return BLOW_TERRAIN_INITIAL_LIGHT * Math.pow(BLOW_TERRAIN_DECAY, n + 1);
}

export function blowTerrainAuraAuthor(root, sub1, threeYaw) {
  return [
    { bitmap:'BITMAP_FLARE_BLUE', ownerSubtype:0, position:[...root], yaw:-threeYaw,
      bornTick:BLOW_TERRAIN_FIRST_TICK, lifeTicks:BLOW_TERRAIN_LIFE_TICKS,
      firstLight:blowTerrainLightForRenderedTick(0), terrainAlpha:true },
    { bitmap:'BITMAP_FLARE_BLUE', ownerSubtype:1, position:[...sub1], yaw:-threeYaw,
      bornTick:BLOW_TERRAIN_FIRST_TICK, lifeTicks:BLOW_TERRAIN_LIFE_TICKS,
      firstLight:blowTerrainLightForRenderedTick(0), terrainAlpha:true },
  ];
}
