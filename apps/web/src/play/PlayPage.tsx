import { PerformanceMonitor, useGLTF } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { roomById } from "@wirelight/rooms";
import { useEffect, useState } from "react";
import { EngineDriver } from "../engine/EngineDriver";
import { useSession } from "../engine/store";
import { backendFromUrl, nodeRendererFactory } from "../render/backend";
import { lower, QUALITY, QualityContext, TIERS, type Tier, tierFromUrl } from "../render/quality";
import { pieceUrl } from "../world/kit/Piece";
import { OBSERVATORY } from "../world/observatory/layout";
import { ObservatoryScene } from "../world/observatory/ObservatoryScene";
import { Console } from "./Console";
import { RoomHud } from "./RoomHud";

// B1 walking skeleton: the Prologue, played in the Observatory, driven by the engine in a worker.
// The world always uses the node renderer (0049): ?backend=webgpu (default) or ?backend=webgl2.
// Dev aids: ?ruin=0|1 pins the dial; ?tier=high|medium|low|simple, T cycles.

// Dev aid: ?room=<id> opens another room (e.g. f2.lights-out, which has the console).
const ROOM = new URLSearchParams(location.search).get("room") ?? "p.first-message";

/** Starts fetching the room's kit pieces (during the descent), so arriving doesn't wait on them. */
export function preloadRoom(): void {
  for (const name of new Set(OBSERVATORY.map((p) => p.piece))) useGLTF.preload(pieceUrl(name));
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
export function PlayPage({ arriving = false }: { arriving?: boolean }) {
  const backend = backendFromUrl() === "webgl2" ? "webgl2" : "webgpu";
  const forced = tierFromUrl();
  const [tier, setTier] = useState<Tier>(forced ?? (backend === "webgpu" ? "high" : "medium"));
  const [auto, setAuto] = useState(!forced);
  const quality = QUALITY[tier];
  const load = useSession((s) => s.load);
  const roomId = useSession((s) => s.roomId);
  const room = roomId ? roomById(roomId) : undefined;

  useEffect(() => {
    void load(ROOM);
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "t" && e.key !== "T") return;
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
        <ObservatoryScene arriving={arriving} />
      </Canvas>
      <div className="dev-badge">
        Quality: {tier}
        {auto ? " (auto)" : ""} · T to change
      </div>
      <RoomHud />
      {room && room.controls.console !== "hidden" && (
        <Console device={room.playerDevice} subtitles={room.subtitles ?? room.floor <= 7} />
      )}
      {arriving && <div className="arrival-veil" />}
    </QualityContext.Provider>
  );
}
