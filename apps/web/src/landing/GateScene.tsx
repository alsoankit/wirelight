import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, Suspense, useEffect, useMemo, useRef } from "react";
import { FogExp2, type Mesh, type PerspectiveCamera, Vector3 } from "three";
import { CinematicPost } from "../render/CinematicPost";
import { useQuality } from "../render/quality";
import { Fireflies } from "../world/Fireflies";
import { makeFlagstones } from "../world/kit/floor";
import { type Extra, StaticRoom } from "../world/kit/StaticRoom";
import { WindDriver } from "../world/WindDriver";
import { approachPose, DESCENT_SECONDS, fadeOut } from "./approach";
import { Bird } from "./Bird";
import { Doors } from "./Doors";
import { makeGround } from "./ground";
import {
  BEYOND,
  CAMERA,
  GATE_OPENING,
  LANDING,
  LIGHT_DIRECTION,
  MOON_DIRECTION,
  PATH_START,
  pathBeyond,
  TO_CAMERA,
} from "./layout";
import { Mist } from "./Mist";
import { FarGround, Palace } from "./Palace";
import { RuneLine } from "./RuneLine";
import { HORIZON, Sky } from "./Sky";

// The landing's 3D scene (ONB-01, 0088): calm, hauntingly beautiful. The outer gate of the Palace of
// a Thousand Doors at the edge of a night forest, its doors shut, the palace rising on its hill
// behind. Moonlight is baked into the static gate, trees and ground once at load (0053); the sky,
// mist, rune-line, bird, fireflies, wind and the palace's windows move. On the way in (the approach,
// ONB-05) the doors open and the camera walks through them toward the palace.

const PATH_HALF_WIDTH = 1.05;

// How much of a point is on the path (1 on it, 0 off it), for wearing the ground bare: straight up
// to the gate, then on through it toward the palace until the trees.
function onPath(x: number, z: number): number {
  if (z > PATH_START.z + 1 || z < BEYOND.z) return 0;
  const centre = z >= 0 ? 0 : pathBeyond(z);
  return Math.max(0, 1 - Math.max(0, Math.abs(x - centre) - PATH_HALF_WIDTH * 0.7) / 0.8);
}

const EXTRAS: Extra[] = [
  {
    name: "Earth",
    geometry: makeGround(44, 56, onPath),
  },
  {
    name: "Floor",
    // The old path: the same laid flagstones as the rooms, kept only along the path, many gone, and
    // fewer still beyond the gate.
    geometry: makeFlagstones({
      size: 24,
      seed: 4471,
      missing: 0.22,
      cracked: 0.3,
      keep: (x, z) => onPath(x, z) > 0.95 && z < PATH_START.z && z > -9,
    }),
  },
];

// The rune-line: up the path, under the doors, on toward the palace.
const RUNES = [PATH_START, GATE_OPENING, BEYOND];

const FIREFLIES = { min: [-7, 0.4, -3] as [number, number, number], max: [7, 2.8, 6] as [number, number, number] };

/** The approach, once it has started: how fast it plays, and what to call when it's done. */
export type Descent = { quick: boolean; faster: () => boolean; onDone: () => void };

function LandingCamera({ descent, progress }: { descent: Descent | null; progress: RefObject<number> }) {
  const camera = useThree((s) => s.camera as PerspectiveCamera);
  const wanted = useMemo(() => new Vector3(), []);
  const target = useMemo(() => new Vector3(), []);
  const done = useRef(false);
  useEffect(() => {
    camera.fov = CAMERA.fov;
    camera.near = 0.1;
    camera.far = 200;
    camera.position.copy(CAMERA.position);
    camera.lookAt(CAMERA.target);
    camera.updateProjectionMatrix();
  }, [camera]);
  // A slow breathing drift (about 20 s), plus a gentle one with the pointer (as in the rooms).
  useFrame(({ pointer, clock }, delta) => {
    if (descent) {
      // The approach owns the camera: along its path, at its pace (faster after a click or key).
      const seconds = descent.quick ? DESCENT_SECONDS.quick : DESCENT_SECONDS.full;
      progress.current += (Math.min(delta, 0.05) / seconds) * (descent.faster() ? DESCENT_SECONDS.faster : 1);
      approachPose(progress.current, camera.position, target);
      camera.lookAt(target);
      if (progress.current >= 1 && !done.current) {
        done.current = true;
        descent.onDone();
      }
      return;
    }
    const t = clock.elapsedTime;
    wanted
      .copy(CAMERA.position)
      .add({ x: pointer.x * 0.35 + Math.sin(t * 0.31) * 0.18, y: pointer.y * 0.15 + Math.sin(t * 0.23) * 0.06, z: 0 });
    camera.position.lerp(wanted, 1 - Math.exp(-delta * 2));
    camera.lookAt(CAMERA.target);
  });
  return null;
}

// The end of the approach: the view fades to the dark the game opens from (styles.css, .arrival-veil),
// so the room brightening out of it reads as arriving. A sheet just in front of the camera, drawn last.
function Fade({ progress }: { progress: RefObject<number> }) {
  const sheet = useRef<Mesh>(null);
  const camera = useThree((s) => s.camera);
  const ahead = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const m = sheet.current;
    if (!m) return;
    const dark = fadeOut(progress.current);
    m.visible = dark > 0;
    if (!m.visible) return;
    (m.material as { opacity: number }).opacity = dark;
    camera.getWorldDirection(ahead);
    m.position.copy(camera.position).addScaledVector(ahead, 0.2);
    m.quaternion.copy(camera.quaternion);
  });
  return (
    <mesh ref={sheet} visible={false} renderOrder={1000}>
      <planeGeometry args={[4, 4]} />
      <meshBasicMaterial
        color="#06070a"
        transparent
        depthTest={false}
        depthWrite={false}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  );
}

// Night light: a cool fill, moonlight from behind catching the tops and edges of things (rim), and
// fog the colour of the horizon haze, so distance fades everything into the sky (depth in layers).
function NightLight() {
  const scene = useThree((s) => s.scene);
  const fog = useRef(new FogExp2(HORIZON, 0.03));
  useEffect(() => {
    scene.fog = fog.current;
    return () => {
      scene.fog = null;
    };
  }, [scene]);
  return (
    <>
      <ambientLight color="#3a4868" intensity={1.0} />
      <hemisphereLight color="#7d95cc" groundColor="#1c2028" intensity={1.8} />
      <directionalLight
        position={MOON_DIRECTION.clone().multiplyScalar(30).toArray()}
        color="#a9c1ff"
        intensity={2.2}
      />
    </>
  );
}

export function GateScene({ descent }: { descent: Descent | null }) {
  const quality = useQuality();
  // How far along the approach is (0 before it starts, 1 arrived): the camera, the doors and the fade follow it.
  const progress = useRef(0);
  return (
    <>
      <LandingCamera descent={descent} progress={progress} />
      <color attach="background" args={[HORIZON]} />
      <NightLight />
      <Sky moon={MOON_DIRECTION} />
      <Palace />
      <FarGround />
      <Suspense fallback={null}>
        <StaticRoom
          placements={LANDING}
          extras={EXTRAS}
          toCamera={TO_CAMERA}
          toMoon={LIGHT_DIRECTION}
          shadowsWithin={11}
        />
        <Doors progress={progress} />
      </Suspense>
      <RuneLine points={RUNES} />
      <Mist />
      <Bird />
      <WindDriver />
      {quality.fireflies && <Fireflies bounds={FIREFLIES} />}
      {quality.bloom && <CinematicPost />}
      <Fade progress={progress} />
    </>
  );
}
