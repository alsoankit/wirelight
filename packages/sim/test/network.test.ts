/**
 * Bridges, ARP and neighbours, IPv4, ICMP and ping: behaviour checked against what Linux does
 * (kernel 7.1 on the capture machine; tools/golden and tech/simulator.md).
 */
import { describe, expect, it } from "vitest";
import { type SimEvent, Simulator } from "../src";
import { lan, routed, switchNet } from "./fixtures";

const ping = (sim: Simulator, device: string, dst: string, count = 1, extra: { ttl?: number; waitMs?: number } = {}) =>
  sim.startPing(device, 1, { dst, target: dst, count, numeric: true, ...extra });

const output = (sim: Simulator, execId = 1) =>
  sim.trace
    .filter((e): e is Extract<SimEvent, { kind: "proc.output" }> => e.kind === "proc.output" && e.execId === execId)
    .map((e) => e.text);

const exitOf = (sim: Simulator) => sim.trace.find((e) => e.kind === "proc.exit");

describe("bridges (switches)", () => {
  it("starts knowing only its own ports' addresses, as permanent local entries", () => {
    const sim = new Simulator(switchNet());
    const fdb = sim.device("hall")?.bridges.br0?.fdb ?? [];
    expect(fdb.map((e) => [e.mac, e.port, e.local])).toEqual([
      ["02:00:00:00:00:11", "eth1", true],
      ["02:00:00:00:00:12", "eth2", true],
      ["02:00:00:00:00:13", "eth3", true],
    ]);
    // The bridge takes the lowest port address.
    expect(sim.iface("hall", "br0")?.mac).toBe("02:00:00:00:00:11");
  });

  it("floods what it doesn't know, learns the sender, then forwards answers to one port", () => {
    const sim = new Simulator(switchNet());
    ping(sim, "a", "10.0.0.2");
    sim.advance(100);
    const decisions = sim.trace.filter((e) => e.kind === "fwd.decision" && e.device === "hall") as Extract<
      SimEvent,
      { kind: "fwd.decision" }
    >[];
    // a's ARP request (broadcast) floods to eth3 and eth2 (newest port first, as Linux floods);
    // b's reply and the pings are forwarded.
    expect(decisions[0]).toMatchObject({ decision: "flood", egress: ["eth3", "eth2"] });
    expect(decisions.slice(1).every((d) => d.decision === "forward")).toBe(true);
    const learned = sim
      .device("hall")
      ?.bridges.br0?.fdb.filter((e) => !e.local)
      .map((e) => [e.mac, e.port]);
    expect(learned).toEqual([
      ["02:00:00:00:00:01", "eth1"],
      ["02:00:00:00:00:02", "eth2"],
    ]);
    // c never heard anything but the broadcast.
    expect(sim.trace.some((e) => e.kind === "frame.rx" && e.device === "c" && e.summary.includes("ICMP"))).toBe(false);
    expect(exitOf(sim)).toMatchObject({ exitCode: 0 });
  });

  it("forgets a learned address after the ageing time (300 s) with nothing heard", () => {
    const sim = new Simulator(switchNet());
    ping(sim, "a", "10.0.0.2");
    // The last frames are b's unicast ARP probe and a's answer, 5 s in (b's entry for a went
    // STALE → DELAY → PROBE when it answered the ping); the switch last heard a then.
    sim.advance(10_000);
    const heard = sim.device("hall")?.bridges.br0?.fdb.find((e) => e.mac === "02:00:00:00:00:01")?.updated ?? 0;
    sim.advance(heard + 299_000);
    expect(sim.device("hall")?.bridges.br0?.fdb.some((e) => e.mac === "02:00:00:00:00:01")).toBe(true);
    sim.advance(heard + 335_000); // a 300 s kernel timer sits in the wheel's 32.8 s level: up to ~33 s late
    expect(sim.device("hall")?.bridges.br0?.fdb.some((e) => e.mac === "02:00:00:00:00:01")).toBe(false);
  });

  it("filters a frame whose destination is behind the port it came in on", () => {
    const sim = new Simulator(switchNet());
    sim.fdbAdd("hall", "02:00:00:00:00:02", "eth1", { static: true, sticky: true });
    sim.sendLabFrame("a", { to: "02:00:00:00:00:02", msg: "hi" });
    sim.advance(10);
    expect(sim.trace.some((e) => e.kind === "frame.drop" && e.device === "hall" && e.reason === "fdb-filter")).toBe(
      true,
    );
  });

  it("moves a static entry when its address shows up on another port, unless it's sticky (as Linux 7.1)", () => {
    const moved = new Simulator(switchNet());
    moved.fdbAdd("hall", "02:00:00:00:00:01", "eth2", { static: true, sticky: false });
    moved.sendLabFrame("a", { to: "ff:ff:ff:ff:ff:ff", msg: "hi" });
    moved.advance(10);
    expect(moved.device("hall")?.bridges.br0?.fdb.find((e) => e.mac === "02:00:00:00:00:01")?.port).toBe("eth1");

    const pinned = new Simulator(switchNet());
    pinned.fdbAdd("hall", "02:00:00:00:00:01", "eth2", { static: true, sticky: true });
    pinned.sendLabFrame("a", { to: "ff:ff:ff:ff:ff:ff", msg: "hi" });
    pinned.advance(10);
    expect(pinned.device("hall")?.bridges.br0?.fdb.find((e) => e.mac === "02:00:00:00:00:01")?.port).toBe("eth2");
  });

  it("floods round a loop for as long as copies keep coming (no STP)", () => {
    const topo = switchNet();
    // A second switch joined to the first by two cables: a loop.
    topo.devices.push({
      id: "annex",
      hostname: "annex",
      kind: "host",
      interfaces: [
        { name: "eth1", mac: "02:00:00:00:00:21" },
        { name: "eth2", mac: "02:00:00:00:00:22" },
      ],
      bridges: [{ name: "br0", ports: ["eth1", "eth2"] }],
    });
    const hall = topo.devices[0];
    hall?.interfaces.push({ name: "eth4", mac: "02:00:00:00:00:14" }, { name: "eth5", mac: "02:00:00:00:00:15" });
    hall?.bridges?.[0]?.ports.push("eth4", "eth5");
    topo.links.push(
      {
        id: "loop1",
        a: { device: "hall", iface: "eth4" },
        b: { device: "annex", iface: "eth1" },
        bandwidthBps: 64_000,
      },
      {
        id: "loop2",
        a: { device: "hall", iface: "eth5" },
        b: { device: "annex", iface: "eth2" },
        bandwidthBps: 64_000,
      },
    );
    const sim = new Simulator(topo);
    sim.sendLabFrame("a", { to: "ff:ff:ff:ff:ff:ff", msg: "storm" });
    sim.advance(2000);
    const copies = sim.trace.filter((e) => e.kind === "frame.tx" && e.origin === "forward").length;
    expect(copies).toBeGreaterThan(50);
  });
});

describe("ARP and the neighbour table", () => {
  it("resolves on first use: INCOMPLETE, then REACHABLE when the answer comes", () => {
    const sim = new Simulator(lan());
    ping(sim, "observatory", "10.0.0.7");
    sim.advance(0); // the first request leaves on the next tick
    expect(sim.device("observatory")?.neigh[0]).toMatchObject({ ip: "10.0.0.7", state: "INCOMPLETE" });
    sim.advance(5);
    expect(sim.device("observatory")?.neigh[0]).toMatchObject({ state: "REACHABLE", mac: "02:00:00:00:00:07" });
    // kitchen learned the asker from the request, unconfirmed (STALE); answering the ping used that
    // entry, so it's in DELAY, and in 5 s it will check with a unicast probe (as real Linux does).
    expect(sim.device("kitchen")?.neigh[0]).toMatchObject({ ip: "10.0.0.5", mac: "02:00:00:00:00:05", state: "DELAY" });
    sim.advance(6_000); // the DELAY timer fires 5.0–5.5 s later (timer wheel)
    expect(sim.device("kitchen")?.neigh[0]?.state).toBe("REACHABLE");
  });

  it("fails after three unanswered requests a second apart", () => {
    const sim = new Simulator(lan());
    ping(sim, "observatory", "10.0.0.99", 1);
    sim.advance(2_900);
    const requests = sim.trace.filter(
      (e) => e.kind === "frame.tx" && e.device === "observatory" && e.summary.includes("ARP"),
    );
    // A second apart, as the kernel's timer wheel rounds a 1 s retry (wheel.ts; measured 1.024 s).
    expect(requests.map((e) => e.t)).toEqual([0, 1024, 2048]);
    expect(sim.device("observatory")?.neigh[0]?.state).toBe("INCOMPLETE");
    sim.advance(3_100);
    expect(sim.device("observatory")?.neigh[0]?.state).toBe("FAILED");
    expect(output(sim)).toContain("From 10.0.0.5 icmp_seq=1 Destination Host Unreachable");
  });

  it("goes STALE after its reachable time, then DELAY → PROBE → REACHABLE when used again", () => {
    const sim = new Simulator(lan());
    ping(sim, "observatory", "10.0.0.7");
    sim.advance(100);
    sim.advance(46_000); // past any randomised reachable time (15–45 s)
    expect(sim.device("observatory")?.neigh[0]?.state).toBe("STALE");
    sim.startPing("observatory", 2, { dst: "10.0.0.7", target: "10.0.0.7", count: 1, numeric: true });
    sim.advance(sim.now);
    expect(sim.device("observatory")?.neigh[0]?.state).toBe("DELAY");
    sim.advance(46_000 + 6_000);
    // No answer confirmed it during DELAY (ICMP doesn't), so a unicast probe went out and was answered.
    expect(sim.device("observatory")?.neigh[0]?.state).toBe("REACHABLE");
    const unicastProbe = sim.trace.find(
      (e) =>
        e.kind === "frame.tx" &&
        e.device === "observatory" &&
        e.t > 46_000 &&
        e.summary.startsWith("02:00:00:00:00:05 > 02:00:00:00:00:07") &&
        e.summary.includes("ARP"),
    );
    expect(unicastProbe).toBeDefined();
  });

  it("forgets a door's neighbours when the door goes down", () => {
    const sim = new Simulator(lan());
    ping(sim, "observatory", "10.0.0.7");
    sim.advance(100);
    sim.setAdmin("observatory", "eth0", false);
    expect(sim.device("observatory")?.neigh).toHaveLength(0);
    // …and every route through it.
    expect(sim.device("observatory")?.routes).toHaveLength(0);
    sim.setAdmin("observatory", "eth0", true);
    expect(sim.device("observatory")?.routes.map((r) => r.dst)).toEqual(["10.0.0.0/24"]);
  });
});

describe("IPv4, ICMP and ping", () => {
  it("adds the connected route an address brings (proto kernel scope link src …)", () => {
    const sim = new Simulator(lan());
    expect(sim.device("observatory")?.routes).toEqual([
      { dst: "10.0.0.0/24", via: null, dev: "eth0", proto: "kernel", scope: "link", src: "10.0.0.5", metric: null },
    ]);
  });

  it("pings a neighbour and prints what iputils prints", () => {
    const sim = new Simulator(lan());
    ping(sim, "observatory", "10.0.0.7", 2);
    sim.advance(3000);
    // (The shell's ping command prints the "PING …" header; the simulator prints the rest.)
    const lines = ["header", ...output(sim)];
    expect(lines[1]).toMatch(/^64 bytes from 10\.0\.0\.7: icmp_seq=1 ttl=64 time=\d+\.\d{3} ms$/);
    expect(lines[2]).toMatch(/^64 bytes from 10\.0\.0\.7: icmp_seq=2 ttl=64 time=\d+\.\d{3} ms$/);
    expect(lines.slice(3, 6)).toEqual([
      "",
      "--- 10.0.0.7 ping statistics ---",
      "2 packets transmitted, 2 received, 0% packet loss, time 1024ms",
    ]);
    expect(lines[6]).toMatch(/^rtt min\/avg\/max\/mdev = [\d.]+\/[\d.]+\/[\d.]+\/[\d.]+ ms$/);
    expect(exitOf(sim)).toMatchObject({ exitCode: 0 });
  });

  it("says the network is unreachable when there's no route", () => {
    const sim = new Simulator(lan());
    expect(ping(sim, "observatory", "192.168.9.9")).toEqual({
      ok: false,
      exitCode: 2,
      error: "ping: connect: Network is unreachable",
    });
  });

  it("routes through a router that forwards, decrementing the TTL", () => {
    const sim = new Simulator(routed(true));
    ping(sim, "left", "10.0.2.20");
    sim.advance(3000);
    expect(output(sim)[0]).toMatch(/^64 bytes from 10\.0\.2\.20: icmp_seq=1 ttl=63 time=/);
    const fwd = sim.trace.find((e) => e.kind === "fwd.decision" && e.device === "bridgehead" && e.layer === "l3");
    expect(fwd).toMatchObject({
      decision: "forward",
      egress: ["eth1"],
      tableRef: { route: { dst: "10.0.2.0/24", dev: "eth1" } },
    });
  });

  it("drops quietly at a router with forwarding off", () => {
    const sim = new Simulator(routed(false));
    ping(sim, "left", "10.0.2.20", 1, { waitMs: 2000 });
    sim.advance(5000);
    expect(
      sim.trace.some((e) => e.kind === "frame.drop" && e.device === "bridgehead" && e.reason === "forwarding-disabled"),
    ).toBe(true);
    expect(sim.trace.some((e) => e.kind === "icmp.error")).toBe(false);
    expect(output(sim)).toContain("1 packets transmitted, 0 received, 100% packet loss, time 0ms");
    expect(exitOf(sim)).toMatchObject({ exitCode: 1 });
  });

  it("answers TTL 1 with 'Time to live exceeded' from the router", () => {
    const sim = new Simulator(routed(true));
    ping(sim, "left", "10.0.2.20", 1, { ttl: 1 });
    sim.advance(3000);
    expect(output(sim)).toContain("From 10.0.1.1 icmp_seq=1 Time to live exceeded");
  });

  it("answers a destination with no route with 'Destination Net Unreachable'", () => {
    const sim = new Simulator(routed(true));
    ping(sim, "left", "10.9.9.9");
    sim.advance(3000);
    expect(output(sim)).toContain("From 10.0.1.1 icmp_seq=1 Destination Net Unreachable");
  });

  it("rate-limits ICMP errors per destination: 6 time-exceeded in a burst, but only 2 net-unreachable", () => {
    // Measured on the capture machine (tools/golden/LINUX-FACTS.md): routing errors also pass
    // ip_error's limit, which shares the same per-destination bucket.
    const ttl = new Simulator(routed(true));
    ttl.startPing("left", 1, {
      dst: "10.0.2.20",
      target: "10.0.2.20",
      count: 20,
      intervalMs: 10,
      ttl: 1,
      numeric: true,
    });
    ttl.advance(150);
    expect(ttl.trace.filter((e) => e.kind === "icmp.error").length).toBe(6);
    const net = new Simulator(routed(true));
    net.startPing("left", 1, { dst: "10.9.9.9", target: "10.9.9.9", count: 20, intervalMs: 10, numeric: true });
    net.advance(150);
    expect(net.trace.filter((e) => e.kind === "icmp.error").length).toBe(2);
  });

  it("is deterministic and survives a snapshot round trip mid-ping", () => {
    const run = () => {
      const sim = new Simulator(routed(true), [], 7);
      sim.startPing("left", 1, { dst: "10.0.2.20", target: "10.0.2.20", count: 4, numeric: true });
      sim.advance(1500);
      const snap = sim.snapshot();
      sim.restore(snap);
      sim.advance(20_000);
      return JSON.stringify(output(sim)) + JSON.stringify(sim.snapshot());
    };
    expect(run()).toBe(run());
  });

  it("removes routes through a door when it goes down, and a gateway must be reachable to add one", () => {
    const sim = new Simulator(routed(true));
    expect(sim.routeAdd("left", { dst: "10.5.0.0/16", via: "10.7.7.7" })).toEqual({
      ok: false,
      error: "unreachable-gw",
    });
    expect(sim.routeAdd("left", { dst: "default", via: "10.0.1.1" })).toEqual({ ok: false, error: "exists" });
    sim.setAdmin("left", "eth0", false);
    expect(sim.device("left")?.routes).toEqual([]);
  });
});
