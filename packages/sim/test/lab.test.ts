import { describe, expect, it } from "vitest";
import { decodeEth, decodeLab, type SimEvent, Simulator, type Topology } from "../src";

const topo = (lab = { mode: "responder" as const, answersBroadcast: true }): Topology => ({
  devices: [
    {
      id: "observatory",
      hostname: "observatory",
      kind: "host",
      interfaces: [{ name: "eth0", mac: "02:00:00:00:00:05" }],
    },
    { id: "lantern", hostname: "lantern", kind: "host", interfaces: [{ name: "eth0", mac: "02:00:00:00:00:07" }], lab },
  ],
  links: [{ id: "c1", a: { device: "observatory", iface: "eth0" }, b: { device: "lantern", iface: "eth0" } }],
});

const kinds = (tr: readonly SimEvent[]) => tr.map((e) => `${e.kind}${"device" in e ? `@${e.device}` : ""}`);
const run = (sim: Simulator) => sim.advance(sim.now + 10);

describe("lab protocol over one cable", () => {
  it("a direct message is delivered and answered", () => {
    const sim = new Simulator(topo());
    const r = sim.sendLabFrame("observatory", { to: "02:00:00:00:00:07", msg: "hello" });
    expect(r).toEqual({ ok: true, frameId: 1, length: 60 });
    run(sim);
    const delivered = sim.trace.filter((e) => e.kind === "app.deliver");
    expect(delivered.map((e) => [e.device, e.text])).toEqual([
      ["lantern", "hello"],
      ["observatory", "hello from lantern"],
    ]);
    expect(kinds(sim.trace)).toEqual([
      "frame.tx@observatory",
      "link.enter",
      "link.exit",
      "frame.rx@lantern",
      "fwd.decision@lantern",
      "app.deliver@lantern",
      "frame.tx@lantern",
      "link.enter",
      "link.exit",
      "frame.rx@observatory",
      "fwd.decision@observatory",
      "app.deliver@observatory",
    ]);
  });

  it("frames are real bytes: Ethernet II, EtherType 0x88b5, padded to 60", () => {
    const sim = new Simulator(topo());
    sim.sendLabFrame("observatory", { to: "02:00:00:00:00:07", msg: "hi" });
    const tx = sim.trace.find((e) => e.kind === "frame.tx");
    if (tx?.kind !== "frame.tx") throw new Error("no tx");
    expect(tx.bytes.length).toBe(60);
    const f = decodeEth(tx.bytes);
    expect(f).toMatchObject({ dst: "02:00:00:00:00:07", src: "02:00:00:00:00:05", type: 0x88b5 });
    expect(decodeLab(f.payload)).toBe("hi");
    expect(tx.summary).toBe("02:00:00:00:00:05 > 02:00:00:00:00:07, ethertype Unknown (0x88b5), length 60");
  });

  it("a frame for someone else reaches the door and is ignored", () => {
    const sim = new Simulator(topo());
    sim.sendLabFrame("observatory", { to: "02:00:00:00:00:17", msg: "hello" });
    run(sim);
    expect(sim.trace.at(-1)).toMatchObject({ kind: "frame.drop", device: "lantern", reason: "not-for-me" });
    expect(sim.trace.some((e) => e.kind === "app.deliver")).toBe(false);
  });

  it("a broadcast gets `I'm here` from responders that answer broadcasts", () => {
    const sim = new Simulator(topo());
    sim.sendLabFrame("observatory", { to: "ff:ff:ff:ff:ff:ff", msg: "anyone?" });
    run(sim);
    const back = sim.trace.filter((e) => e.kind === "app.deliver" && e.device === "observatory");
    expect(back).toMatchObject([{ text: "I'm here — lantern", from: "02:00:00:00:00:07" }]);
  });

  it("listeners never reply", () => {
    const sim = new Simulator(topo({ mode: "listener" } as never));
    sim.sendLabFrame("observatory", { to: "02:00:00:00:00:07", msg: "hello" });
    run(sim);
    expect(sim.trace.filter((e) => e.kind === "app.deliver").map((e) => e.device)).toEqual(["lantern"]);
  });

  it("utf-8 survives the trip", () => {
    const sim = new Simulator(topo());
    sim.sendLabFrame("observatory", { to: "02:00:00:00:00:07", msg: "héllo — 🌙" });
    run(sim);
    expect(sim.trace.find((e) => e.kind === "app.deliver")).toMatchObject({ text: "héllo — 🌙" });
  });
});

describe("links", () => {
  it("a door that is down sends nothing; the frame dies at the sender's door", () => {
    const sim = new Simulator(topo(), [{ kind: "iface-down", device: "observatory", iface: "eth0" }]);
    sim.sendLabFrame("observatory", { to: "02:00:00:00:00:07", msg: "hello" });
    expect(sim.trace).toMatchObject([{ kind: "frame.drop", device: "observatory", reason: "link-down" }]);
    expect(sim.oper("observatory", "eth0")).toEqual({ adminUp: false, carrier: false, up: false });
    expect(sim.oper("lantern", "eth0")).toEqual({ adminUp: true, carrier: false, up: false });
  });

  it("bringing the door up restores the link", () => {
    const sim = new Simulator(topo(), [{ kind: "iface-down", device: "observatory", iface: "eth0" }]);
    sim.setAdmin("observatory", "eth0", true);
    expect(sim.oper("lantern", "eth0").up).toBe(true);
    expect(sim.trace.at(-1)).toMatchObject({ kind: "table.change", table: "link", before: false, after: true });
  });

  it("an unplugged cable carries nothing", () => {
    const sim = new Simulator(topo(), [{ kind: "unplug", link: "c1" }]);
    expect(sim.oper("observatory", "eth0")).toEqual({ adminUp: true, carrier: false, up: false });
  });

  it("frames take network time to cross a cable (propagation + serialization)", () => {
    const sim = new Simulator(topo());
    sim.sendLabFrame("observatory", { to: "02:00:00:00:00:07", msg: "hello" });
    const enter = sim.trace.find((e) => e.kind === "link.enter");
    expect(enter?.kind === "link.enter" && enter.arriveAt).toBeCloseTo(0.05 + ((60 * 8) / 1e9) * 1000, 9);
    expect(sim.inFlight()).toBe(1);
    expect(sim.nextEventTime()).toBeCloseTo(0.05048, 9);
    sim.advance(0.01);
    expect(sim.inFlight()).toBe(1);
    sim.advance(1);
    expect(sim.inFlight()).toBe(0);
  });

  it("rejects branching cables", () => {
    const t = topo();
    t.links.push({ id: "c2", a: { device: "observatory", iface: "eth0" }, b: { device: "lantern", iface: "eth0" } });
    expect(() => new Simulator(t)).toThrow(/cables never branch/);
  });
});

describe("determinism and snapshots", () => {
  const script = (sim: Simulator) => {
    for (let i = 0; i < 5; i++) {
      sim.sendLabFrame("observatory", { to: "02:00:00:00:00:07", msg: `m${i}` });
      sim.advance(sim.now + 0.5);
    }
  };
  const flat = (tr: readonly SimEvent[]) =>
    JSON.stringify(tr, (_k, v) => (v instanceof Uint8Array ? Array.from(v) : v));

  it("same seed, same inputs ⇒ identical trace", () => {
    const a = new Simulator(topo(), [], 42);
    const b = new Simulator(topo(), [], 42);
    script(a);
    script(b);
    expect(flat(a.trace)).toBe(flat(b.trace));
  });

  it("different seeds change reply jitter", () => {
    const a = new Simulator(topo(), [], 1);
    const b = new Simulator(topo(), [], 2);
    script(a);
    script(b);
    expect(flat(a.trace)).not.toBe(flat(b.trace));
  });

  it("restore() resumes exactly, including frames in flight and the PRNG", () => {
    const a = new Simulator(topo(), [], 7);
    a.sendLabFrame("observatory", { to: "02:00:00:00:00:07", msg: "x" });
    a.advance(0.03);
    const snap = a.snapshot();
    const b = new Simulator(topo(), [], 99);
    b.restore(snap);
    const fromA = a.trace.length;
    a.advance(5);
    b.advance(5);
    expect(flat(a.trace.slice(fromA))).toBe(flat(b.trace));
  });

  it("reset() returns to the faulted start and says so in the trace", () => {
    const sim = new Simulator(topo(), [{ kind: "iface-down", device: "observatory", iface: "eth0" }]);
    sim.setAdmin("observatory", "eth0", true);
    sim.advance(3);
    sim.reset();
    expect(sim.iface("observatory", "eth0")?.adminUp).toBe(false);
    expect(sim.now).toBe(3);
    expect(sim.trace.at(-1)).toEqual({ kind: "world.reset", t: 3 });
    expect(sim.correct.devices.observatory?.ifaces[0]?.adminUp).toBe(true);
  });
});
