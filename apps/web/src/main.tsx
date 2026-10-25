import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { CannotDraw, canDraw3D, GameErrorBoundary } from "./CannotDraw";
// Fonts are bundled (Fontsource, OFL), never fetched from a font server: the game must work offline.
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/cinzel";
import "./styles.css";

// The app (App.tsx: landing and game), plus dev checks at /dev/renderer-check and /dev/engine-check
// (loaded only on their own pages, so the landing never downloads them).
const RendererCheck = lazy(() =>
  import("./dev/renderer-check/RendererCheck").then((m) => ({ default: m.RendererCheck })),
);
const EngineCheck = lazy(() => import("./dev/engine-check/EngineCheck").then((m) => ({ default: m.EngineCheck })));

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

const path = window.location.pathname;
const page = path.startsWith("/dev/renderer-check") ? (
  <RendererCheck />
) : path.startsWith("/dev/engine-check") ? (
  <EngineCheck />
) : (
  <App />
);

// The game (App) sets its own StrictMode: around the landing and the game's HTML layer, never around
// the 3D canvas, whose floating labels (drei's Html, a React root each) can't be unmounted inside
// StrictMode's doubled effects without React warning ("synchronously unmount a root").
// A browser that can't draw 3D at all gets a page that says so (CannotDraw.tsx), never a black screen;
// a failure later on (the renderer failing to start) is caught by the boundary.
void canDraw3D().then((ok) =>
  createRoot(root).render(
    !ok ? (
      <CannotDraw />
    ) : page.type === App ? (
      <GameErrorBoundary>{page}</GameErrorBoundary>
    ) : (
      <StrictMode>
        <Suspense fallback={null}>{page}</Suspense>
      </StrictMode>
    ),
  ),
);
