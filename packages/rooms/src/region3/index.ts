import { defineFloor, type FloorDef, type RoomDef } from "../types";
import { placeToLive, quietStreet, rollCall, whereNotWho } from "./floor5";
import { insideTheEnvelope, mixedUpLetters, twoOfMe, whoHasThisAddress } from "./floor6";
import { askForAnAddress, census, sameStreet } from "./floor7";

/** Region 3's rooms in play order: Floors 5, 6 and 7 (the Lantern Town). */
export const region3Rooms: RoomDef[] = [
  whereNotWho,
  placeToLive,
  rollCall,
  quietStreet,
  insideTheEnvelope,
  whoHasThisAddress,
  twoOfMe,
  mixedUpLetters,
  sameStreet,
  askForAnAddress,
  census,
];

/** Region 3's floors (ROOM-09). Its secret room, *The Binary Behind /24*, comes with the polish pass. */
export const region3Floors: FloorDef[] = [
  defineFloor({
    floor: 5,
    region: 3,
    content: "5",
    rooms: ["f5.where-not-who", "f5.place-to-live", "f5.roll-call", "f5.boss-quiet-street"],
    boss: "f5.boss-quiet-street",
    // Journal page 5 is on the square's notice board in 5.2.
    journalRoom: "f5.place-to-live",
  }),
  defineFloor({
    floor: 6,
    region: 3,
    content: "6",
    rooms: ["f6.inside-the-envelope", "f6.who-has-this-address", "f6.two-of-me", "f6.boss-mixed-up-letters"],
    boss: "f6.boss-mixed-up-letters",
    // Journal page 6 is tucked into the Slate's cover in 6.2.
    journalRoom: "f6.who-has-this-address",
  }),
  defineFloor({
    floor: 7,
    region: 3,
    content: "7",
    rooms: ["f7.same-street", "f7.ask-for-an-address", "f7.boss-census"],
    boss: "f7.boss-census",
    // Journal page 7 is in the registry's room in 7.2.
    journalRoom: "f7.ask-for-an-address",
  }),
];
