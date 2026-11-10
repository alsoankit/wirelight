import type { Topology } from "@wirelight/sim";
import { palaceMap } from "../world/room/palaceMap";

export type Node = { id: string; x: number; y: number; kind: "you" | "switch" | "router" | "house" };
type Pt = { x: number; y: number };
/** A cable on the Map: an elbow from the left room to the right room, `aDevice` at points[0]. */
export type Path = { aDevice: string; points: Pt[] };

/** The full map's size, in its own units (the SVG scales to fit). */
export const MAP_W = 900;
export const MAP_H = 520;

/**
 * The floor as a flat 2D diagram (owner, 2026-11-10: "let it be flat 2D so that we can easily get the
 * idea of topology"), on the true layout's grid (world/room/palaceMap.ts, 0120): one column right per
 * cable from a back-wall door, rows top to bottom, fitted to `w` × `h`. A cable leaves its left room on
 * the right and enters its right room on the left, as an elbow, each end offset by where its door sits
 * along the wall (nearer the corner = higher), so twin cables stay apart.
 */
export function project(t: Topology, start: string, w: number, h: number) {
  const map = palaceMap(t, start);
  // Undo the diagonal: across = columns, down = rows (no camera squash).
  const flat = (p: { x: number; z: number }): Pt => ({ x: (p.x - p.z) * Math.SQRT1_2, y: (p.x + p.z) * Math.SQRT1_2 });
  const centres = new Map([...map.rooms].map(([id, r]) => [id, flat(r.centre)]));
  const all = [...centres.values()];
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxY = Math.max(...all.map((p) => p.y));
  const pad = Math.min(w, h) * 0.16;
  const sx = (w - 2 * pad) / (maxX - minX || 1);
  const sy = (h - 2 * pad) / (maxY - minY || 1);
  const scale = Math.min(sx, sy * 1.6);
  const ox = (w - (maxX - minX) * scale) / 2 - minX * scale;
  const yScale = Math.min(sy, scale);
  const oy = (h - (maxY - minY) * yScale) / 2 - minY * yScale;
  const fit = (p: Pt): Pt => ({ x: p.x * scale + ox, y: p.y * yScale + oy });

  const nodes = new Map<string, Node>();
  for (const [id, c] of centres) {
    const spec = t.devices.find((d) => d.id === id);
    const kind =
      id === start ? "you" : spec?.bridges?.length ? "switch" : (spec?.interfaces.length ?? 0) > 1 ? "router" : "house";
    nodes.set(id, { id, kind, ...fit(c) });
  }
  const r = Math.min(w, h) * 0.045;
  const paths = new Map<string, Path>();
  for (const [id, c] of map.cables) {
    const A = nodes.get(c.a);
    const B = nodes.get(c.b);
    const ra = map.rooms.get(c.a)?.centre;
    const rb = map.rooms.get(c.b)?.centre;
    const [pa, , pb] = c.points;
    if (!A || !B || !ra || !rb || !pa || !pb) continue;
    // Where each door sits along its wall (−3 … 3), as a small offset up or down.
    const offA = (pa.x - ra.x) * r * 0.22;
    const offB = (pb.z - rb.z) * r * 0.22;
    const a = { x: A.x + r, y: A.y + offA };
    const b = { x: B.x - r, y: B.y + offB };
    const mid = (a.x + b.x) / 2;
    paths.set(id, { aDevice: c.a, points: [a, { x: mid, y: a.y }, { x: mid, y: b.y }, b] });
  }
  return { nodes, paths, scale };
}

/** Where each machine sits on the Map (its room's centre). */
export function layout(t: Topology, start: string, w: number, h: number): Map<string, Node> {
  return project(t, start, w, h).nodes;
}
