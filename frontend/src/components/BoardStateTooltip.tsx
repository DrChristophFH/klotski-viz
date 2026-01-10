/**
 * Hover tooltip displaying a mini board state preview
 */

import type { KlotskiNode, KlotskiPiece, KlotskiMetadata } from '../types/klotski';
import { BoardStateVisual } from './BoardStateVisual';

interface BoardStateTooltipProps {
  node: KlotskiNode | null;
  pieces: KlotskiPiece[];
  metadata: KlotskiMetadata;
  mouseX: number;
  mouseY: number;
  distanceToGoal?: number | null;
}

const MINI_CELL_SIZE = 15; // Small cells for tooltip
const GAP = 1;

export function BoardStateTooltip({
  node,
  pieces,
  metadata,
  mouseX,
  mouseY,
  distanceToGoal,
}: BoardStateTooltipProps) {
  if (!node) return null;

  const { board_width, board_height } = metadata;

  // Position tooltip to right and below cursor, but keep on screen
  const tooltipWidth = board_width * (MINI_CELL_SIZE + GAP) + 30;
  const tooltipHeight = board_height * (MINI_CELL_SIZE + GAP) + 60;
  
  let tooltipX = mouseX + 15;
  let tooltipY = mouseY + 15;
  
  // Keep on screen
  if (tooltipX + tooltipWidth > window.innerWidth) {
    tooltipX = mouseX - tooltipWidth - 15;
  }
  if (tooltipY + tooltipHeight > window.innerHeight) {
    tooltipY = mouseY - tooltipHeight - 15;
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: tooltipX,
        top: tooltipY,
        background: 'rgba(0, 0, 0, 0.9)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        padding: '10px',
        borderRadius: '8px',
        color: 'white',
        fontFamily: 'monospace',
        fontSize: '11px',
        pointerEvents: 'none',
        zIndex: 3000,
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.8)',
      }}
    >
      {/* Mini board using shared visual component */}
      <BoardStateVisual
        node={node}
        pieces={pieces}
        metadata={metadata}
        cellSize={MINI_CELL_SIZE}
        gap={GAP}
        showGoal={false}
      />
      
      {/* Distance to goal display */}
      {distanceToGoal !== null && distanceToGoal !== undefined && (
        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.2)' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold' }}>
            Distance to End States: {
              distanceToGoal === Infinity ? '∞ (unreachable)' : distanceToGoal
            }
          </div>
        </div>
      )}
    </div>
  );
}
