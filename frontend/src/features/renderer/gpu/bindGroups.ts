import type { GraphBuffers } from './buffers';
import type { Pipelines } from './pipelines';

export interface BindGroups {
  computeBindGroupA: GPUBindGroup;
  computeBindGroupB: GPUBindGroup;
  nodeRenderBindGroupOpaqueA: GPUBindGroup;
  nodeRenderBindGroupOpaqueB: GPUBindGroup;
  nodeRenderBindGroupTransparentA: GPUBindGroup;
  nodeRenderBindGroupTransparentB: GPUBindGroup;
  edgeRenderBindGroupA: GPUBindGroup;
  edgeRenderBindGroupB: GPUBindGroup;
  pickingBindGroupA: GPUBindGroup;
  pickingBindGroupB: GPUBindGroup;
}

export function createBindGroups(
  device: GPUDevice,
  pipelines: Pipelines,
  buffers: GraphBuffers
): BindGroups {
  // Compute bind groups (ping-pong)
  const computeBindGroupA = device.createBindGroup({
    layout: pipelines.computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.nodeBufferA } },
      { binding: 1, resource: { buffer: buffers.nodeBufferB } },
      { binding: 2, resource: { buffer: buffers.edgeBuffer } },
      { binding: 3, resource: { buffer: buffers.simParamsBuffer } },
    ],
  });

  const computeBindGroupB = device.createBindGroup({
    layout: pipelines.computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.nodeBufferB } },
      { binding: 1, resource: { buffer: buffers.nodeBufferA } },
      { binding: 2, resource: { buffer: buffers.edgeBuffer } },
      { binding: 3, resource: { buffer: buffers.simParamsBuffer } },
    ],
  });

  // Node render bind groups (use layout from opaque node pipeline - both pipelines share same layout)
  const nodeRenderBindGroupOpaqueA = device.createBindGroup({
    layout: pipelines.nodeRenderPipelineOpaque.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.uniformBuffer } },
      { binding: 1, resource: { buffer: buffers.nodeBufferA } },
      { binding: 2, resource: { buffer: buffers.nodeColorBuffer } },
      { binding: 3, resource: { buffer: buffers.sphereVertexBuffer } },
      { binding: 4, resource: { buffer: buffers.connectedNodesBuffer } },
      { binding: 5, resource: { buffer: buffers.pieceColorsBuffer } },
      { binding: 6, resource: { buffer: buffers.nodeInstanceIndexBufferOpaque } },
    ],
  });

  const nodeRenderBindGroupOpaqueB = device.createBindGroup({
    layout: pipelines.nodeRenderPipelineOpaque.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.uniformBuffer } },
      { binding: 1, resource: { buffer: buffers.nodeBufferB } },
      { binding: 2, resource: { buffer: buffers.nodeColorBuffer } },
      { binding: 3, resource: { buffer: buffers.sphereVertexBuffer } },
      { binding: 4, resource: { buffer: buffers.connectedNodesBuffer } },
      { binding: 5, resource: { buffer: buffers.pieceColorsBuffer } },
      { binding: 6, resource: { buffer: buffers.nodeInstanceIndexBufferOpaque } },
    ],
  });

  const nodeRenderBindGroupTransparentA = device.createBindGroup({
    layout: pipelines.nodeRenderPipelineOpaque.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.uniformBuffer } },
      { binding: 1, resource: { buffer: buffers.nodeBufferA } },
      { binding: 2, resource: { buffer: buffers.nodeColorBuffer } },
      { binding: 3, resource: { buffer: buffers.sphereVertexBuffer } },
      { binding: 4, resource: { buffer: buffers.connectedNodesBuffer } },
      { binding: 5, resource: { buffer: buffers.pieceColorsBuffer } },
      { binding: 6, resource: { buffer: buffers.nodeInstanceIndexBufferTransparent } },
    ],
  });

  const nodeRenderBindGroupTransparentB = device.createBindGroup({
    layout: pipelines.nodeRenderPipelineOpaque.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.uniformBuffer } },
      { binding: 1, resource: { buffer: buffers.nodeBufferB } },
      { binding: 2, resource: { buffer: buffers.nodeColorBuffer } },
      { binding: 3, resource: { buffer: buffers.sphereVertexBuffer } },
      { binding: 4, resource: { buffer: buffers.connectedNodesBuffer } },
      { binding: 5, resource: { buffer: buffers.pieceColorsBuffer } },
      { binding: 6, resource: { buffer: buffers.nodeInstanceIndexBufferTransparent } },
    ],
  });

  // Edge render bind groups (use layout from edge pipeline)
  const edgeRenderBindGroupA = device.createBindGroup({
    layout: pipelines.edgeRenderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.uniformBuffer } },
      { binding: 1, resource: { buffer: buffers.nodeBufferA } },
      { binding: 2, resource: { buffer: buffers.edgeIndexBuffer } },
      { binding: 3, resource: { buffer: buffers.edgeHighlightingBuffer } },
    ],
  });

  const edgeRenderBindGroupB = device.createBindGroup({
    layout: pipelines.edgeRenderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.uniformBuffer } },
      { binding: 1, resource: { buffer: buffers.nodeBufferB } },
      { binding: 2, resource: { buffer: buffers.edgeIndexBuffer } },
      { binding: 3, resource: { buffer: buffers.edgeHighlightingBuffer } },
    ],
  });

  // Picking bind groups (for GPU-based node picking)
  const pickingBindGroupA = device.createBindGroup({
    layout: pipelines.pickingPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.uniformBuffer } },
      { binding: 1, resource: { buffer: buffers.nodeBufferA } },
      { binding: 2, resource: { buffer: buffers.sphereVertexBuffer } },
    ],
  });

  const pickingBindGroupB = device.createBindGroup({
    layout: pipelines.pickingPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.uniformBuffer } },
      { binding: 1, resource: { buffer: buffers.nodeBufferB } },
      { binding: 2, resource: { buffer: buffers.sphereVertexBuffer } },
    ],
  });

  return {
    computeBindGroupA,
    computeBindGroupB,
    nodeRenderBindGroupOpaqueA,
    nodeRenderBindGroupOpaqueB,
    nodeRenderBindGroupTransparentA,
    nodeRenderBindGroupTransparentB,
    edgeRenderBindGroupA,
    edgeRenderBindGroupB,
    pickingBindGroupA,
    pickingBindGroupB,
  };
}
