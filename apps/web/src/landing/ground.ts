import { BufferAttribute, BufferGeometry } from "three";
import { noise3 } from "../world/kit/bake";

// The clearing's ground (made in code, 0053): a grid fine enough to hold baked moon shadows from the
// gate and trees (per vertex), gently uneven, mossy in patches, worn bare where the path runs.
// `ageing` = (darkening, moss), as the baked region materials expect.

export function makeGround(size: number, segments: number, onPath: (x: number, z: number) => number): BufferGeometry {
  const step = size / segments;
  const half = size / 2;
  const height = (x: number, z: number) => {
    // Flat round the gate and along the path (the rune-line lies on it); rolling a little further out.
    const away = Math.min(Math.hypot(x, z - 3) / 9, 1) * (1 - onPath(x, z));
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
