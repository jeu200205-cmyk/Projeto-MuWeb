/**
 * Main 5.2 direction bridge.
 * PC: Object.Angle[2] = (TargetAngle - 1) * 45.f.
 *
 * Physical R56.2 evidence proved the previous Web bridge carried an extra PI:
 * the body translated along the requested tile vector while Player.bmd faced
 * exactly backwards (W = movement forward + model facing rear). After the
 * current applyMuUpAxis() bridge the composed Player.bmd visual forward is +Z,
 * so MU direction 1 (0 degrees, tile Y-1 => Three +Z) must be yaw 0.
 * Keep this as the single owner for hero + remote + monster facing.
 */
export function muDirectionToPcDegrees(direction) {
    const d = Number(direction) & 0x07;
    return (d - 1) * 45;
}

export function pcDegreesToThreeYaw(degrees) {
    // MU direction 1 (0 deg) moves tile Y-1 => Three +Z. The physically
    // validated composed Player.bmd also faces +Z at outer yaw 0.
    let yaw = Number(degrees) * Math.PI / 180;
    // Keep interpolation stable around the canonical [-PI, PI) range.
    yaw = ((yaw + Math.PI) % (Math.PI * 2) + (Math.PI * 2)) % (Math.PI * 2) - Math.PI;
    return yaw;
}

export function muDirectionToThreeYaw(direction) {
    return pcDegreesToThreeYaw(muDirectionToPcDegrees(direction));
}

export function worldVectorToThreeYaw(dx, dz, fallback = 0) {
    const x = Number(dx), z = Number(dz);
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x, z) < 1e-8) return fallback;
    // Rotated composed Player.bmd forward is (+sin(yaw), +cos(yaw)).
    return Math.atan2(x, z);
}

export default muDirectionToThreeYaw;
