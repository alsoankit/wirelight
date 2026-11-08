/**
 * The names the shell answers to (shell.ts): its own commands, the programs it runs, and the real Linux
 * programs it names before they're unlocked (FR-CON-11). Kept apart from the commands themselves, with
 * no imports, so the game can tell a command from other typed text without loading the shell (the play
 * logs send commands and nothing else that was typed).
 */

/** The shell's own commands. */
export const BUILTIN_COMMANDS = ["help", "man", "history", "clear", "exit", "hostname"] as const;

/** The programs it runs. */
export const PROGRAM_COMMANDS = ["ip", "lab", "bridge", "ping", "sysctl", "tcpdump", "dhclient"] as const;

/** Real Linux programs the player meets later; until unlocked they answer FR-CON-11. */
export const LATER_COMMANDS = [
  "tcpdump",
  "sysctl",
  "traceroute",
  "ssh",
  "ss",
  "nc",
  "dig",
  "curl",
  "iptables",
] as const;

const KNOWN: ReadonlySet<string> = new Set<string>([...BUILTIN_COMMANDS, ...PROGRAM_COMMANDS, ...LATER_COMMANDS]);

/**
 * Whether a typed line is a command: its first word (after an optional `sudo`) is one the shell knows.
 * A line that starts with anything else is other text, even when typed into the terminal.
 */
export function isCommandLine(line: string): boolean {
  const words = line.trim().split(/\s+/);
  const name = words[0] === "sudo" ? words[1] : words[0];
  return name !== undefined && KNOWN.has(name);
}
