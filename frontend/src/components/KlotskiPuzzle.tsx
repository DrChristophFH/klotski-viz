/**
 * Interactive Klotski Puzzle Visualization Component
 * 
 * Displays the current state of a Klotski puzzle and allows
 * the user to slide pieces by dragging, triggering navigation in the state space graph.
 * 
 * Features:
 * - Color identity preservation across state changes  
 * - Drag-to-move functionality for directional piece movement
 * - Visual indicators for movable pieces and next recommended move
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KlotskiPiece, KlotskiNode, KlotskiEdge, KlotskiMetadata } from '../types/klotski';
import type { PackedEdge } from '../webgpu/loadPackedGraph';

interface KlotskiPuzzleProps {
  metadata: KlotskiMetadata;
  pieces: KlotskiPiece[];
  currentNode: KlotskiNode | null;
  edges: KlotskiEdge[];
  nextMove: PackedEdge | null;
  onMove?: (targetNodeId: string) => void;
  onColorMappingChange?: (mapping: Map<number, number>) => void;
}

// Base piece colors - vibrant, distinct Material Design colors (matching WebGPUGraphRenderer)
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

const CELL_SIZE = 50;
const GAP = 2;

// Minimum drag distance to register as a directional drag (in pixels)
const MIN_DRAG_DISTANCE = 15;

function reverseDirection(dir: string): string {
  const reverseMap: Record<string, string> = {
    'up': 'down',
    'down': 'up',
    'left': 'right',
    'right': 'left',
  };
  return reverseMap[dir] || dir;
}

// Helper to create a unique key for a piece based on its position and shape
function getPieceKey(pieceIdx: number, positions: number[][], pieces: KlotskiPiece[]): string {
  const pos = positions[pieceIdx];
  const piece = pieces[pieceIdx];
  if (!pos || !piece) return '';
  return `${piece.width}x${piece.height}@${pos[0]},${pos[1]}`;
}

// Compute color mapping given current node, previous state, and previous mapping
function computeColorMapping(
  currentNode: KlotskiNode,
  pieces: KlotskiPiece[],
  prevNodeId: string | null,
  prevPositions: number[][] | null,
  prevMapping: Map<string, number>
): Map<string, number> {
  if (!prevNodeId || !prevPositions) {
    // First state - assign colors based on piece index (default)
    const newMapping = new Map<string, number>();
    currentNode.positions.forEach((_, idx) => {
      const key = getPieceKey(idx, currentNode.positions, pieces);
      newMapping.set(key, idx);
    });
    return newMapping;
  }
  
  if (prevNodeId === currentNode.id) {
    // Same state - return existing mapping
    return prevMapping;
  }
  
  // State changed - try to match pieces from previous state
  const newMapping = new Map<string, number>();
  const usedColors = new Set<number>();
  
  // First, find pieces that stayed in place and preserve their colors
  currentNode.positions.forEach((pos, newIdx) => {
    const piece = pieces[newIdx];
    if (!piece) return;
    
    // Try to find a matching piece from previous state at same position
    let matchedColor: number | null = null;
    
    prevPositions.forEach((prevPos, prevIdx) => {
      const prevPiece = pieces[prevIdx];
      if (!prevPiece) return;
      
      // Match by position and shape
      if (
        prevPos[0] === pos[0] && 
        prevPos[1] === pos[1] &&
        prevPiece.width === piece.width &&
        prevPiece.height === piece.height
      ) {
        // Found matching piece - use its previous color
        const prevKey = getPieceKey(prevIdx, prevPositions, pieces);
        const prevColor = prevMapping.get(prevKey);
        if (prevColor !== undefined && !usedColors.has(prevColor)) {
          matchedColor = prevColor;
        }
      }
    });
    
    const key = getPieceKey(newIdx, currentNode.positions, pieces);
    if (matchedColor !== null) {
      newMapping.set(key, matchedColor);
      usedColors.add(matchedColor);
    }
  });
  
  // Assign remaining colors to pieces that didn't match (the moved piece)
  currentNode.positions.forEach((_, idx) => {
    const key = getPieceKey(idx, currentNode.positions, pieces);
    if (!newMapping.has(key)) {
      const piece = pieces[idx];
      
      // Find the piece that moved - look for same shape piece that was somewhere else
      let inferredColor: number | null = null;
      
      prevPositions.forEach((prevPos, prevIdx) => {
        const prevPiece = pieces[prevIdx];
        if (!prevPiece) return;
        
        // Check if this is a piece with same shape that is no longer accounted for
        if (
          prevPiece.width === piece.width &&
          prevPiece.height === piece.height
        ) {
          const prevKey = getPieceKey(prevIdx, prevPositions, pieces);
          const prevColor = prevMapping.get(prevKey);
          
          // Check if this previous piece's position is now empty or occupied by different piece
          const prevPosNowOccupiedBy = currentNode.positions.findIndex((p, i) => 
            p[0] === prevPos[0] && p[1] === prevPos[1] && pieces[i].width === prevPiece.width && pieces[i].height === prevPiece.height
          );
          
          if (prevPosNowOccupiedBy === -1 && prevColor !== undefined && !usedColors.has(prevColor)) {
            inferredColor = prevColor;
          }
        }
      });
      
      if (inferredColor !== null) {
        newMapping.set(key, inferredColor);
        usedColors.add(inferredColor);
      } else {
        // Fallback: find first unused color
        let color = idx;
        if (usedColors.has(color)) {
          for (let c = 0; c < pieces.length; c++) {
            if (!usedColors.has(c)) {
              color = c;
              break;
            }
          }
        }
        newMapping.set(key, color);
        usedColors.add(color);
      }
    }
  });
  
  return newMapping;
}

interface ColorState {
  nodeId: string;
  positions: number[][];
  mapping: Map<string, number>;
}

export function KlotskiPuzzle({
  metadata,
  pieces,
  currentNode,
  edges,
  nextMove,
  onMove,
  onColorMappingChange,
}: KlotskiPuzzleProps) {
  const { board_width, board_height } = metadata;
  
  // Color state - tracks previous node info and color mapping
  const [colorState, setColorState] = useState<ColorState | null>(null);
  
  // Drag state
  const [dragState, setDragState] = useState<{
    pieceIdx: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  
  // Compute current color mapping (memoized, updates color state as side effect)
  const colorMapping = useMemo(() => {
    if (!currentNode) return new Map<string, number>();
    
    // Check if we need to update
    if (colorState?.nodeId === currentNode.id) {
      return colorState.mapping;
    }
    
    // Compute new mapping
    const newMapping = computeColorMapping(
      currentNode,
      pieces,
      colorState?.nodeId ?? null,
      colorState?.positions ?? null,
      colorState?.mapping ?? new Map()
    );
    
    // Schedule state update (will happen after render)
    // Using setTimeout to avoid setState during render
    setTimeout(() => {
      setColorState({
        nodeId: currentNode.id,
        positions: currentNode.positions,
        mapping: newMapping,
      });
    }, 0);
    
    return newMapping;
  }, [currentNode, pieces, colorState]);
  
  // Compute piece_id -> color_index mapping and report to parent
  useEffect(() => {
    if (!currentNode || !onColorMappingChange) return;
    
    // Build mapping from piece_id (0-9) to color_index
    const pieceToColorMap = new Map<number, number>();
    currentNode.positions.forEach((_, pieceIdx) => {
      const key = getPieceKey(pieceIdx, currentNode.positions, pieces);
      const colorIdx = colorMapping.get(key);
      if (colorIdx !== undefined) {
        pieceToColorMap.set(pieceIdx, colorIdx);
      } else {
        pieceToColorMap.set(pieceIdx, pieceIdx); // fallback
      }
    });
    
    onColorMappingChange(pieceToColorMap);
  }, [colorMapping, currentNode, pieces, onColorMappingChange]);
  
  // Get color for a piece based on current mapping
  const getPieceColor = useCallback((pieceIdx: number): string => {
    if (!currentNode) return PIECE_COLORS[pieceIdx] || '#7f8c8d';
    
    const key = getPieceKey(pieceIdx, currentNode.positions, pieces);
    const colorIdx = colorMapping.get(key);
    
    if (colorIdx !== undefined) {
      return PIECE_COLORS[colorIdx] || '#7f8c8d';
    }
    
    return PIECE_COLORS[pieceIdx] || '#7f8c8d';
  }, [currentNode, pieces, colorMapping]);
  
  // Find available moves from current state
  const availableMoves = useMemo(() => {
    if (!currentNode) return [];
    
    return edges.filter(
      (edge) => edge.source === currentNode.id
    ).map((edge) => ({
      targetId: edge.source === currentNode.id ? edge.target : edge.source,
      pieceId: edge.piece_id,
      direction: edge.source === currentNode.id ? edge.direction : reverseDirection(edge.direction),
    }));
  }, [currentNode, edges]);
  
  // Get moves for a specific piece
  const getMovesForPiece = useCallback((pieceIdx: number) => {
    return availableMoves.filter((m) => m.pieceId === pieceIdx);
  }, [availableMoves]);
  
  // Determine direction from drag
  const getDragDirection = useCallback((dx: number, dy: number): string | null => {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    
    if (absDx < MIN_DRAG_DISTANCE && absDy < MIN_DRAG_DISTANCE) {
      return null; // Not enough drag distance
    }
    
    if (absDx > absDy) {
      return dx > 0 ? 'right' : 'left';
    } else {
      return dy > 0 ? 'down' : 'up';
    }
  }, []);
  
  // Handle drag start
  const handleDragStart = useCallback((pieceIdx: number, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setDragState({
      pieceIdx,
      startX: clientX,
      startY: clientY,
      currentX: clientX,
      currentY: clientY,
    });
  }, []);
  
  // Handle drag move
  const handleDragMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!dragState) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setDragState(prev => prev ? {
      ...prev,
      currentX: clientX,
      currentY: clientY,
    } : null);
  }, [dragState]);
  
  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (!dragState || !onMove) {
      setDragState(null);
      return;
    }
    
    const dx = dragState.currentX - dragState.startX;
    const dy = dragState.currentY - dragState.startY;
    const direction = getDragDirection(dx, dy);
    
    const moves = getMovesForPiece(dragState.pieceIdx);
    
    if (direction) {
      // Find move matching the drag direction
      const matchingMove = moves.find(m => m.direction === direction);
      if (matchingMove) {
        onMove(matchingMove.targetId);
      }
    } else if (moves.length === 1) {
      // No clear direction but only one possible move - do it
      onMove(moves[0].targetId);
    }
    
    setDragState(null);
  }, [dragState, onMove, getDragDirection, getMovesForPiece]);
  
  // Calculate drag offset for visual feedback
  const getDragOffset = useCallback((pieceIdx: number) => {
    if (!dragState || dragState.pieceIdx !== pieceIdx) {
      return { x: 0, y: 0 };
    }
    
    const dx = dragState.currentX - dragState.startX;
    const dy = dragState.currentY - dragState.startY;
    
    // Limit the visual offset
    const maxOffset = CELL_SIZE * 0.5;
    return {
      x: Math.max(-maxOffset, Math.min(maxOffset, dx)),
      y: Math.max(-maxOffset, Math.min(maxOffset, dy)),
    };
  }, [dragState]);
  
  // Get available directions for a piece (for visual indicator)
  const getAvailableDirections = useCallback((pieceIdx: number) => {
    const moves = getMovesForPiece(pieceIdx);
    return moves.map(m => m.direction);
  }, [getMovesForPiece]);
  
  // Render pieces
  const renderedPieces = useMemo(() => {
    if (!currentNode) return null;
    
    return currentNode.positions.map((pos, pieceIdx) => {
      const piece = pieces[pieceIdx];
      if (!piece) return null;
      
      const [x, y] = pos;
      const moves = getMovesForPiece(pieceIdx);
      const canMove = moves.length > 0;
      const dragOffset = getDragOffset(pieceIdx);
      const isDragging = dragState?.pieceIdx === pieceIdx;
      const directions = getAvailableDirections(pieceIdx);
      const isNextMove = nextMove?.piece_id === pieceIdx;
      const nextMoveDirection = isNextMove ? nextMove?.direction : null;
      
      return (
        <div
          key={pieceIdx}
          onMouseDown={(e) => canMove && handleDragStart(pieceIdx, e)}
          onTouchStart={(e) => canMove && handleDragStart(pieceIdx, e)}
          style={{
            position: 'absolute',
            left: x * (CELL_SIZE + GAP) + dragOffset.x,
            top: y * (CELL_SIZE + GAP) + dragOffset.y,
            width: piece.width * CELL_SIZE + (piece.width - 1) * GAP,
            height: piece.height * CELL_SIZE + (piece.height - 1) * GAP,
            backgroundColor: getPieceColor(pieceIdx),
            borderRadius: '6px',
            cursor: canMove ? 'grab' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: pieceIdx === 0 ? '24px' : '16px',
            boxShadow: isDragging 
              ? '0 0 20px rgba(255, 255, 255, 0.8)' 
              : isNextMove
                ? '0 0 15px rgba(76, 175, 80, 0.9), inset 0 0 10px rgba(76, 175, 80, 0.4)'
                : canMove 
                ? '0 0 10px rgba(255, 255, 255, 0.5)' 
                : '2px 2px 4px rgba(0,0,0,0.3)',
            border: isNextMove
              ? '3px solid #4CAF50'
              : canMove 
                ? '2px solid rgba(255,255,255,0.6)' 
                : 'none',
            transition: isDragging ? 'none' : 'transform 0.15s ease',
            userSelect: 'none',
            zIndex: isDragging ? 100 : 1,
            transform: isDragging ? 'scale(1.05)' : 'scale(1)',
          }}
          title={canMove ? `Drag to move (${directions.join(', ')})` : ''}
        >
          {pieceIdx === 0 ? '曹' : ''}
          
          {/* Direction indicators */}
          {canMove && !isDragging && (
            <>
              {directions.includes('up') && (
                <div style={{
                  position: 'absolute',
                  top: nextMoveDirection === 'up' ? -12 : -8,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 0,
                  height: 0,
                  borderLeft: nextMoveDirection === 'up' ? '8px solid transparent' : '6px solid transparent',
                  borderRight: nextMoveDirection === 'up' ? '8px solid transparent' : '6px solid transparent',
                  borderBottom: nextMoveDirection === 'up' 
                    ? '12px solid #4CAF50' 
                    : '8px solid rgba(255,255,255,0.8)'
                }} />
              )}
              {directions.includes('down') && (
                <div style={{
                  position: 'absolute',
                  bottom: nextMoveDirection === 'down' ? -12 : -8,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 0,
                  height: 0,
                  borderLeft: nextMoveDirection === 'down' ? '8px solid transparent' : '6px solid transparent',
                  borderRight: nextMoveDirection === 'down' ? '8px solid transparent' : '6px solid transparent',
                  borderTop: nextMoveDirection === 'down' 
                    ? '12px solid #4CAF50' 
                    : '8px solid rgba(255,255,255,0.8)'
                }} />
              )}
              {directions.includes('left') && (
                <div style={{
                  position: 'absolute',
                  left: nextMoveDirection === 'left' ? -12 : -8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 0,
                  height: 0,
                  borderTop: nextMoveDirection === 'left' ? '8px solid transparent' : '6px solid transparent',
                  borderBottom: nextMoveDirection === 'left' ? '8px solid transparent' : '6px solid transparent',
                  borderRight: nextMoveDirection === 'left' 
                    ? '12px solid #4CAF50' 
                    : '8px solid rgba(255,255,255,0.8)'
                }} />
              )}
              {directions.includes('right') && (
                <div style={{
                  position: 'absolute',
                  right: nextMoveDirection === 'right' ? -12 : -8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 0,
                  height: 0,
                  borderTop: nextMoveDirection === 'right' ? '8px solid transparent' : '6px solid transparent',
                  borderBottom: nextMoveDirection === 'right' ? '8px solid transparent' : '6px solid transparent',
                  borderLeft: nextMoveDirection === 'right' 
                    ? '12px solid #4CAF50' 
                    : '8px solid rgba(255,255,255,0.8)'
                }} />
              )}
            </>
          )}
        </div>
      );
    });
  }, [currentNode, pieces, getMovesForPiece, getDragOffset, dragState, getAvailableDirections, handleDragStart, getPieceColor, nextMove]);
  
  if (!currentNode) {
    return (
      <div style={{
        padding: '20px',
        color: 'white',
        textAlign: 'center',
        opacity: 0.6,
      }}>
        Click a node to view its Klotski state
      </div>
    );
  }
  
  return (
    <div 
      style={{
        padding: '15px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
      onMouseMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
      onTouchMove={handleDragMove}
      onTouchEnd={handleDragEnd}
    >
      <div style={{
        color: 'white',
        marginBottom: '10px',
        fontSize: '12px',
        opacity: 0.8,
      }}>
        State: {currentNode.id.substring(0, 16)}...
      </div>
      
      {/* Board */}
      <div
        style={{
          position: 'relative',
          width: board_width * (CELL_SIZE + GAP) - GAP,
          height: board_height * (CELL_SIZE + GAP) - GAP,
          backgroundColor: '#2c3e50',
          borderRadius: '8px',
          padding: GAP,
        }}
      >
        {/* Grid background */}
        {Array(board_height).fill(null).map((_, y) => (
          Array(board_width).fill(null).map((_, x) => (
            <div
              key={`${x}-${y}`}
              style={{
                position: 'absolute',
                left: x * (CELL_SIZE + GAP),
                top: y * (CELL_SIZE + GAP),
                width: CELL_SIZE,
                height: CELL_SIZE,
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '4px',
              }}
            />
          ))
        ))}
        
        {/* Pieces */}
        {renderedPieces}
        
        {/* Goal indicator (bottom center) */}
        <div
          style={{
            position: 'absolute',
            left: (board_width / 2 - 1) * (CELL_SIZE + GAP),
            top: (board_height - 1) * (CELL_SIZE + GAP) + CELL_SIZE + 5,
            width: 2 * CELL_SIZE + GAP,
            height: 4,
            backgroundColor: '#e74c3c',
            borderRadius: '2px',
          }}
        />
      </div>
      
      <div style={{
        color: 'white',
        marginTop: '15px',
        fontSize: '11px',
        opacity: 0.6,
      }}>
        {availableMoves.length} possible moves • Drag pieces to move
      </div>
    </div>
  );
}

export default KlotskiPuzzle;
