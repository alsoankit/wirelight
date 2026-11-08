import type { RoomDef } from "@wirelight/rooms";
import { layout, MAP_H, MAP_W } from "../../play/mapLayout";

const PLATFORM = 5;

export type Spot = { id: string; at: [number, number]; kind: string };

/** Positions the diorama from the floor Map's layout, with enough room for each platform and cable. */
export function networkSpots(room: RoomDef): Map<string, Spot> {
  const nodes = layout(room.topology, room.playerDevice, MAP_W, MAP_H);
  const columns = new Set([...nodes.values()].map((n) => n.x)).size;
  const tallest = Math.max(
    ...[...new Set([...nodes.values()].map((n) => n.x))].map(
      (x) => [...nodes.values()].filter((n) => n.x === x).length,
    ),
  );
  const across = (PLATFORM + 5) / (MAP_W / columns);
  const deep = (PLATFORM + 1.4) / (MAP_H / (tallest + 1));
  const out = new Map<string, Spot>();
  for (const n of nodes.values())
    out.set(n.id, { id: n.id, kind: n.kind, at: [(n.x - MAP_W / 2) * across, (n.y - MAP_H / 2) * deep] });
  return out;
}
