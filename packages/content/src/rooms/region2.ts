import { peacekeeper } from "./secrets2";
import { SEALED } from "./shared";
import type { FloorText, RoomText } from "./types";

/** floors/floor-3.md and floor-4.md (Region 2 · The Sorting Works), word for word. */

/**
 * Arriving in Region 2 (floor-3.md): the owl's first lines, the first time the player enters the hall.
 * Their ids (`R2-…`) are region lines, so they aren't a room's voice lines; the engine plays them.
 */
export const region2Arrival: { id: string; speaker: string; text: string }[] = [
  {
    id: "R2-ARRIVE-01",
    speaker: "You",
    text: "Gears, iron, and a lot of doors. The Sorting Works.",
  },
  {
    id: "R2-ARRIVE-02",
    speaker: "You",
    text: "These halls sort messages between many machines at once. Or they did.",
  },
  {
    id: "R2-ARRIVE-03",
    speaker: "You",
    text: "My logs say this place was always busy. Now it's silent. Let's find out why.",
  },
];

// ── Floor 3 · The Switch ───────────────────────────────────────────────────────────────────

const manyDoors: RoomText = {
  title: "Many Doors",
  mission: "Your messenger is writing to anvil, but the hall's keeper has forgotten how to sort. Show it.",
  notes: [],
  hints: [
    { text: "A frame is waiting at the desk. Read it." },
    { text: "The desk has two jobs: remember, then send." },
    {
      text: "Write down who it's from and where it came in. Then look up who it's to.",
      codex: "mac-board",
    },
    { text: "If the board knows the to, send it out that door. If not, send it out every other door." },
    {
      text: "First frame: Remember, then Send out every other door. Anvil's answer: Remember, then Send out eth0. Next frame: Send out eth3. The keeper will take over.",
    },
  ],
  detectors: {
    "back-where-it-came": {
      note: "That's the door it came in by. The sender already has it.",
      tried: "You sent a frame back out of the door it came in by.",
    },
    "guess-a-door": {
      note: "You didn't know where anvil was yet. What can the keeper do when it doesn't know?",
      tried: "You picked one door for a name the board didn't know yet.",
    },
    "flood-everything": {
      note: "You already wrote down where that one lives. Look at the board.",
      tried: "You sent a frame out of every other door when the board already knew its door.",
    },
    "forgot-to-remember": {
      note: "Before it leaves, what can this frame teach the keeper?",
      tried: "You sent frames on without writing down who they were from.",
    },
  },
  debrief: {
    happened:
      "You did a switch's job. You wrote down each frame's from and the door it came in by, that's the MAC table. When you didn't know where the to lived, you sent the frame out every other door: flooding. Once you knew, it went out one door only.",
    terms: [
      { id: "mac-table", term: "MAC table", meaning: "a switch's list of which MAC address is behind which door" },
      {
        id: "flooding",
        term: "flooding",
        meaning: "sending a frame out every other door when the switch doesn't know where its to lives",
      },
    ],
  },
  memories: [
    {
      id: "F3-MEM-01",
      title: "The keeper",
      trigger: "on entering",
      text: "Every room has a keeper, the machine that decides where messages go. This one's asleep, but its desk still works. I can do its job by hand.",
      action: "press Remember on the waiting frame",
    },
  ],
  guardian: [
    {
      q: "What is this hall?",
      a: "A sorting hall: many doors, one keeper. Every frame comes in one door and leaves by another. Choosing which one is the clever part.",
    },
    {
      q: "Why write down the from?",
      a: "Whoever sent a frame must be behind the door it came in by. That's worth writing down.",
    },
    {
      q: "What if the keeper doesn't know the to?",
      a: "Then it can't choose, so it sends the frame out of every other door and lets the doors sort it out.",
    },
    {
      q: "Why not send everything everywhere?",
      a: "Every machine would read every message in the hall. Slow, and nosy.",
    },
  ],
  building: {
    id: "F3-BLD-01",
    text: "A hall with many doors needs a keeper in the middle with a list. It writes down every sender, and soon it knows where everyone is.",
    shown: "keepers writing in their lists; frames sent to single doors",
  },
  fieldGuide: ["Switches and their keepers", "The MAC board"],
  voice: [
    {
      id: "F3-KEEP-01",
      speaker: "You",
      text: "It's awake. Its screen says: read the from, write it down. Read the to, look it up. Known: one door. Unknown: every other door.",
    },
  ],
};

const keepersMemory: RoomText = {
  title: "The Keeper's Memory",
  mission:
    "Something behind the hall's third door keeps a key. Nobody remembers its door name, and the hall's board can't be read.",
  access: { compass: SEALED, beacon: SEALED, gate: SEALED },
  notes: ["The one behind the third door has the key."],
  hints: [
    { text: "The board can't be read. Can the hall tell you what it remembers?" },
    { text: "Go into the hall's room and ask it from the terminal there." },
    { text: "A switch only learns a name when that machine sends something.", codex: "switch" },
    { text: "Get gate to send something, then ask the hall which name is behind eth3, then write to that name." },
    {
      text: "Send a broadcast from the workbench. Then in the hall: `bridge fdb show` shows `02:00:00:00:00:0f dev eth3`. Send a frame to `02:00:00:00:00:0f`; gate answers with the key.",
    },
  ],
  detectors: {
    "expects-gate-listed": {
      note: "Same list. What would make the keeper learn something new?",
      tried: "You read the hall's memory again before anyone new had spoken.",
    },
    guessing: {
      note: "Guessing names could take forever. Is there a name that everyone listens to?",
      tried: "You guessed names that no door has.",
    },
    "wrong-console": {
      note: "Your machine isn't a switch. Whose memory do you want to read?",
      tried: "You asked your own machine for a switch's memory.",
    },
  },
  debrief: {
    happened:
      "The hall's keeper only knows names it has seen as a frame's from. Gate had never sent anything, so it wasn't on the table. Your broadcast made gate answer, the keeper learned it from the source, and `bridge fdb show` told you its name.",
    terms: [
      {
        id: "learning-from-the-source",
        term: "learning from the source",
        meaning: "a switch learns where a machine is from the from of the frames it sends",
      },
    ],
  },
  guardian: [
    {
      q: "Why isn't gate on the list?",
      a: "The keeper only writes down names it has seen. Has gate ever sent anything?",
    },
    {
      q: "How do I make gate send something?",
      a: "Most machines answer when someone calls out to everyone.",
    },
    {
      q: "Why does Linux say bridge?",
      a: "Another word for a switch. Same job, older name.",
    },
  ],
  building: {
    id: "F3-BLD-02",
    text: "Nobody tells a switch where anyone is. Every frame tells it, just by arriving.",
    shown: "a list filling itself line by line as frames arrive",
  },
  fieldGuide: ["Reading a switch's memory", "Command book: bridge fdb"],
};

const findEveryone: RoomText = {
  title: "Find Everyone",
  mission:
    "You left three letters before you shut down, one for each door of the hall. You only wrote down the doors, not the names.",
  access: { ember: SEALED, thistle: SEALED, bell: SEALED },
  notes: [],
  hints: [
    { text: "Three letters, three doors, three names you don't know yet." },
    { text: "You've done this before, one name at a time." },
    {
      text: "The hall learns the name of every machine that sends something, and remembers its door.",
      codex: "mac-board",
    },
    { text: "Make them all send something, read the hall's memory, then fill in each card by its door." },
    {
      text: "Broadcast, then `bridge fdb show` in the hall: eth1 is `…:10`, eth2 is `…:11`, eth3 is `…:12`. Put each on the matching card.",
    },
  ],
  detectors: {
    "swapped-doors": {
      note: "That name lives behind another door. Check which door each line says.",
      tried: "You gave a card the name behind a different door.",
    },
  },
  debrief: {
    happened:
      "One broadcast taught the hall every name at once, and its memory told you who lives behind which door. That's a switch at work: it learns everyone without being told.",
    terms: [],
  },
  building: {
    id: "F3-BLD-03",
    text: "Every new machine that came to the hall announced itself once, and from then on, the hall knew it.",
    shown: "new machines connecting, a single broadcast each, the ledger filling",
  },
};

const busyHall: RoomText = {
  title: "The Busy Hall",
  mission: "Your last letter to this hall never got an answer. Something here is still waiting for it.",
  access: { compass: SEALED, beacon: SEALED, wren: SEALED },
  notes: [],
  hints: [
    { text: "One of the hall's doors is dark." },
    { text: "Its switch is broken. Use the hall's terminal." },
    { text: "A machine behind a dark door can't hear a broadcast, or answer one.", codex: "everyone-address" },
    {
      text: "Switch the door on in the hall, make wren send something, read its name from the hall's memory, then fix the card.",
    },
    {
      text: "In the hall: `ip link set eth2 up`. Broadcast. `bridge fdb show` shows `02:00:00:00:00:13 dev eth2`. Set the card to it; wren answers with the key.",
    },
  ],
  detectors: {
    "expects-gate-listed": {
      note: "Same list. What would make the keeper learn something new?",
      tried: "You read the hall's memory again before anyone new had spoken.",
    },
    "wrong-console": {
      note: "Your machine isn't a switch. Whose memory do you want to read?",
      tried: "You asked your own machine for a switch's memory.",
    },
    guessing: {
      note: "Guessing names could take forever. Is there a name that everyone listens to?",
      tried: "You guessed names that no door has.",
    },
    "wrong-door-name": {
      note: "Doors have names. Which name does yours have? Ask the machine for its doors.",
      tried: "You named a door the hall doesn't have.",
    },
    "broadcast-before-link": {
      note: "Everyone answered… except whoever's behind the dark door.",
      tried: "You called out to everyone while wren's door was still switched off.",
    },
  },
  debrief: {
    happened:
      "Wren was behind a door that was switched off, so nothing reached it and it never spoke. Once the door was on, a broadcast made it answer, the hall learned its name from the source, and your letter could finally be delivered.",
    terms: [],
  },
  voice: [
    {
      id: "F3-BOSS-01",
      speaker: "You",
      text: "This was the busiest hall in the Works. One message here has been waiting longer than I was switched off.",
    },
  ],
};

const floor3: FloorText = {
  name: "The Switch",
  memory: [
    {
      id: "F3-FM-01",
      title: "The problem",
      text: "Memory restored. As halls grew, every frame went to every door. Every machine read every message. Everything slowed to a crawl.",
    },
    {
      id: "F3-FM-02",
      title: "What they built",
      text: "So the switch was built: a keeper with a list. Every frame tells it who sent it and which door it came by. It writes that down. Then it reads the to: known, one door. Unknown, every other door, just this once.",
    },
    {
      id: "F3-FM-03",
      title: "Ride-along",
      text: "Learn from the from. Send by the to.",
      shown:
        "the camera rides a frame from the observatory into the hall. At the desk the keeper's lens reads the from (a line writes itself on the ledger) and the to (the ledger is searched, a line glows); a single chute opens and the frame drops out eth3 alone. Then a frame to an unknown name: the keeper hesitates, copies it, and the copies fan out every other door.",
    },
    {
      id: "F3-FM-04",
      title: "What's next",
      text: "But a list can be wrong, and a line can be kept too long. Something went very wrong here once. That part is still missing.",
      shown: "the world map: the hall glows; Floor 4 still in mist",
    },
  ],
  journal: {
    page: 3,
    title: "The sorting hall",
    where: "in the dust under the keeper's desk in 3.2 (glows after the win)",
    text: "Log 3,201. The keeper in the sorting hall stopped. I sorted frames by hand, the way its list said, until it restarted. Note to self: the desk works even when the keeper doesn't.",
  },
};

// ── Floor 4 · Memory and Loops ─────────────────────────────────────────────────────────────

const pinnedMemory: RoomText = {
  title: "The Pinned Memory",
  mission: "Lantern moved to a new door in the hall last night. Since then, nothing reaches it.",
  access: { alcove: "Nobody lives at the far end of this corridor any more. Its cable lies loose on the floor." },
  notes: [],
  hints: [
    { text: "Follow a frame for lantern. Which door does it leave the hall by?" },
    { text: "Ask the hall what it remembers about lantern." },
    { text: "Most memories fade when a machine goes quiet. A pinned one never does.", codex: "pinned-memory" },
    { text: "Remove the wrong line, then let the hall learn again." },
    {
      text: "In the hall: `bridge fdb del 02:00:00:00:00:07 dev eth1 master`. The next frame floods, lantern answers from eth3, and the key arrives.",
    },
  ],
  detectors: {
    "replug-old-cable": {
      note: "That corridor leads nowhere now. Lantern isn't behind that door anymore.",
      tried: "You plugged in the old cable, but nobody lives at its far end now.",
    },
    "wait-for-fade": {
      note: "Quill's line faded. Lantern's didn't. What's different about it?",
      tried: "You waited for lantern's line to fade, but a pinned line never does.",
    },
    "delete-wrong-line": {
      note: "That one was right. Which line sends lantern's frames to the wrong door?",
      tried: "You removed quill's line, which was right.",
    },
  },
  debrief: {
    happened:
      "A switch forgets a machine after five minutes of silence, so its memory follows machines when they move. That's ageing. But lantern's line had been pinned by hand, a static entry, so it never faded and kept pointing at the old door. You removed it, the hall flooded once, and learned the right door.",
    terms: [
      { id: "ageing", term: "ageing", meaning: "a switch forgetting machines that have gone quiet" },
      {
        id: "static-entry",
        term: "static entry",
        meaning: "a line written into a switch's memory by hand; it never fades",
      },
    ],
  },
  memories: [
    {
      id: "F4-MEM-01",
      title: "Time",
      trigger: "first time the time control is needed",
      text: "I can speed time up. The network doesn't mind; things just happen sooner. I'll watch the hall's memory while it runs fast.",
      action: "set time to fast, then back to normal",
    },
  ],
  guardian: [
    {
      q: "Why do memories fade?",
      a: "Machines move. If the keeper never forgot, it would keep sending to doors where nobody is anymore. Forgetting the quiet ones keeps its list true.",
    },
    { q: "How long does it remember?", a: "Five minutes of silence. Then the line goes." },
    {
      q: "Why does lantern's line never fade?",
      a: "Somebody pinned it. A pinned line never goes. That's the point of pinning it, and the trouble too.",
    },
  ],
  building: {
    id: "F4-BLD-01",
    text: "Switches forget on purpose: a line goes unless it keeps being written. Pinned lines never go, and that's how they get stale.",
    shown: "lines fading one by one; one pinned line that doesn't",
  },
  fieldGuide: ["Time", "Memories that fade", "Command book: bridge fdb del"],
};

const whoHasTheKey: RoomText = {
  title: "Who Has the Key?",
  mission: "Somewhere in these two halls, one machine keeps the key. You don't know which, or where.",
  access: { compass: SEALED, beacon: SEALED, anvil: SEALED, bell: SEALED, ember: SEALED },
  notes: [],
  hints: [
    { text: "You don't know where it is. Who could you ask all at once?" },
    { text: "Your broadcast." },
    {
      text: "A broadcast is flooded by every switch it meets, so it reaches every machine joined by switches.",
      codex: "span",
    },
    { text: "Broadcast, read who says they keep the key, then write to them by name." },
    {
      text: "Broadcast; anvil answers `I'm here — anvil (I keep the key)` from `02:00:00:00:00:0a`. Send it a frame by name.",
    },
  ],
  detectors: {
    "only-hall-a": {
      note: "Hall-a doesn't know everyone. One of its doors leads somewhere else.",
      tried: "You searched hall-a's memory only, and guessed from there.",
    },
  },
  debrief: {
    happened:
      "Your one broadcast reached every machine in both halls, because each switch flooded it on. Everything a broadcast can reach is called a broadcast domain.",
    terms: [
      {
        id: "broadcast-domain",
        term: "broadcast domain",
        meaning: "every machine a broadcast reaches: everything joined by switches",
      },
    ],
  },
  guardian: [
    {
      q: "Does a broadcast stop at the hall?",
      a: "Not at all. A switch sends it out every other door, and one of those doors leads to another switch, which does the same.",
    },
    {
      q: "How far does it go, then?",
      a: "As far as switches go. Everything joined by switches hears it, and that has a name you'll learn soon.",
    },
  ],
  building: {
    id: "F4-BLD-02",
    text: "Halls grew, so they were joined hall to hall. A frame could go anywhere in the Works now, and so could every broadcast.",
    shown: "halls joined by spans; a broadcast spreading through all of them",
  },
};

const spareCable: RoomText = {
  title: "The Spare Cable",
  mission:
    "Someone left a spare cable between the two halls, in case the first one ever broke. Plug it in, then get a message to anvil.",
  access: { compass: SEALED, beacon: SEALED, anvil: SEALED, bell: SEALED },
  notes: ["Left a spare cable between the halls, just in case. Two cables are safer than one. Surely."],
  hints: [
    { text: "Plug in the spare, then watch one broadcast. Where does it go after it crosses to the other hall?" },
    { text: "Read a hall's board, then read it again a few seconds later. Where is anvil now?" },
    {
      text: "Two halls joined by two cables make a circle: each hall floods every broadcast on to the other, round and round.",
      codex: "loop",
    },
    { text: "Take one of the two cables away, let the halls settle, then write to anvil." },
    {
      text: 'Unplug the spare again (hall-b\'s eth4). Wait a few seconds, then send anvil a frame: `lab send-frame --to 02:00:00:00:00:0a --msg "hello"`. It answers with the key.',
    },
  ],
  detectors: {
    "message-in-the-storm": {
      note: "In all those copies, a message can get lost or sent the wrong way. Let the halls settle first.",
      tried: "You wrote to anvil while the copies were still circling.",
    },
    "loop-again": {
      note: "That brings the circle back, and the copies with it.",
      tried: "You plugged a cable back in after the halls had settled, and the circle came back.",
    },
  },
  debrief: {
    happened:
      "With the spare plugged in, the two halls were joined twice: a switching loop. Every broadcast crossed one cable and came back over the other, again and again, and the copies piled up: a broadcast storm. The boards kept moving names between doors, because copies came in by every door. You took one cable away, the copies drained, and anvil's answer got through.",
    terms: [
      {
        id: "switching-loop",
        term: "switching loop",
        meaning: "switches joined in a circle, so frames can go round forever",
      },
      {
        id: "broadcast-storm",
        term: "broadcast storm",
        meaning: "broadcast copies circling a loop and multiplying until the network drowns",
      },
    ],
  },
  guardian: [
    {
      q: "Why did the same message keep coming back?",
      a: "Each hall sends a broadcast out of every other door. With two cables between them, what goes over one comes back over the other. Then round it goes again.",
    },
    {
      q: "Why did the boards keep changing their minds?",
      a: "A hall writes down the door a name came in by. The copies came in by both cables, one after another, so the line kept moving.",
    },
    {
      q: "So a spare cable is a bad idea?",
      a: "Not on its own. There's a way to keep one safely, where the halls talk to each other. I haven't found it yet.",
    },
  ],
  building: {
    id: "F4-BLD-03",
    text: "Someone always wants a second cable, in case the first one breaks. Nobody asked what a hall does with a message that comes back to it.",
    shown: "an old plan of two halls; a second cable drawn beside the first",
  },
  fieldGuide: ["Loops and storms"],
};

const storm: RoomText = {
  title: "The Storm",
  mission: "The great hall is drowning in its own messages. Somewhere inside, the key is still waiting.",
  access: { compass: SEALED, beacon: SEALED, anvil: SEALED, bell: SEALED, wren: SEALED },
  notes: [],
  hints: [
    { text: "Watch one broadcast. Where does it go after it crosses to the other hall?" },
    { text: "Count the cables between the two halls." },
    {
      text: "Two switches joined twice make a loop: each floods every broadcast back to the other, forever.",
      codex: "loop",
    },
    { text: "Break the loop by taking one of the two spans away, then check what hall-b remembers about wren." },
    {
      text: "Unplug `span-2` (or `ip link set eth4 down` in hall-b). Then in hall-b, `bridge fdb del 02:00:00:00:00:13 dev eth2 master`. Write to wren; it answers with the key.",
    },
  ],
  detectors: {
    "replug-old-cable": {
      // Inherited from 4.1 (floor-4.md); its words there are about lantern, so here they're about the span.
      note: "That cable was the trouble. Plug it back in and the copies start circling again.",
      tried: "You plugged a span back in after taking it away, and the loop came back.",
    },
    "delete-wrong-line": {
      note: "That one was right. Which line sends wren's frames to the wrong door?",
      tried: "You removed a line in hall-b that wasn't wren's.",
    },
    "only-hall-a": {
      note: "Hall-a doesn't know everyone. One of its doors leads somewhere else.",
      tried: "You searched hall-a's memory, but wren lives behind hall-b.",
    },
    "more-cables": {
      note: "More paths, more copies. What happens when a broadcast can go round and round?",
      tried: "You plugged in a cable while the storm was running.",
    },
    "only-the-loop": {
      note: "The storm is over. Is the hall's memory of wren right?",
      tried: "You stopped the storm, but hall-b's pinned line still sent wren's frames to the wrong door.",
    },
  },
  debrief: {
    happened:
      "Two spans between the same two halls made a switching loop. Every broadcast was flooded across one span and back across the other, again and again: the broadcast storm that drowned the Works. Removing one span stopped it. Then a pinned memory still pointed wren to the wrong door, and you cleared it.",
    terms: [],
  },
  voice: [
    {
      id: "F4-BOSS-01",
      speaker: "You",
      text: "So this is why the Works went quiet: a storm of copies. It's still going.",
    },
  ],
};

const floor4: FloorText = {
  name: "Memory and Loops",
  memory: [
    {
      id: "F4-FM-01",
      title: "The problem",
      text: "Memory restored. Machines moved, so the lists learned to forget. Halls grew, so they were joined. Then someone joined two halls twice, to be safe.",
    },
    {
      id: "F4-FM-02",
      title: "What happened",
      text: "One broadcast went round and round. Each switch did exactly what it should, and together they drowned the Works.",
    },
    {
      id: "F4-FM-03",
      title: "Ride-along",
      text: "Every switch obeyed. That was the trouble.",
      shown:
        "the camera rides a broadcast from hall-a across span into hall-b, which floods it back across span-2 into hall-a, which floods it across span again; the copies multiply around the ring while the ledgers flip lines between doors",
    },
    {
      id: "F4-FM-04",
      title: "What they did, and what's next",
      text: "Later the switches learned to talk to each other and switch off any path that made a circle. But the halls had grown too big for door names alone. Up the hill, every machine got an address.",
      shown:
        "the world map: the Sorting Works fully restored; the Lantern Town appears through thin mist on the terraces above",
    },
  ],
  journal: {
    page: 4,
    title: "Two of everything",
    where: "in the restored storm hall (glows after the win)",
    text: "Log 3,260. Someone added a second cable between every pair of halls, in case one broke. The Works went silent within the hour. Power at 41%.",
  },
  farewell: {
    id: "F4-BYE-01",
    speaker: "You",
    text: "The Works can hear themselves again. Next: the town up the hill.",
  },
};

/** Region 2's room text, by room id, and its floors' text, by floor number. */
export const region2Texts: Record<string, RoomText> = {
  "f3.many-doors": manyDoors,
  "f3.keepers-memory": keepersMemory,
  "f3.find-everyone": findEveryone,
  "f3.boss-busy-hall": busyHall,
  "f4.pinned-memory": pinnedMemory,
  "f4.who-has-the-key": whoHasTheKey,
  "f4.spare-cable": spareCable,
  "f4.boss-storm": storm,
  "f4.secret-peacekeeper": peacekeeper,
};
export const region2FloorTexts: Record<number, FloorText> = { 3: floor3, 4: floor4 };
