export interface GraphBuffers {
  nodeBufferA: GPUBuffer;
  nodeBufferB: GPUBuffer;
  edgeBuffer: GPUBuffer;
  edgeIndexBuffer: GPUBuffer;
  uniformBuffer: GPUBuffer;
  simParamsBuffer: GPUBuffer;
  nodeColorBuffer: GPUBuffer;
  connectedNodesBuffer: GPUBuffer;
  nodeInstanceIndexBufferOpaque: GPUBuffer;
  nodeInstanceIndexBufferTransparent: GPUBuffer;
  nodeReadbackBuffer: GPUBuffer;
  pieceColorsBuffer: GPUBuffer;
  sphereVertexBuffer: GPUBuffer;
}

export function createNodeBuffers(
  device: GPUDevice,
  nodeData: Float32Array<ArrayBuffer>
): { bufferA: GPUBuffer; bufferB: GPUBuffer; readbackBuffer: GPUBuffer } {
  const nodeBufferSize = nodeData.byteLength;

  const bufferA = device.createBuffer({
    size: nodeBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });

  const bufferB = device.createBuffer({
    size: nodeBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });

  const readbackBuffer = device.createBuffer({
    size: nodeBufferSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(bufferA, 0, nodeData);
  device.queue.writeBuffer(bufferB, 0, nodeData);

  return { bufferA, bufferB, readbackBuffer };
}

export function createEdgeBuffers(
  device: GPUDevice,
  edgeData: Uint32Array<ArrayBuffer>,
  edgeIndexData: Uint32Array<ArrayBuffer>
): { edgeBuffer: GPUBuffer; edgeIndexBuffer: GPUBuffer } {
  const edgeBuffer = device.createBuffer({
    size: edgeData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const edgeIndexBuffer = device.createBuffer({
    size: edgeIndexData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(edgeBuffer, 0, edgeData);
  device.queue.writeBuffer(edgeIndexBuffer, 0, edgeIndexData);

  return { edgeBuffer, edgeIndexBuffer };
}

export function createUniformBuffer(device: GPUDevice): GPUBuffer {
  return device.createBuffer({
    size: 64 + 16 + 16, // mat4 + vec4 + params
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
}

export function createSimParamsBuffer(device: GPUDevice): GPUBuffer {
  // SimParams struct in WGSL is 64 bytes due to alignment:
  // 9 x f32/u32 = 36 bytes + vec3 padding (12 bytes) + alignment padding = 64 bytes
  return device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
}

export function createNodeColorBuffer(device: GPUDevice, nodeCount: number): GPUBuffer {
  const colorData = new Float32Array(nodeCount * 4);

  for (let i = 0; i < nodeCount; i++) {
    const hue = (i / nodeCount) * 100;
    const rgb = hslToRgb(hue + 130, 1.0, 0.5);

    colorData[i * 4 + 0] = rgb[0];
    colorData[i * 4 + 1] = rgb[1];
    colorData[i * 4 + 2] = rgb[2];
    colorData[i * 4 + 3] = 1.0;
  }

  const buffer = device.createBuffer({
    size: colorData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(buffer, 0, colorData);

  return buffer;
}

export function createConnectedNodesBuffer(device: GPUDevice, nodeCount: number): GPUBuffer {
  const buffer = device.createBuffer({
    size: nodeCount * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Initialize to all zeros (no selection)
  device.queue.writeBuffer(buffer, 0, new Uint32Array(nodeCount));

  return buffer;
}

export function createNodeInstanceIndexBuffers(
  device: GPUDevice,
  nodeCount: number
): { opaqueBuffer: GPUBuffer; transparentBuffer: GPUBuffer } {
  const size = Math.max(1, nodeCount) * 4;

  const opaqueBuffer = device.createBuffer({
    size,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const transparentBuffer = device.createBuffer({
    size,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Default: all nodes are drawn in the opaque pass, none in transparent.
  const allIndices = new Uint32Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) allIndices[i] = i;
  device.queue.writeBuffer(opaqueBuffer, 0, allIndices);

  return { opaqueBuffer, transparentBuffer };
}

export function createPieceColorsBuffer(device: GPUDevice, pieceColors: [number, number, number][]): GPUBuffer {
  const pieceColorData = new Float32Array(10 * 4);
  for (let i = 0; i < 10; i++) {
    const color = pieceColors[i] || [0.5, 0.5, 0.5];
    pieceColorData[i * 4 + 0] = color[0];
    pieceColorData[i * 4 + 1] = color[1];
    pieceColorData[i * 4 + 2] = color[2];
    pieceColorData[i * 4 + 3] = 1.0;
  }

  const buffer = device.createBuffer({
    size: pieceColorData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(buffer, 0, pieceColorData);

  return buffer;
}

export function createSphereVertexBuffer(device: GPUDevice, vertexData: Float32Array<ArrayBuffer>): GPUBuffer {
  const buffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(buffer, 0, vertexData);

  return buffer;
}

export function destroyBuffers(buffers: Partial<GraphBuffers>) {
  if (buffers.nodeBufferA) buffers.nodeBufferA.destroy();
  if (buffers.nodeBufferB) buffers.nodeBufferB.destroy();
  if (buffers.edgeBuffer) buffers.edgeBuffer.destroy();
  if (buffers.edgeIndexBuffer) buffers.edgeIndexBuffer.destroy();
  if (buffers.uniformBuffer) buffers.uniformBuffer.destroy();
  if (buffers.simParamsBuffer) buffers.simParamsBuffer.destroy();
  if (buffers.nodeColorBuffer) buffers.nodeColorBuffer.destroy();
  if (buffers.connectedNodesBuffer) buffers.connectedNodesBuffer.destroy();
  if (buffers.nodeInstanceIndexBufferOpaque) buffers.nodeInstanceIndexBufferOpaque.destroy();
  if (buffers.nodeInstanceIndexBufferTransparent) buffers.nodeInstanceIndexBufferTransparent.destroy();
  if (buffers.nodeReadbackBuffer) buffers.nodeReadbackBuffer.destroy();
  if (buffers.pieceColorsBuffer) buffers.pieceColorsBuffer.destroy();
  if (buffers.sphereVertexBuffer) buffers.sphereVertexBuffer.destroy();
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  if (s === 0) {
    return [l, l, l];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return [
    hue2rgb(p, q, h + 1 / 3),
    hue2rgb(p, q, h),
    hue2rgb(p, q, h - 1 / 3),
  ];
}


