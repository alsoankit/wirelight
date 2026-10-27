import { roomById, rooms } from "@wirelight/rooms";

// Which of its region's painted emblems a machine's room shows (0091; drawn by tools/art/emblems.mjs:
// twelve per region, four shapes × three motifs, field colours and divisions varied). Picked from the
// room's place in its region and the machine's place in the room, by steps that share no factor with
// twelve: neighbouring rooms differ, and so do the machines within one room.

const VARIANTS = 12;
export const EMBLEM_ASPECT = 512 / 640;

export function emblemUrl(region: number, roomId: string | null, device: string): string {
  const inRegion = rooms.filter((r) => r.region === region);
  const roomIndex = Math.max(
    0,
    inRegion.findIndex((r) => r.id === roomId),
  );
  const room = roomId ? roomById(roomId) : undefined;
  const deviceIndex = Math.max(0, room?.topology.devices.findIndex((d) => d.id === device) ?? 0);
  const variant = (roomIndex * 5 + deviceIndex * 7) % VARIANTS;
  return `/art/emblems/r${region}-${String(variant).padStart(2, "0")}.webp`;
}

// Houses and halls get theirs once their rooms are reworked (0089): placing them now would be done twice.
