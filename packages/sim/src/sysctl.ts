/**
 * Kernel settings (`sysctl`), as one machine sees them. The keys and their defaults are Linux's own
 * net.* listing (data/sysctl-net.ts, captured by tools/golden/capture-sysctl-template.sh), repeated
 * per door. Values the simulator models are live:
 * - net.ipv4.ip_forward and every net.ipv4.conf.*.forwarding (Linux keeps them in step: writing
 *   ip_forward sets all of them);
 * - net.ipv4.neigh.<door>.* timers and counts (a door's neighbour settings; writing
 *   base_reachable_time_ms picks a new random reachable time, as Linux does).
 * Other keys keep what was written. kernel.*, vm.*, fs.* aren't modelled (docs/sim-deviations.md).
 */
import { SYSCTL_DOOR, SYSCTL_GLOBAL, SYSCTL_LO } from "./data/sysctl-net";
import { wakeKeeper } from "./keeper";
import { deviceOf, type Kernel } from "./kernel";
import { NEIGH_DEFAULTS, parmsOf, randomReachable } from "./neigh";
import type { DeviceId, DeviceState, NeighParms } from "./types";

/** The live neighbour settings: which field each key is, and its unit (sysctl value × scale = ms). */
const NEIGH_KEYS: Record<string, { field: Exclude<keyof NeighParms, "reachableMs">; scale: number }> = {
  base_reachable_time_ms: { field: "baseReachableMs", scale: 1 },
  retrans_time_ms: { field: "retransMs", scale: 1 },
  delay_first_probe_time: { field: "delayFirstProbeMs", scale: 1000 },
  mcast_solicit: { field: "mcastSolicit", scale: 1 },
  ucast_solicit: { field: "ucastSolicit", scale: 1 },
};

function forwardingValue(d: Readonly<DeviceState>): string {
  return d.sysctl["net.ipv4.ip_forward"] ?? "0";
}

function isForwardingKey(key: string): boolean {
  return key === "net.ipv4.ip_forward" || /^net\.ipv4\.conf\.[^.]+\.forwarding$/.test(key);
}

/** Every key this machine has, with Linux's defaults (before live values). */
function defaults(d: Readonly<DeviceState>): Map<string, string> {
  const m = new Map<string, string>(SYSCTL_GLOBAL.map(([k, v]) => [k, v]));
  for (const [k, v] of SYSCTL_LO) m.set(k, v);
  for (const i of d.ifaces) {
    if (i.kind === "loopback") continue;
    for (const [k, v] of SYSCTL_DOOR) m.set(k.replace("<door>", i.name), v);
  }
  return m;
}

function live(d: Readonly<DeviceState>, key: string, fallback: string): string {
  if (isForwardingKey(key)) return forwardingValue(d);
  const n = key.match(/^net\.ipv4\.neigh\.([^.]+)\.([a-z_]+)$/);
  const reader = n && NEIGH_KEYS[n[2] as string];
  if (n && reader) return String(parmsOf(d as DeviceState, n[1] as string)[reader.field] / reader.scale);
  return d.sysctl[key] ?? fallback;
}

/** `sysctl -a`: every key and value, in the order sysctl prints them (sorted by path). */
export function sysctlList(d: Readonly<DeviceState>): [string, string][] {
  const keys = [...defaults(d).entries()];
  keys.sort(([a], [b]) => comparePath(a, b));
  return keys.map(([k, v]) => [k, live(d, k, v)]);
}

/** Directory order: compare path parts one by one, as sysctl walks /proc/sys. */
function comparePath(a: string, b: string): number {
  const x = a.split(".");
  const y = b.split(".");
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const p = x[i] as string;
    const q = y[i] as string;
    if (p !== q) return p < q ? -1 : 1;
  }
  return x.length - y.length;
}

export function sysctlRead(d: Readonly<DeviceState>, key: string): string | undefined {
  const fallback = defaults(d).get(key);
  return fallback === undefined ? undefined : live(d, key, fallback);
}

export type SysctlWrite = "ok" | "unknown" | "invalid";

export function sysctlWrite(k: Kernel, device: DeviceId, key: string, value: string): SysctlWrite {
  const d = deviceOf(k, device);
  if (!d) return "unknown";
  const before = sysctlRead(d, key);
  if (before === undefined) return "unknown";
  // Numeric settings take integers only ("" and "yes" are refused by the kernel).
  if (/^-?\d+$/.test(before) && !/^-?\d+$/.test(value.trim())) return "invalid";
  const v = value.trim();
  if (isForwardingKey(key)) {
    d.sysctl["net.ipv4.ip_forward"] = v;
    // The router's navigator, asleep at the lectern (8.5), wakes when it's allowed to pass packets on.
    if (v === "1" && d.keeper.asleep === "router") {
      k.emit({ kind: "table.change", t: k.s.t, device, table: "sysctl", op: "set", key, before, after: v });
      wakeKeeper(k, device);
      return "ok";
    }
  } else {
    const n = key.match(/^net\.ipv4\.neigh\.([^.]+)\.([a-z_]+)$/);
    const writer = n && NEIGH_KEYS[n[2] as string];
    if (n && writer) {
      const dev = n[1] as string;
      const p = d.neighParms[dev] ?? { ...NEIGH_DEFAULTS, reachableMs: NEIGH_DEFAULTS.baseReachableMs };
      d.neighParms[dev] = p;
      p[writer.field] = Number(v) * writer.scale;
      if (n[2] === "base_reachable_time_ms") p.reachableMs = randomReachable(k, p.baseReachableMs);
    } else d.sysctl[key] = v;
  }
  k.emit({ kind: "table.change", t: k.s.t, device, table: "sysctl", op: "set", key, before, after: v });
  return "ok";
}
