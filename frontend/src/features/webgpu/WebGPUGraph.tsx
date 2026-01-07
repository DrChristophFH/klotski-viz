/**
 * React component wrapper for WebGPU Graph Renderer
 */

import {
  useEffect,
  useRef,
  useCallback,
  useState,
  useImperativeHandle,
  forwardRef,
} from "react";
import { WebGPUGraphRenderer } from "./WebGPUGraphRenderer";
import type { GraphData } from "./WebGPUGraphRenderer";

export interface WebGPUGraphProps {
  graphData: GraphData;
  width?: number;
  height?: number;
  backgroundColor?: string;
  onReady?: () => void;
  onError?: (error: string) => void;
  onNodeSelect?: (nodeId: string | null) => void;
  selectedNodeId?: string | null;
  pieceColorMapping?: Map<number, number>;
  startPaused?: boolean;
}

export interface WebGPUGraphRef {
  selectNodeById: (nodeId: string) => void;
  setPieceColorMapping: (mapping: Map<number, number>) => void;
  setSolutionPath: (path: string[]) => void;
}

export const WebGPUGraph = forwardRef<WebGPUGraphRef, WebGPUGraphProps>(
  (
    {
      graphData,
      width = window.innerWidth,
      height = window.innerHeight,
      onReady,
      onError,
      onNodeSelect,
      selectedNodeId,
      pieceColorMapping,
      startPaused = false,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<WebGPUGraphRenderer | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isPaused, setIsPaused] = useState(startPaused);
    const [paramsExpanded, setParamsExpanded] = useState(false);
    const [repulsionStrength, setRepulsionStrength] = useState(1500);
    const [attractionStrength, setAttractionStrength] = useState(4.5);
    const [centerGravity, setCenterGravity] = useState(0.0);
    const [maxSpeed, setMaxSpeed] = useState(150);
    const [damping, setDamping] = useState(0.97);

    const [layoutExpanded, setLayoutExpanded] = useState(false);

    // Expose methods to parent via ref
    /*useImperativeHandle(
      ref,
      () => ({
        selectNodeById: (nodeId: string) => {
          rendererRef.current?.selectNodeById(nodeId);
        },
        setPieceColorMapping: (mapping: Map<number, number>) => {
          rendererRef.current?.setPieceColorMapping(mapping);
        },
      }),
      []
    );*/

    // Set up node selection callback
    useEffect(() => {
      if (rendererRef.current && onNodeSelect) {
        rendererRef.current.setOnNodeSelect(onNodeSelect);
      }
    }, [onNodeSelect, isInitialized]);

    // Handle external selection changes
    useEffect(() => {
      if (rendererRef.current) {
        rendererRef.current.selectNodeById(selectedNodeId || "");
      }
    }, [selectedNodeId]);

    // Sync piece color mapping
    useEffect(() => {
      if (rendererRef.current && pieceColorMapping) {
        rendererRef.current.setPieceColorMapping(pieceColorMapping);
      }
    }, [pieceColorMapping, isInitialized]);

    // Initialize WebGPU
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      console.log("Initializing WebGPU renderer...");

      const renderer = new WebGPUGraphRenderer(canvas);
      rendererRef.current = renderer;

      let cancelled = false;

      renderer
        .initialize()
        .then((success) => {
          if (cancelled) {
            console.log("Init completed but cancelled");
            return;
          }

          if (success) {
            console.log("WebGPU initialized successfully");
            setIsInitialized(true);
            onReady?.();
          } else {
            onError?.("Failed to initialize WebGPU");
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.error("WebGPU init error:", err);
            onError?.(err.message);
          }
        });

      return () => {
        console.log("Cleaning up WebGPU renderer");
        cancelled = true;
        renderer.destroy();
        rendererRef.current = null;
        setIsInitialized(false);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Load graph data when available
    useEffect(() => {
      const renderer = rendererRef.current;
      console.log(
        `Load data effect: isInitialized=${isInitialized}, hasRenderer=${!!renderer}, hasData=${!!graphData}`
      );

      if (!isInitialized || !renderer || !graphData) return;

      // Double check the renderer is actually initialized
      if (!renderer.isReady()) {
        console.log("Renderer not ready yet");
        return;
      }

      console.log(
        `Loading graph data: ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`
      );

      renderer.loadGraphData({
        nodes: graphData.nodes,
        edges: graphData.edges,
      });

      renderer.start();

      // If startPaused is true, pause simulation immediately (but keep rendering)
      if (startPaused) {
        renderer.togglePause();
      }
    }, [isInitialized, graphData, startPaused]);

    // Handle resize
    useEffect(() => {
      if (!rendererRef.current) return;
      rendererRef.current.resize(width, height);
    }, [width, height]);

    // Control handlers
    const togglePause = useCallback(() => {
      if (rendererRef.current) {
        const paused = rendererRef.current.togglePause();
        setIsPaused(paused);
      }
    }, []);

    const handleRepulsionChange = useCallback((value: number) => {
      setRepulsionStrength(value);
      rendererRef.current?.setRepulsionStrength(value);
    }, []);

    const handleAttractionChange = useCallback((value: number) => {
      setAttractionStrength(value);
      rendererRef.current?.setAttractionStrength(value);
    }, []);

    const handleCenterGravityChange = useCallback((value: number) => {
      setCenterGravity(value);
      rendererRef.current?.setCenterGravity(value);
    }, []);

    const handleMaxSpeedChange = useCallback((value: number) => {
      setMaxSpeed(value);
      rendererRef.current?.setMaxSpeed(value);
    }, []);

    const handleDampingChange = useCallback((value: number) => {
      setDamping(value);
      rendererRef.current?.setDamping(value);
    }, []);

    return (
      <div style={{ position: "relative", width, height }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
          }}
        />

        {/* Controls Panel */}
        <div
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            padding: "10px 15px",
            borderRadius: "8px",
            color: "white",
            fontFamily: "monospace",
            minWidth: "220px",
          }}
        >
          <h3
            onClick={() => setLayoutExpanded(!layoutExpanded)}
            style={{
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            Force Layout Controls
            <span style={{ fontSize: '14px', marginLeft: '10px' }}>{layoutExpanded ? '▼' : '▶'}</span>
          </h3>
          
          {layoutExpanded && (<>
          {/* Pause/Resume Button */}
          <div style={{ marginBottom: "15px", marginTop: "15px" }}>
            <button
              onClick={togglePause}
              style={{
                width: "100%",
                padding: "8px",
                fontSize: "14px",
                cursor: "pointer",
                borderRadius: "4px",
                border: "none",
                backgroundColor: isPaused ? "#4CAF50" : "#ff6b6b",
                color: "white",
                fontWeight: "bold",
              }}
            >
              {isPaused ? "▶ Resume" : "⏸ Pause"}
            </button>
          </div>

          {/* Collapsible Parameters Section */}
          <div
            onClick={() => setParamsExpanded(!paramsExpanded)}
            style={{
              cursor: "pointer",
              padding: "8px 0",
              borderTop: "1px solid rgba(255, 255, 255, 0.2)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "14px" }}>Parameters</span>
            <span style={{ fontSize: "12px" }}>
              {paramsExpanded ? "▼" : "▶"}
            </span>
          </div>

          {paramsExpanded && (
            <>
              {/* Repulsion Strength */}
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontSize: "14px",
                  }}
                >
                  Repulsion: {repulsionStrength.toFixed(1)}
                </label>
                <input
                  type="range"
                  min="1"
                  max="5000"
                  step="10"
                  value={repulsionStrength}
                  onChange={(e) =>
                    handleRepulsionChange(parseFloat(e.target.value))
                  }
                  style={{ width: "100%", cursor: "pointer" }}
                />
              </div>

              {/* Attraction Strength */}
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontSize: "14px",
                  }}
                >
                  Attraction: {attractionStrength.toFixed(3)}
                </label>
                <input
                  type="range"
                  min="0.001"
                  max="5"
                  step="0.05"
                  value={attractionStrength}
                  onChange={(e) =>
                    handleAttractionChange(parseFloat(e.target.value))
                  }
                  style={{ width: "100%", cursor: "pointer" }}
                />
              </div>

              {/* Center Gravity */}
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontSize: "14px",
                  }}
                >
                  Center Gravity: {centerGravity.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.1"
                  value={centerGravity}
                  onChange={(e) =>
                    handleCenterGravityChange(parseFloat(e.target.value))
                  }
                  style={{ width: "100%", cursor: "pointer" }}
                />
              </div>

              {/* Max Speed */}
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontSize: "14px",
                  }}
                >
                  Max Speed: {maxSpeed.toFixed(1)}
                </label>
                <input
                  type="range"
                  min="1"
                  max="200"
                  step="5"
                  value={maxSpeed}
                  onChange={(e) =>
                    handleMaxSpeedChange(parseFloat(e.target.value))
                  }
                  style={{ width: "100%", cursor: "pointer" }}
                />
              </div>

              {/* Damping */}
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontSize: "14px",
                  }}
                >
                  Damping: {damping.toFixed(4)}
                </label>
                <input
                  type="range"
                  min="0.9"
                  max="0.9999"
                  step="0.0001"
                  value={damping}
                  onChange={(e) =>
                    handleDampingChange(parseFloat(e.target.value))
                  }
                  style={{ width: "100%", cursor: "pointer" }}
                />
              </div>
            </>
          )}

          </>)}
        </div>
      </div>
    );
  }
);

export default WebGPUGraph;
