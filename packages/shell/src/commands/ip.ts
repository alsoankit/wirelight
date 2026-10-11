/**
 * `ip` (iproute2). Phase 1 supports `ip link` (show/list/set). Output and errors match iproute2 6.x,
 * verified by golden tests captured on real Linux (tools/golden/capture.sh).
 */
import type { IfaceState } from "@wirelight/sim";
import type { CommandContext, ToolId } from "../types";

/** iproute2 matches objects and subcommands by prefix, in a fixed order. */
const matches = (word: string, full: string) => word.length > 0 && full.startsWith(word);

const OBJECTS: { name: string; aliases?: string[]; tool: ToolId }[] = [
  { name: "address", aliases: ["addr"], tool: "ip addr" },
  { name: "route", tool: "ip route" },
  { name: "link", tool: "ip link" },
  { name: "neighbor", aliases: ["neighbour", "neigh"], tool: "ip neigh" },
];

export function ip(ctx: CommandContext, args: string[]): number {
  const [objWord, ...rest] = args;
  if (!objWord) {
    ctx.err("Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }");
    ctx.err("where  OBJECT := { address | link | neighbor | route }");
    return 255;
  }
  if (objWord.startsWith("-")) {
    ctx.err(`Option "${objWord}" is unknown, try "ip -help".`);
    return 255;
  }
  const obj = OBJECTS.find((o) => matches(objWord, o.name) || o.aliases?.some((a) => matches(objWord, a)));
  if (!obj) {
    ctx.err(`Object "${objWord}" is unknown, try "ip help".`);
    return 1;
  }
  if (!ctx.tools.has(obj.tool)) {
    ctx.note(ctx.content.notes.locked);
    return 127;
  }
  if (obj.name === "link") return ipLink(ctx, rest);
  ctx.note(ctx.content.notes.locked);
  return 127;
}

function ipLink(ctx: CommandContext, args: string[]): number {
  const [cmd, ...rest] = args;
  if (cmd === undefined) return linkShow(ctx, []);
  // Order matters: iproute2 checks "set" before "show", so `ip link s` means set.
  if (matches(cmd, "set")) return linkSet(ctx, rest);
  if (matches(cmd, "show") || matches(cmd, "list") || cmd === "lst") return linkShow(ctx, rest);
  ctx.err(`Command "${cmd}" is unknown, try "ip link help".`);
  return 255;
}

function garbage(ctx: CommandContext, word: string): number {
  ctx.err(`Error: either "dev" is duplicate, or "${word}" is garbage.`);
  return 255;
}

function linkShow(ctx: CommandContext, args: string[]): number {
  let name: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const w = args[i] as string;
    const value = w === "dev" ? args[++i] : w;
    if (value === undefined) {
      ctx.err('Command line is not complete. Try option "help"');
      return 255;
    }
    if (name !== undefined) return garbage(ctx, value);
    name = value;
  }
  const d = ctx.sim.device(ctx.device);
  if (!d) return 1;
  if (name === undefined) {
    for (const line of loopback()) ctx.out(line);
    for (const i of d.ifaces) for (const line of formatLink(ctx, i)) ctx.out(line);
    return 0;
  }
  if (name === "lo") {
    for (const line of loopback()) ctx.out(line);
    return 0;
  }
  const i = d.ifaces.find((x) => x.name === name);
  if (!i) {
    ctx.err(`Device "${name}" does not exist.`);
    return 1;
  }
  for (const line of formatLink(ctx, i)) ctx.out(line);
  return 0;
}

function linkSet(ctx: CommandContext, args: string[]): number {
  let name: string | undefined;
  let state: "up" | "down" | undefined;
  for (let i = 0; i < args.length; i++) {
    const w = args[i] as string;
    if (w === "up" || w === "down") {
      state = w;
    } else if (w === "dev") {
      const v = args[++i];
      if (v === undefined) {
        ctx.err('Command line is not complete. Try option "help"');
        return 255;
      }
      if (name !== undefined) return garbage(ctx, v);
      name = v;
    } else {
      if (name !== undefined) return garbage(ctx, w);
      name = w;
    }
  }
  if (name === undefined) {
    ctx.err('Not enough information: "dev" argument is required.');
    return 255;
  }
  const d = ctx.sim.device(ctx.device);
  if (name === "lo") return 0;
  if (!d?.ifaces.some((x) => x.name === name)) {
    ctx.err(`Cannot find device "${name}"`);
    return 1;
  }
  if (state) ctx.sim.setAdmin(ctx.device, name, state === "up");
  return 0;
}

function loopback(): string[] {
  return [
    "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000",
    "    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00",
  ];
}

/** One interface as a physical Ethernet NIC (see docs/sim-deviations.md). */
function formatLink(ctx: CommandContext, i: Readonly<IfaceState>): string[] {
  const op = ctx.sim.oper(ctx.device, i.name);
  const flags = !i.adminUp
    ? "BROADCAST,MULTICAST"
    : op.carrier
      ? "BROADCAST,MULTICAST,UP,LOWER_UP"
      : "NO-CARRIER,BROADCAST,MULTICAST,UP";
  const qdisc = i.everUp ? "fq_codel" : "noop";
  const state = op.carrier ? "UP" : "DOWN";
  return [
    `${i.ifindex}: ${i.name}: <${flags}> mtu ${i.mtu} qdisc ${qdisc} state ${state} mode DEFAULT group default qlen 1000`,
    `    link/ether ${i.mac} brd ff:ff:ff:ff:ff:ff`,
  ];
}
