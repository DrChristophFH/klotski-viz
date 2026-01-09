import { READBACK_INTERVAL } from '../constants';

export class NodeReadback {
  private isReadingBack = false;
  private lastReadbackFrame = -1;
  private nodePositions: Float32Array | null = null;

  isReading(): boolean {
    return this.isReadingBack;
  }

  getNodePositions(): Float32Array | null {
    return this.nodePositions;
  }

  shouldReadback(frameCount: number, isPaused: boolean, pausedAtFrame: number): boolean {
    if (this.isReadingBack) return false;

    if (!isPaused) {
      return frameCount % READBACK_INTERVAL === 0;
    } else {
      // If paused, still need to read back node positions to keep CPU data in sync once after pause
      return pausedAtFrame > this.lastReadbackFrame;
    }
  }

  async readback(
    device: GPUDevice,
    readbackBuffer: GPUBuffer,
    sourceBuffer: GPUBuffer,
    bufferSize: number,
    frameCount: number
  ): Promise<void> {
    if (this.isReadingBack) return;

    this.isReadingBack = true;

    try {
      // Create a command to copy node buffer to readback buffer
      const commandEncoder = device.createCommandEncoder();
      commandEncoder.copyBufferToBuffer(sourceBuffer, 0, readbackBuffer, 0, bufferSize);
      device.queue.submit([commandEncoder.finish()]);

      // Map the buffer and read data
      await readbackBuffer.mapAsync(GPUMapMode.READ);
      const mappedRange = readbackBuffer.getMappedRange();
      const positionData = new Float32Array(mappedRange.slice(0));
      readbackBuffer.unmap();

      // Update CPU-side positions
      this.nodePositions = positionData;
      this.lastReadbackFrame = frameCount;
    } catch (e) {
      console.error('Failed to read back node positions:', e);
    } finally {
      this.isReadingBack = false;
    }
  }
}
