import { landing, roomTexts } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { lazy, Suspense, useCallback, useState } from "react";
import { LandingPage } from "./landing/LandingPage";

// Routes (tech/architecture.md): `/` the landing · `/play` the game · `/play/<room>` a link to a room.
// Every visit opens the landing first (0044); a link to a room makes its main button "Play <room>".
// Dev only: opening /play directly goes straight into the game (screenshot tools, quick checks).
// The game's code (renderer scene, engine worker) loads only when the player goes in.

const PlayPage = lazy(() => import("./play/PlayPage").then((m) => ({ default: m.PlayPage })));

function linkedRoom(): string | undefined {
  const match = window.location.pathname.match(/^\/play\/(.+)$/);
  const id = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  return id && roomById(id) ? id : undefined;
}

export function App() {
  const [inGame, setInGame] = useState(() => import.meta.env.DEV && window.location.pathname.startsWith("/play"));
  const room = linkedRoom();
  const title = room ? roomTexts[roomById(room)?.content ?? ""]?.title : undefined;
  const main = title ? `${landing.playPrefix} ${title}` : landing.explore;

  const start = useCallback(() => {
    // The descent (ONB-05) and the tour come in later steps; for now, straight in.
    if (!window.location.pathname.startsWith("/play")) window.history.pushState(null, "", "/play");
    setInGame(true);
  }, []);

  if (!inGame) return <LandingPage main={main} onStart={start} />;
  return (
    <Suspense fallback={null}>
      <PlayPage />
    </Suspense>
  );
}
