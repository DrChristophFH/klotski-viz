
// Default fallback color
export const DEFAULT_FALLBACK_COLOR = '#7f8c8d';

export const PIECE_COLORS: string[] = [
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

export const CELL_SIZE = 50;
export const GAP = 2;
export const MIN_DRAG_DISTANCE = 15;

// Direction reverse mapping
export const REVERSE_DIRECTION: Record<string, string> = {
  'up': 'down',
  'down': 'up',
  'left': 'right',
  'right': 'left',
};

// Styling
export const STYLES = {
  board: {
    backgroundColor: '#2c3e50',
    borderRadius: '8px',
  },
  gridCell: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '4px',
  },
  piece: {
    borderRadius: '6px',
    fontWeight: 'bold' as const,
  },
  goalIndicator: {
    backgroundColor: '#e74c3c',
    borderRadius: '2px',
  },
  shadowBase: '2px 2px 4px rgba(0,0,0,0.3)',
  shadowHover: '0 0 10px rgba(255, 255, 255, 0.5)',
  shadowDrag: '0 0 20px rgba(255, 255, 255, 0.8)',
  borderHover: '2px solid rgba(255,255,255,0.6)',
} as const;

// Arrow/Direction indicator sizing
export const ARROW_SIZE = {
  width: 12,
  height: 16,
  offset: 8,
} as const;
