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
    label: 'Compute Bind Group A',
    layout: pipelines.computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.nodeBufferA } },
      { binding: 1, resource: { buffer: buffers.nodeBufferB } },
      { binding: 2, resource: { buffer: buffers.edgeBuffer } },
      { binding: 3, resource: { buffer: buffers.simParamsBuffer } },
    ],
  });

  const computeBindGroupB = device.createBindGroup({
    label: 'Compute Bind Group B',
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
    label: 'Node Render Bind Group Opaque A',
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
    label: 'Node Render Bind Group Opaque B',
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
    label: 'Node Render Bind Group Transparent A',
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
    label: 'Node Render Bind Group Transparent B',
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
    label: 'Edge Render Bind Group A',
    layout: pipelines.edgeRenderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.uniformBuffer } },
      { binding: 1, resource: { buffer: buffers.nodeBufferA } },
      { binding: 2, resource: { buffer: buffers.edgeIndexBuffer } },
      { binding: 3, resource: { buffer: buffers.edgeHighlightingBuffer } },
    ],
  });

  const edgeRenderBindGroupB = device.createBindGroup({
    label: 'Edge Render Bind Group B',
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
    label: 'Picking Bind Group A',
    layout: pipelines.pickingPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.uniformBuffer } },
      { binding: 1, resource: { buffer: buffers.nodeBufferA } },
      { binding: 2, resource: { buffer: buffers.billboardVertexBuffer } },
    ],
  });

  const pickingBindGroupB = device.createBindGroup({
    label: 'Picking Bind Group B',
    layout: pipelines.pickingPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.uniformBuffer } },
      { binding: 1, resource: { buffer: buffers.nodeBufferB } },
      { binding: 2, resource: { buffer: buffers.billboardVertexBuffer } },
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
