import {
  fill,
  firstReleaseEnding,
  floorTexts,
  region2Arrival,
  region3Arrival,
  region4Arrival,
  roomTexts,
  voice,
} from "@wirelight/content";
import { floorDefs, type RoomDef, roomById } from "@wirelight/rooms";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "../engine/store";
import { useReducedMotion } from "../progress/motion";
import { useProgress } from "../progress/progress";
import { useDialogFocus } from "./focus";
import { useElapsed, useNewPath } from "./hints";
import { type Line, Lines } from "./Lines";
import { journalShows, matchingRoom, memoriesDue, readEvents, readView, ruleFor, useMoments } from "./momentRules";
import { goToRoom } from "./RoomHud";

// The game-feel moments around a room (CORE-36, CORE-45, HELP-12, 0008, END1): the key flying to the
// keyring, region arrivals and boss introductions, Knight's Memories when their moment comes (with
// the one small thing to do after), a journal page glowing where it lies, the Knight's gentle way
// back in a boss, and the first release's ending. The rules are in moments.ts.

/** One empty list, so selectors return the same value when there's nothing (no render loop). */
const NONE: never[] = [];

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The interface's own words for a doorway and a cable end (their labels start with these). */
const DOORWAY = voice.doorway.go.split("{")[0] ?? "";
const CABLE_END = voice.cableEnd.plug.split("{")[0] ?? "";

/**
 * Reads what happens in the room into the moments store: new trace events, what the interface
 * shows (panels, where the player stands, the speed), pointing at a doorway or a cable end, and
 * hovering a moving message. Mounted once; renders nothing.
 */
export function MomentsDriver() {
  useEffect(() => {
    let last = 0;
    let everyone = new Set<number>();
    let started = -1;
    const read = () => {
      const s = useSession.getState();
      const room = s.roomId ? roomById(s.roomId) : undefined;
      if (!room) return;
      if (s.startedAt !== started) {
        started = s.startedAt;
        last = 0;
        everyone = new Set();
        useMoments.getState().enter(room.id, useProgress.getState().keys);
      }
      const had = new Set(useMoments.getState().happened);
      const out = new Set<string>();
      const from = Math.max(0, last - s.dropped);
      readEvents(s.events.slice(from), room.playerDevice, out, everyone);
      last = s.dropped + s.events.length;
      readView(
        {
          panel: s.panel,
          here: s.here,
          speed: s.speed,
          voiceGiven: s.voiceGiven,
          detectors: s.status?.detectors ?? [],
        },
        room,
        had,
        out,
      );
      if (document.querySelector(".message-summary")) out.add("hover-message");
      const fresh = [...out].filter((w) => !had.has(w));
      if (fresh.length) useMoments.getState().note(...fresh);
    };
    const id = setInterval(read, 250);
    // Pointing at (or tabbing to) a doorway or a cable end: the room's labels say which they are.
    const near = (e: Event) => {
      const el = e.target instanceof Element ? e.target.closest("[aria-label]") : null;
      const label = el?.getAttribute("aria-label") ?? "";
      if (DOORWAY && label.startsWith(DOORWAY)) useMoments.getState().note("near-doorway");
      if (CABLE_END && label.startsWith(CABLE_END)) useMoments.getState().note("near-cable");
    };
    document.addEventListener("pointerover", near);
    document.addEventListener("focusin", near);
    return () => {
      clearInterval(id);
      document.removeEventListener("pointerover", near);
      document.removeEventListener("focusin", near);
    };
  }, []);
  return null;
}

/** A region's arrival lines, the first time the player stands in one of its rooms. */
const ARRIVALS: Record<number, Line[]> = {
  2: region2Arrival,
  3: region3Arrival,
  4: region4Arrival.lines,
};

const spoken = (lines: readonly Line[]): Line[] => lines.map((l) => ({ ...l, speaker: capital(l.speaker) }));

/** What plays when the room opens: the region's arrival (once), then a boss's introduction (once). */
function startLines(room: RoomDef, seen: readonly string[]): Line[] {
  const arrival = ARRIVALS[room.region] ?? [];
  const arrive = arrival[0] && !seen.includes(arrival[0].id) ? arrival : [];
  const intro = (roomTexts[room.content]?.voice ?? []).filter((v) => /BOSS-01$/.test(v.id) && !seen.includes(v.id));
  return spoken([...arrive, ...intro]);
}

/**
 * Knight's Memories (0008) and the lines that open a room. A memory plays when its moment comes: on
 * the New path by itself; on the others it's offered as a small "Knight's memory" chip, never
 * forced. After it, its action shows as a small prompt that completes when the player does it.
 */
export function KnightMoments() {
  const roomId = useSession((s) => s.roomId);
  const room = roomId ? roomById(roomId) : undefined;
  const newPath = useNewPath();
  const seen = useProgress((s) => s.memoriesSeen);
  const seeMemory = useProgress((s) => s.seeMemory);
  const voiceGiven = useSession((s) => s.voiceGiven);
  const won = useSession((s) => s.status?.won ?? false);
  const moving = useSession((s) => s.onCables.length);
  const startedAt = useSession((s) => s.startedAt);
  const elapsedMs = useElapsed(startedAt);
  const list = useMoments((s) => s.happened);
  const happened = useMemo(() => new Set(list), [list]);
  const [watching, setWatching] = useState<string | null>(null);
  const [action, setAction] = useState<{ id: string; text: string } | null>(null);

  // A new room: nothing carries over.
  // biome-ignore lint/correctness/useExhaustiveDependencies: startedAt marks a new visit
  useEffect(() => {
    setWatching(null);
    setAction(null);
  }, [startedAt]);

  if (!room) return null;
  const text = roomTexts[room.content];
  const ctx = { happened, room, elapsedMs, moving };
  const actionRule = action ? ruleFor(action.id, "") : null;
  const actionDone = !!actionRule?.done?.(ctx);
  // Once the room is won, the prompt has had its moment.
  const prompt = action && !won && (
    <ActionPrompt key={action.id} text={action.text} done={actionDone} onClose={() => setAction(null)} />
  );

  // The gift's room has its own lines; nothing else plays over it.
  if (room.commandMemory === "CMD-01" && !voiceGiven) return null;

  const start = startLines(room, seen);
  if (start.length > 0)
    return (
      <Lines
        lines={start}
        onDone={() => {
          for (const l of start) seeMemory(l.id);
        }}
      />
    );

  const finish = (m: { id: string; action?: string }) => {
    seeMemory(m.id);
    setWatching(null);
    const rule = ruleFor(m.id, "");
    // Its action, unless it's already done (or there's none).
    if (m.action && rule.done && !rule.done(ctx)) setAction({ id: m.id, text: m.action });
  };
  const memories = text?.memories ?? [];
  const playing = watching ? memories.find((m) => m.id === watching) : undefined;
  const due = won ? [] : memoriesDue(room, seen, ctx);
  const next = playing ?? due[0];
  if (next && (newPath || playing))
    return (
      <>
        <Lines
          key={next.id}
          lines={[{ id: next.id, speaker: next.title, text: fill(next.text, room.vars) }]}
          onDone={() => finish(next)}
        />
        {prompt}
      </>
    );
  if (next)
    return (
      <>
        <aside className="moment-card" aria-live="polite" data-moment="offer">
          <span className="note-label">{voice.knightMemory.offer}</span> <strong>{next.title}</strong>
          <span className="moment-actions">
            <button type="button" onClick={() => setWatching(next.id)}>
              {voice.knightMemory.watch}
            </button>
            {/* Not now: it counts as seen, so it's in the Knight's notes to play later (0008). */}
            <button type="button" className="quiet" onClick={() => seeMemory(next.id)}>
              {voice.knightMemory.later}
            </button>
          </span>
        </aside>
        {prompt}
      </>
    );
  return prompt ?? null;
}

/** A memory's action (0008): a small prompt that completes when the player does it. */
function ActionPrompt({ text, done, onClose }: { text: string; done: boolean; onClose: () => void }) {
  const close = useRef(onClose);
  close.current = onClose;
  // Done: it says so for a moment, then goes.
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => close.current(), 2500);
    return () => clearTimeout(id);
  }, [done]);
  return (
    <aside className="moment-card" aria-live="polite" data-moment="action" data-done={done ? "yes" : "no"}>
      <span aria-hidden="true">{done ? "✓ " : "✦ "}</span>
      {done ? voice.knightMemory.done : fill(voice.knightMemory.yourTurn, { action: text })}
      {!done && (
        <button type="button" className="quiet moment-close" onClick={onClose} aria-label={voice.knightMemory.dismiss}>
          ×
        </button>
      )}
    </aside>
  );
}

/** A small key, drawn (no font needed). */
export function KeyIcon() {
  return (
    <svg className="key-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="7" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M11 12h10M17 12v4M20 12v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const FLIGHT_MS = 2000;
const FADE_MS = 1600;

/**
 * The key's moment (CORE-36): when the room is won, the key word arrives with the answer in the
 * middle of the room, rests a moment, then flies to the keyring in the top bar, which glows as it
 * lands. Reduced motion: it fades in and out where it is.
 */
export function KeyFlight() {
  const roomId = useSession((s) => s.roomId);
  const startedAt = useSession((s) => s.startedAt);
  const won = useSession((s) => s.status?.won ?? false);
  const reduced = useReducedMotion();
  const [word, setWord] = useState<string | null>(null);
  const was = useRef(won);
  const ref = useRef<HTMLDivElement>(null);

  // A new visit starts unwon; only a win seen happening here sends the key flying.
  // biome-ignore lint/correctness/useExhaustiveDependencies: startedAt marks a new visit
  useEffect(() => {
    was.current = false;
    setWord(null);
  }, [startedAt]);

  useEffect(() => {
    const room = roomId ? roomById(roomId) : undefined;
    if (won && !was.current && room) {
      const isNew = !useMoments.getState().keysBefore.includes(room.key.word);
      useMoments.getState().fly(isNew ? room.key.word : null);
      setWord(room.key.word);
    }
    was.current = won;
  }, [won, roomId]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !word) return;
    const to = document.querySelector("[data-keyring]")?.getBoundingClientRect();
    const from = el.getBoundingClientRect();
    const dx = to ? to.left + to.width / 2 - (from.left + from.width / 2) : 0;
    const dy = to ? to.top + to.height / 2 - (from.top + from.height / 2) : 0;
    const at = (x: number, y: number, s: number) => `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${s})`;
    const frames: Keyframe[] =
      reduced || !to
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }]
        : [
            { opacity: 0, transform: at(0, 12, 0.85) },
            { opacity: 1, transform: at(0, 0, 1), offset: 0.2 },
            { opacity: 1, transform: at(0, 0, 1), offset: 0.5 },
            { opacity: 0.25, transform: at(dx, dy, 0.3) },
          ];
    const flight = el.animate(frames, {
      duration: reduced || !to ? FADE_MS : FLIGHT_MS,
      easing: "cubic-bezier(0.45, 0, 0.25, 1)",
      fill: "forwards",
    });
    let ended = false;
    const land = () => {
      if (ended) return;
      ended = true;
      useMoments.getState().land();
      setWord(null);
    };
    flight.onfinish = land;
    return () => {
      flight.cancel();
      // Gone before it landed (a new room): it's on the keyring all the same.
      if (!ended) useMoments.getState().land();
    };
  }, [word, reduced]);

  if (!word) return null;
  return (
    <div ref={ref} className="key-flight" role="status" aria-label={fill(voice.keyring.arrived, { word })}>
      <KeyIcon />
      <code>{word}</code>
    </div>
  );
}

/** The keyring in the top bar (CORE-36): how many keys, and it opens the Keyring tab. */
export function KeyringButton() {
  const keys = useProgress((s) => s.keys.length);
  const flight = useMoments((s) => s.flight);
  const landed = useMoments((s) => s.landed);
  const openPanel = useSession((s) => s.openPanel);
  // A new key in the air isn't on the ring until it lands.
  const n = Math.max(0, keys - (flight ? 1 : 0));
  return (
    <button
      type="button"
      data-keyring=""
      data-landed={landed ? "yes" : "no"}
      onClick={() => openPanel({ kind: "menu", tab: "keys" })}
      aria-label={fill(voice.keyring.count, { n: String(n) })}
      title={voice.keyring.name}
    >
      <KeyIcon /> {n}
    </button>
  );
}

/**
 * The floor's journal page (CORE-45), lying in the room its spec names: a faint glow where it lies,
 * once the spec says it shows (after the win, on walking the corridor, in the registry's room).
 * Clicking it reads it and keeps it; the Codex lists it from then on.
 */
export function JournalPage() {
  const roomId = useSession((s) => s.roomId);
  const room = roomId ? roomById(roomId) : undefined;
  const won = useSession((s) => s.status?.won ?? false);
  const here = useSession((s) => s.here);
  const pages = useProgress((s) => s.journalPages);
  const findJournalPage = useProgress((s) => s.findJournalPage);
  const [reading, setReading] = useState<string | null>(null);
  const floor = room ? floorDefs.find((f) => f.floor === room.floor) : undefined;
  const journal = room ? floorTexts[room.floor]?.journal : undefined;
  if (!room || !journal || floor?.journalRoom !== room.id) return null;
  if (reading === room.id)
    return (
      <section className="panel journal-read" aria-label={voice.journalPage.title}>
        <h2>{voice.journalPage.title}</h2>
        <blockquote className="journal">
          <strong>{journal.title}</strong>
          <p>{journal.text}</p>
        </blockquote>
        <p className="panel-note">{voice.journalPage.kept}</p>
        <div className="panel-actions">
          <button type="button" data-autofocus="" onClick={() => setReading(null)}>
            {voice.journalPage.close}
          </button>
        </div>
      </section>
    );
  if (pages.includes(journal.page) || !journalShows(journal.where, { won, here, player: room.playerDevice }))
    return null;
  return (
    <button
      type="button"
      className="journal-glow"
      aria-label={voice.journalPage.label}
      onClick={() => {
        findJournalPage(journal.page);
        setReading(room.id);
      }}
    >
      <span className="journal-leaf" aria-hidden="true" />
      {voice.journalPage.glow}
    </button>
  );
}

/**
 * The gentle way back (HELP-12): on the Know a little and Know networking paths, a player who opens
 * three or more hints in a boss is offered the floor's matching earlier room. An offer, never forced.
 */
export function WayBack() {
  const roomId = useSession((s) => s.roomId);
  const room = roomId ? roomById(roomId) : undefined;
  const fired = useSession((s) => s.status?.detectors ?? NONE);
  const won = useSession((s) => s.status?.won ?? false);
  const path = useProgress((s) => s.path ?? "new");
  const opened = useProgress((s) => (roomId ? (s.hints[roomId] ?? 0) : 0));
  const answered = useMoments((s) => s.wayBackAnswered);
  const answer = useMoments((s) => s.answerWayBack);
  const offered = room?.kind === "boss" && path !== "new" && opened >= 3 && !won && !answered.includes(room.id);
  if (!room || !offered) return null;
  const target = matchingRoom(room, fired);
  if (!target) return null;
  const title = roomTexts[target.content]?.title ?? target.id;
  return (
    <aside className="moment-card way-back" aria-live="polite" data-moment="way-back">
      <div className="note-label">{voice.notes.title}</div>
      <p>{fill(voice.wayBack.text, { room: title })}</p>
      <div className="panel-actions">
        <button
          type="button"
          onClick={() => {
            answer(room.id);
            goToRoom(target.id);
          }}
        >
          {voice.wayBack.go}
        </button>
        <button type="button" className="quiet" onClick={() => answer(room.id)}>
          {voice.wayBack.stay}
        </button>
      </div>
    </aside>
  );
}

/** The first release's ending (END1, floor-9.md): its lines, then the closing card. */
export function Ending() {
  const on = useMoments((s) => s.ending);
  return on ? <EndingView /> : null;
}

function EndingView() {
  const seeMemory = useProgress((s) => s.seeMemory);
  const setEnding = useMoments((s) => s.setEnding);
  const [card, setCard] = useState(false);
  const [next, setNext] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref, { trap: card, step: card });
  const lines = useMemo(() => spoken(firstReleaseEnding.lines), []);
  if (!card)
    return (
      <Lines
        lines={lines}
        onDone={() => {
          for (const l of lines) seeMemory(l.id);
          setCard(true);
        }}
      />
    );
  const c = firstReleaseEnding.card;
  return (
    <section ref={ref} className="ending-card" role="dialog" aria-modal="true" aria-label={c.text}>
      <p className="ending-text">{c.text}</p>
      {next && <p className="panel-note">{voice.ending.next}</p>}
      <div className="panel-actions">
        <button
          type="button"
          onClick={() => {
            setEnding(false);
            useSession.getState().openPanel({ kind: "menu", tab: "dungeon" });
          }}
        >
          {c.continue}
        </button>
        {!next && (
          <button type="button" className="quiet" onClick={() => setNext(true)}>
            {c.next}
          </button>
        )}
      </div>
    </section>
  );
}
