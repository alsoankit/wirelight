/**
 * `lab` — game-only tools (FR-CON-07). Not real Linux; shown in the lab color, and the first use
 * says so. Syntax per SRS SIM-09.
 */
import {
  type DeviceState,
  decodeEth,
  decodeIPv4,
  fromHex,
  ipToInt,
  lookupRoute,
  parseMac,
  peel,
  type ScannerLayer,
} from "@wirelight/sim";
import type { CommandContext, ToolId } from "../types";

const SUB: { name: string; tool: ToolId }[] = [
  { name: "send-frame", tool: "lab send-frame" },
  { name: "card", tool: "lab card" },
  { name: "cable", tool: "lab cable" },
  { name: "keeper", tool: "lab keeper" },
  { name: "scanner", tool: "lab scanner" },
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
  if (found.name === "scanner") return scanner(ctx, rest);
  return keeper(ctx, rest);
}

/** `lab scanner …`: the Scanner (0043), which keeps the messages you catch. It only catches and reads. */
function scanner(ctx: CommandContext, args: string[]): number {
  const say = (key: string, vars?: Record<string, string>) => ctx.out(ctx.content.lab(key, vars));
  const usage = () => {
    ctx.err(ctx.content.lab("scanner.usage"));
    return 2;
  };
  const [action, ...rest] = args;
  if (action === undefined || action === "list") {
    if (rest.length) return usage();
    const all = ctx.sim.scannerCatches();
    if (all.length === 0) say("scanner.empty");
    for (const c of all) {
      const [frame, inner] = peel(fromHex(c.hex));
      if (frame?.layer !== "frame") continue;
      const ip = inner?.layer === "packet" ? inner : null;
      say("scanner.row", {
        n: String(c.n),
        time: (c.t / 1000).toFixed(3),
        device: c.device,
        door: c.iface,
        dir: c.dir,
        from: ip ? ip.from : frame.from,
        to: ip ? ip.to : frame.to,
        what: ctx.content.lab(`scanner.what-${carrying(frame.type)}`, { type: frame.type.toString(16) }),
        traced: c.traced ? ctx.content.lab("scanner.traced") : "",
      });
    }
    return 0;
  }
  if (action === "catch") {
    if (rest[0] !== "--next") return usage();
    if (rest.length === 1) {
      ctx.sim.scannerCatchNext(ctx.device);
      say("scanner.armed", { device: ctx.device });
      return 0;
    }
    if (rest[1] !== "--from" || rest[2] === undefined || rest.length > 3) return usage();
    const from = parseMac(rest[2]) ?? rest[2];
    ctx.sim.scannerCatchNext(ctx.device, from);
    say("scanner.armed-from", { device: ctx.device, from });
    return 0;
  }
  if (action === "open") {
    const n = Number(rest[0]);
    const layer = rest[1] === undefined ? "frame" : rest[1] === "--layer" ? rest[2] : undefined;
    if (!Number.isInteger(n) || n < 1 || (layer !== "frame" && layer !== "packet" && layer !== "message"))
      return usage();
    if (rest.length !== 1 && rest.length !== 3) return usage();
    const r = ctx.sim.scannerOpen(ctx.device, n, layer);
    if (!r.ok) {
      ctx.err(ctx.content.lab("scanner.no-catch", { n: String(n) }));
      return 1;
    }
    for (const l of r.layers) say(...layerLine(ctx, l));
    if (!r.reached && layer === "packet") say("scanner.no-packet");
    return 0;
  }
  if (action === "trace" || action === "compare") {
    if (!ctx.tools.has("lab scanner trace")) {
      ctx.note(ctx.content.notes.locked);
      return 127;
    }
    if (action === "trace") {
      if (rest.length !== 1 || rest[0] !== "--next") return usage();
      ctx.sim.scannerTraceNext(ctx.device);
      say("scanner.tracing", { device: ctx.device });
      return 0;
    }
    const [a, b] = rest.map(Number);
    if (rest.length !== 2 || !Number.isInteger(a) || !Number.isInteger(b)) return usage();
    const r = ctx.sim.scannerCompare(a as number, b as number);
    if (!r) {
      const missing = ctx.sim.scannerCatches()[(a as number) - 1] ? b : a;
      ctx.err(ctx.content.lab("scanner.no-catch", { n: String(missing) }));
      return 1;
    }
    for (const x of r.a) {
      const y = r.b.find((l) => l.layer === x.layer);
      for (const [key, v] of Object.entries(x)) {
        if (key === "layer" || key === "kind") continue;
        const w = y ? (y as Record<string, unknown>)[key] : undefined;
        say("scanner.compare", {
          field: `${x.layer}.${key}`.padEnd(16),
          a: String(v).padEnd(18),
          b: String(w ?? "-").padEnd(18),
          mark: ctx.content.lab(r.changed.includes(`${x.layer}.${key}`) ? "scanner.changed" : "scanner.same"),
        });
      }
    }
    return 0;
  }
  return usage();
}

/** What a frame carries, by its EtherType: the key of its name in the Scanner's text. */
function carrying(type: number): string {
  if (type === 0x0800) return "packet";
  if (type === 0x0806) return "arp";
  if (type === 0x88b5) return "lab";
  if (type === 0x88b6) return "lab-answer";
  return "other";
}

/** One layer of a catch as a line of the Scanner's text. */
function layerLine(ctx: CommandContext, l: ScannerLayer): [string, Record<string, string>] {
  if (l.layer === "frame")
    return [
      "scanner.frame",
      {
        to: l.to,
        from: l.from,
        what: ctx.content.lab(`scanner.what-${carrying(l.type)}`, { type: l.type.toString(16) }),
      },
    ];
  if (l.layer === "packet")
    return [
      "scanner.packet",
      {
        to: l.to,
        from: l.from,
        ttl: String(l.ttl),
        proto: l.proto === 1 ? "icmp" : l.proto === 17 ? "udp" : String(l.proto),
        checksum: l.checksum.toString(16).padStart(4, "0"),
      },
    ];
  if (l.kind === "udp") return ["scanner.message-udp", { text: l.text, port: String(l.toPort) }];
  if (l.kind === "icmp") {
    if (l.type === 8) return ["scanner.message-echo-request", { seq: String(l.seq) }];
    if (l.type === 0) return ["scanner.message-echo-reply", { seq: String(l.seq) }];
    return ["scanner.message-icmp", { type: String(l.type), code: String(l.code) }];
  }
  if (l.kind === "lab") return ["scanner.message-lab", { text: l.text }];
  if (l.kind === "arp")
    return l.op === 1
      ? ["scanner.message-arp-request", { target: l.targetIp, sender: l.senderIp }]
      : ["scanner.message-arp-reply", { sender: l.senderIp, mac: l.senderMac }];
  return ["scanner.message-other", { bytes: String(l.bytes) }];
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

const USAGE = 'usage: lab send-frame --to <mac|machine> [--from <mac>] [--dev <iface>] [--msg "<text>"]';

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
  // A lab tool may name a machine instead of a door name (before Floor 2 teaches door names): the
  // frame goes to that machine's first door.
  const named =
    opts.to && !parseMac(opts.to) ? ctx.sim.device(opts.to)?.ifaces.find((i) => i.kind !== "loopback") : undefined;
  const shownTo = named ? opts.to : undefined;
  if (named) opts.to = named.mac;
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
  ctx.out(`sent 1 frame (to ${shownTo ?? parseMac(opts.to)}, ${r.length} bytes)`);
  return 0;
}

const CARD_USAGE = "usage: lab card [show] | lab card [--messenger N] --to <mac|address>";

/**
 * `lab card`: the messengers' address cards on the desk (SIM-09). `--to` takes a door name (MAC) or,
 * from Floor 5, a house address (IPv4); `--messenger N` picks a card when there are several.
 */
function card(ctx: CommandContext, args: string[]): number {
  const all = ctx.sim.device(ctx.device)?.messengers ?? [];
  if (all.length === 0) {
    ctx.err("lab card: there's no address card on this machine");
    return 1;
  }
  // The older `lab card set --to <mac>` still works.
  const words = args[0] === "set" ? args.slice(1) : args;
  if (words.length === 0 || (words.length === 1 && words[0] === "show")) {
    all.forEach((m, i) => {
      if (all.length > 1) ctx.out(`card ${i + 1}`);
      ctx.out(`to       ${m.to || "(blank)"}`);
      ctx.out(`message  ${m.msg}`);
      ctx.out(`every    ${m.intervalMs / 1000} s`);
    });
    return 0;
  }
  let index = 1;
  let to: string | undefined;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const v = words[i + 1];
    if (w === "--messenger" && v !== undefined && /^\d+$/.test(v)) index = Number(v);
    else if (w === "--to" && v !== undefined) to = v;
    else {
      ctx.err(CARD_USAGE);
      return 2;
    }
    i++;
  }
  if (to === undefined) {
    ctx.err(CARD_USAGE);
    return 2;
  }
  if (index < 1 || index > all.length) {
    ctx.err(`lab card: there's no card ${index} (this desk has ${all.length})`);
    return 2;
  }
  if (!ctx.sim.setCard(ctx.device, to, index)) {
    // Names only door names: house addresses aren't taught until Floor 5, where they simply work.
    ctx.err(`lab card: "${to}" is not a MAC address (like 02:00:00:00:00:07)`);
    return 2;
  }
  return 0;
}
