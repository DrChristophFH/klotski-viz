export interface Pipelines {
  computePipeline: GPUComputePipeline;
  nodeRenderPipeline: GPURenderPipeline;
  edgeRenderPipeline: GPURenderPipeline;
}

export async function createPipelines(
  device: GPUDevice,
  format: GPUTextureFormat,
  forceShaderSource: string,
  nodeShaderSource: string,
  edgeShaderSource: string
): Promise<Pipelines> {
  // Compute pipeline for force simulation
  const computeModule = device.createShaderModule({
    code: forceShaderSource,
  });

  const computePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: computeModule,
      entryPoint: 'main',
    },
  });

  // Render pipeline for nodes
  const nodeModule = device.createShaderModule({
    code: nodeShaderSource,
  });

  const nodeRenderPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: nodeModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: nodeModule,
      entryPoint: 'fs_main',
      targets: [{
        format: format,
        blend: {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
        },
      }],
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'none',
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
  });

  // Render pipeline for edges
  const edgeModule = device.createShaderModule({
    code: edgeShaderSource,
  });

  const edgeRenderPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: edgeModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: edgeModule,
      entryPoint: 'fs_main',
      targets: [{
        format: format,
        blend: {
          color: {
            srcFactor: 'src-alpha',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
          alpha: {
            srcFactor: 'one',
            dstFactor: 'one-minus-src-alpha',
            operation: 'add',
          },
        },
      }],
    },
    primitive: {
      topology: 'line-list',
      cullMode: 'none',
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
  });

  return { computePipeline, nodeRenderPipeline, edgeRenderPipeline };
}
