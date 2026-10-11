/**
 * The way in (DESIGN_NOTES D20): the title screen, the short tour, and the Seer's gift.
 * Plain modern voice (D2). The tour explains the game, never a networking idea (P-9).
 */

export const title = {
  name: "Wirelight",
  tagline: "A network fell silent. Bring it back.",
  explore: "Explore the dungeon",
  /** Returning players: `Continue: <room title>`. */
  continuePrefix: "Continue",
  skip: "Skip intro",
  hint: "to begin",
};

/** What a tour card spotlights on the real screen. */
export type TourTarget = "door" | "notes" | "plate" | "glass" | "menu";

export interface TourCard {
  title: string;
  body: string;
  /** Dimmed screen, this thing lit and pulsing. The card sits beside it. */
  target?: TourTarget;
}

export const tour = {
  cards: [
    {
      title: "Welcome to Wirelight",
      body: "Beneath this gate lies a network: machines that once talked to each other through cables of light. Now it's in ruins. That dark doorway leads to one of its silent corridors. Your job is to bring it all back.",
      target: "door",
    },
    {
      title: "Someone tried before you",
      body: "Long ago a Knight came down here to restore it. He never finished, but he left his tools, his notes, and his base: this room, the Observatory. When you're stuck, read his notes, like this one.",
      target: "notes",
    },
    {
      title: "Click anything",
      body: "Every room is a machine, and every door is where a cable plugs in. Click anything to look at it closely, like this plate. [[Esc]] steps back. Nothing breaks for good, and there's no timer.",
      target: "plate",
    },
    {
      title: "The Scrying Glass",
      body: "This is the Scrying Glass, a live map of the whole floor. Open it any time with [[G]] or a click.",
      target: "glass",
    },
    {
      title: "The menu",
      body: "The menu ([[M]]) has the full Field Guide, every room, and your keys. That's everything. Go on in.",
      target: "menu",
    },
  ] satisfies TourCard[],
  next: "Next",
  back: "Back",
  enter: "Enter the dungeon",
  fullGuide: "View full Field Guide",
  skip: "Skip intro",
  dontShow: "Don't show this again",
};

/** Shown once ever, the first time the player arrives in the Observatory. Never skipped. */
export const seerGift = {
  eyebrow: "A gift for you",
  title: "The Seer's sight",
  body: [
    "Welcome to the dungeon. I'm the Seer. I've kept watch over the Knight's Observatory since he left.",
    "Most people can't see the messages that travel these cables. I'm giving you the sight to see them. From now on they'll appear as small lights moving through the rooms and corridors.",
    "Watch them closely. Where they go, and where they stop, will tell you what's wrong.",
  ],
  accept: "Accept the sight",
};
