export function updateConnectedNodes(
  selectedIndex: number,
  nodeCount: number,
  edgeIndices: Uint32Array | null,
  edgePieceIds: Uint32Array | null,
  edgeCount: number,
  pieceColorMapping: Map<number, number>,
  device: GPUDevice,
  connectedNodesBuffer: GPUBuffer,
  pathIndices?: number[]
): Uint32Array | null {
  if (!edgeIndices || !edgePieceIds || !connectedNodesBuffer || !device) return null;

  // Create array with 0 for all nodes
  // Value encoding: 0 = not connected, 1 = selected node, 2 = path to goal, 3+ = connected with color_index = value - 3
  const connectedData = new Uint32Array(nodeCount);

  if (selectedIndex >= 0) {
    // Mark the selected node itself (special value 1)
    connectedData[selectedIndex] = 1;

    // Map to track piece colors for each connected node
    // Prioritize outgoing edges over incoming edges
    const connectedNodesToPieces = new Map<number, number>();

    for (let i = 0; i < edgeCount; i++) {
      const source = edgeIndices[i * 2];
      const target = edgeIndices[i * 2 + 1];
      const pieceId = edgePieceIds[i];

      const colorIndex = pieceColorMapping.get(pieceId) ?? pieceId;

      if (source === selectedIndex) {
        // Outgoing edge: target node is reached by moving pieceId
        // Always set outgoing edges (they take priority)
        connectedNodesToPieces.set(target, colorIndex);
      } else if (target === selectedIndex && !connectedNodesToPieces.has(source)) {
        // Incoming edge: only use if we don't already have an outgoing edge to this node
        connectedNodesToPieces.set(source, colorIndex);
      }
    }

    // Apply the connected pieces coloring (3+ for connected nodes)
    for (const [nodeIdx, colorIdx] of connectedNodesToPieces.entries()) {
      connectedData[nodeIdx] = colorIdx + 3;
    }

    // Mark path nodes if provided - these override regular connections
    if (pathIndices && pathIndices.length > 0) {
      for (const nodeIdx of pathIndices) {
        if (nodeIdx >= 0 && nodeIdx < nodeCount && nodeIdx !== selectedIndex) {
          connectedData[nodeIdx] = 2;
        }
      }
    }
  }

  // Upload to GPU
  device.queue.writeBuffer(connectedNodesBuffer, 0, connectedData);

  return connectedData;
}

export function updateConnectedEdges(
  pathIndices: number[],
  edgeIndices: Uint32Array | null,
  edgeCount: number,
  device: GPUDevice,
  edgeHighlightBuffer: GPUBuffer
): void {
  if (!edgeIndices) return;

  const highlightData = new Uint32Array(edgeCount);

  // Mark edges that connect consecutive nodes in the path
  for (let i = 0; i < edgeCount; i++) {
    const source = edgeIndices[i * 2];
    const target = edgeIndices[i * 2 + 1];

    // Check if edge connects two consecutive path nodes
    for (let j = 0; j < pathIndices.length - 1; j++) {
      const pathNode1 = pathIndices[j];
      const pathNode2 = pathIndices[j + 1];

      if ((source === pathNode1 && target === pathNode2) || (source === pathNode2 && target === pathNode1)) {
        highlightData[i] = 1; // Mark as path edge
        break;
      }
    }
  }

  device.queue.writeBuffer(edgeHighlightBuffer, 0, highlightData);
}