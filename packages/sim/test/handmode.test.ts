/**
 * Hand mode (0042): each keeper's job done by hand, as the room specs play it (floors/floor-3.md 3.1,
 * floor-6.md 6.1, floor-8.md 8.5), and the promise of SIM-06: a hand step is the same function the
 * automatic path runs, so doing a switch's job by hand puts the same frames on the same wires.
 */
import { describe, expect, it } from "vitest";
import { type Fault, keyOf, type SimEvent, Simulator, type Topology } from "./handmode-helpers";

/** 3.1: observatory — hall (a switch: eth0..eth3) — kitchen, library, forge. The messenger writes to forge. */
function hall(): Topology {
  const host = (id: string, mac: string, lab?: boolean) => ({
    id,
    hostname: id,
    kind: "host" as const,
    interfaces: [{ name: "eth0", mac }],
    ...(lab ? { lab: { mode: "responder" as const, reply: "key: brass-owl" } } : {}),
  });
  return {
    devices: [
      { ...host("observatory", "02:00:00:00:00:05"), messenger: { to: "02:00:00:00:00:0a", intervalMs: 6000 } },
      {
        id: "hall",
        hostname: "hall",
        kind: "host",
        interfaces: [
          { name: "eth0", mac: "02:00:00:00:00:30" },
          { name: "eth1", mac: "02:00:00:00:00:31" },
          { name: "eth2", mac: "02:00:00:00:00:32" },
          { name: "eth3", mac: "02:00:00:00:00:33" },
        ],
        bridges: [{ name: "br0", ports: ["eth0", "eth1", "eth2", "eth3"] }],
      },
      host("kitchen", "02:00:00:00:00:07"),
      host("library", "02:00:00:00:00:0c"),
      host("forge", "02:00:00:00:00:0a", true),
    ],
    links: [
      { id: "wire", a: { device: "observatory", iface: "eth0" }, b: { device: "hall", iface: "eth0" } },
      { id: "l1", a: { device: "hall", iface: "eth1" }, b: { device: "kitchen", iface: "eth0" } },
      { id: "l2", a: { device: "hall", iface: "eth2" }, b: { device: "library", iface: "eth0" } },
      { id: "l3", a: { device: "hall", iface: "eth3" }, b: { device: "forge", iface: "eth0" } },
    ],
  };
}

const ASLEEP: Fault[] = [{ kind: "keeper-asleep", device: "hall", desk: "switch" }];

/** What crossed each of the hall's doors, in order. */
function wires(sim: Simulator): string {
  return sim.trace
    .filter((e): e is Extract<SimEvent, { kind: "frame.tx" }> => e.kind === "frame.tx" && e.device === "hall")
    .map((e) => `${e.iface} ${keyOf(e.bytes)}`)
    .join("\n");
}

describe("3.1 · the switch, by hand", () => {
  it("frames wait at the desk while the keeper has forgotten", () => {
    const sim = new Simulator(hall(), ASLEEP);
    sim.advance(2000); // the messenger's first frame (at 1.5 s)
    expect(sim.device("hall")?.keeper.desk).toHaveLength(1);
    expect(sim.trace.some((e) => e.kind === "keeper.hold")).toBe(true);
    expect(sim.trace.some((e) => e.kind === "frame.tx" && e.device === "hall")).toBe(false);
  });

  it("holds one copy of the same frame: the messenger calling again doesn't pile up the desk", () => {
    const sim = new Simulator(hall(), ASLEEP);
    sim.advance(14_000); // the messenger's frames at 1.5 s, 7.5 s and 13.5 s
    expect(sim.device("hall")?.keeper.desk).toHaveLength(1);
  });

  it("plays the room's solution: learn, flood, learn, send back, send on; then the keeper takes over", () => {
    const sim = new Simulator(hall(), ASLEEP);
    sim.advance(2000);
    // Frame 1: from the observatory (in at eth0), to forge, unknown → every other door.
    expect(sim.keeperLearn("hall", "02:00:00:00:00:05", "eth0")).toEqual({ ok: true });
    expect(sim.keeperSend("hall", "flood")).toEqual({ ok: true });
    sim.advance(2100);
    // Forge's answer waits at the desk (in at eth3), to the observatory, known → eth0.
    expect(sim.device("hall")?.keeper.desk).toHaveLength(1);
    sim.keeperLearn("hall", "02:00:00:00:00:0a", "eth3");
    sim.keeperSend("hall", "eth0");
    sim.advance(2200);
    expect(
      sim.trace.some((e) => e.kind === "app.deliver" && e.device === "observatory" && e.text === "key: brass-owl"),
    ).toBe(true);
    // The messenger's next frame (at 7.5 s): to forge, now known → eth3.
    sim.advance(7600);
    sim.keeperSend("hall", "eth3");
    sim.advance(7650);
    // Kitchen and library saw only the one flooded copy.
    const at = (d: string) => sim.trace.filter((e) => e.kind === "frame.rx" && e.device === d).length;
    expect([at("kitchen"), at("library"), at("forge")]).toEqual([1, 1, 2]);
    // The keeper remembers and sorts every frame from then on.
    expect(sim.wakeKeeper("hall")).toBe(true);
    sim.advance(14_000);
    expect(sim.device("hall")?.keeper.desk).toHaveLength(0);
    expect(at("forge")).toBe(3);
  });

  it("is the same job: by hand, the same frames cross the same doors as with the keeper awake (SIM-06)", () => {
    const hand = new Simulator(hall(), ASLEEP);
    hand.advance(2000);
    hand.keeperLearn("hall", "02:00:00:00:00:05", "eth0");
    hand.keeperSend("hall", "flood");
    hand.advance(2100);
    hand.keeperLearn("hall", "02:00:00:00:00:0a", "eth3");
    hand.keeperSend("hall", "eth0");
    hand.advance(7600);
    hand.keeperSend("hall", "eth3");
    hand.advance(7650);
    hand.keeperSend("hall", "eth0"); // forge's second answer
    hand.advance(7700);

    const auto = new Simulator(hall());
    auto.advance(7700);
    expect(wires(hand)).toBe(wires(auto));
  });

  it("mistakes are real: a frame sent back out of the door it came in by really goes there", () => {
    const sim = new Simulator(hall(), ASLEEP);
    sim.advance(2000);
    sim.keeperSend("hall", "eth0");
    expect(wires(sim)).toMatch(/^eth0 02:00:00:00:00:05 > 02:00:00:00:00:0a lab$/);
  });

  it("refuses what makes no sense, and does nothing while awake", () => {
    const sim = new Simulator(hall(), ASLEEP);
    expect(sim.keeperSend("hall", "eth1")).toEqual({ ok: false, error: "empty" });
    expect(sim.keeperLearn("hall", "02:00:00:00", "eth0")).toEqual({ ok: false, error: "bad-mac" });
    expect(sim.keeperLearn("hall", "02:00:00:00:00:05", "eth9")).toEqual({ ok: false, error: "no-door" });
    expect(new Simulator(hall()).keeperSend("hall", "flood")).toEqual({ ok: false, error: "not-asleep" });
  });
});

/** 6.1 / 8.5: observatory 10.0.1.5 — kitchen 10.0.1.7 on one street; a router to another. */
function street(): Topology {
  return {
    devices: [
      {
        id: "observatory",
        hostname: "observatory",
        kind: "host",
        interfaces: [{ name: "eth0", mac: "02:00:00:00:00:15" }],
        addrs: [{ dev: "eth0", cidr: "10.0.1.5/24" }],
        routes: [{ dst: "default", via: "10.0.1.1" }],
      },
      {
        id: "crossing",
        hostname: "crossing",
        kind: "host",
        interfaces: [
          { name: "eth0", mac: "02:00:00:00:00:21" },
          { name: "eth1", mac: "02:00:00:00:00:22" },
        ],
        addrs: [
          { dev: "eth0", cidr: "10.0.1.1/24" },
          { dev: "eth1", cidr: "10.0.2.1/24" },
        ],
      },
      {
        id: "gallery",
        hostname: "gallery",
        kind: "host",
        interfaces: [{ name: "eth0", mac: "02:00:00:00:00:27" }],
        addrs: [{ dev: "eth0", cidr: "10.0.2.7/24" }],
        routes: [{ dst: "default", via: "10.0.2.1" }],
      },
    ],
    links: [
      { id: "s1", a: { device: "observatory", iface: "eth0" }, b: { device: "crossing", iface: "eth0" } },
      { id: "s2", a: { device: "crossing", iface: "eth1" }, b: { device: "gallery", iface: "eth0" } },
    ],
  };
}

const replies = (sim: Simulator) =>
  sim.trace
    .filter((e) => e.kind === "proc.output" && /bytes from/.test(e.text))
    .map((e) => (e.kind === "proc.output" ? e.text : ""));

describe("6.1 · wrapping by hand (the house's keeper)", () => {
  it("asks, writes the answer down, wraps and sends; then the keeper takes over", () => {
    const sim = new Simulator(street(), [{ kind: "keeper-asleep", device: "observatory", desk: "host" }]);
    sim.startPing("observatory", 1, { dst: "10.0.1.1", target: "10.0.1.1", count: 3, numeric: true });
    sim.advance(10);
    expect(sim.device("observatory")?.keeper.desk).toHaveLength(1);
    expect(sim.keeperWrap("observatory", "10.0.1.1")).toEqual({ ok: false, error: "bad-mac" });
    sim.keeperAsk("observatory", "10.0.1.1");
    sim.advance(20);
    expect(sim.device("observatory")?.neigh[0]).toMatchObject({
      ip: "10.0.1.1",
      state: "REACHABLE",
      mac: "02:00:00:00:00:21",
    });
    sim.keeperWrap("observatory", "02:00:00:00:00:21");
    sim.advance(1100);
    sim.keeperWrap("observatory", "02:00:00:00:00:21");
    sim.advance(1200);
    expect(replies(sim)).toHaveLength(2);
    sim.wakeKeeper("observatory");
    sim.advance(5000);
    expect(replies(sim)).toHaveLength(3);
  });
});

describe("8.5 · forwarding by hand (the router's navigator)", () => {
  it("packets wait on the lectern; ask, forward (one off the TTL), forward the reply; then sysctl wakes it", () => {
    const sim = new Simulator(street(), [{ kind: "keeper-asleep", device: "crossing", desk: "router" }]);
    sim.startPing("observatory", 1, { dst: "10.0.2.7", target: "10.0.2.7", count: 3, numeric: true });
    sim.advance(20);
    expect(sim.device("crossing")?.keeper.desk).toHaveLength(1);
    sim.keeperAsk("crossing", "10.0.2.7");
    sim.advance(30);
    expect(sim.keeperForward("crossing", "02:00:00:00:00:27")).toEqual({ ok: true });
    sim.advance(40);
    // Gallery's reply waits too; the ledger already knows the observatory (from its ARP request).
    expect(sim.device("crossing")?.keeper.desk).toHaveLength(1);
    sim.keeperForward("crossing", "02:00:00:00:00:15");
    sim.advance(60);
    expect(replies(sim)).toEqual([expect.stringMatching(/^64 bytes from 10\.0\.2\.7: icmp_seq=1 ttl=63 /)]);
    // Allowed to pass packets on: the navigator wakes and does it itself.
    expect(sim.setSysctl("crossing", "net.ipv4.ip_forward", "1")).toBe("ok");
    expect(sim.device("crossing")?.keeper.asleep).toBe(null);
    sim.advance(4000);
    expect(replies(sim)).toHaveLength(3);
  });

  it("refuses to send a packet on to its own door name (the frame it came in); wraps without the countdown when asked", () => {
    const sim = new Simulator(street(), [{ kind: "keeper-asleep", device: "crossing", desk: "router" }]);
    sim.startPing("observatory", 1, { dst: "10.0.2.7", target: "10.0.2.7", count: 1, numeric: true });
    sim.advance(20);
    const own = sim.device("crossing")?.ifaces[0]?.mac as string;
    expect(sim.keeperForward("crossing", own)).toEqual({ ok: false, error: "own-door" });
    expect(sim.device("crossing")?.keeper.desk).toHaveLength(1);
    sim.keeperAsk("crossing", "10.0.2.7");
    sim.advance(30);
    // Skipping the countdown (8.5's skip-ttl) is allowed: the packet goes on with its TTL unchanged.
    expect(sim.keeperWrap("crossing", "02:00:00:00:00:27")).toEqual({ ok: true });
    expect(sim.device("crossing")?.keeper.desk).toHaveLength(0);
  });

  it("a packet with no time left dies at the lectern with 'time exceeded'", () => {
    const sim = new Simulator(street(), [{ kind: "keeper-asleep", device: "crossing", desk: "router" }]);
    sim.startPing("observatory", 1, { dst: "10.0.2.7", target: "10.0.2.7", count: 1, ttl: 1, numeric: true });
    sim.advance(20);
    sim.keeperForward("crossing", "02:00:00:00:00:27");
    sim.advance(100);
    expect(sim.trace.some((e) => e.kind === "icmp.error" && e.type === "time-exceeded")).toBe(true);
  });
});

describe("lab cable", () => {
  it("pulls a cable out and plugs it back: the corridor goes dark, then works", () => {
    const sim = new Simulator(street());
    expect(sim.plugCable("observatory", "eth0", false)).toBe("ok");
    expect(sim.oper("observatory", "eth0").carrier).toBe(false);
    expect(sim.plugCable("observatory", "eth0", true)).toBe("ok");
    expect(sim.oper("observatory", "eth0").carrier).toBe(true);
    expect(sim.plugCable("observatory", "eth9", true)).toBe("no-door");
  });
});
