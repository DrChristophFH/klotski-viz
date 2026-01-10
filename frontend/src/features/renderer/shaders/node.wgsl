// Node rendering shader - instanced 3D spheres with vertex buffer

struct Uniforms {
    view_proj: mat4x4<f32>,
    camera_position: vec4<f32>,
    node_size: f32,
    edge_width: f32,
    selected_node: i32,  // -1 if none selected
    _padding: f32,
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
@group(0) @binding(6) var<storage, read> instance_indices: array<u32>; // instance -> node index mapping

struct NodeVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) color: vec3<f32>,
    @location(2) world_pos: vec3<f32>,
    @location(3) @interpolate(flat) is_selected: u32,
    @location(4) @interpolate(flat) connection_state: u32, // 0=none, 1=selected, 2+=piece_id+2
}

@vertex
fn vs_main(
    @builtin(vertex_index) vertex_idx: u32,
    @builtin(instance_index) instance_idx: u32,
) -> NodeVertexOutput {
    var output: NodeVertexOutput;

    let node_idx = instance_indices[instance_idx];
    
    // Check if this node is selected or connected to selected
    let is_selected = u32(i32(node_idx) == uniforms.selected_node);
    var connection_state = 0u;
    
    // Check connection state (0 = not connected, 1 = selected, 2+ = piece_id + 2)
    if (uniforms.selected_node >= 0 && node_idx < arrayLength(&connected_nodes)) {
        connection_state = connected_nodes[node_idx];
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

    // Distance-based scaling
    let node_pos = nodes[node_idx].position.xyz;
    let camera_pos = uniforms.camera_position.xyz;
    let dist = distance(node_pos, camera_pos);

    let scale_factor = 1.0 + 0.0005 * dist;
    size *= scale_factor;
    
    // Scale and translate to node position
    let world_pos = node_pos + local_pos * size;
    
    output.position = uniforms.view_proj * vec4<f32>(world_pos, 1.0);
    output.normal = normal;
    output.color = node_colors[node_idx].rgb;
    output.world_pos = world_pos;
    output.is_selected = is_selected;
    output.connection_state = connection_state;
    
    return output;
}

// Fragment shader for OPAQUE pass - only renders selected/connected nodes
@fragment
fn fs_main(input: NodeVertexOutput) -> @location(0) vec4<f32> {
    var final_color = input.color;
    
    // Highlight selected node (golden glow)
    if (input.is_selected == 1u || input.connection_state == 1u) {
        final_color = vec3<f32>(1.0, 0.85, 0.2);
    } else if (input.connection_state >= 2u) {
        // Connected nodes get colored by the piece that moves
        let piece_id = input.connection_state - 2u;
        final_color = piece_colors[piece_id].rgb;
    }
    
    return vec4<f32>(final_color, 1.0);
}

// Fragment shader for TRANSPARENT pass - only renders non-selected/non-connected nodes
@fragment
fn fs_main_transparent(input: NodeVertexOutput) -> @location(0) vec4<f32> {
    // grayscale non-connected nodes when something is selected
    let gray = dot(input.color, vec3<f32>(0.299, 0.587, 0.114));
    let final_color = vec3<f32>(gray);
    
    return vec4<f32>(final_color, 0.5);
}
