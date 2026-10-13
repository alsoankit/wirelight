/**
 * `ip route` (iproute2 6.17): show, add, replace, del, get. Output and errors match the golden files
 * captured on real Linux (tools/golden/capture-route.sh, packages/shell/test/golden/route).
 * Every listed route ends with a space, as iproute2 prints it.
 */
import { ipToInt, parseCidr, type RouteState, routesInOrder } from "@wirelight/sim";
import type { CommandContext } from "../types";
import { IP_ROUTE_USAGE } from "./usage";

const matches = (word: string, full: string) => word.length > 0 && full.startsWith(word);

export function ipRoute(ctx: CommandContext, args: string[]): number {
  const [cmd, ...rest] = args;
  if (cmd === undefined) return show(ctx, []);
  if (cmd === "add") return change(ctx, rest, false);
  if (cmd === "replace") return change(ctx, rest, true);
  if (matches(cmd, "delete")) return del(ctx, rest);
  if (cmd === "get") return get(ctx, rest);
  // The route cache: the exceptions ICMP redirects leave (tools/golden/capture-redirect.sh).
  if (matches(cmd, "flush") && rest[0] === "cache") {
    ctx.sim.routeFlushCache(ctx.device);
    return 0;
  }
  if ((matches(cmd, "show") || matches(cmd, "list")) && rest[0] === "cache") return showCache(ctx, rest.slice(1));
  if (matches(cmd, "show") || matches(cmd, "list") || cmd === "lst") return show(ctx, rest);
  ctx.err(`Command "${cmd}" is unknown, try "ip route help".`);
  return 255;
}

function line(ctx: CommandContext, r: RouteState, withDev: boolean): string {
  const parts = [r.dst];
  if (r.via) parts.push(`via ${r.via}`);
  if (withDev) parts.push(`dev ${r.dev}`);
  if (r.proto !== "boot") parts.push(`proto ${r.proto}`);
  if (r.scope === "link") parts.push("scope link");
  if (r.src) parts.push(`src ${r.src}`);
  // A door without carrier keeps its routes, marked (Linux's RTNH_F_LINKDOWN).
  if (!ctx.sim.oper(ctx.device, r.dev).carrier) parts.push("linkdown");
  return `${parts.join(" ")} `;
}

function show(ctx: CommandContext, args: string[]): number {
  let dev: string | undefined;
  for (let n = 0; n < args.length; n++) {
    if (args[n] === "dev") dev = args[++n];
  }
  const d = ctx.sim.device(ctx.device);
  if (!d) return 1;
  if (dev !== undefined && !d.ifaces.some((i) => i.name === dev)) {
    ctx.err(`Cannot find device "${dev}"`);
    return 1;
  }
  for (const r of routesInOrder(d)) if (dev === undefined || r.dev === dev) ctx.out(line(ctx, r, dev === undefined));
  return 0;
}

/** `ip route show cache [<addr>]`: each exception as two lines, as iproute2 prints them. */
function showCache(ctx: CommandContext, args: string[]): number {
  const only = args.find((w) => w !== "to");
  for (const e of ctx.sim.routeCache(ctx.device)) {
    if (only !== undefined && only !== e.dst) continue;
    ctx.out(`${e.dst} via ${e.gw} dev ${e.dev} `);
    ctx.out(`    cache <redirected> expires ${Math.floor(e.ms / 1000)}sec `);
  }
  return 0;
}

type Spec = { dst: string; via?: string; dev?: string };

function parse(ctx: CommandContext, args: string[]): Spec | number {
  if (args.length === 0) {
    for (const l of IP_ROUTE_USAGE) ctx.err(l);
    return 255;
  }
  let dst: string | undefined;
  let via: string | undefined;
  let dev: string | undefined;
  for (let n = 0; n < args.length; n++) {
    const w = args[n] as string;
    if (w === "via") via = args[++n];
    else if (w === "dev") dev = args[++n];
    else if (w === "proto" || w === "metric" || w === "scope" || w === "src") n++;
    else if (w === "to") dst = args[++n];
    else dst = w;
  }
  if (dst === undefined) {
    for (const l of IP_ROUTE_USAGE) ctx.err(l);
    return 255;
  }
  if (dst !== "default" && !parseCidr(dst)) {
    ctx.err(`Error: any valid prefix is expected rather than "${dst}".`);
    return 1;
  }
  if (via !== undefined && ipToInt(via) === null) {
    ctx.err(`Error: inet address is expected rather than "${via}".`);
    return 1;
  }
  if (dev !== undefined && !ctx.sim.device(ctx.device)?.ifaces.some((i) => i.name === dev)) {
    ctx.err(`Cannot find device "${dev}"`);
    return 1;
  }
  return { dst, via, dev };
}

function change(ctx: CommandContext, args: string[], replace: boolean): number {
  const p = parse(ctx, args);
  if (typeof p === "number") return p;
  const r = ctx.sim.routeAdd(ctx.device, p, replace);
  if (r.ok) return 0;
  const message = {
    exists: "RTNETLINK answers: File exists",
    "unreachable-gw": "Error: Nexthop has invalid gateway.",
    "host-bits": "Error: Invalid prefix for given prefix length.",
    "no-dev": "RTNETLINK answers: No such device",
    missing: "RTNETLINK answers: No such process",
    bad: `Error: any valid prefix is expected rather than "${p.dst}".`,
  }[r.error];
  ctx.err(message);
  return r.error === "bad" ? 1 : 2;
}

function del(ctx: CommandContext, args: string[]): number {
  const p = parse(ctx, args);
  if (typeof p === "number") return p;
  const r = ctx.sim.routeDel(ctx.device, p);
  if (r.ok) return 0;
  ctx.err("RTNETLINK answers: No such process");
  return 2;
}

function get(ctx: CommandContext, args: string[]): number {
  const target = args.filter((w) => w !== "to")[0];
  if (target === undefined) {
    ctx.err("need at least a destination address");
    return 1;
  }
  const c = parseCidr(target);
  if (!c) {
    ctx.err(`Error: any valid prefix is expected rather than "${target}".`);
    return 1;
  }
  if (target.includes("/") && c.prefix !== 32)
    ctx.err(`Warning: /${c.prefix} as prefix is invalid, only /32 (or none) is supported.`);
  const r = ctx.sim.routeGet(ctx.device, c.ip);
  if (r.kind === "unreachable") {
    ctx.err("RTNETLINK answers: Network is unreachable");
    return 2;
  }
  if (r.kind === "local") {
    ctx.out(`local ${r.dst} dev lo src ${r.dst} uid 0 `);
    ctx.out("    cache <local> ");
    return 0;
  }
  ctx.out(`${r.dst}${r.via ? ` via ${r.via}` : ""} dev ${r.dev} src ${r.src} uid 0 `);
  ctx.out(
    r.redirected === undefined ? "    cache " : `    cache <redirected> expires ${Math.floor(r.redirected / 1000)}sec `,
  );
  return 0;
}
