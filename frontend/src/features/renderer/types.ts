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

export interface Camera {
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