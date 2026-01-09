export class NodeRenderer {
  draw(
    renderPass: GPURenderPassEncoder,
    pipeline: GPURenderPipeline,
    bindGroup: GPUBindGroup,
    sphereVertexCount: number,
    nodeCount: number
  ) {
    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(sphereVertexCount, nodeCount); // vertices per sphere, instanced
  }
}
