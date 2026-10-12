import { describe, expect, it } from "vitest";
import { Session } from "../src";

const LANTERN = "02:00:00:00:00:07";

describe("the game session", () => {
  it("loads a room unsolved, with its health checks failing", () => {
    const s = new Session();
    const { status } = s.loadRoom("f0.r3-lights-out");
    expect(status.won).toBe(false);
    expect(status.health).toEqual({ "door-up": false, "wire-lit": false });
  });

  it("solves a room with real command lines, and the trace arrives in batches without repeats", () => {
    const s = new Session();
    const seen: number[] = [];
    const take = (b: { events: { t: number }[] }) => seen.push(b.events.length);
    take(s.loadRoom("f0.r3-lights-out"));
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
    s.loadRoom("f0.r3-lights-out");
    s.exec("observatory", `lab send-frame --to ${LANTERN}`, "typed");
    const b = s.exec("observatory", `lab send-frame --to ${LANTERN}`, "typed");
    expect(b.status.detectors).toEqual(["sending-into-a-dark-door"]);
    const r = s.reset();
    expect(r.events.at(-1)?.kind).toBe("world.reset");
    expect(r.status.detectors).toEqual([]);
  });

  it("advances network time only forward", () => {
    const s = new Session();
    s.loadRoom("f0.r2-wrong-name");
    expect(s.advanceTo(20_000).status.now).toBe(20_000);
    expect(s.advanceTo(5_000).status.now).toBe(20_000);
  });

  it("puts a saved room back exactly as it was", () => {
    const s = new Session();
    s.loadRoom("f0.r3-lights-out");
    s.exec("observatory", "ip link set eth0 up", "typed");
    s.advanceTo(3_000);
    const save = s.snapshot();
    const t = new Session();
    const { status } = t.loadRoom("f0.r3-lights-out", save);
    expect(status.health["door-up"]).toBe(true);
    expect(status.now).toBe(3_000);
    t.exec("observatory", `lab send-frame --to ${LANTERN}`, "typed");
    expect(t.advanceTo(10_000).status.won).toBe(true);
  });

  it("is deterministic: the same commands give the same trace", () => {
    const run = () => {
      const s = new Session();
      s.loadRoom("f0.boss-silent-line");
      s.exec("observatory", "ip link set eth0 up", "typed");
      s.exec("observatory", "lab send-frame --to ff:ff:ff:ff:ff:ff", "typed");
      s.advanceTo(4_000);
      s.exec("observatory", `lab card set --to ${LANTERN}`, "click");
      return JSON.stringify(s.advanceTo(30_000)) + s.tools().join();
    };
    expect(run()).toBe(run());
  });

  it("refuses unknown rooms and mismatched saves", () => {
    const s = new Session();
    expect(() => s.loadRoom("nowhere")).toThrow();
    s.loadRoom("f0.r3-lights-out");
    expect(() => new Session().loadRoom("f0.r2-wrong-name", s.snapshot())).toThrow();
  });
});
