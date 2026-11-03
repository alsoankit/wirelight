import { landing } from "@wirelight/content/intro";
import { useEffect } from "react";
import { onPhone } from "./phone";

// The landing page (ONB-01..04, 0010, 0044): every visit starts here. A still picture of a restored
// room fills the screen (decision 0114: no 3D here, so the page is light on any laptop); over it, on
// the left, the name, what Wirelight is, and the way in. Below the fold, how it works and what you'll
// learn. All text is HTML from packages/content.

type Props = {
  /** The main button: "Enter the palace", or "Play <room>" for a link to a room (0044). */
  main: string;
  onStart: (skipIntro: boolean) => void;
  /** Going in: the page fades out. */
  fading?: boolean;
};

const PHONE = onPhone();

/** On a phone: what Wirelight needs, in place of the buttons that go in. */
function PhoneNote() {
  return (
    <div className="landing-phone" role="note">
      <strong>{landing.phone.title}</strong>
      <p>{landing.phone.body}</p>
    </div>
  );
}

export function LandingPage({ main, onStart, fading = false }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !PHONE && !fading && !(e.target instanceof HTMLButtonElement)) onStart(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStart, fading]);

  return (
    <div className="landing" data-fading={fading ? "yes" : "no"} data-phone={PHONE ? "yes" : "no"}>
      <div className="landing-scene" aria-hidden="true" />

      <section className="landing-hero">
        <div className="landing-intro">
          <h1 className="landing-name">{landing.name}</h1>
          <p className="landing-headline">{landing.headline}</p>
          <ul className="landing-facts">
            {landing.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {PHONE ? (
            <PhoneNote />
          ) : (
            <>
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
            </>
          )}
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
        {PHONE ? (
          <PhoneNote />
        ) : (
          <button type="button" className="landing-main" onClick={() => onStart(false)}>
            {main}
          </button>
        )}
      </section>
    </div>
  );
}
