/**
 * DHCP (dhcp.ts): what the golden files can't pin down in one capture: the 60 s give-up, renewal,
 * lifetimes, the server's backlog while it pings, determinism. Real behaviour: tools/golden/LINUX-FACTS.md, "DHCP".
 */
import { describe, expect, it } from "vitest";
import {
  type DhcpServerSpec,
  decodeDhcp,
  decodeEth,
  decodeIPv4,
  decodeUDP,
  dhcpType,
  macHash,
  type SimEvent,
  Simulator,
  type Topology,
} from "../src";

const host = (id: string, mac: string, cidr?: string) => ({
  id,
  hostname: id,
  kind: "host" as const,
  interfaces: [{ name: "eth0", mac }],
  addrs: cidr ? [{ dev: "eth0", cidr }] : [],
});

/** Observatory (no address) and the registry on one cable. */
function square(server: Partial<DhcpServerSpec> | null = {}): Topology {
  return {
    devices: [
      host("observatory", "02:00:00:00:00:05"),
      {
        ...host("registry", "02:00:00:00:00:02", "10.0.1.2/24"),
        ...(server ? { dhcpServer: { range: ["10.0.1.100", "10.0.1.150"] as [string, string], ...server } } : {}),
      },
    ],
    links: [{ id: "w", a: { device: "observatory", iface: "eth0" }, b: { device: "registry", iface: "eth0" } }],
  };
}

const output = (sim: Simulator, execId: number) =>
  sim.trace
    .filter((e): e is Extract<SimEvent, { kind: "proc.output" }> => e.kind === "proc.output" && e.execId === execId)
    .map((e) => e.text);

const exitOf = (sim: Simulator, execId: number) =>
  sim.trace.find((e): e is Extract<SimEvent, { kind: "proc.exit" }> => e.kind === "proc.exit" && e.execId === execId)
    ?.exitCode;

const dhcpSent = (sim: Simulator, device: string) =>
  sim.trace
    .filter((e): e is Extract<SimEvent, { kind: "frame.tx" }> => e.kind === "frame.tx" && e.device === device)
    .flatMap((e) => {
      const f = decodeEth(e.bytes);
      if (f.type !== 0x0800) return [];
      const ip = decodeIPv4(f.payload);
      if (ip.proto !== 17) return [];
      const m = decodeDhcp(decodeUDP(ip.payload).data);
      return m ? [{ t: e.t, type: dhcpType(m), src: ip.src, dst: ip.dst, m }] : [];
    });

describe("dhcp", () => {
  it("dnsmasq picks from the sdbm hash of the MAC (measured: 05 → .149, 0a → .103)", () => {
    expect(100 + (macHash("02:00:00:00:00:05") % 51)).toBe(149);
    expect(100 + (macHash("02:00:00:00:00:0a") % 51)).toBe(103);
  });

  it("gets a lease: address with lifetimes, default route via the server, the four steps in the trace", () => {
    const sim = new Simulator(square(), [], 3);
    const r = sim.startDhclient("observatory", 1, { doors: ["eth0"], verbose: true, release: false });
    expect(r.ok).toBe(true);
    sim.advance(10_000);
    expect(exitOf(sim, 1)).toBe(0);
    const a = sim.device("observatory")?.addrs.find((x) => x.dev === "eth0");
    expect(a).toMatchObject({ ip: "10.0.1.149", prefix: 24, broadcast: "10.0.1.255" });
    expect(a?.lft?.valid).toBe(3660);
    expect(sim.device("observatory")?.routes.find((x) => x.dst === "default")?.via).toBe("10.0.1.2");
    const steps = sim.trace.filter((e) => e.kind === "dhcp.state").map((e) => `${e.role}:${e.what}`);
    expect(steps).toEqual([
      "client:DISCOVER",
      "server:OFFER",
      "client:OFFER",
      "client:REQUEST",
      "server:ACK",
      "client:ACK",
      "client:BOUND",
    ]);
  });

  it("no server: retries with ISC's backoff, gives up after 60 s and goes to the background (exit 0)", () => {
    const sim = new Simulator(square(null), [], 5);
    sim.startDhclient("observatory", 1, { doors: ["eth0"], verbose: true, release: false });
    sim.advance(70_000);
    const lines = output(sim, 1);
    expect(lines.at(-2)).toBe("No DHCPOFFERS received.");
    expect(lines.at(-1)).toBe("No working leases in persistent database - sleeping.");
    const discovers = dhcpSent(sim, "observatory");
    expect(discovers.length).toBeGreaterThanOrEqual(4);
    expect(discovers.at(-1)?.t).toBeLessThan(61_000);
    expect(exitOf(sim, 1)).toBe(0);
    // The DISCOVERs' secs field counts the seconds since the first.
    expect(discovers[0]?.m.secs).toBe(0);
    expect(discovers[1]?.m.secs).toBeGreaterThanOrEqual(2);
  });

  it("Ctrl+C before an answer: exit 130, nothing configured", () => {
    const sim = new Simulator(square(null), [], 1);
    sim.startDhclient("observatory", 7, { doors: ["eth0"], verbose: false, release: false });
    sim.advance(1500);
    expect(sim.interrupt("observatory", 7)).toBe(true);
    expect(exitOf(sim, 7)).toBe(130);
    expect(output(sim, 7)).toEqual([]);
    sim.advance(20_000);
    expect(dhcpSent(sim, "observatory").length).toBe(1);
  });

  it("renews at T1 by unicast from its address, and the lifetime starts again", () => {
    const sim = new Simulator(square({ leaseSecs: 120 }), [], 2);
    sim.startDhclient("observatory", 1, { doors: ["eth0"], verbose: true, release: false });
    sim.advance(70_000);
    const reqs = dhcpSent(sim, "observatory").filter((x) => x.type === 3);
    expect(reqs.length).toBe(2);
    expect(reqs[1]).toMatchObject({ src: "10.0.1.149", dst: "10.0.1.2" });
    expect(reqs[1]?.m.ciaddr).toBe("10.0.1.149");
    const acks = dhcpSent(sim, "registry").filter((x) => x.type === 5);
    expect(acks[1]?.dst).toBe("10.0.1.149");
    const a = sim.device("observatory")?.addrs.find((x) => x.dev === "eth0");
    expect(a?.lft?.since).toBeGreaterThan(40_000);
  });

  it("an unrenewed address disappears when its valid lifetime ends", () => {
    const sim = new Simulator(square({ leaseSecs: 120 }), [], 2);
    sim.startDhclient("observatory", 1, { doors: ["eth0"], verbose: false, release: false });
    sim.advance(10_000);
    // The server goes quiet: no renewal is answered.
    const reg = sim.device("registry") as { dhcpServer?: unknown };
    reg.dhcpServer = null;
    sim.advance(10_000 + 181_000);
    expect(sim.device("observatory")?.addrs.some((x) => x.dev === "eth0")).toBe(false);
  });

  it("while dnsmasq waits on its 3 s ping, another client's DISCOVER waits its turn", () => {
    const sim = new Simulator(
      {
        devices: [
          {
            id: "hall",
            hostname: "hall",
            kind: "host",
            interfaces: [
              { name: "eth1", mac: "02:00:00:00:00:11" },
              { name: "eth2", mac: "02:00:00:00:00:12" },
              { name: "eth3", mac: "02:00:00:00:00:13" },
            ],
            bridges: [{ name: "br0", ports: ["eth1", "eth2", "eth3"] }],
          },
          host("observatory", "02:00:00:00:00:05"),
          host("quill", "02:00:00:00:00:0a"),
          {
            ...host("registry", "02:00:00:00:00:02", "10.0.1.2/24"),
            dhcpServer: { range: ["10.0.1.100", "10.0.1.150"] as [string, string] },
          },
        ],
        links: [
          { id: "l1", a: { device: "hall", iface: "eth1" }, b: { device: "observatory", iface: "eth0" } },
          { id: "l2", a: { device: "hall", iface: "eth2" }, b: { device: "quill", iface: "eth0" } },
          { id: "l3", a: { device: "hall", iface: "eth3" }, b: { device: "registry", iface: "eth0" } },
        ],
      },
      [],
      1,
    );
    sim.startDhclient("observatory", 1, { doors: ["eth0"], verbose: false, release: false });
    sim.advance(1000);
    sim.startDhclient("quill", 2, { doors: ["eth0"], verbose: false, release: false });
    sim.advance(20_000);
    const offers = dhcpSent(sim, "registry").filter((x) => x.type === 2);
    // The first offer after its 3 s ping; quill's DISCOVER waited, then got its own 3 s ping.
    expect(offers[0]?.dst).toBe("10.0.1.149");
    expect(offers[0]?.t).toBeGreaterThan(3000);
    const quill = offers.find((x) => x.dst === "10.0.1.103");
    expect(quill?.t).toBeGreaterThan(6000);
    expect(sim.device("quill")?.addrs.find((x) => x.dev === "eth0")?.ip).toBe("10.0.1.103");
  });

  it("release: DHCPRELEASE to the server, the address goes, the server forgets the lease", () => {
    const sim = new Simulator(square(), [], 4);
    sim.startDhclient("observatory", 1, { doors: ["eth0"], verbose: false, release: false });
    sim.advance(10_000);
    const r = sim.startDhclient("observatory", 2, { doors: ["eth0"], verbose: true, release: true });
    expect(r).toMatchObject({ ok: true, killed: true });
    sim.advance(13_000);
    expect(exitOf(sim, 2)).toBe(0);
    expect(output(sim, 2)[0]).toMatch(
      /^DHCPRELEASE of 10\.0\.1\.149 on eth0 to 10\.0\.1\.2 port 67 \(xid=0x[0-9a-f]+\)$/,
    );
    expect(sim.device("observatory")?.addrs.some((x) => x.dev === "eth0")).toBe(false);
    expect(sim.device("registry")?.dhcpServer?.leases).toEqual([]);
    expect(sim.device("observatory")?.dhclientDb?.pidFile).toBe("stale");
  });

  it("a second client while one runs: refused", () => {
    const sim = new Simulator(square(), [], 4);
    sim.startDhclient("observatory", 1, { doors: ["eth0"], verbose: false, release: false });
    sim.advance(10_000);
    expect(sim.startDhclient("observatory", 2, { doors: ["eth0"], verbose: false, release: false })).toMatchObject({
      ok: false,
      error: "running",
    });
  });

  it("is deterministic: same seed, same trace; snapshot and restore mid-exchange", () => {
    const run = () => {
      const sim = new Simulator(square(), [], 9);
      sim.startDhclient("observatory", 1, { doors: ["eth0"], verbose: true, release: false });
      sim.advance(1500);
      const snap = sim.snapshot();
      sim.advance(10_000);
      return { sim, snap, out: output(sim, 1) };
    };
    const a = run();
    const b = run();
    expect(a.out).toEqual(b.out);
    a.sim.restore(a.snap);
    const before = a.sim.trace.length;
    a.sim.advance(10_000);
    const again = a.sim.trace
      .slice(before)
      .filter((e): e is Extract<SimEvent, { kind: "proc.output" }> => e.kind === "proc.output")
      .map((e) => e.text);
    expect(again).toEqual(b.out.slice(b.out.length - again.length));
  });
});
