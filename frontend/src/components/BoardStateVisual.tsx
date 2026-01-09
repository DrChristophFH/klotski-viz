/**
 * Shared visual board state component
 * Renders a Klotski board state in a compact form
 */

import type { KlotskiNode, KlotskiPiece, KlotskiMetadata } from '../types/klotski';

interface BoardStateVisualProps {
  node: KlotskiNode;
  pieces: KlotskiPiece[];
  metadata: KlotskiMetadata;
  cellSize?: number;
  gap?: number;
  showGoal?: boolean;
}

// Piece colors matching KlotskiPuzzle and WebGPUGraphRenderer
const PIECE_COLORS: string[] = [
  '#F44336', // 0: Vibrant Red
  '#2196F3', // 1: Bright Blue
  '#4CAF50', // 2: Forest Green
  '#FFC107', // 3: Golden Yellow
  '#9C27B0', // 4: Deep Purple
  '#00BCD4', // 5: Cyan
  '#FF5722', // 6: Deep Orange
  '#E91E63', // 7: Pink
  '#8BC34A', // 8: Lime Green
  '#673AB7', // 9: Indigo
];

export function BoardStateVisual({
  node,
  pieces,
  metadata,
  cellSize = 15,
  gap = 1,
  showGoal = false,
}: BoardStateVisualProps) {
  const { board_width, board_height } = metadata;

  return (
    <div
      style={{
        position: 'relative',
        width: board_width * (cellSize + gap) - gap,
        height: board_height * (cellSize + gap) - gap,
        backgroundColor: '#2c3e50',
        borderRadius: cellSize > 20 ? '8px' : '4px',
        padding: gap,
      }}
    >
      {/* Grid background */}
      {Array(board_height).fill(null).map((_, y) => (
        Array(board_width).fill(null).map((_, x) => (
          <div
            key={`${x}-${y}`}
            style={{
              position: 'absolute',
              left: x * (cellSize + gap),
              top: y * (cellSize + gap),
              width: cellSize,
              height: cellSize,
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              borderRadius: cellSize > 20 ? '4px' : '2px',
            }}
          />
        ))
      ))}
      
      {/* Pieces */}
      {node.positions.map((pos, pieceIdx) => {
        const piece = pieces[pieceIdx];
        if (!piece) return null;
        
        const [x, y] = pos;
        const color = PIECE_COLORS[pieceIdx % PIECE_COLORS.length];
        
        return (
          <div
            key={pieceIdx}
            style={{
              position: 'absolute',
              left: x * (cellSize + gap),
              top: y * (cellSize + gap),
              width: piece.width * cellSize + (piece.width - 1) * gap,
              height: piece.height * cellSize + (piece.height - 1) * gap,
              backgroundColor: color,
              borderRadius: cellSize > 20 ? '6px' : '3px',
              border: '1px solid rgba(0,0,0,0.3)',
              transition: 'all 0.2s ease',
            }}
          />
        );
      })}
      
      {/* Goal indicator (optional) */}
      {showGoal && (
        <div
          style={{
            position: 'absolute',
            left: (board_width / 2 - 1) * (cellSize + gap),
            top: (board_height - 1) * (cellSize + gap) + cellSize + 3,
            width: 2 * cellSize + gap,
            height: 3,
            backgroundColor: '#e74c3c',
            borderRadius: '2px',
          }}
        />
      )}
    </div>
  );
}
