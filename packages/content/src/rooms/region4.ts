import { acrossTheStreet, closedCrossing, directions, floor8, noWayBack, otherStreet, sleepingKeeper } from "./floor8";
import { floor9, oneStepOnly, roundAndRound, showTheWay, theCrossing, twoEnvelopes } from "./floor9";
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
};
export const region4FloorTexts: Record<number, FloorText> = { 8: floor8, 9: floor9 };

type Line = { id: string; speaker: string; text: string };

/**
 * Arriving in Region 4 (floors/floor-8.md): a vast, quiet cathedral of pale stone; the stone warden,
 * a tall winged statue, turns its head as you enter. Short, calm sentences, never unkind.
 */
export const region4Arrival: { guardian: string; lines: Line[] } = {
  guardian: "stone warden",
  lines: [
    { id: "R4-ARRIVE-01", speaker: "stone warden", text: "…You came down through the town." },
    { id: "R4-ARRIVE-02", speaker: "stone warden", text: "I keep the crossings. Streets meet here. Or they did." },
    {
      id: "R4-ARRIVE-03",
      speaker: "stone warden",
      text: "I don't remember how. I remember that it mattered more than anything.",
    },
  ],
};

/** The first release's ending (floors/floor-9.md, END1, 0014): after 9.B's floor memory. */
export const firstReleaseEnding: {
  lines: Line[];
  card: { text: string; continue: string; next: string };
} = {
  lines: [
    { id: "END1-01", speaker: "stone warden", text: "There it is. I remember now." },
    { id: "END1-02", speaker: "stone warden", text: "Thank you." },
    { id: "END1-03", speaker: "moss spirit", text: "You answered us all." },
    {
      id: "END1-04",
      speaker: "Knight",
      text: "If you've read this far, you've done more than I did. I'm further down. Come and find me.",
    },
  ],
  card: {
    text: "You've restored the first four regions of the Deep Network.",
    continue: "Continue exploring",
    next: "What's next",
  },
};
