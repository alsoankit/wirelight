import type { Topology } from "@wirelight/sim";
import { depthsFrom } from "../world/room/doorSides";

export type Node = { id: string; x: number; y: number; kind: "you" | "switch" | "router" | "house" };

/** The full map's size, in its own units (the SVG scales to fit). */
export const MAP_W = 900;
export const MAP_H = 520;

/** Lays the floor out in columns by distance from the player's machine (a breadth-first walk). */
export function layout(t: Topology, start: string, w: number, h: number): Map<string, Node> {
  const depth = depthsFrom(t, start);
  const columns = Math.max(...depth.values()) + 1;
  const byColumn = new Map<number, string[]>();
  for (const d of t.devices) byColumn.set(depth.get(d.id) ?? 0, [...(byColumn.get(depth.get(d.id) ?? 0) ?? []), d.id]);
  const out = new Map<string, Node>();
  for (const [c, ids] of byColumn)
    ids.forEach((id, i) => {
      const spec = t.devices.find((d) => d.id === id);
      const kind =
        id === start
          ? "you"
          : spec?.bridges?.length
            ? "switch"
            : (spec?.interfaces.length ?? 0) > 1
              ? "router"
              : "house";
      out.set(id, { id, kind, x: ((c + 0.5) / columns) * w, y: ((i + 1) / (ids.length + 1)) * h });
    });
  return out;
}
