import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { EngineCheck } from "./dev/engine-check/EngineCheck";
import { RendererCheck } from "./dev/renderer-check/RendererCheck";
// Fonts are bundled (Fontsource, OFL), never fetched from a font server: the game must work offline.
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/cinzel";
import "./styles.css";

// The app (App.tsx: landing and game), plus dev checks at /dev/renderer-check and /dev/engine-check.
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
createRoot(root).render(page.type === App ? page : <StrictMode>{page}</StrictMode>);
