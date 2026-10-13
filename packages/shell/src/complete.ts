/**
 * Tab completion (UI-09): unlocked commands, their words, and known names (this machine's doors).
 * Never offers a tool the player hasn't found yet.
 */
import type { DeviceId, Simulator } from "@wirelight/sim";
import type { ToolId } from "./types";

const BUILTINS = ["clear", "exit", "help", "history", "hostname", "man"];

/** Which tool each first word needs (any one of them). */
const PROGRAMS: Record<string, ToolId[]> = {
  ip: ["ip link", "ip addr", "ip route", "ip neigh"],
  lab: ["lab send-frame", "lab card", "lab cable", "lab keeper", "lab slate"],
  bridge: ["bridge fdb"],
  ping: ["ping"],
  tcpdump: ["tcpdump"],
  sysctl: ["sysctl"],
  dhclient: ["dhclient"],
};

/** The words that may follow a prefix, each with the tool it needs (null: always). */
const NEXT: Record<string, [string, ToolId | null][]> = {
  ip: [
    ["link", "ip link"],
    ["addr", "ip addr"],
    ["route", "ip route"],
    ["neigh", "ip neigh"],
  ],
  "ip link": [
    ["show", null],
    ["set", null],
  ],
  "ip addr": [
    ["show", null],
    ["add", null],
    ["del", null],
    ["flush", null],
  ],
  "ip route": [
    ["show", null],
    ["add", null],
    ["del", null],
    ["get", null],
    ["replace", null],
  ],
  "ip neigh": [
    ["show", null],
    ["add", null],
    ["del", null],
    ["flush", null],
  ],
  lab: [
    ["send-frame", "lab send-frame"],
    ["card", "lab card"],
    ["cable", "lab cable"],
    ["keeper", "lab keeper"],
    ["slate", "lab slate"],
  ],
  "lab cable": [
    ["plug", null],
    ["unplug", null],
  ],
  "lab keeper": [
    ["show", null],
    ["learn", null],
    ["send", null],
    ["arp-ask", null],
    ["wrap", null],
    ["forward", null],
  ],
  "lab slate": [
    ["list", null],
    ["catch", null],
    ["open", null],
    ["trace", "lab slate trace"],
    ["compare", "lab slate trace"],
  ],
  "lab slate catch": [["--next", null]],
  "lab slate trace": [["--next", null]],
  "lab card": [
    ["--to", null],
    ["--messenger", null],
  ],
  bridge: [["fdb", "bridge fdb"]],
  "bridge fdb": [
    ["show", null],
    ["add", null],
    ["del", null],
  ],
  sysctl: [
    ["-w", null],
    ["net.ipv4.ip_forward", null],
  ],
  "sysctl -w": [["net.ipv4.ip_forward=1", null]],
  tcpdump: [
    ["-n", null],
    ["-i", null],
  ],
  "tcpdump -n": [["-i", null]],
  dhclient: [["-v", null]],
};

/** Prefixes after which a door name comes next (as well as after `dev` and `-i`). */
const DOOR_NEXT = new Set(["ip link set", "ip link show", "lab cable plug", "lab cable unplug"]);

export interface Completion {
  /** Every word that fits what's typed. */
  candidates: string[];
  /** The line with the typed word completed as far as all candidates agree (a space added when there's one). */
  line: string;
}

export function complete(sim: Simulator, device: DeviceId, line: string, tools: ReadonlySet<ToolId>): Completion {
  const words = line.split(/\s+/);
  const partial = words.pop() ?? "";
  const before = words.filter(Boolean);
  const has = (t: ToolId | null) => t === null || tools.has(t);
  let options: string[];
  if (before.length === 0) {
    const programs = Object.entries(PROGRAMS)
      .filter(([, need]) => need.some((t) => tools.has(t)))
      .map(([name]) => name);
    options = [...BUILTINS, ...programs];
  } else {
    const key = before.join(" ");
    const first = before[0] ?? "";
    const last = before.at(-1) ?? "";
    const doors = (sim.device(device)?.ifaces ?? []).map((i) => i.name);
    if (!BUILTINS.includes(first) && !(PROGRAMS[first] ?? []).some((t) => tools.has(t))) options = [];
    else if (last === "dev" || last === "-i" || DOOR_NEXT.has(key)) options = doors;
    else if (/^ip link set \S+$/.test(key)) options = ["up", "down"];
    else options = (NEXT[key] ?? []).filter(([, t]) => has(t)).map(([w]) => w);
  }
  const candidates = options.filter((o) => o.startsWith(partial)).sort();
  if (candidates.length === 0) return { candidates, line };
  const common = candidates.reduce((a, b) => {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    return a.slice(0, i);
  });
  const head = line.slice(0, line.length - partial.length);
  return { candidates, line: head + common + (candidates.length === 1 ? " " : "") };
}
