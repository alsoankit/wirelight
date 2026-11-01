import { type BufferGeometry, SphereGeometry } from "three";
import { prep, type V3 } from "../kit/shapes";

// A clipped hedge (Region 1's garden courts): one solid, rounded block with a lumpy, leafy skin, so it
// takes baked light like the walls and needs no leaf cards. Grown out of the hedges' overgrown years
// by a few layered lumps; seeded, so the same room grows the same hedge.

function lumps(x: number, y: number, z: number, seed: number) {
  const a = Math.sin(x * 5.1 + seed) * Math.cos(z * 4.7 + seed * 1.7) * Math.sin(y * 5.3 + seed * 0.6);
  const b = Math.sin(x * 11.3 - seed) * Math.sin(y * 12.1 + seed) * Math.cos(z * 10.7);
  const c = Math.sin(x * 23 + y * 19 + z * 21 + seed);
  return a * 0.05 + b * 0.035 + c * 0.022;
}

/** A hedge from `from` to `to` on the floor, `height` tall and `depth` through. */
export function hedge(from: V3, to: V3, height: number, depth: number, seed: number): BufferGeometry {
  const length = Math.hypot(to[0] - from[0], to[2] - from[2]);
  const ball = new SphereGeometry(1, Math.max(32, Math.round(length * 26)), 18);
  const position = ball.getAttribute("position");
  // A squared-off ball: `power` under 1 pushes its faces flat and leaves soft corners.
  const power = 0.28;
  const squared = (v: number) => Math.sign(v) * Math.abs(v) ** power;
  for (let i = 0; i < position.count; i++) {
    const x = squared(position.getX(i)) * (length / 2);
    const y = squared(position.getY(i)) * (height / 2);
    const z = squared(position.getZ(i)) * (depth / 2);
    const out = 1 + lumps(x, y, z, seed);
    position.setXYZ(i, x * out, (y + height / 2) * (y < -height * 0.45 ? 1 : out), z * out);
  }
  ball.computeVertexNormals();
  const angle = Math.atan2(-(to[2] - from[2]), to[0] - from[0]);
  ball.rotateY(angle);
  ball.translate((from[0] + to[0]) / 2, from[1], (from[2] + to[2]) / 2);
  return prep(ball);
}
