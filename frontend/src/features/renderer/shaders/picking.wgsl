// Picking shader - renders node indices as colors for GPU-based picking
struct Uniforms {
  viewProjection: mat4x4<f32>,
  cameraPosition: vec3<f32>,
  selectedNode: i32,
  screenWidth: f32,
  screenHeight: f32,
}

struct Node {
  position: vec4<f32>,
  velocity: vec4<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> nodes: array<Node>;
@group(0) @binding(2) var<storage, read> sphereVertices: array<vec4<f32>>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) @interpolate(flat) nodeIndex: u32,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOutput {
  var output: VertexOutput;
  
  let node = nodes[instanceIndex];
  let sphereVertex = sphereVertices[vertexIndex].xyz;
  // Distance-based scaling
  let nodePos = nodes[instanceIndex].position.xyz;
  let cameraPos = uniforms.cameraPosition.xyz;
  let dist = distance(nodePos, cameraPos);

  let scaleFactor = 1.0 + 0.0015 * dist;
  
  // Scale and translate to node position
  let worldPos = nodePos + sphereVertex * scaleFactor;
  
  output.position = uniforms.viewProjection * vec4<f32>(worldPos, 1.0);
  output.nodeIndex = instanceIndex;
  
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  // Encode node index as color (R=low byte, G=mid byte, B=high byte, A=255)
  let index = input.nodeIndex;
  let r = f32(index & 0xFFu) / 255.0;
  let g = f32((index >> 8u) & 0xFFu) / 255.0;
  let b = f32((index >> 16u) & 0xFFu) / 255.0;
  
  return vec4<f32>(r, g, b, 1.0);
}
