/** `ip link` (show/list/set). Output and errors match iproute2 6.17 (tools/golden/capture.sh). */
import type { IfaceState } from "@wirelight/sim";
import type { CommandContext } from "../types";

/** iproute2 matches objects and subcommands by prefix, in a fixed order. */
const matches = (word: string, full: string) => word.length > 0 && full.startsWith(word);

export function ipLink(ctx: CommandContext, args: string[]): number {
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
  if (!d?.ifaces.some((x) => x.name === name)) {
    ctx.err(`Cannot find device "${name}"`);
    return 1;
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
  const flags = !i.adminUp
    ? "BROADCAST,MULTICAST"
    : op.carrier
      ? "BROADCAST,MULTICAST,UP,LOWER_UP"
      : "NO-CARRIER,BROADCAST,MULTICAST,UP";
  // A bridge never has a queue of its own; a door shows `noop` until it has first been up.
  const qdisc = i.kind === "bridge" ? (i.adminUp || i.everUp ? "noqueue" : "noop") : i.everUp ? "fq_codel" : "noop";
  const master = i.master ? ` master ${i.master}` : "";
  const state = op.carrier ? "UP" : "DOWN";
  return [
    `${i.ifindex}: ${i.name}: <${flags}> mtu ${i.mtu} qdisc ${qdisc}${master} state ${state}${mode} group default qlen 1000`,
    `    link/ether ${i.mac} brd ff:ff:ff:ff:ff:ff`,
  ];
}
