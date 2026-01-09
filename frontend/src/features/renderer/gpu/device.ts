export async function initializeWebGPU(canvas: HTMLCanvasElement): Promise<{
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
} | null> {
  if (!navigator.gpu) {
    console.error('WebGPU is not supported in this browser');
    return null;
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });

  if (!adapter) {
    console.error('Failed to get GPU adapter');
    return null;
  }

  const device = await adapter.requestDevice({
    requiredFeatures: [],
    requiredLimits: {
      maxStorageBufferBindingSize: 1024 * 1024 * 256, // 256MB
      maxBufferSize: 1024 * 1024 * 256,
    },
  });

  const context = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device,
    format,
    alphaMode: 'premultiplied',
  });

  return { device, context, format };
}
