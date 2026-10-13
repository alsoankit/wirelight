/**
 * `ip addr` (iproute2 6.17): show, add, del, flush. Output and errors match the golden files captured
 * on real Linux (tools/golden/capture-ipv4.sh, packages/shell/test/golden/addr).
 */
import { type AddrState, type IfaceState, lftLeft, parseCidr } from "@wirelight/sim";
import type { CommandContext } from "../types";
import { linkHeader } from "./iplink";

const matches = (word: string, full: string) => word.length > 0 && full.startsWith(word);

export function ipAddr(ctx: CommandContext, args: string[]): number {
  const [cmd, ...rest] = args;
  if (cmd === undefined) return show(ctx, []);
  if (matches(cmd, "add")) return add(ctx, rest);
  if (matches(cmd, "delete")) return del(ctx, rest);
  if (matches(cmd, "flush")) return flush(ctx, rest);
  if (matches(cmd, "show") || matches(cmd, "list") || cmd === "lst") return show(ctx, rest);
  ctx.err(`Command "${cmd}" is unknown, try "ip address help".`);
  return 255;
}

/** Primaries in the order they were added, then secondaries (the kernel's address list). */
function ordered(addrs: readonly AddrState[]): AddrState[] {
  return [...addrs.filter((a) => !a.secondary), ...addrs.filter((a) => a.secondary)];
}

function addrLines(i: IfaceState, addrs: readonly AddrState[], now: number): string[] {
  const lines: string[] = [];
  for (const a of ordered(addrs.filter((x) => x.dev === i.name))) {
    const brd = a.broadcast ? ` brd ${a.broadcast}` : "";
    // An address given with lifetimes (dhclient's) is "dynamic" and counts down.
    const left = lftLeft(a, now);
    const dyn = left ? " dynamic" : "";
    lines.push(`    inet ${a.ip}/${a.prefix}${brd} scope ${a.scope}${a.secondary ? " secondary" : ""}${dyn} ${a.dev}`);
    lines.push(
      left
        ? `       valid_lft ${left.valid}sec preferred_lft ${left.preferred}sec`
        : "       valid_lft forever preferred_lft forever",
    );
  }
  return lines;
}

function show(ctx: CommandContext, args: string[]): number {
  let name: string | undefined;
  for (let n = 0; n < args.length; n++) {
    const w = args[n] as string;
    const value = w === "dev" ? args[++n] : w;
    if (value === undefined) {
      ctx.err('Command line is not complete. Try option "help"');
      return 255;
    }
    name = value;
  }
  const d = ctx.sim.device(ctx.device);
  if (!d) return 1;
  const ifaces = name === undefined ? d.ifaces : d.ifaces.filter((i) => i.name === name);
  if (ifaces.length === 0) {
    ctx.err(`Device "${name}" does not exist.`);
    return 1;
  }
  for (const i of ifaces) {
    for (const line of linkHeader(ctx, i, false)) ctx.out(line);
    for (const line of addrLines(i, d.addrs, ctx.sim.now)) ctx.out(line);
  }
  return 0;
}

/** `<addr> dev <dev>` in any order. */
function parse(args: string[]): { cidr?: string; dev?: string; incomplete?: boolean } {
  let cidr: string | undefined;
  let dev: string | undefined;
  for (let n = 0; n < args.length; n++) {
    const w = args[n] as string;
    if (w === "dev") {
      dev = args[++n];
      if (dev === undefined) return { incomplete: true };
    } else if (w === "local") cidr = args[++n];
    else cidr = w;
  }
  return { cidr, dev };
}

function checkDev(ctx: CommandContext, dev: string | undefined): boolean {
  if (dev === undefined) {
    ctx.err('Not enough information: "dev" argument is required.');
    return false;
  }
  if (!ctx.sim.device(ctx.device)?.ifaces.some((i) => i.name === dev)) {
    ctx.err(`Cannot find device "${dev}"`);
    return false;
  }
  return true;
}

function checkCidr(ctx: CommandContext, cidr: string): boolean {
  if (parseCidr(cidr)) return true;
  ctx.err(`Error: any valid prefix is expected rather than "${cidr}".`);
  return false;
}

function add(ctx: CommandContext, args: string[]): number {
  const p = parse(args);
  if (p.incomplete) {
    ctx.err('Command line is not complete. Try option "help"');
    return 255;
  }
  if (p.cidr !== undefined && !checkCidr(ctx, p.cidr)) return 1;
  if (!checkDev(ctx, p.dev)) return 1;
  if (p.cidr === undefined) {
    ctx.err("RTNETLINK answers: Operation not supported");
    return 2;
  }
  const r = ctx.sim.addrAdd(ctx.device, p.cidr, p.dev as string);
  if (!r.ok) {
    ctx.err("Error: ipv4: Address already assigned.");
    return 2;
  }
  return 0;
}

function del(ctx: CommandContext, args: string[]): number {
  const p = parse(args);
  if (p.incomplete) {
    ctx.err('Command line is not complete. Try option "help"');
    return 255;
  }
  if (p.cidr !== undefined && !checkCidr(ctx, p.cidr)) return 1;
  if (!checkDev(ctx, p.dev)) return 1;
  if (p.cidr === undefined) {
    ctx.err("RTNETLINK answers: Operation not supported");
    return 2;
  }
  if (!p.cidr.includes("/")) {
    ctx.err("Warning: Executing wildcard deletion to stay compatible with old scripts.");
    ctx.err(`         Explicitly specify the prefix length (${p.cidr}/32) to avoid this warning.`);
    ctx.err("         This special behaviour is likely to disappear in further releases,");
    ctx.err("         fix your scripts!");
  }
  const r = ctx.sim.addrDel(ctx.device, p.cidr, p.dev as string);
  if (!r.ok) {
    ctx.err("Error: ipv4: Address not found.");
    return 2;
  }
  return 0;
}

function flush(ctx: CommandContext, args: string[]): number {
  if (args.length === 0) {
    ctx.err("Flush requires arguments.");
    return 1;
  }
  const p = parse(args);
  const dev = p.dev ?? p.cidr;
  if (!ctx.sim.device(ctx.device)?.ifaces.some((i) => i.name === dev)) {
    ctx.err(`Device "${dev}" does not exist.`);
    return 1;
  }
  ctx.sim.addrFlush(ctx.device, dev as string);
  return 0;
}
