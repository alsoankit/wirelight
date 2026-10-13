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
  send: "Send",
  /** UI-06: before the gift of the voice, a click shows the command it ran under this caption. */
  heard: "the machine heard:",
};
