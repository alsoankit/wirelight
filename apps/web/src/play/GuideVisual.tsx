import type { GuideVisual as Visual } from "@wirelight/content";
import { useEffect, useState } from "react";

// A Field Guide topic's picture (UI-13): drawn from the game's own scenes (captured by
// tools/shots/guide.mjs into public/guide/), with numbered callouts on the real objects and a list to
// match; hovering a line lights its callout. Pictures that are text (the console, a plate, a note)
// are drawn here in HTML.

type Captured = Record<string, { width: number; height: number; marks: { target: string; x: number; y: number }[] }>;

let captured: Promise<Captured> | null = null;
function loadMarks(): Promise<Captured> {
  captured ??= fetch("/guide/marks.json")
    .then((r) => (r.ok ? (r.json() as Promise<Captured>) : {}))
    .catch(() => ({}));
  return captured;
}

/** The captured picture for a kind of visual. */
const SHOT: Partial<Record<Visual["kind"], string>> = { room: "room", glass: "glass", controls: "controls" };

function Picture({ shot, labels }: { shot: string; labels: { target: string; label: string }[] }) {
  const [marks, setMarks] = useState<Captured | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    void loadMarks().then(setMarks);
  }, []);
  const info = marks?.[shot];
  // Only callouts whose object is really in the picture, numbered in the topic's order.
  const shown = labels.map((l) => ({ ...l, at: info?.marks.find((m) => m.target === l.target) })).filter((l) => l.at);
  return (
    <figure className="guide-picture">
      <div className="guide-frame">
        <img src={`/guide/${shot}.jpg`} alt="" width={info?.width} height={info?.height} loading="lazy" />
        {info &&
          shown.map((l, i) => (
            <span
              key={l.target}
              className="guide-callout"
              data-on={hover === l.target ? "yes" : "no"}
              style={{
                left: `${((l.at?.x ?? 0) / info.width) * 100}%`,
                top: `${((l.at?.y ?? 0) / info.height) * 100}%`,
              }}
            >
              {i + 1}
            </span>
          ))}
      </div>
      {shown.length > 0 && (
        <ol className="guide-legend">
          {shown.map((l) => (
            <li key={l.target} onMouseEnter={() => setHover(l.target)} onMouseLeave={() => setHover(null)}>
              {l.label}
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}

export function GuideVisual({ visual }: { visual: Visual }) {
  const shot = SHOT[visual.kind];
  if (shot && "marks" in visual) return <Picture shot={shot} labels={visual.marks} />;
  if (visual.kind === "ruins")
    return (
      <figure className="guide-picture guide-pair">
        <div>
          <img src="/guide/ruins-before.jpg" alt="" loading="lazy" />
          <figcaption>{visual.before}</figcaption>
        </div>
        <div>
          <img src="/guide/ruins-after.jpg" alt="" loading="lazy" />
          <figcaption>{visual.after}</figcaption>
        </div>
      </figure>
    );
  if (visual.kind === "console")
    return (
      <figure className="guide-picture">
        <pre className="cmd-output">
          {visual.lines.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lines in order
            <div key={i} className={`tone-${l.tone}`}>
              {l.tone === "prompt" ? "root@observatory:~# " : l.tone === "echo" ? `↳ ${l.text}` : l.text}
            </div>
          ))}
        </pre>
        <figcaption>{visual.caption}</figcaption>
      </figure>
    );
  if (visual.kind === "plate")
    return (
      <figure className="guide-picture guide-plates">
        <span className="plate" data-link="up">
          <span className="plate-light">◆</span> <span className="plate-name">eth0</span>{" "}
          <span className="plate-mac">{visual.address}</span>
        </span>
        <span className="panel-note">{visual.on}</span>
        <span className="plate" data-link="down">
          <span className="plate-light">◇</span> <span className="plate-name">eth0</span>{" "}
          <span className="plate-mac">{visual.address}</span>
        </span>
        <span className="panel-note">{visual.off}</span>
      </figure>
    );
  if (visual.kind === "notes")
    return (
      <figure className="guide-picture">
        <p className="note">{visual.note}</p>
        <figcaption>{visual.caption}</figcaption>
      </figure>
    );
  if (visual.kind === "lights")
    return (
      <figure className="guide-picture">
        <ul className="guide-legend lights">
          {visual.items.map((item) => (
            <li key={item.target} data-light={item.target}>
              {item.label}
            </li>
          ))}
        </ul>
      </figure>
    );
  return null;
}
