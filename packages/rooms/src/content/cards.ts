/**
 * Discovery cards (SRS §11.1, Appendix B). Cards name OBJECTS the player can see, never the ideas a
 * room teaches (those wait for the debrief). 2–3 short lines, plus a longer "Tell me more".
 */
export interface Card {
  id: string;
  floor: number;
  title: string;
  text: string;
  more: string;
}

const CARDS = [
  {
    id: "corridor",
    floor: -1,
    title: "Cable",
    text: "This corridor is a cable. Messages travel along it from one machine to the other.",
    more: "A cable joins exactly two doors, one at each end. It never splits. When a message and its answer have both made it through, the corridor lights up.",
  },
  {
    id: "message",
    floor: -1,
    title: "Message",
    text: "That light is a message on its way. You can watch it travel.",
    more: "Everything a network does comes down to messages like this one, moving from machine to machine.",
  },
  {
    id: "scrying-glass",
    floor: -1,
    title: "Scrying Glass",
    text: "The Glass shows the whole floor at once: every room, every corridor, every message moving. Press G to open it from anywhere.",
    more: "You can watch anything through the Glass, but you can't change anything through it. To do something, go to the room where it belongs.",
  },
  {
    id: "door",
    floor: 0,
    title: "Door",
    text: "Each door is where a cable plugs into this machine. A machine can have one door or many.",
    more: "On a real computer this is a network port, like the socket you plug an Ethernet cable into. Linux gives each one a name, like eth0.",
  },
  {
    id: "plate",
    floor: 0,
    title: "Plate",
    text: "The plate by a door shows its name, its address, and a light that's on when the cable is working.",
    more: "The address on the plate belongs to this door, not to the whole machine. A machine with three doors has three of them.",
  },
  {
    id: "frame",
    floor: 0,
    title: "Frame",
    text: "A message travels inside a frame: an envelope with a 'to', a 'from', and the message itself.",
    more: "The frame only lasts for one cable. Whoever is at the other end opens it and decides whether it was for them.",
  },
  {
    id: "mac-address",
    floor: 0,
    title: "MAC address",
    text: "Six pairs of characters, like 02:00:00:00:00:07. It's the name of one door, and it's what a frame's 'to' and 'from' are written in.",
    more: "Every network door in the world has one, set when the hardware was made. Ours start with 02, which marks an address someone chose by hand.",
  },
  {
    id: "workbench",
    floor: 0,
    title: "Workbench",
    text: "The workbench builds a frame by hand: write who it's to, seal it, and send it.",
    more: "Sending from the workbench runs a lab command in your console, so you can see what it did. Lab tools only exist in Wirelight.",
  },
  {
    id: "knights-note",
    floor: 0,
    title: "The Knight's note",
    text: "The Knight left notes all over this place. Some just say hello. Some react to what you've just tried.",
    more: "When you're stuck, a new note may turn up with a hint. Notes never do the work for you, but they point you where to look.",
  },
  {
    id: "keyring",
    floor: 0,
    title: "Keyring",
    text: "Every key you win goes on your keyring. You'll find it in the menu.",
    more: "Keys come back inside answers. When an answer reaches you with a key in it, the lock takes it and the way on opens.",
  },
  {
    id: "address-card",
    floor: 0,
    title: "Address card",
    text: "The Knight's messenger sends a message every few seconds to whatever address is written on this card.",
    more: "The card is a lab tool. In the console, `lab card show` reads it and `lab card set --to` changes it.",
  },
  {
    id: "capture-jar",
    floor: 0,
    title: "Capture jar",
    text: "Click a message as it passes to catch a copy. The original keeps going; your copy goes in the jar.",
    more: "The jar keeps your catches while you move between rooms, and after a reset. Open a catch to look inside.",
  },
  {
    id: "opening-a-frame",
    floor: 0,
    title: "Opening a frame",
    text: "A caught frame opens like an envelope: who it's to, who it's from, what kind it is, and what's inside.",
    more: "Some frames carry something sealed inside. You'll learn to open that layer later.",
  },
  {
    id: "console",
    floor: 0,
    title: "Console",
    text: "This machine's command line. What you type here runs on this machine and nowhere else.",
    more: "These are real Linux commands. What works here works on a real computer. Commands starting with lab are Wirelight's own.",
  },
  {
    id: "link-light",
    floor: 0,
    title: "Link light",
    text: "The light on a door's plate. A filled diamond means the cable is working; a hollow ring means it isn't.",
    more: "On a real computer this is the little light by the network socket.",
  },
  {
    id: "ip-link",
    floor: 0,
    title: "ip link",
    text: "Lists this machine's doors: their names, their addresses, and whether each one is up.",
    more: "It's the same command on any Linux machine. `man ip` tells you more.",
  },
  {
    id: "sealed-room",
    floor: 0,
    title: "Sealed room",
    text: "Some rooms are sealed. You can watch their doors and the corridors leading to them, but you can't go in.",
    more: "When you can't walk in to read something, you have to find it out another way.",
  },
] as const satisfies readonly Card[];

export type CardId = (typeof CARDS)[number]["id"];

export const cards: Record<CardId, Card> = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<CardId, Card>;
export const cardIds = CARDS.map((c) => c.id) as CardId[];
