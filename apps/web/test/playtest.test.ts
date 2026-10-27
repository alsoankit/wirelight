import type { SimEvent } from "@wirelight/sim";
import { describe, expect, it, vi } from "vitest";
import { emptyLog, exportName, readEvents, readMistakes, roomCount, startVisit } from "../src/dev/playtest";

// Only the log's pure parts are tested; the stores start the engine worker, so they stay out.
vi.mock("../src/engine/store", () => ({ useSession: {} }));
vi.mock("../src/progress/progress", () => ({ useProgress: {} }));

const at = (s: number) => new Date(Date.UTC(2026, 9, 27, 10, 0, s));

describe("playtest log", () => {
  it("records failed commands, including a streaming one that fails at its end", () => {
    const log = emptyLog(at(0));
    const v = startVisit(log, "1.1", at(0));
    const running = new Map<number, { device: string; line: string }>();
    const events = [
      { kind: "cmd.exec", t: 0, device: "a", execId: 1, line: "ip link", source: "typed", exitCode: 0 },
      { kind: "cmd.exec", t: 0, device: "a", execId: 2, line: "ip lnk", source: "typed", exitCode: 1 },
      { kind: "cmd.exec", t: 0, device: "a", execId: 3, line: "ping 10.0.0.9", source: "typed", exitCode: null },
      { kind: "proc.exit", t: 5, device: "a", execId: 3, exitCode: 1 },
    ] as unknown as SimEvent[];
    readEvents(v, events, running, at(30));
    expect(v.commands).toBe(3);
    expect(v.failed.map((f) => [f.line, f.exitCode])).toEqual([
      ["ip lnk", 1],
      ["ping 10.0.0.9", 1],
    ]);
    expect(v.seconds).toBe(30);
    expect(running.size).toBe(0);
  });

  it("keeps every mistake once and closes a visit when the next room starts", () => {
    const log = emptyLog(at(0));
    const v = startVisit(log, "1.1", at(0));
    readMistakes(v, ["wrong-door"]);
    readMistakes(v, ["wrong-door", "no-address"]);
    expect(v.mistakes).toEqual(["wrong-door", "no-address"]);
    startVisit(log, "1.2", at(90));
    startVisit(log, "1.1", at(120));
    expect(log.visits[0]).toMatchObject({ left: true, seconds: 90 });
    expect(log.visits.at(-1)?.left).toBe(false);
    expect(roomCount(log)).toBe(2);
  });

  it("names the export file by date", () => {
    expect(exportName(new Date(2026, 0, 5))).toBe("wirelight-playtest-2026-01-05.json");
  });
});
