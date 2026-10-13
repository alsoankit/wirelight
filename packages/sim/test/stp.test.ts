/**
 * The bridge's spanning tree (kernel STP, 802.1D), against what was measured on kernel 7.1
 * (tools/golden/LINUX-FACTS.md, "Spanning tree"; goldens in packages/shell/test/golden/stp): two
 * halls joined twice, the Peacekeeper's loop.
 */
import { describe, expect, it } from "vitest";
import { type SimEvent, Simulator, type StpPortState, toHex } from "../src";
import { halls } from "./fixtures";

const states = (sim: Simulator, hall: string): StpPortState[] =>
  sim.device(hall)?.bridges.br0?.stp.ports.map((p) => p.state) ?? [];

function run(sim: Simulator, to: number): void {
  while (sim.now < to) sim.advance(to);
}

/** Pings once from a to b; true if the reply came back. */
function pingOnce(sim: Simulator, execId: number): boolean {
  sim.startPing("a", execId, { dst: "10.0.0.2", target: "10.0.0.2", count: 1, waitMs: 1000, numeric: true });
  run(sim, sim.now + 1500);
  return sim.trace.some(
    (e) => e.kind === "proc.output" && e.execId === execId && e.text.startsWith("64 bytes from 10.0.0.2"),
  );
}

const bpdusFrom = (sim: Simulator, device: string, iface: string) =>
  sim.trace.filter(
    (e): e is Extract<SimEvent, { kind: "frame.tx" }> =>
      e.kind === "frame.tx" && e.device === device && e.iface === iface && e.bytes[0] === 0x01 && e.bytes[2] === 0xc2,
  );

describe("spanning tree from the start (stp_state 1 at creation)", () => {
  it("listens 15 s, learns 15 s, then forwards; the root is hall-a and hall-b blocks eth3", () => {
    const sim = new Simulator(halls(true));
    run(sim, 5000);
    expect(states(sim, "hall-a")).toEqual(["listening", "listening", "listening"]);
    expect(states(sim, "hall-b")).toEqual(["listening", "listening", "blocking"]);
    expect(sim.oper("hall-a", "br0").carrier).toBe(false);
    run(sim, 22_000);
    expect(states(sim, "hall-a")).toEqual(["learning", "learning", "learning"]);
    expect(states(sim, "hall-b")).toEqual(["learning", "learning", "blocking"]);
    run(sim, 40_000);
    expect(states(sim, "hall-a")).toEqual(["forwarding", "forwarding", "forwarding"]);
    expect(states(sim, "hall-b")).toEqual(["forwarding", "forwarding", "blocking"]);
    expect(sim.oper("hall-a", "br0").carrier).toBe(true);
    const b = sim.device("hall-b")?.bridges.br0?.stp;
    expect(b?.designatedRoot).toBe("8000020000000a01");
    expect(b?.rootPort).toBe(2);
    expect(b?.rootPathCost).toBe(2);
  });

  it("changes state on the timer wheel: learning at 15.36 s, forwarding at 30.72 s", () => {
    const sim = new Simulator(halls(true));
    sim.advance(100_000);
    const changes = sim.trace.filter(
      (e): e is Extract<SimEvent, { kind: "table.change" }> =>
        e.kind === "table.change" && e.table === "stp" && e.device === "hall-a" && e.key === "eth1",
    );
    expect(changes.map((e) => [e.t, e.after])).toEqual([
      [15_360, "learning"],
      [30_720, "forwarding"],
    ]);
  });

  it("sends the root's hellos every 2 s (round_jiffies, then the wheel: 1.984, 1.984, 2.048 s apart)", () => {
    const sim = new Simulator(halls(true));
    run(sim, 12_000);
    const times = bpdusFrom(sim, "hall-a", "eth1").map((e) => e.t);
    expect(times.slice(0, 6)).toEqual([2048, 4032, 6016, 8064, 10048, 12032].filter((t) => t <= 12_000));
  });

  it("builds config BPDUs byte for byte as Linux does", () => {
    const sim = new Simulator(halls(true));
    run(sim, 3000);
    const [first] = bpdusFrom(sim, "hall-a", "eth2");
    // As captured (tcpdump -e -xx): 802.3 length 38, LLC 42 42 03, then the 35-byte BPDU.
    expect(toHex(first?.bytes ?? new Uint8Array())).toBe(
      "0180c2000000020000000a020026424203" +
        "000000" + // protocol id, version
        "0000" + // config, no flags
        "8000020000000a01" + // root
        "00000000" + // root path cost
        "8000020000000a01" + // bridge id
        "8002" + // port id
        "0000140002000f00", // message age 0, max age 20 s, hello 2 s, forward delay 15 s (1/256 s)
    );
  });

  it("passes nothing while listening, and traffic once forwarding", () => {
    const sim = new Simulator(halls(true));
    run(sim, 5000);
    expect(pingOnce(sim, 1)).toBe(false);
    run(sim, 40_000);
    expect(pingOnce(sim, 2)).toBe(true);
  });

  it("learns the root's BPDU source on a forwarding root port (link-local learning)", () => {
    const sim = new Simulator(halls(true));
    run(sim, 40_000);
    const fdb = sim
      .device("hall-b")
      ?.bridges.br0?.fdb.filter((e) => !e.local)
      .map((e) => `${e.mac} ${e.port}`);
    expect(fdb).toEqual(["02:00:00:00:0a:02 eth2"]);
  });
});

describe("failover: the active span unplugged", () => {
  it("the blocked port listens at once, learns 15 s later, forwards 15 s after that", () => {
    const sim = new Simulator(halls(true));
    run(sim, 40_000);
    expect(pingOnce(sim, 1)).toBe(true);
    sim.setAdmin("hall-a", "eth2", false);
    const at = sim.now;
    expect(states(sim, "hall-b")).toEqual(["forwarding", "disabled", "listening"]);
    expect(states(sim, "hall-a")).toEqual(["forwarding", "disabled", "forwarding"]);
    expect(pingOnce(sim, 2)).toBe(false);
    run(sim, at + 22_000);
    expect(states(sim, "hall-b")).toEqual(["forwarding", "disabled", "learning"]);
    run(sim, at + 32_000);
    expect(states(sim, "hall-b")).toEqual(["forwarding", "disabled", "forwarding"]);
    expect(pingOnce(sim, 3)).toBe(true);
    // Going forwarding was a topology change: hall-b told the root with a TCN on its new root port.
    const tcn = sim.trace.find(
      (e) => e.kind === "frame.tx" && e.device === "hall-b" && e.iface === "eth3" && e.bytes[20] === 0x80,
    );
    expect(tcn).toBeDefined();
  });
});

describe("STP turned on while the loop is closed", () => {
  it("the first bridge's own BPDU comes back round the loop and blocks its second span", () => {
    const sim = new Simulator(halls(false));
    run(sim, 1000);
    sim.setBridgeStp("hall-a", "br0", true);
    const t0 = sim.now;
    run(sim, t0 + 4200);
    sim.setBridgeStp("hall-b", "br0", true);
    run(sim, t0 + 10_000);
    expect(states(sim, "hall-a")).toEqual(["forwarding", "forwarding", "blocking"]);
    expect(states(sim, "hall-b")).toEqual(["forwarding", "forwarding", "forwarding"]);
    // Nothing refreshes hall-a eth3's stored BPDU once hall-b runs STP: it ages out after 20 s.
    run(sim, t0 + 32_000);
    expect(states(sim, "hall-a")).toEqual(["forwarding", "forwarding", "listening"]);
    expect(states(sim, "hall-b")).toEqual(["forwarding", "forwarding", "blocking"]);
    run(sim, t0 + 64_000);
    expect(states(sim, "hall-a")).toEqual(["forwarding", "forwarding", "forwarding"]);
    expect(states(sim, "hall-b")).toEqual(["forwarding", "forwarding", "blocking"]);
  });

  it("calms a raging storm within one hello", () => {
    const sim = new Simulator(halls(false, true));
    run(sim, 500);
    sim.startPing("a", 1, { dst: "10.0.0.9", target: "10.0.0.9", count: 1, waitMs: 1000, numeric: true });
    run(sim, 3000);
    const spanFrames = (from: number, to: number) =>
      sim.trace.filter(
        (e) => e.kind === "link.enter" && (e.link === "span" || e.link === "span-2") && e.t >= from && e.t < to,
      ).length;
    expect(spanFrames(2000, 3000)).toBeGreaterThan(100);
    sim.setBridgeStp("hall-a", "br0", true);
    run(sim, 8000);
    expect(states(sim, "hall-a")).toEqual(["forwarding", "forwarding", "blocking"]);
    // Only the hellos cross now (and the last copies draining from the slow spans' queues).
    expect(spanFrames(7000, 8000)).toBeLessThan(5);
  });

  it("turned off again, a blocked port stays blocked until its stored BPDU ages out (20 s)", () => {
    const sim = new Simulator(halls(true));
    run(sim, 40_000);
    sim.setBridgeStp("hall-a", "br0", false);
    sim.setBridgeStp("hall-b", "br0", false);
    run(sim, 41_000);
    expect(states(sim, "hall-b")).toEqual(["forwarding", "forwarding", "blocking"]);
    run(sim, 62_000);
    expect(states(sim, "hall-b")).toEqual(["forwarding", "forwarding", "forwarding"]);
  });
});

describe("election settings", () => {
  it("a cheaper span on hall-b becomes its root port", () => {
    const sim = new Simulator(halls(true));
    expect(sim.setPortStp("hall-b", "eth3", { cost: 1 })).toBe("ok");
    run(sim, 40_000);
    expect(states(sim, "hall-b")).toEqual(["forwarding", "blocking", "forwarding"]);
  });

  it("a lower bridge priority makes hall-b the root", () => {
    const sim = new Simulator(halls(true));
    sim.setBridgePriority("hall-b", "br0", 4096);
    run(sim, 40_000);
    expect(states(sim, "hall-a")).toEqual(["forwarding", "forwarding", "blocking"]);
    expect(states(sim, "hall-b")).toEqual(["forwarding", "forwarding", "forwarding"]);
  });

  it("refuses out-of-range port settings as the kernel does", () => {
    const sim = new Simulator(halls(true));
    expect(sim.setPortStp("hall-b", "eth3", { priority: 64 })).toBe("range");
    expect(sim.setPortStp("hall-b", "eth3", { cost: 70_000 })).toBe("range");
    expect(sim.setPortStp("a", "eth0", { cost: 3 })).toBe("not-a-port");
    expect(sim.setBridgeTimes("hall-a", "br0", { helloTime: 500 })).toBe("range");
  });
});

describe("STP off (the default)", () => {
  it("ports forward as soon as they're up, as before", () => {
    const sim = new Simulator(halls(false));
    expect(states(sim, "hall-a")).toEqual(["forwarding", "forwarding", "forwarding"]);
    sim.setAdmin("hall-a", "br0", false);
    expect(states(sim, "hall-a")).toEqual(["disabled", "disabled", "disabled"]);
    sim.setAdmin("hall-a", "br0", true);
    expect(states(sim, "hall-a")).toEqual(["forwarding", "forwarding", "forwarding"]);
    // No BPDUs without STP.
    run(sim, 10_000);
    expect(bpdusFrom(sim, "hall-a", "eth2")).toHaveLength(0);
  });
});

describe("Reset", () => {
  it("starts the spanning tree over from the room's start, timers moved to now", () => {
    const sim = new Simulator(halls(true));
    run(sim, 40_000);
    sim.setAdmin("hall-a", "eth2", false);
    sim.reset();
    expect(states(sim, "hall-a")).toEqual(["listening", "listening", "listening"]);
    expect(states(sim, "hall-b")).toEqual(["listening", "listening", "listening"]);
    run(sim, 45_000);
    expect(states(sim, "hall-b")).toEqual(["listening", "listening", "blocking"]);
    run(sim, 40_000 + 31_000);
    expect(states(sim, "hall-a")).toEqual(["forwarding", "forwarding", "forwarding"]);
    expect(states(sim, "hall-b")).toEqual(["forwarding", "forwarding", "blocking"]);
  });
});
