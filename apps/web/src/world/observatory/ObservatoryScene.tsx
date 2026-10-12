import { useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import type { Object3D } from "three";
import { positionLocal, smoothstep, uniform, vec3 } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { useSession } from "../../engine/store";
import { Bloom } from "../../render/Bloom";
import { useQuality } from "../../render/quality";
import { Dust } from "../Dust";
import { Fireflies } from "../Fireflies";
import { makeEarth, makeFlagstones } from "../kit/floor";
import { type Extra, StaticRoom } from "../kit/StaticRoom";
import { MOON_POSITION, MOON_TARGET } from "../moon";
import { Plate } from "../Plate";
import { RoomCamera, VIEW_DIRECTION } from "../RoomCamera";
import { RuinDial } from "../RuinDial";
import { WindDriver } from "../WindDriver";
import { Keeper } from "./Keeper";
import { KnightLetter } from "./KnightLetter";
import { CORRIDOR_END_Z, DOORWAY, KEEPER, LETTER, OBSERVATORY } from "./layout";
import { type KeeperCue, Messages } from "./Messages";
import { Moonbeams } from "./Moonbeams";
import { RoomLights } from "./RoomLights";
import { RUNE_GLOWS, Runes } from "./Runes";
import { ScryingGlass } from "./ScryingGlass";

// The Observatory, the first room of the Overgrown Halls: the player's machine (`observatory`), its
// one door (eth0) and the cable through the doorway (`wire`). An old fantasy ruin explored with
// modern tools (0051): only the Glass (a hologram) is modern here. A left world (0052): structure,
// the machine, the Glass, two traces of the Knight; runes for light.
// Everything that changes is derived from the session (the engine's trace and status): messages, the
// corridor's light, the plate, and the ruin, which follows the room's failing health checks and
// spreads from the doorway (both of this room's objects, the door and the corridor, are there).

const DEVICE = "observatory";
const DOOR = "eth0";
const LINK = "wire";

// Where the moon gets in: the barred window, the gap above the crumbled left wall, and the
// collapsed top of the back wall's right end.
const MOON_GAPS = [
  { from: [-4, 3.1, -3] as [number, number, number], width: 1.3, depth: 0.9 },
  { from: [-4, 2.4, 1.8] as [number, number, number], width: 2.6, depth: 1.2 },
  { from: [3, 2.4, -4] as [number, number, number], width: 1.6, depth: 1.0 },
];

// The corridor's rune-line (CORE-12): dark until a message and its answer have crossed, then lit.
// It leaves through the doorway and fades into the dark of the corridor.
function Cable({ lit }: { lit: boolean }) {
  const length = DOORWAY.z - CORRIDOR_END_Z;
  const brightness = useMemo(() => uniform(0.18), []);
  const material = useMemo(() => {
    const m = new MeshBasicNodeMaterial({ transparent: true, toneMapped: false });
    m.colorNode = vec3(0.21, 1, 1.05).mul(brightness);
    // Fully visible at the doorway (+z end of the box), fading out towards the far end.
    m.opacityNode = smoothstep(-length / 2, length / 2 - 0.3, positionLocal.z);
    return m;
  }, [brightness, length]);
  useFrame((_, delta) => {
    const target = lit ? 1.6 : 0.18;
    brightness.value += (target - brightness.value) * (1 - Math.exp(-delta * 2));
  });
  return (
    <mesh position={[DOORWAY.x, 0.05, DOORWAY.z - length / 2]} material={material}>
      <boxGeometry args={[0.12, 0.02, length]} />
    </mesh>
  );
}

// The floor: rows of old flagstones made in code (not kit tiles), tight dark joints.
const FLOOR: Extra[] = [
  {
    name: "Floor",
    geometry: makeFlagstones({ size: 8.4, seed: 1103 }),
  },
  { name: "Earth", geometry: makeEarth(8.4) },
];

// Where restoration spreads from: the doorway (the door and its corridor).
const FIX_ORIGIN: [number, number, number] = [DOORWAY.x, 1, DOORWAY.z];

// The air of the room, where fireflies drift (inside the walls, above the floor).
const FIREFLY_BOUNDS = {
  min: [-3.4, 0.4, -3.4] as [number, number, number],
  max: [3.4, 3.0, 3.4] as [number, number, number],
};

// B0 dev aid: ?distance=8&target=0,1.4,-0.6 frames something up close (screenshots, reviews).
function cameraFromUrl(): { target: [number, number, number]; distance: number } {
  const q = new URLSearchParams(window.location.search);
  const t = q.get("target")?.split(",").map(Number);
  const target: [number, number, number] =
    t && t.length === 3 && t.every(Number.isFinite) ? [t[0] as number, t[1] as number, t[2] as number] : [0, 1.1, -0.6];
  const d = Number(q.get("distance"));
  return { target, distance: Number.isFinite(d) && d > 0 ? d : 19 };
}

export function ObservatoryScene({ arriving = false }: { arriving?: boolean }) {
  const watch = useRef<Object3D>(null);
  const cue = useRef<KeeperCue>({ arrived: -1, departed: -1 });
  const quality = useQuality();
  const lit = useSession((s) => s.status?.corridors[LINK] === "lit");
  const door = useSession((s) => s.status?.doors[`${DEVICE}:${DOOR}`]);
  // CORE-38: ruin = failing checks ÷ all checks.
  const ruinLevel = useSession((s) => {
    const checks = Object.values(s.status?.health ?? {});
    return checks.length === 0 ? null : checks.filter((ok) => !ok).length / checks.length;
  });

  return (
    <>
      <RoomCamera {...cameraFromUrl()} settleFrom={arriving ? 9 : 0} />
      <color attach="background" args={["#0b0d12"]} />
      <RuinDial level={ruinLevel} origin={FIX_ORIGIN} />
      <RoomLights glows={RUNE_GLOWS} />

      <Suspense fallback={null}>
        <StaticRoom placements={OBSERVATORY} extras={FLOOR} toCamera={VIEW_DIRECTION} />
      </Suspense>
      <Runes />
      <KnightLetter position={LETTER} />

      {quality.moonbeams && (
        <Moonbeams
          beams={MOON_GAPS}
          direction={[
            MOON_TARGET[0] - MOON_POSITION[0],
            MOON_TARGET[1] - MOON_POSITION[1],
            MOON_TARGET[2] - MOON_POSITION[2],
          ]}
        />
      )}
      <WindDriver />
      {quality.fireflies && <Fireflies bounds={FIREFLY_BOUNDS} />}
      {quality.dust && <Dust bounds={FIREFLY_BOUNDS} />}
      <Cable lit={lit} />
      <Keeper position={KEEPER.position} rest={[DOORWAY.x, 1.4, DOORWAY.z]} watch={watch} cue={cue} />
      <ScryingGlass position={[2.4, 0, 1.6]} />
      <Messages
        device={DEVICE}
        link={LINK}
        corridorEnd={[DOORWAY.x, 0.35, CORRIDOR_END_Z]}
        doorway={[DOORWAY.x, 0.9, DOORWAY.z]}
        keeper={[KEEPER.position[0], 0.85, KEEPER.position[2] - 0.36]}
        watch={watch}
        cue={cue}
      />
      {door && <Plate position={[1.6, 2.35, DOORWAY.z + 0.15]} name={DOOR} mac={door.mac} linkUp={door.up} />}

      {quality.bloom && <Bloom />}
    </>
  );
}
