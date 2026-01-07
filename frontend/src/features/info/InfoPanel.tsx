import { useState } from "react";

interface InfoPanelProps {
  metadata: {
    total_nodes: number;
    total_edges: number;
    board_width: number;
    board_height: number;
  } | null;
  moveToStartState: () => void;
}

export function InfoPanel({
  metadata,
  moveToStartState,
}: InfoPanelProps) {
  // Collapsible info panel state
  const [infoExpanded, setInfoExpanded] = useState(false);
  
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
