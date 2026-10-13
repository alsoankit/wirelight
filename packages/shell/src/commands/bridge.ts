/**
 * `bridge fdb` (iproute2 6.17): show, add, del; and `bridge link` (show, set): each port's spanning-
 * tree state, priority and cost. Output and errors match the golden files captured on real Linux
 * (tools/golden/capture-bridge.sh and capture-stp.sh, packages/shell/test/golden/bridge and stp).
 *
 * Linux lists entries device by device in ifindex order; on a port, the bridge's entries come newest
 * first (its fdb list), then the door's own "self" multicast addresses. Learned entries print with a
 * trailing space where a static/permanent word would go (real iproute2 output).
 */

import type { BridgeState, DeviceState, FdbEntry, IfaceState } from "@wirelight/sim";
import { fdbStale, parseMac, stpPort } from "@wirelight/sim";
import type { CommandContext } from "../types";
import { doorFlags } from "./iplink";
import { BRIDGE_LINK_USAGE } from "./usage";

const matches = (word: string, full: string) => word.length > 0 && full.startsWith(word);

/** Multicast addresses every door and bridge lists as its own ("self permanent"), as captured. */
const DOOR_SELF = ["33:33:00:00:00:01", "01:00:5e:00:00:01"];
const BRIDGE_SELF = ["33:33:00:00:00:01", "01:00:5e:00:00:6a", "33:33:00:00:00:6a", "01:00:5e:00:00:01"];

export function bridge(ctx: CommandContext, args: string[]): number {
  const [objWord, ...rest] = args;
  if (!objWord) {
    ctx.err("Usage: bridge [ OPTIONS ] OBJECT { COMMAND | help }");
    ctx.err("where  OBJECT := { link | fdb | mdb | vlan | vni | monitor }");
    return 255;
  }
  // iproute2 tries its objects in order (link, fdb, mdb…), so `bridge l` is `bridge link`.
  const obj = matches(objWord, "link") ? "link" : matches(objWord, "fdb") ? "fdb" : null;
  if (!obj) {
    ctx.err(`Object "${objWord}" is unknown, try "bridge help".`);
    return 255;
  }
  if (!ctx.tools.has(obj === "link" ? "bridge link" : "bridge fdb")) {
    ctx.note(ctx.content.notes.locked);
    return 127;
  }
  if (obj === "link") return link(ctx, rest);
  const [cmd, ...more] = rest;
  if (cmd === undefined || matches(cmd, "show") || matches(cmd, "list"))
    return show(ctx, cmd === undefined ? [] : more);
  if (matches(cmd, "add")) return add(ctx, more);
  if (matches(cmd, "delete")) return del(ctx, more);
  ctx.err(`Command "${cmd}" is unknown, try "bridge fdb help".`);
  return 255;
}

function entryLine(e: FdbEntry, withDev: boolean, br: BridgeState, now: number): string {
  const dev = withDev ? ` dev ${e.port}` : "";
  const master = br.name;
  if (e.local) return `${e.mac}${dev} master ${master} permanent`;
  if (e.static) return `${e.mac}${dev}${e.sticky ? " sticky" : ""} master ${master} static`;
  // A learned entry past its hold time but not yet cleaned up shows "stale" where nothing is printed.
  return `${e.mac}${dev} master ${master} ${fdbStale(br, e, now) ? "stale" : ""}`;
}

function selfLines(i: IfaceState, withDev: boolean): string[] {
  const dev = withDev ? ` dev ${i.name}` : "";
  return (i.kind === "bridge" ? BRIDGE_SELF : DOOR_SELF).map((m) => `${m}${dev} self permanent`);
}

/** One device's lines (its bridge entries if it's a port, then its own). */
function deviceLines(d: Readonly<DeviceState>, i: IfaceState, withDev: boolean, now: number): string[] {
  const lines: string[] = [];
  const br = i.master ? d.bridges[i.master] : undefined;
  if (br) {
    // Newest first, as the kernel keeps its list.
    for (const e of [...br.fdb].reverse()) if (e.port === i.name) lines.push(entryLine(e, withDev, br, now));
  }
  return [...lines, ...selfLines(i, withDev)];
}

function show(ctx: CommandContext, args: string[]): number {
  let br: string | undefined;
  let dev: string | undefined;
  for (let n = 0; n < args.length; n++) {
    const w = args[n] as string;
    const v = args[n + 1];
    if ((w === "br" || w === "brport" || w === "dev") && v === undefined) {
      ctx.err('Command line is not complete. Try option "help"');
      return 255;
    }
    if (w === "br") br = args[++n];
    else if (w === "dev" || w === "brport") dev = args[++n];
    else {
      ctx.err(`Unknown argument "${w}"`);
      return 255;
    }
  }
  const d = ctx.sim.device(ctx.device);
  if (!d) return 1;
  if (br !== undefined && !d.ifaces.some((i) => i.name === br && i.kind === "bridge")) {
    ctx.err(`Cannot find bridge device "${br}"`);
    return 255;
  }
  if (dev !== undefined && !d.ifaces.some((i) => i.name === dev)) {
    ctx.err(`Cannot find device "${dev}"`);
    return 255;
  }
  for (const i of d.ifaces) {
    if (i.kind === "loopback") continue;
    if (dev !== undefined && i.name !== dev) continue;
    if (br !== undefined && i.master !== br && i.name !== br) continue;
    for (const line of deviceLines(d, i, dev === undefined, ctx.sim.now)) ctx.out(line);
  }
  return 0;
}

type Parsed = { mac: string; dev: string; master: boolean; static: boolean; sticky: boolean } | { error: number };

function parseEntry(ctx: CommandContext, args: string[]): Parsed {
  let mac: string | undefined;
  let dev: string | undefined;
  let master = false;
  let isStatic = false;
  let sticky = false;
  for (let n = 0; n < args.length; n++) {
    const w = args[n] as string;
    if (w === "dev") dev = args[++n];
    else if (w === "master") master = true;
    else if (w === "static") isStatic = true;
    else if (w === "sticky") sticky = true;
    else if (w === "self" || w === "dynamic" || w === "permanent" || w === "local") continue;
    else if (mac === undefined) mac = w;
    else {
      ctx.err(`Unknown argument "${w}"`);
      return { error: 255 };
    }
  }
  if (mac === undefined || dev === undefined) {
    ctx.err("Device and address are required arguments.");
    return { error: 255 };
  }
  const parsed = parseMac(mac);
  if (!parsed) {
    ctx.err(`Invalid mac address ${mac}`);
    return { error: 255 };
  }
  if (!ctx.sim.device(ctx.device)?.ifaces.some((i) => i.name === dev)) {
    ctx.err(`Cannot find device "${dev}"`);
    return { error: 255 };
  }
  return { mac: parsed, dev, master, static: isStatic, sticky };
}

function add(ctx: CommandContext, args: string[]): number {
  const p = parseEntry(ctx, args);
  if ("error" in p) return p.error;
  const r = ctx.sim.fdbAdd(ctx.device, p.mac, p.dev, { static: p.static || !p.master, sticky: p.sticky });
  if (!r.ok) {
    ctx.err(r.error === "exists" ? "RTNETLINK answers: File exists" : "RTNETLINK answers: Operation not supported");
    return 255;
  }
  return 0;
}

function del(ctx: CommandContext, args: string[]): number {
  const p = parseEntry(ctx, args);
  if ("error" in p) return p.error;
  // Without "master" the request goes to the door itself ("self"), which holds no such entry.
  const r = p.master ? ctx.sim.fdbDel(ctx.device, p.mac, p.dev) : { ok: false as const, error: "missing" as const };
  if (!r.ok) {
    ctx.err("RTNETLINK answers: No such file or directory");
    return 255;
  }
  return 0;
}

// ── `bridge link` ──────────────────────────────────────────────────────────────────────────

function link(ctx: CommandContext, args: string[]): number {
  const [cmd, ...more] = args;
  if (cmd === undefined) return linkShow(ctx, []);
  if (matches(cmd, "set") || matches(cmd, "change")) return linkSet(ctx, more);
  if (matches(cmd, "show") || matches(cmd, "lst") || matches(cmd, "list")) return linkShow(ctx, more);
  ctx.err(`Command "${cmd}" is unknown, try "bridge link help".`);
  return 255;
}

/** `bridge link show [dev DEV] [master BR]`: one line per bridge port; other words are ignored. */
function linkShow(ctx: CommandContext, args: string[]): number {
  let dev: string | undefined;
  let master: string | undefined;
  for (let n = 0; n < args.length; n++) {
    const w = args[n] as string;
    if (!matches(w, "dev") && w !== "master") continue;
    const v = args[++n];
    if (v === undefined) {
      ctx.err('Command line is not complete. Try option "help"');
      return 255;
    }
    if (w === "master") master = v;
    else dev = v;
  }
  const d = ctx.sim.device(ctx.device);
  if (!d) return 1;
  for (const [name, what] of [
    [dev, "device"],
    [master, "device"],
  ] as const)
    if (name !== undefined && !d.ifaces.some((i) => i.name === name)) {
      ctx.err(`Cannot find ${what} "${name}"`);
      return 255;
    }
  for (const i of d.ifaces) {
    const br = i.master ? d.bridges[i.master] : undefined;
    const p = br && stpPort(br, i.name);
    if (!br || !p) continue;
    if (dev !== undefined && i.name !== dev) continue;
    if (master !== undefined && i.master !== master) continue;
    ctx.out(
      `${i.ifindex}: ${i.name}: <${doorFlags(ctx, i)}> mtu ${i.mtu} master ${br.name} state ${p.state} priority ${p.priority} cost ${p.cost} `,
    );
  }
  return 0;
}

/** C's atoi: the leading integer, or 0. */
function atoi(text: string): number {
  const n = Number.parseInt(text.trim(), 10);
  return Number.isNaN(n) ? 0 : n;
}

/** `bridge link set dev DEV [cost N] [priority N]`. */
function linkSet(ctx: CommandContext, args: string[]): number {
  let dev: string | undefined;
  let cost = -1;
  let priority = -1;
  for (let n = 0; n < args.length; n++) {
    const w = args[n] as string;
    if (w === "dev" || w === "cost" || w === "priority") {
      const v = args[++n];
      if (v === undefined) {
        ctx.err('Command line is not complete. Try option "help"');
        return 255;
      }
      if (w === "dev") dev = v;
      else if (w === "cost") cost = atoi(v);
      else priority = atoi(v);
    } else {
      // Anything else (including the other real options, which the game doesn't model) prints usage.
      for (const line of BRIDGE_LINK_USAGE) ctx.err(line);
      return 255;
    }
  }
  if (dev === undefined) {
    ctx.err("Device is a required argument.");
    return 255;
  }
  const d = ctx.sim.device(ctx.device);
  if (!d?.ifaces.some((i) => i.name === dev)) {
    ctx.err(`Cannot find bridge device "${dev}"`);
    return 255;
  }
  // iproute2 sends a cost only if it's above 0 and a priority only if it's 0 or more.
  if (cost <= 0 && priority < 0) return 0;
  const r = ctx.sim.setPortStp(ctx.device, dev, {
    ...(cost > 0 ? { cost } : {}),
    ...(priority >= 0 ? { priority } : {}),
  });
  if (r === "not-a-port") {
    ctx.err("RTNETLINK answers: Operation not supported");
    return 255;
  }
  if (r === "range") {
    ctx.err("RTNETLINK answers: Numerical result out of range");
    return 255;
  }
  return 0;
}
