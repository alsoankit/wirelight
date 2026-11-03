import { landing } from "@wirelight/content/intro";
import { lazy, StrictMode, Suspense, useCallback, useEffect, useState } from "react";
import { BootScreen } from "./landing/BootScreen";
import { LandingPage } from "./landing/LandingPage";
import { useProgress } from "./progress/progress";

// Routes (tech/architecture.md): `/` the landing · `/play` the game · `/play/<room>` a link to a room.
// Every visit opens the landing first (0044); a link to a room makes its main button "Play <room>".
// Dev only: opening /play directly goes straight into the game (screenshot tools, quick checks).
// The game's code (renderer scene, engine worker) loads only when the player goes in.

const loadPlay = () => import("./play/PlayPage");
const PlayPage = lazy(() => loadPlay().then((m) => ({ default: m.PlayPage })));

// Going in (0114): the landing fades out; on a first visit the boot screen plays, then the game.
const FADE_MS = 350;

// The rooms and their titles (for the main button) load just after the landing's first paint.
const loadTitles = () => import("./landing/roomTitle");

export function App() {
  const [stage, setStage] = useState<"landing" | "fading" | "boot" | "game">(() =>
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
    // Options in the link (?tier=, ?backend=) come along into the game.
    if (!window.location.pathname.startsWith("/play"))
      window.history.pushState(null, "", `/play${window.location.search}`);
    setStage("game");
  }, []);

  // Going in (0114): a short fade, then the boot screen on a first visit (not after Skip intro), else the game.
  const start = useCallback(
    (skipIntro: boolean) => {
      void loadPlay().then((m) => m.preloadRoom());
      setQuick(skipIntro); // Skip intro also skips the tour (ONB-07)
      const first = !skipIntro && !useProgress.getState().sightGiven;
      setStage("fading");
      setTimeout(() => (first ? setStage("boot") : arrive()), FADE_MS);
    },
    [arrive],
  );

  if (stage === "boot")
    return (
      <StrictMode>
        <BootScreen onDone={arrive} />
      </StrictMode>
    );
  if (stage !== "game")
    return (
      <StrictMode>
        <LandingPage main={main} onStart={start} fading={stage === "fading"} />
      </StrictMode>
    );
  return (
    <Suspense fallback={null}>
      <PlayPage arriving skipIntro={quick} />
    </Suspense>
  );
}
