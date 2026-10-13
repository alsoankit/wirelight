import { floor5, placeToLive, quietStreet, rollCall, whereNotWho } from "./floor5";
import { floor6, insideTheEnvelope, mixedUpLetters, twoOfMe, whoHasThisAddress } from "./floor6";
import { askForAnAddress, census, floor7, sameStreet } from "./floor7";
import { binaryBehind24 } from "./secrets3";
import type { FloorText, RoomText } from "./types";

export { REGION_3_ARRIVAL } from "./floor5";

/** Region 3's room text, by room id, and its floors' text, by floor number. */
export const region3Texts: Record<string, RoomText> = {
  "f5.where-not-who": whereNotWho,
  "f5.place-to-live": placeToLive,
  "f5.roll-call": rollCall,
  "f5.boss-quiet-street": quietStreet,
  "f6.inside-the-envelope": insideTheEnvelope,
  "f6.who-has-this-address": whoHasThisAddress,
  "f6.two-of-me": twoOfMe,
  "f6.boss-mixed-up-letters": mixedUpLetters,
  "f7.same-street": sameStreet,
  "f7.ask-for-an-address": askForAnAddress,
  "f7.boss-census": census,
  "f7.secret-binary": binaryBehind24,
};
export const region3FloorTexts: Record<number, FloorText> = { 5: floor5, 6: floor6, 7: floor7 };
