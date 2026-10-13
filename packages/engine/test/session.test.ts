import { describe, expect, it } from "vitest";
import { Session } from "../src";

const LANTERN = "02:00:00:00:00:07";

describe("the game session", () => {
  it("loads a room unsolved, with its health checks failing", () => {
    const s = new Session();
    const { status } = s.loadRoom("f2.lights-out");
    expect(status.won).toBe(false);
    expect(status.health).toEqual({ "door-up": false, "wire-lit": false });
  });

  it("solves a room with real command lines, and the trace arrives in batches without repeats", () => {
    const s = new Session();
    const seen: number[] = [];
    const take = (b: { events: { t: number }[] }) => seen.push(b.events.length);
    take(s.loadRoom("f2.lights-out"));
    const up = s.exec("observatory", "ip link set eth0 up", "typed");
    expect(up.exitCode).toBe(0);
    expect(up.events.some((e) => e.kind === "cmd.exec")).toBe(true);
    take(up);
    take(s.exec("observatory", `lab send-frame --to ${LANTERN}`, "typed"));
    const later = s.advanceTo(10_000);
    take(later);
    expect(later.status.won).toBe(true);
    expect(later.status.health).toEqual({ "door-up": true, "wire-lit": true });
    expect(s.advanceTo(10_000).events).toHaveLength(0); // nothing new, nothing repeated
    expect(seen.reduce((a, b) => a + b, 0)).toBeGreaterThan(4);
  });

  it("reports a detector once it fires, and forgets it on reset", () => {
    const s = new Session();
    s.loadRoom("f2.lights-out");
    const b = s.exec("observatory", "ip link set eth0 down", "typed");
    expect(b.status.detectors).toEqual(["down-not-up"]);
    const r = s.reset();
    expect(r.events.at(-1)?.kind).toBe("world.reset");
    expect(r.status.detectors).toEqual([]);
  });

  it("advances network time only forward", () => {
    const s = new Session();
    s.loadRoom("f2.wrong-name");
    expect(s.advanceTo(20_000).status.now).toBe(20_000);
    expect(s.advanceTo(5_000).status.now).toBe(20_000);
  });

  it("puts a saved room back exactly as it was", () => {
    const s = new Session();
    s.loadRoom("f2.lights-out");
    s.exec("observatory", "ip link set eth0 up", "typed");
    s.advanceTo(3_000);
    const save = s.snapshot();
    const t = new Session();
    const { status } = t.loadRoom("f2.lights-out", save);
    expect(status.health["door-up"]).toBe(true);
    expect(status.now).toBe(3_000);
    t.exec("observatory", `lab send-frame --to ${LANTERN}`, "typed");
    expect(t.advanceTo(10_000).status.won).toBe(true);
  });

  it("is deterministic: the same commands give the same trace", () => {
    const run = () => {
      const s = new Session();
      s.loadRoom("f2.boss-silent-line");
      s.exec("observatory", "ip link set eth1 up", "typed");
      s.exec("observatory", "lab send-frame --dev eth1 --to ff:ff:ff:ff:ff:ff", "typed");
      s.advanceTo(4_000);
      s.exec("observatory", "lab card --to 02:00:00:00:00:0e", "click");
      return JSON.stringify(s.advanceTo(30_000)) + s.tools().join();
    };
    expect(run()).toBe(run());
  });

  it("refuses unknown rooms and mismatched saves", () => {
    const s = new Session();
    expect(() => s.loadRoom("nowhere")).toThrow();
    s.loadRoom("f2.lights-out");
    expect(() => new Session().loadRoom("f2.wrong-name", s.snapshot())).toThrow();
  });
});

describe("what the room shows", () => {
  it("reports doors and corridors: down and broken, then up and lit", () => {
    const s = new Session();
    const start = s.loadRoom("f2.lights-out").status;
    expect(start.doors["observatory:eth0"]).toEqual({ mac: "02:00:00:00:00:05", adminUp: false, up: false, addrs: [] });
    expect(start.cableEnds).toEqual({ "observatory:eth0": "in", "lantern:eth0": "in" });
    expect(start.corridors).toEqual({ wire: "broken" });
    s.exec("observatory", "ip link set eth0 up", "typed");
    s.exec("observatory", `lab send-frame --to ${LANTERN}`, "typed");
    const end = s.advanceTo(10_000).status;
    expect(end.doors["observatory:eth0"]?.up).toBe(true);
    expect(end.corridors).toEqual({ wire: "lit" });
  });

  it("can stop time the moment a message enters a cable, so the crossing can be shown", () => {
    const s = new Session();
    s.loadRoom("p.first-message");
    s.exec("observatory", `lab send-frame --to ${LANTERN} --msg "hello"`, "click");
    // The command put the message on the cable at once; step until lantern's answer goes on.
    const out = s.advanceTo(10_000, "cable");
    const enter = out.events.find((e) => e.kind === "link.enter");
    expect(enter).toBeDefined();
    expect(out.status.now).toBe(enter?.t); // stopped right there, not at 10 s
    expect(out.status.now).toBeLessThan(1);
    const end = s.advanceTo(10_000, "cable");
    expect(end.status.now).toBe(10_000); // nothing more goes on a cable: runs to the end
    expect(end.status.won).toBe(true);
  });
});

describe("cable ends", () => {
  it("say which end of a cable is out (1.2: the observatory's)", () => {
    const s = new Session();
    expect(s.loadRoom("f1.loose-cable").status.cableEnds).toEqual({ "observatory:eth0": "out", "lantern:eth0": "in" });
    const fixed = s.exec("observatory", "lab cable plug eth0", "click").status;
    expect(fixed.cableEnds["observatory:eth0"]).toBe("in");
  });
});

describe("catching by hand (CORE-18)", () => {
  it("keeps a copy of a message in flight, and opens it; the message goes on", () => {
    const s = new Session();
    s.loadRoom("f2.wrong-name");
    const b = s.advanceTo(10_000, "cable"); // stops as the first message enters a cable
    const enter = b.events.find((e) => e.kind === "link.enter");
    if (enter?.kind !== "link.enter") throw new Error("no message on a cable");
    const caught = s.catchFrame(enter.frameId);
    expect(caught.n).toBe(1);
    expect(caught.events.some((e) => e.kind === "slate.catch" && e.n === 1)).toBe(true);
    const opened = s.openCatch("observatory", 1, "frame");
    expect(opened.open).toMatchObject({ ok: true, reached: true });
    expect(s.catches()).toHaveLength(1);
    // The original arrived anyway.
    const later = s.advanceTo(12_000);
    expect(later.events.some((e) => e.kind === "link.exit" && e.frameId === enter.frameId)).toBe(true);
  });
});
