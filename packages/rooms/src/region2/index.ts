import { defineFloor, type FloorDef, type RoomDef } from "../types";
import { busyHall, findEveryone, keepersMemory, manyDoors } from "./floor3";
import { peacekeeper, pinnedMemory, spareCable, storm, whoHasTheKey } from "./floor4";

/** Region 2's rooms in play order (Floors 3 and 4), and its floors. */
export const region2Rooms: RoomDef[] = [
  manyDoors,
  keepersMemory,
  findEveryone,
  busyHall,
  pinnedMemory,
  whoHasTheKey,
  spareCable,
  storm,
  peacekeeper,
];

export const region2Floors: FloorDef[] = [
  defineFloor({
    floor: 3,
    region: 2,
    content: "3",
    rooms: ["f3.many-doors", "f3.keepers-memory", "f3.find-everyone", "f3.boss-busy-hall"],
    boss: "f3.boss-busy-hall",
    journalRoom: "f3.keepers-memory",
  }),
  defineFloor({
    floor: 4,
    region: 2,
    content: "4",
    rooms: ["f4.pinned-memory", "f4.who-has-the-key", "f4.spare-cable", "f4.boss-storm"],
    boss: "f4.boss-storm",
    // floor-4.md: "in the restored storm hall (glows after the win)".
    journalRoom: "f4.boss-storm",
    // floor-4.md: "after the storm, a small door appears in the wall where span-2 used to run".
    secret: "f4.secret-peacekeeper",
  }),
];
