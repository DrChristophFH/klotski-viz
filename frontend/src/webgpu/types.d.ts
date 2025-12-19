/// <reference types="@webgpu/types" />

// Extend the global window for WebGPU
declare global {
  interface Navigator {
    gpu: GPU;
  }
}

// WGSL shader file imports
declare module '*.wgsl?raw' {
  const content: string;
  export default content;
}

declare module '*.wgsl' {
  const content: string;
  export default content;
}

export {};
