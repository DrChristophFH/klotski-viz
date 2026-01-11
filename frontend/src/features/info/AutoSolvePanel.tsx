interface AutoSolvePanelProps {
  selectedNodeId?: string | null;
  autoSolveActive?: boolean;
  autoSolvePath?: string[];
  autoSolveIndex?: number;
  autoSolveSpeed?: number;
  onAutoSolveStart?: () => void;
  onAutoSolveStop?: () => void;
  onAutoSolveSpeedChange?: (speed: number) => void;
}

export function AutoSolvePanel({
  selectedNodeId,
  autoSolveActive = false,
  autoSolvePath = [],
  autoSolveIndex = 0,
  autoSolveSpeed = 1000,
  onAutoSolveStart,
  onAutoSolveStop,
  onAutoSolveSpeedChange,
}: AutoSolvePanelProps) {
  // Convert speed (ms) to multiplier (1x, 1.5x, 2x, etc.)
  const speedMultiplier = (2000 / autoSolveSpeed).toFixed(1);
  const progress = autoSolvePath.length > 0 ? (autoSolveIndex / autoSolvePath.length) * 100 : 0;

  const handleSpeedChange = (multiplier: string) => {
    const multiplierNum = parseFloat(multiplier);
    const intervalMs = Math.round(2000 / multiplierNum);
    onAutoSolveSpeedChange?.(intervalMs);
  };

  return (
    <div style={{ marginBottom: "15px" }}>
      <label style={{ display: "block", marginBottom: "8px", fontSize: "12px" }}>
        <b>Auto Solve:</b>
      </label>

      {selectedNodeId ? (
        <>
          {/* Play/Pause Button */}
          <button
            onClick={() => {
              if (autoSolveActive) {
                onAutoSolveStop?.();
              } else {
                onAutoSolveStart?.();
              }
            }}
            style={{
              width: "100%",
              padding: "8px",
              fontSize: "12px",
              marginBottom: "8px",
              cursor: "pointer",
              borderRadius: "4px",
              border: "none",
              backgroundColor: autoSolveActive ? "#FF6B6B" : "#51CF66",
              color: "white",
              fontWeight: "bold",
              transition: "background-color 0.2s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = autoSolveActive
                ? "#FF5252"
                : "#40C057";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = autoSolveActive
                ? "#FF6B6B"
                : "#51CF66";
            }}
          >
            {autoSolveActive ? "⏸ Stop Animation" : "▶ Play Animation"}
          </button>

          {/* Speed Control */}
          <div style={{ marginBottom: "8px" }}>
            <div
              style={{
                fontSize: "11px",
                marginBottom: "6px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ opacity: 0.8 }}>Speed:</span>
              <span style={{ fontWeight: "bold", color: "#51CF66" }}>
                {speedMultiplier}x
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              value={speedMultiplier}
              onChange={(e) => handleSpeedChange(e.target.value)}
              step="0.5"
              style={{
                width: "100%",
                cursor: "pointer",
              }}
            />
            <div
              style={{
                fontSize: "10px",
                opacity: 0.6,
                marginTop: "4px",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>1x</span>
              <span>5x</span>
            </div>
          </div>

          {/* Progress Display */}
          {autoSolvePath.length > 0 && (
            <div
              style={{
                fontSize: "10px",
                padding: "8px",
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                borderRadius: "4px",
              }}
            >
              <div
                style={{
                  marginBottom: "6px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ opacity: 0.8 }}>Progress:</span>
                <span style={{ fontWeight: "bold" }}>
                  {autoSolveIndex + 1} / {autoSolvePath.length}
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: "4px",
                  backgroundColor: "rgba(255, 255, 255, 0.2)",
                  borderRadius: "2px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    backgroundColor: "#51CF66",
                    width: `${progress}%`,
                    transition: "width 0.2s ease",
                  }}
                />
              </div>
              <div
                style={{
                  marginTop: "4px",
                  opacity: 0.6,
                  fontSize: "9px",
                }}
              >
                {Math.round(progress)}% complete
              </div>
            </div>
          )}
        </>
      ) : (
        <button
          disabled
          style={{
            width: "100%",
            padding: "8px",
            fontSize: "12px",
            cursor: "not-allowed",
            borderRadius: "4px",
            border: "none",
            backgroundColor: "rgba(255, 255, 255, 0.1)",
            color: "rgba(255, 255, 255, 0.5)",
            fontWeight: "bold",
          }}
        >
          Select a state first
        </button>
      )}
    </div>
  );
}
