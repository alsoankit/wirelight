import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { voice } from "@wirelight/content";
import { type RoomDef, roomById } from "@wirelight/rooms";
import { Suspense, useMemo, useRef } from "react";
import { AdditiveBlending, BoxGeometry, type Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from "three";
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
import { networkSpots, type Spot } from "./spots";

// The network world (prototype, 0103): the whole network in one calm view. A machine is a matte
// platform, a cable a visible bridge between two machines, and every message the engine has on a cable
// is a small light moving along it, placed from the same crossings as the map. Nothing here is
// textured or lit live, so the view costs only a few cheap meshes.

const PLATFORM = 5;
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
  const layout = useMemo(() => {
    const count = room.topology.devices.find((d) => d.id === spot.id)?.interfaces.length ?? 1;
    if (spot.id === room.playerDevice) return observatoryLayout(count, asRegion(room.region));
    if (spot.kind === "house") return houseLayout(asRegion(room.region));
    return hallLayout(count, asRegion(room.region));
  }, [room, spot, room.playerDevice, room.region]);
  if (!colors) return null;
  return (
    <group position={[spot.at[0], 0, spot.at[1]]}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); the chip is the keyboard way */}
      <group onClick={() => open && goTo(spot.id)}>
        <mesh geometry={SLAB} material={here ? colors.here : colors.body} position={[0, 0, 0]} />
        <mesh geometry={UNIT} material={colors.top} position={[0, 0.2, 0]} scale={[4.55, 0.08, 4.55]} />
        <Suspense fallback={null}>
          <group position={[0, 0.25, 0]} scale={0.42}>
            <StaticRoom
              region={asRegion(room.region)}
              placements={layout.placements}
              extras={layout.extras}
              toCamera={VIEW_DIRECTION}
            />
            <KitRoom pieces={layout.kitPieces} region={asRegion(room.region)} toCamera={VIEW_DIRECTION} />
          </group>
        </Suspense>
        <group position={[0, 0.25, 0]} scale={0.42}>
          <Keeper position={[0, 0, -0.55]} rest={[0, 0, -4]} cue={cue} region={asRegion(room.region)} />
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

/** A cable: a bridge between the two machines' edges, with a port at each end and its plate. */
function Cable({
  link,
  spots: where,
  room,
}: {
  link: RoomDef["topology"]["links"][number];
  spots: Map<string, Spot>;
  room: RoomDef;
}) {
  const state = useSession((s) => s.status?.corridors[link.id] ?? "dark");
  const a = where.get(link.a.device)?.at ?? [0, 0];
  const b = where.get(link.b.device)?.at ?? [0, 0];
  const colors = REGIONS[room.region - 1];
  if (!colors) return null;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  const ux = dx / length;
  const uz = dz / length;
  const edge = PLATFORM / 2 - 0.2;
  const span = length - edge * 2;
  const ends: [string, string, number, number][] = [
    [link.a.device, link.a.iface, a[0] + ux * edge, a[1] + uz * edge],
    [link.b.device, link.b.iface, b[0] - ux * edge, b[1] - uz * edge],
  ];
  return (
    <>
      <mesh
        geometry={UNIT}
        material={state === "lit" ? colors.roadLit : state === "broken" ? CABLE.broken : colors.road}
        position={[(a[0] + b[0]) / 2, -0.03, (a[1] + b[1]) / 2]}
        rotation={[0, -Math.atan2(dz, dx), 0]}
        scale={[span + 1.1, 0.22, 1.45]}
      />
      {[0.55, -0.55].map((side) => (
        <mesh
          key={side}
          geometry={UNIT}
          material={colors.wall}
          position={[(a[0] + b[0]) / 2 - uz * side, 0.28, (a[1] + b[1]) / 2 + ux * side]}
          rotation={[0, -Math.atan2(dz, dx), 0]}
          scale={[span + 1.1, 0.42, 0.12]}
        />
      ))}
      {Array.from({ length: Math.max(2, Math.floor(length / 3)) }, (_, index) => {
        const count = Math.max(2, Math.floor(length / 3));
        const t = (index + 1) / (count + 1) - 0.5;
        return [-0.72, 0.72].map((side) => (
          <mesh
            key={`${t}-${side}`}
            geometry={UNIT}
            material={colors.arch}
            position={[(a[0] + b[0]) / 2 + dx * t - uz * side, 0.48, (a[1] + b[1]) / 2 + dz * t + ux * side]}
            scale={[0.34, 0.9, 0.34]}
          />
        ));
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
function Messages({ room, where }: { room: RoomDef; where: Map<string, Spot> }) {
  const lights = useRef<(Mesh | null)[]>([]);
  const links = useMemo(() => new Map(room.topology.links.map((l) => [l.id, l])), [room]);
  const at = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const { onCables, status } = useSession.getState();
    const now = status?.now ?? 0;
    lights.current.forEach((light, i) => {
      if (!light) return;
      const c = onCables[i];
      const l = c && links.get(c.link);
      const a = l && where.get(l.a.device)?.at;
      const b = l && where.get(l.b.device)?.at;
      light.visible = !!(c && a && b);
      if (!(c && l && a && b)) return;
      const t = progress(c, now);
      const k = c.from === l.a.device ? t : 1 - t;
      at.set(a[0] + (b[0] - a[0]) * k, 0.25, a[1] + (b[1] - a[1]) * k);
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
    camera.position.set(target.x, reach * 1.2, target.z + reach * 0.65);
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
  if (!room || !here) return null;
  const home = where.get(room.playerDevice)?.at ?? [0, 0];
  const all = [...where.values()].map((s) => s.at);
  const xs = all.map((a) => a[0]);
  const zs = all.map((a) => a[1]);
  const middle: [number, number] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  const reach = Math.max(
    8,
    (Math.max(...xs) - Math.min(...xs)) * 0.42 + 3.5,
    (Math.max(...zs) - Math.min(...zs)) * 0.7 + 4,
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
          <Cable key={l.id} link={l} spots={where} room={room} />
        ))}
        <Messages room={room} where={where} />
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
