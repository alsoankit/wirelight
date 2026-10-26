/**
 * `ip` (iproute2 6.17): link, addr, route, neigh. Output and errors match real Linux, verified by
 * golden tests captured in namespaces (tools/golden).
 */

import type { CommandContext, ToolId } from "../types";
import { ipAddr } from "./ipaddr";
import { ipLink } from "./iplink";
import { ipNeigh } from "./ipneigh";
import { ipRoute } from "./iproute";
import { IP_USAGE } from "./usage";

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
  // `ip` alone and `ip help` print the whole usage (the only object starting with "h" is help).
  if (!objWord || matches(objWord, "help")) {
    for (const line of IP_USAGE) ctx.err(line);
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
  if (obj.name === "address") return ipAddr(ctx, rest);
  if (obj.name === "route") return ipRoute(ctx, rest);
  return ipNeigh(ctx, rest);
}
