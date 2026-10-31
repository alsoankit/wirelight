import { Html, PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { fill, voice } from "@wirelight/content";
import { type RoomDef, roomById } from "@wirelight/rooms";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { type PerspectiveCamera as Camera, type Object3D, Vector3 } from "three";
import { float, fract, mix, positionLocal, step, uniform, vec3 } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { type Corridor, useSession } from "../../engine/store";
import { isTyping } from "../../play/keys";
import { useReducedMotion } from "../../progress/motion";
import { useQuality } from "../../render/quality";
import { lampsBaked } from "../bake/lightmap";
import { Dust } from "../Dust";
import { StaticRoom } from "../kit/StaticRoom";
import { KitRoom } from "../kits/KitRoom";
import { type KeeperCue, Messages } from "../observatory/Messages";
import { Moonbeams } from "../observatory/Moonbeams";
import { RoomLights } from "../observatory/RoomLights";
import { Runes } from "../observatory/Runes";
import { Plate } from "../Plate";
import { RoomPost } from "../post/RoomPost";
import { VIEW_DIRECTION } from "../RoomCamera";
import { RuinDial } from "../RuinDial";
import { LOOKS, useRegion } from "../region";
import { Gears } from "../regions/Gears";
import { Haze } from "../regions/Haze";
import { Steam } from "../regions/Steam";
import type { Vec3 } from "../room/layout";
import { SecretDoor } from "../room/SecretDoor";
import { corridorDressing } from "./dressing";
import { CORRIDOR, corridorHalf, endArches } from "./frame";

// A corridor (0081, CORE-10..13): the cable between two doors, as a place. A short cutaway tunnel in
// the region's stone, the cable a rune-line along its floor showing dark / lit / broken (CORE-12),
// every message on the cable passing through it both ways (hover, catch: CORE-13, CORE-18), the two
// doors' plates at its ends, and the way on to either room. Going through a doorway glides along it
// (`through`); stepping onto the cable stops here.

/** Where the cable runs (frame.ts). */
const Z = CORRIDOR.cable;
/** How long the glide through takes (tech/rendering.md: 300–600 ms); `?glide=<ms>` slows it in dev. */
export const GLIDE_MS =
  (import.meta.env.DEV && Number(new URLSearchParams(window.location.search).get("glide"))) || 600;

/** The cable's two ends: link.a on the left (−x), link.b on the right (+x). */
function endsOf(room: RoomDef, link: string) {
  const l = room.topology.links.find((x) => x.id === link);
  return l ? { a: l.a, b: l.b } : null;
}

/** The rune-line along the floor (CORE-12): dark, lit, or broken (cracked, dimming slowly: no flicker). */
function RuneLine({
  state,
  half,
  loose,
}: {
  state: "dark" | "lit" | "broken";
  half: number;
  /** A cable end that's out (unplugged): the line stops short there, its loose end on the floor. */
  loose: { left: boolean; right: boolean };
}) {
  const brightness = useMemo(() => uniform(0.18), []);
  const cracked = useMemo(() => uniform(0), []);
  const flow = useMemo(() => uniform(0), []);
  const material = useMemo(() => {
    const m = new MeshBasicNodeMaterial({ transparent: true, toneMapped: false });
    // A slow rune flow along the line when lit (soft bands drifting along x).
    const bands = fract(positionLocal.x.mul(0.6).sub(flow)).mul(0.35).add(0.65);
    m.colorNode = vec3(0.21, 1, 1.05).mul(brightness).mul(bands);
    m.opacityNode = mix(float(1), step(0.35, fract(positionLocal.x.mul(2.5))), cracked);
    return m;
  }, [brightness, cracked, flow]);
  useFrame(({ clock }, delta) => {
    cracked.value = state === "broken" ? 1 : 0;
    const target = state === "lit" ? 1.6 : state === "broken" ? 0.05 + 0.04 * Math.sin(clock.elapsedTime * 0.8) : 0.18;
    brightness.value += (target - brightness.value) * (1 - Math.exp(-delta * 2));
    flow.value = state === "lit" ? clock.elapsedTime * 0.25 : flow.value;
  });
  const from = -half + 0.3 + (loose.left ? 1.4 : 0);
  const to = half - 0.3 - (loose.right ? 1.4 : 0);
  return (
    <>
      <mesh position={[(from + to) / 2, 0.03, Z]} material={material}>
        <boxGeometry args={[to - from, 0.02, 0.12]} />
      </mesh>
      {/* A loose end glinting in the dust where the cable lies unplugged (1.B's brief). */}
      {loose.left && <LooseEnd at={[from - 0.1, 0.05, Z + 0.12]} />}
      {loose.right && <LooseEnd at={[to + 0.1, 0.05, Z - 0.12]} />}
    </>
  );
}

function LooseEnd({ at }: { at: Vec3 }) {
  return (
    <group position={at} rotation={[0, 0.5, Math.PI / 2]}>
      <mesh>
        <cylinderGeometry args={[0.045, 0.045, 0.24, 10]} />
        <meshStandardMaterial color="#8a5a34" metalness={0.6} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <sphereGeometry args={[0.035, 10, 8]} />
        <meshBasicMaterial color={[1.2, 0.85, 0.5]} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** The fixed three-quarter view, looking along the tunnel; gliding through moves it from end to end. */
function CorridorCamera({
  glide,
  onArrive,
  distance,
}: {
  glide: { from: number; to: number } | null;
  onArrive: () => void;
  distance: number;
}) {
  const ref = useRef<Camera>(null);
  const started = useRef<number | null>(null);
  const arrived = useRef(false);
  const lookAt = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const camera = ref.current;
    if (!camera) return;
    let x = 0;
    if (glide) {
      started.current ??= performance.now();
      const t = Math.min((performance.now() - started.current) / GLIDE_MS, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      x = glide.from + (glide.to - glide.from) * eased;
      if (t >= 1 && !arrived.current) {
        arrived.current = true;
        onArrive();
      }
    }
    lookAt.set(x, 0.9, Z);
    camera.position.copy(lookAt).addScaledVector(VIEW_DIRECTION, distance);
    camera.lookAt(lookAt);
  });
  return <PerspectiveCamera ref={ref} makeDefault fov={30} near={0.5} far={120} />;
}

export function CorridorScene({ corridor }: { corridor: Corridor }) {
  const roomId = useSession((s) => s.roomId);
  const room = roomId ? roomById(roomId) : undefined;
  const region = useRegion();
  const look = LOOKS[region];
  const quality = useQuality();
  const still = useReducedMotion();
  const state = useSession((s) => s.status?.corridors[corridor.link] ?? "dark");
  const doors = useSession((s) => s.status?.doors);
  const won = useSession((s) => (s.status ? (s.status.won ? 0 : 1) : null));
  const goTo = useSession((s) => s.goTo);
  const watch = useRef<Object3D>(null);
  const cue = useRef<KeeperCue>({ arrived: -1, departed: -1 });
  const ends = room ? endsOf(room, corridor.link) : null;
  const END = corridorHalf(roomId);
  const dressing = corridorDressing(region, END);
  const placements = useMemo(
    () => [...endArches(region, END), ...corridorDressing(region, END).placements],
    [region, END],
  );
  const cableEnds = useSession((s) => s.status?.cableEnds);
  const loose = {
    left: !!ends && cableEnds?.[`${ends.a.device}:${ends.a.iface}`] === "out",
    right: !!ends && cableEnds?.[`${ends.b.device}:${ends.b.iface}`] === "out",
  };

  const xOf = (device: string) => (ends?.a.device === device ? -END : END);
  const canEnter = (device: string) => room?.access[device]?.state === "enterable";
  // Gliding through: from the end the player came in by, toward the other (stopping short of it).
  const glide = corridor.through && ends ? { from: xOf(corridor.from) * 0.55, to: xOf(corridor.through) * 0.55 } : null;
  const arrive = () => {
    if (corridor.through) goTo(corridor.through);
  };

  // Keys (CORE-47): ← and → go on to the room at that end, Esc steps back to the room the player came from.
  useEffect(() => {
    if (!ends || corridor.through) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const left = ends.a.device;
      const right = ends.b.device;
      if (e.key === "ArrowLeft" && canEnter(left)) goTo(left);
      else if (e.key === "ArrowRight" && canEnter(right)) goTo(right);
      else if (e.key === "Escape") goTo(corridor.from);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // No glide with reduced motion (UI-23): straight on to the room (the doorway usually skips the
  // corridor already; this covers the setting changing mid-glide).
  useEffect(() => {
    if (corridor.through && still) goTo(corridor.through);
  }, [corridor.through, still, goTo]);

  if (!room || !ends || (corridor.through && still)) return null;
  const showMac = room.floor >= 2;
  const showAddrs = room.floor >= 5;
  const streets = room.floor >= 7;

  return (
    <>
      <CorridorCamera glide={glide} onArrive={arrive} distance={17 * (END / CORRIDOR.half) ** 0.8} />
      <color attach="background" args={[look.background]} />
      <RuinDial level={won} origin={[xOf(corridor.from), 1, Z]} />
      <RoomLights
        glows={dressing.glows}
        region={region}
        baked={lampsBaked(placements, dressing.extras, dressing.kitPieces, region)}
      />
      <Suspense fallback={null}>
        <StaticRoom region={region} placements={placements} extras={dressing.extras} toCamera={VIEW_DIRECTION} />
      </Suspense>
      <Suspense fallback={null}>
        <KitRoom pieces={dressing.kitPieces} region={region} toCamera={VIEW_DIRECTION} />
      </Suspense>
      {dressing.gears && <Gears gears={dressing.gears} region={region} />}
      {quality.moonbeams && dressing.steam && <Steam vents={dressing.steam} />}
      {dressing.runes && <Runes marks={dressing.runes} />}
      {quality.moonbeams && dressing.beams && (
        <Moonbeams
          beams={dressing.beams.list}
          direction={dressing.beams.direction}
          colour={dressing.beams.colour}
          ruined={dressing.beams.ruined}
          restored={dressing.beams.restored}
          pools={dressing.beams.pools}
        />
      )}
      {region === 4 && <Haze haze={quality.moonbeams} glass={dressing.stainedGlass} />}
      <RuneLine state={state} half={END} loose={loose} />
      <Messages
        device={ends.a.device}
        link={corridor.link}
        corridorEnd={[END - 0.4, 0.45, Z]}
        doorway={[0, 0.45, Z]}
        keeper={[-END + 0.4, 0.45, Z]}
        watch={watch}
        cue={cue}
        catchable={!!room.controls.catching}
        floor={room.floor}
      />
      {quality.dust && (
        <Dust bounds={{ min: [-END, 0.2, CORRIDOR.back + 0.3], max: [END, 2.6, CORRIDOR.front] }} colour={look.dust} />
      )}
      {[ends.a, ends.b].map((end, i) => {
        const door = doors?.[`${end.device}:${end.iface}`];
        const x = i === 0 ? -END : END;
        const position: Vec3 = [x + (i === 0 ? 0.9 : -0.9), 2.35, CORRIDOR.back + 0.25];
        return (
          <group key={`${end.device}:${end.iface}`}>
            {door && (
              <Plate
                position={position}
                name={end.iface}
                mac={showMac ? door.mac : undefined}
                addrs={showAddrs ? door.addrs : undefined}
                streets={streets}
                linkUp={door.up}
              />
            )}
            {!corridor.through && (
              <Html center position={[x, 1.3, Z]} zIndexRange={[10, 0]}>
                {canEnter(end.device) ? (
                  <button
                    type="button"
                    className="world-chip"
                    onClick={() => goTo(end.device)}
                    aria-label={fill(voice.corridor.toEndLabel, { name: end.device })}
                    aria-keyshortcuts={i === 0 ? "ArrowLeft" : "ArrowRight"}
                  >
                    {i === 0 ? "← " : ""}
                    {fill(voice.corridor.toEnd, { name: end.device })}
                    {i === 1 ? " →" : ""}
                  </button>
                ) : (
                  <span className="world-chip" data-tone="sealed">
                    {end.device}
                  </span>
                )}
              </Html>
            )}
          </group>
        );
      })}
      {!corridor.through && (
        <Html center position={[0, 3.4, Z]} zIndexRange={[10, 0]}>
          <div className="corridor-title">
            <strong>{fill(voice.corridor.title, { a: ends.a.device, b: ends.b.device })}</strong>
            <span>{voice.corridor.hint}</span>
          </div>
        </Html>
      )}
      {/* A secret room's door in this corridor's wall, where its floor spec puts one (2.2; 0081). */}
      {!corridor.through && <SecretDoor corridor at={[0.6, 0, CORRIDOR.back + 0.12]} turn={0} />}
      <RoomPost />
    </>
  );
}
