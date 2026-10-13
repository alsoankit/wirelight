import { BufferAttribute, BufferGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { noise3 } from "./bake";

// A ruined stone floor made in code (0053), laid the way old dungeon floors are: rows of large
// flagstones with tight dark joints (owner: no wide gaps, no mosaic). Each slab has crisp flat faces
// and a small bevel; corners chipped; a few have sunk or tilted, a few are worn pale in patches, about
// one in five is cracked across (freehand, clearly visible), one or two are gone and earth shows.
// Dark earth fills the joints (makeEarth). A few hundred faces in all. Deterministic (seeded). World space,
// centred on the origin; `ageing` attribute (darkening, moss) for the baked stone material.

type Point = [number, number];

type FloorOptions = {
  size: number; // metres (square)
  seed: number;
  gap?: number; // metres between slabs (the joint)
  missing?: number; // share of slabs that are gone
  cracked?: number; // share of slabs cracked across
  keep?: (x: number, z: number) => boolean; // only slabs whose centre passes (a path instead of a floor)
  course?: [number, number]; // row depth range, metres (default 0.7–1.15: big flagstones)
  slab?: [number, number]; // slab length range, metres (default 0.7–1.5)
  long?: number; // share of extra-long slabs (default 0.15)
  chipped?: number; // share of corners chipped (default 0.25)
  sunk?: number; // share of slabs sunk or tilted (default 0.12)
  bevel?: number; // metres (default 0.035)
};

// Each region's floor (art briefs): Region 1 big flagstones; the Works' slate laid in neat rows of
// long slabs; the Lantern Town's small cobbled setts; the Cathedral's great dressed squares.
export const FLOORS: Record<1 | 2 | 3 | 4, Omit<FloorOptions, "size" | "seed">> = {
  1: {},
  2: {
    course: [0.55, 0.7],
    slab: [1.0, 1.5],
    long: 0.1,
    chipped: 0.12,
    cracked: 0.08,
    sunk: 0.05,
    missing: 0.015,
    bevel: 0.02,
    gap: 0.012,
  },
  3: {
    course: [0.32, 0.42],
    slab: [0.32, 0.5],
    long: 0.05,
    chipped: 0.3,
    cracked: 0.04,
    sunk: 0.15,
    missing: 0.02,
    bevel: 0.03,
    gap: 0.02,
  },
  4: {
    // Great dressed slabs, but laid in courses of different depths with staggered joints (one big
    // even grid read as tiles).
    course: [0.85, 1.3],
    slab: [0.9, 1.6],
    long: 0.2,
    chipped: 0.15,
    cracked: 0.12,
    sunk: 0.06,
    missing: 0.01,
    bevel: 0.03,
    gap: 0.014,
  },
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

type Stone = {
  outline: Point[];
  height: (x: number, z: number) => number;
  shade: number;
  convex: Point[]; // the stone's clean outline (the bevel and the cracks stay inside it)
  cracks: { line: Point[]; width: number }[]; // freehand cracks across the top
};

function insideConvex(polygon: Point[], p: Point): boolean {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i] as Point;
    const b = polygon[(i + 1) % polygon.length] as Point;
    if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) < 0) return false;
  }
  return true;
}

// A crack that wanders across a stone: from near one edge toward the far side, each step turning a
// little, stopping before it reaches the edge. Sometimes a short branch splits off.
function freehandCracks(outline: Point[], random: () => number): Point[][] {
  // Real cracks run across a slab, often from edge to edge: they may come within 2 cm of the edges.
  const safe = inset(outline, 0.02);
  if (safe.length < 3) return [];
  const [cx, cz] = centroid(outline);
  const a = outline[Math.floor(random() * outline.length)] as Point;
  const b = outline[(outline.indexOf(a) + 1) % outline.length] as Point;
  const along = 0.2 + random() * 0.6; // somewhere along one edge…
  const edge: Point = [a[0] + (b[0] - a[0]) * along, a[1] + (b[1] - a[1]) * along];
  const from: Point = [edge[0] + (cx - edge[0]) * 0.04, edge[1] + (cz - edge[1]) * 0.04];
  const walk = (begin: Point, heading: number, steps: number, stepLength: number): Point[] => {
    const line: Point[] = [begin];
    let [x, z] = begin;
    let angle = heading;
    for (let i = 0; i < steps; i++) {
      angle += (random() - 0.5) * 0.75;
      const next: Point = [x + Math.cos(angle) * stepLength, z + Math.sin(angle) * stepLength];
      if (!insideConvex(safe, next)) break;
      line.push(next);
      [x, z] = next;
    }
    return line;
  };
  const heading = Math.atan2(cz - from[1], cx - from[0]);
  const span = Math.hypot(cx - from[0], cz - from[1]) * 2.2; // …across to the far side
  const main = walk(from, heading, 16, span / 16);
  const cracks = main.length > 2 ? [main] : [];
  if (main.length > 5 && random() < 0.45) {
    const fork = main[Math.floor(main.length / 2)] as Point;
    const branch = walk(fork, heading + (random() < 0.5 ? 1 : -1) * (0.7 + random() * 0.5), 6, span / 16);
    if (branch.length > 2) cracks.push(branch);
  }
  return cracks;
}

// One stone as triangles: a bevelled top (inner face and a sloped rim) and sides down into the earth.
function stoneGeometry({ outline, convex, height, shade, cracks }: Stone, bevelBy = 0.035): BufferGeometry {
  const bevel = inset(convex, bevelBy);
  const positions: number[] = [];
  const ageing: number[] = [];
  const push = (x: number, y: number, z: number, dark: number) => {
    positions.push(x, y, z);
    // Worn, faded patches: lighter and dustier, where feet and centuries wore the stone smooth.
    const worn = smoothstep01(0.1, 0.45, noise3(x * 0.55 + 11, 3, z * 0.55 + 11));
    const moss = Math.max(0, noise3(x * 1.7 + 4, 0, z * 1.7 + 4)) * 0.45 * (1 - worn);
    ageing.push((0.9 + shade + worn * 0.2 + noise3(x * 4, 1, z * 4) * 0.05) * dark, moss);
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
  // The cracks: thin dark strips just above the face, tapering at both ends (a few dozen triangles).
  for (const { line, width } of cracks) {
    for (let i = 0; i < line.length - 1; i++) {
      const p0 = line[i] as Point;
      const p1 = line[i + 1] as Point;
      const dx = p1[0] - p0[0];
      const dz = p1[1] - p0[1];
      const len = Math.hypot(dx, dz) || 1;
      const px = -dz / len;
      const pz = dx / len;
      const w0 = (0.004 + 0.012 * Math.sin((Math.PI * i) / (line.length - 1))) * width;
      const w1 = (0.004 + 0.012 * Math.sin((Math.PI * (i + 1)) / (line.length - 1))) * width;
      const y0 = height(p0[0], p0[1]) + 0.004;
      const y1 = height(p1[0], p1[1]) + 0.004;
      const l0: [number, number, number] = [p0[0] + px * w0, y0, p0[1] + pz * w0];
      const r0: [number, number, number] = [p0[0] - px * w0, y0, p0[1] - pz * w0];
      const l1: [number, number, number] = [p1[0] + px * w1, y1, p1[1] + pz * w1];
      const r1: [number, number, number] = [p1[0] - px * w1, y1, p1[1] - pz * w1];
      for (const v of [l0, r1, r0, l0, l1, r1]) {
        positions.push(v[0], v[1], v[2]);
        ageing.push(width > 1.4 ? 0.12 : 0.24, 0.25); // thick cracks are deeper, darker
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("ageing", new BufferAttribute(new Float32Array(ageing), 2));
  g.computeVertexNormals(); // unindexed: every face keeps its own flat normal
  return g;
}

function smoothstep01(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

// Laid like a real old floor: rows ("courses") of different depths running along x, each filled with
// slabs of different lengths, so the joints stagger. Joints are tight (about 1.5 cm). Age shows within
// that order: chipped corners, a slight sink or tilt, worn patches, a few slabs cracked across, one or
// two missing.
export function makeFlagstones({
  size,
  seed,
  gap = 0.016,
  missing = 0.03,
  cracked = 0.2,
  keep = () => true,
  course = [0.7, 1.15],
  slab = [0.7, 1.5],
  long = 0.15,
  chipped = 0.25,
  sunk: sunkShare = 0.12,
  bevel = 0.035,
}: FloorOptions): BufferGeometry {
  const random = seeded(seed);
  const half = size / 2;
  const parts: BufferGeometry[] = [];
  let z0 = -half;
  while (z0 < half - 0.05) {
    const depth = Math.min(course[0] + random() * (course[1] - course[0]), half - z0);
    const z1 = z0 + depth;
    let x0 = -half;
    while (x0 < half - 0.05) {
      const longOne = random() < long;
      const length = Math.min((longOne ? slab[1] : slab[0]) + random() * (slab[1] - slab[0]), half - x0);
      const x1 = x0 + length;
      const g = gap / 2 + random() * 0.004;
      // The slab, its corners nudged a little (no two quite square), some corners chipped off.
      const j = () => (random() - 0.5) * 0.02;
      const corners: Point[] = [
        [x0 + g + j(), z0 + g + j()],
        [x1 - g + j(), z0 + g + j()],
        [x1 - g + j(), z1 - g + j()],
        [x0 + g + j(), z1 - g + j()],
      ];
      const outline: Point[] = [];
      corners.forEach((c, k) => {
        if (random() < chipped) {
          // A chipped corner: cut it off with two points along its edges.
          const prev = corners[(k + 3) % 4] as Point;
          const next = corners[(k + 1) % 4] as Point;
          const cut = 0.03 + random() * 0.07;
          const toward = (p: Point) => {
            const len = Math.hypot(p[0] - c[0], p[1] - c[1]) || 1;
            return [c[0] + ((p[0] - c[0]) / len) * cut, c[1] + ((p[1] - c[1]) / len) * cut] as Point;
          };
          outline.push(toward(prev), toward(next));
        } else outline.push(c);
      });
      const convex = counterClockwise(outline);
      const [cx, cz] = centroid(convex);
      // A missing slab never sits in the middle of the room (it read as a black hole where the keeper
      // and the boards stand): only near the walls and edges.
      const nearEdge = Math.max(Math.abs(cx), Math.abs(cz)) > half - 1.6;
      if ((random() >= missing || !nearEdge) && keep(cx, cz)) {
        // Mostly level; now and then one has sunk or tilted.
        const sunk = random() < sunkShare ? -0.02 - random() * 0.02 : 0;
        const lift = 0.02 + (random() - 0.5) * 0.012 + sunk;
        const tiltX = (random() - 0.5) * (sunk ? 0.04 : 0.012);
        const tiltZ = (random() - 0.5) * (sunk ? 0.04 : 0.012);
        const shade = (random() - 0.5) * 0.18;
        parts.push(
          stoneGeometry(
            {
              outline: convex,
              convex,
              height: (x, z) => lift + tiltX * (x - cx) + tiltZ * (z - cz),
              shade,
              // About one slab in five is cracked across: clearly visible, sometimes branching, a few twice.
              cracks: (random() < cracked ? (random() < 0.2 ? [0, 1] : [0]) : []).flatMap(() =>
                freehandCracks(convex, random).map((line) => ({ line, width: 1.1 + random() * 1.4 })),
              ),
            },
            bevel,
          ),
        );
      }
      x0 = x1;
    }
    z0 = z1;
  }
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
