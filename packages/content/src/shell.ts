/** Text the shell needs (help, man pages, subtitles, notes). Plain voice (D2); man pages short, one example each. */
import type { ShellContent, ToolId } from "@wirelight/shell";

const TOOL_LINES: Partial<Record<ToolId, string>> = {
  "ip link": "  ip link                  list this machine's doors and whether they're working",
  "lab send-frame": "  lab send-frame --to MAC  send a frame by hand (lab tool)",
  "lab cable": "  lab cable plug|unplug D  plug a cable into door D, or pull it out (lab tool)",
  "lab keeper": "  lab keeper ...           do a keeper's job by hand (lab tool)",
};

const MAN: Record<string, string[]> = {
  ip: [
    "IP(8)                          Wirelight                          IP(8)",
    "",
    "NAME",
    "    ip - look at and change this machine's network settings",
    "",
    "WHAT IT DOES",
    "    `ip link` lists the machine's doors (network interfaces): their",
    "    names, their MAC addresses, and whether each one is up.",
    "    `ip link set <door> up` or `down` switches a door on or off.",
    "",
    "EXAMPLE",
    "    ip link show eth0",
    "",
    "This is the real Linux `ip` command. What you learn here works on a",
    "real machine.",
  ],
  lab: [
    "LAB(1)                         Wirelight                         LAB(1)",
    "",
    "NAME",
    "    lab - Wirelight's lab tools (not part of real Linux)",
    "",
    "WHAT IT DOES",
    "    `lab send-frame` builds one frame and sends it out of a door.",
    "    --to is the MAC address it's for. --from, --dev and --msg are",
    "    optional: who it's from, which door to use, and the message.",
    "",
    "EXAMPLE",
    '    lab send-frame --to 02:00:00:00:00:07 --msg "hello"',
    "",
    "Real Linux doesn't have this command. It's here so you can do by hand",
    "what programs normally do for you.",
  ],
};

const SUBTITLES: [RegExp, string][] = [
  [/^Cannot find device|^Device ".*" does not exist\.$/, "There's no door with that name on this machine."],
  [/Network is down$/, "That door is switched off, so nothing can leave through it."],
  [/: command not found$/, "There's no command with that name here."],
  [/is garbage\.$/, "ip didn't understand one of the words you gave it."],
  [/"dev" argument is required/, "ip needs to know which door you mean."],
  [/^Command ".*" is unknown|^Object ".*" is unknown/, "ip doesn't know that word."],
  [/is not a MAC address/, "A MAC address is six pairs of characters separated by colons."],
];

/** What the game-only lab tools say (lab keeper, lab cable). Plain voice; {name} are filled in. */
const LAB: Record<string, string> = {
  "keeper.usage":
    "usage: lab keeper { show | learn <mac> <door> | send <door>|flood | arp-ask <ip> | wrap <mac> | forward <mac> }",
  "keeper.desk": "waiting at the desk:",
  "keeper.desk-frame": "  {n}. a frame from {from} to {to}, in at {door}",
  "keeper.desk-packet": "  {n}. a packet from {from} to {to}",
  "keeper.desk-empty": "nothing is waiting at the desk",
  "keeper.learned": "the board now says: {mac} is behind {door}",
  "keeper.sent": "the frame went out of {door}",
  "keeper.flooded": "the frame went out of every other door",
  "keeper.asked": "asked everyone on {door}: who has {ip}?",
  "keeper.wrapped": "wrapped the packet in a frame to {mac} and sent it",
  "keeper.forwarded": "took one off the packet's countdown, wrapped it in a new frame to {mac} and sent it",
  "keeper.not-asleep": "the keeper is awake: it does this itself now",
  "keeper.wrong-desk": "this keeper doesn't do that job",
  "keeper.empty": "nothing is waiting at the desk",
  "keeper.bad-mac": "A frame needs a door name, like 02:00:00:00:00:07.",
  "keeper.bad-ip": "that isn't a house address, like 10.0.1.7",
  "keeper.no-door": "there's no door called {door} on this switch",
  "keeper.no-route": "the board has no line for {ip}",
  "cable.usage": "usage: lab cable plug|unplug <door>",
  "cable.plugged": "the cable is plugged into {door}",
  "cable.unplugged": "the cable is out of {door}",
  "cable.no-door": "there's no door called {door} here",
  "cable.no-cable": "no cable runs to {door}",
};

export const shellContent: ShellContent = {
  lab(key, vars = {}) {
    const text = LAB[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (whole, name: string) => vars[name] ?? whole);
  },
  help(tools) {
    const lines = ["Tools you have found:"];
    for (const t of tools) {
      const l = TOOL_LINES[t];
      if (l) lines.push(l);
    }
    if (lines.length === 1) lines.push("  (none yet)");
    lines.push("", "Always here: help, man <tool>, history, clear, exit");
    return lines;
  },
  man: (cmd) => MAN[cmd],
  subtitle(line) {
    for (const [re, text] of SUBTITLES) if (re.test(line)) return text;
    return undefined;
  },
  notes: {
    lab: "lab tools exist only in Wirelight — real Linux doesn't have this command.",
    sudo: "You're already root here.",
    locked: "You haven't found this tool yet.",
  },
};
