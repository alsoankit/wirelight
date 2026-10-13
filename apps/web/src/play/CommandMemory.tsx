import { fill, type CommandMemory as Memory, voice } from "@wirelight/content";
import { useState } from "react";

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
            <dd>{m.meaning}</dd>
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
  const steps = [
    <div key="roles">
      <h3>{voice.commandMemory.roles}</h3>
      <p>{memory.intro}</p>
      <ol className="cmd-words">
        {memory.anatomy.map((w) => (
          <li key={w.word}>
            <code>{w.word}</code> <em>({w.role})</em> — {w.meaning}
          </li>
        ))}
      </ol>
    </div>,
    <div key="forms">
      <h3>{voice.commandMemory.forms}</h3>
      <ul className="cmd-words">
        {memory.forms.map((f) => (
          <li key={f.line}>
            <code>{f.line}</code> — {f.meaning}
          </li>
        ))}
      </ul>
    </div>,
    <div key="output">
      <h3>{voice.commandMemory.output}</h3>
      <Marked text={memory.output.text} marks={memory.output.marks} />
      <p className="panel-note">{memory.output.dimmed}</p>
    </div>,
    <div key="action">
      <p className="cmd-action">
        {memory.action.say} <code>{memory.action.type}</code>
      </p>
    </div>,
  ];
  const last = step === steps.length - 1;
  return (
    <section className="cmd-memory" aria-label={fill(voice.commandMemory.title, { command: memory.command })}>
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
