import { pathChoice, roomTexts, sightGift, tour } from "@wirelight/content";
import type { Path } from "@wirelight/rooms";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "../engine/store";
import { useReducedMotion } from "../progress/motion";
import { useProgress } from "../progress/progress";
import { useDialogFocus } from "./focus";
import { Lines } from "./Lines";
import { RichText } from "./RichText";

// The first visit (gameplay/onboarding.md): the gift of sight (ONB-08..10), choosing a path
// (ONB-11..13), then the tour (ONB-14..18), each once ever (saved, ONB-22). Then the Prologue.

/** How long the cyan ripple of the sight takes to spread across the world (ONB-08). */
const RIPPLE_MS = 1600;

/**
 * The gift of sight (ONB-08..10): the moss spirit's light over the dimmed room, its lines; the player
 * accepts (the button, Enter or Esc), a ripple of cyan spreads across the world with its last line.
 * The room's own controls stay hidden behind it until then.
 */
function SightGift() {
  const giveSight = useProgress((s) => s.giveSight);
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<"asking" | "given">("asking");
  const [ripple, setRipple] = useState(false);
  const all = (roomTexts["p.first-message"]?.voice ?? [])
    .filter((v) => v.id.startsWith("P-GIFT"))
    .map((v) => ({ ...v, speaker: v.speaker.charAt(0).toUpperCase() + v.speaker.slice(1) }));
  // Everything before the last line leads up to the gift; the last line follows it.
  const before = all.slice(0, -1);
  const after = all.slice(-1);
  useEffect(() => {
    if (!ripple) return;
    const id = setTimeout(() => setRipple(false), reduced ? 300 : RIPPLE_MS);
    return () => clearTimeout(id);
  }, [ripple, reduced]);
  return (
    <div className="gift-stage" data-phase={phase}>
      <div className="moss-spirit" aria-hidden="true">
        <span className="moss-light" />
      </div>
      {ripple && <div className="sight-ripple" aria-hidden="true" />}
      {phase === "asking" && (
        <Lines
          key="asking"
          lines={before}
          doneLabel={sightGift.accept}
          onDone={() => {
            setPhase("given");
            setRipple(true);
          }}
        />
      )}
      {phase === "given" && <Lines key="given" lines={after} onDone={giveSight} />}
    </div>
  );
}

function PathChoice() {
  const choosePath = useProgress((s) => s.choosePath);
  const ask = roomTexts["p.first-message"]?.voice?.find((v) => v.id === "P-PATH-01");
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref, { trap: true });
  return (
    <section ref={ref} className="path-choice" role="dialog" aria-modal="true" aria-labelledby="path-ask">
      <div className="lines-speaker">{ask?.speaker}</div>
      <p className="lines-text" id="path-ask">
        {ask?.text}
      </p>
      <div className="path-options">
        {pathChoice.options.map((o) => (
          <button
            key={o.id}
            type="button"
            data-suggested={o.id === "new" ? "yes" : "no"}
            onClick={() => choosePath(o.id as Path)}
            // The one choice on screen: Enter picks the suggestion.
            data-autofocus={o.id === "new" ? "" : undefined}
          >
            <strong>{o.title}</strong>
            <span>{o.line}</span>
            {o.id === "new" && <em>{pathChoice.suggested}</em>}
          </button>
        ))}
      </div>
      <p className="panel-note">{pathChoice.note}</p>
    </section>
  );
}

/** Where a tour card's target is on screen (an element marked `data-tour`), if it's there. */
function useTarget(target: string | undefined) {
  const [box, setBox] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!target) return setBox(null);
    const find = () => {
      const el =
        document.querySelector(`[data-tour="${target}"]`) ??
        (target === "plate" ? document.querySelector(".plate") : null) ??
        // The Prologue's doorway is still closed (no way through yet): its arch's label is the doorway.
        (target === "door" ? document.querySelector('.world-chip[data-tone="sealed"]') : null);
      setBox(el ? el.getBoundingClientRect() : null);
    };
    find();
    const id = setInterval(find, 400); // the room's HTML labels move with the camera's drift
    return () => clearInterval(id);
  }, [target]);
  return box;
}

/** Keys the tour keeps for itself: the room, the menu and the Map wait until it's over (ONB-14). */
const TOUR_KEYS = new Set(["Tab", "Enter", " ", "ArrowLeft", "ArrowRight", "Escape"]);

/** After the tour, focus goes to the room's first thing to do (the Send button, ONB-19). */
function focusSend() {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(".send")?.focus({ preventScroll: true }));
}

function Tour() {
  const finish = useProgress((s) => s.finishTour);
  const [i, setI] = useState(0);
  const card = tour.cards[i];
  const box = useTarget(card?.target);
  const last = i === tour.cards.length - 1;
  const ref = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ w: 360, h: 230 });
  useDialogFocus(ref, { trap: true, step: i });
  const finishTour = () => {
    finish();
    focusSend();
  };
  const fullGuide = () => {
    finish();
    useSession.getState().openPanel({ kind: "menu", tab: "guide" });
  };
  // The card's real size (it grows with the text size setting), so it can be kept on screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new card is a new size
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setSize({ w: r.width, h: r.height });
  }, [i]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: finishTour changes every render; the handler only needs the latest
  useEffect(() => {
    // First (capture), so nothing under the tour hears a key: no M, G, Space or door numbers.
    const onKey = (e: KeyboardEvent) => {
      if (!TOUR_KEYS.has(e.key)) {
        e.stopPropagation();
        return;
      }
      if (e.key === "Tab" || e.key === " ") return; // focus moves inside the card; Space presses a button
      e.stopPropagation();
      // Enter on one of the card's buttons is that button's own click.
      if (e.key === "Enter" && e.target instanceof HTMLElement && e.target.closest("button")) return;
      e.preventDefault();
      if (e.key === "ArrowRight" || e.key === "Enter") last ? finishTour() : setI(i + 1);
      if (e.key === "ArrowLeft" && i > 0) setI(i - 1);
      if (e.key === "Escape") finishTour();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [i, last]);
  if (!card) return null;
  // The card sits beside its target, kept wholly on screen (16px from every edge).
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.min(Math.max(16, x), vw - size.w - 16);
  const clampY = (y: number) => Math.min(Math.max(16, y), vh - size.h - 16);
  const left = box ? clampX(box.left + box.width / 2 - size.w / 2) : (vw - size.w) / 2;
  const below = box ? box.bottom + 18 : 0;
  const top = box ? clampY(below + size.h + 16 < vh ? below : box.top - size.h - 18) : (vh - size.h) / 2;
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title" data-ringed={box ? "yes" : "no"}>
      {box && (
        <div
          className="tour-ring"
          style={{ left: box.left - 8, top: box.top - 8, width: box.width + 16, height: box.height + 16 }}
        />
      )}
      <section ref={ref} className="tour-card" style={{ left, top }}>
        <div className="panel-note">
          {i + 1} / {tour.cards.length}
        </div>
        <h2 id="tour-title">{card.title}</h2>
        <p>
          <RichText text={card.body} />
        </p>
        <div className="panel-actions">
          {i > 0 && (
            <button type="button" className="quiet" onClick={() => setI(i - 1)}>
              {tour.back}
            </button>
          )}
          <button type="button" data-autofocus="" onClick={() => (last ? finishTour() : setI(i + 1))}>
            {last ? tour.enter : tour.next}
          </button>
          {last && (
            <button type="button" className="quiet" onClick={fullGuide}>
              {tour.fullGuide}
            </button>
          )}
          <button type="button" className="quiet" onClick={finishTour}>
            {last ? tour.dontShow : tour.skip}
          </button>
        </div>
      </section>
    </div>
  );
}

/** The first visit's steps, in order; nothing once they've all been seen. */
export function Onboarding({ skipTour = false }: { skipTour?: boolean }) {
  const sightGiven = useProgress((s) => s.sightGiven);
  const path = useProgress((s) => s.path);
  const tourDone = useProgress((s) => s.tourDone);
  const finishTour = useProgress((s) => s.finishTour);
  useEffect(() => {
    if (skipTour && sightGiven && path && !tourDone) {
      finishTour();
      focusSend();
    }
  }, [skipTour, sightGiven, path, tourDone, finishTour]);
  if (!sightGiven) return <SightGift />;
  if (!path) return <PathChoice />;
  if (!tourDone && !skipTour) return <Tour />;
  return null;
}
