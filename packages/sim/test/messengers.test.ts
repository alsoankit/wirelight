/** Messengers (SIM-08): several cards on one desk (3.3), and a card holding a house address (5.1). */
import { describe, expect, it } from "vitest";
import { decodeEth, Simulator, type Topology } from "../src";

/** observatory (10.0.1.5) — kitchen (10.0.1.7) and library, through a switch; three cards on the desk. */
function street(): Topology {
  const host = (id: string, mac: string, ip: string) => ({
    id,
    hostname: id,
    kind: "host" as const,
    interfaces: [{ name: "eth0", mac }],
    addrs: [{ dev: "eth0", cidr: `${ip}/24` }],
    lab: { mode: "responder" as const, reply: `hello from ${id}` },
  });
  return {
    devices: [
      {
        ...host("observatory", "02:00:00:00:00:05", "10.0.1.5"),
        messengers: [{ to: "" }, { to: "02:00:00:00:00:0c" }, { to: "10.0.1.7" }],
      },
      {
        id: "square",
        hostname: "square",
        kind: "host",
        interfaces: [
          { name: "eth0", mac: "02:00:00:00:00:30" },
          { name: "eth1", mac: "02:00:00:00:00:31" },
          { name: "eth2", mac: "02:00:00:00:00:32" },
        ],
        bridges: [{ name: "br0", ports: ["eth0", "eth1", "eth2"] }],
      },
      host("kitchen", "02:00:00:00:00:17", "10.0.1.7"),
      host("library", "02:00:00:00:00:0c", "10.0.1.12"),
    ],
    links: [
      { id: "s0", a: { device: "observatory", iface: "eth0" }, b: { device: "square", iface: "eth0" } },
      { id: "s1", a: { device: "square", iface: "eth1" }, b: { device: "kitchen", iface: "eth0" } },
      { id: "s2", a: { device: "square", iface: "eth2" }, b: { device: "library", iface: "eth0" } },
    ],
  };
}

describe("messengers", () => {
  it("each card sends on its own: blank sends nothing, a door name a lab frame, a house address a ping", () => {
    const sim = new Simulator(street());
    sim.advance(3000);
    const sent = sim.trace.filter(
      (e) => e.kind === "frame.tx" && e.device === "observatory" && e.origin === "messenger",
    );
    const types = sent.map((e) => (e.kind === "frame.tx" ? decodeEth(e.bytes).type : 0));
    // Card 2: a lab frame to library. Card 3: the ping itself, after the kernel's ARP request ("who has 10.0.1.7?").
    expect(types).toEqual(expect.arrayContaining([0x88b5, 0x0800]));
    const arp = sim.trace.find(
      (e) => e.kind === "frame.tx" && e.device === "observatory" && decodeEth(e.bytes).type === 0x0806,
    );
    expect(arp?.kind === "frame.tx" && arp.origin).toBe("kernel");
    expect(
      sim.trace.some((e) => e.kind === "app.deliver" && e.device === "observatory" && e.text === "hello from library"),
    ).toBe(true);
    const heard = sim.trace.filter((e) => e.kind === "echo.heard");
    expect(heard).toEqual([expect.objectContaining({ device: "observatory", messenger: 3, from: "10.0.1.7", seq: 1 })]);
  });

  it("a card can be changed one at a time, to a door name or a house address", () => {
    const sim = new Simulator(street());
    expect(sim.setCard("observatory", "10.0.1.12", 1)).toBe(true);
    expect(sim.setCard("observatory", "kitchen", 1)).toBe(false);
    expect(sim.setCard("observatory", "10.0.1.12", 4)).toBe(false);
    sim.advance(3000);
    expect(sim.trace.some((e) => e.kind === "echo.heard" && e.messenger === 1 && e.from === "10.0.1.12")).toBe(true);
  });

  it("a house address nobody lives at gets no answer, and nothing breaks", () => {
    const sim = new Simulator(street(), [{ kind: "card", device: "observatory", to: "10.0.1.70", messenger: 3 }]);
    sim.advance(10_000);
    expect(sim.trace.some((e) => e.kind === "echo.heard" && e.messenger === 3)).toBe(false);
  });
});
