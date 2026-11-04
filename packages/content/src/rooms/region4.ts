import { acrossTheStreet, closedCrossing, directions, floor8, noWayBack, otherStreet, sleepingKeeper } from "./floor8";
import { floor9, oneStepOnly, roundAndRound, showTheWay, theCrossing, twoEnvelopes } from "./floor9";
import { insideYourHomeRouter } from "./secrets4";
import type { FloorText, RoomText } from "./types";

/** Region 4's room text, by room id, and its floors' text, by floor number. */
export const region4Texts: Record<string, RoomText> = {
  "f8.other-street": otherStreet,
  "f8.across-the-street": acrossTheStreet,
  "f8.directions": directions,
  "f8.no-way-back": noWayBack,
  "f8.sleeping-keeper": sleepingKeeper,
  "f8.boss-closed-crossing": closedCrossing,
  "f9.two-envelopes": twoEnvelopes,
  "f9.show-the-way": showTheWay,
  "f9.one-step-only": oneStepOnly,
  "f9.round-and-round": roundAndRound,
  "f9.boss-crossing": theCrossing,
  "f9.secret-home-router": insideYourHomeRouter,
};
export const region4FloorTexts: Record<number, FloorText> = { 8: floor8, 9: floor9 };

type Line = { id: string; speaker: string; text: string };

/**
 * Arriving in Region 4 (floors/floor-8.md): a vast, quiet cathedral of pale stone; a tall winged
 * statue turns its head as you enter. Short, calm sentences, never unkind.
 */
export const region4Arrival: { speaker: string; lines: Line[] } = {
  speaker: "you",
  lines: [
    { id: "R4-ARRIVE-01", speaker: "You", text: "Up through the town, and into the cathedral." },
    {
      id: "R4-ARRIVE-02",
      speaker: "You",
      text: "This is where the streets meet: the crossings. Or where they used to.",
    },
    {
      id: "R4-ARRIVE-03",
      speaker: "You",
      text: "If streets can't reach each other, the whole palace is just islands. Let's open the way.",
    },
  ],
};

/** The first release's ending (floors/floor-9.md, END1, 0014): after 9.B's floor memory. */
export const firstReleaseEnding: {
  lines: Line[];
  card: { text: string; continue: string; next: string };
} = {
  lines: [
    { id: "END1-01", speaker: "You", text: "There it is: light all the way up to the high window." },
    { id: "END1-02", speaker: "You", text: "When I shut down, I couldn't fix this. Now I have." },
    { id: "END1-03", speaker: "You", text: "Every machine from the gardens to the cathedral is talking again." },
    {
      id: "END1-04",
      speaker: "You",
      text: "My old logs stop at the foot of the stair. That's where I'm going next.",
    },
  ],
  card: {
    text: "You've restored the first four regions of the palace.",
    continue: "Continue exploring",
    next: "What's next",
  },
};
