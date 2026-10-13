/** Lines spoken by things in the world: keepers, locks, the workbench. Plain voice (D2). */
import type { SimEvent } from "@wirelight/sim";

type Decision = Extract<SimEvent, { kind: "fwd.decision" }>;

/** Why a router or a switch let something go, from the frame.drop that followed the decision. */
export type DropReason = Extract<SimEvent, { kind: "frame.drop" }>["reason"];

/**
 * A keeper explains one decision in plain words (CORE-25), built only from what really happened:
 * the decision, the table line it used, and why something was let go. Keepers never lie and never fix.
 */
export function keeperSays(d: Decision, reason?: DropReason): string {
  const r = d.tableRef;
  if (d.layer === "l3") {
    const ip = r.ip ?? "?";
    if (d.decision === "deliver") return `That packet was for ${ip}. That's me, so I took it in.`;
    if (d.decision === "forward" && r.route)
      return r.route.via
        ? `That packet is for ${ip}. My board says ${r.route.dst} goes via ${r.route.via}, out of door ${r.route.dev}, so I sent it there.`
        : `That packet is for ${ip}. My board says ${r.route.dst} is the street behind door ${r.route.dev}, so I sent it there.`;
    if (reason === "forwarding-disabled")
      return `That packet is for ${ip}, not me. I'm not allowed to pass things on to other streets, so I let it go.`;
    if (reason === "ttl-expired")
      return `That packet is for ${ip}, but its countdown ran out here, so it went no further. I told whoever sent it.`;
    return `That packet is for ${ip}. My board has no line for it, so I had nowhere to send it. I told whoever sent it.`;
  }
  if (r.fdb !== undefined) {
    // A switch.
    if (d.decision === "deliver")
      return `That frame was for ${r.dst}, this hall's own door name, so the hall took it in.`;
    if (d.decision === "flood")
      return r.dst === "ff:ff:ff:ff:ff:ff"
        ? `That frame was for everyone, so I sent it out of every other door: ${d.egress.join(", ")}.`
        : `That frame was for ${r.dst}. I didn't know which door that name is behind, so I sent it out of every other door: ${d.egress.join(", ")}.`;
    const line = r.fdb
      ? `My board says ${r.fdb.mac} is behind ${r.fdb.port}${r.fdb.static ? " (pinned)" : ""}`
      : "My board knew it";
    if (d.decision === "forward") return `That frame was for ${r.dst}. ${line}, so I sent it there.`;
    return `That frame was for ${r.dst}. ${line}, the door it came in by, so it didn't need to go anywhere.`;
  }
  // A computer's door.
  if (d.decision === "deliver")
    return r.dst === "ff:ff:ff:ff:ff:ff"
      ? `That frame was for everyone (${r.dst}), so I took it in.`
      : `That frame was for ${r.dst}. That's me, so I took it in.`;
  return `That frame was for ${r.dst}. That's not me, so I ignored it.`;
}

export const voice = {
  keeper: {
    name: "Keeper",
    title: "The keeper",
    about: "Ask it about something it handled. It tells you exactly what it did, and why.",
    idle: "Nothing has arrived yet.",
    item: "{time} s · {what}",
    askMachine: "Ask the machine",
    close: "Close",
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
  /** A machine's neighbour ledger (CORE-27): reading it runs `ip neigh show`. */
  ledger: {
    name: "Neighbour ledger",
    title: "The neighbour ledger",
    about: "Each line: a house on this street, the door name that answered for it, and how sure the machine is.",
  },
  /** A machine's routing board (CORE-27, 8.2): reading runs `ip route show`; adding a line, `ip route add`. */
  routes: {
    name: "Routing board",
    title: "The routing board",
    about: 'Each line: a street, and which way to send things for it. "default" is everywhere else.',
    via: "via",
    door: "door",
    addDefault: "Add a line: everywhere else, via",
    add: "Add",
    cracked: "The board is cracked. You can read it, but it won't take anything new.",
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
    ask: "Ask everyone: who has {to}?",
    wrap: "Wrap it in a frame to",
    forward: "Take one off its countdown and send it in a new frame to",
    go: "Send",
    awake: "The keeper remembers its job now.",
    close: "Close",
  },
  /** The Slate (0043): catches tagged and peeled; Capture (tcpdump), Trace and Compare later. */
  slate: {
    name: "Slate",
    title: "The Slate",
    catchNext: "Catch the next message",
    from: "only from (optional)",
    layers: { frame: "Frame", packet: "Packet", message: "Message" },
    packet: "Packet",
    ttl: "countdown (ttl)",
    protocol: "inside",
    checksum: "checksum",
    port: "to port",
    capture: "Capture at a door",
    start: "Start",
    stop: "Stop",
    trace: "Trace my next packet",
    compare: "Compare",
    changed: "changed",
    same: "same",
    empty: "Nothing caught yet.",
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
    address: "House address",
    noAddress: "No address yet.",
    addAddress: "Give this door an address",
    removeAddress: "Remove",
    slotBroken: "The address slot is cracked. It won't take anything now.",
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
  /** The Scrying Glass (CORE-31..33, 0064): the live map of the floor, and the world map. */
  glass: {
    title: "The Scrying Glass",
    open: "Open the Scrying Glass (G)",
    floorMap: "A live map of this floor: every machine, every cable and the messages on them.",
    thisFloor: "This floor",
    world: "The Deep Network",
    close: "Close",
    states: { restored: "restored", here: "you are here", open: "open", mist: "in the mist", fog: "under fog" },
  },
  /** Replay (CORE-23): a message's whole journey again, hop by hop, with each keeper's decision. */
  replay: {
    title: "Replay",
    winning: "Replay the winning journey",
    lost: "Replay this message",
    hop: "{from} → {to}",
    lostHere: "It went no further.",
    arrived: "It arrived.",
    again: "Again",
    close: "Close",
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
    sound: "Sound",
    volume: { master: "Everything", music: "Music", effects: "Effects", voices: "Voices" },
    voices: { title: "Voices", on: "On", text: "Text only (no voices; every line still shows)" },
    subtitles: { title: "Error subtitles", auto: "Through Floor 7", on: "Always", off: "Never" },
    textSize: "Text size",
    motion: { title: "Motion", system: "Follow my system", reduced: "Reduced", full: "Full" },
    quality: { title: "Graphics", auto: "Automatic", high: "High", medium: "Medium", low: "Low", simple: "Simple" },
    replayIntro: "Replay intro",
    empty: "Nothing here yet.",
    close: "Close",
  },
  send: "Send",
  /** UI-06: before the gift of the voice, a click shows the command it ran under this caption. */
  heard: "the machine heard:",
};
