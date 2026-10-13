import { landing, roomTexts } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { lazy, StrictMode, Suspense, useCallback, useState } from "react";
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

function linkedRoom(): string | undefined {
  const match = window.location.pathname.match(/^\/play\/(.+)$/);
  const id = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  return id && roomById(id) ? id : undefined;
}

export function App() {
  const [stage, setStage] = useState<"landing" | "descending" | "fading" | "game">(() =>
    import.meta.env.DEV && window.location.pathname.startsWith("/play") ? "game" : "landing",
  );
  const [quick, setQuick] = useState(false);
  const room = linkedRoom();
  // Returning players continue where they left off (ONB-20); a link to a room plays that room (0044).
  const current = useProgress((s) => s.current);
  const titleOf = (id: string | null | undefined) => (id ? roomTexts[roomById(id)?.content ?? ""]?.title : undefined);
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
