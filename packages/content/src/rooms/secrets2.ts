import { SEALED } from "./shared";
import type { RoomText } from "./types";

/**
 * Region 2's secret room, *The Peacekeeper* (floors/floor-4.md, decisions 0065, 0067). Found after
 * the storm: a small door in the wall where span-2 used to run.
 */
export const peacekeeper: RoomText = {
  title: "Keep the Peace",
  mission:
    "The halls are joined by two cables again, and the copies are back. Make the halls handle the second cable safely, then unplug the one in use and let the spare take over.",
  access: { pantry: SEALED, attic: SEALED, forge: SEALED, chapel: SEALED, laundry: SEALED },
  notes: [
    "Found it in the old plans: the spanning tree. The halls talk to each other and hold one door shut, so frames can't go round in a circle. Each hall turns it on for its br0, and right now it's off in both.",
  ],
  hints: [
    {
      text: "Each hall has a peacekeeper (the spanning tree), and it's off. It's a setting on br0, the bridge inside the hall that joins its doors.",
    },
    {
      text: "Switch it on in both halls with `ip link set br0 type bridge stp_state 1`, then ask a hall about its doors: `bridge link show`.",
    },
    {
      text: "With the spanning tree on, switches hold one door of every circle shut, and open it only when the other path breaks.",
      codex: "peacekeeper",
    },
    {
      text: "Find the span with a door that says blocking. Unplug the other span, speed time up, and watch the held door open.",
    },
    {
      text: 'In each hall: `ip link set br0 type bridge stp_state 1`. Span-2 goes to blocking. Unplug span (hall-a\'s eth3), speed time up for about 30 seconds until span-2 forwards, then send laundry a frame: `lab send-frame --to 02:00:00:00:00:13 --msg "hello"`.',
    },
  ],
  detectors: {
    "cut-before-peace": {
      note: "That stops the storm, but only by taking a cable away. Turn the spanning tree on in both halls first, so they can keep both cables safely.",
      tried: "You pulled a span before the halls were keeping the peace.",
    },
    "peace-in-one-hall": {
      note: "Only one hall has the spanning tree on. Both halls need it, so they can talk to each other and agree which door to hold shut.",
      tried: "You switched the peacekeeper on in one hall only.",
    },
    "cut-the-held-one": {
      note: "That span's door was already blocking, so it carried nothing. Unplug the span that's carrying the frames.",
      tried: "You pulled the span the halls were holding shut, instead of the one in use.",
    },
  },
  debrief: {
    happened:
      "Two halls can keep a spare cable safely. With the peacekeeper on (its real name is the spanning tree), the halls send each other a short note every two seconds, agree which hall is in charge, and hold shut any door that would close a circle. Span-2's door went to blocking, and the storm stopped. When you pulled span, the held door noticed at once: it listened for 15 seconds, learned names for 15 more, then opened, and laundry's answer came over the spare.",
    terms: [],
  },
  questions: [
    {
      q: "How do the halls know they're in a circle?",
      a: "They talk. Every two seconds the hall in charge sends a short note out of its doors, and the others pass it on. A hall that hears the same note by two doors knows it's standing in a circle.",
    },
    {
      q: "Who decides which door is held shut?",
      a: "They agree on one hall to be in charge: the one with the lowest number. Every other hall keeps its best door towards it open, and holds shut any door that would make a second way round.",
    },
    {
      q: "Why does the spare take so long to open?",
      a: "It listens first, then learns names, fifteen seconds each, to be sure it won't start a new circle. Better slow than another storm.",
    },
  ],
  fieldGuide: ["The peacekeeper"],
};
