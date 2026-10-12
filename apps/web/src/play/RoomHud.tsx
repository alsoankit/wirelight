import { fill, floors, roomTexts, voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useEffect, useState } from "react";
import { useSession } from "../engine/store";

// The HTML layer over the room (gameplay/interface.md): all readable text is HTML, crisp at every
// tier. B1 walking skeleton: the floor and room title with the mission (top left), the room's controls
// (bottom), and the debrief once the room is won. Text comes from packages/content; every control runs
// a real command line through the engine.

const DEBRIEF_AFTER_MS = 2600; // let the restoration wave finish first

export function RoomHud() {
  const roomId = useSession((s) => s.roomId);
  const won = useSession((s) => s.status?.won ?? false);
  // UI-06: the last command a click ran, shown under "the machine heard:".
  const heard = useSession((s) => {
    for (let i = s.events.length - 1; i >= 0; i--) {
      const e = s.events[i];
      if (e?.kind === "cmd.exec" && e.source === "click") return e.line;
    }
    return null;
  });
  const exec = useSession((s) => s.exec);
  const [showDebrief, setShowDebrief] = useState(false);

  useEffect(() => {
    if (!won) return setShowDebrief(false);
    const timer = setTimeout(() => setShowDebrief(true), DEBRIEF_AFTER_MS);
    return () => clearTimeout(timer);
  }, [won]);

  const room = roomId ? roomById(roomId) : undefined;
  const text = room ? roomTexts[room.content] : undefined;
  if (!room || !text) return null;
  const send = room.controls.sendButton;
  const say = (t: string) => fill(t, room.vars);

  return (
    <div className="hud">
      <header className="mission-card">
        <div className="room-floor">{floors[room.floor]?.name}</div>
        <h1 className="room-title">{text.title}</h1>
        <p className="mission">{say(text.mission)}</p>
      </header>

      <footer className="controls">
        {send && (
          <button
            type="button"
            className="send"
            data-pulse={heard === null ? "yes" : "no"}
            onClick={() => exec(send.device, send.line, "click")}
          >
            {voice.send}
          </button>
        )}
        {heard && room.controls.console === "hidden" && (
          <div className="heard">
            {voice.heard} <code>{heard}</code>
          </div>
        )}
      </footer>

      {showDebrief && (
        <section className="debrief" aria-live="polite">
          <h2>{voice.debrief.title}</h2>
          <p>{say(text.debrief.happened)}</p>
          {text.debrief.terms.length > 0 && (
            <>
              <h3>{voice.debrief.terms}</h3>
              <dl>
                {text.debrief.terms.map((t) => (
                  <div key={t.term}>
                    <dt>{t.term}</dt>
                    <dd>{say(t.meaning)}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </section>
      )}
    </div>
  );
}
