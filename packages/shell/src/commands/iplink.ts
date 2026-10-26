/**
 * `ip link` (show/list/set, and `set <br> type bridge …`). Output and errors match iproute2 6.17
 * (tools/golden/capture.sh, capture-stp.sh).
 */
import type { IfaceState } from "@wirelight/sim";
import type { CommandContext } from "../types";
import { IP_LINK_BRIDGE_USAGE, IP_LINK_USAGE } from "./usage";

/** iproute2 matches objects and subcommands by prefix, in a fixed order. */
const matches = (word: string, full: string) => word.length > 0 && full.startsWith(word);

export function ipLink(ctx: CommandContext, args: string[]): number {
  const [cmd, ...rest] = args;
  if (cmd === undefined) return linkShow(ctx, []);
  // Order matters: iproute2 checks "set" before "show", so `ip link s` means set.
  if (matches(cmd, "set")) return linkSet(ctx, rest);
  if (matches(cmd, "show") || matches(cmd, "list") || cmd === "lst") return linkShow(ctx, rest);
  if (matches(cmd, "help")) return usage(ctx, IP_LINK_USAGE);
  ctx.err(`Command "${cmd}" is unknown, try "ip link help".`);
  return 255;
}

/** A usage text, on stderr with iproute2's exit code. */
export function usage(ctx: CommandContext, lines: readonly string[]): number {
  for (const line of lines) ctx.err(line);
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
    for (const i of d.ifaces) for (const line of formatLink(ctx, i)) ctx.out(line);
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

/** What `type bridge …` asks for (ms; centiseconds on the command line). */
type BridgeOpts = {
  forwardDelay?: number;
  helloTime?: number;
  maxAge?: number;
  ageing?: number;
  stp?: boolean;
  priority?: number;
};

/** iplink_bridge.c's bridge_parse_opt, for the options the game models. A number is an exit code. */
function bridgeOpts(ctx: CommandContext, args: string[]): BridgeOpts | number {
  const o: BridgeOpts = {};
  for (let i = 0; i < args.length; i++) {
    const w = args[i] as string;
    const keys: Record<string, { what: string; max: number; set: (n: number) => void }> = {
      forward_delay: { what: "forward_delay", max: 0xffffffff, set: (n) => (o.forwardDelay = n * 10) },
      hello_time: { what: "hello_time", max: 0xffffffff, set: (n) => (o.helloTime = n * 10) },
      max_age: { what: "max_age", max: 0xffffffff, set: (n) => (o.maxAge = n * 10) },
      ageing_time: { what: "ageing_time", max: 0xffffffff, set: (n) => (o.ageing = n * 10) },
      stp_state: { what: "stp_state", max: 0xffffffff, set: (n) => (o.stp = n !== 0) },
      priority: { what: "priority", max: 0xffff, set: (n) => (o.priority = n) },
    };
    const key = keys[w];
    if (!key) {
      ctx.err(`bridge: unknown command "${w}"?`);
      for (const line of IP_LINK_BRIDGE_USAGE) ctx.err(line);
      return 1;
    }
    const v = args[++i];
    if (v === undefined) {
      ctx.err('Command line is not complete. Try option "help"');
      return 255;
    }
    const n = /^(0x[0-9a-f]+|\d+)$/i.test(v) ? Number(v) : Number.NaN;
    if (!Number.isInteger(n) || n > key.max) {
      ctx.err(`Error: argument "${v}" is wrong: invalid ${key.what}`);
      return 255;
    }
    key.set(n);
  }
  return o;
}

/** Applies `type bridge` options in the kernel's order (br_changelink). A number is an exit code. */
function applyBridgeOpts(ctx: CommandContext, name: string, o: BridgeOpts): number {
  const d = ctx.sim.device(ctx.device);
  if (!d?.bridges[name]) {
    ctx.err("RTNETLINK answers: Operation not supported");
    return 2;
  }
  const times = ctx.sim.setBridgeTimes(ctx.device, name, {
    ...(o.forwardDelay !== undefined ? { forwardDelay: o.forwardDelay } : {}),
    ...(o.helloTime !== undefined ? { helloTime: o.helloTime } : {}),
    ...(o.maxAge !== undefined ? { maxAge: o.maxAge } : {}),
  });
  if (times === "range") {
    ctx.err("RTNETLINK answers: Numerical result out of range");
    return 2;
  }
  if (o.ageing !== undefined) ctx.sim.setBridgeAgeing(ctx.device, name, o.ageing);
  if (o.stp !== undefined) ctx.sim.setBridgeStp(ctx.device, name, o.stp);
  if (o.priority !== undefined) ctx.sim.setBridgePriority(ctx.device, name, o.priority);
  return 0;
}

function linkSet(ctx: CommandContext, args: string[]): number {
  let name: string | undefined;
  let state: "up" | "down" | undefined;
  let bridge: BridgeOpts | undefined;
  for (let i = 0; i < args.length; i++) {
    const w = args[i] as string;
    if (w === "type") {
      // Everything after `type KIND` belongs to that kind's own options.
      const kind = args[i + 1];
      if (kind === undefined) {
        ctx.err('Command line is not complete. Try option "help"');
        return 255;
      }
      const rest = args.slice(i + 2);
      if (kind === "bridge") {
        const o = bridgeOpts(ctx, rest);
        if (typeof o === "number") return o;
        bridge = o;
      } else if (rest.length > 0) {
        ctx.err(`Garbage instead of arguments "${rest[0]} ...". Try "ip link help".`);
        return 1;
      }
      break;
    }
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
  if (!d?.ifaces.some((x) => x.name === name)) {
    ctx.err(`Cannot find device "${name}"`);
    return 1;
  }
  // The kind's options are applied before the flags (rtnl_newlink: changelink, then do_setlink).
  if (bridge) {
    const code = applyBridgeOpts(ctx, name, bridge);
    if (code !== 0) return code;
  }
  if (state) ctx.sim.setAdmin(ctx.device, name, state === "up");
  return 0;
}

/**
 * One interface, as `ip link` prints it. Doors are shown as physical Ethernet NICs (see
 * docs/sim-deviations.md); bridges and the loopback as Linux prints them (iproute2 6.17).
 */
function formatLink(ctx: CommandContext, i: Readonly<IfaceState>): string[] {
  return linkHeader(ctx, i, true);
}

/** The interface's two header lines, as `ip link` (withMode) and `ip addr` print them. */
export function linkHeader(ctx: CommandContext, i: Readonly<IfaceState>, withMode: boolean): string[] {
  const mode = withMode ? " mode DEFAULT" : "";
  const op = ctx.sim.oper(ctx.device, i.name);
  if (i.kind === "loopback") {
    return i.adminUp
      ? [
          `${i.ifindex}: ${i.name}: <LOOPBACK,UP,LOWER_UP> mtu ${i.mtu} qdisc noqueue state UNKNOWN${mode} group default qlen 1000`,
          "    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00",
        ]
      : [
          `${i.ifindex}: ${i.name}: <LOOPBACK> mtu ${i.mtu} qdisc noop state DOWN${mode} group default qlen 1000`,
          "    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00",
        ];
  }
  const flags = doorFlags(ctx, i);
  // A bridge never has a queue of its own; a door shows `noop` until it has first been up.
  const qdisc = i.kind === "bridge" ? (i.adminUp || i.everUp ? "noqueue" : "noop") : i.everUp ? "fq_codel" : "noop";
  const master = i.master ? ` master ${i.master}` : "";
  const state = op.carrier ? "UP" : "DOWN";
  return [
    `${i.ifindex}: ${i.name}: <${flags}> mtu ${i.mtu} qdisc ${qdisc}${master} state ${state}${mode} group default qlen 1000`,
    `    link/ether ${i.mac} brd ff:ff:ff:ff:ff:ff`,
  ];
}

/** A door's flags as `ip link` and `bridge link` print them. */
export function doorFlags(ctx: CommandContext, i: Readonly<IfaceState>): string {
  const op = ctx.sim.oper(ctx.device, i.name);
  return !i.adminUp
    ? "BROADCAST,MULTICAST"
    : op.carrier
      ? "BROADCAST,MULTICAST,UP,LOWER_UP"
      : "NO-CARRIER,BROADCAST,MULTICAST,UP";
}
