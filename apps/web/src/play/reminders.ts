// Command reminders (decision 0109): nobody remembers a command after seeing it once. A command the
// player has learned stays beside the terminal in later rooms, with its forms and what they mean, until
// they have typed it themselves in a few more rooms. Then it fades; the Command book keeps it for good.
// Pure functions: the terminal records uses, the panel asks what to show.

/**
 * `ip` takes any start of an object's name (`ip a`, `ip ad`, `ip rou`, `ip nei`), trying its objects in
 * this order, as the shell does (iproute2): the same command as the long form, as the book writes it.
 */
const IP_OBJECTS: { book: string; names: string[] }[] = [
  { book: "addr", names: ["address", "addr"] },
  { book: "route", names: ["route"] },
  { book: "link", names: ["link"] },
  { book: "neigh", names: ["neighbor", "neighbour", "neigh"] },
];

function ipObject(word: string): string {
  return IP_OBJECTS.find((o) => o.names.some((n) => n.startsWith(word)))?.book ?? word;
}

function words(line: string): string[] {
  const w = line.trim().split(/\s+/);
  if (w[0] === "ip" && w[1]) w[1] = ipObject(w[1]);
  return w;
}

/**
 * The Command book entry a typed line uses: every word of the entry appears in the line, in order,
 * starting with the tool. The longest match wins (`bridge fdb del` over `bridge fdb`).
 */
export function commandOf(line: string, commands: readonly string[]): string | undefined {
  const typed = words(line);
  let best: string | undefined;
  for (const command of commands) {
    const want = command.split(" ");
    if (want[0] !== typed[0]) continue;
    let i = 1;
    for (const word of typed.slice(1)) if (word === want[i]) i++;
    if (i === want.length && (!best || want.length > best.split(" ").length)) best = command;
  }
  return best;
}

/** After this many later rooms where the player typed it, a command stops being shown. */
export const LEARNED_AFTER = 3;
/** At most this many reminders at once: the most recently learned first. */
export const MAX_REMINDERS = 3;

export type Reminder = {
  command: string;
  /** `full`: every form with its meaning (not yet typed since). `short`: the forms only. */
  level: "full" | "short";
};

/**
 * What to show in room `roomId`: commands first taught in an earlier room, not yet typed in
 * LEARNED_AFTER later rooms. `uses`: the rooms where each command was typed successfully.
 */
export function remindersFor(
  roomId: string,
  order: readonly string[],
  commands: readonly { command: string; room: string }[],
  uses: Readonly<Record<string, readonly string[]>>,
): Reminder[] {
  const here = order.indexOf(roomId);
  if (here < 0) return [];
  return commands
    .map((c) => ({ ...c, at: order.indexOf(c.room) }))
    .filter((c) => c.at >= 0 && c.at < here)
    .map((c) => ({ ...c, later: (uses[c.command] ?? []).filter((r) => r !== c.room).length }))
    .filter((c) => c.later < LEARNED_AFTER)
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_REMINDERS)
    .map((c) => ({ command: c.command, level: c.later === 0 ? "full" : "short" }));
}
