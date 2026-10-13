import { defineFloor, type FloorDef, type RoomDef } from "../types";
import { acrossTheStreet, closedCrossing, directions, noWayBack, otherStreet, sleepingKeeper } from "./floor8";
import { oneStepOnly, roundAndRound, showTheWay, theCrossing, twoEnvelopes } from "./floor9";

/** Region 4's rooms in play order: Floors 8 and 9 (the first release's last region, 0035). */
export const region4Rooms: RoomDef[] = [
  otherStreet,
  acrossTheStreet,
  directions,
  noWayBack,
  sleepingKeeper,
  closedCrossing,
  twoEnvelopes,
  showTheWay,
  oneStepOnly,
  roundAndRound,
  theCrossing,
];

/** Region 4's floors (ROOM-09). The secret room (*Inside Your Home Router*) waits for the polish pass. */
export const region4Floors: FloorDef[] = [
  defineFloor({
    floor: 8,
    region: 4,
    content: "8",
    rooms: [
      "f8.other-street",
      "f8.across-the-street",
      "f8.directions",
      "f8.no-way-back",
      "f8.sleeping-keeper",
      "f8.boss-closed-crossing",
    ],
    boss: "f8.boss-closed-crossing",
    // Journal page 8 lies on the lectern (floor-8.md 8.5).
    journalRoom: "f8.sleeping-keeper",
  }),
  defineFloor({
    floor: 9,
    region: 4,
    content: "9",
    rooms: ["f9.two-envelopes", "f9.show-the-way", "f9.one-step-only", "f9.round-and-round", "f9.boss-crossing"],
    boss: "f9.boss-crossing",
    // Journal page 9 lies on arch's lectern (floor-9.md 9.3).
    journalRoom: "f9.one-step-only",
  }),
];
