/** Lines spoken by things in the world: keepers, locks, the workbench. Plain voice (D2). */
import type { SimEvent } from "@wirelight/sim";

type Decision = Extract<SimEvent, { kind: "fwd.decision" }>;

/** Why a router or a switch let something go, from the frame.drop that followed the decision. */
export type DropReason = Extract<SimEvent, { kind: "frame.drop" }>["reason"];

/**
 * A keeper explains one decision in plain words (CORE-25), built only from what really happened:
 * the decision, the table line it used, and why something was let go. Keepers never lie and never fix.
 */
export function keeperSays(d: Decision, reason?: DropReason, name?: (mac: string) => string | undefined): string {
  // Before Floor 2 teaches door names, a door name is said as its machine's name (`name`).
  const r = { ...d.tableRef, dst: (d.tableRef.dst && name?.(d.tableRef.dst)) || d.tableRef.dst };
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
    if (d.decision === "forward" && reason === "port-blocked")
      return `That frame was for ${r.dst}. ${line}, but that door is held shut to keep the halls from going round in circles, so it went no further.`;
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
    // 3.3 labels its cards by the hall door each letter is for (floor-3.md): Door 1 is for eth1.
    numbered: "Door {n}",
    about: "The messenger sends to whatever is written here, again and again.",
    blank: "(blank)",
    write: "Write it on the card",
  },
  /** A switch's MAC board (CORE-27): reading it runs `bridge fdb show`. */
  board: {
    name: "MAC board",
    title: "The hall's memory",
    about: "Each line: a door name the hall has seen, and the door it was seen behind.",
    clouded: "This board is too damaged to read. Read it from the terminal instead.",
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
    cracked: "This board is cracked: you can read it, but it won't take new lines. Add them from the terminal instead.",
  },
  /** A keeper's desk in hand mode (0042): what waits, and the keeper's job, step by step. */
  desk: {
    name: "Keeper's desk",
    /** Region 4's desk is the keeper's desk. */
    lecternName: "Keeper's desk",
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
    /** The router's desk (8.5): the keeper remembers every step, but isn't allowed to pass anything along. */
    lectern: {
      title: "The keeper's desk",
      asleep:
        "The keeper isn't allowed to pass anything along, so packets for other streets wait here. You can do its job by hand.",
      awake: "The keeper is allowed again: it passes every packet along itself.",
    },
    /** The frame or packet the next step acts on (the first waiting). */
    now: "this one",
    /** Identical frames waiting, shown once. */
    times: "×{n}",
    /** What the machine's ledger knows (ip neigh): a door name to pick for the new frame. */
    ledger: "The ledger knows",
    ledgerAt: "{ip} is at {mac}",
    ledgerAsking: "{ip}: asked, no answer yet",
    ledgerEmpty: "The ledger has nothing yet. Ask everyone first.",
    pick: "Use",
    /** The router's two separate steps (8.5): the countdown, then wrapping and sending. */
    countdown: "Take one off its countdown first",
    wrapSend: "Wrap it in a new frame to",
  },
  /** The Scanner (0043): catches tagged and peeled; Capture (tcpdump), Trace and Compare later. */
  scanner: {
    name: "Scanner",
    title: "The Scanner",
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
    /** For screen readers: the catch a layer button opens, and the two catches compared. */
    openLayer: "Catch {n}: {layer}",
    compareA: "First catch to compare",
    compareB: "Second catch to compare",
    changed: "changed",
    same: "same",
    empty: "Nothing caught yet.",
    /** Capture runs in the background; the Scanner remembers it. */
    listening: "Listening at {device}'s door {door}. The terminal stays free.",
    listened: "Listened at {device}'s door {door}.",
    nothingHeard: "Nothing has crossed that door yet.",
    /** Where a catch was made: the street it was on. */
    onStreet: "on {street}",
    /** A run of catches of one packet going back and forth between the same two machines (9.4). */
    folded: "{a} ⇄ {b} ×{n}, countdown {from} → {to}",
    countdownShort: "countdown {ttl}",
    /** The countdown before 9.3 names it TTL (8.5 took one off it by hand). */
    ttlPlain: "Packet: countdown",
    /** Compare (9.1): plain labels, what changed glows. */
    compareRows: {
      frameTo: "Frame: to",
      frameFrom: "Frame: from",
      packetTo: "Packet: to",
      packetFrom: "Packet: from",
      ttl: "Packet: countdown (ttl)",
      checksum: "Packet: checksum",
      message: "Message",
    },
    sealedRow: "sealed",
    catchN: "Catch {n}",
  },
  /** Captures (CORE-19, CORE-20): catches, opened one layer at a time. */
  captures: {
    name: "Captures",
    title: "Captures",
    empty: "Nothing caught yet. Point at a moving message: time slows down. Click it to keep a copy.",
    catchHint: "Click to catch a copy",
    /** Catching by keyboard: messages crossing this room's doors right now. */
    moving: "Moving through this room now",
    catchThis: "Catch a copy",
    open: "Open",
    frame: "Frame",
    to: "to",
    from: "from",
    carrying: "carrying",
    sealed: "There's more in here, sealed. You'll learn to open it later.",
    message: "Message",
    close: "Close",
  },
  /** Role tags (0113): a machine's role joins its name once the room that teaches it is cleared. */
  roles: { label: "{name} · {role}", switch: "switch", router: "router", dhcp: "DHCP server" },
  /** Command reminders beside the terminal (0109). */
  reminders: {
    title: "Commands to remember",
    note: "Each one stays here until you've typed it in a few more rooms.",
  },
  console: {
    title: "Terminal",
    open: "open",
    hide: "hide",
    reset: "— room reset —",
    /** The Scanner's Capture runs in the background: its lines show on the Scanner, not here. */
    onScanner: "(listening on the Scanner: its lines show there)",
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
    title: "{machine} · door {door}",
    /** The plate's light, for screen readers (filled diamond, hollow diamond). */
    lightUp: "link up",
    lightDown: "link down",
    linkUp: "Link up: the cable behind this door is working.",
    linkDown: "Link down: nothing can cross this door.",
    /** Switched on, but the cable behind it isn't working (1.3). */
    onButDown: "Switched on · link down: the door is on, but nothing comes through the cable behind it.",
    /** Switched off by its own switch. */
    switchedOff: "Switched off: nothing can cross this door.",
    switchOn: "Switch the door on",
    switchOff: "Switch the door off",
    switchBroken: "This switch is broken. Use the terminal instead: press ` to open it.",
    unplug: "Pull the cable out",
    address: "House address",
    /** A crossing's door (a router: more than one door, on different streets) has an address per door. */
    doorAddress: "This door's address",
    /** The address slot's example: a shape to copy, never an answer (192.0.2.x is never used in a room). */
    addressExample: "like 192.0.2.40/24",
    noAddress: "No address yet.",
    addAddress: "Give this door an address",
    removeAddress: "Remove",
    slotBroken: "This address slot is broken. Give the door its address from the terminal instead.",
    close: "Close",
  },
  /** A loose cable end on the floor by a door. */
  cableEnd: { label: "Cable end", plug: "Plug the cable back into {door}" },
  /** Doorways (CORE-10): going through to the room at the other end. */
  doorway: {
    go: "Go through {door} to {name}'s room",
    /** A doorway that can't be entered: the machine at the other end, and why. */
    sealed: "{name}'s room is closed: {why}",
    back: "Back to {name}'s room",
  },
  /** A corridor (0081): a cable you can stand in and watch. */
  corridor: {
    /** On the cable at a doorway: stepping into its corridor and stopping there. */
    step: "Step into the corridor to {name}",
    /** Where the player stands: the two machines the cable joins. */
    title: "The corridor between {a} and {b}",
    hint: "Every message on this cable passes here. Point at one to slow it down.",
    /** The way out at each end. */
    toEnd: "{name}'s room",
    toEndLabel: "Go on to {name}'s room",
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
  /** The Map (CORE-31..33, 0064, 0105): the live map of the floor, and the world map. */
  map: {
    title: "The Map",
    open: "Open the Map (G)",
    floorMap: "A live map of this floor: every machine, every cable and the messages on them.",
    thisFloor: "This floor",
    world: "The palace",
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
  /** Floor memories on the Map (0036, 0037): back in time, chaptered, voiced, always captioned. */
  memory: {
    floor: "Memory restored",
    building: "Why it's built this way",
    farewell: "Floor restored",
    chapter: "{n} of {total}",
    back: "Back",
    next: "Next",
    done: "Close",
    skip: "Skip",
    map: "The floor as it was when it worked: every machine and every cable, whole and lit.",
  },
  /** A ride-along (0036): one message followed through the floor, its headers at every hop. */
  ride: {
    remembering: "Remembering…",
    faint: "This memory is still too faint to ride.",
    hop: "{from} → {to}",
    step: "Hop {n} of {total}",
    pause: "Pause",
    play: "Play",
    back: "Step back",
    forward: "Step forward",
    again: "Again",
    /** The headers on the card. Floor 1 knows doors; Floor 2 frames; Floor 5 addresses; Floor 6 packets. */
    message: "The message",
    frame: "The frame",
    addresses: "House addresses",
    packet: "The packet",
    from: "from",
    to: "to",
    countdown: "countdown",
    ttl: "countdown (TTL)",
    door: "{device}'s {door}",
    everyone: "everyone",
    changed: "new",
    was: "was {value}",
    change: {
      crossing: "A crossing: a new envelope, the same letter, the countdown one less.",
      passed: "Passed on just as it was.",
      turn: "The answer sets off home.",
    },
    end: {
      delivered: "It arrived. Now the answer.",
      arrived: "It's home.",
      lost: "It went no further.",
    },
  },
  /** The top bar (interface.md: top right). */
  bar: {
    pause: "Pause",
    play: "Play",
    speed: "Speed",
    reset: "Reset room",
    notes: "Fragments",
    ask: "Ask",
    menu: "Menu",
    /** The top bar, for screen readers. */
    label: "Room controls",
    /** Said beside the notes button when a hint is ready (it also glows). */
    hintReady: "a hint is ready",
    /** Shown for a moment after Reset room (HELP-03). */
    resetDone: "The room is back as it was.",
  },
  /** The robot's notes (HELP-08..10): its notes in the room, reactions, hints. */
  notes: {
    title: "Memory fragments",
    /** Under the title: what the fragments are (0112). */
    about: "Bits of what you knew before you shut down. Each one is a hint.",
    hint: "Fragment {n} of 5",
    nextHint: "Recall the next fragment",
    waiting: "The next fragment hasn't come back yet. Look around, try something.",
    /** Under the hint button once the room is won: no more hints are needed here. */
    solved: "This room is restored. No more fragments needed here.",
    allRead: "That's every fragment.",
    codex: "In your Memory: {card}",
    memories: "Tips",
    replay: "Play again",
  },
  /** The room's questions (CORE-43). */
  ask: { title: "Questions", close: "Close" },
  /** A discovery card (CORE-46). */
  discovery: { new: "New", more: "Tell me more", ok: "Got it" },
  /** After the win (HELP-13). */
  after: {
    key: "Key",
    building: "Why it's built this way",
    floorMemory: "Memory restored",
    next: "Continue",
    nextRoom: "Next: {room}",
    end: "That's the end of the first release. Thank you for playing.",
  },
  /** The menu (M, UI-13). */
  menu: {
    title: "Menu",
    sections: "Menu sections",
    back: "Back to the topics",
    here: "you are here",
    tabs: { dungeon: "The palace", codex: "Memory", guide: "Guide", settings: "Settings" },
    status: {
      cleared: "cleared",
      next: "next",
      optional: "optional on your path",
      locked: "not yet",
      planned: "coming later",
    },
    play: "Play",
    replay: "Play again",
    objects: "Things you know",
    words: "Words you've learned",
    commands: "Command book",
    path: "Your path",
    sound: "Sound",
    volume: { master: "Everything", music: "Music", effects: "Effects", voices: "Voices" },
    voices: { title: "Voices", on: "On", text: "Text only (no voices; every line still shows)" },
    subtitles: { title: "Error subtitles", auto: "Through Floor 7", on: "Always", off: "Never" },
    textSize: "Text size",
    motion: { title: "Motion", system: "Follow my system", reduced: "Reduced", full: "Full" },
    quality: { title: "Graphics", auto: "Automatic", high: "High", medium: "Medium", low: "Low", simple: "Simple" },
    replayIntro: "Replay intro",
    /** Captions (UI-17): every spoken line is always written out; this sets how large. */
    captions: { title: "Captions", standard: "Standard", large: "Large" },
    /** The privacy note (UI-17, tech/quality.md): what is saved and why. */
    privacy: {
      title: "Privacy",
      text: "Your progress and settings are saved only in this browser, so you can pick up where you left off. Nothing is sent anywhere: no account, no analytics, no tracking.",
    },
    empty: "Nothing here yet.",
    close: "Close",
  },
  /** Tips (0008): offered on other paths, then the one small thing to do after. */
  tips: {
    offer: "Tip",
    watch: "Watch",
    later: "Not now",
    yourTurn: "Your turn: {action}.",
    /** The memory's action, done: it names what was done (never a word that sounds like a win). */
    done: "Done: {action}.",
    dismiss: "Close",
    /** Who speaks a tip (its topic shows under it). */
    speaker: "You",
  },
  /** The gentle way back (HELP-12): an offer in a boss, on the Know a little and Know networking paths. */
  wayBack: {
    text: "This one puts several things together at once. When I got stuck here, I went back to {room} and looked at one piece on its own. Want to?",
    go: "Go there",
    stay: "Stay",
  },
  /** The first release's ending card (END1): what "What's next" says. */
  ending: {
    next: "Below the cathedral, the roads become a maze: the Impossible Stair. It's coming later.",
  },
  send: "Send",
  /** UI-06: before the gift of the voice, a click shows the command it ran under this caption. */
  heard: "this click ran:",
  // ── Agent B additions ──
  /** Saying who a message is for before door names are taught (Floor 2), and in plain words before the Scanner. */
  names: {
    everyone: "everyone",
    toFrom: "to {to} · from {from}",
  },
  /** What reached a machine's doors lately (Captures, a plate): readable without catching it in flight. */
  arrived: {
    title: "Arrived at {machine}'s doors lately",
    plate: "Last arrived here",
    countOne: "1 so far",
    count: "{n} so far",
    ignored: "{n} ignored (not for this door)",
  },
  /** Where the player is standing (the room's own machine, or the one walked into). */
  here: "You are in: {machine}",
  hereCorridor: "You are in: the {a}–{b} corridor",
  /** When this browser can't draw the 3D world (no WebGPU and no WebGL2), or the drawing fails. */
  /** The loading screen (play/LoadingScreen.tsx): under the region's name, beside the percentage. */
  loading: { label: "Loading" },
  /** The playtest log button (dev/PlaytestButton.tsx), shown only with ?playtest=1 in the address. */
  playtest: {
    one: "Playtest log: 1 room",
    many: "Playtest log: {n} rooms",
    export: "Export",
    exportTitle: "Download this playtest as a file",
  },
  cannotDraw: {
    title: "This browser can't draw the palace",
    body: "Wirelight needs 3D drawing (WebGL2 or WebGPU), and it couldn't start here. Nothing is lost: your progress is saved in this browser.",
    tipsTitle: "Things that usually help:",
    tips: [
      "Use a recent Chrome, Edge or Firefox.",
      "Turn on hardware acceleration in the browser's settings, then restart the browser.",
      "Update your graphics drivers.",
      "On a work computer, 3D may be switched off by policy; try a personal one.",
    ],
    retry: "Try again",
    webgl2: "Try the simpler drawing mode",
    detail: "What went wrong",
    /** Any other failure while playing (a bug, not the browser). */
    crashedTitle: "Something stopped the game",
    crashedBody:
      "Sorry, that's a bug in Wirelight, not your computer. Your progress is saved in this browser; trying again usually brings you back to where you were.",
  },
};
