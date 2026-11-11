/**
 * Command memories (0041) and the Command book: how to read a command, word by word, its common
 * forms, and what its output means. One per command, when it first appears (floors/overview.md).
 */
export interface CommandMemory {
  id: string;
  /** The command it explains, as the Command book lists it. */
  command: string;
  /** Room where it first plays. */
  room: string;
  /** How any command is built: each word and its role. */
  anatomy: { word: string; role: string; meaning: string }[];
  intro: string;
  forms: { line: string; meaning: string }[];
  /** The room's real output, and what to look at in it (`match` is a piece of a line). */
  output: { text: string; marks: { match: string; meaning: string }[]; dimmed: string };
  /** The one action it ends on. */
  action: { say: string; type: string };
}

import { REGION_2_COMMANDS } from "./commands/region2";
import { REGION_3_COMMANDS } from "./commands/region3";
import { REGION_4_COMMANDS } from "./commands/region4";

export const commandMemories: Record<string, CommandMemory> = {
  ...REGION_2_COMMANDS,
  ...REGION_3_COMMANDS,
  ...REGION_4_COMMANDS,
  "CMD-01": {
    id: "CMD-01",
    command: "ip link",
    room: "f2.lights-out",
    intro:
      "A command is a short sentence for the machine. First the tool, then what you're asking about, then what to do, then which one, then how.",
    anatomy: [
      { word: "ip", role: "tool", meaning: "the tool for network settings" },
      { word: "link", role: "about what", meaning: "network interfaces (doors) and their links" },
      { word: "set", role: "do what", meaning: "change something" },
      { word: "eth0", role: "which one", meaning: "this door" },
      { word: "up", role: "how", meaning: "switched on. Not yet, that's your job." },
    ],
    forms: [
      { line: "ip link", meaning: "list every door" },
      { line: "ip link show eth0", meaning: "just this door" },
      { line: "ip link set eth0 up", meaning: "switch it on" },
      { line: "ip link set eth0 down", meaning: "switch it off" },
    ],
    output: {
      text: [
        "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000",
        "    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00",
        "2: eth0: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN mode DEFAULT group default qlen 1000",
        "    link/ether 02:00:00:00:00:05 brd ff:ff:ff:ff:ff:ff",
      ].join("\n"),
      marks: [
        { match: "eth0", meaning: "the door's name" },
        { match: "state DOWN", meaning: "switched off" },
        { match: "link/ether 02:00:00:00:00:05", meaning: "its name, the MAC address" },
        { match: "brd ff:ff:ff:ff:ff:ff", meaning: "the everyone address you already know" },
        { match: "lo", meaning: "the machine talking to itself. Every machine has one. You can ignore it for now." },
      ],
      dimmed: "You can ignore this for now.",
    },
    action: { say: "Now ask it yourself.", type: "ip link" },
  },
};
