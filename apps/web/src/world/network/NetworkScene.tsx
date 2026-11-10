import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { voice } from "@wirelight/content";
import { type RoomDef, roomById } from "@wirelight/rooms";
import { Suspense, useMemo, useRef } from "react";
import { AdditiveBlending, BoxGeometry, Matrix4, type Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from "three";
import { progress } from "../../engine/clock";
import { useSession } from "../../engine/store";
import { useMachineLabel } from "../../play/roles";
import { useReducedMotion } from "../../progress/motion";
import { hallLayout } from "../hall/layout";
import { houseLayout } from "../house/layout";
import { StaticRoom } from "../kit/StaticRoom";
import { KitRoom } from "../kits/KitRoom";
import { Keeper } from "../observatory/Keeper";
import { observatoryLayout } from "../observatory/layout";
import type { KeeperCue } from "../observatory/Messages";
import { Plate } from "../Plate";
import { VIEW_DIRECTION } from "../RoomCamera";
import { asRegion } from "../region";
import { alongPath } from "../room/palaceMap";
import { hallSlots, MIRROR, planOf } from "../room/plan";
import { networkRuns, networkSpots, type Run, type Spot } from "./spots";

// The network world (prototype, 0103): the whole network in one calm view. A machine is a matte
// platform, a cable a visible bridge between two machines, and every message the engine has on a cable
// is a small light moving along it, placed from the same crossings as the map. Nothing here is
// textured or lit live, so the view costs only a few cheap meshes.

// A room floor at the diorama scale (8 m x PALACE_SCALE), with a narrow rim.
const PLATFORM = 3.75;
const LIFT = 0.35;

/** Basic materials keep this view cheap and compatible with both render backends. */
const matte = (color: string) => new MeshBasicMaterial({ color });

const BODY = matte("#303846");
const CORE = matte("#8792a4");
const REGIONS = [
  {
    body: "#39433a",
    top: "#777762",
    rim: "#71815d",
    wall: "#777565",
    arch: "#a29a7f",
    here: "#f0c47c",
    ground: "#252e27",
    road: "#56584d",
    roadLit: "#b9a46f",
  },
  {
    body: "#373b40",
    top: "#78756c",
    rim: "#9b7542",
    wall: "#68645d",
    arch: "#b48c53",
    here: "#ffd58c",
    ground: "#292b2e",
    road: "#53504a",
    roadLit: "#c1a26a",
  },
  {
    body: "#443b34",
    top: "#9a8061",
    rim: "#a98568",
    wall: "#947d64",
    arch: "#bf9b70",
    here: "#ffc985",
    ground: "#302822",
    road: "#65594e",
    roadLit: "#c6a37b",
  },
  {
    body: "#383740",
    top: "#aaa59a",
    rim: "#9c91b3",
    wall: "#9b978f",
    arch: "#c2bcae",
    here: "#e6c993",
    ground: "#2b2a31",
    road: "#69656a",
    roadLit: "#d4c6a0",
  },
].map((colors) => ({
  body: matte(colors.body),
  top: matte(colors.top),
  rim: matte(colors.rim),
  wall: matte(colors.wall),
  arch: matte(colors.arch),
  here: matte(colors.here),
  road: matte(colors.road),
  roadLit: matte(colors.roadLit),
  ground: colors.ground,
}));
const CABLE = {
  dark: matte("#727c8d"),
  lit: matte("#FFC98A"),
  broken: matte("#a95f48"),
};
const DOT = new MeshBasicMaterial({ color: "#6befff", toneMapped: false });
const HALO = new MeshBasicMaterial({
  color: "#40d9e4",
  transparent: true,
  opacity: 0.24,
  depthWrite: false,
  blending: AdditiveBlending,
  toneMapped: false,
});

const SLAB = new BoxGeometry(PLATFORM, LIFT, PLATFORM);
const PORT = new BoxGeometry(0.5, 0.16, 0.5);
const UNIT = new BoxGeometry(1, 1, 1);
const MIRRORED = new Matrix4().fromArray(MIRROR);
const IDENTITY = new Matrix4();
const BALL = new SphereGeometry(0.17, 12, 8);
const GLOW = new SphereGeometry(0.42, 12, 8);
const GROUND = new BoxGeometry(1, 0.2, 1);
function Platform({ spot, room, here }: { spot: Spot; room: RoomDef; here: boolean }) {
  const goTo = useSession((s) => s.goTo);
  const openPanel = useSession((s) => s.openPanel);
  const open = spot.id === room.playerDevice || room.access[spot.id]?.state === "enterable";
  const label = useMachineLabel();
  const colors = REGIONS[Math.max(0, Math.min(REGIONS.length - 1, room.region - 1))];
  const cue = useRef<KeeperCue>({ arrived: -1, departed: -1 });
  const mirrored = !!planOf(room.topology, room.playerDevice, spot.id)?.mirrored;
  const layout = useMemo(() => {
    const count = room.topology.devices.find((d) => d.id === spot.id)?.interfaces.length ?? 1;
    if (spot.id === room.playerDevice) return observatoryLayout(count, asRegion(room.region));
    if (spot.kind === "house") return houseLayout(asRegion(room.region));
    return hallLayout(hallSlots(room.topology, room.playerDevice, spot.id), asRegion(room.region));
  }, [room, spot, room.playerDevice, room.region]);
  if (!colors) return null;
  return (
    <group position={[spot.at[0], 0, spot.at[1]]}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); the chip is the keyboard way */}
      <group onClick={() => open && goTo(spot.id)}>
        <mesh geometry={SLAB} material={here ? colors.here : colors.body} position={[0, 0, 0]} />
        <mesh
          geometry={UNIT}
          material={colors.top}
          position={[0, 0.2, 0]}
          scale={[PLATFORM - 0.2, 0.08, PLATFORM - 0.2]}
        />
        {/* Where the room really lies, as the room view shows it (0120); a mirrored house mirrored. */}
        <group position={[0, 0.25, 0]} scale={0.42}>
          <group matrix={mirrored ? MIRRORED : IDENTITY} matrixAutoUpdate={false}>
            <Suspense fallback={null}>
              <StaticRoom
                region={asRegion(room.region)}
                placements={layout.placements}
                extras={layout.extras}
                toCamera={VIEW_DIRECTION}
              />
              <KitRoom pieces={layout.kitPieces} region={asRegion(room.region)} toCamera={VIEW_DIRECTION} />
            </Suspense>
            <Keeper position={[0, 0, -0.55]} rest={[0, 0, -4]} cue={cue} region={asRegion(room.region)} />
          </group>
        </group>
      </group>
      <Html center position={[0, 3.35, 0]} zIndexRange={[10, 0]}>
        <button
          type="button"
          className="world-chip"
          disabled={!open}
          onClick={() => (here ? openPanel({ kind: "keeper", device: spot.id }) : open && goTo(spot.id))}
        >
          {here ? `${label(spot.id)} · ${voice.map.youAreHere}` : label(spot.id)}
        </button>
      </Html>
    </group>
  );
}

/** A cable: a walled walk along its L from one machine's door to the other's (0120), a port at each end. */
function Cable({
  link,
  run,
  room,
}: {
  link: RoomDef["topology"]["links"][number];
  run: Run | undefined;
  room: RoomDef;
}) {
  const state = useSession((s) => s.status?.corridors[link.id] ?? "dark");
  const colors = REGIONS[room.region - 1];
  if (!colors || !run) return null;
  const first = run.points[0] ?? [0, 0];
  const last = run.points[run.points.length - 1] ?? [0, 0];
  const [aEnd, bEnd] = run.a === link.a.device ? [first, last] : [last, first];
  const ends: [string, string, number, number][] = [
    [link.a.device, link.a.iface, aEnd[0], aEnd[1]],
    [link.b.device, link.b.iface, bEnd[0], bEnd[1]],
  ];
  const road = state === "lit" ? colors.roadLit : state === "broken" ? CABLE.broken : colors.road;
  return (
    <>
      {run.points.slice(1).map((b, i) => {
        const a = run.points[i] as [number, number];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const length = Math.hypot(dx, dz);
        if (length < 0.01) return null;
        const ux = dx / length;
        const uz = dz / length;
        const turn = -Math.atan2(dz, dx);
        const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        // Each leg runs a half-width past its corner, so the two legs meet without a gap.
        const span = length + 0.5;
        const count = Math.max(1, Math.floor(length / 2.2));
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: an L's legs, fixed per cable
          <group key={i}>
            <mesh
              geometry={UNIT}
              material={road}
              position={[mid[0], -0.03, mid[1]]}
              rotation={[0, turn, 0]}
              scale={[span, 0.22, 0.95]}
            />
            {[0.42, -0.42].map((side) => (
              <mesh
                key={side}
                geometry={UNIT}
                material={colors.wall}
                position={[mid[0] - uz * side, 0.22, mid[1] + ux * side]}
                rotation={[0, turn, 0]}
                scale={[span, 0.32, 0.1]}
              />
            ))}
            {Array.from({ length: count }, (_, index) => {
              const t = (index + 1) / (count + 1) - 0.5;
              return [-0.5, 0.5].map((side) => (
                <mesh
                  key={`${t}-${side}`}
                  geometry={UNIT}
                  material={colors.arch}
                  position={[mid[0] + dx * t - uz * side, 0.4, mid[1] + dz * t + ux * side]}
                  scale={[0.24, 0.7, 0.24]}
                />
              ));
            })}
          </group>
        );
      })}
      {ends.map(([device, iface, x, z]) => (
        <group key={`${device}:${iface}`} position={[x, 0, z]}>
          <mesh geometry={PORT} material={CORE} position={[0, -0.02, 0]} />
          <Port device={device} iface={iface} room={room} />
        </group>
      ))}
    </>
  );
}

function Port({ device, iface, room }: { device: string; iface: string; room: RoomDef }) {
  const door = useSession((s) => s.status?.doors[`${device}:${iface}`]);
  const here = useSession((s) => s.here);
  const openPanel = useSession((s) => s.openPanel);
  const exec = useSession((s) => s.exec);
  if (!door || device !== here) return null;
  return (
    <Plate
      position={[0, 0.9, 0]}
      name={iface}
      mac={room.floor >= 2 ? door.mac : undefined}
      addrs={room.floor >= 5 ? door.addrs : undefined}
      linkUp={door.up}
      onOpen={() => {
        openPanel({ kind: "plate", device, iface });
        void exec(device, `ip link show ${iface}`, "click");
      }}
      tab={30}
    />
  );
}

/** Every message on a cable: drawn from the session each frame, from the same crossings as the map. */
function Messages({ runs }: { runs: Map<string, Run> }) {
  const lights = useRef<(Mesh | null)[]>([]);
  const at = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const { onCables, status } = useSession.getState();
    const now = status?.now ?? 0;
    lights.current.forEach((light, i) => {
      if (!light) return;
      const c = onCables[i];
      const run = c && runs.get(c.link);
      light.visible = !!(c && run);
      if (!(c && run)) return;
      const t = progress(c, now);
      const p = alongPath(
        run.points.map(([x, y]) => ({ x, y })),
        c.from === run.a ? t : 1 - t,
      );
      at.set(p.x, 0.25, p.y);
      light.position.copy(at);
    });
  });
  return (
    <>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed pool of lights
          key={i}
          ref={(m) => {
            lights.current[i] = m;
          }}
          visible={false}
          geometry={BALL}
          material={DOT}
        >
          <mesh geometry={GLOW} material={HALO} />
        </mesh>
      ))}
    </>
  );
}

/** Looks down on the whole network, framed on its middle. */
function View({ focus, reach }: { focus: [number, number]; reach: number }) {
  const camera = useThree((s) => s.camera);
  const target = useMemo(() => new Vector3(), []);
  const goal = useMemo(() => new Vector3(), []);
  const reduced = useReducedMotion();
  useFrame((_, delta) => {
    goal.set(focus[0], 0, focus[1]);
    if (reduced) target.copy(goal);
    else target.lerp(goal, 1 - Math.exp(-delta * 3));
    // From the room camera's corner (south-east), so right on screen is right on the Map (0120).
    camera.position.set(target.x + reach * 0.46, reach * 1.2, target.z + reach * 0.46);
    camera.lookAt(target.x, 0, target.z);
  });
  return null;
}

export function NetworkScene() {
  const roomId = useSession((s) => s.roomId);
  const here = useSession((s) => s.here);
  const openPanel = useSession((s) => s.openPanel);
  const room = roomId ? roomById(roomId) : undefined;
  const where = useMemo(() => (room ? networkSpots(room) : new Map<string, Spot>()), [room]);
  const runs = useMemo(() => (room ? networkRuns(room) : new Map<string, Run>()), [room]);
  if (!room || !here) return null;
  const home = where.get(room.playerDevice)?.at ?? [0, 0];
  const all = [...where.values()].map((s) => s.at);
  const xs = all.map((a) => a[0]);
  const zs = all.map((a) => a[1]);
  const middle: [number, number] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  // Framed on screen: across (x - z) and down (x + z), as the camera sees them.
  const across = all.map((a) => (a[0] - a[1]) * Math.SQRT1_2);
  const down = all.map((a) => (a[0] + a[1]) * Math.SQRT1_2);
  const reach = Math.max(
    8,
    (Math.max(...across) - Math.min(...across)) * 0.45 + 3.5,
    (Math.max(...down) - Math.min(...down)) * 0.8 + 4,
  );
  return (
    <>
      <color attach="background" args={[REGIONS[room.region - 1]?.ground ?? "#25252a"]} />
      <fog attach="fog" args={[REGIONS[room.region - 1]?.ground ?? "#25252a", reach * 1.25, reach * 3.2]} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[-8, 12, 8]} intensity={2.2} />
      <mesh
        geometry={GROUND}
        material={REGIONS[room.region - 1]?.body ?? BODY}
        position={[middle[0], -0.5, middle[1]]}
        scale={[reach * 8, 1, reach * 8]}
      />
      <View focus={middle} reach={reach} />
      <group dispose={null}>
        {[...where.values()].map((s) => (
          <Platform key={s.id} spot={s} room={room} here={s.id === here} />
        ))}
        {room.topology.links.map((l) => (
          <Cable key={l.id} link={l} run={runs.get(l.id)} room={room} />
        ))}
        <Messages runs={runs} />
        {room.controls.workbench === "works" && (
          <Html center position={[home[0], 1.5, home[1] + 1.6]} zIndexRange={[10, 0]}>
            <button type="button" className="world-chip" onClick={() => openPanel({ kind: "workbench" })}>
              {voice.workbench.name}
            </button>
          </Html>
        )}
      </group>
    </>
  );
}
