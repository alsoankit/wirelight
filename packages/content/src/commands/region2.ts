import type { CommandMemory } from "../commands";

/** The hall's own doors and special names, as `bridge fdb show` lists them after its learned lines. */
const ownLines = (door: string, mac: string) => [
  `${mac} dev ${door} master br0 permanent`,
  `33:33:00:00:00:01 dev ${door} self permanent`,
  `01:00:5e:00:00:01 dev ${door} self permanent`,
];
const bridgeLines = [
  "33:33:00:00:00:01 dev br0 self permanent",
  "01:00:5e:00:00:6a dev br0 self permanent",
  "33:33:00:00:00:6a dev br0 self permanent",
  "01:00:5e:00:00:01 dev br0 self permanent",
];

/** Region 2's command memories (0041), by id (floors/floor-3.md CMD-02, floor-4.md CMD-03). */
export const REGION_2_COMMANDS: Record<string, CommandMemory> = {
  "CMD-02": {
    id: "CMD-02",
    command: "bridge fdb",
    room: "f3.keepers-memory",
    intro: "The board has clouded over, but the hall still remembers. Ask it in its own words.",
    anatomy: [
      { word: "bridge", role: "tool", meaning: "the tool for switches (Linux calls a switch a bridge)" },
      { word: "fdb", role: "about what", meaning: "its forwarding database: the MAC table" },
      { word: "show", role: "do what", meaning: "show me" },
    ],
    forms: [
      { line: "bridge fdb show", meaning: "everything it knows" },
      { line: "bridge fdb show dev eth3", meaning: "only what's behind one door" },
    ],
    // The hall in 3.2, after a broadcast: every learned line, captured from the room.
    output: {
      text: [
        "02:00:00:00:00:05 dev eth0 master br0 ",
        ...ownLines("eth0", "02:00:00:00:00:a0"),
        "02:00:00:00:00:0d dev eth1 master br0 ",
        ...ownLines("eth1", "02:00:00:00:00:a1"),
        "02:00:00:00:00:0b dev eth2 master br0 ",
        ...ownLines("eth2", "02:00:00:00:00:a2"),
        "02:00:00:00:00:0f dev eth3 master br0 ",
        ...ownLines("eth3", "02:00:00:00:00:a3"),
        ...bridgeLines,
      ].join("\n"),
      marks: [
        { match: "02:00:00:00:00:0d", meaning: "a name it has seen" },
        { match: "dev eth1", meaning: "behind this door" },
        { match: "master br0", meaning: "in this switch's table" },
        {
          match: "permanent",
          meaning: "the switch's own doors and special names. You can ignore them for now.",
        },
      ],
      dimmed: "Lines ending in permanent are the switch's own doors and special names. You can ignore them for now.",
    },
    action: { say: "Now ask the hall yourself.", type: "bridge fdb show" },
  },
  "CMD-03": {
    id: "CMD-03",
    command: "bridge fdb del",
    room: "f4.pinned-memory",
    intro: "`del` prints nothing when it works. Silence means yes. Ask with `bridge fdb show` to check.",
    anatomy: [
      { word: "bridge fdb", role: "tool", meaning: "the switch's memory, as before" },
      { word: "del", role: "do what", meaning: "remove a line" },
      { word: "02:00:00:00:00:07", role: "which one", meaning: "which name" },
      { word: "dev eth1", role: "where", meaning: "the door it's written against" },
      { word: "master", role: "whose", meaning: "in the switch's table" },
    ],
    forms: [
      { line: "bridge fdb del <name> dev <door> master", meaning: "forget one line" },
      { line: "bridge fdb add <name> dev <door> master static", meaning: "pin one by hand (rarely a good idea)" },
    ],
    // The hall in 4.1 once the pinned line is gone and lantern has answered: asked with `bridge fdb show`.
    output: {
      text: [
        "02:00:00:00:00:05 dev eth0 master br0 ",
        ...ownLines("eth0", "02:00:00:00:00:a0"),
        ...ownLines("eth1", "02:00:00:00:00:a1"),
        "02:00:00:00:00:0c dev eth2 master br0 ",
        ...ownLines("eth2", "02:00:00:00:00:a2"),
        "02:00:00:00:00:07 dev eth3 master br0 ",
        ...ownLines("eth3", "02:00:00:00:00:a3"),
        ...bridgeLines,
      ].join("\n"),
      marks: [
        { match: "02:00:00:00:00:07 dev eth3", meaning: "lantern, learned again behind its new door" },
        { match: "dev eth1", meaning: "nothing pointing at the old door any more" },
      ],
      dimmed: "Lines ending in permanent are the switch's own doors and special names. You can ignore them for now.",
    },
    action: {
      say: "Type it once. In this room, it's the fix.",
      type: "bridge fdb del 02:00:00:00:00:07 dev eth1 master",
    },
  },
};
