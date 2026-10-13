import { defineFloor, type FloorDef, type RoomDef } from "../types";
import { bothEnds, darkCorridor, looseCable, twoRooms } from "./floor1";
import { firstLight, lightsOut, silentLine, whoAreYou, wrongName } from "./floor2";
import { firstMessage } from "./prologue";

/** Region 1's rooms in play order: the Prologue, then Floors 1 and 2. */
export const region1Rooms: RoomDef[] = [
  firstMessage,
  twoRooms,
  looseCable,
  bothEnds,
  darkCorridor,
  firstLight,
  wrongName,
  whoAreYou,
  lightsOut,
  silentLine,
];

/** Region 1's floors (ROOM-09). The Prologue is floor 0 and has none. */
export const region1Floors: FloorDef[] = [
  defineFloor({
    floor: 1,
    region: 1,
    content: "1",
    rooms: ["f1.two-rooms", "f1.loose-cable", "f1.both-ends", "f1.boss-dark-corridor"],
    boss: "f1.boss-dark-corridor",
    journalRoom: "f1.loose-cable",
  }),
  defineFloor({
    floor: 2,
    region: 1,
    content: "2",
    rooms: ["f2.first-light", "f2.wrong-name", "f2.who-are-you", "f2.lights-out", "f2.boss-silent-line"],
    boss: "f2.boss-silent-line",
    journalRoom: "f2.who-are-you",
  }),
];
