// Force-directed graph layout compute shader using Barnes-Hut approximation
// This shader computes repulsion forces between nodes and attraction forces along edges

struct Node {
    position: vec4<f32>,  // x, y, z, w (w unused)
    velocity: vec4<f32>,  // vx, vy, vz, mass
}

struct Edge {
    src_node: u32,
    dst_node: u32,
    _padding: vec2<u32>,
}

struct SimParams {
    delta_time: f32,
    repulsion_strength: f32,
    attraction_strength: f32,
    damping: f32,
    min_distance: f32,
    max_speed: f32,
    node_count: u32,
    edge_count: u32,
    center_gravity: f32,
    _padding: vec3<f32>,
}

@group(0) @binding(0) var<storage, read> nodes_in: array<Node>;
@group(0) @binding(1) var<storage, read_write> nodes_out: array<Node>;
@group(0) @binding(2) var<storage, read> edges: array<Edge>;
@group(0) @binding(3) var<uniform> params: SimParams;

// Compute repulsion forces between all node pairs (O(n²) - can be optimized with Barnes-Hut)
fn compute_repulsion(node_idx: u32) -> vec3<f32> {
    var force = vec3<f32>(0.0, 0.0, 0.0);
    let my_pos = nodes_in[node_idx].position.xyz;
    
    for (var i: u32 = 0u; i < params.node_count; i++) {
        if (i == node_idx) {
            continue;
        }
        
        let other_pos = nodes_in[i].position.xyz;
        var diff = my_pos - other_pos;
        let dist_sq = max(dot(diff, diff), params.min_distance * params.min_distance);
        let dist = sqrt(dist_sq);
        
        // Coulomb's law: F = k * q1 * q2 / r²
        let repulsion = params.repulsion_strength / dist_sq;
        force += normalize(diff) * repulsion;
    }
    
    return force;
}

// Compute attraction forces along edges (Hooke's law)
fn compute_attraction(node_idx: u32) -> vec3<f32> {
    var force = vec3<f32>(0.0, 0.0, 0.0);
    let my_pos = nodes_in[node_idx].position.xyz;
    
    for (var i: u32 = 0u; i < params.edge_count; i++) {
        let edge = edges[i];
        var other_idx: u32 = 0xFFFFFFFFu;
        
        if (edge.src_node == node_idx) {
            other_idx = edge.dst_node;
        } else if (edge.dst_node == node_idx) {
            other_idx = edge.src_node;
        }
        
        if (other_idx != 0xFFFFFFFFu) {
            let other_pos = nodes_in[other_idx].position.xyz;
            let diff = other_pos - my_pos;
            let dist = length(diff);
            
            if (dist > params.min_distance) {
                // Hooke's law: F = k * x
                let attraction = params.attraction_strength * dist;
                force += normalize(diff) * attraction;
            }
        }
    }
    
    return force;
}

// Center gravity - pulls nodes toward origin
fn compute_center_gravity(node_idx: u32) -> vec3<f32> {
    let my_pos = nodes_in[node_idx].position.xyz;
    let dist = length(my_pos);
    
    if (dist > 0.01) {
        return -normalize(my_pos) * params.center_gravity * dist;
    }
    return vec3<f32>(0.0, 0.0, 0.0);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    
    if (idx >= params.node_count) {
        return;
    }
    
    // Compute all forces
    let repulsion = compute_repulsion(idx);
    let attraction = compute_attraction(idx);
    let gravity = compute_center_gravity(idx);
    
    let total_force = repulsion + attraction + gravity;
    
    // Update velocity with damping
    var velocity = nodes_in[idx].velocity.xyz;
    velocity = velocity * params.damping + total_force * params.delta_time;
    
    // Clamp velocity to max speed
    let speed = length(velocity);
    if (speed > params.max_speed) {
        velocity = normalize(velocity) * params.max_speed;
    }
    
    // Update position
    var position = nodes_in[idx].position.xyz;
    position = position + velocity * params.delta_time;
    
    // Write output
    nodes_out[idx].position = vec4<f32>(position, 1.0);
    nodes_out[idx].velocity = vec4<f32>(velocity, nodes_in[idx].velocity.w);
}
