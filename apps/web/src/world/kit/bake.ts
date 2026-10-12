import { BufferAttribute, type BufferGeometry, DoubleSide, Ray, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";

// Bakes stone ageing into a merged room's vertices once at load, so the shader doesn't compute noise
// for every pixel every frame (the per-pixel version is in regionMaterials.ts, for standalone meshes).
// The `ageing` attribute holds (darkening, moss): darkening multiplies the colour (weathering
// blotches and grime low on walls); moss blends toward the moss colour on upward faces and low walls.

// Deterministic 3D value noise in [−1, 1] (no Math.random: the same room always looks the same).
function lattice(x: number, y: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const w = fade(z - zi);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => lattice(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

function smoothstep(a: number, b: number, x: number): number {
  return fade(Math.min(Math.max((x - a) / (b - a), 0), 1));
}

// The geometry must already be in world space (merged rooms are). Skips geometry that brings its
// own ageing (the procedural floor).
export function bakeAgeing(geometry: BufferGeometry): void {
  if (geometry.getAttribute("ageing")) return;
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const out = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const blotch = noise3(x * 0.9, y * 0.9, z * 0.9);
    const speckle = noise3(x * 7, y * 7, z * 7);
    const grime = 0.7 + 0.3 * smoothstep(0, 1.3, y);
    out[i * 2] = (0.92 + blotch * 0.18 + speckle * 0.06) * grime;
    const patches = smoothstep(0.1, 0.45, noise3(x * 0.55 + 3.1, y * 0.55 + 3.1, z * 0.55 + 3.1));
    const upward = normal ? smoothstep(0.55, 0.9, normal.getY(i)) : 0;
    const low = 1 - smoothstep(0.2, 1.4, y);
    out[i * 2 + 1] = patches * Math.min(upward + low, 1) * 0.85;
  }
  geometry.setAttribute("ageing", new BufferAttribute(out, 2));
}

// Bakes moonlight into the static room once at load (instead of rendering a shadow map every frame).
// For every vertex: how squarely it faces the moon, and whether anything in the room stands between
// it and the moon. The result (0..1) goes in a `moon` attribute; materials add it as cold light.
// Rays use three-mesh-bvh (MIT), so tens of thousands of them take a fraction of a second.
//
// Soft shadows: each vertex casts rays spread over a small cone (the moon isn't a point), and its
// light is the share that get through. Edges fade over a penumbra instead of stepping between
// vertices. The first three samples are the centre and two opposite edges of the cone.
const PENUMBRA = 0.045; // radians: the cone's half-width
const SAMPLES: [number, number][] = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7, 0.7],
  [-0.7, -0.7],
];

/** `shadowsWithin`: beyond this distance from the origin, skip the shadow test (fog hides it). */
export function bakeMoonlight(
  receivers: BufferGeometry[],
  occluder: BufferGeometry,
  toMoon: Vector3,
  shadowsWithin = Number.POSITIVE_INFINITY,
): void {
  const started = performance.now();
  const bvh = new MeshBVH(occluder);
  const ray = new Ray();
  const origin = new Vector3();
  const n = new Vector3();
  const side = new Vector3().crossVectors(toMoon, new Vector3(0, 1, 0)).normalize();
  const up = new Vector3().crossVectors(side, toMoon).normalize();
  const directions = SAMPLES.map(([a, b]) =>
    toMoon
      .clone()
      .addScaledVector(side, a * PENUMBRA)
      .addScaledVector(up, b * PENUMBRA)
      .normalize(),
  );
  let rays = 0;
  for (const geometry of receivers) {
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const out = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) {
      n.set(normal.getX(i), normal.getY(i), normal.getZ(i)).normalize();
      const facing = n.dot(toMoon);
      if (facing <= 0) continue;
      if (Math.hypot(position.getX(i), position.getZ(i)) > shadowsWithin) {
        out[i] = facing;
        continue;
      }
      // Start just off the surface so the rays don't hit the face they start on.
      origin
        .set(position.getX(i), position.getY(i), position.getZ(i))
        .addScaledVector(n, 0.03)
        .addScaledVector(toMoon, 0.02);
      // Adaptive: three rays first (centre and two opposite edges of the cone). If they agree, the
      // vertex is fully lit or fully shadowed (most are); only penumbra vertices get all the rays.
      const cast = (direction: Vector3): number => {
        ray.set(origin, direction);
        rays++;
        return bvh.raycastFirst(ray, DoubleSide, 0, 40) ? 0 : 1;
      };
      const first = [0, 1, 2].map((k) => cast(directions[k] as Vector3));
      const sum = first.reduce((a, b) => a + b, 0);
      let share = sum / 3;
      if (sum !== 0 && sum !== 3) {
        let through = sum;
        for (let k = 3; k < directions.length; k++) through += cast(directions[k] as Vector3);
        share = through / directions.length;
      }
      out[i] = facing * share;
    }
    geometry.setAttribute("moon", new BufferAttribute(out, 1));
  }
  console.info(`[wirelight] moonlight baked: ${rays} rays in ${Math.round(performance.now() - started)} ms`);
}
