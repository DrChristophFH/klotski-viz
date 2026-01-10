export function updateConnectedNodes(
  selectedIndex: number,
  nodeCount: number,
  edgeIndices: Uint32Array | null,
  edgePieceIds: Uint32Array | null,
  edgeCount: number,
  pieceColorMapping: Map<number, number>,
  device: GPUDevice,
  connectedNodesBuffer: GPUBuffer
): Uint32Array | null {
  if (!edgeIndices || !edgePieceIds || !connectedNodesBuffer || !device) return null;

  // Create array with 0 for all nodes
  // Value encoding: 0 = not connected, 1 = selected node, 2+ = connected with color_index = value - 2
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

    // Apply the connected pieces coloring
    for (const [nodeIdx, colorIdx] of connectedNodesToPieces.entries()) {
      connectedData[nodeIdx] = colorIdx + 2;
    }
  }

  // Upload to GPU
  device.queue.writeBuffer(connectedNodesBuffer, 0, connectedData);

  return connectedData;
}
