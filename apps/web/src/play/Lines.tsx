import { voice } from "@wirelight/content";
import { useEffect, useState } from "react";

// Spoken lines (the Guardian, the Knight): one at a time, always written out with the speaker
// (UI-20), whatever the voice setting. Enter or a click goes on; the last one calls `onDone`. Audio
// plays from slots later (0047); a missing file plays nothing.

export type Line = { id: string; speaker: string; text: string };

export function Lines({ lines, onDone }: { lines: Line[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const line = lines[i];
  const next = () => (i + 1 < lines.length ? setI(i + 1) : onDone());
  // biome-ignore lint/correctness/useExhaustiveDependencies: next changes every render; the key handler only needs the latest
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i]);
  if (!line) return null;
  return (
    <section className="lines" aria-live="polite" data-line={line.id}>
      <div className="lines-speaker">{line.speaker}</div>
      <p className="lines-text">{line.text}</p>
      <button type="button" onClick={next}>
        {i + 1 < lines.length ? voice.lines.next : voice.lines.done}
      </button>
    </section>
  );
}
