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

/** The messenger's card holds this address. */
export function cardPointsTo(device: DeviceId, mac: string): Predicate {
  return ({ world }) => world.device(device)?.messenger?.to === mac;
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
    const heard = deliveredFrom(trace, from, to, "messenger");
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
