import type { RoomText } from "./types";

/**
 * Region 1's secret room, *Why 48 bits?* (floors/floor-2.md: written out with Region 1's polish pass,
 * decision 0065). Found after the region's grand boss: a narrow door in the old corridor.
 */
export const why48Bits: RoomText = {
  title: "Why 48 Bits?",
  mission: "Behind a narrow door in the corridor, one machine still wears its maker's name. Get it to answer you.",
  access: { relic: "Sealed. It answers what's sent to it, by name." },
  notes: ["Found a door down here that nobody named by hand. Its name doesn't start with 02. Somebody made this one."],
  hints: [
    { text: "You don't know its name yet. How did you learn quill's?" },
    { text: "Call everyone out of the door the relic is behind, then read who answered." },
    {
      text: "Not every door's name starts with 02: some names were burned in by whoever made the door.",
      codex: "makers-mark",
    },
    { text: "Send to everyone out of eth1, read the answer's from, then send a frame to that name." },
    {
      text: "Send to `ff:ff:ff:ff:ff:ff` out of eth1. The relic answers from `00:1b:21:3a:4f:9c`. Send a frame to that name, and it answers with the key.",
    },
  ],
  detectors: {
    "guessed-02": {
      note: "Every name you've met so far starts with 02. Who says this one does?",
      tried: "You guessed a name starting with 02, like every door you'd met; this one was made elsewhere.",
    },
  },
  debrief: {
    happened:
      "A door's name is 48 bits long: six pairs, each pair 8 bits, enough names for every door ever made. The first three pairs say who made the door (00:1b:21 is one maker's mark); the last three are that door's own number. One bit in the very first pair says whether a person chose the name: that's why every name in these halls starts with 02. The relic's name was the factory's.",
    terms: [],
  },
  guardian: [
    {
      q: "Who made this door?",
      a: "Not the weavers. Someone far away, who made many doors and burned their mark into each one.",
    },
    {
      q: "Why do our names start with 02?",
      a: "The weavers chose them by hand. That little 02 says so, to anyone who reads it.",
    },
  ],
};
