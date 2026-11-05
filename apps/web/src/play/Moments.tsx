import {
  fill,
  firstReleaseEnding,
  region2Arrival,
  region3Arrival,
  region4Arrival,
  roomTexts,
  voice,
} from "@wirelight/content";
import { type RoomDef, roomById } from "@wirelight/rooms";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "../engine/store";
import { useProgress } from "../progress/progress";
import { useDialogFocus } from "./focus";
import { useElapsed, useNewPath } from "./hints";
import { type Line, Lines } from "./Lines";
import { linesDue, matchingRoom, memoryNow, readEvents, readView, ruleFor, useMoments } from "./momentRules";
import { RichText } from "./RichText";
import { goToRoom } from "./RoomHud";
import { WorldBackdrop } from "./WorldMap";

// The game-feel moments around a room (HELP-12, 0008, END1): region arrivals and boss introductions,
// tips when their moment comes (with the one small thing to do after), the gentle way back in a
// boss, and the first release's ending. The rules are in moments.ts.

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
        useMoments.getState().enter(room.id);
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

/** A region's arrival waits this long for the player to step into its hall before it plays anyway. */
const ARRIVAL_WAIT_MS = 40_000;

/**
 * What plays when the room opens: a boss's introduction (once), and the region's arrival (once),
 * the first time the player steps into the region's hall (or after a while if they don't), never
 * as a pile of lines before the first move.
 */
function startLines(room: RoomDef, seen: readonly string[], inHall: boolean): Line[] {
  const arrival = ARRIVALS[room.region] ?? [];
  const arrive = arrival[0] && inHall && !seen.includes(arrival[0].id) ? arrival : [];
  const intro = (roomTexts[room.content]?.voice ?? []).filter((v) => /BOSS-01$/.test(v.id) && !seen.includes(v.id));
  return spoken([...arrive, ...intro]);
}

/**
 * Tips (0008) and the lines that open a room. A tip plays when its moment comes: on the New path by
 * itself; on the others it's offered as a small "Tip" chip, never forced. After it, its action shows
 * as a small prompt that completes when the player does it.
 */
export function TipMoments() {
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
  /** The memory whose moment has come: it stays until it's been seen (momentRules.ts `memoryNow`). */
  const [cameUp, setCameUp] = useState<string | null>(null);
  const [action, setAction] = useState<{ id: string; text: string; here: string | null } | null>(null);
  const here = useSession((s) => s.here);

  // A new room: nothing carries over.
  // biome-ignore lint/correctness/useExhaustiveDependencies: startedAt marks a new visit
  useEffect(() => {
    setWatching(null);
    setCameUp(null);
    setAction(null);
  }, [startedAt]);

  const ctx = room ? { happened, room, elapsedMs, moving } : undefined;
  const next = room && ctx ? memoryNow(room, seen, ctx, { watching, cameUp, won }) : undefined;
  // Held from the moment it comes up, even if that moment passes (the message arrives) before it's read.
  useEffect(() => {
    if (next && next.id !== watching) setCameUp(next.id);
  }, [next, watching]);

  if (!room || !ctx) return null;
  const text = roomTexts[room.content];
  const actionRule = action ? ruleFor(action.id, "") : null;
  const actionDone = !!actionRule?.done?.(ctx);
  // Once the room is won, the prompt has had its moment; and it belongs to the machine's room where
  // it was given (it doesn't follow the player into another room, unless walking there was the action).
  const prompt = action && !won && (actionDone || action.here === here) && (
    <ActionPrompt key={action.id} text={action.text} done={actionDone} onClose={() => setAction(null)} />
  );

  // The gift's room has its own lines; nothing else plays over it.
  if (room.commandMemory === "CMD-01" && !voiceGiven) return null;

  // Agent B: a room's other voiced lines play when their moment comes (momentRules.ts LINE_RULES).
  const start = [
    // (A region's arrival never plays over a debrief: if the room was won first, it waits for the next.)
    ...startLines(room, seen, !won && (happened.has("walked") || elapsedMs > ARRIVAL_WAIT_MS)),
    ...spoken(linesDue(room, seen, ctx)),
  ];
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
    if (m.action && rule.done && !rule.done(ctx)) setAction({ id: m.id, text: m.action, here });
  };
  const memories = text?.memories ?? [];
  const playing = watching ? memories.find((m) => m.id === watching) : undefined;
  if (next && (newPath || playing))
    return (
      <>
        <Lines
          key={next.id}
          lines={[{ id: next.id, speaker: voice.tips.speaker, title: next.title, text: fill(next.text, room.vars) }]}
          onDone={() => finish(next)}
        />
        {prompt}
      </>
    );
  if (next)
    return (
      <>
        <aside className="moment-card" aria-live="polite" data-moment="offer">
          <span className="note-label">{voice.tips.offer}</span> <strong>{next.title}</strong>
          <span className="moment-actions">
            <button type="button" onClick={() => setWatching(next.id)}>
              {voice.tips.watch}
            </button>
            {/* Not now: it counts as seen, so it's in the notes to play later (0008). */}
            <button type="button" className="quiet" onClick={() => seeMemory(next.id)}>
              {voice.tips.later}
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
      {fill(done ? voice.tips.done : voice.tips.yourTurn, { action: text })}
      {!done && (
        <button type="button" className="quiet moment-close" onClick={onClose} aria-label={voice.tips.dismiss}>
          ×
        </button>
      )}
    </aside>
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
      <p>
        <RichText text={fill(voice.wayBack.text, { room: title })} />
      </p>
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
  // The ending plays on its own stage: the room and everything over it are gone from view.
  if (!card)
    return (
      <div className="ending-stage">
        <WorldBackdrop />
        <Lines
          lines={lines}
          onDone={() => {
            for (const l of lines) seeMemory(l.id);
            setCard(true);
          }}
        />
      </div>
    );
  const c = firstReleaseEnding.card;
  return (
    <div className="ending-stage">
      <WorldBackdrop />
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
    </div>
  );
}
