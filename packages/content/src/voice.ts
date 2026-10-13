/** Lines spoken by things in the world: keepers, locks, the workbench. Plain voice (D2). */
import type { SimEvent } from "@wirelight/sim";

type Decision = Extract<SimEvent, { kind: "fwd.decision" }>;

/**
 * A computer keeper explains its accept/ignore decision from the trace (FR-KEEP-04, D13 #11).
 * Keepers never lie and never fix.
 */
export function computerKeeperSays(d: Decision): string {
  if (d.decision === "deliver") {
    return d.tableRef.dst === "ff:ff:ff:ff:ff:ff"
      ? `That frame was for everyone (${d.tableRef.dst}), so I took it in.`
      : `That frame was for ${d.tableRef.dst}. That's me, so I took it in.`;
  }
  return `That frame was for ${d.tableRef.dst}. That's not me, so I ignored it.`;
}

export const voice = {
  keeper: {
    title: "The keeper",
    about: "It reads every frame that reaches this machine's doors and decides whether it's for this machine.",
    idle: "Nothing has arrived yet.",
  },
  lock: {
    closedTitle: "A locked gate",
    closed: "It's waiting for a key. Keys come back with answers.",
    openTitle: "The gate is open",
    open: "The key fit. The way on is open.",
  },
  workbench: {
    name: "Workbench",
    title: "Build a frame",
    about: "Write who it's for, then seal it and send it down the cable.",
    to: "To",
    door: "Out of door",
    message: "Message",
    send: "Seal and send",
    refused: "A frame needs a name to go to.",
  },
  /** The messenger's address card (CORE-35). {n} is the card's number when there are several. */
  card: {
    name: "Address card",
    title: "The messenger's card",
    numbered: "Card {n}",
    about: "The messenger sends to whatever is written here, again and again.",
    blank: "(blank)",
    write: "Write it on the card",
  },
  /** A switch's MAC board (CORE-27): reading it runs `bridge fdb show`. */
  board: {
    name: "MAC board",
    title: "The hall's memory",
    about: "Each line: a door name the hall has seen, and the door it was seen behind.",
    clouded: "The board's glass is clouded and cracked. You can't read it from here.",
    close: "Close",
  },
  /** A keeper's desk in hand mode (0042): what waits, and the keeper's job, step by step. */
  desk: {
    name: "Keeper's desk",
    title: "The keeper's desk",
    asleep: "The keeper has forgotten its job. Messages wait here until you do it.",
    empty: "Nothing is waiting.",
    frame: "A frame from {from} to {to}, in at {door}.",
    packet: "A packet from {from} to {to}.",
    learn: "Remember: {from} is behind {door}",
    sendOut: "Send it out of",
    everyOther: "every other door",
    send: "Send",
    awake: "The keeper remembers its job now.",
    close: "Close",
  },
  /** The capture jar (CORE-19, CORE-20): catches, opened one layer at a time. */
  jar: {
    name: "Capture jar",
    title: "Capture jar",
    empty: "Nothing caught yet. Point at a moving message: time slows down. Click it to keep a copy.",
    catchHint: "Click to catch a copy",
    open: "Open",
    frame: "Frame",
    to: "to",
    from: "from",
    carrying: "carrying",
    sealed: "There's more in here, sealed. You'll learn to open it later.",
    message: "Message",
    close: "Close",
  },
  console: {
    title: "Console",
    open: "open",
    hide: "hide",
    reset: "— room reset —",
  },
  debrief: {
    title: "Restored",
    firstTry: "You got it first try.",
    tried: "What you tried",
    terms: "New words",
    next: "Continue",
  },
  /** A door's plate, opened (UI-03): its controls. {door} and {name} are filled in. */
  plate: {
    title: "Door {door}",
    linkUp: "Link up: the cable behind this door is working.",
    linkDown: "Link down: nothing can cross this door.",
    switchOn: "Switch the door on",
    switchOff: "Switch the door off",
    switchBroken: "The switch is cracked and stuck. It won't move.",
    unplug: "Pull the cable out",
    close: "Close",
  },
  /** A loose cable end on the floor by a door. */
  cableEnd: { label: "Cable end" },
  /** Doorways (CORE-10): going through to the room at the other end. */
  doorway: {
    go: "Go through {door} to {name}'s room",
    back: "Back to {name}'s room",
  },
  /** Spoken lines (UI-20): always written out; Enter or a click goes on. */
  lines: { next: "Next", done: "Close" },
  /** A command memory (0041), shown over the dimmed room. */
  commandMemory: {
    title: "Command memory: {command}",
    roles: "How it's built",
    forms: "Common forms",
    output: "Reading what it says",
    next: "Next",
    done: "Close",
  },
  /** The top bar (interface.md: top right). */
  bar: {
    pause: "Pause",
    play: "Play",
    speed: "Speed",
    reset: "Reset room",
    notes: "Knight's notes",
    ask: "Ask",
    menu: "Menu",
  },
  /** The Knight's notes (HELP-08..10): his notes in the room, reactions, hints. */
  notes: {
    title: "The Knight's notes",
    hint: "Hint {n} of 5",
    nextHint: "Read the next hint",
    waiting: "The next hint isn't ready yet. Look around, try something.",
    allRead: "That's every hint.",
    codex: "In the Codex: {card}",
    memories: "Knight's Memories",
    replay: "Play again",
  },
  /** The Guardian's questions (CORE-43). */
  ask: { title: "Ask {guardian}", close: "Close" },
  /** A discovery card (CORE-46). */
  discovery: { new: "New", more: "Tell me more", ok: "Got it" },
  /** After the win (HELP-13). */
  after: {
    key: "Key",
    building: "See how they built it",
    floorMemory: "{guardian} remembers",
    journal: "A page of the Knight's journal",
    next: "Continue",
    nextRoom: "Next: {room}",
    end: "That's the end of the first release. Thank you for playing.",
  },
  /** The menu (M, UI-13). */
  menu: {
    title: "Menu",
    tabs: { dungeon: "The dungeon", codex: "Codex", guide: "Field Guide", keys: "Keyring", settings: "Settings" },
    status: {
      cleared: "cleared",
      next: "next",
      optional: "optional on your path",
      locked: "not yet",
      planned: "coming later",
    },
    play: "Play",
    replay: "Play again",
    objects: "Things you've found",
    words: "Words you've learned",
    commands: "Command book",
    journal: "Journal pages",
    noKeys: "No keys yet. Keys come back with answers.",
    path: "Your path",
    replayIntro: "Replay intro",
    empty: "Nothing here yet.",
    close: "Close",
  },
  send: "Send",
  /** UI-06: before the gift of the voice, a click shows the command it ran under this caption. */
  heard: "the machine heard:",
};
