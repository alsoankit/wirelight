import { useFrame } from "@react-three/fiber";
import { roomById } from "@wirelight/rooms";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  type BufferGeometry,
  CatmullRomCurve3,
  Color,
  type Group,
  type InstancedMesh,
  type Mesh,
  Object3D,
  type PointLight,
  TubeGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { color, float, positionLocal, smoothstep, uniform } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { useSession } from "../../engine/store";
import { regionMaterial } from "../kit/regionMaterials";
import { addTo, box, ring, rod, type V3 } from "../kit/shapes";
import type { RegionId } from "../region";
import { ruin } from "../ruin";
import { type DoorSlot, doorGeometry } from "./layout";

// One signature set piece per boss (floor specs, art briefs), built in code, merged per material:
// - 1.B The Dark Corridor: a root tunnel. Roots arch over the room from the walls, and a dark stone
//   cable channel runs in from the doorway.
// - 2.B The Silent Line: the great cable channel across the floor to the sealed arch, a wall of roots
//   along it, one guttering candle (slow, never a fast flicker); on the win the roots draw back and the
//   whole hall blooms at once.
// - 3.B The Busy Hall: pneumatic tubes along the upper walls, brass capsules running through them.
// - 4.B The Storm (and its secret): slow amber warning lamps that turn while the loop rages.
// - 8.B The Closed Crossing: iron beams barring the crossing's great doors, lifted on the win.
// - 9.B The Crossing: a dome over the crossing hall; on the win a beam of light climbs to its eye.
// Budgets (tech/rendering.md): each piece is a handful of draw calls; no shadows.

type Props = { device: string; region: RegionId; slots: DoorSlot[]; doors: number; hall: boolean };

/** Restoredness, smoothed, for animating a piece with the room (0 ruined → 1 restored). */
function useRestored() {
  const value = useRef(1 - ruin.value);
  useFrame((_, delta) => {
    value.current += (1 - ruin.value - value.current) * (1 - Math.exp(-delta * 1.5));
  });
  return value;
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tube(points: V3[], radius: number, segments = 18): BufferGeometry {
  const g = new TubeGeometry(new CatmullRomCurve3(points.map((p) => new Vector3(...p))), segments, radius, 5, false);
  g.deleteAttribute("uv");
  return g.toNonIndexed();
}

function Merged({ bag, region }: { bag: Record<string, BufferGeometry[]>; region: RegionId }) {
  const parts = useMemo(
    () =>
      Object.entries(bag)
        .map(([name, list]) => ({ name, geometry: list.length === 1 ? list[0] : mergeGeometries(list) }))
        .filter((p): p is { name: string; geometry: BufferGeometry } => !!p.geometry),
    [bag],
  );
  useEffect(
    () => () => {
      for (const p of parts) p.geometry.dispose();
    },
    [parts],
  );
  return (
    <>
      {parts.map((p) => (
        <mesh key={p.name} geometry={p.geometry} material={regionMaterial(p.name, region)} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------
// 1.B: the root tunnel

function rootCanopy(seed: number): Record<string, BufferGeometry[]> {
  const random = seeded(seed);
  const bag: Record<string, BufferGeometry[]> = {};
  // Thick roots come over the top of the back and left walls and hang down into the room.
  for (let i = 0; i < 9; i++) {
    const back = i % 2 === 0;
    const along = -3.4 + random() * 6.0;
    const top: V3 = back ? [along, 3.9, -4.2] : [-4.2, 3.9, along];
    const inward = 1.2 + random() * 1.8;
    const drop = 1.4 + random() * 1.4;
    const mid: V3 = back
      ? [along + (random() - 0.5), 3.6, -4 + inward * 0.5]
      : [-4 + inward * 0.5, 3.6, along + (random() - 0.5)];
    const end: V3 = back
      ? [along + (random() - 0.5) * 1.2, 3.6 - drop, -4 + inward]
      : [-4 + inward, 3.6 - drop, along + (random() - 0.5) * 1.2];
    addTo(bag, "Bark", tube([top, mid, end], 0.05 + random() * 0.05));
    // A thinner one splitting off.
    addTo(
      bag,
      "Bark",
      tube(
        [
          mid,
          [(mid[0] + end[0]) / 2 + 0.3, mid[1] - 0.3, (mid[2] + end[2]) / 2 + 0.3],
          [end[0] + 0.4, end[1] + 0.5, end[2] + 0.4],
        ],
        0.022,
        10,
      ),
    );
  }
  // Roots creeping down the walls to the floor.
  for (let i = 0; i < 5; i++) {
    const back = i % 2 === 1;
    const along = -3.6 + random() * 5.5;
    const pts: V3[] = [];
    for (let k = 0; k <= 4; k++) {
      const y = 3.8 - k * 0.95;
      const wobble = Math.sin(k * 1.7 + i) * 0.25;
      pts.push(back ? [along + wobble, y, -3.92] : [-3.92, y, along + wobble]);
    }
    addTo(bag, "Bark", tube(pts, 0.035 + random() * 0.02, 16));
  }
  return bag;
}

/** A stone cable channel in the floor, from a doorway toward the room's middle. */
function channel(bag: Record<string, BufferGeometry[]>, slot: DoorSlot, length: number, width = 0.34) {
  const g = doorGeometry(slot);
  const back = slot.wall !== "left";
  // The back wall is at z −4, the near edge (0111) at +4: the channel runs inward from either.
  const wallZ = slot.wall === "front" ? 4 : -4;
  const centre: V3 = back
    ? [g.doorway[0], 0.03, wallZ - Math.sign(wallZ) * (length / 2)]
    : [-4 + length / 2, 0.03, g.doorway[2]];
  const size: V3 = back ? [width, 0.02, length] : [length, 0.02, width];
  addTo(bag, "Black", box(size, centre));
  for (const side of [-1, 1]) {
    const edge: V3 = back
      ? [centre[0] + (side * width) / 2, 0.05, centre[2]]
      : [centre[0], 0.05, centre[2] + (side * width) / 2];
    addTo(bag, "Stone", box(back ? [0.08, 0.06, length] : [length, 0.06, 0.08], edge));
  }
  // Copper inlay down its middle (dark until the room is restored).
  addTo(
    bag,
    "Metal",
    box(back ? [0.04, 0.012, length - 0.1] : [length - 0.1, 0.012, 0.04], [centre[0], 0.045, centre[2]]),
  );
}

function RootTunnel({ slots }: { slots: DoorSlot[] }) {
  const bag = useMemo(() => {
    const b = rootCanopy(1101);
    const first = slots[0];
    if (first) channel(b, first, 3.4);
    return b;
  }, [slots]);
  return <Merged bag={bag} region={1} />;
}

// ---------------------------------------------------------------------------------------------------
// 2.B: the great channel, the wall of roots, the guttering candle, the bloom

const bloomLevel = uniform(0);

function Blossoms({ count = 70 }: { count?: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const placed = useMemo(() => {
    const random = seeded(2207);
    const out: { at: V3; size: number; tint: Color }[] = [];
    const tints = ["#E9CFD9", "#F2E6C8", "#DCC8E4", "#F0D9A8"].map((c) => new Color(c));
    // In clumps where moss grows: at the feet of the standing walls, low on their faces, and along
    // the channel's edges. Never floating in the air.
    const clumps: V3[] = [
      [-3.6, 0, -3.6],
      [-2.4, 0, -3.75],
      [-3.75, 0, -2.2],
      [-3.75, 0, -0.9],
      [-1.4, 0, 1.75],
      [0.2, 0, 2.3],
      [-3.0, 0, 2.6],
      [2.6, 0, -3.7],
    ];
    for (let i = 0; i < count; i++) {
      const c = clumps[i % clumps.length] as V3;
      const onWall = random() < 0.35;
      const spread = 0.55;
      let at: V3 = [c[0] + (random() - 0.5) * spread * 2, 0.05 + random() * 0.08, c[2] + (random() - 0.5) * spread * 2];
      if (onWall) {
        // Climbing a little way up the nearest wall face.
        const y = 0.1 + random() * 0.9;
        at = c[2] < -3.5 ? [at[0], y, -3.93] : c[0] < -3.5 ? [-3.93, y, at[2]] : at;
      }
      out.push({ at, size: 0.025 + random() * 0.03, tint: tints[i % tints.length] as Color });
    }
    return out;
  }, [count]);
  const material = useMemo(() => new MeshBasicNodeMaterial({ color: "#b8b0a8" }), []);
  const dummy = useMemo(() => new Object3D(), []);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    placed.forEach((p, i) => {
      m.setColorAt(i, p.tint);
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [placed]);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const level = bloomLevel.value;
    placed.forEach((p, i) => {
      // Each opens a little after the last: the hall blooms in one breath, not one flower at a time.
      const open = Math.min(Math.max(level * 1.6 - (i / placed.length) * 0.6, 0), 1);
      dummy.position.set(...p.at);
      dummy.scale.setScalar(Math.max(0.0001, p.size * open));
      dummy.rotation.set(i, i * 0.7, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, material, count]} frustumCulled={false}>
      <icosahedronGeometry args={[1, 0]} />
    </instancedMesh>
  );
}

function Candle({ at }: { at: V3 }) {
  const flame = useRef<Mesh>(null);
  const light = useRef<PointLight>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // Guttering: a slow, uneven breathing (about one dip every two seconds), never a fast flicker.
    const gutter = 0.75 + 0.18 * Math.sin(t * 2.1) + 0.07 * Math.sin(t * 3.3 + 1);
    if (flame.current) flame.current.scale.set(1, gutter, 1);
    if (light.current) light.current.intensity = 1.2 * gutter;
  });
  return (
    <group position={at}>
      <mesh position={[0, 0.12, 0]} material={regionMaterial("Candle", 1)}>
        <cylinderGeometry args={[0.045, 0.05, 0.24, 10]} />
      </mesh>
      <mesh ref={flame} position={[0, 0.29, 0]}>
        <coneGeometry args={[0.025, 0.09, 8]} />
        <meshBasicMaterial color={[1.4, 0.85, 0.4]} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, 0.4, 0]} color="#FFB35A" distance={3.5} decay={2} />
    </group>
  );
}

function SilentLine({ slots }: { slots: DoorSlot[] }) {
  const restored = useRestored();
  const roots = useRef<Group>(null);
  const bag = useMemo(() => {
    const b: Record<string, BufferGeometry[]> = {};
    // The great channel: from the sealed arch (the second door) right across the floor.
    const second = slots[1];
    if (second) channel(b, second, 4.9, 0.6);
    return b;
  }, [slots]);
  const wall = useMemo(() => {
    const random = seeded(2203);
    const b: Record<string, BufferGeometry[]> = {};
    // A wall of roots along the far side of the channel, from the floor up the left wall.
    for (let i = 0; i < 14; i++) {
      const z = 0.6 + random() * 3.2;
      const x = -3.9 + random() * 0.9;
      const h = 1.2 + random() * 2.2;
      addTo(
        b,
        "Bark",
        tube(
          [
            [x, 0, z],
            [x + 0.3 * random(), h * 0.5, z + (random() - 0.5) * 0.6],
            [-3.95, h, z + (random() - 0.5) * 0.8],
          ],
          0.04 + random() * 0.05,
          12,
        ),
      );
    }
    return b;
  }, []);
  useFrame(() => {
    const r = restored.current;
    bloomLevel.value = r;
    // On the win the roots draw back into the wall.
    if (roots.current) {
      roots.current.scale.set(1 - r * 0.85, 1 - r * 0.7, 1);
      roots.current.position.x = -4 * r * 0.85;
      roots.current.visible = r < 0.98;
    }
  });
  return (
    <>
      <Merged bag={bag} region={1} />
      <group ref={roots}>
        <Merged bag={wall} region={1} />
      </group>
      <Candle at={[-1.2, 0, 2.2]} />
      <Blossoms />
    </>
  );
}

// ---------------------------------------------------------------------------------------------------
// 3.B: pneumatic tubes with running capsules

function TubeRuns() {
  const capsules = useRef<InstancedMesh>(null);
  const runs = useMemo(
    () => [
      new CatmullRomCurve3(
        [new Vector3(3.9, 3.05, -3.7), new Vector3(-3.7, 3.05, -3.7), new Vector3(-3.7, 3.05, 3.9)],
        false,
        "catmullrom",
        0.05,
      ),
      new CatmullRomCurve3(
        [new Vector3(3.9, 2.82, -3.62), new Vector3(-3.62, 2.82, -3.62), new Vector3(-3.62, 2.82, 3.9)],
        false,
        "catmullrom",
        0.05,
      ),
    ],
    [],
  );
  const bag = useMemo(() => {
    const b: Record<string, BufferGeometry[]> = {};
    for (const curve of runs) {
      const g = new TubeGeometry(curve, 48, 0.07, 8, false);
      g.deleteAttribute("uv");
      addTo(b, "Glass", g.toNonIndexed());
      for (let t = 0.04; t < 1; t += 0.09)
        addTo(
          b,
          "Brass",
          ring(curve.getPoint(t).toArray() as V3, 0.08, 0.018, Math.abs(curve.getTangent(t).x) > 0.5 ? "x" : "z", 12),
        );
    }
    return b;
  }, [runs]);
  const dummy = useMemo(() => new Object3D(), []);
  const COUNT = 8;
  useFrame(({ clock }) => {
    const m = capsules.current;
    if (!m) return;
    // Several machines calling at once: capsules hurry through the tubes (slowly in ruin, never frozen).
    const speed = 0.05 + (1 - ruin.value) * 0.05;
    for (let i = 0; i < COUNT; i++) {
      const curve = runs[i % 2] as CatmullRomCurve3;
      const t = (clock.elapsedTime * speed + i / COUNT + (i % 2) * 0.37) % 1;
      dummy.position.copy(curve.getPoint(t));
      const tangent = curve.getTangent(t);
      dummy.lookAt(dummy.position.clone().add(tangent));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  const { glass, rest } = useMemo(() => {
    const { Glass: g, ...others } = bag;
    return { glass: g?.length ? mergeGeometries(g) : null, rest: others };
  }, [bag]);
  return (
    <>
      <Merged bag={rest} region={2} />
      {glass && (
        <mesh geometry={glass}>
          <meshStandardMaterial color="#c9d2d4" transparent opacity={0.28} roughness={0.15} depthWrite={false} />
        </mesh>
      )}
      <instancedMesh ref={capsules} args={[undefined, regionMaterial("Brass", 2), COUNT]} frustumCulled={false}>
        <capsuleGeometry args={[0.045, 0.12, 4, 8]} />
      </instancedMesh>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------
// 4.B: warning lamps while the loop rages

const STORM_AT = 7; // frames on this hall's cables at once that make a storm

function WarningLamps({ device }: { device: string }) {
  const lamps: V3[] = [
    [-3.75, 3.0, -2.0],
    [-2.0, 3.0, -3.75],
    [2.0, 3.0, -3.75],
    [-3.75, 3.0, 2.0],
  ];
  const level = useRef(0);
  const glow = useMemo(() => uniform(0), []);
  const glass = useMemo(() => {
    const m = new MeshBasicNodeMaterial({ toneMapped: false });
    m.colorNode = color("#F5A04A").mul(glow.mul(1.4).add(0.08));
    return m;
  }, [glow]);
  const lights = useRef<(PointLight | null)[]>([]);
  const rotors = useRef<(Group | null)[]>([]);
  useFrame(({ clock }, delta) => {
    const { onCables, status } = useSession.getState();
    const near = onCables.filter((c) => c.from === device || c.to === device).length;
    const storm = near >= STORM_AT && !status?.won ? 1 : 0;
    level.current += (storm - level.current) * (1 - Math.exp(-delta * 1.2));
    // A slow turning beacon: about one sweep every 2.5 s, rising and falling smoothly.
    const sweep = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 2.5);
    glow.value = level.current * (0.35 + 0.65 * sweep);
    lights.current.forEach((l) => {
      if (l) l.intensity = glow.value * 2.2;
    });
    rotors.current.forEach((r) => {
      if (r) r.rotation.y += delta * 2.5 * level.current;
    });
  });
  return (
    <>
      {lamps.map((at, i) => (
        <group key={at.join(",")} position={at}>
          <mesh material={regionMaterial("Brass", 2)} position={[0, -0.14, 0]}>
            <cylinderGeometry args={[0.1, 0.12, 0.06, 12]} />
          </mesh>
          <mesh material={glass}>
            <sphereGeometry args={[0.1, 12, 8]} />
          </mesh>
          <group
            ref={(g) => {
              rotors.current[i] = g;
            }}
          >
            <mesh material={regionMaterial("DarkMetal", 2)} position={[0.08, 0, 0]}>
              <boxGeometry args={[0.02, 0.2, 0.14]} />
            </mesh>
          </group>
          <pointLight
            ref={(l) => {
              lights.current[i] = l;
            }}
            color="#F5A04A"
            distance={4.5}
            decay={2}
            intensity={0}
          />
        </group>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------
// 8.B: the great doors barred

function Bars({ slots, doors }: { slots: DoorSlot[]; doors: number }) {
  const restored = useRestored();
  const beams = useRef<Group>(null);
  const bag = useMemo(() => {
    const b: Record<string, BufferGeometry[]> = {};
    for (const slot of slots.slice(0, doors)) {
      const g = doorGeometry(slot);
      const back = slot.wall !== "left";
      const at: V3 = back ? [g.doorway[0], 1.35, slot.wall === "front" ? 3.82 : -3.82] : [-3.82, 1.35, g.doorway[2]];
      // A heavy iron bar with brass straps, resting in iron brackets either side of the door.
      addTo(b, "Iron", box(back ? [2.4, 0.24, 0.16] : [0.16, 0.24, 2.4], at));
      for (const k of [-0.7, 0, 0.7]) {
        const strap: V3 = back ? [at[0] + k, at[1], at[2] + 0.01] : [at[0] + 0.01, at[1], at[2] + k];
        addTo(b, "Brass", box(back ? [0.06, 0.26, 0.17] : [0.17, 0.26, 0.06], strap));
      }
      for (const side of [-1, 1]) {
        const bracket: V3 = back ? [at[0] + side * 1.05, 1.35, -3.86] : [-3.86, 1.35, at[2] + side * 1.05];
        addTo(b, "Iron", box([0.16, 0.36, 0.16], bracket));
      }
    }
    return b;
  }, [slots, doors]);
  useFrame(() => {
    // On the win the beams lift away up the walls.
    if (beams.current) {
      beams.current.position.y = restored.current * 3.2;
      beams.current.visible = restored.current < 0.97;
    }
  });
  return (
    <group ref={beams}>
      <Merged bag={bag} region={4} />
    </group>
  );
}

// ---------------------------------------------------------------------------------------------------
// 9.B: the dome and the climbing beam

const EYE: V3 = [-1.2, 6.1, -1.2];

function Dome() {
  const restored = useRestored();
  const beam = useRef<Mesh>(null);
  const bag = useMemo(() => {
    const b: Record<string, BufferGeometry[]> = {};
    // Ribs from the wall tops up to the dome's eye (only the far half: the cutaway keeps the near side open).
    const feet: V3[] = [
      [3.6, 4.2, -3.9],
      [1.0, 4.2, -3.9],
      [-1.8, 4.2, -3.9],
      [-3.9, 4.2, -3.9],
      [-3.9, 4.2, -1.8],
      [-3.9, 4.2, 1.0],
      [-3.9, 4.2, 3.6],
    ];
    for (const foot of feet) {
      const mid: V3 = [
        (foot[0] + EYE[0]) / 2 + (foot[0] - EYE[0]) * 0.15,
        5.6,
        (foot[2] + EYE[2]) / 2 + (foot[2] - EYE[2]) * 0.15,
      ];
      addTo(b, "Highlights", tube([foot, mid, EYE], 0.09, 20));
    }
    addTo(b, "Brass", ring(EYE, 0.55, 0.06, "y", 24));
    addTo(b, "Brass", rod([EYE[0], EYE[1] - 0.05, EYE[2]], [EYE[0], EYE[1] + 0.12, EYE[2]], 0.5, 20));
    return b;
  }, []);
  const material = useMemo(() => {
    const m = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    // Brightest low, softening as it climbs; positionLocal.y runs −0.5 (floor) → 0.5 (the eye).
    m.colorNode = color("#F2CF8A").mul(
      float(1)
        .sub(smoothstep(-0.5, 0.5, positionLocal.y))
        .mul(0.5)
        .add(0.12),
    );
    return m;
  }, []);
  useFrame(() => {
    const b = beam.current;
    if (!b) return;
    // On the win a beam of light climbs from the floor to the dome's eye.
    const climb = Math.min(Math.max((restored.current - 0.1) / 0.8, 0), 1);
    const height = Math.max(0.01, EYE[1] * climb);
    b.scale.set(1, height, 1);
    b.position.set(EYE[0], height / 2, EYE[2]);
    b.visible = climb > 0.01;
  });
  return (
    <>
      <Merged bag={bag} region={4} />
      <mesh ref={beam} material={material}>
        <cylinderGeometry args={[0.35, 0.5, 1, 20, 1, true]} />
      </mesh>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------
// The secret Home Router: "a small box with blinking lights"

function HomeBox({ device, slots }: { device: string; slots: DoorSlot[] }) {
  const roomId = useSession((s) => s.roomId);
  const ports = useMemo(() => {
    const room = roomId ? roomById(roomId) : undefined;
    const spec = room?.topology.devices.find((d) => d.id === device);
    return (spec?.interfaces ?? [])
      .filter((i) => i.name !== "lo")
      .map((i) => ({
        iface: i.name,
        link: room?.topology.links.find(
          (l) => (l.a.device === device && l.a.iface === i.name) || (l.b.device === device && l.b.iface === i.name),
        )?.id,
      }));
  }, [roomId, device]);
  // Linked doors first, in order, as MachineScene places them; spare ports after.
  const ordered = useMemo(() => [...ports.filter((p) => p.link), ...ports.filter((p) => !p.link)], [ports]);
  const leds = useRef<(Mesh | null)[]>([]);
  const bag = useMemo(() => {
    const b: Record<string, BufferGeometry[]> = {};
    // The box's casing: a dark band round the top of the walls with a row of vent slots.
    addTo(b, "Lead", box([8.1, 0.5, 0.12], [0.05, 3.55, -3.88]));
    addTo(b, "Lead", box([0.12, 0.5, 8.0], [-3.88, 3.55, 0.05]));
    for (let x = -3.5; x < 3.8; x += 0.35) addTo(b, "Void", box([0.18, 0.05, 0.02], [x, 3.62, -3.81]));
    return b;
  }, []);
  useFrame(({ clock }) => {
    const { onCables, status } = useSession.getState();
    ordered.forEach((p, i) => {
      const led = leds.current[i];
      if (!led) return;
      const up = !!status?.doors[`${device}:${p.iface}`]?.up && !!p.link;
      const busy = !!p.link && onCables.some((c) => c.link === p.link);
      // Steady when the link is up, a gentle blink while something crosses it (about once a second,
      // smooth, never a strobe), dark for a spare port.
      const blink = busy ? 0.55 + 0.45 * Math.sin(clock.elapsedTime * 6) : 1;
      led.scale.setScalar(up ? 1 : 0.6);
      (led.material as MeshBasicNodeMaterial).opacity = up ? 0.35 + 0.65 * blink : 0.12;
    });
  });
  const ledMaterials = useMemo(
    () =>
      ordered.map(() => {
        const m = new MeshBasicNodeMaterial({ transparent: true, toneMapped: false });
        m.colorNode = color("#5EE0E8").mul(1.3);
        return m;
      }),
    [ordered],
  );
  return (
    <>
      <Merged bag={bag} region={4} />
      {ordered.map((p, i) => {
        const slot = slots[i];
        if (!slot) return null;
        const g = doorGeometry(slot);
        const at: V3 =
          slot.wall === "left"
            ? [-3.8, 3.2, g.doorway[2] + 0.7]
            : [g.doorway[0] - 0.7, 3.2, slot.wall === "front" ? 3.8 : -3.8];
        return (
          <mesh
            key={p.iface}
            ref={(m) => {
              leds.current[i] = m;
            }}
            position={at}
            material={ledMaterials[i]}
          >
            <sphereGeometry args={[0.07, 12, 8]} />
          </mesh>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------

export function BossPiece({ device, region, slots, doors, hall }: Props) {
  const roomId = useSession((s) => s.roomId);
  switch (roomId) {
    case "f1.boss-dark-corridor":
      return <RootTunnel slots={slots} />;
    case "f2.boss-silent-line":
      return device === "observatory" ? <SilentLine slots={slots} /> : null;
    case "f3.boss-busy-hall":
      return hall && region === 2 ? <TubeRuns /> : null;
    case "f4.boss-storm":
    case "f4.secret-peacekeeper":
    case "f4.spare-cable":
      return hall && region === 2 ? <WarningLamps device={device} /> : null;
    case "f8.boss-closed-crossing":
      return device === "crossing" ? <Bars slots={slots} doors={doors} /> : null;
    case "f9.secret-home-router":
      return device === "home" ? <HomeBox device={device} slots={slots} /> : null;
    case "f9.boss-crossing":
      return device === "crossing" ? <Dome /> : null;
    default:
      return null;
  }
}
