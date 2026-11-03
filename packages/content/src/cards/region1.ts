import type { Card } from "./types";

/** The Prologue and Floors 1–2 (floors/prologue.md, floor-1.md, floor-2.md), word for word. */
export const REGION_1_CARDS: Card[] = [
  {
    id: "cable",
    floor: 0,
    title: "Cable",
    text: "This corridor is a cable. Messages travel along it from one machine to the other.",
    more: "A cable joins exactly two doors, one at each end. It never splits. When a message and its answer have both made it through, the corridor lights up.",
  },
  {
    id: "message",
    floor: 0,
    title: "Message",
    text: "That light is a message on its way. You can watch it travel.",
    more: "Everything a network does comes down to messages like this one, moving from machine to machine.",
  },
  {
    id: "scrying-glass",
    floor: 0,
    title: "Map",
    text: "The Map shows the whole floor at once: every room, every corridor, every message moving. Press G to open it from anywhere.",
    more: "You can watch anything on the Map, but you can't change anything from it. Zoom out and you'll see how much of the palace is still lost in fog.",
  },
  {
    id: "door",
    floor: 1,
    title: "Door",
    text: "Each door is where a cable plugs into this machine. A machine can have one door or many.",
  },
  {
    id: "plate",
    floor: 1,
    title: "Plate",
    text: "The plate by a door shows its name and a light that's on when the cable is working.",
  },
  {
    id: "link-light",
    floor: 1,
    title: "Link light",
    text: "A filled diamond means the cable is working; a hollow ring means it isn't.",
  },
  {
    id: "cable-end",
    floor: 1,
    title: "Cable end",
    text: "The end of a cable, where it meets a door. If it's not plugged in, nothing can cross.",
  },
  {
    id: "door-switch",
    floor: 1,
    title: "Door switch",
    text: "Every door can be switched on or off. Switched off, it carries nothing, even with the cable plugged in.",
  },
  {
    id: "frame",
    floor: 2,
    title: "Frame",
    text: "A message travels in a frame: an envelope with who it's to, who it's from, and the message itself.",
  },
  {
    id: "mac-address",
    floor: 2,
    title: "MAC address",
    text: "Every door has a name like 02:00:00:00:00:07. It's written on the plate, and it's how frames find the right door.",
  },
  { id: "workbench", floor: 2, title: "Workbench", text: "A table for building a frame by hand." },
  {
    id: "messenger",
    floor: 2,
    title: "Messenger",
    text: "A small machine that sends the same message over and over, to the name on its card.",
  },
  {
    id: "capture-jar",
    floor: 2,
    title: "Captures",
    text: "Catch a message in flight and you keep a copy to open and read. The message still goes on its way.",
  },
  {
    id: "ignored-mark",
    floor: 2,
    title: "Ignored mark",
    text: "A frame reached this door, but it wasn't for this door, so it went no further.",
  },
  {
    id: "everyone-address",
    floor: 2,
    title: "Everyone address",
    text: "ff:ff:ff:ff:ff:ff isn't one door's name. It means everyone.",
  },
  {
    id: "sealed-room",
    floor: 2,
    title: "Sealed room",
    text: "You can't go in, but anything you send can. Listen for what comes back.",
  },
  {
    id: "source-address",
    floor: 2,
    title: "Source address",
    text: "The from on a frame: the name of the door that sent it.",
  },
  {
    id: "console",
    floor: 2,
    title: "Console",
    text: "Where you speak to a machine in its own words. Each machine has its own; you speak to the one in the room you're in.",
  },
  {
    id: "makers-mark",
    floor: 2,
    title: "Maker's mark",
    text: "The first half of a door's name: who made the door. A name starting with 02 was chosen by a person instead.",
  },
];
