import type { GraphBuffers } from './buffers';
import type { Pipelines } from './pipelines';

export interface BindGroups {
  computeBindGroupA: GPUBindGroup;
  computeBindGroupB: GPUBindGroup;
  nodeRenderBindGroupA: GPUBindGroup;
  nodeRenderBindGroupB: GPUBindGroup;
  edgeRenderBindGroupA: GPUBindGroup;
  edgeRenderBindGroupB: GPUBindGroup;
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

  // Node render bind groups (use layout from node pipeline)
  const nodeRenderBindGroupA = device.createBindGroup({
    layout: pipelines.nodeRenderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.uniformBuffer } },
      { binding: 1, resource: { buffer: buffers.nodeBufferA } },
      { binding: 2, resource: { buffer: buffers.nodeColorBuffer } },
      { binding: 3, resource: { buffer: buffers.sphereVertexBuffer } },
      { binding: 4, resource: { buffer: buffers.connectedNodesBuffer } },
      { binding: 5, resource: { buffer: buffers.pieceColorsBuffer } },
    ],
  });

  const nodeRenderBindGroupB = device.createBindGroup({
    layout: pipelines.nodeRenderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.uniformBuffer } },
      { binding: 1, resource: { buffer: buffers.nodeBufferB } },
      { binding: 2, resource: { buffer: buffers.nodeColorBuffer } },
      { binding: 3, resource: { buffer: buffers.sphereVertexBuffer } },
      { binding: 4, resource: { buffer: buffers.connectedNodesBuffer } },
      { binding: 5, resource: { buffer: buffers.pieceColorsBuffer } },
    ],
  });

  // Edge render bind groups (use layout from edge pipeline)
  const edgeRenderBindGroupA = device.createBindGroup({
    layout: pipelines.edgeRenderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.uniformBuffer } },
      { binding: 1, resource: { buffer: buffers.nodeBufferA } },
      { binding: 2, resource: { buffer: buffers.edgeIndexBuffer } },
    ],
  });

  const edgeRenderBindGroupB = device.createBindGroup({
    layout: pipelines.edgeRenderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.uniformBuffer } },
      { binding: 1, resource: { buffer: buffers.nodeBufferB } },
      { binding: 2, resource: { buffer: buffers.edgeIndexBuffer } },
    ],
  });

  return {
    computeBindGroupA,
    computeBindGroupB,
    nodeRenderBindGroupA,
    nodeRenderBindGroupB,
    edgeRenderBindGroupA,
    edgeRenderBindGroupB,
  };
}
