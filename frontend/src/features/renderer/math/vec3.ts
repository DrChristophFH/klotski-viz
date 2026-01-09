export function dot(a: Float32Array, b: Float32Array): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Float32Array, b: Float32Array): Float32Array {
  return new Float32Array([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]);
}

export function normalize(v: Float32Array): Float32Array {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len < 0.001) return new Float32Array([v[0], v[1], v[2]]);
  return new Float32Array([v[0] / len, v[1] / len, v[2] / len]);
}

export function subtract(a: Float32Array, b: Float32Array): Float32Array {
  return new Float32Array([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
}

export function add(a: Float32Array, b: Float32Array): Float32Array {
  return new Float32Array([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
}

export function scale(v: Float32Array, s: number): Float32Array {
  return new Float32Array([v[0] * s, v[1] * s, v[2] * s]);
}

export function length(v: Float32Array): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}
