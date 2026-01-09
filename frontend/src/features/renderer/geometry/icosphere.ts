export interface SphereGeometry {
  vertexData: Float32Array<ArrayBuffer>;
  vertexCount: number;
}

export function createSphereGeometry(subdivisions: number): SphereGeometry {
  // Golden ratio for icosahedron
  const phi = (1 + Math.sqrt(5)) / 2;

  // Initial icosahedron vertices (normalized)
  const vertices: number[][] = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ].map(v => {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / len, v[1] / len, v[2] / len];
  });

  // Initial icosahedron faces (20 triangles)
  let faces: number[][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  // Subdivide faces
  const midpointCache = new Map<string, number>();

  const getMidpoint = (i1: number, i2: number): number => {
    const key = i1 < i2 ? `${i1}_${i2}` : `${i2}_${i1}`;
    if (midpointCache.has(key)) {
      return midpointCache.get(key)!;
    }

    const v1 = vertices[i1];
    const v2 = vertices[i2];
    const mid = [
      (v1[0] + v2[0]) / 2,
      (v1[1] + v2[1]) / 2,
      (v1[2] + v2[2]) / 2,
    ];

    // Normalize to sphere surface
    const len = Math.sqrt(mid[0] * mid[0] + mid[1] * mid[1] + mid[2] * mid[2]);
    mid[0] /= len;
    mid[1] /= len;
    mid[2] /= len;

    const idx = vertices.length;
    vertices.push(mid);
    midpointCache.set(key, idx);
    return idx;
  };

  for (let s = 0; s < subdivisions; s++) {
    const newFaces: number[][] = [];
    for (const face of faces) {
      const a = getMidpoint(face[0], face[1]);
      const b = getMidpoint(face[1], face[2]);
      const c = getMidpoint(face[2], face[0]);

      newFaces.push([face[0], a, c]);
      newFaces.push([face[1], b, a]);
      newFaces.push([face[2], c, b]);
      newFaces.push([a, b, c]);
    }
    faces = newFaces;
    midpointCache.clear();
  }

  // Create vertex data (3 floats per vertex, 3 vertices per face)
  // We use flat shading so each triangle has its own vertices
  const vertexData = new Float32Array(faces.length * 3 * 4); // vec3 padded to vec4 for alignment

  let idx = 0;
  for (const face of faces) {
    for (const vi of face) {
      const v = vertices[vi];
      vertexData[idx++] = v[0];
      vertexData[idx++] = v[1];
      vertexData[idx++] = v[2];
      vertexData[idx++] = 0; // padding for vec4 alignment in storage buffer
    }
  }

  const vertexCount = faces.length * 3;

  return { vertexData, vertexCount };
}
