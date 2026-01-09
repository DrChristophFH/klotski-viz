export interface InputState {
  keysPressed: Set<string>;
  isDragging: boolean;
  lastMouseX: number;
  lastMouseY: number;
}

export function createInputState(): InputState {
  return {
    keysPressed: new Set(),
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
  };
}

export interface InputHandlers {
  onMouseDown: (e: MouseEvent) => void;
  onMouseMove: (e: MouseEvent) => void;
  onMouseUp: (e: MouseEvent) => void;
  onWheel: (e: WheelEvent) => void;
  onClick: (e: MouseEvent) => void;
  onContextMenu: (e: Event) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onKeyUp: (e: KeyboardEvent) => void;
}

export function setupInputListeners(canvas: HTMLCanvasElement, handlers: InputHandlers): () => void {
  canvas.addEventListener('mousedown', handlers.onMouseDown);
  canvas.addEventListener('mousemove', handlers.onMouseMove);
  canvas.addEventListener('mouseup', handlers.onMouseUp);
  canvas.addEventListener('mouseleave', handlers.onMouseUp);
  canvas.addEventListener('wheel', handlers.onWheel);
  canvas.addEventListener('click', handlers.onClick);
  canvas.addEventListener('contextmenu', handlers.onContextMenu);

  window.addEventListener('keydown', handlers.onKeyDown);
  window.addEventListener('keyup', handlers.onKeyUp);

  // Return cleanup function
  return () => {
    canvas.removeEventListener('mousedown', handlers.onMouseDown);
    canvas.removeEventListener('mousemove', handlers.onMouseMove);
    canvas.removeEventListener('mouseup', handlers.onMouseUp);
    canvas.removeEventListener('mouseleave', handlers.onMouseUp);
    canvas.removeEventListener('wheel', handlers.onWheel);
    canvas.removeEventListener('click', handlers.onClick);
    canvas.removeEventListener('contextmenu', handlers.onContextMenu);

    window.removeEventListener('keydown', handlers.onKeyDown);
    window.removeEventListener('keyup', handlers.onKeyUp);
  };
}
