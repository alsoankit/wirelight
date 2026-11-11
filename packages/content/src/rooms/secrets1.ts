import type { RoomText } from "./types";

/**
 * Region 1's secret room, *Why 48 bits?* (floors/floor-2.md: written out with Region 1's polish pass,
 * decision 0065). Found after the region's grand boss: a narrow door in the old corridor.
 */
export const why48Bits: RoomText = {
  title: "Why 48 Bits?",
  mission: "Behind a narrow door is a machine whose door name wasn't set by hand. Get it to answer you.",
  access: { vault: "Sealed. It answers what's sent to it, by name." },
  notes: ["Found a door out here that nobody named by hand. Its name doesn't start with 02. A factory made this one."],
  hints: [
    {
      text: "You don't know its name yet. Learn it the way you learned library's: get it to answer, then read who the answer is from.",
    },
    { text: "Call everyone out of the door the vault is behind, then read who answered." },
    {
      text: "Not every MAC address starts with 02: some were burned in by whoever made the door.",
      codex: "makers-mark",
    },
    { text: "Send a broadcast out of eth1, read the answer's from, then send a frame to that MAC address." },
    {
      text: "Send to `ff:ff:ff:ff:ff:ff` out of eth1. The vault answers from `00:1b:21:3a:4f:9c`. Send a frame to that name, and it answers.",
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
      "A MAC address is 48 bits long. A bit is one tiny light, on or off: each pair in the address is 8 of them, and six pairs make 48, enough addresses for every door ever made. The first three pairs say who made the door (00:1b:21 is one maker's mark); the last three are that door's own number. Addresses starting with 02 were set by hand.",
    terms: [],
  },
  questions: [
    {
      q: "Who made this door?",
      a: "A factory. Factories burn a name into every door they make, and part of it says which factory.",
    },
    {
      q: "Why do our names start with 02?",
      a: "They were chosen by hand. That 02 says so, to anyone who reads it.",
    },
  ],
};
