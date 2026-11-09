import type { Topology } from "@wirelight/sim";
import { corners, onScreen, palaceMap } from "../world/room/palaceMap";

export type Node = { id: string; x: number; y: number; kind: "you" | "switch" | "router" | "house" };
type Pt = { x: number; y: number };
/** A cable on the Map: its L from the left room's door to the right room's (0120), `aDevice` at points[0]. */
export type Path = { aDevice: string; points: Pt[] };

/** The full map's size, in its own units (the SVG scales to fit). */
export const MAP_W = 900;
export const MAP_H = 520;

/**
 * The floor drawn as it really lies (decisions 0118, 0120: world/room/palaceMap.ts), from the room
 * camera's angle and fitted to `w` × `h`: rooms as their floor tiles, cables as Ls from door to door.
 */
export function project(t: Topology, start: string, w: number, h: number) {
  const map = palaceMap(t, start);
  const raw = new Map([...map.rooms].map(([id, r]) => [id, corners(r.centre).map(onScreen)]));
  const all = [...raw.values()].flat();
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxY = Math.max(...all.map((p) => p.y));
  const pad = Math.min(w, h) * 0.12;
  const scale = Math.min((w - 2 * pad) / (maxX - minX || 1), (h - 2 * pad) / (maxY - minY || 1));
  const ox = (w - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = (h - (maxY - minY) * scale) / 2 - minY * scale;
  const fit = (p: Pt): Pt => ({ x: p.x * scale + ox, y: p.y * scale + oy });

  const nodes = new Map<string, Node>();
  for (const [id, r] of map.rooms) {
    const spec = t.devices.find((d) => d.id === id);
    const kind =
      id === start ? "you" : spec?.bridges?.length ? "switch" : (spec?.interfaces.length ?? 0) > 1 ? "router" : "house";
    nodes.set(id, { id, kind, ...fit(onScreen(r.centre)) });
  }
  const tiles = new Map([...raw].map(([id, pts]) => [id, pts.map(fit)]));
  const paths = new Map<string, Path>();
  for (const [id, c] of map.cables) paths.set(id, { aDevice: c.a, points: c.points.map((p) => fit(onScreen(p))) });
  return { nodes, tiles, paths, scale };
}

/** Where each machine sits on the Map (its room's centre). */
export function layout(t: Topology, start: string, w: number, h: number): Map<string, Node> {
  return project(t, start, w, h).nodes;
}
