import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RendererCheck } from "./dev/renderer-check/RendererCheck";

// B0: the app is only the renderer check for now. The game itself arrives in B1.
const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <RendererCheck />
  </StrictMode>,
);
