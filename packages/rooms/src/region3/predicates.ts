/** Region 3's predicates: echo replies by who really sent them, addresses, the ledger, the Slate. */
import { decodeEth, decodeIcmp, decodeIPv4, ETHERTYPE, type SimEvent } from "@wirelight/sim";
import type { Facts, Predicate } from "../types";

type Rx = Extract<SimEvent, { kind: "frame.rx" }>;

/** An echo reply that reached `device`'s own door: the house address it came from and the door that sent it. */
export interface Reply {
  t: number;
  ip: string;
  mac: string;
}

/** Every echo reply addressed to one of `device`'s doors, in order (a bridge keeps the sender's door name). */
export function echoReplies(f: Facts, device: string): Reply[] {
  const mine = new Set(f.world.device(device)?.ifaces.map((i) => i.mac));
  const out: Reply[] = [];
  for (const e of f.trace) {
    if (e.kind !== "frame.rx" || e.device !== device) continue;
    const r = replyIn(e);
    if (r && mine.has(r.to)) out.push({ t: e.t, ip: r.ip, mac: r.mac });
  }
  return out;
}

function replyIn(e: Rx): { ip: string; mac: string; to: string } | null {
  const eth = decodeEth(e.bytes);
  if (eth.type !== ETHERTYPE.ipv4) return null;
  const ip = decodeIPv4(eth.payload);
  if (ip.proto !== 1) return null;
  if (decodeIcmp(ip.payload).type !== 0) return null;
  return { ip: ip.src, mac: eth.src, to: eth.dst };
}

/** The house at `door` answered a ping from `device` for `ip` (so an answer from the wrong house doesn't count). */
export function answeredBy(device: string, ip: string, door: string): Predicate {
  return (f) => echoReplies(f, device).some((r) => r.ip === ip && r.mac === door);
}

/** The last `n` answers to `ip` all came from `door`. */
export function lastAnswersFrom(device: string, ip: string, door: string, n: number): Predicate {
  return (f) => {
    const mine = echoReplies(f, device).filter((r) => r.ip === ip);
    return mine.length >= n && mine.slice(-n).every((r) => r.mac === door);
  };
}

/** An answer from `firstIp` reached `device`, and later `then` ran there (e.g. library answered; the player re-added an address). */
export function ranAfterAnswer(device: string, firstIp: string, then: RegExp): Predicate {
  return (f) => {
    const first = echoReplies(f, device).find((r) => r.ip === firstIp);
    if (!first) return false;
    return f.trace.some((e) => e.kind === "cmd.exec" && e.device === device && e.t > first.t && then.test(e.line));
  };
}

/** `device` has `cidr` (e.g. "10.0.1.5/24") on `dev`. */
export function hasAddr(device: string, cidr: string, dev = "eth0"): Predicate {
  const [ip, prefix] = cidr.split("/");
  return ({ world }) =>
    world.device(device)?.addrs.some((a) => a.dev === dev && a.ip === ip && a.prefix === Number(prefix)) ?? false;
}

/** Any address on `device` starting with `street` (e.g. "10.0.1.") with this prefix length. */
export function onStreet(device: string, street: string, prefix = 24): Predicate {
  return ({ world }) =>
    world.device(device)?.addrs.some((a) => a.ip.startsWith(street) && a.prefix === prefix) ?? false;
}

/** `device` holds `ip` with any prefix. */
export function claims(device: string, ip: string): Predicate {
  return ({ world }) => world.device(device)?.addrs.some((a) => a.ip === ip) ?? false;
}

/** A ping started on `device` ran on for `ms` without stopping (no -c, no Ctrl+C). */
export function pingRanFor(device: string, ms: number): Predicate {
  return ({ trace, world }) =>
    trace.some(
      (e) =>
        e.kind === "cmd.exec" &&
        e.device === device &&
        /^ping\b/.test(e.line) &&
        e.exitCode === null &&
        world.now >= e.t + ms &&
        !trace.some((x) => x.kind === "proc.exit" && x.execId === e.execId && x.t < e.t + ms),
    );
}

/** At least `n` echo requests asked of `ip` from `device`: each ping's `-c`, or 5 for one with no count. */
export function pingsTo(device: string, ip: string, n: number): Predicate {
  const target = new RegExp(`^ping\\b(.*\\s)?${ip.replaceAll(".", "\\.")}$`);
  return ({ trace }) => {
    let total = 0;
    for (const e of trace) {
      if (e.kind !== "cmd.exec" || e.device !== device || !target.test(e.line)) continue;
      const c = e.line.match(/-c\s*(\d+)/);
      total += c ? Number(c[1]) : 5;
    }
    return total >= n;
  };
}

/** `device`'s ledger has `ip` at `mac` (any state, or this one). */
export function ledgerHas(device: string, ip: string, mac: string, state?: string): Predicate {
  return ({ world }) =>
    world.device(device)?.neigh.some((n) => n.ip === ip && n.mac === mac && (!state || n.state === state)) ?? false;
}

export function keeperAwake(device: string): Predicate {
  return ({ world }) => world.device(device)?.keeper.asleep === null;
}

/** At least `n` packets wrapped by hand to `mac` on `device` (0042). */
export function wrappedTo(device: string, mac: string, n: number): Predicate {
  return ({ trace }) =>
    trace.filter((e) => e.kind === "keeper.step" && e.device === device && e.action === "wrap" && e.args[0] === mac)
      .length >= n;
}

/** The player asked everyone for an address the ledger already had a door name for. */
export function askedWhatTheLedgerKnew(device: string): Predicate {
  return ({ trace }) => {
    const known = new Set<string>();
    for (const e of trace) {
      if (e.kind === "table.change" && e.device === device && e.table === "neigh") {
        const ip = e.key.split(" ")[0] as string;
        const after = e.after as { mac: string | null } | null;
        if (e.op === "del" || !after?.mac) known.delete(ip);
        else known.add(ip);
      }
      if (e.kind === "keeper.step" && e.device === device && e.action === "arp-ask" && known.has(e.args[0] ?? ""))
        return true;
    }
    return false;
  };
}

/** The frame (as sent or received) behind a Slate catch. */
function caughtFrame(trace: readonly SimEvent[], frameId: number): Uint8Array | null {
  for (const e of trace) if ((e.kind === "frame.tx" || e.kind === "frame.rx") && e.frameId === frameId) return e.bytes;
  return null;
}

/** A catch of something `door` sent was opened on the Slate down to its message (6.1). */
export function openedToMessage(door: string): Predicate {
  return ({ trace }) => {
    const from = new Map<number, string>();
    for (const e of trace) {
      if (e.kind === "slate.catch") {
        const bytes = caughtFrame(trace, e.frameId);
        if (bytes) from.set(e.n, decodeEth(bytes).src);
      }
      if (e.kind === "slate.open" && e.layer === "message" && e.reached && from.get(e.n) === door) return true;
    }
    return false;
  };
}

/** `n` catches opened at the frame layer only, before any was opened further. */
export function openedFramesOnly(n: number): Predicate {
  return ({ trace }) => {
    const opened = new Set<number>();
    for (const e of trace) {
      if (e.kind !== "slate.open") continue;
      if (e.layer !== "frame") return false;
      opened.add(e.n);
      if (opened.size >= n) return true;
    }
    return false;
  };
}

/** The ledger was read twice at least `ms` apart, with nothing crossed out between (waiting for a line to go stale). */
export function waitedOnLedger(device: string, ms: number): Predicate {
  return ({ trace }) => {
    let first: number | null = null;
    for (const e of trace) {
      if (e.kind !== "cmd.exec" || e.device !== device) continue;
      if (/^ip neigh (del|flush|replace|change)\b/.test(e.line)) first = null;
      else if (/^ip neigh( show)?$/.test(e.line)) {
        if (first !== null && e.t - first >= ms) return true;
        if (first === null) first = e.t;
      }
    }
    return false;
  };
}

/** Packets crossed `link` both ways (a request and its answer): the corridor is lit by IP traffic too. */
export function crossedBothWays(link: string): Predicate {
  return ({ trace }) => {
    const dirs = new Set<number>();
    for (const e of trace)
      if (e.kind === "link.enter" && e.link === link && decodeEth(e.bytes).type === ETHERTYPE.ipv4) dirs.add(e.dir);
    return dirs.size === 2;
  };
}
