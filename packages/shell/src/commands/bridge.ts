/**
 * `bridge fdb` (iproute2 6.17): show, add, del. Output and errors match the golden files captured on
 * real Linux (tools/golden/capture-bridge.sh, packages/shell/test/golden/bridge).
 *
 * Linux lists entries device by device in ifindex order; on a port, the bridge's entries come newest
 * first (its fdb list), then the door's own "self" multicast addresses. Learned entries print with a
 * trailing space where a static/permanent word would go (real iproute2 output).
 */

import type { DeviceState, FdbEntry, IfaceState } from "@wirelight/sim";
import { parseMac } from "@wirelight/sim";
import type { CommandContext } from "../types";

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
  if (!matches(objWord, "fdb")) {
    ctx.err(`Object "${objWord}" is unknown, try "bridge help".`);
    return 255;
  }
  if (!ctx.tools.has("bridge fdb")) {
    ctx.note(ctx.content.notes.locked);
    return 127;
  }
  const [cmd, ...more] = rest;
  if (cmd === undefined || matches(cmd, "show") || matches(cmd, "list"))
    return show(ctx, cmd === undefined ? [] : more);
  if (matches(cmd, "add")) return add(ctx, more);
  if (matches(cmd, "delete")) return del(ctx, more);
  ctx.err(`Command "${cmd}" is unknown, try "bridge fdb help".`);
  return 255;
}

function entryLine(e: FdbEntry, withDev: boolean, master: string): string {
  const dev = withDev ? ` dev ${e.port}` : "";
  if (e.local) return `${e.mac}${dev} master ${master} permanent`;
  if (e.static) return `${e.mac}${dev}${e.sticky ? " sticky" : ""} master ${master} static`;
  return `${e.mac}${dev} master ${master} `;
}

function selfLines(i: IfaceState, withDev: boolean): string[] {
  const dev = withDev ? ` dev ${i.name}` : "";
  return (i.kind === "bridge" ? BRIDGE_SELF : DOOR_SELF).map((m) => `${m}${dev} self permanent`);
}

/** One device's lines (its bridge entries if it's a port, then its own). */
function deviceLines(d: Readonly<DeviceState>, i: IfaceState, withDev: boolean): string[] {
  const lines: string[] = [];
  if (i.master) {
    const br = d.bridges[i.master];
    // Newest first, as the kernel keeps its list.
    for (const e of [...(br?.fdb ?? [])].reverse()) if (e.port === i.name) lines.push(entryLine(e, withDev, i.master));
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
    for (const line of deviceLines(d, i, dev === undefined)) ctx.out(line);
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
