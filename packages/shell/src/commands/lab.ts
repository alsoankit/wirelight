/**
 * `lab` — game-only tools (FR-CON-07). Not real Linux; shown in the lab color, and the first use
 * says so. Syntax per SRS SIM-09.
 */
import { type DeviceState, decodeEth, decodeIPv4, fromHex, ipToInt, lookupRoute, parseMac } from "@wirelight/sim";
import type { CommandContext, ToolId } from "../types";

const SUB: { name: string; tool: ToolId }[] = [
  { name: "send-frame", tool: "lab send-frame" },
  { name: "card", tool: "lab card" },
  { name: "cable", tool: "lab cable" },
  { name: "keeper", tool: "lab keeper" },
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
  if (found.name === "cable") return cable(ctx, rest);
  return keeper(ctx, rest);
}

/** `lab cable plug|unplug <door>`: the cable end at one of this machine's doors (Floor 1). */
function cable(ctx: CommandContext, args: string[]): number {
  const [action, door, ...extra] = args;
  if ((action !== "plug" && action !== "unplug") || door === undefined || extra.length > 0) {
    ctx.err(ctx.content.lab("cable.usage"));
    return 2;
  }
  const r = ctx.sim.plugCable(ctx.device, door, action === "plug");
  if (r !== "ok") {
    ctx.err(ctx.content.lab(`cable.${r}`, { door }));
    return 1;
  }
  ctx.out(ctx.content.lab(action === "plug" ? "cable.plugged" : "cable.unplugged", { door }));
  return 0;
}

/** `lab keeper …`: a keeper's job by hand, while it has forgotten it (0042). */
function keeper(ctx: CommandContext, args: string[]): number {
  const [action, a, b, ...extra] = args;
  const say = (key: string, vars?: Record<string, string>) => ctx.out(ctx.content.lab(key, vars));
  const usage = () => {
    ctx.err(ctx.content.lab("keeper.usage"));
    return 2;
  };
  if (extra.length > 0) return usage();
  const done = (
    r: { ok: true } | { ok: false; error: string },
    ok: () => void,
    vars: Record<string, string> = {},
  ): number => {
    if (r.ok) {
      ok();
      return 0;
    }
    ctx.err(ctx.content.lab(`keeper.${r.error}`, vars));
    return 1;
  };
  switch (action) {
    case "show": {
      const d = ctx.sim.device(ctx.device);
      const waiting = d?.keeper.desk ?? [];
      if (waiting.length === 0) {
        say("keeper.desk-empty");
        return 0;
      }
      say("keeper.desk");
      waiting.forEach((item, i) => {
        const bytes = fromHex(item.hex);
        if (item.kind === "frame") {
          const f = decodeEth(bytes);
          say("keeper.desk-frame", { n: String(i + 1), from: f.src, to: f.dst, door: item.port ?? "" });
        } else {
          const ip = decodeIPv4(bytes);
          say("keeper.desk-packet", { n: String(i + 1), from: ip.src, to: ip.dst });
        }
      });
      return 0;
    }
    case "learn":
      if (a === undefined || b === undefined) return usage();
      return done(
        ctx.sim.keeperLearn(ctx.device, a, b),
        () => say("keeper.learned", { mac: parseMac(a) ?? a, door: b }),
        { door: b },
      );
    case "send":
      if (a === undefined || b !== undefined) return usage();
      return done(
        ctx.sim.keeperSend(ctx.device, a),
        () => say(a === "flood" ? "keeper.flooded" : "keeper.sent", { door: a }),
        { door: a },
      );
    case "arp-ask": {
      if (a === undefined || b !== undefined) return usage();
      if (ipToInt(a) === null) {
        ctx.err(ctx.content.lab("keeper.bad-ip", { ip: a }));
        return 1;
      }
      const d = ctx.sim.device(ctx.device);
      const route = d ? lookupRoute(d as DeviceState, a) : null;
      return done(ctx.sim.keeperAsk(ctx.device, a), () => say("keeper.asked", { ip: a, door: route?.dev ?? "" }), {
        ip: a,
      });
    }
    case "wrap":
      if (a === undefined || b !== undefined) return usage();
      return done(ctx.sim.keeperWrap(ctx.device, a), () => say("keeper.wrapped", { mac: parseMac(a) ?? a }), {
        mac: a,
      });
    case "forward":
      if (a === undefined || b !== undefined) return usage();
      return done(ctx.sim.keeperForward(ctx.device, a), () => say("keeper.forwarded", { mac: parseMac(a) ?? a }), {
        mac: a,
      });
    default:
      return usage();
  }
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
  const iface = opts.dev ? d?.ifaces.find((i) => i.name === opts.dev) : d?.ifaces.find((i) => i.kind !== "loopback");
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
