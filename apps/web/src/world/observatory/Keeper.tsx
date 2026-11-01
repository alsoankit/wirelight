import { useFrame } from "@react-three/fiber";
import { type RefObject, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  type Group,
  LatheGeometry,
  type Matrix4,
  type Object3D,
  Quaternion,
  Vector2,
  Vector3,
} from "three";
import { color, float, frontFacing, mix, mx_noise_float, positionLocal, smoothstep, uniform, vec3 } from "three/tsl";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from "three/webgpu";
import { noise3 } from "../kit/bake";
import { carvedMaterial } from "../kit/carved";
import { regionMaterial } from "../kit/regionMaterials";
import type { RegionId } from "../region";
import { useModel } from "../room/Statue";
import { KEEPER_TURN } from "../room/standing";
import { ruinHere } from "../ruin";
import type { KeeperCue } from "./Messages";

// The keeper (world/lore.md, CORE-24, 0051, 0052, proposed 0054): a mysterious figure, not a robot
// and not a doll. One loose robe of dark, weathered cloth that rises over its head into a hood; the
// face is an opening into darkness with one faint eye. Its lantern hangs before it from where its
// sleeves meet, so from behind it is softly lit from the front. It turns slowly toward each message,
// bows a little as one arrives, and sends a beam of lantern-light from its eye to the door it chose.
// Built in code; its front is +z here, and it is turned to face the doorway.

type Props = {
  position: [number, number, number];
  region?: RegionId;
  /** Its desk holds messages it won't pass on (0042): it sleeps, head bowed, eye nearly out. */
  asleep?: boolean;
  rest: [number, number, number]; // where it looks when nothing is moving (the doorway)
  watch: RefObject<Object3D | null>;
  cue: RefObject<KeeperCue>; // when to bow (a message arrived) and when to point (an answer left)
};

const BOW_SECONDS = 1.0;
const BEAM_SECONDS = 1.1;
const EYE: [number, number, number] = [0, 1.69, 0.12]; // in the face opening
const LANTERN_RING: [number, number, number] = [0, 1.0, 0.36];

// One keeper per room: one beam level and one eye level.
const beamLevel = uniform(0);
const eyeLevel = uniform(1);

// Dark, weathered cloth on the ruin dial, with a faint weave of light and shade; its lower part stirs
// in the wind.
// Its inside (seen through the face opening) is near-black, so the face is only darkness: one
// double-sided mesh instead of a second lining mesh.
// In the Cathedral the keeper is the navigator (region-4 brief): a pale stone-and-brass robe, never a
// black cloak (a dark hooded figure there read as a reaper: "never horror").
const CLOTH: Record<RegionId, { ruined: string; restored: string }> = {
  1: { ruined: "#474c58", restored: "#5a4b3f" },
  2: { ruined: "#4a4c50", restored: "#5b4a3c" },
  3: { ruined: "#474c58", restored: "#5a4b3f" },
  4: { ruined: "#8a8a8c", restored: "#cdbb98" },
};

function clothMaterial(region: RegionId) {
  const m = new MeshStandardNodeMaterial({ roughness: 1, side: DoubleSide });
  const base = mix(color(CLOTH[region].restored), color(CLOTH[region].ruined), ruinHere);
  const weave = base.mul(
    mx_noise_float(positionLocal.mul(vec3(9, 2.5, 9)))
      .mul(0.08)
      .add(0.96),
  );
  m.colorNode = mix(color("#050506"), weave, float(frontFacing));
  return m;
}

// The robe and its hood, one surface: a lathe turned into a figure. Broad shoulders, loose folds to
// a ragged hem; above the shoulders the cloth rises over the head and leans back to a soft peak.
const ROBE: [number, number][] = [
  [0.41, 0.0],
  [0.37, 0.12],
  [0.32, 0.45],
  [0.285, 0.85],
  [0.275, 1.05],
  [0.29, 1.24],
  [0.305, 1.35],
  [0.26, 1.45],
  [0.185, 1.52],
  [0.2, 1.6],
  [0.205, 1.7],
  [0.185, 1.79],
  [0.13, 1.87],
  [0.06, 1.94],
  [0.0, 1.97],
];

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

// The face: the part of the hood that is open, at the front.
function inFace(angle: number, y: number): boolean {
  return Math.abs(angle) < 0.62 && y > 1.56 && y < 1.83;
}

function buildRobe(): BufferGeometry {
  const lathe = new LatheGeometry(
    ROBE.map(([r, y]) => new Vector2(r, y)),
    48,
  );
  const p = lathe.getAttribute("position");
  const angles = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const a = Math.atan2(x, z); // 0 = front
    angles[i] = a;
    const r = Math.hypot(x, z);
    const loose = 1 - smooth(0.95, 1.4, y);
    const fold = (Math.sin(a * 7 + y * 1.4) * 0.045 + Math.sin(a * 3 + 1.3) * 0.025) * loose;
    // Broad shoulders, narrowing again at the neck and hood.
    const sx = 1.0 + 0.26 * smooth(0.95, 1.42, y) * (1 - smooth(1.44, 1.56, y));
    const sz = 0.84 + 0.14 * smooth(1.5, 1.62, y);
    if (y < 0.001) y = 0.02 + Math.max(0, noise3(Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2)) * 0.09;
    const nx = Math.sin(a) * r * (1 + fold) * sx;
    z = Math.cos(a) * r * (1 + fold) * sz;
    // The hood leans back toward a soft peak, and its brim comes forward a little over the face.
    z += -smooth(1.78, 1.97, y) * 0.16 + smooth(1.58, 1.72, y) * (1 - smooth(1.74, 1.86, y)) * 0.03;
    p.setXYZ(i, nx, y, z);
  }
  lathe.computeVertexNormals();
  // Cut the face open: drop the triangles whose middle falls in it.
  const index = lathe.getIndex();
  const kept: number[] = [];
  if (index) {
    for (let t = 0; t < index.count; t += 3) {
      const ids = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      const y = ids.reduce((s, id) => s + p.getY(id), 0) / 3;
      const cx = ids.reduce((s, id) => s + p.getX(id), 0) / 3;
      const cz = ids.reduce((s, id) => s + p.getZ(id), 0) / 3;
      if (!inFace(Math.atan2(cx, cz), y)) kept.push(ids[0] as number, ids[1] as number, ids[2] as number);
    }
  }
  const robe = new BufferGeometry();
  robe.setAttribute("position", p);
  robe.setAttribute("normal", lathe.getAttribute("normal"));
  robe.setIndex(kept);
  return robe;
}

// A sleeve: an open, widening cylinder from the shoulder to its loose end (the hands stay hidden).
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
      <cylinderGeometry args={[0.13, 0.085, length, 16, 1, true]} />
    </mesh>
  );
}

// The lantern, hanging by its ring. Its flame is soft: a warm glow, not a bright ball.
function Lantern() {
  const bars = 6;
  return (
    <group position={[0, -0.6 * 0.75, 0]} scale={0.75}>
      <mesh position={[0, 0.03, 0]} material={regionMaterial("AgedBrass")}>
        <cylinderGeometry args={[0.18, 0.16, 0.06, 24]} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.32, 24, 1, true]} />
        <meshStandardMaterial
          color="#d9cfb8"
          emissive="#ffcf8a"
          emissiveIntensity={0.35}
          transparent
          opacity={0.32}
          roughness={0.6}
          depthWrite={false}
        />
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
        <sphereGeometry args={[0.035, 12, 8]} />
        <meshBasicMaterial color={[0.95, 0.7, 0.4]} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 0.2, 0]} color="#FFD9A0" intensity={1.0} distance={2.6} decay={2} />
      <mesh position={[0, 0.46, 0]} material={regionMaterial("AgedBrass")}>
        <coneGeometry args={[0.2, 0.16, 24]} />
      </mesh>
      <mesh position={[0, 0.6, 0]} material={regionMaterial("AgedBrass")}>
        <torusGeometry args={[0.06, 0.014, 8, 20]} />
      </mesh>
    </group>
  );
}

// The beam of its decision (CORE-24): a thin thread of warm lantern-light from its eye toward the door
// it chose, brightest at the eye, fading along its length and away over about a second. Never cyan,
// never a torch's cone (playtest: it read as a flashlight sweeping the room).
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
    m.colorNode = color("#FFD9A0").mul(along.mul(beamLevel).mul(0.16));
    return m;
  }, []);
  return (
    <mesh material={material}>
      <cylinderGeometry args={[0.01, 0.045, 1, 12, 1, true]} />
    </mesh>
  );
}

/** The mourner's height in the game (the model stands 1.7 m): a little taller than a person. */
const MOURNER_SCALE = 1.1;

type Fit = { eye: [number, number, number]; lantern: [number, number, number] };

/**
 * Where the model's face and hands are: the front-most point at face height (the eye glows just
 * inside it) and at hand height (the lantern hangs just before it). Found in the mesh, not guessed.
 */
const UP = new Vector3(0, 1, 0);

function fitOf(geometry: BufferGeometry, matrix: Matrix4, scale: number): Fit {
  // The positions are quantised: read them through the attribute and the node's transform.
  const attribute = geometry.getAttribute("position");
  const v = new Vector3();
  const points: [number, number][] = [];
  for (let i = 0; i < attribute.count; i++) {
    v.fromBufferAttribute(attribute, i).applyMatrix4(matrix).applyAxisAngle(UP, KEEPER_TURN);
    points.push([v.y, v.z]);
  }
  let top = 0;
  for (const [y] of points) top = Math.max(top, y);
  const frontAt = (lo: number, hi: number) => {
    let z = -1;
    for (const [y, pz] of points) if (y > top * lo && y < top * hi) z = Math.max(z, pz);
    return z;
  };
  return {
    eye: [0, top * 0.875 * scale, (frontAt(0.84, 0.9) - 0.04) * scale],
    lantern: [0, top * 0.6 * scale, (frontAt(0.55, 0.65) + 0.12) * scale],
  };
}

/** The keeper's body: the hooded mourner (decision 0092), in its region's cloth. */
function Mourner({ region, onFit }: { region: RegionId; onFit: (fit: Fit) => void }) {
  const { geometry, source, matrix } = useModel("keeper-mourner");
  const material = useMemo(
    () => carvedMaterial(source, { tint: CLOTH[region], detail: 0.25, roughness: 1 }),
    [source, region],
  );
  useEffect(() => onFit(fitOf(geometry, matrix, MOURNER_SCALE)), [geometry, matrix, onFit]);
  return (
    <group scale={MOURNER_SCALE} rotation={[0, KEEPER_TURN, 0]}>
      <mesh geometry={geometry} material={material} matrix={matrix} matrixAutoUpdate={false} castShadow />
    </group>
  );
}

export function Keeper({ position, rest, watch, cue, region = 1, asleep = false }: Props) {
  // Until the mourner has loaded, the code-made robe stands in; then the eye and lantern move to it.
  const [fit, setFit] = useState<Fit>({ eye: EYE, lantern: LANTERN_RING });
  const eyeAtFit = useRef(fit.eye);
  eyeAtFit.current = fit.eye;
  const robe = useMemo(buildRobe, []);
  const cloth = useMemo(() => clothMaterial(region), [region]);
  const eye = useMemo(() => {
    const m = new MeshBasicNodeMaterial({ toneMapped: false });
    // Faint: an ember in the dark of the hood, not a lamp.
    m.colorNode = color("#FFD9A6").mul(float(0.9).mul(eyeLevel));
    return m;
  }, []);
  const figure = useRef<Group>(null);
  const lantern = useRef<Group>(null);
  const beamRef = useRef<Group>(null);

  const restPoint = useMemo(() => new Vector3(...rest), [rest]);
  const look = useMemo(() => new Vector3(), []);
  const aim = useMemo(() => new Vector3(...rest), [rest]);
  const eyeAt = useMemo(() => new Vector3(), []);
  const door = useMemo(() => new Vector3(...rest), [rest]);
  const DOWN = useMemo(() => new Vector3(0, -1, 0), []);
  const at = useMemo(() => new Vector3(...position), [position]);

  useFrame(({ clock }, delta) => {
    const now = clock.elapsedTime;
    const c = cue.current;
    const f = figure.current;
    const l = lantern.current;
    const root = beamRef.current?.parent;
    if (!f || !l || !root) return;

    // It faces its door, and turns slowly toward the message it watches (a little, never all the way round).
    const target = watch.current;
    if (target?.visible) target.getWorldPosition(look);
    else look.copy(restPoint);
    aim.lerp(look, 1 - Math.exp(-delta * 2));
    // Its front (+z, turned half round) faces −z in the room; yaw from there.
    const doorYaw = Math.atan2(restPoint.x - at.x, -(restPoint.z - at.z));
    const off = Math.atan2(aim.x - at.x, -(aim.z - at.z)) - doorYaw;
    const turned = Math.atan2(Math.sin(off), Math.cos(off));
    f.rotation.y = Math.PI - (doorYaw + Math.max(-0.45, Math.min(0.45, turned)));

    // A faint breath; it bows a little as a message arrives, the eye brightening.
    const sinceArrival = now - c.arrived;
    const bowing = sinceArrival >= 0 && sinceArrival < BOW_SECONDS;
    const bow = bowing ? Math.sin((Math.PI * sinceArrival) / BOW_SECONDS) : 0;
    f.rotation.x = bow * 0.07 + (asleep ? 0.16 : 0);
    f.position.y = Math.sin(now * (asleep ? 0.4 : 0.7)) * (asleep ? 0.012 : 0.005);
    eyeLevel.value = asleep ? 0.12 : 1 + bow * 0.5;

    // The lantern sways a little on its chain.
    l.rotation.z = Math.sin(now * 0.8) * 0.04;
    l.rotation.x = Math.sin(now * 0.55 + 1) * 0.03 + bow * 0.1;

    // An answer left: the beam from the eye toward the doorway.
    const sinceDeparture = now - c.departed;
    const beam = beamRef.current;
    if (beam) {
      const on = sinceDeparture >= 0 && sinceDeparture < BEAM_SECONDS;
      beam.visible = on;
      if (on) {
        const x = sinceDeparture / BEAM_SECONDS;
        beamLevel.value = Math.min(x / 0.12, 1) * (1 - Math.max(0, (x - 0.12) / 0.88)) ** 1.5;
        f.localToWorld(eyeAt.set(...eyeAtFit.current));
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
      <group ref={figure} rotation={[0, Math.PI, 0]}>
        <Suspense
          fallback={
            <>
              <mesh geometry={robe} material={cloth} />
              {/* loose sleeves meeting in front, the lantern hanging from where they meet */}
              <Sleeve from={new Vector3(-0.3, 1.38, 0)} to={new Vector3(-0.08, 1.12, 0.3)} material={cloth} />
              <Sleeve from={new Vector3(0.3, 1.38, 0)} to={new Vector3(0.08, 1.12, 0.3)} material={cloth} />
            </>
          }
        >
          <Mourner region={region} onFit={setFit} />
        </Suspense>
        <mesh position={fit.eye}>
          <sphereGeometry args={[0.022, 12, 8]} />
          <primitive object={eye} attach="material" />
        </mesh>
        <mesh position={[fit.lantern[0], fit.lantern[1] + 0.07, fit.lantern[2]]} material={regionMaterial("Iron")}>
          <cylinderGeometry args={[0.008, 0.008, 0.12, 6]} />
        </mesh>
        {region === 4 && (
          <>
            {/* The navigator's brass: a band at the hem and a clasp at the collar. */}
            <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]} material={regionMaterial("Brass", 4)}>
              <torusGeometry args={[0.39, 0.018, 6, 40]} />
            </mesh>
            <mesh position={[0, 1.43, 0.2]} material={regionMaterial("Brass", 4)}>
              <sphereGeometry args={[0.045, 12, 8]} />
            </mesh>
          </>
        )}
        <group ref={lantern} position={fit.lantern}>
          <Lantern />
        </group>
      </group>
      <group ref={beamRef} visible={false}>
        <Beam />
      </group>
    </group>
  );
}
