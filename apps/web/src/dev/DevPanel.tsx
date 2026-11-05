import { cards, commandMemories, fill, floors, regions, roomTexts } from "@wirelight/content";
import { type RoomDef, roomById, rooms, type SolutionStep } from "@wirelight/rooms";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "../engine/store";
import { isTyping } from "../play/keys";
import { openMemory } from "../play/Memory";
import { goToRoom } from "../play/RoomHud";
import { useProgress } from "../progress/progress";
import { PlaythroughHud } from "./PlaythroughHud";
import { runSteps, startPlaythrough, type Until, usePlaythrough } from "./playthrough";

// Developer tool (not part of the game): jump to any room, read everything about it, and watch it
// play itself. Open with Shift+D in dev builds, or with ?dev=1 on any build. Auto-play runs the room's
// own solution (or a detector's test script) step by step through the real engine, walking into each
// machine's room so the player's view follows; nothing is faked. The playthrough (playthrough.ts)
// plays room after room at a watchable pace; start it here or with ?autoplay=1 (&until=floor|region|
// game, &speed=1|4|16, &pace=0.6|1|1.6, &secrets=0, &memories=0) on a room's link.

const SPEEDS = [1, 4, 16];

function Sheet({ room }: { room: RoomDef }) {
  const t = roomTexts[room.content];
  if (!t) return null;
  const say = (x: string) => fill(x, room.vars);
  const memory = room.commandMemory ? commandMemories[room.commandMemory] : undefined;
  return (
    <div className="dev-sheet">
      <p>
        <strong>{t.title}</strong> · {room.kind} · {room.pathTag} · key <code>{room.key.word}</code>
      </p>
      <p>{say(t.mission)}</p>
      <details>
        <summary>Setup</summary>
        <p>Machines: {room.topology.devices.map((d) => `${d.id} (${room.access[d.id]?.state ?? "?"})`).join(", ")}</p>
        <p>
          Cables:{" "}
          {room.topology.links.map((l) => `${l.id}: ${l.a.device}:${l.a.iface}–${l.b.device}:${l.b.iface}`).join(" · ")}
        </p>
        <p>Faults: {room.faults.map((f) => JSON.stringify(f)).join(" · ") || "none"}</p>
        <p>Controls: {JSON.stringify(room.controls)}</p>
        <p>
          Teaches: {room.teaches.join(", ") || "—"} · uses: {room.uses.join(", ") || "—"} · tools:{" "}
          {room.tools.unlock?.join(", ") || "—"}
        </p>
      </details>
      <details>
        <summary>Solution</summary>
        <ol>
          {room.solution.map((s, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: steps in order
            <li key={i}>
              <code>
                {s.device}: {"touch" in s ? `touch ${s.touch}` : s.line}
              </code>
            </li>
          ))}
        </ol>
      </details>
      <details>
        <summary>Hints</summary>
        <ol>
          {t.hints.map((h) => (
            <li key={h.text}>{say(h.text)}</li>
          ))}
        </ol>
      </details>
      <details>
        <summary>Detectors</summary>
        {Object.entries(t.detectors).map(([id, d]) => (
          <p key={id}>
            <code>{id}</code>: {say(d.note)} <em>({say(d.tried)})</em>
          </p>
        ))}
      </details>
      <details>
        <summary>Debrief</summary>
        <p>{say(t.debrief.happened)}</p>
        {t.debrief.terms.map((x) => (
          <p key={x.id}>
            <strong>{x.term}</strong>: {x.meaning}
          </p>
        ))}
      </details>
      <details>
        <summary>Notes, memories, questions, cards</summary>
        {t.notes.map((n) => (
          <p key={n}>Note: {say(n)}</p>
        ))}
        {(t.memories ?? []).map((m) => (
          <p key={m.id}>
            <code>{m.id}</code> {m.title} ({m.trigger}): {m.text}
            {m.action ? ` → ${m.action}` : ""}
          </p>
        ))}
        {(t.voice ?? []).map((v) => (
          <p key={v.id}>
            <code>{v.id}</code> {v.speaker}: {v.text}
          </p>
        ))}
        {(t.questions ?? []).map((g) => (
          <p key={g.q}>
            Q: {g.q} — {g.a}
            {g.after ? ` (after ${g.after})` : ""}
          </p>
        ))}
        {room.cards.map((c) => (
          <p key={c}>
            Card <strong>{cards[c]?.title}</strong>: {cards[c]?.text}
          </p>
        ))}
        {t.building && <p>Building memory: {t.building.text}</p>}
        {memory && <p>Command memory: {memory.command}</p>}
      </details>
    </div>
  );
}

export function DevPanel() {
  const [open, setOpen] = useState(false);
  const roomId = useSession((s) => s.roomId);
  const [speed, setSpeed] = useState(4);
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [cancel] = useState(() => ({ stop: false }));
  const room = roomId ? roomById(roomId) : undefined;
  const allowed = import.meta.env.DEV || new URLSearchParams(window.location.search).get("dev") === "1";
  const [scope, setScope] = useState<Until>("game");
  const [secrets, setSecrets] = useState(true);
  const pace = usePlaythrough((s) => s.pace);
  const memories = usePlaythrough((s) => s.memories);
  const playing = usePlaythrough((s) => s.running);

  // ?autoplay=1: the playthrough starts by itself from the room in the link, once it has loaded.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on the first room
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (!allowed || q.get("autoplay") !== "1" || !roomId) return;
    const until = (q.get("until") ?? "game") as Until;
    usePlaythrough.setState({
      pace: Number(q.get("pace") ?? 1) || 1,
      memories: q.get("memories") !== "0",
    });
    void startPlaythrough(roomId, until, q.get("secrets") !== "0", Number(q.get("speed") ?? 1) || 1);
  }, [allowed, roomId === null]);

  useEffect(() => {
    if (!allowed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "D" && e.shiftKey && !isTyping(e)) setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowed]);

  const byFloor = useMemo(
    () => Object.values(floors).map((f) => ({ f, list: rooms.filter((r) => r.floor === f.n) })),
    [],
  );
  if (!allowed) return null;
  if (!open)
    return (
      <>
        <button type="button" className="dev-toggle" onClick={() => setOpen(true)}>
          Dev
        </button>
        <PlaythroughHud />
      </>
    );

  const jump = (id: string) => {
    // A developer's jump: skip the first visit's onboarding, keep the voice given.
    const p = useProgress.getState();
    p.giveSight();
    if (!p.path) p.choosePath("new");
    p.finishTour();
    cancel.stop = true;
    setLog([]);
    goToRoom(id);
  };
  const play = async (steps: SolutionStep[], label: string) => {
    if (!room || running) return;
    cancel.stop = false;
    setRunning(true);
    setLog([`▶ ${label}`]);
    useSession.getState().setSpeed(speed);
    await runSteps(
      room,
      steps,
      (s) => setLog((l) => [...l, s]),
      () => cancel.stop,
    );
    setRunning(false);
  };
  const restart = async () => {
    cancel.stop = true;
    await useSession.getState().reset();
  };

  return (
    <>
      <PlaythroughHud />
      <aside className="dev-panel" aria-label="Developer panel">
        <header>
          <strong>Dev</strong>
          <button type="button" onClick={() => setOpen(false)}>
            Close
          </button>
        </header>
        <section className="dev-playthrough-start">
          <div className="dev-floor">Playthrough</div>
          <p className="dev-help">
            Plays the game from this room at a pace you can watch: missions, solutions, debriefs, memories. Shift+N
            writes a note.
          </p>
          <div className="dev-actions">
            <label>
              until{" "}
              <select value={scope} onChange={(e) => setScope(e.target.value as Until)}>
                <option value="floor">end of floor</option>
                <option value="region">end of region</option>
                <option value="game">end of game</option>
              </select>
            </label>
            <label>
              speed{" "}
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </label>
            <label>
              reading{" "}
              <select value={pace} onChange={(e) => usePlaythrough.setState({ pace: Number(e.target.value) })}>
                <option value={0.6}>brisk</option>
                <option value={1}>normal</option>
                <option value={1.6}>slow</option>
              </select>
            </label>
          </div>
          <div className="dev-actions">
            <label>
              <input
                type="checkbox"
                checked={memories}
                onChange={(e) => usePlaythrough.setState({ memories: e.target.checked })}
              />{" "}
              memories
            </label>
            <label>
              <input type="checkbox" checked={secrets} onChange={(e) => setSecrets(e.target.checked)} /> secret rooms
            </label>
          </div>
          <div className="dev-actions">
            <button
              type="button"
              disabled={playing || !roomId}
              onClick={() => roomId && void startPlaythrough(roomId, scope, secrets, speed)}
            >
              ▶ Play from here
            </button>
            <button
              type="button"
              disabled={playing}
              onClick={() => {
                const first = rooms[0]?.id;
                if (first) void startPlaythrough(first, scope, secrets, speed);
              }}
            >
              ▶ Play from the start
            </button>
          </div>
        </section>
        <section className="dev-rooms">
          {byFloor.map(({ f, list }) =>
            list.length === 0 ? null : (
              <div key={f.n}>
                <div className="dev-floor">
                  {f.n === 0 ? "" : `${f.n} · `}
                  {f.name} <span>({regions[f.region]?.name})</span>
                </div>
                {list.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    data-here={r.id === roomId ? "yes" : "no"}
                    onClick={() => jump(r.id)}
                    title={r.id}
                  >
                    {roomTexts[r.content]?.title ?? r.id}
                    {r.kind === "boss" ? " ★" : r.kind === "secret" ? " ✧" : ""}
                  </button>
                ))}
              </div>
            ),
          )}
        </section>
        {room && (
          <section>
            <div className="dev-actions">
              <button type="button" disabled={running} onClick={() => void play(room.solution, "solution")}>
                ▶ Auto-play solution
              </button>
              <button type="button" onClick={() => void restart()}>
                ↺ Reset
              </button>
              <label>
                speed{" "}
                <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                  {SPEEDS.map((s) => (
                    <option key={s} value={s}>
                      {s}×
                    </option>
                  ))}
                </select>
              </label>
              {running && (
                <button type="button" onClick={() => (cancel.stop = true)}>
                  ■ Stop
                </button>
              )}
            </div>
            <div className="dev-actions">
              {room.detectorTests.map((t) => (
                <button
                  key={t.misconception}
                  type="button"
                  disabled={running}
                  onClick={async () => {
                    await restart();
                    await play(t.steps, `mistake: ${t.misconception}`);
                  }}
                >
                  ✗ {t.misconception}
                </button>
              ))}
            </div>
            <div className="dev-actions">
              {roomTexts[room.content]?.building && (
                <button type="button" onClick={() => openMemory({ kind: "building", roomId: room.id })}>
                  Building memory
                </button>
              )}
              <button type="button" onClick={() => openMemory({ kind: "floor", floor: room.floor })}>
                Floor memory + ride
              </button>
            </div>
            {log.length > 0 && <pre className="dev-log">{log.join("\n")}</pre>}
            <Sheet room={room} />
          </section>
        )}
      </aside>
    </>
  );
}
