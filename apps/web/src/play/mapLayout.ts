import type { Topology } from "@wirelight/sim";
import { floorPlan } from "../world/room/plan";

export type Node = { id: string; x: number; y: number; kind: "you" | "switch" | "router" | "house" };

/** The full map's size, in its own units (the SVG scales to fit). */
export const MAP_W = 900;
export const MAP_H = 520;

/**
 * Lays the floor out as the rooms' doors read (decision 0118): a machine behind a back-wall door is one
 * column to the right, one behind a left-wall door one column to the left, and doors nearer the corner
 * are higher. Within a column, machines keep that order and are spread evenly.
 */
export function layout(t: Topology, start: string, w: number, h: number): Map<string, Node> {
  const plan = floorPlan(t, start);
  const byColumn = new Map<number, string[]>();
  for (const d of t.devices) {
    const c = plan.devices.get(d.id)?.column ?? 0;
    byColumn.set(c, [...(byColumn.get(c) ?? []), d.id]);
  }
  const out = new Map<string, Node>();
  for (const [c, ids] of byColumn) {
    ids.sort((a, b) => (plan.devices.get(a)?.y ?? 0) - (plan.devices.get(b)?.y ?? 0));
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
      out.set(id, { id, kind, x: ((c + 0.5) / plan.columns) * w, y: ((i + 1) / (ids.length + 1)) * h });
    });
  }
  return out;
}
