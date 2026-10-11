import { useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef, useState } from "react";
import type { Mesh } from "three";
import { positionLocal, smoothstep, uniform, vec3 } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { Bloom } from "../../render/Bloom";
import { useQuality } from "../../render/quality";
import { Dust } from "../Dust";
import { Fireflies } from "../Fireflies";
import { Piece } from "../kit/Piece";
import { Plate } from "../Plate";
import { RoomCamera } from "../RoomCamera";
import { RuinDial } from "../RuinDial";
import { WindDriver } from "../WindDriver";
import { Keeper } from "./Keeper";
import { CORRIDOR_END_Z, DOORWAY, FLAMES, KEEPER, OBSERVATORY } from "./layout";
import { type KeeperCue, MockTraffic } from "./MockTraffic";
import { Moonbeams } from "./Moonbeams";
import { MOON_POSITION, MOON_TARGET, RoomLights } from "./RoomLights";
import { ScryingGlass } from "./ScryingGlass";

// B0 step 2: the Observatory, the first room of the Overgrown Halls, with mock data. An old
// fantasy ruin explored with modern tools (0051): only the Glass (a hologram) is modern here.
// Press R to restore it (and again to let it fall back into ruin): one dial drives materials, light and fog,
// and the change spreads as a wave from the doorway (standing in for the object the player fixed).

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

// Where restoration spreads from in B0: the doorway, as if the link had just been fixed.
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

export function ObservatoryScene() {
  const inbound = useRef<Mesh>(null);
  const cue = useRef<KeeperCue>({ arrived: -1, departed: -1 });
  const quality = useQuality();
  const [lit, setLit] = useState(false);

  return (
    <>
      <RoomCamera {...cameraFromUrl()} />
      <color attach="background" args={["#0b0d12"]} />
      <RuinDial origin={FIX_ORIGIN} />
      <RoomLights flames={FLAMES} />

      <Suspense fallback={null}>
        {OBSERVATORY.map((p, i) => (
          <Piece
            // Placements are a fixed list; their order never changes.
            // biome-ignore lint/suspicious/noArrayIndexKey: static layout
            key={i}
            name={p.piece}
            position={p.position}
            rotation={[0, p.rotationY ?? 0, 0]}
            scale={p.scale ?? 1}
          />
        ))}
      </Suspense>

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
      <Keeper position={KEEPER.position} rest={[DOORWAY.x, 1.4, DOORWAY.z]} watch={inbound} cue={cue} />
      <ScryingGlass position={[2.4, 0, 1.6]} />
      <MockTraffic
        corridorEnd={[DOORWAY.x, 0.35, CORRIDOR_END_Z]}
        doorway={[DOORWAY.x, 0.9, DOORWAY.z]}
        keeper={[KEEPER.position[0], 1.25, KEEPER.position[2] - 0.95]}
        inbound={inbound}
        cue={cue}
        onRoundTrip={() => setLit(true)}
      />
      <Plate position={[1.6, 2.35, DOORWAY.z + 0.15]} name="eth0" mac="02:00:00:00:00:05" linkUp />

      {quality.bloom && <Bloom />}
    </>
  );
}
