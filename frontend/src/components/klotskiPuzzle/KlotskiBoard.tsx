/**
 * KlotskiBoard Component
 * Renders the puzzle board with grid and pieces
 */

import React, { useMemo } from 'react';
import { CELL_SIZE, GAP } from './constants';
import { gridToPixel } from './utils';
import styles from './KlotskiPuzzle.module.css';
import type { KlotskiNode } from '../../types/klotski';
import type { KlotskiPiece } from '../../types/klotski';
import KlotskiPieceComponent from './KlotskiPiece';

interface DragOffset {
  x: number;
  y: number;
}

interface PieceMove {
  targetId: string;
  pieceId: number;
  direction: string;
}

interface KlotskiBoardProps {
  currentNode: KlotskiNode;
  pieces: KlotskiPiece[];
  boardWidth: number;
  boardHeight: number;
  getPieceColor: (pieceIdx: number) => string;
  availableMoves: PieceMove[];
  dragOffsets: Map<number, DragOffset>;
  draggedPieceIdx: number | null;
  onPieceInteractionStart: (pieceIdx: number, e: React.MouseEvent | React.TouchEvent) => void;
}

export function KlotskiBoard({
  currentNode,
  pieces,
  boardWidth,
  boardHeight,
  getPieceColor,
  availableMoves,
  dragOffsets,
  draggedPieceIdx,
  onPieceInteractionStart,
}: KlotskiBoardProps) {
  const boardDimensions = useMemo(
    () => ({
      width: boardWidth * (CELL_SIZE + GAP) - GAP,
      height: boardHeight * (CELL_SIZE + GAP) - GAP,
    }),
    [boardWidth, boardHeight]
  );

  const gridCells = useMemo(() => {
    const cells = [];
    for (let y = 0; y < boardHeight; y++) {
      for (let x = 0; x < boardWidth; x++) {
        cells.push({ x, y });
      }
    }
    return cells;
  }, [boardWidth, boardHeight]);

  const getMovesForPiece = (pieceIdx: number) => {
    return availableMoves.filter((m) => m.pieceId === pieceIdx);
  };

  const getAvailableDirections = (pieceIdx: number): string[] => {
    return getMovesForPiece(pieceIdx).map((m) => m.direction);
  };

  return (
    <div
      style={{
        position: 'relative',
        width: boardDimensions.width,
        height: boardDimensions.height,
        backgroundColor: '#2c3e50',
        borderRadius: '8px',
        padding: GAP,
      }}
    >
      {/* Grid background */}
      {gridCells.map(({ x, y }) => (
        <div
          key={`${x}-${y}`}
          className={styles.gridCell}
          style={{
            position: 'absolute',
            left: gridToPixel(x, CELL_SIZE, GAP),
            top: gridToPixel(y, CELL_SIZE, GAP),
            width: CELL_SIZE,
            height: CELL_SIZE,
          }}
        />
      ))}

      {/* Pieces */}
      {currentNode.positions.map((pos, pieceIdx) => {
        const piece = pieces[pieceIdx];
        if (!piece) return null;

        const moves = getMovesForPiece(pieceIdx);
        const canMove = moves.length > 0;
        const dragOffset = dragOffsets.get(pieceIdx) || { x: 0, y: 0 };
        const isDragging = draggedPieceIdx === pieceIdx;

        return (
          <KlotskiPieceComponent
            key={pieceIdx}
            pieceIdx={pieceIdx}
            piece={piece}
            position={pos}
            color={getPieceColor(pieceIdx)}
            canMove={canMove}
            availableDirections={getAvailableDirections(pieceIdx)}
            dragOffset={dragOffset}
            isDragging={isDragging}
            onDragStart={onPieceInteractionStart}
          />
        );
      })}

      {/* Goal indicator (bottom center) */}
      <div
        className={styles.goalIndicator}
        style={{
          position: 'absolute',
          left: gridToPixel(boardWidth / 2 - 1, CELL_SIZE, GAP),
          top: gridToPixel(boardHeight - 1, CELL_SIZE, GAP) + CELL_SIZE + 5,
          width: 2 * CELL_SIZE + GAP,
          height: 4,
        }}
      />
    </div>
  );
}

export default KlotskiBoard;
