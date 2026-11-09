/** Building blocks for win conditions, health checks and detectors. All read the trace and state only (SIM-38). */
import type { DeviceId, FrameOrigin, IfaceName, SimEvent } from "@wirelight/sim";
import type { Facts, Predicate } from "./types";

/** A lab message arrived at `device` whose text is exactly `text`. */
export function labDelivered(device: DeviceId, text: string): Predicate {
  return ({ trace }) => trace.some((e) => e.kind === "app.deliver" && e.device === device && e.text === text);
}

/** Any lab reply from `fromDevice` reached `device`. */
export function labReplyFrom(device: DeviceId, fromDevice: DeviceId): Predicate {
  return ({ trace, world }) => {
    const macs = new Set(world.device(fromDevice)?.ifaces.map((i) => i.mac));
    return trace.some((e) => e.kind === "app.deliver" && e.device === device && macs.has(e.from));
  };
}

export function linkUp(device: DeviceId, iface: IfaceName): Predicate {
  return ({ world }) => world.oper(device, iface).up;
}

/**
 * A frame sent by `fromDevice` was ignored at `atDevice`'s door because it wasn't addressed to it.
 * With `origin`, only frames from that source count (e.g. "command": the player's own sends).
 */
export function ignoredFrom(fromDevice: DeviceId, atDevice: DeviceId, origin?: FrameOrigin): Predicate {
  return ({ trace }) => {
    const sentBy = new Set<number>();
    for (const e of trace) {
      if (e.kind === "frame.tx" && e.device === fromDevice && (!origin || e.origin === origin)) sentBy.add(e.frameId);
      if (e.kind === "frame.drop" && e.device === atDevice && e.reason === "not-for-me" && sentBy.has(e.frameId))
        return true;
    }
    return false;
  };
}

export type CorridorState = "dark" | "lit" | "broken";

/** How long a corridor stays lit without a new two-way exchange (FR-COR-03), network ms. */
export const LIT_FOR_MS = 120_000;

/**
 * A corridor is lit when a message crossed it and was taken in at the far end, and an answer came
 * back the other way and was taken in too (FR-COR-02). Broken when the link is down.
 */
export function corridorState(f: Facts, link: string, now: number): CorridorState {
  const l = f.world.links().find((x) => x.id === link);
  if (!l) return "dark";
  if (!f.world.oper(l.a.device, l.a.iface).up) return "broken";
  return lastExchange(f.trace, link) >= now - LIT_FOR_MS ? "lit" : "dark";
}

/** Network time of the latest two-way exchange across `link`, or -Infinity. */
export function lastExchange(trace: readonly SimEvent[], link: string): number {
  const dirOf = new Map<number, 0 | 1>();
  const lastIn: [number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  let lit = Number.NEGATIVE_INFINITY;
  for (const e of trace) {
    if (e.kind === "world.reset") {
      lastIn[0] = lastIn[1] = Number.NEGATIVE_INFINITY;
      dirOf.clear();
    } else if (e.kind === "link.enter" && e.link === link) dirOf.set(e.frameId, e.dir);
    else if (e.kind === "app.deliver") {
      const d = dirOf.get(e.frameId);
      if (d === undefined) continue;
      lastIn[d] = e.t;
      if (lastIn[d === 0 ? 1 : 0] > Number.NEGATIVE_INFINITY && lastIn[d === 0 ? 1 : 0] <= e.t) lit = e.t;
    }
  }
  return lit;
}

export function corridorLit(link: string): Predicate {
  return (f) => lastExchange(f.trace, link) > Number.NEGATIVE_INFINITY;
}

/** The trace since the last reset: what a room attempt's predicates look at. */
export function sinceReset(trace: readonly SimEvent[]): readonly SimEvent[] {
  for (let i = trace.length - 1; i >= 0; i--) if (trace[i]?.kind === "world.reset") return trace.slice(i + 1);
  return trace;
}

export function facts(trace: readonly SimEvent[], world: Facts["world"]): Facts {
  return { trace: sinceReset(trace), world };
}

/** A messenger's card (the first, or number `index`) holds this address. */
export function cardPointsTo(device: DeviceId, address: string, index = 1): Predicate {
  return ({ world }) => world.device(device)?.messengers[index - 1]?.to === address;
}

/** A messenger's ping (its card holds a house address) was answered by `from` (any messenger, or number `index`). */
export function messengerPingAnswered(device: DeviceId, from: string, index?: number): Predicate {
  return ({ trace }) =>
    trace.some(
      (e) =>
        e.kind === "echo.heard" &&
        e.device === device &&
        e.from === from &&
        (index === undefined || e.messenger === index),
    );
}

/** Frames `fromDevice` sent with a given origin, that `atDevice` took in. */
function deliveredFrom(trace: readonly SimEvent[], fromDevice: DeviceId, atDevice: DeviceId, origin: string): number[] {
  const mine = new Set<number>();
  const times: number[] = [];
  for (const e of trace) {
    if (e.kind === "frame.tx" && e.device === fromDevice && e.origin === origin) mine.add(e.frameId);
    if (e.kind === "app.deliver" && e.device === atDevice && mine.has(e.frameId)) times.push(e.t);
  }
  return times;
}

/**
 * The automatic messenger was heard: one of its messages was taken in at `to`, and an answer
 * with `text` came back to `from` after it (SRS 0.2 and the Floor 0 boss).
 */
export function messengerAnswered(from: DeviceId, to: DeviceId, text: string): Predicate {
  return ({ trace }) => {
    const heard = [...deliveredFrom(trace, from, to, "messenger"), ...deliveredFrom(trace, from, to, "command")];
    if (heard.length === 0) return false;
    const first = Math.min(...heard);
    return trace.some((e) => e.kind === "app.deliver" && e.device === from && e.text === text && e.t >= first);
  };
}

/** The player's own frame (a command, e.g. from the workbench) was taken in at `to`. */
export function commandFrameHeard(from: DeviceId, to: DeviceId): Predicate {
  return ({ trace }) => deliveredFrom(trace, from, to, "command").length > 0;
}

/** At least `n` `lab send-frame` commands failed (e.g. the door was switched off). */
export function failedSends(device: DeviceId, n: number): Predicate {
  return ({ trace }) =>
    trace.filter(
      (e) => e.kind === "cmd.exec" && e.device === device && e.line.startsWith("lab send-frame") && e.exitCode !== 0,
    ).length >= n;
}

/** The player broadcast again after someone had already answered a broadcast. */
export function broadcastAgainAfterAnswer(device: DeviceId): Predicate {
  return ({ trace }) => {
    let answered = false;
    for (const e of trace) {
      if (e.kind === "app.deliver" && e.device === device && e.text.startsWith("I'm here")) answered = true;
      if (answered && e.kind === "frame.tx" && e.device === device && e.origin === "command") {
        if (e.bytes.subarray(0, 6).every((b) => b === 0xff)) return true;
      }
    }
    return false;
  };
}

export const all =
  (...ps: Predicate[]): Predicate =>
  (f) =>
    ps.every((p) => p(f));
export const not =
  (p: Predicate): Predicate =>
  (f) =>
    !p(f);

// ── Commands, clicks and touches (Region 1 detectors) ───────────────────────────────────────

type Exec = Extract<SimEvent, { kind: "cmd.exec" }>;

function execs(trace: readonly SimEvent[], device: DeviceId | null, pattern: RegExp): Exec[] {
  return trace.filter(
    (e): e is Exec => e.kind === "cmd.exec" && (device === null || e.device === device) && pattern.test(e.line),
  );
}

/** A command matching `pattern` ran on `device` (any device when null) at least `n` times. */
export function ran(device: DeviceId | null, pattern: RegExp, n = 1): Predicate {
  return ({ trace }) => execs(trace, device, pattern).length >= n;
}

/** `first` ran on `device` before `then` had run anywhere (e.g. kitchen's plate read while the cable was out). */
export function ranBefore(device: DeviceId, first: RegExp, then: RegExp): Predicate {
  return ({ trace }) => {
    for (const e of trace) {
      if (e.kind !== "cmd.exec") continue;
      if (then.test(e.line)) return false;
      if (e.device === device && first.test(e.line)) return true;
    }
    return false;
  };
}

/** On one device, `first` ran and later `then` (e.g. unplugging, then plugging back in). */
export function ranThen(first: RegExp, then: RegExp): Predicate {
  return ({ trace }) => {
    const seen = new Set<DeviceId>();
    for (const e of trace) {
      if (e.kind !== "cmd.exec") continue;
      if (seen.has(e.device) && then.test(e.line)) return true;
      if (first.test(e.line)) seen.add(e.device);
    }
    return false;
  };
}

/** A worn-out control was touched at least `n` times (after `after` ran, when given). */
export function touched(device: DeviceId, control: string, n = 1, after?: RegExp): Predicate {
  return ({ trace }) => {
    let armed = !after;
    let count = 0;
    for (const e of trace) {
      if (after && e.kind === "cmd.exec" && after.test(e.line)) armed = true;
      if (armed && e.kind === "control.touch" && e.device === device && e.control === control) count++;
    }
    return count >= n;
  };
}

/** A command's output contained `text` (e.g. a real error such as `Cannot find device`). */
export function printed(device: DeviceId, text: string): Predicate {
  return ({ trace }) => trace.some((e) => e.kind === "proc.output" && e.device === device && e.text.includes(text));
}

// ── Frames the player sent ──────────────────────────────────────────────────────────────────

type Tx = Extract<SimEvent, { kind: "frame.tx" }>;

const macAt = (b: Uint8Array, at: number) =>
  Array.from(b.subarray(at, at + 6), (x) => x.toString(16).padStart(2, "0")).join(":");

/** Frames the player's own commands put on the wire from `device` (out of `iface`, when given). */
function ownFrames(trace: readonly SimEvent[], device: DeviceId, iface?: IfaceName): Tx[] {
  return trace.filter(
    (e): e is Tx =>
      e.kind === "frame.tx" && e.device === device && e.origin === "command" && (!iface || e.iface === iface),
  );
}

/** The player sent at least `n` frames from `device` (out of `iface`) to `to` (a MAC, or "unknown": no door has it). */
export function sentTo(device: DeviceId, to: string, n = 1, iface?: IfaceName): Predicate {
  return ({ trace, world }) => {
    const known = new Set(world.devices().flatMap((d) => d.ifaces.map((i) => i.mac)));
    known.add("ff:ff:ff:ff:ff:ff");
    const hits = ownFrames(trace, device, iface).filter((e) => {
      const dst = macAt(e.bytes, 0);
      return to === "unknown" ? !known.has(dst) : dst === to;
    });
    return hits.length >= n;
  };
}

/**
 * A lab message whose text starts with `text` reached `device`, and then the player's commands sent
 * nothing out of `iface` for `quietMs` of network time (e.g. library said who it was, and the player
 * stopped there).
 */
export function quietAfter(device: DeviceId, text: string, iface: IfaceName, quietMs: number): Predicate {
  return ({ trace, world }) => {
    const heard = trace.find((e) => e.kind === "app.deliver" && e.device === device && e.text.startsWith(text));
    if (!heard) return false;
    const until = heard.t + quietMs;
    if (world.now < until) return false;
    return !ownFrames(trace, device, iface).some((e) => e.t > heard.t && e.t <= until);
  };
}

/**
 * The player made one of the room's fixes, then `waitMs` of network time passed without the rest
 * (the boss's "fixed one thing and stopped looking"). Read from the trace alone.
 */
export function stalledAfterFirstFix(fixes: { device: DeviceId; line: RegExp }[], waitMs: number): Predicate {
  return ({ trace, world }) => {
    const done = new Map<number, number>(); // fix index → when it was first made
    for (const e of trace) {
      if (e.kind !== "cmd.exec" || e.exitCode !== 0) continue;
      fixes.forEach((x, i) => {
        if (!done.has(i) && x.device === e.device && x.line.test(e.line)) done.set(i, e.t);
      });
    }
    if (done.size === 0) return false;
    const cut = Math.min(...done.values()) + waitMs;
    if (world.now < cut) return false;
    return [...done.values()].filter((t) => t <= cut).length < fixes.length;
  };
}

/**
 * `lastExchange` for every cable at once, fed only the new events each time (the engine's per-frame
 * status, where rescanning a long trace for each cable would grow without end). Same rule: a message
 * taken in at one end and one at the other, each after crossing that cable.
 */
export class ExchangeTracker {
  private dirOf = new Map<number, { link: string; dir: 0 | 1 }>();
  private lastIn = new Map<string, [number, number]>();
  private lit = new Map<string, number>();

  feed(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.kind === "world.reset") {
        this.dirOf.clear();
        this.lastIn.clear();
      } else if (e.kind === "link.enter") this.dirOf.set(e.frameId, { link: e.link, dir: e.dir });
      else if (e.kind === "app.deliver") {
        const d = this.dirOf.get(e.frameId);
        if (!d) continue;
        this.dirOf.delete(e.frameId);
        const last = this.lastIn.get(d.link) ?? [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
        last[d.dir] = e.t;
        this.lastIn.set(d.link, last);
        const other = last[d.dir === 0 ? 1 : 0];
        if (other > Number.NEGATIVE_INFINITY && other <= e.t) this.lit.set(d.link, e.t);
      } else if (e.kind === "frame.drop") this.dirOf.delete(e.frameId);
    }
  }

  /** Network time of the latest two-way exchange across `link`, or -Infinity. */
  last(link: string): number {
    return this.lit.get(link) ?? Number.NEGATIVE_INFINITY;
  }
}
