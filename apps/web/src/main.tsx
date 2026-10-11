import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { B0Room } from "./B0Room";
import { RendererCheck } from "./dev/renderer-check/RendererCheck";
import "./styles.css";

// B0: the room prototype, plus the renderer check at /dev/renderer-check. The game itself arrives in B1.
const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

const page = window.location.pathname.startsWith("/dev/renderer-check") ? <RendererCheck /> : <B0Room />;

createRoot(root).render(<StrictMode>{page}</StrictMode>);
