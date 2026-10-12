import { DETECTORS, SEALED } from "./shared";
import type { RoomText } from "./types";

// Placeholders: {lanternMac} and {oldMac} (the Knight's old address on the card).

export const firstLight: RoomText = {
  title: "First Light",
  mission: "There's someone at the other end of this cable. Say hello, and make sure the message is for them.",
  notes: ["My workbench is still here. I never did finish that letter. Whoever's next door must be wondering."],
  hints: [
    { text: "Every door has a plate. What does your neighbor's say?" },
    { text: "Walk down the corridor. You can go into their room." },
    { text: "A frame only gets taken in by the door it's addressed to.", codex: "mac-address" },
    { text: "Copy the address from your neighbor's door plate into the 'to' field, then send." },
    {
      text: "Your neighbor's door, eth0 in lantern's room, has the address {lanternMac}. Put that in the workbench's 'to' field and press Send. The frame goes down the cable, lantern sees it's for them, and answers with the key.",
    },
  ],
  detectors: {
    "not-addressed-to-them": {
      ...DETECTORS["not-addressed-to-them"],
      tried: "You sent a frame that wasn't addressed to lantern, so lantern's door ignored it.",
    },
  },
  debrief: {
    happened:
      "You wrote lantern's address on the frame, and lantern's door took it in because it was meant for them. Then lantern wrote your address on its answer and sent it back the same way.",
    terms: [
      {
        term: "frame",
        meaning: "The envelope a message travels in across one cable: who it's to, who it's from, and the message.",
      },
      { term: "MAC address", meaning: "The name of one network door, six pairs of characters like 02:00:00:00:00:07." },
    ],
  },
};

export const wrongName: RoomText = {
  title: "Wrong Name",
  mission: "Your machine keeps sending messages to your neighbor on its own. Your neighbor never answers.",
  notes: ["I set up a messenger to keep calling next door. It never once got an answer. I could never work out why."],
  hints: [
    { text: "The messages reach the door. Then what?" },
    { text: "You can catch a message in the corridor and look inside." },
    { text: "A frame is only taken in by the machine it's addressed to.", codex: "opening-a-frame" },
    { text: "Compare the 'to' inside a caught message with the plate on your neighbor's door." },
    {
      text: "The card on the desk says {oldMac}, but lantern's door is {lanternMac}. Click the card and set it to lantern's address (it runs `lab card set --to {lanternMac}`). The next message gets an answer.",
    },
  ],
  detectors: {
    "own-message-not-messenger": {
      ...DETECTORS["own-message-not-messenger"],
      tried: "You sent your own message, which worked, but the messenger kept using the old address on its card.",
    },
  },
  debrief: {
    happened:
      "The messenger was writing an old address on every frame. Lantern's door looked at each one, saw it wasn't for lantern, and ignored it. Once the card had lantern's real address, the very next frame was taken in and answered.",
    terms: [
      { term: "destination address", meaning: "The 'to' on a frame: the MAC address of the door it's meant for." },
      {
        term: "ignoring frames",
        meaning: "A network card quietly throws away every frame that isn't addressed to it (or to everyone).",
      },
    ],
  },
};

export const lightsOut: RoomText = {
  title: "Lights Out",
  mission: "Nothing gets through this cable at all. Not even a little.",
  notes: [
    "My console still works. I used to type into it for hours. Press ` to open it, and type `help` if you're not sure where to start.",
  ],
  hints: [
    { text: "Look closely at your own door's light." },
    { text: "Your console can show the state of your doors. Try `ip link`." },
    { text: "A door can be switched off on purpose. Then nothing goes through it.", codex: "ip-link" },
    { text: "Find your door in the list `ip link` prints, and bring it up." },
    {
      text: "Type `ip link set eth0 up`. Your door's light comes on, the corridor works again, and your next message gets through.",
    },
  ],
  detectors: {
    "sending-into-a-dark-door": {
      ...DETECTORS["sending-into-a-dark-door"],
      tried: "You sent more messages, but your machine couldn't send anything while its door was switched off.",
    },
  },
  debrief: {
    happened:
      "Your own door was switched off, so your machine wouldn't put anything on the cable at all. One command switched it on. The light came back, and your message went through.",
    terms: [
      { term: "interface", meaning: "A machine's network door, with a name like eth0. `ip link` lists them." },
      { term: "link up / down", meaning: "Whether a door is switched on. A link that's down carries nothing." },
    ],
  },
};

export const whoAreYou: RoomText = {
  title: "Who Are You?",
  mission: "Your neighbor's door is sealed, so you can't read their name. Get their key anyway.",
  access: { lantern: SEALED },
  notes: [
    "They sealed the room next door before I got here. I always wondered if there was an address every machine listens to.",
  ],
  hints: [
    { text: "If you don't know a name, can you call everyone?" },
    { text: "There's an address that every machine listens to. It's all f's: ff:ff:ff:ff:ff:ff." },
    { text: "Answers come with the sender's address written on them.", codex: "opening-a-frame" },
    { text: "Send to everyone, catch the answer, read its 'from', then send straight to that address." },
    {
      text: `Send a frame to ff:ff:ff:ff:ff:ff. Lantern answers "I'm here — lantern" from {lanternMac}. Catch that answer, read its 'from', and send a frame to {lanternMac}. The direct answer carries the key.`,
    },
  ],
  detectors: {
    "didnt-read-the-answer": {
      ...DETECTORS["didnt-read-the-answer"],
      tried: "You called everyone again after lantern had already answered, without using the address on its answer.",
    },
  },
  debrief: {
    happened:
      "You couldn't read lantern's plate, so you called everyone at once. Lantern answered, and every answer carries the sender's own address. You read it, then wrote to lantern directly, and the direct answer brought the key.",
    terms: [
      { term: "broadcast", meaning: "A frame to everyone on the cable, addressed to ff:ff:ff:ff:ff:ff." },
      { term: "source address", meaning: "The 'from' on a frame: the MAC address of the door that sent it." },
    ],
  },
};

export const silentLine: RoomText = {
  title: "The Silent Line",
  mission: "Your machine has been calling the other side for years, and nobody has ever answered. Make it heard.",
  access: { lantern: SEALED },
  notes: ["This is where I gave up. The line has been silent as long as I can remember."],
  hints: [
    { text: "More than one thing is wrong here. Start with what you can see on your own door." },
    { text: "Your console, the card on your desk, and the corridor will each tell you something." },
    { text: "A message needs a working door, the right name, and a way to find that name out.", codex: "sealed-room" },
    { text: "Bring your door up. Then find out lantern's address without going in. Then fix the card." },
    {
      text: "Type `ip link set eth0 up`. Send a frame to ff:ff:ff:ff:ff:ff and read the 'from' on lantern's answer: {lanternMac}. Then set the card: `lab card set --to {lanternMac}`. The messenger's next message is answered with the key.",
    },
  ],
  detectors: {
    "sending-into-a-dark-door": {
      ...DETECTORS["sending-into-a-dark-door"],
      tried: "You tried to send while your door was still switched off.",
    },
    "own-message-not-messenger": {
      ...DETECTORS["own-message-not-messenger"],
      tried: "Your own message got through, but the messenger's card still had the old address.",
    },
    "didnt-read-the-answer": {
      ...DETECTORS["didnt-read-the-answer"],
      tried: "You called everyone again after lantern had already answered.",
    },
    "not-addressed-to-them": {
      ...DETECTORS["not-addressed-to-them"],
      tried: "You sent a frame with a name lantern doesn't answer to.",
    },
  },
  debrief: {
    happened:
      "Three things kept the line silent. Your own door was switched off, so nothing left. The card had an old name on it, so lantern ignored every message. And lantern's room was sealed, so you had to call everyone and read the 'from' on the answer. You fixed all three, and the messenger was finally heard.",
    terms: [],
  },
};
