import { commandMemories, fill, type CommandMemory as Memory, voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useEffect, useRef, useState } from "react";
import { useSession } from "../engine/store";
import { useProgress } from "../progress/progress";
import { useDialogFocus } from "./focus";
import { RichText } from "./RichText";

// A command memory (0041): how a command is built word by word, its common forms, how to read its
// output, then one action. Shown over the dimmed room; the Knight's voice later (0047).

/** The output, with each marked piece highlighted, and what each one means listed below it. */
function Marked({ text, marks }: { text: string; marks: Memory["output"]["marks"] }) {
  // Longest first, so "link/ether 02:…" wins over a shorter piece inside it; whole words only for short ones.
  const pieces = [...marks].sort((a, b) => b.match.length - a.match.length);
  const pattern = new RegExp(
    pieces.map((m) => (m.match.length <= 4 ? `\\b${escapeRegExp(m.match)}\\b` : escapeRegExp(m.match))).join("|"),
    "g",
  );
  return (
    <>
      <pre className="cmd-output">
        {text.split("\n").map((line, i) => {
          const parts: (string | { mark: string })[] = [];
          let last = 0;
          for (const m of line.matchAll(pattern)) {
            parts.push(line.slice(last, m.index), { mark: m[0] });
            last = (m.index ?? 0) + m[0].length;
          }
          parts.push(line.slice(last));
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: output lines are in order
            <div key={i}>
              {parts.map((p, j) =>
                typeof p === "string" ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: pieces of one line, in order
                  <span key={j} className="dimmed">
                    {p}
                  </span>
                ) : (
                  // biome-ignore lint/suspicious/noArrayIndexKey: pieces of one line, in order
                  <mark key={j}>{p.mark}</mark>
                ),
              )}
              {line === "" && " "}
            </div>
          );
        })}
      </pre>
      <dl className="cmd-legend">
        {marks.map((m) => (
          <div key={m.match}>
            <dt>
              <code>{m.match}</code>
            </dt>
            <dd>
              <RichText text={m.meaning} />
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function CommandMemory({ memory, onDone }: { memory: Memory; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref, { trap: true, step });
  const steps = [
    <div key="roles">
      <h3>{voice.commandMemory.roles}</h3>
      <p>
        <RichText text={memory.intro} />
      </p>
      <ol className="cmd-words">
        {memory.anatomy.map((w) => (
          <li key={w.word}>
            <code>{w.word}</code> <em>({w.role})</em> — <RichText text={w.meaning} />
          </li>
        ))}
      </ol>
    </div>,
    <div key="forms">
      <h3>{voice.commandMemory.forms}</h3>
      <ul className="cmd-words">
        {memory.forms.map((f) => (
          <li key={f.line}>
            <code>{f.line}</code> — <RichText text={f.meaning} />
          </li>
        ))}
      </ul>
    </div>,
    <div key="output">
      <h3>{voice.commandMemory.output}</h3>
      <Marked text={memory.output.text} marks={memory.output.marks} />
      <p className="panel-note">
        <RichText text={memory.output.dimmed} />
      </p>
    </div>,
    <div key="action">
      <p className="cmd-action">
        <RichText text={memory.action.say} /> <code>{memory.action.type}</code>
      </p>
    </div>,
  ];
  const last = step === steps.length - 1;
  return (
    <section
      ref={ref}
      className="cmd-memory"
      role="dialog"
      aria-modal="true"
      aria-label={fill(voice.commandMemory.title, { command: memory.command })}
    >
      <h2>{fill(voice.commandMemory.title, { command: memory.command })}</h2>
      {steps[step]}
      <div className="panel-actions">
        <button type="button" onClick={() => (last ? onDone() : setStep(step + 1))}>
          {last ? voice.commandMemory.done : voice.commandMemory.next}
        </button>
      </div>
    </section>
  );
}

/** How long a room waits, once nothing else is speaking, before its command memory plays. */
const SETTLE_MS = 800;

/**
 * A room's command memory (0041; CMD-02 … CMD-11, the floor specs: "plays first"): once per player,
 * when the room has settled (no spoken lines or other dialog showing), before the command is needed.
 * CMD-01 is the gift's (Gift.tsx).
 */
export function RoomCommandMemory() {
  const roomId = useSession((s) => s.roomId);
  const room = roomId ? roomById(roomId) : undefined;
  const voiceGiven = useSession((s) => s.voiceGiven);
  const won = useSession((s) => s.status?.won ?? false);
  const seen = useProgress((s) => s.memoriesSeen);
  const seeMemory = useProgress((s) => s.seeMemory);
  const id = room?.commandMemory;
  const due = !!id && id !== "CMD-01" && voiceGiven && !won && !seen.includes(id);
  const [showing, setShowing] = useState<string | null>(null);
  useEffect(() => {
    setShowing(null);
    if (!due || !id) return;
    let quietSince = performance.now();
    const timer = setInterval(() => {
      // Never over a spoken line, a memory or another dialog.
      // Once the player has typed in this room it's too late to come first: it never interrupts typing
      // (it stays in the Menu's command book).
      if (useSession.getState().events.some((e) => e.kind === "cmd.exec" && e.source === "typed")) {
        clearInterval(timer);
        return;
      }
      if (document.querySelector(".lines, .cmd-memory, [role='dialog']")) quietSince = performance.now();
      else if (performance.now() - quietSince > SETTLE_MS) {
        clearInterval(timer);
        setShowing(id);
      }
    }, 300);
    return () => clearInterval(timer);
  }, [due, id]);
  const memory = showing ? commandMemories[showing] : undefined;
  if (!memory || !showing) return null;
  return (
    <CommandMemory
      memory={memory}
      onDone={() => {
        seeMemory(showing);
        setShowing(null);
      }}
    />
  );
}
