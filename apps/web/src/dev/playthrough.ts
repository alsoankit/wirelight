import { roomTexts } from "@wirelight/content";
import { floorDefs, nextOnPath, type RoomDef, roomById, rooms, type SolutionStep } from "@wirelight/rooms";
import { create } from "zustand";
import { useSession } from "../engine/store";
import { openMemory, useMemory } from "../play/Memory";
import { goToRoom } from "../play/RoomHud";
import { useProgress } from "../progress/progress";

// Developer tool (not part of the game): the playthrough. It plays room after room the way a player
// would, at a pace a person can watch, so the owner can sit back, see the whole game and note what
// to change. Each room: arrive and read the mission, take whatever is said or shown (lines, command
// memories, discovery cards) after a reading pause, play the room's own solution through the real
// engine, watch it restore, read the debrief, then its building memory and, after a boss, the
// floor memory with its ride-along; after the last boss, the ending. Nothing is faked:
// every action is the room's solution run as real commands.

/** Waits until network time has moved on by `ms` (the presentation clock decides how fast). */
export async function waitNetwork(ms: number, stop: () => boolean): Promise<void> {
  const start = useSession.getState().status?.now ?? 0;
  while (!stop() && (useSession.getState().status?.now ?? 0) < start + ms) await sleep(50);
}

/**
 * Runs script steps as a player would: go to the machine's room, then click or type the line.
 * `beat` waits between steps (a playthrough lets each action be seen).
 */
export async function runSteps(
  room: RoomDef,
  steps: SolutionStep[],
  log: (s: string) => void,
  stop: () => boolean,
  beat: () => Promise<void> = async () => {},
) {
  const s = useSession.getState;
  for (const step of steps) {
    if (stop()) return;
    if (s().here !== step.device) {
      // Walk there if the player could; otherwise act from where they are (the script's own rule).
      const enterable = room.access[step.device]?.state === "enterable";
      if (enterable) {
        s().goTo(step.device);
        await beat();
      }
    }
    if ("touch" in step) {
      log(`${step.device}: touch ${step.touch}`);
      await s().touch(step.device, step.touch);
    } else {
      log(`${step.device}: ${step.line}`);
      await s().exec(step.device, step.line, step.source === "click" ? "click" : "typed");
    }
    await waitNetwork(step.waitMs ?? 5000, stop);
    await beat();
  }
  log("done");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Until = "floor" | "region" | "game";
export type Note = { at: string; room: string; title: string; text: string };

/** The rooms a playthrough visits from `from`: the main path, each secret room right after its boss. */
export function playList(from: string, until: Until, secrets: boolean): string[] {
  const first = roomById(from);
  if (!first) return [];
  const out: string[] = [];
  const inScope = (r: RoomDef) =>
    until === "game" || (until === "region" ? r.region === first.region : r.floor === first.floor);
  for (let r: RoomDef | undefined = first; r && inScope(r); r = nextOnPath(rooms, r.id, "new")) {
    out.push(r.id);
    const secret = floorDefs.find((f) => f.boss === r?.id)?.secret;
    if (secrets && secret && roomById(secret)) out.push(secret);
  }
  return out;
}

type State = {
  running: boolean;
  paused: boolean;
  list: string[];
  index: number;
  doing: string;
  notes: Note[];
  /** How long to linger over text: 0.6 brisk, 1 normal, 1.6 slow. */
  pace: number;
  memories: boolean;
};

const NOTES_KEY = "wirelight.dev.playthroughNotes";

function loadNotes(): Note[] {
  try {
    return JSON.parse(localStorage.getItem(NOTES_KEY) ?? "[]") as Note[];
  } catch {
    return [];
  }
}

export const usePlaythrough = create<State>(() => ({
  running: false,
  paused: false,
  list: [],
  index: 0,
  doing: "",
  notes: loadNotes(),
  pace: 1,
  memories: true,
}));

const set = usePlaythrough.setState;
const get = usePlaythrough.getState;
let run = 0;

const stopped = (id: number) => id !== run || !get().running;

/** Sleeps `ms`, holding while paused; false once this playthrough has been stopped or replaced. */
async function wait(ms: number, id: number): Promise<boolean> {
  let left = ms;
  while (left > 0) {
    if (stopped(id)) return false;
    await sleep(100);
    if (!get().paused) left -= 100;
  }
  return !stopped(id);
}

/** Waits (holding while paused) until `ok()` or `ms` have passed; whether `ok()` came true. */
async function until(ok: () => boolean, ms: number, id: number): Promise<boolean> {
  let left = ms;
  while (left > 0 && !stopped(id)) {
    if (ok()) return true;
    await sleep(150);
    if (!get().paused) left -= 150;
  }
  return ok();
}

/** How long a person takes to read `text` at the chosen pace. */
const readMs = (text: string, min = 2500) => Math.min(14000, Math.max(min, 1600 + text.length * 45)) * get().pace;

const say = (doing: string) => set({ doing });

// ── The reader: takes whatever is said or shown once it has been read ──────────────────────────
type Overlay = { box: Element; button: HTMLElement; text: string };

function overlay(): Overlay | null {
  const pick = (box: string, button: string, text: string): Overlay | null => {
    const b = document.querySelector(box);
    const btn = b?.querySelector<HTMLElement>(button);
    return b && btn ? { box: b, button: btn, text: b.querySelector(text)?.textContent ?? b.textContent ?? "" } : null;
  };
  return (
    pick(".lines", "button", ".lines-text") ??
    pick(".cmd-memory", ".panel-actions button", ".cmd-memory > div") ??
    pick(".discovery", ".panel-actions button:not(.quiet)", "p")
  );
}

/** Reads and takes overlays until the playthrough stops (runs beside the room's own loop). */
async function reader(id: number) {
  let seen: { box: Element; text: string; since: number } | null = null;
  while (!stopped(id)) {
    await sleep(200);
    if (get().paused) {
      if (seen) seen.since += 200;
      continue;
    }
    const o = overlay();
    if (!o) {
      seen = null;
      continue;
    }
    if (!seen || seen.box !== o.box || seen.text !== o.text) seen = { box: o.box, text: o.text, since: Date.now() };
    else if (Date.now() - seen.since >= readMs(o.text)) {
      o.button.click();
      seen = null;
    }
  }
}

/** Steps through the memory being shown: each chapter read, each ride-along watched to its end. */
async function watchMemory(id: number) {
  while (useMemory.getState().show && !stopped(id)) {
    const ride = document.querySelector(".ride");
    if (ride && ride.getAttribute("data-done") !== "yes") {
      say("watching the ride-along");
      await until(() => document.querySelector(".ride")?.getAttribute("data-done") === "yes", 180000, id);
      if (!(await wait(2500, id))) return;
    }
    const caption = document.querySelector(".memory-caption .lines-text")?.textContent ?? "";
    const chapter = document.querySelector(".map.memory")?.getAttribute("data-memory");
    say("reading the memory");
    if (!(await wait(readMs(caption, 6000), id))) return;
    // Only if the same chapter is still showing (the player may have moved it on by hand).
    if (document.querySelector(".map.memory")?.getAttribute("data-memory") === chapter)
      document.querySelector<HTMLElement>(".memory-caption .panel-actions button:not(.quiet)")?.click();
    await sleep(400);
  }
}

// ── One room ────────────────────────────────────────────────────────────────────────────────────
async function playRoom(roomId: string, id: number): Promise<void> {
  const room = roomById(roomId);
  const text = room ? roomTexts[room.content] : undefined;
  if (!room || !text) return;
  const s = useSession.getState;

  say("arriving");
  goToRoom(roomId);
  await until(() => s().roomId === roomId && !!s().status && !s().status?.won, 20000, id);
  if (!(await wait(2500, id))) return;
  say("reading the mission");
  if (!(await wait(readMs(text.mission, 4000), id))) return;
  // A memory or card that opens on arrival is read first.
  await until(() => overlay() === null, 60000, id);

  say("playing");
  await runSteps(
    room,
    room.solution,
    (line) => say(`playing · ${line}`),
    () => stopped(id),
    async () => {
      await wait(1200 * get().pace, id);
      await until(() => overlay() === null, 60000, id);
    },
  );
  if (stopped(id)) return;
  say("waiting for the win");
  if (!(await until(() => !!s().status?.won, 120000, id))) {
    if (!stopped(id)) addNote("[auto] not won after its solution; moved on", roomId);
    return;
  }
  say("restoring");
  // The debrief comes once the restoration wave is over (or, after the last boss, the floor memory).
  await until(() => !!document.querySelector(".debrief") || !!useMemory.getState().show, 20000, id);
  const debrief = document.querySelector(".debrief")?.textContent ?? "";
  if (debrief) {
    say("reading the debrief");
    if (!(await wait(readMs(debrief, 6000), id))) return;
  }
  if (!get().memories) return;
  if (text.building) {
    openMemory({ kind: "building", roomId });
    await watchMemory(id);
  }
  const floor = floorDefs.find((f) => f.boss === roomId);
  if (floor) {
    // The last boss's floor memory opens by itself, then the ending plays.
    if (!useMemory.getState().show) openMemory({ kind: "floor", floor: floor.floor });
    await watchMemory(id);
    if (await until(() => !!document.querySelector(".ending-stage"), 4000, id)) {
      say("the ending");
      await until(() => !!document.querySelector(".ending-card"), 180000, id);
      if (!(await wait(8000, id))) return;
      // The closing card's "continue" leaves the ending (it opens the menu, which the next room closes).
      document.querySelector<HTMLElement>(".ending-card .panel-actions button:not(.quiet)")?.click();
      await sleep(300);
      useSession.getState().closePanel();
    }
  }
}

// ── Control ─────────────────────────────────────────────────────────────────────────────────────
export async function startPlaythrough(from: string, scope: Until, secrets: boolean, speed: number) {
  const list = playList(from, scope, secrets);
  if (list.length === 0) return;
  // A developer's start: the first visit's onboarding is skipped, the sight given (as the room jump).
  const p = useProgress.getState();
  p.giveSight();
  if (!p.path) p.choosePath("new");
  p.finishTour();
  useSession.getState().setSpeed(speed);
  await playAll(list);
}

/** Plays `list` in order until it ends or is stopped (or replaced by a skip). */
async function playAll(list: string[]) {
  const id = ++run;
  set({ running: true, paused: false, list, index: 0, doing: "" });
  useSession.getState().setPaused(false);
  void reader(id);
  for (let i = 0; i < list.length && !stopped(id); i++) {
    set({ index: i });
    await playRoom(list[i] as string, id);
    if (!stopped(id) && i + 1 < list.length) await wait(1500, id);
  }
  if (id === run) set({ running: false, doing: "finished" });
}

export function stopPlaythrough() {
  run++;
  set({ running: false, paused: false, doing: "stopped" });
  useSession.getState().setPaused(false);
}

export function pausePlaythrough(paused: boolean) {
  set({ paused });
  // The network waits too, so nothing moves on while the owner writes a note.
  useSession.getState().setPaused(paused);
}

/** Skips to the next room on the list. */
export function skipRoom() {
  const { list, index, running } = get();
  if (!running) return;
  const rest = list.slice(index + 1);
  stopPlaythrough();
  if (rest.length > 0) void playAll(rest);
}

// ── Notes (the owner's feedback while watching) ─────────────────────────────────────────────────
export function addNote(text: string, roomId = useSession.getState().roomId ?? "") {
  const room = roomById(roomId);
  const note: Note = {
    at: new Date().toISOString().slice(0, 19).replace("T", " "),
    room: roomId,
    title: room ? (roomTexts[room.content]?.title ?? roomId) : roomId,
    text: text.trim(),
  };
  if (!note.text) return;
  const notes = [...get().notes, note];
  set({ notes });
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  } catch {
    // Notes still live for this session.
  }
}

export function clearNotes() {
  set({ notes: [] });
  try {
    localStorage.removeItem(NOTES_KEY);
  } catch {
    // Nothing stored.
  }
}

/** The notes as Markdown, grouped by room in the order they were written. */
export function notesMarkdown(notes: Note[]): string {
  const out = ["# Playthrough notes", ""];
  let last = "";
  for (const n of notes) {
    if (n.room !== last) {
      out.push("", `## ${n.title} (\`${n.room}\`)`);
      last = n.room;
    }
    out.push(`- ${n.text} _(${n.at})_`);
  }
  return `${out.join("\n").trim()}\n`;
}
