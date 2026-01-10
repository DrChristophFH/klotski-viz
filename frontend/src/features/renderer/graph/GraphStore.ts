import type { GraphData } from '../types';
import { computeDistancesToNearestGoal } from './distances';

export class GraphStore {
  private nodeIdToIndex: Map<string, number> = new Map();
  private edgeIndices: Uint32Array | null = null;
  private edgePieceIds: Uint32Array | null = null;
  private nodeCount: number = 0;
  private edgeCount: number = 0;
  private distancesToGoal: Float32Array | null = null;
  private goalNodeIndex: number = -1;
  private endStateIndices: Set<number> = new Set();

  loadGraphData(data: GraphData): {
    nodeData: Float32Array<ArrayBuffer>;
    edgeData: Uint32Array<ArrayBuffer>;
    edgeIndexData: Uint32Array<ArrayBuffer>;
    pieceIdData: Uint32Array<ArrayBuffer>;
  } {
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

    // Store edge indices and piece IDs for connectivity queries
    this.edgeIndices = edgeIndexData;
    this.edgePieceIds = pieceIdData;

    console.log(`Loaded ${this.nodeCount} nodes and ${this.edgeCount} edges`);

    return { nodeData, edgeData, edgeIndexData, pieceIdData };
  }

  /**
   * Compute distances to the nearest goal from multiple goal nodes
   */
  computeDistancesToNearestGoal(goalNodeIds: string[]): void {
    const goalIndices: number[] = [];

    for (const goalNodeId of goalNodeIds) {
      const goalIndex = this.nodeIdToIndex.get(goalNodeId);
      if (goalIndex !== undefined) {
        goalIndices.push(goalIndex);
      } else {
        console.warn(`Goal node not found in graph: ${goalNodeId}`);
      }
    }

    if (goalIndices.length === 0) {
      console.warn(`No valid goal nodes found. Total nodes in graph: ${this.nodeCount}. Goal node IDs requested: ${goalNodeIds.join(", ")}`);
      return;
    }

    // Store end state indices for highlighting
    this.endStateIndices = new Set(goalIndices);

    this.distancesToGoal = computeDistancesToNearestGoal(
      goalIndices,
      this.nodeCount,
      this.edgeIndices,
      this.edgeCount
    );

    console.log(
      `Computed distances to nearest goal (${goalIndices.length} goal nodes)`
    );
  }

  getNodeCount(): number {
    return this.nodeCount;
  }

  getEdgeCount(): number {
    return this.edgeCount;
  }

  getNodeIndex(nodeId: string): number | undefined {
    return this.nodeIdToIndex.get(nodeId);
  }

  getNodeId(index: number): string | undefined {
    for (const [id, idx] of this.nodeIdToIndex) {
      if (idx === index) {
        return id;
      }
    }
    return undefined;
  }

  getEdgeIndices(): Uint32Array | null {
    return this.edgeIndices;
  }

  getEdgePieceIds(): Uint32Array | null {
    return this.edgePieceIds;
  }

  getInitialRadius(): number {
    return Math.max(100, Math.cbrt(this.nodeCount) * 5);
  }

  getDistancesToGoal(): Float32Array | null {
    return this.distancesToGoal;
  }

  getEndStateIndices(): Set<number> {
    return this.endStateIndices;
  }

  getGoalNodeIndex(): number {
    return this.goalNodeIndex;
  }
}
