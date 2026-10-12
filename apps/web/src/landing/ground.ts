import { BufferAttribute, BufferGeometry } from "three";
import { noise3 } from "../world/kit/bake";

// The clearing's ground (made in code, 0053): a grid fine enough to hold baked moon shadows from the
// gate and trees (per vertex), gently uneven, mossy in patches, worn bare where the path runs.
// `ageing` = (darkening, moss), as the baked region materials expect.

export function makeGround(size: number, segments: number, onPath: (x: number, z: number) => number): BufferGeometry {
  const step = size / segments;
  const half = size / 2;
  const height = (x: number, z: number) => {
    // Flat round the gate and the path; rolling a little further out.
    const away = Math.min(Math.hypot(x, z - 3) / 9, 1);
    return noise3(x * 0.18, 0, z * 0.18) * 0.35 * away - 0.03;
  };
  const positions: number[] = [];
  const ageing: number[] = [];
  const vertex = (x: number, z: number) => {
    positions.push(x, height(x, z), z);
    const bare = onPath(x, z);
    const patch = noise3(x * 0.4 + 9, 2, z * 0.4 + 9);
    ageing.push(0.75 + noise3(x * 2.1, 5, z * 2.1) * 0.12 - bare * 0.1, Math.max(0, 0.45 + patch * 0.5) * (1 - bare));
  };
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < segments; j++) {
      const x0 = -half + i * step;
      const z0 = -half + j * step;
      const x1 = x0 + step;
      const z1 = z0 + step;
      // Two triangles, counter-clockwise from above (facing up).
      for (const [x, z] of [
        [x0, z0],
        [x0, z1],
        [x1, z1],
        [x0, z0],
        [x1, z1],
        [x1, z0],
      ] as const)
        vertex(x, z);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("ageing", new BufferAttribute(new Float32Array(ageing), 2));
  g.computeVertexNormals();
  return g;
}

// The hill the gate is built into: a low, lumpy dome of earth behind the wall, so the arch reads as
// a way down into the ground, not a window onto the forest.
export function makeMound(centre: [number, number, number], radius: number, height: number): BufferGeometry {
  const rings = 18;
  const sides = 40;
  const point = (ring: number, side: number): [number, number, number] => {
    const r = (ring / rings) * radius;
    const a = (side / sides) * Math.PI * 2;
    const x = centre[0] + Math.cos(a) * r;
    const z = centre[2] + Math.sin(a) * r * 0.7;
    const t = ring / rings;
    const dome = Math.sqrt(Math.max(0, 1 - t * t)) * (1 - 0.25 * t); // a low, rounded hill
    const lumps = 1 + noise3(x * 0.5, 7, z * 0.5) * 0.18;
    return [x, centre[1] + dome * height * lumps, z];
  };
  const positions: number[] = [];
  const ageing: number[] = [];
  for (let ring = 0; ring < rings; ring++)
    for (let side = 0; side < sides; side++) {
      const a = point(ring, side);
      const b = point(ring + 1, side);
      const c = point(ring + 1, side + 1);
      const d = point(ring, side + 1);
      for (const p of [a, c, b, a, d, c]) {
        positions.push(...p);
        ageing.push(0.62 + noise3(p[0] * 1.3, p[1], p[2] * 1.3) * 0.12, 0.55 + noise3(p[0] * 0.4, 1, p[2] * 0.4) * 0.4);
      }
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("ageing", new BufferAttribute(new Float32Array(ageing), 2));
  g.computeVertexNormals();
  return g;
}
