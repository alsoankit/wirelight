/**
 * `dhclient` (ISC dhclient 4.4.3-P1 with Fedora 44's dhclient-script): `dhclient [-v] [<door>…]`
 * asks the network for an address; `dhclient -r [-v] [<door>…]` gives it back. It keeps running
 * until it is bound (then goes to the background, as the real one forks) or Ctrl+C. What it prints
 * before its first packet comes from here; the rest arrives through the trace (dhcp.ts). Output,
 * errors and exit codes match tools/golden/capture-dhcp.sh.
 */
import { dhclientDoors } from "@wirelight/sim";
import type { CommandContext } from "../types";
import { DHCLIENT_BANNER, DHCLIENT_FATAL_END, DHCLIENT_USAGE } from "./usage";

/** Options that take a value (dhclient's own list); accepted and ignored by the game. */
const WITH_VALUE = new Set(["-p", "-D", "-s", "-cf", "-df", "-lf", "-pf", "-e", "-sf", "-C", "-H", "-F", "-V"]);

export function dhclient(ctx: CommandContext, args: string[]): number | null {
  if (!ctx.tools.has("dhclient")) {
    ctx.note(ctx.content.notes.locked);
    return 127;
  }
  let verbose = false;
  let release = false;
  const doors: string[] = [];
  for (let n = 0; n < args.length; n++) {
    const w = args[n] as string;
    if (w === "-v") verbose = true;
    else if (w === "-r") release = true;
    else if (w === "-4" || w === "-1" || w === "-d" || w === "-nw") continue;
    else if (WITH_VALUE.has(w)) n++;
    else if (w.startsWith("-")) {
      // The banner prints even without -v here (usage() writes it).
      for (const line of DHCLIENT_BANNER) ctx.err(line);
      ctx.err(`Unknown command: ${w}`);
      for (const line of DHCLIENT_USAGE) ctx.err(line);
      for (const line of DHCLIENT_FATAL_END) ctx.err(line);
      return 1;
    } else doors.push(w);
  }
  const d = ctx.sim.device(ctx.device);
  if (!d) return 1;
  const list = doors.length > 0 ? doors : dhclientDoors(d);
  const missing = list.find((x) => !d.ifaces.some((i) => i.name === x));
  // The pid file is read before anything else.
  if (!release) {
    const running = d.procs.some((p) => p.kind === "dhclient" && !p.done);
    if (running) {
      ctx.err(`dhclient(${d.dhclientDb?.pid ?? 0}) is already running - exiting. `);
      for (const line of DHCLIENT_FATAL_END) ctx.err(line);
      return 1;
    }
  }
  if (missing !== undefined) {
    if (verbose) {
      for (const line of DHCLIENT_BANNER) ctx.err(line);
      ctx.err("");
    }
    ctx.err(`Cannot find device "${missing}"`);
    if (verbose) {
      ctx.err(`Error getting hardware address for "${missing}": No such device`);
      for (const line of DHCLIENT_FATAL_END) ctx.err(line);
    }
    return 1;
  }
  // PREINIT: dhclient-script brings the door up first (`ip link set dev <door> up`).
  if (!release) for (const x of list) ctx.sim.setAdmin(ctx.device, x, true);
  const r = ctx.sim.startDhclient(ctx.device, ctx.execId, { doors: list, verbose, release });
  if (!r.ok) return 1;
  if (r.killed) ctx.err("Killed old client process");
  else if (r.stale) ctx.err("Removed stale PID file");
  if (verbose) {
    for (const line of DHCLIENT_BANNER) ctx.err(line);
    ctx.err("");
    for (const x of list) {
      const mac = d.ifaces.find((i) => i.name === x)?.mac ?? "";
      ctx.err(`Listening on LPF/${x}/${mac}`);
      ctx.err(`Sending on   LPF/${x}/${mac}`);
    }
    ctx.err("Sending on   Socket/fallback");
  }
  return null;
}
