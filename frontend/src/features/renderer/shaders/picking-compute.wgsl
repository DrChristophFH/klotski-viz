/**
 * GPU-based picking compute shader
 * Analyzes the picking texture to find clicked and hovered nodes
 */

struct PickingParams {
  mouseX: f32,
  mouseY: f32,
  pickingWidth: f32,
  pickingHeight: f32,
  hoverRadius: f32,
  pickingScale: f32,
}

struct PickingResults {
  nearestNode: i32,      // Nearest node to cursor within hover radius
  nearestDistance: f32,  // Distance to nearest node in pixels
  _padding: vec2<f32>,
}

@group(0) @binding(0) var pickingTexture: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: PickingParams;
@group(0) @binding(2) var<storage, read_write> results: PickingResults;

fn decodeNodeIndex(color: vec4<f32>) -> i32 {
  // Check if valid pixel (alpha should be ~1.0)
  if (color.a < 0.98) {
    return -1;
  }
  
  // Convert from normalized [0,1] to [0,255]
  let r = u32(color.r * 255.0);
  let g = u32(color.g * 255.0);
  let b = u32(color.b * 255.0);
  
  // Decode index from RGB
  return i32(r | (g << 8u) | (b << 16u));
}

@compute @workgroup_size(1)
fn main() {
  // Convert mouse coords to picking texture coords
  let pickX = i32(params.mouseX * params.pickingScale);
  let pickY = i32(params.mouseY * params.pickingScale);
  
  // Find nearest node within hover radius
  var nearestNode = -1;
  var nearestDistSq = 999999.0;
  let hoverRadiusScaled = i32(params.hoverRadius * params.pickingScale);
  
  for (var dy = -hoverRadiusScaled; dy <= hoverRadiusScaled; dy++) {
    for (var dx = -hoverRadiusScaled; dx <= hoverRadiusScaled; dx++) {
      // Check if within circular radius
      let distSq = f32(dx * dx + dy * dy);
      let radiusSq = f32(hoverRadiusScaled * hoverRadiusScaled);
      if (distSq > radiusSq) {
        continue;
      }
      
      let sampleX = pickX + dx;
      let sampleY = pickY + dy;
      
      // Check bounds
      if (sampleX < 0 || sampleX >= i32(params.pickingWidth) || 
          sampleY < 0 || sampleY >= i32(params.pickingHeight)) {
        continue;
      }
      
      let color = textureLoad(pickingTexture, vec2<i32>(sampleX, sampleY), 0);
      let nodeIndex = decodeNodeIndex(color);
      
      // Track the nearest node
      if (nodeIndex >= 0 && distSq < nearestDistSq) {
        nearestNode = nodeIndex;
        nearestDistSq = distSq;
      }
    }
  }
  
  results.nearestNode = nearestNode;
  results.nearestDistance = sqrt(nearestDistSq) / params.pickingScale;
}
