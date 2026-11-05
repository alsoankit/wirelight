/**
 * The way in (gameplay/onboarding.md): the landing page, the short tour, and switching on the message view.
 * Plain modern voice (D2). The tour explains the game, never a networking idea (P-9).
 */

/** The landing page (ONB-01..04, 0010, 0044). It says plainly that Wirelight teaches networking. */
export const landing = {
  name: "Wirelight",
  headline: "Learn how computer networks really work, by bringing one back to life.",
  facts: ["Real Linux commands", "No experience needed", "Free, in your browser"],
  explore: "Enter the palace",
  /** Returning players: `Continue: <room title>` (0044). */
  continuePrefix: "Continue",
  /** A link to a room: `Play <room title>` (0044). */
  playPrefix: "Play",
  skip: "Skip intro",
  /** On a phone or a tablet without a keyboard: what Wirelight needs, in place of the way in. */
  phone: {
    title: "Made for a computer",
    body: "Wirelight is played with a keyboard on a bigger screen: you type real commands and watch the messages move through the rooms. Open this page on a laptop or desktop computer to play.",
  },
  enter: "Enter",
  enterHint: "to begin",
  more: "How it works",
  how: {
    title: "How it works",
    steps: [
      {
        title: "A network in ruins",
        body: "You're a repair robot, waking up inside a ruined palace, the Palace of a Thousand Doors. It is really a computer network: rooms are machines, doors are where cables plug in, and corridors are the cables.",
      },
      {
        title: "Watch the messages",
        body: "You can see every message as a small light moving through the rooms. Catch one and open it to read what's inside.",
      },
      {
        title: "Fix it for real",
        body: "Each room is broken in a way real networks break. You fix it with the same commands people use on real Linux machines, and the room comes back to life.",
      },
    ],
  },
  learn: {
    title: "What you'll learn",
    intro: "Each part of the palace teaches one part of how networks work, from the very beginning.",
    regions: [
      {
        name: "The Overgrown Halls",
        body: "Machines, cables and messages. How a message finds the right machine on a wire.",
      },
      { name: "The Sorting Works", body: "Switches: how many machines share one network, and what goes wrong." },
      { name: "The Lantern Town", body: "IP addresses, ping, and how machines get their addresses." },
      { name: "The Cathedral of Crossings", body: "Routers: how messages cross from one network to another." },
      {
        name: "And further in",
        body: "Ports, connections, names and the web, and the edges of the network. More floors are on the way.",
      },
    ],
  },
  closing: "No score, no timer and no way to lose. Trying things is how you learn here.",
};

/** The opening (0114): the robot switching back on, a few system lines before the first room. */
export const boot = {
  title: "Repair unit · starting up",
  lines: [
    { label: "Power", state: "restored", tone: "ok" },
    { label: "Motors", state: "ok", tone: "ok" },
    { label: "Memory", state: "damaged", tone: "warn" },
    { label: "Message view", state: "off", tone: "warn" },
    { label: "Terminal", state: "offline", tone: "warn" },
  ],
  skip: "Press any key to skip",
} as const;

/** What a tour card spotlights on the real screen. */
export type TourTarget = "door" | "notes" | "plate" | "map" | "menu";

export interface TourCard {
  title: string;
  body: string;
  /** Dimmed screen, this thing lit and pulsing. The card sits beside it. */
  target?: TourTarget;
}

export const tour = {
  cards: [
    {
      title: "Click anything",
      body: "Every room is a machine, and every door is where a cable plugs in. Click anything to look at it closely, like this plate. [[Esc]] steps back. Nothing breaks for good, and there's no timer.",
      target: "plate",
    },
    {
      title: "Memory fragments",
      body: "Most of your memory went when you shut down. This room, the observatory, is where you woke up. When you're stuck, recall a memory fragment: each one is a hint.",
      target: "notes",
    },
    {
      title: "The Map",
      body: "This is the Map, a live view of the whole floor. Open it any time with [[G]] or a click.",
      target: "map",
    },
  ] satisfies TourCard[],
  next: "Next",
  back: "Back",
  enter: "Enter the palace",
  fullGuide: "View full Field Guide",
  skip: "Skip intro",
  dontShow: "Don't show this again",
};

/** Choosing your path (ONB-11..13, 0009): asked once, right after the gift of sight. */
export const pathChoice = {
  options: [
    { id: "new", title: "New to networking", line: "I'm curious but know nothing." },
    { id: "little", title: "Know a little", line: "I've heard of IP addresses and routers." },
    { id: "networking", title: "Know networking", line: "I'm comfortable with the concepts." },
  ],
  suggested: "Suggested",
  note: "You can change this anytime in Settings.",
} as const;

/** The gift of sight (ONB-08..10): its spoken lines are the Prologue's voice lines P-GIFT-01…04. */
export const sightGift = { accept: "Switch on message view" };
