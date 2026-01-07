import { useState, useEffect, useCallback, useMemo } from 'react'
import WebGPUGraph from './webgpu/WebGPUGraph'
import type { WebGPUGraphRef } from './webgpu/WebGPUGraph'
import KlotskiPuzzle from './components/KlotskiPuzzle'
import type { KlotskiNode, KlotskiEdge, KlotskiPiece, KlotskiMetadata } from './types/klotski'
import { getPathEdges, isEndState, isStartState, loadPackedGraph, reconstructPath } from './webgpu/loadPackedGraph'

interface WebGPUGraphData {
  nodes: { id: string; x?: number; y?: number; z?: number }[];
  edges: { source: string; target: string; piece_id?: number }[];
}

function App() {
  const [graphData, setGraphData] = useState<WebGPUGraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<KlotskiMetadata | null>(null)
  const [webgpuError, setWebgpuError] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  })
  
  // Full Klotski data for puzzle visualization
  const [klotskiNodes, setKlotskiNodes] = useState<KlotskiNode[]>([])
  const [klotskiEdges, setKlotskiEdges] = useState<KlotskiEdge[]>([])
  const [klotskiPieces, setKlotskiPieces] = useState<KlotskiPiece[]>([])
  const [endStates, setEndStates] = useState<Set<string>>(new Set())
  const [startStateId, setStartStateId] = useState<string | null>(null)
  const [parentPointers, setParentPointers] = useState<(number | null)[]>([])
  
  // Selected node state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [graphRef, setGraphRef] = useState<WebGPUGraphRef | null>(null)
  
  // Piece color mapping for syncing puzzle colors with graph
  const [pieceColorMapping, setPieceColorMapping] = useState<Map<number, number>>(new Map())
  
  // Collapsible info panel state
  const [infoExpanded, setInfoExpanded] = useState(false)
  
  // Show next move hint toggle
  const [showNextMoveHint, setShowNextMoveHint] = useState(false)
  
  // Solve animation state
  const [isSolving, setIsSolving] = useState(false)
  const [solveSpeed, setSolveSpeed] = useState(1)
  const [solvePath, setSolvePath] = useState<string[]>([])
  const [solvePathIndex, setSolvePathIndex] = useState(0)
  
  // Get the current selected node's data
  const selectedNode = selectedNodeId 
    ? klotskiNodes.find(n => n.id === selectedNodeId) || null
    : null

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Load the Klotski state space data from packed binary format
  useEffect(() => {
    loadPackedGraph('/klotski_packed.bin')
      .then((data) => {
        console.log('Loaded packed Klotski data:', data.metadata)
        
        // Convert metadata format
        setMetadata({
          total_nodes: data.metadata.nodeCount,
          total_edges: data.metadata.edgeCount,
          board_width: data.metadata.boardWidth,
          board_height: data.metadata.boardHeight,
        })
        
        // Store full Klotski data for puzzle visualization
        // Convert positions from tuple array to nested array format
        setKlotskiNodes(data.nodes.map(node => ({
          id: node.id,
          positions: node.positions,
        })))
        setKlotskiEdges(data.edges.map(edge => ({
          source: edge.source,
          target: edge.target,
          piece_id: edge.piece_id,
          direction: edge.direction,
        })))
        setKlotskiPieces(data.pieces)
        setParentPointers(data.parentPointers)

        // Identify start and end states
        for (const node of data.nodes) {
          if (isStartState(node)) {
            setStartStateId(node.id)
          }
          if (isEndState(node)) {
            setEndStates(prev => new Set(prev).add(node.id))
          }
        }
        
        // Transform data for WebGPU graph - include precomputed positions
        const nodes = data.nodes.map(node => ({
          id: node.id,
          x: node.x,
          y: node.y,
          z: node.z,
        }))
        
        const edges = data.edges.map(edge => ({
          source: edge.source,
          target: edge.target,
          piece_id: edge.piece_id,
          direction: edge.direction,
        }))
        
        setGraphData({ nodes, edges })
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading data:', err)
        setError(err.message)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    console.log('Start state ID:', startStateId)
    console.log('End state IDs:', Array.from(endStates))
  }, [startStateId, endStates])
  
  // Compute next move based on selected node
  const nextMove = useMemo(() => {
    if (!selectedNodeId || !klotskiNodes.length || !parentPointers.length) {
      return null
    }
    
    try {
      const path = reconstructPath(selectedNodeId, klotskiNodes, parentPointers)
      const pathEdges = getPathEdges(path, klotskiEdges)
      
      return pathEdges.length > 0 ? pathEdges[0] : null
    } catch (err) {
      console.error('Error computing path:', err)
      return null
    }
  }, [selectedNodeId, klotskiNodes, klotskiEdges, parentPointers])
  
  // Compute and sync the full solution path to graph whenever node is selected
  useEffect(() => {
    if (!selectedNodeId || !graphRef) {
      return;
    }
    
    // Only show solution path if hints are enabled
    if (showNextMoveHint) {
      const path = reconstructPath(selectedNodeId, klotskiNodes, parentPointers)
      graphRef.setSolutionPath(path)
    } else {
      // Clear the solution path when hints are disabled
      graphRef.setSolutionPath([])
    }
  }, [selectedNodeId, showNextMoveHint])
  
  // Handle node selection from graph
  const handleNodeSelect = useCallback((nodeId: string | null) => {
    console.log('Selected node:', nodeId)
    setSelectedNodeId(nodeId)
  }, [])
  
  // Handle move from puzzle - navigate to new state
  const handlePuzzleMove = useCallback((targetNodeId: string) => {
    console.log('Puzzle move to:', targetNodeId)
    setSelectedNodeId(targetNodeId)
    
    // Focus the graph on the new node
    if (graphRef) {
      graphRef.selectNodeById(targetNodeId)
    }
  }, [graphRef])
  
  // Handle color mapping change from puzzle
  const handleColorMappingChange = useCallback((mapping: Map<number, number>) => {
    setPieceColorMapping(mapping)
  }, [])

  // Handle solve button - reconstruct full path and start animation
  const handleSolve = useCallback(() => {
    if (!selectedNodeId || !klotskiNodes.length || !parentPointers.length || endStates.size === 0) {
      return
    }

    try {
      const path = reconstructPath(selectedNodeId, klotskiNodes, parentPointers)
      setSolvePath(path)
      setSolvePathIndex(0)
      setIsSolving(true)
    } catch (err) {
      console.error('Error reconstructing path:', err)
    }
  }, [selectedNodeId, klotskiNodes, parentPointers, endStates])

  // Handle stop solve
  const handleStopSolve = useCallback(() => {
    setIsSolving(false)
    setSolvePath([])
    setSolvePathIndex(0)
  }, [])

  // Auto-advance solve animation
  useEffect(() => {
    if (!isSolving || solvePath.length === 0 || solvePathIndex >= solvePath.length) {
      return
    }

    // Calculate delay based on speed (1 = 1s per move, 0.5 = 2s, 2 = 0.5s)
    const delayMs = (1000 * (1 / solveSpeed))
    
    const timer = setTimeout(() => {
      const nextNodeId = solvePath[solvePathIndex + 1]
      if (nextNodeId) {
        setSelectedNodeId(nextNodeId)
        if (graphRef) {
          graphRef.selectNodeById(nextNodeId)
        }
        setSolvePathIndex(prev => prev + 1)
      } else {
        setIsSolving(false)
      }
    }, delayMs)

    return () => clearTimeout(timer)
  }, [isSolving, solvePathIndex, solvePath, solveSpeed, graphRef])


  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '24px',
        color: 'white',
        backgroundColor: '#000011',
      }}>
        Loading Klotski State Space...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '24px',
        color: 'red',
        backgroundColor: '#000011',
      }}>
        Error: {error}
      </div>
    )
  }

  if (webgpuError) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '20px',
        color: 'orange',
        backgroundColor: '#000011',
        padding: '20px',
        textAlign: 'center',
      }}>
        <div style={{ marginBottom: '20px', fontSize: '28px' }}>⚠️ WebGPU Not Available</div>
        <div>{webgpuError}</div>
        <div style={{ marginTop: '20px', fontSize: '14px', opacity: 0.7 }}>
          Please use a browser with WebGPU support (Chrome 113+, Edge 113+, or Firefox with flags enabled)
        </div>
      </div>
    )
  }

  if (!graphData) {
    return null
  }

  return (
    <div>
      {/* Info Panel */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        padding: '10px 15px',
        borderRadius: '8px',
        color: 'white',
        fontFamily: 'monospace',
      }}>
        <h2 
          onClick={() => setInfoExpanded(!infoExpanded)}
          style={{ 
            margin: '0', 
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          Klotski State Space
          <span style={{ fontSize: '14px', marginLeft: '10px' }}>{infoExpanded ? '▼' : '▶'}</span>
        </h2>
        {infoExpanded && (<>
        {metadata && (
          <div style={{ fontSize: '14px' }}>
            <div>Nodes: {metadata.total_nodes.toLocaleString()}</div>
            <div>Edges: {metadata.total_edges.toLocaleString()}</div>
            <div>Board: {metadata.board_width}x{metadata.board_height}</div>
          </div>
        )}
        <div style={{ 
          marginTop: '15px', 
          fontSize: '11px', 
          opacity: 0.7,
          lineHeight: 1.6,
        }}>
          <div><b>Controls:</b></div>
          <div>WASD - Move camera</div>
          <div>Shift - Move faster</div>
          <div>Right-click + drag - Look around</div>
          <div>Scroll - Zoom</div>
          <div>Click node - Select state</div>
          <div>Middle mouse + drag - Orbit selected state</div>
        </div>
        <div style={{ marginBottom: '15px' }}>
          <button
            onClick={() => {
              if (graphRef && startStateId) {
                graphRef.selectNodeById(startStateId)
                setSelectedNodeId(startStateId)
              }
            }}
            style={{
              width: '100%',
              padding: '8px',
              fontSize: '14px',
              cursor: 'pointer',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: '#4CAF50',
              color: 'white',
              fontWeight: 'bold',
            }}
          >
            Go to Start State
          </button>
        </div>
        </>)}
      </div>
      
      {/* Klotski Puzzle Panel */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.85)',
        borderRadius: '12px',
        width: '300px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
      }}>
        <div style={{
          padding: '10px 15px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{
            color: 'white',
            fontWeight: 'bold',
            fontSize: '14px',
          }}>
            Current State
          </div>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            color: 'rgba(255, 255, 255, 0.7)',
          }}>
            <input
              type="checkbox"
              checked={showNextMoveHint}
              onChange={(e) => setShowNextMoveHint(e.target.checked)}
              style={{
                cursor: 'pointer',
                width: '16px',
                height: '16px',
              }}
            />
            Show hints
          </label>
        </div>
        {metadata && (
          <KlotskiPuzzle
            metadata={metadata}
            pieces={klotskiPieces}
            currentNode={selectedNode}
            edges={klotskiEdges}
            nextMove={showNextMoveHint ? nextMove : null}
            onMove={handlePuzzleMove}
            onColorMappingChange={handleColorMappingChange}
            onSolve={handleSolve}
            onStopSolve={handleStopSolve}
            isSolving={isSolving}
            solveSpeed={solveSpeed}
            onSolveSpeedChange={setSolveSpeed}
            solveProgress={{ current: solvePathIndex, total: solvePath.length }}
          />
        )}
      </div>
      
      {/* WebGPU Graph */}
      <WebGPUGraph
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        onReady={() => console.log('WebGPU renderer ready')}
        onError={(err) => setWebgpuError(err)}
        onNodeSelect={handleNodeSelect}
        selectedNodeId={selectedNodeId}
        pieceColorMapping={pieceColorMapping}
        startPaused={true}
        ref={setGraphRef}
      />
    </div>
  )
}

export default App
