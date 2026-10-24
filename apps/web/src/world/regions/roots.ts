import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Vector3 } from "three";
import { noise3 } from "../kit/bake";
import { prep, type V3 } from "../kit/shapes";

// Region 1's signature (region-1 brief: "roots grown through the walls", "low tunnels with roots
// overhead"): the roots of something vast outside, pushing in through the cracks, pouring down the
// wall faces and crawling over the floor. Made in code as tapered, slightly knotted tubes, so they
// hug the walls and floor exactly (the Stylized Nature kit has only whole trees, whose sunk crowns
// read as dead bushes: playtest). Each root carries a few thinner rootlets that leave it along the
// surface it lies on. One material ("Root"), so every root in a room is one merged mesh.
// Deterministic (seeded): the same room always grows the same roots.

/** Sides around a root: few, so a room's roots stay a few thousand triangles. */
const SIDES = 7;
/** The inner faces of the back wall (z) and the left wall (x). */
const FACE = -3.967;

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

/**
 * One root along `path`: `radius` where it comes in, narrowing to `tip` at its end, with knots
 * (the radius swells and pinches) and a slight wander. World space, unindexed (StaticRoom extras).
 */
export function root(path: V3[], radius: number, tip = 0.01, seed = 1): BufferGeometry {
  const curve = new CatmullRomCurve3(
    path.map((p) => new Vector3(...p)),
    false,
    "centripetal",
  );
  const segments = Math.max(6, Math.round(curve.getLength() * 8));
  const frames = curve.computeFrenetFrames(segments, false);
  const positions = new Float32Array((segments + 1) * SIDES * 3);
  const p = new Vector3();
  const out = new Vector3();
  let o = 0;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    const knot = 1 + 0.24 * noise3(p.x * 2.7 + seed, p.y * 2.7, p.z * 2.7 - seed);
    const r = (radius + (tip - radius) * t ** 1.3) * knot;
    const normal = frames.normals[i] as Vector3;
    const binormal = frames.binormals[i] as Vector3;
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2 + i * 0.35; // a slow twist, like grain
      // Flattened a little across the binormal: roots lying on stone spread out.
      out
        .copy(normal)
        .multiplyScalar(Math.cos(a) * r)
        .addScaledVector(binormal, Math.sin(a) * r * 0.82);
      positions[o++] = p.x + out.x;
      positions[o++] = p.y + out.y;
      positions[o++] = p.z + out.z;
    }
  }
  const index: number[] = [];
  for (let i = 0; i < segments; i++) {
    for (let k = 0; k < SIDES; k++) {
      const a = i * SIDES + k;
      const b = i * SIDES + ((k + 1) % SIDES);
      index.push(a, b, a + SIDES, b, b + SIDES, a + SIDES);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return prep(g);
}

/** Which surface a point lies on: the floor, the left wall or the back wall (its outward normal). */
function surfaceAt(p: Vector3): Vector3 {
  if (p.y < 0.35) return new Vector3(0, 1, 0);
  if (p.x < -3.55) return new Vector3(1, 0, 0);
  if (p.z < -3.55) return new Vector3(0, 0, 1);
  return new Vector3(0, 1, 0);
}

/** Moves a point back onto its surface, `lift` out from it (a rootlet lies on the stone). */
function onSurface(p: Vector3, normal: Vector3, lift: number): Vector3 {
  if (normal.y > 0.5) p.y = lift;
  else if (normal.x > 0.5) p.x = FACE + lift;
  else p.z = FACE + lift;
  p.y = Math.max(p.y, lift);
  return p;
}

export type RootRun = {
  /** Where it comes in (hidden in a crack or behind the wall) to where it ends. */
  path: V3[];
  radius: number;
  /** Strands twisted together (1: a single root). They part toward the end, where the root spreads. */
  strands?: number;
  /** Thinner rootlets leaving it along the surface it lies on. */
  rootlets?: number;
  seed: number;
};

/**
 * Strands braided around a path: each winds slowly around the centre line, close together where the
 * root comes in and parting toward its end (on the floor they stay on the floor).
 */
function braid(path: V3[], radius: number, strands: number, seed: number): BufferGeometry[] {
  const random = seeded(seed * 13 + 5);
  const curve = new CatmullRomCurve3(
    path.map((p) => new Vector3(...p)),
    false,
    "centripetal",
  );
  const length = curve.getLength();
  const samples = Math.max(8, Math.round(length * 4));
  const frames = curve.computeFrenetFrames(samples, false);
  const out: BufferGeometry[] = [];
  for (let j = 0; j < strands; j++) {
    const phase = (j / strands) * Math.PI * 2 + random() * 0.6;
    // About a third of a turn per metre: a slow braid, not a corkscrew.
    const twist = (0.28 + random() * 0.2) * length * (j % 2 === 0 ? 1 : -1);
    // The first strand is the thickest; the others a little thinner, ending a little sooner.
    const r = radius * (j === 0 ? 0.78 : 0.5 + random() * 0.2);
    const end = j === 0 ? 1 : 0.8 + random() * 0.18;
    const points: V3[] = [];
    const p = new Vector3();
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * end;
      const k = Math.min(Math.round(t * samples), samples);
      curve.getPointAt(t, p);
      const a = phase + twist * t * Math.PI * 2;
      const spread = radius * (0.55 + 1.6 * t * t);
      const n = frames.normals[k] as Vector3;
      const b = frames.binormals[k] as Vector3;
      const q = p
        .clone()
        .addScaledVector(n, Math.cos(a) * spread)
        .addScaledVector(b, Math.sin(a) * spread);
      if (p.y < 0.3) q.y = Math.max(q.y, r * 0.55, p.y);
      points.push(q.toArray() as V3);
    }
    out.push(root(points, r, 0.01, seed * 3 + j));
  }
  return out;
}

/** A root (one strand or a braid) and its rootlets. */
export function rootRun({ path, radius, strands = 1, rootlets = 0, seed }: RootRun): BufferGeometry[] {
  const random = seeded(seed);
  const parts = strands > 1 ? braid(path, radius, strands, seed) : [root(path, radius, 0.012, seed)];
  const curve = new CatmullRomCurve3(
    path.map((p) => new Vector3(...p)),
    false,
    "centripetal",
  );
  for (let i = 0; i < rootlets; i++) {
    const t = 0.35 + random() * 0.55;
    const start = curve.getPointAt(t);
    const along = curve.getTangentAt(t);
    const normal = surfaceAt(start);
    // Along the surface, turned off the root's own heading to one side or the other.
    along.addScaledVector(normal, -along.dot(normal));
    if (along.lengthSq() < 1e-4) along.set(normal.y > 0.5 ? 1 : 0, normal.y > 0.5 ? 0 : -1, 0);
    along.normalize();
    const side = new Vector3().crossVectors(normal, along);
    const turn = (0.45 + random() * 0.5) * (i % 2 === 0 ? 1 : -1);
    const heading = along.clone().multiplyScalar(Math.cos(turn)).addScaledVector(side, Math.sin(turn));
    const length = 0.45 + random() * 0.6;
    const r = radius * (0.3 + random() * 0.15) * (1 - t * 0.4);
    const mid = onSurface(
      start
        .clone()
        .addScaledVector(heading, length * 0.5)
        .addScaledVector(side, (random() - 0.5) * 0.18),
      normal,
      r * 0.7,
    );
    const end = onSurface(start.clone().addScaledVector(heading, length), normal, 0.006);
    parts.push(root([start.toArray() as V3, mid.toArray() as V3, end.toArray() as V3], r, 0.006, seed * 7 + i));
  }
  return parts;
}

/** Several runs, as one list of parts for the "Root" material. */
export function rootRuns(runs: RootRun[]): BufferGeometry[] {
  return runs.flatMap(rootRun);
}
