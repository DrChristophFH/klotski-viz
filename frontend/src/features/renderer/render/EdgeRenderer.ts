export class EdgeRenderer {
  draw(
    renderPass: GPURenderPassEncoder,
    pipeline: GPURenderPipeline,
    bindGroup: GPUBindGroup,
    edgeCount: number
  ) {
    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(2, edgeCount); // 2 vertices per line, instanced
  }
}
