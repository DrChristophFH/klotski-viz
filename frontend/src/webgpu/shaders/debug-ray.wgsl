// Debug ray visualization shader

struct Uniforms {
    view_proj: mat4x4<f32>,
    camera_position: vec4<f32>,
    node_size: f32,
    edge_width: f32,
    selected_node: i32,
    _padding: f32,
}

struct RayData {
    origin: vec4<f32>,
    direction: vec4<f32>,  // xyz = direction, w = length
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> ray: RayData;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_idx: u32) -> VertexOutput {
    var output: VertexOutput;
    
    let t = f32(vertex_idx); // 0 or 1
    let ray_length = ray.direction.w;
    
    // Point along the ray
    let pos = ray.origin.xyz + ray.direction.xyz * t * ray_length;
    
    output.position = uniforms.view_proj * vec4<f32>(pos, 1.0);
    
    // Color gradient from green (origin) to red (end)
    output.color = mix(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), t);
    
    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(input.color, 1.0);
}
