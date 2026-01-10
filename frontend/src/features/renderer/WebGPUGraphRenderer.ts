import forceShaderSource from './shaders/force.wgsl?raw';
import nodeShaderSource from './shaders/node.wgsl?raw';
import edgeShaderSource from './shaders/edge.wgsl?raw';
import pickingShaderSource from './shaders/picking.wgsl?raw';
import type { Camera, GraphData } from './types';
import { PIECE_COLORS, FPS_SAMPLE_SIZE, FPS_UPDATE_INTERVAL } from './constants';
import { CameraController } from './camera/CameraController';
import { setupInputListeners, createInputState, type InputState } from './camera/input';
import { initializeWebGPU } from './gpu/device';
import {
  createNodeBuffers,
  createEdgeBuffers,
  createUniformBuffer,
  createSimParamsBuffer,
  createNodeColorBuffer,
  createConnectedNodesBuffer,
  createNodeInstanceIndexBuffers,
  createPieceColorsBuffer,
  createSphereVertexBuffer,

  destroyBuffers,
  type GraphBuffers,
} from './gpu/buffers';
import { createPipelines, type Pipelines } from './gpu/pipelines';
import { createBindGroups, type BindGroups } from './gpu/bindGroups';
import { createDepthTexture } from './gpu/depth';
import { createSphereGeometry } from './geometry/icosphere';
import { GraphStore } from './graph/GraphStore';
import { updateConnectedNodes } from './graph/connectivity';
import { GPUPicking } from './interaction/picking';
import { ForceSimulation } from './simulation/ForceSimulation';
import { NodeRenderer } from './render/NodeRenderer';
import { EdgeRenderer } from './render/EdgeRenderer';
import { NodeReadback } from './readback/NodeReadback';

export class WebGPUGraphRenderer {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private canvas: HTMLCanvasElement;
  private format!: GPUTextureFormat;

  // Modules
  private cameraController!: CameraController;
  private graphStore: GraphStore;
  private forceSimulation: ForceSimulation;
  private nodeRenderer: NodeRenderer;
  private edgeRenderer: EdgeRenderer;
  private nodeReadback: NodeReadback;
  private gpuPicking!: GPUPicking;

  // GPU Resources
  private buffers!: GraphBuffers;
  private pipelines!: Pipelines;
  private bindGroups!: BindGroups;
  private depthTexture!: GPUTexture;
  private sphereVertexCount = 0;

  // State
  private pingPong = 0;
  private isPaused = false;
  private isInitialized = false;
  private animationFrameId: number | null = null;
  private pausedAtFrame = 0;
  private frameCount = 0;

  // Node instance list state (opaque/transparent passes)
  private opaqueNodeInstanceCount = 0;
  private transparentNodeInstanceCount = 0;

  // Input state
  private inputState: InputState;
  private cleanupInput?: () => void;

  // Node selection and hover
  private selectedNodeIndex: number = -1;
  private onNodeSelect?: (nodeId: string | null) => void;
  private onNodeHover?: (nodeId: string | null, mouseX: number, mouseY: number) => void;

  // Piece color mapping
  private pieceColorMapping: Map<number, number> = new Map();

  // FPS tracking
  private frameTimes: number[] = [];
  private lastFpsUpdate = 0;
  private currentFps = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.inputState = createInputState();
    this.graphStore = new GraphStore();
    this.forceSimulation = new ForceSimulation();
    this.nodeRenderer = new NodeRenderer();
    this.edgeRenderer = new EdgeRenderer();
    this.nodeReadback = new NodeReadback();

    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.cleanupInput = setupInputListeners(this.canvas, {
      onMouseDown: this.onMouseDown.bind(this),
      onMouseMove: this.onMouseMove.bind(this),
      onMouseUp: this.onMouseUp.bind(this),
      onWheel: this.onWheel.bind(this),
      onClick: this.onClick.bind(this),
      onContextMenu: (e) => e.preventDefault(),
      onKeyDown: this.onKeyDown.bind(this),
      onKeyUp: this.onKeyUp.bind(this),
    });
  }

  private onKeyDown(e: KeyboardEvent) {
    this.inputState.keysPressed.add(e.key.toLowerCase());
  }

  private onKeyUp(e: KeyboardEvent) {
    this.inputState.keysPressed.delete(e.key.toLowerCase());
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async onClick(_e: MouseEvent) {
    // Don't select if we were dragging
    if (this.inputState.isDragging) {
      return;
    }

    // Use GPU picking to find nearest node to cursor
    const result = await this.gpuPicking.getPickingResults();
    
    this.selectNode(result.nearestNode);
  }

  private onMouseDown(e: MouseEvent) {
    if (e.button === 0 || e.button === 1 || e.button === 2) { // Left, middle, or right click
      this.inputState.isDragging = false; // Reset dragging state on mouse down
      this.inputState.lastMouseX = e.clientX;
      this.inputState.lastMouseY = e.clientY;

      // Request pointer lock for FPS-style controls (right click)
      if (e.button === 2) {
        this.canvas.requestPointerLock();
      }
    }
  }

  private async onMouseMove(e: MouseEvent) {
    const dx = e.movementX || (e.clientX - this.inputState.lastMouseX);
    const dy = e.movementY || (e.clientY - this.inputState.lastMouseY);

    // Only set dragging if a mouse button is pressed AND we moved significantly
    if ((e.buttons !== 0) && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
      this.inputState.isDragging = true;
    }

    // Middle mouse button (4) - orbit around focused node if we have one
    if (e.buttons === 4 && this.cameraController.getOrbitTarget()) {
      this.cameraController.handleOrbitRotation(dx, dy);
    }
    // Right mouse button (2) or pointer lock - FPS look
    else if (document.pointerLockElement === this.canvas || e.buttons === 2) {
      this.cameraController.handleFPSRotation(dx, dy);
    }

    this.inputState.lastMouseX = e.clientX;
    this.inputState.lastMouseY = e.clientY;

    // Handle hover detection (when no buttons pressed, regardless of drag state)
    if (e.buttons === 0) {
      const result = await this.gpuPicking.getPickingResults();

      // Trigger hover callback for the nearest node
      if (this.onNodeHover && result.nearestNode >= 0) {
        const nodeId = this.graphStore.getNodeId(result.nearestNode);
        if (nodeId) {
          this.onNodeHover(nodeId, e.clientX, e.clientY);
        } else {
          this.onNodeHover(null, e.clientX, e.clientY);
        }
      } else if (this.onNodeHover) {
        this.onNodeHover(null, e.clientX, e.clientY);
      }
    }
  }

  private onMouseUp(e: MouseEvent) {
    if (e.button === 2 && document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    this.cameraController.handleWheel(e.deltaY);
  }

  private selectNode(index: number) {
    this.selectedNodeIndex = index;

    // Update connected nodes buffer for highlighting and rebuild instance lists
    const connectedData = updateConnectedNodes(
      index,
      this.graphStore.getNodeCount(),
      this.graphStore.getEdgeIndices(),
      this.graphStore.getEdgePieceIds(),
      this.graphStore.getEdgeCount(),
      this.pieceColorMapping,
      this.device,
      this.buffers.connectedNodesBuffer
    );

    this.updateNodeInstanceLists(connectedData);

    if (this.onNodeSelect) {
      if (index >= 0) {
        const nodeId = this.graphStore.getNodeId(index);
        if (nodeId) {
          this.onNodeSelect(nodeId);
          return;
        }
      }
      this.onNodeSelect(null);
    }
  }

  setPieceColorMapping(mapping: Map<number, number>) {
    this.pieceColorMapping = mapping;
    // Re-update connected nodes if we have a selection
    if (this.selectedNodeIndex >= 0) {
      updateConnectedNodes(
        this.selectedNodeIndex,
        this.graphStore.getNodeCount(),
        this.graphStore.getEdgeIndices(),
        this.graphStore.getEdgePieceIds(),
        this.graphStore.getEdgeCount(),
        this.pieceColorMapping,
        this.device,
        this.buffers.connectedNodesBuffer
      );
    }
  }

  setOnNodeSelect(callback: (nodeId: string | null) => void) {
    this.onNodeSelect = callback;
  }

  setOnNodeHover(callback: (nodeId: string | null, mouseX: number, mouseY: number) => void) {
    this.onNodeHover = callback;
  }

  selectNodeById(nodeId: string) {
    const index = this.graphStore.getNodeIndex(nodeId);
    if (index !== undefined) {
      this.selectedNodeIndex = index;

      // Update connected nodes for highlighting
      const connectedData = updateConnectedNodes(
        index,
        this.graphStore.getNodeCount(),
        this.graphStore.getEdgeIndices(),
        this.graphStore.getEdgePieceIds(),
        this.graphStore.getEdgeCount(),
        this.pieceColorMapping,
        this.device,
        this.buffers.connectedNodesBuffer
      );

      this.updateNodeInstanceLists(connectedData);

      // Focus camera on node
      const nodePositions = this.nodeReadback.getNodePositions();
      if (nodePositions && index >= 0) {
        const px = nodePositions[index * 8];
        const py = nodePositions[index * 8 + 1];
        const pz = nodePositions[index * 8 + 2];
        this.cameraController.focusOnNode(new Float32Array([px, py, pz]));
      }
    } else {
      this.selectedNodeIndex = -1;
      const connectedData = updateConnectedNodes(
        -1,
        this.graphStore.getNodeCount(),
        this.graphStore.getEdgeIndices(),
        this.graphStore.getEdgePieceIds(),
        this.graphStore.getEdgeCount(),
        this.pieceColorMapping,
        this.device,
        this.buffers.connectedNodesBuffer
      );
      this.updateNodeInstanceLists(connectedData);
      if (this.cameraController.getOrbitTarget()) {
        this.cameraController.exitOrbitMode();
      }
    }
  }

  getSelectedNodeIndex(): number {
    return this.selectedNodeIndex;
  }

  async initialize(): Promise<boolean> {
    const gpuResources = await initializeWebGPU(this.canvas);

    if (!gpuResources) {
      return false;
    }

    this.device = gpuResources.device;
    this.context = gpuResources.context;
    this.format = gpuResources.format;

    // Initialize camera
    const camera: Camera = {
      position: new Float32Array([0, 0, 200]),
      target: new Float32Array([0, 0, 0]),
      up: new Float32Array([0, 1, 0]),
      fov: 60 * Math.PI / 180,
      near: 0.1,
      far: 10000,
      distance: 200,
      theta: 0,
      phi: 0,
    };
    this.cameraController = new CameraController(camera);

    // Create sphere geometry
    const sphereGeometry = createSphereGeometry(2); // 2 subdivisions = 80 triangles
    this.sphereVertexCount = sphereGeometry.vertexCount;

    // Create pipelines
    this.pipelines = await createPipelines(
      this.device,
      this.format,
      forceShaderSource,
      nodeShaderSource,
      edgeShaderSource,
      pickingShaderSource
    );

    // Create depth texture
    this.depthTexture = createDepthTexture(this.device, this.canvas.width, this.canvas.height);

    // Create basic buffers that don't depend on graph data
    this.buffers = {
      uniformBuffer: createUniformBuffer(this.device),
      simParamsBuffer: createSimParamsBuffer(this.device),
      sphereVertexBuffer: createSphereVertexBuffer(this.device, sphereGeometry.vertexData),
    } as GraphBuffers;

    // Initialize GPU picking
    this.gpuPicking = new GPUPicking(this.device);
    this.gpuPicking.resize(this.canvas.width, this.canvas.height);

    this.isInitialized = true;
    return true;
  }

  loadGraphData(data: GraphData) {
    const graphData = this.graphStore.loadGraphData(data);

    // Update camera distance based on initial distribution
    const camera = this.cameraController.getCamera();
    camera.distance = this.graphStore.getInitialRadius() * 3;
    this.cameraController.updateCameraPosition();

    // Create node and edge buffers
    const nodeBuffers = createNodeBuffers(this.device, graphData.nodeData);
    this.buffers.nodeBufferA = nodeBuffers.bufferA;
    this.buffers.nodeBufferB = nodeBuffers.bufferB;
    this.buffers.nodeReadbackBuffer = nodeBuffers.readbackBuffer;

    const edgeBuffers = createEdgeBuffers(this.device, graphData.edgeData, graphData.edgeIndexData);
    this.buffers.edgeBuffer = edgeBuffers.edgeBuffer;
    this.buffers.edgeIndexBuffer = edgeBuffers.edgeIndexBuffer;

    // Create color and selection buffers
    this.buffers.nodeColorBuffer = createNodeColorBuffer(this.device, this.graphStore.getNodeCount());
    this.buffers.connectedNodesBuffer = createConnectedNodesBuffer(this.device, this.graphStore.getNodeCount());
    const instanceIndexBuffers = createNodeInstanceIndexBuffers(this.device, this.graphStore.getNodeCount());
    this.buffers.nodeInstanceIndexBufferOpaque = instanceIndexBuffers.opaqueBuffer;
    this.buffers.nodeInstanceIndexBufferTransparent = instanceIndexBuffers.transparentBuffer;
    this.buffers.pieceColorsBuffer = createPieceColorsBuffer(this.device, PIECE_COLORS);

    // Default: all nodes rendered in opaque pass
    this.opaqueNodeInstanceCount = this.graphStore.getNodeCount();
    this.transparentNodeInstanceCount = 0;

    // Create bind groups
    this.bindGroups = createBindGroups(this.device, this.pipelines, this.buffers);
  }

  private updateNodeInstanceLists(connectedData: Uint32Array | null) {
    const nodeCount = this.graphStore.getNodeCount();
    if (!this.device || !this.buffers?.nodeInstanceIndexBufferOpaque || !this.buffers?.nodeInstanceIndexBufferTransparent) {
      return;
    }

    // No selection: render all nodes in opaque pass.
    if (this.selectedNodeIndex < 0 || !connectedData) {
      const all = new Uint32Array(nodeCount);
      for (let i = 0; i < nodeCount; i++) all[i] = i;
      this.device.queue.writeBuffer(this.buffers.nodeInstanceIndexBufferOpaque, 0, all);
      this.opaqueNodeInstanceCount = nodeCount;
      this.transparentNodeInstanceCount = 0;
      return;
    }

    // Selection active: split selected/connected (opaque) vs others (transparent)
    let opaqueCount = 0;
    let transparentCount = 0;
    for (let i = 0; i < nodeCount; i++) {
      if (connectedData[i] > 0) opaqueCount++;
      else transparentCount++;
    }

    const opaqueIndices = new Uint32Array(opaqueCount);
    const transparentIndices = new Uint32Array(transparentCount);
    let oi = 0;
    let ti = 0;

    for (let i = 0; i < nodeCount; i++) {
      if (connectedData[i] > 0) opaqueIndices[oi++] = i;
      else transparentIndices[ti++] = i;
    }

    this.device.queue.writeBuffer(this.buffers.nodeInstanceIndexBufferOpaque, 0, opaqueIndices);
    this.device.queue.writeBuffer(this.buffers.nodeInstanceIndexBufferTransparent, 0, transparentIndices);
    this.opaqueNodeInstanceCount = opaqueCount;
    this.transparentNodeInstanceCount = transparentCount;
  }

  private frame = () => {
    if (!this.isInitialized || !this.device) return;

    // Skip if canvas has no size
    if (this.canvas.width === 0 || this.canvas.height === 0) {
      this.animationFrameId = requestAnimationFrame(this.frame);
      return;
    }

    // Track FPS
    const now = performance.now();
    this.frameTimes.push(now);

    // Keep only recent frames
    if (this.frameTimes.length > FPS_SAMPLE_SIZE) {
      this.frameTimes.shift();
    }

    // Update FPS every 500ms
    if (now - this.lastFpsUpdate > FPS_UPDATE_INTERVAL && this.frameTimes.length > 1) {
      const timeSpan = this.frameTimes[this.frameTimes.length - 1] - this.frameTimes[0];
      this.currentFps = Math.round((this.frameTimes.length - 1) / (timeSpan / 1000));
      this.lastFpsUpdate = now;
    }

    // Update camera movement (WASD) - disabled during tween
    if (!this.cameraController.isTweening()) {
      this.cameraController.updateCameraMovement(this.inputState.keysPressed);
    }

    // Update camera tween animation
    this.cameraController.updateCameraTween();

    this.cameraController.updateCameraPosition();

    this.frameCount++;

    // Update uniforms
    const uniformData = this.cameraController.getUniformData(
      this.canvas.width,
      this.canvas.height,
      this.selectedNodeIndex
    );
    this.device.queue.writeBuffer(this.buffers.uniformBuffer, 0, uniformData);

    // Update simulation params
    const simParamsData = this.forceSimulation.getSimParamsData(
      this.graphStore.getNodeCount(),
      this.graphStore.getEdgeCount()
    );
    this.device.queue.writeBuffer(this.buffers.simParamsBuffer, 0, simParamsData);

    const commandEncoder = this.device.createCommandEncoder();

    // Run force simulation compute pass (if not paused)
    if (!this.isPaused) {
      const bindGroup = this.pingPong === 0 ? this.bindGroups.computeBindGroupA : this.bindGroups.computeBindGroupB;
      this.forceSimulation.dispatchCompute(
        commandEncoder,
        this.pipelines.computePipeline,
        bindGroup,
        this.graphStore.getNodeCount()
      );

      this.pingPong = 1 - this.pingPong;

      // Periodically read back node positions for CPU-side picking
      if (this.nodeReadback.shouldReadback(this.frameCount, this.isPaused, this.pausedAtFrame)) {
        const sourceBuffer = this.pingPong === 0 ? this.buffers.nodeBufferA : this.buffers.nodeBufferB;
        const bufferSize = this.graphStore.getNodeCount() * 8 * 4;
        this.nodeReadback.readback(
          this.device,
          this.buffers.nodeReadbackBuffer,
          sourceBuffer,
          bufferSize,
          this.frameCount
        );
      }
    } else {
      // If paused, still need to read back node positions to keep CPU data in sync once after pause
      if (this.nodeReadback.shouldReadback(this.frameCount, this.isPaused, this.pausedAtFrame)) {
        const sourceBuffer = this.pingPong === 0 ? this.buffers.nodeBufferA : this.buffers.nodeBufferB;
        const bufferSize = this.graphStore.getNodeCount() * 8 * 4;
        this.nodeReadback.readback(
          this.device,
          this.buffers.nodeReadbackBuffer,
          sourceBuffer,
          bufferSize,
          this.frameCount
        );
      }
    }

    // Render picking pass for node selection/hover (using same buffer as main render)
    const pickingBindGroup = this.pingPong === 0 ? this.bindGroups.pickingBindGroupA : this.bindGroups.pickingBindGroupB;
    this.gpuPicking.renderPickingPass(
      commandEncoder,
      this.pipelines.pickingPipeline,
      pickingBindGroup,
      this.sphereVertexCount,
      this.graphStore.getNodeCount()
    );

    // Read back picking region around mouse cursor
    if (this.inputState.lastMouseX >= 0 && this.inputState.lastMouseY >= 0) {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = this.inputState.lastMouseX - rect.left;
      const mouseY = this.inputState.lastMouseY - rect.top;
      this.gpuPicking.analyzePickingTexture(
        commandEncoder,
        mouseX,
        mouseY,
      );
    }

    // Render pass
    const textureView = this.context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.0, g: 0.0, b: 0.02, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    const nodeBindGroupOpaque = this.pingPong === 0 ? this.bindGroups.nodeRenderBindGroupOpaqueA : this.bindGroups.nodeRenderBindGroupOpaqueB;
    const nodeBindGroupTransparent = this.pingPong === 0 ? this.bindGroups.nodeRenderBindGroupTransparentA : this.bindGroups.nodeRenderBindGroupTransparentB;
    const edgeBindGroup = this.pingPong === 0 ? this.bindGroups.edgeRenderBindGroupA : this.bindGroups.edgeRenderBindGroupB;

    // Draw edges first (behind nodes)
    this.edgeRenderer.draw(renderPass, this.pipelines.edgeRenderPipeline, edgeBindGroup, this.graphStore.getEdgeCount());

    // Draw nodes - use 2-pass rendering when a node is selected for proper transparency
    if (this.selectedNodeIndex >= 0) {
      this.nodeRenderer.drawTwoPass(
        renderPass,
        this.pipelines.nodeRenderPipelineOpaque,
        this.pipelines.nodeRenderPipelineTransparent,
        this.sphereVertexCount,
        nodeBindGroupOpaque,
        this.opaqueNodeInstanceCount,
        nodeBindGroupTransparent,
        this.transparentNodeInstanceCount
      );
    } else {
      // Single pass when nothing is selected (all nodes are opaque)
      this.nodeRenderer.draw(
        renderPass,
        this.pipelines.nodeRenderPipelineOpaque,
        nodeBindGroupOpaque,
        this.sphereVertexCount,
        this.opaqueNodeInstanceCount
      );
    }

    renderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);

    this.animationFrameId = requestAnimationFrame(this.frame);
  }

  start() {
    if (this.animationFrameId) return;
    this.frame();
  }

  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  getFPS(): number {
    return this.currentFps;
  }

  pause() {
    this.isPaused = true;
    this.pausedAtFrame = this.frameCount;
  }

  resume() {
    this.isPaused = false;
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    this.pausedAtFrame = this.isPaused ? this.frameCount : this.pausedAtFrame;
    return this.isPaused;
  }

  isReady(): boolean {
    return this.isInitialized && this.device !== undefined;
  }

  setRepulsionStrength(value: number) {
    this.forceSimulation.setRepulsionStrength(value);
  }

  setAttractionStrength(value: number) {
    this.forceSimulation.setAttractionStrength(value);
  }

  setCenterGravity(value: number) {
    this.forceSimulation.setCenterGravity(value);
  }

  setDamping(value: number) {
    this.forceSimulation.setDamping(value);
  }

  setMaxSpeed(value: number) {
    this.forceSimulation.setMaxSpeed(value);
  }

  resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;

    if (this.isInitialized) {
      this.depthTexture.destroy();
      this.depthTexture = createDepthTexture(this.device, width, height);
      
      // Resize picking textures
      if (this.gpuPicking) {
        this.gpuPicking.resize(width, height);
      }
    }
  }

  destroy() {
    this.stop();

    // Remove event listeners
    if (this.cleanupInput) {
      this.cleanupInput();
    }

    // Destroy GPU resources
    if (this.buffers) {
      destroyBuffers(this.buffers);
    }

    if (this.depthTexture) {
      this.depthTexture.destroy();
    }

    if (this.gpuPicking) {
      this.gpuPicking.destroy();
    }
  }
}
