import { Canvas, useFrame } from "@react-three/fiber";
import { Component, type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  type BackendChoice,
  backendFromUrl,
  describeRenderer,
  nodeRendererFactory,
  usesNodeRenderer,
} from "../../render/backend";
import { CHECKS, type Check } from "./checks";
import { entriesFor, installConsoleCapture, type LogEntry, setCurrentCheck } from "./log";

// B0 step 1: does every helper we plan to use work on WebGPU, on WebGPURenderer's WebGL2 backend,
// and on the classic WebGLRenderer? Open with ?backend=webgpu|webgl2|classic and ?run=all.
// Results are shown on the page and exposed as window.__rendererCheck for scripted runs.

installConsoleCapture();

const RUN_MS = 3000;

type Status = "pending" | "running" | "ok" | "warn" | "fail" | "skipped";
type Result = { status: Status; fps?: number; errors: LogEntry[]; warnings: LogEntry[]; thrown?: string };

declare global {
  interface Window {
    __rendererCheck?: { backend: BackendChoice; renderer: string; gpu: string; done: boolean; results: unknown };
  }
}

class CheckBoundary extends Component<
  { onError: (message: string) => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error) {
    this.props.onError(`${error.name}: ${error.message}`);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Running average of frames per second, skipping the first 500 ms (shader compilation).
function FrameMeter({ onFps }: { onFps: (fps: number) => void }) {
  const start = useRef<number | null>(null);
  const frames = useRef(0);
  useFrame(() => {
    const now = performance.now();
    if (start.current === null) start.current = now + 500;
    if (now < start.current) return;
    frames.current++;
    const elapsed = now - start.current;
    if (elapsed > 250) onFps(Math.round((frames.current / elapsed) * 1000));
  });
  return null;
}

function uniqueTexts(entries: LogEntry[] | undefined): string[] {
  return [...new Set((entries ?? []).map((e) => e.text))].slice(0, 3);
}

function Stage() {
  return (
    <>
      <color attach="background" args={["#14161c"]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 6, 3]} intensity={2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#3a3f48" />
      </mesh>
    </>
  );
}

async function describeGpu(): Promise<string> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return "navigator.gpu missing (no WebGPU in this browser)";
  const adapter = (await gpu.requestAdapter()) as { info?: Record<string, string> } | null;
  if (!adapter) return "navigator.gpu present, but no adapter";
  const info = adapter.info ?? {};
  return `WebGPU adapter: ${[info.vendor, info.architecture, info.description].filter(Boolean).join(" · ") || "(no info)"}`;
}

export function RendererCheck() {
  const backend = backendFromUrl();
  const autoRun = new URLSearchParams(window.location.search).get("run") === "all";
  const [renderer, setRenderer] = useState("(starting)");
  const [gpu, setGpu] = useState("(checking)");
  const [results, setResults] = useState<Record<string, Result>>(() =>
    Object.fromEntries(CHECKS.map((c) => [c.id, { status: "pending", errors: [], warnings: [] }])),
  );
  const [active, setActive] = useState<Check | null>(null);
  const [queue, setQueue] = useState<Check[]>([]);
  const fpsRef = useRef<number | undefined>(undefined);
  const thrownRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    describeGpu().then(setGpu, (e: unknown) => setGpu(`requestAdapter failed: ${String(e)}`));
  }, []);

  const runAll = useCallback(() => setQueue(CHECKS), []);

  // Start the next queued check once the renderer is ready and nothing is running,
  // so warnings from renderer setup stay out of the first check's results.
  const ready = renderer !== "(starting)";
  useEffect(() => {
    if (!ready || active || queue.length === 0) return;
    const [next, ...rest] = queue;
    if (!next) return;
    setQueue(rest);
    if (next.nodeOnly && !usesNodeRenderer(backend)) {
      setResults((r) => ({ ...r, [next.id]: { status: "skipped", errors: [], warnings: [] } }));
      return;
    }
    fpsRef.current = undefined;
    thrownRef.current = undefined;
    setCurrentCheck(next.id);
    setResults((r) => ({ ...r, [next.id]: { status: "running", errors: [], warnings: [] } }));
    setActive(next);
  }, [ready, active, queue, backend]);

  // Finish the running check after RUN_MS and record what it caused.
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => {
      const logged = entriesFor(active.id);
      const errors = logged.filter((e) => e.level === "error");
      const warnings = logged.filter((e) => e.level === "warn");
      const thrown = thrownRef.current;
      const status: Status = thrown || errors.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "ok";
      setResults((r) => ({ ...r, [active.id]: { status, fps: fpsRef.current, errors, warnings, thrown } }));
      setCurrentCheck("(idle)");
      setActive(null);
    }, RUN_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  useEffect(() => {
    if (autoRun) runAll();
  }, [autoRun, runAll]);

  const done = Object.values(results).every((r) => r.status !== "pending" && r.status !== "running");
  useEffect(() => {
    window.__rendererCheck = { backend, renderer, gpu, done, results };
  }, [backend, renderer, gpu, done, results]);

  return (
    <div
      style={{ display: "flex", height: "100vh", background: "#0e0f13", color: "#e8e2d8", font: "13px/1.4 system-ui" }}
    >
      <aside style={{ width: 460, overflow: "auto", padding: 14, borderRight: "1px solid #2a2d35" }}>
        <h1 style={{ fontSize: 16, margin: "0 0 6px" }}>Renderer check (B0)</h1>
        <div>
          Mode:{" "}
          {(["webgpu", "webgl2", "classic"] as const).map((b) => (
            <a
              key={b}
              href={`?backend=${b}&run=all`}
              style={{ marginRight: 8, color: b === backend ? "#5EE0E8" : "#9aa" }}
            >
              {b}
            </a>
          ))}
        </div>
        <div data-testid="renderer">Renderer: {renderer}</div>
        <div data-testid="gpu" style={{ color: "#9aa" }}>
          {gpu}
        </div>
        <button type="button" onClick={runAll} disabled={!!active} style={{ margin: "8px 0" }}>
          Run all
        </button>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {CHECKS.map((c) => {
              const r = results[c.id];
              return (
                <tr key={c.id} style={{ borderTop: "1px solid #22252c", verticalAlign: "top" }}>
                  <td style={{ padding: "4px 4px 4px 0" }}>
                    <button
                      type="button"
                      onClick={() => setQueue([c])}
                      disabled={!!active}
                      style={{ all: "unset", cursor: "pointer" }}
                    >
                      {c.label}
                    </button>
                    <div style={{ color: "#778", fontSize: 11 }}>{c.usedFor}</div>
                    {r?.thrown && <div style={{ color: "#ff8f8f", fontSize: 11 }}>{r.thrown}</div>}
                    {uniqueTexts(r?.errors).map((text) => (
                      <div key={text} style={{ color: "#ff8f8f", fontSize: 11 }}>
                        {text}
                      </div>
                    ))}
                    {uniqueTexts(r?.warnings).map((text) => (
                      <div key={text} style={{ color: "#F2A54A", fontSize: 11 }}>
                        {text}
                      </div>
                    ))}
                  </td>
                  <td style={{ padding: 4, whiteSpace: "nowrap" }} data-testid={`status-${c.id}`}>
                    {r?.status}
                    {r?.fps !== undefined ? ` · ${r.fps} fps` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </aside>
      <main style={{ flex: 1, position: "relative" }}>
        <Canvas
          key={backend}
          gl={usesNodeRenderer(backend) ? nodeRendererFactory(backend) : undefined}
          camera={{ position: [5, 4, 7], fov: 30 }}
          dpr={[1, 2]}
          onCreated={(state) => setRenderer(describeRenderer(state.gl))}
        >
          <Stage />
          {active && (
            <CheckBoundary
              key={active.id}
              onError={(message) => {
                thrownRef.current = message;
              }}
            >
              <Suspense fallback={null}>
                <active.Scene />
                <FrameMeter
                  onFps={(fps) => {
                    fpsRef.current = fps;
                  }}
                />
              </Suspense>
            </CheckBoundary>
          )}
        </Canvas>
        {active && (
          <div style={{ position: "absolute", top: 10, left: 10, color: "#5EE0E8" }}>
            {active.label} ({active.usedFor})
          </div>
        )}
      </main>
    </div>
  );
}
