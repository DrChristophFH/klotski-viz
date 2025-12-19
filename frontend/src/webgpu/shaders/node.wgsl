// Node rendering shader - instanced 3D spheres with vertex buffer

struct Uniforms {
    view_proj: mat4x4<f32>,
    camera_position: vec4<f32>,
    node_size: f32,
    edge_width: f32,
    selected_node: i32,  // -1 if none selected
    highlight_end_states: i32,
}

// Node struct matches the compute shader layout
struct Node {
    position: vec4<f32>,
    velocity: vec4<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> nodes: array<Node>;
@group(0) @binding(2) var<storage, read> node_colors: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> sphere_vertices: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> connected_nodes: array<u32>; // 0=not connected, 1=selected, 2+=piece_id+2
@group(0) @binding(5) var<storage, read> piece_colors: array<vec4<f32>>; // 10 piece colors
@group(0) @binding(6) var<storage, read> end_states: array<u32>; // 1 = end state, 0 = not

struct NodeVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) color: vec3<f32>,
    @location(2) world_pos: vec3<f32>,
    @location(3) @interpolate(flat) is_selected: u32,
    @location(4) @interpolate(flat) connection_state: u32, // 0=none, 1=selected, 2+=piece_id+2
    @location(5) @interpolate(flat) is_end: u32,
}

@vertex
fn vs_main(
    @builtin(vertex_index) vertex_idx: u32,
    @builtin(instance_index) instance_idx: u32,
) -> NodeVertexOutput {
    var output: NodeVertexOutput;
    
    // Check if this node is selected or connected to selected
    let is_selected = u32(i32(instance_idx) == uniforms.selected_node);
    var connection_state = 0u;
    
    // Check connection state (0 = not connected, 1 = selected, 2+ = piece_id + 2)
    if (uniforms.selected_node >= 0 && instance_idx < arrayLength(&connected_nodes)) {
        connection_state = connected_nodes[instance_idx];
    }
    
    // Get sphere vertex from buffer
    let local_pos = sphere_vertices[vertex_idx].xyz;
    
    // The local position IS the normal for a unit sphere
    let normal = local_pos;
    
    // Scale - selected/connected nodes are slightly larger
    var size = uniforms.node_size;
    if (is_selected == 1u || connection_state == 1u) {
        size *= 1.5;
    } else if (connection_state >= 2u) {
        size *= 1.2;
    }
    
    // Scale and translate to node position
    let node_pos = nodes[instance_idx].position.xyz;
    let world_pos = node_pos + local_pos * size;
    
    output.position = uniforms.view_proj * vec4<f32>(world_pos, 1.0);
    output.normal = normal;
    output.color = node_colors[instance_idx].rgb;
    output.world_pos = world_pos;
    output.is_selected = is_selected;
    output.connection_state = connection_state;
    // End-state flag used for red highlight when enabled
    if (uniforms.highlight_end_states != 0 && instance_idx < arrayLength(&end_states)) {
        output.is_end = end_states[instance_idx];
    } else {
        output.is_end = 0u;
    }
    
    return output;
}

@fragment
fn fs_main(input: NodeVertexOutput) -> @location(0) vec4<f32> {
    // Use the color directly without lighting
    var final_color = input.color;
    
    // Highlight selected node (golden glow)
    if (input.is_selected == 1u || input.connection_state == 1u) {
        final_color = vec3<f32>(1.0, 0.85, 0.2);
    } else if (input.is_end == 1u) {
        // Highlight end states in red when flag propagated by vertex
        final_color = vec3<f32>(1.0, 0.0, 0.0);
    } else if (input.connection_state >= 2u) {
        // Connected nodes get colored by the piece that moves
        let piece_id = input.connection_state - 2u;
        final_color = piece_colors[piece_id].rgb;
    } else if (uniforms.selected_node >= 0) {
        // grayscale non-connected nodes when something is selected
        let gray = dot(final_color, vec3<f32>(0.299, 0.587, 0.114));
        final_color = vec3<f32>(gray);
    }
    
    return vec4<f32>(final_color, 1.0);
}
