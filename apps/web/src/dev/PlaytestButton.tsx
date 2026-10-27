import { fill, voice } from "@wirelight/content";
import { useEffect, useState } from "react";
import { downloadPlaytest, installPlaytest, playtestOn, roomCount, usePlaytest } from "./playtest";

// The playtest log's button (dev/playtest.ts): bottom-left, small, only with `?playtest=1`.

export function PlaytestButton() {
  const [on] = useState(playtestOn);
  const log = usePlaytest((s) => s.log);
  useEffect(() => (on ? installPlaytest() : undefined), [on]);
  if (!on || !log) return null;
  const n = roomCount(log);
  const t = voice.playtest;
  return (
    <button
      type="button"
      title={t.exportTitle}
      onClick={() => downloadPlaytest(log)}
      style={{
        position: "fixed",
        left: 8,
        bottom: 8,
        zIndex: 50,
        padding: "3px 8px",
        font: "12px/1.3 system-ui, sans-serif",
        color: "#f3ead8",
        background: "rgba(20, 16, 12, 0.75)",
        border: "1px solid rgba(243, 234, 216, 0.35)",
        borderRadius: 4,
        cursor: "pointer",
      }}
    >
      {n === 1 ? t.one : fill(t.many, { n: String(n) })} · {t.export}
    </button>
  );
}
