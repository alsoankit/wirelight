import { boot } from "@wirelight/content/intro";
import { useEffect, useState } from "react";
import { reducedMotion } from "../progress/motion";

// The opening (decision 0114): the robot switching back on. A dark screen, a few system lines one after
// another, then the game. About five seconds; any key or click goes straight in. Shown once, on a first
// visit (returning players go straight in). No 3D: the room loads behind it.

const FIRST_MS = 500;
const STEP_MS = 850;
const HOLD_MS = 1200;

export function BootScreen({ onDone }: { onDone: () => void }) {
  const reduced = reducedMotion();
  const [shown, setShown] = useState(reduced ? boot.lines.length : 0);

  useEffect(() => {
    const done = shown >= boot.lines.length;
    const timer = setTimeout(
      done ? onDone : () => setShown((n) => n + 1),
      done ? HOLD_MS : shown === 0 ? FIRST_MS : STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [shown, onDone]);

  useEffect(() => {
    window.addEventListener("keydown", onDone);
    window.addEventListener("pointerdown", onDone);
    return () => {
      window.removeEventListener("keydown", onDone);
      window.removeEventListener("pointerdown", onDone);
    };
  }, [onDone]);

  return (
    <div className="boot" role="status" aria-live="polite" aria-label={boot.title}>
      <div className="boot-lines">
        <p className="boot-title">{boot.title}</p>
        {boot.lines.slice(0, shown).map((line) => (
          <p key={line.label} className="boot-line">
            <span className="boot-label">{line.label}</span>
            <span className="boot-dots" />
            <span className={`boot-state ${line.tone}`}>{line.state}</span>
          </p>
        ))}
      </div>
      <p className="boot-skip">{boot.skip}</p>
    </div>
  );
}
