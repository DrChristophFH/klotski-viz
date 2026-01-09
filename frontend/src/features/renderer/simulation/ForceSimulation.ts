import type { SimulationParams } from '../types';

export class ForceSimulation {
  private simParams: SimulationParams = {
    repulsionStrength: 1500.0,
    attractionStrength: 4.5,
    damping: 0.97,
    centerGravity: 0.0,
    maxSpeed: 150.0,
  };

  getParams(): SimulationParams {
    return { ...this.simParams };
  }

  setRepulsionStrength(value: number) {
    this.simParams.repulsionStrength = value;
  }

  setAttractionStrength(value: number) {
    this.simParams.attractionStrength = value;
  }

  setCenterGravity(value: number) {
    this.simParams.centerGravity = value;
  }

  setDamping(value: number) {
    this.simParams.damping = value;
  }

  setMaxSpeed(value: number) {
    this.simParams.maxSpeed = value;
  }

  getSimParamsData(nodeCount: number, edgeCount: number): Float32Array<ArrayBuffer> {
    // 16 floats = 64 bytes to match WGSL struct alignment
    const simParamsData = new Float32Array(16);
    simParamsData[0] = 1 / 60; // delta time
    simParamsData[1] = this.simParams.repulsionStrength;
    simParamsData[2] = this.simParams.attractionStrength;
    simParamsData[3] = this.simParams.damping;
    simParamsData[4] = 0.1; // min distance
    simParamsData[5] = this.simParams.maxSpeed;

    const uintView = new Uint32Array(simParamsData.buffer);
    uintView[6] = nodeCount;
    uintView[7] = edgeCount;

    simParamsData[8] = this.simParams.centerGravity;
    // Padding to fill vec3 + extra alignment
    simParamsData[9] = 0;
    simParamsData[10] = 0;
    simParamsData[11] = 0;
    simParamsData[12] = 0;
    simParamsData[13] = 0;
    simParamsData[14] = 0;
    simParamsData[15] = 0;

    return simParamsData;
  }

  dispatchCompute(
    commandEncoder: GPUCommandEncoder,
    computePipeline: GPUComputePipeline,
    bindGroup: GPUBindGroup,
    nodeCount: number
  ) {
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(Math.ceil(nodeCount / 256));
    computePass.end();
  }
}
