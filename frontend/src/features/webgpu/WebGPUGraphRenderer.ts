/**
 * WebGPU-based Force-Directed Graph Renderer
 * 
 * This class handles:
 * 1. GPU-accelerated force-directed layout simulation
 * 2. Efficient instanced rendering of nodes and edges
 * 3. Camera controls and interaction
 */

import forceShaderSource from './shaders/force.wgsl?raw';
import nodeShaderSource from './shaders/node.wgsl?raw';
import edgeShaderSource from './shaders/edge.wgsl?raw';

export interface GraphNode {
  id: string;
  x?: number;
  y?: number;
  z?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  piece_id?: number;  // For Klotski: which piece moves for this transition
  rgba?: [number, number, number, number];  // RGBA color, uses gray if undefined
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface SimulationParams {
  repulsionStrength: number;
  attractionStrength: number;
  damping: number;
  centerGravity: number;
  maxSpeed: number;
}

interface Camera {
  position: Float32Array;
  target: Float32Array;
  up: Float32Array;
  fov: number;
  near: number;
  far: number;
  distance: number;
  theta: number;  // horizontal rotation
  phi: number;    // vertical rotation
}

export class WebGPUGraphRenderer {
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private canvas: HTMLCanvasElement;
  private format!: GPUTextureFormat;
  
  // Buffers
  private nodeBufferA!: GPUBuffer;
  private nodeBufferB!: GPUBuffer;
  private edgeBuffer!: GPUBuffer;
  private edgeIndexBuffer!: GPUBuffer;
  private edgeColorBuffer!: GPUBuffer;
  private uniformBuffer!: GPUBuffer;
  private simParamsBuffer!: GPUBuffer;
  private nodeColorBuffer!: GPUBuffer;
  private connectedNodesBuffer!: GPUBuffer; // Bitfield of connected nodes for highlighting
  private nodeReadbackBuffer!: GPUBuffer; // For reading node positions back to CPU
  
  // Pipelines
  private computePipeline!: GPUComputePipeline;
  private nodeRenderPipeline!: GPURenderPipeline;
  private edgeRenderPipeline!: GPURenderPipeline;
  
  // Bind groups
  private computeBindGroupA!: GPUBindGroup;
  private computeBindGroupB!: GPUBindGroup;
  private nodeRenderBindGroupA!: GPUBindGroup;
  private nodeRenderBindGroupB!: GPUBindGroup;
  private edgeRenderBindGroupA!: GPUBindGroup;
  private edgeRenderBindGroupB!: GPUBindGroup;
  
  // State
  private nodeCount = 0;
  private edgeCount = 0;
  private pingPong = 0;
  private isPaused = false;
  private isInitialized = false;
  private animationFrameId: number | null = null;
  private lastReadbackFrame = -1;
  private pausedAtFrame = 0;
  
  // Camera - FPS style
  private camera: Camera;
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  
  // Keyboard state for WASD
  private keysPressed: Set<string> = new Set();
  private moveSpeed = 2.0;
  private sprintMultiplier = 3.0;
  
  // Node selection
  private selectedNodeIndex: number = -1;
  private onNodeSelect?: (nodeId: string | null) => void;
  private isReadingBack = false; // Flag to prevent multiple concurrent readbacks
  
  // Camera tweening
  private cameraTween: {
    active: boolean;
    startPos: Float32Array;
    endPos: Float32Array;
    startOrbitTarget: Float32Array;
    endOrbitTarget: Float32Array;
    startTime: number;
    duration: number;
  } | null = null;
  
  // Orbit mode - when focused on a node, orbit around it
  private orbitTarget: Float32Array | null = null;
  
  // Bound event handlers (for proper removal)
  private boundOnMouseDown!: (e: MouseEvent) => void;
  private boundOnMouseMove!: (e: MouseEvent) => void;
  private boundOnMouseUp!: (e: MouseEvent) => void;
  private boundOnWheel!: (e: WheelEvent) => void;
  private boundOnClick!: (e: MouseEvent) => void;
  private boundOnContextMenu!: (e: Event) => void;
  private boundOnKeyDown!: (e: KeyboardEvent) => void;
  private boundOnKeyUp!: (e: KeyboardEvent) => void;
  private orbitDistance: number = 50;
  
  // Simulation parameters
  private simParams: SimulationParams = {
    repulsionStrength: 1500.0,
    attractionStrength: 4.5,
    damping: 0.97,
    centerGravity: 0.0,
    maxSpeed: 150.0,
  };
  
  // Depth texture
  private depthTexture!: GPUTexture;
  
  // Sphere geometry for node rendering
  private sphereVertexBuffer!: GPUBuffer;
  private sphereVertexCount = 0;
  
  // Node id to index mapping
  private nodeIdToIndex: Map<string, number> = new Map();
  
  // Solution path tracking
  private solutionPath: string[] = [];
  
  // Store edge indices for connectivity queries
  private edgeIndices: Uint32Array | null = null;
  
  // Store piece_id per edge for coloring neighbors
  private edgePieceIds: Uint32Array | null = null;
  
  // Piece colors buffer for highlighting neighbors
  private pieceColorsBuffer!: GPUBuffer;
  
  // Klotski piece colors - vibrant, distinct Material Design colors
  private readonly PIECE_COLORS: [number, number, number][] = [
    [0.95, 0.26, 0.21],  // 0: Vibrant Red (#F44336)
    [0.13, 0.59, 0.95],  // 1: Bright Blue (#2196F3)
    [0.30, 0.69, 0.31],  // 2: Forest Green (#4CAF50)
    [1.00, 0.76, 0.03],  // 3: Golden Yellow (#FFC107)
    [0.61, 0.15, 0.69],  // 4: Deep Purple (#9C27B0)
    [0.00, 0.74, 0.83],  // 5: Cyan (#00BCD4)
    [1.00, 0.34, 0.13],  // 6: Deep Orange (#FF5722)
    [0.91, 0.12, 0.39],  // 7: Pink (#E91E63)
    [0.55, 0.76, 0.29],  // 8: Lime Green (#8BC34A)
    [0.40, 0.23, 0.72],  // 9: Indigo (#673AB7)
  ];
  
  // Piece color mapping: maps piece_id -> color_index for syncing with KlotskiPuzzle
  private pieceColorMapping: Map<number, number> = new Map();
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    
    this.camera = {
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
    
    this.setupEventListeners();
  }
  
  private setupEventListeners() {
    // Store bound references so we can remove them later
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
    this.boundOnWheel = this.onWheel.bind(this);
    this.boundOnClick = this.onClick.bind(this);
    this.boundOnContextMenu = (e) => e.preventDefault();
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnKeyUp = this.onKeyUp.bind(this);
    
    this.canvas.addEventListener('mousedown', this.boundOnMouseDown);
    this.canvas.addEventListener('mousemove', this.boundOnMouseMove);
    this.canvas.addEventListener('mouseup', this.boundOnMouseUp);
    this.canvas.addEventListener('mouseleave', this.boundOnMouseUp);
    this.canvas.addEventListener('wheel', this.boundOnWheel);
    this.canvas.addEventListener('click', this.boundOnClick);
    this.canvas.addEventListener('contextmenu', this.boundOnContextMenu);
    
    // Keyboard events for WASD
    window.addEventListener('keydown', this.boundOnKeyDown);
    window.addEventListener('keyup', this.boundOnKeyUp);
  }
  
  private onKeyDown(e: KeyboardEvent) {
    this.keysPressed.add(e.key.toLowerCase());
  }
  
  private onKeyUp(e: KeyboardEvent) {
    this.keysPressed.delete(e.key.toLowerCase());
  }
  
  private onClick(e: MouseEvent) {
    // Don't select if we were dragging
    if (this.isDragging) {
      return;
    }
    
    // Raycast to find clicked node
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    const nodeIndex = this.pickNode(x, y);
    this.selectNode(nodeIndex);
  }
  
  private onMouseDown(e: MouseEvent) {
    if (e.button === 0 || e.button === 1 || e.button === 2) { // Left, middle, or right click
      this.isDragging = false; // Reset dragging state on mouse down
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      
      // Request pointer lock for FPS-style controls (right click)
      if (e.button === 2) {
        this.canvas.requestPointerLock();
      }
    }
  }

  private exitOrbtitMode() {
    this.calculateFPSAnglesFromOrbit();
    this.orbitTarget = null;
  }
  
  private onMouseMove(e: MouseEvent) {
    const dx = e.movementX || (e.clientX - this.lastMouseX);
    const dy = e.movementY || (e.clientY - this.lastMouseY);
    
    // Only set dragging if a mouse button is pressed AND we moved significantly
    if ((e.buttons !== 0) && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
      this.isDragging = true;
    }
    
    // Middle mouse button (4) - orbit around focused node if we have one
    if (e.buttons === 4 && this.orbitTarget) {
      // Cancel any active tween
      if (this.cameraTween?.active) {
        this.cameraTween = null;
      }
      
      // Update orbit angles
      this.camera.theta -= dx * 0.005;
      this.camera.phi -= dy * 0.005;
      
      // Clamp phi to avoid flipping
      this.camera.phi = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, this.camera.phi));
      
      // Recalculate camera position based on orbit
      this.updateOrbitPosition();
    }
    // Right mouse button (2) or pointer lock - FPS look
    else if (document.pointerLockElement === this.canvas || e.buttons === 2) {
      // Cancel any active tween when user takes manual control
      if (this.cameraTween?.active) {
        this.cameraTween = null;
      }
      
      // Exit orbit mode on FPS control
      if (this.orbitTarget) {
        this.exitOrbtitMode();
      }
      
      this.camera.theta -= dx * 0.003;
      this.camera.phi -= dy * 0.003;
      
      // Clamp phi to avoid flipping
      this.camera.phi = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.camera.phi));
    }
    
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }
  
  private updateOrbitPosition() {
    if (!this.orbitTarget) return;
    
    // Calculate camera position orbiting around target
    const x = this.orbitTarget[0] + this.orbitDistance * Math.sin(this.camera.theta) * Math.cos(this.camera.phi);
    const y = this.orbitTarget[1] + this.orbitDistance * Math.sin(this.camera.phi);
    const z = this.orbitTarget[2] + this.orbitDistance * Math.cos(this.camera.theta) * Math.cos(this.camera.phi);
    
    this.camera.position[0] = x;
    this.camera.position[1] = y;
    this.camera.position[2] = z;
  }
  
  /**
   * Calculate theta/phi for FPS mode from current orbit orientation.
   * In orbit mode, we're looking AT the orbitTarget, so we need to convert
   * that look direction into FPS angles.
   */
  private calculateFPSAnglesFromOrbit() {
    if (!this.orbitTarget) return;
    
    // Get the current look direction (from camera to orbit target)
    const lookDirX = this.orbitTarget[0] - this.camera.position[0];
    const lookDirY = this.orbitTarget[1] - this.camera.position[1];
    const lookDirZ = this.orbitTarget[2] - this.camera.position[2];
    
    const len = Math.sqrt(lookDirX**2 + lookDirY**2 + lookDirZ**2);
    if (len < 0.001) return;
    
    const normX = lookDirX / len;
    const normY = lookDirY / len;
    const normZ = lookDirZ / len;
    
    // Convert look direction to theta/phi for FPS mode
    // In FPS mode: forward = (-sin(theta)*cos(phi), sin(phi), -cos(theta)*cos(phi))
    // So: theta = atan2(-lookDir.x, -lookDir.z)
    //     phi = asin(lookDir.y)
    this.camera.phi = Math.asin(Math.max(-1, Math.min(1, normY)));
    this.camera.theta = Math.atan2(-normX, -normZ);
  }
  
  /**
   * Calculate theta/phi for orbit mode from current camera position relative to orbit target.
   * This sets up the orbit angles so orbiting continues smoothly from current camera position.
   */
  private calculateOrbitAnglesFromPosition() {
    if (!this.orbitTarget) return;
    
    // Get offset from orbit target to camera
    const offsetX = this.camera.position[0] - this.orbitTarget[0];
    const offsetY = this.camera.position[1] - this.orbitTarget[1];
    const offsetZ = this.camera.position[2] - this.orbitTarget[2];
    
    // Calculate distance
    this.orbitDistance = Math.sqrt(offsetX**2 + offsetY**2 + offsetZ**2);
    
    // In orbit mode: 
    // x = distance * sin(theta) * cos(phi)
    // y = distance * sin(phi)
    // z = distance * cos(theta) * cos(phi)
    if (this.orbitDistance > 0.001) {
      this.camera.phi = Math.asin(Math.max(-1, Math.min(1, offsetY / this.orbitDistance)));
      const cosPhi = Math.cos(this.camera.phi);
      if (Math.abs(cosPhi) > 0.001) {
        this.camera.theta = Math.atan2(offsetX / cosPhi, offsetZ / cosPhi);
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
    
    if (this.orbitTarget) {
      // In orbit mode, adjust orbit distance
      this.orbitDistance *= (1 + e.deltaY * 0.001);
      this.orbitDistance = Math.max(10, Math.min(500, this.orbitDistance));
      this.updateOrbitPosition();
    } else {
      // Zoom by moving forward/backward
      const forward = this.getCameraForward();
      const zoomSpeed = e.deltaY * -0.5;
      
      this.camera.position[0] += forward[0] * zoomSpeed;
      this.camera.position[1] += forward[1] * zoomSpeed;
      this.camera.position[2] += forward[2] * zoomSpeed;
    }
  }
  
  private getCameraForward(): Float32Array {
    // In orbit mode, camera looks at the orbit target
    if (this.orbitTarget) {
      const dir = new Float32Array([
        this.orbitTarget[0] - this.camera.position[0],
        this.orbitTarget[1] - this.camera.position[1],
        this.orbitTarget[2] - this.camera.position[2],
      ]);
      const len = Math.sqrt(dir[0]**2 + dir[1]**2 + dir[2]**2);
      if (len > 0.001) {
        dir[0] /= len;
        dir[1] /= len;
        dir[2] /= len;
      }
      return dir;
    }
    // FPS mode - use theta/phi angles
    return new Float32Array([
      -Math.sin(this.camera.theta) * Math.cos(this.camera.phi),
      Math.sin(this.camera.phi),
      -Math.cos(this.camera.theta) * Math.cos(this.camera.phi),
    ]);
  }
  
  private getCameraRight(): Float32Array {
    // In orbit mode, compute right from forward x world_up
    if (this.orbitTarget) {
      const forward = this.getCameraForward();
      const worldUp = new Float32Array([0, 1, 0]);
      // right = forward x worldUp
      const right = new Float32Array([
        forward[1] * worldUp[2] - forward[2] * worldUp[1],
        forward[2] * worldUp[0] - forward[0] * worldUp[2],
        forward[0] * worldUp[1] - forward[1] * worldUp[0],
      ]);
      const len = Math.sqrt(right[0]**2 + right[1]**2 + right[2]**2);
      if (len > 0.001) {
        right[0] /= len;
        right[1] /= len;
        right[2] /= len;
      }
      return right;
    }
    // FPS mode - use theta angle
    return new Float32Array([
      Math.cos(this.camera.theta),
      0,
      -Math.sin(this.camera.theta),
    ]);
  }
  
  private updateCameraMovement() {
    if (this.keysPressed.size === 0) return;
    
    // Cancel any active tween when user takes manual control
    if (this.cameraTween?.active) {
      this.cameraTween = null;
    }
    
    // Exit orbit mode when using WASD - but first convert angles!
    if (this.orbitTarget) {
      this.exitOrbtitMode();
    }
    
    const forward = this.getCameraForward();
    const right = this.getCameraRight();
    
    let speed = this.moveSpeed;
    if (this.keysPressed.has('shift')) {
      speed *= this.sprintMultiplier;
    }
    
    // WASD movement
    if (this.keysPressed.has('w')) {
      this.camera.position[0] += forward[0] * speed;
      this.camera.position[1] += forward[1] * speed;
      this.camera.position[2] += forward[2] * speed;
    }
    if (this.keysPressed.has('s')) {
      this.camera.position[0] -= forward[0] * speed;
      this.camera.position[1] -= forward[1] * speed;
      this.camera.position[2] -= forward[2] * speed;
    }
    if (this.keysPressed.has('a')) {
      this.camera.position[0] -= right[0] * speed;
      this.camera.position[1] -= right[1] * speed;
      this.camera.position[2] -= right[2] * speed;
    }
    if (this.keysPressed.has('d')) {
      this.camera.position[0] += right[0] * speed;
      this.camera.position[1] += right[1] * speed;
      this.camera.position[2] += right[2] * speed;
    }
    // Space/Ctrl for up/down
    if (this.keysPressed.has(' ')) {
      this.camera.position[1] += speed;
    }
    if (this.keysPressed.has('control')) {
      this.camera.position[1] -= speed;
    }
  }
  
  private updateCameraPosition() {
    if (this.orbitTarget) {
      // In orbit mode, camera looks at the orbit target
      this.camera.target[0] = this.orbitTarget[0];
      this.camera.target[1] = this.orbitTarget[1];
      this.camera.target[2] = this.orbitTarget[2];
    } else {
      // For FPS camera, target is position + forward direction
      const forward = this.getCameraForward();
      this.camera.target[0] = this.camera.position[0] + forward[0];
      this.camera.target[1] = this.camera.position[1] + forward[1];
      this.camera.target[2] = this.camera.position[2] + forward[2];
    }
  }
  
  // Get camera up vector (perpendicular to forward and right)
  private getCameraUp(): Float32Array {
    const forward = this.getCameraForward();
    const right = this.getCameraRight();
    // up = right x forward (for right-handed system with Y up)
    return new Float32Array([
      right[1] * forward[2] - right[2] * forward[1],
      right[2] * forward[0] - right[0] * forward[2],
      right[0] * forward[1] - right[1] * forward[0],
    ]);
  }
  
  // Node picking using simple distance-based raycast
  private pickNode(ndcX: number, ndcY: number): number {
    const aspect = this.canvas.width / this.canvas.height;
    
    // Calculate ray direction from camera through click point
    const tanFov = Math.tan(this.camera.fov / 2);
    
    // Get camera basis vectors
    const forward = this.getCameraForward();
    const right = this.getCameraRight();
    const up = this.getCameraUp();
    
    // Ray direction in world space:
    // We want to go "forward" into the scene, offset by right and up based on NDC coords
    const rayDir = new Float32Array([
      forward[0] + right[0] * ndcX * aspect * tanFov + up[0] * ndcY * tanFov,
      forward[1] + right[1] * ndcX * aspect * tanFov + up[1] * ndcY * tanFov,
      forward[2] + right[2] * ndcX * aspect * tanFov + up[2] * ndcY * tanFov,
    ]);
    
    // Normalize ray direction
    const rayLen = Math.sqrt(rayDir[0]**2 + rayDir[1]**2 + rayDir[2]**2);
    rayDir[0] /= rayLen;
    rayDir[1] /= rayLen;
    rayDir[2] /= rayLen;
    
    return this.findClosestNodeToRay(this.camera.position, rayDir);
  }
  
  private nodePositions: Float32Array | null = null;
  
  private findClosestNodeToRay(origin: Float32Array, dir: Float32Array): number {
    if (!this.nodePositions || this.nodePositions.length === 0) return -1;
    
    let closestNode = -1;
    let minPerpDist = Infinity;
    let closestRayDist = Infinity;
    
    // Get current node size for pick radius calculation
    const nodeSize = Math.max(0.5, this.camera.distance * 0.003);
    // Pick radius should be slightly larger than node visual size
    const pickRadius = nodeSize * 3;
    
    for (let i = 0; i < this.nodeCount; i++) {
      const px = this.nodePositions[i * 8];
      const py = this.nodePositions[i * 8 + 1];
      const pz = this.nodePositions[i * 8 + 2];
      
      // Vector from origin to node
      const ox = px - origin[0];
      const oy = py - origin[1];
      const oz = pz - origin[2];
      
      // Project onto ray (t = distance along ray to closest point)
      const t = ox * dir[0] + oy * dir[1] + oz * dir[2];
      if (t < 0) continue; // Behind camera
      
      // Closest point on ray
      const cx = origin[0] + dir[0] * t;
      const cy = origin[1] + dir[1] * t;
      const cz = origin[2] + dir[2] * t;
      
      // Perpendicular distance from node to ray
      const perpDist = Math.sqrt((px-cx)**2 + (py-cy)**2 + (pz-cz)**2);
      
      // Find node with smallest perpendicular distance (closest to where we clicked)
      // If same perp distance, prefer closer node along ray
      if (perpDist < minPerpDist || (perpDist === minPerpDist && t < closestRayDist)) {
        minPerpDist = perpDist;
        closestRayDist = t;
        closestNode = i;
      }
    }
    
    // Reject if perpendicular distance is too large (not actually clicking on node)
    if (minPerpDist > pickRadius) {
      return -1;
    }
    
    return closestNode;
  }
  
  private selectNode(index: number) {
    this.selectedNodeIndex = index;
    
    // Update connected nodes buffer for highlighting
    this.updateConnectedNodes(index);
    
    if (this.onNodeSelect) {
      if (index >= 0) {
        // Find node ID from index
        for (const [id, idx] of this.nodeIdToIndex) {
          if (idx === index) {
            this.onNodeSelect(id);
            return;
          }
        }
      }
      this.onNodeSelect(null);
    }
  }
  
  private updateConnectedNodes(selectedIndex: number) {
    if (!this.edgeIndices || !this.edgePieceIds || !this.connectedNodesBuffer || !this.device) return;
    
    // Create array with 0 for all nodes
    // Value encoding: 0 = not connected, 1 = selected node, 2+ = connected with color_index = value - 2
    const connectedData = new Uint32Array(this.nodeCount);
    
    if (selectedIndex >= 0) {
      // Color grade the path nodes
      for (let i = 0; i < this.solutionPath.length; i++) {
        const nodeId = this.solutionPath[i];
        const nodeIdx = this.nodeIdToIndex.get(nodeId);
        if (nodeIdx !== undefined) {
          console.warn(`Path node ${nodeId} at index ${nodeIdx}`);
          // Distance ratio: 0 at start, 1 at solution
          const distanceRatio = i / (this.solutionPath.length - 1 || 1);
          // Encode with special marker 1000+ for path gradient
          connectedData[nodeIdx] = 1000 + Math.floor(distanceRatio * 1000);
        }
      }
      
      // Mark the selected node itself (special value 1)
      connectedData[selectedIndex] = 1;
      
      // Map to track piece colors for each connected node
      // Prioritize outgoing edges over incoming edges
      const connectedNodesToPieces = new Map<number, number>();
      
      for (let i = 0; i < this.edgeCount; i++) {
        const source = this.edgeIndices[i * 2];
        const target = this.edgeIndices[i * 2 + 1];
        const pieceId = this.edgePieceIds[i];
        
        const colorIndex = this.pieceColorMapping.get(pieceId) ?? pieceId;
        
        if (source === selectedIndex) {
          // Outgoing edge: target node is reached by moving pieceId
          // Always set outgoing edges (they take priority)
          connectedNodesToPieces.set(target, colorIndex);
        } else if (target === selectedIndex && !connectedNodesToPieces.has(source)) {
          // Incoming edge: only use if we don't already have an outgoing edge to this node
          connectedNodesToPieces.set(source, colorIndex);
        }
      }
      
      // Apply the connected pieces coloring
      for (const [nodeIdx, colorIdx] of connectedNodesToPieces.entries()) {
        connectedData[nodeIdx] = colorIdx + 2;
      }

      // Upload to GPU
      this.device.queue.writeBuffer(this.connectedNodesBuffer, 0, connectedData);

      // Color the path edges
      const edgeColorData = new Float32Array(this.edgeCount * 4);
      
      // Initialize all edges to gray
      for (let i = 0; i < this.edgeCount; i++) {
        edgeColorData[i * 4 + 0] = 0.8;
        edgeColorData[i * 4 + 1] = 0.8;
        edgeColorData[i * 4 + 2] = 0.8;
        edgeColorData[i * 4 + 3] = 0.8;
      }

      // Color path edges
      for (let i = 1; i < this.solutionPath.length; i++) {
        const fromNodeId = this.solutionPath[i - 1];
        const toNodeId = this.solutionPath[i];
        const fromIdx = this.nodeIdToIndex.get(fromNodeId);
        const toIdx = this.nodeIdToIndex.get(toNodeId);
        
        if (fromIdx !== undefined && toIdx !== undefined) {
          // Find the edge connecting fromIdx to toIdx and color it
          for (let j = 0; j < this.edgeCount; j++) {
            const source = this.edgeIndices![j * 2];
            const target = this.edgeIndices![j * 2 + 1];
            
            // color like target node
            if ((source === fromIdx && target === toIdx) || (source === toIdx && target === fromIdx)) {
              edgeColorData[j * 4 + 0] = 0.0;
              edgeColorData[j * 4 + 1] = 1.0;
              edgeColorData[j * 4 + 2] = 0.0;
              edgeColorData[j * 4 + 3] = 1.0;
              break;
            }
          }
        }
      }

      this.device.queue.writeBuffer(this.edgeColorBuffer, 0, edgeColorData);
    }
  }
  
  /**
   * Set the solution path from the current selected node to the solution.
   * Used to highlight/color nodes along the optimal solution path.
   */
  setSolutionPath(path: string[]) {
    this.solutionPath = path;
    // Re-update connected nodes to apply path highlighting
    if (this.selectedNodeIndex >= 0) {
      this.updateConnectedNodes(this.selectedNodeIndex);
    }
  }

  /**
   * Set the piece color mapping to sync colors with KlotskiPuzzle.
   * Maps piece_id (structural index) to color_index (visual color).
   * Call this whenever the color mapping changes in KlotskiPuzzle.
   */
  setPieceColorMapping(mapping: Map<number, number>) {
    this.pieceColorMapping = mapping;
    // Re-update connected nodes if we have a selection
    if (this.selectedNodeIndex >= 0) {
      this.updateConnectedNodes(this.selectedNodeIndex);
    }
  }
  
  setOnNodeSelect(callback: (nodeId: string | null) => void) {
    this.onNodeSelect = callback;
  }
  
  selectNodeById(nodeId: string) {
    const index = this.nodeIdToIndex.get(nodeId);
    if (index !== undefined) {
      this.selectedNodeIndex = index;
      // Update connected nodes for highlighting
      this.updateConnectedNodes(index);
      // Focus camera on node
      this.focusOnNode(index);
    } else {
      this.selectedNodeIndex = -1;
      this.updateConnectedNodes(-1);
      this.exitOrbtitMode();
    }
  }
  
  private focusOnNode(index: number) {
    if (!this.nodePositions || index < 0) return;
    
    const px = this.nodePositions[index * 8];
    const py = this.nodePositions[index * 8 + 1];
    const pz = this.nodePositions[index * 8 + 2];
    
    const newOrbitTarget = new Float32Array([px, py, pz]);
    
    // Calculate target camera position maintaining current viewing direction
    // Get current direction from camera to current orbit target (or just use current position if no target)
    let offsetX: number, offsetY: number, offsetZ: number;
    
    if (this.orbitTarget) {
      // Maintain the same relative position to the orbit target
      offsetX = this.camera.position[0] - this.orbitTarget[0];
      offsetY = this.camera.position[1] - this.orbitTarget[1];
      offsetZ = this.camera.position[2] - this.orbitTarget[2];
    } else {
      // First time focusing - use default offset (behind the node on Z axis)
      offsetX = 0;
      offsetY = 0;
      offsetZ = this.orbitDistance;
    }
    
    // Normalize and scale to orbit distance
    const dist = Math.sqrt(offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ);
    if (dist > 0.001) {
      const scale = this.orbitDistance / dist;
      offsetX *= scale;
      offsetY *= scale;
      offsetZ *= scale;
    } else {
      offsetZ = this.orbitDistance;
    }
    
    const targetPos = new Float32Array([
      px + offsetX,
      py + offsetY,
      pz + offsetZ,
    ]);
    
    // Store start orbit target (current one, or camera target if none)
    const startOrbitTarget = this.orbitTarget 
      ? new Float32Array(this.orbitTarget)
      : new Float32Array(this.camera.target);
    
    // Start smooth tween - interpolate both position AND orbit target
    this.cameraTween = {
      active: true,
      startPos: new Float32Array(this.camera.position),
      endPos: targetPos,
      startOrbitTarget: startOrbitTarget,
      endOrbitTarget: newOrbitTarget,
      startTime: performance.now(),
      duration: 1200, // 1.2s tween duration for smooth transitions
    };
    
    // Don't set orbitTarget immediately - let the tween handle it
  }
  
  private updateCameraTween() {
    if (!this.cameraTween || !this.cameraTween.active) return;
    
    const now = performance.now();
    const elapsed = now - this.cameraTween.startTime;
    let t = Math.min(1, elapsed / this.cameraTween.duration);
    
    // Ease-in-out cubic for smooth acceleration and deceleration
    t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    
    // Interpolate camera position
    this.camera.position[0] = this.cameraTween.startPos[0] + (this.cameraTween.endPos[0] - this.cameraTween.startPos[0]) * t;
    this.camera.position[1] = this.cameraTween.startPos[1] + (this.cameraTween.endPos[1] - this.cameraTween.startPos[1]) * t;
    this.camera.position[2] = this.cameraTween.startPos[2] + (this.cameraTween.endPos[2] - this.cameraTween.startPos[2]) * t;
    
    // Interpolate orbit target (what the camera looks at)
    if (!this.orbitTarget) {
      this.orbitTarget = new Float32Array(3);
    }
    this.orbitTarget[0] = this.cameraTween.startOrbitTarget[0] + (this.cameraTween.endOrbitTarget[0] - this.cameraTween.startOrbitTarget[0]) * t;
    this.orbitTarget[1] = this.cameraTween.startOrbitTarget[1] + (this.cameraTween.endOrbitTarget[1] - this.cameraTween.startOrbitTarget[1]) * t;
    this.orbitTarget[2] = this.cameraTween.startOrbitTarget[2] + (this.cameraTween.endOrbitTarget[2] - this.cameraTween.startOrbitTarget[2]) * t;
    
    // End tween when complete
    if (elapsed >= this.cameraTween.duration) {
      this.cameraTween.active = false;
      this.cameraTween = null;
      
      // Initialize orbit angles from final camera position
      // This ensures smooth orbiting immediately after tween completes
      this.calculateOrbitAnglesFromPosition();
    }
  }
  
  getSelectedNodeIndex(): number {
    return this.selectedNodeIndex;
  }
  
  async initialize(): Promise<boolean> {
    if (!navigator.gpu) {
      console.error('WebGPU is not supported in this browser');
      return false;
    }
    
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });
    
    if (!adapter) {
      console.error('Failed to get GPU adapter');
      return false;
    }
    
    this.device = await adapter.requestDevice({
      requiredFeatures: [],
      requiredLimits: {
        maxStorageBufferBindingSize: 1024 * 1024 * 256, // 256MB
        maxBufferSize: 1024 * 1024 * 256,
      },
    });
    
    this.context = this.canvas.getContext('webgpu')!;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied',
    });
    
    this.createSphereGeometry(2); // 2 subdivisions = 80 triangles
    await this.createPipelines();
    this.createDepthTexture();
    
    this.isInitialized = true;
    return true;
  }
  
  // Generate subdivided icosphere geometry
  private createSphereGeometry(subdivisions: number) {
    // Golden ratio for icosahedron
    const phi = (1 + Math.sqrt(5)) / 2;
    
    // Initial icosahedron vertices (normalized)
    const vertices: number[][] = [
      [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
      [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
      [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
    ].map(v => {
      const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
      return [v[0]/len, v[1]/len, v[2]/len];
    });
    
    // Initial icosahedron faces (20 triangles)
    let faces: number[][] = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    
    // Subdivide faces
    const midpointCache = new Map<string, number>();
    
    const getMidpoint = (i1: number, i2: number): number => {
      const key = i1 < i2 ? `${i1}_${i2}` : `${i2}_${i1}`;
      if (midpointCache.has(key)) {
        return midpointCache.get(key)!;
      }
      
      const v1 = vertices[i1];
      const v2 = vertices[i2];
      const mid = [
        (v1[0] + v2[0]) / 2,
        (v1[1] + v2[1]) / 2,
        (v1[2] + v2[2]) / 2,
      ];
      
      // Normalize to sphere surface
      const len = Math.sqrt(mid[0]*mid[0] + mid[1]*mid[1] + mid[2]*mid[2]);
      mid[0] /= len;
      mid[1] /= len;
      mid[2] /= len;
      
      const idx = vertices.length;
      vertices.push(mid);
      midpointCache.set(key, idx);
      return idx;
    };
    
    for (let s = 0; s < subdivisions; s++) {
      const newFaces: number[][] = [];
      for (const face of faces) {
        const a = getMidpoint(face[0], face[1]);
        const b = getMidpoint(face[1], face[2]);
        const c = getMidpoint(face[2], face[0]);
        
        newFaces.push([face[0], a, c]);
        newFaces.push([face[1], b, a]);
        newFaces.push([face[2], c, b]);
        newFaces.push([a, b, c]);
      }
      faces = newFaces;
      midpointCache.clear();
    }
    
    // Create vertex data (3 floats per vertex, 3 vertices per face)
    // We use flat shading so each triangle has its own vertices
    const vertexData = new Float32Array(faces.length * 3 * 4); // vec3 padded to vec4 for alignment
    
    let idx = 0;
    for (const face of faces) {
      for (const vi of face) {
        const v = vertices[vi];
        vertexData[idx++] = v[0];
        vertexData[idx++] = v[1];
        vertexData[idx++] = v[2];
        vertexData[idx++] = 0; // padding for vec4 alignment in storage buffer
      }
    }
    
    this.sphereVertexCount = faces.length * 3;
    
    this.sphereVertexBuffer = this.device.createBuffer({
      size: vertexData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    
    this.device.queue.writeBuffer(this.sphereVertexBuffer, 0, vertexData);
  }
  
  private createDepthTexture() {
    // Ensure canvas has valid dimensions
    const width = Math.max(1, this.canvas.width);
    const height = Math.max(1, this.canvas.height);
    
    this.depthTexture = this.device.createTexture({
      size: [width, height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }
  
  private async createPipelines() {
    // Compute pipeline for force simulation
    const computeModule = this.device.createShaderModule({
      code: forceShaderSource,
    });
    
    this.computePipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: computeModule,
        entryPoint: 'main',
      },
    });
    
    // Render pipeline for nodes
    const nodeModule = this.device.createShaderModule({
      code: nodeShaderSource,
    });
    
    this.nodeRenderPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: nodeModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: nodeModule,
        entryPoint: 'fs_main',
        targets: [{
          format: this.format,
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
    const edgeModule = this.device.createShaderModule({
      code: edgeShaderSource,
    });
    
    this.edgeRenderPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: edgeModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: edgeModule,
        entryPoint: 'fs_main',
        targets: [{
          format: this.format,
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
    
    // Create uniform buffer
    this.uniformBuffer = this.device.createBuffer({
      size: 64 + 16 + 16, // mat4 + vec4 + params
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    
    // Create simulation params buffer
    // SimParams struct in WGSL is 64 bytes due to alignment:
    // 9 x f32/u32 = 36 bytes + vec3 padding (12 bytes) + alignment padding = 64 bytes
    this.simParamsBuffer = this.device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }
  
  loadGraphData(data: GraphData) {
    this.nodeCount = data.nodes.length;
    this.edgeCount = data.edges.length;
    
    // Build node id to index mapping
    this.nodeIdToIndex.clear();
    data.nodes.forEach((node, idx) => {
      this.nodeIdToIndex.set(node.id, idx);
    });
    
    // Initialize node positions with random positions if not provided
    const nodeData = new Float32Array(this.nodeCount * 8); // position (4) + velocity (4)
    
    // Scale initial distribution based on node count for better visualization
    const initialRadius = Math.max(100, Math.cbrt(this.nodeCount) * 5);
    
    for (let i = 0; i < this.nodeCount; i++) {
      const node = data.nodes[i];
      const offset = i * 8;
      
      // Position (randomize in a sphere)
      const r = initialRadius * Math.cbrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      nodeData[offset + 0] = node.x ?? r * Math.sin(phi) * Math.cos(theta);
      nodeData[offset + 1] = node.y ?? r * Math.sin(phi) * Math.sin(theta);
      nodeData[offset + 2] = node.z ?? r * Math.cos(phi);
      nodeData[offset + 3] = 1.0; // w
      
      // Velocity (start at zero)
      nodeData[offset + 4] = 0;
      nodeData[offset + 5] = 0;
      nodeData[offset + 6] = 0;
      nodeData[offset + 7] = 1.0; // mass
    }
    
    // Update camera distance based on initial distribution
    this.camera.distance = initialRadius * 3;
    this.updateCameraPosition();
    
    // Create double-buffered node buffers
    const nodeBufferSize = this.nodeCount * 8 * 4;
    
    this.nodeBufferA = this.device.createBuffer({
      size: nodeBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    
    this.nodeBufferB = this.device.createBuffer({
      size: nodeBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    
    // Readback buffer for CPU-side picking
    this.nodeReadbackBuffer = this.device.createBuffer({
      size: nodeBufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    
    this.device.queue.writeBuffer(this.nodeBufferA, 0, nodeData);
    this.device.queue.writeBuffer(this.nodeBufferB, 0, nodeData);
    
    // Store node positions for CPU-side picking
    this.nodePositions = new Float32Array(nodeData);
    
    // Create edge buffer
    const edgeData = new Uint32Array(this.edgeCount * 4); // source, target, padding
    
    for (let i = 0; i < this.edgeCount; i++) {
      const edge = data.edges[i];
      const sourceIdx = this.nodeIdToIndex.get(edge.source);
      const targetIdx = this.nodeIdToIndex.get(edge.target);
      
      if (sourceIdx === undefined || targetIdx === undefined) {
        console.warn(`Edge references unknown node: ${edge.source} -> ${edge.target}`);
        continue;
      }
      
      const offset = i * 4;
      edgeData[offset + 0] = sourceIdx;
      edgeData[offset + 1] = targetIdx;
      edgeData[offset + 2] = 0;
      edgeData[offset + 3] = 0;
    }
    
    this.edgeBuffer = this.device.createBuffer({
      size: edgeData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    
    this.device.queue.writeBuffer(this.edgeBuffer, 0, edgeData);
    
    // Create edge index buffer for rendering (vec2<u32>)
    const edgeIndexData = new Uint32Array(this.edgeCount * 2);
    const pieceIdData = new Uint32Array(this.edgeCount);
    
    for (let i = 0; i < this.edgeCount; i++) {
      const edge = data.edges[i];
      const sourceIdx = this.nodeIdToIndex.get(edge.source)!;
      const targetIdx = this.nodeIdToIndex.get(edge.target)!;
      
      edgeIndexData[i * 2 + 0] = sourceIdx;
      edgeIndexData[i * 2 + 1] = targetIdx;
      
      // Store piece_id for this edge (default to 0 if not provided)
      pieceIdData[i] = edge.piece_id ?? 0;
    }
    
    this.edgeIndexBuffer = this.device.createBuffer({
      size: edgeIndexData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    
    this.device.queue.writeBuffer(this.edgeIndexBuffer, 0, edgeIndexData);
    
    // Store edge indices and piece IDs for connectivity queries
    this.edgeIndices = edgeIndexData;
    this.edgePieceIds = pieceIdData;
    
    // Create node color buffer (generate colors based on node index)
    const colorData = new Float32Array(this.nodeCount * 4);
    
    for (let i = 0; i < this.nodeCount; i++) {
      const hue = (i / this.nodeCount) * 100;
      // // keep nodes gray
      // const hue = 0;
      const rgb = this.hslToRgb(hue + 130, 1.0, 0.5);
      
      colorData[i * 4 + 0] = rgb[0];
      colorData[i * 4 + 1] = rgb[1];
      colorData[i * 4 + 2] = rgb[2];
      colorData[i * 4 + 3] = 1.0;
    }
    
    this.nodeColorBuffer = this.device.createBuffer({
      size: colorData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    
    this.device.queue.writeBuffer(this.nodeColorBuffer, 0, colorData);
    
    // Create connected nodes buffer (u32 per node: piece_id+1 for connected, 0 = not connected)
    this.connectedNodesBuffer = this.device.createBuffer({
      size: this.nodeCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    // Initialize to all zeros (no selection)
    this.device.queue.writeBuffer(this.connectedNodesBuffer, 0, new Uint32Array(this.nodeCount));
    
    // Create piece colors buffer (10 piece colors as vec4<f32>)
    const pieceColorData = new Float32Array(10 * 4);
    for (let i = 0; i < 10; i++) {
      const color = this.PIECE_COLORS[i] || [0.5, 0.5, 0.5];
      pieceColorData[i * 4 + 0] = color[0];
      pieceColorData[i * 4 + 1] = color[1];
      pieceColorData[i * 4 + 2] = color[2];
      pieceColorData[i * 4 + 3] = 1.0;
    }
    
    this.pieceColorsBuffer = this.device.createBuffer({
      size: pieceColorData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.pieceColorsBuffer, 0, pieceColorData);
    
    // Create edge color buffer (vec4<f32> per edge: RGB color + alpha)
    this.edgeColorBuffer = this.device.createBuffer({
      size: this.edgeCount * 4 * 4, // vec4<f32> per edge
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    
    // Initialize with gray for all edges
    const initialEdgeColors = new Float32Array(this.edgeCount * 4);
    for (let i = 0; i < this.edgeCount; i++) {
      initialEdgeColors[i * 4 + 0] = 0.8;
      initialEdgeColors[i * 4 + 1] = 0.8;
      initialEdgeColors[i * 4 + 2] = 0.8;
      initialEdgeColors[i * 4 + 3] = 1.0;
    }
    this.device.queue.writeBuffer(this.edgeColorBuffer, 0, initialEdgeColors);
    
    console.log(`Loaded ${this.nodeCount} nodes and ${this.edgeCount} edges`);
    
    // Create bind groups
    this.createBindGroups();
  }
  
  private hslToRgb(h: number, s: number, l: number): [number, number, number] {
    h /= 360;
    
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    if (s === 0) {
      return [l, l, l];
    }
    
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    
    return [
      hue2rgb(p, q, h + 1/3),
      hue2rgb(p, q, h),
      hue2rgb(p, q, h - 1/3),
    ];
  }
  
  private createBindGroups() {
    // Compute bind groups (ping-pong)
    this.computeBindGroupA = this.device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.nodeBufferA } },
        { binding: 1, resource: { buffer: this.nodeBufferB } },
        { binding: 2, resource: { buffer: this.edgeBuffer } },
        { binding: 3, resource: { buffer: this.simParamsBuffer } },
      ],
    });
    
    this.computeBindGroupB = this.device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.nodeBufferB } },
        { binding: 1, resource: { buffer: this.nodeBufferA } },
        { binding: 2, resource: { buffer: this.edgeBuffer } },
        { binding: 3, resource: { buffer: this.simParamsBuffer } },
      ],
    });
    
    // Node render bind groups (use layout from node pipeline)
    this.nodeRenderBindGroupA = this.device.createBindGroup({
      layout: this.nodeRenderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.nodeBufferA } },
        { binding: 2, resource: { buffer: this.nodeColorBuffer } },
        { binding: 3, resource: { buffer: this.sphereVertexBuffer } },
        { binding: 4, resource: { buffer: this.connectedNodesBuffer } },
        { binding: 5, resource: { buffer: this.pieceColorsBuffer } },
      ],
    });
    
    this.nodeRenderBindGroupB = this.device.createBindGroup({
      layout: this.nodeRenderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.nodeBufferB } },
        { binding: 2, resource: { buffer: this.nodeColorBuffer } },
        { binding: 3, resource: { buffer: this.sphereVertexBuffer } },
        { binding: 4, resource: { buffer: this.connectedNodesBuffer } },
        { binding: 5, resource: { buffer: this.pieceColorsBuffer } },
      ],
    });
    
    // Edge render bind groups (use layout from edge pipeline)
    this.edgeRenderBindGroupA = this.device.createBindGroup({
      layout: this.edgeRenderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.nodeBufferA } },
        { binding: 2, resource: { buffer: this.edgeIndexBuffer } },
        { binding: 3, resource: { buffer: this.edgeColorBuffer } },
      ],
    });
    
    this.edgeRenderBindGroupB = this.device.createBindGroup({
      layout: this.edgeRenderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.nodeBufferB } },
        { binding: 2, resource: { buffer: this.edgeIndexBuffer } },
        { binding: 3, resource: { buffer: this.edgeColorBuffer } },
      ],
    });
  }
  
  private updateUniforms() {
    const viewMatrix = this.createLookAtMatrix(
      this.camera.position,
      this.camera.target,
      this.camera.up
    );
    
    const aspect = this.canvas.width / this.canvas.height;
    const projMatrix = this.createPerspectiveMatrix(
      this.camera.fov,
      aspect,
      this.camera.near,
      this.camera.far
    );
    
    const viewProj = this.multiplyMatrices(projMatrix, viewMatrix);
    
    const uniformData = new Float32Array(24);
    uniformData.set(viewProj, 0);
    uniformData.set(this.camera.position, 16);
    uniformData[19] = 1.0;
    // Scale node size based on camera distance for visibility
    uniformData[20] = Math.max(0.5, this.camera.distance * 0.003); // node size - smaller nodes
    uniformData[21] = 1.0; // edge width
    
    // Write selected_node as int32
    const intView = new Int32Array(uniformData.buffer);
    intView[22] = this.selectedNodeIndex; // selected_node (-1 if none)
    
    uniformData[23] = 0; // padding
    
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
  }
  
  private updateSimParams() {
    // 16 floats = 64 bytes to match WGSL struct alignment
    const simParamsData = new Float32Array(16);
    simParamsData[0] = 1 / 60; // delta time
    simParamsData[1] = this.simParams.repulsionStrength;
    simParamsData[2] = this.simParams.attractionStrength;
    simParamsData[3] = this.simParams.damping;
    simParamsData[4] = 0.1; // min distance
    simParamsData[5] = this.simParams.maxSpeed;
    
    const uintView = new Uint32Array(simParamsData.buffer);
    uintView[6] = this.nodeCount;
    uintView[7] = this.edgeCount;
    
    simParamsData[8] = this.simParams.centerGravity;
    // Padding to fill vec3 + extra alignment
    simParamsData[9] = 0;
    simParamsData[10] = 0;
    simParamsData[11] = 0;
    simParamsData[12] = 0;
    simParamsData[13] = 0;
    simParamsData[14] = 0;
    simParamsData[15] = 0;
    
    this.device.queue.writeBuffer(this.simParamsBuffer, 0, simParamsData);
  }
  
  private createLookAtMatrix(eye: Float32Array, target: Float32Array, up: Float32Array): Float32Array {
    const zAxis = this.normalize(this.subtract(eye, target));
    const xAxis = this.normalize(this.cross(up, zAxis));
    const yAxis = this.cross(zAxis, xAxis);
    
    return new Float32Array([
      xAxis[0], yAxis[0], zAxis[0], 0,
      xAxis[1], yAxis[1], zAxis[1], 0,
      xAxis[2], yAxis[2], zAxis[2], 0,
      -this.dot(xAxis, eye), -this.dot(yAxis, eye), -this.dot(zAxis, eye), 1,
    ]);
  }
  
  private createPerspectiveMatrix(fov: number, aspect: number, near: number, far: number): Float32Array {
    const f = 1.0 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  }
  
  // Matrix multiplication for column-major matrices (WebGPU format)
  // result = a * b where matrices are stored column-major
  private multiplyMatrices(a: Float32Array, b: Float32Array): Float32Array {
    const result = new Float32Array(16);
    
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        result[col * 4 + row] = 
          a[0 * 4 + row] * b[col * 4 + 0] +
          a[1 * 4 + row] * b[col * 4 + 1] +
          a[2 * 4 + row] * b[col * 4 + 2] +
          a[3 * 4 + row] * b[col * 4 + 3];
      }
    }
    
    return result;
  }
  
  private subtract(a: Float32Array, b: Float32Array): Float32Array {
    return new Float32Array([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
  }
  
  private cross(a: Float32Array, b: Float32Array): Float32Array {
    return new Float32Array([
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ]);
  }
  
  private dot(a: Float32Array, b: Float32Array): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }
  
  private normalize(v: Float32Array): Float32Array {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return new Float32Array([v[0] / len, v[1] / len, v[2] / len]);
  }
  
  private frameCount = 0;
  
  private frame = () => {
    if (!this.isInitialized || !this.device) return;
    
    // Skip if canvas has no size
    if (this.canvas.width === 0 || this.canvas.height === 0) {
      this.animationFrameId = requestAnimationFrame(this.frame);
      return;
    }
    
    // Update camera movement (WASD) - disabled during tween
    if (!this.cameraTween?.active) {
      this.updateCameraMovement();
    }
    
    // Update camera tween animation
    this.updateCameraTween();
    
    this.updateCameraPosition();
    
    this.frameCount++;
    
    this.updateUniforms();
    this.updateSimParams();
    
    const commandEncoder = this.device.createCommandEncoder();
    
    // Run force simulation compute pass (if not paused)
    if (!this.isPaused) {
      const computePass = commandEncoder.beginComputePass();
      computePass.setPipeline(this.computePipeline);
      computePass.setBindGroup(0, this.pingPong === 0 ? this.computeBindGroupA : this.computeBindGroupB);
      computePass.dispatchWorkgroups(Math.ceil(this.nodeCount / 256));
      computePass.end();
      
      this.pingPong = 1 - this.pingPong;
      
      // Periodically read back node positions for CPU-side picking (every 30 frames)
      if (this.frameCount % 30 === 0 && !this.isReadingBack) {
        this.readbackNodePositions();
      }
    } else {
      // If paused, still need to read back node positions to keep CPU data in sync once after pause
      if (!this.isReadingBack && this.pausedAtFrame > this.lastReadbackFrame) {
        this.readbackNodePositions();
      }
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
    
    const nodeBindGroup = this.pingPong === 0 ? this.nodeRenderBindGroupA : this.nodeRenderBindGroupB;
    const edgeBindGroup = this.pingPong === 0 ? this.edgeRenderBindGroupA : this.edgeRenderBindGroupB;
    
    // Draw edges first (behind nodes)
    renderPass.setPipeline(this.edgeRenderPipeline);
    renderPass.setBindGroup(0, edgeBindGroup);
    renderPass.draw(2, this.edgeCount); // 2 vertices per line, instanced
    
    // Draw nodes
    renderPass.setPipeline(this.nodeRenderPipeline);
    renderPass.setBindGroup(0, nodeBindGroup);
    renderPass.draw(this.sphereVertexCount, this.nodeCount); // vertices per sphere, instanced
    
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
  
  private async readbackNodePositions() {
    if (!this.device || !this.nodeReadbackBuffer || this.isReadingBack) return;
    
    this.isReadingBack = true;
    
    try {
      // Get the current source buffer (after pingPong)
      const sourceBuffer = this.pingPong === 0 ? this.nodeBufferA : this.nodeBufferB;
      const bufferSize = this.nodeCount * 8 * 4;
      
      // Create a command to copy node buffer to readback buffer
      const commandEncoder = this.device.createCommandEncoder();
      commandEncoder.copyBufferToBuffer(sourceBuffer, 0, this.nodeReadbackBuffer, 0, bufferSize);
      this.device.queue.submit([commandEncoder.finish()]);
      
      // Map the buffer and read data
      await this.nodeReadbackBuffer.mapAsync(GPUMapMode.READ);
      const mappedRange = this.nodeReadbackBuffer.getMappedRange();
      const positionData = new Float32Array(mappedRange.slice(0));
      this.nodeReadbackBuffer.unmap();
      
      // Update CPU-side positions
      this.nodePositions = positionData;
      this.lastReadbackFrame = this.frameCount;
    } catch (e) {
      console.error('Failed to read back node positions:', e);
    } finally {
      this.isReadingBack = false;
    }
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
  
  resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    
    if (this.isInitialized) {
      this.depthTexture.destroy();
      this.createDepthTexture();
    }
  }
  
  destroy() {
    this.stop();
    
    // Remove event listeners
    this.canvas.removeEventListener('mousedown', this.boundOnMouseDown);
    this.canvas.removeEventListener('mousemove', this.boundOnMouseMove);
    this.canvas.removeEventListener('mouseup', this.boundOnMouseUp);
    this.canvas.removeEventListener('mouseleave', this.boundOnMouseUp);
    this.canvas.removeEventListener('wheel', this.boundOnWheel);
    this.canvas.removeEventListener('click', this.boundOnClick);
    this.canvas.removeEventListener('contextmenu', this.boundOnContextMenu);
    window.removeEventListener('keydown', this.boundOnKeyDown);
    window.removeEventListener('keyup', this.boundOnKeyUp);
    
    if (this.nodeBufferA) this.nodeBufferA.destroy();
    if (this.nodeBufferB) this.nodeBufferB.destroy();
    if (this.edgeBuffer) this.edgeBuffer.destroy();
    if (this.edgeIndexBuffer) this.edgeIndexBuffer.destroy();
    if (this.edgeColorBuffer) this.edgeColorBuffer.destroy();
    if (this.uniformBuffer) this.uniformBuffer.destroy();
    if (this.simParamsBuffer) this.simParamsBuffer.destroy();
    if (this.nodeColorBuffer) this.nodeColorBuffer.destroy();
    if (this.connectedNodesBuffer) this.connectedNodesBuffer.destroy();
    if (this.nodeReadbackBuffer) this.nodeReadbackBuffer.destroy();
    if (this.sphereVertexBuffer) this.sphereVertexBuffer.destroy();
    if (this.depthTexture) this.depthTexture.destroy();
  }
}
