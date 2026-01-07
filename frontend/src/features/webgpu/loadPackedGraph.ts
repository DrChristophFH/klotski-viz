/**
 * Loader for packed Klotski graph binary format
 * 
 * Binary format:
 * - Header (20 bytes): magic, version, counts, board dimensions, position scale
 * - Pieces: width/height for each piece
 * - Node IDs: 16 bytes (hex) per node
 * - Node piece positions: 2 bytes per piece per node
 * - 3D positions: 6 bytes (int16 x,y,z) per node  
 * - Edges: 9 bytes (source u32, target u32, piece_id u8) per edge
 */

export interface PackedGraphMetadata {
  nodeCount: number;
  edgeCount: number;
  pieceCount: number;
  boardWidth: number;
  boardHeight: number;
  positionScale: number;
}

export interface PackedPiece {
  id: number;
  width: number;
  height: number;
}

export interface PackedNode {
  id: string;
  positions: Array<[number, number]>;  // Piece positions on board
  x: number;  // 3D position
  y: number;
  z: number;
}

export interface PackedEdge {
  source: string;
  target: string;
  piece_id: number;
  direction: string;
}

export interface PackedGraphData {
  metadata: PackedGraphMetadata;
  pieces: PackedPiece[];
  nodes: PackedNode[];
  edges: PackedEdge[];
}

/**
 * Load and decompress a packed Klotski graph file
 */
export async function loadPackedGraph(url: string): Promise<PackedGraphData> {
  const fullUrl = import.meta.env.BASE_URL + url;
  const response = await fetch(fullUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${fullUrl}: ${response.status}`);
  }
  
  let data: ArrayBuffer;
  
  if (fullUrl.endsWith('.br')) {
    // Brotli - if server sends with Content-Encoding: br, browser auto-decompresses
    // Otherwise we need a JS decompressor. For now assume server handles it.
    data = await response.arrayBuffer();
  } else if (fullUrl.endsWith('.gz')) {
    // Gzip - use DecompressionStream
    const compressed = await response.arrayBuffer();
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(new Uint8Array(compressed));
    writer.close();
    
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    data = result.buffer;
  } else {
    // Assume uncompressed .bin
    data = await response.arrayBuffer();
  }
  
  return parsePackedGraph(data);
}

/**
 * Parse the binary packed graph format
 */
function parsePackedGraph(buffer: ArrayBuffer): PackedGraphData {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  
  // Read magic bytes
  const magic = String.fromCharCode(
    view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)
  );
  if (magic !== 'KLGR') {
    throw new Error(`Invalid magic bytes: ${magic}`);
  }
  offset = 4;
  
  // Read header
  const version = view.getUint16(offset, true); offset += 2;
  if (version !== 1) {
    throw new Error(`Unsupported version: ${version}`);
  }
  
  const nodeCount = view.getUint32(offset, true); offset += 4;
  const edgeCount = view.getUint32(offset, true); offset += 4;
  const pieceCount = view.getUint16(offset, true); offset += 2;
  const boardWidth = view.getUint8(offset); offset += 1;
  const boardHeight = view.getUint8(offset); offset += 1;
  const positionScaleRaw = view.getUint16(offset, true); offset += 2;
  const positionScale = positionScaleRaw / 10;
  
  console.log(`Loading packed graph: ${nodeCount} nodes, ${edgeCount} edges, ${pieceCount} pieces`);
  
  // Read pieces
  const pieces: PackedPiece[] = [];
  for (let i = 0; i < pieceCount; i++) {
    pieces.push({
      id: i,
      width: view.getUint8(offset),
      height: view.getUint8(offset + 1),
    });
    offset += 2;
  }
  
  // Read node IDs (16 bytes each as hex string)
  const nodeIds: string[] = [];
  for (let i = 0; i < nodeCount; i++) {
    let hex = '';
    for (let j = 0; j < 16; j++) {
      hex += bytes[offset + j].toString(16).padStart(2, '0');
    }
    nodeIds.push(hex);
    offset += 16;
  }
  
  // Read node piece positions (pieceCount * 2 bytes per node)
  const nodePiecePositions: Array<Array<[number, number]>> = [];
  for (let i = 0; i < nodeCount; i++) {
    const positions: Array<[number, number]> = [];
    for (let p = 0; p < pieceCount; p++) {
      positions.push([
        view.getUint8(offset),
        view.getUint8(offset + 1),
      ]);
      offset += 2;
    }
    nodePiecePositions.push(positions);
  }
  
  // Read 3D positions (6 bytes per node: x, y, z as int16)
  const node3DPositions: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < nodeCount; i++) {
    const x = view.getInt16(offset, true) / positionScale;
    const y = view.getInt16(offset + 2, true) / positionScale;
    const z = view.getInt16(offset + 4, true) / positionScale;
    node3DPositions.push({ x, y, z });
    offset += 6;
  }
  
  // Combine into nodes array
  const nodes: PackedNode[] = nodeIds.map((id, i) => ({
    id,
    positions: nodePiecePositions[i],
    ...node3DPositions[i],
  }));
  
  // Read edges (10 bytes each: source u32, target u32, piece_id u8, direction u8)
  const directionMap = ['up', 'down', 'left', 'right'];
  const edges: PackedEdge[] = [];
  for (let i = 0; i < edgeCount; i++) {
    const srcIdx = view.getUint32(offset, true);
    const tgtIdx = view.getUint32(offset + 4, true);
    const pieceId = view.getUint8(offset + 8);
    const directionCode = view.getUint8(offset + 9);
    edges.push({
      source: nodeIds[srcIdx],
      target: nodeIds[tgtIdx],
      piece_id: pieceId,
      direction: directionMap[directionCode] || 'unknown',
    });
    offset += 10;
  }
  
  return {
    metadata: {
      nodeCount,
      edgeCount,
      pieceCount,
      boardWidth,
      boardHeight,
      positionScale,
    },
    pieces,
    nodes,
    edges,
  };
}

/**
 * Checks for following start config:
 * 
 *  I M M I
 *  I M M I
 *  I - - I
 *  I . . I
 *  .     . 
 * 
 */
export function isStartState(node: PackedNode): boolean {
  return (
    node.positions[0][0] === 1 && node.positions[0][1] === 0 && // Main piece (M)
    node.positions[1][0] === 0 && node.positions[1][1] === 0 && // I piece
    node.positions[2][0] === 3 && node.positions[2][1] === 0 && // I piece
    node.positions[3][0] === 0 && node.positions[3][1] === 2 && // I piece
    node.positions[4][0] === 3 && node.positions[4][1] === 2 && // I piece
    node.positions[5][0] === 1 && node.positions[5][1] === 2 && // - piece 
    node.positions[6][0] === 0 && node.positions[6][1] === 4 && // . piece
    node.positions[7][0] === 1 && node.positions[7][1] === 3 && // . piece
    node.positions[8][0] === 2 && node.positions[8][1] === 3 && // . piece
    node.positions[9][0] === 3 && node.positions[9][1] === 4    // . piece
  );
}

/**
 * Checks if main piece is at bottom center (end state)
 * 
 *  x x x x
 *  x x x x
 *  x x x x
 *  x M M x
 *  x M M x
 */
export function isEndState(node: PackedNode): boolean {
  return node.positions[0][0] === 1 && node.positions[0][1] === 3;
}