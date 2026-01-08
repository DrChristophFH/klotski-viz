import type { KlotskiPiece } from '../../types/klotski';
import { REVERSE_DIRECTION, MIN_DRAG_DISTANCE } from './constants';

/**
 * Create a unique key for a piece based on position and shape
 */
export function getPieceKey(
  pieceIdx: number,
  positions: number[][],
  pieces: KlotskiPiece[]
): string {
  const pos = positions[pieceIdx];
  const piece = pieces[pieceIdx];
  if (!pos || !piece) return '';
  return `${piece.width}x${piece.height}@${pos[0]},${pos[1]}`;
}

/**
 * Reverse a direction
 */
export function reverseDirection(dir: string): string {
  return REVERSE_DIRECTION[dir] || dir;
}

/**
 * Determine drag direction from pixel delta
 * Returns null if drag distance is insufficient
 */
export function getDragDirection(dx: number, dy: number): string | null {
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
}

/**
 * Limit a value to a range
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Get coordinates from mouse or touch event
 */
export function getEventCoordinates(e: React.MouseEvent | React.TouchEvent): {
  x: number;
  y: number;
} {
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
  return { x: clientX, y: clientY };
}

/**
 * Calculate physical pixel position from grid position
 */
export function gridToPixel(gridPos: number, cellSize: number, gap: number): number {
  return gridPos * (cellSize + gap);
}

/**
 * Calculate pixel dimensions for a piece
 */
export function getPiecePixelDimensions(
  width: number,
  height: number,
  cellSize: number,
  gap: number
): { width: number; height: number } {
  return {
    width: width * cellSize + (width - 1) * gap,
    height: height * cellSize + (height - 1) * gap,
  };
}
