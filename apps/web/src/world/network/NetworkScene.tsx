import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { voice } from "@wirelight/content";
import { type RoomDef, roomById } from "@wirelight/rooms";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  ExtrudeGeometry,
  type Mesh,
  MeshBasicMaterial,
  Shape,
  SphereGeometry,
  Vector3,
} from "three";
import { progress } from "../../engine/clock";
import { useSession } from "../../engine/store";
import { useMachineLabel } from "../../play/roles";
import { useReducedMotion } from "../../progress/motion";
import { Plate } from "../Plate";
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
  { body: "#303d37", top: "#425448", rim: "#8c9b72", here: "#f0c47c" },
  { body: "#303846", top: "#414b5c", rim: "#8293a7", here: "#ffd58c" },
  { body: "#3b3430", top: "#51433b", rim: "#a98568", here: "#ffc985" },
  { body: "#353441", top: "#49475b", rim: "#9c91b3", here: "#e6c993" },
].map((colors) => ({
  body: matte(colors.body),
  top: matte(colors.top),
  rim: matte(colors.rim),
  here: matte(colors.here),
}));
const CABLE = {
  dark: matte("#727c8d"),
  lit: matte("#FFC98A"),
  broken: matte("#a95f48"),
};
const FLOW = new MeshBasicMaterial({
  color: "#7de6e8",
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
  blending: AdditiveBlending,
  toneMapped: false,
});
const DOT = new MeshBasicMaterial({ color: "#6befff", toneMapped: false });
const HALO = new MeshBasicMaterial({
  color: "#40d9e4",
  transparent: true,
  opacity: 0.24,
  depthWrite: false,
  blending: AdditiveBlending,
  toneMapped: false,
});

function rounded(size: number, radius: number) {
  const h = size / 2;
  const s = new Shape();
  s.moveTo(-h + radius, -h);
  s.lineTo(h - radius, -h);
  s.quadraticCurveTo(h, -h, h, -h + radius);
  s.lineTo(h, h - radius);
  s.quadraticCurveTo(h, h, h - radius, h);
  s.lineTo(-h + radius, h);
  s.quadraticCurveTo(-h, h, -h, h - radius);
  s.lineTo(-h, -h + radius);
  s.quadraticCurveTo(-h, -h, -h + radius, -h);
  return s;
}

const SLAB = new ExtrudeGeometry(rounded(PLATFORM, 0.5), { depth: LIFT, bevelEnabled: false, curveSegments: 5 })
  .rotateX(Math.PI / 2)
  .translate(0, 0, 0);
const INLAY = new ExtrudeGeometry(rounded(PLATFORM - 0.5, 0.35), { depth: 0.02, bevelEnabled: false, curveSegments: 5 })
  .rotateX(Math.PI / 2)
  .translate(0, 0.02, 0);
const RIM_INLAY = new ExtrudeGeometry(rounded(PLATFORM - 0.25, 0.42), {
  depth: 0.01,
  bevelEnabled: false,
  curveSegments: 5,
})
  .rotateX(Math.PI / 2)
  .translate(0, 0.012, 0);
const PORT = new BoxGeometry(0.5, 0.16, 0.5);
const UNIT = new BoxGeometry(1, 1, 1);
const BALL = new SphereGeometry(0.17, 12, 8);
const GLOW = new SphereGeometry(0.42, 12, 8);
const BACKDROP = new CircleGeometry(90, 48);
const AMBIENT_POOL = new CircleGeometry(42, 48);
const BACKDROP_MAT = new MeshBasicMaterial({ color: "#171722", depthWrite: false });
const POOL_MATS = ["#263a32", "#292d3b", "#3a2e29", "#302b3c"].map(
  (color) => new MeshBasicMaterial({ color, transparent: true, opacity: 0.36, depthWrite: false }),
);

/** The machine's own shape, so no two kinds look alike: a core, a single block, a row, a tower. */
function Machine({ kind }: { kind: string }) {
  if (kind === "you")
    return (
      <>
        <mesh geometry={UNIT} material={BODY} position={[0, 0.5, 0]} scale={[2, 1, 2]} />
        <mesh geometry={UNIT} material={CORE} position={[0, 1.08, 0]} scale={[1.2, 0.16, 1.2]} />
      </>
    );
  if (kind === "switch")
    return (
      <>
        {[-1.2, 0, 1.2].map((x) => (
          <mesh key={x} geometry={UNIT} material={BODY} position={[x, 0.35, 0]} scale={[0.9, 0.7, 2.4]} />
        ))}
        <mesh geometry={UNIT} material={CORE} position={[0, 0.78, 0]} scale={[3.2, 0.1, 0.2]} />
      </>
    );
  if (kind === "router")
    return (
      <>
        <mesh geometry={UNIT} material={BODY} position={[0, 1, 0]} scale={[1.3, 2, 1.3]} />
        <mesh geometry={UNIT} material={CORE} position={[0, 2.08, 0]} scale={[0.8, 0.16, 0.8]} />
      </>
    );
  return (
    <>
      <mesh geometry={UNIT} material={BODY} position={[0, 0.4, 0]} scale={[1.5, 0.8, 1.5]} />
      <mesh geometry={UNIT} material={CORE} position={[0, 0.85, 0]} scale={[0.8, 0.1, 0.8]} />
    </>
  );
}

function Platform({ spot, room, here }: { spot: Spot; room: RoomDef; here: boolean }) {
  const goTo = useSession((s) => s.goTo);
  const openPanel = useSession((s) => s.openPanel);
  const open = spot.id === room.playerDevice || room.access[spot.id]?.state === "enterable";
  const label = useMachineLabel();
  const colors = REGIONS[Math.max(0, Math.min(REGIONS.length - 1, room.region - 1))] ?? REGIONS[0]!;
  return (
    <group position={[spot.at[0], 0, spot.at[1]]}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a 3D object (raycast click); the chip is the keyboard way */}
      <group onClick={() => open && goTo(spot.id)}>
        <mesh geometry={SLAB} material={colors.body} />
        <mesh geometry={RIM_INLAY} material={here ? colors.here : colors.rim} />
        <mesh geometry={INLAY} material={colors.top} />
        <Machine kind={spot.kind} />
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
  const carrying = useSession((s) => s.onCables.some((message) => message.link === link.id));
  const a = where.get(link.a.device)?.at ?? [0, 0];
  const b = where.get(link.b.device)?.at ?? [0, 0];
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
        material={CABLE[state as keyof typeof CABLE] ?? CABLE.dark}
        position={[(a[0] + b[0]) / 2, -0.12, (a[1] + b[1]) / 2]}
        rotation={[0, -Math.atan2(dz, dx), 0]}
        scale={[span, 0.08, 0.14]}
      />
      {carrying && (
        <mesh
          geometry={UNIT}
          material={FLOW}
          position={[(a[0] + b[0]) / 2, -0.06, (a[1] + b[1]) / 2]}
          rotation={[0, -Math.atan2(dz, dx), 0]}
          scale={[span, 0.035, 0.32]}
        />
      )}
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
    camera.position.set(target.x, reach * 0.95, target.z + reach * 0.78);
    camera.lookAt(target.x, 0, target.z - 0.4);
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
      <color attach="background" args={["#100f17"]} />
      <fog attach="fog" args={["#100f17", reach * 1.25, reach * 3.2]} />
      <mesh
        geometry={BACKDROP}
        material={BACKDROP_MAT}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[middle[0], -0.28, middle[1]]}
      />
      <mesh
        geometry={AMBIENT_POOL}
        material={POOL_MATS[Math.max(0, Math.min(POOL_MATS.length - 1, room.region - 1))] ?? BACKDROP_MAT}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[middle[0], -0.26, middle[1]]}
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
