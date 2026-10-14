import { landing } from "@wirelight/content/intro";
import { lazy, StrictMode, Suspense, useCallback, useEffect, useState } from "react";
import { DESCENT_GRACE_MS, DESCENT_SECONDS } from "./landing/descentTiming";
import { LandingPage } from "./landing/LandingPage";
import { reducedMotion } from "./progress/motion";
import { useProgress } from "./progress/progress";

// Routes (tech/architecture.md): `/` the landing · `/play` the game · `/play/<room>` a link to a room.
// Every visit opens the landing first (0044); a link to a room makes its main button "Play <room>".
// Dev only: opening /play directly goes straight into the game (screenshot tools, quick checks).
// The game's code (renderer scene, engine worker) loads only when the player goes in.

const loadPlay = () => import("./play/PlayPage");
const PlayPage = lazy(() => loadPlay().then((m) => ({ default: m.PlayPage })));

// ONB-06: with reduced motion (Settings, or the system when Settings follows it) the descent is a short fade.
const REDUCED_FADE_MS = 350;

// The rooms and their titles (for the main button) load just after the landing's first paint.
const loadTitles = () => import("./landing/roomTitle");

export function App() {
  const [stage, setStage] = useState<"landing" | "descending" | "fading" | "game">(() =>
    import.meta.env.DEV && window.location.pathname.startsWith("/play") ? "game" : "landing",
  );
  const [quick, setQuick] = useState(false);
  const [titles, setTitles] = useState<Awaited<ReturnType<typeof loadTitles>> | null>(null);
  useEffect(() => {
    void loadTitles().then(setTitles);
  }, []);
  const room = titles?.linkedRoom(window.location.pathname);
  // Returning players continue where they left off (ONB-20); a link to a room plays that room (0044).
  const current = useProgress((s) => s.current);
  const titleOf = (id: string | null | undefined) => titles?.roomTitle(id);
  const main = room
    ? `${landing.playPrefix} ${titleOf(room)}`
    : titleOf(current)
      ? `${landing.continuePrefix}: ${titleOf(current)}`
      : landing.explore;

  const arrive = useCallback(() => {
    if (!window.location.pathname.startsWith("/play")) window.history.pushState(null, "", "/play");
    setStage("game");
  }, []);

  // Going in: the descent plays (ONB-05; quick after Skip intro, ONB-07) while the game's code loads.
  // With reduced motion, a short fade instead (ONB-06).
  const start = useCallback(
    (skipIntro: boolean) => {
      void loadPlay().then((m) => m.preloadRoom());
      setQuick(skipIntro); // Skip intro also skips the tour (ONB-07), with or without the fade
      if (reducedMotion()) {
        setStage("fading");
        setTimeout(arrive, REDUCED_FADE_MS);
        return;
      }
      setStage("descending");
      // The descent arrives by itself when its last frame is drawn; on a slow GPU (software WebGL)
      // frames come so rarely that it would crawl, so the game opens anyway after its planned length.
      const planned = (skipIntro ? DESCENT_SECONDS.quick : DESCENT_SECONDS.full) * 1000;
      setTimeout(arrive, planned + DESCENT_GRACE_MS);
    },
    [arrive],
  );

  if (stage !== "game")
    return (
      <StrictMode>
        <LandingPage
          main={main}
          onStart={start}
          descending={stage === "descending" ? { quick } : null}
          fading={stage === "fading"}
          onArrived={arrive}
        />
      </StrictMode>
    );
  return (
    <Suspense fallback={null}>
      <PlayPage arriving skipIntro={quick} />
    </Suspense>
  );
}
