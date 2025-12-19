// Vertex and fragment shaders for rendering the graph

// Node rendering - instanced spheres represented as billboards
struct NodeInstance {
    @location(0) position: vec3<f32>,
    @location(1) color: vec3<f32>,
}

struct Uniforms {
    view_proj: mat4x4<f32>,
    camera_position: vec4<f32>,
    node_size: f32,
    edge_width: f32,
    _padding: vec2<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> node_positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> node_colors: array<vec4<f32>>;

struct NodeVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec3<f32>,
    @location(2) world_pos: vec3<f32>,
}

// Billboard quad vertices
const QUAD_VERTICES = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, 1.0),
);

@vertex
fn vs_node(
    @builtin(vertex_index) vertex_idx: u32,
    @builtin(instance_index) instance_idx: u32,
) -> NodeVertexOutput {
    var output: NodeVertexOutput;
    
    let node_pos = node_positions[instance_idx].xyz;
    let quad_offset = QUAD_VERTICES[vertex_idx] * uniforms.node_size;
    
    // Billboard: always face camera
    let to_camera = normalize(uniforms.camera_position.xyz - node_pos);
    let right = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), to_camera));
    let up = cross(to_camera, right);
    
    let world_pos = node_pos + right * quad_offset.x + up * quad_offset.y;
    
    output.position = uniforms.view_proj * vec4<f32>(world_pos, 1.0);
    output.uv = QUAD_VERTICES[vertex_idx] * 0.5 + 0.5;
    output.color = node_colors[instance_idx].rgb;
    output.world_pos = world_pos;
    
    return output;
}

@fragment
fn fs_node(input: NodeVertexOutput) -> @location(0) vec4<f32> {
    // Create circular node with soft edge
    let center = vec2<f32>(0.5, 0.5);
    let dist = length(input.uv - center) * 2.0;
    
    if (dist > 1.0) {
        discard;
    }
    
    // Soft edge with glow
    let alpha = 1.0 - smoothstep(0.7, 1.0, dist);
    let glow = exp(-dist * 2.0) * 0.3;
    
    return vec4<f32>(input.color + glow, alpha * 0.9);
}

// Edge rendering - uses separate bind group layout
struct EdgeVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) alpha: f32,
}

@group(0) @binding(3) var<storage, read> edge_indices: array<vec2<u32>>;

@vertex
fn vs_edge(
    @builtin(vertex_index) vertex_idx: u32,
    @builtin(instance_index) instance_idx: u32,
) -> EdgeVertexOutput {
    var output: EdgeVertexOutput;
    
    let edge = edge_indices[instance_idx];
    let src_pos = node_positions[edge.x].xyz;
    let dst_pos = node_positions[edge.y].xyz;
    
    // Interpolate between source and destination
    let t = f32(vertex_idx);
    let pos = mix(src_pos, dst_pos, t);
    
    output.position = uniforms.view_proj * vec4<f32>(pos, 1.0);
    output.alpha = 0.3;
    
    return output;
}

@fragment
fn fs_edge(input: EdgeVertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(0.5, 0.5, 0.6, input.alpha);
}
