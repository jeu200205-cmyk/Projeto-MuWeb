// Main 5.2 ZzzEffect.cpp:9848 MoveParticle WHEEL2 and :18080 RenderWheelWeapon.
// The effect is positioned on an orbit, then the render-only tilt/height is applied.
export function pcWheelWeaponPose(facing, tick, spear = false, animationFactor = 1) {
    const yaw = Number(facing) - (18 * Math.PI / 180) * Math.max(0, Number(tick) || 0);
    const radius = spear ? 180 : 150;
    return {
        position: [radius * Math.sin(yaw), 70, radius * Math.cos(yaw)],
        angles: [0, Math.PI / 2, yaw + (30 + 2 * animationFactor) * Math.PI / 180],
        radius,
    };
}

// RenderPartObject consumes OBJECT::Alpha; MU ShaderMaterial uses its own uniform.
const wheelMaterialAlpha = new WeakMap();
export function applyPcWheelWeaponAlpha(renderer, alpha) {
    renderer.group.traverse(object => {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
            if (!material) continue;
            if (!wheelMaterialAlpha.has(material)) {
                wheelMaterialAlpha.set(material, material.uniforms?.opacity?.value ?? material.opacity ?? 1);
            }
            const opacity = wheelMaterialAlpha.get(material) * alpha;
            material.transparent = true;
            material.opacity = opacity;
            if (material.uniforms?.opacity) material.uniforms.opacity.value = opacity;
            material.depthWrite = false;
        }
    });
}
