export interface KlotskiPiece {
  id: number;
  width: number;
  height: number;
}

export interface KlotskiNode {
  id: string;
  positions: number[][];
}

export interface KlotskiEdge {
  source: string;
  target: string;
  piece_id: number;
  direction: string;
}

export interface KlotskiMetadata {
  total_nodes: number;
  total_edges: number;
  board_width: number;
  board_height: number;
}

export interface KlotskiStateSpace {
  metadata: KlotskiMetadata;
  pieces: KlotskiPiece[];
  nodes: KlotskiNode[];
  edges: KlotskiEdge[];
}

export interface GraphNode {
  id: string;
  name?: string;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
