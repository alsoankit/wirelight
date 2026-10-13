import { landing } from "@wirelight/content/intro";
import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import type { Descent } from "./GateScene";

// The landing's text comes from content's small `intro` entry (not every room's text), and the 3D
// gate loads after it, in its own chunk with three.js and the renderer: the text shows first.
const GateCanvas = lazy(() => import("./GateCanvas").then((m) => ({ default: m.GateCanvas })));

// The landing page (ONB-01..04, 0010, 0044): every visit starts here. The 3D gate scene fills the
// screen; over it, on the left, the name, what Wirelight is, and the way in. Below the fold, how it
// works and what you'll learn. All text is HTML (crisp at every tier) from packages/content.

type Props = {
  /** The main button: "Explore the dungeon", or "Play <room>" for a link to a room (0044). */
  main: string;
  onStart: (skipIntro: boolean) => void;
  /** Set once the player has gone in: the descent plays (quickly after Skip intro), then `onArrived`. */
  descending: { quick: boolean } | null;
  onArrived: () => void;
  /** Reduced motion: no camera move, the page just fades out. */
  fading?: boolean;
};

export function LandingPage({ main, onStart, descending, onArrived, fading = false }: Props) {
  // ONB-06: a click or key during the descent speeds it up.
  const hurried = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (descending) hurried.current = true;
      else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) onStart(false);
    };
    const onClick = () => {
      if (descending) hurried.current = true;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onClick);
    };
  }, [onStart, descending]);

  const descent = useMemo<Descent | null>(
    () => (descending ? { quick: descending.quick, faster: () => hurried.current, onDone: onArrived } : null),
    [descending, onArrived],
  );

  return (
    <div className="landing" data-descending={descending ? "yes" : "no"} data-fading={fading ? "yes" : "no"}>
      <div className="landing-scene" aria-hidden="true">
        <Suspense fallback={null}>
          <GateCanvas descent={descent} />
        </Suspense>
      </div>

      <section className="landing-hero">
        <div className="landing-intro">
          <h1 className="landing-name">{landing.name}</h1>
          <p className="landing-headline">{landing.headline}</p>
          <ul className="landing-facts">
            {landing.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <div className="landing-actions">
            <button type="button" className="landing-main" onClick={() => onStart(false)}>
              {main}
            </button>
            <button type="button" className="landing-skip" onClick={() => onStart(true)}>
              {landing.skip}
            </button>
          </div>
          <p className="landing-enter">
            <kbd>{landing.enter}</kbd> {landing.enterHint}
          </p>
        </div>
        <a className="landing-more" href="#how">
          {landing.more} ↓
        </a>
      </section>

      <section className="landing-section" id="how">
        <h2>{landing.how.title}</h2>
        <ol className="landing-steps">
          {landing.how.steps.map((s) => (
            <li key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
        <h2>{landing.learn.title}</h2>
        <p className="landing-lead">{landing.learn.intro}</p>
        <ul className="landing-regions">
          {landing.learn.regions.map((r) => (
            <li key={r.name}>
              <h3>{r.name}</h3>
              <p>{r.body}</p>
            </li>
          ))}
        </ul>
        <p className="landing-closing">{landing.closing}</p>
        <button type="button" className="landing-main" onClick={() => onStart(false)}>
          {main}
        </button>
      </section>
    </div>
  );
}
