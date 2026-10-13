import { cards, fill, floors, regions, roomTexts, voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useEffect, useRef, useState } from "react";
import { useSession } from "../engine/store";
import { useProgress } from "../progress/progress";
import { attempts, hintsReady, useElapsed, useNewPath } from "./hints";
import { type Line, Lines } from "./Lines";

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
  const ready = room ? hintsReady(room, elapsed, tries, newPath) : 0;
  return { ready, opened };
}

const SPEEDS = [0.25, 1, 4, 16];

export function TopBar() {
  const { room } = useRoom();
  const paused = useSession((s) => s.paused);
  const speed = useSession((s) => s.speed);
  const setPaused = useSession((s) => s.setPaused);
  const setSpeed = useSession((s) => s.setSpeed);
  const reset = useSession((s) => s.reset);
  const openPanel = useSession((s) => s.openPanel);
  const detectors = useSession((s) => s.status?.detectors.length ?? 0);
  const { ready, opened } = useHints();
  if (!room) return null;
  const glow = ready > opened || detectors > 0;
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
        onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1)}
        aria-label={`${voice.bar.speed} ${speed}×`}
        title={voice.bar.speed}
      >
        {speed}×
      </button>
      <button type="button" onClick={() => void reset()} aria-label={voice.bar.reset} title={voice.bar.reset}>
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
          {say(n)}
        </p>
      ))}
      {fired.map((id) => {
        const d = text.detectors[id];
        return d ? (
          <p key={id} className="note" data-kind="reaction">
            {say(d.note)}
          </p>
        ) : null;
      })}
      {text.hints.slice(0, opened).map((h, i) => (
        <div key={h.text} className="note" data-kind="hint">
          <div className="note-label">{fill(voice.notes.hint, { n: String(i + 1) })}</div>
          <p>{say(h.text)}</p>
          {h.codex && cards[h.codex] && (
            <p className="panel-note">{fill(voice.notes.codex, { card: cards[h.codex]?.title ?? "" })}</p>
          )}
        </div>
      ))}
      <div className="panel-actions">
        {opened < 5 && (
          <button type="button" disabled={ready <= opened} onClick={() => openHint(room.id)}>
            {voice.notes.nextHint}
          </button>
        )}
        <button type="button" className="quiet" onClick={close}>
          {voice.jar.close}
        </button>
      </div>
      {opened < 5 && ready <= opened && <p className="panel-note">{voice.notes.waiting}</p>}
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
                setPlaying([{ id: m.id, speaker: m.title, text: m.text }]);
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
  if (panel?.kind !== "ask" || !room || !text) return null;
  const guardian = regions[room.region]?.guardian ?? "";
  // Questions that open later (after something happened) stay hidden until then; the room says when.
  const questions = (text.guardian ?? []).filter((g) => !g.after);
  return (
    <section className="panel" aria-label={fill(voice.ask.title, { guardian })}>
      <h2>{fill(voice.ask.title, { guardian })}</h2>
      <ul className="questions">
        {questions.map((g) => (
          <li key={g.q}>
            <button type="button" className="link" onClick={() => setAnswer(g.a)}>
              {g.q}
            </button>
          </li>
        ))}
      </ul>
      {answer && (
        <p className="note" aria-live="polite">
          {fill(answer, room.vars)}
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
  if (!d || !room) return null;
  return (
    <aside className="reaction" aria-live="polite">
      <div className="note-label">{voice.notes.title}</div>
      {fill(d.note, room.vars)}
    </aside>
  );
}

/** A discovery card the first time an object is seen (CORE-46), one at a time, on the left. */
export function DiscoveryCards() {
  const { room } = useRoom();
  const seen = useProgress((s) => s.cardsSeen);
  const seeCard = useProgress((s) => s.seeCard);
  const busy = useSession((s) => s.panel !== null);
  const [more, setMore] = useState(false);
  const next = room?.cards.find((c) => !seen.includes(c));
  const card = next ? cards[next] : undefined;
  if (!card || busy) return null;
  return (
    <aside className="discovery" aria-live="polite">
      <div className="note-label">{voice.discovery.new}</div>
      <h3>{card.title}</h3>
      <p>{card.text}</p>
      {more && card.more && <p className="panel-note">{card.more}</p>}
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
            seeCard(card.id);
          }}
        >
          {voice.discovery.ok}
        </button>
      </div>
    </aside>
  );
}

/**
 * Knight's Memories that play on entering a room (0008): automatically on the New path, once; then
 * replayable from the Knight's notes. A boss's introduction plays the first time too.
 */
export function RoomStartLines() {
  const { room, text } = useRoom();
  const newPath = useNewPath();
  const seen = useProgress((s) => s.memoriesSeen);
  const seeMemory = useProgress((s) => s.seeMemory);
  const voiceGiven = useSession((s) => s.voiceGiven);
  if (!room || !text) return null;
  const memories = (text.memories ?? [])
    .filter((m) => /enter|first visit/i.test(m.trigger) && !seen.includes(m.id))
    .map((m) => ({ id: m.id, speaker: `${m.title}`, text: m.text }));
  const intro = (text.voice ?? []).filter((v) => /BOSS-01$/.test(v.id) && !seen.includes(v.id));
  const lines: Line[] = [...intro, ...(newPath ? memories : [])];
  // The gift's room has its own lines; nothing else plays over it.
  if (lines.length === 0 || (room.commandMemory === "CMD-01" && !voiceGiven)) return null;
  return (
    <Lines
      lines={lines}
      onDone={() => {
        for (const l of lines) seeMemory(l.id);
      }}
    />
  );
}

/** The floor's name and number for the mission card. */
export function floorName(floor: number): string {
  return floors[floor]?.name ?? "";
}
