import { useState, useEffect, useCallback, useRef } from "react";
import WebGPUGraph from "./features/renderer/WebGPUGraph";
import type { WebGPUGraphRef } from "./features/renderer/WebGPUGraph";
import { ColoringMode } from "./features/renderer/graph/colorModes";
import KlotskiPuzzle from "./components/KlotskiPuzzle";
import type {
  KlotskiNode,
  KlotskiEdge,
  KlotskiPiece,
  KlotskiMetadata,
} from "./types/klotski";
import {
  isEndState,
  isStartState,
  loadPackedGraph,
} from "./features/renderer/loadPackedGraph";
import { WebGPUErrorMsg } from "./components/WebGPUErrorMsg";
import { StandardErrorMsg } from "./components/StandardErrorMsg";
import { LoadingMsg } from "./components/LoadingMsg";
import { InfoPanel } from "./features/info/InfoPanel";
import { GitHubLink } from "./components/GitHubLink";
import { BoardStateTooltip } from "./components/BoardStateTooltip";

interface WebGPUGraphData {
  nodes: { id: string; x?: number; y?: number; z?: number }[];
  edges: { source: string; target: string; piece_id?: number }[];
}

function App() {
  const [graphData, setGraphData] = useState<WebGPUGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<KlotskiMetadata | null>(null);
  const [webgpuError, setWebgpuError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Full Klotski data for puzzle visualization
  const [klotskiNodes, setKlotskiNodes] = useState<KlotskiNode[]>([]);
  const [klotskiEdges, setKlotskiEdges] = useState<KlotskiEdge[]>([]);
  const [klotskiPieces, setKlotskiPieces] = useState<KlotskiPiece[]>([]);
  const [endStates, setEndStates] = useState<Set<string>>(new Set());
  const [startStateId, setStartStateId] = useState<string | null>(null);

  // Selected node state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [graphRef, setGraphRef] = useState<WebGPUGraphRef | null>(null);

  // Hover state for tooltip
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [hoveredNodeDistance, setHoveredNodeDistance] = useState<number | null>(null);

  // End state highlighting toggle
  const [endStateHighlightingEnabled, setEndStateHighlightingEnabled] = useState(false);

  // Solution highlighting toggle
  const [solutionHighlightingEnabled, setSolutionHighlightingEnabled] = useState(true);

  // Piece color mapping for syncing puzzle colors with graph
  const [pieceColorMapping, setPieceColorMapping] = useState<
    Map<number, number>
  >(new Map());

  // Auto-solve state
  const [autoSolveActive, setAutoSolveActive] = useState(false);
  const [autoSolvePath, setAutoSolvePath] = useState<string[]>([]);
  const [autoSolveIndex, setAutoSolveIndex] = useState(0);
  const [autoSolveSpeed, setAutoSolveSpeed] = useState(1000); // milliseconds per step (1x = 2000ms, 2x = 1000ms, etc.)
  const autoSolveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get the current selected node's data
  const selectedNode = selectedNodeId
    ? klotskiNodes.find((n) => n.id === selectedNodeId) || null
    : null;

  // Get the hovered node's data for tooltip
  const hoveredNode = hoveredNodeId
    ? klotskiNodes.find((n) => n.id === hoveredNodeId) || null
    : null;

  // Initialize goal distances once after graph data is loaded and end states are available
  const handleGraphDataLoaded = useCallback(() => {
    if (graphRef && endStates.size > 0) {
      console.log("Initializing goal distances with end states:", Array.from(endStates));
      graphRef.initializeGoalDistances(Array.from(endStates));
    }
  }, [graphRef, endStates]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Load the Klotski state space data from packed binary format
  useEffect(() => {
    loadPackedGraph("/klotski_packed.bin")
      .then((data) => {
        console.log("Loaded packed Klotski data:", data.metadata);

        // Convert metadata format
        setMetadata({
          total_nodes: data.metadata.nodeCount,
          total_edges: data.metadata.edgeCount,
          board_width: data.metadata.boardWidth,
          board_height: data.metadata.boardHeight,
        });

        // Store full Klotski data for puzzle visualization
        // Convert positions from tuple array to nested array format
        setKlotskiNodes(
          data.nodes.map((node) => ({
            id: node.id,
            positions: node.positions,
          }))
        );
        setKlotskiEdges(
          data.edges.map((edge) => ({
            source: edge.source,
            target: edge.target,
            piece_id: edge.piece_id,
            direction: edge.direction,
          }))
        );
        setKlotskiPieces(data.pieces);

        // Identify start and end states
        for (const node of data.nodes) {
          if (isStartState(node)) {
            setStartStateId(node.id);
          }
          if (isEndState(node)) {
            setEndStates((prev) => new Set(prev).add(node.id));
          }
        }

        // Transform data for WebGPU graph - include precomputed positions
        const nodes = data.nodes.map((node) => ({
          id: node.id,
          x: node.x,
          y: node.y,
          z: node.z,
        }));

        const edges = data.edges.map((edge) => ({
          source: edge.source,
          target: edge.target,
          piece_id: edge.piece_id,
          direction: edge.direction,
        }));

        setGraphData({ nodes, edges });
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading data:", err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Handle node selection from graph
  const handleNodeSelect = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  // Handle node hover from graph
  const handleNodeHover = useCallback((nodeId: string | null, mouseX: number, mouseY: number) => {
    setHoveredNodeId(nodeId);
    setHoverPosition({ x: mouseX, y: mouseY });
    
    // Get distance to goal for the hovered node
    if (nodeId && graphRef) {
      const distance = graphRef.getDistanceToGoal(nodeId);
      setHoveredNodeDistance(distance);
    } else {
      setHoveredNodeDistance(null);
    }
  }, [graphRef]);

  // Handle move from puzzle - navigate to new state
  const handlePuzzleMove = useCallback(
    (targetNodeId: string) => {
      setSelectedNodeId(targetNodeId);

      // Focus the graph on the new node
      if (graphRef) {
        graphRef.selectNodeById(targetNodeId);
      }
    },
    [graphRef]
  );

  // Handle color mapping change from puzzle
  const handleColorMappingChange = useCallback(
    (mapping: Map<number, number>) => {
      setPieceColorMapping(mapping);
    },
    []
  );

  // Auto-solve advancement effect
  useEffect(() => {
    if (!autoSolveActive || autoSolvePath.length === 0) {
      if (autoSolveIntervalRef.current) {
        clearInterval(autoSolveIntervalRef.current);
        autoSolveIntervalRef.current = null;
      }
      return;
    }

    const interval = setInterval(() => {
      setAutoSolveIndex((prevIndex) => {
        const nextIndex = prevIndex + 1;
        if (nextIndex >= autoSolvePath.length) {
          // Reached the end
          setAutoSolveActive(false);
          return prevIndex;
        }
        // Select the next node in the path
        const nextNodeId = autoSolvePath[nextIndex];
        if (graphRef) {
          graphRef.selectNodeById(nextNodeId);
          setSelectedNodeId(nextNodeId);
        }
        return nextIndex;
      });
    }, autoSolveSpeed);

    autoSolveIntervalRef.current = interval;

    return () => {
      if (autoSolveIntervalRef.current) {
        clearInterval(autoSolveIntervalRef.current);
      }
    };
  }, [autoSolveActive, autoSolvePath, autoSolveSpeed, graphRef]);

  // Sync auto solve speed with renderer for camera tween
  useEffect(() => {
    if (graphRef) {
      graphRef.setAutoSolveSpeed(autoSolveSpeed);
    }
  }, [autoSolveSpeed, graphRef]);

  // Start auto-solve function
  const handleStartAutoSolve = useCallback(() => {
    if (!selectedNodeId || !graphRef) return;

    const path = graphRef.getCurrentPath();
    if (path.length === 0) return;

    setAutoSolvePath(path);
    setAutoSolveIndex(0);
    setAutoSolveActive(true);
    graphRef.setAutoSolveMode(true);
  }, [selectedNodeId, graphRef]);

  // Stop auto-solve function
  const handleStopAutoSolve = useCallback(() => {
    setAutoSolveActive(false);
    setAutoSolveIndex(0);
    setAutoSolvePath([]);
    if (graphRef) {
      graphRef.setAutoSolveMode(false);
    }
  }, [graphRef]);

  // Stop auto-solve when node is deselected
  useEffect(() => {
    if (!selectedNodeId && autoSolveActive) {
      // Stop animation when deselecting a node
      setTimeout(() => {
        setAutoSolveActive(false);
        setAutoSolveIndex(0);
        setAutoSolvePath([]);
        if (graphRef) {
          graphRef.setAutoSolveMode(false);
        }
      }, 0);
    }
  }, [selectedNodeId, autoSolveActive, graphRef]);

  if (loading) {
    return <LoadingMsg />;
  }

  if (error) {
    return <StandardErrorMsg message={error} />;
  }

  if (webgpuError) {
    return <WebGPUErrorMsg webgpuError={webgpuError} />;
  }

  if (!graphData) {
    return null;
  }

  return (
    <div>
      <InfoPanel
        metadata={metadata}
        moveToStartState={() => {
          if (graphRef && startStateId) {
            graphRef.selectNodeById(startStateId);
            setSelectedNodeId(startStateId);
          }
        }}
        onColoringModeChange={(mode: ColoringMode) => {
          if (graphRef) {
            graphRef.setColoringMode(mode);
          }
        }}
        endStateHighlightingEnabled={endStateHighlightingEnabled}
        onEndStateHighlightingChange={(enabled: boolean) => {
          setEndStateHighlightingEnabled(enabled);
          if (graphRef) {
            graphRef.setEndStateHighlighting(enabled);
          }
        }}
        solutionHighlightingEnabled={solutionHighlightingEnabled}
        onSolutionHighlightingChange={(enabled: boolean) => {
          setSolutionHighlightingEnabled(enabled);
          if (graphRef) {
            graphRef.setSolutionHighlighting(enabled);
          }
        }}
        selectedNodeId={selectedNodeId}
        autoSolveActive={autoSolveActive}
        autoSolvePath={autoSolvePath}
        autoSolveIndex={autoSolveIndex}
        autoSolveSpeed={autoSolveSpeed}
        onAutoSolveStart={handleStartAutoSolve}
        onAutoSolveStop={handleStopAutoSolve}
        onAutoSolveSpeedChange={setAutoSolveSpeed}
      />
      <GitHubLink />

      {/* Klotski Puzzle Panel */}
      <div
        style={{
          position: "absolute",
          bottom: "20px",
          right: "20px",
          zIndex: 1000,
          background: "rgba(0, 0, 0, 0.85)",
          borderRadius: "12px",
          minWidth: "250px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
        }}
      >
        <div
          style={{
            padding: "10px 15px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            color: "white",
            fontWeight: "bold",
            fontSize: "14px",
          }}
        >
          Current State
        </div>
        {metadata && (
          <KlotskiPuzzle
            metadata={metadata}
            pieces={klotskiPieces}
            currentNode={selectedNode}
            edges={klotskiEdges}
            onMove={handlePuzzleMove}
            onColorMappingChange={handleColorMappingChange}
          />
        )}
      </div>

      {/* WebGPU Graph */}
      <WebGPUGraph
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        onReady={() => console.log("WebGPU renderer ready")}
        onGraphDataLoaded={handleGraphDataLoaded}
        onError={(err) => setWebgpuError(err)}
        onNodeSelect={handleNodeSelect}
        onNodeHover={handleNodeHover}
        selectedNodeId={selectedNodeId}
        pieceColorMapping={pieceColorMapping}
        startPaused={true}
        ref={setGraphRef}
      />

      {/* Board State Hover Tooltip */}
      {hoveredNode && metadata && (
        <BoardStateTooltip
          node={hoveredNode}
          pieces={klotskiPieces}
          metadata={metadata}
          mouseX={hoverPosition.x}
          mouseY={hoverPosition.y}
          distanceToGoal={hoveredNodeDistance}
        />
      )}
    </div>
  );
}

export default App;
