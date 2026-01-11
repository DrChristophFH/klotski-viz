import type { Camera } from '../types';
import { DEFAULT_MOVE_SPEED, DEFAULT_SPRINT_MULTIPLIER, CAMERA_TWEEN_DURATION } from '../constants';
import { createLookAtMatrix, createPerspectiveMatrix, multiplyMatrices } from '../math/mat4';

interface CameraTween {
  active: boolean;
  startPos: Float32Array;
  endPos: Float32Array;
  startOrbitTarget: Float32Array;
  endOrbitTarget: Float32Array;
  startTime: number;
  duration: number;
}

export class CameraController {
  private camera: Camera;
  private orbitTarget: Float32Array | null = null;
  private orbitDistance: number = 50;
  private cameraTween: CameraTween | null = null;
  private moveSpeed: number = DEFAULT_MOVE_SPEED;
  private sprintMultiplier: number = DEFAULT_SPRINT_MULTIPLIER;

  constructor(camera: Camera) {
    this.camera = camera;
  }

  getCamera(): Camera {
    return this.camera;
  }

  getOrbitTarget(): Float32Array | null {
    return this.orbitTarget;
  }

  setOrbitTarget(target: Float32Array | null) {
    this.orbitTarget = target;
  }

  getOrbitDistance(): number {
    return this.orbitDistance;
  }

  setOrbitDistance(distance: number) {
    this.orbitDistance = distance;
  }

  getCameraForward(): Float32Array {
    // In orbit mode, camera looks at the orbit target
    if (this.orbitTarget) {
      const dir = new Float32Array([
        this.orbitTarget[0] - this.camera.position[0],
        this.orbitTarget[1] - this.camera.position[1],
        this.orbitTarget[2] - this.camera.position[2],
      ]);
      const len = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2);
      if (len > 0.001) {
        dir[0] /= len;
        dir[1] /= len;
        dir[2] /= len;
      }
      return dir;
    }
    // FPS mode - use theta/phi angles
    return new Float32Array([
      -Math.sin(this.camera.theta) * Math.cos(this.camera.phi),
      Math.sin(this.camera.phi),
      -Math.cos(this.camera.theta) * Math.cos(this.camera.phi),
    ]);
  }

  getCameraRight(): Float32Array {
    // In orbit mode, compute right from forward x world_up
    if (this.orbitTarget) {
      const forward = this.getCameraForward();
      const worldUp = new Float32Array([0, 1, 0]);
      // right = forward x worldUp
      const right = new Float32Array([
        forward[1] * worldUp[2] - forward[2] * worldUp[1],
        forward[2] * worldUp[0] - forward[0] * worldUp[2],
        forward[0] * worldUp[1] - forward[1] * worldUp[0],
      ]);
      const len = Math.sqrt(right[0] ** 2 + right[1] ** 2 + right[2] ** 2);
      if (len > 0.001) {
        right[0] /= len;
        right[1] /= len;
        right[2] /= len;
      }
      return right;
    }
    // FPS mode - use theta angle
    return new Float32Array([
      Math.cos(this.camera.theta),
      0,
      -Math.sin(this.camera.theta),
    ]);
  }

  getCameraUp(): Float32Array {
    const forward = this.getCameraForward();
    const right = this.getCameraRight();
    // up = right x forward (for right-handed system with Y up)
    return new Float32Array([
      right[1] * forward[2] - right[2] * forward[1],
      right[2] * forward[0] - right[0] * forward[2],
      right[0] * forward[1] - right[1] * forward[0],
    ]);
  }

  updateOrbitPosition() {
    if (!this.orbitTarget) return;

    // Calculate camera position orbiting around target
    const x = this.orbitTarget[0] + this.orbitDistance * Math.sin(this.camera.theta) * Math.cos(this.camera.phi);
    const y = this.orbitTarget[1] + this.orbitDistance * Math.sin(this.camera.phi);
    const z = this.orbitTarget[2] + this.orbitDistance * Math.cos(this.camera.theta) * Math.cos(this.camera.phi);

    this.camera.position[0] = x;
    this.camera.position[1] = y;
    this.camera.position[2] = z;
  }

  /**
   * Calculate theta/phi for FPS mode from current orbit orientation.
   * In orbit mode, we're looking AT the orbitTarget, so we need to convert
   * that look direction into FPS angles.
   */
  calculateFPSAnglesFromOrbit() {
    if (!this.orbitTarget) return;

    // Get the current look direction (from camera to orbit target)
    const lookDirX = this.orbitTarget[0] - this.camera.position[0];
    const lookDirY = this.orbitTarget[1] - this.camera.position[1];
    const lookDirZ = this.orbitTarget[2] - this.camera.position[2];

    const len = Math.sqrt(lookDirX ** 2 + lookDirY ** 2 + lookDirZ ** 2);
    if (len < 0.001) return;

    const normX = lookDirX / len;
    const normY = lookDirY / len;
    const normZ = lookDirZ / len;

    // Convert look direction to theta/phi for FPS mode
    // In FPS mode: forward = (-sin(theta)*cos(phi), sin(phi), -cos(theta)*cos(phi))
    // So: theta = atan2(-lookDir.x, -lookDir.z)
    //     phi = asin(lookDir.y)
    this.camera.phi = Math.asin(Math.max(-1, Math.min(1, normY)));
    this.camera.theta = Math.atan2(-normX, -normZ);
  }

  /**
   * Calculate theta/phi for orbit mode from current camera position relative to orbit target.
   * This sets up the orbit angles so orbiting continues smoothly from current camera position.
   */
  calculateOrbitAnglesFromPosition() {
    if (!this.orbitTarget) return;

    // Get offset from orbit target to camera
    const offsetX = this.camera.position[0] - this.orbitTarget[0];
    const offsetY = this.camera.position[1] - this.orbitTarget[1];
    const offsetZ = this.camera.position[2] - this.orbitTarget[2];

    // Calculate distance
    this.orbitDistance = Math.sqrt(offsetX ** 2 + offsetY ** 2 + offsetZ ** 2);

    // In orbit mode: 
    // x = distance * sin(theta) * cos(phi)
    // y = distance * sin(phi)
    // z = distance * cos(theta) * cos(phi)
    if (this.orbitDistance > 0.001) {
      this.camera.phi = Math.asin(Math.max(-1, Math.min(1, offsetY / this.orbitDistance)));
      const cosPhi = Math.cos(this.camera.phi);
      if (Math.abs(cosPhi) > 0.001) {
        this.camera.theta = Math.atan2(offsetX / cosPhi, offsetZ / cosPhi);
      }
    }
  }

  exitOrbitMode() {
    this.calculateFPSAnglesFromOrbit();
    this.orbitTarget = null;
  }

  updateCameraMovement(keysPressed: Set<string>) {
    if (keysPressed.size === 0) return false;

    // Cancel any active tween when user takes manual control
    if (this.cameraTween?.active) {
      this.cameraTween = null;
    }

    // Exit orbit mode when using WASD - but first convert angles!
    if (this.orbitTarget) {
      this.exitOrbitMode();
    }

    const forward = this.getCameraForward();
    const right = this.getCameraRight();

    let speed = this.moveSpeed;
    if (keysPressed.has('shift')) {
      speed *= this.sprintMultiplier;
    }

    // WASD movement
    if (keysPressed.has('w')) {
      this.camera.position[0] += forward[0] * speed;
      this.camera.position[1] += forward[1] * speed;
      this.camera.position[2] += forward[2] * speed;
    }
    if (keysPressed.has('s')) {
      this.camera.position[0] -= forward[0] * speed;
      this.camera.position[1] -= forward[1] * speed;
      this.camera.position[2] -= forward[2] * speed;
    }
    if (keysPressed.has('a')) {
      this.camera.position[0] -= right[0] * speed;
      this.camera.position[1] -= right[1] * speed;
      this.camera.position[2] -= right[2] * speed;
    }
    if (keysPressed.has('d')) {
      this.camera.position[0] += right[0] * speed;
      this.camera.position[1] += right[1] * speed;
      this.camera.position[2] += right[2] * speed;
    }
    // Space/Ctrl for up/down
    if (keysPressed.has(' ')) {
      this.camera.position[1] += speed;
    }
    if (keysPressed.has('control')) {
      this.camera.position[1] -= speed;
    }

    return true;
  }

  updateCameraPosition() {
    if (this.orbitTarget) {
      // In orbit mode, camera looks at the orbit target
      this.camera.target[0] = this.orbitTarget[0];
      this.camera.target[1] = this.orbitTarget[1];
      this.camera.target[2] = this.orbitTarget[2];
    } else {
      // For FPS camera, target is position + forward direction
      const forward = this.getCameraForward();
      this.camera.target[0] = this.camera.position[0] + forward[0];
      this.camera.target[1] = this.camera.position[1] + forward[1];
      this.camera.target[2] = this.camera.position[2] + forward[2];
    }
  }

  handleOrbitRotation(dx: number, dy: number) {
    if (!this.orbitTarget) return;

    // Cancel any active tween
    if (this.cameraTween?.active) {
      this.cameraTween = null;
    }

    // Update orbit angles
    this.camera.theta -= dx * 0.005;
    this.camera.phi -= dy * 0.005;

    // Clamp phi to avoid flipping
    this.camera.phi = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.camera.phi));

    // Recalculate camera position based on orbit
    this.updateOrbitPosition();
  }

  handleFPSRotation(dx: number, dy: number) {
    // Cancel any active tween when user takes manual control
    if (this.cameraTween?.active) {
      this.cameraTween = null;
    }

    // Exit orbit mode on FPS control
    if (this.orbitTarget) {
      this.exitOrbitMode();
    }

    this.camera.theta -= dx * 0.003;
    this.camera.phi -= dy * 0.003;

    // Clamp phi to avoid flipping
    this.camera.phi = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.camera.phi));
  }

  handleWheel(deltaY: number) {
    if (this.orbitTarget) {
      // In orbit mode, adjust orbit distance
      this.orbitDistance *= (1 + deltaY * 0.001);
      this.orbitDistance = Math.max(10, Math.min(500, this.orbitDistance));
      this.updateOrbitPosition();
    } else {
      // Zoom by moving forward/backward
      const forward = this.getCameraForward();
      const zoomSpeed = deltaY * -0.5;

      this.camera.position[0] += forward[0] * zoomSpeed;
      this.camera.position[1] += forward[1] * zoomSpeed;
      this.camera.position[2] += forward[2] * zoomSpeed;
    }
  }

  focusOnNode(nodePosition: Float32Array, tweenDuration: number = CAMERA_TWEEN_DURATION) {
    const newOrbitTarget = new Float32Array(nodePosition);

    // Calculate target camera position maintaining current viewing direction
    // Get current direction from camera to current orbit target (or just use current position if no target)
    let offsetX: number, offsetY: number, offsetZ: number;

    if (this.orbitTarget) {
      // Maintain the same relative position to the orbit target
      offsetX = this.camera.position[0] - this.orbitTarget[0];
      offsetY = this.camera.position[1] - this.orbitTarget[1];
      offsetZ = this.camera.position[2] - this.orbitTarget[2];
    } else {
      // First time focusing - use default offset (behind the node on Z axis)
      offsetX = 0;
      offsetY = 0;
      offsetZ = this.orbitDistance;
    }

    // Normalize and scale to orbit distance
    const dist = Math.sqrt(offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ);
    if (dist > 0.001) {
      const scale = this.orbitDistance / dist;
      offsetX *= scale;
      offsetY *= scale;
      offsetZ *= scale;
    } else {
      offsetZ = this.orbitDistance;
    }

    const targetPos = new Float32Array([
      nodePosition[0] + offsetX,
      nodePosition[1] + offsetY,
      nodePosition[2] + offsetZ,
    ]);

    // Store start orbit target (current one, or camera target if none)
    const startOrbitTarget = this.orbitTarget
      ? new Float32Array(this.orbitTarget)
      : new Float32Array(this.camera.target);

    // Start smooth tween - interpolate both position AND orbit target
    this.cameraTween = {
      active: true,
      startPos: new Float32Array(this.camera.position),
      endPos: targetPos,
      startOrbitTarget: startOrbitTarget,
      endOrbitTarget: newOrbitTarget,
      startTime: performance.now(),
      duration: tweenDuration,
    };

    // Don't set orbitTarget immediately - let the tween handle it
  }

  updateCameraTween(): boolean {
    if (!this.cameraTween || !this.cameraTween.active) return false;

    const now = performance.now();
    const elapsed = now - this.cameraTween.startTime;
    let t = Math.min(1, elapsed / this.cameraTween.duration);

    // Ease-in-out cubic for smooth acceleration and deceleration
    t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    // Interpolate camera position
    this.camera.position[0] = this.cameraTween.startPos[0] + (this.cameraTween.endPos[0] - this.cameraTween.startPos[0]) * t;
    this.camera.position[1] = this.cameraTween.startPos[1] + (this.cameraTween.endPos[1] - this.cameraTween.startPos[1]) * t;
    this.camera.position[2] = this.cameraTween.startPos[2] + (this.cameraTween.endPos[2] - this.cameraTween.startPos[2]) * t;

    // Interpolate orbit target (what the camera looks at)
    if (!this.orbitTarget) {
      this.orbitTarget = new Float32Array(3);
    }
    this.orbitTarget[0] = this.cameraTween.startOrbitTarget[0] + (this.cameraTween.endOrbitTarget[0] - this.cameraTween.startOrbitTarget[0]) * t;
    this.orbitTarget[1] = this.cameraTween.startOrbitTarget[1] + (this.cameraTween.endOrbitTarget[1] - this.cameraTween.startOrbitTarget[1]) * t;
    this.orbitTarget[2] = this.cameraTween.startOrbitTarget[2] + (this.cameraTween.endOrbitTarget[2] - this.cameraTween.startOrbitTarget[2]) * t;

    // End tween when complete
    if (elapsed >= this.cameraTween.duration) {
      this.cameraTween.active = false;
      this.cameraTween = null;

      // Initialize orbit angles from final camera position
      // This ensures smooth orbiting immediately after tween completes
      this.calculateOrbitAnglesFromPosition();
    }

    return true;
  }

  isTweening(): boolean {
    return this.cameraTween?.active ?? false;
  }

  cancelTween() {
    if (this.cameraTween?.active) {
      this.cameraTween = null;
    }
  }

  getUniformData(canvasWidth: number, canvasHeight: number, selectedNodeIndex: number): Float32Array<ArrayBuffer> {
    const aspect = canvasWidth / canvasHeight;

    const viewMatrix = createLookAtMatrix(
      this.camera.position,
      this.camera.target,
      this.camera.up
    );

    const projMatrix = createPerspectiveMatrix(
      this.camera.fov,
      aspect,
      this.camera.near,
      this.camera.far
    );

    const viewProj = multiplyMatrices(projMatrix, viewMatrix);

    const uniformData = new Float32Array(24);
    uniformData.set(viewProj, 0);
    uniformData.set(this.camera.position, 16);
    uniformData[19] = 1.0;
    // Scale node size based on camera distance for visibility
    uniformData[20] = Math.max(0.5, this.camera.distance * 0.003); // node size - smaller nodes
    uniformData[21] = 1.0; // edge width

    // Write selected_node as int32
    const intView = new Int32Array(uniformData.buffer);
    intView[22] = selectedNodeIndex; // selected_node (-1 if none)

    uniformData[23] = 0; // padding

    return uniformData;
  }
}
