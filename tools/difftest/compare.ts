/**
 * Compares a scenario's two runs. Differences are reported as plain lines; an empty list means the
 * simulator agreed with Linux on everything compared: what crossed each door (in order), what each
 * command printed (timings and random ids normalised), and the final neighbour, route and
 * forwarding tables.
 */
import { keyFromBytes, keyFromTcpdump, stpKeyFromBytes, stpKeyFromTcpdump } from "./keys";
import type { LinuxRun } from "./linux";
import type { SimRun } from "./simrun";

export function normaliseOutput(line: string): string {
  return line
    .replace(/time=\d+(\.\d+)? ms/g, "time=<t> ms")
    .replace(/, time \d+ms/g, ", time <t>ms")
    .replace(/rtt min\/avg\/max\/mdev = [\d./]+ ms/g, "rtt min/avg/max/mdev = <rtt> ms")
    .replace(/, pipe \d+/g, "")
    .replace(/\(xid=0x[0-9a-f]+\)/g, "(xid=<xid>)")
    .replace(/ interval \d+ \(xid/g, " interval <n> (xid")
    .replace(/renewal in \d+ seconds/g, "renewal in <n> seconds");
}

type Table = { neigh: string[]; route: string[]; fdb: string[] };

function linuxTables(run: LinuxRun, device: string): Table {
  const t = run.tables[device] ?? { neigh: [], route: [], fdb: [] };
  const neigh = (t.neigh as { dst: string; dev: string; lladdr?: string; state?: string[] }[]).map(
    (n) => `${n.dst} dev ${n.dev} ${n.lladdr ?? "-"} ${(n.state ?? []).join(",")}`,
  );
  const route = (t.route as { dst: string; gateway?: string; dev: string; protocol?: string; prefsrc?: string }[]).map(
    (r) =>
      `${r.dst}${r.gateway ? ` via ${r.gateway}` : ""} dev ${r.dev}${r.protocol === "kernel" ? " proto kernel" : ""}${r.prefsrc ? ` src ${r.prefsrc}` : ""}`,
  );
  const fdb = (t.fdb as { mac: string; ifname: string; master?: string; state?: string; flags?: string[] }[])
    .filter((e) => e.master && e.state !== "permanent" && !(e.flags ?? []).includes("self"))
    .map(
      (e) =>
        `${e.mac} dev ${e.ifname}${e.state === "static" ? " static" : ""}${(e.flags ?? []).includes("sticky") ? " sticky" : ""}`,
    );
  return { neigh: neigh.sort(), route: route.sort(), fdb: fdb.sort() };
}

function simTables(run: SimRun, device: string): Table {
  const d = run.backend.world.device(device);
  if (!d) return { neigh: [], route: [], fdb: [] };
  const neigh = d.neigh.map((n) => `${n.ip} dev ${n.dev} ${n.mac ?? "-"} ${n.state}`);
  const route = d.routes.map(
    (r) =>
      `${r.dst}${r.via ? ` via ${r.via}` : ""} dev ${r.dev}${r.proto === "kernel" ? " proto kernel" : ""}${r.src ? ` src ${r.src}` : ""}`,
  );
  const fdb = Object.values(d.bridges).flatMap((br) =>
    br.fdb
      .filter((e) => !e.local)
      .map((e) => `${e.mac} dev ${e.port}${e.static ? " static" : ""}${e.sticky ? " sticky" : ""}`),
  );
  return { neigh: neigh.sort(), route: route.sort(), fdb: fdb.sort() };
}

export function compare(linux: LinuxRun, sim: SimRun, devices: string[]): string[] {
  const diffs: string[] = [];
  // Doors.
  const doors = new Set([...Object.keys(linux.captures), ...Object.keys(sim.captures)]);
  for (const door of [...doors].sort()) {
    const real = (linux.captures[door] ?? []).map(keyFromTcpdump).filter((x): x is string => x !== null);
    const ours = (sim.captures[door] ?? []).map(keyFromBytes).filter((x): x is string => x !== null);
    const n = Math.max(real.length, ours.length);
    for (let i = 0; i < n; i++) {
      if (real[i] !== ours[i]) {
        diffs.push(`${door} frame ${i + 1}:\n    linux: ${real[i] ?? "(none)"}\n    sim:   ${ours[i] ?? "(none)"}`);
        break; // the first difference per door is enough to read
      }
    }
  }
  // Spanning tree: which BPDUs each door saw (who sent them, with which flags), not when.
  for (const door of [...doors].sort()) {
    const set = (keys: (string | null)[]) => [...new Set(keys.filter((x): x is string => x !== null))].sort();
    const real = set((linux.captures[door] ?? []).map(stpKeyFromTcpdump));
    const ours = set((sim.captures[door] ?? []).map(stpKeyFromBytes));
    if (JSON.stringify(real) !== JSON.stringify(ours))
      diffs.push(`${door} BPDUs:\n    linux: ${JSON.stringify(real)}\n    sim:   ${JSON.stringify(ours)}`);
  }
  // Commands.
  linux.outputs.forEach((real, n) => {
    const ours = sim.outputs[n];
    const a = real.lines.map(normaliseOutput);
    const b = (ours?.lines ?? []).map(normaliseOutput);
    if (JSON.stringify(a) !== JSON.stringify(b) || real.exit !== ours?.exit)
      diffs.push(
        `step ${n + 1} output:\n    linux (exit ${real.exit}): ${JSON.stringify(a)}\n    sim   (exit ${ours?.exit}): ${JSON.stringify(b)}`,
      );
  });
  // Tables. A bridge's own address (its br0) shows up in other switches' tables only through its
  // IGMP reports (multicast noise the game doesn't model, docs/sim-deviations.md), so it's left out.
  const bridgeMacs = new Set(
    sim.backend.world
      .devices()
      .flatMap((d) => d.ifaces)
      .filter((i) => i.kind === "bridge")
      .map((i) => i.mac),
  );
  const noBridgeMacs = (t: Table): Table => ({
    ...t,
    fdb: t.fdb.filter((l) => !bridgeMacs.has(l.split(" ")[0] ?? "")),
  });
  for (const d of devices) {
    const a = noBridgeMacs(linuxTables(linux, d));
    const b = noBridgeMacs(simTables(sim, d));
    for (const t of ["neigh", "route", "fdb"] as const)
      if (JSON.stringify(a[t]) !== JSON.stringify(b[t]))
        diffs.push(`${d} ${t}:\n    linux: ${JSON.stringify(a[t])}\n    sim:   ${JSON.stringify(b[t])}`);
  }
  return diffs;
}
