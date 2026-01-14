/**
 * Create a simple billboard geometry (2 triangles forming a diamond/quad)
 * Used for efficient GPU picking - much simpler than icosphere
 */
export interface BillboardGeometry {
  vertexData: Float32Array<ArrayBuffer>;
  vertexCount: number;
}

/**
 * Creates a diamond-shaped billboard (2 triangles)
 * Vertices are in local space and will be transformed to face camera in shader
 */
export function createBillboardGeometry(): BillboardGeometry {
  // Diamond shape: 4 vertices forming a quad
  // Each vertex is vec4: position (xyz) + padding (w)
  // Layout: top, right, bottom, left
  const vertices = new Float32Array([
    // Triangle 1: top, right, bottom
    0.0,  1.0, 0.0, 0.0,  // top
    1.0,  0.0, 0.0, 0.0,  // right
    0.0, -1.0, 0.0, 0.0,  // bottom
    
    // Triangle 2: bottom, left, top
    0.0, -1.0, 0.0, 0.0,  // bottom
    -1.0, 0.0, 0.0, 0.0,  // left
    0.0,  1.0, 0.0, 0.0,  // top
  ]);

  return {
    vertexData: vertices,
    vertexCount: 6, // 2 triangles * 3 vertices
  };
}
