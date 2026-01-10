
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
): Float32Array {
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
