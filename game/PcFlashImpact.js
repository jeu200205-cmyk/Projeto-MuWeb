// PcFlashImpact.js — verified clean Main 5.2 AT_SKILL_FLASH effect-family owner.
// PC parity audit: FLASH is BITMAP_BOSS_LASER-driven; ArrowThunder is a bow-
// weapon model selected by weapon type and MUST NOT be mapped to FLASH.
// Exact bitmap filename, constructor/update, blend/light, lifetime and cleanup
// are not proven/resident in this Web snapshot, therefore renderer is fail-closed.
export function flashImpactAuthor() {
  return Object.freeze({
    skill: 'AT_SKILL_FLASH',
    effect: Object.freeze({ model: 'BITMAP_BOSS_LASER', owner: null }),
    forbiddenSubstitutions: Object.freeze(['MODEL_ARROW_THUNDER','BITMAP_LIGHTNING','THREE.Line','generic-particle']),
    renderer: 'fail-closed-until-boss-laser-asset-and-update-contract',
  });
}
