import { fill, firstReleaseEnding, floors, floorTexts, regions, roomTexts, voice } from "@wirelight/content";
import { floorDefs, nextOnPath, roomById, rooms } from "@wirelight/rooms";
import { useEffect, useState } from "react";
import { winningFrame } from "../engine/journey";
import { useSession } from "../engine/store";
import { useProgress } from "../progress/progress";
import { takeFocusPolitely } from "./focus";
import { closeGlass, openGlass } from "./keys";
import { openMemory, useMemory } from "./Memory";
import { useMoments } from "./momentRules";
import { RichText } from "./RichText";

/** One empty list, so selectors return the same value when there's nothing (no render loop). */
const NONE: never[] = [];

// The HTML layer over the room (gameplay/interface.md): all readable text is HTML, crisp at every
// tier. The floor and room title with the mission (top left), the room's own controls (bottom), and
// after the win the debrief (HELP-13): what happened, new words, what you tried, the key, then the
// Guardian's memories (building, floor), and on to the next room on your path.

const DEBRIEF_AFTER_MS = 2600; // let the restoration wave finish first

/** The first release's last boss (9.B): its win leads into the ending (END1). */
const LAST_BOSS = floorDefs.reduce((a, f) => (f.floor > a.floor ? f : a)).boss;

/** Goes to a room: loads it, remembers it (ONB-20), and puts it in the address bar. */
export function goToRoom(roomId: string): void {
  useProgress.getState().setCurrent(roomId);
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  window.history.replaceState(null, "", url);
  void useSession.getState().load(roomId);
}

export function RoomHud() {
  const roomId = useSession((s) => s.roomId);
  const won = useSession((s) => s.status?.won ?? false);
  const fired = useSession((s) => s.status?.detectors ?? NONE);
  // UI-06: the last command a click ran, shown under "the machine heard:".
  const heard = useSession((s) => {
    for (let i = s.events.length - 1; i >= 0; i--) {
      const e = s.events[i];
      if (e?.kind === "cmd.exec" && e.source === "click") return e.line;
    }
    return null;
  });
  const exec = useSession((s) => s.exec);
  const voiceGiven = useSession((s) => s.voiceGiven);
  const path = useProgress((s) => s.path ?? "new");
  const hintsOpened = useProgress((s) => (roomId ? (s.hints[roomId] ?? 0) : 0));
  const clear = useProgress((s) => s.clear);
  const [showDebrief, setShowDebrief] = useState(false);

  const room = roomId ? roomById(roomId) : undefined;
  const text = room ? roomTexts[room.content] : undefined;
  // The finale (END1, floor-9.md): after the last boss, its floor memory plays by itself, then the
  // ending; the debrief waits until both are over (skipping the memory still leads to the ending).
  const endingSeen = useProgress((s) => s.memoriesSeen.includes(firstReleaseEnding.lines[0]?.id ?? ""));
  const memoryShowing = useMemory((s) => s.show !== null);
  const ending = useMoments((s) => s.ending);
  const finale = !!room && room.id === LAST_BOSS && won && (!endingSeen || ending);

  useEffect(() => {
    if (!won) return setShowDebrief(false);
    const timer = setTimeout(() => {
      setShowDebrief(true);
      closeGlass();
      const s = useSession.getState();
      const r = s.roomId ? roomById(s.roomId) : undefined;
      const seen = useProgress.getState().memoriesSeen.includes(firstReleaseEnding.lines[0]?.id ?? "");
      if (r && r.id === LAST_BOSS && !seen) openMemory({ kind: "floor", floor: r.floor });
      // The console steps down for the debrief (UI-02): its buttons must never sit under the console.
      useSession.getState().setConsoleOpen(false);
    }, DEBRIEF_AFTER_MS);
    return () => clearTimeout(timer);
  }, [won]);

  // The win is recorded once: first try means no detector fired and no hint was opened.
  useEffect(() => {
    if (!won || !room) return;
    clear(room.id, {
      firstTry: fired.length === 0 && hintsOpened === 0,
      hintsOpened,
      revealed: hintsOpened >= 5,
      key: room.key.word,
    });
    // A returning player goes on from here (ONB-20): the saved place is now the next room on the path.
    const next = nextOnPath(rooms, room.id, useProgress.getState().path ?? "new");
    if (next) useProgress.getState().setCurrent(next.id);
  }, [won, room, fired.length, hintsOpened, clear]);

  if (!room || !text) return null;
  const send = room.controls.sendButton;
  const say = (t: string) => fill(t, room.vars);
  const next = nextOnPath(rooms, room.id, path);
  const floor = floorDefs.find((f) => f.floor === room.floor);
  const floorText = floorTexts[room.floor];
  const guardian = regions[room.region]?.guardian ?? "";
  const isBoss = floor?.boss === room.id;
  const tried = fired.map((id) => text.detectors[id]?.tried).filter((t): t is string => !!t);
  const capital = guardian.charAt(0).toUpperCase() + guardian.slice(1);

  return (
    <>
      <div className="hud">
        <header className="mission-card">
          <div className="room-floor">{floors[room.floor]?.name}</div>
          <h1 className="room-title">{text.title}</h1>
          <p className="mission">
            <RichText text={say(text.mission)} />
          </p>
        </header>

        <footer className="controls">
          {send && (
            <button
              type="button"
              className="send"
              data-pulse={heard === null && !won ? "yes" : "no"}
              onClick={() => {
                exec(send.device, send.line, "click");
                // The Prologue: the Glass opens so the first message can be watched there (ONB-19).
                if (room.kind === "prologue") openGlass();
              }}
            >
              {voice.send}
            </button>
          )}
          {heard && !voiceGiven && (
            <div className="heard">
              {voice.heard} <code>{heard}</code>
            </div>
          )}
        </footer>
      </div>
      {/* The debrief sits outside the room's layer, above the Glass and the world's labels. */}
      {showDebrief && !finale && !memoryShowing && (
        <section ref={takeFocusPolitely} className="debrief" aria-live="polite" aria-labelledby="debrief-title">
          <h2 id="debrief-title">{voice.debrief.title}</h2>
          <p>
            <RichText text={say(text.debrief.happened)} />
          </p>
          {text.debrief.terms.length > 0 && (
            <>
              <h3>{voice.debrief.terms}</h3>
              <dl>
                {text.debrief.terms.map((t) => (
                  <div key={t.term}>
                    <dt>
                      <RichText text={t.term} />
                    </dt>
                    <dd>
                      <RichText text={say(t.meaning)} />
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          <h3>{voice.debrief.tried}</h3>
          {tried.length === 0 ? (
            <p>{voice.debrief.firstTry}</p>
          ) : (
            <ul>
              {tried.map((t) => (
                <li key={t}>
                  <RichText text={say(t)} />
                </li>
              ))}
            </ul>
          )}
          <p className="debrief-key">
            {voice.after.key}: <code>{room.key.word}</code>
          </p>
          <div className="panel-actions">
            {text.building && (
              <button type="button" className="quiet" onClick={() => openMemory({ kind: "building", roomId: room.id })}>
                {voice.after.building}
              </button>
            )}
            {isBoss && floorText && (
              <button type="button" className="quiet" onClick={() => openMemory({ kind: "floor", floor: room.floor })}>
                {fill(voice.after.floorMemory, { guardian: capital })}
              </button>
            )}
            <button
              type="button"
              className="quiet"
              onClick={() => {
                const s = useSession.getState();
                const won = winningFrame(s.events, room.playerDevice);
                if (won !== null) s.setReplay(won);
              }}
            >
              {voice.replay.winning}
            </button>
            {next ? (
              <button type="button" data-autofocus="" onClick={() => goToRoom(next.id)}>
                {fill(voice.after.nextRoom, { room: roomTexts[next.content]?.title ?? next.id })}
              </button>
            ) : (
              <p>{voice.after.end}</p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
