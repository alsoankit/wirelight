import { pathChoice, roomTexts, tour } from "@wirelight/content";
import type { Path } from "@wirelight/rooms";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useProgress } from "../progress/progress";
import { useDialogFocus } from "./focus";
import { isTyping } from "./keys";
import { Lines } from "./Lines";

// The first visit (gameplay/onboarding.md): the gift of sight (ONB-08..10), choosing a path
// (ONB-11..13), then the tour (ONB-14..18), each once ever (saved, ONB-22). Then the Prologue.

function SightGift() {
  const giveSight = useProgress((s) => s.giveSight);
  const lines = (roomTexts["p.first-message"]?.voice ?? [])
    .filter((v) => v.id.startsWith("P-GIFT"))
    .map((v) => ({ ...v, speaker: v.speaker.charAt(0).toUpperCase() + v.speaker.slice(1) }));
  return <Lines lines={lines} onDone={giveSight} />;
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
        (target === "plate" ? document.querySelector(".plate") : null);
      setBox(el ? el.getBoundingClientRect() : null);
    };
    find();
    const id = setInterval(find, 400); // the room's HTML labels move with the camera's drift
    return () => clearInterval(id);
  }, [target]);
  return box;
}

function Tour() {
  const finishTour = useProgress((s) => s.finishTour);
  const [i, setI] = useState(0);
  const card = tour.cards[i];
  const box = useTarget(card?.target);
  const last = i === tour.cards.length - 1;
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref, { trap: true, step: i });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      // Enter on one of the card's buttons is that button's own click.
      if (e.key === "Enter" && e.target instanceof HTMLElement && e.target.closest("button")) return;
      if (e.key === "ArrowRight" || e.key === "Enter") last ? finishTour() : setI(i + 1);
      if (e.key === "ArrowLeft" && i > 0) setI(i - 1);
      if (e.key === "Escape") finishTour();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, last, finishTour]);
  if (!card) return null;
  // The card sits beside its target, kept on screen.
  const left = box ? Math.min(Math.max(16, box.left), window.innerWidth - 376) : window.innerWidth / 2 - 180;
  const top = box ? (box.bottom + 230 < window.innerHeight ? box.bottom + 18 : Math.max(16, box.top - 250)) : 160;
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {box && (
        <div
          className="tour-ring"
          style={{ left: box.left - 8, top: box.top - 8, width: box.width + 16, height: box.height + 16 }}
        />
      )}
      <section ref={ref} className="tour-card" style={{ left, top }}>
        <h2 id="tour-title">{card.title}</h2>
        <p>{card.body.replace(/\[\[(.+?)\]\]/g, "$1")}</p>
        <div className="panel-actions">
          {i > 0 && (
            <button type="button" className="quiet" onClick={() => setI(i - 1)}>
              {tour.back}
            </button>
          )}
          <button type="button" data-autofocus="" onClick={() => (last ? finishTour() : setI(i + 1))}>
            {last ? tour.enter : tour.next}
          </button>
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
    if (skipTour && sightGiven && path && !tourDone) finishTour();
  }, [skipTour, sightGiven, path, tourDone, finishTour]);
  if (!sightGiven) return <SightGift />;
  if (!path) return <PathChoice />;
  if (!tourDone && !skipTour) return <Tour />;
  return null;
}
