import { useFrame } from "@react-three/fiber";
import { type RefObject, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BackSide,
  type BufferGeometry,
  DoubleSide,
  type Group,
  LatheGeometry,
  type Object3D,
  Quaternion,
  Vector2,
  Vector3,
} from "three";
import { color, float, mix, mx_noise_float, positionLocal, smoothstep, uniform, vec3 } from "three/tsl";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from "three/webgpu";
import { noise3 } from "../kit/bake";
import { regionMaterial } from "../kit/regionMaterials";
import { ruinHere } from "../ruin";
import { BREEZE, gust, windDirection } from "../wind";
import type { KeeperCue } from "./MockTraffic";

// The keeper (world/lore.md, CORE-24, 0051, 0052, proposed 0054): a mysterious figure, not a robot
// and not a doll. A tall shape in a loose hooded robe of dark, weathered cloth; nothing of it shows
// but one eye glowing in the dark of the hood. It leans on a staff from which its lantern hangs.
// It turns its hood to watch each message, bows as one arrives (the eye brightening, the lantern
// lifting a little), and sends a beam of lantern-light from its eye to the door its answer takes.
// Built in code; its front is +z here, and it is turned to face the doorway.

type Props = {
  position: [number, number, number];
  rest: [number, number, number]; // where it looks when nothing is moving (the doorway)
  watch: RefObject<Object3D | null>;
  cue: RefObject<KeeperCue>; // when to bow (a message arrived) and when to point (an answer left)
};

const NOD_SECONDS = 0.9;
const BEAM_SECONDS = 1.1;

// One keeper per room: one beam level and one eye level.
const beamLevel = uniform(0);
const eyeLevel = uniform(1);

// Dark, weathered cloth on the ruin dial, with a faint weave of light and shade; its hem stirs in
// the wind (more toward the bottom).
function clothMaterial(sways: boolean) {
  const m = new MeshStandardNodeMaterial({ roughness: 1, side: DoubleSide });
  const base = mix(color("#5a4b3f"), color("#474c58"), ruinHere);
  m.colorNode = base.mul(
    mx_noise_float(positionLocal.mul(vec3(9, 2.5, 9)))
      .mul(0.08)
      .add(0.96),
  );
  if (sways) {
    const low = float(1).sub(smoothstep(0.0, 0.9, positionLocal.y));
    m.positionNode = positionLocal.add(
      vec3(windDirection.x, 0, windDirection.z).mul(gust.add(BREEZE).mul(0.07).mul(low)),
    );
  }
  return m;
}

// The robe: a lathe turned into a figure. Shoulders wider than deep, loose folds falling from the
// chest to a hem that is ragged and uneven where it meets the floor.
const ROBE: [number, number][] = [
  [0.41, 0.0],
  [0.37, 0.12],
  [0.32, 0.45],
  [0.285, 0.85],
  [0.275, 1.05],
  [0.29, 1.24],
  [0.305, 1.35],
  [0.27, 1.44],
  [0.17, 1.52],
  [0.085, 1.57],
];

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

function buildRobe(): BufferGeometry {
  const g = new LatheGeometry(
    ROBE.map(([r, y]) => new Vector2(r, y)),
    72,
  );
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    let y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(x, z); // 0 = front
    const r = Math.hypot(x, z);
    // Folds: deep and loose below the chest, smoothing out over the shoulders.
    const loose = 1 - smooth(0.95, 1.4, y);
    const fold = (Math.sin(a * 7 + y * 1.4) * 0.045 + Math.sin(a * 3 + 1.3) * 0.025) * loose;
    // Shoulders broader than the body is deep.
    const sx = 1.0 + 0.26 * smooth(0.95, 1.42, y);
    const sz = 0.84;
    // A ragged hem: the bottom edge rises and falls.
    if (y < 0.001) y = 0.02 + Math.max(0, noise3(Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2)) * 0.09;
    p.setXYZ(i, Math.sin(a) * r * (1 + fold) * sx, y, Math.cos(a) * r * (1 + fold) * sz);
  }
  g.computeVertexNormals();
  return g;
}

// A sleeve: an open, widening cylinder from the shoulder to its loose end.
function Sleeve({ from, to, material }: { from: Vector3; to: Vector3; material: MeshStandardNodeMaterial }) {
  const { position, quaternion, length } = useMemo(() => {
    const dir = to.clone().sub(from);
    return {
      position: from.clone().add(to).multiplyScalar(0.5),
      quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), dir.clone().normalize()),
      length: dir.length(),
    };
  }, [from, to]);
  return (
    <mesh position={position} quaternion={quaternion} material={material}>
      <cylinderGeometry args={[0.15, 0.085, length, 16, 1, true]} />
    </mesh>
  );
}

// The hood: deep, falling to a soft point at the back, dark inside, with one eye in the dark.
function Hood({ cloth, eye }: { cloth: MeshStandardNodeMaterial; eye: MeshBasicNodeMaterial }) {
  const opening = 1.15; // radians of the front left open
  return (
    <group>
      <mesh rotation={[0, Math.PI / 2 + opening / 2, 0]} scale={[0.95, 1.2, 1.25]} material={cloth}>
        <sphereGeometry args={[0.22, 32, 20, 0, Math.PI * 2 - opening, 0, Math.PI * 0.72]} />
      </mesh>
      {/* the hood's peak, rising up and back: a cowled silhouette, not a round head */}
      <mesh position={[0, 0.2, -0.1]} rotation={[-0.55, 0, 0]} material={cloth}>
        <coneGeometry args={[0.15, 0.38, 20, 1, true]} />
      </mesh>
      {/* the cowl, flowing from the hood down over the shoulders */}
      <mesh position={[0, -0.2, -0.03]} material={cloth}>
        <cylinderGeometry args={[0.22, 0.38, 0.3, 28, 1, true]} />
      </mesh>
      <mesh scale={[0.9, 1.12, 1.15]}>
        <sphereGeometry args={[0.21, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.72]} />
        <meshBasicMaterial color="#050507" side={BackSide} />
      </mesh>
      <mesh position={[0, -0.01, 0.13]} material={eye}>
        <sphereGeometry args={[0.03, 16, 10]} />
      </mesh>
    </group>
  );
}

// The lantern, hanging by its ring from the end of the staff's arm.
function Lantern() {
  const bars = 6;
  return (
    <group position={[0, -0.6 * 0.8, 0]} scale={0.8}>
      <mesh position={[0, 0.03, 0]} material={regionMaterial("AgedBrass")}>
        <cylinderGeometry args={[0.18, 0.16, 0.06, 24]} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.32, 24, 1, true]} />
        <meshStandardMaterial color="#cfd8cf" transparent opacity={0.16} roughness={0.15} depthWrite={false} />
      </mesh>
      {Array.from({ length: bars }, (_, i) => {
        const a = (i / bars) * Math.PI * 2 + Math.PI / bars;
        return (
          <mesh
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed bars
            key={i}
            position={[Math.cos(a) * 0.155, 0.22, Math.sin(a) * 0.155]}
            material={regionMaterial("AgedBrass")}
          >
            <boxGeometry args={[0.025, 0.34, 0.025]} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.2, 0]}>
        <sphereGeometry args={[0.05, 16, 12]} />
        <meshBasicMaterial color={[1.8, 1.3, 0.75]} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 0.2, 0]} color="#FFD9A0" intensity={1.2} distance={2.6} decay={2} />
      <mesh position={[0, 0.46, 0]} material={regionMaterial("AgedBrass")}>
        <coneGeometry args={[0.2, 0.16, 24]} />
      </mesh>
      <mesh position={[0, 0.6, 0]} material={regionMaterial("AgedBrass")}>
        <torusGeometry args={[0.06, 0.014, 8, 20]} />
      </mesh>
    </group>
  );
}

// The beam of its decision (CORE-24): warm lantern-light from its eye toward the door it chose,
// brightest at the eye, fading along its length and away over about a second. Never cyan.
function Beam() {
  const material = useMemo(() => {
    const m = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      side: DoubleSide,
    });
    // positionLocal.y: +0.5 at the eye, −0.5 at the door.
    const along = smoothstep(-0.5, 0.35, positionLocal.y);
    m.colorNode = color("#FFD9A0").mul(along.mul(beamLevel).mul(0.33));
    return m;
  }, []);
  return (
    <mesh material={material}>
      <cylinderGeometry args={[0.03, 0.32, 1, 20, 1, true]} />
    </mesh>
  );
}

// The staff stands out to its right; the lantern hangs from a short arm beside it, at chest height.
const STAFF_FOOT = new Vector3(0.56, 0, 0.26);
const STAFF_TOP = new Vector3(0.55, 1.95, 0.25);
const HOOK = new Vector3(0.62, 1.62, 0.3);

export function Keeper({ position, rest, watch, cue }: Props) {
  const robe = useMemo(buildRobe, []);
  const swaying = useMemo(() => clothMaterial(true), []);
  const cloth = useMemo(() => clothMaterial(false), []);
  const eye = useMemo(() => {
    const m = new MeshBasicNodeMaterial({ toneMapped: false });
    m.colorNode = color("#FFE2B0").mul(float(2.2).mul(eyeLevel));
    return m;
  }, []);
  const body = useRef<Group>(null);
  const hood = useRef<Group>(null);
  const lantern = useRef<Group>(null);
  const beamRef = useRef<Group>(null);

  const staff = useMemo(() => {
    const dir = STAFF_TOP.clone().sub(STAFF_FOOT);
    return {
      position: STAFF_FOOT.clone().add(STAFF_TOP).multiplyScalar(0.5),
      quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize()),
      length: dir.length(),
    };
  }, []);

  const restPoint = useMemo(() => new Vector3(...rest), [rest]);
  const look = useMemo(() => new Vector3(), []);
  const aim = useMemo(() => new Vector3(...rest), [rest]);
  const eyeAt = useMemo(() => new Vector3(), []);
  const door = useMemo(() => new Vector3(...rest), [rest]);
  const DOWN = useMemo(() => new Vector3(0, -1, 0), []);

  useFrame(({ clock }, delta) => {
    const now = clock.elapsedTime;
    const c = cue.current;
    const b = body.current;
    const h = hood.current;
    const l = lantern.current;
    const root = beamRef.current?.parent;
    if (!b || !h || !l || !root) return;

    // Stillness, mostly: the faintest breath and sway.
    b.position.y = Math.sin(now * 0.7) * 0.005;
    b.rotation.z = Math.sin(now * 0.4) * 0.006;

    // The hood turns to watch the message, slowly, never snapping…
    const target = watch.current;
    if (target?.visible) target.getWorldPosition(look);
    else look.copy(restPoint);
    aim.lerp(look, 1 - Math.exp(-delta * 3));
    h.lookAt(aim);
    // …and bows as it reads, the eye brightening.
    const sinceArrival = now - c.arrived;
    const reading = sinceArrival >= 0 && sinceArrival < NOD_SECONDS;
    const bow = reading ? Math.sin((Math.PI * sinceArrival) / NOD_SECONDS) : 0;
    if (reading) h.rotateX(bow * 0.22);
    eyeLevel.value = 1 + bow * 0.6;

    // The lantern sways on its ring, lifts a little as a message arrives, and stirs in a gust.
    l.rotation.z = Math.sin(now * 0.8) * 0.04 + gust.value * 0.1;
    l.rotation.x = Math.sin(now * 0.55 + 1) * 0.03 - bow * 0.12;

    // An answer left: the beam from the eye toward the doorway.
    const sinceDeparture = now - c.departed;
    const beam = beamRef.current;
    if (beam) {
      const on = sinceDeparture >= 0 && sinceDeparture < BEAM_SECONDS;
      beam.visible = on;
      if (on) {
        const x = sinceDeparture / BEAM_SECONDS;
        beamLevel.value = Math.min(x / 0.12, 1) * (1 - Math.max(0, (x - 0.12) / 0.88)) ** 1.5;
        h.localToWorld(eyeAt.set(0, -0.01, 0.15));
        const from = root.worldToLocal(eyeAt.clone());
        const to = root.worldToLocal(door.clone());
        const dir = to.clone().sub(from);
        beam.position.copy(from).add(to).multiplyScalar(0.5);
        beam.quaternion.setFromUnitVectors(DOWN, dir.clone().normalize());
        beam.scale.set(1, dir.length(), 1);
      }
    }
  });

  return (
    <group position={position}>
      {/* turned half round so its front (+z) faces the doorway (−z in the room) */}
      <group rotation={[0, Math.PI, 0]}>
        <group ref={body}>
          <mesh geometry={robe} material={swaying} />
          {/* loose sleeves: one hangs, one reaches to the staff */}
          <Sleeve from={new Vector3(-0.3, 1.38, 0)} to={new Vector3(-0.33, 0.9, 0.05)} material={swaying} />
          <Sleeve from={new Vector3(0.3, 1.38, 0)} to={new Vector3(0.52, 1.25, 0.24)} material={cloth} />
          <group ref={hood} position={[0, 1.66, 0.02]}>
            <Hood cloth={cloth} eye={eye} />
          </group>
        </group>
        {/* the staff, a short arm at its top, and the lantern hanging from the arm */}
        <mesh position={staff.position} quaternion={staff.quaternion} material={regionMaterial("DarkWood")}>
          <cylinderGeometry args={[0.02, 0.026, staff.length, 10]} />
        </mesh>
        <mesh position={[0.585, 1.64, 0.275]} rotation={[0, 0, Math.PI / 2]} material={regionMaterial("DarkWood")}>
          <cylinderGeometry args={[0.016, 0.016, 0.1, 8]} />
        </mesh>
        <group ref={lantern} position={HOOK.toArray()}>
          <Lantern />
        </group>
      </group>
      <group ref={beamRef} visible={false}>
        <Beam />
      </group>
    </group>
  );
}
