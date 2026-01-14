export function createDepthTexture(device: GPUDevice, width: number, height: number): GPUTexture {
  // Ensure canvas has valid dimensions
  const validWidth = Math.max(1, width);
  const validHeight = Math.max(1, height);

  return device.createTexture({
    label: 'Depth Texture',
    size: [validWidth, validHeight],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
}
