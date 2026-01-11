
export function computeDistancesFromSource(
  sourceIndex: number,
  nodeCount: number,
  edgeIndices: Uint32Array | null,
  edgeCount: number
): Float32Array {
  const distances = new Float32Array(nodeCount);
  distances.fill(Infinity);

  if (!edgeIndices) {
    distances[sourceIndex] = 0;
    return distances;
  }

  // Build adjacency list from edge indices
  const adjacencyList: number[][] = Array.from({ length: nodeCount }, () => []);

  for (let i = 0; i < edgeCount; i++) {
    const source = edgeIndices[i * 2];
    const target = edgeIndices[i * 2 + 1];
    adjacencyList[source].push(target);
  }

  // BFS from source
  distances[sourceIndex] = 0;
  const queue: number[] = [sourceIndex];
  let queueIdx = 0;

  while (queueIdx < queue.length) {
    const current = queue[queueIdx++];
    const currentDist = distances[current];

    for (const neighbor of adjacencyList[current]) {
      if (distances[neighbor] === Infinity) {
        distances[neighbor] = currentDist + 1;
        queue.push(neighbor);
      }
    }
  }

  return distances;
}

/**
 * Compute distances to the nearest goal from multiple goal nodes.
 * Each node gets the minimum distance to any goal state.
 * Useful for showing "moves to solve" regardless of which goal is reached.
 */
export function computeDistancesToNearestGoal(
  goalIndices: number[],
  nodeCount: number,
  edgeIndices: Uint32Array | null,
  edgeCount: number
): Float32Array<ArrayBuffer> {
  const distances = new Float32Array(nodeCount);
  distances.fill(Infinity);

  if (!edgeIndices || goalIndices.length === 0) {
    // Mark all goal nodes as distance 0
    for (const goalIndex of goalIndices) {
      if (goalIndex >= 0 && goalIndex < nodeCount) {
        distances[goalIndex] = 0;
      }
    }
    return distances;
  }

  // Build reverse adjacency list (incoming edges)
  const reverseAdjacencyList: number[][] = Array.from({ length: nodeCount }, () => []);

  for (let i = 0; i < edgeCount; i++) {
    const source = edgeIndices[i * 2];
    const target = edgeIndices[i * 2 + 1];
    reverseAdjacencyList[target].push(source);
  }

  // Multi-source BFS starting from all goal nodes
  const queue: number[] = [];
  for (const goalIndex of goalIndices) {
    if (goalIndex >= 0 && goalIndex < nodeCount) {
      distances[goalIndex] = 0;
      queue.push(goalIndex);
    }
  }

  let queueIdx = 0;
  while (queueIdx < queue.length) {
    const current = queue[queueIdx++];
    const currentDist = distances[current];

    for (const predecessor of reverseAdjacencyList[current]) {
      if (distances[predecessor] === Infinity) {
        distances[predecessor] = currentDist + 1;
        queue.push(predecessor);
      }
    }
  }

  return distances;
}

/**
 * Find the shortest path from sourceIndex to the nearest goal node.
 * Uses distances and reconstructs the path by greedily moving to neighbors with lower distance.
 */
export function findPathToNearestGoal(
  sourceIndex: number,
  distances: Float32Array | null,
  edgeIndices: Uint32Array | null,
  edgeCount: number
): number[] {
  if (!distances || sourceIndex < 0 || sourceIndex >= distances.length) {
    return [];
  }

  const path: number[] = [sourceIndex];

  // If already at a goal (distance 0), return just the source
  if (distances[sourceIndex] === 0) {
    return path;
  }

  // If unreachable, return empty path
  if (!isFinite(distances[sourceIndex])) {
    return [];
  }

  if (!edgeIndices) {
    return path;
  }

  // Build adjacency list
  const adjacencyList: number[][] = Array.from({ length: distances.length }, () => []);
  for (let i = 0; i < edgeCount; i++) {
    const source = edgeIndices[i * 2];
    const target = edgeIndices[i * 2 + 1];
    adjacencyList[source].push(target);
  }

  // Greedily walk to neighbors with strictly decreasing distance
  let current = sourceIndex;
  const visited = new Set<number>();
  visited.add(current);
  const maxSteps = distances.length; // Prevent infinite loops

  for (let step = 0; step < maxSteps; step++) {
    const currentDist = distances[current];

    // Found goal
    if (currentDist === 0) {
      break;
    }

    // Find next node with lower distance
    let nextNode = -1;
    let minDist = currentDist;

    for (const neighbor of adjacencyList[current]) {
      if (!visited.has(neighbor) && distances[neighbor] < minDist) {
        minDist = distances[neighbor];
        nextNode = neighbor;
      }
    }

    if (nextNode === -1) {
      break; // No improvement found, stuck
    }

    path.push(nextNode);
    visited.add(nextNode);
    current = nextNode;
  }

  return path;
}
