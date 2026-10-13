import { cards, fill, floors, regions, roomTexts, voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useEffect, useRef, useState } from "react";
import { useSession } from "../engine/store";
import { useProgress } from "../progress/progress";
import { cardDue, readForCards } from "./cardRules";
import { attempts, hintsReady, useElapsed, useNewPath } from "./hints";
import { type Line, Lines } from "./Lines";
import { KeyringButton } from "./Moments";
import { floorCleared, questionOpen, useMoments } from "./momentRules";
import { RichText } from "./RichText";

/** One empty list, so selectors return the same value when there's nothing (no render loop). */
const NONE: never[] = [];

// The help around a room (gameplay/failure-and-hints.md, interface.md): the top bar (time, Reset,
// the Knight's notes, Ask, Menu), the hint ladder, the Knight's reactions when a detector fires,
// the Guardian's questions, discovery cards and Knight's Memories. Nothing is pushed on the player
// except new cards and, on the New path, memories (0008, 0009).

function useRoom() {
  const roomId = useSession((s) => s.roomId);
  const room = roomId ? roomById(roomId) : undefined;
  const text = room ? roomTexts[room.content] : undefined;
  return { room, text };
}

/** How many hints are ready now, and how many the player has opened. */
function useHints() {
  const { room } = useRoom();
  const startedAt = useSession((s) => s.startedAt);
  const tries = useSession((s) => attempts(s.events));
  const elapsed = useElapsed(startedAt);
  const newPath = useNewPath();
  const opened = useProgress((s) => (room ? (s.hints[room.id] ?? 0) : 0));
  const won = useSession((s) => s.status?.won ?? false);
  // Once the room is won, no hint is waiting any more.
  const ready = room && !won ? hintsReady(room, elapsed, tries, newPath) : 0;
  return { ready, opened };
}

/** The speed button's steps: normal, fast, faster, and back to normal (never a jump to slow motion). */
const SPEEDS = [1, 4, 16];

/** How long "the room is back as it was" shows after Reset. */
const RESET_NOTE_MS = 2500;

export function TopBar() {
  const { room } = useRoom();
  const paused = useSession((s) => s.paused);
  const speed = useSession((s) => s.speed);
  const setPaused = useSession((s) => s.setPaused);
  const setSpeed = useSession((s) => s.setSpeed);
  const reset = useSession((s) => s.reset);
  const openPanel = useSession((s) => s.openPanel);
  const { ready, opened } = useHints();
  const [resetAt, setResetAt] = useState(0);
  useEffect(() => {
    if (!resetAt) return;
    const id = setTimeout(() => setResetAt(0), RESET_NOTE_MS);
    return () => clearTimeout(id);
  }, [resetAt]);
  if (!room) return null;
  const nextSpeed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1;
  // It glows only when a hint is really ready (UI-15): never beside a button that can't be pressed.
  const glow = ready > opened && opened < 5;
  return (
    <nav className="top-bar" aria-label={voice.bar.label}>
      {/* Icons always; words beside them unless the text is large (then the bar stays one line, UI-22). */}
      <button
        type="button"
        onClick={() => setPaused(!paused)}
        aria-pressed={paused}
        aria-label={paused ? voice.bar.play : voice.bar.pause}
        title={paused ? voice.bar.play : voice.bar.pause}
      >
        <span aria-hidden="true">{paused ? "▶" : "❚❚"}</span>{" "}
        <span className="bar-word">{paused ? voice.bar.play : voice.bar.pause}</span>
      </button>
      <button
        type="button"
        onClick={() => setSpeed(nextSpeed)}
        aria-label={`${voice.bar.speed} ${speed}×`}
        title={voice.bar.speed}
      >
        {speed}×
      </button>
      <button
        type="button"
        onClick={() => void reset().then(() => setResetAt(performance.now()))}
        aria-label={voice.bar.reset}
        title={voice.bar.reset}
      >
        <span aria-hidden="true">↺</span> <span className="bar-word">{voice.bar.reset}</span>
      </button>
      <button
        type="button"
        data-tour="notes"
        data-glow={glow ? "yes" : "no"}
        onClick={() => openPanel({ kind: "notes" })}
      >
        {/* A hint waiting shows by shape too, not only the glow (UI-21). */}
        {glow && <span aria-hidden="true">✦ </span>}
        {voice.bar.notes} · {opened}/5
        {ready > opened && <span className="sr-only">, {voice.bar.hintReady}</span>}
      </button>
      <button type="button" onClick={() => openPanel({ kind: "ask" })}>
        {voice.bar.ask}
      </button>
      <KeyringButton />
      {resetAt > 0 && (
        <output className="bar-status" aria-live="polite">
          {voice.bar.resetDone}
        </output>
      )}
      <button
        type="button"
        data-tour="menu"
        onClick={() => openPanel({ kind: "menu" })}
        aria-label={voice.bar.menu}
        aria-keyshortcuts="M"
        title={voice.bar.menu}
      >
        <span aria-hidden="true">☰</span> <span className="bar-word">{voice.bar.menu}</span>
      </button>
    </nav>
  );
}

export function NotesPanel() {
  const { room, text } = useRoom();
  const panel = useSession((s) => s.panel);
  const close = useSession((s) => s.closePanel);
  const fired = useSession((s) => s.status?.detectors ?? NONE);
  const openHint = useProgress((s) => s.openHint);
  const memoriesSeen = useProgress((s) => s.memoriesSeen);
  const won = useSession((s) => s.status?.won ?? false);
  const [playing, setPlaying] = useState<Line[] | null>(null);
  const { ready, opened } = useHints();
  if (panel?.kind !== "notes" || !room || !text)
    return playing ? <Lines lines={playing} onDone={() => setPlaying(null)} /> : null;
  const say = (t: string) => fill(t, room.vars);
  const memories = (text.memories ?? []).filter((m) => memoriesSeen.includes(m.id));
  return (
    <section className="panel notes" aria-label={voice.notes.title}>
      <h2>{voice.notes.title}</h2>
      {text.notes.map((n) => (
        <p key={n} className="note">
          <RichText text={say(n)} />
        </p>
      ))}
      {fired.map((id) => {
        const d = text.detectors[id];
        return d ? (
          <p key={id} className="note" data-kind="reaction">
            <RichText text={say(d.note)} />
          </p>
        ) : null;
      })}
      {text.hints.slice(0, opened).map((h, i) => (
        <div key={h.text} className="note" data-kind="hint">
          <div className="note-label">{fill(voice.notes.hint, { n: String(i + 1) })}</div>
          <p>
            <RichText text={say(h.text)} />
          </p>
          {h.codex && cards[h.codex] && (
            <p className="panel-note">{fill(voice.notes.codex, { card: cards[h.codex]?.title ?? "" })}</p>
          )}
        </div>
      ))}
      {/* Why the button can't be pressed yet, said beside it (and read with it). */}
      {opened < 5 && ready <= opened && (
        <p className="panel-note" id="hint-waiting">
          {won ? voice.notes.solved : voice.notes.waiting}
        </p>
      )}
      <div className="panel-actions">
        {opened < 5 && (
          <button
            type="button"
            disabled={ready <= opened}
            aria-describedby={ready <= opened ? "hint-waiting" : undefined}
            onClick={() => openHint(room.id)}
          >
            {voice.notes.nextHint}
          </button>
        )}
        <button type="button" className="quiet" onClick={close}>
          {voice.jar.close}
        </button>
      </div>
      {opened === 5 && <p className="panel-note">{voice.notes.allRead}</p>}
      {memories.length > 0 && (
        <>
          <h3>{voice.notes.memories}</h3>
          {memories.map((m) => (
            <button
              key={m.id}
              type="button"
              className="link"
              onClick={() => {
                close();
                setPlaying([{ id: m.id, speaker: voice.knightMemory.speaker, title: m.title, text: m.text }]);
              }}
            >
              {m.title} · {voice.notes.replay}
            </button>
          ))}
        </>
      )}
    </section>
  );
}

export function AskPanel() {
  const { room, text } = useRoom();
  const panel = useSession((s) => s.panel);
  const close = useSession((s) => s.closePanel);
  const [answer, setAnswer] = useState<string | null>(null);
  const happened = useMoments((s) => s.happened);
  const cleared = useProgress((s) => s.cleared);
  if (panel?.kind !== "ask" || !room || !text) return null;
  const guardian = regions[room.region]?.guardian ?? "";
  // Questions that open later stay hidden until what they're about has happened (or the floor is cleared).
  const had = new Set(happened);
  const floorDone = floorCleared(room.floor, cleared);
  const questions = (text.guardian ?? []).filter((g) => questionOpen(g.after, had, floorDone));
  return (
    <section className="panel" aria-label={fill(voice.ask.title, { guardian })}>
      <h2>{fill(voice.ask.title, { guardian })}</h2>
      <ul className="questions">
        {questions.map((g) => (
          <li key={g.q}>
            <button type="button" className="link" onClick={() => setAnswer(g.a)}>
              <RichText text={g.q} />
            </button>
          </li>
        ))}
      </ul>
      {answer && (
        <p className="note" aria-live="polite">
          <RichText text={fill(answer, room.vars)} />
        </p>
      )}
      <div className="panel-actions">
        <button type="button" className="quiet" onClick={close}>
          {voice.ask.close}
        </button>
      </div>
    </section>
  );
}

/** When a detector fires, the Knight reacts once (HELP-05), for a little while, on the right. */
export function Reaction() {
  const { room, text } = useRoom();
  const fired = useSession((s) => s.status?.detectors ?? NONE);
  const won = useSession((s) => s.status?.won ?? false);
  // The notes panel shows the same note: one place at a time.
  const notesOpen = useSession((s) => s.panel?.kind === "notes");
  const [shown, setShown] = useState<string | null>(null);
  const seen = useRef(0);
  useEffect(() => {
    if (fired.length > seen.current) {
      setShown(fired[fired.length - 1] ?? null);
      const id = setTimeout(() => setShown(null), 9000);
      seen.current = fired.length;
      return () => clearTimeout(id);
    }
    seen.current = fired.length;
  }, [fired]);
  const d = shown && text ? text.detectors[shown] : undefined;
  if (!d || !room || won || notesOpen) return null;
  return (
    <aside className="reaction" aria-live="polite">
      <div className="note-label">{voice.notes.title}</div>
      <RichText text={fill(d.note, room.vars)} />
    </aside>
  );
}

/** Overlays that hold the stage: a card waits while one is up (one thing at a time). */
const STAGE_BUSY =
  ".lines, .glass, .cmd-memory, .tour, .path-choice, .gift-stage, .ending-card, .menu, .journal-read, .moment-card[data-moment='offer']";

/** A card left unanswered goes by itself after this (it's kept in the Codex), unless it's being read. */
const CARD_STAYS_MS = 25_000;

/**
 * Discovery cards (CORE-46), on the left, one at a time, never blocking: each when its moment comes
 * (cardRules.ts: an object when it's first looked at or seen doing its thing; an idea after the
 * debrief), and only while nothing else holds the stage (spoken lines, a memory, the Glass).
 */
export function DiscoveryCards() {
  const { room } = useRoom();
  const seen = useProgress((s) => s.cardsSeen);
  const seeCard = useProgress((s) => s.seeCard);
  const startedAt = useSession((s) => s.startedAt);
  const won = useSession((s) => s.status?.won ?? false);
  const happened = useMoments((s) => s.happened);
  const [own, setOwn] = useState<ReadonlySet<string>>(() => new Set());
  const [quiet, setQuiet] = useState(false);
  const [debriefUp, setDebriefUp] = useState(false);
  const [more, setMore] = useState(false);
  const [held, setHeld] = useState(false);

  // What this visit has shown (panels, messages moving, marks, pings…), and whether the stage is free.
  useEffect(() => {
    let seenTags = new Set<string>();
    let started = -1;
    let last = 0;
    const read = () => {
      const s = useSession.getState();
      if (s.startedAt !== started) {
        started = s.startedAt;
        seenTags = new Set();
        last = 0;
        setOwn(new Set());
      }
      const out = new Set<string>();
      const from = Math.max(0, last - s.dropped);
      readForCards({ panel: s.panel, moving: s.onCables.length, events: s.events.slice(from) }, out);
      last = s.dropped + s.events.length;
      const fresh = [...out].filter((t) => !seenTags.has(t));
      if (fresh.length) {
        for (const t of fresh) seenTags.add(t);
        setOwn(new Set(seenTags));
      }
      setQuiet(!document.querySelector(STAGE_BUSY));
      setDebriefUp(!!document.querySelector(".debrief"));
    };
    read();
    const id = setInterval(read, 250);
    return () => clearInterval(id);
  }, []);

  const all = new Set([...happened, ...own]);
  const next = room?.cards.find((c) => !seen.includes(c) && cardDue(c, all, won && debriefUp));
  // The card on screen. It's in the Codex from the moment it shows ("Things you've found").
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    if (current || !next || !quiet) return;
    setCurrent(next);
    seeCard(next);
  }, [current, next, quiet, seeCard]);
  const card = current ? cards[current] : undefined;
  const showing = !!card && quiet;

  // A card nobody answers goes by itself after a while (unless it's being read): it's in the Codex.
  useEffect(() => {
    if (!showing || !card || more || held) return;
    const id = setTimeout(() => setCurrent(null), CARD_STAYS_MS);
    return () => clearTimeout(id);
  }, [showing, card, more, held]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new visit starts with no card on screen
  useEffect(() => {
    setMore(false);
    setCurrent(null);
  }, [startedAt]);

  if (!card || !showing) return null;
  return (
    <aside
      className="discovery"
      aria-live="polite"
      data-card={card.id}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="note-label">{voice.discovery.new}</div>
      <h3>{card.title}</h3>
      <p>
        <RichText text={card.text} />
      </p>
      {more && card.more && (
        <p className="panel-note">
          <RichText text={card.more} />
        </p>
      )}
      <div className="panel-actions">
        {card.more && !more && (
          <button type="button" className="quiet" onClick={() => setMore(true)}>
            {voice.discovery.more}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setMore(false);
            setHeld(false);
            setCurrent(null);
          }}
        >
          {voice.discovery.ok}
        </button>
      </div>
    </aside>
  );
}

/** The floor's name and number for the mission card. */
export function floorName(floor: number): string {
  return floors[floor]?.name ?? "";
}
