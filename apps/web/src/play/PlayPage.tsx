import { PerformanceMonitor, useGLTF } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { roomById } from "@wirelight/rooms";
import { useEffect, useState } from "react";
import { AudioDriver } from "../audio/AudioDriver";
import { EngineDriver } from "../engine/EngineDriver";
import { ask, useSession } from "../engine/store";
import { useHydrated, useProgress } from "../progress/progress";
import { backendFromUrl, nodeRendererFactory } from "../render/backend";
import { lower, QUALITY, QualityContext, TIERS, type Tier, tierFromUrl } from "../render/quality";
import { HALL_PIECES } from "../world/hall/layout";
import { HOUSE_PIECES } from "../world/house/layout";
import { pieceUrl } from "../world/kit/Piece";
import { OBSERVATORY } from "../world/observatory/layout";
import { World } from "../world/room/World";
import { Console } from "./Console";
import { Gift } from "./Gift";
import { Glass } from "./Glass";
import { Keyboard } from "./Keyboard";
import { isTyping, withModifier } from "./keys";
import { Menu } from "./Menu";
import { Onboarding } from "./Onboarding";
import { PlatePanel } from "./PlatePanel";
import { AskPanel, DiscoveryCards, NotesPanel, Reaction, RoomStartLines, TopBar } from "./RoomHelp";
import { RoomHud } from "./RoomHud";
import { JarButton, ToolPanels } from "./ToolPanels";

// B1 walking skeleton: the Prologue, played in the Observatory, driven by the engine in a worker.
// The world always uses the node renderer (0049): ?backend=webgpu (default) or ?backend=webgl2.
// Dev aids: ?ruin=0|1 pins the dial; ?tier=high|medium|low|simple, T cycles.

// Dev aid for scripts and debugging: the stores on `window` (never in a production build).
if (import.meta.env.DEV) (window as unknown as { __wirelight?: unknown }).__wirelight = { useSession, useProgress };

/**
 * The room to open: a link to a room (`/play/<room>` or `?room=<id>`), else where the player left off
 * (ONB-20), else the Prologue.
 */
function startingRoom(): string {
  const fromPath = window.location.pathname.match(/^\/play\/(.+)$/)?.[1];
  const asked = fromPath ? decodeURIComponent(fromPath) : new URLSearchParams(window.location.search).get("room");
  if (asked && roomById(asked)) return asked;
  const current = useProgress.getState().current;
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
  useEffect(() => {
    document.documentElement.style.setProperty("--ui-zoom", String(settings.textSize));
    document.documentElement.dataset.motion = settings.motion;
    document.documentElement.dataset.textSize = String(settings.textSize);
    void ask.setSubtitles(settings.subtitles === "auto" ? null : settings.subtitles === "on");
  }, [settings]);
  return null;
}

/** `skipIntro`: the player chose Skip intro on the landing (ONB-07: no tour). */
export function PlayPage({ arriving = false, skipIntro = false }: { arriving?: boolean; skipIntro?: boolean }) {
  const hydrated = useHydrated();
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
    void load(startingRoom());
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
      <Canvas
        key={backend}
        className="world"
        // A click on the room outside anything that can be clicked steps back (UI-05). Only on the
        // canvas itself: clicks on the room's HTML labels (plates, doorways) bubble through here too.
        onPointerMissed={(e) => {
          if (e.type === "click" && e.target instanceof HTMLCanvasElement) useSession.getState().closePanel();
        }}
        gl={nodeRendererFactory(backend)}
        // Dev aid: the renderer, for reading draw calls and triangles from scripts.
        onCreated={(state) => {
          (window as unknown as { __renderer?: unknown }).__renderer = state.gl;
        }}
      >
        <Resolution scale={quality.dpr} />
        {/* Step down when frames stay under 45 per second; never step up on its own. */}
        <PerformanceMonitor
          bounds={() => [45, 1000]}
          flipflops={3}
          onDecline={() => {
            if (auto) setTier((t) => lower(t));
          }}
        />
        <EngineDriver />
        <World arriving={arriving} />
      </Canvas>
      {/* Dev aid only: which quality tier is showing (Settings has the player's choice). */}
      {import.meta.env.DEV && (
        <div className="dev-badge">
          Quality: {tier}
          {auto ? " (auto)" : ""} · T to change
        </div>
      )}
      <Keyboard />
      <AudioDriver />
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
      {hydrated && tourDone && <RoomStartLines />}
      {room && room.controls.console === "typing" && voiceGiven && (
        <Console device={here ?? room.playerDevice} subtitles={room.subtitles ?? room.floor <= 7} />
      )}
      {arriving && <div className="arrival-veil" />}
    </QualityContext.Provider>
  );
}
