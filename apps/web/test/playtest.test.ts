import type { CmdSource, SimEvent } from "@wirelight/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyLog,
  exportName,
  type PlaytestLog,
  type Recording,
  type RoomVisit,
  readEvents,
  readMistakes,
  recordVisits,
  roomCount,
  startVisit,
} from "../src/dev/playtest";

type Status = { roomId: string; won: boolean; detectors: string[] };
/** The part of the session store the recorder reads. */
type Session = {
  roomId: string | null;
  events: SimEvent[];
  dropped: number;
  status: Status | null;
  panel: { kind: string } | null;
};

// The real stores start the engine worker, so small stand-ins take their place. Like zustand's, setState
// merges and tells every listener at once, with the state before.
const { session, progress } = vi.hoisted(() => {
  const store = <S extends object>(initial: S) => {
    let state = initial;
    const listeners = new Set<(s: S, prev: S) => void>();
    return {
      getState: () => state,
      setState(partial: Partial<S>) {
        const prev = state;
        state = { ...state, ...partial };
        for (const l of listeners) l(state, prev);
      },
      subscribe(listener: (s: S, prev: S) => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  };
  return {
    session: store<Session>({ roomId: null, events: [], dropped: 0, status: null, panel: null }),
    progress: store<{ hints: Record<string, number> }>({ hints: {} }),
  };
});
vi.mock("../src/engine/store", () => ({ useSession: session }));
vi.mock("../src/progress/progress", () => ({ useProgress: progress }));

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

describe("recording visits from the stores", () => {
  let execId = 0;
  /** A command run in the room (`cmd.exec`), typed and fine unless said otherwise. */
  const ran = (line: string, source: CmdSource = "typed", exitCode: number | null = 0): SimEvent => ({
    kind: "cmd.exec",
    t: 0,
    device: "observatory",
    execId: ++execId,
    line,
    source,
    exitCode,
  });
  /** The engine's next events, added to the trace as the session store adds a batch. */
  const send = (events: SimEvent[]) => session.setState({ events: [...session.getState().events, ...events] });
  /**
   * A room loads as the session store loads one: first a fresh trace (the last room's status still
   * there), then the engine's first batch with the room's own status.
   */
  const load = (roomId: string) => {
    session.setState({ roomId, panel: null, events: [], dropped: 0 });
    session.setState({ status: { roomId, won: false, detectors: [] } });
  };

  const recordings: { stop(): void }[] = [];
  /** Records into `log` (a fresh one by default); every recording is stopped after its test. */
  const record = (on?: Recording, opts?: { skipOpenRoom?: boolean }, log: PlaytestLog = emptyLog(new Date())) => {
    const r = recordVisits(log, on, opts);
    recordings.push(r);
    return { log, ...r };
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at(0));
    session.setState({ roomId: null, events: [], dropped: 0, status: null, panel: null });
    progress.setState({ hints: {} });
  });
  afterEach(() => {
    for (const r of recordings.splice(0)) r.stop();
    vi.useRealTimers();
  });

  it("keeps the lines typed in the terminal, in order, and none run another way", () => {
    const { visit } = record();
    load("1.1");
    send([ran("ip link"), ran("ip link set eth0 up", "click"), ran("ip addr", "typed", 1)]);
    // The keeper's commands and a room's script are not the player's typing either.
    send([ran("ip neigh", "keeper"), ran("ip route", "script"), ran("ping 10.0.0.9", "typed", null)]);
    expect(visit()?.typed).toEqual(["ip link", "ip addr", "ping 10.0.0.9"]);
  });

  it("tells of a visit's end, closed, before the next one's start, and only of visits it started", () => {
    const told: string[] = [];
    // A visit from before this recording (as from a saved log): the first room here closes it, untold.
    const log = emptyLog(at(0));
    startVisit(log, "0.9", at(0));
    record(
      {
        started: (v) => told.push(`started ${v.roomId}`),
        ended: (v) => told.push(`ended ${v.roomId}: ${v.left ? "left" : "open"} after ${v.seconds} s`),
      },
      {},
      log,
    );
    load("1.1");
    expect(told).toEqual(["started 1.1"]);
    vi.setSystemTime(at(90));
    load("1.2");
    expect(told).toEqual(["started 1.1", "ended 1.1: left after 90 s", "started 1.2"]);
  });

  it("tells of a win once a visit, with the mistakes caught in the same update", () => {
    const wins: RoomVisit[] = [];
    const { visit } = record({ won: (v) => wins.push(structuredClone(v)) });
    load("1.1");
    vi.setSystemTime(at(40));
    session.setState({ status: { roomId: "1.1", won: true, detectors: ["x"] } });
    expect(wins).toMatchObject([{ roomId: "1.1", won: true, wonAt: at(40).toISOString(), mistakes: ["x"] }]);
    // The room stays won while its checks rerun: told once.
    session.setState({ status: { roomId: "1.1", won: true, detectors: ["x", "y"] } });
    expect(wins).toHaveLength(1);
    expect(visit()?.mistakes).toEqual(["x", "y"]);
    // The next room loads while the status is still the last room's: that win isn't this visit's.
    session.setState({ roomId: "1.2", events: [], dropped: 0 });
    expect(wins).toHaveLength(1);
    session.setState({ status: { roomId: "1.2", won: true, detectors: [] } });
    expect(wins.map((v) => v.roomId)).toEqual(["1.1", "1.2"]);
  });

  it("with skipOpenRoom, leaves out the room already open and records from the next one", () => {
    load("1.1");
    const told: string[] = [];
    const { log, visit } = record(
      {
        changed: () => told.push("changed"),
        started: (v) => told.push(`started ${v.roomId}`),
        won: (v) => told.push(`won ${v.roomId}`),
        ended: (v) => told.push(`ended ${v.roomId}`),
      },
      { skipOpenRoom: true },
    );
    send([ran("ip link")]);
    session.setState({ status: { roomId: "1.1", won: true, detectors: ["x"] }, panel: { kind: "ask" } });
    progress.setState({ hints: { "1.1": 1 } });
    expect(told).toEqual([]);
    expect(log.visits).toEqual([]);
    expect(visit()).toBeNull();
    load("1.2");
    expect(told).toEqual(["started 1.2", "changed"]);
    // Back in the room that was left out: from now on it counts like any other.
    load("1.1");
    expect(told.slice(2)).toEqual(["ended 1.2", "started 1.1", "changed"]);
    expect(log.visits.map((v) => v.roomId)).toEqual(["1.2", "1.1"]);
  });

  it("without skipOpenRoom, picks up the room already open, with what its trace holds", () => {
    load("1.1");
    send([ran("ip link")]);
    const { log } = record();
    expect(log.visits).toMatchObject([{ roomId: "1.1", commands: 1, typed: ["ip link"], left: false }]);
  });

  it("stops listening when stopped: later updates change nothing", () => {
    const told: string[] = [];
    const { log, stop } = record({
      changed: () => told.push("changed"),
      started: () => told.push("started"),
      won: () => told.push("won"),
      ended: () => told.push("ended"),
    });
    load("1.1");
    stop();
    const before = structuredClone(log);
    told.length = 0;
    send([ran("ip link")]);
    session.setState({ status: { roomId: "1.1", won: true, detectors: ["x"] }, panel: { kind: "keeper" } });
    progress.setState({ hints: { "1.1": 2 } });
    load("1.2");
    expect(log).toEqual(before);
    expect(told).toEqual([]);
  });

  it("counts the hints opened since the visit began", () => {
    progress.setState({ hints: { "1.1": 2 } }); // opened on an earlier visit
    let changes = 0;
    const { visit } = record({ changed: () => changes++ });
    load("1.1");
    expect(visit()?.hints).toBe(0);
    changes = 0;
    progress.setState({ hints: { "1.1": 3 } });
    expect(visit()?.hints).toBe(1);
    expect(changes).toBe(1);
    // Another room's hints aren't this visit's.
    progress.setState({ hints: { "1.1": 3, "1.2": 1 } });
    expect(changes).toBe(1);
    progress.setState({ hints: { "1.1": 5, "1.2": 1 } });
    expect(visit()?.hints).toBe(3);
  });
});
