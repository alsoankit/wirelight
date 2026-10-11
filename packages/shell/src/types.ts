import type { DeviceId, Simulator } from "@wirelight/sim";

/** Tools the player unlocks (SRS §7.4). Built-ins (help, man, clear, history, exit) are always available. */
export type ToolId =
  | "ip link"
  | "lab send-frame"
  | "lab card"
  | "lab cable"
  | "workbench"
  | "bridge fdb"
  | "ip addr"
  | "ping"
  | "ip neigh"
  | "dhclient"
  | "ip route"
  | "tcpdump"
  | "sysctl";

/** Player-facing text the shell needs. It lives in packages/rooms (NFR-13); the shell only asks for it. */
export interface ShellContent {
  /** Lines for `help`, given the tools the player has. */
  help(tools: readonly ToolId[]): string[];
  /** A `man` page for a command name (`ip`, `lab`), or undefined if there isn't one. */
  man(command: string): string[] | undefined;
  /** Plain meaning of a real error line (FR-CON-17), never how to fix it. */
  subtitle(errorLine: string): string | undefined;
  notes: {
    /** FR-CON-07: printed dim on the first `lab` use. */
    lab: string;
    /** FR-CON-04: printed dim on the first `sudo`. */
    sudo: string;
    /** FR-CON-11, exact text. */
    locked: string;
  };
}

export interface Out {
  out(line: string): void;
  err(line: string): void;
  note(line: string): void;
  control(action: "clear" | "exit"): void;
}

export interface CommandContext extends Out {
  sim: Simulator;
  device: DeviceId;
  tools: ReadonlySet<ToolId>;
  content: ShellContent;
  history: readonly string[];
  /** Has this player seen the lab note yet? Set by the command when it prints it. */
  flags: { labNoteShown: boolean; sudoNoteShown: boolean };
}

/** Runs a command; returns its exit code. */
export type CommandFn = (ctx: CommandContext, args: string[]) => number;
