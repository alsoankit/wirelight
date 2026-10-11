import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  type AnimationAction,
  DoubleSide,
  type Group,
  LoopOnce,
  Mesh,
  type Object3D,
  Vector3,
} from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { color, positionLocal, smoothstep, uniform } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { regionMaterial } from "../kit/regionMaterials";
import type { KeeperCue } from "./MockTraffic";

// The keeper (world/lore.md, region-1 brief, 0051): an ancient machine, never a robot. A brass-and-stone
// automaton with a lantern head and one glowing eye, moss on its shoulders, standing at its desk facing
// the doorway. Its body is Quaternius's rigged Animated Robot (CC0, CREDITS.md), dressed in aged brass
// with patina, weathered stone and dark iron; its own head is hidden and our lantern rides the head bone.
// The rig gives it a living idle; the lantern's eye turns to follow the message it watches.

const BODY_URL = "/assets/region-1/keeper/keeper-body.glb";
const NECK_HEIGHT = 1.45; // metres: where the lantern sits (the rig's Head bone)

// The rig's materials, renamed to the region's: its yellow shell becomes old brass, its grey joints stone.
const DRESS: Record<string, string> = { Main: "AgedBrass", Grey: "Stone", Black: "Iron" };

type Props = {
  position: [number, number, number];
  rest: [number, number, number]; // where it looks when nothing is moving (the doorway)
  watch: RefObject<Object3D | null>;
  cue: RefObject<KeeperCue>; // when to nod (a message arrived) and when to point (an answer left)
};

const NOD_SECONDS = 0.7;
const BEAM_SECONDS = 1.1;

// The rig's head is a group of meshes called "Head", "Head_1"… (not to be confused with the Head bone).
function isHeadMesh(o: Object3D): boolean {
  return !(o as { isBone?: boolean }).isBone && /^Head(_\d+)?$/.test(o.name);
}

function dress(body: Object3D) {
  body.traverse((child) => {
    if (isHeadMesh(child)) child.visible = false; // the lantern replaces it
    if (!(child instanceof Mesh)) return;
    const name = Array.isArray(child.material) ? child.material[0]?.name : child.material.name;
    const swatch = name ? DRESS[name] : undefined;
    if (swatch) child.material = regionMaterial(swatch);
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function findBone(root: Object3D, name: string): Object3D | undefined {
  let found: Object3D | undefined;
  root.traverse((o) => {
    if (!found && (o as { isBone?: boolean }).isBone && o.name === name) found = o;
  });
  return found;
}

// The lantern head. Its +z side carries the eye; lookAt turns that side toward the target.
function LanternHead() {
  const bars = 6;
  return (
    <>
      <mesh position={[0, 0.03, 0]} material={regionMaterial("AgedBrass")} castShadow>
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
      {/* the flame inside, kept soft so it never glares */}
      <mesh position={[0, 0.2, 0]}>
        <sphereGeometry args={[0.05, 16, 12]} />
        <meshBasicMaterial color={[1.8, 1.3, 0.75]} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 0.2, 0]} color="#FFD9A0" intensity={1.1} distance={2.2} decay={2} />
      <mesh position={[0, 0.46, 0]} material={regionMaterial("AgedBrass")} castShadow>
        <coneGeometry args={[0.2, 0.16, 24]} />
      </mesh>
      <mesh position={[0, 0.58, 0]} material={regionMaterial("AgedBrass")}>
        <torusGeometry args={[0.06, 0.014, 8, 20]} />
      </mesh>
      {/* the one eye: a lens in a brass bezel on the front pane */}
      <group position={[0, 0.24, 0.16]}>
        <mesh material={regionMaterial("AgedBrass")}>
          <torusGeometry args={[0.062, 0.016, 8, 24]} />
        </mesh>
        <mesh>
          <circleGeometry args={[0.05, 24]} />
          <meshBasicMaterial color={[2.0, 1.6, 1.05]} toneMapped={false} />
        </mesh>
      </group>
    </>
  );
}

// Its desk: an old stone block with brass corners and an open ledger, where frames wait (CORE-24).
function Desk() {
  return (
    <group position={[0, 0, -0.75]}>
      <mesh position={[0, 0.5, 0]} material={regionMaterial("Stone")} castShadow receiveShadow>
        <boxGeometry args={[1.4, 1.0, 0.6]} />
      </mesh>
      <mesh position={[0, 1.02, 0]} material={regionMaterial("DarkWood")} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.05, 0.68]} />
      </mesh>
      {[-0.72, 0.72].map((x) => (
        <mesh key={x} position={[x, 0.5, 0.31]} material={regionMaterial("AgedBrass")}>
          <boxGeometry args={[0.06, 1.0, 0.04]} />
        </mesh>
      ))}
      {/* the open ledger: two pages on a leather spine */}
      <group position={[0, 1.06, 0.02]} rotation={[0, 0.1, 0]}>
        <mesh material={regionMaterial("Pot_Detail")} castShadow>
          <boxGeometry args={[0.62, 0.025, 0.42]} />
        </mesh>
        {[-0.15, 0.15].map((x) => (
          <mesh
            key={x}
            position={[x, 0.02, 0]}
            rotation={[0, 0, x > 0 ? -0.06 : 0.06]}
            material={regionMaterial("Candle")}
          >
            <boxGeometry args={[0.28, 0.012, 0.38]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// Moss tufts that sit on a bone (the shoulders), following it as the body breathes.
// (three.js drops the dots from glTF node names: "Shoulder.L" is loaded as "ShoulderL".)
const MOSS_ON = ["ShoulderL", "ShoulderR"];

// The keeper's decision (CORE-24): a soft beam of lantern light from its eye toward the door it chose,
// brightest at the eye, fading along its length and away over about a second. Warm, never cyan.
// One keeper per room, so one beam level.
const beamLevel = uniform(0);

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

export function Keeper({ position, rest, watch, cue }: Props) {
  const { scene, animations } = useGLTF(BODY_URL);
  const rig = useRef<Group>(null);
  const lantern = useRef<Group>(null);
  const moss = useRef<(Mesh | null)[]>([]);

  const { body, scale, headBone, mossBones } = useMemo(() => {
    const c = clone(scene);
    dress(c);
    c.updateMatrixWorld(true);
    const head = findBone(c, "Head");
    const neckY = head ? head.getWorldPosition(new Vector3()).y : 0;
    return {
      body: c,
      scale: neckY > 0 ? NECK_HEIGHT / neckY : 1,
      headBone: head,
      mossBones: MOSS_ON.map((n) => findBone(c, n)),
    };
  }, [scene]);

  const { actions, mixer } = useAnimations(animations, rig);
  useEffect(() => {
    const idle = actions.Idle;
    const yes = actions.Yes;
    idle?.reset().fadeIn(0.4).play();
    yes?.setLoop(LoopOnce, 1);
    // When a gesture finishes, ease back into the idle.
    const back = (e: { action: AnimationAction }) => {
      if (e.action === yes && idle) yes.crossFadeTo(idle.reset().play(), 0.35, false);
    };
    mixer.addEventListener("finished", back);
    return () => {
      mixer.removeEventListener("finished", back);
      idle?.fadeOut(0.3);
    };
  }, [actions, mixer]);

  const beamRef = useRef<Group>(null);
  const seen = useRef<KeeperCue>({ arrived: -1, departed: -1 });
  const eye = useMemo(() => new Vector3(), []);
  const door = useMemo(() => new Vector3(...rest), [rest]);
  const DOWN = useMemo(() => new Vector3(0, -1, 0), []);

  const restPoint = useMemo(() => new Vector3(...rest), [rest]);
  const look = useMemo(() => new Vector3(), []);
  const aim = useMemo(() => new Vector3(...rest), [rest]);
  const at = useMemo(() => new Vector3(), []);

  // Runs after the animation mixer (registered later), so the lantern follows this frame's pose.
  useFrame(({ clock }, delta) => {
    const now = clock.elapsedTime;
    const c = cue.current;
    // A message reached the desk: the rig's own "yes" gesture, once.
    if (c.arrived !== seen.current.arrived) {
      seen.current.arrived = c.arrived;
      const idle = actions.Idle;
      const yes = actions.Yes;
      if (idle && yes) idle.crossFadeTo(yes.reset().play(), 0.25, false);
    }
    const root = rig.current?.parent;
    const head = lantern.current;
    if (!root || !head || !headBone) return;
    headBone.getWorldPosition(at);
    head.position.copy(root.worldToLocal(at.clone()));
    mossBones.forEach((bone, i) => {
      const m = moss.current[i];
      if (bone && m) {
        bone.getWorldPosition(at);
        m.position.copy(root.worldToLocal(at.clone())).add({ x: 0, y: 0.1, z: 0 });
      }
    });
    const target = watch.current;
    if (target?.visible) target.getWorldPosition(look);
    else look.copy(restPoint);
    aim.lerp(look, 1 - Math.exp(-delta * 5)); // the eye turns smoothly, never snaps
    head.lookAt(aim);
    // …and the lantern dips in a nod as it reads the message.
    const sinceArrival = now - c.arrived;
    if (sinceArrival >= 0 && sinceArrival < NOD_SECONDS)
      head.rotateX(Math.sin((Math.PI * sinceArrival) / NOD_SECONDS) * 0.3);

    // An answer left: the beam toward the doorway, rising fast and fading over about a second.
    const sinceDeparture = now - c.departed;
    const beam = beamRef.current;
    if (beam) {
      const on = sinceDeparture >= 0 && sinceDeparture < BEAM_SECONDS;
      beam.visible = on;
      if (on) {
        const x = sinceDeparture / BEAM_SECONDS;
        beamLevel.value = Math.min(x / 0.12, 1) * (1 - Math.max(0, (x - 0.12) / 0.88)) ** 1.5;
        head.localToWorld(eye.set(0, 0.19, 0.16));
        const from = root.worldToLocal(eye.clone());
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
      <Desk />
      {/* the rig faces +z; turned half round so the keeper faces the desk and the doorway (−z) */}
      <group ref={rig} rotation={[0, Math.PI, 0]} scale={scale}>
        <primitive object={body} />
      </group>
      <group ref={lantern}>
        <group position={[0, -0.05, 0]}>
          <LanternHead />
        </group>
      </group>
      <group ref={beamRef} visible={false}>
        <Beam />
      </group>
      {MOSS_ON.map((name, i) => (
        <mesh
          key={name}
          ref={(m) => {
            moss.current[i] = m;
          }}
          material={regionMaterial("Leaf_Texture")}
          castShadow
        >
          <icosahedronGeometry args={[0.11, 0]} />
        </mesh>
      ))}
    </group>
  );
}

useGLTF.preload(BODY_URL);
