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
    title: "Build a frame",
    about: "Write who it's for, then seal it and send it down the cable.",
    idle: "Sending closes the bench so you can watch your frame go. It runs in your console as a lab command.",
    badAddress: "Addresses look like 02:00:00:00:00:07.",
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
  send: "Send",
  /** UI-06: before the gift of the voice, a click shows the command it ran under this caption. */
  heard: "the machine heard:",
};
