export class NodeRenderer {
  /**
   * Draw nodes in a single pass (used when no selection is active)
   */
  draw(
    renderPass: GPURenderPassEncoder,
    pipeline: GPURenderPipeline,
    bindGroup: GPUBindGroup,
    sphereVertexCount: number,
    instanceCount: number
  ) {
    if (instanceCount <= 0) return;
    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(sphereVertexCount, instanceCount); // vertices per sphere, instanced
  }

  /**
   * Draw nodes with 2-pass rendering for proper transparency:
   * 1. Opaque pass: selected/connected nodes (writes to depth buffer)
   * 2. Transparent pass: non-selected nodes (reads but doesn't write depth)
   */
  drawTwoPass(
    renderPass: GPURenderPassEncoder,
    opaquePipeline: GPURenderPipeline,
    transparentPipeline: GPURenderPipeline,
    sphereVertexCount: number,
    opaqueBindGroup: GPUBindGroup,
    opaqueInstanceCount: number,
    transparentBindGroup: GPUBindGroup,
    transparentInstanceCount: number
  ) {
    // Pass 1: Opaque - draw only selected/connected nodes
    this.draw(renderPass, opaquePipeline, opaqueBindGroup, sphereVertexCount, opaqueInstanceCount);

    // Pass 2: Transparent - draw only non-selected nodes
    this.draw(renderPass, transparentPipeline, transparentBindGroup, sphereVertexCount, transparentInstanceCount);
  }
}
