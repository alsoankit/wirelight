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
import { Dust } from "../Dust";
import { FLOORS, makeFlagstones } from "../kit/floor";
import type { Extra, Placement } from "../kit/StaticRoom";
import { StaticRoom } from "../kit/StaticRoom";
import { type KeeperCue, Messages } from "../observatory/Messages";
import { RoomLights } from "../observatory/RoomLights";
import { Plate } from "../Plate";
import { RoomPost } from "../post/RoomPost";
import { VIEW_DIRECTION } from "../RoomCamera";
import { RuinDial } from "../RuinDial";
import { LOOKS, type RegionId, useRegion } from "../region";
import type { Glow, Vec3 } from "../room/layout";

// A corridor (0081, CORE-10..13): the cable between two doors, as a place. A short cutaway tunnel in
// the region's stone, the cable a rune-line along its floor showing dark / lit / broken (CORE-12),
// every message on the cable passing through it both ways (hover, catch: CORE-13, CORE-18), the two
// doors' plates at its ends, and the way on to either room. Going through a doorway glides along it
// (`through`); stepping onto the cable stops here.

/** Length of the tunnel, metres; the cable's ends sit just inside its two arches. */
const LENGTH = 10;
const END = LENGTH / 2;
/** How long the glide through takes (tech/rendering.md: 300–600 ms); `?glide=<ms>` slows it in dev. */
export const GLIDE_MS =
  (import.meta.env.DEV && Number(new URLSearchParams(window.location.search).get("glide"))) || 600;
const QUARTER = Math.PI / 2;

/** The cable's two ends: link.a on the left (−x), link.b on the right (+x). */
function endsOf(room: RoomDef, link: string) {
  const l = room.topology.links.find((x) => x.id === link);
  return l ? { a: l.a, b: l.b } : null;
}

function walls(region: RegionId): Placement[] {
  // The back wall, in 2 m pieces, under a broken top in places; arches at both ends (both face the
  // camera, +x: the left one from inside, the right one from outside, like a doorway seen through).
  const plain =
    region === 1 ? ["Wall_Overgrown", "Wall", "Wall_Overgrown", "Wall", "Wall_Overgrown"] : Array(5).fill("Wall");
  return [
    ...plain.map((piece, i): Placement => ({ piece, position: [-4 + i * 2, 0, -2] })),
    { piece: "Wall_Broken", position: [-2, 2, -2] },
    { piece: "Wall_Broken", position: [2, 2, -2] },
    { piece: region === 1 ? "Wall_ArchRound_Overgrown" : "Wall_ArchRound", position: [-END, 0, 0], rotationY: QUARTER },
    { piece: region === 1 ? "Wall_ArchRound_Overgrown" : "Wall_ArchRound", position: [END, 0, 0], rotationY: QUARTER },
  ];
}

function floor(region: RegionId): Extra[] {
  // The room floor's laying, kept to a path between the walls.
  const name = region === 3 ? "Cobble" : "Floor";
  return [
    {
      name,
      geometry: makeFlagstones({
        size: LENGTH + 0.4,
        seed: 4400 + region,
        ...FLOORS[region],
        keep: (_x, z) => Math.abs(z) < 1.9,
      }),
    },
  ];
}

/** Lamps along the back wall: dark in ruin, warm when the room is restored (RoomLights). */
const LAMPS: Glow[] = [
  { position: [-2.6, 2.2, -1.6], colour: "#FFC98A", strength: 1.6 },
  { position: [2.6, 2.2, -1.6], colour: "#FFC98A", strength: 1.6 },
];

/** The rune-line along the floor (CORE-12): dark, lit, or broken (cracked, dimming slowly: no flicker). */
function RuneLine({ state }: { state: "dark" | "lit" | "broken" }) {
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
  return (
    <mesh position={[0, 0.03, 0.2]} material={material}>
      <boxGeometry args={[LENGTH - 0.6, 0.02, 0.12]} />
    </mesh>
  );
}

/** The fixed three-quarter view, looking along the tunnel; gliding through moves it from end to end. */
function CorridorCamera({ glide, onArrive }: { glide: { from: number; to: number } | null; onArrive: () => void }) {
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
    lookAt.set(x, 0.9, 0);
    camera.position.copy(lookAt).addScaledVector(VIEW_DIRECTION, 17);
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
  const placements = useMemo(() => walls(region), [region]);
  const extras = useMemo(() => floor(region), [region]);

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
      <CorridorCamera glide={glide} onArrive={arrive} />
      <color attach="background" args={[look.background]} />
      <RuinDial level={won} origin={[xOf(corridor.from), 1, 0]} />
      <RoomLights glows={LAMPS} region={region} />
      <Suspense fallback={null}>
        <StaticRoom region={region} placements={placements} extras={extras} toCamera={VIEW_DIRECTION} />
      </Suspense>
      <RuneLine state={state} />
      <Messages
        device={ends.a.device}
        link={corridor.link}
        corridorEnd={[END - 0.4, 0.45, 0.2]}
        doorway={[0, 0.45, 0.2]}
        keeper={[-END + 0.4, 0.45, 0.2]}
        watch={watch}
        cue={cue}
        catchable={!!room.controls.catching}
        floor={room.floor}
      />
      {quality.dust && <Dust bounds={{ min: [-END, 0.2, -1.6], max: [END, 2.6, 1.6] }} colour={look.dust} />}
      {[ends.a, ends.b].map((end, i) => {
        const door = doors?.[`${end.device}:${end.iface}`];
        const x = i === 0 ? -END : END;
        const position: Vec3 = [x + (i === 0 ? 0.9 : -0.9), 2.35, -1.75];
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
              <Html center position={[x, 2.9, 0]} zIndexRange={[10, 0]}>
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
        <Html center position={[0, 3.6, -1.6]} zIndexRange={[10, 0]}>
          <div className="corridor-title">
            <strong>{fill(voice.corridor.title, { a: ends.a.device, b: ends.b.device })}</strong>
            <span>{voice.corridor.hint}</span>
          </div>
        </Html>
      )}
      <RoomPost />
    </>
  );
}
