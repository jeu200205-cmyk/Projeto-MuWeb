/**
 * Main 5.2 CMapManager world predicates.
 * Web Scene.mapIndex is the asset folder number (World1 => 1) while the PC
 * owner stores WorldActive (Lorencia => 0), therefore WorldActive=mapIndex-1.
 */
export const PC_WORLD = Object.freeze({
  LORENCIA:0,
  ATLANS:7,
  BLOOD_CASTLE_FIRST:11,
  BLOOD_CASTLE_LAST:17,
  CHAOS_CASTLE_FIRST:18,
  CHAOS_CASTLE_LAST:23,
  HELLAS_FIRST:24,
  HELLAS_LAST:29,
  HELLAS_7:36,
  BLOOD_CASTLE_MASTER:52,
  CHAOS_CASTLE_MASTER:53,
  DOPPELGANGER3:67,
  NEW_CHARACTER_SCENE:74,
});

export function pcWorldActiveFromAssetWorld(worldNumber) {
  const n=Number(worldNumber);
  return Number.isFinite(n) ? Math.trunc(n)-1 : -1;
}
export function pcInBloodCastle(worldActive) {
  const w=Number(worldActive);
  return (w>=PC_WORLD.BLOOD_CASTLE_FIRST && w<=PC_WORLD.BLOOD_CASTLE_LAST) || w===PC_WORLD.BLOOD_CASTLE_MASTER;
}
export function pcInChaosCastle(worldActive) {
  const w=Number(worldActive);
  return (w>=PC_WORLD.CHAOS_CASTLE_FIRST && w<=PC_WORLD.CHAOS_CASTLE_LAST) || w===PC_WORLD.CHAOS_CASTLE_MASTER;
}
export function pcInHellas(worldActive) {
  const w=Number(worldActive);
  return (w>=PC_WORLD.HELLAS_FIRST && w<=PC_WORLD.HELLAS_LAST) || w===PC_WORLD.HELLAS_7;
}
export function pcInSwimLocomotionWorld(worldActive) {
  const w=Number(worldActive);
  return w===PC_WORLD.ATLANS || pcInHellas(w) || w===PC_WORLD.DOPPELGANGER3;
}
