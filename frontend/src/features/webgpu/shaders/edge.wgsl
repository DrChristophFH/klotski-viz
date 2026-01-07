// Edge rendering shader - simple lines between nodes

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
@group(0) @binding(2) var<storage, read> edge_indices: array<vec2<u32>>;

struct EdgeVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) alpha: f32,
    @location(1) @interpolate(flat) is_connected: u32,
}

@vertex
fn vs_main(
    @builtin(vertex_index) vertex_idx: u32,
    @builtin(instance_index) instance_idx: u32,
) -> EdgeVertexOutput {
    var output: EdgeVertexOutput;
    
    let edge = edge_indices[instance_idx];
    let src_pos = nodes[edge.x].position.xyz;
    let dst_pos = nodes[edge.y].position.xyz;
    
    // Check if this edge is connected to selected node
    var is_connected = 0u;
    if (uniforms.selected_node >= 0) {
        let sel = u32(uniforms.selected_node);
        if (edge.x == sel || edge.y == sel) {
            is_connected = 1u;
        }
    }
    
    // Interpolate between source and destination
    let t = f32(vertex_idx);
    let pos = mix(src_pos, dst_pos, t);
    
    output.position = uniforms.view_proj * vec4<f32>(pos, 1.0);
    output.alpha = select(0.3, 1.0, is_connected == 1u); // Dim non-connected edges when something is selected
    output.is_connected = is_connected;
    
    return output;
}

@fragment
fn fs_main(input: EdgeVertexOutput) -> @location(0) vec4<f32> {
    if (input.is_connected == 1u) {
        // Highlighted edge - cyan/bright
        return vec4<f32>(0.2, 1.0, 1.0, input.alpha);
    }
    // Normal edge - gray
    return vec4<f32>(0.8, 0.8, 0.8, input.alpha);
}
