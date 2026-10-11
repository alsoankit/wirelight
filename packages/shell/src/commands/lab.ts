/**
 * `lab` — game-only tools (FR-CON-07). Not real Linux; shown in the lab color, and the first use
 * says so. Syntax per SRS SIM-09.
 */
import { parseMac } from "@wirelight/sim";
import type { CommandContext, ToolId } from "../types";

const SUB: { name: string; tool: ToolId }[] = [
  { name: "send-frame", tool: "lab send-frame" },
  { name: "card", tool: "lab card" },
  { name: "cable", tool: "lab cable" },
];

export function lab(ctx: CommandContext, args: string[]): number {
  if (!ctx.flags.labNoteShown) {
    ctx.note(ctx.content.notes.lab);
    ctx.flags.labNoteShown = true;
  }
  const [sub, ...rest] = args;
  const known = SUB.filter((s) => ctx.tools.has(s.tool));
  const found = SUB.find((s) => s.name === sub);
  if (!sub || !found) {
    if (sub) ctx.err(`lab: unknown tool "${sub}"`);
    ctx.err(`usage: lab { ${known.map((s) => s.name).join(" | ") || "..."} } ...`);
    return 2;
  }
  if (!ctx.tools.has(found.tool)) {
    ctx.note(ctx.content.notes.locked);
    return 127;
  }
  if (found.name === "send-frame") return sendFrame(ctx, rest);
  if (found.name === "card") return card(ctx, rest);
  ctx.note(ctx.content.notes.locked);
  return 127;
}

const USAGE = 'usage: lab send-frame --to <mac> [--from <mac>] [--dev <iface>] [--msg "<text>"]';

function sendFrame(ctx: CommandContext, args: string[]): number {
  const opts: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i] as string;
    const key = flag.replace(/^--/, "");
    if (!flag.startsWith("--") || !["to", "from", "dev", "msg"].includes(key)) {
      ctx.err(`lab send-frame: unknown option "${flag}"`);
      ctx.err(USAGE);
      return 2;
    }
    const v = args[++i];
    if (v === undefined) {
      ctx.err(`lab send-frame: ${flag} needs a value`);
      ctx.err(USAGE);
      return 2;
    }
    opts[key] = v;
  }
  if (!opts.to) {
    ctx.err("lab send-frame: --to is required");
    ctx.err(USAGE);
    return 2;
  }
  for (const k of ["to", "from"] as const) {
    const v = opts[k];
    if (v !== undefined && !parseMac(v)) {
      ctx.err(`lab send-frame: "${v}" is not a MAC address (like 02:00:00:00:00:07)`);
      return 2;
    }
  }
  const d = ctx.sim.device(ctx.device);
  const iface = opts.dev ? d?.ifaces.find((i) => i.name === opts.dev) : d?.ifaces[0];
  if (!iface) {
    ctx.err(`lab send-frame: ${opts.dev}: No such device`);
    return 1;
  }
  // A packet socket refuses to send on an interface that is administratively down (ENETDOWN).
  if (!iface.adminUp) {
    ctx.err(`lab send-frame: ${iface.name}: Network is down`);
    return 1;
  }
  const r = ctx.sim.sendLabFrame(ctx.device, {
    to: opts.to,
    dev: iface.name,
    msg: opts.msg ?? "hello",
    ...(opts.from ? { from: opts.from } : {}),
  });
  if (!r.ok) return 1;
  ctx.out(`sent 1 frame (to ${parseMac(opts.to)}, ${r.length} bytes)`);
  return 0;
}

const CARD_USAGE = "usage: lab card show | lab card set --to <mac>";

/** `lab card`: the messenger's address card on the desk (SIM-09). */
function card(ctx: CommandContext, args: string[]): number {
  const m = ctx.sim.device(ctx.device)?.messenger;
  if (!m) {
    ctx.err("lab card: there's no address card on this machine");
    return 1;
  }
  const [sub, ...rest] = args;
  if (sub === undefined || sub === "show") {
    if (rest.length) {
      ctx.err(CARD_USAGE);
      return 2;
    }
    ctx.out(`to       ${m.to}`);
    ctx.out(`message  ${m.msg}`);
    ctx.out(`every    ${m.intervalMs / 1000} s`);
    return 0;
  }
  if (sub === "set") {
    if (rest[0] !== "--to" || rest[1] === undefined || rest.length > 2) {
      ctx.err(CARD_USAGE);
      return 2;
    }
    const mac = parseMac(rest[1]);
    if (!mac) {
      ctx.err(`lab card: "${rest[1]}" is not a MAC address (like 02:00:00:00:00:07)`);
      return 2;
    }
    ctx.sim.setCard(ctx.device, mac);
    return 0;
  }
  ctx.err(`lab card: unknown command "${sub}"`);
  ctx.err(CARD_USAGE);
  return 2;
}
