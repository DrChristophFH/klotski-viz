/**
 * Interactive Klotski Puzzle Visualization Component
 * 
 * Displays the current state of a Klotski puzzle and allows
 * the user to slide pieces by dragging, triggering navigation in the state space graph.
 * 
 * Features:
 * - Color identity preservation across state changes  
 * - Drag-to-move functionality for directional piece movement
 */

import { useCallback, useMemo } from 'react';
import type { KlotskiPiece, KlotskiNode, KlotskiEdge, KlotskiMetadata } from '../../types/klotski';
import { PIECE_COLORS, CELL_SIZE, DEFAULT_FALLBACK_COLOR } from './constants';
import { getPieceKey, getEventCoordinates, getDragDirection, clamp } from './utils';
import {
  useColorMapping,
  useDragState,
  useAvailableMoves,
  useColorMappingEffect,
} from './hooks';
import KlotskiBoard from './KlotskiBoard';
import styles from './KlotskiPuzzle.module.css';

interface KlotskiPuzzleProps {
  metadata: KlotskiMetadata;
  pieces: KlotskiPiece[];
  currentNode: KlotskiNode | null;
  edges: KlotskiEdge[];
  onMove?: (targetNodeId: string) => void;
  onColorMappingChange?: (mapping: Map<number, number>) => void;
}

export function KlotskiPuzzle({
  metadata,
  pieces,
  currentNode,
  edges,
  onMove,
  onColorMappingChange,
}: KlotskiPuzzleProps) {
  const { board_width, board_height } = metadata;

  // State management hooks
  const colorMapping = useColorMapping(currentNode, pieces);
  const { dragState, startDrag, updateDrag, endDrag } = useDragState();
  const availableMoves = useAvailableMoves(currentNode, edges);

  // Report color mapping to parent
  useColorMappingEffect(colorMapping, currentNode, pieces, onColorMappingChange);

  /**
   * Get color for a piece based on current color mapping
   */
  const getPieceColor = useCallback(
    (pieceIdx: number): string => {
      if (!currentNode) return PIECE_COLORS[pieceIdx] || DEFAULT_FALLBACK_COLOR;

      const key = getPieceKey(pieceIdx, currentNode.positions, pieces);
      const colorIdx = colorMapping.get(key);

      if (colorIdx !== undefined) {
        return PIECE_COLORS[colorIdx] || DEFAULT_FALLBACK_COLOR;
      }

      return PIECE_COLORS[pieceIdx] || DEFAULT_FALLBACK_COLOR;
    },
    [currentNode, pieces, colorMapping]
  );

  /**
   * Handle drag start on a piece
   */
  const handlePieceDragStart = useCallback(
    (pieceIdx: number, e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const { x, y } = getEventCoordinates(e);
      startDrag(pieceIdx, x, y);
    },
    [startDrag]
  );

  /**
   * Handle drag move
   */
  const handleBoardDragMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!dragState) return;
      const { x, y } = getEventCoordinates(e);
      updateDrag(x, y);
    },
    [dragState, updateDrag]
  );

  /**
   * Handle drag end and move execution
   */
  const handleBoardDragEnd = useCallback(() => {
    if (!dragState || !onMove) {
      endDrag();
      return;
    }

    const dx = dragState.currentX - dragState.startX;
    const dy = dragState.currentY - dragState.startY;
    const direction = getDragDirection(dx, dy);

    const movesForPiece = availableMoves.filter((m) => m.pieceId === dragState.pieceIdx);

    if (direction) {
      // Find move matching the drag direction
      const matchingMove = movesForPiece.find((m) => m.direction === direction);
      if (matchingMove) {
        onMove(matchingMove.targetId);
      }
    } else if (movesForPiece.length === 1) {
      // No clear direction but only one possible move - do it
      onMove(movesForPiece[0].targetId);
    }

    endDrag();
  }, [dragState, onMove, availableMoves, endDrag]);

  /**
   * Calculate drag offset for visual feedback
   * Memoized to avoid recalculation on every render
   */
  const dragOffsets = useMemo(() => {
    const offsets = new Map<number, { x: number; y: number }>();

    if (!dragState) {
      return offsets;
    }

    const dx = dragState.currentX - dragState.startX;
    const dy = dragState.currentY - dragState.startY;

    // Limit the visual offset to prevent wild dragging
    const maxOffset = CELL_SIZE * 0.5;
    offsets.set(dragState.pieceIdx, {
      x: clamp(dx, -maxOffset, maxOffset),
      y: clamp(dy, -maxOffset, maxOffset),
    });

    return offsets;
  }, [dragState]);

  // Render nothing when no node selected
  if (!currentNode) {
    return <div className={styles.noNodeMessage}>Click a node to view its Klotski state</div>;
  }

  return (
    <div
      className={styles.puzzleContainer}
      onMouseMove={handleBoardDragMove}
      onMouseUp={handleBoardDragEnd}
      onMouseLeave={handleBoardDragEnd}
      onTouchMove={handleBoardDragMove}
      onTouchEnd={handleBoardDragEnd}
    >
      {/* State indicator */}
      <div className={styles.stateLabel}>State: {currentNode.id.substring(0, 16)}...</div>

      {/* Board with pieces */}
      <KlotskiBoard
        currentNode={currentNode}
        pieces={pieces}
        boardWidth={board_width}
        boardHeight={board_height}
        getPieceColor={getPieceColor}
        availableMoves={availableMoves}
        dragOffsets={dragOffsets}
        draggedPieceIdx={dragState?.pieceIdx ?? null}
        onPieceInteractionStart={handlePieceDragStart}
      />

      {/* Moves info */}
      <div className={styles.movesInfo}>
        {availableMoves.length} possible moves • Drag pieces to move
      </div>
    </div>
  );
}

export default KlotskiPuzzle;
