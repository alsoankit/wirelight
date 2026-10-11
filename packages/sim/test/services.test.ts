import { describe, expect, it } from "vitest";
import { checksum, decodeEth, decodeIPv4, decodeLab, decodeUDP, parseIp, Simulator, type Topology } from "../src";

const topo = (): Topology => ({
  devices: [
    {
      id: "observatory",
      hostname: "observatory",
      kind: "host",
      interfaces: [{ name: "eth0", mac: "02:00:00:00:00:05" }],
      messenger: { to: "02:00:00:00:00:07" },
    },
    {
      id: "lantern",
      hostname: "lantern",
      kind: "host",
      interfaces: [{ name: "eth0", mac: "02:00:00:00:00:07" }],
      lab: { mode: "responder", reply: "key: amber-bell" },
      announcer: { ip: "10.0.0.7", port: 40000, text: "lantern is here", intervalMs: 10_000 },
    },
  ],
  links: [{ id: "wire", a: { device: "observatory", iface: "eth0" }, b: { device: "lantern", iface: "eth0" } }],
});

const sent = (sim: Simulator, origin: string) =>
  sim.trace.filter((e) => e.kind === "frame.tx" && e.origin === origin) as Extract<
    (typeof sim.trace)[number],
    { kind: "frame.tx" }
  >[];

describe("the messenger (SIM-08)", () => {
  it("sends to its card's address every 4 s, starting early", () => {
    const sim = new Simulator(topo());
    sim.advance(10_000);
    const m = sent(sim, "messenger");
    expect(m.map((e) => e.t)).toEqual([1500, 5500, 9500]);
    expect(decodeEth(m[0]?.bytes ?? new Uint8Array())).toMatchObject({ dst: "02:00:00:00:00:07", type: 0x88b5 });
    expect(
      sim.trace
        .filter((e) => e.kind === "app.deliver" && e.device === "observatory")
        .map((e) => (e.kind === "app.deliver" ? e.text : "")),
    ).toEqual(["key: amber-bell", "key: amber-bell", "key: amber-bell"]);
  });

  it("a card fault sends it to the wrong address; fixing the card fixes it", () => {
    const sim = new Simulator(topo(), [{ kind: "card", device: "observatory", to: "02:00:00:00:00:17" }]);
    sim.advance(2000);
    expect(sim.trace.some((e) => e.kind === "frame.drop" && e.reason === "not-for-me")).toBe(true);
    expect(sim.setCard("observatory", "02:00:00:00:00:07")).toBe(true);
    expect(sim.trace.at(-1)).toMatchObject({
      kind: "table.change",
      table: "lab",
      key: "card.to",
      before: "02:00:00:00:00:17",
    });
    sim.advance(6000);
    expect(sim.trace.some((e) => e.kind === "app.deliver" && e.device === "observatory")).toBe(true);
  });

  it("sends nothing at all while its door is switched off", () => {
    const sim = new Simulator(topo(), [{ kind: "iface-down", device: "observatory", iface: "eth0" }]);
    sim.advance(20_000);
    expect(sent(sim, "messenger")).toHaveLength(0);
    expect(sim.trace.some((e) => e.kind === "frame.drop" && e.device === "observatory")).toBe(false);
  });
});

describe("announcements: a real IPv4/UDP packet inside a frame", () => {
  it("broadcasts with correct IPv4 and UDP checksums", () => {
    const sim = new Simulator(topo());
    sim.advance(7000);
    const a = sent(sim, "announcer")[0];
    if (!a) throw new Error("no announcement");
    const f = decodeEth(a.bytes);
    expect(f).toMatchObject({ dst: "ff:ff:ff:ff:ff:ff", src: "02:00:00:00:00:07", type: 0x0800 });
    const ip = decodeIPv4(f.payload);
    expect(ip).toMatchObject({
      version: 4,
      ihl: 20,
      ttl: 64,
      proto: 17,
      src: "10.0.0.7",
      dst: "255.255.255.255",
      checksumOk: true,
    });
    const udp = decodeUDP(ip.payload);
    expect(udp).toMatchObject({ srcPort: 40000, dstPort: 40000, length: 8 + 15 });
    expect(decodeLab(udp.data)).toBe("lantern is here");
    // Verifying a UDP checksum over the pseudo-header and segment gives zero.
    const pseudo = [...(parseIp("10.0.0.7") ?? []), ...(parseIp("255.255.255.255") ?? []), 0, 17, 0, udp.length];
    expect(checksum(new Uint8Array([...pseudo, ...ip.payload]))).toBe(0);
    expect(a.summary).toBe(
      "02:00:00:00:00:07 > ff:ff:ff:ff:ff:ff, ethertype IPv4 (0x0800), length 60: 10.0.0.7.40000 > 255.255.255.255.40000: UDP, length 15",
    );
  });

  it("the observatory takes the broadcast in but has no program listening", () => {
    const sim = new Simulator(topo());
    sim.advance(7000);
    expect(
      sim.trace.some((e) => e.kind === "frame.drop" && e.device === "observatory" && e.reason === "no-listener"),
    ).toBe(true);
  });
});

describe("reset keeps timers in step", () => {
  it("doesn't fire a burst of catch-up messages", () => {
    const sim = new Simulator(topo());
    sim.advance(100_000);
    sim.reset();
    const before = sent(sim, "messenger").length;
    sim.advance(100_000 + 1600);
    expect(sent(sim, "messenger").length - before).toBe(1);
  });
});
