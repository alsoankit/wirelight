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
    text: "These halls are switches: machines that pass messages between many other machines at once. Or they did.",
  },
  {
    id: "R2-ARRIVE-03",
    speaker: "You",
    text: "My logs say this place was always busy. Now it's silent. Let's find out why.",
  },
];

// ── Floor 3 · The Switch ───────────────────────────────────────────────────────────────────

const manyDoors: RoomText = {
  title: "Sort It by Hand",
  mission:
    "This hall is a switch, and its keeper (the part that picks which door each frame leaves by) has stopped. Pass frames on by hand at its desk until the keeper takes over again.",
  notes: [],
  hints: [
    { text: "A frame is waiting at the desk. Read it." },
    {
      text: "The desk has two buttons: Remember writes down where the sender is, and Send picks the door the frame leaves by.",
    },
    {
      text: "A switch writes down each frame's From and the door it came in by. Then it looks up the frame's To on its board.",
      codex: "mac-board",
    },
    { text: "If the board knows the To, send the frame out that door. If not, send it out every other door." },
    {
      text: "First frame: Remember, then Send out every other door. Forge's answer: Remember, then Send out eth0. Next frame: Send out eth3. The keeper will take over.",
    },
  ],
  detectors: {
    "back-where-it-came": {
      note: "That's the door it came in by. The sender already has it.",
      tried: "You sent a frame back out of the door it came in by.",
    },
    "guess-a-door": {
      note: "The board didn't know where forge was yet, so any one door is a guess. When the To is unknown, the frame goes out every other door.",
      tried: "You picked one door for a name the board didn't know yet.",
    },
    "flood-everything": {
      note: "You already wrote down where that one lives. Look at the board.",
      tried: "You sent a frame out of every other door when the board already knew its door.",
    },
    "forgot-to-remember": {
      note: "Press Remember first: this frame's From tells the board which door its sender is behind.",
      tried: "You sent frames on without writing down who they were from.",
    },
  },
  debrief: {
    happened:
      "You did a switch's job. A switch writes down each frame's From address and the door it came in by: that list is its MAC table. When it doesn't know which door a frame's To is behind, it sends the frame out every other door: that's flooding. Once it knows, the frame goes out one door only, so other machines never see it.",
    terms: [
      { id: "mac-table", term: "MAC table", meaning: "a switch's list of which MAC address is behind which door" },
      {
        id: "flooding",
        term: "flooding",
        meaning: "sending a frame out every other door when the switch doesn't know which door its To is behind",
      },
    ],
  },
  memories: [
    {
      id: "F3-MEM-01",
      title: "The keeper",
      trigger: "on entering",
      text: "Every machine has a keeper: the part of it that decides where each message goes next. This hall's keeper has stopped, but its desk still works. I can do its job by hand.",
      action: "press Remember on the waiting frame",
    },
  ],
  questions: [
    {
      q: "What is this hall?",
      a: "A switch: a machine with many doors that passes frames between them. Every frame comes in one door and leaves by another. Choosing which one is the switch's job.",
    },
    {
      q: "Why write down the from?",
      a: "Whoever sent a frame must be behind the door it came in by. Writing that down means the next frame for them can go straight to that door.",
    },
    {
      q: "What if the keeper doesn't know the to?",
      a: "Then it can't choose, so it sends the frame out of every other door and lets the doors sort it out.",
    },
    {
      q: "Why not send everything everywhere?",
      a: "Then every machine would have to read every frame in the hall. That wastes time, and everyone sees everyone else's messages.",
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
      text: "It's working again. Its screen says: read the From, write it down. Read the To, look it up. Known: one door. Unknown: every other door.",
    },
  ],
};

const keepersMemory: RoomText = {
  title: "What the Hall Remembers",
  mission:
    "Get gate, the machine behind the hall's door eth3, to answer you. You don't know its MAC address, and the hall's board is too clouded to read.",
  access: { pantry: SEALED, attic: SEALED, gate: SEALED },
  notes: ["The one behind the third door is waiting for a message."],
  hints: [
    { text: "The board can't be read, but the hall itself can tell you what's in its MAC table." },
    { text: "Go into the hall's room and open the terminal there: `bridge fdb show` lists its MAC table." },
    { text: "A switch only learns a name when that machine sends something.", codex: "switch" },
    { text: "Get gate to send something, then ask the hall which name is behind eth3, then write to that name." },
    {
      text: "Send a broadcast from the Frame builder. Then in the hall: `bridge fdb show` shows `02:00:00:00:00:0f dev eth3`. Send a frame to `02:00:00:00:00:0f`; gate answers.",
    },
  ],
  detectors: {
    "expects-gate-listed": {
      note: "Same list as before. The hall only learns a MAC address when that machine sends a frame. Get gate to send something first.",
      tried: "You read the hall's MAC table again before anyone new had sent anything.",
    },
    guessing: {
      note: "Guessing names could take forever. Send a broadcast instead: every machine hears it, and most answer.",
      tried: "You guessed names that no door has.",
    },
    "wrong-console": {
      note: "Your machine isn't a switch, so it has no MAC table. Run the command in the hall's terminal.",
      tried: "You asked your own machine for a switch's memory.",
    },
  },
  debrief: {
    happened:
      "A switch only knows MAC addresses it has seen as a frame's source address, and gate had never sent anything. Your broadcast made gate answer, and the hall learned gate's address and door from that answer: that's learning from the source. Then `bridge fdb show` told you its name. Real switches learn this way from every frame that passes through.",
    terms: [
      {
        id: "learning-from-the-source",
        term: "learning from the source",
        meaning: "a switch learns which door a machine is behind from the From of the frames it sends",
      },
    ],
  },
  questions: [
    {
      q: "Why isn't gate in the MAC table?",
      a: "The hall only writes down names it has seen in a frame's From. Gate hasn't sent anything yet.",
    },
    {
      q: "How do I make gate send something?",
      a: "Send a broadcast. Most machines answer one.",
    },
    {
      q: "Why does Linux say bridge?",
      a: "A bridge is another word for a switch: same job, older name. Linux calls its built-in switch a bridge.",
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
  title: "Fill In the Destinations",
  mission:
    "You started three repeating sends, one for each door of the hall, but their destinations are wrong. Find which machine is behind each door and set each destination.",
  access: { bakery: SEALED, larder: SEALED, chapel: SEALED },
  notes: [],
  hints: [
    {
      text: "Three repeating sends, three doors, three MAC addresses you don't know yet. The hall's MAC table can tell you all three.",
    },
    {
      text: "Do what you did for gate: a broadcast from the Frame builder, then `bridge fdb show` in the hall's terminal.",
    },
    {
      text: "The hall learns the name of every machine that sends something, and remembers its door.",
      codex: "mac-board",
    },
    { text: "Make them all send something, read the hall's MAC table, then set each repeating send's destination." },
    {
      text: "Broadcast, then `bridge fdb show` in the hall: eth1 is `…:10`, eth2 is `…:11`, eth3 is `…:12`. Stop each wrong send and start it again with the matching destination.",
    },
  ],
  detectors: {},
  debrief: {
    happened:
      "One broadcast taught the hall every MAC address at once, and its MAC table told you who is behind which door. That's a switch at work: it learns everyone without being told.",
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
  mission:
    "One machine on this hall, laundry, never got your message and is still waiting. Find out why, and get your message to it.",
  access: { pantry: SEALED, attic: SEALED, laundry: SEALED },
  notes: [],
  hints: [
    { text: "One of the hall's doors is dark. Look at the lights on the hall's plates." },
    { text: "Its switch is broken. Use the hall's terminal." },
    { text: "A machine behind a dark door can't hear a broadcast, or answer one.", codex: "everyone-address" },
    {
      text: "Switch the door on in the hall, make laundry send something, read its MAC address from the hall's MAC table, then start a repeating send to it.",
    },
    {
      text: "In the hall: `ip link set eth2 up`. Broadcast. `bridge fdb show` shows `02:00:00:00:00:13 dev eth2`. Set To to that address and choose Keep sending; laundry answers.",
    },
  ],
  detectors: {
    "expects-gate-listed": {
      note: "Same list as before. The hall only learns a MAC address when that machine sends a frame.",
      tried: "You read the hall's MAC table again before anyone new had sent anything.",
    },
    "wrong-console": {
      note: "Your machine isn't a switch, so it has no MAC table. Run the command in the hall's terminal.",
      tried: "You asked your own machine for a switch's memory.",
    },
    guessing: {
      note: "Guessing names could take forever. Send a broadcast instead: every machine that can hear it answers.",
      tried: "You guessed names that no door has.",
    },
    "wrong-door-name": {
      note: "The hall has no door by that name. Type `ip link` in the hall's terminal to see its doors.",
      tried: "You named a door the hall doesn't have.",
    },
    "broadcast-before-link": {
      note: "Everyone answered except laundry: its door on the hall is down, so the broadcast never reached it.",
      tried: "You sent a broadcast while laundry's door was still switched off.",
    },
  },
  debrief: {
    happened:
      "Laundry was behind one of the hall's doors that was switched off, so nothing reached it and it never sent anything. Once the door was up, a broadcast made laundry answer, the hall learned its MAC address from the source address, and your frame got through. A switch can only learn about machines whose frames reach it.",
    terms: [],
  },
  voice: [
    {
      id: "F3-BOSS-01",
      speaker: "You",
      text: "The busiest hall in the Works. One machine here never got its message.",
    },
  ],
};

const floor3: FloorText = {
  name: "Switches",
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
      text: "Learn where senders are from the From. Pick the door from the To.",
      shown:
        "the camera rides a frame from the observatory into the hall. At the desk the keeper's lens reads the from (a line writes itself on the ledger) and the to (the ledger is searched, a line glows); a single chute opens and the frame drops out eth3 alone. Then a frame to an unknown name: the keeper hesitates, copies it, and the copies fan out every other door.",
    },
    {
      id: "F3-FM-04",
      title: "What's next",
      text: "But a list can be wrong, and a line can stay after it stops being true. Something went very wrong here once. That's the next floor.",
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
  title: "Moved Out",
  mission:
    "Kitchen's cable was moved to a different door of the hall, and since then nothing sent to kitchen arrives. Find out why and get kitchen to answer again.",
  access: { alcove: "Nobody lives at the far end of this corridor any more. Its cable lies loose on the floor." },
  notes: [],
  hints: [
    { text: "Follow a frame for kitchen and watch which door it leaves the hall by." },
    { text: "In the hall's terminal, read its MAC table with `bridge fdb show` and find kitchen's line." },
    { text: "Most memories fade when a machine goes quiet. A pinned one never does.", codex: "pinned-memory" },
    { text: "Remove the wrong line, then let the hall learn again." },
    {
      text: "In the hall: `bridge fdb del 02:00:00:00:00:07 dev eth1 master`. The next frame floods, kitchen answers from eth3, and the hall learns the right door.",
    },
  ],
  detectors: {
    "replug-old-cable": {
      note: "That corridor leads nowhere now. Kitchen isn't behind that door anymore.",
      tried: "You plugged in the old cable, but nobody lives at its far end now.",
    },
    "wait-for-fade": {
      note: "Library's line faded, but kitchen's didn't. Compare the two lines in `bridge fdb show`: kitchen's has an extra word.",
      tried: "You waited for kitchen's line to fade, but a pinned line never does.",
    },
    "delete-wrong-line": {
      note: "That line was right. Find the line that sends kitchen's frames to the wrong door.",
      tried: "You removed library's line, which was right.",
    },
  },
  debrief: {
    happened:
      "A switch forgets a machine after five minutes of silence, so its MAC table follows machines when they move. That's ageing. But kitchen's line had been pinned by hand, a static entry, so it never faded and kept pointing at the old door. You removed it, the hall flooded the next frame once, and learned the right door. On real networks, a forgotten static entry is a common cause of this exact fault.",
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
      text: "I can speed time up. The network doesn't mind; things just happen sooner. I'll watch the hall's MAC table while it runs fast.",
      action: "set time to fast, then back to normal",
    },
  ],
  questions: [
    {
      q: "Why do memories fade?",
      a: "Machines move. If the keeper never forgot, it would keep sending to doors where nobody is anymore. Forgetting the quiet ones keeps its list true.",
    },
    { q: "How long does it remember?", a: "Five minutes of silence. Then the line goes." },
    {
      q: "Why does kitchen's line never fade?",
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
  title: "Ask Everyone",
  mission:
    "One machine somewhere in these two halls is waiting for your message, and you don't know which one or where it is. Find it and write to it.",
  access: { pantry: SEALED, attic: SEALED, forge: SEALED, chapel: SEALED, bakery: SEALED },
  notes: [],
  hints: [
    { text: "You don't know where it is, so ask every machine at once." },
    { text: "Send a broadcast: every machine joined by the halls hears it." },
    {
      text: "A broadcast is flooded by every switch it meets, so it reaches every machine joined by switches.",
      codex: "span",
    },
    { text: "Broadcast, read which machine says it's waiting for you, then write to it by name." },
    {
      text: "Broadcast; forge answers `I'm here — forge. I'm the one waiting for your message.` from `02:00:00:00:00:0a`. Send it a frame by name.",
    },
  ],
  detectors: {
    "only-hall-a": {
      note: "Hall-a's MAC table only lists machines it has heard from. One of its doors leads to a second hall, with more machines behind it.",
      tried: "You searched hall-a's memory only, and guessed from there.",
    },
  },
  debrief: {
    happened:
      "Your one broadcast reached every machine in both halls, because each switch flooded it on to the next. Everything a broadcast can reach is called a broadcast domain. On a real network, that's every machine joined together by switches.",
    terms: [
      {
        id: "broadcast-domain",
        term: "broadcast domain",
        meaning: "every machine a broadcast reaches: everything joined by switches",
      },
    ],
  },
  questions: [
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
  title: "One Cable Too Many",
  mission:
    "Someone left a spare cable between the two halls, in case the first one ever broke. Plug it in, then get a message to forge.",
  access: { pantry: SEALED, attic: SEALED, forge: SEALED, chapel: SEALED },
  notes: ["Left a spare cable between the halls, just in case. Two cables are safer than one. Surely."],
  hints: [
    { text: "Plug in the spare, then watch one broadcast. Where does it go after it crosses to the other hall?" },
    {
      text: "Read a hall's MAC table, then read it again a few seconds later, and compare which door forge is behind each time.",
    },
    {
      text: "Two halls joined by two cables make a circle: each hall floods every broadcast on to the other, round and round.",
      codex: "loop",
    },
    { text: "Take one of the two cables away, let the halls settle, then write to forge." },
    {
      text: 'Unplug the spare again (hall-b\'s eth4). Wait a few seconds, then send forge a frame: `lab send-frame --to 02:00:00:00:00:0a --msg "hello"`. It answers.',
    },
  ],
  detectors: {
    "message-in-the-storm": {
      note: "In all those copies, a message can get lost or sent the wrong way. Let the halls settle first.",
      tried: "You wrote to forge while the copies were still circling.",
    },
    "loop-again": {
      note: "That brings the circle back, and the copies with it.",
      tried: "You plugged a cable back in after the halls had settled, and the circle came back.",
    },
  },
  debrief: {
    happened:
      "With the spare plugged in, the two halls were joined twice: a switching loop. Every broadcast crossed one cable and came back over the other, again and again, and the copies piled up: a broadcast storm. The MAC tables kept moving addresses from door to door, because the copies came in by both cables. You took one cable away, the copies drained, and forge's answer got through.",
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
  questions: [
    {
      q: "Why did the same message keep coming back?",
      a: "Each hall sends a broadcast out of every other door. With two cables between them, what goes over one comes back over the other. Then round it goes again.",
    },
    {
      q: "Why did the boards keep changing their minds?",
      a: "A hall writes down the door a frame came in by. The copies came in by both cables, one after another, so the line kept moving.",
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
  mission:
    "The halls are flooded with copies of the same messages, and nothing gets through. Stop the flood, then get a message to laundry.",
  access: { pantry: SEALED, attic: SEALED, forge: SEALED, chapel: SEALED, laundry: SEALED },
  notes: [],
  hints: [
    { text: "Watch one broadcast. Where does it go after it crosses to the other hall?" },
    { text: "Count the cables between the two halls." },
    {
      text: "Two switches joined twice make a loop: each floods every broadcast back to the other, forever.",
      codex: "loop",
    },
    {
      text: "Break the loop by taking one of the two spans away, then read hall-b's MAC table and find laundry's line.",
    },
    {
      text: "Unplug `span-2` (or `ip link set eth4 down` in hall-b). Then in hall-b, `bridge fdb del 02:00:00:00:00:13 dev eth2 master`. Write to laundry; it answers.",
    },
  ],
  detectors: {
    "replug-old-cable": {
      // Inherited from 4.1 (floor-4.md); its words there are about kitchen, so here they're about the span.
      note: "That cable was the trouble. Plug it back in and the copies start circling again.",
      tried: "You plugged a span back in after taking it away, and the loop came back.",
    },
    "delete-wrong-line": {
      note: "That line was right. Find the line that sends laundry's frames to the wrong door.",
      tried: "You removed a line in hall-b that wasn't laundry's.",
    },
    "only-hall-a": {
      note: "Laundry isn't behind hall-a. Hall-a's door to the other hall leads to hall-b, where laundry is.",
      tried: "You searched hall-a's memory, but laundry lives behind hall-b.",
    },
    "more-cables": {
      note: "More cables between the halls make more circles, and every circle adds more copies. The storm needs fewer cables, not more.",
      tried: "You plugged in a cable while the storm was running.",
    },
    "only-the-loop": {
      note: "The storm is over, but frames for laundry still go the wrong way. Read hall-b's MAC table and check laundry's line.",
      tried: "You stopped the storm, but hall-b's pinned line still sent laundry's frames to the wrong door.",
    },
  },
  debrief: {
    happened:
      "Two spans between the same two halls made a switching loop. Every broadcast was flooded across one span and back across the other, again and again: the broadcast storm that drowned the Works. Removing one span stopped it. Then a static entry in hall-b still pointed laundry to the wrong door, and you removed it.",
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
  name: "Switch Tables and Loops",
  memory: [
    {
      id: "F4-FM-01",
      title: "The problem",
      text: "Memory restored. Machines moved, so the lists learned to forget. Halls grew, so they were joined. Then someone joined two halls twice, to be safe.",
    },
    {
      id: "F4-FM-02",
      title: "What happened",
      text: "One broadcast went round and round. Each switch did exactly what it should, and together they flooded the Works.",
    },
    {
      id: "F4-FM-03",
      title: "Ride-along",
      text: "Every switch did exactly its job. The loop was the trouble.",
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
    text: "The Works pass messages again. Next: the town up the hill.",
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
