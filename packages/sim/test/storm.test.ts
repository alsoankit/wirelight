/**
 * A switching loop (4.B, The Storm): two bridges joined by two cables, STP off. On real Linux one
 * broadcast circles forever at CPU speed (~1 M frames/s per veth in a 1 s run, measured;
 * tools/golden/LINUX-FACTS.md). The simulator must keep it bounded and watchable: slow links
 * (bandwidthBps) and queue limits cap it, the clock always advances, and taking one loop port down
 * or unplugging one span calms it at once.
 */
import { describe, expect, it } from "vitest";
import { type SimEvent, Simulator, type Topology } from "../src";

function halls(): Topology {
  const host = (id: string, mac: string, cidr: string) => ({
    id,
    hostname: id,
    kind: "host" as const,
    interfaces: [{ name: "eth0", mac }],
    addrs: [{ dev: "eth0", cidr }],
  });
  const slow = { bandwidthBps: 64_000, queueLimit: 16 };
  return {
    devices: [
      {
        id: "hall-a",
        hostname: "hall-a",
        kind: "host",
        interfaces: [
          { name: "eth1", mac: "02:00:00:00:00:a1" },
          { name: "eth3", mac: "02:00:00:00:00:a3" },
          { name: "eth4", mac: "02:00:00:00:00:a4" },
        ],
        bridges: [{ name: "br0", ports: ["eth1", "eth3", "eth4"] }],
      },
      {
        id: "hall-b",
        hostname: "hall-b",
        kind: "host",
        interfaces: [
          { name: "eth0", mac: "02:00:00:00:00:b0" },
          { name: "eth3", mac: "02:00:00:00:00:b3" },
          { name: "eth4", mac: "02:00:00:00:00:b4" },
        ],
        bridges: [{ name: "br0", ports: ["eth0", "eth3", "eth4"] }],
      },
      host("a", "02:00:00:00:00:0a", "10.0.0.1/24"),
      host("wren", "02:00:00:00:00:13", "10.0.0.2/24"),
    ],
    links: [
      { id: "la", a: { device: "hall-a", iface: "eth1" }, b: { device: "a", iface: "eth0" } },
      { id: "span", a: { device: "hall-a", iface: "eth3" }, b: { device: "hall-b", iface: "eth0" }, ...slow },
      { id: "span-2", a: { device: "hall-a", iface: "eth4" }, b: { device: "hall-b", iface: "eth4" }, ...slow },
      { id: "lw", a: { device: "hall-b", iface: "eth3" }, b: { device: "wren", iface: "eth0" } },
    ],
  };
}

/** Advance to `to`, as the game does, a budget of events at a time; returns how many calls it took. */
function run(sim: Simulator, to: number): number {
  let calls = 0;
  while (sim.now < to) {
    sim.advance(to);
    calls++;
    if (calls > 10_000) throw new Error("the clock stopped moving");
  }
  return calls;
}

const spanFrames = (sim: Simulator, from: number, to: number) =>
  sim.trace.filter(
    (e): e is Extract<SimEvent, { kind: "link.enter" }> =>
      e.kind === "link.enter" && (e.link === "span" || e.link === "span-2") && e.t >= from && e.t < to,
  ).length;

describe("a switching loop (4.B)", () => {
  it("keeps one broadcast circling forever, bounded by the slow spans", () => {
    const sim = new Simulator(halls());
    sim.startPing("a", 1, { dst: "10.0.0.2", target: "10.0.0.2", count: 1, numeric: true });
    run(sim, 10_000);
    // Still going after 10 s, at a rate the links allow: 42-byte ARP frames at 64 kbit/s are
    // 5.25 ms each, so at most ~190 per second per direction per span.
    const late = spanFrames(sim, 9000, 10_000);
    expect(late).toBeGreaterThan(50);
    expect(late).toBeLessThanOrEqual(4 * 200);
    expect(sim.inFlight()).toBeLessThanOrEqual(4 * 16);
    // Names jump between doors: a's address is learned on a span port at some point.
    const moves = sim.trace.filter(
      (e) => e.kind === "table.change" && e.table === "fdb" && e.key === "02:00:00:00:00:0a" && e.op === "set",
    );
    expect(moves.length).toBeGreaterThan(2);
  });

  it("calms at once when one loop port goes down", () => {
    const sim = new Simulator(halls());
    sim.startPing("a", 1, { dst: "10.0.0.2", target: "10.0.0.2", count: 1, numeric: true });
    run(sim, 3000);
    sim.setAdmin("hall-b", "eth4", false);
    run(sim, 4000);
    // What was already on the wire drains within a few frame times; then nothing.
    expect(spanFrames(sim, 3200, 4000)).toBe(0);
  });

  it("calms when a span is unplugged", () => {
    const sim = new Simulator(halls());
    sim.startPing("a", 1, { dst: "10.0.0.2", target: "10.0.0.2", count: 1, numeric: true });
    run(sim, 3000);
    expect(sim.plugCable("hall-a", "eth4", false)).toBe("ok");
    run(sim, 4000);
    expect(spanFrames(sim, 3200, 4000)).toBe(0);
  });

  it("after the storm, deleting a pinned wrong entry lets wren be reached", () => {
    const sim = new Simulator(halls(), [
      { kind: "fdb-static", device: "hall-b", mac: "02:00:00:00:00:13", port: "eth0", sticky: true },
    ]);
    sim.startPing("a", 1, { dst: "10.0.0.2", target: "10.0.0.2", count: 1, numeric: true });
    run(sim, 3000);
    sim.setAdmin("hall-b", "eth4", false);
    run(sim, 4000);
    expect(sim.fdbDel("hall-b", "02:00:00:00:00:13", "eth0")).toEqual({ ok: true });
    sim.startPing("a", 2, { dst: "10.0.0.2", target: "10.0.0.2", count: 1, numeric: true });
    run(sim, 8000);
    const replies = sim.trace.filter(
      (e) => e.kind === "proc.output" && e.execId === 2 && e.text.startsWith("64 bytes from 10.0.0.2"),
    );
    expect(replies.length).toBe(1);
  });
});
