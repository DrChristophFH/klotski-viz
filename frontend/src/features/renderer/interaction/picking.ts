/**
 * GPU-based node picking using offscreen rendering to a picking texture
 * and GPU compute shader for analysis
 */

import pickingComputeShader from '../shaders/picking-compute.wgsl?raw';

const PICKING_SCALE = 1.0;
const HOVER_RADIUS_PX = 20; // Hover detection radius in pixels

// Results buffer layout: nearestNode (i32), nearestDistance (f32), padding (vec2<f32>)
const RESULTS_BUFFER_SIZE = 4 + 4 + 8;

export class GPUPicking {
  private device: GPUDevice;
  private pickingTexture!: GPUTexture;
  private pickingDepthTexture!: GPUTexture;
  private pickingWidth = 0;
  private pickingHeight = 0;
  
  // Compute shader resources
  private computePipeline!: GPUComputePipeline;
  private paramsBuffer: GPUBuffer;
  private resultsBuffer: GPUBuffer;
  private resultsReadbackBuffer: GPUBuffer;
  private computeBindGroup!: GPUBindGroup;
  
  private pendingReadback: Promise<void> | null = null;
  private pendingMapping: Promise<void> | null = null;
  private lastReadbackData: Uint8Array | null = null;

  constructor(device: GPUDevice) {
    this.device = device;
    
    // Create params buffer
    this.paramsBuffer = device.createBuffer({
      size: 6 * 4, // 6 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    
    // Create results buffer (GPU-side)
    this.resultsBuffer = device.createBuffer({
      size: RESULTS_BUFFER_SIZE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    
    // Create results readback buffer (CPU-accessible)
    this.resultsReadbackBuffer = device.createBuffer({
      size: RESULTS_BUFFER_SIZE,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    
    // Create compute pipeline
    this.createComputePipeline();
  }

  /**
   * Create compute pipeline for picking analysis
   */
  private createComputePipeline() {
    const computeModule = this.device.createShaderModule({
      code: pickingComputeShader,
    });
    
    this.computePipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: computeModule,
        entryPoint: 'main',
      },
    });
  }

  /**
   * Create or resize picking textures to match canvas size
   */
  resize(canvasWidth: number, canvasHeight: number) {
    this.pickingWidth = Math.max(1, Math.floor(canvasWidth * PICKING_SCALE));
    this.pickingHeight = Math.max(1, Math.floor(canvasHeight * PICKING_SCALE));

    // Destroy old textures
    if (this.pickingTexture) {
      this.pickingTexture.destroy();
    }
    if (this.pickingDepthTexture) {
      this.pickingDepthTexture.destroy();
    }

    // Create new picking texture
    this.pickingTexture = this.device.createTexture({
      size: { width: this.pickingWidth, height: this.pickingHeight },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    // Create depth texture for picking pass
    this.pickingDepthTexture = this.device.createTexture({
      size: { width: this.pickingWidth, height: this.pickingHeight },
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    
    // Recreate bind group with new texture
    this.createComputeBindGroup();
  }
  
  /**
   * Create bind group for compute shader
   */
  private createComputeBindGroup() {
    this.computeBindGroup = this.device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: this.pickingTexture.createView(),
        },
        {
          binding: 1,
          resource: {
            buffer: this.paramsBuffer,
          },
        },
        {
          binding: 2,
          resource: {
            buffer: this.resultsBuffer,
          },
        },
      ],
    });
  }

  /**
   * Render nodes to picking texture
   */
  renderPickingPass(
    commandEncoder: GPUCommandEncoder,
    pipeline: GPURenderPipeline,
    bindGroup: GPUBindGroup,
    sphereVertexCount: number,
    nodeCount: number
  ) {
    const pickingPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.pickingTexture.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: this.pickingDepthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    pickingPass.setPipeline(pipeline);
    pickingPass.setBindGroup(0, bindGroup);
    pickingPass.draw(sphereVertexCount, nodeCount, 0, 0);
    pickingPass.end();
  }

  /**
   * Read back a region around the mouse cursor from the picking texture
   */
  analyzePickingTexture(
    commandEncoder: GPUCommandEncoder,
    mouseX: number,
    mouseY: number,
  ) {
    // Skip if a readback or mapping is already in progress
    // (can't copy to a buffer that's mapped)
    if (this.pendingReadback || this.pendingMapping) {
      return;
    }
    
    // Update params buffer with mouse position and settings
    const paramsData = new Float32Array([
      mouseX,
      mouseY,
      this.pickingWidth,
      this.pickingHeight,
      HOVER_RADIUS_PX,
      PICKING_SCALE,
    ]);
    this.device.queue.writeBuffer(this.paramsBuffer, 0, paramsData);
    
    // Run compute shader
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroup);
    computePass.dispatchWorkgroups(1);
    computePass.end();
    
    // Copy results to readback buffer
    commandEncoder.copyBufferToBuffer(
      this.resultsBuffer,
      0,
      this.resultsReadbackBuffer,
      0,
      RESULTS_BUFFER_SIZE
    );

    // Mark that we have a pending readback (will be mapped in getPickingResults)
    this.pendingReadback = Promise.resolve();
  }

  /**
   * Get the nearest node to the cursor within hover radius
   */
  async getPickingResults(): Promise<{ nearestNode: number; distance: number }> {
    // If there's already a mapping in progress, wait for it
    if (this.pendingMapping) {
      await this.pendingMapping;
      // Return cached results
      if (!this.lastReadbackData) {
        return { nearestNode: -1, distance: Infinity };
      }
    } else if (this.pendingReadback) {
      // Wait for pending readback and then map the buffer
      await this.pendingReadback;
      this.pendingReadback = null;
      
      // Now map and read the buffer
      this.pendingMapping = this.resultsReadbackBuffer.mapAsync(GPUMapMode.READ).then(() => {
        const mappedRange = this.resultsReadbackBuffer.getMappedRange();
        this.lastReadbackData = new Uint8Array(mappedRange).slice(); // Copy data
        this.resultsReadbackBuffer.unmap();
        this.pendingMapping = null;
      });
      
      await this.pendingMapping;
    }

    if (!this.lastReadbackData) {
      return { nearestNode: -1, distance: Infinity };
    }

    // Parse results from buffer
    const view = new DataView(this.lastReadbackData.buffer);
    const nearestNode = view.getInt32(0, true); // little-endian
    const distance = view.getFloat32(4, true);

    return { nearestNode, distance };
  }

  getPickingTextureSize(): { width: number; height: number } {
    return { width: this.pickingWidth, height: this.pickingHeight };
  }

  destroy() {
    if (this.pickingTexture) {
      this.pickingTexture.destroy();
    }
    if (this.pickingDepthTexture) {
      this.pickingDepthTexture.destroy();
    }
    this.paramsBuffer.destroy();
    this.resultsBuffer.destroy();
    this.resultsReadbackBuffer.destroy();
  }
}
