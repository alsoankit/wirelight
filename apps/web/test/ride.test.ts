import { floorDefs } from "@wirelight/rooms";
import { describe, expect, it } from "vitest";
import { type Beat, recordRide } from "../src/play/ride";

const legs = (floor: number) => {
  const r = recordRide(floor);
  if (!r) throw new Error(String(floor));
  return r.legs;
};
const beats = (floor: number, leg = 0): Beat[] => legs(floor)[leg]?.beats ?? [];
const all = (floor: number): Beat[] => legs(floor).flatMap((l) => l.beats);

describe("a ride-along (0036): each floor's own idea, from a real trace", () => {
  it("rides something on every floor", () => {
    for (const f of floorDefs) {
      expect(legs(f.floor).length, `floor ${f.floor}`).toBeGreaterThan(0);
      for (const l of legs(f.floor)) expect(l.beats.length, `floor ${f.floor} ${l.id}`).toBeGreaterThan(0);
    }
  });

  it("Floor 1: kitchen's message, from kitchen's door into yours", () => {
    const [b] = beats(1);
    expect(b?.headers.frame.from.device).toBe("kitchen");
    expect(b?.headers.frame.to).toMatchObject({ device: "observatory", iface: "eth0" });
    expect(b?.copies[0]?.fate).toBe("in");
  });

  it("Floor 2: three rides: taken in, everyone's taken in by two doors, someone else's let fall", () => {
    expect(legs(2).map((l) => l.id)).toEqual(["named", "everyone", "other"]);
    expect(beats(2, 0)[0]?.copies.map((c) => c.fate)).toEqual(["in"]);
    const everyone = beats(2, 1)[0];
    expect(everyone?.headers.frame.to.everyone).toBe(true);
    expect(everyone?.copies.map((c) => [c.to, c.fate]).sort()).toEqual([
      ["cellar", "in"],
      ["kitchen", "in"],
    ]);
    expect(beats(2, 2)[0]?.copies[0]).toMatchObject({ to: "kitchen", fate: "fell" });
  });

  it("Floor 3: the hall learns the from, sends a known to by one door, floods an unknown one", () => {
    const known = beats(3, 0);
    expect(known.map((b) => b.note)).toEqual(["sent", "known"]);
    const desk = known[1]?.desk;
    expect(desk?.kind === "ledger" && desk.learned).toMatchObject({ port: "eth0" });
    expect(desk?.kind === "ledger" && desk.known?.port).toBe("eth3");
    const flood = beats(3, 1)[1];
    expect(flood?.note).toBe("flood");
    expect(flood?.copies).toHaveLength(3);
    expect(flood?.copies.every((c) => c.fate === "fell")).toBe(true);
  });

  it("Floor 4: one broadcast goes round the loop, and the copies multiply", () => {
    const [leg] = legs(4);
    expect(leg?.endless).toBe(true);
    expect(leg?.beats.some((b) => b.note === "loop")).toBe(true);
    const spans = leg?.beats[1]?.copies
      .filter((c) => c.to === "hall-b")
      .map((c) => c.link)
      .sort();
    expect(spans).toEqual(["span", "span-2"]);
  });

  it("Floor 5: a ping and its echo, no address question (that's Floor 6)", () => {
    expect(all(5).some((b) => b.headers.ask)).toBe(false);
    expect(all(5)[0]?.headers.packet?.to).toBe("10.0.1.7");
    expect(all(5).some((b) => b.note === "turn")).toBe(true);
  });

  it("Floor 6: the question to the whole street, the answer, then the frame closes round the packet", () => {
    const notes = all(6).map((b) => b.note);
    expect(notes[0]).toBe("question");
    expect(notes).toContain("answer");
    expect(notes).toContain("wrap");
    expect(all(6).at(-1)?.copies[0]).toMatchObject({ to: "kitchen", fate: "in" });
  });

  it("Floor 7: DISCOVER from nobody to everyone, the OFFER back, then straight there on the same street", () => {
    const reg = beats(7, 0);
    expect(reg[0]?.headers.dhcp).toBe("DISCOVER");
    expect(reg[0]?.headers.packet?.from).toBe("0.0.0.0");
    expect(reg.find((b) => b.note === "offer")?.headers.dhcp).toBe("OFFER");
    expect(beats(7, 1)[0]?.note).toBe("street");
    expect(beats(7, 1).at(-1)?.copies[0]).toMatchObject({ to: "kitchen", fate: "in" });
  });

  it("Floor 8: over the crossing to gallery and back (floors/floor-8.md)", () => {
    const b = all(8);
    expect(b.find((x) => x.copies.some((c) => c.to === "gallery"))).toBeTruthy();
    expect(b.some((x) => x.copies.some((c) => c.to === "belfry"))).toBe(false);
    const crossing = b.find((x) => x.note === "crossing");
    expect(crossing?.headers.packet?.ttl).toBe(63);
    expect(crossing?.ttlWas).toBe(64);
  });

  it("Floor 9: at each crossing a new frame, the same addresses, the countdown one less", () => {
    const b = all(9);
    const crossings = b.filter((s) => s.note === "crossing");
    expect(crossings.length).toBeGreaterThanOrEqual(6);
    for (const c of crossings) {
      expect(c.changed.packetFrom || c.changed.packetTo).toBe(false);
      expect(c.changed.ttl).toBe(true);
      expect(c.headers.packet?.ttl).toBe((c.ttlWas ?? 0) - 1);
    }
    expect(b.filter((s) => s.note === "turn")).toHaveLength(1);
    // Four streets, out and back.
    expect(Math.max(...b.map((s) => s.street))).toBe(3);
    expect(b.at(-1)?.street).toBe(0);
  });
});
