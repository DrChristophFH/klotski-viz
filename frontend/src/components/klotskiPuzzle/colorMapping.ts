import type { KlotskiPiece, KlotskiNode } from '../../types/klotski';
import { getPieceKey } from './utils';

/**
 * Compute color mapping given current node and previous state
 * Tries to preserve colors for pieces that stay in place
 */
export function computeColorMapping(
  currentNode: KlotskiNode,
  pieces: KlotskiPiece[],
  prevNodeId: string | null,
  prevPositions: number[][] | null,
  prevMapping: Map<string, number>
): Map<string, number> {
  if (!prevNodeId || !prevPositions) {
    // First state -> assign colors based on piece index (default)
    const newMapping = new Map<string, number>();
    currentNode.positions.forEach((_, idx) => {
      const key = getPieceKey(idx, currentNode.positions, pieces);
      newMapping.set(key, idx);
    });
    return newMapping;
  }

  if (prevNodeId === currentNode.id) {
    // Same state -> return existing mapping
    return prevMapping;
  }

  // State changed -> try to match pieces from previous state
  return findMatchingPieceColors(
    currentNode,
    pieces,
    prevPositions,
    prevMapping
  );
}

/**
 * Match pieces between old and new state to preserve colors
 */
function findMatchingPieceColors(
  currentNode: KlotskiNode,
  pieces: KlotskiPiece[],
  prevPositions: number[][],
  prevMapping: Map<string, number>
): Map<string, number> {
  const newMapping = new Map<string, number>();
  const usedColors = new Set<number>();

  // find pieces that stayed in place
  currentNode.positions.forEach((pos, newIdx) => {
    const piece = pieces[newIdx];
    if (!piece) return;

    const matchedColor = findMatchingPieceAtSamePosition(
      pos,
      piece,
      prevPositions,
      pieces,
      prevMapping,
      usedColors
    );

    const key = getPieceKey(newIdx, currentNode.positions, pieces);
    if (matchedColor !== null) {
      newMapping.set(key, matchedColor);
      usedColors.add(matchedColor);
    }
  });

  // assign remaining colors to moved pieces
  currentNode.positions.forEach((_, idx) => {
    const key = getPieceKey(idx, currentNode.positions, pieces);
    if (!newMapping.has(key)) {
      const piece = pieces[idx];

      const inferredColor = inferMovedPieceColor(
        piece,
        currentNode.positions,
        prevPositions,
        pieces,
        prevMapping,
        usedColors
      );

      if (inferredColor !== null) {
        newMapping.set(key, inferredColor);
        usedColors.add(inferredColor);
      } else {
        // find first unused color
        const color = findUnusedColor(idx, usedColors, pieces.length);
        newMapping.set(key, color);
        usedColors.add(color);
      }
    }
  });

  return newMapping;
}

/**
 * Try to find a matching piece at the same position
 */
function findMatchingPieceAtSamePosition(
  pos: number[],
  piece: KlotskiPiece,
  prevPositions: number[][],
  pieces: KlotskiPiece[],
  prevMapping: Map<string, number>,
  usedColors: Set<number>
): number | null {
  for (let prevIdx = 0; prevIdx < prevPositions.length; prevIdx++) {
    const prevPos = prevPositions[prevIdx];
    const prevPiece = pieces[prevIdx];
    if (!prevPiece) continue;

    if (
      prevPos[0] === pos[0] &&
      prevPos[1] === pos[1] &&
      prevPiece.width === piece.width &&
      prevPiece.height === piece.height
    ) {
      const prevKey = getPieceKey(prevIdx, prevPositions, pieces);
      const prevColor = prevMapping.get(prevKey);
      if (prevColor !== undefined && !usedColors.has(prevColor)) {
        return prevColor;
      }
    }
  }
  return null;
}

/**
 * Infer the color of a piece that moved
 * by finding a piece with same shape that is no longer accounted for
 */
function inferMovedPieceColor(
  piece: KlotskiPiece,
  currentPositions: number[][],
  prevPositions: number[][],
  pieces: KlotskiPiece[],
  prevMapping: Map<string, number>,
  usedColors: Set<number>
): number | null {
  for (let prevIdx = 0; prevIdx < prevPositions.length; prevIdx++) {
    const prevPos = prevPositions[prevIdx];
    const prevPiece = pieces[prevIdx];
    if (!prevPiece) continue;

    if (prevPiece.width === piece.width && prevPiece.height === piece.height) {
      const prevKey = getPieceKey(prevIdx, prevPositions, pieces);
      const prevColor = prevMapping.get(prevKey);

      // Check if this previous position is now empty or occupied by different piece
      const isPositionVacant = !currentPositions.some((p, i) =>
        p[0] === prevPos[0] &&
        p[1] === prevPos[1] &&
        pieces[i].width === prevPiece.width &&
        pieces[i].height === prevPiece.height
      );

      if (isPositionVacant && prevColor !== undefined && !usedColors.has(prevColor)) {
        return prevColor;
      }
    }
  }
  return null;
}

/**
 * Find first unused color index
 */
function findUnusedColor(
  preferredIdx: number,
  usedColors: Set<number>,
  totalPieces: number
): number {
  if (!usedColors.has(preferredIdx)) {
    return preferredIdx;
  }
  for (let c = 0; c < totalPieces; c++) {
    if (!usedColors.has(c)) {
      return c;
    }
  }
  return 0;
}
