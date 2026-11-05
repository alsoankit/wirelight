import { voice } from "@wirelight/content";
import { useEffect, useRef, useState } from "react";
import { speak, stopVoice } from "../audio/audio";
import { useSession } from "../engine/store";
import { useDialogFocus } from "./focus";
import { isTyping } from "./keys";
import { RichText } from "./RichText";

// Spoken lines: one at a time, always written out with the speaker
// (UI-20), whatever the voice setting. Enter or a click goes on; Esc closes them all (the last one's
// `onDone` runs either way). Audio plays from slots later (0047); a missing file plays nothing.

/** A spoken line. `title`: what it's about, shown under the speaker (a tip's topic). */
export type Line = { id: string; speaker: string; text: string; title?: string };

export function Lines({
  lines,
  onDone,
  doneLabel,
}: {
  lines: Line[];
  onDone: () => void;
  /** The last button's word, when it isn't "Close" (the gift of sight: "Accept the sight"). */
  doneLabel?: string;
}) {
  const [i, setI] = useState(0);
  const line = lines[i];
  const ref = useRef<HTMLElement>(null);
  // Never over the open console (UI-02): a line may ask for something typed there (F2-MEM-04).
  const raised = useSession((s) => s.consoleOpen && s.voiceGiven);
  // Its button takes focus when the room has it, so Enter goes on (UI-18); never from someone typing.
  useDialogFocus(ref, { polite: true, step: i });
  const next = () => (i + 1 < lines.length ? setI(i + 1) : onDone());
  const done = useRef(onDone);
  done.current = onDone;
  // biome-ignore lint/correctness/useExhaustiveDependencies: next changes every render; the key handler only needs the latest
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.key === "Escape") {
        // Only the topmost thing closes: a dialog over the lines (the menu, a memory) takes its own Esc.
        if (document.querySelector(".menu, .map.memory, .cmd-memory")) return;
        e.preventDefault();
        done.current();
        return;
      }
      // Enter on another control (a plate, a door) is for that control.
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t?.closest("button, a, [role='button']") && !t.closest(".lines")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i]);
  // Each line plays from its audio slot (its ID), if there's a file and Voices is On (0047).
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new line is a new index
  useEffect(() => {
    if (line) void speak(line.id);
    return () => stopVoice();
  }, [i]);
  if (!line) return null;
  const last = i + 1 >= lines.length;
  return (
    <section
      ref={ref}
      className="lines"
      data-raised={raised ? "yes" : "no"}
      aria-live="polite"
      aria-label={line.title ? `${line.speaker}: ${line.title}` : line.speaker}
      data-line={line.id}
    >
      <div className="lines-speaker">
        {line.speaker}
        {line.title && <span className="lines-title"> · {line.title}</span>}
      </div>
      <p className="lines-text">
        <RichText text={line.text} />
      </p>
      <button type="button" onClick={next}>
        {last ? (doneLabel ?? voice.lines.done) : voice.lines.next}
      </button>
    </section>
  );
}
