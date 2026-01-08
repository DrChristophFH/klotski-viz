/**
 * KlotskiPiece Component
 * Renders a single puzzle piece with drag support and move indicators
 */

import React, { useMemo } from 'react';
import type { KlotskiPiece as KlotskiPieceType } from '../../types/klotski';
import { CELL_SIZE, GAP } from './constants';
import { getPiecePixelDimensions, gridToPixel } from './utils';
import { DirectionIndicator } from './DirectionIndicator';
import styles from './KlotskiPiece.module.css';

interface DragOffset {
  x: number;
  y: number;
}

interface KlotskiPieceProps {
  pieceIdx: number;
  piece: KlotskiPieceType;
  position: number[];
  color: string;
  canMove: boolean;
  availableDirections: string[];
  dragOffset: DragOffset;
  isDragging: boolean;
  onDragStart: (pieceIdx: number, e: React.MouseEvent | React.TouchEvent) => void;
}

export function KlotskiPieceComponent({
  pieceIdx,
  piece,
  position,
  color,
  canMove,
  availableDirections,
  dragOffset,
  isDragging,
  onDragStart,
}: KlotskiPieceProps) {
  const [x, y] = position;

  const dimensions = useMemo(
    () => getPiecePixelDimensions(piece.width, piece.height, CELL_SIZE, GAP),
    [piece.width, piece.height]
  );

  const pieceStyle: React.CSSProperties = useMemo(
    () => ({
      position: 'absolute',
      left: gridToPixel(x, CELL_SIZE, GAP) + dragOffset.x,
      top: gridToPixel(y, CELL_SIZE, GAP) + dragOffset.y,
      width: dimensions.width,
      height: dimensions.height,
      backgroundColor: color,
      ...getBaseStyles(canMove, isDragging),
      transform: isDragging ? 'scale(1.05)' : 'scale(1)',
      zIndex: isDragging ? 100 : 1,
    }),
    [x, y, dragOffset, dimensions, color, canMove, isDragging]
  );

  return (
    <div
      className={`${styles.piece} ${
        isDragging ? styles.pieceDragging : canMove ? styles.pieceMovable : styles.pieceDefault
      }`}
      style={pieceStyle}
      onMouseDown={(e) => canMove && onDragStart(pieceIdx, e)}
      onTouchStart={(e) => canMove && onDragStart(pieceIdx, e)}
      title={canMove ? `Drag to move (${availableDirections.join(', ')})` : ''}
    >
      {/* Piece label - only for the main piece (index 0) */}
      {pieceIdx === 0 && <span className={styles.pieceLabel}>曹</span>}

      {/* Direction indicators - only show when not dragging and piece is movable */}
      {canMove && !isDragging && <DirectionIndicator directions={availableDirections} />}
    </div>
  );
}

/**
 * Get base styles for a piece based on its state
 */
function getBaseStyles(canMove: boolean, isDragging: boolean): React.CSSProperties {
  if (isDragging) {
    return {
      boxShadow: '0 0 20px rgba(255, 255, 255, 0.8)',
      border: '2px solid rgba(255,255,255,0.6)',
      cursor: 'grabbing',
      transition: 'none',
      userSelect: 'none',
    };
  }

  if (canMove) {
    return {
      boxShadow: '0 0 10px rgba(255, 255, 255, 0.5)',
      border: '2px solid rgba(255,255,255,0.6)',
      cursor: 'grab',
      transition: 'transform 0.15s ease',
      userSelect: 'none',
    };
  }

  return {
    boxShadow: '2px 2px 4px rgba(0,0,0,0.3)',
    cursor: 'default',
    transition: 'transform 0.15s ease',
    userSelect: 'none',
  };
}

export default KlotskiPieceComponent;
