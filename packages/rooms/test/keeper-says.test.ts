/** The keeper's "why" (CORE-25): plain answers built from real decisions in real rooms. */
import { type DropReason, keeperSays } from "@wirelight/content";
import type { SimEvent } from "@wirelight/sim";
import { describe, expect, it } from "vitest";
import { loadRoom, play, roomById, rooms, type SolutionStep } from "../src";

type Decision = Extract<SimEvent, { kind: "fwd.decision" }>;

function answers(roomId: string, device: string, steps?: SolutionStep[]): string[] {
  const room = roomById(roomId);
  if (!room) throw new Error(roomId);
  const f = play(room, loadRoom(room, rooms), steps ?? room.solution);
  const out: string[] = [];
  f.trace.forEach((e, i) => {
    if (e.kind !== "fwd.decision" || e.device !== device) return;
    const next = f.trace.slice(i + 1, i + 3).find((x) => x.kind === "frame.drop" && x.frameId === e.frameId);
    out.push(keeperSays(e as Decision, next?.kind === "frame.drop" ? (next.reason as DropReason) : undefined));
  });
  return out;
}

describe("the keeper's why", () => {
  it("a computer took in what was for it, and ignored the rest", () => {
    const said = answers("f2.wrong-name", "lantern");
    expect(said.some((t) => /That's not me, so I ignored it/.test(t))).toBe(true);
    expect(said.some((t) => /That's me, so I took it in|everyone/.test(t))).toBe(true);
  });

  it("a switch floods what it doesn't know, and forwards by its board", () => {
    const said = answers("f3.keepers-memory", "hall");
    expect(said.some((t) => /every other door/.test(t))).toBe(true);
    expect(
      said.some((t) => /My board says 02:00:00:00:00:[0-9a-f]{2} is behind eth\d, so I sent it there/.test(t)),
    ).toBe(true);
  });

  it("a router forwards by its routing board, and says why it let something go", () => {
    const said = answers("f8.across-the-street", "crossing");
    expect(said.some((t) => /My board says 10\.0\.2\.0\/24 is the street behind door eth1/.test(t))).toBe(true);
    // Before the loop is mended, a ping goes round and round until its countdown runs out.
    const steps = [{ device: "observatory", line: "ping -c 1 10.0.4.7", waitMs: 20_000 }];
    // It dies at whichever of the two routers it reaches with nothing left.
    const loop = [...answers("f9.round-and-round", "crossing", steps), ...answers("f9.round-and-round", "arch", steps)];
    expect(loop.some((t) => /countdown ran out/.test(t))).toBe(true);
  });

  it("a switch says why a frame stopped at a door its spanning tree holds shut", () => {
    // The kernel's egress check (br_forward: should_deliver) on a blocking port, as bridge.ts traces it.
    const d: Decision = {
      kind: "fwd.decision",
      t: 0,
      device: "hall-a",
      frameId: 1,
      layer: "l2",
      decision: "forward",
      egress: ["eth4"],
      tableRef: {
        dst: "02:00:00:00:00:13",
        fdb: { mac: "02:00:00:00:00:13", port: "eth4", static: false, local: false },
      },
    };
    expect(keeperSays(d, "port-blocked")).toBe(
      "That frame was for 02:00:00:00:00:13. My board says 02:00:00:00:00:13 is behind eth4, but that door is held shut to keep the halls from going round in circles, so it went no further.",
    );
  });
});
