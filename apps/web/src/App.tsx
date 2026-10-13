import { landing, roomTexts } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { lazy, Suspense, useCallback, useState } from "react";
import { LandingPage } from "./landing/LandingPage";

// Routes (tech/architecture.md): `/` the landing · `/play` the game · `/play/<room>` a link to a room.
// Every visit opens the landing first (0044); a link to a room makes its main button "Play <room>".
// Dev only: opening /play directly goes straight into the game (screenshot tools, quick checks).
// The game's code (renderer scene, engine worker) loads only when the player goes in.

const loadPlay = () => import("./play/PlayPage");
const PlayPage = lazy(() => loadPlay().then((m) => ({ default: m.PlayPage })));

// ONB-06: with reduced motion the descent is a short fade instead.
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
  const title = room ? roomTexts[roomById(room)?.content ?? ""]?.title : undefined;
  const main = title ? `${landing.playPrefix} ${title}` : landing.explore;

  const arrive = useCallback(() => {
    if (!window.location.pathname.startsWith("/play")) window.history.pushState(null, "", "/play");
    setStage("game");
  }, []);

  // Going in: the descent plays (ONB-05; quick after Skip intro, ONB-07) while the game's code loads.
  // With reduced motion, a short fade instead (ONB-06). (The tour, which Skip intro also skips, comes
  // in a later step.)
  const start = useCallback(
    (skipIntro: boolean) => {
      void loadPlay().then((m) => m.preloadRoom());
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setStage("fading");
        setTimeout(arrive, REDUCED_FADE_MS);
        return;
      }
      setQuick(skipIntro);
      setStage("descending");
    },
    [arrive],
  );

  if (stage !== "game")
    return (
      <LandingPage
        main={main}
        onStart={start}
        descending={stage === "descending" ? { quick } : null}
        fading={stage === "fading"}
        onArrived={arrive}
      />
    );
  return (
    <Suspense fallback={null}>
      <PlayPage arriving skipIntro={quick} />
    </Suspense>
  );
}
