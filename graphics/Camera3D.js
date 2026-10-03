import * as THREE from 'three';
import { Input } from '../core/Input.js';

/**
 * Camera3D.js — Main 5.2 Camera3D.cpp + ZzzScene.cpp gameplay camera owner.
 *
 * B101 source facts retained here:
 *   Restore: CameraZoom=0, CameraAngle[2]=-45, AngleY3D=0, AngleZ3D=0.
 *   F11: toggle Camera3D.
 *   F10: restore (R82 also re-enables it at the user's explicit request).
 *   MMB/arrow keys: rotate/orbit using the exact +/-4 and +/-1.3/24 steps.
 *   Wheel: CameraZoom +/-2 plus AngleY3D +/-1 and AngleZ3D +/-24.
 *   Gameplay pitch baseline: CameraAngle[0] = -48.5 + AngleY3D.
 *   Gameplay CameraFOV = 37 + CameraZoom.
 *   Default CameraDistanceTarget = 1000.
 *
 * MU is Z-up (x,y,z); Three is Y-up (x,z,-y).  update() reproduces the
 * horizontal VectorIRotate(0,-CameraDistance,0) from AngleMatrix and the PC
 * gameplay vertical owner CameraPosition[2]=HeroZ+CameraDistance-150+AngleZ3D.
 */
export class Camera3D {
    constructor(aspect = window.innerWidth / window.innerHeight) {
        this.camera = new THREE.PerspectiveCamera(37, aspect, 20, (2000 + 1458.33) * 1.4);
        this.target = new THREE.Vector3(0, 0, 0); // GameApp supplies Hero +150 Y.

        this.distance = 1000;
        this.cameraZoom = 0;
        this.cameraAngleZ = -45;
        this.angleY3D = 0;
        this.angleZ3D = 0;

        // Compatibility/public diagnostic fields kept for existing callers.
        this.rotX = 48.5;
        this.rotY = -45;
        this.defaultDistance = 1000;
        this.defaultRotX = 48.5;
        this.defaultRotY = -45;
        this.minDistance = 350;
        this.maxDistance = 1800;
        this.minRotX = 33.5; // -48.5 + (-15)
        this.maxRotX = 58.5; // -48.5 + 10

        this.camera3DEnabled = true;
        this.update();
    }

    restore() {
        this.distance = this.defaultDistance;
        this.cameraZoom = 0;
        this.cameraAngleZ = -45;
        this.angleY3D = 0;
        this.angleZ3D = 0;
        this.rotX = 48.5;
        this.rotY = -45;
        this.update();
    }

    toggleCamera3D() {
        // Camera3D.cpp::Toggle only flips the owner.  The PC does NOT restore
        // when F11 turns it off; the current orbit is kept frozen until the
        // owner is enabled again.  F10 below is the explicit restore path.
        this.camera3DEnabled = !this.camera3DEnabled;
        return this.camera3DEnabled;
    }

    _syncProjection() {
        // ZzzScene.cpp gameplay: CameraFOV = 37 + CameraZoom.
        this.camera.fov = 37 + this.cameraZoom;
        // Default camera level starts from CameraViewFar=2000 then the 3D-camera
        // branch adds 1458.33 for zoom<=0, or 458.33*(1+zoom) for zoom>0.
        const viewFar = 2000 + (this.cameraZoom > 0
            ? 458.33 + 458.33 * this.cameraZoom
            : 1458.33);
        this.camera.near = 20;
        this.camera.far = Math.max(2000, viewFar * 1.4); // BuildMVP uses *1.4.
        this.camera.updateProjectionMatrix();
    }

    /**
     * Reproduce ZzzScene::MoveMainCamera + BeginOpengl instead of an ordinary
     * lookAt orbit.
     *
     * Source ordering is important:
     *   1) CameraAngle[0/1] = 0 before AngleMatrix/VectorIRotate, so the
     *      horizontal camera offset uses yaw ONLY.  Pitch never shortens the
     *      horizontal radius.
     *   2) CameraPosition.z = Hero.z + distance - 150 + AngleZ3D.
     *   3) Only then CameraAngle[0] becomes -48.5 + AngleY3D.
     *   4) BeginOpengl applies Rx(pitch) then Rz(yaw) to the VIEW matrix.
     *
     * The previous Web path mixed pitch into the horizontal offset and then
     * used lookAt(hero), producing a different camera from the PC at every
     * non-default pitch/zoom.
     */
    update() {
        this._syncProjection();
        const pitch = THREE.MathUtils.degToRad(-48.5 + this.angleY3D);
        const yaw = THREE.MathUtils.degToRad(this.cameraAngleZ);
        const d = this.distance;

        // AngleMatrix(CameraAngle=[0,0,yaw]) + VectorIRotate((0,-d,0)).
        const muDx = -d * Math.sin(yaw);
        const muDy = -d * Math.cos(yaw);

        // target.y is HeroZ converted to Three Y plus the +150 target shim
        // supplied by GameApp.  Source final Z is HeroZ+d-150+AngleZ3D.
        const threeY = this.target.y + d - 300 + this.angleZ3D;
        this.camera.position.set(
            this.target.x + muDx,
            threeY,
            this.target.z - muDy,
        );

        // Inverse of PC view rotation Rx(pitch)*Rz(yaw), applied to OpenGL
        // forward (0,0,-1), then MU Z-up -> Three Y-up (x,z,-y).
        const sp = Math.sin(pitch), cp = Math.cos(pitch);
        const sy = Math.sin(yaw), cy = Math.cos(yaw);
        const fMuX = -sp * sy;
        const fMuY = -sp * cy;
        const fMuZ = -cp;
        const forward = new THREE.Vector3(fMuX, fMuZ, -fMuY).normalize();
        this.camera.lookAt(this.camera.position.clone().add(forward));
        this.camera.updateMatrixWorld(true);

        this.rotX = 48.5 - this.angleY3D;
        this.rotY = this.cameraAngleZ;
    }

    _rotateVertical(delta) {
        if (delta > 0) {
            if (this.angleY3D < 10) {
                this.angleY3D = Math.min(10, this.angleY3D + delta);
                this.angleZ3D += 24.0 * (delta / 1.3);
            }
        } else if (delta < 0) {
            if (this.angleY3D > -15) {
                this.angleY3D = Math.max(-15, this.angleY3D + delta);
                this.angleZ3D += 24.0 * (delta / 1.3);
            }
        }
    }

    /** Main 5.2 Camera3D::Update input owner. */
    processInput() {
        if (Input.isKeyPressed('F11')) {
            const enabled = this.toggleCamera3D();
            console.info(`[Camera3D R82] F11 ${enabled ? 'ON' : 'OFF'}`);
            this.update();
            return;
        }

        if (Input.isKeyPressed('F10')) {
            // PC Restore is source-owned. The user explicitly requested F10 to
            // reactivate the Web owner too, so restore cannot leave it disabled.
            this.camera3DEnabled = true;
            this.restore();
            console.info('[Camera3D R82] F10 restore + ON');
            return;
        }

        if (this.camera3DEnabled) {
            if (Input.isMBtnDown()) {
                const dx = Input.getMouseDeltaX();
                const dy = Input.getMouseDeltaY();
                if (dx > 0) this.cameraAngleZ -= 4;
                else if (dx < 0) this.cameraAngleZ += 4;
                if (dy > 0 && this.angleY3D < 10) {
                    this.angleY3D = Math.min(10, this.angleY3D + 1.3);
                    this.angleZ3D += 24.0;
                } else if (dy < 0 && this.angleY3D > -15) {
                    this.angleY3D = Math.max(-15, this.angleY3D - 1.3);
                    this.angleZ3D -= 24.0;
                }
            }

            if (Input.isKeyDown('ArrowRight')) this.cameraAngleZ -= 4;
            if (Input.isKeyDown('ArrowLeft')) this.cameraAngleZ += 4;
            if (Input.isKeyDown('ArrowDown') && this.angleY3D < 5) {
                this.angleY3D = Math.min(5, this.angleY3D + 1.3);
                this.angleZ3D += 24.0;
            }
            if (Input.isKeyDown('ArrowUp') && this.angleY3D > -15) {
                this.angleY3D = Math.max(-15, this.angleY3D - 1.3);
                this.angleZ3D -= 24.0;
            }

            const wheel = Input.wheel;
            if (wheel > 0 && this.cameraZoom > -15) {
                this.cameraZoom = Math.max(-15, this.cameraZoom - 2);
                if (this.angleY3D > -20) {
                    this.angleY3D -= 1.0;
                    this.angleZ3D -= 24.0;
                }
            } else if (wheel < 0 && this.cameraZoom < 12) {
                this.cameraZoom = Math.min(12, this.cameraZoom + 2);
                if (this.angleY3D < 10) {
                    this.angleY3D += 1.0;
                    this.angleZ3D += 24.0;
                }
            }
        }
        this.update();
    }

    setTarget(x, y, z) {
        this.target.set(x, y, z);
    }

    getTarget() { return this.target; }

    onResize(aspect) {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
    }

    get threeCamera() { return this.camera; }
}
