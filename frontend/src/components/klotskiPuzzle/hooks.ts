import { useState, useCallback, useMemo, useEffect } from 'react';
import type { KlotskiPiece, KlotskiNode, KlotskiEdge } from '../../types/klotski';
import { computeColorMapping } from './colorMapping';
import { getPieceKey } from './utils';

interface ColorState {
  nodeId: string;
  positions: number[][];
  mapping: Map<string, number>;
}

/**
 * Hook for managing color persistence across state changes
 */
export function useColorMapping(
  currentNode: KlotskiNode | null,
  pieces: KlotskiPiece[]
): Map<string, number> {
  const [colorState, setColorState] = useState<ColorState | null>(null);

  const colorMapping = useMemo(() => {
    if (!currentNode) return new Map<string, number>();

    if (colorState?.nodeId === currentNode.id) {
      return colorState.mapping;
    }

    const newMapping = computeColorMapping(
      currentNode,
      pieces,
      colorState?.nodeId ?? null,
      colorState?.positions ?? null,
      colorState?.mapping ?? new Map()
    );

    // Schedule state update to avoid setState during render
    setTimeout(() => {
      setColorState({
        nodeId: currentNode.id,
        positions: currentNode.positions,
        mapping: newMapping,
      });
    }, 0);

    return newMapping;
  }, [currentNode, pieces, colorState]);

  return colorMapping;
}

interface DragState {
  pieceIdx: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

/**
 * Hook for managing drag state
 */
export function useDragState() {
  const [dragState, setDragState] = useState<DragState | null>(null);

  const startDrag = useCallback(
    (pieceIdx: number, startX: number, startY: number) => {
      setDragState({
        pieceIdx,
        startX,
        startY,
        currentX: startX,
        currentY: startY,
      });
    },
    []
  );

  const updateDrag = useCallback((currentX: number, currentY: number) => {
    setDragState((prev) =>
      prev
        ? {
            ...prev,
            currentX,
            currentY,
          }
        : null
    );
  }, []);

  const endDrag = useCallback(() => {
    setDragState(null);
  }, []);

  return { dragState, startDrag, updateDrag, endDrag };
}

interface PieceMove {
  targetId: string;
  pieceId: number;
  direction: string;
}

/**
 * Hook for computing available moves from edges
 */
export function useAvailableMoves(
  currentNode: KlotskiNode | null,
  edges: KlotskiEdge[]
): PieceMove[] {
  return useMemo(() => {
    if (!currentNode) return [];

    return edges
      .filter((edge) => edge.source === currentNode.id)
      .map((edge) => ({
        targetId: edge.target,
        pieceId: edge.piece_id,
        direction: edge.direction,
      }));
  }, [currentNode, edges]);
}

/**
 * Get moves available for a specific piece
 */
export function useMovesForPiece(availableMoves: PieceMove[], pieceIdx: number): PieceMove[] {
  return useMemo(() => {
    return availableMoves.filter((m) => m.pieceId === pieceIdx);
  }, [availableMoves, pieceIdx]);
}

/**
 * Hook to report color mapping to parent component
 */
export function useColorMappingEffect(
  colorMapping: Map<string, number>,
  currentNode: KlotskiNode | null,
  pieces: KlotskiPiece[],
  onColorMappingChange?: (mapping: Map<number, number>) => void
): void {
  useEffect(() => {
    if (!currentNode || !onColorMappingChange) return;

    const pieceToColorMap = new Map<number, number>();
    currentNode.positions.forEach((_, pieceIdx) => {
      const key = getPieceKey(pieceIdx, currentNode.positions, pieces);
      const colorIdx = colorMapping.get(key);
      pieceToColorMap.set(pieceIdx, colorIdx ?? pieceIdx);
    });

    onColorMappingChange(pieceToColorMap);
  }, [colorMapping, currentNode, pieces, onColorMappingChange]);
}
