export interface Pipelines {
  computePipeline: GPUComputePipeline;
  nodeRenderPipelineOpaque: GPURenderPipeline;
  nodeRenderPipelineTransparent: GPURenderPipeline;
  edgeRenderPipeline: GPURenderPipeline;
  pickingPipeline: GPURenderPipeline;
}

export async function createPipelines(
  device: GPUDevice,
  format: GPUTextureFormat,
  forceShaderSource: string,
  nodeShaderSource: string,
  edgeShaderSource: string,
  pickingShaderSource: string
): Promise<Pipelines> {
  // Compute pipeline for force simulation
  const computeModule = device.createShaderModule({
    label: 'ForceSim Compute Shader Module',
    code: forceShaderSource,
  });

  const computePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: computeModule,
      entryPoint: 'main',
    },
    label: 'ForceSim Compute Pipeline',
  });

  // Render pipeline for nodes (opaque pass - selected/connected nodes)
  const nodeModule = device.createShaderModule({
    label: 'NodeRender Shader Module',
    code: nodeShaderSource,
  });

  const nodeRenderPipelineOpaque = device.createRenderPipeline({
    label: 'NodeRender Opaque Pipeline',
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
      cullMode: 'back',
      frontFace: 'ccw',
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
  });

  // Create explicit pipeline layout from opaque pipeline for sharing
  const nodeRenderPipelineLayout = device.createPipelineLayout({
    label: 'NodeRender Pipeline Layout',
    bindGroupLayouts: [nodeRenderPipelineOpaque.getBindGroupLayout(0)],
  });

  // Render pipeline for nodes (transparent pass - non-selected nodes)
  // Does NOT write to depth buffer to allow proper blending
  // Uses same layout as opaque pipeline so they can share bind groups
  const nodeRenderPipelineTransparent = device.createRenderPipeline({
    label: 'NodeRender Transparent Pipeline',
    layout: nodeRenderPipelineLayout,
    vertex: {
      module: nodeModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: nodeModule,
      entryPoint: 'fs_main_transparent',
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
      cullMode: 'back',
      frontFace: 'ccw',
    },
    depthStencil: {
      depthWriteEnabled: false,  // Transparent pass doesn't write to depth
      depthCompare: 'less',
      format: 'depth24plus',
    },
  });

  // Render pipeline for edges
  const edgeModule = device.createShaderModule({
    label: 'EdgeRender Shader Module',
    code: edgeShaderSource,
  });

  const edgeRenderPipeline = device.createRenderPipeline({
    label: 'EdgeRender Pipeline',
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

  // Picking pipeline - renders node indices as colors
  const pickingModule = device.createShaderModule({
    label: 'Picking Shader Module',
    code: pickingShaderSource,
  });

  const pickingPipeline = device.createRenderPipeline({
    label: 'Picking Pipeline',
    layout: 'auto',
    vertex: {
      module: pickingModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: pickingModule,
      entryPoint: 'fs_main',
      targets: [{
        format: 'rgba8unorm',
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

  return { computePipeline, nodeRenderPipelineOpaque, nodeRenderPipelineTransparent, edgeRenderPipeline, pickingPipeline };
}
