/**
 * `ping` (iputils): `ping [-c N] [-t TTL] [-i S] [-W S] [-n] <addr>`. It keeps running: replies and the
 * statistics arrive through the trace as the network runs (SH-03); Ctrl+C stops it. Output and
 * errors match real iputils (tools/golden/capture-ipv4.sh).
 */
import { ipToInt, lookupRoute, pingHeader } from "@wirelight/sim";
import type { CommandContext } from "../types";
import { PING_USAGE } from "./usage";

export function ping(ctx: CommandContext, args: string[]): number | null {
  if (!ctx.tools.has("ping")) {
    ctx.note(ctx.content.notes.locked);
    return 127;
  }
  let count: number | null = null;
  let ttl: number | undefined;
  let intervalMs: number | undefined;
  let waitMs: number | undefined;
  let numeric = false;
  let target: string | undefined;
  for (let n = 0; n < args.length; n++) {
    const w = args[n] as string;
    if (w === "-n") {
      numeric = true;
      continue;
    }
    const opt = w.match(/^-([ctiW])(.*)$/);
    if (opt) {
      const value = opt[2] || args[++n];
      if (value === undefined) {
        ctx.err(`ping: option requires an argument -- '${opt[1]}'`);
        for (const line of PING_USAGE) ctx.err(line);
        return 2;
      }
      const num = Number(value);
      if (!Number.isFinite(num)) {
        // iputils: a count must be a number; for -i and -W it only warns and keeps the default.
        if (opt[1] === "c" || opt[1] === "t") {
          ctx.err(`ping: invalid argument: '${value}'`);
          return 1;
        }
        ctx.err(`ping: option argument contains garbage: ${value}`);
        ctx.err("ping: this will become fatal error in the future");
        continue;
      }
      if (opt[1] === "c") {
        if (num < 1 || !Number.isInteger(num)) {
          ctx.err(`ping: invalid argument: '${value}': out of range: 1 <= value <= 9223372036854775807`);
          return 1;
        }
        count = num;
      } else if (opt[1] === "t") {
        if (num < 0 || num > 255 || !Number.isInteger(num)) {
          ctx.err(`ping: invalid argument: '${value}': out of range: 0 <= value <= 255`);
          return 1;
        }
        ttl = num;
      } else if (opt[1] === "i") intervalMs = num * 1000;
      else waitMs = num * 1000;
      continue;
    }
    if (w.startsWith("-")) {
      ctx.err(`ping: invalid option -- '${w.slice(1, 2)}'`);
      for (const line of PING_USAGE) ctx.err(line);
      return 2;
    }
    target = w;
  }
  if (target === undefined) {
    ctx.err("ping: usage error: Destination address required");
    return 2;
  }
  // Anything that isn't an address is a name, and there's no DNS server in these rooms.
  if (ipToInt(target) === null) {
    ctx.err(`ping: ${target}: Temporary failure in name resolution`);
    return 2;
  }
  // The kernel refuses a time-to-live of 0; iputils asks only after connecting (measured: with no
  // route, "connect: Network is unreachable" comes first).
  const here = ctx.sim.device(ctx.device);
  if (ttl === 0 && here && lookupRoute(here, target)) {
    ctx.err("ping: cannot set unicast time-to-live: Invalid argument");
    return 2;
  }
  const r = ctx.sim.startPing(ctx.device, ctx.execId, { dst: target, target, count, ttl, intervalMs, waitMs, numeric });
  if (!r.ok) {
    ctx.err(r.error);
    return r.exitCode;
  }
  ctx.out(pingHeader(target, target));
  return null;
}
