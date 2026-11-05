/** Region 4's own building blocks (routes, forwarding, pings, the Scanner's tracer). Trace and state only. */
import type { DeviceId, SimEvent } from "@wirelight/sim";
import type { Predicate } from "../types";

type Exec = Extract<SimEvent, { kind: "cmd.exec" }>;
type Output = Extract<SimEvent, { kind: "proc.output" }>;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Lines a running `ping` printed on `device`. */
function pingLines(trace: readonly SimEvent[], device: DeviceId): Output[] {
  return trace.filter((e): e is Output => e.kind === "proc.output" && e.device === device);
}

/** `device`'s ping was answered by `from` at least `n` times (`64 bytes from <from>: icmp_seq=…`). */
export function pingAnswered(device: DeviceId, from: string, n = 1): Predicate {
  const re = new RegExp(`^\\d+ bytes from ${esc(from)}: icmp_seq=`);
  return ({ trace }) => pingLines(trace, device).filter((e) => re.test(e.text)).length >= n;
}

/**
 * At least `n` answers from `from` reached `device` after `router`'s navigator woke (hand mode,
 * 0042: the keeper's `wake` step, when forwarding was switched on).
 */
export function answeredAfterWake(device: DeviceId, from: string, router: DeviceId, n: number): Predicate {
  const re = new RegExp(`^\\d+ bytes from ${esc(from)}: icmp_seq=`);
  return ({ trace }) => {
    const woke = trace.find((e) => e.kind === "keeper.step" && e.device === router && e.action === "wake");
    if (!woke) return false;
    return pingLines(trace, device).filter((e) => e.t >= woke.t && re.test(e.text)).length >= n;
  };
}

/** A router's note reached `device`'s ping: `From <from> icmp_seq=N <what>` (e.g. `Time to live exceeded`). */
export function noteFrom(device: DeviceId, from: string, what: string): Predicate {
  const re = new RegExp(`^From ${esc(from)} icmp_seq=\\d+ ${esc(what)}$`);
  return ({ trace }) => pingLines(trace, device).some((e) => re.test(e.text));
}

/** `device`'s routing board has a line for `dst` (via `via`, when given). */
export function hasRoute(device: DeviceId, dst: string, via?: string): Predicate {
  return ({ world }) =>
    world.device(device)?.routes.some((r) => r.dst === dst && (via === undefined || r.via === via)) ?? false;
}

/** One of `device`'s settings has this value (e.g. `net.ipv4.ip_forward` = `1`). */
export function sysctlIs(device: DeviceId, key: string, value: string): Predicate {
  return ({ world }) => world.device(device)?.sysctl[key] === value;
}

/** `device` has an address on this street (`10.0.2.` for 10.0.2.0/24). */
export function hasAddrOn(device: DeviceId, streetPrefix: string): Predicate {
  return ({ world }) => world.device(device)?.addrs.some((a) => a.ip.startsWith(streetPrefix)) ?? false;
}

/** A compare on the Scanner matched `test` (9.1). */
export function compared(test: (c: Extract<SimEvent, { kind: "scanner.compare" }>) => boolean): Predicate {
  return ({ trace }) => trace.some((e) => e.kind === "scanner.compare" && test(e));
}

/** A packet `device` traced was caught on at least `n` streets (9.2: its hops). */
export function tracedHops(device: DeviceId, n: number): Predicate {
  return ({ trace }) => {
    let count = -1;
    let best = 0;
    for (const e of trace) {
      if (e.kind === "scanner.arm" && e.device === device && e.what === "trace") count = 0;
      else if (e.kind === "scanner.arm" && e.what === "trace") count = -1;
      else if (e.kind === "scanner.catch" && e.traced && count >= 0) best = Math.max(best, ++count);
    }
    return best >= n;
  };
}

/** The countdown (`-t`) a `ping` line set, or null. */
function ttlOf(line: string): number | null {
  const m = line.match(/^ping\b.*\s-t\s?(\d+)\b/);
  return m ? Number(m[1]) : null;
}

/** `ping` with a countdown that `test` accepts ran on `device` at least `n` times (9.3, 9.4). */
export function pingWithTtl(device: DeviceId, test: (ttl: number) => boolean, n = 1): Predicate {
  return ({ trace }) =>
    trace.filter((e) => {
      if (e.kind !== "cmd.exec" || e.device !== device) return false;
      const ttl = ttlOf(e.line);
      return ttl !== null && test(ttl);
    }).length >= n;
}

/** A change to a routing board or a setting. */
const CHANGE = /^(?:ip route (?:add|del|delete|change|replace|append|flush)\b|sysctl\s+-w\b)/;
/** Asking the road where a packet stops: a countdown, the tracer, or listening at a door. */
const LOOK = /^(?:ping\b.*\s-t\s?\d+|lab scanner trace\b|tcpdump\b)/;

/**
 * `n` changes that failed in a row (the machine refused them), with no `ping -t`, trace or capture
 * between them (9.B *step-by-step*: changing things without asking the road).
 */
export function failedChangesWithoutLooking(n: number): Predicate {
  return ({ trace }) => {
    let run = 0;
    for (const e of trace) {
      if (e.kind !== "cmd.exec") continue;
      if (LOOK.test(e.line)) run = 0;
      else if (CHANGE.test(e.line) && e.exitCode !== 0 && e.exitCode !== null && ++run >= n) return true;
    }
    return false;
  };
}

/**
 * The player heard `text` at `where` (e.g. a request arriving at belfry, by Capture), then made at
 * least `n` route changes on `near` machines (8.B *one-direction*).
 */
export function changedNearAfterHearing(where: DeviceId, text: string, near: DeviceId[], n: number): Predicate {
  return ({ trace }) => {
    let heard = false;
    let changes = 0;
    for (const e of trace) {
      if (e.kind === "proc.output" && e.device === where && e.text.includes(text)) heard = true;
      else if (heard && e.kind === "cmd.exec" && near.includes(e.device) && /^ip route (?!show\b)\S/.test(e.line))
        changes++;
    }
    return changes >= n;
  };
}

/** A command matching `pattern` ran on any of `devices`. */
export function ranOn(devices: DeviceId[], pattern: RegExp): Predicate {
  return ({ trace }) =>
    trace.some((e): e is Exec => e.kind === "cmd.exec" && devices.includes(e.device) && pattern.test(e.line));
}

/**
 * `device` got its address by asking (the secret room): a `dhclient` there finished binding (it goes
 * to the background with exit 0) and it holds an address between `first` and `last` (same /24).
 */
export function holdsLease(device: DeviceId, first: string, last: string): Predicate {
  const street = first.slice(0, first.lastIndexOf(".") + 1);
  const lo = Number(first.split(".")[3]);
  const hi = Number(last.split(".")[3]);
  return ({ trace, world }) =>
    trace.some(
      (e) =>
        e.kind === "cmd.exec" &&
        e.device === device &&
        /^dhclient\b/.test(e.line) &&
        (e.exitCode === 0 ||
          trace.some(
            (x) => x.kind === "proc.exit" && x.device === device && x.execId === e.execId && x.exitCode === 0,
          )),
    ) &&
    (world.device(device)?.addrs.some((a) => {
      const n = Number(a.ip.split(".")[3]);
      return a.ip.startsWith(street) && n >= lo && n <= hi;
    }) ??
      false);
}
