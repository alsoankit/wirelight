/**
 * Runs a scenario on the simulator, the way linux.ts runs it on Linux: each step blocks until its
 * command finishes (ping waits for its replies), then the network gets `settleMs`. Captures are what
 * crossed each door (sent and received), in order, as tcpdump on that door would see them.
 */
import { shellContent } from "@wirelight/content";
import { SimBackend, type ToolId } from "@wirelight/shell";
import type { SimEvent } from "@wirelight/sim";
import type { Scenario } from "./scenario";

export interface SimRun {
  outputs: { lines: string[]; exit: number }[];
  captures: Record<string, Uint8Array[]>;
  backend: SimBackend;
}

const ALL_TOOLS: ToolId[] = [
  "ip link",
  "ip addr",
  "ip route",
  "ip neigh",
  "bridge fdb",
  "ping",
  "sysctl",
  "tcpdump",
  "lab send-frame",
  "lab card",
  "lab cable",
];

export function runOnSim(sc: Scenario, seed = 1): SimRun {
  const b = new SimBackend(shellContent);
  b.options = () => ({ tools: new Set(ALL_TOOLS), subtitles: false });
  b.loadSync(sc.topology, sc.faults ?? [], seed);
  const sim = b.world;
  // linux.ts waits about a second for carrier and its listeners before the first step.
  b.advance(1100);
  const outputs: SimRun["outputs"] = [];
  sc.steps.forEach((s, n) => {
    if ("ping" in s) {
      // The same command line linux.ts runs, through the game's shell; it lasts until ping exits.
      const line = `ping -n -c ${s.ping.count}${s.ping.ttl ? ` -t ${s.ping.ttl}` : ""}${s.ping.waitS ? ` -W ${s.ping.waitS}` : ""} ${s.ping.dst}`;
      const h = b.exec(s.device, line, "script");
      let exitCode = h.exitCode;
      if (exitCode === null) {
        const limit = b.now() + 120_000;
        while (exitCode === null && b.now() < limit) {
          b.advance(b.now() + 10);
          const done = sim.trace.find(
            (e): e is Extract<SimEvent, { kind: "proc.exit" }> => e.kind === "proc.exit" && e.execId === h.execId,
          );
          if (done) exitCode = done.exitCode;
        }
      }
      const lines = sim.trace
        .filter(
          (e): e is Extract<SimEvent, { kind: "proc.output" }> =>
            e.kind === "proc.output" && e.execId === h.execId && (e.stream === "stdout" || e.stream === "stderr"),
        )
        .map((e) => e.text);
      outputs.push({ lines, exit: exitCode ?? -1 });
    } else {
      const before = sim.trace.length;
      const h = b.exec(s.device, s.run, "script");
      const lines = sim.trace
        .slice(before)
        .filter(
          (e): e is Extract<SimEvent, { kind: "proc.output" }> =>
            e.kind === "proc.output" && (e.stream === "stdout" || e.stream === "stderr"),
        )
        .map((e) => e.text);
      outputs.push({ lines, exit: h.exitCode ?? -1 });
    }
    b.advance(b.now() + s.settleMs);
  });
  b.advance(b.now() + 300);
  const captures: SimRun["captures"] = {};
  for (const e of sim.trace) {
    if (e.kind === "frame.tx" || e.kind === "frame.rx") {
      // Doors only: bridges and the loopback aren't wires tcpdump listens on in linux.ts.
      const key = `${e.device}:${e.iface}`;
      if (sim.iface(e.device, e.iface)?.kind !== "ether") continue;
      const list = captures[key] ?? [];
      list.push(e.bytes);
      captures[key] = list;
    }
  }
  return { outputs, captures, backend: b };
}
