import { voice } from "@wirelight/content";
import { Component, type ReactNode } from "react";

// When the 3D world can't be drawn here: no WebGL2 and no WebGPU, or the game failed while starting
// to draw. A plain page that says why and what to try, never a black screen. Progress lives in the
// browser's storage, so nothing is lost by reloading.

/** Whether this browser can draw the game at all: WebGL2, or a WebGPU adapter. */
export async function canDraw3D(): Promise<boolean> {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (gl) {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return true;
    }
  } catch {
    // Fall through to WebGPU.
  }
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

/** Whether an error came from drawing (the renderer or the graphics context), not from the game's own code. */
export const isDrawError = (e: unknown) => /webgl|webgpu|gpu|adapter|context|renderer|shader/i.test(String(e));

export function CannotDraw({ detail, crashed = false }: { detail?: string; crashed?: boolean }) {
  const t = voice.cannotDraw;
  const url = new URL(window.location.href);
  const onWebgl2 = url.searchParams.get("backend") === "webgl2";
  url.searchParams.set("backend", "webgl2");
  return (
    <main className="cannot-draw">
      <h1>{crashed ? t.crashedTitle : t.title}</h1>
      <p>{crashed ? t.crashedBody : t.body}</p>
      {!crashed && (
        <>
          <p>{t.tipsTitle}</p>
          <ul>
            {t.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </>
      )}
      <div className="panel-actions">
        <button type="button" onClick={() => window.location.reload()}>
          {t.retry}
        </button>
        {/* Only after drawing started and failed: with no 3D at all, the simpler mode can't help. */}
        {detail && !crashed && !onWebgl2 && (
          <a className="quiet-link" href={url.toString()}>
            {t.webgl2}
          </a>
        )}
      </div>
      {detail && (
        <details>
          <summary>{t.detail}</summary>
          <pre>{detail}</pre>
        </details>
      )}
    </main>
  );
}

/** Catches a failure anywhere in the game (the 3D renderer failing to start, most often). */
export class GameErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error("[wirelight] the game stopped:", error);
  }

  override render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    return <CannotDraw detail={String(e.stack ?? e)} crashed={!isDrawError(e)} />;
  }
}
