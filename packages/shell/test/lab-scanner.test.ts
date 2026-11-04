/**
 * The Scanner (0043) through the shell: catching (6.1), peeling layers, tracing one packet across
 * streets and comparing two catches (9.1).
 */
import type { SimEvent, Topology } from "@wirelight/sim";
import { describe, expect, it } from "vitest";
import { SimBackend } from "../src";
import { testContent } from "./content";

/**
 * observatory 10.0.1.5 — (hall, a switch) — crossing — arch — belfry 10.0.3.7: three streets, two
 * routers. Kitchen on the first street announces itself.
 */
function town(tools: string[]): SimBackend {
  const host = (id: string, mac: string, cidr: string, via: string) => ({
    id,
    hostname: id,
    kind: "host" as const,
    interfaces: [{ name: "eth0", mac }],
    addrs: [{ dev: "eth0", cidr }],
    routes: [{ dst: "default", via }],
  });
  const router = (
    id: string,
    macs: [string, string],
    cidrs: [string, string],
    routes: { dst: string; via: string }[],
  ) => ({
    id,
    hostname: id,
    kind: "host" as const,
    interfaces: [
      { name: "eth0", mac: macs[0] },
      { name: "eth1", mac: macs[1] },
    ],
    addrs: [
      { dev: "eth0", cidr: cidrs[0] },
      { dev: "eth1", cidr: cidrs[1] },
    ],
    routes,
    sysctl: { "net.ipv4.ip_forward": "1" },
  });
  const topo: Topology = {
    devices: [
      host("observatory", "02:00:00:00:00:05", "10.0.1.5/24", "10.0.1.1"),
      {
        ...host("kitchen", "02:00:00:00:00:07", "10.0.1.7/24", "10.0.1.1"),
        announcer: {
          ip: "10.0.1.7",
          dst: "10.0.1.255",
          port: 40000,
          text: "the lamps remember: amber-chapel",
          intervalMs: 6000,
        },
      },
      {
        id: "hall",
        hostname: "hall",
        kind: "host",
        interfaces: [
          { name: "eth0", mac: "02:00:00:00:00:30" },
          { name: "eth1", mac: "02:00:00:00:00:31" },
          { name: "eth2", mac: "02:00:00:00:00:32" },
        ],
        bridges: [{ name: "br0", ports: ["eth0", "eth1", "eth2"] }],
      },
      router(
        "crossing",
        ["02:00:00:00:00:21", "02:00:00:00:00:22"],
        ["10.0.1.1/24", "10.0.2.1/24"],
        [{ dst: "10.0.3.0/24", via: "10.0.2.2" }],
      ),
      router(
        "arch",
        ["02:00:00:00:00:23", "02:00:00:00:00:24"],
        ["10.0.2.2/24", "10.0.3.1/24"],
        [{ dst: "default", via: "10.0.2.1" }],
      ),
      host("belfry", "02:00:00:00:00:37", "10.0.3.7/24", "10.0.3.1"),
    ],
    links: [
      { id: "s0", a: { device: "observatory", iface: "eth0" }, b: { device: "hall", iface: "eth0" } },
      { id: "s1", a: { device: "kitchen", iface: "eth0" }, b: { device: "hall", iface: "eth1" } },
      { id: "s2", a: { device: "hall", iface: "eth2" }, b: { device: "crossing", iface: "eth0" } },
      { id: "s3", a: { device: "crossing", iface: "eth1" }, b: { device: "arch", iface: "eth0" } },
      { id: "s4", a: { device: "arch", iface: "eth1" }, b: { device: "belfry", iface: "eth0" } },
    ],
  };
  const b = new SimBackend(testContent);
  b.options = () => ({ tools: new Set(tools as never[]), subtitles: false });
  b.loadSync(topo, [], 1);
  return b;
}

function run(b: SimBackend, device: string, line: string): string[] {
  const from = b.trace().length;
  b.exec(device, line, "typed");
  return b
    .trace()
    .slice(from)
    .filter((e): e is Extract<SimEvent, { kind: "proc.output" }> => e.kind === "proc.output")
    .map((e) => e.text);
}

const events = <K extends SimEvent["kind"]>(b: SimBackend, kind: K) =>
  b.trace().filter((e): e is Extract<SimEvent, { kind: K }> => e.kind === kind);

describe("lab scanner: catching and opening (6.1)", () => {
  it("catches the next announcement and peels it down to the message", () => {
    const b = town(["lab scanner"]);
    expect(run(b, "observatory", "lab scanner catch --next --from 10.0.1.7")).toContain(
      "scanner.armed-from observatory 10.0.1.7",
    );
    b.advance(8000);
    expect(events(b, "scanner.catch")).toEqual([expect.objectContaining({ n: 1, device: "observatory", dir: "in" })]);
    const out = run(b, "observatory", "lab scanner open 1 --layer message");
    expect(out).toHaveLength(3);
    expect(out[1]).toContain("10.0.1.255");
    expect(out[2]).toContain("the lamps remember: amber-chapel");
    expect(events(b, "scanner.open").at(-1)).toMatchObject({ n: 1, layer: "message", reached: true });
  });

  it("opens only the frame by default, and says when there's no catch", () => {
    const b = town(["lab scanner"]);
    run(b, "observatory", "lab scanner catch --next");
    b.advance(8000);
    expect(run(b, "observatory", "lab scanner open 1")).toHaveLength(1);
    expect(run(b, "observatory", "lab scanner open 9")).toEqual(["scanner.no-catch 9"]);
    expect(run(b, "observatory", "lab scanner")).toHaveLength(1);
  });

  it("can't trace before the tracer is found", () => {
    const b = town(["lab scanner"]);
    b.exec("observatory", "lab scanner trace --next", "typed");
    expect(events(b, "cmd.exec").at(-1)?.exitCode).toBe(127);
  });
});

describe("lab scanner: tracing and comparing (9.1)", () => {
  it("catches the traced ping once per street, and compare shows a new frame around the same packet", () => {
    const b = town(["lab scanner", "lab scanner trace", "ping"]);
    run(b, "observatory", "lab scanner trace --next");
    b.exec("observatory", "ping -c 1 10.0.3.7", "typed");
    b.advance(3000);
    const caught = events(b, "scanner.catch");
    // Three streets: the observatory's, crossing → arch, arch → belfry. The switch's copy isn't a new street.
    expect(caught.map((c) => `${c.device} ${c.iface}`)).toEqual(["observatory eth0", "crossing eth1", "arch eth1"]);
    expect(caught.every((c) => c.traced)).toBe(true);
    run(b, "observatory", "lab scanner compare 1 3");
    expect(events(b, "scanner.compare").at(-1)).toMatchObject({
      samePacket: true,
      sameStreet: false,
      changed: ["frame.to", "frame.from", "packet.ttl", "packet.checksum"],
    });
  });

  it("two catches of different packets aren't the same packet", () => {
    const b = town(["lab scanner", "lab scanner trace", "ping"]);
    run(b, "observatory", "lab scanner catch --next --from 10.0.1.7");
    b.advance(8000);
    run(b, "observatory", "lab scanner trace --next");
    b.exec("observatory", "ping -c 1 10.0.3.7", "typed");
    b.advance(12_000);
    run(b, "observatory", "lab scanner compare 1 2");
    expect(events(b, "scanner.compare").at(-1)).toMatchObject({ samePacket: false });
  });
});
