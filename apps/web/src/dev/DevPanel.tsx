import { cards, commandMemories, fill, floors, regions, roomTexts } from "@wirelight/content";
import { type RoomDef, roomById, rooms, type SolutionStep } from "@wirelight/rooms";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "../engine/store";
import { isTyping } from "../play/keys";
import { openMemory } from "../play/Memory";
import { goToRoom } from "../play/RoomHud";
import { useProgress } from "../progress/progress";

// Developer tool (not part of the game): jump to any room, read everything about it, and watch it
// play itself. Open with Shift+D in dev builds, or with ?dev=1 on any build. Auto-play runs the room's
// own solution (or a detector's test script) step by step through the real engine, walking into each
// machine's room so the player's view follows; nothing is faked.

const SPEEDS = [1, 4, 16];

/** Waits until network time has moved on by `ms` (the presentation clock decides how fast). */
async function waitNetwork(ms: number, stop: () => boolean): Promise<void> {
  const start = useSession.getState().status?.now ?? 0;
  while (!stop() && (useSession.getState().status?.now ?? 0) < start + ms) await new Promise((r) => setTimeout(r, 50));
}

/** Runs script steps as a player would: go to the machine's room, then click or type the line. */
async function runSteps(room: RoomDef, steps: SolutionStep[], log: (s: string) => void, stop: () => boolean) {
  const s = useSession.getState;
  for (const step of steps) {
    if (stop()) return;
    if (s().here !== step.device) {
      // Walk there if the player could; otherwise act from where they are (the script's own rule).
      const enterable = room.access[step.device]?.state === "enterable";
      if (enterable) s().goTo(step.device);
    }
    if ("touch" in step) {
      log(`${step.device}: touch ${step.touch}`);
      await s().touch(step.device, step.touch);
    } else {
      log(`${step.device}: ${step.line}`);
      await s().exec(step.device, step.line, step.source === "click" ? "click" : "typed");
    }
    await waitNetwork(step.waitMs ?? 5000, stop);
  }
  log("done");
}

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
        <summary>Notes, memories, Guardian, cards</summary>
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
        {(t.guardian ?? []).map((g) => (
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
      <button type="button" className="dev-toggle" onClick={() => setOpen(true)}>
        Dev
      </button>
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
    <aside className="dev-panel" aria-label="Developer panel">
      <header>
        <strong>Dev</strong>
        <button type="button" onClick={() => setOpen(false)}>
          Close
        </button>
      </header>
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
  );
}
