/**
 * `ip neigh` (iproute2 6.17): show, add/replace (permanent), del, flush. Output and errors match the
 * golden files captured on real Linux (tools/golden/capture-ipv4.sh, packages/shell/test/golden/neigh).
 * Every entry ends with a space, as iproute2 prints it.
 */
import { ipToInt, type NeighState, parseMac } from "@wirelight/sim";
import type { CommandContext } from "../types";

const matches = (word: string, full: string) => word.length > 0 && full.startsWith(word);

export function ipNeigh(ctx: CommandContext, args: string[]): number {
  const [cmd, ...rest] = args;
  if (cmd === undefined) return show(ctx, []);
  if (cmd === "add") return add(ctx, rest, false);
  if (cmd === "replace") return add(ctx, rest, true);
  if (matches(cmd, "delete")) return del(ctx, rest);
  if (matches(cmd, "flush")) return flush(ctx, rest);
  if (matches(cmd, "show") || matches(cmd, "list") || cmd === "lst") return show(ctx, rest);
  ctx.err(`Command "${cmd}" is unknown, try "ip neigh help".`);
  return 255;
}

function line(n: NeighState, withDev: boolean): string {
  const dev = withDev ? ` dev ${n.dev}` : "";
  // An entry without an address yet (INCOMPLETE, FAILED) shows none.
  const mac = n.mac && n.state !== "INCOMPLETE" && n.state !== "FAILED" ? ` lladdr ${n.mac}` : "";
  return `${n.ip}${dev}${mac} ${n.state} `;
}

function devOf(args: string[]): { dev?: string; rest: string[] } {
  const rest: string[] = [];
  let dev: string | undefined;
  for (let n = 0; n < args.length; n++) {
    if (args[n] === "dev") dev = args[++n];
    else rest.push(args[n] as string);
  }
  return { dev, rest };
}

function missingDev(ctx: CommandContext, dev: string): boolean {
  if (ctx.sim.device(ctx.device)?.ifaces.some((i) => i.name === dev)) return false;
  ctx.err(`Cannot find device "${dev}"`);
  return true;
}

function show(ctx: CommandContext, args: string[]): number {
  const { dev } = devOf(args);
  if (dev !== undefined && missingDev(ctx, dev)) return 1;
  const d = ctx.sim.device(ctx.device);
  for (const n of d?.neigh ?? []) if (dev === undefined || n.dev === dev) ctx.out(line(n, dev === undefined));
  return 0;
}

function del(ctx: CommandContext, args: string[]): number {
  const { dev, rest } = devOf(args);
  const ip = rest[0];
  if (dev === undefined || ip === undefined) {
    ctx.err("Device and destination are required arguments.");
    return 255;
  }
  if (missingDev(ctx, dev)) return 1;
  if (ipToInt(ip) === null) {
    ctx.err(`Error: any valid address is expected rather than "${ip}".`);
    return 1;
  }
  if (!ctx.sim.neighDel(ctx.device, ip, dev)) {
    ctx.err("RTNETLINK answers: No such file or directory");
    return 2;
  }
  return 0;
}

function flush(ctx: CommandContext, args: string[]): number {
  const { dev } = devOf(args);
  if (dev === undefined) {
    ctx.err("Flush requires arguments.");
    return 1;
  }
  if (missingDev(ctx, dev)) return 1;
  ctx.sim.neighFlush(ctx.device, dev);
  return 0;
}

function add(ctx: CommandContext, args: string[], replace: boolean): number {
  let ip: string | undefined;
  let mac: string | undefined;
  let dev: string | undefined;
  for (let n = 0; n < args.length; n++) {
    const w = args[n] as string;
    if (w === "lladdr") mac = args[++n];
    else if (w === "dev") dev = args[++n];
    else if (w === "nud") n++;
    else ip = w;
  }
  if (dev === undefined || ip === undefined) {
    ctx.err("Device and destination are required arguments.");
    return 255;
  }
  if (missingDev(ctx, dev)) return 1;
  const parsedMac = mac === undefined ? null : parseMac(mac);
  if (ipToInt(ip) === null || !parsedMac) {
    ctx.err(`Error: any valid address is expected rather than "${ip}".`);
    return 1;
  }
  if (ctx.sim.neighAdd(ctx.device, ip, parsedMac, dev, replace) === "exists") {
    ctx.err("RTNETLINK answers: File exists");
    return 2;
  }
  return 0;
}
