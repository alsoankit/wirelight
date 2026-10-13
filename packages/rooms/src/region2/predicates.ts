/** Region 2's own predicates: the switch's board, hand sorting (3.1), and loops (4.B). Trace and state only. */
import type { DeviceId, IfaceName, Mac, SimEvent } from "@wirelight/sim";
import type { Facts, Predicate } from "../types";

const GROUP = (mac: string) => (Number.parseInt(mac.slice(0, 2), 16) & 1) === 1;
const macAt = (b: Uint8Array, at: number) =>
  Array.from(b.subarray(at, at + 6), (x) => x.toString(16).padStart(2, "0")).join(":");

// ── The board ───────────────────────────────────────────────────────────────────────────────

/** The switch's board has a learned or written line for `mac` (behind `port`, when given). */
export function boardHas(device: DeviceId, mac: Mac, port?: IfaceName): Predicate {
  return ({ world }) =>
    Object.values(world.device(device)?.bridges ?? {}).some((br) =>
      br.fdb.some((e) => !e.local && e.mac === mac && (port === undefined || e.port === port)),
    );
}

/** The switch's board has some line behind `port` (other than its own door's). */
export function boardHasBehind(device: DeviceId, port: IfaceName): Predicate {
  return ({ world }) =>
    Object.values(world.device(device)?.bridges ?? {}).some((br) => br.fdb.some((e) => !e.local && e.port === port));
}

export function keeperAwake(device: DeviceId): Predicate {
  return ({ world }) => world.device(device)?.keeper.asleep === null;
}

// ── Hand sorting (3.1, 0042) ────────────────────────────────────────────────────────────────

/** One `lab keeper send` the player made: the frame, where it came in, what the board said then. */
export interface HandSend {
  where: IfaceName | "flood";
  src: Mac;
  dst: Mac;
  inPort: IfaceName | null;
  /** Where the board put the frame's to when it was sent (null: not on the board). */
  known: IfaceName | null;
  /** Whether the frame's from was on the board when it was sent. */
  srcKnown: boolean;
}

/** Every hand send at `device`, replaying the board from the trace as it went. */
export function handSends(trace: readonly SimEvent[], device: DeviceId): HandSend[] {
  const board = new Map<Mac, IfaceName>();
  const arrived = new Map<number, { port: IfaceName; src: Mac; dst: Mac }>();
  const out: HandSend[] = [];
  for (const e of trace) {
    if (!("device" in e) || e.device !== device) continue;
    if (e.kind === "table.change" && e.table === "fdb") {
      if (e.op === "del") board.delete(e.key);
      else board.set(e.key, e.after as IfaceName);
    } else if (e.kind === "frame.rx") {
      arrived.set(e.frameId, { port: e.iface, src: macAt(e.bytes, 6), dst: macAt(e.bytes, 0) });
    } else if (e.kind === "keeper.step" && e.action === "send" && e.frameId !== null) {
      const f = arrived.get(e.frameId);
      if (!f) continue;
      out.push({
        where: e.args[0] as IfaceName,
        src: f.src,
        dst: f.dst,
        inPort: f.port,
        known: GROUP(f.dst) ? null : (board.get(f.dst) ?? null),
        srcKnown: board.has(f.src),
      });
    }
  }
  return out;
}

/** A send the switch itself would have made: known, out of that door; unknown, out of every other door. */
export const sortedRight = (s: HandSend) => (s.known === null ? s.where === "flood" : s.where === s.known);

/** At least `n` frames sorted right by hand, at least one of them flooded (3.1: the keeper remembers). */
export function sortedByHand(device: DeviceId, n: number): Predicate {
  return ({ trace }) => {
    const right = handSends(trace, device).filter(sortedRight);
    return right.length >= n && right.some((s) => s.where === "flood");
  };
}

/** A hand send matching `test` (with the facts, for where each machine really is). */
export function handSend(device: DeviceId, test: (s: HandSend, f: Facts) => boolean, n = 1): Predicate {
  return (f) => handSends(f.trace, device).filter((s) => test(s, f)).length >= n;
}

/** Whether the machine with door name `mac` is behind the switch's door `port`. */
export function behind(f: Facts, device: DeviceId, port: IfaceName, mac: Mac): boolean {
  const peer = f.world.peer(device, port);
  return !!peer && f.world.device(peer.device)?.ifaces.some((i) => i.mac === mac) === true;
}

// ── Reading the board ───────────────────────────────────────────────────────────────────────

type Exec = Extract<SimEvent, { kind: "cmd.exec" }>;
const READ_BOARD = /^bridge fdb( show| list)?(\s|$)/;
/** Commands that only look: they change nothing the switch could learn from. */
const LOOKING = /^bridge fdb( show| list)?(\s|$)|^ip link( show\b.*)?$|^lab card( show)?$|^lab keeper show$/;

/** The board was read on `device` twice with nothing done in between (3.2: expects gate to be listed). */
export function readBoardTwiceIdle(device: DeviceId): Predicate {
  return ({ trace }) => {
    let readOnce = false;
    for (const e of trace) {
      if (e.kind !== "cmd.exec") continue;
      if (e.device === device && READ_BOARD.test(e.line)) {
        if (readOnce) return true;
        readOnce = true;
      } else if (!LOOKING.test(e.line)) readOnce = false;
    }
    return false;
  };
}

/**
 * A broadcast left `from` while `device`'s door `door` was still switched off, and the board was
 * then read on `device` (3.B: everyone answered except whoever's behind the dark door).
 */
export function broadcastBeforeLink(from: DeviceId, device: DeviceId, door: IfaceName): Predicate {
  const on = new RegExp(`^ip link set ${door} up$`);
  return ({ trace }) => {
    let doorOn = false;
    let early = false;
    for (const e of trace) {
      if (e.kind === "cmd.exec" && e.device === device && on.test(e.line) && e.exitCode === 0) doorOn = true;
      if (e.kind === "frame.tx" && e.device === from && e.origin === "command" && !doorOn) {
        if (e.bytes.subarray(0, 6).every((b) => b === 0xff)) early = true;
      }
      if (early && e.kind === "cmd.exec" && e.device === device && READ_BOARD.test(e.line)) return true;
    }
    return false;
  };
}

/** The board was read on `device`, and then on `other` never, by the time a direct frame left `from` to anyone but `except`. */
export function onlyOneHall(device: DeviceId, other: DeviceId, from: DeviceId, except: Mac): Predicate {
  return ({ trace }) => {
    let readHere = false;
    for (const e of trace) {
      if (e.kind === "cmd.exec" && READ_BOARD.test(e.line)) {
        if (e.device === other) return false;
        if (e.device === device) readHere = true;
      }
      if (readHere && e.kind === "frame.tx" && e.device === from && e.origin === "command") {
        const dst = macAt(e.bytes, 0);
        if (!GROUP(dst) && dst !== except) return true;
      }
    }
    return false;
  };
}

/** The board was read on `device`, and `quietMs` later nothing had been done on `other` (4.B). */
export function stuckOnOneHall(device: DeviceId, other: DeviceId, quietMs: number): Predicate {
  return ({ trace, world }) => {
    const read = trace.find((e): e is Exec => e.kind === "cmd.exec" && e.device === device && READ_BOARD.test(e.line));
    if (!read || world.now < read.t + quietMs) return false;
    return !trace.some((e) => e.kind === "cmd.exec" && e.device === other && e.t <= read.t + quietMs);
  };
}

// ── Time (4.1) ──────────────────────────────────────────────────────────────────────────────

/** At least `ms` of network time have passed in this attempt with no `unless` command run. */
export function waitedWithout(ms: number, unless: RegExp): Predicate {
  return ({ trace, world }) => {
    const start = trace[0]?.t ?? 0;
    if (world.now - start < ms) return false;
    return !trace.some((e) => e.kind === "cmd.exec" && unless.test(e.line) && e.t - start < ms);
  };
}

// ── Loops (4.B) ─────────────────────────────────────────────────────────────────────────────

/** A cable can carry frames now: both ends in and both doors on. */
export function corridorWorks(f: Facts, link: string): boolean {
  const l = f.world.links().find((x) => x.id === link);
  return !!l && f.world.oper(l.a.device, l.a.iface).up && f.world.oper(l.b.device, l.b.iface).up;
}

/** Two halls are joined by at most one working cable among `links`. */
export function noLoop(links: string[]): Predicate {
  return (f) => links.filter((l) => corridorWorks(f, l)).length <= 1;
}

/** Fewer than `max` frames entered the `links` in the last `windowMs` of network time. */
export function calm(links: string[], windowMs: number, max: number): Predicate {
  return ({ trace, world }) => {
    const set = new Set(links);
    const from = world.now - windowMs;
    let n = 0;
    for (let i = trace.length - 1; i >= 0; i--) {
      const e = trace[i] as SimEvent;
      if (e.t < from) break;
      if (e.kind === "link.enter" && set.has(e.link)) n++;
    }
    return n < max;
  };
}

/**
 * A command matching `breaks` ran (the loop was broken), and `ms` later `answered` still didn't hold
 * on the trace up to then (4.B: fixed the loop, and stopped looking).
 */
export function stalledAfter(breaks: RegExp, ms: number, answered: (trace: readonly SimEvent[]) => boolean): Predicate {
  return ({ trace, world }) => {
    const b = trace.find((e): e is Exec => e.kind === "cmd.exec" && e.exitCode === 0 && breaks.test(e.line));
    if (!b || world.now < b.t + ms) return false;
    return !answered(trace.filter((e) => e.t <= b.t + ms));
  };
}

// ── Messengers through a switch ─────────────────────────────────────────────────────────────

/** Frame ids of everything `fromDevice` sent with `origin`, followed through every forwarded copy. */
function followed(trace: readonly SimEvent[], fromDevice: DeviceId, origin: string): Set<number> {
  const ids = new Set<number>();
  for (const e of trace)
    if (
      e.kind === "frame.tx" &&
      ((e.device === fromDevice && e.origin === origin) || (e.parent !== undefined && ids.has(e.parent)))
    )
      ids.add(e.frameId);
  return ids;
}

/**
 * The messenger was heard through the halls: one of its letters (or a copy a switch passed on) was
 * taken in at `to`, and an answer with `text` reached `from` after it. Region 1's `messengerAnswered`
 * for a world with switches in it, where each hop's copy is a new frame.
 */
export function messengerHeard(from: DeviceId, to: DeviceId, text: string): Predicate {
  return ({ trace }) => {
    const mine = followed(trace, from, "messenger");
    const heard = trace.find((e) => e.kind === "app.deliver" && e.device === to && mine.has(e.frameId));
    if (!heard) return false;
    return trace.some((e) => e.kind === "app.deliver" && e.device === from && e.text === text && e.t >= heard.t);
  };
}
