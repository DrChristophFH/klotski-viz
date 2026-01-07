import { useState, useEffect, useCallback } from "react";
import WebGPUGraph from "./features/webgpu/WebGPUGraph";
import type { WebGPUGraphRef } from "./features/webgpu/WebGPUGraph";
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
} from "./features/webgpu/loadPackedGraph";
import { WebGPUErrorMsg } from "./components/WebGPUErrorMsg";
import { StandardErrorMsg } from "./components/StandardErrorMsg";
import { LoadingMsg } from "./components/LoadingMsg";
import { InfoPanel } from "./features/info/InfoPanel";
import { GitHubLink } from "./components/GitHubLink";

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
  const [, setEndStates] = useState<Set<string>>(new Set());
  const [startStateId, setStartStateId] = useState<string | null>(null);

  // Selected node state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [graphRef, setGraphRef] = useState<WebGPUGraphRef | null>(null);

  // Piece color mapping for syncing puzzle colors with graph
  const [pieceColorMapping, setPieceColorMapping] = useState<
    Map<number, number>
  >(new Map());

  // Get the current selected node's data
  const selectedNode = selectedNodeId
    ? klotskiNodes.find((n) => n.id === selectedNodeId) || null
    : null;

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
        onError={(err) => setWebgpuError(err)}
        onNodeSelect={handleNodeSelect}
        selectedNodeId={selectedNodeId}
        pieceColorMapping={pieceColorMapping}
        startPaused={true}
        ref={setGraphRef}
      />
    </div>
  );
}

export default App;
