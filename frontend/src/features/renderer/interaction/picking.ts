import type { Camera } from '../types';

export function pickNode(
  ndcX: number,
  ndcY: number,
  camera: Camera,
  canvasWidth: number,
  canvasHeight: number,
  nodePositions: Float32Array | null,
  nodeCount: number
): number {
  if (!nodePositions) return -1;

  const aspect = canvasWidth / canvasHeight;

  // Calculate ray direction from camera through click point
  const tanFov = Math.tan(camera.fov / 2);

  // Get camera basis vectors
  const forward = getCameraForward(camera);
  const right = getCameraRight(camera, forward);
  const up = getCameraUp(right, forward);

  // Ray direction in world space:
  // We want to go "forward" into the scene, offset by right and up based on NDC coords
  const rayDir = new Float32Array([
    forward[0] + right[0] * ndcX * aspect * tanFov + up[0] * ndcY * tanFov,
    forward[1] + right[1] * ndcX * aspect * tanFov + up[1] * ndcY * tanFov,
    forward[2] + right[2] * ndcX * aspect * tanFov + up[2] * ndcY * tanFov,
  ]);

  // Normalize ray direction
  const rayLen = Math.sqrt(rayDir[0] ** 2 + rayDir[1] ** 2 + rayDir[2] ** 2);
  rayDir[0] /= rayLen;
  rayDir[1] /= rayLen;
  rayDir[2] /= rayLen;

  return findClosestNodeToRay(camera.position, rayDir, nodePositions, nodeCount, camera.distance);
}

export function findClosestNodeToRay(
  origin: Float32Array,
  dir: Float32Array,
  nodePositions: Float32Array,
  nodeCount: number,
  cameraDistance: number
): number {
  if (nodePositions.length === 0) return -1;

  let closestNode = -1;
  let minPerpDist = Infinity;
  let closestRayDist = Infinity;

  // Get current node size for pick radius calculation
  const nodeSize = Math.max(0.5, cameraDistance * 0.003);
  // Pick radius should be slightly larger than node visual size
  const pickRadius = nodeSize * 3;

  for (let i = 0; i < nodeCount; i++) {
    const px = nodePositions[i * 8];
    const py = nodePositions[i * 8 + 1];
    const pz = nodePositions[i * 8 + 2];

    // Vector from origin to node
    const ox = px - origin[0];
    const oy = py - origin[1];
    const oz = pz - origin[2];

    // Project onto ray (t = distance along ray to closest point)
    const t = ox * dir[0] + oy * dir[1] + oz * dir[2];
    if (t < 0) continue; // Behind camera

    // Closest point on ray
    const cx = origin[0] + dir[0] * t;
    const cy = origin[1] + dir[1] * t;
    const cz = origin[2] + dir[2] * t;

    // Perpendicular distance from node to ray
    const perpDist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2);

    // Find node with smallest perpendicular distance (closest to where we clicked)
    // If same perp distance, prefer closer node along ray
    if (perpDist < minPerpDist || (perpDist === minPerpDist && t < closestRayDist)) {
      minPerpDist = perpDist;
      closestRayDist = t;
      closestNode = i;
    }
  }

  // Reject if perpendicular distance is too large (not actually clicking on node)
  if (minPerpDist > pickRadius) {
    return -1;
  }

  return closestNode;
}

function getCameraForward(camera: Camera): Float32Array {
  return new Float32Array([
    -Math.sin(camera.theta) * Math.cos(camera.phi),
    Math.sin(camera.phi),
    -Math.cos(camera.theta) * Math.cos(camera.phi),
  ]);
}

function getCameraRight(_camera: Camera, forward: Float32Array): Float32Array {
  const worldUp = new Float32Array([0, 1, 0]);
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

function getCameraUp(right: Float32Array, forward: Float32Array): Float32Array {
  return new Float32Array([
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ]);
}
