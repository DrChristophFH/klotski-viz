import { useState } from "react";
import { ColoringMode } from "../renderer/graph/colorModes";

interface InfoPanelProps {
  metadata: {
    total_nodes: number;
    total_edges: number;
    board_width: number;
    board_height: number;
  } | null;
  moveToStartState: () => void;
  onColoringModeChange?: (mode: ColoringMode) => void;
  endStateHighlightingEnabled?: boolean;
  onEndStateHighlightingChange?: (enabled: boolean) => void;
  solutionHighlightingEnabled?: boolean;
  onSolutionHighlightingChange?: (enabled: boolean) => void;
}

export function InfoPanel({
  metadata,
  moveToStartState,
  onColoringModeChange,
  endStateHighlightingEnabled = false,
  onEndStateHighlightingChange,
  solutionHighlightingEnabled = true,
  onSolutionHighlightingChange,
}: InfoPanelProps) {
  // Collapsible info panel state
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [coloringMode, setColoringMode] = useState<ColoringMode>("spectral");
  
  return (
    <div
      style={{
        position: "absolute",
        top: "20px",
        left: "20px",
        zIndex: 1000,
        background: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255, 255, 255, 0.2)",
        padding: "10px 15px",
        borderRadius: "8px",
        color: "white",
        fontFamily: "monospace",
      }}
    >
      <h2
        onClick={() => setInfoExpanded(!infoExpanded)}
        style={{
          margin: "0",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        Klotski State Space
        <span style={{ fontSize: "14px", marginLeft: "10px" }}>
          {infoExpanded ? "▼" : "▶"}
        </span>
      </h2>
      {infoExpanded && (
        <>
          {metadata && (
            <div style={{ fontSize: "14px" }}>
              <div>Nodes: {metadata.total_nodes.toLocaleString()}</div>
              <div>Edges: {metadata.total_edges.toLocaleString()}</div>
              <div>
                Board: {metadata.board_width}x{metadata.board_height}
              </div>
            </div>
          )}
          <div
            style={{
              marginTop: "15px",
              fontSize: "11px",
              opacity: 0.7,
              lineHeight: 1.6,
            }}
          >
            <div>
              <b>Controls:</b>
            </div>
            <div>WASD - Move camera</div>
            <div>Shift - Move faster</div>
            <div>Right-click + drag - Look around</div>
            <div>Scroll - Zoom</div>
            <div>Click node - Select state</div>
            <div>Middle mouse + drag - Orbit selected state</div>
          </div>
          <div style={{ marginBottom: "15px" }}>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "12px" }}>
              <b>Node Coloring:</b>
            </label>
            <select
              value={coloringMode}
              onChange={(e) => {
                setColoringMode(e.target.value as ColoringMode);
                onColoringModeChange?.(e.target.value as ColoringMode);
              }}
              style={{
                width: "100%",
                padding: "6px",
                fontSize: "12px",
                borderRadius: "4px",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                color: "white",
                cursor: "pointer",
              }}
            >
              <option value={ColoringMode.Spectral}>Spectral (by index)</option>
              <option value={ColoringMode.DistanceToGoal}>Distance to Goal</option>
            </select>
            <div
              style={{
                fontSize: "10px",
                marginTop: "6px",
                opacity: 0.7,
                padding: "6px",
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                borderRadius: "4px",
                lineHeight: 1.5,
              }}
            >
              {coloringMode === ColoringMode.DistanceToGoal ? (
                <>
                  <b>Distance to Goal (Hop Count):</b>
                  <div>Green = Close to goal</div>
                  <div>Light Blue → Deep Blue = Farther</div>
                  <div>Dark Gray = Unreachable</div>
                </>
              ) : (
                <>
                  <b>Spectral coloring:</b>
                  <div>Rainbow gradient by node index</div>
                </>
              )}
            </div>
            <label style={{ display: "flex", alignItems: "center", marginTop: "10px", fontSize: "12px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={endStateHighlightingEnabled}
                onChange={(e) => {
                  onEndStateHighlightingChange?.(e.target.checked);
                }}
                style={{
                  marginRight: "8px",
                  cursor: "pointer",
                }}
              />
              <span>Highlight End States (Red)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", marginTop: "8px", fontSize: "12px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={solutionHighlightingEnabled}
                onChange={(e) => {
                  onSolutionHighlightingChange?.(e.target.checked);
                }}
                style={{
                  marginRight: "8px",
                  cursor: "pointer",
                }}
              />
              <span>Show Solution Path (Orange)</span>
            </label>
          </div>
          <div style={{ marginBottom: "15px" }}>
            <button
              onClick={moveToStartState}
              style={{
                width: "100%",
                padding: "8px",
                fontSize: "14px",
                cursor: "pointer",
                borderRadius: "4px",
                border: "none",
                backgroundColor: "#4CAF50",
                color: "white",
                fontWeight: "bold",
              }}
            >
              Go to Start State
            </button>
          </div>
        </>
      )}
    </div>
  );
}
