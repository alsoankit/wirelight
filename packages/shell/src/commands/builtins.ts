import type { CommandContext } from "../types";

export function help(ctx: CommandContext): number {
  for (const line of ctx.content.help([...ctx.tools])) ctx.out(line);
  return 0;
}

/** Which tool unlocks a man page. */
const MAN_TOOL: Record<string, (t: ReadonlySet<string>) => boolean> = {
  ip: (t) => ["ip link", "ip addr", "ip route", "ip neigh"].some((x) => t.has(x)),
  lab: (t) => ["lab send-frame", "lab card", "lab cable"].some((x) => t.has(x)),
  bridge: (t) => t.has("bridge fdb"),
  ping: (t) => t.has("ping"),
  tcpdump: (t) => t.has("tcpdump"),
  sysctl: (t) => t.has("sysctl"),
  dhclient: (t) => t.has("dhclient"),
};

export function man(ctx: CommandContext, args: string[]): number {
  const name = args[0];
  if (!name) {
    ctx.err("What manual page do you want?");
    ctx.err("For example, try 'man man'.");
    return 1;
  }
  const unlocked = MAN_TOOL[name];
  if (unlocked && !unlocked(ctx.tools)) {
    ctx.note(ctx.content.notes.locked);
    return 16;
  }
  const page = ctx.content.man(name);
  if (!page) {
    ctx.err(`No manual entry for ${name}`);
    return 16;
  }
  for (const line of page) ctx.out(line);
  return 0;
}

export function history(ctx: CommandContext): number {
  ctx.history.forEach((line, i) => {
    ctx.out(`${String(i + 1).padStart(5)}  ${line}`);
  });
  return 0;
}

export function clear(ctx: CommandContext): number {
  ctx.control("clear");
  return 0;
}

export function exit(ctx: CommandContext): number {
  ctx.control("exit");
  return 0;
}
