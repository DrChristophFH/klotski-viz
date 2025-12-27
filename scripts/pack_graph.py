#!/usr/bin/env python3
"""
Pack Klotski state space graph with precomputed positions into an optimized binary format.

This script:
1. Loads the original JSON state space and precomputed node positions
2. Merges them into a compact binary format
3. Applies quantization to reduce position precision
4. Uses efficient compression (brotli for web delivery)

Binary format:
- Header: magic bytes, version, counts
- Metadata: board dimensions, piece info
- Nodes: indexed by position in file, positions array stored compactly
- Node positions (x,y,z): quantized to 16-bit integers
- Edges: source/target as node indices, piece_id as u8

Output can be loaded efficiently in JavaScript with minimal parsing.
"""

import json
import struct
import zlib
import argparse
from pathlib import Path
from typing import Dict, List, Tuple, Any

# Try to import brotli for better web compression
try:
    import brotli
    HAS_BROTLI = True
except ImportError:
    HAS_BROTLI = False
    print("Warning: brotli not available, falling back to gzip")

MAGIC = b'KLGR'  # Klotski Graph
VERSION = 1

# Quantization settings
POSITION_SCALE = 1.0  


def load_json(path: Path) -> Any:
    """Load and parse a JSON file."""
    print(f"Loading {path}...")
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def quantize_position(value: float) -> int:
    """Quantize a float position to int16."""
    scaled = value * POSITION_SCALE
    clamped = max(-32768, min(32767, int(round(scaled))))
    return clamped


def dequantize_position(value: int) -> float:
    """Dequantize int16 back to float (for verification)."""
    return value / POSITION_SCALE


def pack_graph(
    statespace_path: Path,
    positions_path: Path,
    output_path: Path,
    compression: str = 'brotli'
) -> Dict[str, Any]:
    """
    Pack the graph data into a compressed binary format.
    
    Returns statistics about the packing.
    """
    # Load data
    statespace = load_json(statespace_path)
    positions = load_json(positions_path)
    
    metadata = statespace['metadata']
    pieces = statespace['pieces']
    nodes = statespace['nodes']
    edges = statespace['edges']
    
    # Build position lookup: id -> (x, y, z)
    pos_lookup: Dict[str, Tuple[float, float, float]] = {}
    for p in positions:
        pos_lookup[p['id']] = (p['x'], p['y'], p['z'])
    
    # Build node id to index mapping
    node_id_to_idx: Dict[str, int] = {}
    for idx, node in enumerate(nodes):
        node_id_to_idx[node['id']] = idx
    
    print(f"Nodes: {len(nodes)}, Edges: {len(edges)}, Pieces: {len(pieces)}")
    
    # === Build binary data ===
    binary_parts: List[bytes] = []
    
    # Header (20 bytes)
    # - Magic: 4 bytes
    # - Version: 2 bytes (u16)
    # - Node count: 4 bytes (u32)
    # - Edge count: 4 bytes (u32)
    # - Piece count: 2 bytes (u16)
    # - Board width: 1 byte (u8)
    # - Board height: 1 byte (u8)
    # - Position scale: 2 bytes (u16, fixed point with 1 decimal)
    header = struct.pack(
        '<4sHIIHBBH',
        MAGIC,
        VERSION,
        len(nodes),
        len(edges),
        len(pieces),
        metadata['board_width'],
        metadata['board_height'],
        int(POSITION_SCALE * 10)  # Store as 100 for 10.0
    )
    binary_parts.append(header)
    
    # Pieces (2 bytes each: width u8, height u8)
    pieces_data = b''.join(
        struct.pack('<BB', p['width'], p['height'])
        for p in pieces
    )
    binary_parts.append(pieces_data)
    
    # Node IDs (as raw 32 hex chars = 16 bytes each, stored as binary)
    # This allows direct lookup without string parsing
    node_ids_data = b''.join(
        bytes.fromhex(node['id'])
        for node in nodes
    )
    binary_parts.append(node_ids_data)
    
    # Node piece positions (10 pieces * 2 coords * 1 byte each = 20 bytes per node)
    # Each position is [x, y] where x,y are 0-3 (fit in nibbles, but use bytes for simplicity)
    node_positions_data = b''
    for node in nodes:
        pos_list = node['positions']  # List of [x, y] for each piece
        for px, py in pos_list:
            node_positions_data += struct.pack('<BB', px, py)
    binary_parts.append(node_positions_data)
    
    # 3D positions (6 bytes per node: x, y, z as int16)
    positions_3d_data = b''
    missing_positions = 0
    for node in nodes:
        nid = node['id']
        if nid in pos_lookup:
            x, y, z = pos_lookup[nid]
            qx = quantize_position(x)
            qy = quantize_position(y)
            qz = quantize_position(z)
            positions_3d_data += struct.pack('<hhh', qx, qy, qz)
        else:
            # Node without position - use 0,0,0
            missing_positions += 1
            positions_3d_data += struct.pack('<hhh', 0, 0, 0)
    
    if missing_positions > 0:
        print(f"Warning: {missing_positions} nodes have no precomputed position")
    
    binary_parts.append(positions_3d_data)
    
    # Map direction strings to u8 codes
    direction_map = {'up': 0, 'down': 1, 'left': 2, 'right': 3}
    
    # Edges (10 bytes each: source u32, target u32, piece_id u8, direction u8)
    edges_data = b''
    for edge in edges:
        src_idx = node_id_to_idx[edge['source']]
        tgt_idx = node_id_to_idx[edge['target']]
        piece_id = edge['piece_id']
        direction = direction_map.get(edge.get('direction', 'up'), 0)
        edges_data += struct.pack('<IIBB', src_idx, tgt_idx, piece_id, direction)
    binary_parts.append(edges_data)
    
    # Combine all parts
    raw_data = b''.join(binary_parts)
    print(f"Raw binary size: {len(raw_data):,} bytes")
    
    # Compress
    if compression == 'brotli' and HAS_BROTLI:
        compressed = brotli.compress(raw_data, quality=11)
        output_ext = '.br'
    else:
        compressed = zlib.compress(raw_data, level=9)
        output_ext = '.gz'
    
    print(f"Compressed size ({compression}): {len(compressed):,} bytes")
    print(f"Compression ratio: {len(raw_data) / len(compressed):.2f}x")
    
    # Write output
    output_file = output_path.with_suffix(output_ext)
    with open(output_file, 'wb') as f:
        f.write(compressed)
    
    print(f"Written to: {output_file}")
    
    # Also write an uncompressed version for debugging
    debug_file = output_path.with_suffix('.bin')
    with open(debug_file, 'wb') as f:
        f.write(raw_data)
    print(f"Debug (uncompressed) written to: {debug_file}")
    
    # Calculate statistics
    stats = {
        'nodes': len(nodes),
        'edges': len(edges),
        'pieces': len(pieces),
        'raw_size': len(raw_data),
        'compressed_size': len(compressed),
        'compression_ratio': len(raw_data) / len(compressed),
        'original_json_size': statespace_path.stat().st_size,
        'positions_json_size': positions_path.stat().st_size,
    }
    
    total_json = stats['original_json_size'] + stats['positions_json_size']
    print("\nOriginal JSON sizes:")
    print(f"  State space: {stats['original_json_size']:,} bytes")
    print(f"  Positions:   {stats['positions_json_size']:,} bytes")
    print(f"  Total:       {total_json:,} bytes")
    print(f"\nSpace savings: {(1 - stats['compressed_size'] / total_json) * 100:.1f}%")
    
    return stats


def generate_typescript_loader(output_path: Path):
    """Generate a TypeScript module to load the binary format."""
    ts_code = '''/**
 * Loader for packed Klotski graph binary format
 * Auto-generated by pack_graph.py
 */

export interface PackedGraphData {
  metadata: {
    nodeCount: number;
    edgeCount: number;
    pieceCount: number;
    boardWidth: number;
    boardHeight: number;
    positionScale: number;
  };
  pieces: Array<{ width: number; height: number }>;
  nodes: Array<{
    id: string;
    positions: Array<[number, number]>;
    x: number;
    y: number;
    z: number;
  }>;
  edges: Array<{
    source: string;
    target: string;
    piece_id: number;
    direction: string;
  }>;
}

export async function loadPackedGraph(url: string): Promise<PackedGraphData> {
  const response = await fetch(url);
  const compressed = await response.arrayBuffer();
  
  // Decompress based on URL extension
  let data: ArrayBuffer;
  if (url.endsWith('.br')) {
    // Brotli - browser handles this automatically with Accept-Encoding
    // If served with Content-Encoding: br, this is already decompressed
    data = compressed;
  } else if (url.endsWith('.gz')) {
    // Gzip - use DecompressionStream if available
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
    data = compressed;
  }
  
  return parsePackedGraph(data);
}

function parsePackedGraph(buffer: ArrayBuffer): PackedGraphData {
  const view = new DataView(buffer);
  let offset = 0;
  
  // Read header
  const magic = String.fromCharCode(
    view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)
  );
  if (magic !== 'KLGR') {
    throw new Error(`Invalid magic: ${magic}`);
  }
  offset = 4;
  
  const version = view.getUint16(offset, true); offset += 2;
  const nodeCount = view.getUint32(offset, true); offset += 4;
  const edgeCount = view.getUint32(offset, true); offset += 4;
  const pieceCount = view.getUint16(offset, true); offset += 2;
  const boardWidth = view.getUint8(offset); offset += 1;
  const boardHeight = view.getUint8(offset); offset += 1;
  const positionScaleRaw = view.getUint16(offset, true); offset += 2;
  const positionScale = positionScaleRaw / 10;
  
  // Read pieces
  const pieces: Array<{ width: number; height: number }> = [];
  for (let i = 0; i < pieceCount; i++) {
    pieces.push({
      width: view.getUint8(offset),
      height: view.getUint8(offset + 1),
    });
    offset += 2;
  }
  
  // Read node IDs (16 bytes each, as hex)
  const nodeIds: string[] = [];
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < nodeCount; i++) {
    let hex = '';
    for (let j = 0; j < 16; j++) {
      hex += bytes[offset + j].toString(16).padStart(2, '0');
    }
    nodeIds.push(hex);
    offset += 16;
  }
  
  // Read node piece positions (20 bytes per node: 10 pieces * 2 coords)
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
  const nodes = nodeIds.map((id, i) => ({
    id,
    positions: nodePiecePositions[i],
    ...node3DPositions[i],
  }));
  
  // Read edges (10 bytes each: source u32, target u32, piece_id u8, direction u8)
  const directionMap = ['up', 'down', 'left', 'right'];
  const edges: Array<{ source: string; target: string; piece_id: number; direction: string }> = [];
  for (let i = 0; i < edgeCount; i++) {
    const srcIdx = view.getUint32(offset, true);
    const tgtIdx = view.getUint32(offset + 4, true);
    const pieceId = view.getUint8(offset + 8);
    const directionCode = view.getUint8(offset + 9);
    edges.push({
      source: nodeIds[srcIdx],
      target: nodeIds[tgtIdx],
      piece_id: pieceId,
      direction: directionMap[directionCode] || 'up',
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
'''
    
    ts_path = output_path.parent / 'loadPackedGraph.ts'
    with open(ts_path, 'w', encoding='utf-8') as f:
        f.write(ts_code)
    print(f"TypeScript loader written to: {ts_path}")


def main():
    parser = argparse.ArgumentParser(
        description='Pack Klotski graph with positions into optimized binary format'
    )
    parser.add_argument(
        '--statespace',
        type=Path,
        default=Path('klotski_classic_statespace.json'),
        help='Path to the state space JSON file'
    )
    parser.add_argument(
        '--positions',
        type=Path,
        default=Path('../data/node_positions.json'),
        help='Path to the node positions JSON file'
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=Path('../frontend/public/klotski_packed'),
        help='Output path (without extension)'
    )
    parser.add_argument(
        '--compression',
        choices=['brotli', 'gzip'],
        default='brotli' if HAS_BROTLI else 'gzip',
        help='Compression algorithm to use'
    )
    parser.add_argument(
        '--generate-loader',
        action='store_true',
        help='Generate TypeScript loader module'
    )
    
    args = parser.parse_args()
    
    stats = pack_graph(
        args.statespace,
        args.positions,
        args.output,
        args.compression
    )
    
    if args.generate_loader:
        generate_typescript_loader(args.output)
    
    print("\nDone!")


if __name__ == '__main__':
    main()
