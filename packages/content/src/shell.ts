/** Text the shell needs (help, man pages, subtitles, notes). Plain voice (D2); man pages short, one example each. */
import type { ShellContent, ToolId } from "@wirelight/shell";

const TOOL_LINES: Partial<Record<ToolId, string>> = {
  "ip link": "  ip link                  list this machine's doors and whether they're working",
  "lab send-frame": "  lab send-frame --to MAC  send a frame by hand (lab tool)",
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

export const shellContent: ShellContent = {
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
