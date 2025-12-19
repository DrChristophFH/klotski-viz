"""
Klotski Puzzle State Space Generator

This program takes a Klotski puzzle setup and computes the complete state space,
generating a JSON file with nodes (puzzle states) and edges (valid moves).
"""

import json
from typing import List, Tuple, Set, Dict
from collections import deque
from dataclasses import dataclass, asdict
import hashlib


@dataclass
class Piece:
    """Represents a puzzle piece with its position and size"""
    id: int
    x: int  # top-left x coordinate
    y: int  # top-left y coordinate
    width: int
    height: int
    
    def get_positions(self) -> Set[Tuple[int, int]]:
        """Returns all grid positions occupied by this piece"""
        positions = set()
        for dx in range(self.width):
            for dy in range(self.height):
                positions.add((self.x + dx, self.y + dy))
        return positions


class KlotskiState:
    """Represents a state of the Klotski puzzle"""
    
    def __init__(self, pieces: List[Piece], board_width: int = 4, board_height: int = 5):
        self.pieces = pieces
        self.board_width = board_width
        self.board_height = board_height
    
    def to_tuple(self) -> Tuple:
        """Convert state to hashable tuple representation"""
        return tuple(sorted((p.x, p.y, p.width, p.height) for p in self.pieces))
    
    def to_hash(self) -> str:
        """Generate a unique hash for this state"""
        state_str = str(self.to_tuple())
        return hashlib.md5(state_str.encode()).hexdigest()
    
    def to_dict(self) -> Dict:
        """Convert state to dictionary for JSON serialization"""
        return {
            'pieces': [asdict(p) for p in self.pieces]
        }
    
    def to_position_array(self) -> List[List[int]]:
        """Convert state to compact array of [x, y] positions"""
        # Sort pieces by ID to ensure consistent ordering
        sorted_pieces = sorted(self.pieces, key=lambda p: p.id)
        return [[p.x, p.y] for p in sorted_pieces]
    
    def get_occupied_positions(self) -> Dict[Tuple[int, int], int]:
        """Returns a map of position -> piece_id"""
        occupied = {}
        for piece in self.pieces:
            for pos in piece.get_positions():
                occupied[pos] = piece.id
        return occupied
    
    def is_valid_position(self, piece_id: int, new_x: int, new_y: int, 
                         piece_width: int, piece_height: int) -> bool:
        """Check if a piece can be placed at given position"""
        # Check board boundaries
        if new_x < 0 or new_y < 0:
            return False
        if new_x + piece_width > self.board_width:
            return False
        if new_y + piece_height > self.board_height:
            return False
        
        # Check collision with other pieces
        occupied = self.get_occupied_positions()
        for dx in range(piece_width):
            for dy in range(piece_height):
                pos = (new_x + dx, new_y + dy)
                if pos in occupied and occupied[pos] != piece_id:
                    return False
        
        return True
    
    def get_possible_moves(self) -> List[Tuple['KlotskiState', int, str]]:
        """
        Generate all possible next states from current state.
        Returns list of (new_state, piece_id, direction)
        """
        moves = []
        
        for piece in self.pieces:
            # Try moving in all four directions
            directions = [
                (-1, 0, 'left'),
                (1, 0, 'right'),
                (0, -1, 'up'),
                (0, 1, 'down')
            ]
            
            for dx, dy, direction in directions:
                new_x = piece.x + dx
                new_y = piece.y + dy
                
                if self.is_valid_position(piece.id, new_x, new_y, piece.width, piece.height):
                    # Create new state with moved piece
                    new_pieces = []
                    for p in self.pieces:
                        if p.id == piece.id:
                            new_pieces.append(Piece(p.id, new_x, new_y, 
                                                   p.width, p.height))
                        else:
                            new_pieces.append(Piece(p.id, p.x, p.y, 
                                                   p.width, p.height))
                    
                    new_state = KlotskiState(new_pieces, 
                                            self.board_width, 
                                            self.board_height)
                    moves.append((new_state, piece.id, direction))
        
        return moves
    
    def visualize(self) -> str:
        """Create a visual representation of the board"""
        board = [['.' for _ in range(self.board_width)] 
                for _ in range(self.board_height)]
        
        for piece in self.pieces:
            symbol = str(piece.id) if piece.id < 10 else chr(65 + piece.id - 10)
            for pos in piece.get_positions():
                x, y = pos
                board[y][x] = symbol
        
        return '\n'.join(''.join(row) for row in board)


class KlotskiSolver:
    """Computes the complete state space of a Klotski puzzle"""
    
    def __init__(self, initial_state: KlotskiState):
        self.initial_state = initial_state
        self.visited_states: Dict[str, KlotskiState] = {}
        self.edges: List[Dict] = []
    
    def compute_state_space(self) -> Dict:
        """
        Compute the complete state space using BFS.
        Returns a dictionary with nodes and edges for JSON export.
        """
        queue = deque([self.initial_state])
        queued_states : set = set([self.initial_state.to_hash()])
        
        state_count = 0
        
        print("Computing state space...")
        
        while queue:
            current_state = queue.popleft()
            current_hash = current_state.to_hash()
            queued_states.remove(current_hash)
            
            state_count += 1
            if state_count % 1000 == 0:
                print(f"Processed {state_count} states, "
                      f"Queue size: {len(queue)}, "
                      f"Total unique states: {len(self.visited_states)}")
                
            if state_count % 50000 == 0:
                print(f"--- Reached {state_count} states ---")
                with open("visited_states_visualization.txt", 'w') as vis_file:
                    for state_hash, state in self.visited_states.items():
                        vis_file.write(f"State Hash: {state_hash}\n")
                        vis_file.write(state.visualize() + "\n\n")
            
            # Get all possible moves from current state
            moves = current_state.get_possible_moves()
            
            for new_state, piece_id, direction in moves:
                new_hash = new_state.to_hash()
                
                # Add edge
                edge = {
                    'source': current_hash,
                    'target': new_hash,
                    'piece_id': piece_id,
                    'direction': direction
                }
                self.edges.append(edge)
                
                # If new state hasn't been visited, add to queue
                if new_hash not in self.visited_states and new_hash not in queued_states:
                    queue.append(new_state)
                    queued_states.add(new_hash)
            
            self.visited_states[current_hash] = current_state
        
        print("\nState space computation complete!")
        print(f"Total unique states: {len(self.visited_states)}")
        print(f"Total edges: {len(self.edges)}")
        
        return self.create_graph_json()
    
    def create_graph_json(self) -> Dict:
        """Create JSON-serializable graph structure with optimized format"""
        # Extract piece definitions from initial state (id, width, height)
        sorted_pieces = sorted(self.initial_state.pieces, key=lambda p: p.id)
        piece_definitions = [
            {
                'id': p.id,
                'width': p.width,
                'height': p.height
            }
            for p in sorted_pieces
        ]
        
        # Create nodes with only position arrays
        nodes = []
        for state_hash, state in self.visited_states.items():
            node = {
                'id': state_hash,
                'positions': state.to_position_array()
            }
            nodes.append(node)
        
        return {
            'metadata': {
                'total_nodes': len(nodes),
                'total_edges': len(self.edges),
                'board_width': self.initial_state.board_width,
                'board_height': self.initial_state.board_height
            },
            'pieces': piece_definitions,
            'nodes': nodes,
            'edges': self.edges
        }


def create_classic_klotski() -> KlotskiState:
    """
    Creates the classic Klotski puzzle setup (Huarong Road).
    Board is 4x5, pieces are:
    - 1x 2x2 (piece 0, the main piece)
    - 4x 1x2 vertical (pieces 1-4)
    - 1x 2x1 horizontal (piece 5)
    - 4x 1x1 (pieces 6-9)
    """
    pieces = [
        Piece(0, 1, 0, 2, 2),  # Main 2x2 piece
        Piece(1, 0, 0, 1, 2),  # Left vertical
        Piece(2, 3, 0, 1, 2),  # Right vertical
        Piece(3, 0, 2, 1, 2),  # Left vertical lower
        Piece(4, 3, 2, 1, 2),  # Right vertical lower
        Piece(5, 1, 2, 2, 1),  # Horizontal 2x1
        Piece(6, 0, 4, 1, 1),  # Small piece bottom-left
        Piece(7, 1, 3, 1, 1),  # Small piece
        Piece(8, 2, 3, 1, 1),  # Small piece
        Piece(9, 3, 4, 1, 1),  # Small piece bottom-right
    ]
    
    return KlotskiState(pieces, board_width=4, board_height=5)


def create_simple_klotski() -> KlotskiState:
    """
    Creates a simpler Klotski puzzle for testing.
    3x3 board with fewer pieces.
    """
    pieces = [
        Piece(0, 0, 0, 2, 2),  # Main 2x2 piece
        Piece(1, 2, 0, 1, 2),  # Vertical piece
        Piece(2, 0, 2, 1, 1),  # Small piece
        Piece(3, 1, 2, 1, 1),  # Small piece
    ]
    
    return KlotskiState(pieces, board_width=3, board_height=3)


def main():
    """Main execution function"""
    print("Klotski State Space Generator")
    print("=" * 50)
    
    # Choose puzzle configuration
    print("\nSelect puzzle configuration:")
    print("1. Classic Klotski (4x5, 10 pieces) - Large state space")
    print("2. Simple Klotski (3x3, 4 pieces) - Small state space for testing")
    
    choice = input("\nEnter choice (1 or 2, default=2): ").strip()
    
    if choice == "1":
        initial_state = create_classic_klotski()
        output_file = "klotski_classic_statespace.json"
    else:
        initial_state = create_simple_klotski()
        output_file = "klotski_simple_statespace.json"
    
    print("\nInitial puzzle state:")
    print(initial_state.visualize())
    print()
    
    # Compute state space
    solver = KlotskiSolver(initial_state)
    graph_data = solver.compute_state_space()
    
    # Save to JSON file
    print(f"\nSaving to {output_file}...")
    with open(output_file, 'w') as f:
        json.dump(graph_data, f, indent=2)
    
    print(f"Successfully saved state space to {output_file}")
    print(f"File contains {graph_data['metadata']['total_nodes']} nodes "
          f"and {graph_data['metadata']['total_edges']} edges")


if __name__ == "__main__":
    main()
