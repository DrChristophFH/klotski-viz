// Klotski piece colors - vibrant, distinct Material Design colors
export const PIECE_COLORS: [number, number, number][] = [
  [0.95, 0.26, 0.21],  // 0: Vibrant Red (#F44336)
  [0.13, 0.59, 0.95],  // 1: Bright Blue (#2196F3)
  [0.30, 0.69, 0.31],  // 2: Forest Green (#4CAF50)
  [1.00, 0.76, 0.03],  // 3: Golden Yellow (#FFC107)
  [0.61, 0.15, 0.69],  // 4: Deep Purple (#9C27B0)
  [0.00, 0.74, 0.83],  // 5: Cyan (#00BCD4)
  [1.00, 0.34, 0.13],  // 6: Deep Orange (#FF5722)
  [0.91, 0.12, 0.39],  // 7: Pink (#E91E63)
  [0.55, 0.76, 0.29],  // 8: Lime Green (#8BC34A)
  [0.40, 0.23, 0.72],  // 9: Indigo (#673AB7)
];

export const DEFAULT_MOVE_SPEED = 2.0;
export const DEFAULT_SPRINT_MULTIPLIER = 3.0;
export const FPS_SAMPLE_SIZE = 60; // Average over 60 frames
export const READBACK_INTERVAL = 30; // Every 30 frames
export const CAMERA_TWEEN_DURATION = 1200; // 1.2s tween duration for smooth transitions
export const FPS_UPDATE_INTERVAL = 500; // Update FPS every 500ms
