/**
 * CwsParser.js — Parser do formato .cws (CameraWalkScript) do cliente MU.
 *
 * Porte de CameraMove.cpp:44 (CCameraMove::LoadCameraWalkScript):
 *   DWORD dwSign = 0x00535743  ("CWS\0")
 *   size_t size                (count de waypoints; x86 → 4 bytes)
 *   WAYPOINT[size]             (pragma pack(1) — CameraMove.h:14-25)
 *
 * WAYPOINT (28 bytes, packed):
 *   int   iIndex               @0
 *   float fCameraX             @4
 *   float fCameraY             @8
 *   float fCameraZ             @12
 *   int   iDelay               @16
 *   float fCameraMoveAccel     @20
 *   float fCameraDistanceLevel @24
 */

const CWS_SIGN = 0x00535743;

/**
 * @param {Uint8Array|ArrayBuffer} buf binário do .cws
 * @returns {{waypoints: Array<{index:number,x:number,y:number,z:number,delay:number,accel:number,distanceLevel:number}>}}
 */
export function parseCWS(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (u8.length < 12) throw new Error('CWS: arquivo curto demais');
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

    const sign = dv.getUint32(0, true);
    if (sign !== CWS_SIGN) throw new Error(`CWS: assinatura inválida 0x${sign.toString(16)}`);

    // sizeof(size_t) do cliente x86 (Main 5.2 é compilado 32-bit) = 4 bytes.
    const count = dv.getUint32(4, true);
    if (count > 4096) throw new Error(`CWS: count absurdo ${count}`);

    const WPSIZE = 28; // pragma pack(1)
    const waypoints = [];
    let off = 8;
    for (let i = 0; i < count; i++) {
        if (off + WPSIZE > u8.length) throw new Error(`CWS: truncado no waypoint ${i}`);
        waypoints.push({
            index: dv.getInt32(off, true),
            x: dv.getFloat32(off + 4, true),
            y: dv.getFloat32(off + 8, true),
            z: dv.getFloat32(off + 12, true),
            delay: dv.getInt32(off + 16, true),
            accel: dv.getFloat32(off + 20, true),
            distanceLevel: dv.getFloat32(off + 24, true),
        });
        off += WPSIZE;
    }
    return { waypoints };
}
