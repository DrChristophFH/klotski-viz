
// Consistent color palette: Green (close/min) → Blue (far/max)
export const COLOR_PALETTE = {
  unreachable: [0.2, 0.2, 0.2],         // Dark gray
  valueMin: [0.0, 1.0, 0.0],            // Green (close to goal/start)
  valueMid: [0.0, 0.6, 1.0],            // Light blue (middle distance)
  valueMax: [0.0, 0.1, 1.0],            // Deep blue (far from goal)
  endStateHighlight: [1.0, 1.0, 0.0],   // Yellow (end state highlight)
} as const;

export const ColoringMode = {
  Spectral: 'spectral',
  DistanceToGoal: 'distance-to-goal',
  DistanceToGoalHighlighted: 'distance-to-goal-highlighted',
} as const;

export type ColoringMode = typeof ColoringMode[keyof typeof ColoringMode];

/**
 * Map a normalized value (0-1) to a color using the unified gradient
 * 0 = Green (close/start), 1 = Blue (far/end)
 */
function mapValueToColor(normalized: number): [number, number, number] {
  if (normalized < 0.5) {
    // Green to light blue
    const t = normalized * 2.0; // 0 to 1
    return [
      COLOR_PALETTE.valueMin[0] * (1 - t) + COLOR_PALETTE.valueMid[0] * t,
      COLOR_PALETTE.valueMin[1] * (1 - t) + COLOR_PALETTE.valueMid[1] * t,
      COLOR_PALETTE.valueMin[2] * (1 - t) + COLOR_PALETTE.valueMid[2] * t,
    ];
  } else {
    // Light blue to deep blue
    const t = (normalized - 0.5) * 2.0; // 0 to 1
    return [
      COLOR_PALETTE.valueMid[0] * (1 - t) + COLOR_PALETTE.valueMax[0] * t,
      COLOR_PALETTE.valueMid[1] * (1 - t) + COLOR_PALETTE.valueMax[1] * t,
      COLOR_PALETTE.valueMid[2] * (1 - t) + COLOR_PALETTE.valueMax[2] * t,
    ];
  }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = h % 360;
  if (h < 0) h += 360;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return [r + m, g + m, b + m];
}

export function generateSpectralColors(nodeCount: number): Float32Array<ArrayBuffer> {
  const colorData = new Float32Array(nodeCount * 4);

  for (let i = 0; i < nodeCount; i++) {
    const hue = (i / nodeCount) * 100;
    const rgb = hslToRgb(hue + 130, 1.0, 0.5);

    colorData[i * 4 + 0] = rgb[0];
    colorData[i * 4 + 1] = rgb[1];
    colorData[i * 4 + 2] = rgb[2];
    colorData[i * 4 + 3] = 1.0;
  }

  return colorData;
}

export function generateDistanceToGoalColors(
  distances: Float32Array,
  nodeCount: number
): Float32Array<ArrayBuffer> {
  const colorData = new Float32Array(nodeCount * 4);

  // Find max distance for normalization (excluding Infinity)
  let maxDistance = 0;
  for (let i = 0; i < nodeCount; i++) {
    if (isFinite(distances[i]) && distances[i] > maxDistance) {
      maxDistance = distances[i];
    }
  }

  // Normalize max distance for better visualization
  const normalizedMax = maxDistance > 0 ? maxDistance : 1;

  for (let i = 0; i < nodeCount; i++) {
    const distance = distances[i];
    let r = 0, g = 0, b = 0;

    if (!isFinite(distance)) {
      // Unreachable nodes: dark gray
      r = 0.3;
      g = 0.3;
      b = 0.3;
    } else if (distance === 0) {
      // Goal node: bright green
      r = 0.0;
      g = 1.0;
      b = 0.0;
    } else {
      const normalized = distance / normalizedMax;
      [r, g, b] = mapValueToColor(normalized);
    }

    colorData[i * 4 + 0] = r;
    colorData[i * 4 + 1] = g;
    colorData[i * 4 + 2] = b;
    colorData[i * 4 + 3] = 1.0;
  }

  return colorData;
}

export function generateDistanceToGoalHighlightedColors(
  distances: Float32Array<ArrayBuffer>,
  nodeCount: number,
  endStateIndices: Set<number>
): Float32Array<ArrayBuffer> {
  const colorData = new Float32Array(nodeCount * 4);

  let maxDistance = 0;
  for (let i = 0; i < nodeCount; i++) {
    if (isFinite(distances[i]) && distances[i] > maxDistance) {
      maxDistance = distances[i];
    }
  }

  const normalizedMax = maxDistance > 0 ? maxDistance : 1;

  for (let i = 0; i < nodeCount; i++) {
    const distance = distances[i];
    let r = 0, g = 0, b = 0;

    if (!isFinite(distance)) {
      [r, g, b] = COLOR_PALETTE.unreachable;
    } else if (endStateIndices.has(i)) {
      [r, g, b] = COLOR_PALETTE.endStateHighlight;
    } else {
      const normalized = distance / normalizedMax;
      [r, g, b] = mapValueToColor(normalized);
    }

    colorData[i * 4 + 0] = r;
    colorData[i * 4 + 1] = g;
    colorData[i * 4 + 2] = b;
    colorData[i * 4 + 3] = 1.0;
  }

  return colorData;
}

export function generateWeightedDistanceColors(
  distances: Float32Array,
  nodeCount: number
): Float32Array {
  const colorData = new Float32Array(nodeCount * 4);

  let maxDistance = 0;
  for (let i = 0; i < nodeCount; i++) {
    if (isFinite(distances[i]) && distances[i] > maxDistance) {
      maxDistance = distances[i];
    }
  }

  const normalizedMax = maxDistance > 0 ? maxDistance : 1;

  for (let i = 0; i < nodeCount; i++) {
    const distance = distances[i];
    let r = 0, g = 0, b = 0;

    if (!isFinite(distance)) {
      [r, g, b] = COLOR_PALETTE.unreachable;
    } else {
      const normalized = distance / normalizedMax;
      [r, g, b] = mapValueToColor(normalized);
    }

    colorData[i * 4 + 0] = r;
    colorData[i * 4 + 1] = g;
    colorData[i * 4 + 2] = b;
    colorData[i * 4 + 3] = 1.0;
  }

  return colorData;
}
