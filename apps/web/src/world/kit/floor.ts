import { BufferAttribute, BufferGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { noise3 } from "./bake";

// A ruined stone floor made in code (0053): separate flagstones, not tiles and not a smoothed grid.
// Each stone is an irregular polygon (a Voronoi cell, corners chipped, some split in two) with crisp
// flat faces, a small bevel, and its own lift and tilt; a few are missing. Dark earth shows in the
// gaps (makeEarth). A couple of thousand triangles in all. Deterministic (seeded). World space,
// centred on the origin; `ageing` attribute (darkening, moss) for the baked stone material.

type Point = [number, number];

type FloorOptions = {
  size: number; // metres (square)
  stones: number; // stones per side (roughly)
  seed: number;
  gap?: number; // metres between stones
  missing?: number; // share of stones that are gone
};

// mulberry32, as in WindDriver: deterministic, never Math.random.
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Keeps the part of a convex polygon on the side of the line where (p − origin) · normal ≤ offset.
function clip(polygon: Point[], nx: number, nz: number, offset: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i] as Point;
    const b = polygon[(i + 1) % polygon.length] as Point;
    const da = a[0] * nx + a[1] * nz - offset;
    const db = b[0] * nx + b[1] * nz - offset;
    if (da <= 0) out.push(a);
    if (da <= 0 !== db <= 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function centroid(polygon: Point[]): Point {
  let x = 0;
  let z = 0;
  for (const [px, pz] of polygon) {
    x += px;
    z += pz;
  }
  return [x / polygon.length, z / polygon.length];
}

// Shrinks a convex polygon by moving every edge inward by `by` metres.
function inset(polygon: Point[], by: number): Point[] {
  let result = polygon;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i] as Point;
    const b = polygon[(i + 1) % polygon.length] as Point;
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const len = Math.hypot(ex, ez);
    if (len < 1e-6) continue;
    // Outward normal for a counter-clockwise polygon in (x, z).
    const nx = ez / len;
    const nz = -ex / len;
    result = clip(result, nx, nz, a[0] * nx + a[1] * nz - by);
    if (result.length < 3) return result;
  }
  return result;
}

function counterClockwise(polygon: Point[]): Point[] {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i] as Point;
    const b = polygon[(i + 1) % polygon.length] as Point;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area > 0 ? polygon : [...polygon].reverse();
}

type Stone = { outline: Point[]; height: (x: number, z: number) => number; shade: number };

// One stone as triangles: a bevelled top (inner face and a sloped rim) and sides down into the earth.
function stoneGeometry({ outline, height, shade }: Stone): BufferGeometry {
  const bevel = inset(outline, 0.035);
  const positions: number[] = [];
  const ageing: number[] = [];
  const push = (x: number, y: number, z: number, dark: number) => {
    positions.push(x, y, z);
    const moss = Math.max(0, noise3(x * 1.7 + 4, 0, z * 1.7 + 4)) * 0.5;
    ageing.push((0.9 + shade + noise3(x * 4, 1, z * 4) * 0.05) * dark, moss);
  };
  const top = (p: Point, drop: number) => height(p[0], p[1]) - drop;
  // The inner face, as a fan.
  if (bevel.length >= 3) {
    const [cx, cz] = centroid(bevel);
    for (let i = 0; i < bevel.length; i++) {
      const a = bevel[i] as Point;
      const b = bevel[(i + 1) % bevel.length] as Point;
      push(cx, height(cx, cz), cz, 1);
      push(b[0], top(b, 0), b[1], 1);
      push(a[0], top(a, 0), a[1], 1);
    }
  }
  // The rim, sloping from the inner face down to the stone's edge.
  const inner = bevel.length >= 3 ? bevel : outline;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i] as Point;
    const b = outline[(i + 1) % outline.length] as Point;
    // The inner points nearest a and b (polygons differ in count after inset; use nearest).
    const near = (p: Point) =>
      inner.reduce((best, q) =>
        Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(best[0] - p[0], best[1] - p[1]) ? q : best,
      );
    const ia = near(a);
    const ib = near(b);
    // (Winding: counter-clockwise seen from outside, so faces point up and out.)
    push(a[0], top(a, 0.025), a[1], 0.85);
    push(ia[0], top(ia, 0), ia[1], 1);
    push(ib[0], top(ib, 0), ib[1], 1);
    push(a[0], top(a, 0.025), a[1], 0.85);
    push(ib[0], top(ib, 0), ib[1], 1);
    push(b[0], top(b, 0.025), b[1], 0.85);
    // The side, down into the earth.
    push(a[0], top(a, 0.025), a[1], 0.6);
    push(b[0], -0.12, b[1], 0.4);
    push(a[0], -0.12, a[1], 0.4);
    push(a[0], top(a, 0.025), a[1], 0.6);
    push(b[0], top(b, 0.025), b[1], 0.6);
    push(b[0], -0.12, b[1], 0.4);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("ageing", new BufferAttribute(new Float32Array(ageing), 2));
  g.computeVertexNormals(); // unindexed: every face keeps its own flat normal
  return g;
}

export function makeFlagstones({ size, stones, seed, gap = 0.05, missing = 0.04 }: FloorOptions): BufferGeometry {
  const random = seeded(seed);
  const half = size / 2;
  const cell = size / stones;
  const seeds: Point[] = [];
  for (let i = 0; i < stones; i++) {
    for (let j = 0; j < stones; j++) {
      seeds.push([-half + (i + 0.12 + random() * 0.76) * cell, -half + (j + 0.12 + random() * 0.76) * cell]);
    }
  }
  const square: Point[] = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
  const parts: BufferGeometry[] = [];
  seeds.forEach((s, i) => {
    // The Voronoi cell: the square, cut by the bisector with every other seed.
    let polygon = square;
    for (let k = 0; k < seeds.length; k++) {
      if (k === i) continue;
      const o = seeds[k] as Point;
      const nx = o[0] - s[0];
      const nz = o[1] - s[1];
      const offset = (nx * (o[0] + s[0])) / 2 + (nz * (o[1] + s[1])) / 2;
      polygon = clip(polygon, nx, nz, offset);
    }
    polygon = counterClockwise(polygon);
    if (random() < missing) return; // this stone is gone; earth shows
    // Some stones have cracked in two along a random line through their middle.
    const pieces: Point[][] = [];
    if (random() < 0.28) {
      const [cx, cz] = centroid(polygon);
      const angle = random() * Math.PI;
      const nx = Math.cos(angle);
      const nz = Math.sin(angle);
      const offset = cx * nx + cz * nz;
      pieces.push(clip(polygon, nx, nz, offset - gap / 2), clip(polygon, -nx, -nz, -offset - gap / 2));
    } else pieces.push(polygon);
    for (const piece of pieces) {
      let outline = inset(counterClockwise(piece), gap / 2);
      if (outline.length < 3) continue;
      // Chip a corner or two: pull them in toward the middle.
      const [cx, cz] = centroid(outline);
      outline = outline.map((p) => {
        if (random() < 0.22) {
          const t = 0.1 + random() * 0.15;
          return [p[0] + (cx - p[0]) * t, p[1] + (cz - p[1]) * t] as Point;
        }
        return p;
      });
      const lift = 0.02 + (random() - 0.5) * 0.04;
      const tiltX = (random() - 0.5) * 0.05;
      const tiltZ = (random() - 0.5) * 0.05;
      const shade = (random() - 0.5) * 0.2;
      parts.push(
        stoneGeometry({
          outline,
          height: (x, z) => lift + tiltX * (x - cx) + tiltZ * (z - cz),
          shade,
        }),
      );
    }
  });
  return mergeGeometries(parts) ?? new BufferGeometry();
}

// The earth under the stones: a dark, mossy slab that shows in the gaps and where stones are missing.
export function makeEarth(size: number): BufferGeometry {
  const half = size / 2;
  const y = -0.02;
  const bottom = -0.4;
  const corners: Point[] = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
  const positions: number[] = [];
  const ageing: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], moss: number) => {
    for (const p of [a, b, c, a, c, d]) {
      positions.push(p[0] as number, p[1] as number, p[2] as number);
      ageing.push(0.4, moss);
    }
  };
  // Top (facing up), then the four sides.
  quad([-half, y, half], [half, y, half], [half, y, -half], [-half, y, -half], 0.35);
  for (let i = 0; i < 4; i++) {
    const a = corners[i] as Point;
    const b = corners[(i + 1) % 4] as Point;
    quad([a[0], y, a[1]], [b[0], y, b[1]], [b[0], bottom, b[1]], [a[0], bottom, a[1]], 0);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("ageing", new BufferAttribute(new Float32Array(ageing), 2));
  g.computeVertexNormals();
  return g;
}
