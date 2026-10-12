import { Canvas } from "@react-three/fiber";
import { landing } from "@wirelight/content";
import { useEffect } from "react";
import { backendFromUrl, nodeRendererFactory } from "../render/backend";
import { QUALITY, QualityContext } from "../render/quality";
import { GateScene } from "./GateScene";

// The landing page (ONB-01..04, 0010, 0044): every visit starts here. The 3D gate scene fills the
// screen; over it, on the left, the name, what Wirelight is, and the way in. Below the fold, how it
// works and what you'll learn. All text is HTML (crisp at every tier) from packages/content.

type Props = {
  /** The main button: "Explore the dungeon", or "Play <room>" for a link to a room (0044). */
  main: string;
  onStart: (skipIntro: boolean) => void;
};

export function LandingPage({ main, onStart }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) onStart(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStart]);

  return (
    <div className="landing">
      <div className="landing-scene" aria-hidden="true">
        <QualityContext.Provider value={QUALITY.high}>
          <Canvas gl={nodeRendererFactory(backendFromUrl() === "webgl2" ? "webgl2" : "webgpu")}>
            <GateScene />
          </Canvas>
        </QualityContext.Provider>
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
