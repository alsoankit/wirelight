import { useGLTF } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { roomById } from "@wirelight/rooms";
import {
  type Dispatch,
  lazy,
  memo,
  type ReactNode,
  type SetStateAction,
  StrictMode,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { AudioDriver } from "../audio/AudioDriver";
import { DevPanel } from "../dev/DevPanel";
import { PlaytestButton } from "../dev/PlaytestButton";
import { EngineDriver } from "../engine/EngineDriver";
import { ask, useSession } from "../engine/store";
import { useHydrated, useProgress } from "../progress/progress";
import { AutoQuality } from "../render/AutoQuality";
import { backendFromUrl, nodeRendererFactory } from "../render/backend";
import { FPS, FrameCap } from "../render/FrameCap";
import { loadConsole, usePrefetchLater } from "../render/preload";
import { QUALITY, QualityContext, scaleFromUrl, TIERS, type Tier, tierFromUrl } from "../render/quality";
import { HALL_PIECES } from "../world/hall/layout";
import { HOUSE_PIECES } from "../world/house/layout";
import { pieceUrl } from "../world/kit/Piece";
import { OBSERVATORY } from "../world/observatory/layout";
import { Declutter } from "../world/room/Declutter";
import { World } from "../world/room/World";
import { Gift } from "./Gift";
import { Glass } from "./Glass";
import { Keyboard } from "./Keyboard";
import { isTyping, withModifier } from "./keys";
import { LoadingScreen } from "./LoadingScreen";
import { Menu } from "./Menu";
import { Ending, JournalPage, KeyFlight, KnightMoments, MomentsDriver, WayBack } from "./Moments";
import { Onboarding } from "./Onboarding";
import { PlatePanel } from "./PlatePanel";
import { AskPanel, DiscoveryCards, NotesPanel, Reaction, TopBar } from "./RoomHelp";
import { RoomHud } from "./RoomHud";
import { JarButton, ToolPanels } from "./ToolPanels";

// B1 walking skeleton: the Prologue, played in the Observatory, driven by the engine in a worker.
// The world always uses the node renderer (0049): ?backend=webgpu (default) or ?backend=webgl2.
// Dev aids: ?ruin=0|1 pins the dial; ?tier=high|medium|low|simple, T cycles.

// The console's terminal (xterm, ~80 kB gzipped) loads when a room first needs it, or a few seconds
// after the game opens (render/preload.ts), never on the way in.
const Console = lazy(() => loadConsole().then((m) => ({ default: m.Console })));

// Dev aid for scripts and debugging: the stores on `window` (never in a production build).
if (import.meta.env.DEV) (window as unknown as { __wirelight?: unknown }).__wirelight = { useSession, useProgress };

/**
 * The room to open: a link to a room (`/play/<room>` or `?room=<id>`), else where the player left off
 * (ONB-20), else the Prologue.
 */
function startingRoom(): string {
  // A link to a room (/play/<room>, 0044) opens that room.
  const fromPath = window.location.pathname.match(/^\/play\/(.+)$/)?.[1];
  const linked = fromPath ? decodeURIComponent(fromPath) : null;
  if (linked && roomById(linked)) return linked;
  // `?room=` is where the game itself last was (goToRoom keeps it in the address bar). Saved progress
  // wins over it, so a reload after a win goes on to the next room; in dev it wins (play scripts).
  const current = useProgress.getState().current;
  const inBar = new URLSearchParams(window.location.search).get("room");
  if (inBar && roomById(inBar) && (import.meta.env.DEV || !current)) return inBar;
  return current && roomById(current) ? current : "p.first-message";
}

/** Starts fetching the room's kit pieces (during the descent), so arriving doesn't wait on them. */
export function preloadRoom(): void {
  for (const name of new Set([...OBSERVATORY, ...HOUSE_PIECES, ...HALL_PIECES].map((p) => p.piece)))
    useGLTF.preload(pieceUrl(name));
}

// Resolution follows the tier, capped at twice the CSS pixels.
function Resolution({ scale }: { scale: number }) {
  const setDpr = useThree((s) => s.setDpr);
  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio * scale, 2));
  }, [scale, setDpr]);
  return null;
}

/** `arriving`: coming down from the landing; the room fades in from dark and the camera settles. */
/** Settings that act outside React's tree: text size, motion, error subtitles (UI-17). */
function SettingsApplied() {
  const settings = useProgress((s) => s.settings);
  const path = useProgress((s) => s.path);
  useEffect(() => {
    document.documentElement.style.setProperty("--ui-zoom", String(settings.textSize));
    document.documentElement.dataset.motion = settings.motion;
    document.documentElement.dataset.textSize = String(settings.textSize);
    document.documentElement.dataset.captions = settings.captions ?? "standard";
    // Auto: the room decides, except that the New path keeps error subtitles on everywhere (0009).
    const auto = path === "new" ? true : null;
    void ask.setSubtitles(settings.subtitles === "auto" ? auto : settings.subtitles === "on");
  }, [settings, path]);
  return null;
}

/** How long the quality note shows after the tier changes. */
const QUALITY_NOTE_MS = 3000;

/** Dev aid: which quality tier is showing, for a moment after it changes (never in the way). */
function QualityNote({ tier, auto }: { tier: Tier; auto: boolean }) {
  const [shown, setShown] = useState(false);
  const first = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new tier is the trigger
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setShown(true);
    const id = setTimeout(() => setShown(false), QUALITY_NOTE_MS);
    return () => clearTimeout(id);
  }, [tier]);
  if (!shown) return null;
  return (
    <div className="dev-badge" role="status">
      Quality: {tier}
      {auto ? " (auto)" : ""} · T to change
    </div>
  );
}

/**
 * Renders its children from the scene's first frame on. The canvas's very first renders run inside
 * the page's own commit, where a label that mounts and is then hidden again (a model still loading)
 * can't be unmounted cleanly; from the first frame on, the scene renders on its own schedule.
 */
function AfterFirstFrame({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return ready ? children : null;
}

/**
 * The 3D room. Memoised, so it renders only when its own props change: the canvas's scene renders
 * inside the page's commit whenever the canvas does, and a label (drei's Html, a React root each)
 * leaving then makes React warn "synchronously unmount a root while rendering". The room's own
 * changes reach the scene through its stores instead, on the scene's own schedule.
 */
const WorldCanvas = memo(function WorldCanvas({
  backend,
  dpr,
  auto,
  setTier,
  arriving,
}: {
  backend: "webgpu" | "webgl2";
  dpr: number;
  auto: boolean;
  setTier: Dispatch<SetStateAction<Tier>>;
  arriving: boolean;
}) {
  return (
    <Canvas
      className="world"
      // A click on the room outside anything that can be clicked steps back (UI-05). Only on the
      // canvas itself: clicks on the room's HTML labels (plates, doorways) bubble through here too.
      onPointerMissed={(e) => {
        if (e.type === "click" && e.target instanceof HTMLCanvasElement) useSession.getState().closePanel();
      }}
      gl={nodeRendererFactory(backend)}
      frameloop={FPS ? "demand" : "always"}
      // Dev aid: the renderer, for reading draw calls and triangles from scripts.
      onCreated={(state) => {
        (window as unknown as { __renderer?: unknown }).__renderer = state.gl;
      }}
    >
      <Resolution scale={dpr} />
      <FrameCap />
      {/* Steps down when frames stay slow and back up when they recover (agent C: render/AutoQuality). */}
      <AutoQuality auto={auto} setTier={setTier} ceiling={backend === "webgpu" ? "high" : "medium"} />
      <EngineDriver />
      {/* Door plates step aside from the labels they would cover (7.B's eight doors). */}
      <Declutter />
      <AfterFirstFrame>
        <World arriving={arriving} />
      </AfterFirstFrame>
    </Canvas>
  );
});

/** `skipIntro`: the player chose Skip intro on the landing (ONB-07: no tour). */
export function PlayPage({ arriving = false, skipIntro = false }: { arriving?: boolean; skipIntro?: boolean }) {
  const hydrated = useHydrated();
  usePrefetchLater();
  const tourDone = useProgress((s) => s.tourDone);
  const backend = backendFromUrl() === "webgl2" ? "webgl2" : "webgpu";
  const chosen = useProgress((s) => s.settings.quality);
  const forced = tierFromUrl() ?? (chosen === "auto" ? undefined : chosen);
  const [tier, setTier] = useState<Tier>(forced ?? (backend === "webgpu" ? "high" : "medium"));
  // A quality chosen in Settings applies at once and sticks (0020).
  useEffect(() => {
    if (chosen !== "auto") {
      setTier(chosen);
      setAuto(false);
    }
  }, [chosen]);
  const [auto, setAuto] = useState(!forced);
  const quality = QUALITY[tier];
  const load = useSession((s) => s.load);
  const roomId = useSession((s) => s.roomId);
  const here = useSession((s) => s.here);
  const voiceGiven = useSession((s) => s.voiceGiven);
  const room = roomId ? roomById(roomId) : undefined;

  // Saved progress is read first, so the game opens where the player left off.
  useEffect(() => {
    if (!hydrated) return;
    // Dev aid for play scripts: ?onboarded=1 marks the first visit as seen (gift of sight, path, tour).
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("onboarded") === "1") {
      const p = useProgress.getState();
      p.giveSight();
      if (!p.path) p.choosePath("new");
      p.finishTour();
    }
    const first = startingRoom();
    // Where the player is is where they'll come back to (ONB-20), from the very first room.
    useProgress.getState().setCurrent(first);
    void load(first);
  }, [load, hydrated]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "t" && e.key !== "T") return;
      if (isTyping(e) || withModifier(e)) return;
      setAuto(false); // a choice made by hand sticks
      setTier((t) => TIERS[(TIERS.indexOf(t) + 1) % TIERS.length] as Tier);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <QualityContext.Provider value={quality}>
      <WorldCanvas
        key={backend}
        backend={backend}
        dpr={scaleFromUrl() ?? quality.dpr}
        auto={auto}
        setTier={setTier}
        arriving={arriving}
      />
      {/* Dev aid only: which quality tier is showing, for a moment when it changes. */}
      {import.meta.env.DEV && <QualityNote tier={tier} auto={auto} />}
      <StrictMode>
        <Keyboard />
        <AudioDriver />
        <DevPanel />
        <PlaytestButton />
        <SettingsApplied />
        <RoomHud />
        <PlatePanel />
        <ToolPanels />
        <JarButton />
        <Gift />
        <TopBar />
        <Glass />
        <Menu />
        <NotesPanel />
        <AskPanel />
        <Reaction />
        {hydrated && <Onboarding skipTour={skipIntro} />}
        {hydrated && tourDone && <DiscoveryCards />}
        {hydrated && tourDone && <KnightMoments />}
        <MomentsDriver />
        <JournalPage />
        <WayBack />
        <KeyFlight />
        <Ending />
        {room && room.controls.console === "typing" && voiceGiven && (
          <Suspense fallback={null}>
            <Console device={here ?? room.playerDevice} subtitles={room.subtitles ?? room.floor <= 7} />
          </Suspense>
        )}
      </StrictMode>
      {arriving && <div className="arrival-veil" />}
      <LoadingScreen />
    </QualityContext.Provider>
  );
}
