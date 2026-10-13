/** Paths (0009): every path reaches every boss, and every tool's room, in order. */
import { describe, expect, it } from "vitest";
import { nextOnPath, onPath, type Path, rooms } from "../src";

const route = (path: Path) => {
  const out = [rooms[0]?.id ?? ""];
  for (let r = nextOnPath(rooms, out[0] as string, path); r; r = nextOnPath(rooms, r.id, path)) out.push(r.id);
  return out;
};

describe("paths", () => {
  it("New to networking plays every room but the secret ones (found, never on a path)", () => {
    expect(route("new")).toEqual(rooms.filter((r) => r.kind !== "secret").map((r) => r.id));
  });

  for (const path of ["little", "networking"] as const)
    it(`${path}: keeps every boss and every room that brings a tool, and the Prologue`, () => {
      const r = route(path);
      for (const room of rooms)
        if (room.kind === "boss" || room.pathTag === "tool" || room.kind === "prologue") expect(r).toContain(room.id);
      expect(r.length).toBeLessThan(rooms.length);
    });

  it("Know networking skips building blocks and core rooms", () => {
    expect(
      rooms.filter((r) => onPath(r, "networking")).every((r) => r.pathTag !== "core" && r.pathTag !== "building-block"),
    ).toBe(true);
  });
});
