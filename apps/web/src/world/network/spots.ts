import type { RoomDef } from "@wirelight/rooms";
import { layout, MAP_H, MAP_W } from "../../play/mapLayout";
import { palaceMap } from "../room/palaceMap";

/** The diorama's scale: each room is drawn at this fraction of its size (Platform's model scale). */
export const PALACE_SCALE = 0.42;

export type Spot = { id: string; at: [number, number]; kind: string };
/** A cable in the diorama: its L from the left room's door to the right room's (`a` at points[0]). */
export type Run = { a: string; points: [number, number][] };

/** Each machine where its room really lies (world/room/palaceMap.ts, 0120), at the diorama's scale. */
export function networkSpots(room: RoomDef): Map<string, Spot> {
  const map = palaceMap(room.topology, room.playerDevice);
  const kinds = layout(room.topology, room.playerDevice, MAP_W, MAP_H);
  const out = new Map<string, Spot>();
  for (const [id, r] of map.rooms)
    out.set(id, {
      id,
      kind: kinds.get(id)?.kind ?? "house",
      at: [r.centre.x * PALACE_SCALE, r.centre.z * PALACE_SCALE],
    });
  return out;
}

/** Each cable's L, door to door, at the diorama's scale. */
export function networkRuns(room: RoomDef): Map<string, Run> {
  const map = palaceMap(room.topology, room.playerDevice);
  const out = new Map<string, Run>();
  for (const [id, c] of map.cables)
    out.set(id, { a: c.a, points: c.points.map((p) => [p.x * PALACE_SCALE, p.z * PALACE_SCALE]) });
  return out;
}
