/**
 * `tcpdump` (4.99.6): `tcpdump [-n] [-e] [-c N] [-x|-xx] -i <door> [filter]`. It keeps running: each
 * captured frame arrives through the trace as the network runs, and the statistics when it has its
 * count or Ctrl+C stops it (SH-03). Output matches real tcpdump (tools/golden/capture-tcpdump.sh).
 */
import { parseFilter } from "@wirelight/sim";
import type { CommandContext } from "../types";
import { TCPDUMP_USAGE } from "./usage";

export function tcpdump(ctx: CommandContext, args: string[]): number | null {
  if (!ctx.tools.has("tcpdump")) {
    ctx.note(ctx.content.notes.locked);
    return 127;
  }
  let numeric = 0;
  let ether = false;
  let hex = false;
  let count: number | null = null;
  let iface: string | undefined;
  const words: string[] = [];
  for (let n = 0; n < args.length; n++) {
    const w = args[n] as string;
    if (!w.startsWith("-") || w === "-") {
      words.push(w);
      continue;
    }
    // Flags may be combined (-ne); -c and -i take a value (attached or next).
    for (let j = 1; j < w.length; j++) {
      const f = w[j] as string;
      if (f === "n") numeric += 1;
      else if (f === "e") ether = true;
      else if (f === "x" || f === "X") hex = true;
      else if (f === "l" || f === "v" || f === "q" || f === "t") continue;
      else if (f === "c" || f === "i") {
        const value = w.slice(j + 1) || args[++n];
        if (value === undefined) {
          ctx.err(`tcpdump: option requires an argument -- '${f}'`);
          for (const line of TCPDUMP_USAGE) ctx.err(line);
          return 1;
        }
        if (f === "c") {
          if (!/^\d+$/.test(value) || Number(value) < 1) {
            ctx.err(`tcpdump: invalid packet count ${value}`);
            return 1;
          }
          count = Number(value);
        } else iface = value;
        break;
      } else {
        ctx.err(`tcpdump: invalid option -- '${f}'`);
        for (const line of TCPDUMP_USAGE) ctx.err(line);
        return 1;
      }
    }
  }
  // pcap opens the door first, then compiles the filter.
  const filter = parseFilter(words);
  const opts = { iface, filter: filter ?? { kind: "all" as const }, count, numeric, ether, hex };
  const opened = ctx.sim.startTcpdump(ctx.device, ctx.execId, { ...opts, check: true });
  if (!opened.ok) {
    for (const line of opened.errors) ctx.err(line);
    return opened.exitCode;
  }
  if (!filter) {
    ctx.err("tcpdump: can't parse filter expression: syntax error");
    return 1;
  }
  const started = ctx.sim.startTcpdump(ctx.device, ctx.execId, opts);
  if (!started.ok) return started.exitCode;
  ctx.err("tcpdump: verbose output suppressed, use -v[v]... for full protocol decode");
  ctx.err(`listening on ${started.iface}, link-type EN10MB (Ethernet), snapshot length 262144 bytes`);
  return null;
}
